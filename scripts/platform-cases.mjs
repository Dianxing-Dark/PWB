import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const relative = (body, platform) => body.map((value, axis) => value - platform[axis]);
const phaseEvent = (event, phase) => event.type === "platform_phase_changed" && event.data.phase === phase;
const gateEvents = events => events.filter(event => event.type === "door_state_changed");
const x = (state, actor = "avatar") => state[actor].position[0];
const ready = (state, actor = "avatar") => state[actor].supportSurface === "lift";
const failed = state => state.outcome === "failure";

function marker(frame, color) {
  const { data, width } = PNG.sync.read(frame.bytes);
  const sum = [0, 0];
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!color.every((channel, c) => Math.abs(data[i + c] - channel) < 12)) continue;
    sum[0] += (i / 4) % width;
    sum[1] += Math.floor(i / 4 / width);
    pixels++;
  }
  return { pixels, center: sum.map(value => pixels ? value / pixels : 0) };
}

async function waitPhase(test, phase, milestone) {
  return test.until(state => state.platform.phase === phase || failed(state), 12500,
    "Platform did not reach " + phase + ".", milestone);
}

async function board(test, cargo) {
  const landed = await test.move("d", state => failed(state) ||
    (ready(state) && (!cargo || ready(state, "box")) && x(state) >= -0.62), 1700);
  const last = landed.at(-1);
  requireCheck(last.outcome === "none" && ready(last) && (!cargo || ready(last, "box")),
    cargo ? "Player and crate did not board the lift." : "Player did not board the lift.", "board_low");
  return last;
}

async function ride(test, initial, actor, captureInMotion = false) {
  const start = test.trace.length;
  if (captureInMotion) {
    await test.until(state => state.platform.phaseTick >= 185 || failed(state), 6500, "Lift motion was not observed.");
    await test.capture("in-motion");
  }
  const last = await test.until(state => state.platform.phase === "highDock" || failed(state), 8000,
    "Lift did not reach the upper dock.", "supported_in_motion");
  const delta = last.platform.position.map((value, axis) => value - initial.platform.position[axis]);
  const origin = relative(initial[actor].position, initial.platform.position);
  const drift = Math.max(...test.trace.slice(start).map(state =>
    distance(origin, relative(state[actor].position, state.platform.position))));
  test.notes[actor + "Carry"] = { platformDelta: delta, maximumRelativeDrift: drift };
  requireCheck(!failed(last) && Math.abs(delta[0]) > 1 && Math.abs(delta[1]) > 1 && drift < 0.07 &&
    test.trace.slice(start).every(state => ready(state, actor)),
  actor + " did not remain supported while the lift moved in X and Y.", "supported_in_motion");
  return last;
}

async function approachFromLift(test) {
  const motion = await test.move("d", state => failed(state) || x(state) >= 6.55 || state.outcome === "victory", 1800);
  requireCheck(motion.at(-1).avatar.supportSurface === "upper", "Player did not step off at the upper dock.", "exit_high");
  await test.capture("upper-dock");
}

function checkMotion(motion) {
  requireCheck(motion.every((state, i) => {
    if (i === 0) return true;
    const previous = motion[i - 1];
    return distance(state.avatar.position, previous.avatar.position) <= 0.062 * (state.tick - previous.tick) + 0.001;
  }), "Player movement across the gate was discontinuous.", "cross_gate");
}

async function cross(test, actor = "avatar") {
  const motion = await test.move("d", state => failed(state) || x(state, actor) >= 8.27, 1750);
  requireCheck(x(motion[0], actor) < test.route.gateX && x(motion.at(-1), actor) >= 8.22,
    "Body could not cross the gate.", "cross_gate");
  checkMotion(motion);
  const event = (await test.events()).find(item => item.type === "gate_crossed" && item.data.actorId === actor);
  const { start, endExclusive } = test.contract.constants.gateOpen;
  requireCheck(event && event.data.phaseTick >= start && event.data.phaseTick < endExclusive,
    "Gate crossing did not occur during the allowed phase window.", "cross_gate");
  await test.capture(actor + "-past-gate");
}

function requireNormalEntry(events) {
  requireCheck(!events.some(event => event.type === "scenario_loaded"), "Journey used scenario loading.");
}

