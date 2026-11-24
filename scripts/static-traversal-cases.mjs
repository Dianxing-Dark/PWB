import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const position = state => state.avatar.position;
const y = state => position(state)[1];
const surface = state => state.avatar.supportSurface;
export const primaryReplay = {
  tolerance: 0.075,
  probe: "d",
  surfaces: { lower: "lower", slope: "slope", upper: "upper" },
  lowerHeight: 0,
  upperHeight: 2.4,
  scenarioHeights: { slope_start: 0, slope_mid: 2.05 * 2.4 / 3.3, upper_drop: 2.4, lower_reverse: 0 },
  climb: { key: "d", target: 1.78, maxRisePerTick: 0.045 },
  slopeFall: { key: "s", target: 1.31, continueKey: "a" },
  upperDrop: { key: "d", target: 1.85, continueKey: "a" },
  reverse: { key: "a", target: 1.45, start: 0.4 },
};
const scenarioFloor = { slope_start: "lower", slope_mid: "slope", upper_drop: "upper", lower_reverse: "lower" };
const directions = { d: [0, 1], a: [0, -1], s: [2, 1], w: [2, -1] };
function progress(state, key) {
  const [axis, sign] = directions[key];
  return position(state)[axis] * sign;
}

export function checkSetup(state, scenario, route) {
  requireCheck(state.outcome === "none" && surface(state) === route.surfaces[scenarioFloor[scenario]] &&
    Math.abs(y(state) - route.scenarioHeights[scenario]) < 0.06,
    "The local scenario is missing its intended supporting surface.");
}

function transitions(events, before, after) {
  return events.some(event => event.type === "contact_changed" && event.data.actorId === "avatar" &&
    event.data.previous === before && event.data.objectId === after);
}

async function climb(test) {
  const { lowerHeight, upperHeight, surfaces, climb: { key, target, maxRisePerTick } } = test.route;
  const motion = await test.move(key, state => progress(state, key) > target && surface(state) === surfaces.upper, 3400);
  const final = motion.at(-1);
  const slope = motion.filter(state => surface(state) === surfaces.slope);
  const rise = upperHeight - lowerHeight;
  const atFraction = (lo, hi) => slope.some(state => y(state) > lowerHeight + rise * lo && y(state) < lowerHeight + rise * hi);
  const continuous = motion.slice(1).every((state, i) => {
    const prior = motion[i];
    const ticks = state.tick - prior.tick;
    return ticks >= 0 && y(state) >= y(prior) - 0.001 && y(state) - y(prior) <= maxRisePerTick * ticks + 0.001;
  });
  const events = await test.events();
  requireCheck(Math.abs(y(motion[0]) - lowerHeight) < 0.05 && surface(final) === surfaces.upper &&
    Math.abs(y(final) - upperHeight) < 0.05 && atFraction(0.14, 0.42) && atFraction(0.58, 0.9) &&
    continuous && motion.every(state => state.outcome === "none") &&
    transitions(events, surfaces.lower, surfaces.slope) && transitions(events, surfaces.slope, surfaces.upper),
  "The player did not advance over continuous ramp heights and onto the upper deck.", "ascend");
  await test.capture("top");
}

async function land(test, before, { key, target, continueKey }) {
  const { lowerHeight, surfaces } = test.route;
  const start = await test.sample();
  const motion = await test.move(key, state => progress(state, key) >= target && surface(state) === surfaces.lower, 1600);
  const final = motion.at(-1);
  const falling = motion.filter(state => surface(state) === null);
  const events = await test.events();
  const height = y(start) - lowerHeight;
  requireCheck(surface(start) === surfaces[before] && height > 0.1 && Math.abs(y(final) - lowerHeight) < 0.05 &&
    surface(final) === surfaces.lower && progress(final, key) >= target - 0.04 &&
    falling.some(state => y(state) < y(start) - height * 0.13 && y(state) > lowerHeight + height * 0.13) &&
    transitions(events, surfaces[before], null) && transitions(events, null, surfaces.lower) &&
    motion.every(state => state.outcome === "none"), "The trajectory did not leave support and land on the lower deck.", "land_lower");
  const continued = await test.move(continueKey, state => progress(state, continueKey) >= progress(final, continueKey) + 0.25, 760);
  requireCheck(continued.every(state => surface(state) === surfaces.lower && state.outcome === "none") &&
    progress(continued.at(-1), continueKey) > progress(final, continueKey) + 0.2,
  "Lower deck did not remain playable after landing.");
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
  if (test.submission) {
    await test.capture("before");
    await action(test);
    await test.capture("after");
    return { unverified: "Review both frames for the visible change of height and support." };
  }
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
    requireCheck(await test.page.locator(test.route.viewportSelector ?? (test.submission ? "canvas" : "#world canvas")).first().isVisible(), "WebGL viewport missing.");
  },
  async probe(test) {
    const first = await test.sample();
    const key = test.route.probe;
    await test.move(key, state => progress(state, key) > progress(first, key) + 0.25, 800);
    const final = await test.sample();
    const received = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(final.tick > first.tick && final.attemptId === first.attemptId &&
      progress(final, key) > progress(first, key) + 0.2 &&
      ["keydown", "keyup"].every(type => received.some(e => e.type === type && e.code === "Key" + key.toUpperCase() && e.trusted)),
    "The browser input did not move the player in the running simulation.");
  },
  climb_continuously: climb,
  fall_to_lower: test => land(test, "slope", test.route.slopeFall),
  slope_feedback: test => checkVisual(test, climb, -1, "Lower deck", "Upper deck"),
  drop_and_land: test => land(test, "upper", test.route.upperDrop),
  async reject_reverse(test) {
    const { lowerHeight, surfaces, reverse: { key, target, start } } = test.route;
    const motion = await test.move(key, state => progress(state, key) > target, 1700);
    const final = motion.at(-1);
    await test.capture("under-ledge");
    requireCheck(progress(motion[0], key) < -start && progress(final, key) > target - 0.11 &&
      motion.every(state => surface(state) === surfaces.lower && Math.abs(y(state) - lowerHeight) < 0.05 && state.outcome === "none") &&
      !(await test.events()).some(event => event.type === "contact_changed" && event.data.objectId === surfaces.upper),
    "Reverse walking did not stay on the low deck below the ledge.");
  },
  ledge_feedback: test => checkVisual(test, run => land(run, "upper", run.route.upperDrop), 1, "Upper deck", "Lower deck"),
};
