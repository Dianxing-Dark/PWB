import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const sample = [1.43, 2.3, 0];
const goal = [4.3, 2.3, 0];
const approaches = {
  below_sample: [1.43, 0, 0],
  beside_sample: [1.76, 2.3, 0],
  outside_reach: [2.86, 2.3, 0],
  behind_wall: [0.39, 2.3, 0],
};
const pos = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((coordinate, axis) => coordinate - b[axis]));
const picks = events => events.filter(event => event.type === "inventory_changed" && event.data.objectId === "sample");
const onLevel = (state, floor) => state.avatar.supportSurface === floor &&
  Math.abs(pos(state)[1] - (floor === "upper" ? sample[1] : 0)) < 0.06;
const fresh = state => state.outcome === "none" && !state.sample.collected && state.inventory.sample === 0;

export function checkSetup(state, id) {
  requireCheck(fresh(state) && distance(pos(state), approaches[id]) < 0.1 &&
    distance(state.sample.position, sample) < 0.06 && onLevel(state, id === "below_sample" ? "lower" : "upper"),
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
    onLevel(after, "upper") && distance(pos(after), sample) <= test.contract.constants.pickupRangeMeters,
  "One legal input did not collect the sample once.", "collect_sample");
  return transitions[0];
}

async function detour(test) {
  for (const waypoint of [[0.39, 1.16], [1.76, 1.16], [1.76, 0]]) await test.go(waypoint);
  requireCheck(distance(pos(await test.sample()), approaches.beside_sample) < 0.2 &&
    test.trace.some(state => pos(state)[0] > 0.98 && pos(state)[2] > 0.88 && onLevel(state, "upper")),
  "A native path around the wall did not reach the sample side.", "detour");
}

async function ascend(test) {
  for (const waypoint of [[-4.6, 0], [-4.6, -2.8], [-1.9, -2.8], [-1.9, 0], [0.39, 0]]) await test.go(waypoint);
  requireCheck(onLevel(await test.sample(), "upper") && test.trace.some(state => state.avatar.supportSurface === "ramp" &&
    pos(state)[1] > 0.2 && pos(state)[1] < sample[1] - 0.2),
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
    requireCheck(await test.page.locator("#world canvas").isVisible(), "WebGL viewport is missing.");
  },
  async probe(test) {
    const before = await test.sample();
    await test.move("d", state => pos(state)[0] - pos(before)[0] > 0.25, 1000);
    const after = await test.sample();
    const inputs = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(fresh(after) && before.attemptId === after.attemptId && after.tick > before.tick &&
      pos(after)[0] - pos(before)[0] > 0.2 &&
      ["keydown", "keyup"].every(type => inputs.some(i => i.type === type && i.code === "KeyD" && i.trusted)),
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
    const before = await test.capture("sample-present", "#world canvas");
    await collect(test);
    const after = await test.capture("sample-removed", "#world canvas");
    const counts = [before, after].map(marker);
    test.notes.sampleMarkerPixels = counts;
    requireCheck(counts[0] > 20 && counts[1] < 3 && await test.page.locator("#sample").innerText() === "Collected",
      "The visible sample or inventory label did not reflect the pickup.");
  },
  async collect_by_detour(test) {
    const motion = await test.move("d", state => pos(state)[0] > 1.16, 670);
    const stopped = motion.at(-1);
    await test.capture("wall-blocked-approach");
    requireCheck(pos(stopped)[0] > 0.54 && pos(stopped)[0] < 0.82 &&
      motion.every(state => onLevel(state, "upper") && fresh(state)), "The player penetrated the partition or did not approach it.");
    await test.go([0.39, 0]);
    await detour(test);
    await collect(test);
    await test.capture("picked-up-after-detour");
  },
  async empty_exit(test) {
    await ascend(test);
    await detour(test);
    await test.go([goal[0], goal[2]]);
    const final = await test.sample();
    await test.capture("exit-without-sample");
    requireCheck(distance(pos(final), goal) < 0.43 && fresh(final) && !picks(await test.events()).length,
      "An empty inventory reached victory or the required exit route was not observed.");
  },
  async finish(test) {
    const first = await test.sample();
    await ascend(test);
    await detour(test);
    const pickup = await collect(test);
    await test.capture("sample-collected");
    await test.go([goal[0], goal[2]]);
    const final = await test.sample();
    const events = await test.events();
    const win = events.find(e => e.type === "outcome_changed" && e.data.outcome === "victory");
    requireCheck(first.attemptId === 0 && final.attemptId === first.attemptId && final.outcome === "victory" &&
      final.inventory.sample === 1 && distance(pos(final), goal) < 0.43 && onLevel(final, "upper") && win &&
      win.sequence > pickup.sequence && !events.some(e => e.type === "scenario_loaded"),
    "The default route did not reach the exit after collecting the sample.", "enter_goal");
    await test.capture("victory");
  },
};
