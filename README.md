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

The first command runs the same 12 checks on both reference layouts. The second checks five registered faults on both, including failure to reject an exit trigger on the wrong floor. Use `-- --layout=offset` to select the second layout. Add `--fault=closed_collider_after_animation` to run only that fault.

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

The platform and P01 share a browser runner, evidence format, and grading code. The platform uses a controlled browser clock with native keyboard input. P01 accepts an explicit `--clock=virtual` for the same timing mode. The platform cases retain position and phase traces, maximum relative rider and cargo drift, actual keyboard input and screenshots tied to boarding, transit and arrival.

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

## Run the workshop tasks

    npm run play:workshop -- C10
    npm run evaluate:workshop
    npm run calibrate:workshop

A07 verifies a 120-tick gate and its collision plane. C06 combines two-floor collection, ingredient consumption and delivery. C10 checks that retracting a 3D bridge removes its support and that the player can reach the upper exit by the lower detour. See the [Chrome and Edge calibration](experiments/workshop-001/).

## Evaluate and report a task

The eight family runners use the same five stages. A task's executable contract is split between
`pilot/builder/<task>.json` and the [shared runtime interface](pilot/builder/shared-runtime-interface.json).
The [manifest](pilot/manifest.json) locates the reference layouts, evaluator and per-task plan.
The plan registers local scenarios, replay checks, required journeys and visual criteria.

| Stage | Evidence and output |
| --- | --- |
| 0 Build and Launch | The package inventory and file digests go in `launch/preflight.json`. The browser records entry, runtime interface and resource load errors in the launch trace. Reviewers can specify a visible `startButton` selector in a replay. |
| 1 Functional Checks | Real browser input and state/event observations verify the task plan. The summary lists positive, negative, boundary and recovery checks with their verdict counts. |
| 2 Playthrough | Required journeys start from the normal entry and use the task's whole-journey budget. A dedicated recovery budget applies when specified. Traces record inputs, elapsed replay time, state and the first unmet milestone when known. The replay clock and wall-clock evaluation time describe different quantities. |
| 3 Visual Feedback | The run stores event-aligned frames and visual verdicts. A reviewed submission can use a task-specific visual anchor or an evidence-based manual frame review. |
| 4 Report and Analysis | `report.json` records strict success, the functional interval and coverage, scripted completion, visual feedback and completeness/recovery. Each stage reports planned, passed, failed, product-blocked and unverified items. The verdict counts retain the planned denominator. |

### Derive and calibrate a check

1. Map each observable public requirement to a predicate that a faulty implementation can falsify. Record the legal initial state, the player's action, the expected state or transition, and the evidence that establishes it. Group checks by mechanism so that several observations of the same transition do not outweigh another rule.
2. Pair the legal action with the closest relevant counterexample. For the dual plates, vary the contact floor or release a plate before the hold finishes. For a timed rule, sample both sides of the declared boundary. For a reset rule, check which state must clear and which state must persist.
3. Register geometry and input in an evaluator-reviewed replay. Use a local scenario for isolated rules, and normal entry for required end-to-end journeys. Attach the first unmet milestone to a journey failure. Preserve trusted input, state/event traces, and frames at transitions.
4. Run a reference, a behaviorally equivalent implementation where available, and single-fault controls. For each control, register checks that must fail and comparable checks that must keep passing. Re-run the frozen artifact to check the stability of overlapping verdicts and investigate disagreements at the original input and timing observation.
5. Review visible feedback against the task rubric and immutable frame digests. Record uncertain observations as `unverified`. The strict verdict uses required rules and journeys, with separate reporting for visual items and other diagnostic evidence.

Apply a manual frame review to an immutable raw report and write a new report alongside it.

    node scripts/apply-visual-review.mjs <report.json> <review.json> <reviewed-report.json>

The review format follows the [archived P01 example](baselines/p01/codex-001/visual-review.json).
The command verifies the raw report digest and each cited frame digest. It updates unverified
visual items and recalculates the summary. Evidence and the original automated report remain available.

Aggregate one fixed configuration after listing every planned attempt in an experiment manifest.
Supply either a run report path, relative to the manifest, or a delivery failure reason for each attempt.

    {
      "configuration": "pinned-model / harness / budget",
      "attempts": [
        {"id": "attempt-01", "taskId": "P01", "report": "runs/p01/report.json"},
        {"id": "attempt-02", "taskId": "A07", "failure": "No artifact at the generation deadline"}
      ]
    }

    node scripts/summarize-experiment.mjs <experiment.json>

