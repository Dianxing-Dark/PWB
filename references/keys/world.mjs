export const TASKS = {
  A06: "Approach either lock and press E. You have one amber key.",
  C05: "Follow the west ramp to collect the amber key. Open the upper lock and walk to the marked exit.",
  P05: "Take the blue key on the lower floor or the amber key upstairs. Open that lock with E and follow your route to the shared exit.",
};
export const UPPER = 2.25;
export const GATE = 1;
export const KEYS = {
  amber: { x: -0.95, z: 0, y: UPPER },
  blue: { x: -2.5, z: 0, y: 0 },
};
export const GOALS = { C05: { x: 2.7, y: UPPER }, P05: { x: 5.65, y: 0 } };

export const surfaces = [
  { id: "lower", xMin: -5.1, xMax: 6.35, zMin: -1.15, zMax: 1.15, left: 0, right: 0 },
  { id: "lower", xMin: -5.1, xMax: -4.55, zMin: -3.38, zMax: -1.1, left: 0, right: 0 },
  { id: "west-ramp", xMin: -4.6, xMax: -1.8, zMin: -3.38, zMax: -2.25, left: 0, right: UPPER },
  { id: "upper", xMin: -1.8, xMax: -1.18, zMin: -3.38, zMax: -1.1, left: UPPER, right: UPPER },
  { id: "upper", xMin: -1.8, xMax: 3.55, zMin: -1.15, zMax: 1.15, left: UPPER, right: UPPER },
  { id: "upper", xMin: 2.92, xMax: 3.55, zMin: -3.38, zMax: -1.1, left: UPPER, right: UPPER, sharedExit: true },
  { id: "east-ramp", xMin: 3.55, xMax: 5.65, zMin: -3.38, zMax: -2.25, left: UPPER, right: 0, sharedExit: true },
  { id: "lower", xMin: 5.65, xMax: 6.35, zMin: -3.38, zMax: -1.1, left: 0, right: 0, sharedExit: true },
];

export function floorHeight(surface, x) {
  const fraction = (x - surface.xMin) / (surface.xMax - surface.xMin);
  return surface.left + fraction * (surface.right - surface.left);
}

const direction = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };
const spawns = {
  default: { position: [-4.82, 0, 0] },
  one_key_at_matching_lock: { position: [0.3, 0, 0.65] },
  projected_near_other_floor: { position: [0.3, 0, 0] },
  key_already_spent_elsewhere: { position: [0.3, UPPER, 0], lowerOpen: true },
  before_amber_pickup: { position: [-1.53, UPPER, 0] },
  blue_only_near_upper_lock: { position: [0.3, UPPER, 0], held: "blue" },
  amber_key_near_upper_lock: { position: [0.3, UPPER, 0], held: "amber" },
  no_key_near_locked_door: { position: [0.3, 0, 0] },
};
const localIds = {
  A06: ["one_key_at_matching_lock", "projected_near_other_floor", "key_already_spent_elsewhere"],
  C05: ["before_amber_pickup", "blue_only_near_upper_lock", "amber_key_near_upper_lock", "no_key_near_locked_door"],
};
localIds.P05 = localIds.C05;

