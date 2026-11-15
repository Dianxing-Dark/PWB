# Assisted repair of three high effort submissions

The original high-effort runs reached their 600-second limit with a required JavaScript module missing. These playable copies contain the original HTML, CSS and gameplay code plus the repair files listed below. Their results are recorded as an assisted repair. The [original generation results](../../experiments/proposal-baselines-001/) retain their deadline scores.

| Task | Repair | Passed checks | Required journeys |
| --- | --- | ---: | ---: |
| A07 timed gate | Added the browser entry, native input and 3D rendering for the existing simulation | 8/8 | — |
| C06 assembly and delivery | Added the 3D scene called by the existing game entry | 8/8 | 1/1 |
| P01 dual pressure plates | Added the browser entry and 3D rendering. Added the public plate identifiers to contact events. | 11/11 | 2/2 |

Chrome replayed the repaired artifacts through native keyboard input. Four visual checks were reviewed from event-linked frames. An extra A07 replay started at the bottom of the ramp and crossed the open gate after walking to the switch. See the [reviewed results](results.json), and screenshots for [A07](A07/victory.png), [C06](C06/victory.png) and [P01](P01/victory.png).

## Replay from the checkout

Run `npm ci` in the checkout. Copy the chosen `<task>/game` directory to a fresh staging directory. Add the pinned `three.module.js` and `three.core.js` from `node_modules/three/build` and `LICENSE` from `node_modules/three` to that directory.

    node scripts/evaluate-workshop.mjs --task=A07 --submission=<staged-game> --replay=baselines/high-repair-001/A07/replay.json
    node scripts/evaluate-workshop.mjs --task=C06 --submission=<staged-game> --replay=baselines/high-repair-001/C06/replay.json
    node scripts/evaluate-p01.mjs --task=P01 --clock=virtual --submission=<staged-game> --replay=baselines/high-repair-001/P01/replay.json

The standalone archive includes all three play-ready packages, the raw reports, traces, replay parameters and visual evidence. Run `python -m http.server 8785 --bind 127.0.0.1` from the extracted archive and open the local address to choose a game.
