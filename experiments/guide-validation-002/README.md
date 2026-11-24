# Pilot evaluation validation

The 25 Pilot tasks ran across 32 reference layouts. All 270 scheduled checks and 27 required journeys passed. The 15 newly supported external submission entries were also exercised using standalone packages of the reference implementations. These produced 91 passes and 16 visual items awaiting manual review. [Per-task results](results.json)

## Paired evaluation

Each frozen submission was evaluated independently with profile A for launch and functional checks, B for launch, journeys and visual feedback, and C for the full protocol. The artifact digest was checked across profiles and profile order rotated within paired batches. Visual reviews cite the raw report digest and the evidence frame digests.

| Cohort | Frozen submissions | Launch failures found by each profile | Strict C passes |
| --- | ---: | ---: | ---: |
| Archived generated submissions | 11 | 3 | 8 |
| Fresh fixed-configuration submissions | 6 | 0 | 6 |

The generated sample yielded the same confirmed failures across profiles. On three controlled P01 faults, A detected an incorrect lower-floor victory, B detected missing door feedback and a disabled goal trigger, and C detected all three. The controlled results are projections from full reports.

## Fixed settings

The fresh batch generated A07, C06 and P01 once per setting with Codex CLI, `gpt-6.1-sol` and a 600-second generation budget. Both settings use the same harness. The [registered replays](replays/) record reviewed geometry for those six frozen works.

| Reasoning effort | Delivered and strictly passed | Median generation time | Median output tokens |
| --- | ---: | ---: | ---: |
| Medium | 3/3 | 150.17 s | 5,731 |
| High | 3/3 | 466.72 s | 17,695 |

These costs describe one fresh attempt per task and setting. The earlier timed-out generations are part of the archived cohort. Broader model comparisons and human review costs require more observations.

## GameASG comparison

Two executions of the unchanged GameASG checkers on the same frozen `capys-flight-adventure` HTML returned 5/5 L1 and 12/13 L2 passes. The failed L2 assertion sampled vertical position at mouse release. Its own report recorded later upward displacement. Two companion replays of the identical HTML used native input from normal entry and observed rightward and upward motion in each of the first three frames after release. Both companion replays also reached results and reset via the visible retry control. The discrepancy applies to the launch assertion on this artifact. [Pinned upstream checks](https://github.com/areal-project/GameASG-Bench/tree/6427cb6517ce11ff350ec45fcae17b67c5aec245/tests/capys-flight-adventure)

[Results and hashes](results.json) include per-case paired verdicts, generation telemetry, and the observed launch trajectory. Complete browser traces, frames, and generated packages are retained in the local experiment archive.
