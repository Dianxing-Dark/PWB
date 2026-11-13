export const PERIOD = 600;
export const LOW = [-0.75, 0, -0.45];
export const HIGH = [4.05, 2.65, -0.45];
export const LIFT_SIZE = [3.5, 2.55];
export const GATE = 6.79;
export const DELIVERY = 8.55;
export const docks = {
  lower: { min: -5.5, max: -2.5, y: 0, z: -0.45, half: 1.46 },
  upper: { min: 5.8, max: 9.65, y: 2.65, z: -0.45, half: 1.46 },
};
export const objectives = {
  A03: "Take the shuttle from the lower dock and step onto the upper dock.",
  C03: "Ride to the upper dock and reach the exit while the checkpoint is open.",
  P04: "Push the crate onto the shuttle. Ride with it, then push it through the timed checkpoint onto the delivery pad.",
};

const motion = { KeyA: [1, 0], KeyD: [-1, 0], KeyW: [0, -1], KeyS: [0, 1] };
const entries = {
  default: { avatar: -4.72, crate: -3.52, phase: 0 },
  low_dock_before_departure: { avatar: -3.23, crate: -4.8, phase: 0 },
  adjacent_low_ledge: { avatar: -2.82, crate: -4.8, phase: 110 },
  high_dock_before_gate_opens: { avatar: 6.23, crate: -4.8, phase: 270, upper: true },
  high_dock_before_gate_closes: { avatar: 6.23, crate: -4.8, phase: 389, upper: true },
  high_gate_without_cargo: { avatar: 6.23, crate: -4.8, phase: 270, upper: true },
  cargo_ready_to_load: { avatar: -3.86, crate: -3.18, phase: 0 },
};
const publicScenarios = {
  low_dock_before_departure: ["A03", "C03", "P04"],
  adjacent_low_ledge: ["A03", "C03", "P04"],
  high_dock_before_gate_opens: ["C03", "P04"],
  high_dock_before_gate_closes: ["C03", "P04"],
  cargo_ready_to_load: ["P04"],
  high_gate_without_cargo: ["P04"],
};

function platformAt(phaseTick) {
  const phase = phaseTick < 120 ? "lowDock" : phaseTick < 270 ? "outbound" :
    phaseTick < 450 ? "highDock" : "inbound";
  const linear = { lowDock: 0, outbound: (phaseTick - 120) / 150,
    highDock: 1, inbound: (600 - phaseTick) / 150 }[phase];
  const progress = linear * linear * (3 - 2 * linear);
  return {
    phase, phaseTick,
    point: [
      LOW[0] + (HIGH[0] - LOW[0]) * progress,
      LOW[1] + (HIGH[1] - LOW[1]) * progress,
      LOW[2] + 1.4 * Math.sin(Math.PI * progress),
    ],
  };
}

const worldPosition = ([s, y, z]) => [-s, y, z];
const origin = (surface, lift) => surface === "lift" ? lift.point : [0, 0, 0];

function position(body, lift) {
  const parent = origin(body.surface, lift);
  return body.local.map((value, axis) => value + parent[axis]);
}

function place(body, point, surface, lift) {
  const parent = origin(surface, lift);
  body.surface = surface;
  body.local = point.map((value, axis) => value - parent[axis]);
}

