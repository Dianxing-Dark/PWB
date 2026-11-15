import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const position = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const near = (state, point, radius = 0.18) => distance(position(state), point) < radius;
const isOn = (route, state, floor) => state.avatar.supportSurface === route.floor[floor] &&
  Math.abs(position(state)[1] - route.checkpoint[floor][1]) < 0.06;
const ground = ([x, , z]) => [x, z];
const failed = state => state.outcome === "failure";
const eventOf = (events, type) => events.filter(event => event.type === type);

function crossesBox(route, motion, floor, target, halfWidth, tick = null) {
  for (const [i, end] of motion.entries()) {
    const start = motion[Math.max(0, i - 1)];
    if (start.attemptId !== end.attemptId || start.tick > end.tick ||
        (tick !== null && (tick < start.tick || tick > end.tick)) ||
        !isOn(route, start, floor) || !isOn(route, end, floor)) continue;
    const [a, b] = [start, end].map(state => ground(position(state)));
    const [x, z] = ground(target);
    if (a[0] !== b[0] && a[1] !== b[1]) continue;
    if (Math.min(a[0], b[0]) <= x + halfWidth && Math.max(a[0], b[0]) >= x - halfWidth &&
        Math.min(a[1], b[1]) <= z + halfWidth && Math.max(a[1], b[1]) >= z - halfWidth) return true;
  }
  return false;
}

export function checkSetup(state, scenario, route) {
  const floor = scenario.endsWith("lower") || scenario === "lower_trap_route" ? "lower" : "upper";
  const approach = scenario.startsWith("approach");
  const expected = route.local[scenario];
  requireCheck(isOn(route, state, floor) && near(state, expected) && state.outcome === "none" &&
    state.checkpoint.id === (approach ? null : floor) &&
    (approach ? state.checkpoint.position === null : distance(state.checkpoint.position, route.checkpoint[floor]) < 0.06),
  "The local scenario did not establish the registered preconditions.");
}

async function register(test, floor) {
  const previous = await test.sample();
  const previousEvents = await test.events();
  const target = test.route.checkpoint[floor];
  const motion = await test.go(ground(target));
  const state = await test.sample();
  const rows = eventOf(await test.events(), "checkpoint_registered")
    .filter(event => event.attemptId === state.attemptId && event.sequence > (previousEvents.at(-1)?.sequence ?? -1));
  const contacted = rows.length === 1 && crossesBox(test.route, motion, floor, target,
    test.route.registrationHalfWidth ?? 0.25, rows[0].tick);
  requireCheck(previous.checkpoint.id !== floor && isOn(test.route, state, floor) && contacted &&
    state.checkpoint.id === floor && rows.length === 1 && rows[0].data.id === floor &&
    distance(state.checkpoint.position, target) < 0.06 &&
    distance(rows[0].data.position, state.checkpoint.position) < 0.01,
  "Contact did not register exactly the checkpoint on the current floor.", "register_" + floor);
  return state;
}

async function restart(test, state, label = "retry") {
  await test.page.keyboard.press("r");
  const first = await test.until(observed => observed.attemptId !== state.attemptId, 1200,
    "R did not start another attempt.", "retry");
  const rows = eventOf(await test.events(), "attempt_restarted").filter(event => event.attemptId === first.attemptId);
  requireCheck(first.attemptId === state.attemptId + 1 && first.tick < 20 && first.outcome === "none" &&
    first.checkpoint.id === state.checkpoint.id && rows.length === 1 && rows[0].tick === 0 &&
    rows[0].data.checkpointId === state.checkpoint.id && isOn(test.route, first, state.checkpoint.id) &&
    near(first, state.checkpoint.position, 0.06),
  "Retry did not restore the saved checkpoint on its original floor.", "retry");
  await test.capture(label);
  return first;
}

async function trap(test, floor) {
  await test.move(test.route.trapKey[floor], failed, 2400);
  const state = await test.sample();
  const rows = eventOf(await test.events(), "outcome_changed")
    .filter(event => event.attemptId === state.attemptId && event.data.outcome === "failure");
  requireCheck(failed(state) && rows.length === 1 && rows[0].data.cause === floor + "_trap" &&
    isOn(test.route, state, floor) && near(state, test.route.traps[floor], test.route.trapRadius[floor]),
  "The player did not fail by physically entering the trap on that floor.", "trap_" + floor);
  await test.capture("trap-hit");
  return state;
}

async function trapAndRetry(test, floor) {
  return restart(test, await trap(test, floor));
}

async function pressUse(test) {
  await test.page.keyboard.press("e");
  const now = await test.sample();
  return test.until(state => state.tick > now.tick, 1200, "Simulation did not advance after E.");
}

