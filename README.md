# PlayableWorld-Bench

A benchmark for functional playability in coding-agent-generated interactive worlds. The pilot focuses on browser-native 3D tasks and includes matched 2D controls.

## Run P01

Install Node.js 22 or newer and Chrome, Chromium, or Edge. Set CHROME_PATH if the browser is installed outside the usual paths.

    npm ci
    npm run play:p01
    npm run play:p01 -- offset

Open the printed localhost URL. Use WASD to move. Push the crate onto the lower plate, take the ramp to the upper plate, and hold both for two seconds. Walk through the gate to the exit. If you fall, press R.

    npm run evaluate:p01
    npm run calibrate:p01

The first command runs the same 11 checks on both reference layouts. The second also checks the four registered faults on both. Use `-- --layout=offset` to select the second layout. Add `--fault=closed_collider_after_animation` to run only that fault.

Reports and trace files go under `runs/`. Each case records trusted browser input, sampled positions, simulation events, and available screenshots. Both journeys start in a fresh page. Check definitions and grading are shared. A reviewed replay supplies waypoints, a gate plane and movement bounds. The two references use different movement axes, collision implementations, and gate timings. The second reports unlock and passability separately.

## Codex baseline

On Windows, install and authenticate Codex CLI, then run this from the checkout with a fresh directory outside it.

    python scripts/run-codex-p01.py D:/bench-runs/p01-001 --budget-seconds 600

The command stages the two public contracts and optional local Three.js modules. It probes read and write isolation before starting a fresh Codex session, saves the input digests and JSONL transcript, and enforces a wall-clock limit. Use `--model` to pin the model for a series. Keep the evaluator checkout and baseline logs outside the builder directory.

Review the generated artifact and record a replay using [the P01 replay fields](scripts/p01-replays.mjs). Then run:

    npm run evaluate:p01 -- --submission=D:/bench-runs/p01-001/builder --replay=D:/bench-runs/p01-001/replay.json

This pilot uses evaluator-authored waypoints for each layout. If the submission has no reviewed visual anchors, the runner saves the frames and records the visual checks as unverified. The fixed RGB and HUD checks on the two references are calibration aids.

## Pilot contracts and evaluation sources

The [pilot manifest](pilot/manifest.json) indexes 12 task specifications and 104 planned checks. Give builders the selected contract and the [shared interface](pilot/builder/shared-runtime-interface.json). The [candidate inventory](pilot/candidate-inventory.json) tracks the remaining designs. The [evaluation protocol](pilot/protocol.json) and [run report schema](pilot/evaluator/run-report.schema.json) define the evidence and reporting.

- Fresh browser pages per case and legal local setup follow the published [GameASG L2 runner](https://github.com/areal-project/GameASG-Bench/blob/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2/run.js).
- Closed-loop journey actions and separate local checks follow [CEGame-Bench](https://arxiv.org/html/2610.26098v1). Family scores use scheduled checks and expose the remaining uncertainty.
- Ordered state transitions, simulated-time assertions and single-fault calibration draw on [WorldCoder-Bench](https://arxiv.org/html/2606.01869) and the [GameLogicBench navigation judge](https://github.com/NJU-LINK/GameLogicBench-Tasks/blob/18c54e69cf962fd402e245811d4925d129f4b33c/atom_move_navigation_3d/judge/judge.gd).
- Event-linked frames and criterion-specific visual evidence draw on the [GameCraft verifier](https://github.com/FreedomIntelligence/gamecraft-bench/blob/d64cc5d817bd331a840a378e6e42c873b1139055/gamecraft_bench/verifier/score.py).

The [first P01 Codex run](baselines/p01/codex-001/) includes the frozen game, replay, automated report, and manually reviewed frames.
