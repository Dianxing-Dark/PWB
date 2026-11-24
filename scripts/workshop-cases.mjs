import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const canvas = "#world canvas";
const position = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const xz = ([x, , z]) => [x, z];
const near = (state, point, radius = 0.14) => distance(position(state), point) <= radius;
const matching = (inventory, ore, fiber, kit) => inventory.ore === ore && inventory.fiber === fiber && inventory.kit === kit;
const eventsOf = (events, type, attemptId) => events.filter(e => e.type === type && e.attemptId === attemptId);

export const replays = {
  A07: {
    tolerance: 0.07, upper: "upper", lower: "lower", gateDirection: 1, gateAxis: 0,
    gateKey: "d", landing: [1.49, 2.3, 0], minimumApproach: 0.32,
    poses: { gate_approach: [-1.48, 2.3, 0], below_gate: [-0.9, 0, 0] },
    below: [1.49, 0, 0],
  },
  C06: {
    tolerance: 0.07, upper: "upper", lower: "lower", ramp: "west_ramp",
    poses: { bench_with_ore: [0.78, 2.3, 0], bench_ready: [0.78, 2.3, 0],
      under_delivery: [3.72, 0, 0], at_delivery: [3.72, 2.3, 0] },
    toOre: [[-5.65, 1.23], [-1.85, 1.23]],
    toFiber: [[-5.65, 1.23], [-5.65, 0], [-0.72, 0]],
    bench: [0.78, 0], delivery: [3.72, 0],
  },
  C10: {
    tolerance: 0.07, lower: "lower", west: "west", east: "east", bridge: "bridge",
    westRamp: "west_ramp", eastRamp: "east_ramp",
    poses: { before_bridge: [-1.56, 2.3, 0] }, farEnd: [1.67, 2.3, 0],
    westDescent: [[-5.55, 0], [-5.55, 1.45]],
    underExit: [[3.66, 1.45], [3.66, 0]],
    eastAscent: [[7.65, 1.45], [7.65, 0], [3.66, 0]],
  },
};

export function checkSetup(state, id, route) {
  requireCheck(state.outcome === "none" && near(state, route.poses[id]), "The legal setup position is missing.");
  if (state.gate) requireCheck(!state.gate.open && state.gate.openedAt === null, "The gate should start closed.");
  if (state.bridge) requireCheck(state.bridge.extended, "The bridge should start extended.");
  if (state.inventory) {
    const contents = { bench_with_ore: [1, 0, 0], bench_ready: [1, 1, 0],
      under_delivery: [0, 0, 1], at_delivery: [0, 0, 1] };
    requireCheck(matching(state.inventory, ...contents[id]), "The starting inventory is incorrect.");
  }
}

async function interact(test, before = null) {
  before ??= await test.sample();
  await test.page.keyboard.press("e");
  return test.until(s => s.tick > before.tick || s.outcome !== before.outcome, 1200, "The interaction was never processed.");
}

async function observeInteraction(test) {
  const before = await test.sample();
  const cursor = (await test.events()).at(-1)?.sequence ?? -1;
  const after = await interact(test, before);
  const inputEvents = (await test.events()).filter(event =>
    event.sequence > cursor && event.attemptId === before.attemptId && event.tick >= before.tick);
  return { before, after, inputEvents };
}

async function walk(test, points) {
  for (const point of points) await test.go(point, 7200);
}

async function untilTick(test, tick) {
  return test.until(s => s.tick >= tick, Math.max(1400, (tick - (await test.sample()).tick) * 26),
    "The simulation never reached the scheduled tick.");
}

async function openGate(test) {
  const before = await test.sample();
  const after = await interact(test);
  const event = eventsOf(await test.events(), "gate_changed", after.attemptId).at(-1);
  requireCheck(!before.gate.open && after.gate.open && event?.data.open === true &&
    event.tick > before.tick && after.gate.openedAt === event.tick, "E did not open the gate and start its clock.", "open_gate");
  return event;
}

