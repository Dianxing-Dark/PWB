import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const UP = 2.2;
const height = { lower: 0, upper: UP };
const position = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const near = (state, point, radius = 0.18) => distance(position(state), point) < radius;
const isOn = (state, floor) => state.avatar.supportSurface === floor && Math.abs(position(state)[1] - height[floor]) < 0.06;
const failed = state => state.outcome === "failure";
const eventOf = (events, type) => events.filter(event => event.type === type);

export function checkSetup(state, scenario) {
  const floor = scenario.endsWith("lower") || scenario === "lower_trap_route" ? "lower" : "upper";
  const approach = scenario.startsWith("approach");
  const expected = approach ? [-0.8, height[floor], 0] :
    [1.28, height[floor], scenario === "upper_trap_route" ? 0.72 : 0];
  requireCheck(isOn(state, floor) && near(state, expected) && state.outcome === "none" &&
    state.checkpoint.id === (approach ? null : floor) &&
    (approach ? state.checkpoint.position === null : distance(state.checkpoint.position, [0, height[floor], 0]) < 0.06),
  "The local scenario did not establish the registered preconditions.");
}

async function register(test, floor) {
  const previous = await test.sample();
  const previousEvents = await test.events();
  await test.go([0, 0]);
  const state = await test.sample();
  const rows = eventOf(await test.events(), "checkpoint_registered")
    .filter(event => event.attemptId === state.attemptId && event.sequence > (previousEvents.at(-1)?.sequence ?? -1));
  requireCheck(previous.checkpoint.id !== floor && isOn(state, floor) && near(state, [0, height[floor], 0]) &&
    state.checkpoint.id === floor && rows.length === 1 && rows[0].data.id === floor &&
    distance(state.checkpoint.position, [0, height[floor], 0]) < 0.06 &&
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
    rows[0].data.checkpointId === state.checkpoint.id && isOn(first, state.checkpoint.id) &&
    near(first, state.checkpoint.position, 0.06),
  "Retry did not restore the saved checkpoint on its original floor.", "retry");
  await test.capture(label);
  return first;
}

async function trap(test, floor) {
  await test.move("d", failed, 1500);
  const state = await test.sample();
  const rows = eventOf(await test.events(), "outcome_changed")
    .filter(event => event.attemptId === state.attemptId && event.data.outcome === "failure");
  requireCheck(failed(state) && rows.length === 1 && rows[0].data.cause === floor + "_trap" &&
    isOn(state, floor) && near(state, [2.15, height[floor], floor === "upper" ? 0.72 : 0], 0.32),
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
    await test.go([-2.4, 0]);
    const powered = await pressUse(test);
    requireCheck(powered.lowerPowered && isOn(powered, "lower"), "Lower power did not activate.", "lower_power");
    await test.capture("power-on");
  }
  for (const point of [[-4.43, 0], [-4.43, -2.74], [-2.17, -2.74], [-2.17, 0]]) await test.go(point);
  requireCheck(test.trace.some(state => position(state)[1] > 0.3 && position(state)[1] < UP - 0.3) &&
    isOn(await test.sample(), "upper"), "The journey did not ascend along the ramp.", "climb");
  return register(test, "upper");
}

async function relay(test) {
  await test.go([1.12, 0]);
  return pressUse(test);
}

async function powerAndRelay(test) {
  await climb(test, true);
  const state = await relay(test);
  requireCheck(state.lowerPowered && state.upperSwitchOn && isOn(state, "upper"),
    "Upper switch did not activate with lower power.", "upper_switch");
  await test.capture("relay-on");
  return state;
}

