import * as THREE from "three";
import { newWorld, lower, upper, ramp, elevation, airlock, switches, exit } from "./world.mjs";

const fault = new URLSearchParams(location.search).get("fault");
const world = newWorld(fault);
window.__gameTest = {
  getSnapshot: world.getSnapshot,
  getEvents: world.getEvents,
  loadScenario: world.loadScenario,
};

const canvasHost = document.querySelector("#world");
const renderer = new THREE.WebGLRenderer({ antialias: true });
canvasHost.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x233632);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 70);
camera.position.set(-10.7, 10, -10);
camera.lookAt(0.25, 0.4, 0);
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = canvasHost;
  if (height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}).observe(canvasHost);
scene.add(new THREE.HemisphereLight(0xfff0cb, 0x284a45, 2.4));
const light = new THREE.DirectionalLight(0xf4fff0, 2.2);
light.position.set(-3, 5, -4);
scene.add(light);

function part(size, position, color, unlit = false, opacity = 1) {
  const Type = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size),
    new Type({ color, opacity, transparent: opacity < 1, toneMapped: !unlit }));
  mesh.position.set(...position);
  scene.add(mesh);
  return mesh;
}

function floor(bounds, height, color, opacity) {
  const { minX, maxX, minZ, maxZ } = bounds;
  return part([maxX - minX, 0.18, maxZ - minZ], [(maxX + minX) / 2, height - 0.09, (maxZ + minZ) / 2],
    color, false, opacity);
}
floor(lower, 0, 0x58755a, 1);
floor(upper, elevation, 0x8ca7a0, 0.65);
const rampSpan = ramp.maxZ - ramp.minZ;
const slope = part([ramp.maxX - ramp.minX, 0.12, Math.hypot(rampSpan, elevation)],
  [2, elevation / 2 - 0.055, (ramp.minZ + ramp.maxZ) / 2], 0xa2a986);
slope.rotation.x = -Math.atan2(elevation, rampSpan);

const { x, z, width } = airlock;
const edgeA = x - width / 2;
const edgeB = x + width / 2;
for (const [left, right] of [[upper.minX, edgeA], [edgeB, upper.maxX]]) {
  part([right - left, 0.95, 0.22], [(left + right) / 2, elevation + 0.47, z], 0xa0a194);
}
for (const edge of [edgeA, edgeB]) part([0.14, 1.55, 0.27], [edge, elevation + 0.77, z], 0x9fa891);
part([width + 0.15, 0.15, 0.26], [x, elevation + 1.55, z], 0x9fa891);
const gate = part([width - 0.12, 1.33, 0.18], [x, elevation + 0.665, z], 0xe75b2b, true);
part([1, 0.045, 1.05], [exit[0], exit[1] + 0.02, exit[2]], 0x96ee89, true);
const switchMeshes = Object.fromEntries(Object.entries(switches).map(([id, { center, halfWidth }]) =>
  [id, part([2 * halfWidth, 0.045, 2 * halfWidth], [center[0], center[1] + 0.025, center[2]],
    id === "A" ? 0xeabb57 : 0x6bcdff, true)]));
const crate = part([0.6, 0.6, 0.6], [0, 0, 0], 0xeac160);
const player = part([0.35, 0.64, 0.35], [0, 0, 0], 0x65e8ff, true);
for (let marker = -5.4; marker < 5.8; marker += 0.38) {
  part([0.05, 0.025, 0.21], [lower.minX + 0.08, 0.02, marker], 0xe9c374, true);
}

const labels = ["lower-switch", "upper-switch", "airlock", "attempt"].map(id => document.getElementById(id));
function draw() {
  const s = world.getSnapshot();
  for (const [mesh, entity, center] of [[player, s.avatar, 0.32], [crate, s.box, 0.3]]) {
    const [x, y, z] = entity.position;
    mesh.position.set(x, y + center, z);
  }
  switchMeshes.A.material.color.setHex(s.plates.A.active ? 0x93ef89 : 0xeabb57);
  switchMeshes.B.material.color.setHex(s.plates.B.active ? 0x93ef89 : 0x6bcdff);
  const open = s.door.passable && fault !== "missing_door_feedback";
  gate.visible = !open;
  const display = [s.plates.A.active ? "Engaged" : "Clear", s.plates.B.active ? "Engaged" : "Clear",
    open ? "Unsealed" : "Sealed",
    { none: "Reach the exit", failure: "You fell. Press R.", victory: "Chamber cleared" }[s.outcome]];
  labels.forEach((label, i) => {
    if (label.textContent !== display[i]) label.textContent = display[i];
  });
  renderer.render(scene, camera);
}

addEventListener("keydown", event => {
  if (event.isTrusted && !event.repeat) world.input(event.code, true);
});
addEventListener("keyup", event => { if (event.isTrusted) world.input(event.code, false); });
addEventListener("blur", world.release);

const delta = 1000 / 60;
let clock;
let remaining = 0;
renderer.setAnimationLoop(time => {
  remaining += Math.min(150, time - (clock ?? time));
  clock = time;
  while (remaining >= delta) {
    world.step();
    remaining -= delta;
  }
  draw();
});