async function blockedByGate(test) {
  const start = await test.sample();
  const { gateAxis, gateKey, gateDirection, minimumApproach, upper } = test.route;
  const plane = start.gate.position[gateAxis];
  const motion = await test.move(gateKey, s => (position(s)[gateAxis] - plane) * gateDirection > 0.4, 1550);
  const signed = s => (position(s)[gateAxis] - plane) * gateDirection;
  requireCheck(signed(motion.at(-1)) > signed(start) + minimumApproach && motion.every(s =>
    !s.gate.open && signed(s) < 0 && s.avatar.supportSurface === upper),
  "Movement failed to approach the closed gate or crossed its collision plane.");
  await test.capture("blocked-at-gate");
}

async function craft(test) {
  const { before, after, inputEvents } = await observeInteraction(test);
  const crafted = inputEvents.filter(event => event.type === "kit_crafted");
  requireCheck(matching(before.inventory, 1, 1, 0) && matching(after.inventory, 0, 0, 1) &&
    crafted.length === 1 && crafted[0].data.id === "kit" && matching(crafted[0].data.before, 1, 1, 0) &&
    matching(crafted[0].data.after, 0, 0, 1), "Crafting did not consume both materials and create exactly one kit.", "craft");
  return crafted[0];
}

async function take(test, id, floor) {
  const { before, after, inputEvents } = await observeInteraction(test);
  const collected = inputEvents.filter(e => e.type === "material_collected" && e.data.id === id);
  requireCheck(before.avatar.supportSurface === floor && !before[id].collected && before.inventory[id] === 0 &&
    after[id].collected && after.inventory[id] === 1 && collected.length === 1,
  "The native input did not collect one copy of the " + id + " on its own floor.", id);
  return collected[0];
}

async function deliver(test) {
  const { before, after, inputEvents } = await observeInteraction(test);
  const delivered = inputEvents.filter(event => event.type === "kit_delivered");
  const win = inputEvents.find(e => e.type === "outcome_changed" && e.data.outcome === "victory");
  requireCheck(before.avatar.supportSurface === test.route.upper && matching(before.inventory, 0, 0, 1) &&
    after.outcome === "victory" && matching(after.inventory, 0, 0, 0) && delivered.length === 1 &&
    delivered[0].data.id === "kit" && delivered[0].data.remaining === 0 &&
    win?.sequence > delivered[0].sequence, "Upper-floor delivery did not consume one component and win.", "deliver");
  return delivered[0];
}

async function retract(test) {
  const before = await test.sample();
  const after = await interact(test);
  const event = eventsOf(await test.events(), "bridge_changed", after.attemptId).at(-1);
  requireCheck(before.bridge.extended && !after.bridge.extended && event?.data.extended === false && event.tick > before.tick,
    "Native interaction did not retract the bridge.", "retract");
  return event;
}

