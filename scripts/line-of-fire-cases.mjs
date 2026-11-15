import { PNG } from "pngjs";
import { requireCheck } from "./browser-evaluation.mjs";

const pos = state => state.avatar.position;
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const ground = ([x, , z]) => [x, z];
const closeTo = (state, point, radius = 0.12) => distance(pos(state), point) <= radius;
const shotEvents = (events, attemptId) => events.filter(e => e.attemptId === attemptId && e.type === "shot_resolved");
const outcomeEvent = (events, attemptId, outcome, cause) => events.find(e => e.attemptId === attemptId &&
  e.type === "outcome_changed" && e.data.outcome === outcome && e.data.cause === cause);

export const primaryReplay = {
  tolerance: 0.07,
  cover: [[-0.12, 0.12], [0, 1.85], [-0.88, 0.88]],
  start: [-2.55, 0, 0],
  exit: [4.5, 0, -1.56],
  exitRadius: 0.45,
  sides: { lower: "lower", upper: "upper" },
  poses: {
    low_cover: [-1.6, 0, 0],
    upper_exposed: [-1.6, 2.25, 0],
    side_exposed: [-1.6, 0, 2.05],
    blocked_shot: [-3.2, 0, 0],
    elevated_shot: [-1.55, 2.25, 0],
    worker_unsecured: [3.1, 0, 0.06],
  },
  upperPath: [[-4.55, 0], [-1.55, 0]],
  lowerPath: [[-4.55, 0], [-4.55, -1.56]],
  openSide: [-2.55, 2.05],
  cutOff: [-1.4, 0],
  detour: [[-1.4, -1.56], [2.86, -1.56]],
  worker: [2.86, 0.06],
};

export function checkSetup(state, id, route) {
  const floor = ["upper_exposed", "elevated_shot"].includes(id) ? "upper" : "lower";
  const ready = id.endsWith("_shot") ? state.target.disabled === false : state.emitter.active === true;
  const workerInReach = id !== "worker_unsecured" || (!state.worker.rescued &&
    distance(pos(state), state.worker.position) < 0.6);
  requireCheck(state.outcome === "none" && ready && workerInReach && closeTo(state, route.poses[id]) &&
    state.avatar.supportSurface === route.sides[floor], "Local setup did not establish the registered firing or rescue condition.");
}

async function press(test, key) {
  const before = await test.sample();
  await test.page.keyboard.press(key);
  return test.until(s => s.tick > before.tick || s.attemptId !== before.attemptId || s.outcome !== before.outcome,
    1200, "Simulation did not respond after " + key + ".");
}

function hitCover(impact, cover) {
  return cover.every(([min, max], axis) => impact[axis] >= min - 0.06 && impact[axis] <= max + 0.06) &&
    cover.some(([min, max], axis) => Math.min(Math.abs(impact[axis] - min), Math.abs(impact[axis] - max)) < 0.06);
}

async function pulse(test, expected) {
  const first = await test.sample();
  const period = test.contract.constants.pulsePeriodTicks;
  const previous = shotEvents(await test.events(), first.attemptId).at(-1);
  const next = first.tick - first.tick % period + period;
  const after = await test.until(s => s.tick >= next || s.outcome === "failure", 2400,
    "The next pulse was never reached.", expected);
  const log = await test.events();
  const shot = shotEvents(log, first.attemptId).find(e => e.tick > (previous?.tick ?? 0));
  requireCheck(shot?.tick === next && shot.data.source === "emitter" &&
    distance(shot.data.from, first.emitter.position) < 0.08 && shot.data.hit === expected,
  "The scheduled pulse hit the wrong object or was absent.", expected);
  if (expected === "cover") {
    requireCheck(hitCover(shot.data.impact, test.route.cover) && after.outcome === "none",
      "The pulse did not stop at the barrier surface while keeping the player safe.", expected);
  } else {
    const failure = outcomeEvent(log, first.attemptId, "failure", "pulse");
    requireCheck(distance(shot.data.impact, pos(after)) < 1.2 && after.outcome === "failure" &&
      failure?.tick === shot.tick && failure.sequence > shot.sequence,
    "The exposed player was not hit and failed in the shot's simulation step.", expected);
  }
  return shot;
}

