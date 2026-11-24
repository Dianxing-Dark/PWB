import { requireCheck } from "./browser-evaluation.mjs";
import { isPlateContact } from "./plate-contact-cases.mjs";

const hasDoorEvent = event => event.type === "door_state_changed" && event.data.unlocked;
const plateActivated = (event, id) => isPlateContact(event, id) && event.data.active === true;
const activatedB = event => plateActivated(event, "B");

async function standOnB(test) {
  await test.go(test.route.plate);
  requireCheck((await test.sample()).plates.B.active, "Player did not reach plate B.", "avatar_contacts_B");
}

async function waitForGate(test) {
  await test.until(state => state.door.passable, 4600, "Gate never became passable.", "door_unlocked");
}

function pastGate(test, state) {
  const { axis, position, direction } = test.route.gatePlane;
  return (state.avatar.position[axis] - position) * direction > 0;
}

async function passGate(test) {
  await test.go(test.route.gateBefore);
  const movement = await test.go(test.route.gateAfter);
  const final = movement.at(-1);
  requireCheck(pastGate(test, final) &&
    final.avatar.position[1] >= test.route.upperHeight - 0.06, "Player could not cross the gate.", "cross_door");
  requireCheck(!pastGate(test, movement[0]) && movement.every((state, i) => {
    if (!i) return true;
    const previous = movement[i - 1];
    const distance = Math.hypot(...state.avatar.position.map((value, axis) => value - previous.avatar.position[axis]));
    return distance <= test.route.maxStep * (state.tick - previous.tick) + 0.001;
  }), "Crossing did not produce continuous movement.", "cross_door");
}

