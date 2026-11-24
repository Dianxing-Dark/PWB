"""Run one pilot generation with Codex CLI in a workspace-only Windows sandbox."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

repo = Path(__file__).resolve().parent.parent
manifest = json.loads((repo / "pilot/manifest.json").read_text(encoding="utf-8"))
tasks = {task["id"]: task for task in manifest["tasks"]}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("run_directory", type=Path)
parser.add_argument("--task", choices=tasks, default="P01")
parser.add_argument("--budget-seconds", type=int, default=600)
parser.add_argument("--model")
parser.add_argument("--reasoning-effort", choices=("low", "medium", "high", "xhigh"))
args = parser.parse_args()
task = tasks[args.task]
root = args.run_directory.resolve()
if args.budget_seconds <= 0 or root.is_relative_to(repo):
    parser.error("Choose a positive budget and a new directory outside the checkout.")
root.mkdir(parents=True)
builder = root / "builder"
builder.mkdir()
temp = root / "temp"
temp.mkdir()
contract = Path(task["builder"]).name
inputs = [f"pilot/{task['builder']}", "pilot/builder/shared-runtime-interface.json"]
dimension = task["dimension"]
if dimension == "3D":
    inputs.extend(["node_modules/three/build/three.module.js", "node_modules/three/build/three.core.js",
                   "node_modules/three/LICENSE"])
for path in inputs:
    shutil.copy2(repo / path, builder)

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
private_plan = repo / "pilot" / task["evaluator"]
probe = (
    "if (!(Test-Path -LiteralPath " + contract + ")) { exit 8 }; "
    "try { Get-Content -LiteralPath '" + private_plan.as_posix().replace("'", "''") +
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
if args.reasoning_effort:
    command.extend(["-c", f'model_reasoning_effort="{args.reasoning_effort}"'])
command.append("-")
start = time.monotonic()
timed_out = False
exit_code = None
events_path = root / "events.jsonl"
with events_path.open("wb") as stdout, (root / "stderr.log").open("wb") as stderr:
    try:
        result = subprocess.run(command, input=prompt.encode("utf-8"), stdout=stdout, stderr=stderr,
                                env=env, cwd=builder, timeout=args.budget_seconds)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
elapsed = round(time.monotonic() - start, 2)
usage = None
with events_path.open(encoding="utf-8") as transcript:
    for line in transcript:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "turn.completed":
            usage = event.get("usage")
metadata = {
    "taskId": args.task,
    "cliVersion": subprocess.check_output([codex, "--version"], text=True).strip(),
    "modelRequested": args.model,
    "reasoningEffortRequested": args.reasoning_effort,
    "budgetSeconds": args.budget_seconds,
    "elapsedSeconds": elapsed,
    "timedOut": timed_out,
    "exitCode": exit_code,
    "entryExists": (builder / "index.html").is_file(),
    "usage": usage,
    "inputDigests": {Path(path).name: hashlib.sha256((repo / path).read_bytes()).hexdigest() for path in inputs},
}
(root / "generation.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metadata))
raise SystemExit(0 if exit_code == 0 and metadata["entryExists"] else 1)
