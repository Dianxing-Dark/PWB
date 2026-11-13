const MOVE_SPEED = 0.049;
const PLAYER_RADIUS = 0.19;
const BOX_HALF = 0.3;
const HOLD_DURATION = 120;
const RISE_DURATION = 18;

export const lower = { minX: -2.5, maxX: 3.1, minZ: -5.8, maxZ: 6.1 };
export const upper = { minX: -0.3, maxX: 3.1, minZ: -1.2, maxZ: 6.1 };
export const ramp = { minX: 1.54, maxX: 2.46, minZ: -5, maxZ: -1.2 };
export const elevation = 1.65;
export const airlock = { x: 2, z: 3.45, width: 1.16 };
export const switches = {
  A: { center: [0.35, 0, 0.5], halfWidth: 0.35 },
  B: { center: [2, elevation, 1.05], halfWidth: 0.39 },
};
export const exit = [2, elevation, 5.6];

const spawn = {
  default: [[0.35, 0, -3.5], [0.35, 0, -1.95]],
  box_on_A_before_B: [[2, elevation, 0.1], switches.A.center],
  avatar_near_closed_door: [[2, elevation, 2.55], [0.35, 0, -1.95]],
};
const controls = new Map([["KeyA", [-1, 0]], ["KeyD", [1, 0]], ["KeyW", [0, -1]], ["KeyS", [0, 1]]]);
const inside = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
const sameHeight = (a, b) => Math.abs(a - b) < 0.055;

function surfaceHeight(x, z, feet) {
  if (inside(upper, x, z) && feet > elevation - 0.1) return elevation;
  if (inside(ramp, x, z)) {
    const height = elevation * (z - ramp.minZ) / (ramp.maxZ - ramp.minZ);
    if (feet >= height - 0.1) return height;
  }
  return inside(lower, x, z) && feet >= -0.05 ? 0 : null;
}

function overlapsSwitch(position, id) {
  const { center, halfWidth } = switches[id];
  return sameHeight(position[1], center[1]) &&
    Math.max(Math.abs(position[0] - center[0]), Math.abs(position[2] - center[2])) <= halfWidth;
}

export function newWorld(fault) {
  let state;
  let fallVelocity;
  let unlockAt;
  let heldTicks;
  const events = [];
  const keys = new Set();

  function emit(type, data = {}) {
    events.push({ sequence: events.length, attemptId: state.attemptId, tick: state.tick, type, data });
  }

  function reset(layout, attemptId) {
    const [avatar, box] = spawn[layout];
    state = { attemptId, tick: 0, avatar: { position: [...avatar] },
      box: { position: [...box], supportSurface: "floor" },
      plates: { A: { active: overlapsSwitch(box, "A") }, B: { active: false } },
      dualActiveSinceTick: null, door: { unlocked: false, passable: false },
      goalCrossed: false, outcome: "none" };
    fallVelocity = 0;
    unlockAt = null;
    heldTicks = 0;
    keys.clear();
  }

  function settle(outcome) {
    state.outcome = outcome;
    emit("outcome_changed", { outcome });
  }

  function walk() {
    let vx = 0;
    let vz = 0;
    for (const key of keys) {
      const [x, z] = controls.get(key);
      vx += x;
      vz += z;
    }
    const scale = MOVE_SPEED / Math.max(1, Math.hypot(vx, vz));
    const dx = vx * scale;
    const dz = vz * scale;
    const [x, y, z] = state.avatar.position;
    const nextX = x + dx;
    const nextZ = z + dz;
    if (y >= elevation - 0.06 && Math.abs(nextZ - airlock.z) < 0.12 + PLAYER_RADIUS) {
      const clear = Math.abs(nextX - airlock.x) <= airlock.width / 2 - PLAYER_RADIUS;
      if (!clear || !state.door.passable || fault === "closed_collider_after_animation") return;
    }

    const [bx, by, bz] = state.box.position;
    const wouldHitBox = (dx || dz) && sameHeight(y, by) &&
      Math.max(Math.abs(nextX - bx), Math.abs(nextZ - bz)) < BOX_HALF + PLAYER_RADIUS;
    if (wouldHitBox) {
      const pushedX = bx + dx;
      const pushedZ = bz + dz;
      if (surfaceHeight(pushedX, pushedZ, 0) !== 0) return;
      state.box.position = [pushedX, by, pushedZ];
    }

    const support = surfaceHeight(nextX, nextZ, y);
    fallVelocity = support === null ? fallVelocity + 0.011 : 0;
    state.avatar.position = [nextX, support ?? y - fallVelocity, nextZ];
    if (state.avatar.position[1] < -1.2) settle("failure");
  }

  function updateSwitch(id, position) {
    const active = overlapsSwitch(position, id);
    if (state.plates[id].active !== active) {
      state.plates[id].active = active;
      emit("contact_changed", { plate: id, active });
    }
  }

  function updateGate() {
    if (state.plates.A.active && state.plates.B.active) {
      state.dualActiveSinceTick ??= state.tick - heldTicks;
      heldTicks = state.tick - state.dualActiveSinceTick;
      if (unlockAt === null && heldTicks >= HOLD_DURATION) {
        unlockAt = state.tick;
        state.door.unlocked = true;
        emit("door_state_changed", { ...state.door });
      }
    } else if (fault !== "timer_keeps_partial_credit") {
      heldTicks = 0;
      state.dualActiveSinceTick = null;
    }
    if (unlockAt !== null && !state.door.passable && state.tick - unlockAt >= RISE_DURATION) {
      state.door.passable = true;
      emit("door_state_changed", { ...state.door });
    }
  }

  reset("default", 0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      walk();
      if (state.outcome !== "none") return;
      updateSwitch("A", state.box.position);
      updateSwitch("B", state.avatar.position);
      updateGate();
      const [x, y, z] = state.avatar.position;
      if (y < elevation - 0.06 || Math.abs(x - airlock.x) > airlock.width / 2) return;
      if (!state.goalCrossed && state.door.passable && z > airlock.z + 0.3) {
        state.goalCrossed = true;
        emit("door_crossed");
      }
      if (state.goalCrossed && Math.abs(z - exit[2]) < 0.36 && fault !== "dead_goal_trigger") settle("victory");
    },
    input(code, pressed) {
      if (pressed && code === "KeyR" && state.outcome === "failure") {
        reset("default", state.attemptId + 1);
        emit("attempt_restarted");
      }
      if (!controls.has(code)) return;
      if (pressed) keys.add(code);
      else keys.delete(code);
    },
    release() { keys.clear(); },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) { return structuredClone(events.slice(afterSequence + 1)); },
    loadScenario(id) {
      if (id === "default" || !Object.hasOwn(spawn, id)) return { ok: false, reason: "unknown_scenario" };
      reset(id, state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