async function playerShot(test, expected) {
  const first = await test.sample();
  const oldShots = shotEvents(await test.events(), first.attemptId);
  await press(test, "Space");
  const after = await test.sample();
  const log = await test.events();
  const shots = shotEvents(log, first.attemptId);
  const shot = shots.at(-1);
  const targets = log.filter(e => e.attemptId === first.attemptId && e.type === "target_changed");
  requireCheck(shots.length === oldShots.length + 1 && shot?.data.source === "avatar" && shot.data.hit === expected &&
    distance(shot.data.from, pos(first)) < 1.2 && after.outcome === "none",
  "A native shot did not produce the expected impact.", expected);
  if (expected === "cover") {
    requireCheck(hitCover(shot.data.impact, test.route.cover) && !after.target.disabled && !targets.length,
      "The low shot passed through cover or changed the target.", expected);
  } else {
    requireCheck(distance(shot.data.impact, first.target.position) < 0.28 && after.target.disabled &&
      targets.length === 1 && targets[0].data.id === "target" && targets[0].data.disabled === true &&
      targets[0].tick === shot.tick && targets[0].sequence > shot.sequence,
    "A clear shot did not register a single target transition.", expected);
  }
  return shot;
}

async function reachExit(test) {
  await test.go(ground(test.route.exit));
  const final = await test.sample();
  requireCheck(closeTo(final, test.route.exit, test.route.exitRadius), "The route did not reach the exit.", "enter_exit");
  return final;
}

async function finish(test, afterSequence, attemptId) {
  const final = await reachExit(test);
  const log = await test.events();
  const win = outcomeEvent(log, attemptId, "victory", "exit");
  requireCheck(final.outcome === "victory" && final.attemptId === attemptId && win?.sequence > afterSequence &&
    !log.some(e => e.type === "scenario_loaded"), "The exit did not complete the native journey after its prerequisites.", "enter_exit");
  await test.capture("exit-reached");
}

async function cutPower(test) {
  await test.go(test.route.cutOff);
  const before = await test.sample();
  const after = await press(test, "e");
  const off = (await test.events()).find(e => e.attemptId === after.attemptId && e.type === "emitter_changed" &&
    e.data.id === "emitter" && e.data.active === false && e.tick > before.tick);
  requireCheck(before.emitter.active && after.outcome === "none" && after.emitter.active === false && off,
    "The native interaction did not disable the emitter.", "disable_emitter");
  return off;
}

async function cross(test) {
  for (const point of test.route.detour) await test.go(point);
}

async function rescue(test) {
  await cross(test);
  await test.go(test.route.worker);
  const before = await test.sample();
  const after = await press(test, "e");
  const transitions = (await test.events()).filter(e => e.attemptId === after.attemptId && e.type === "rescue_changed");
  requireCheck(!before.emitter.active && !before.worker.rescued && distance(pos(before), before.worker.position) < 0.8 &&
    after.worker.rescued && transitions.length === 1 && transitions[0].data.id === "worker" &&
    transitions[0].data.rescued === true && transitions[0].tick > before.tick && after.outcome === "none",
  "The player did not rescue the worker with one interaction after cutoff.", "rescue_worker");
  return transitions[0];
}

async function failAndRestart(test) {
  const first = await test.sample();
  await test.go(test.route.openSide);
  const hit = await pulse(test, "avatar");
  await test.capture("hit-before-retry");
  const retry = await press(test, "r");
  const log = await test.events();
  const restarted = log.find(e => e.type === "attempt_restarted" && e.attemptId === retry.attemptId);
  requireCheck(first.attemptId === 0 && retry.attemptId === 1 && restarted?.sequence > hit.sequence &&
    retry.tick <= 2 && retry.outcome === "none" && retry.emitter.active && !retry.worker.rescued &&
    closeTo(retry, test.route.start) && !log.some(e => e.type === "scenario_loaded"),
  "Retry failed to restore the original playable state.", "restart");
  await test.capture("restored-start");
  return retry.attemptId;
}

async function rescueJourney(test, attemptId) {
  const covered = await pulse(test, "cover");
  await test.capture("pulse-blocked-by-cover");
  const off = await cutPower(test);
  await test.capture("emitter-disabled");
  const saved = await rescue(test);
  await test.capture("worker-rescued");
  requireCheck(covered.attemptId === attemptId && off.attemptId === attemptId && saved.attemptId === attemptId &&
    covered.sequence < off.sequence && off.sequence < saved.sequence, "Rescue milestones were out of order.");
  await test.go([test.route.worker[0], test.route.exit[2]]);
  await finish(test, saved.sequence, attemptId);
}

function colorPixels(frame, rgb) {
  const { data } = PNG.sync.read(frame.bytes);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (rgb.every((channel, axis) => Math.abs(data[i + axis] - channel) <= 12)) count++;
  }
  return count;
}

const canvas = "#world canvas";
const beam = [255, 86, 120];
const armed = [255, 154, 87];
const safe = [125, 227, 177];
const worker = [247, 212, 137];

async function visibleChange(test, action, label, text, colors) {
  const before = await test.capture("before", canvas);
  await action();
  const after = await test.capture("after", canvas);
  const counts = colors.map(color => [colorPixels(before, color), colorPixels(after, color)]);
  test.notes.matchingPixels = counts;
  requireCheck(await test.page.locator(label).innerText() === text &&
    counts[0][0] > 12 && counts[0][1] < counts[0][0] / 3 && counts[1][1] - counts[1][0] > 12 &&
    (counts.length < 3 || counts[2][1] - counts[2][0] > 12),
  "The viewport or visible status did not change consistently with the observed event.");
}

