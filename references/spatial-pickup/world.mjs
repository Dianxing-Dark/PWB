export const UP = 2.3;
export const SAMPLE = [1.43, UP, 0];
export const EXIT = [4.3, UP, 0];
export const WALL = { x: [0.82, 0.98], y: [UP, UP + 1.55], z: [-0.72, 0.72] };
export const DECKS = [
  { x: [-5.6, 5.3], z: [-1.6, 1.6], heights: [0, 0], id: "lower" },
  { x: [-5.14, -4.04], z: [-3.5, -1.56], heights: [0, 0], id: "lower" },
  { x: [-4.04, -2.34], z: [-3.5, -2.24], heights: [0, UP], id: "ramp" },
  { x: [-2.34, -1.44], z: [-3.5, -1.56], heights: [UP, UP], id: "upper" },
  { x: [-2.4, 5.3], z: [-1.6, 1.6], heights: [UP, UP], id: "upper" },
];
export const deckY = (deck, x) => deck.heights[0] +
  (deck.heights[1] - deck.heights[0]) * (x - deck.x[0]) / (deck.x[1] - deck.x[0]);
const START = [-4.6, 0, 0];
const local = {
  below_sample: [1.43, 0, 0],
  beside_sample: [1.76, UP, 0],
  outside_reach: [2.86, UP, 0],
  behind_wall: [0.39, UP, 0],
};
const controls = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
const between = (value, span) => value >= span[0] && value <= span[1];
const horizontal = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function blockedSight(start, end) {
  let entrance = 0;
  let leave = 1;
  for (const [axis, range] of [WALL.x, WALL.y, WALL.z].entries()) {
    const step = end[axis] - start[axis];
    if (!step) {
      if (!between(start[axis], range)) return false;
      continue;
    }
    const a = (range[0] - start[axis]) / step;
    const b = (range[1] - start[axis]) / step;
    entrance = Math.max(entrance, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (entrance > leave) return false;
  }
  return true;
}

export function createLab(task, fault) {
  const wall = task === "C09";
  const keys = new Set();
  const history = [];
  let state;
  let pick;
  let velocity;

  function enter(point, attemptId) {
    state = {
      avatar: { position: [...point], supportSurface: point[1] === UP ? "upper" : "lower" },
      sample: { position: [...SAMPLE], collected: false }, inventory: { sample: 0 }, attemptId, tick: 0, outcome: "none",
    };
    keys.clear();
    pick = false;
    velocity = 0;
  }
  function emit(type, data) {
    history.push({ type, data, attemptId: state.attemptId, tick: state.tick, sequence: history.length });
  }
  function move() {
    let dx = 0;
    let dz = 0;
    for (const key of keys) {
      dx += controls[key][0];
      dz += controls[key][1];
    }
    const step = 0.051 / Math.max(1, Math.hypot(dx, dz));
    const [oldX, y, oldZ] = state.avatar.position;
    let x = oldX + dx * step;
    let z = oldZ + dz * step;
    if (wall && fault !== "walk_through_wall" && y >= UP - 0.09 &&
        x > WALL.x[0] - 0.13 && x < WALL.x[1] + 0.13 &&
        z > WALL.z[0] - 0.13 && z < WALL.z[1] + 0.13) {
      x = oldX;
      z = oldZ;
    }
    const support = DECKS.find(deck => between(x, deck.x) && between(z, deck.z) &&
      Math.abs(deckY(deck, x) - y) < 0.12);
    velocity = support ? 0 : velocity + 0.014;
    state.avatar = { position: [x, support ? deckY(support, x) : y - velocity, z], supportSurface: support?.id ?? null };
  }
  function collect() {
    const point = state.avatar.position;
    if (state.sample.collected && fault !== "repeat_pickup") return;
    if (state.avatar.supportSurface !== "upper" && fault !== "pickup_other_floor") return;
    if (horizontal(point, SAMPLE) > 1.2 && fault !== "pickup_outside_reach") return;
    const interaction = ([x, y, z]) => [x, y + 0.45, z];
    if (wall && fault !== "pickup_through_wall" && blockedSight(interaction(point), interaction(SAMPLE))) return;
    const before = state.inventory.sample++;
    state.sample.collected = true;
    emit("inventory_changed", { objectId: "sample", before, after: state.inventory.sample });
  }

  enter(START, 0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      move();
      if (pick) collect();
      pick = false;
      const point = state.avatar.position;
      if (point[1] < -1.2) state.outcome = "failure";
      else if (wall && state.avatar.supportSurface === "upper" && horizontal(point, EXIT) < 0.36 &&
        (state.sample.collected || fault === "exit_without_sample")) state.outcome = "victory";
      if (state.outcome !== "none") emit("outcome_changed", { outcome: state.outcome });
    },
    input(code, down) {
      if (down && code === "KeyE") pick = true;
      if (down && code === "KeyR" && state.outcome === "failure") enter(START, state.attemptId + 1);
      if (!Object.hasOwn(controls, code)) return;
      if (down) keys.add(code);
      else keys.delete(code);
    },
    release() { keys.clear(); pick = false; },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) { return structuredClone(history.filter(e => e.sequence > afterSequence)); },
    loadScenario(id) {
      if (!Object.hasOwn(local, id) || (!wall && id === "behind_wall")) return { ok: false, reason: "unknown_scenario" };
      enter(local[id], state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
