export const PERIOD = 600;
export const HIGH = 2.2;
export const GATE_X = 7.6;
export const DELIVERY_X = 9.4;
export const PLATFORM_LENGTH = 3.2;
export const PLATFORM_WIDTH = 2.4;
export const LOW_DOCK = { xMin: -5.8, xMax: -1.6, zMin: -1.65, zMax: 1.65, y: 0 };
export const HIGH_DOCK = { xMin: 5.6, xMax: 10.7, zMin: -1.65, zMax: 1.65, y: HIGH };
export const TRACK = {
  A03: "Ride the lift from the lower dock and step onto the upper dock.",
  C03: "Ride to the upper dock. Cross the gate during its open window and reach the exit.",
  P04: "Push the crate onto the lift. Ride with it and deliver it through the timed gate.",
};

const spawn = {
  default: { avatar: [-4.3, 0, 0], crate: [-2.8, 0, 0], phase: 0 },
  low_dock_before_departure: { avatar: [-2.4, 0, 0], crate: [-4.8, 0, 0], phase: 0 },
  adjacent_low_ledge: { avatar: [-1.9, 0, 0], crate: [-4.8, 0, 0], phase: 112 },
  high_dock_before_gate_opens: { avatar: [7.08, HIGH, 0], crate: [-4.8, 0, 0], phase: 270 },
  high_dock_before_gate_closes: { avatar: [7.08, HIGH, 0], crate: [-4.8, 0, 0], phase: 389 },
  cargo_ready_to_load: { avatar: [-3.45, 0, 0], crate: [-2.65, 0, 0], phase: 0 },
  high_gate_without_cargo: { avatar: [7.08, HIGH, 0], crate: [-4.8, 0, 0], phase: 270 },
};
const platformScenarios = ["low_dock_before_departure", "adjacent_low_ledge"];
const gateScenarios = ["high_dock_before_gate_opens", "high_dock_before_gate_closes"];
const cargoScenarios = ["cargo_ready_to_load", "high_gate_without_cargo"];
const movement = new Map([["KeyA", [-1, 0]], ["KeyD", [1, 0]], ["KeyW", [0, -1]], ["KeyS", [0, 1]]]);

function liftAt(phaseTick) {
  const phase = phaseTick < 120 ? "lowDock" : phaseTick < 270 ? "outbound" :
    phaseTick < 450 ? "highDock" : "inbound";
  const fraction = { lowDock: 0, outbound: (phaseTick - 120) / 150, highDock: 1,
    inbound: (600 - phaseTick) / 150 }[phase];
  return { phase, phaseTick, position: [4 * fraction, HIGH * fraction, 0] };
}

function onDeck(x, y, z, deck) {
  return Math.abs(y - deck.y) < 0.07 && x >= deck.xMin && x <= deck.xMax &&
    z >= deck.zMin && z <= deck.zMax;
}

