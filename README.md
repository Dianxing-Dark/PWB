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

## Run the paired 2D and 3D controls

    npm run play:p01 -- P02
    npm run evaluate:p01 -- --task=A02 --calibrate
    npm run evaluate:p01 -- --task=C02
    npm run evaluate:p01 -- --task=P02 --calibrate

A01/A02 cover crate contact and release. C01/C02 add the simultaneous hold and gate. P01/P02 also require a failure, reset, and successful retry. Use the same evaluate command with the corresponding 3D task ID. All 2D positions remain in the XZ plane. The geometry-specific counterexamples test a crate above the plate in 3D and a close miss in 2D. Common timing, crossing, recovery, and visual checks are shared.

    node scripts/compare-pairs.mjs <A01> <A02> <C01> <C02> <P01> <P02>

Pass the six reference report paths in the shown order. The comparison uses the preregistered common checks and reports the geometry-specific checks separately.

See the [paired reference calibration](experiments/pressure-plate-pairs-001/) and the [P02 Codex run](baselines/p02/codex-001/).

## Run the moving-platform family

    npm run play:platform -- P04
    npm run evaluate:platform
    npm run calibrate:platform
    npm run play:platform -- P04 curve
    node scripts/evaluate-platform.mjs --task=P04 --layout=curve --calibrate

A03 evaluates boarding and support across two cycles. C03 adds a gate that opens at phase step 285 and closes at 405. P04 adds cargo transport, delivery and a fall/retry journey. Select one task with `node scripts/evaluate-platform.mjs --task=C03`. The calibration command runs the four registered P04 single faults. The curved shuttle adds a control with moving scenery and an unboardable platform. Both layouts use the same behavior checks with reviewed replay parameters.

The platform and P01 share a browser runner, evidence format, and grading code. The platform cases retain position and phase traces, maximum relative rider and cargo drift, actual keyboard input and screenshots tied to boarding, transit and arrival.

## Run the 3D keys and inventory family

    npm run play:keys -- P05
    npm run evaluate:keys
    npm run calibrate:keys

A06 tests single-use keys, empty inventory, and locks aligned across floors. C05 adds pickup, a matching upper lock, and a complete route. P05 adds a lower route. Each route in P05 starts in a fresh browser page, passes its own lock, and reaches the same physical exit. Select a task with `npm run evaluate:keys -- --task=A06`.

The calibration runs the reference, the registered single faults, and a decorative-key control. It tests pickup and unlock with native input, compares inventory changes to the corresponding world events, and saves screenshots for key removal, inventory feedback, and the open passage. See the [keys calibration](experiments/keys-001/).

## Run the 3D checkpoint family

    npm run play:checkpoints -- C12
    node scripts/evaluate-checkpoints.mjs
    node scripts/evaluate-checkpoints.mjs --layout=gallery
    node scripts/evaluate-checkpoints.mjs --task=C12 --starter
    node scripts/evaluate-checkpoints.mjs --calibrate

A10 tests height-specific checkpoint registration and falling. C07 adds floor-specific traps and verifies that the latest checkpoint supersedes the earlier one in the same attempt. C12 requires the retry to preserve lower power while resetting the upper relay. Its direct and recovery journeys start from fresh pages. The [first checkpoint calibration](experiments/checkpoints-001/) records the single faults. The [second calibration](experiments/checkpoints-002/) adds the gallery layout and a bootable starter that fails the native movement probe.

## Run the 3D pickup and occlusion tasks

    npm run play:pickup -- C09
    node scripts/evaluate-spatial-pickup.mjs --calibrate

A05 validates same-floor reach and single pickup. C09 adds a solid partition, line-of-sight blocking, a viable detour, and an exit that requires the sample. The evaluator checks inventory, actual movement and visible disappearance separately. See the [spatial pickup calibration](experiments/spatial-pickup-001/).

## Run the 3D static terrain tasks

    node scripts/play-static-traversal.mjs A04
    node scripts/evaluate-static-traversal.mjs --calibrate

A04 records continuous ascent and a side fall from the slope. A09 checks a legal step down and the reverse walk beneath the ledge. See the [terrain calibration](experiments/static-traversal-001/).

To run every implemented reference layout and preserve the evaluation logs, use `node scripts/run-reference-suite.mjs <new-output-directory>`. Set `CHROME_PATH` to a specific Chromium-based browser executable for a paired environment comparison.

## Run the 3D line-of-fire family

    npm run play:line-of-fire -- P06
    npm run evaluate:line-of-fire
    npm run calibrate:line-of-fire

