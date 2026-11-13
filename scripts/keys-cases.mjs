import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const position = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const atHeight = (state, y) => Math.abs(position(state)[1] - y) < 0.1;
const heightOf = (route, floor) => floor === "upper" ? route.upperHeight : route.lowerHeight;
const gateSide = (state, gate) => (position(state)[gate.axis] - gate.plane) * gate.direction;
const inventoryEvents = (events, action) => events.filter(event =>
  event.type === "inventory_changed" && event.data.action === action);
const doorEvents = events => events.filter(event => event.type === "door_state_changed");
const closed = door => door.locked === true && door.passable === false;
const opened = door => door.locked === false && door.passable === true;

function checkSnapshot(state) {
  requireCheck(Number.isInteger(state.attemptId) && Number.isInteger(state.tick) &&
    Array.isArray(position(state)) && position(state).length === 3 && position(state).every(Number.isFinite) &&
    typeof state.avatar.supportSurface === "string" &&
    ["amber", "blue"].every(id => Number.isInteger(state.inventory[id]) && state.inventory[id] >= 0) &&
    ["lower", "upper"].every(id => closed(state.doors[id]) || opened(state.doors[id])),
  "Snapshot does not expose the required clock, spatial, inventory and lock fields.");
}

export function checkSetup(state, scenario, route) {
  checkSnapshot(state);
  const branch = scenario === "no_key_near_locked_door" ? route.noKeyBranch :
    ["one_key_at_matching_lock", "projected_near_other_floor"].includes(scenario) ? "lower" : "upper";
  const height = heightOf(route, branch);
  const positionExpected = route.localPositions[scenario];
  const atom = ["one_key_at_matching_lock", "projected_near_other_floor"].includes(scenario);
  const [x, , z] = position(state);
  requireCheck(atHeight(state, height) && Math.hypot(x - positionExpected[0], z - positionExpected[1]) < 0.2 &&
    state.outcome !== "victory" && state.outcome !== "failure" && closed(state.doors.upper) &&
    (scenario === "key_already_spent_elsewhere" ? opened(state.doors.lower) : closed(state.doors.lower)),
  "Local scenario did not establish its legal player position and lock states.");
  const amber = Number(atom || scenario === "amber_key_near_upper_lock");
  const blue = Number(scenario === "blue_only_near_upper_lock");
  requireCheck(state.inventory.amber === amber && state.inventory.blue === blue,
    "Local scenario did not establish its legal inventory.");
  if (!atom && scenario !== "key_already_spent_elsewhere") {
    requireCheck(state.keys.amber.collected === Boolean(amber) && state.keys.blue.collected === Boolean(blue),
      "Local pickup flags disagree with the legal inventory.");
  }
}

async function pressUse(test) {
  await test.page.keyboard.press("e");
  const afterInput = await test.sample();
  return test.until(state => state.tick > afterInput.tick, 1400, "The simulation did not advance after E.");
}

function checkConsumption(before, after, events, branch, color) {
  const otherBranch = branch === "upper" ? "lower" : "upper";
  const otherColor = color === "amber" ? "blue" : "amber";
  const spent = inventoryEvents(events, "unlock");
  const doors = doorEvents(events);
  requireCheck(before.inventory[color] === 1 && after.inventory[color] === 0 &&
    after.inventory[otherColor] === before.inventory[otherColor] &&
    closed(before.doors[branch]) && opened(after.doors[branch]) &&
    after.doors[otherBranch].locked === before.doors[otherBranch].locked &&
    after.doors[otherBranch].passable === before.doors[otherBranch].passable &&
    spent.length === 1 && spent[0].data.color === color && spent[0].data.objectId === branch &&
    spent[0].data.before === 1 && spent[0].data.after === 0 &&
    doors.length === 1 && doors[0].data.doorId === branch && doors[0].data.passable === true &&
    spent[0].sequence < doors[0].sequence && spent[0].tick === doors[0].tick,
  "A matching unlock did not consume exactly one key and open just its own door.", "unlock_matching_door");
}

async function pickup(test, color) {
  const point = test.route.keys[color];
  const initial = await test.sample();
  const start = test.trace.length - 1;
  await test.go([point[0], point[2]]);
  const state = await test.sample();
  const changes = inventoryEvents(await test.events(), "pickup").filter(event => event.data.color === color);
  const approached = test.trace.slice(start).some(sample =>
    distance(position(sample), point) <= (test.route.pickupRadius ?? 0.25) + 0.03);
  requireCheck(!initial.keys[color].collected && state.keys[color].collected &&
    state.inventory[color] === initial.inventory[color] + 1 && approached &&
    changes.length === 1 && changes[0].data.before === initial.inventory[color] &&
    changes[0].data.after === state.inventory[color] && changes[0].data.objectId === color,
  "Contact did not remove the key and add exactly one inventory unit.", "collect_" + color);
  return changes[0];
}

function checkContinuous(motion, maxStep) {
  requireCheck(motion.every((state, index) => {
    if (index === 0) return true;
    const before = motion[index - 1];
    return state.attemptId === before.attemptId && state.tick >= before.tick &&
      distance(position(state), position(before)) <= maxStep * (state.tick - before.tick) + 0.001;
  }), "Avatar motion was discontinuous.", "cross_door");
}

