const HEIGHT = 2.3;
const makeDeck = (id, x, z, from, to = from) => ({ id, x, z, from, to });
const floor = makeDeck("lower", [-6.05, 7.9], [-1.95, 1.95], 0);
const westRamp = makeDeck("west_ramp", [-5.1, -2.2], [-0.62, 0.62], 0, HEIGHT);
const deck = makeDeck("upper", [-2.2, 4.7], [-0.82, 0.82], HEIGHT);
const span = makeDeck("bridge", [-0.9, 1.05], [-0.62, 0.62], HEIGHT);
const eastRamp = makeDeck("east_ramp", [4.7, 7.4], [-0.62, 0.62], HEIGHT, 0);
const point = (x, y, z = 0) => [x, y, z];
const spawn = point(-5.65, 0);
const empty = { ore: 0, fiber: 0, kit: 0 };
const both = { ore: 1, fiber: 1, kit: 0 };
const kit = { ore: 0, fiber: 0, kit: 1 };
const openTicks = 120;

export const layouts = {
  A07: {
    decks: [floor, westRamp, deck],
    start: { point: spawn, surface: "lower" },
    objects: { gate: point(0.42, HEIGHT), switch: point(-1.48, HEIGHT) },
    scenarios: {
      gate_approach: { point: point(-1.48, HEIGHT), surface: "upper" },
      below_gate: { point: point(-0.9, 0), surface: "lower" },
    },
    title: "Timing Bay",
    instructions: "Walk up the west ramp, press E beside the blue switch, then cross while the gate is open.",
  },
  C06: {
    decks: [floor, westRamp, deck],
    start: { point: spawn, surface: "lower" },
    objects: { ore: point(-1.85, 0, 1.23), fiber: point(-0.72, HEIGHT), bench: point(0.78, HEIGHT),
      delivery: point(3.72, HEIGHT) },
    scenarios: {
      bench_with_ore: { point: point(0.78, HEIGHT), surface: "upper", inventory: { ...empty, ore: 1 } },
      bench_ready: { point: point(0.78, HEIGHT), surface: "upper", inventory: both },
      under_delivery: { point: point(3.72, 0), surface: "lower", inventory: kit },
      at_delivery: { point: point(3.72, HEIGHT), surface: "upper", inventory: kit },
    },
    title: "Assembly Bay",
    instructions: "Press E near the mineral below, fiber above, the assembly bench, and finally the delivery pad.",
  },
  C10: {
    decks: [floor, westRamp, makeDeck("west", [-2.2, -0.9], [-0.82, 0.82], HEIGHT), span,
      makeDeck("east", [1.05, 4.7], [-0.82, 0.82], HEIGHT), eastRamp],
    start: { point: point(-1.56, HEIGHT), surface: "west" },
    objects: { bridge: point(0.075, HEIGHT), switch: point(-1.56, HEIGHT), exit: point(3.66, HEIGHT) },
    scenarios: { before_bridge: { point: point(-1.56, HEIGHT), surface: "west" } },
    title: "Bridge Bay",
    instructions: "Press E on the west pad to retract the bridge. Descend the west ramp and climb the east ramp to reach the exit.",
  },
};

export const heightAt = (d, x) => d.from + (d.to - d.from) * (x - d.x[0]) / (d.x[1] - d.x[0]);
const axes = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
const overlaps = (value, [min, max]) => value >= min && value <= max;

