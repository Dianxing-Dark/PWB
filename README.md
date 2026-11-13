# PlayableWorld-Bench

A benchmark for functional playability in coding-agent-generated interactive worlds. The pilot focuses on browser-native 3D tasks and includes matched 2D controls.

The [pilot manifest](pilot/manifest.json) indexes 12 task specifications and 104 planned checks. Give builders only the selected contract and the [shared interface](pilot/builder/shared-runtime-interface.json). The [candidate inventory](pilot/candidate-inventory.json) tracks the remaining designs.

The [evaluation protocol](pilot/protocol.json) reports strict success alongside functional, journey, visual, and recovery evidence. The [run-report schema](pilot/evaluator/run-report.schema.json) records outcomes and evidence.

The task plans await reference implementation and browser calibration.
