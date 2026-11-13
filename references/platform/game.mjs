import * as THREE from "three";
import { createWorld, TRACK, HIGH, GATE_X, DELIVERY_X, PLATFORM_LENGTH, PLATFORM_WIDTH, LOW_DOCK, HIGH_DOCK } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "C03";
if (!Object.hasOwn(TRACK, task)) throw new Error("Choose A03, C03 or P04.");
const world = createWorld(task, params.get("fault"));
window.__gameTest = { getSnapshot: world.getSnapshot, getEvents: world.getEvents, loadScenario: world.loadScenario };

const mount = document.querySelector("#world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2638);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(3.6, 15, 15.7);
camera.lookAt(2.3, 0.7, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
mount.append(renderer.domElement);
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = mount;
  if (!height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(mount);
scene.add(new THREE.HemisphereLight(0xe3f3ff, 0x2a3750, 2.4));
const light = new THREE.DirectionalLight(0xffefcf, 2.2);
light.position.set(-4, 8, 7);
scene.add(light);

function box(size, position, color, plain = false) {
  const Material = plain ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new Material({ color, toneMapped: !plain }));
  mesh.position.set(...position);
  scene.add(mesh);
  return mesh;
}

for (const { xMin, xMax, zMin, zMax, y } of [LOW_DOCK, HIGH_DOCK]) {
  box([xMax - xMin, 0.28, zMax - zMin], [(xMin + xMax) / 2, y - 0.14, 0], 0x46607c);
  for (const z of [zMin + 0.08, zMax - 0.08]) {
    box([xMax - xMin, 0.025, 0.06], [(xMin + xMax) / 2, y + 0.014, z], 0xf5c563, true);
  }
}
const lift = box([PLATFORM_LENGTH, 0.18, PLATFORM_WIDTH], [0, -0.09, 0], 0x40e8bf, true);
const player = box([0.35, 0.65, 0.35], [0, 0, 0], 0x67bdff, true);
const crate = task === "P04" ? box([0.62, 0.62, 0.62], [0, 0, 0], 0xf4ab54) : null;
const gate = task === "A03" ? null : box([0.16, 1.34, 3.3], [GATE_X, HIGH + 0.67, 0], 0xe75c5c, true);
if (gate) {
  box([0.27, 0.14, 3.42], [GATE_X, HIGH + 1.43, 0], 0xc2a58b);
  box([1, 0.035, 2.25], [DELIVERY_X + 0.23, HIGH + 0.022, 0], 0xb1f46e, true);
}

const label = id => document.getElementById(id);
label("task").textContent = "PlayableWorld-Bench · " + task;
label("objective").textContent = TRACK[task];
label("gate-panel").hidden = !gate;
const phases = { lowDock: "Lower dock", outbound: "Ascending", highDock: "Upper dock", inbound: "Descending" };
const surfaces = { lift: "On lift", lower: "Lower dock", upper: "Upper dock", null: "Falling" };
function show(id, value) {
  const element = label(id);
  if (element.textContent !== value) element.textContent = value;
}

function draw() {
  const s = world.getSnapshot();
  for (const [mesh, entity, offset] of [[lift, s.platform, -0.09], [player, s.avatar, 0.325], [crate, s.box, 0.31]]) {
    if (!mesh) continue;
    const [x, y, z] = entity.position;
    mesh.position.set(x, y + offset, z);
  }
  if (gate) gate.visible = !s.gate.passable;
  show("phase", phases[s.platform.phase]);
  show("support", surfaces[s.avatar.supportSurface]);
  show("gate", s.gate.passable ? "Open" : "Closed");
  show("status", { none: "In progress", failure: "Fall detected. Press R.", victory: "Destination reached" }[s.outcome]);
  renderer.render(scene, camera);
}

addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) world.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) world.input(event.code, false); });
addEventListener("blur", world.release);
const tickMs = 1000 / 60;
let last;
let pending = 0;
renderer.setAnimationLoop(now => {
  pending += Math.min(150, now - (last ?? now));
  last = now;
  while (pending >= tickMs) {
    world.step();
    pending -= tickMs;
  }
  draw();
});