The batch summary groups results by tier, spatial dimension, mechanism and evaluation stage.
A planned attempt without a delivered work remains in the strict-success denominator.

## Compare evaluation profiles

    node scripts/compare-profiles.mjs runs/<run>/P04/report.json

Profile A includes launch and functional checks. Profile B includes launch, full journeys and visual checks. Profile C includes all stages. The projection reuses evidence from a full run and estimates case time. Partial A and B reports leave full-task strict success unset.

For independently executed profiles, register the frozen package and reviewer-authored replay for each attempt.

    [
      {"id":"attempt-01","taskId":"P01","artifact":"frozen/game","replay":"replay.json","cohort":"pinned-config"}
    ]

    node scripts/run-paired-profiles.mjs <submissions.json> <new-output-directory>
    node scripts/summarize-paired-profiles.mjs <new-output-directory>/index.json

Paths in the submissions manifest are relative to that manifest. Each run uses a fresh evaluator process. The driver rotates the profile order and verifies the artifact digest across all three runs. The summary reports measured wall time, definite failures unique to added stages and differences in overlapping checks. An optional visual review index maps an attempt ID and profile to a reviewed report path.

Run `node scripts/benchmark-profile-time.mjs <new-output-directory> C12 C09` for standalone reference timings. See the [18 reference timing measurements](experiments/profile-timing-004/).

The [pilot validation follow-up](experiments/guide-validation-002/) records independent A/B/C runs on 17 frozen submissions, six fixed-configuration generations, and a matched GameASG replay comparison.

The [moving-platform calibration](experiments/moving-platform-001/) contains the first paired profile comparison and the recovery journey frames. The [curved-layout calibration](experiments/moving-platform-002/) adds the second implementation and decorative-lift control.

## Check artifact packaging

    node scripts/check-artifact.mjs <artifact-directory>

The static preflight checks for a nonempty local entry and regular files, and records file digests. Browser evaluation verifies that the package loads and responds to native input.

## Register an external submission

Every Pilot task uses its family runner with `--task=<id> --submission=<directory> --replay=<file>`.
The package serves its own local dependencies and opens at its normal entry. Reviewers register the geometry, support surface IDs, legal starting poses and route waypoints as applicable. Task contracts, success criteria and replay budgets come from the evaluator. An external visual check without a verified anchor produces frames for review.

| Task IDs | Runner | Replay fields and reference examples |
| --- | --- | --- |
| A01, A02, C01, C02, P01, P02 | `scripts/evaluate-p01.mjs` | [Pressure plates](scripts/p01-replays.mjs), including push axis, contact geometry and departure for A01/A02 |
| A03, C03, P04 | `scripts/evaluate-platform.mjs` | [Moving platform](scripts/platform-replays.mjs) |
| A06, C05, P05 | `scripts/evaluate-keys.mjs` | [Keys and locks](scripts/evaluate-keys.mjs) |
| A10, C07, C12 | `scripts/evaluate-checkpoints.mjs` | [Checkpoints](scripts/checkpoint-replay.mjs) |
| A05, C09 | `scripts/evaluate-spatial-pickup.mjs` | [Pickup and occlusion](scripts/spatial-pickup-cases.mjs) |
| A04, A09 | `scripts/evaluate-static-traversal.mjs` | [Static terrain](scripts/static-traversal-cases.mjs) |
| A08, C08, P06 | `scripts/evaluate-line-of-fire.mjs` | [Cover, shooting and rescue](scripts/line-of-fire-cases.mjs) |
| A07, C06, C10 | `scripts/evaluate-workshop.mjs` | [Timed gate, assembly and bridge](scripts/workshop-cases.mjs) |

## Codex baseline

On Windows, install and authenticate Codex CLI, then run this from the checkout with a fresh directory outside it.

    python scripts/run-codex-p01.py D:/bench-runs/p01-001 --budget-seconds 600

See the [paired Codex pilot](experiments/proposal-baselines-001/) for three task tiers under two fixed reasoning settings. Select any of the 25 tasks with `--task`. The command stages the two public contracts and optional local Three.js modules. It probes read and write isolation before starting a fresh Codex session, saves the input digests and JSONL transcript, and enforces a wall-clock limit. Use `--model` and `--reasoning-effort` to pin a series. Keep the evaluator checkout and baseline logs outside the builder directory.

