export const WIDTH = 6;
export const HEIGHT = 3.4;
export const GATE = { x: 2.3, z: 1.5, half: 0.75 };
export const PLATE_A = { x: 0, z: -1, half: 0.34 };
export const PLATE_B = { x: -0.65, z: GATE.z, half: 0.41 };
export const HAZARD = { x: -3, z: -2.8, half: 0.5 };

const walk = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };
const spawn = {
  default: { avatar: [-3, 0, -1], box: [-1.65, 0, -1] },
  box_offset_from_A: { avatar: [-3, 0, -1], box: [-1.65, 0, -1] },
  box_near_A_without_contact: { avatar: [-3, 0, -0.30], box: [-1.65, 0, -0.30] },
  box_on_A_before_B: { avatar: [-1.7, 0, GATE.z], box: [0, 0, -1] },
  avatar_near_closed_door: { avatar: [1.2, 0, GATE.z], box: [-1.65, 0, -1] },
};

function onPad([x, , z], pad, extra = 0) {
  return Math.max(Math.abs(x - pad.x), Math.abs(z - pad.z)) <= pad.half + extra;
}

function onFloor(x, z) {
  return x >= -WIDTH && x <= WIDTH && z >= -HEIGHT && z <= HEIGHT;
}

export function createYard(task, fault) {
  const atom = task === "A02";
  const scenarios = atom ? ["box_offset_from_A", "box_near_A_without_contact"] :
    ["box_on_A_before_B", "avatar_near_closed_door"];
  const keys = new Set();
  const events = [];
  let state;

  function emit(type, data = {}) {
    events.push({ sequence: events.length, tick: state.tick, attemptId: state.attemptId, type, data });
  }

  function enter(name, attemptId) {
    state = {
      tick: 0, attemptId,
      avatar: { position: [...spawn[name].avatar] },
      box: { position: [...spawn[name].box], supportSurface: "floor" },
      plates: { A: { active: name === "box_on_A_before_B" }, B: { active: false } },
      dualActiveSinceTick: null, door: { unlocked: false, passable: false }, goalCrossed: false, outcome: "none",
    };
    keys.clear();
  }

  function hitsGate(x, z) {
    if (atom || Math.abs(x - GATE.x) >= 0.31) return false;
    return Math.abs(z - GATE.z) > GATE.half - 0.2 || !state.door.passable ||
      fault === "closed_collider_after_animation";
  }

  function move() {
    let dx = 0;
    let dz = 0;
    for (const key of keys) {
      dx += walk[key][0];
      dz += walk[key][1];
    }
    const scale = 0.06 / Math.max(1, Math.hypot(dx, dz));
    dx *= scale;
    dz *= scale;
    const [x, , z] = state.avatar.position;
    const nx = x + dx;
    const nz = z + dz;
    if (!onFloor(nx, nz) || hitsGate(nx, nz)) return;

    const box = state.box.position;
    if ((dx || dz) && Math.abs(nx - box[0]) < 0.51 && Math.abs(nz - box[2]) < 0.51) {
      if (!onFloor(box[0] + dx, box[2] + dz) || hitsGate(box[0] + dx, box[2] + dz)) return;
      box[0] += dx;
      box[2] += dz;
    }
    state.avatar.position = [nx, 0, nz];
  }

  function setContact(plate, active) {
    if (state.plates[plate].active === active) return;
    state.plates[plate].active = active;
    emit("contact_changed", { plate, active });
  }

  function tick() {
    if (state.outcome !== "none") return;
    state.tick++;
    const previousX = state.avatar.position[0];
    move();
    const pos = state.avatar.position;
    setContact("A", onPad(state.box.position, PLATE_A, fault === "nearby_crate_triggers_plate" ? 0.45 : 0));
    if (atom) return;
    setContact("B", onPad(pos, PLATE_B));
    if (state.plates.A.active && state.plates.B.active) {
      state.dualActiveSinceTick ??= state.tick;
      if (!state.door.unlocked && state.tick - state.dualActiveSinceTick >= 120) {
        state.door.unlocked = state.door.passable = true;
        emit("door_state_changed", { unlocked: true, passable: true });
      }
    } else if (fault !== "timer_keeps_partial_credit") {
      state.dualActiveSinceTick = null;
    }
    if (previousX < GATE.x && pos[0] >= GATE.x && state.door.passable) {
      state.goalCrossed = true;
      emit("door_crossed");
    }
    if (onPad(pos, HAZARD)) state.outcome = "failure";
    else if (state.goalCrossed && pos[0] >= 4.6 && Math.abs(pos[2] - GATE.z) <= 0.66 &&
      fault !== "dead_goal_trigger") state.outcome = "victory";
    if (state.outcome !== "none") emit("outcome_changed", { outcome: state.outcome });
  }

  enter("default", 0);
  return {
    tick,
    keyDown(key) {
      if (key === "KeyR" && state.outcome === "failure") {
        enter("default", state.attemptId + 1);
        emit("attempt_restarted");
      }
      if (Object.hasOwn(walk, key)) keys.add(key);
    },
    keyUp(key) { keys.delete(key); },
    blur() { keys.clear(); },
    getSnapshot() { return structuredClone(state); },
    getEvents(sequence = -1) { return structuredClone(events.filter(event => event.sequence > sequence)); },
    loadScenario(name) {
      if (!scenarios.includes(name)) return { ok: false, reason: "unknown_scenario" };
      enter(name, state.attemptId + 1);
      emit("scenario_loaded", { id: name });
      return { ok: true, reason: null };
    },
  };
}