async function freightJourney(test, first) {
  const start = test.trace.length;
  await test.until(state => state.platform.phase === "lowDock", 13000, "Lift did not return to the lower dock.");
  const boarded = await board(test, true);
  await test.capture("cargo-boarded");
  const docked = await ride(test, boarded, "avatar", true);
  const crateDrift = distance(relative(boarded.box.position, boarded.platform.position),
    relative(docked.box.position, docked.platform.position));
  test.notes.cargoRelativeDrift = crateDrift;
  requireCheck(ready(docked, "box") && crateDrift < 0.07 &&
    test.trace.slice(start).filter(state => state.tick >= boarded.tick && state.tick <= docked.tick)
      .every(state => ready(state, "box")),
  "Cargo was not continuously carried with the player.", "cargo_supported_in_motion");
  await approachFromLift(test);
  await cross(test, "box");
  const motion = await test.move("d", state => state.outcome !== "none", 2000);
  const final = motion.at(-1);
  requireCheck(final.outcome === "victory" && final.cargoDelivered && x(final, "box") >= test.route.deliveryX &&
    final.box.supportSurface === "upper", "The crate did not reach the delivery zone.", "deliver_cargo");
  await test.capture("delivery");
  requireNormalEntry(await test.events());
  requireCheck(first.attemptId === final.attemptId, "Attempt changed mid-delivery.");
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").isVisible(), "3D playfield missing.");
  },

  async probe(test) {
    const initial = await test.sample();
    const motion = await test.move("s", state => state.avatar.position[2] >= initial.avatar.position[2] + 0.24, 1200);
    const final = motion.at(-1);
    const keys = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(final.attemptId === initial.attemptId && final.tick > initial.tick &&
      final.avatar.position[2] > initial.avatar.position[2] + 0.2 &&
      ["keydown", "keyup"].every(type => keys.some(event => event.type === type && event.trusted && event.code === "KeyS")),
    "The runtime snapshot did not track trusted player input and tick advancement.");
  },

  async platform_trajectory(test) {
    const { periodTicks, lowDock, outbound, highDock, inbound } = test.contract.constants;
    const first = await test.sample();
    requireCheck(first.platform.phaseTick < 30, "The trajectory scenario did not begin near the start of the cycle.");
    await test.until(state => state.tick >= periodTicks * 2, 24500, "Two complete platform periods were not observed.");
    const phases = { lowDock, outbound, highDock, inbound };
    const events = await test.events();
    for (let cycle = 0; cycle < 2; cycle++) {
      const sample = test.trace.filter(state => Math.floor(state.tick / periodTicks) === cycle);
      requireCheck(Object.entries(phases).every(([phase, range]) => sample.some(state =>
        state.platform.phase === phase && state.platform.phaseTick >= range.start &&
        state.platform.phaseTick < range.endExclusive)), "A cycle did not traverse all registered phases.");
      const positions = sample.map(state => state.platform.position);
      const extent = [0, 1].map(axis => Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis])));
      test.notes["cycle" + cycle + "Extent"] = extent;
      requireCheck(extent[0] >= 3.9 && extent[1] >= 2.1 &&
        sample.every(state => state.platform.phaseTick === state.tick % periodTicks &&
          state.platform.phaseTick >= phases[state.platform.phase].start &&
          state.platform.phaseTick < phases[state.platform.phase].endExclusive),
      "The platform did not reproduce its 3D range and phase schedule.");
      for (const [phase, range] of Object.entries(phases)) {
        const expected = cycle * periodTicks + range.start;
        if (expected === 0) continue;
        requireCheck(events.some(event => phaseEvent(event, phase) && event.tick === expected &&
          event.data.phaseTick === range.start), "A phase boundary event was missing or mistimed.");
      }
    }
  },

  async actual_support(test) {
    await test.until(state => state.tick >= test.contract.constants.periodTicks, 12500, "Second boarding window not reached.");
    const initial = await board(test, false);
    await test.capture("boarded-second-cycle");
    await ride(test, initial, "avatar");
    await approachFromLift(test);
  },

  async no_remote_carry(test) {
    const before = await test.sample();
    await test.capture("before-departure");
    const after = await test.until(state => state.platform.phaseTick >= 175 || failed(state), 2700,
      "Lift did not depart.");
    await test.capture("after-departure");
    requireCheck(distance(before.platform.position, after.platform.position) > 0.65 &&
      distance(before.avatar.position, after.avatar.position) < 0.08 &&
      test.trace.every(state => state.avatar.supportSurface === "lower" || state.tick < before.tick),
    "The lift carried a player who was standing on the stationary dock.");
  },

  async platform_feedback(test) {
    const initial = await board(test, false);
    const low = await test.capture("low-dock");
    const inTransit = await test.until(state => state.platform.phaseTick >= 189 || failed(state), 6500, "No lift motion.");
    const middle = await test.capture("lift-moving");
    const high = await waitPhase(test, "highDock");
    const arrived = await test.capture("high-dock");
    requireCheck(ready(initial) && ready(inTransit) && ready(high), "No supported player was available for visual review.");
    const lift = [low, middle, arrived].map(frame => marker(frame, [64, 232, 191]));
    const player = [low, middle, arrived].map(frame => marker(frame, [103, 189, 255]));
    test.notes.visualMarkers = { lift, player };
    requireCheck(lift.every(entry => entry.pixels > 50) && player.every(entry => entry.pixels > 25) &&
      [1, 2].every(i => distance(lift[i].center, lift[i - 1].center) > 15 &&
        distance(player[i].center, player[i - 1].center) > 15 &&
        distance(relative(player[i].center, lift[i].center),
          relative(player[i - 1].center, lift[i - 1].center)) < 45),
    "Rendered lift and player did not travel together between the docks.");
  },

  async blocked_outside_window(test) {
    const before = await test.sample();
    requireCheck(before.platform.phaseTick < 285 && !before.gate.passable, "Scenario started after the gate opened.");
    const motion = await test.move("d", state => state.platform.phaseTick >= 285, 1100);
    await test.capture("gate-blocks-early-input");
    const early = motion.filter(state => state.platform.phaseTick < 285);
    requireCheck(early.some(state => x(state) > x(before) + 0.12) &&
      early.every(state => x(state) < test.route.gateX && !state.gate.passable && state.outcome === "none") &&
      !(await test.events()).some(event => event.type === "gate_crossed" && event.data.phaseTick < 285),
    "The locked gate did not block early movement.");
  },

  async pass_during_window(test) {
    await test.until(state => state.gate.passable, 1700, "Gate did not open on the upper dock.");
    await cross(test);
    requireCheck(gateEvents(await test.events()).some(event => event.data.passable && event.data.phaseTick === 285),
      "The opening event did not occur at step 285.");
  },

  async blocks_when_closed_again(test) {
    await test.until(state => state.platform.phaseTick >= 405, 2200, "Gate close boundary did not occur.");
    const motion = await test.move("d", state => x(state) >= 8.25, 850);
    await test.capture("gate-blocks-late-input");
    requireCheck(motion.every(state => x(state) < test.route.gateX && !state.gate.passable) &&
      gateEvents(await test.events()).some(event => !event.data.passable && event.data.phaseTick === 405),
    "The gate remained passable after the window.");
    await test.until(state => state.gate.passable, 11000, "Gate did not reopen in the next cycle.");
    await cross(test);
  },

  async gate_feedback(test) {
    const closed = await test.capture("gate-before-window");
    await test.until(state => state.gate.passable, 1700, "Open state unavailable for visual check.");
    const open = await test.capture("gate-in-window");
    await test.until(state => !state.gate.passable, 4200, "Closed state unavailable for visual check.");
    const reclosed = await test.capture("gate-after-window");
    const [a, b, c] = [closed, open, reclosed].map(frame => marker(frame, [231, 92, 92]).pixels);
    test.notes.gatePixels = { closed: a, open: b, reclosed: c };
    const events = gateEvents(await test.events());
    requireCheck(a > 80 && b < a * 0.1 && c > a * 0.8 &&
      events.some(event => event.data.passable && event.data.phaseTick === 285) &&
      events.some(event => !event.data.passable && event.data.phaseTick === 405),
    "The rendered gate did not show closed, open and closed in phase order.");
  },

  async finish(test) {
    const initial = await board(test, false);
    await test.capture("boarded");
    await ride(test, initial, "avatar", true);
    await approachFromLift(test);
    await cross(test);
    const motion = await test.move("d", state => state.outcome !== "none", 1900);
    requireCheck(motion.at(-1).outcome === "victory" && x(motion.at(-1)) >= test.route.deliveryX,
      "Player did not reach the exit.", "enter_goal");
    requireNormalEntry(await test.events());
    await test.capture("victory");
  },

  async cargo_motion(test) {
    const initial = await board(test, true);
    await test.capture("cargo-boarded");
    await ride(test, initial, "box");
    await test.capture("cargo-at-upper-dock");
  },

  async no_empty_delivery(test) {
    await test.until(state => state.gate.passable, 1700, "No open gate window.");
    await cross(test);
    const motion = await test.move("d", state => x(state) >= test.route.deliveryX + 0.1 || state.outcome !== "none", 1650);
    const last = motion.at(-1);
    await test.capture("player-at-empty-delivery");
    requireCheck(x(last) >= test.route.deliveryX && x(last, "box") < 0 &&
      !last.cargoDelivered && last.outcome === "none", "Player arrival without cargo counted as delivery.");
  },

  async deliver(test) {
    await freightJourney(test, await test.sample());
  },

  async recover_and_deliver(test) {
    const initial = await test.sample();
    await test.move("w", failed, 2300);
    await test.until(failed, 950, "Falling did not end the attempt.", "fall");
    await test.capture("failure");
    await test.page.keyboard.press("r");
    const restarted = await test.until(state => state.attemptId > initial.attemptId, 1800, "R did not restart.", "restart");
    requireCheck(restarted.outcome === "none" && !restarted.cargoDelivered && !restarted.gate.passable &&
      restarted.platform.phase === "lowDock" && restarted.tick < 30 &&
      distance(initial.box.position, restarted.box.position) < 0.01 &&
      distance(initial.avatar.position, restarted.avatar.position) < 0.01,
    "Retry did not restore initial cargo, player and gate state.", "restart");
    await test.capture("retry");
    await freightJourney(test, restarted);
  },
};
