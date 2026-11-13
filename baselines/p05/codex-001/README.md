# P05 Codex CLI baseline

On 2026-11-13 a fresh Codex CLI session generated Lockspan from the public P05 contract and shared runtime interface in 368.38 seconds on a 600-second budget. The builder received local Three.js modules. The account default model was used and the resolved model identifier is unavailable.

| Measurement | Result |
| --- | --- |
| Launch and contract probe | 2/2 |
| Local functional checks | 4/4 |
| Full journeys | 2/2 |
| Strict task success | Confirmed |
| Visual feedback | 2/2 in manual frame review |

The generated game uses a north–south gate axis, a 3 m upper floor and a camera that follows the player. The evaluator author mapped those coordinates and the pickup radius after inspecting the frozen artifact. A preliminary replay incorrectly used the reference pickup radius and flagged the lower route despite a recorded legal pickup. The final evaluator checks observed approach against the reviewed radius and preserves the inventory and event assertions. The submitted game files were unchanged. The [automated report](evidence/report.json) retains the visual verdicts as unverified. The [frame review](visual-review.json) records the separate judgments.

## Reproduction

From the repository root in PowerShell, run `npm ci` and stage the exact scored files in a fresh directory.

    $staged = 'D:/bench-runs/p05-codex-001-replay'
    New-Item -ItemType Directory -Path $staged
    Copy-Item baselines/p05/codex-001/game/* $staged
    Copy-Item pilot/builder/P05.json,pilot/builder/shared-runtime-interface.json $staged
    Copy-Item node_modules/three/build/three.module.js,node_modules/three/build/three.core.js,node_modules/three/LICENSE $staged
    npm run evaluate:keys -- --task=P05 "--submission=$staged" --replay=baselines/p05/codex-001/replay.json

The [generation record](generation.json) gives the staged input and generated output hashes. This is one baseline with evaluator-authored waypoints and one frame review. It establishes that the functional checks can run on another layout and implementation. Repeated pinned-model runs and independent visual judgments are pending.
