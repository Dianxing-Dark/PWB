export const TICK_RATE = 60;
export const HOLD_TICKS = 120;
export const GATE_X = 2.3;
export const TOP = 2.2;
export const GATE_Z = 1.5;
export const GAP = 1.5;

const STEP = 0.06;
const RADIUS = 0.2;
const CRATE_HALF = 0.32;
const plateA = [0, 0, -1];
const plateB = [-0.65, TOP, GATE_Z];
const validKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const layouts = {
  default: { avatar: [-3, 0, -1], box: [-1.65, 0, -1] },
  box_on_A_before_B: { avatar: [-1.7, TOP, GATE_Z], box: plateA },
  box_offset_from_A: { avatar: [-3, 0, -1], box: [-1.65, 0, -1] },
  box_above_A: { avatar: [-2.48, TOP, -1], box: [-1.45, TOP, -1] },
  avatar_near_closed_door: { avatar: [1.2, TOP, GATE_Z], box: [-1.65, 0, -1] },
};

export const geometry = {
  base: { x1: -8, x2: 5.8, z1: -3.4, z2: 2.7 },
  upper: { x1: -3, x2: 5.8, z1: -1.25, z2: 2.5 },
  ramp: { x1: -7, x2: -3, z1: 1.05, z2: 1.95 },
  plateA,
  plateB,
};

function contains(rect, x, z) {
  return x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
}

function supportAt(x, z, previousY) {
  if (contains(geometry.upper, x, z) && previousY >= TOP - 0.11) return TOP;
  if (contains(geometry.ramp, x, z)) {
    const height = TOP * (x - geometry.ramp.x1) / (geometry.ramp.x2 - geometry.ramp.x1);
    if (previousY >= height - 0.11) return height;
  }
  if (contains(geometry.base, x, z) && previousY >= -0.11) return 0;
  return null;
}

function touchesPlate(position, plate, halfWidth) {
  return Math.abs(position[1] - plate[1]) < 0.05 &&
    Math.abs(position[0] - plate[0]) <= halfWidth && Math.abs(position[2] - plate[2]) <= halfWidth;
}

export function createSimulation(fault = "", task = "P01") {
  const atom = task === "A01";
  const scenarios = atom ? ["box_offset_from_A", "box_above_A"] :
    ["box_on_A_before_B", "avatar_near_closed_door"];
  let state;
  let falling = 0;
  let sequence = 0;
  const events = [];
  const keys = new Set();

  function record(type, data = {}) {
    events.push({ sequence: sequence++, type, attemptId: state.attemptId, tick: state.tick, data });
  }

  function enter(id, attemptId = 0) {
    const layout = layouts[id];
    state = {
      attemptId, tick: 0, avatar: { position: [...layout.avatar] },
      box: { position: [...layout.box], supportSurface: layout.box[1] === TOP ? "upper" : "lower" },
      plates: { A: { active: id === "box_on_A_before_B" }, B: { active: false } },
      dualActiveSinceTick: null,
      door: { unlocked: false, passable: false },
      goalCrossed: false, outcome: "none",
    };
    keys.clear();
    falling = 0;
  }

  function setOutcome(outcome) {
    state.outcome = outcome;
    record("outcome_changed", { outcome });
  }

  function move(dx, dz) {
    const avatar = state.avatar.position;
    const box = state.box.position;
    const nextX = avatar[0] + dx;
    const nextZ = avatar[2] + dz;
    const floor = supportAt(nextX, nextZ, avatar[1]);

    if (!atom && avatar[1] >= TOP - 0.1) {
      const cross = Math.abs(nextX - GATE_X) < 0.16 + RADIUS;
      const throughGap = Math.abs(nextZ - GATE_Z) <= GAP / 2 - RADIUS;
      if (cross && (!throughGap || !state.door.passable || fault === "closed_collider_after_animation")) {
        return;
      }
    }

    const reachesBox = Math.abs(nextX - box[0]) < CRATE_HALF + RADIUS &&
      Math.abs(nextZ - box[2]) < CRATE_HALF + RADIUS && Math.abs(avatar[1] - box[1]) < 0.25;
    if (reachesBox && (dx || dz)) {
      const x = box[0] + dx;
      const z = box[2] + dz;
      if (supportAt(x, z, box[1]) !== box[1]) return;
      box[0] = x;
      box[2] = z;
    }
    avatar[0] = nextX;
    avatar[2] = nextZ;
    if (floor !== null) {
      avatar[1] = floor;
      falling = 0;
    } else {
      falling += 0.012;
      avatar[1] -= falling;
      if (avatar[1] < -1.1) setOutcome("failure");
    }
    if (!state.goalCrossed && state.door.passable && avatar[1] >= TOP - 0.05 &&
        avatar[0] > GATE_X + 0.4 && Math.abs(avatar[2] - GATE_Z) < GAP / 2) {
      state.goalCrossed = true;
      record("door_crossed");
    }
    if (state.goalCrossed && avatar[1] >= TOP - 0.05 &&
        avatar[0] >= 4.6 && Math.abs(avatar[2] - GATE_Z) <= 0.7 && fault !== "dead_goal_trigger") {
      setOutcome("victory");
    }
  }

  function setPlate(name, active) {
    if (state.plates[name].active === active) return;
    state.plates[name].active = active;
    record("contact_changed", { plate: name, active });
  }

  function update() {
    if (state.outcome !== "none") return;
    state.tick++;
    const dx = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const dz = Number(keys.has("KeyS")) - Number(keys.has("KeyW"));
    const step = dx && dz ? STEP / Math.SQRT2 : STEP;
    move(dx * step, dz * step);

    const box = state.box.position;
    const platePosition = fault === "projection_triggers_plate" ? [box[0], plateA[1], box[2]] : box;
    setPlate("A", touchesPlate(platePosition, plateA, 0.34));
    if (atom) return;
    setPlate("B", touchesPlate(state.avatar.position, plateB, 0.41));
    if (state.plates.A.active && state.plates.B.active) {
      state.dualActiveSinceTick ??= state.tick;
      if (!state.door.unlocked && state.tick - state.dualActiveSinceTick >= HOLD_TICKS) {
        state.door.unlocked = state.door.passable = true;
        record("door_state_changed", { unlocked: true, passable: true });
      }
    } else if (fault !== "timer_keeps_partial_credit") {
      state.dualActiveSinceTick = null;
    }
  }

  enter("default");
  return {
    update,
    keyDown(code) {
      if (code === "KeyR" && state.outcome === "failure") {
        enter("default", state.attemptId + 1);
        record("attempt_restarted");
      }
      if (validKeys.has(code)) keys.add(code);
    },
    keyUp(code) { keys.delete(code); },
    releaseKeys() { keys.clear(); },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) {
      return events.filter(event => event.sequence > afterSequence).map(event => structuredClone(event));
    },
    loadScenario(id) {
      if (!scenarios.includes(id)) return { ok: false, reason: "unknown_scenario" };
      enter(id, state.attemptId + 1);
      record("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
