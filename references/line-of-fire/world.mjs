export const PLATFORM_Y = 2.25;
export const COVER = [[-0.12, 0.12], [0, 1.85], [-0.88, 0.88]];
export const EMITTER = [3.65, 1.45, 0];
export const TARGET = [3.65, 2.92, 0];
export const SWITCH = [-1.4, 0, 0];
export const WORKER = [3.4, 0, 0.06];
export const EXIT = [4.5, 0, -1.56];
export const START = [-2.55, 0, 0];
export const PULSE_TICKS = 90;

export const decks = [
  { id: "lower", x: [-5, 5.1], z: [-2.65, 2.65], y: [0, 0] },
  { id: "ramp", x: [-4.2, -2.65], z: [-0.8, 0.8], y: [0, PLATFORM_Y] },
  { id: "upper", x: [-2.65, -0.65], z: [-0.8, 0.8], y: [PLATFORM_Y, PLATFORM_Y] },
];
export const scenarios = {
  A08: {
    low_cover: { point: [-1.6, 0, 0], surface: "lower" },
    upper_exposed: { point: [-1.6, PLATFORM_Y, 0], surface: "upper" },
    side_exposed: { point: [-1.6, 0, 2.05], surface: "lower" },
  },
  C08: {
    blocked_shot: { point: [-3.2, 0, 0], surface: "lower" },
    elevated_shot: { point: [-1.55, PLATFORM_Y, 0], surface: "upper" },
  },
  P06: { worker_unsecured: { point: [3.1, 0, 0.06], surface: "lower" } },
};
const controls = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
const within = (value, [min, max]) => value >= min && value <= max;
const gap = (one, two) => Math.hypot(...one.map((value, axis) => value - two[axis]));
const chest = ([x, y, z]) => [x, y + 0.66, z];
export const floorY = (deck, x) => deck.y[0] + (deck.y[1] - deck.y[0]) * (x - deck.x[0]) / (deck.x[1] - deck.x[0]);

function obstruction(start, end) {
  let first = 0;
  let last = 1;
  for (const [axis, span] of COVER.entries()) {
    const delta = end[axis] - start[axis];
    if (delta === 0) {
      if (!within(start[axis], span)) return 1;
    } else {
      const t = span.map(limit => (limit - start[axis]) / delta);
      first = Math.max(first, Math.min(...t));
      last = Math.min(last, Math.max(...t));
    }
  }
  return first <= last ? first : 1;
}

