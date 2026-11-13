import { GATE_X, HOLD_TICKS, TOP } from "../references/p01/simulation.mjs";

export class CheckFailure extends Error {
  constructor(message, milestone) {
    super(message);
    this.milestone = milestone;
  }
}

export function requireCheck(condition, message, milestone) {
  if (!condition) throw new CheckFailure(message, milestone);
}

const hasDoorEvent = event => event.type === "door_state_changed" && event.data.unlocked;
const activatedB = event => event.type === "contact_changed" && event.data.plate === "B" && event.data.active;

async function standOnB(test) {
  await test.move("d", state => state.avatar.position[0] >= -0.77, 2200);
  requireCheck((await test.sample()).plates.B.active, "Player did not reach plate B.", "avatar_contacts_B");
}

async function waitForGate(test) {
  await test.until(state => state.door.passable, 4600, "Gate never became passable.", "door_unlocked");
}

async function passGate(test) {
  const movement = await test.move("d", state => state.avatar.position[0] > GATE_X + 0.5, 2200);
  const final = movement.at(-1);
  requireCheck(final.goalCrossed && final.avatar.position[0] > GATE_X + 0.4 &&
    final.avatar.position[1] >= TOP - 0.05, "Player could not cross the gate.", "cross_door");
  const before = movement[0];
  requireCheck(before.avatar.position[0] < GATE_X &&
    movement.every((state, i) => !i || Math.abs(state.avatar.position[0] - movement[i - 1].avatar.position[0]) <=
      0.061 * (state.tick - movement[i - 1].tick) + 0.001),
  "Crossing did not produce continuous movement.", "cross_door");
}

