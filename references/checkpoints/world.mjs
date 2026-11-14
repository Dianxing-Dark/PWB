export const TOP = 2.2;
export const FLOORS = [
  { id: "lower", x: [-5.2, 5.8], z: [-1.2, 1.2], height: [0, 0] },
  { id: "lower", x: [-4.92, -3.95], z: [-3.55, -1.16], height: [0, 0] },
  { id: "ramp", x: [-3.95, -2.65], z: [-3.32, -2.15], height: [0, TOP] },
  { id: "upper", x: [-2.65, -1.64], z: [-3.55, -1.16], height: [TOP, TOP] },
  { id: "upper", x: [-2.68, 5.8], z: [-1.2, 1.2], height: [TOP, TOP] },
];
export const CHECKPOINTS = { lower: [0, 0, 0], upper: [0, TOP, 0] };
export const TRAPS = { lower: [2.15, 0, 0], upper: [2.15, TOP, 0.72] };
export const CONTROLS = { lower_power: [-2.4, 0, 0], upper_switch: [1.12, TOP, 0] };
export const EXIT = [4.95, TOP, 0];
export const TASKS = {
  A10: "Walk onto a checkpoint. Step off the dock and press R to return to the marked floor.",
  C07: "Touch a checkpoint before approaching a trap. Press R to recover at the last checkpoint. The west ramp leads upstairs.",
  C12: "Press E at the blue power console downstairs. Take the west ramp, save at the upper checkpoint and press E at the orange relay. Follow the center lane to the exit.",
};

const DEFAULT = [-3.5, 0, 0];
const entries = {
  approach_lower: { position: [-0.8, 0, 0] },
  approach_upper: { position: [-0.8, TOP, 0] },
  lower_trap_route: { position: [1.28, 0, 0], checkpoint: "lower" },
  upper_trap_route: { position: [1.28, TOP, 0.72], checkpoint: "upper" },
  upper_safe_projection: { position: [1.28, TOP, 0], checkpoint: "upper" },
};
const scenarios = {
  A10: ["approach_lower", "approach_upper"],
  C07: ["lower_trap_route", "upper_trap_route", "upper_safe_projection"],
  C12: ["lower_trap_route", "upper_trap_route", "upper_safe_projection"],
};
const directions = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };
const horizontal = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const at = (a, b, range) => Math.abs(a[1] - b[1]) < 0.08 && horizontal(a, b) <= range;

export function heightAt(floor, x) {
  const [left, right] = floor.x;
  const [low, high] = floor.height;
  return low + (x - left) / (right - left) * (high - low);
}

