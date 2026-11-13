# PlayableWorld-Bench

A benchmark for functional playability in coding-agent-generated interactive worlds. The pilot focuses on browser-native 3D tasks and includes matched 2D controls.

## Run the P01 reference

Install Node.js 22 or newer and Chrome, Chromium, or Edge. Use `CHROME_PATH` if the browser is installed outside the usual paths.

```sh
npm ci
npm run play:p01
```

Open the printed localhost URL. In Pressure Chamber, use WASD to move. Push the crate onto lower plate A, follow the ramp to upper plate B, hold both plates for two seconds, then walk through the gate to the exit. If you fall, press R.

## Run the P01 browser checks

```sh
npm run evaluate:p01
npm run calibrate:p01
```

The first command evaluates the reference. The second also evaluates the four registered single-fault variants and checks the expected failures and preserved behavior. To inspect one variant, run `npm run evaluate:p01 -- --fault=closed_collider_after_animation`.

Each run writes a schema-validated `report.json` and its evidence under `runs/`. Each case records browser input, sampled state, simulation events and available screenshots. The two journeys start in fresh pages and advance through trusted keyboard input. Gate feedback is checked against the rendered panel and HUD in this reference.

The P01 runner uses waypoints and visual checks specific to this reference layout. A second independently implemented reference and a runner that supports different legal layouts are needed before comparing agent submissions.

## Pilot contracts

The [pilot manifest](pilot/manifest.json) indexes 12 task specifications and 104 planned checks. Give builders the selected contract and the [shared interface](pilot/builder/shared-runtime-interface.json). The [candidate inventory](pilot/candidate-inventory.json) tracks the remaining designs.

The [evaluation protocol](pilot/protocol.json) reports strict success alongside functional, journey, visual, and recovery evidence. The [run-report schema](pilot/evaluator/run-report.schema.json) records outcomes and evidence.
