# P01 Codex CLI baseline

On 2026-11-13 a fresh Codex CLI session generated Relay Vault from the public P01 contract. The session used the account default model with a 600-second wall-clock budget and completed in 331.19 seconds. The generation log did not expose the resolved model identifier. The baseline measures one task and one run.

| Measurement | Result |
| --- | --- |
| Launch and contract probe | 2/2 |
| Functional checks | 5/5 |
| Full journeys | 2/2 |
| Strict task success | Confirmed |
| Visual checks | 2/2 in manual review |

The [automated report](evidence/report.json) records the two visual items as unverified. The [frame review](visual-review.json) links the manual judgments to those original screenshots and the report digest. The evaluator author supplied the route after inspecting the frozen artifact. All game movement during scoring used browser keyboard input.

## Replay this artifact

From the repository root, install the locked dependencies with npm ci. The generated files are under game/. To reproduce the scored folder, stage the same public inputs and optional local libraries provided to the generator along with those three unchanged files. For example, from PowerShell:

    $staged = 'D:/bench-runs/codex-001-replay'
    New-Item -ItemType Directory -Path $staged
    Copy-Item baselines/p01/codex-001/game/* $staged
    Copy-Item pilot/builder/P01.json,pilot/builder/shared-runtime-interface.json $staged
    Copy-Item node_modules/three/build/three.module.js,node_modules/three/build/three.core.js,node_modules/three/LICENSE $staged
    npm run evaluate:p01 -- --submission=D:/bench-runs/codex-001-replay --replay=baselines/p01/codex-001/replay.json

The [generation record](generation.json) lists input and output hashes and token usage.