async function climb(test, power) {
  if (power) {
    await test.go(test.route.power);
    const powered = await pressUse(test);
    requireCheck(powered.lowerPowered && isOn(test.route, powered, "lower"), "Lower power did not activate.", "lower_power");
    await test.capture("power-on");
  }
  for (const point of test.route.climb) await test.go(point);
  const { lower, upper } = test.route.checkpoint;
  requireCheck(test.trace.some(state => position(state)[1] > lower[1] + 0.25 && position(state)[1] < upper[1] - 0.25) &&
    isOn(test.route, await test.sample(), "upper"), "The journey did not ascend along the ramp.", "climb");
  return register(test, "upper");
}

async function relay(test) {
  await test.go(test.route.relay);
  return pressUse(test);
}

async function powerAndRelay(test) {
  await climb(test, true);
  const state = await relay(test);
  requireCheck(state.lowerPowered && state.upperSwitchOn && isOn(test.route, state, "upper"),
    "Upper switch did not activate with lower power.", "upper_switch");
  await test.capture("relay-on");
  return state;
}

async function failAfterRelay(test) {
  await powerAndRelay(test);
  for (const point of test.route.approachUpperTrap) await test.go(point);
  const first = await trapAndRetry(test, "upper");
  requireCheck(first.lowerPowered && !first.upperSwitchOn,
    "Retry did not preserve completed lower power and clear the transient upper switch.", "retry_state");
  return first;
}

