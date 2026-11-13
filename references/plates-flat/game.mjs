import { createYard, WIDTH, HEIGHT, PLATE_A, PLATE_B, GATE, HAZARD } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "P02";
if (!["A02", "C02", "P02"].includes(task)) throw new Error("Choose A02, C02, or P02.");
const atom = task === "A02";
const fault = params.get("fault");
const game = createYard(task, fault);
window.__gameTest = { getSnapshot: game.getSnapshot, getEvents: game.getEvents, loadScenario: game.loadScenario };
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const cell = 66;
const xPx = x => canvas.width / 2 + x * cell;
const zPx = z => canvas.height / 2 + z * cell;

function fill(x, z, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(xPx(x - width / 2), zPx(z - height / 2), width * cell, height * cell);
}
function text(value, x, z, color = "#e0e9ea") {
  ctx.fillStyle = color;
  ctx.font = "bold 17px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(value, xPx(x), zPx(z));
}
const label = id => document.getElementById(id);
label("task").textContent = "PlayableWorld-Bench · " + task;
label("objective").textContent = atom ? "Push the crate onto plate A, then push it clear." :
  "Push the crate onto A. Walk around to B, hold both for two seconds, then take the gate to the exit.";
label("plate-b").parentElement.hidden = atom;
label("gate").parentElement.hidden = atom;

function draw() {
  const state = game.getSnapshot();
  ctx.fillStyle = "#232d38";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  fill(0, 0, WIDTH * 2, HEIGHT * 2, "#3f5665");
  for (let x = -5; x <= 5; x++) fill(x, 0, 0.01, HEIGHT * 2, "#4b6371");
  for (let z = -3; z <= 3; z++) fill(0, z, WIDTH * 2, 0.01, "#4b6371");
  fill(PLATE_A.x, PLATE_A.z, 0.76, 0.76, state.plates.A.active ? "#5ee5a4" : "#ffbc55");
  text("A", PLATE_A.x, PLATE_A.z - 0.55);
  const showsOpen = state.door.passable && fault !== "missing_door_feedback";
  if (!atom) {
    fill(PLATE_B.x, PLATE_B.z, 0.84, 0.84, state.plates.B.active ? "#5ee5a4" : "#4bacc9");
    text("B", PLATE_B.x, PLATE_B.z - 0.58);
    const passageStart = GATE.z - GATE.half;
    const passageEnd = GATE.z + GATE.half;
    fill(GATE.x, (passageStart - HEIGHT) / 2, 0.24, passageStart + HEIGHT, "#9cb6c2");
    fill(GATE.x, (passageEnd + HEIGHT) / 2, 0.24, HEIGHT - passageEnd, "#9cb6c2");
    if (!showsOpen) fill(GATE.x, GATE.z, 0.25, GATE.half * 2, "#f12383");
    fill(4.85, GATE.z, 1, 1, "#568e6a");
    text("EXIT", 4.85, GATE.z + 0.08);
    fill(HAZARD.x, HAZARD.z, 1, 1, "#772f34");
    text("DROP", HAZARD.x, HAZARD.z + 0.08, "#ffe2c3");
  }
  const [bx, , bz] = state.box.position;
  const [x, , z] = state.avatar.position;
  fill(bx, bz, 0.61, 0.61, "#d68846");
  fill(bx, bz, 0.43, 0.43, "#f2aa65");
  ctx.beginPath();
  ctx.arc(xPx(x), zPx(z), cell * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#65e8ff";
  ctx.fill();
  label("plate-a").textContent = state.plates.A.active ? "Active" : "Idle";
  label("plate-b").textContent = state.plates.B.active ? "Active" : "Idle";
  label("gate").textContent = showsOpen ? "Open" : "Locked";
  label("status").textContent = { none: "In progress", failure: "Fall detected. Press R to retry.", victory: "Exit reached" }[state.outcome];
}

addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) game.keyDown(event.code); });
addEventListener("keyup", event => { if (event.isTrusted) game.keyUp(event.code); });
addEventListener("blur", game.blur);
const interval = 1000 / 60;
let last;
let pending = 0;
function frame(now) {
  pending += Math.min(150, now - (last ?? now));
  last = now;
  while (pending >= interval) {
    game.tick();
    pending -= interval;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