function colorCount(frame, rgb) {
  const { data } = PNG.sync.read(frame.bytes);
  let found = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (rgb.every((channel, axis) => Math.abs(data[i + axis] - channel) <= 11)) found++;
  }
  return found;
}
const hud = test => test.page.locator("#mechanism").innerText();
const visualUnverified = { unverified: "Review the captured before and after frames against the task's visible feedback criterion." };

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").first().isVisible(), "The visible 3D viewport is missing.");
  },
  async probe(test) {
    const first = await test.sample();
    await test.move(test.route.probeKey ?? "d", s => distance(position(s), position(first)) > 0.26, 950);
    const after = await test.sample();
    const input = await test.page.evaluate(() => window.__benchmarkInput);
    const code = "Key" + (test.route.probeKey ?? "d").toUpperCase();
    requireCheck(after.tick > first.tick && after.attemptId === first.attemptId &&
      distance(position(after), position(first)) > 0.25 && after.outcome === "none" &&
      ["keydown", "keyup"].every(type => input.some(i => i.type === type && i.trusted && i.code === code)),
    "The visible artifact did not respond to trusted native movement.");
  },
  blocked_before_open: blockedByGate,
  async window_boundary(test) {
    const opened = await openGate(test);
    const limit = opened.tick + test.contract.constants.openTicks;
    await untilTick(test, opened.tick + 42);
    await interact(test);
    const lastOpen = await untilTick(test, limit - 1);
    const firstClosed = await untilTick(test, limit);
    const sequence = eventsOf(await test.events(), "gate_changed", opened.attemptId);
    requireCheck(lastOpen.tick === limit - 1 && lastOpen.gate.open && firstClosed.tick === limit && !firstClosed.gate.open &&
      sequence.length === 2 && sequence[1].data.open === false && sequence[1].tick - opened.tick === 120,
    "The last open tick, closure tick, or response to repeated E was incorrect.");
    const second = await openGate(test);
    requireCheck(second.tick > firstClosed.tick, "The expired gate could not be opened again.");
  },
  async cross_open_gate(test) {
    await openGate(test);
    const motion = await test.go(xz(test.route.landing));
    requireCheck(near(motion.at(-1), test.route.landing, 0.19) &&
      motion.every(s => s.gate.open && s.avatar.supportSurface === test.route.upper),
    "The upper corridor was not physically traversable while the gate was open.");
    await test.capture("crossed-gate");
  },
  async blocked_after_expiry(test) {
    const opened = await openGate(test);
    await untilTick(test, opened.tick + test.contract.constants.openTicks);
    await blockedByGate(test);
  },
  async pass_below_gate(test) {
    const motion = await test.go(xz(test.route.below));
    requireCheck(near(motion.at(-1), test.route.below, 0.19) &&
      motion.every(s => !s.gate.open && s.avatar.supportSurface === test.route.lower),
    "The upper gate blocked the lower corridor or the gate opened without interaction.");
  },
  async gate_feedback(test) {
    const selector = test.submission ? undefined : canvas;
    const closed = await test.capture("gate-closed", selector);
    const opened = await openGate(test);
    const open = await test.capture("gate-open", selector);
    const openLabel = test.submission ? null : await hud(test);
    // Wait beyond the last valid tick so feedback checks the stable closed state.
    await untilTick(test, opened.tick + test.contract.constants.openTicks + 5);
    const expired = await test.capture("gate-expired", selector);
    if (test.submission) return visualUnverified;
    const colors = [closed, open, expired].map(frame => colorCount(frame, [243, 127, 112]));
    test.notes.closedGatePixels = colors;
    requireCheck(colors[0] > 20 && colors[1] < colors[0] / 4 && colors[2] > 20 &&
      openLabel === "Gate open" && await hud(test) === "Gate closed", "Gate visuals disagree with the opening and closing states.");
  },
  async reject_incomplete_recipe(test) {
    const after = await interact(test);
    requireCheck(matching(after.inventory, 1, 0, 0) &&
      !eventsOf(await test.events(), "kit_crafted", after.attemptId).length, "Crafting accepted the incomplete recipe.");
  },
  async craft_once(test) {
    await craft(test);
    const after = await interact(test);
    requireCheck(matching(after.inventory, 0, 0, 1) &&
      eventsOf(await test.events(), "kit_crafted", after.attemptId).length === 1, "A second interaction produced duplicate output.");
  },
  async reject_other_floor_delivery(test) {
    const after = await interact(test);
    requireCheck(matching(after.inventory, 0, 0, 1) && after.outcome === "none" &&
      !eventsOf(await test.events(), "kit_delivered", after.attemptId).length, "Delivery accepted the same projection on the wrong floor.");
  },
  deliver_on_same_floor: deliver,
  async inventory_feedback(test) {
    await test.capture("before-crafting");
    const before = test.submission ? null : await hud(test);
    await craft(test);
    await test.capture("after-crafting");
    if (test.submission) return visualUnverified;
    requireCheck(before === "Mineral 1 · Fiber 1 · Kit 0" && await hud(test) === "Mineral 0 · Fiber 0 · Kit 1",
      "The visible inventory did not register the consumption and output.");
  },
  async craft_and_deliver(test) {
    const entry = await test.sample();
    requireCheck(entry.attemptId === 0 && matching(entry.inventory, 0, 0, 0), "The journey did not start with an empty inventory.");
    await walk(test, test.route.toOre);
    const ore = await take(test, "ore", test.route.lower);
    await test.capture("ore-picked-up");
    await walk(test, test.route.toFiber);
    const fiber = await take(test, "fiber", test.route.upper);
    requireCheck(test.trace.some(s => s.avatar.supportSurface === test.route.ramp), "The journey did not walk between floors.", "ascend");
    await test.go(test.route.bench);
    const crafted = await craft(test);
    await test.capture("kit-crafted");
    await test.go(test.route.delivery);
    const delivered = await deliver(test);
    requireCheck(ore.sequence < fiber.sequence && fiber.sequence < crafted.sequence && crafted.sequence < delivered.sequence &&
      [ore, fiber, crafted, delivered].every(e => e.attemptId === 0) && !(await test.events()).some(e => e.type === "scenario_loaded"),
    "The full journey did not collect, craft and deliver in order.");
    await test.capture("kit-delivered");
  },
  async cross_extended_bridge(test) {
    const motion = await test.go(xz(test.route.farEnd));
    requireCheck(near(motion.at(-1), test.route.farEnd, 0.2) && motion.some(s => s.avatar.supportSurface === test.route.bridge) &&
      motion.every(s => s.bridge.extended && position(s)[1] > test.route.farEnd[1] - 0.1),
    "The intact bridge did not physically support the player.");
  },
  async retracted_bridge_has_no_support(test) {
    await retract(test);
    const motion = await test.go(xz(test.route.farEnd));
    requireCheck(motion.some(s => s.avatar.supportSurface === null) && motion.every(s => !s.bridge.extended &&
      s.avatar.supportSurface !== test.route.bridge) && motion.at(-1).avatar.supportSurface === test.route.lower,
    "The missing bridge still supported the player or the lower floor did not catch the descent.");
    await test.capture("lower-floor-after-gap");
  },
  async reject_lower_exit(test) {
    await retract(test);
    await walk(test, test.route.westDescent);
    await walk(test, test.route.underExit);
    const final = await test.sample();
    requireCheck(distance(xz(position(final)), xz(final.exit.position)) < 0.22 &&
      final.avatar.supportSurface === test.route.lower && final.outcome === "none",
    "The exit accepted a player on the lower floor or the lower floor route was unavailable.");
  },
  async bridge_feedback(test) {
    const selector = test.submission ? undefined : canvas;
    const before = await test.capture("bridge-before", selector);
    await retract(test);
    const after = await test.capture("bridge-after", selector);
    if (test.submission) return visualUnverified;
    const counts = [before, after].map(frame => colorCount(frame, [243, 177, 93]));
    test.notes.bridgePixels = counts;
    requireCheck(counts[0] > 20 && counts[1] < 4 && await hud(test) === "Bridge retracted",
      "The bridge or route status still appeared extended after retraction.");
  },
  async reroute_to_exit(test) {
    const entry = await test.sample();
    requireCheck(entry.attemptId === 0 && entry.avatar.supportSurface === test.route.west, "The journey did not start on the west platform.");
    const bridge = await retract(test);
    await test.capture("bridge-retracted");
    const start = test.trace.length;
    await walk(test, test.route.westDescent);
    await test.capture("lower-detour");
    await walk(test, test.route.eastAscent);
    const contact = test.trace.slice(start).map(s => s.avatar.supportSurface);
    let next = 0;
    const required = [test.route.westRamp, test.route.lower, test.route.eastRamp, test.route.east];
    for (const name of contact) if (name === required[next] && next < required.length) next++;
    const final = await test.sample();
    const log = await test.events();
    const win = eventsOf(log, "outcome_changed", 0).find(e => e.data.outcome === "victory");
    requireCheck(next === required.length && !contact.includes(test.route.bridge) &&
      final.outcome === "victory" && !final.bridge.extended && near(final, final.exit.position, 0.65) &&
      win?.sequence > bridge.sequence && !log.some(e => e.type === "scenario_loaded"),
    "Rerouting did not walk down the west ramp, across the lower path, and up the east ramp to win.", "alternate_route");
    await test.capture("alternate-route-exit");
  },
};
