import * as THREE from "three";
import { checkpointPads, consoles, decks, exit, toWorld, trapPads } from "./geometry.mjs";
import { createGallery, tasks } from "./world.mjs";

const task = new URLSearchParams(location.search).get("task") ?? "C12";
if (!Object.hasOwn(tasks, task)) throw new Error("Choose A10, C07 or C12.");
const game = createGallery(task);
window.__gameTest = { getSnapshot: game.getSnapshot, getEvents: game.getEvents, loadScenario: game.loadScenario };

const find = id => document.getElementById(id);
const stage = find("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f243c);
const camera = new THREE.OrthographicCamera(-9, 9, 4.6, -4.6, 0.1, 80);
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.append(renderer.domElement);
new ResizeObserver(() => {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  camera.left = -4.6 * width / height;
  camera.right = -camera.left;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(stage);
scene.add(new THREE.HemisphereLight(0xf9edff, 0x32375a, 2.6));
const sun = new THREE.DirectionalLight(0xece3ff, 2.1);
sun.position.set(9, 12, 4);
scene.add(sun);

function add(shape, point, color, flat = false) {
  const Material = flat ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const part = new THREE.Mesh(shape, new Material({ color }));
  part.position.set(...toWorld(point));
  scene.add(part);
  return part;
}
function block(size, point, color, flat) {
  return add(new THREE.BoxGeometry(...size), point, color, flat);
}
for (const { id, s: [a, b], t: [l, r], from, to } of decks) {
  const center = [(a + b) / 2, (from + to) / 2, (l + r) / 2];
  const length = Math.hypot(b - a, to - from);
  const pitch = -Math.atan2(to - from, b - a);
  const deck = block([r - l, 0.21, length], [center[0], center[1] - 0.105, center[2]],
    id === "gallery" ? 0x636284 : 0x395262);
  deck.rotation.x = pitch;
  for (const edge of [l + 0.06, r - 0.06]) {
    const rail = block([0.05, 0.035, length], [center[0], center[1] + 0.018, edge], 0xe4ca9f, true);
    rail.rotation.x = pitch;
  }
}
const pads = {};
for (const [id, [s, y, t]] of Object.entries(checkpointPads)) {
  block([0.81, 0.045, 0.81], [s, y + 0.025, t], 0x4c4f79, true);
  const pad = add(new THREE.TorusGeometry(0.29, 0.048, 8, 20), [s, y + 0.065, t], 0xffce6a, true);
  pad.rotation.x = -Math.PI / 2;
  pads[id] = pad;
}
if (task !== "A10") {
  for (const [s, y, t] of Object.values(trapPads)) {
    block([0.69, 0.055, 0.69], [s, y + 0.025, t], 0xc55279, true);
    for (const offset of [-0.22, 0, 0.22]) {
      block([0.65, 0.06, 0.055], [s + offset, y + 0.064, t], 0xff98ac, true);
    }
  }
}
const controlLights = {};
let portal;
if (task === "C12") {
  for (const [id, [s, y, t]] of Object.entries(consoles)) {
    block([0.24, 0.44, 0.23], [s, y + 0.22, t + 0.44], 0x3b476a);
    controlLights[id] = block([0.29, 0.16, 0.29], [s, y + 0.49, t + 0.44], 0xffce6a, true);
  }
  portal = block([0.8, 0.05, 0.8], [exit[0], exit[1] + 0.027, exit[2]], 0x736087, true);
}
const player = add(new THREE.CapsuleGeometry(0.16, 0.31, 6, 12), [0, 0, 0], 0xf1eefb, true);
const statusLabels = { none: "In progress", failure: "Trap hit · press R", victory: "Exit reached" };
find("task").textContent = "PlayableWorld-Bench · " + task;
find("objective").textContent = tasks[task];
find("power-panel").hidden = find("relay-panel").hidden = task !== "C12";

function draw() {
  const state = game.getSnapshot();
  const upstairs = state.avatar.position[1] > 0.85 || state.checkpoint.id === "upper";
  camera.position.set(15.5, upstairs ? 10.5 : 4.2, 4.8);
  camera.lookAt(0.6, upstairs ? 1.2 : 0.55, 0.4);
  const [x, y, z] = state.avatar.position;
  player.position.set(x, y + 0.32, z);
  for (const [id, pad] of Object.entries(pads)) {
    pad.material.color.setHex(state.checkpoint.id === id ? 0x70e5b6 : 0xffce6a);
  }
  if (portal) {
    controlLights.lower_power.material.color.setHex(state.lowerPowered ? 0x6af1cf : 0x599fef);
    controlLights.upper_switch.material.color.setHex(state.upperSwitchOn ? 0x6af1cf : 0xffce6a);
    portal.material.color.setHex(state.upperSwitchOn ? 0x6af1cf : 0x736087);
    find("power").textContent = state.lowerPowered ? "Powered" : "Offline";
    find("relay").textContent = state.upperSwitchOn ? "Active" : "Idle";
  }
  find("checkpoint").textContent = { lower: "Lower deck saved", upper: "Upper deck saved", null: "Start" }[state.checkpoint.id];
  find("status").textContent = state.outcome === "failure" && y < -1.35 ? "Fall detected · press R" : statusLabels[state.outcome];
  renderer.render(scene, camera);
}

addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) game.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) game.input(event.code, false); });
addEventListener("blur", game.release);
let next;
const step = 1000 / 60;
renderer.setAnimationLoop(now => {
  next = Math.max(next ?? now, now - 140);
  while (next <= now) {
    game.step();
    next += step;
  }
  draw();
});
