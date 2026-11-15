# Timing assembly and bridge calibration

| Task | Reference checks | Required journeys | Checked behavior |
| --- | ---: | ---: | --- |
| A07 | 8/8 | — | The gate opens for 120 simulation ticks. Repeated input leaves the deadline intact. The physical collider blocks the upper route before activation and after expiry. |
| C06 | 8/8 | 1/1 | Two floors supply one ingredient each. The bench consumes them atomically. Upper-floor delivery consumes the kit and wins. |
| C10 | 7/7 | 1/1 | The bridge supports crossing when extended. Retraction removes support. A journey descends the west ramp and climbs the east ramp to reach the upper exit. |

Reproduce with `npm run calibrate:workshop`. Set `CHROME_PATH` to the Chrome or Edge executable. [Calibration results](calibration.json) record matching verdicts across Chrome 157.0.8103.52 and Edge 157.0.4341.46. All 23 reference checks passed on both browsers. The 11 fault variants failed exactly the scheduled checks.

[Profile A](profiles.json) includes startup and functional checks and detected 8 of 11 faults. B includes startup, journeys and visual feedback and detected 4. C detected all 11. The hidden bridge still allowed the alternate route to finish. A separate attempt to cross the retracted bridge exposed the invisible support. The stale gate indicator left the timing and physical traversal checks green. Its frame and HUD checks detected the fault.

Selected frames show the [open gate](frames/gate-open.png), [delivered kit](frames/kit-delivered.png), and [lower detour](frames/lower-detour.png). Visual checks on references use known colors and labels. Custom submissions produce frames for review. The family has one reference layout per task.
