import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const position = state => state.avatar.position;
const y = state => position(state)[1];
const surface = state => state.avatar.supportSurface;
const conditions = {
  slope_start: { floor: "lower", height: 0 },
  slope_mid: { floor: "slope", height: 2.05 * 2.4 / 3.3 },
  upper_drop: { floor: "upper", height: 2.4 },
  lower_reverse: { floor: "lower", height: 0 },
};
export function checkSetup(state, scenario) {
  const { floor, height } = conditions[scenario];
  requireCheck(state.outcome === "none" && surface(state) === floor && Math.abs(y(state) - height) < 0.06,
    "The local scenario is missing its intended supporting surface.");
}

function transitions(events, before, after) {
  return events.some(event => event.type === "contact_changed" && event.data.actorId === "avatar" &&
    event.data.previous === before && event.data.objectId === after);
}

async function climb(test) {
  const motion = await test.move("d", state => position(state)[0] > 1.78 && surface(state) === "upper", 3400);
  const final = motion.at(-1);
  const slope = motion.filter(state => surface(state) === "slope");
  const continuous = motion.slice(1).every((state, i) => {
    const prior = motion[i];
    const ticks = state.tick - prior.tick;
    return ticks >= 0 && y(state) >= y(prior) - 0.001 && y(state) - y(prior) <= 0.045 * ticks + 0.001;
  });
  const events = await test.events();
  requireCheck(y(motion[0]) === 0 && surface(final) === "upper" && Math.abs(y(final) - 2.4) < 0.05 &&
    slope.some(s => y(s) > 0.35 && y(s) < 1) && slope.some(s => y(s) > 1.4 && y(s) < 2.15) &&
    continuous && motion.every(state => state.outcome === "none") &&
    transitions(events, "lower", "slope") && transitions(events, "slope", "upper"),
  "The player did not advance over continuous ramp heights and onto the upper deck.", "ascend");
  await test.capture("top");
}

async function land(test, key, before, axis, target) {
  const start = await test.sample();
  const motion = await test.move(key, state => position(state)[axis] >= target && surface(state) === "lower", 1600);
  const final = motion.at(-1);
  const falling = motion.filter(state => surface(state) === null);
  const events = await test.events();
  requireCheck(surface(start) === before && y(start) > 1 && y(final) === 0 && surface(final) === "lower" &&
    position(final)[axis] >= target - 0.04 && falling.some(state => y(state) < y(start) - 0.23 && y(state) > 0.22) &&
    transitions(events, before, null) && transitions(events, null, "lower") &&
    motion.every(state => state.outcome === "none"), "The trajectory did not leave support and land on the lower deck.", "land_lower");
  const continued = await test.move("a", state => position(state)[0] <= position(final)[0] - 0.25, 760);
  requireCheck(continued.every(state => surface(state) === "lower" && state.outcome === "none") &&
    position(continued.at(-1))[0] < position(final)[0] - 0.2, "Lower deck did not remain playable after landing.");
  await test.capture("landed");
}

function markerY(frame) {
  const { data, width } = PNG.sync.read(frame.bytes);
  let count = 0;
  let pixelsY = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (![96, 226, 255].every((c, axis) => Math.abs(c - data[i + axis]) < 14)) continue;
    count++;
    pixelsY += Math.floor(i / 4 / width);
  }
  requireCheck(count > 30, "The avatar marker is missing from the rendered viewport.");
  return pixelsY / count;
}

async function checkVisual(test, action, difference, from, to) {
  const before = await test.capture("before", "#world canvas");
  const initial = await test.page.locator("#surface").innerText();
  await action(test);
  const after = await test.capture("after", "#world canvas");
  const shift = markerY(after) - markerY(before);
  test.notes.avatarVerticalPixelShift = shift;
  requireCheck(initial === from && await test.page.locator("#surface").innerText() === to && shift * difference > 40,
    "Rendered avatar did not move vertically with the traversed surfaces.");
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("#world canvas").isVisible(), "WebGL viewport missing.");
  },
  async probe(test) {
    const first = await test.sample();
    await test.move("d", state => position(state)[0] > position(first)[0] + 0.25, 800);
    const final = await test.sample();
    const received = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(final.tick > first.tick && final.attemptId === first.attemptId &&
      position(final)[0] > position(first)[0] + 0.2 &&
      ["keydown", "keyup"].every(type => received.some(e => e.type === type && e.code === "KeyD" && e.trusted)),
    "The browser input did not move the player in the running simulation.");
  },
  climb_continuously: climb,
  fall_to_lower: test => land(test, "s", "slope", 2, 1.31),
  slope_feedback: test => checkVisual(test, climb, -1, "Lower deck", "Upper deck"),
  drop_and_land: test => land(test, "d", "upper", 0, 1.85),
  async reject_reverse(test) {
    const motion = await test.move("a", state => position(state)[0] < -1.45, 1700);
    const final = motion.at(-1);
    await test.capture("under-ledge");
    requireCheck(position(motion[0])[0] > 0.4 && position(final)[0] < -1.34 &&
      motion.every(state => surface(state) === "lower" && y(state) === 0 && state.outcome === "none") &&
      !(await test.events()).some(event => event.type === "contact_changed" && event.data.objectId === "upper"),
    "Reverse walking did not stay on the low deck below the ledge.");
  },
  ledge_feedback: test => checkVisual(test, run => land(run, "d", "upper", 0, 1.85), 1, "Upper deck", "Lower deck"),
};