async function normalJourney(test, initial) {
  const { pushKey, crateTarget, rampWaypoints, upperHeight, exit } = test.route;
  await test.move(pushKey, state => (state.box.position[crateTarget.axis] - crateTarget.value) *
    crateTarget.direction >= 0, 4200);
  requireCheck((await test.sample()).plates.A.active, "Crate did not activate lower plate.", "box_contacts_A");
  await test.capture("crate-on-lower-plate");
  for (const waypoint of rampWaypoints) await test.go(waypoint);
  await standOnB(test);
  const onB = await test.sample();
  if (test.contract.dimension === "2D") {
    requireCheck(test.trace.every(state => state.avatar.position[1] === 0 && state.box.position[1] === 0),
      "Player or crate left the XZ plane.", "avatar_contacts_B");
  } else {
    requireCheck(onB.avatar.position[1] >= upperHeight - 0.06 &&
      onB.avatar.position[1] - onB.box.position[1] >= 0.25,
    "Player and crate did not activate plates at distinct elevations.", "avatar_contacts_B");
  }
  await test.capture("upper-plate");
  await waitForGate(test);
  await test.capture("gate-open");
  await passGate(test);
  await test.capture("past-gate");
  await test.go(exit);
  const final = await test.until(state => state.outcome === "victory", 1000, "Exit did not produce victory.", "enter_goal");
  requireCheck(final.goalCrossed && pastGate(test, final), "Victory did not include reaching the exit beyond the gate.", "enter_goal");
  await test.capture("victory");

  const events = (await test.events()).filter(event => event.attemptId === initial.attemptId);
  const a = events.find(event => plateActivated(event, "A"));
  const b = events.find(event => plateActivated(event, "B") && event.sequence > (a?.sequence ?? Infinity));
  const unlock = events.find(event => hasDoorEvent(event) && event.sequence > (b?.sequence ?? Infinity));
  const victory = events.find(event => event.type === "outcome_changed" && event.data.outcome === "victory");
  const crossed = test.trace.find(state => state.attemptId === initial.attemptId &&
    state.tick >= unlock?.tick && pastGate(test, state));
  requireCheck(a && b && unlock && crossed && victory && unlock.tick <= crossed.tick && crossed.tick <= victory.tick,
    "A required journey milestone is missing or out of order.");
  requireCheck(!(await test.events()).some(event => event.type === "scenario_loaded"),
    "Journey used scenario setup.");
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator("canvas").isVisible(), "The playable canvas is missing.");
  },
  async probe(test) {
    const before = await test.sample();
    const moved = state => Math.hypot(...state.avatar.position.map((value, i) => value - before.avatar.position[i])) > 0.15;
    await test.move(test.route.probe, moved, 1500);
    const after = await test.sample();
    requireCheck(after.attemptId === before.attemptId && after.tick > before.tick &&
      moved(after),
    "Snapshot did not track movement and the simulation clock.");
    const input = await test.page.evaluate(() => window.__benchmarkInput);
    const code = "Key" + test.route.probe.toUpperCase();
    requireCheck(input.some(event => event.type === "keydown" && event.code === code && event.trusted) &&
      input.some(event => event.type === "keyup" && event.code === code && event.trusted),
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
    await test.go(test.route.release);
    const off = await test.sample();
    requireCheck(!off.plates.B.active && off.tick < start + test.contract.constants.bothActiveTicks && off.dualActiveSinceTick === null,
      "Leaving B early did not cancel the accumulated hold.");
    await standOnB(test);
    await waitForGate(test);
    const events = await test.events();
    const onsets = events.filter(activatedB);
    const opened = events.find(hasDoorEvent);
    requireCheck(onsets.length === 2 && opened?.tick === onsets[1].tick + test.contract.constants.bothActiveTicks,
      "The second hold did not need the full threshold.");
  },
  async unlock_at_threshold(test) {
    await standOnB(test);
    await waitForGate(test);
    const events = await test.events();
    const onset = events.find(activatedB);
    const opened = events.find(hasDoorEvent);
    const passable = events.find(event => event.type === "door_state_changed" && event.data.passable);
    requireCheck(onset && opened?.tick === onset.tick + test.contract.constants.bothActiveTicks &&
      passable?.tick >= opened.tick && passable.tick <= opened.tick + test.contract.constants.maxOpeningTicks,
    "Unlock or passability occurred outside the contract timing.");
    await test.go(test.route.release);
    const final = await test.sample();
    requireCheck(!final.plates.B.active && final.door.unlocked && final.door.passable,
      "Leaving B re-locked an already opened gate.");
  },
  async closed_collision(test) {
    const motion = await test.go(test.route.gateAfter, 1100);
    const final = motion.at(-1);
    await test.capture("blocked-by-closed-gate");
    requireCheck(Math.hypot(...final.avatar.position.map((value, i) => value - motion[0].avatar.position[i])) > 0.2 &&
      motion.every(state => !pastGate(test, state) && !state.door.passable && !state.goalCrossed),
    "The locked gate did not physically block an approach.");
  },
  async no_victory_below_exit(test) {
    const { exit, lowerExitWaypoints, tolerance, upperHeight } = test.route;
    if (!lowerExitWaypoints?.length) {
      return { unverified: "Register a reachable lower-floor approach to the exit projection for this layout." };
    }

    for (const waypoint of lowerExitWaypoints) {
      const motion = await test.go(waypoint);
      if (motion.some(state => state.outcome === "victory" &&
          (!state.door.unlocked || !state.goalCrossed || state.avatar.position[1] < upperHeight - 0.1))) {
        await test.capture("victory-without-required-crossing");
        requireCheck(false, "Victory occurred without the required open gate and upper-floor crossing.", "enter_goal");
      }
    }
    const final = await test.sample();
    const [x, y, z] = final.avatar.position;
    const [startX, startY, startZ] = test.trace[0].avatar.position;
    const reached = Math.hypot(x - exit[0], z - exit[1]) <= tolerance * 1.5 && y < upperHeight - 0.2;
    const fellTowardExit = test.route.lowerExitOutcome === "failure" && final.outcome === "failure" &&
      y < startY - 0.2 && Math.hypot(x - exit[0], z - exit[1]) < Math.hypot(startX - exit[0], startZ - exit[1]);
    const approach = test.trace.every(state => !state.door.unlocked && !state.goalCrossed && state.outcome !== "victory");
    await test.capture(fellTowardExit ? "fell-on-lower-approach" : "beneath-exit");
    if (!(approach && (reached && final.outcome === "none" || fellTowardExit))) {
      return { unverified: "The reviewed lower approach did not reach the exit projection or its registered fall boundary." };
    }
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
    const unlocked = (await test.events()).find(hasDoorEvent);
    await test.capture("open-gate");
    if (unlocked) {
      const settledTick = unlocked.tick + test.contract.constants.maxOpeningTicks;
      await test.until(state => state.tick >= settledTick, 1600, "The opening animation window did not elapse.");
    }
    const open = await test.capture("open-gate-settled");
    await test.go(test.route.gateBefore);
    const motion = await test.go(test.route.gateAfter);
    await test.capture(pastGate(test, motion.at(-1)) ? "after-crossing" : "crossing-attempt");
    const feedback = test.route.feedback;
    if (!feedback?.gateLabel || !feedback.gateColor) {
      return { unverified: "Review the gate before opening, at passability, after its animation, and during traversal." };
    }
    const playerView = await test.page.locator(feedback.gateLabel).filter({ visible: true }).first().textContent({ timeout: 1500 });
    const pixels = { closed: test.gatePixels(closed.bytes, feedback.gateColor),
      open: test.gatePixels(open.bytes, feedback.gateColor) };
    test.notes.pixels = pixels;
    requireCheck(pixels.closed > 80 && pixels.open < pixels.closed * 0.1 && playerView === feedback.open,
      "The passability event did not remove the gate panel and update the on-screen label.");
  },
  async finish(test) {
    await normalJourney(test, await test.sample());
  },
  async recover_and_finish(test) {
    const initial = await test.sample();
    await test.go(test.route.fall, 3300);
    await test.until(state => state.outcome === "failure", 1400, "A fall did not trigger failure.", "fall");
    requireCheck((await test.sample()).outcome === "failure", "A fall did not trigger failure.", "fall");
    test.shared.failure = await test.capture("failure", test.route.feedback?.statusLabel);
    await test.page.keyboard.press("r");
    const restarted = await test.until(state => state.attemptId === initial.attemptId + 1, 1400,
      "R did not start a new attempt.", "restart");
    test.shared.restart = await test.capture("restart", test.route.feedback?.statusLabel);
    requireCheck(restarted.outcome === "none" && !restarted.goalCrossed &&
      !restarted.plates.A.active && !restarted.plates.B.active && !restarted.door.unlocked &&
      !restarted.door.passable && restarted.dualActiveSinceTick === null && restarted.tick < 30 &&
      restarted.box.position.every((value, i) => value === initial.box.position[i]) &&
      restarted.avatar.position.every((value, i) => value === initial.avatar.position[i]),
    "Retry did not reset the attempt and gameplay state.", "restart");
    await normalJourney(test, restarted);
    test.shared.victory = await test.capture("victory-hud", test.route.feedback?.statusLabel);
  },
  async terminal_feedback(test) {
    const { failure, restart, victory } = test.shared;
    if (!failure || !restart || !victory) return { unverified: "Recovery replay did not supply all three terminal frames." };
    const refs = [failure.id, restart.id, victory.id];
    const expected = test.route.feedback?.outcomes;
    if (!expected) return { refs, unverified: "Inspect the failure, restart and victory frames for terminal feedback." };
    const labels = [failure, restart, victory].map(frame => frame.label);
    test.notes.labels = labels;
    requireCheck(labels.every((label, index) => label === expected[index]) &&
      new Set([failure.digest, restart.digest, victory.digest]).size === 3,
    "The rendered HUD did not distinguish failure, retry and victory.");
    return { refs };
  },
};