Use `--task P02` for the planar playthrough. It stages the two public contracts without a rendering library. Select `--task=P02` when evaluating that submission.

Use `--task P05` to generate the two-route keys task. Use `npm run evaluate:keys -- --task=P05 --submission=<directory> --replay=<file>` with an evaluator-reviewed route. The route specifies the local scenario poses, each gate plane, key and exit positions, and the waypoints of both journeys. The evaluator saves visual frames for review when the replay has no reference feedback anchors.

Use `--task P04` to generate a moving-platform submission. Run `node scripts/evaluate-platform.mjs --task=P04 --submission=<directory> --replay=<file>` with the observed docking geometry, travel direction, gate and delivery thresholds, and movement bound in the format used by [the platform replays](scripts/platform-replays.mjs). A replay without reference feedback anchors produces frames for separate review.

Review the generated artifact and record a replay using [the P01 replay fields](scripts/p01-replays.mjs). Then run:

    npm run evaluate:p01 -- --submission=D:/bench-runs/p01-001/builder --replay=D:/bench-runs/p01-001/replay.json

For P01, register `lowerExitWaypoints` from the default entry toward the upper exit's projection on
the lower floor. If the reviewer confirms the lower floor ends before the projection, register that
approach with `lowerExitOutcome: "failure"` and include input through the fall boundary. The required
negative check verifies a locked gate and no victory on the observed approach. Missing or unconfirmed
approach evidence yields `unverified` for that check.
Archived replays and reports retain the checks and evidence from their original evaluator version.

This pilot uses evaluator-authored waypoints for each layout. If the submission has no reviewed visual anchors, the runner saves the frames and records the visual checks as unverified. The fixed RGB and HUD checks on the two references are calibration aids.

## Run an upstream GameASG task

Use a pinned GameASG checkout and the HTML generated from its original public task files.

    python scripts/reproduce-gameasg.py <upstream-directory> capys-flight-adventure <index.html> <new-output-directory> --chrome "<Chrome executable>"

The wrapper supplies a local static server and a fresh Chrome session for the unchanged upstream L1/L2 checkers. It records the artifact and checker digests, browser version, runtime and both original reports. The upstream task reports standalone baseline results.

    node scripts/replay-gameasg-capys.mjs <upstream-run-directory>/artifact <new-replay-directory>

The companion Capys replay checks the same frozen HTML from normal entry using trusted mouse and keyboard input. It records the drag release snapshot, the first three subsequent frames, flight, results and retry. It exercises selected requirements shared with the upstream suite and leaves upstream scores intact.

## Pilot contracts and evaluation sources

The [pilot manifest](pilot/manifest.json) indexes 25 runnable tasks and 202 implemented checks, including all three matched 2D controls. Give builders the selected contract and the [shared interface](pilot/builder/shared-runtime-interface.json). The [candidate inventory](pilot/candidate-inventory.json) tracks the remaining designs. The [evaluation protocol](pilot/protocol.json) and [run report schema](pilot/evaluator/run-report.schema.json) define the evidence and reporting.

- Fresh browser pages per case and legal local setup follow the published [GameASG L2 runner](https://github.com/areal-project/GameASG-Bench/blob/6427cb6517ce11ff350ec45fcae17b67c5aec245/scripts/l2/run.js).
- Closed-loop journey actions and separate local checks follow [CEGame-Bench](https://arxiv.org/html/2610.26098v1). Family scores use scheduled checks and expose the remaining uncertainty.
- Ordered state transitions, simulated-time assertions and single-fault calibration draw on [WorldCoder-Bench](https://arxiv.org/html/2606.01869) and the [GameLogicBench navigation judge](https://github.com/NJU-LINK/GameLogicBench-Tasks/blob/18c54e69cf962fd402e245811d4925d129f4b33c/atom_move_navigation_3d/judge/judge.gd).
- Event-linked frames and criterion-specific visual evidence draw on the [GameCraft verifier](https://github.com/FreedomIntelligence/gamecraft-bench/blob/d64cc5d817bd331a840a378e6e42c873b1139055/gamecraft_bench/verifier/score.py).

The [first P01 Codex run](baselines/p01/codex-001/) and the [first P04 Codex run](baselines/p04/codex-001/) include the frozen games, replays, automated reports, and reviewed frames.
