import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

export const primaryReplay = {
  tolerance: 0.075, probe: "d", surfaces: { lower: "lower", upper: "upper", ramp: "ramp" }, lowerHeight: 0,
  sample: [1.43, 2.3, 0], goal: [4.3, 2.3, 0], exitRadius: 0.43,
  approaches: {
    below_sample: [1.43, 0, 0], beside_sample: [1.76, 2.3, 0],
    outside_reach: [2.86, 2.3, 0], behind_wall: [0.39, 2.3, 0],
  },
  obstructed: { key: "d", target: 1.16, blockedRange: [0.54, 0.82] },
  ascent: [[-4.6, 0], [-4.6, -2.8], [-1.9, -2.8], [-1.9, 0], [0.39, 0]],
  detour: [[0.39, 1.16], [1.76, 1.16], [1.76, 0]],
  bypass: [1.76, 2.3, 1.16],
};
const pos = state => state.avatar.position;
const ground = ([x, , z]) => [x, z];
const distance = (a, b) => Math.hypot(...a.map((coordinate, axis) => coordinate - b[axis]));
const picks = events => events.filter(event => event.type === "inventory_changed" && event.data.objectId === "sample");
const onLevel = (route, state, floor) => state.avatar.supportSurface === route.surfaces[floor] &&
  Math.abs(pos(state)[1] - (floor === "upper" ? route.sample[1] : route.lowerHeight)) < 0.06;
const fresh = state => state.outcome === "none" && !state.sample.collected && state.inventory.sample === 0;
const directions = { d: [0, 1], a: [0, -1], s: [2, 1], w: [2, -1] };
function progress(state, key) {
  const [axis, sign] = directions[key];
  return pos(state)[axis] * sign;
}
export function checkSetup(state, id, route, contract) {
  const reach = distance(ground(pos(state)), ground(state.sample.position));
  const limit = contract.constants.pickupRangeMeters;
  const allowedReach = id === "below_sample" ? reach < 0.12 :
    id === "outside_reach" ? reach > limit : reach <= limit;
  requireCheck(fresh(state) && allowedReach && distance(pos(state), route.approaches[id]) < 0.1 &&
    distance(state.sample.position, route.sample) < 0.06 &&
    onLevel(route, state, id === "below_sample" ? "lower" : "upper"),
  "Local setup did not establish the registered reach, floor or visibility condition.");
}

async function press(test) {
  await test.page.keyboard.press("e");
  const sampled = await test.sample();
  return test.until(state => state.tick > sampled.tick || state.outcome !== "none", 1100,
    "Simulation did not advance after E.");
}

async function refused(test, frame, reason) {
  await test.capture(frame + "-before");
  const state = await press(test);
  await test.capture(frame + "-after");
  requireCheck(fresh(state) && !picks(await test.events()).length, reason);
}

async function collect(test) {
  const before = await test.sample();
  const after = await press(test);
  const transitions = picks(await test.events());
  requireCheck(fresh(before) && after.sample.collected && after.inventory.sample === 1 &&
    transitions.length === 1 && transitions[0].data.before === 0 && transitions[0].data.after === 1 &&
    onLevel(test.route, after, "upper") && distance(ground(pos(after)), ground(test.route.sample)) <= test.contract.constants.pickupRangeMeters,
  "One legal input did not collect the sample once.", "collect_sample");
  return transitions[0];
}

async function detour(test) {
  for (const waypoint of test.route.detour) await test.go(waypoint);
  requireCheck(distance(pos(await test.sample()), test.route.approaches.beside_sample) < 0.29 &&
    test.trace.some(state => onLevel(test.route, state, "upper") && distance(pos(state), test.route.bypass) < 0.22),
  "A native path around the wall did not reach the sample side.", "detour");
}

async function ascend(test) {
  for (const waypoint of test.route.ascent) await test.go(waypoint);
  const { lowerHeight, sample, surfaces } = test.route;
  requireCheck(onLevel(test.route, await test.sample(), "upper") && test.trace.some(state =>
    state.avatar.supportSurface === surfaces.ramp && pos(state)[1] > lowerHeight + 0.2 && pos(state)[1] < sample[1] - 0.2),
  "Default route did not ascend between floors.", "climb");
}

