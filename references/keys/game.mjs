import * as THREE from "three";
import { createWorld, TASKS, GATE, GOALS, KEYS, UPPER, surfaces } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "P05";
if (!Object.hasOwn(TASKS, task)) throw new Error("Choose A06, C05 or P05.");
const fault = params.get("fault");
const world = createWorld(task, fault);
window.__gameTest = { getSnapshot: world.getSnapshot, getEvents: world.getEvents, loadScenario: world.loadScenario };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x162637);
const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 70);
camera.position.set(-6.5, 9.3, 13.5);
camera.lookAt(0.35, 0.8, -1.1);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const label = id => document.getElementById(id);
const mount = label("world");
mount.append(renderer.domElement);
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = mount;
  if (!height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(mount);
scene.add(new THREE.HemisphereLight(0xe0f1ff, 0x344052, 2.25));
const sunlight = new THREE.DirectionalLight(0xffefd7, 2.1);
sunlight.position.set(-4, 7, 5);
scene.add(sunlight);

function mesh(geometry, position, color, plain = false) {
  const Material = plain ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const part = new THREE.Mesh(geometry, new Material({ color }));
  part.position.set(...position);
  scene.add(part);
  return part;
}
function box(size, position, color, plain) {
  return mesh(new THREE.BoxGeometry(...size), position, color, plain);
}

for (const floor of surfaces) {
  if (floor.sharedExit && task !== "P05") continue;
  const run = floor.xMax - floor.xMin;
  const rise = floor.right - floor.left;
  const width = floor.zMax - floor.zMin;
  const center = [(floor.xMin + floor.xMax) / 2, (floor.left + floor.right) / 2, (floor.zMin + floor.zMax) / 2];
  const angle = Math.atan2(rise, run);
  const length = Math.hypot(run, rise);
  const deck = box([length, 0.16, width], [center[0], center[1] - 0.08, center[2]], 0x4e6880);
  deck.rotation.z = angle;
  for (const z of [floor.zMin + 0.035, floor.zMax - 0.035]) {
    const edge = box([length, 0.025, 0.05], [center[0], center[1] + 0.018, z], 0xa8b8c9, true);
    edge.rotation.z = angle;
  }
}
const gateColors = { lower: task === "A06" ? 0xb35f28 : 0x338ade, upper: 0xd87931 };
const gates = {};
for (const [id, y] of [["lower", 0], ["upper", UPPER]]) {
  gates[id] = box([0.14, 1.42, 2.12], [GATE, y + 0.71, 0], gateColors[id], true);
  for (const z of [-1.06, 1.06]) box([0.22, 1.55, 0.19], [GATE, y + 0.775, z], 0x869cb4);
  box([0.25, 0.15, 2.31], [GATE, y + 1.55, 0], 0x869cb4);
}

const amberColor = 0xffdd2c;
const keyMeshes = {};
if (task !== "A06") {
  for (const [color, { x, y, z }] of Object.entries(KEYS)) {
    const tint = color === "amber" ? amberColor : 0x58aaff;
    keyMeshes[color] = [
      mesh(new THREE.TorusGeometry(0.14, 0.047, 10, 20), [x, y + 0.44, z], tint, true),
      box([0.1, 0.27, 0.09], [x, y + 0.22, z], tint, true),
      box([0.16, 0.075, 0.09], [x + 0.045, y + 0.14, z], tint, true),
    ];
  }
  const { x, y } = GOALS[task];
  box([0.68, 0.035, 1.3], [x + 0.21, y + 0.021, 0], 0x6edcaa, true);
  for (const z of [-0.47, 0.47]) box([0.08, 0.95, 0.08], [x + 0.42, y + 0.475, z], 0x6edcaa, true);
}
const player = mesh(new THREE.CapsuleGeometry(0.17, 0.34, 5, 10), [0, 0, 0], 0xe5ecf3, true);
label("task").textContent = "PlayableWorld-Bench · " + task;
label("objective").textContent = TASKS[task];
label("blue-panel").hidden = task === "A06";

function show(id, value) {
  const node = label(id);
  if (node.textContent !== value) node.textContent = value;
}
function draw() {
  const state = world.getSnapshot();
  const [x, y, z] = state.avatar.position;
  player.position.set(x, y + 0.34, z);
  for (const [color, parts] of Object.entries(keyMeshes)) {
    for (const part of parts) part.visible = !state.keys[color].collected;
  }
  for (const [id, gate] of Object.entries(gates)) {
    gate.visible = state.doors[id].locked;
    show(id, (task === "A06" || id === "upper" ? "Amber" : "Blue") + (gate.visible ? " · locked" : " · open"));
  }
  show("amber", fault === "stale_inventory_hud" ? "0" : String(state.inventory.amber));
  show("blue", String(state.inventory.blue));
  show("status", { none: "In progress", failure: "Fall detected. Press R.", victory: "Exit reached" }[state.outcome]);
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