A08 compares lower cover, the exposed position directly above it, and an exposed side path. C08 checks low and elevated shots and requires the player to walk to the exit after disabling the target. P06 requires the player to observe a blocked pulse, disarm the emitter, rescue the worker, and reach the exit. Its second journey starts with a hit and retries from the restored starting position. Each fault is checked against every case in its task, including those expected to pass. See the [cross-browser calibration](experiments/line-of-fire-001/).

## Compare evaluation profiles

    node scripts/compare-profiles.mjs runs/<run>/P04/report.json

Profile A includes launch and contract checks. Profile B includes launch, full journeys and visual checks. Profile C includes all of them. The comparison projects the same reports onto each profile so the submission and execution evidence stay paired. It also reports positive, negative and boundary checks, scripted completion, visual checks, and launch and recovery. Case time is summed as an estimate. A standalone wall-clock comparison requires separate executions.

Run `node scripts/benchmark-profile-time.mjs <new-output-directory> C12 C09` for standalone measurements. The runner rotates the order of A, B and C and includes evaluator startup and shutdown. Partial A and B reports label their scope and leave full-task strict success unset.

The [moving-platform calibration](experiments/moving-platform-001/) contains the first paired profile comparison and the recovery journey frames. The [curved-layout calibration](experiments/moving-platform-002/) adds the second implementation and decorative-lift control.

## Codex baseline

On Windows, install and authenticate Codex CLI, then run this from the checkout with a fresh directory outside it.

    python scripts/run-codex-p01.py D:/bench-runs/p01-001 --budget-seconds 600

The command stages the two public contracts and optional local Three.js modules. It probes read and write isolation before starting a fresh Codex session, saves the input digests and JSONL transcript, and enforces a wall-clock limit. Use `--model` to pin the model for a series. Keep the evaluator checkout and baseline logs outside the builder directory.

Use `--task P02` for the planar playthrough. It stages the two public contracts without a rendering library. Select `--task=P02` when evaluating that submission.

Use `--task P05` to generate the two-route keys task. Use `npm run evaluate:keys -- --task=P05 --submission=<directory> --replay=<file>` with an evaluator-reviewed route. The route specifies the local scenario poses, each gate plane, key and exit positions, and the waypoints of both journeys. The evaluator saves visual frames for review when the replay has no reference feedback anchors.

Use `--task P04` to generate a moving-platform submission. Run `node scripts/evaluate-platform.mjs --task=P04 --submission=<directory> --replay=<file>` with the observed docking geometry, travel direction, gate and delivery thresholds, and movement bound in the format used by [the platform replays](scripts/platform-replays.mjs). A replay without reference feedback anchors produces frames for separate review.

Review the generated artifact and record a replay using [the P01 replay fields](scripts/p01-replays.mjs). Then run:

    npm run evaluate:p01 -- --submission=D:/bench-runs/p01-001/builder --replay=D:/bench-runs/p01-001/replay.json

This pilot uses evaluator-authored waypoints for each layout. If the submission has no reviewed visual anchors, the runner saves the frames and records the visual checks as unverified. The fixed RGB and HUD checks on the two references are calibration aids.

## Pilot contracts and evaluation sources

The [pilot manifest](pilot/manifest.json) indexes 22 runnable tasks and 178 implemented checks, including all three matched 2D controls. Give builders the selected contract and the [shared interface](pilot/builder/shared-runtime-interface.json). The [candidate inventory](pilot/candidate-inventory.json) tracks the remaining designs. The [evaluation protocol](pilot/protocol.json) and [run report schema](pilot/evaluator/run-report.schema.json) define the evidence and reporting.

- Fresh browser pages per case and legal local setup follow the published [GameASG L2 runner](https://github.com/areal-project/GameASG-Bench/blob/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2/run.js).
- Closed-loop journey actions and separate local checks follow [CEGame-Bench](https://arxiv.org/html/2610.26098v1). Family scores use scheduled checks and expose the remaining uncertainty.
- Ordered state transitions, simulated-time assertions and single-fault calibration draw on [WorldCoder-Bench](https://arxiv.org/html/2606.01869) and the [GameLogicBench navigation judge](https://github.com/NJU-LINK/GameLogicBench-Tasks/blob/18c54e69cf962fd402e245811d4925d129f4b33c/atom_move_navigation_3d/judge/judge.gd).
- Event-linked frames and criterion-specific visual evidence draw on the [GameCraft verifier](https://github.com/FreedomIntelligence/gamecraft-bench/blob/d64cc5d817bd331a840a378e6e42c873b1139055/gamecraft_bench/verifier/score.py).

The [first P01 Codex run](baselines/p01/codex-001/) and the [first P04 Codex run](baselines/p04/codex-001/) include the frozen games, replays, automated reports, and reviewed frames.