export function createShuttle(task, fault) {
  const cargo = task === "P04";
  const gated = task !== "A03";
  const held = new Set();
  const history = [];
  let state;

  function emit(type, data = {}) {
    history.push({ sequence: history.length, attemptId: state.attemptId, tick: state.tick, type, data });
  }

  function fresh(name, attemptId) {
    const entry = entries[name];
    const dock = entry.upper ? "upper" : "lower";
    state = {
      attemptId, tick: 0, offset: entry.phase, lift: platformAt(entry.phase),
      bodies: {
        avatar: { local: [entry.avatar, docks[dock].y, docks[dock].z], surface: dock, gravity: 0, crossed: false },
      },
      passable: gated && entry.phase >= 285 && entry.phase < 405,
      cargoDelivered: false, outcome: "none",
    };
    if (cargo) state.bodies.box = { local: [entry.crate, 0, LOW[2]], surface: "lower", gravity: 0, crossed: false };
    held.clear();
  }

  function surfaceAt([s, y, z]) {
    const [ls, ly, lz] = state.lift.point;
    if (fault !== "decorative_lift" && Math.abs(s - ls) <= LIFT_SIZE[0] / 2 &&
      Math.abs(z - lz) <= LIFT_SIZE[1] / 2 && Math.abs(y - ly) < 0.05) return "lift";
    for (const [name, dock] of Object.entries(docks)) {
      if (s >= dock.min && s <= dock.max && Math.abs(z - dock.z) <= dock.half && Math.abs(y - dock.y) < 0.05) return name;
    }
    return null;
  }

  function commit(body, name, point) {
    const before = body.surface;
    const next = surfaceAt(point);
    if (next !== before) emit("contact_changed", { actorId: name, objectId: next, previous: before });
    if (next) body.gravity = 0;
    else {
      body.gravity += 0.014;
      point[1] -= body.gravity;
    }
    place(body, point, next, state.lift);
  }

  function canMove([s, y], [next], radius) {
    if (!gated || state.passable || y < HIGH[1] - 0.05) return true;
    if (s <= GATE && next > s) return next <= GATE - radius;
    if (s >= GATE && next < s) return next >= GATE + radius;
    return true;
  }

  function move(s, z, points) {
    const avatar = points.avatar;
    const next = [avatar[0] + s, avatar[1], avatar[2] + z];
    if (!canMove(avatar, next, 0.17)) return;
    const box = points.box;
    if (box && Math.abs(box[1] - next[1]) < 0.12 && Math.hypot(box[0] - next[0], box[2] - next[2]) < 0.5) {
      const pushed = [box[0] + s, box[1], box[2] + z];
      if (!canMove(box, pushed, 0.26)) return;
      points.box = pushed;
    }
    points.avatar = next;
  }

  function step() {
    if (state.outcome !== "none") return;
    const previous = state.lift;
    const bodies = Object.entries(state.bodies);
    const origins = Object.fromEntries(bodies.map(([id, body]) => [id, position(body, previous)]));
    state.tick++;
    const phaseTick = (state.tick + state.offset) % PERIOD;
    state.lift = platformAt(phaseTick);
    if (state.lift.phase !== previous.phase) emit("platform_phase_changed", { phase: state.lift.phase, phaseTick });
    const passable = gated && phaseTick >= 285 && (phaseTick < 405 || fault === "gate_stays_open_after_window");
    if (state.passable !== passable) {
      state.passable = passable;
      emit("door_state_changed", { passable, phaseTick });
    }
    const points = Object.fromEntries(bodies.map(([id, body]) => [id, position(body, state.lift)]));
    if (fault === "platform_moves_without_cargo" && state.bodies.box?.surface === "lift" &&
      state.lift.phase === "outbound") points.box = origins.box;
    if (fault === "nearby_actor_teleported" && state.bodies.avatar.surface === "lower" &&
      state.lift.phase === "outbound" && Math.abs(origins.avatar[0] - previous.point[0]) < 2.25) {
      points.avatar = origins.avatar.map((value, axis) => value + state.lift.point[axis] - previous.point[axis]);
    }
    const ds = Number(held.has("KeyA")) - Number(held.has("KeyD"));
    const dz = Number(held.has("KeyS")) - Number(held.has("KeyW"));
    if (ds || dz) {
      const stride = 0.064 / Math.hypot(ds, dz);
      move(ds * stride, dz * stride, points);
    }
    for (const [id, body] of bodies) {
      commit(body, id, points[id]);
      if (gated && !body.crossed && body.surface === "upper" && origins[id][0] < GATE && points[id][0] >= GATE) {
        body.crossed = true;
        emit("gate_crossed", { actorId: id, phaseTick });
      }
    }
    const delivered = id => state.bodies[id].crossed && state.bodies[id].surface === "upper" &&
      points[id][0] >= DELIVERY && Math.abs(points[id][2] - HIGH[2]) <= 0.92;
    state.cargoDelivered = cargo && delivered("box");
    const won = task === "A03" ? state.bodies.avatar.surface === "upper" :
      cargo ? state.cargoDelivered || (fault === "avatar_counts_as_cargo" && delivered("avatar")) : delivered("avatar");
    const fell = Object.values(points).some(point => point[1] < -1.1);
    if (won || fell) {
      state.outcome = won ? "victory" : "failure";
      emit("outcome_changed", { outcome: state.outcome, cargoDelivered: state.cargoDelivered });
    }
  }

  fresh("default", 0);
  return {
    step,
    input(key, down) {
      if (key === "KeyR" && down && state.outcome === "failure") {
        fresh("default", state.attemptId + 1);
        emit("attempt_restarted");
      }
      if (!Object.hasOwn(motion, key)) return;
      if (down) held.add(key);
      else held.delete(key);
    },
    release() { held.clear(); },
    getSnapshot() {
      const { phase, phaseTick, point } = state.lift;
      return {
        attemptId: state.attemptId, tick: state.tick,
        platform: { phase, phaseTick, position: worldPosition(point) },
        gate: { passable: state.passable }, cargoDelivered: state.cargoDelivered, outcome: state.outcome,
        ...Object.fromEntries(Object.entries(state.bodies).map(([id, body]) =>
          [id, { position: worldPosition(position(body, state.lift)), supportSurface: body.surface }])),
      };
    },
    getEvents(afterSequence = -1) { return structuredClone(history.filter(event => event.sequence > afterSequence)); },
    loadScenario(name) {
      if (!Object.hasOwn(publicScenarios, name) || !publicScenarios[name].includes(task)) {
        return { ok: false, reason: "unknown_scenario" };
      }
      fresh(name, state.attemptId + 1);
      emit("scenario_loaded", { id: name });
      return { ok: true, reason: null };
    },
  };
}
