import { Game, HZ, OPENING_TICKS, UPPER_Y, layout } from "./simulation.js";
import { createView, fixedClock } from "./repair-view.js";

const node = id => document.getElementById(id);
const game = new Game();
const view = createView(node("viewport"), {
  background: 0x172225, eye: [11, 18, 23], focus: [0, 0.85, -2.4], width: 20, minHeight: 14.2,
});
const { box, deck, ramp } = view;
const center = rect => [(rect.x1 + rect.x2) / 2, (rect.z1 + rect.z2) / 2];
for (const surface of [layout.lower, layout.upper, layout.bridge, layout.exit]) {
  deck(surface.x1, surface.x2, surface.z1, surface.z2, surface.y,
    surface.id === layout.lower.id ? 0x51686a : 0x748d8b);
}
const [rampX, rampZ] = center(layout.ramp);
ramp([rampX, 0, layout.ramp.z2], [rampX, UPPER_Y, layout.ramp.z1],
  layout.ramp.x2 - layout.ramp.x1, 0x647f7e);
for (const x of [layout.ramp.x1 + 0.05, layout.ramp.x2 - 0.05]) {
  ramp([x, 0.52, layout.ramp.z2], [x, UPPER_Y + 0.52, layout.ramp.z1], 0.08, 0xc3a769, 0.07);
}
for (const rail of layout.bridgeRails) {
  const [x, z] = center(rail);
  box([rail.x2 - rail.x1, 0.48, rail.z2 - rail.z1], [x, UPPER_Y + 0.24, z], 0x435b5a);
}
for (const x of [layout.upper.x1 + 0.22, layout.upper.x2 - 0.22]) {
  for (const z of [-4.45, 0.46]) box([0.22, UPPER_Y, 0.22], [x, UPPER_Y / 2, z], 0x354b4a);
}
const [gateX, gateZ] = center(layout.gate);
const gateWidth = layout.gate.x2 - layout.gate.x1;
for (const x of [layout.gate.x1, layout.gate.x2]) {
  box([0.23, 2.2, 0.45], [x, UPPER_Y + 1.1, gateZ], 0x324a4a);
}
box([gateWidth, 0.18, 0.46], [gateX, UPPER_Y + 2.2, gateZ], 0x324a4a);
const panel = box([gateWidth - 0.17, 1.93, 0.29], [gateX, UPPER_Y + 0.965, gateZ], 0xbe7955);
const [goalX, goalZ] = center(layout.goal);
deck(layout.goal.x1, layout.goal.x2, layout.goal.z1, layout.goal.z2, UPPER_Y + 0.04, 0x6ebca4, 0.055);
function plate(layoutPlate, color) {
  return deck(layoutPlate.x1, layoutPlate.x2, layoutPlate.z1, layoutPlate.z2, layoutPlate.y + 0.055, color, 0.07);
}
const plateA = plate(layout.A, 0x9b7441);
const plateB = plate(layout.B, 0x487b76);
const crate = box([0.96, 0.96, 0.96], [0, 0, 0], 0xbb8749);
const player = view.actor(0x42746c, 0xf6c977);
const keys = new Set();
const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const [ax, az] = center(layout.A);
const [bx, bz] = center(layout.B);
const deckNames = { lower_deck: "LOWER DECK", ramp: "ACCESS RAMP", upper_deck: "UPPER DECK",
  exit_bridge: "GATE BRIDGE", exit_deck: "EXIT DECK" };

function signal(id, active) {
  const root = node(id);
  root.classList.toggle("active", active);
  root.querySelector("small").textContent = active ? "ONLINE" : "OFFLINE";
}
function draw() {
  const { avatar, box, plates, door, tick, dualActiveSinceTick, attemptId, outcome } = game.getSnapshot();
  player.position.set(...avatar.position);
  player.rotation.y = game.avatar.angle;
  crate.position.set(box.position[0], box.position[1] + 0.48, box.position[2]);
  plateA.material = view.material(plates.A.active ? 0xe2a449 : 0x9b7441, plates.A.active);
  plateB.material = view.material(plates.B.active ? 0x79dfca : 0x487b76, plates.B.active);
  const rise = door.unlocked ? Math.min(1, (tick - game.unlockTick) / OPENING_TICKS) : 0;
  panel.position.y = UPPER_Y + 0.965 + rise * 2;
  panel.visible = !door.passable;
  const status = node("gate-status");
  status.dataset.open = String(door.passable);
  status.querySelector("span").textContent = door.passable ? "Open" : door.unlocked ? "Opening" : "Locked";
  const charge = door.unlocked ? 120 : dualActiveSinceTick === null ? 0 : tick - dualActiveSinceTick;
  node("charge-track").setAttribute("aria-valuenow", String(charge));
  node("timer").textContent = (charge / HZ).toFixed(2) + " / 2.00 s";
  node("charge").style.transform = "scaleX(" + charge / 120 + ")";
  signal("signal-a", plates.A.active);
  signal("signal-b", plates.B.active);
  const progress = [plates.A.active || door.unlocked, door.passable, outcome === "victory"];
  const next = progress.indexOf(false);
  for (const [i, id] of ["step-a", "step-b", "step-exit"].entries()) {
    node(id).classList.toggle("done", progress[i]);
    node(id).classList.toggle("current", i === next);
  }
  node("attempt").textContent = "ATTEMPT " + String(attemptId + 1).padStart(2, "0");
  node("location").textContent = deckNames[avatar.supportSurface] ?? "AIRBORNE";
  node("end-screen").hidden = outcome === "none";
  node("end-screen").dataset.state = outcome;
  if (outcome !== "none") {
    const won = outcome === "victory";
    node("end-icon").textContent = won ? "✓" : "!";
    node("end-kicker").textContent = won ? "TRIAL COMPLETE" : "TRIAL INTERRUPTED";
    node("end-title").textContent = won ? "Access granted" : "Operator lost";
    node("end-detail").textContent = won ? "You reached the exit deck." : "You fell from the deck. Press R to retry.";
  }
  view.placeLabel(node("label-a"), ax, layout.A.y + 1.36, az);
  view.placeLabel(node("label-b"), bx, layout.B.y + 0.2, bz);
  view.placeLabel(node("label-exit"), goalX - 0.7, UPPER_Y + 0.38, goalZ);
  view.placeLabel(node("label-ramp"), rampX, UPPER_Y / 2 + 0.10, rampZ);
  view.draw();
}
const resetClock = fixedClock(HZ, () => game.step(keys), draw);

function restart() {
  keys.clear();
  game.reset("restart");
  resetClock();
}
addEventListener("keydown", event => {
  if (!event.isTrusted || event.altKey || event.metaKey || event.ctrlKey) return;
  if (movement.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  } else if (event.code === "KeyR" && !event.repeat) restart();
});
addEventListener("keyup", event => keys.delete(event.code));
addEventListener("blur", () => keys.clear());
node("restart").addEventListener("click", restart);
node("end-retry").addEventListener("click", restart);

window.__gameTest = {
  getSnapshot: () => game.getSnapshot(),
  getEvents: (after = -1) => game.getEvents(after),
  loadScenario(id) {
    const result = game.loadScenario(id);
    if (result.ok) {
      keys.clear();
      resetClock();
      draw();
    }
    return result;
  },
};