async function cross(test, branch) {
  const gate = test.route.gates[branch];
  const motion = await test.go(gate.after);
  const first = motion[0];
  const final = motion.at(-1);
  const y = heightOf(test.route, branch);
  requireCheck(gateSide(first, gate) < 0 && gateSide(final, gate) > 0.15 &&
    motion.every(state => atHeight(state, y) && state.doors[branch].passable && state.outcome === "none"),
  "The player did not cross the open door on the intended floor.", "cross_" + branch);
  checkContinuous(motion, test.route.maxStep);
  await test.capture("past-" + branch + "-lock");
  return final;
}

async function checkBarrier(test, branch, destination) {
  const gate = test.route.gates[branch];
  const keys = gate.axis === 0 ? ["a", "d"] : ["w", "s"];
  const key = keys[gate.direction > 0 ? 1 : 0];
  const target = destination[gate.axis === 0 ? 0 : 1];
  const motion = await test.move(key, state =>
    state.outcome !== "none" || (position(state)[gate.axis] - target) * gate.direction >= 0, 850);
  const first = motion[0];
  const final = motion.at(-1);
  checkContinuous(motion, test.route.maxStep);
  requireCheck(gateSide(final, gate) > -0.48 && gateSide(final, gate) - gateSide(first, gate) > 0.18 && motion.every(state =>
    gateSide(state, gate) < 0 && atHeight(state, heightOf(test.route, branch)) &&
    closed(state.doors[branch]) && state.outcome === "none"),
  "The locked door did not block a real approach on its floor.", "reject_bypass");
}

function pixelCount(frame, color) {
  const { data } = PNG.sync.read(frame.bytes);
  let pixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (color.every((channel, index) => Math.abs(data[offset + index] - channel) <= 12)) pixels++;
  }
  return pixels;
}

async function visibleText(test, selector) {
  return test.page.locator(selector).filter({ visible: true }).first().innerText({ timeout: 1500 });
}

