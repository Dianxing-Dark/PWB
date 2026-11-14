import * as THREE from "three";
import { createWorld, HEIGHT, layouts } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "A04";
const layout = layouts[task];
if (!Object.hasOwn(layouts, task)) throw new Error("Choose A04 or A09.");
const fault = params.get("fault");
const game = createWorld(task, fault);
window.__gameTest = { getSnapshot: game.getSnapshot, getEvents: game.getEvents, loadScenario: game.loadScenario };
const node = id => document.getElementById(id);
const mount = node("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202b3b);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 70);
camera.position.set(1.6, 8.4, 15.7);
camera.lookAt(0.1, 0.9, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
mount.append(renderer.domElement);
new ResizeObserver(() => {
  if (!mount.clientHeight) return;
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
}).observe(mount);
scene.add(new THREE.HemisphereLight(0xd1efff, 0x293d43, 2.2));
const light = new THREE.DirectionalLight(0xffe1aa, 2);
light.position.set(-4, 7, 5);
scene.add(light);

function mesh(geometry, at, color, plain = false) {
  const Material = plain ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const piece = new THREE.Mesh(geometry, new Material({ color }));
  piece.position.set(...at);
  scene.add(piece);
  return piece;
}
function box(size, at, color, plain) {
  return mesh(new THREE.BoxGeometry(...size), at, color, plain);
}
for (const { id, x: [a, b], z: [l, r], from, to } of layout.decks) {
  const angle = Math.atan2(to - from, b - a);
  const length = Math.hypot(b - a, to - from);
  const mid = [(a + b) / 2, (from + to) / 2, (l + r) / 2];
  box([length, 0.21, r - l], [mid[0], mid[1] - 0.1, mid[2]], id === "lower" ? 0x4c6873 : 0x7c776c).rotation.z = angle;
  for (const z of [l + 0.04, r - 0.04]) {
    box([length, 0.02, 0.06], [mid[0], mid[1] + 0.028, z], 0xaacac5, true).rotation.z = angle;
  }
}
if (task === "A09") box([0.11, 0.035, 1.9], [0.34, HEIGHT + 0.02, 0], 0xf4bc5f, true);
const avatar = mesh(new THREE.CapsuleGeometry(0.145, 0.29, 5, 12), [0, 0, 0], 0x60e2ff, true);
node("task").textContent = "PlayableWorld-Bench · " + task;
node("objective").textContent = layout.instructions;
const surfaces = { lower: "Lower deck", slope: "Ramp", upper: "Upper deck", null: "Airborne" };

function draw() {
  const state = game.getSnapshot();
  const [x, y, z] = state.avatar.position;
  avatar.position.set(x, (fault === "avatar_drawn_at_floor" ? 0 : y) + 0.29, z);
  node("surface").textContent = state.outcome === "failure" ? "Fall detected · press R" : surfaces[state.avatar.supportSurface];
  node("height").textContent = y.toFixed(2) + " m";
  renderer.render(scene, camera);
}
addEventListener("keydown", event => { if (event.isTrusted && !event.repeat) game.input(event.code, true); });
addEventListener("keyup", event => { if (event.isTrusted) game.input(event.code, false); });
addEventListener("blur", game.release);
let last;
let pending = 0;
const tickTime = 1000 / 60;
renderer.setAnimationLoop(now => {
  pending += Math.min(150, now - (last ?? now));
  last = now;
  while (pending >= tickTime) {
    game.step();
    pending -= tickTime;
  }
  draw();
});
