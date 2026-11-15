# Line of fire calibration

The reference suite covers three 3D tasks in Signal Range.

| Task | Reference checks | Scripted journeys | Behavior |
| --- | ---: | ---: | --- |
| A08 | 6/6 | — | A low barrier stops a pulse. The player is exposed at the same horizontal coordinates on the upper deck and on the open lower side path. |
| C08 | 7/7 | 1/1 | A low shot strikes cover. A raised shot disables the target. The player must walk into the exit after the hit. |
| P06 | 10/10 | 2/2 | Observe cover, disable the emitter, rescue the worker, and reach the exit. The recovery journey starts with a hit and retries from the restored start. |

Run both the references and their registered single faults with `npm run calibrate:line-of-fire`. Set `CHROME_PATH` to the browser executable. The runner records keyboard events, simulation ticks, outcomes and screenshots from the relevant steps. Replay advances a controlled browser clock and sends native inputs in fresh pages. The P06 journey checks the order of the blocked pulse, cutoff, rescue and win.

[Calibration verdicts](calibration.json) record identical case statuses on Chrome 157.0.8103.52 and Edge 157.0.4341.46. In each run group, all 23 reference checks passed and all 9 faulty variants failed exactly their registered checks. The evidence archive contains the full reports, screenshots, traces and source inputs used for the evaluation. The matrix records the SHA-256 of each report.

[Profile projections](profiles.json) use the same fault runs.

| Profile | Faults detected |
| --- | ---: |
| A, launch and contract checks | 6/9 |
| B, launch, journeys and feedback | 4/9 |
| C, full suite | 9/9 |

The faulty C08 implementation that shoots through cover still passes the complete journey. The low-shot counterexample detects the shortcut. The P06 version with stale emitter feedback completes both journeys and passes its functional checks. The frame and HUD check detects the stale state. These are paired fault-detection results. Case-time sums exclude browser startup.

Selected frames show a [blocked pulse](frames/a08-cover.png), an [elevated hit](frames/c08-target.png), and the P06 [failure](frames/p06-hit.png) and [victory after retry](frames/p06-retry-win.png).

The three tasks share one reference implementation. Functional feedback checks use reference colors and HUD labels. Independent equivalent implementations, a starter control and generated-game baselines remain open for this family.
