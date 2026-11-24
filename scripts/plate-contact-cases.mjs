import { strict as assert } from "node:assert";
import { requireCheck } from "./browser-evaluation.mjs";

const within = ([x, , z], [px, , pz], half) => Math.max(Math.abs(x - px), Math.abs(z - pz)) <= half;

export function isPlateContact(event, id) {
  if (event.type !== "contact_changed") return false;
  const { plate, plateId, surfaceId, contactObject, objectId } = event.data;
  return [plate, plateId, surfaceId, contactObject, objectId].some(value => value === id || value === "plate_" + id);
}

const aEvents = events => events.filter(event => isPlateContact(event, "A"));

export function validateContactReplay(route, task) {
  const { plateA, plateHalfWidth, contactPush, plateSupport, maxStep, probe } = route;
  assert(Array.isArray(plateA) && plateA.length === 3 && plateA.every(Number.isFinite) &&
    plateHalfWidth > 0 && maxStep > 0 && typeof plateSupport === "string" && /^[wasd]$/.test(probe),
  "Atom replay must specify plate geometry, support, and a movement probe.");
  const { key, axis, direction, contactAt, alignedAt, pastPlate } = contactPush ?? {};
  assert(/^[wasd]$/.test(key) && [0, 2].includes(axis) && [-1, 1].includes(direction) &&
    [contactAt, alignedAt, pastPlate].every(Number.isFinite) &&
    contactAt * direction < pastPlate * direction && alignedAt * direction < pastPlate * direction,
  "Atom replay must specify a push direction and coordinates for contact, alignment, and departure.");
  if (task === "A01") {
    assert(typeof route.otherPlateSupport === "string" && route.otherPlateSupport !== plateSupport &&
      route.minVerticalGap > 0, "A01 replay requires an independent support and vertical gap.");
  } else {
    assert(route.nearMiss?.minGap > 0 && route.nearMiss.maxOffset > route.nearMiss.minGap,
      "A02 replay requires a measurable gap along the plate's side.");
  }
}

function pushTo(test, waypoint, budget) {
  const push = test.route.contactPush;
  return test.move(push.key, state => (state.box.position[push.axis] - push[waypoint]) * push.direction >= 0, budget);
}

async function pushAlongsidePlate(test, frameName) {
  const approach = await pushTo(test, "alignedAt", 2600);
  await test.capture(frameName);
  return [...approach, ...await pushTo(test, "pastPlate", 2600)];
}

export const contactCases = {
  async plate_contact(test) {
    const initial = await test.sample();
    const approach = await pushTo(test, "contactAt", 2000);
    await test.capture("contact");
    const motion = [...approach, ...await pushTo(test, "pastPlate", 2600)];
    await test.capture("release");
    const events = aEvents(await test.events());
    requireCheck(initial.box.supportSurface === test.route.plateSupport && !initial.plates.A.active &&
      events.length === 2 && events[0].data.active && !events[1].data.active &&
      events[0].tick < events[1].tick && !motion.at(-1).plates.A.active &&
      motion.some(state => state.plates.A.active &&
        within(state.box.position, test.route.plateA, test.route.plateHalfWidth)),
    "The box did not activate and release A through contact.");
    requireCheck(motion.every((state, i) => i === 0 ||
      state.box.supportSurface === test.route.plateSupport &&
      Math.hypot(state.box.position[0] - motion[i - 1].box.position[0],
        state.box.position[2] - motion[i - 1].box.position[2]) <=
        test.route.maxStep * (state.tick - motion[i - 1].tick) + 0.001),
    "The box lost support or jumped during the push.");
  },

  async wrong_height(test) {
    const motion = await pushAlongsidePlate(test, "different-height");
    requireCheck(motion.some(state => within(state.box.position, test.route.plateA, test.route.plateHalfWidth)) &&
      motion.every(state => state.box.position[1] - test.route.plateA[1] >= test.route.minVerticalGap &&
        state.box.supportSurface === test.route.otherPlateSupport),
    "The box did not pass over the projected area on the other level.");
    requireCheck(motion.every(state => !state.plates.A.active) && !aEvents(await test.events()).length,
      "The lower plate activated from a box on a different level.");
  },

  async no_contact_no_trigger(test) {
    const motion = await pushAlongsidePlate(test, "near-miss");
    const { plateA, contactPush: { axis }, plateHalfWidth, nearMiss } = test.route;
    const sideOffset = state => Math.abs(state.box.position[2 - axis] - plateA[2 - axis]);
    requireCheck(motion.some(state => Math.abs(state.box.position[axis] - plateA[axis]) < plateHalfWidth &&
      sideOffset(state) > nearMiss.minGap && sideOffset(state) < nearMiss.maxOffset),
    "The box did not pass close to A with a clear physical gap.");
    requireCheck(motion.every(state => state.box.position[1] === 0 &&
      sideOffset(state) > nearMiss.minGap && !state.plates.A.active) &&
      !aEvents(await test.events()).length, "The plate activated without physical contact.");
  },

  async plate_feedback(test) {
    const idle = await test.capture("plate-idle");
    await pushTo(test, "contactAt", 2000);
    requireCheck((await test.sample()).plates.A.active, "Plate A did not activate.");
    const active = await test.capture("plate-active");
    await pushTo(test, "pastPlate", 2600);
    requireCheck(!(await test.sample()).plates.A.active, "Plate A did not release.");
    const released = await test.capture("plate-released");
    const events = aEvents(await test.events());
    requireCheck(events.length === 2 && events[0].data.active && !events[1].data.active,
      "The feedback frames were not accompanied by contact and release events.");
    if (test.submission) {
      return { unverified: "Review the entry, contact, and release frames for the plate's visible state change." };
    }
    const counts = [idle, active, released].map(frame => test.gatePixels(frame.bytes, [94, 229, 164]));
    test.notes.platePixels = counts;
    requireCheck(counts[1] > 60 && counts[0] < counts[1] * 0.1 && counts[2] < counts[1] * 0.1,
    "The rendered plate did not distinguish contact and release.");
  },
};
