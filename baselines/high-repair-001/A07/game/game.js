import { Simulation, layout, HZ, OPEN_TICKS } from "./simulation.js";
import { createView, fixedClock } from "./repair-view.js";

const node = id => document.getElementById(id);
const sim = new Simulation();
const view = createView(node("viewport"), {
  background: 0xdbe6e3, eye: [5, 13, 19], focus: [0, 0.7, 0], width: 25.5, minHeight: 10.5,
});
const { deckY: y, deckHalfWidth: half, rampStart, rampEnd, end, gateX, switchX, switchZ,
  floorMinX, floorMaxX, floorMinZ, floorMaxZ } = layout;
const { box, deck, ramp } = view;
deck(floorMinX, floorMaxX, floorMinZ, floorMaxZ, 0, 0x99aeb0);
deck(rampEnd, end, -half, half, y, 0x688585);
ramp([rampStart, 0, 0], [rampEnd, y, 0], half * 2, 0x789697);
for (const z of [-half + 0.06, half - 0.06]) {
  ramp([rampStart, 0.06, z], [rampEnd, y + 0.06, z], 0.08, 0xf6b44b, 0.035);
  box([end - rampEnd, 0.14, 0.12], [(rampEnd + end) / 2, y + 0.065, z], 0x476566);
  for (const x of [-4.75, 0, 4.6, 7.8]) box([0.22, y, 0.24], [x, y / 2, z], 0x57777a);
  box([0.23, 2.05, 0.22], [gateX, y + 1.025, z], 0x354e4e);
}
box([0.23, 0.21, half * 2], [gateX, y + 2.05, 0], 0x354e4e);
const gate = box([0.15, 1.58, 2 * half - 0.23], [gateX, y + 0.8, 0], 0xbc542d);
box([0.52, 0.47, 0.39], [switchX, y + 0.24, switchZ], 0x375655);
const indicator = box([0.36, 0.08, 0.28], [switchX, y + 0.5, switchZ], 0xf5b451);
const exit = end - 1.1;
box([1.37, 0.07, 1.65], [exit, y + 0.04, 0], 0x58b08e);
const player = view.actor(0x345c55, 0xf9bd54);
const held = new Set();
const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const keyHints = document.querySelectorAll("[data-key]");
let interact = false;

function clear() {
  held.clear();
  interact = false;
}
function draw() {
  const state = sim.snapshot();
  const [x, height, z] = state.avatar.position;
  player.position.set(x, height, z);
  player.rotation.y = sim.avatar.facing;
  gate.visible = !state.gate.open;
  indicator.material = view.material(state.gate.open ? 0x4ba987 : 0xf5b451, true);
  const remaining = state.gate.open ? Math.max(0, OPEN_TICKS - (state.tick - state.gate.openedAt)) : 0;
  node("gate-state").textContent = state.gate.open ? "Open" : "Closed";
  node("gate-time").textContent = (remaining / HZ).toFixed(2) + " s";
  node("telemetry").dataset.open = String(state.gate.open);
  node("meter-fill").style.transform = "scaleX(" + remaining / OPEN_TICKS + ")";
  const prompt = node("prompt");
  const canOpen = sim.nearSwitch() && !state.gate.open && state.outcome !== "victory";
  prompt.hidden = !canOpen;
  prompt.style.visibility = canOpen ? "visible" : "hidden";
  node("switch-label").style.visibility = canOpen ? "hidden" : "visible";
  node("exit-label").style.visibility = "visible";
  for (const hint of keyHints) hint.dataset.held = String(held.has(hint.dataset.key));
  node("mission-label").textContent = state.outcome === "victory" ? "COMPLETE" : "OBJECTIVE";
  node("mission").dataset.victory = String(state.outcome === "victory");
  node("mission-text").textContent = state.outcome === "victory" ? "Gate cleared. Press R to play again."
    : state.gate.open ? "Cross the gate before the timer expires."
    : state.avatar.supportSurface === "upper_walkway" ? "Approach the switch and press E."
    : "Take the ramp to the upper switch.";
  view.placeLabel(node("switch-label"), switchX, y + 0.95, switchZ);
  view.placeLabel(node("exit-label"), exit, y + 0.16, 0);
  if (canOpen) view.placeLabel(prompt, x, height + 1.17, z);
  view.draw();
}
const resetClock = fixedClock(HZ, () => {
  const dx = Number(held.has("KeyD")) - Number(held.has("KeyA"));
  const dz = Number(held.has("KeyS")) - Number(held.has("KeyW"));
  sim.step(dx, dz, interact);
  interact = false;
}, draw);

function restart() {
  clear();
  sim.restart();
  resetClock();
}
addEventListener("keydown", event => {
  if (!event.isTrusted || event.altKey || event.metaKey || event.ctrlKey) return;
  if (movement.has(event.code)) {
    event.preventDefault();
    held.add(event.code);
  } else if (event.code === "KeyE" && !event.repeat) {
    event.preventDefault();
    interact = true;
  } else if (event.code === "KeyR" && !event.repeat) restart();
});
addEventListener("keyup", event => held.delete(event.code));
addEventListener("blur", clear);
node("restart").addEventListener("click", restart);
for (const button of document.querySelectorAll("[data-input]")) {
  const code = button.dataset.input;
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (code === "KeyE") interact = true;
    else held.add(code);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, () => held.delete(code));
  }
}

window.__gameTest = {
  getSnapshot: () => sim.snapshot(),
  getEvents: (after = -1) => structuredClone(sim.events.filter(event => event.sequence > after)),
  loadScenario(id) {
    const result = sim.loadScenario(id);
    if (result.ok) {
      clear();
      resetClock();
      draw();
    }
    return result;
  },
};