export function createWorld(task, fault) {
  const layout = layouts[task];
  const held = new Set();
  const log = [];
  let state;
  let vertical;
  let interact;

  function reset(entry, attemptId) {
    state = {
      attemptId, tick: 0, avatar: { position: [...entry.point], supportSurface: entry.surface },
      outcome: "none", action: null,
    };
    for (const [id, position] of Object.entries(layout.objects)) state[id] = { position: [...position] };
    if (task === "A07") Object.assign(state.gate, { open: false, openedAt: null });
    if (task === "C06") {
      state.inventory = { ...(entry.inventory ?? empty) };
      for (const id of ["ore", "fiber"]) state[id].collected = Boolean(state.inventory[id] || state.inventory.kit);
    }
    if (task === "C10") state.bridge.extended = true;
    held.clear();
    interact = false;
    vertical = 0;
  }
  function emit(type, data) {
    log.push({ sequence: log.length, type, attemptId: state.attemptId, tick: state.tick, data });
  }
  function near(id, verticalCheck = true) {
    const [x, y, z] = state.avatar.position;
    const [cx, cy, cz] = state[id].position;
    return (!verticalCheck || Math.abs(y - cy) < 0.1) &&
      Math.hypot(x - cx, z - cz) <= 0.57 && Boolean(state.avatar.supportSurface);
  }
  function gate(open) {
    state.gate.open = open;
    state.gate.openedAt = open ? state.tick : null;
    emit("gate_changed", { open });
  }
  function win(cause) {
    state.outcome = "victory";
    emit("outcome_changed", { outcome: "victory", cause });
  }
  function assemble() {
    const inventory = state.inventory;
    for (const id of ["ore", "fiber"]) {
      if (!state[id].collected && near(id)) {
        inventory[id]++;
        state[id].collected = true;
        state.action = id === "ore" ? "Mineral collected" : "Fiber collected";
        emit("material_collected", { id });
        return;
      }
    }
    if (near("bench") && inventory.ore === 1 && (inventory.fiber === 1 || fault === "recipe_ignores_fiber") && !inventory.kit) {
      const before = { ...inventory };
      if (fault !== "ingredients_retained") {
        inventory.ore = 0;
        inventory.fiber = 0;
      }
      inventory.kit++;
      emit("kit_crafted", { id: "kit", before, after: { ...inventory } });
      state.action = "Kit assembled";
    } else if (inventory.kit && near("delivery", fault !== "delivery_ignores_height")) {
      inventory.kit--;
      emit("kit_delivered", { id: "kit", remaining: inventory.kit });
      state.action = "Kit delivered";
      win("delivery");
    }
  }
  function handleInteraction() {
    if (task === "A07" && near("switch") && (!state.gate.open || fault === "window_extends_on_repeat")) gate(true);
    if (task === "C06") assemble();
    if (task === "C10" && state.bridge.extended && near("switch")) {
      state.bridge.extended = false;
      emit("bridge_changed", { extended: false });
    }
  }
  function move() {
    const delta = [0, 0];
    for (const key of held) {
      delta[0] += axes[key][0];
      delta[1] += axes[key][1];
    }
    const step = 0.052 / Math.max(1, Math.hypot(...delta));
    const [x, y, z] = state.avatar.position;
    let nx = Math.max(-5.96, Math.min(7.8, x + delta[0] * step));
    const nz = Math.max(-1.86, Math.min(1.86, z + delta[1] * step));
    if (task === "A07" && !state.gate.open && fault !== "gate_missing_collision" &&
        Math.abs(y - HEIGHT) < 0.08 && overlaps(nz, [-0.97, 0.97])) {
      const gateX = state.gate.position[0];
      nx = x < gateX ? Math.min(gateX - 0.18, nx) : Math.max(gateX + 0.18, nx);
    }
    const before = state.avatar.supportSurface;
    vertical -= 0.014;
    const planes = layout.decks.filter(d => overlaps(nx, d.x) && overlaps(nz, d.z) &&
      (d.id !== "bridge" || state.bridge.extended || fault === "hidden_bridge_support"))
      .map(d => ({ id: d.id, y: heightAt(d, nx) }))
      .filter(d => d.y <= y + 0.068 && d.y >= y + (before ? -0.068 : vertical));
    const support = planes.reduce((highest, d) => !highest || d.y > highest.y ? d : highest, null);
    if (support) vertical = 0;
    state.avatar = { position: [nx, support?.y ?? y + vertical, nz], supportSurface: support?.id ?? null };
    if (before !== state.avatar.supportSurface) emit("contact_changed", { objectId: state.avatar.supportSurface });
  }
  reset(layout.start, 0);
  return {
    step() {
      if (state.outcome !== "none") return;
      state.tick++;
      const expiry = fault === "gate_closes_early" ? 92 : openTicks;
      if (task === "A07" && state.gate.open && state.tick >= state.gate.openedAt + expiry) gate(false);
      move();
      if (interact) handleInteraction();
      interact = false;
      if (task === "C10" && near("exit", fault !== "exit_ignores_height")) win("exit");
    },
    input(code, down) {
      if (code === "KeyE" && down) interact = true;
      if (!Object.hasOwn(axes, code)) return;
      if (down) held.add(code);
      else held.delete(code);
    },
    release() { held.clear(); interact = false; },
    getSnapshot() { return structuredClone(state); },
    getEvents(after = -1) { return structuredClone(log.filter(e => e.sequence > after)); },
    loadScenario(id) {
      if (!Object.hasOwn(layout.scenarios, id)) return { ok: false, reason: "unknown_scenario" };
      reset(layout.scenarios[id], state.attemptId + 1);
      emit("scenario_loaded", { id });
      return { ok: true, reason: null };
    },
  };
}
