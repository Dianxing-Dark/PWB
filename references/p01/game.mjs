import * as THREE from "three";
import { createSimulation, geometry, GATE_X, GATE_Z, GAP, TOP, TICK_RATE } from "./simulation.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "P01";
if (!["A01", "C01", "P01"].includes(task)) throw new Error("Choose A01, C01, or P01.");
const atom = task === "A01";
const fault = params.get("fault") ?? "";
const game = createSimulation(fault, task);
document.querySelector(".caption").textContent = "PlayableWorld-Bench · " + task;
if (atom) {
  document.querySelector(".objective").textContent = "Push the crate onto plate A, then push it clear.";
  document.querySelector("#plate-b").parentElement.hidden = true;
  document.querySelector("#gate").parentElement.hidden = true;
}
window.__gameTest = {
  getSnapshot: game.getSnapshot,
  getEvents: game.getEvents,
  loadScenario: game.loadScenario,
};

const mount = document.querySelector("#world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x152739);
const camera = new THREE.PerspectiveCamera(39, 16 / 9, 0.1, 100);
camera.position.set(4.5, 12.5, -15.5);
camera.lookAt(-1.1, 0.8, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
mount.append(renderer.domElement);
new ResizeObserver(() => {
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
}).observe(mount);

scene.add(new THREE.HemisphereLight(0xd9f3ff, 0x29374a, 2.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
keyLight.position.set(-5, 8, -3);
scene.add(keyLight);

function box(width, height, depth, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}
function slab(rect, y, material) {
  return box(rect.x2 - rect.x1, 0.18, rect.z2 - rect.z1,
    (rect.x1 + rect.x2) / 2, y - 0.09, (rect.z1 + rect.z2) / 2, material);
}
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
const basic = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
slab(geometry.base, 0, material(0x345168));
slab(geometry.upper, TOP, material(0x5f7d94, { transparent: true, opacity: 0.66 }));
const rampLength = Math.hypot(4, TOP);
const ramp = box(rampLength, 0.12, 0.9, -5, TOP / 2 - 0.07, GATE_Z, material(0x557b8b));
ramp.rotation.z = Math.atan2(TOP, 4);
const firstGatePart = scene.children.length;
const trim = material(0x728fa1);
box(0.18, 1.05, GATE_Z - GAP / 2 - geometry.upper.z1, GATE_X, TOP + 0.52,
  (GATE_Z - GAP / 2 + geometry.upper.z1) / 2, trim);
box(0.18, 1.05, geometry.upper.z2 - (GATE_Z + GAP / 2), GATE_X, TOP + 0.52,
  (GATE_Z + GAP / 2 + geometry.upper.z2) / 2, trim);
box(0.28, 1.65, 0.13, GATE_X, TOP + 0.82, GATE_Z - GAP / 2, trim);
box(0.28, 1.65, 0.13, GATE_X, TOP + 0.82, GATE_Z + GAP / 2, trim);
box(0.28, 0.15, GAP + 0.18, GATE_X, TOP + 1.66, GATE_Z, trim);
const gate = box(0.16, 1.48, GAP - 0.08, GATE_X, TOP + 0.74, GATE_Z, basic(0xf12383));
box(1.15, 0.035, 1.15, 4.85, TOP + 0.02, GATE_Z, basic(0x52d9ac));
if (atom) {
  for (const mesh of scene.children.slice(firstGatePart)) mesh.visible = false;
}
const plateA = box(0.78, 0.045, 0.78, 0, 0.025, -1, basic(0xffbc55));
const plateB = box(0.88, 0.045, 0.88, -0.65, TOP + 0.025, GATE_Z, basic(0x4bacc9));
plateB.visible = !atom;
const crate = box(0.64, 0.62, 0.64, 0, 0, 0, material(0xffad4d));
const avatar = box(0.34, 0.62, 0.34, 0, 0, 0, basic(0x65e8ff));
const edge = basic(0xffce6e);
for (let x = -7.5; x < 5.6; x += 0.42) box(0.23, 0.024, 0.07, x, 0.022, -3.32, edge);

const labels = Object.fromEntries(["plate-a", "plate-b", "gate", "status"].map(id => [id, document.getElementById(id)]));

function draw(state) {
  const [x, y, z] = state.avatar.position;
  avatar.position.set(x, y + 0.31, z);
  const [bx, by, bz] = state.box.position;
  crate.position.set(bx, by + 0.31, bz);
  plateA.material.color.setHex(state.plates.A.active ? 0x5ee5a4 : 0xffbc55);
  plateB.material.color.setHex(state.plates.B.active ? 0x5ee5a4 : 0x4bacc9);
  const showsOpen = state.door.passable && fault !== "missing_door_feedback";
  gate.visible = !atom && !showsOpen;
  labels["plate-a"].textContent = state.plates.A.active ? "Active" : "Idle";
  labels["plate-b"].textContent = state.plates.B.active ? "Active" : "Idle";
  labels.gate.textContent = showsOpen ? "Open" : state.dualActiveSinceTick !== null && !state.door.unlocked ? "Hold both plates" : "Locked";
  labels.status.textContent = { none: "In progress", failure: "Fall detected. Press R to retry.", victory: "Exit reached" }[state.outcome];
  renderer.render(scene, camera);
}

addEventListener("keydown", event => {
  if (!event.isTrusted || (event.code === "KeyR" && event.repeat)) return;
  game.keyDown(event.code);
});
addEventListener("keyup", event => game.keyUp(event.code));
addEventListener("blur", () => game.releaseKeys());

let last;
let pending = 0;
renderer.setAnimationLoop(time => {
  pending += last === undefined ? 0 : Math.min(150, time - last);
  last = time;
  const step = 1000 / TICK_RATE;
  while (pending >= step) {
    game.update();
    pending -= step;
  }
  draw(game.getSnapshot());
});