export const cases = {
  async launch(test) {
    await test.capture("entry");
    requireCheck(await test.page.locator(canvas).isVisible(), "The 3D viewport is missing.");
  },
  async probe(test) {
    const first = await test.sample();
    await test.move("w", state => pos(first)[2] - pos(state)[2] >= 0.25, 850);
    const final = await test.sample();
    const inputs = await test.page.evaluate(() => window.__benchmarkInput);
    requireCheck(pos(first)[2] - pos(final)[2] >= 0.25 && final.tick > first.tick && final.attemptId === first.attemptId &&
      ["keydown", "keyup"].every(type => inputs.some(e => e.type === type && e.trusted && e.code === "KeyW")),
    "The player did not respond to trusted movement input.");
  },
  low_cover: test => pulse(test, "cover"),
  upper_exposed: test => pulse(test, "avatar"),
  side_exposed: test => pulse(test, "avatar"),
  async pulse_feedback(test) {
    const before = await test.capture("before-pulse", canvas);
    await pulse(test, "cover");
    const after = await test.capture("pulse-hit", canvas);
    const counts = [before, after].map(frame => colorPixels(frame, beam));
    test.notes.beamPixels = counts;
    requireCheck(counts[0] < 3 && counts[1] > 20 && await test.page.locator("#last-action").innerText() === "Cover blocked the pulse",
      "A blocked pulse did not produce visible impact feedback.");
  },
  blocked_shot: test => playerShot(test, "cover"),
  async elevated_shot(test) {
    await playerShot(test, "target");
    await press(test, "Space");
    const log = await test.events();
    requireCheck(log.filter(e => e.type === "target_changed").length === 1 && (await test.sample()).target.disabled,
      "A repeated shot changed the target a second time.");
  },
  async locked_exit(test) {
    for (const point of test.route.lowerPath) await test.go(point);
    const final = await reachExit(test);
    requireCheck(!final.target.disabled && final.outcome === "none" &&
      !outcomeEvent(await test.events(), final.attemptId, "victory", "exit"), "The player won without disabling the target.");
  },
  target_feedback: test => visibleChange(test, () => playerShot(test, "target"), "#device", "Disabled", [armed, safe, beam]),
  async finish_shooting(test) {
    requireCheck(closeTo(await test.sample(), test.route.start), "Journey did not start at the normal entry.");
    for (const point of test.route.upperPath) await test.go(point);
    const high = await test.sample();
    requireCheck(high.avatar.supportSurface === test.route.sides.upper &&
      test.trace.some(s => pos(s)[1] > test.route.start[1] + 0.3 && pos(s)[1] < pos(high)[1] - 0.3),
    "The player never walked between the lower floor and the firing platform.", "climb");
    const shot = await playerShot(test, "target");
    await test.capture("elevated-hit");
    for (const point of test.route.lowerPath) await test.go(point);
    await finish(test, shot.sequence, 0);
  },
  async rescue_while_armed(test) {
    const after = await press(test, "e");
    requireCheck(after.emitter.active && !after.worker.rescued && after.outcome === "none" &&
      !(await test.events()).some(e => e.type === "rescue_changed"), "The worker was rescued while the emitter was still armed.");
  },
  async disable_emitter(test) {
    const initialPulse = await pulse(test, "cover");
    const off = await cutPower(test);
    const after = await test.until(s => s.tick >= off.tick + test.contract.constants.pulsePeriodTicks || s.outcome !== "none",
      2400, "The clock did not reach the next scheduled pulse.");
    requireCheck(after.outcome === "none" && !after.emitter.active &&
      shotEvents(await test.events(), after.attemptId).every(e => e.sequence <= initialPulse.sequence),
    "The emitter fired again after the cutoff.");
  },
  async locked_exit_without_worker(test) {
    await cutPower(test);
    await cross(test);
    const final = await reachExit(test);
    requireCheck(!final.worker.rescued && final.outcome === "none" &&
      !outcomeEvent(await test.events(), final.attemptId, "victory", "exit"), "The player won without rescuing the worker.");
  },
  reset_after_hit: failAndRestart,
  emitter_feedback: test => visibleChange(test, () => cutPower(test), "#device", "Disabled", [armed, safe]),
  async rescue_feedback(test) {
    await cutPower(test);
    await visibleChange(test, () => rescue(test), "#last-action", "Worker rescued", [worker, safe]);
  },
  finish_rescue: test => rescueJourney(test, 0),
  async retry_rescue(test) {
    const attempt = await failAndRestart(test);
    await rescueJourney(test, attempt);
  },
};
