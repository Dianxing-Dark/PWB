export const HEIGHT = 2.4;
export const deck = (id, x, z, from, to = from) => ({ id, x, z, from, to });
const lower = deck("lower", [-5, 5.2], [-1.95, 1.95], 0);
export const layouts = {
  A04: {
    decks: [lower, deck("slope", [-2.3, 1], [-0.65, 0.65], 0, HEIGHT),
      deck("upper", [1, 4.4], [-0.9, 0.9], HEIGHT)],
    spawn: [-3.5, 0, 0],
    local: {
      slope_start: { pos: [-2.72, 0, 0], surface: "lower" },
      slope_mid: { pos: [-0.25, 2.05 * HEIGHT / 3.3, 0], surface: "slope" },
    },
    instructions: "Walk uphill to the upper deck. Step off either side of the ramp to land below.",
  },
  A09: {
    decks: [lower, deck("upper", [-3.2, 0.4], [-0.96, 0.96], HEIGHT)],
    spawn: [-2, HEIGHT, 0],
    local: {
      upper_drop: { pos: [-0.67, HEIGHT, 0], surface: "upper" },
      lower_reverse: { pos: [1.4, 0, 0], surface: "lower" },
    },
    instructions: "Walk past the amber edge to land below. Turn around and walk underneath the ledge.",
  },
};
export const heightAt = (deck, x) => deck.from + (deck.to - deck.from) * (x - deck.x[0]) / (deck.x[1] - deck.x[0]);
const controls = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
const between = (x, [lo, hi]) => x >= lo && x <= hi;

export function createWorld(task, fault) {
  const layout = layouts[task];
  const held = new Set();
  const log = [];
  let state;
  let gravity;

  function start(pos, surface, attemptId) {
    state = { attemptId, tick: 0, avatar: { position: [...pos], supportSurface: surface }, outcome: "none" };
    gravity = 0;
    held.clear();
  }
  function emit(type, data) {
    log.push({ type, data, sequence: log.length, attemptId: state.attemptId, tick: state.tick });
  }
  function begin(attemptId) {
    start(layout.spawn, task === "A04" ? "lower" : "upper", attemptId);
  }
  begin(0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      const delta = [0, 0];
      for (const key of held) {
        delta[0] += controls[key][0];
        delta[1] += controls[key][1];
      }
      const stride = 0.048 / Math.max(1, Math.hypot(...delta));
      const [x, y, z] = state.avatar.position;
      const nx = x + delta[0] * stride;
      let nz = z + delta[1] * stride;
      const previous = state.avatar.supportSurface;
      if (fault === "invisible_ramp_rail" && previous === "slope") nz = Math.max(-0.64, Math.min(0.64, nz));
      gravity -= 0.009;
      const nextY = y + gravity;
      const planes = layout.decks.filter(deck => between(nx, deck.x) && between(nz, deck.z))
        .map(deck => ({ id: deck.id, y: heightAt(deck, nx) }))
        .filter(plane => (fault === "reverse_clips_to_upper" || plane.y <= y + 0.055) &&
          plane.y >= (previous ? y - 0.055 : nextY));
      const support = planes.reduce((highest, plane) => !highest || plane.y > highest.y ? plane : highest, null);
      if (support) gravity = 0;
      const surface = support?.id ?? null;
      state.avatar = { position: [nx, support?.y ?? nextY, nz], supportSurface: surface };
      if (surface !== previous) emit("contact_changed", { actorId: "avatar", objectId: surface, previous });
      if (state.avatar.position[1] < -1.25) {
        state.outcome = "failure";
        emit("outcome_changed", { outcome: "failure" });
      }
    },
    input(code, down) {
      if (code === "KeyR" && down && state.outcome === "failure") {
        begin(state.attemptId + 1);
        emit("attempt_restarted", {});
      }
      if (!Object.hasOwn(controls, code)) return;
      if (down) held.add(code);
      else held.delete(code);
    },
    release() { held.clear(); },
    getSnapshot() { return structuredClone(state); },
    getEvents(sequence = -1) { return structuredClone(log.filter(event => event.sequence > sequence)); },
    loadScenario(id) {
      if (!Object.hasOwn(layout.local, id)) return { ok: false, reason: "unknown_scenario" };
      const { pos, surface } = layout.local[id];
      start(pos, surface, state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
