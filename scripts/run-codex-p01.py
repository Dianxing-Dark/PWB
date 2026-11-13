"""Run one Codex CLI playthrough generation in a workspace-only Windows sandbox."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("run_directory", type=Path)
parser.add_argument("--task", choices=("P01", "P02", "P04", "P05"), default="P01")
parser.add_argument("--budget-seconds", type=int, default=600)
parser.add_argument("--model")
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
root = args.run_directory.resolve()
if args.budget_seconds <= 0 or root.is_relative_to(repo):
    parser.error("Choose a positive budget and a new directory outside the checkout.")
root.mkdir(parents=True)
builder = root / "builder"
builder.mkdir()
temp = root / "temp"
temp.mkdir()
contract = f"{args.task}.json"
inputs = [f"pilot/builder/{contract}", "pilot/builder/shared-runtime-interface.json"]
if args.task != "P02":
    inputs.extend(["node_modules/three/build/three.module.js", "node_modules/three/build/three.core.js",
                   "node_modules/three/LICENSE"])
for path in inputs:
    shutil.copy2(repo / path, builder)

dimension = "2D" if args.task == "P02" else "3D"
library_note = "The supplied Three.js modules are optional. " if dimension == "3D" else ""
prompt = f"""Build a playable browser-native {dimension} game for the public requirements in {contract} and shared-runtime-interface.json.
Implement a complete artifact in this directory, with index.html as the entry point and all runtime dependencies local.
{library_note}The artifact will run on a static HTTP server.
Implement the public runtime interface against the same game state that native keyboard input changes.
Read both public specifications. Write the game files directly. Do not consult outside materials.
"""
(root / "prompt.txt").write_text(prompt, encoding="utf-8")
env = dict(os.environ, TMP=str(temp), TEMP=str(temp), TMPDIR=str(temp))
policy = [
    "-c", 'default_permissions="benchmark"',
    "-c", "features.prefer_mxc=true",
    "-c", 'permissions.benchmark.filesystem={":root"="deny",":minimal"="read",'
          '":workspace_roots"={ "."="write" },":tmpdir"="write"}',
    "-c", "permissions.benchmark.network.enabled=false",
]
codex = shutil.which("codex")
if not codex:
    raise SystemExit("Install and authenticate Codex CLI before starting a baseline.")
private_cases = {"P04": "platform-cases.mjs", "P05": "keys-cases.mjs"}.get(args.task, "p01-cases.mjs")
probe = (
    "if (!(Test-Path -LiteralPath " + contract + ")) { exit 8 }; "
    "try { Get-Content -LiteralPath '" + (repo / "scripts" / private_cases).as_posix().replace("'", "''") +
    "' -ErrorAction Stop | Out-Null; exit 3 } catch { }; "
    "Set-Content -LiteralPath sandbox-ok.txt -Value ok; "
    "if (Test-Path -LiteralPath sandbox-ok.txt) { exit 0 }; exit 9"
)
subprocess.run([codex, "sandbox", "-C", str(builder), "-P", "benchmark", *policy,
                "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
                "-NoProfile", "-NonInteractive", "-Command", probe], env=env, timeout=60, check=True)
(builder / "sandbox-ok.txt").unlink()
command = [codex, "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
           "--color", "never", "--json", "-c", 'approval_policy="never"', "-C", str(builder), *policy]
if args.model:
    command.extend(["-m", args.model])
command.append("-")
start = time.monotonic()
timed_out = False
exit_code = None
with (root / "events.jsonl").open("wb") as stdout, (root / "stderr.log").open("wb") as stderr:
    try:
        result = subprocess.run(command, input=prompt.encode("utf-8"), stdout=stdout, stderr=stderr,
                                env=env, cwd=builder, timeout=args.budget_seconds)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
metadata = {
    "taskId": args.task,
    "cliVersion": subprocess.check_output([codex, "--version"], text=True).strip(),
    "modelRequested": args.model,
    "budgetSeconds": args.budget_seconds,
    "elapsedSeconds": round(time.monotonic() - start, 2),
    "timedOut": timed_out,
    "exitCode": exit_code,
    "entryExists": (builder / "index.html").is_file(),
    "inputDigests": {Path(path).name: hashlib.sha256((repo / path).read_bytes()).hexdigest() for path in inputs},
}
(root / "generation.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metadata))
raise SystemExit(0 if exit_code == 0 and metadata["entryExists"] else 1)
