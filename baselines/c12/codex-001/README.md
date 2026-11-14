# C12 Codex CLI baseline

One fresh Codex CLI session generated Relay / 12 from the public contract and shared runtime interface. It completed in 409.01 seconds on a 600-second budget. The account default model was used and the resolved identifier was unavailable.

| Measure | Result |
| --- | ---: |
| Launch and native input probe | 2/2 |
| Local functional checks | 7/7 |
| Full journeys | 2/2 |
| Visual feedback | 1/1 in one frame review |

The evaluator measured the geometry after generation and supplied the replay coordinates. The browser runs preserved lower power, cleared the transient upper switch on retry, and reached extraction after the switch was activated again. The automated report marks the visual check as unverified. The separate review records the trap overlay and the return to the upper deck.

To replay from PowerShell, run `npm ci` and stage the exact scored files outside the checkout.

    $staged = 'D:/bench-runs/c12-codex-001-replay'
    New-Item -ItemType Directory -Path $staged
    Copy-Item baselines/c12/codex-001/game/* $staged
    Copy-Item pilot/builder/C12.json,pilot/builder/shared-runtime-interface.json $staged
    Copy-Item node_modules/three/build/three.module.js,node_modules/three/build/three.core.js,node_modules/three/LICENSE $staged
    node scripts/evaluate-checkpoints.mjs --task=C12 "--submission=$staged" --replay=baselines/c12/codex-001/replay.json
