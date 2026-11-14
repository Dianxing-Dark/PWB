import * as THREE from "three";
import { CHECKPOINTS, CONTROLS, EXIT, FLOORS, TASKS, TRAPS, createWorld } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "C12";
if (!Object.hasOwn(TASKS, task)) throw new Error("Choose A10, C07 or C12.");
const fault = params.get("fault");
const world = createWorld(task, fault);
window.__gameTest = { getSnapshot: world.getSnapshot, getEvents: world.getEvents, loadScenario: world.loadScenario };
const byId = id => document.getElementById(id);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182739);
const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 70);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mount = byId("world");
mount.append(renderer.domElement);
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = mount;
  if (!height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(mount);
scene.add(new THREE.HemisphereLight(0xe3f8ff, 0x26384d, 2.05));
const light = new THREE.DirectionalLight(0xffeed6, 2);
light.position.set(-2, 7, 6);
scene.add(light);

function model(geometry, at, color, flat = false) {
  const Material = flat ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const part = new THREE.Mesh(geometry, new Material({ color }));
  part.position.set(...at);
  scene.add(part);
  return part;
}

function box(size, at, color, flat) {
  return model(new THREE.BoxGeometry(...size), at, color, flat);
}

for (const { x: [left, right], z: [near, far], height: [start, end], id } of FLOORS) {
  const length = Math.hypot(right - left, end - start);
  const midpoint = [(left + right) / 2, (start + end) / 2, (near + far) / 2];
  const angle = Math.atan2(end - start, right - left);
  const floor = box([length, 0.16, far - near], [midpoint[0], midpoint[1] - 0.08, midpoint[2]], id === "upper" ? 0x6b657d : 0x4b6174);
  floor.rotation.z = angle;
  for (const z of [near + 0.036, far - 0.036]) {
    const edge = box([length, 0.02, 0.045], [midpoint[0], midpoint[1] + 0.012, z], 0x8cabc2, true);
    edge.rotation.z = angle;
  }
}
const beacons = {};
for (const [id, [x, y, z]] of Object.entries(CHECKPOINTS)) {
  model(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 24), [x, y + 0.022, z], 0x5183b3, true);
  const light = model(new THREE.TorusGeometry(0.28, 0.027, 8, 24), [x, y + 0.054, z], 0xffd05f, true);
  light.rotation.x = -Math.PI / 2;
  beacons[id] = light;
}
if (task !== "A10") {
  for (const [x, y, z] of Object.values(TRAPS)) {
    box([0.58, 0.047, 0.58], [x, y + 0.024, z], 0xf76b73, true);
    for (const offset of [-0.17, 0, 0.17]) {
      model(new THREE.ConeGeometry(0.065, 0.2, 6), [x + offset, y + 0.14, z], 0xf9a995, true);
    }
  }
}
const consoles = {};
let exit;
if (task === "C12") {
  for (const [id, [x, y, z]] of Object.entries(CONTROLS)) {
    box([0.18, 0.4, 0.22], [x, y + 0.2, z - 0.39], 0x344a58);
    consoles[id] = box([0.22, 0.15, 0.26], [x, y + 0.435, z - 0.39],
      id === "lower_power" ? 0x55a9ff : 0xffb66a, true);
  }
  exit = box([0.8, 0.036, 0.85], [EXIT[0], EXIT[1] + 0.026, EXIT[2]], 0x9a7181, true);
}
const player = model(new THREE.CapsuleGeometry(0.13, 0.26, 5, 10), [0, 0, 0], 0xeef6ff, true);
byId("task").textContent = "PlayableWorld-Bench · " + task;
byId("objective").textContent = TASKS[task];
byId("power-panel").hidden = byId("relay-panel").hidden = task !== "C12";

function show(id, value) {
  const element = byId(id);
  if (element.textContent !== value) element.textContent = value;
}
function draw() {
  const state = world.getSnapshot();
  const [x, y, z] = state.avatar.position;
  player.position.set(x, y + 0.26, z);
  // A low viewpoint exposes the lower corridor under the overlapping upper deck.
  const upstairs = y > 0.8 || state.checkpoint.id === "upper";
  camera.position.set(3.3, upstairs ? 8.5 : 3.8, 15.1);
  camera.lookAt(0.1, upstairs ? 0.65 : 0.3, -0.84);
  const checkpoint = fault === "stale_checkpoint_feedback" ? null : state.checkpoint.id;
  for (const [id, lamp] of Object.entries(beacons)) lamp.material.color.setHex(id === checkpoint ? 0x70e5b6 : 0xffd05f);
  show("checkpoint", { lower: "Lower deck saved", upper: "Upper deck saved", null: "Start" }[checkpoint]);
  if (exit) {
    consoles.lower_power.material.color.setHex(state.lowerPowered ? 0x70e5b6 : 0x55a9ff);
    consoles.upper_switch.material.color.setHex(state.upperSwitchOn ? 0x70e5b6 : 0xffb66a);
    exit.material.color.setHex(state.upperSwitchOn ? 0x70e5b6 : 0x9a7181);
    show("power", state.lowerPowered ? "Powered" : "Offline");
    show("relay", state.upperSwitchOn ? "Active" : "Idle");
  }
  show("status", { failure: y < -1.1 ? "Fall detected · press R" : "Trap hit · press R",
    victory: "Exit reached", none: "In progress" }[state.outcome]);
  renderer.render(scene, camera);
}

addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) world.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) world.input(event.code, false); });
addEventListener("blur", world.release);
const stepMs = 1000 / 60;
let previous;
let accumulator = 0;
renderer.setAnimationLoop(now => {
  accumulator += Math.min(150, now - (previous ?? now));
  previous = now;
  while (accumulator >= stepMs) {
    world.step();
    accumulator -= stepMs;
  }
  draw();
});