async function failAfterRelay(test) {
  await powerAndRelay(test);
  await test.go([1.25, 0.72]);
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
  await test.go([4.95, 0]);
  const final = await test.sample();
  await test.capture("victory");
  const events = await test.events();
  const power = events.find(event => event.type === "control_changed" && event.data.id === "lower_power");
  const saved = events.find(event => event.type === "checkpoint_registered" && event.data.id === "upper");
  const switchEvents = events.filter(event => event.type === "control_changed" && event.data.id === "upper_switch");
  const lastSwitch = switchEvents.at(-1);
  const wins = eventOf(events, "outcome_changed").filter(event => event.data.outcome === "victory");
  requireCheck(final.attemptId === active.attemptId && final.outcome === "victory" && final.lowerPowered &&
    final.upperSwitchOn && isOn(final, "upper") && near(final, [4.95, UP, 0], 0.47) && wins.length === 1 &&
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
    await test.move("d", state => position(state)[0] - position(first)[0] > 0.24, 1100);
    const last = await test.sample();
    const keys = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(first.attemptId === last.attemptId && last.tick > first.tick && last.checkpoint.id === null &&
      position(last)[0] - position(first)[0] > 0.2 &&
      ["keydown", "keyup"].every(type => keys.some(e => e.code === "KeyD" && e.type === type && e.trusted)),
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
    const motion = await test.move("s", failed, 1900);
    const final = motion.at(-1);
    const fall = eventOf(await test.events(), "outcome_changed").find(event => event.data.cause === "fall");
    requireCheck(failed(final) && fall && motion.some(state => state.avatar.supportSurface === null &&
      position(state)[1] > 0.2 && position(state)[1] < UP - 0.25),
    "Leaving the upper edge did not produce a visible fall to failure.", "fall");
    await test.capture("fall");
    await restart(test, final);
  },
  async checkpoint_feedback(test) {
    const before = await test.capture("upper-idle", "#world canvas");
    const initial = await test.page.locator("#checkpoint").innerText();
    await register(test, "upper");
    const after = await test.capture("upper-registered", "#world canvas");
    const marker = frame => {
      const { data } = PNG.sync.read(frame.bytes);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ([112, 229, 182].every((channel, c) => Math.abs(data[i + c] - channel) < 14)) count++;
      }
      return count;
    };
    test.notes.savedMarkerPixels = [before, after].map(marker);
    requireCheck(initial === "Start" && await test.page.locator("#checkpoint").innerText() === "Upper deck saved" &&
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
    await test.go([1.25, 0.72]);
    const retry = await trapAndRetry(test, "upper");
    const events = await test.events();
    const checkpoints = eventOf(events, "checkpoint_registered");
    requireCheck(checkpoints.length === 2 && checkpoints[0].data.id === "lower" &&
      checkpoints[1].data.id === "upper" && checkpoints.every(event => event.attemptId === start.attemptId) &&
      !eventOf(events, "scenario_loaded").length && retry.attemptId === 1,
    "The latest checkpoint was not established through native input in one attempt.");
  },
  async lower_trap_not_upper(test) {
    const motion = await test.go([3.15, 0]);
    await test.capture("safe-above-trap");
    requireCheck(position(motion.at(-1))[0] > 2.85 && motion.some(state => near(state, [2.15, UP, 0], 0.23)) &&
      motion.every(state => isOn(state, "upper") && state.outcome === "none") &&
      !eventOf(await test.events(), "outcome_changed").length,
    "An upper route was blocked or hit by the lower trap through projection.");
  },
  async trap_feedback(test) {
    const state = await trap(test, "upper");
    const before = await test.page.locator("#status").innerText();
    await restart(test, state);
    requireCheck(before === "Trap hit · press R" && await test.page.locator("#status").innerText() === "In progress",
      "Failure and retry did not show distinct player feedback.");
  },
  async exit_requires_both(test) {
    await climb(test, false);
    const first = await relay(test);
    await test.go([4.95, 0]);
    const final = await test.sample();
    await test.capture("unpowered-exit");
    requireCheck(!first.lowerPowered && !first.upperSwitchOn && near(final, [4.95, UP, 0], 0.47) &&
      final.outcome === "none" && !eventOf(await test.events(), "control_changed").length,
    "The unpowered room allowed relay activation or exit completion.");
  },
  async exit_requires_relay(test) {
    await climb(test, true);
    await test.go([4.95, 0]);
    const final = await test.sample();
    await test.capture("exit-with-idle-relay");
    requireCheck(final.lowerPowered && !final.upperSwitchOn && isOn(final, "upper") &&
      near(final, [4.95, UP, 0], 0.47) && final.outcome === "none",
    "The exit accepted lower power without the upper relay.");
  },
  retry_keeps_power_clears_switch: failAfterRelay,
  finish_direct: test => finish(test, false),
  finish_after_retry: test => finish(test, true),
};