async function finish(test, recovery) {
  const first = await test.sample();
  requireCheck(first.attemptId === 0 && !first.lowerPowered && !first.upperSwitchOn && first.checkpoint.id === null,
    "Journey did not begin from a fresh default entry.");
  const active = recovery ? await failAfterRelay(test) : await powerAndRelay(test);
  if (recovery) requireCheck((await relay(test)).upperSwitchOn, "The relay did not reactivate after retry.", "reactivate");
  await test.go(ground(test.route.exit));
  const final = await test.sample();
  await test.capture("victory");
  const events = await test.events();
  const power = events.find(event => event.type === "control_changed" && event.data.id === "lower_power");
  const saved = events.find(event => event.type === "checkpoint_registered" && event.data.id === "upper");
  const switchEvents = events.filter(event => event.type === "control_changed" && event.data.id === "upper_switch");
  const lastSwitch = switchEvents.at(-1);
  const wins = eventOf(events, "outcome_changed").filter(event => event.data.outcome === "victory");
  requireCheck(final.attemptId === active.attemptId && final.outcome === "victory" && final.lowerPowered &&
    final.upperSwitchOn && isOn(test.route, final, "upper") && near(final, test.route.exit, test.route.exitRadius) && wins.length === 1 &&
    switchEvents.length === (recovery ? 2 : 1) && power && saved && power.sequence < saved.sequence &&
    saved.sequence < switchEvents[0].sequence && lastSwitch.attemptId === final.attemptId &&
    lastSwitch.sequence < wins[0].sequence && !eventOf(events, "scenario_loaded").length,
  "The default journey did not produce the ordered milestones and a legal exit.", "enter_exit");
  const retries = eventOf(events, "attempt_restarted");
  const failures = eventOf(events, "outcome_changed").filter(event => event.data.outcome === "failure");
  requireCheck(retries.length === Number(recovery) && failures.length === Number(recovery) &&
    (!recovery || (failures[0].sequence < retries[0].sequence && retries[0].sequence < lastSwitch.sequence)),
  "The observed recovery lifecycle did not match the registered journey.", "recovery_order");
  test.notes.milestones = events.filter(event =>
    ["control_changed", "checkpoint_registered", "outcome_changed", "attempt_restarted"].includes(event.type));
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").isVisible(), "3D viewport is missing.");
  },
  async probe(test) {
    const first = await test.sample();
    const { key, axis, direction } = test.route.probe;
    const progress = state => (position(state)[axis] - position(first)[axis]) * direction;
    await test.move(key, state => progress(state) > 0.24, 1100);
    const last = await test.sample();
    const keys = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(first.attemptId === last.attemptId && last.tick > first.tick && last.checkpoint.id === null &&
      progress(last) > 0.2 &&
      ["keydown", "keyup"].every(type => keys.some(e => e.code === "Key" + key.toUpperCase() && e.type === type && e.trusted)),
    "Snapshot did not reflect native browser movement and clock progression.");
  },
  async lower_checkpoint(test) {
    await register(test, "lower");
    await test.capture("lower-saved");
  },
  async upper_checkpoint(test) {
    await register(test, "upper");
    await test.capture("upper-saved");
  },
  async fall_and_retry_upper(test) {
    await register(test, "upper");
    const motion = await test.move(test.route.fall, failed, 2400);
    const final = motion.at(-1);
    const fall = eventOf(await test.events(), "outcome_changed").find(event => event.data.cause === "fall");
    requireCheck(failed(final) && fall && motion.some(state => state.avatar.supportSurface === null &&
      position(state)[1] > test.route.checkpoint.lower[1] + 0.2 &&
      position(state)[1] < test.route.checkpoint.upper[1] - 0.25),
    "Leaving the upper edge did not produce a visible fall to failure.", "fall");
    await test.capture("fall");
    await restart(test, final);
  },
  async checkpoint_feedback(test) {
    const visual = test.route.visual;
    const canvas = visual ? "#world canvas" : undefined;
    const before = await test.capture("upper-idle", canvas);
    const initial = visual && await test.page.locator(visual.checkpointLabel).innerText();
    await register(test, "upper");
    const after = await test.capture("upper-registered", canvas);
    if (!visual) return { unverified: "Review the checkpoint before and after registration." };
    const marker = frame => {
      const { data } = PNG.sync.read(frame.bytes);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (visual.marker.every((channel, c) => Math.abs(data[i + c] - channel) < 14)) count++;
      }
      return count;
    };
    test.notes.savedMarkerPixels = [before, after].map(marker);
    requireCheck(initial === visual.initialLabel && await test.page.locator(visual.checkpointLabel).innerText() === visual.savedLabel &&
      test.notes.savedMarkerPixels[1] > 10 && test.notes.savedMarkerPixels[0] < 3,
    "Player-facing checkpoint marker and HUD did not show the registration.");
    await test.capture("upper-registered-with-hud");
  },
  lower_trap_restart: test => trapAndRetry(test, "lower"),
  upper_trap_restart: test => trapAndRetry(test, "upper"),
  async latest_checkpoint_wins(test) {
    const start = await test.sample();
    requireCheck(start.checkpoint.id === null && start.attemptId === 0, "Expected a fresh world.");
    await register(test, "lower");
    await test.capture("lower-registered");
    await climb(test, false);
    await test.capture("upper-registered");
    for (const point of test.route.approachUpperTrap) await test.go(point);
    const retry = await trapAndRetry(test, "upper");
    const events = await test.events();
    const checkpoints = eventOf(events, "checkpoint_registered");
    requireCheck(checkpoints.length === 2 && checkpoints[0].data.id === "lower" &&
      checkpoints[1].data.id === "upper" && checkpoints.every(event => event.attemptId === start.attemptId) &&
      !eventOf(events, "scenario_loaded").length && retry.attemptId === 1,
    "The latest checkpoint was not established through native input in one attempt.");
  },
  async lower_trap_not_upper(test) {
    const start = test.trace.length;
    const entry = await test.sample();
    for (const point of test.route.safeUpper) await test.go(point);
    const motion = test.trace.slice(start);
    const [x, , z] = test.route.traps.lower;
    const projected = [x, test.route.checkpoint.upper[1], z];
    const [goalX, goalZ] = test.route.safeUpper.at(-1);
    const axis = Math.abs(goalX - position(entry)[0]) > Math.abs(goalZ - position(entry)[2]) ? 0 : 2;
    const direction = Math.sign((axis === 0 ? goalX : goalZ) - position(entry)[axis]);
    const radius = test.route.trapRadius.lower;
    await test.capture("safe-above-trap");
    requireCheck((position(motion.at(-1))[axis] - projected[axis]) * direction > radius &&
      crossesBox(test.route, motion, "upper", projected, radius / Math.SQRT2) &&
      motion.every(state => isOn(test.route, state, "upper") && state.outcome === "none") &&
      !eventOf(await test.events(), "outcome_changed").length,
    "An upper route was blocked or hit by the lower trap through projection.");
  },
  async trap_feedback(test) {
    const state = await trap(test, "upper");
    const visual = test.route.visual;
    const before = visual && await test.page.locator(visual.statusLabel).innerText();
    await restart(test, state);
    if (!visual) return { unverified: "Review the failure and retry frames." };
    requireCheck(before === visual.trapLabel && await test.page.locator(visual.statusLabel).innerText() === visual.runningLabel,
      "Failure and retry did not show distinct player feedback.");
  },
  async exit_requires_both(test) {
    await climb(test, false);
    const first = await relay(test);
    await test.go(ground(test.route.exit));
    const final = await test.sample();
    await test.capture("unpowered-exit");
    requireCheck(!first.lowerPowered && !first.upperSwitchOn && near(final, test.route.exit, test.route.exitRadius) &&
      final.outcome === "none" && !eventOf(await test.events(), "control_changed").length,
    "The unpowered room allowed relay activation or exit completion.");
  },
  async exit_requires_relay(test) {
    await climb(test, true);
    await test.go(ground(test.route.exit));
    const final = await test.sample();
    await test.capture("exit-with-idle-relay");
    requireCheck(final.lowerPowered && !final.upperSwitchOn && isOn(test.route, final, "upper") &&
      near(final, test.route.exit, test.route.exitRadius) && final.outcome === "none",
    "The exit accepted lower power without the upper relay.");
  },
  retry_keeps_power_clears_switch: failAfterRelay,
  finish_direct: test => finish(test, false),
  finish_after_retry: test => finish(test, true),
};
