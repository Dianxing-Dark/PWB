# Moving-platform pilot calibration

The moving-platform family implements the proposal's single mechanic, combined mechanics, and complete short-level tiers. A03 measures boarding and support. C03 adds a timed gate and a full route. P04 adds cargo delivery and fall/retry. All runs use the same browser runner and report schema as P01.

| Task | Registered checks passed | Scripted journeys passed |
| --- | ---: | ---: |
| A03 | 6/6 | None scheduled |
| C03 | 11/11 | 1/1 |
| P04 | 14/14 | 2/2 |

The P04 reference moved 4.0 m horizontally and 2.2 m vertically in both measured cycles. Rider and cargo drift stayed below the 0.07 m criterion. The journey loaded the crate, carried it with the player, passed the gate during the open window, and delivered the crate. The recovery journey repeated this route after a fall and a native R input. See the [boarding](cargo-boarded.png), [transit](in-motion.png), [upper dock](upper-dock.png), and [delivery](delivery.png) frames.

## Proposal evaluation profiles

The comparison uses the same P04 reference and four registered fault runs for all profiles. Each profile is a projection of the recorded checks. A fault is detected when at least one included check observes a failure.

| Injected fault | A Contract | B Replay and visual | C Full |
| --- | --- | --- | --- |
| Lift leaves cargo behind | Cargo support fails | Both journeys fail | Support and both journeys fail |
| Lift carries a player standing beside it | Stationary support fails | No observed failure | Stationary support fails |
| Gate stays open after its window | Closing boundary fails | Gate feedback fails | Boundary and feedback fail |
| Player arrival counts as delivery | Empty delivery fails | No observed failure | Empty delivery fails |

Profiles A, B, and C detected 4/4, 2/4, and 4/4 fault variants. Profile C added observed failures for two variants. It linked the cargo support failure to both journey failures and exposed a visible consequence of the gate timing failure. The P04 reference case times were 57.1 s for A, 24.2 s for B and 78.4 s for C. These are sums from a shared execution and exclude startup outside individual cases. Standalone execution time remains to be measured. The [profile results](profiles.json) include the complete check and coverage counts.

## Reproduction

    npm ci
    npm run calibrate:platform
    node scripts/compare-profiles.mjs <run-report-paths>

Browser version 157.0.8103.52. The P04 reference and all four fault variants produced the same case verdicts on two runs. The visual checks use reference-specific rendered markers. See the [second implementation](../moving-platform-002/) and [first agent run](../../baselines/p04/codex-001/) for the subsequent calibration. Agreement across visual reviewers remains to be measured.

The phase variations and per-step movement checks draw on the public GameLogicBench [platform ride task](https://github.com/NJU-LINK/GameLogicBench-Tasks/tree/18c54e69cf962fd402e245811d4925d129f4b33c/atom_platform_ride) and [jump and platform phase task](https://github.com/NJU-LINK/GameLogicBench-Tasks/tree/18c54e69cf962fd402e245811d4925d129f4b33c/combo_jump_x_platform_phase).