function marker(frame) {
  const { data } = PNG.sync.read(frame.bytes);
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ([252, 205, 94].every((channel, index) => Math.abs(data[i + index] - channel) < 13)) pixels++;
  }
  return pixels;
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator(test.route.viewportSelector ?? (test.submission ? "canvas" : "#world canvas")).first().isVisible(), "WebGL viewport is missing.");
  },
  async probe(test) {
    const before = await test.sample();
    const key = test.route.probe;
    await test.move(key, state => progress(state, key) - progress(before, key) > 0.25, 1000);
    const after = await test.sample();
    const inputs = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(fresh(after) && before.attemptId === after.attemptId && after.tick > before.tick &&
      progress(after, key) - progress(before, key) > 0.2 &&
      ["keydown", "keyup"].every(type => inputs.some(i => i.type === type && i.code === "Key" + key.toUpperCase() && i.trusted)),
    "The exposed state did not track trusted player input and clock progression.");
  },
  reject_other_floor: test => refused(test, "directly-below", "Input collected a sample from a different floor."),
  reject_outside_reach: test => refused(test, "outside-radius", "Input collected a sample beyond the reach limit."),
  reject_occluded: test => refused(test, "occluded", "Input collected the sample through the partition."),
  async collect_once(test) {
    await collect(test);
    const after = await press(test);
    requireCheck(after.inventory.sample === 1 && picks(await test.events()).length === 1,
      "Repeated input added inventory or recorded a second pickup.");
    await test.capture("single-pickup");
  },
  async pickup_feedback(test) {
    const before = await test.capture("sample-present", test.submission ? undefined : "#world canvas");
    await collect(test);
    const after = await test.capture("sample-removed", test.submission ? undefined : "#world canvas");
    if (test.submission) return { unverified: "Review both frames for object removal and visible inventory feedback." };
    const counts = [before, after].map(marker);
    test.notes.sampleMarkerPixels = counts;
    requireCheck(counts[0] > 20 && counts[1] < 3 && await test.page.locator("#sample").innerText() === "Collected",
      "The visible sample or inventory label did not reflect the pickup.");
  },
  async collect_by_detour(test) {
    const { key, target, blockedRange: [min, max] } = test.route.obstructed;
    const motion = await test.move(key, state => progress(state, key) > target, 670);
    const stopped = motion.at(-1);
    await test.capture("wall-blocked-approach");
    requireCheck(progress(stopped, key) > min && progress(stopped, key) < max &&
      motion.every(state => onLevel(test.route, state, "upper") && fresh(state)), "The player penetrated the partition or did not approach it.");
    await test.go(ground(test.route.approaches.behind_wall));
    await detour(test);
    await collect(test);
    await test.capture("picked-up-after-detour");
  },
  async empty_exit(test) {
    await ascend(test);
    await detour(test);
    await test.go(ground(test.route.goal));
    const final = await test.sample();
    await test.capture("exit-without-sample");
    requireCheck(distance(pos(final), test.route.goal) < test.route.exitRadius && fresh(final) && !picks(await test.events()).length,
      "An empty inventory reached victory or the required exit route was not observed.");
  },
  async finish(test) {
    const first = await test.sample();
    await ascend(test);
    await detour(test);
    const pickup = await collect(test);
    await test.capture("sample-collected");
    await test.go(ground(test.route.goal));
    const final = await test.sample();
    const events = await test.events();
    const win = events.find(e => e.type === "outcome_changed" && e.data.outcome === "victory");
    requireCheck(first.attemptId === 0 && final.attemptId === first.attemptId && final.outcome === "victory" &&
      final.inventory.sample === 1 && distance(pos(final), test.route.goal) < test.route.exitRadius && onLevel(test.route, final, "upper") && win &&
      win.sequence > pickup.sequence && !events.some(e => e.type === "scenario_loaded"),
    "The default route did not reach the exit after collecting the sample.", "enter_goal");
    await test.capture("victory");
  },
};
