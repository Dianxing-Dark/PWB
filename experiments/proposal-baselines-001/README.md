# Paired Codex pilot across three task tiers

The sample contains one task per tier and one generation per setting. Both settings requested `gpt-6.1-sol`, used the same isolated Windows Codex CLI harness and public inputs, and had a 600-second wall-clock limit. The single changed setting was reasoning effort. Chrome 157.0.8103.52 replayed reviewed routes using a controlled browser clock. Manual feedback review used event-aligned screenshots.

| Task | Tier | Medium | High |
| --- | --- | --- | --- |
| A07 timed gate | Atom | 8/8 checks | Launch failed. Missing `game.js`. |
| C06 assembly and delivery | Combination | 8/8 checks, 1/1 journey | Launch failed. Missing `scene.js`. |
| P01 dual pressure plates | Playthrough | 11/11 checks, 2/2 journeys | Launch failed. Missing `main.js`. |

All six CLI invocations reached the time limit. The evaluation used the artifact present at the limit. The high-effort packages contained an HTML entry and passed the static package preflight. Each entry relied on a local JavaScript module that was absent, so the browser launch check failed and blocked the remaining cases. The three medium-effort packages ran and met all registered checks after manual visual review. The [results](results.json) retain automatic verdicts, manual review, first unmet milestones, artifact and evaluator digests, and the requested generation settings.

The paired result is 3/3 strict successes at medium and 0/3 at high for these six timed trials. All runs encountered connection retry overhead. A larger matched sample and repeated generations are needed to estimate difficulty effects or compare settings across the pilot.

The [reference regression](reference-regression.json) accounts for 268 passing checks over all 32 layouts, including controlled-clock rechecks of the pressure-plate and moving-platform layouts after a real-time replay overshot the gate approach.

## Reproduce

Generate each task under both efforts from a fresh directory outside the checkout. This example runs one trial.

    python scripts/run-codex-p01.py D:/bench-runs/A07-medium --task A07 --model gpt-6.1-sol --reasoning-effort medium --budget-seconds 600

Freeze the resulting builder directory and run package and browser evaluation with a reviewed replay. The [replays](replays/) are specific to the frozen artifacts from this experiment.

    node scripts/check-artifact.mjs <frozen-artifact>
    node scripts/evaluate-workshop.mjs --task=A07 --submission=<frozen-artifact> --replay=<replay.json>
    node scripts/evaluate-p01.mjs --task=P01 --clock=virtual --submission=<frozen-artifact> --replay=<replay.json>

For C06 use the workshop evaluator with `--task=C06`. The local archive includes the frozen artifacts, package inventories, native input traces, raw browser reports and screenshots.
