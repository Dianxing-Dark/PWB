import { requireCheck } from "./browser-evaluation.mjs";

const within = ([x, , z], [px, , pz], half) => Math.max(Math.abs(x - px), Math.abs(z - pz)) <= half;
const aEvents = events => events.filter(event => event.type === "contact_changed" && event.data.plate === "A");

async function pushPastPlate(test) {
  return test.move("d", state => state.box.position[0] >= 0.85, 2600);
}

async function pushAlongsidePlate(test, frameName) {
  const approach = await test.move("d", state => state.box.position[0] >= -0.14, 2600);
  await test.capture(frameName);
  return [...approach, ...await pushPastPlate(test)];
}

export const contactCases = {
  async plate_contact(test) {
    const initial = await test.sample();
    const approach = await test.move("d", state => state.box.position[0] >= -0.21, 2000);
    await test.capture("contact");
    const motion = [...approach, ...await pushPastPlate(test)];
    await test.capture("release");
    const events = aEvents(await test.events());
    requireCheck(initial.box.supportSurface === test.route.plateSupport && !initial.plates.A.active &&
      events.length === 2 && events[0].data.active && !events[1].data.active &&
      events[0].tick < events[1].tick && !motion.at(-1).plates.A.active &&
      motion.some(state => state.plates.A.active && within(state.box.position, test.route.plateA, 0.34)),
    "The box did not activate and release A through contact.");
    requireCheck(motion.every((state, i) => i === 0 ||
      state.box.supportSurface === test.route.plateSupport &&
      Math.abs(state.box.position[0] - motion[i - 1].box.position[0]) <= 0.061 * (state.tick - motion[i - 1].tick) + 0.001),
    "The box lost support or jumped during the push.");
  },

  async wrong_height(test) {
    const motion = await pushAlongsidePlate(test, "different-height");
    requireCheck(motion.some(state => within(state.box.position, test.route.plateA, 0.34)) &&
      motion.every(state => state.box.position[1] - test.route.plateA[1] >= 0.25 && state.box.supportSurface === "upper"),
    "The box did not pass over the projected area on the other level.");
    requireCheck(motion.every(state => !state.plates.A.active) && !aEvents(await test.events()).length,
      "The lower plate activated from a box on a different level.");
  },

  async no_contact_no_trigger(test) {
    const motion = await pushAlongsidePlate(test, "near-miss");
    const [px, , pz] = test.route.plateA;
    requireCheck(motion.some(state => Math.abs(state.box.position[0] - px) < 0.18 &&
      Math.abs(state.box.position[2] - pz) > 0.64 && Math.abs(state.box.position[2] - pz) < 0.8),
    "The box did not pass close to A with a clear physical gap.");
    requireCheck(motion.every(state => state.box.position[1] === 0 &&
      Math.abs(state.box.position[2] - pz) > 0.64 && !state.plates.A.active) &&
      !aEvents(await test.events()).length, "The plate activated without physical contact.");
  },

  async plate_feedback(test) {
    const idle = await test.capture("plate-idle");
    await test.move("d", state => state.box.position[0] >= -0.21, 2000);
    requireCheck((await test.sample()).plates.A.active, "Plate A did not activate.");
    const active = await test.capture("plate-active");
    await pushPastPlate(test);
    requireCheck(!(await test.sample()).plates.A.active, "Plate A did not release.");
    const released = await test.capture("plate-released");
    const counts = [idle, active, released].map(frame => test.gatePixels(frame.bytes, [94, 229, 164]));
    test.notes.platePixels = counts;
    const events = aEvents(await test.events());
    requireCheck(events.length === 2 && events[0].data.active && !events[1].data.active &&
      counts[1] > 60 && counts[0] < counts[1] * 0.1 && counts[2] < counts[1] * 0.1,
    "The rendered plate did not distinguish contact and release.");
  },
};
