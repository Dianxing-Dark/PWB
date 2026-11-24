"""Run an upstream GameASG task's unmodified L1/L2 checkers against a single HTML."""

import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import urlopen


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_check(command, log, timeout, env=None):
    started = time.monotonic()
    with log.open("wb") as stream:
        result = subprocess.run(
            command, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout, env=env
        )
    return {"exitCode": result.returncode, "wallSeconds": time.monotonic() - started}


def wait_for_browser(browser, profile):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline and browser.poll() is None:
        try:
            port = (profile / "DevToolsActivePort").read_text().splitlines()[0]
            with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1) as response:
                return port, json.load(response)
        except (OSError, IndexError):
            time.sleep(0.2)
    raise RuntimeError("Chrome CDP did not start. See chrome.log.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("upstream", type=Path)
    parser.add_argument("task")
    parser.add_argument("html", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--chrome", type=Path, required=True)
    args = parser.parse_args()
    upstream, output = args.upstream.resolve(), args.output.resolve()
    if Path(args.task).name != args.task or args.task in {".", ".."}:
        parser.error("Specify an upstream task directory name.")
    if args.html.suffix.lower() != ".html":
        parser.error("The submitted artifact must be a single HTML file.")
    checks = upstream / "tests" / args.task
    l1 = upstream / "scripts" / "l1" / "run_l1.py"
    l2 = upstream / "scripts" / "l2" / "run.js"
    l1_checks, l2_checks = checks / "checks.json", checks / "checks.js"
    l2_summary = l2.with_name("result_summary.js")
    node = shutil.which("node")
    if not node:
        parser.error("Node.js 22+ is required.")
    paths = [l1, l2, l1_checks, l2_checks, l2_summary]
    for path in [args.html, args.chrome, *paths]:
        if not path.is_file():
            parser.error(f"Missing file: {path}")

    artifact = output / "artifact" / "index.html"
    output.mkdir(parents=True)
    artifact.parent.mkdir()
    shutil.copyfile(args.html, artifact)
    result = {
        "task": args.task,
        "upstream": str(upstream),
        "artifactSha256": digest(artifact),
        "upstreamSha256": {path.relative_to(upstream).as_posix(): digest(path) for path in paths},
        "runtimeDurationSeconds": 30,
        "node": subprocess.check_output([node, "--version"], text=True).strip(),
    }
    l1_report = output / "l1.json"
    result["L1"] = run_check(
        [sys.executable, l1, artifact, "--checks", l1_checks, "-o", l1_report, "--json"],
        output / "l1.log", 60,
    )

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=artifact.parent)
    with tempfile.TemporaryDirectory(prefix="gameasg-chrome-") as scratch, (
        http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    ) as server, (output / "chrome.log").open("wb") as log:
        profile = Path(scratch) / "profile"
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        browser = subprocess.Popen(
            [args.chrome, "--headless=new", "--no-first-run", "--no-default-browser-check",
             "--disable-features=TranslateUI,CalculateNativeWinOcclusion",
             "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
             "--disable-background-timer-throttling", "--use-gl=angle", "--use-angle=swiftshader",
             "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist",
             "--remote-debugging-port=0", f"--user-data-dir={profile}", "--window-size=1280,800",
             "about:blank"],
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        try:
            port, version = wait_for_browser(browser, profile)
            result["browser"] = version["Browser"]
            l2_report = output / "l2.json"
            result["L2"] = run_check(
                [node, l2, "--url", f"http://127.0.0.1:{server.server_port}/index.html",
                 "--cdp-port", port, "--duration", "30", "--role", "target",
                 "--checks", l2_checks, "-o", l2_report, "--json"],
                output / "l2.log", 180, env={**os.environ, "NODE_OPTIONS": "--dns-result-order=ipv4first"},
            )
        finally:
            browser.terminate()
            browser.wait(timeout=15)
            server.shutdown()
            worker.join()
    for stage, report in (("L1", l1_report), ("L2", l2_report)):
        result[stage]["report"] = report.name if report.is_file() else None
    (output / "index.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if result["L1"]["report"] is None or result["L2"]["report"] is None:
        raise RuntimeError(f"An upstream runner did not emit a report. See {output}.")


if __name__ == "__main__":
    main()
