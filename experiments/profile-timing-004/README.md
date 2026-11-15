# Standalone profile timing

A, B and C each ran in a fresh Chrome process. The experiment rotated their order across three runs per task and included evaluator startup and shutdown. All 18 executions passed each of their scheduled reference checks.

| Task | A median | B median | C median | C minus A |
| --- | ---: | ---: | ---: | ---: |
| C09 pickup and occlusion | 5.78 s | 4.09 s | 7.79 s | 2.01 s |
| C12 checkpoint and recovery | 9.53 s | 5.96 s | 13.33 s | 3.80 s |

See the [18 measurement records](results.json) for version digests and individual times. These measurements use reference layouts on one host with a controlled replay clock. Fault detection is reported in the paired calibration experiments.

Reproduce from the repository with a fresh output folder.

    node scripts/benchmark-profile-time.mjs <new-output-directory> C09 C12