async function normalJourney(test, initial) {
  await test.move("d", state => state.box.position[0] >= -0.16, 2400);
  requireCheck((await test.sample()).plates.A.active, "Crate did not activate lower plate.", "box_contacts_A");
  await test.capture("crate-on-lower-plate");
  await test.move("a", state => state.avatar.position[0] <= -7.35, 3000);
  await test.move("s", state => state.avatar.position[2] >= 1.46, 1800);
  await test.move("d", state => state.avatar.position[0] >= -0.78, 3500);
  const onB = await test.sample();
  requireCheck(onB.avatar.position[1] >= TOP - 0.05 && onB.plates.B.active,
    "Player did not climb to upper plate B.", "avatar_contacts_B");
  await test.capture("upper-plate");
  await waitForGate(test);
  await test.capture("gate-open");
  await passGate(test);
  await test.capture("past-gate");
  await test.move("d", state => state.outcome === "victory", 1700);
  requireCheck((await test.sample()).outcome === "victory", "Exit did not produce victory.", "enter_goal");
  await test.capture("victory");

  const events = (await test.events()).filter(event => event.attemptId === initial.attemptId);
  const stages = [
    event => event.type === "contact_changed" && event.data.plate === "A" && event.data.active,
    activatedB, hasDoorEvent, event => event.type === "door_crossed",
    event => event.type === "outcome_changed" && event.data.outcome === "victory",
  ];
  let index = -1;
  for (const stage of stages) {
    index = events.findIndex((event, i) => i > index && stage(event));
    requireCheck(index >= 0, "A required journey event is missing or out of order.");
  }
  requireCheck(!(await test.events()).some(event => event.type === "scenario_loaded"),
    "Journey used scenario setup.");
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").isVisible(), "The 3D playfield is missing.");
  },
  async probe(test) {
    const before = await test.sample();
    await test.move("d", state => state.avatar.position[0] > before.avatar.position[0] + 0.15, 1500);
    const after = await test.sample();
    requireCheck(after.attemptId === before.attemptId && after.tick > before.tick &&
      after.avatar.position[0] > before.avatar.position[0] + 0.15,
    "Snapshot did not track movement and the simulation clock.");
    const input = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(input.some(event => event.type === "keydown" && event.code === "KeyD" && event.trusted) &&
      input.some(event => event.type === "keyup" && event.code === "KeyD" && event.trusted),
    "Browser movement input did not arrive as trusted key events.");
  },
  async single_plate(test) {
    const before = await test.sample();
    await test.until(state => state.tick >= before.tick + 150, 4500, "Simulation did not advance 150 ticks.");
    const after = await test.sample();
    requireCheck(after.plates.A.active && !after.plates.B.active && !after.door.unlocked &&
      !after.door.passable && !(await test.events()).some(hasDoorEvent),
    "A single active plate opened the gate.");
  },
  async release_before_threshold(test) {
    await standOnB(test);
    const start = (await test.sample()).dualActiveSinceTick;
    await test.until(state => state.tick >= start + 50, 2500, "First hold did not reach its test duration.");
    await test.move("a", state => !state.plates.B.active, 1300);
    const off = await test.sample();
    requireCheck(!off.plates.B.active && off.tick < start + HOLD_TICKS && off.dualActiveSinceTick === null,
      "Leaving B early did not cancel the accumulated hold.");
    await standOnB(test);
    await waitForGate(test);
    const events = await test.events();
    const onsets = events.filter(activatedB);
    const opened = events.find(hasDoorEvent);
    requireCheck(onsets.length === 2 && opened?.tick === onsets[1].tick + HOLD_TICKS,
      "The second hold did not need the full threshold.");
  },
  async unlock_at_threshold(test) {
    await standOnB(test);
    await waitForGate(test);
    const events = await test.events();
    const onset = events.find(activatedB);
    const opened = events.find(hasDoorEvent);
    const passable = events.find(event => event.type === "door_state_changed" && event.data.passable);
    requireCheck(onset && opened?.tick === onset.tick + HOLD_TICKS &&
      passable?.tick >= opened.tick && passable.tick <= opened.tick + 30,
    "Unlock or passability occurred outside the contract timing.");
    await test.move("a", state => !state.plates.B.active, 1400);
    const final = await test.sample();
    requireCheck(!final.plates.B.active && final.door.unlocked && final.door.passable,
      "Leaving B re-locked an already opened gate.");
  },
  async closed_collision(test) {
    const motion = await test.move("d", () => false, 950);
    const final = motion.at(-1);
    await test.capture("blocked-by-closed-gate");
    requireCheck(final.avatar.position[0] > motion[0].avatar.position[0] + 0.2 &&
      motion.every(state => state.avatar.position[0] < GATE_X && !state.door.passable && !state.goalCrossed),
    "The locked gate did not physically block an approach.");
  },
  async open_collision(test) {
    await standOnB(test);
    await waitForGate(test);
    await test.capture("before-crossing");
    try {
      await passGate(test);
    } finally {
      await test.capture("after-crossing-attempt");
    }
  },
  async door_feedback(test) {
    const closed = await test.capture("closed-gate");
    await standOnB(test);
    await waitForGate(test);
    const open = await test.capture("open-gate");
    const playerView = await test.page.locator("#gate").innerText();
    const pixels = { closed: test.gatePixels(closed.bytes), open: test.gatePixels(open.bytes) };
    test.notes.pixels = pixels;
    requireCheck(pixels.closed > 80 && pixels.open < pixels.closed * 0.1 && playerView === "Open",
      "The passability event did not remove the gate panel and update the on-screen label.");
  },
  async finish(test) {
    await normalJourney(test, await test.sample());
  },
  async recover_and_finish(test) {
    const initial = await test.sample();
    await test.move("w", state => state.outcome === "failure", 2300);
    requireCheck((await test.sample()).outcome === "failure", "A fall did not trigger failure.", "fall");
    test.shared.failure = await test.capture("failure", "#status");
    await test.page.keyboard.press("r");
    const restarted = await test.until(state => state.attemptId === initial.attemptId + 1, 1400,
      "R did not start a new attempt.", "restart");
    test.shared.restart = await test.capture("restart", "#status");
    requireCheck(restarted.outcome === "none" && !restarted.goalCrossed &&
      !restarted.plates.A.active && !restarted.plates.B.active && !restarted.door.unlocked &&
      !restarted.door.passable && restarted.dualActiveSinceTick === null && restarted.tick < 30 &&
      restarted.box.position.every((value, i) => value === initial.box.position[i]) &&
      restarted.avatar.position.every((value, i) => value === initial.avatar.position[i]),
    "Retry did not reset the attempt and gameplay state.", "restart");
    await normalJourney(test, restarted);
    test.shared.victory = await test.capture("victory-hud", "#status");
  },
  async terminal_feedback(test) {
    const { failure, restart, victory } = test.shared;
    if (!failure || !restart || !victory) return { unverified: "Recovery replay did not supply all three terminal frames." };
    const labels = [failure, restart, victory].map(frame => frame.label);
    test.notes.labels = labels;
    requireCheck(labels[0] === "Fall detected. Press R to retry." &&
      labels[1] === "In progress" && labels[2] === "Exit reached" &&
      new Set([failure.digest, restart.digest, victory.digest]).size === 3,
    "The rendered HUD did not distinguish failure, retry and victory.");
    return { refs: [failure.id, restart.id, victory.id] };
  },
};
