import { HEIGHT, decks, deckY, toWorld, checkpointPads, trapPads, consoles, exit } from "./geometry.mjs";

export const tasks = {
  A10: "Step onto either checkpoint. Leave the deck, then press R to return.",
  C07: "Register a checkpoint and test a trap. Press R to return to the last registered deck.",
  C12: "Use E at the blue service console. Take the ramp to the gallery, register the checkpoint, and activate the relay with E before taking the exit.",
};
const start = [-4.1, 0, 0];
const scenarioStarts = {
  approach_lower: [-0.52, 0, 0],
  approach_upper: [-0.52, HEIGHT, 0],
  lower_trap_route: [1.85, 0, 0],
  upper_trap_route: [1.85, HEIGHT, 0.92],
  upper_safe_projection: [1.85, HEIGHT, 0],
};
const registered = {
  lower_trap_route: "lower",
  upper_trap_route: "upper",
  upper_safe_projection: "upper",
};
const directions = { KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1] };
const close = (p, [s, y, t], radius) => Math.abs(p[1] - y) < 0.1 &&
  Math.max(Math.abs(p[0] - s), Math.abs(p[2] - t)) <= radius;

function supportedAt(s, t, feet, limit) {
  const candidates = decks.filter(deck => s >= deck.s[0] && s <= deck.s[1] && t >= deck.t[0] && t <= deck.t[1])
    .map(deck => ({ id: deck.id, y: deckY(deck, s) }))
    .filter(surface => surface.y >= limit && surface.y <= feet + 0.075);
  return candidates.reduce((top, candidate) => !top || candidate.y > top.y ? candidate : top, null);
}

export function createGallery(task) {
  const inputs = new Set();
  const log = [];
  const progress = { power: false, checkpoint: null };
  let attemptId = 0;
  let body;
  let tick;
  let outcome;
  let relay;
  let use = false;

  function emit(type, data) {
    log.push({ type, data, tick, attemptId, sequence: log.length });
  }
  function reset(position) {
    body = { position: [...position], velocityY: 0, surface: position[1] ? "gallery" : "service" };
    tick = 0;
    outcome = "none";
    relay = false;
    use = false;
    inputs.clear();
  }

  function advance() {
    const [s, y, t] = body.position;
    const ds = Number(inputs.has("KeyS")) - Number(inputs.has("KeyW"));
    const dt = Number(inputs.has("KeyD")) - Number(inputs.has("KeyA"));
    const stride = 0.061 / Math.max(1, Math.hypot(ds, dt));
    const nextS = s + stride * ds;
    const nextT = t + stride * dt;
    body.velocityY -= 0.012;
    const nextY = y + body.velocityY;
    const surface = supportedAt(nextS, nextT, y, body.surface ? y - 0.075 : nextY);
    body.surface = surface?.id ?? null;
    body.position = [nextS, surface?.y ?? nextY, nextT];
    if (surface) body.velocityY = 0;
  }

  function updateRules() {
    const { position } = body;
    const floor = body.surface === "service" ? "lower" : body.surface === "gallery" ? "upper" : null;
    if (floor && floor !== progress.checkpoint && close(position, checkpointPads[floor], 0.38)) {
      progress.checkpoint = floor;
      emit("checkpoint_registered", { id: floor, position: toWorld(checkpointPads[floor]) });
    }
    if (task === "C12" && use) {
      if (!progress.power && close(position, consoles.lower_power, 0.48)) {
        progress.power = true;
        emit("control_changed", { id: "lower_power", active: true });
      } else if (progress.power && !relay && close(position, consoles.upper_switch, 0.48)) {
        relay = true;
        emit("control_changed", { id: "upper_switch", active: true });
      }
    }
    use = false;
    const hitTrap = task !== "A10" && floor && close(position, trapPads[floor], 0.34);
    if (hitTrap || position[1] < -1.35) {
      outcome = "failure";
      emit("outcome_changed", { outcome, cause: hitTrap ? floor + "_trap" : "fall" });
    } else if (task === "C12" && progress.power && relay && close(position, exit, 0.39)) {
      outcome = "victory";
      emit("outcome_changed", { outcome });
    }
  }

  reset(start);
  return {
    step() {
      if (outcome !== "none") return;
      tick++;
      advance();
      updateRules();
    },
    input(code, down) {
      if (code === "KeyR" && down && outcome === "failure") {
        attemptId++;
        reset(checkpointPads[progress.checkpoint] ?? start);
        emit("attempt_restarted", { checkpointId: progress.checkpoint });
      }
      if (code === "KeyE" && down) use = true;
      if (!Object.hasOwn(directions, code)) return;
      if (down) inputs.add(code);
      else inputs.delete(code);
    },
    release() { inputs.clear(); use = false; },
    getSnapshot() {
      return {
        tick, attemptId, outcome, lowerPowered: progress.power, upperSwitchOn: relay,
        avatar: { position: toWorld(body.position), supportSurface: body.surface },
        checkpoint: { id: progress.checkpoint,
          position: progress.checkpoint ? toWorld(checkpointPads[progress.checkpoint]) : null },
      };
    },
    getEvents(afterSequence = -1) { return structuredClone(log.filter(event => event.sequence > afterSequence)); },
    loadScenario(id) {
      if (!Object.hasOwn(scenarioStarts, id) || id.startsWith("approach_") !== (task === "A10")) {
        return { ok: false, reason: "unknown_scenario" };
      }
      attemptId++;
      progress.checkpoint = registered[id] ?? null;
      progress.power = false;
      reset(scenarioStarts[id]);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