export function createWorld(task, fault = "") {
  const hasGate = task !== "A03";
  const hasCargo = task === "P04";
  const scenarios = [...platformScenarios, ...(hasGate ? gateScenarios : []), ...(hasCargo ? cargoScenarios : [])];
  const keys = new Set();
  const events = [];
  let state;
  let phaseOffset;
  let crossed;

  function emit(type, data = {}) {
    events.push({ sequence: events.length, type, attemptId: state.attemptId, tick: state.tick, data });
  }

  function reset(name, attemptId) {
    const initial = spawn[name];
    phaseOffset = initial.phase;
    state = {
      attemptId, tick: 0,
      platform: liftAt(phaseOffset),
      avatar: { position: [...initial.avatar], supportSurface: initial.avatar[1] ? "upper" : "lower", fall: 0 },
      gate: { passable: hasGate && phaseOffset >= 285 && phaseOffset < 405 },
      cargoDelivered: false, outcome: "none",
    };
    if (hasCargo) state.box = { position: [...initial.crate], supportSurface: "lower", fall: 0 };
    crossed = { avatar: false, box: false };
    keys.clear();
  }

  function support(body, name) {
    const [x, y, z] = body.position;
    const [px, py] = state.platform.position;
    const liftContact = Math.abs(x - px) <= PLATFORM_LENGTH / 2 && Math.abs(z) <= PLATFORM_WIDTH / 2 &&
      Math.abs(y - py) < 0.07;
    const surface = liftContact ? "lift" : onDeck(x, y, z, LOW_DOCK) ? "lower" :
      onDeck(x, y, z, HIGH_DOCK) ? "upper" : null;
    if (body.supportSurface !== surface) {
      emit("contact_changed", { actorId: name, objectId: surface, previous: body.supportSurface });
      body.supportSurface = surface;
    }
    if (surface) {
      body.fall = 0;
      return;
    }
    body.fall += 0.012;
    body.position[1] -= body.fall;
  }

  function blocks(oldX, nextX, y, radius) {
    if (!hasGate || y < HIGH - 0.08 || state.gate.passable) return false;
    // A body already in the doorway can retreat to its original side.
    return (oldX < GATE_X && nextX > GATE_X - radius && nextX > oldX) ||
      (oldX > GATE_X && nextX < GATE_X + radius && nextX < oldX);
  }

  function carry(body, previous, name) {
    const held = body.supportSurface === "lift";
    const [x, y, z] = body.position;
    const adjacent = Math.abs(x - previous[0]) < 2.1 && Math.abs(y - previous[1]) < 0.1 && Math.abs(z) < 1.4;
    const remote = fault === "nearby_actor_teleported" && name === "avatar" && adjacent;
    if (!(held || remote) || (fault === "platform_moves_without_cargo" && name === "box")) return;
    for (let axis = 0; axis < 3; axis++) body.position[axis] += state.platform.position[axis] - previous[axis];
  }

  function walk(dx, dz) {
    const avatar = state.avatar;
    const [x, y, z] = avatar.position;
    const nextX = x + dx;
    const nextZ = z + dz;
    if (blocks(x, nextX, y, 0.19)) return;
    if (hasCargo) {
      const box = state.box.position;
      const contact = Math.abs(y - box[1]) < 0.17 && Math.abs(nextX - box[0]) < 0.5 && Math.abs(nextZ - box[2]) < 0.5;
      if (contact && (dx || dz)) {
        if (blocks(box[0], box[0] + dx, box[1], 0.31)) return;
        box[0] += dx;
        box[2] += dz;
      }
    }
    avatar.position = [nextX, y, nextZ];
  }

  function updateOutcome(previous, phaseTick) {
    for (const [name, body] of Object.entries(hasCargo ? { avatar: state.avatar, box: state.box } : { avatar: state.avatar })) {
      const [x, y] = body.position;
      if (!crossed[name] && previous[name] < GATE_X && x >= GATE_X && y >= HIGH - 0.08 && hasGate) {
        crossed[name] = true;
        emit("gate_crossed", { actorId: name, phaseTick });
      }
    }
    const atDelivery = body => body.position[0] >= DELIVERY_X && body.supportSurface === "upper";
    state.cargoDelivered = hasCargo && crossed.box && atDelivery(state.box);
    const won = task === "A03" ? state.avatar.supportSurface === "upper" :
      hasCargo ? state.cargoDelivered ||
        (fault === "avatar_counts_as_cargo" && crossed.avatar && atDelivery(state.avatar)) :
        crossed.avatar && atDelivery(state.avatar);
    const fell = state.avatar.position[1] < -1.25 || (hasCargo && state.box.position[1] < -1.25);
    if (!won && !fell) return;
    state.outcome = won ? "victory" : "failure";
    emit("outcome_changed", { outcome: state.outcome, cargoDelivered: state.cargoDelivered });
  }

  reset("default", 0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      const phaseTick = (state.tick + phaseOffset) % PERIOD;
      const prior = state.platform;
      state.platform = liftAt(phaseTick);
      if (prior.phase !== state.platform.phase) emit("platform_phase_changed", { phase: state.platform.phase, phaseTick });
      const passable = hasGate && phaseTick >= 285 &&
        (phaseTick < 405 || fault === "gate_stays_open_after_window");
      if (state.gate.passable !== passable) {
        state.gate.passable = passable;
        emit("door_state_changed", { passable, phaseTick });
      }
      const previous = { avatar: state.avatar.position[0], box: state.box?.position[0] };
      carry(state.avatar, prior.position, "avatar");
      if (hasCargo) carry(state.box, prior.position, "box");
      let dx = 0;
      let dz = 0;
      for (const key of keys) {
        const [x, z] = movement.get(key);
        dx += x;
        dz += z;
      }
      const speed = 0.06 / Math.max(1, Math.hypot(dx, dz));
      walk(dx * speed, dz * speed);
      support(state.avatar, "avatar");
      if (hasCargo) support(state.box, "box");
      updateOutcome(previous, phaseTick);
    },
    input(key, down) {
      if (down && key === "KeyR" && state.outcome === "failure") {
        reset("default", state.attemptId + 1);
        emit("attempt_restarted");
      }
      if (!movement.has(key)) return;
      if (down) keys.add(key);
      else keys.delete(key);
    },
    release() { keys.clear(); },
    getSnapshot() { return structuredClone(state); },
    getEvents(afterSequence = -1) { return structuredClone(events.filter(event => event.sequence > afterSequence)); },
    loadScenario(name) {
      if (!scenarios.includes(name)) return { ok: false, reason: "unknown_scenario" };
      reset(name, state.attemptId + 1);
      emit("scenario_loaded", { id: name });
      return { ok: true, reason: null };
    },
  };
}