export function createWorld(task, fault) {
  const held = new Set();
  const events = [];
  let state;
  let fallingSpeed;
  let operate;
  let firstCheckpoint;

  function emit(type, data = {}) {
    events.push({ sequence: events.length, attemptId: state.attemptId, tick: state.tick, type, data });
  }

  function enter(position, checkpoint, lowerPowered, attemptId) {
    state = {
      attemptId, tick: 0,
      avatar: { position: [...position], supportSurface: position[1] === TOP ? "upper" : "lower" },
      checkpoint: { id: checkpoint, position: checkpoint ? [...CHECKPOINTS[checkpoint]] : null },
      lowerPowered, upperSwitchOn: false, outcome: "none",
    };
    held.clear();
    fallingSpeed = 0;
    operate = false;
    firstCheckpoint = checkpoint;
  }

  function move() {
    let dx = 0;
    let dz = 0;
    for (const key of held) {
      dx += directions[key][0];
      dz += directions[key][1];
    }
    const [x, y, z] = state.avatar.position;
    const stride = 0.052 / Math.max(1, Math.hypot(dx, dz));
    const nx = x + dx * stride;
    const nz = z + dz * stride;
    const wasSupported = state.avatar.supportSurface !== null;
    const floor = FLOORS.find(part => nx >= part.x[0] && nx <= part.x[1] && nz >= part.z[0] &&
      nz <= part.z[1] && (wasSupported ? Math.abs(heightAt(part, nx) - y) < 0.13 :
        heightAt(part, nx) <= y && heightAt(part, nx) >= y - fallingSpeed));
    if (floor) {
      state.avatar = { position: [nx, heightAt(floor, nx), nz], supportSurface: floor.id };
      fallingSpeed = 0;
    } else {
      fallingSpeed += 0.011;
      state.avatar = { position: [nx, y - fallingSpeed, nz], supportSurface: null };
    }
  }

  function register(position) {
    for (const [floor, point] of Object.entries(CHECKPOINTS)) {
      if (!at(position, point, 0.31)) continue;
      const id = fault === "upper_checkpoint_uses_lower" && floor === "upper" ? "lower" : floor;
      if (state.checkpoint.id !== id) {
        state.checkpoint = { id, position: [...CHECKPOINTS[id]] };
        firstCheckpoint ??= id;
        emit("checkpoint_registered", { id, position: [...state.checkpoint.position] });
      }
    }
  }

  function checkHazards(position) {
    if (position[1] < -1.1) return "fall";
    if (task === "A10") return null;
    if (at(position, TRAPS.lower, 0.29) ||
      (fault === "lower_trap_hits_upper" && horizontal(position, TRAPS.lower) <= 0.29)) return "lower_trap";
    if (at(position, TRAPS.upper, 0.29)) return "upper_trap";
    return null;
  }

  function useControl(position) {
    if (at(position, CONTROLS.lower_power, 0.43) && !state.lowerPowered) {
      state.lowerPowered = true;
      emit("control_changed", { id: "lower_power", active: true });
    }
    if (at(position, CONTROLS.upper_switch, 0.43) && !state.upperSwitchOn && state.lowerPowered) {
      state.upperSwitchOn = true;
      emit("control_changed", { id: "upper_switch", active: true });
    }
  }

  function step() {
    if (state.outcome !== "none") return;
    state.tick++;
    move();
    const position = state.avatar.position;
    register(position);
    if (task === "C12" && operate) useControl(position);
    operate = false;
    const cause = checkHazards(position);
    if (cause) {
      state.outcome = "failure";
      emit("outcome_changed", { outcome: "failure", cause });
    } else if (task === "C12" && at(position, EXIT, 0.42) &&
        (fault === "exit_ignores_controls" ||
          (state.lowerPowered && (state.upperSwitchOn || fault === "exit_ignores_relay")))) {
      state.outcome = "victory";
      emit("outcome_changed", { outcome: "victory" });
    }
  }

  function retry() {
    const { checkpoint, lowerPowered, upperSwitchOn, attemptId } = state;
    const id = fault === "retry_uses_first_checkpoint" ? firstCheckpoint : checkpoint.id;
    const position = fault === "retry_uses_lower_height" && id === "upper" ? CHECKPOINTS.lower :
      CHECKPOINTS[id] ?? DEFAULT;
    enter(position, id, lowerPowered && fault !== "retry_erases_power", attemptId + 1);
    if (fault === "retry_keeps_switch") state.upperSwitchOn = upperSwitchOn;
    emit("attempt_restarted", { checkpointId: id });
  }

  enter(DEFAULT, null, false, 0);
  return {
    step,
    input(code, down) {
      if (down && code === "KeyR" && state.outcome === "failure") retry();
      if (down && code === "KeyE") operate = true;
      if (!Object.hasOwn(directions, code)) return;
      if (down) held.add(code);
      else held.delete(code);
    },
    release() { held.clear(); operate = false; },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) { return structuredClone(events.filter(event => event.sequence > afterSequence)); },
    loadScenario(id) {
      if (!scenarios[task].includes(id)) return { ok: false, reason: "unknown_scenario" };
      const { position, checkpoint = null } = entries[id];
      enter(position, checkpoint, false, state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