async function journey(test, branch) {
  const start = await test.sample();
  const color = branch === "upper" ? "amber" : "blue";
  const other = color === "amber" ? "blue" : "amber";
  const path = test.route.journeys[branch];
  requireCheck(start.attemptId === 0 && start.outcome === "none" &&
    Object.values(start.inventory).every(amount => amount === 0) &&
    Object.values(start.keys).every(key => !key.collected) &&
    Object.values(start.doors).every(closed), "Journey did not start in a fresh game.");
  for (const waypoint of path.toKey) await test.go(waypoint);
  if (branch === "upper") {
    requireCheck(test.trace.some(state => position(state)[1] > test.route.lowerHeight + 0.25 &&
      position(state)[1] < test.route.upperHeight - 0.25), "The player did not ascend through the 3D route.");
  }
  const picked = await pickup(test, color);
  await test.capture("key-collected");
  await test.go(test.route.gates[branch].before);
  const beforeUnlock = await test.sample();
  const afterUnlock = await pressUse(test);
  const unlocked = await test.events();
  checkConsumption(beforeUnlock, afterUnlock, unlocked, branch, color);
  await test.capture("matching-lock-open");
  const crossed = await cross(test, branch);
  for (const waypoint of path.afterGate) await test.go(waypoint);
  await test.go(path.exit);
  const final = await test.sample();
  await test.capture("exit");
  const events = await test.events();
  const openedEvent = doorEvents(unlocked)[0];
  const won = events.find(event => event.type === "outcome_changed" && event.data.outcome === "victory");
  const correctBranch = test.contract.id !== "P05" || final.traversedBranch === branch;
  requireCheck(won && final.outcome === "victory" && correctBranch &&
    final.attemptId === start.attemptId && final.inventory[color] === 0 &&
    final.inventory[other] === 0 && !final.keys[other].collected &&
    picked.sequence < openedEvent.sequence && openedEvent.tick < crossed.tick && crossed.tick < won.tick &&
    events.every(event => event.attemptId === start.attemptId && event.type !== "scenario_loaded") &&
    Math.hypot(position(final)[0] - path.exit[0], position(final)[2] - path.exit[1]) < path.exitRadius,
  "The selected route did not produce victory with its own key and actual door crossing.", "enter_goal");
  checkContinuous(test.trace, test.route.maxStep);
  test.notes.milestones = { pickup: picked.tick, unlock: openedEvent.tick, passage: crossed.tick, victory: won.tick };
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").isVisible(), "The 3D playfield is missing.");
  },
  async probe(test) {
    const first = await test.sample();
    await test.move(test.route.probe, state => distance(position(state), position(first)) >= 0.25, 1200);
    const final = await test.sample();
    checkSnapshot(first);
    checkSnapshot(final);
    const inputs = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(final.tick > first.tick && final.attemptId === first.attemptId &&
      distance(position(final), position(first)) >= 0.23 &&
      ["keydown", "keyup"].every(type => inputs.some(event =>
        event.type === type && event.code === "Key" + test.route.probe.toUpperCase() && event.trusted)),
    "The avatar and simulation clock did not respond to trusted movement input.");
  },
  async consume_once(test) {
    const initial = await test.sample();
    const opened = await pressUse(test);
    const second = await pressUse(test);
    checkConsumption(initial, opened, await test.events(), "lower", "amber");
    requireCheck(second.inventory.amber === 0 && closed(second.doors.upper) && second.doors.lower.passable,
      "Repeated E changed inventory or another lock.");
  },
  async reject_cross_level(test) {
    const initial = await test.sample();
    await test.capture("projected-locks");
    const final = await pressUse(test);
    await test.capture("only-lower-open");
    checkConsumption(initial, final, await test.events(), "lower", "amber");
    requireCheck(atHeight(final, test.route.lowerHeight) && closed(final.doors.upper),
      "A projected overlap opened the other floor's lock.");
  },
  async reject_empty_inventory(test) {
    const final = await pressUse(test);
    const events = await test.events();
    requireCheck(closed(final.doors.upper) && opened(final.doors.lower) && final.inventory.amber === 0 &&
      final.inventory.blue === 0 && !doorEvents(events).length && !inventoryEvents(events, "unlock").length,
    "The empty inventory did not prevent a second unlock.");
  },
  async pickup_unique(test) {
    await test.capture("key-present");
    await pickup(test, "amber");
    await test.capture("key-collected");
    await test.go(test.route.localPositions.before_amber_pickup);
    await test.go([test.route.keys.amber[0], test.route.keys.amber[2]]);
    const final = await test.sample();
    requireCheck(final.inventory.amber === 1 && final.keys.amber.collected &&
      inventoryEvents(await test.events(), "pickup").length === 1,
    "Crossing the same key position again increased inventory.");
  },
  async reject_wrong_color(test) {
    const final = await pressUse(test);
    await test.capture("wrong-key");
    requireCheck(final.inventory.blue === 1 && final.inventory.amber === 0 && closed(final.doors.upper) &&
      !doorEvents(await test.events()).length && !inventoryEvents(await test.events(), "unlock").length,
    "The upper lock accepted or consumed a non-matching key.");
    await checkBarrier(test, "upper", test.route.gates.upper.after);
  },
  async unlock_correct_and_cross(test) {
    const initial = await test.sample();
    await test.capture("locked");
    const final = await pressUse(test);
    await test.capture("unlocked");
    checkConsumption(initial, final, await test.events(), "upper", "amber");
    await cross(test, "upper");
  },
  async reject_bypass(test) {
    const branch = test.route.noKeyBranch;
    const final = await pressUse(test);
    requireCheck(Object.values(final.inventory).every(amount => amount === 0) && closed(final.doors[branch]) &&
      !doorEvents(await test.events()).length, "An empty inventory unlocked the door.");
    await checkBarrier(test, branch, test.route.gates[branch].after);
    for (const { before, after } of test.route.bypassApproaches) {
      await test.go(before);
      await checkBarrier(test, branch, after);
    }
    await test.capture("locked-door-blocks-approach");
  },
  async inventory_feedback(test) {
    const before = await test.capture("amber-key-visible");
    const anchors = test.route.feedback;
    const initial = anchors ? await visibleText(test, anchors.amberLabel) : null;
    const picked = await pickup(test, "amber");
    const after = await test.capture("amber-key-gone");
    if (!anchors) return { unverified: "Review the key and inventory frames before and after pickup." };
    const pixels = [before, after].map(frame => pixelCount(frame, anchors.keyColor));
    test.notes.amberMarkerPixels = pixels;
    test.notes.pickupTick = picked.tick;
    requireCheck(initial === "0" && await visibleText(test, anchors.amberLabel) === "1" &&
      pixels[0] > 18 && pixels[1] < pixels[0] * 0.12,
    "The rendered amber key or inventory did not show the pickup.");
  },
  async unlock_feedback(test) {
    const before = await test.capture("upper-door-locked");
    const anchors = test.route.feedback;
    const amber = anchors ? await visibleText(test, anchors.amberLabel) : null;
    const lock = anchors ? await visibleText(test, anchors.lockLabel) : null;
    await pressUse(test);
    const after = await test.capture("upper-door-open");
    if (!anchors) return { unverified: "Review the gate and inventory frames before and after E." };
    const pixels = [before, after].map(frame => pixelCount(frame, anchors.lockColor));
    test.notes.upperDoorPixels = pixels;
    test.notes.unlockTick = doorEvents(await test.events())[0]?.tick ?? null;
    requireCheck(amber === "1" && lock === "Amber · locked" && await visibleText(test, anchors.amberLabel) === "0" &&
      await visibleText(test, anchors.lockLabel) === "Amber · open" && pixels[0] > 50 && pixels[1] < pixels[0] * 0.12 &&
      test.notes.unlockTick !== null, "The rendered gate and inventory did not show the unlock.");
  },
  finish: test => journey(test, "upper"),
  finish_upper: test => journey(test, "upper"),
  finish_lower: test => journey(test, "lower"),
};
