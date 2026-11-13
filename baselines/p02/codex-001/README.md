# P02 Codex CLI baseline

On 2026-11-13 a fresh Codex CLI session generated Interlock from the public P02 contract and shared runtime interface. The session used the account default model, a 600-second wall-clock budget and no supplied libraries. It completed in 342.50 seconds after four recorded reconnect events. The resolved model identifier is unavailable. This is one generation of the planar playthrough.

| Measurement | Result |
| --- | --- |
| Launch and contract probe | 2/2 |
| Local functional checks | 5/5 |
| Full journeys | 2/2 |
| Strict task success | Confirmed |
| Visual checks | 2/2 in manual frame review |

The evaluator author inspected the frozen game and supplied waypoints. Browser keyboard input drove all player actions. Crossing uses observed position and movement continuity at the gate. Victory requires a separate goal crossing after that passage. Interlock changes its gate artwork and text at unlock. The [automated report](evidence/report.json) retains both visual checks as unverified and the [manual review](visual-review.json) cites the closed, open, failure, reset and victory frames.

## Reproduction

From the repository root in PowerShell, run `npm ci` and stage the exact scored files in a fresh directory.

    $staged = 'D:/bench-runs/p02-codex-001-replay'
    New-Item -ItemType Directory -Path $staged
    Copy-Item baselines/p02/codex-001/game/* $staged
    Copy-Item pilot/builder/P02.json,pilot/builder/shared-runtime-interface.json $staged
    npm run evaluate:p01 -- --task=P02 "--submission=$staged" --replay=baselines/p02/codex-001/replay.json

The [generation record](generation.json) gives the input and output hashes and usage. P01 and P02 each have one Codex run with an unresolved default model and evaluator-authored waypoints. These runs establish feasibility for both contracts. A dimensional performance comparison needs repeated runs with a pinned model and a fixed replay procedure.
