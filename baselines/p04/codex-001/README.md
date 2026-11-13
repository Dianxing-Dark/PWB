# P04 Codex CLI baseline

Highline Freight was generated on 2026-11-13 by a fresh Codex CLI session from the P04 contract and shared runtime interface. The workspace contained the two contracts and optional local Three.js modules. Generation completed in 474.82 seconds on a 600-second budget with four recorded reconnects. The resolved default model identifier is unavailable.

| Measurement | Result |
| --- | --- |
| Launch and runtime probe | 2/2 |
| Local functional checks | 8/8 |
| Complete deliveries | 2/2 |
| Strict task success | Confirmed |
| Visual feedback | 2/2 in one frame review |

The evaluator measured the frozen game's layout, motion bound and support surface IDs and saved them in [replay.json](replay.json). The lift moves 7 m horizontally and rises 3.4 m. Browser inputs completed both normal delivery and a delivery after falling and pressing R. The [automatic report](evidence/report.json) records the visual items as unverified. The [frame review](visual-review.json) traces the separate verdicts to the captured images.

## Reproduction

Run `npm ci` from the repository root. Stage the exact scored files in a fresh directory in PowerShell.

    $staged = 'D:/bench-runs/p04-codex-001-replay'
    New-Item -ItemType Directory -Path $staged
    Copy-Item baselines/p04/codex-001/game/* $staged
    Copy-Item pilot/builder/P04.json,pilot/builder/shared-runtime-interface.json $staged
    Copy-Item node_modules/three/build/three.module.js,node_modules/three/build/three.core.js,node_modules/three/LICENSE $staged
    node scripts/evaluate-platform.mjs --task=P04 "--submission=$staged" --replay=baselines/p04/codex-001/replay.json

The [generation record](generation.json) gives input and output hashes and token usage. This is one generation with an evaluator-reviewed replay and a single frame reviewer. Pinned-model repeats and reviewer agreement remain to be measured.