export function createWorld(task, fault) {
  const traverse = task !== "P06";
  const gun = task !== "C08";
  const held = new Set();
  const log = [];
  let state;
  let queued;
  let falling;

  function reset(point, surface, attemptId) {
    state = {
      attemptId, tick: 0, avatar: { position: [...point], supportSurface: surface },
      emitter: { active: gun, position: [...EMITTER] }, target: { disabled: false, position: [...TARGET] },
      worker: { rescued: false, position: [...WORKER] }, outcome: "none", beam: null, lastAction: null,
    };
    held.clear();
    queued = null;
    falling = 0;
  }
  function emit(type, data) {
    log.push({ type, data, sequence: log.length, attemptId: state.attemptId, tick: state.tick });
  }
  function move() {
    const delta = [0, 0];
    for (const key of held) {
      delta[0] += controls[key][0];
      delta[1] += controls[key][1];
    }
    const stride = 0.055 / Math.max(1, Math.hypot(...delta));
    const [oldX, y, oldZ] = state.avatar.position;
    let x = Math.max(-4.8, Math.min(4.85, oldX + delta[0] * stride));
    let z = Math.max(-2.45, Math.min(2.45, oldZ + delta[1] * stride));
    if (y < COVER[1][1] && within(x, [-0.25, 0.25]) && within(z, [-1.01, 1.01])) {
      x = oldX;
      z = oldZ;
    }
    const oldSurface = state.avatar.supportSurface;
    falling += 0.012;
    const support = (traverse ? decks : decks.slice(0, 1))
      .filter(deck => within(x, deck.x) && within(z, deck.z))
      .map(deck => ({ id: deck.id, y: floorY(deck, x) }))
      .filter(candidate => candidate.y <= y + 0.09 && candidate.y >= (oldSurface ? y - 0.09 : y - falling))
      .sort((a, b) => b.y - a.y)[0];
    if (support) falling = 0;
    state.avatar = { position: [x, support?.y ?? y - falling, z], supportSurface: support?.id ?? null };
  }
  function outcome(value, cause) {
    state.outcome = value;
    emit("outcome_changed", { outcome: value, cause });
  }
  function fire(source, from, to) {
    const flattenedCover = fault === "flat_cover" && source === "emitter" &&
      state.avatar.supportSurface === "upper" && Math.abs(to[2]) < COVER[2][1];
    const fraction = flattenedCover ? 0.65 : fault === "shoot_through_cover" && source === "avatar" ? 1 : obstruction(from, to);
    const blocked = fraction < 1;
    const hit = blocked ? "cover" : source === "avatar" ? "target" : "avatar";
    const impact = from.map((start, axis) => start + (to[axis] - start) * fraction);
    state.beam = { from, impact, source, hit, untilTick: state.tick + 25 };
    state.lastAction = hit === "cover" ? "Cover blocked the pulse" : source === "avatar" ? "Target disabled" : "Pulse hit · press R";
    emit("shot_resolved", { source, from, impact, hit });
    if (source === "emitter" && !blocked) outcome("failure", "pulse");
    if (source === "avatar" && !blocked && !state.target.disabled) {
      state.target.disabled = true;
      emit("target_changed", { id: "target", disabled: true });
    }
  }
  function interact() {
    const point = state.avatar.position;
    if (gap(point, SWITCH) <= 0.76 && state.emitter.active) {
      state.emitter.active = false;
      state.lastAction = "Emitter disabled";
      emit("emitter_changed", { id: "emitter", active: false });
    } else if (gap(point, WORKER) <= 0.8 && !state.worker.rescued &&
      (!state.emitter.active || fault === "rescue_while_armed")) {
      state.worker.rescued = true;
      state.lastAction = "Worker rescued";
      emit("rescue_changed", { id: "worker", rescued: true });
    }
  }
  function begin(attempt) {
    reset(START, "lower", attempt);
  }
  begin(0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      move();
      if (queued === "Space" && task === "C08") fire("avatar", chest(state.avatar.position), TARGET);
      if (queued === "KeyE" && task === "P06") interact();
      queued = null;
      if (state.emitter.active && state.tick % PULSE_TICKS === 0) {
        fire("emitter", EMITTER, chest(state.avatar.position));
      }
      const atExit = gap(state.avatar.position, EXIT) < 0.42;
      if (atExit && state.outcome === "none" &&
          (task === "C08" && (state.target.disabled || fault === "exit_before_target") ||
           task === "P06" && (state.worker.rescued || fault === "exit_without_worker"))) outcome("victory", "exit");
    },
    input(code, down) {
      if (down && code === "KeyR" && state.outcome === "failure") {
        const previous = state;
        begin(previous.attemptId + 1);
        if (fault === "retry_keeps_position") state.avatar = previous.avatar;
        emit("attempt_restarted", {});
      }
      if (down && (code === "Space" || code === "KeyE")) queued = code;
      if (!Object.hasOwn(controls, code)) return;
      if (down) held.add(code);
      else held.delete(code);
    },
    release() { held.clear(); queued = null; },
    getSnapshot() { return structuredClone(state); },
    getEvents(after = -1) { return structuredClone(log.filter(event => event.sequence > after)); },
    loadScenario(id) {
      if (!Object.hasOwn(scenarios[task], id)) return { ok: false, reason: "unknown_scenario" };
      const { point, surface } = scenarios[task][id];
      reset(point, surface, state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
