import * as THREE from "three";
import { createLab, DECKS, EXIT, SAMPLE, WALL } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "C09";
if (!["A05", "C09"].includes(task)) throw new Error("Choose A05 or C09.");
const fault = params.get("fault");
const lab = createLab(task, fault);
window.__gameTest = { getSnapshot: lab.getSnapshot, getEvents: lab.getEvents, loadScenario: lab.loadScenario };
const find = id => document.getElementById(id);
const stage = find("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182c38);
const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 70);
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.append(renderer.domElement);
new ResizeObserver(() => {
  if (!stage.clientHeight) return;
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
}).observe(stage);
scene.add(new THREE.HemisphereLight(0xe5f8ff, 0x283040, 2.1));
const lamp = new THREE.DirectionalLight(0xfff4d7, 2.1);
lamp.position.set(-4, 9, 5);
scene.add(lamp);

function add(shape, point, color, flat) {
  const Material = flat ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const mesh = new THREE.Mesh(shape, new Material({ color }));
  mesh.position.set(...point);
  scene.add(mesh);
  return mesh;
}
function box(size, point, color, flat) {
  return add(new THREE.BoxGeometry(...size), point, color, flat);
}
for (const { x: [a, b], z: [l, r], heights: [low, high], id } of DECKS) {
  const length = Math.hypot(b - a, high - low);
  const pitch = Math.atan2(high - low, b - a);
  const center = [(a + b) / 2, (low + high) / 2, (l + r) / 2];
  const deck = box([length, 0.18, r - l], [center[0], center[1] - 0.09, center[2]],
    id === "upper" ? 0x516565 : 0x41586c);
  deck.rotation.z = pitch;
  for (const z of [l + 0.04, r - 0.04]) {
    box([length, 0.023, 0.057], [center[0], center[1] + 0.013, z], 0xa9c3ca, true).rotation.z = pitch;
  }
}
const [x, y, z] = SAMPLE;
const item = add(new THREE.OctahedronGeometry(0.27), [x, y + 0.42, z], 0xfccd5e, true);
box([0.42, 0.11, 0.42], [x, y + 0.055, z], 0x2a4448);
if (task === "C09") {
  const ranges = [WALL.x, WALL.y, WALL.z];
  box(ranges.map(([a, b]) => b - a), ranges.map(([a, b]) => (a + b) / 2), 0x5a6680);
  for (const edge of WALL.z) {
    box([0.19, 1.55, 0.065], [(WALL.x[0] + WALL.x[1]) / 2, WALL.y[0] + 0.775, edge], 0xb7a8c6, true);
  }
  box([0.75, 0.03, 0.7], [EXIT[0], EXIT[1] + 0.026, EXIT[2]], 0x6bd3aa, true);
}
const player = add(new THREE.CapsuleGeometry(0.15, 0.29, 5, 10), [0, 0, 0], 0xf1faff, true);
find("task").textContent = "PlayableWorld-Bench · " + task;
find("objective").textContent = task === "A05"
  ? "Use the west ramp and press E near the upper sample."
  : "Use the west ramp, walk around the partition, and press E near the sample. Then head to the exit.";
function draw() {
  const state = lab.getSnapshot();
  const [px, py, pz] = state.avatar.position;
  player.position.set(px, py + 0.29, pz);
  const high = py > 0.85;
  camera.position.set(-3.9, high ? 9.1 : 3.9, 15.1);
  camera.lookAt(0.1, high ? 0.9 : 0.4, -0.68);
  const shownCollected = state.sample.collected && fault !== "stale_sample_feedback";
  item.visible = !shownCollected;
  item.rotation.y = state.tick * 0.017;
  find("sample").textContent = shownCollected ? "Collected" : "Not collected";
  find("mission").textContent = { none: "In progress", victory: "Exit reached", failure: "Fall detected · press R" }[state.outcome];
  renderer.render(scene, camera);
}
addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) lab.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) lab.input(event.code, false); });
addEventListener("blur", lab.release);
let pending = 0;
let previous;
const stepMs = 1000 / 60;
renderer.setAnimationLoop(now => {
  pending += Math.min(150, now - (previous ?? now));
  previous = now;
  while (pending >= stepMs) {
    lab.step();
    pending -= stepMs;
  }
  draw();
});