export function createWorld(task, fault) {
  const atom = task === "A06";
  const floors = surfaces.filter(surface => !surface.sharedExit || task === "P05");
  const keys = new Set();
  const keyContacts = new Set();
  const events = [];
  let useRequested = false;
  let state;

  function emit(type, data = {}) {
    events.push({ sequence: events.length, attemptId: state.attemptId, tick: state.tick, type, data });
  }
  function enter(id, attemptId) {
    const { position, held, lowerOpen } = spawns[id];
    state = {
      tick: 0, attemptId,
      avatar: { position: [...position], supportSurface: position[1] === UPPER ? "upper" : "lower" },
      inventory: { amber: Number(held === "amber" || (atom && !lowerOpen)), blue: Number(held === "blue") },
      keys: { amber: { collected: held === "amber" }, blue: { collected: held === "blue" } },
      doors: {
        lower: { locked: !lowerOpen, passable: Boolean(lowerOpen) },
        upper: { locked: true, passable: false },
      },
      traversedBranch: null, outcome: "none",
    };
    keys.clear();
    keyContacts.clear();
    useRequested = false;
  }

  function move() {
    let dx = 0;
    let dz = 0;
    for (const key of keys) {
      dx += direction[key][0];
      dz += direction[key][1];
    }
    if (!dx && !dz) return;
    const [x, y, z] = state.avatar.position;
    const stride = 0.055 / Math.hypot(dx, dz);
    const nx = x + dx * stride;
    const nz = z + dz * stride;
    const floor = floors.find(part => nx >= part.xMin && nx <= part.xMax && nz >= part.zMin &&
      nz <= part.zMax && Math.abs(floorHeight(part, nx) - y) < 0.12);
    if (!floor) {
      state.outcome = "failure";
      state.avatar.supportSurface = null;
      emit("outcome_changed", { outcome: "failure" });
      return;
    }
    const door = state.doors[floor.id];
    if (door && Math.abs(nx - GATE) < 0.21 && door.locked) return;
    state.avatar = { position: [nx, floorHeight(floor, nx), nz], supportSurface: floor.id };
    if (door?.passable && x < GATE && nx >= GATE) {
      state.traversedBranch = floor.id;
      emit("door_crossed", { doorId: floor.id });
    }
  }

  function inventoryChange(color, amount, action, objectId) {
    const before = state.inventory[color];
    const after = before + amount;
    state.inventory[color] = after;
    emit("inventory_changed", { color, before, after, action, objectId });
  }

  function collect(x, y, z) {
    if (atom || fault === "decorative_keys") return;
    for (const [color, point] of Object.entries(KEYS)) {
      if (Math.abs(y - point.y) > 0.12 || Math.hypot(x - point.x, z - point.z) > 0.25) {
        keyContacts.delete(color);
        continue;
      }
      if (keyContacts.has(color)) continue;
      keyContacts.add(color);
      if (state.keys[color].collected && fault !== "pickup_duplicates") continue;
      state.keys[color].collected = true;
      inventoryChange(color, 1, "pickup", color);
    }
  }

  function unlock(x, surface) {
    if (Math.abs(x - GATE) > 1.02 || fault === "decorative_keys") return;
    const door = state.doors[surface];
    if (!door?.locked) return;
    const matchingColor = atom || surface === "upper" ? "amber" : "blue";
    const availableColor = fault === "any_key_opens_upper" && surface === "upper" && !state.inventory.amber
      ? "blue" : matchingColor;
    if (!state.inventory[availableColor]) return;
    if (fault !== "unlock_without_consumption") inventoryChange(availableColor, -1, "unlock", surface);
    door.locked = false;
    door.passable = true;
    emit("door_state_changed", { doorId: surface, locked: false, passable: true });
    if (fault === "cross_floor_unlock" && surface === "lower" && Math.abs(state.avatar.position[2]) < 0.25) {
      state.doors.upper = { locked: false, passable: true };
      emit("door_state_changed", { doorId: "upper", locked: false, passable: true });
    }
  }

  function step() {
    if (state.outcome !== "none") return;
    state.tick++;
    move();
    if (state.outcome !== "none") return;
    const [x, y, z] = state.avatar.position;
    collect(x, y, z);
    if (useRequested) unlock(x, state.avatar.supportSurface);
    useRequested = false;
    const goal = GOALS[task];
    const branch = state.traversedBranch;
    if (goal && branch && (task === "P05" || branch === "upper") && x >= goal.x && Math.abs(y - goal.y) < 0.1 &&
      Math.abs(z) <= 0.65 && !(fault === "one_branch_cannot_finish" && branch === "lower")) {
      state.outcome = "victory";
      emit("outcome_changed", { outcome: "victory", branch });
    }
  }

  enter("default", 0);
  return {
    step,
    input(code, down) {
      if (code === "KeyR" && down && state.outcome !== "none") {
        enter("default", state.attemptId + 1);
        emit("attempt_restarted");
      }
      if (code === "KeyE" && down) useRequested = true;
      if (!Object.hasOwn(direction, code)) return;
      if (down) keys.add(code);
      else keys.delete(code);
    },
    release() { keys.clear(); useRequested = false; },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) { return structuredClone(events.filter(event => event.sequence > afterSequence)); },
    loadScenario(id) {
      if (!localIds[task].includes(id)) return { ok: false, reason: "unknown_scenario" };
      enter(id, state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
