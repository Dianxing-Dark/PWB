import * as THREE from "three";
import { createShuttle, docks, LOW, HIGH, LIFT_SIZE, GATE, DELIVERY, objectives } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "P04";
if (!Object.hasOwn(objectives, task)) throw new Error("Choose A03, C03 or P04.");
const shuttle = createShuttle(task, params.get("fault"));
window.__gameTest = { getSnapshot: shuttle.getSnapshot, getEvents: shuttle.getEvents, loadScenario: shuttle.loadScenario };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x252038);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(2.4, 12.7, 16.5);
camera.lookAt(-2, 0.8, -0.45);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const byId = id => document.getElementById(id);
const mount = byId("world");
mount.append(renderer.domElement);
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = mount;
  if (!height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(mount);
scene.add(new THREE.HemisphereLight(0xffedf0, 0x352c56, 2.25));
const lamp = new THREE.DirectionalLight(0xffd7ad, 2.1);
lamp.position.set(-5, 8, 5);
scene.add(lamp);

function part(geometry, [s, y, z], color, flat = false) {
  const Material = flat ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const object = new THREE.Mesh(geometry, new Material({ color }));
  object.position.set(-s, y, z);
  scene.add(object);
  return object;
}

function box(size, point, color, flat) {
  return part(new THREE.BoxGeometry(...size), point, color, flat);
}

for (const { min, max, y, z, half } of Object.values(docks)) {
  const center = (min + max) / 2;
  box([max - min, 0.27, half * 2], [center, y - 0.135, z], 0x655473);
  for (const side of [-1, 1]) {
    box([max - min, 0.033, 0.057], [center, y + 0.017, z + side * (half - 0.055)], 0xe2c4e8, true);
    box([0.2, 0.6, 0.2], [center, y - 0.43, z + side * (half - 0.32)], 0x5a466d);
  }
}
const [length, width] = LIFT_SIZE;
const lift = box([length, 0.22, width], LOW, 0xffbb3f, true);
const player = part(new THREE.CapsuleGeometry(0.17, 0.4, 6, 12), [0, 0, 0], 0xe8f8ff, true);
const crate = task === "P04" ? box([0.57, 0.57, 0.57], [0, 0, 0], 0x638fe1, true) : null;
const gate = task === "A03" ? null : box([0.16, 1.32, 2.92], [GATE, HIGH[1] + 0.66, HIGH[2]], 0xec55a1, true);
if (gate) {
  for (const side of [-1, 1]) {
    box([0.27, 1.44, 0.14], [GATE, HIGH[1] + 0.72, HIGH[2] + side * 1.46], 0xd6bfdc);
  }
  box([0.26, 0.14, 3.04], [GATE, HIGH[1] + 1.47, HIGH[2]], 0xd6bfdc);
  box([0.8, 0.035, 1.84], [DELIVERY + 0.33, HIGH[1] + 0.02, HIGH[2]], 0x80edb8, true);
}

byId("task").textContent = "PlayableWorld-Bench · " + task;
byId("objective").textContent = objectives[task];
byId("gate-panel").hidden = !gate;
const phases = { lowDock: "Lower dock", outbound: "Ascending", highDock: "Upper dock", inbound: "Returning" };
const surfaces = { lift: "On shuttle", lower: "Lower dock", upper: "Upper dock", null: "Falling" };
function show(id, value) {
  const node = byId(id);
  if (node.textContent !== value) node.textContent = value;
}
function draw() {
  const state = shuttle.getSnapshot();
  for (const [object, entity, yOffset] of [[lift, state.platform, -0.11], [player, state.avatar, 0.37], [crate, state.box, 0.285]]) {
    if (!object) continue;
    const [x, y, z] = entity.position;
    object.position.set(x, y + yOffset, z);
  }
  if (gate) gate.visible = !state.gate.passable;
  show("phase", phases[state.platform.phase]);
  show("support", surfaces[state.avatar.supportSurface]);
  show("gate", state.gate.passable ? "Open" : "Closed");
  show("status", { none: "In progress", failure: "Fall detected. Press R.", victory: "Destination reached" }[state.outcome]);
  renderer.render(scene, camera);
}

addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) shuttle.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) shuttle.input(event.code, false); });
addEventListener("blur", shuttle.release);
let previous;
let accumulator = 0;
const stepMs = 1000 / 60;
renderer.setAnimationLoop(now => {
  accumulator += Math.min(150, now - (previous ?? now));
  previous = now;
  while (accumulator >= stepMs) {
    shuttle.step();
    accumulator -= stepMs;
  }
  draw();
});
