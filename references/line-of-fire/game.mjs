import * as THREE from "three";
import { COVER, EMITTER, EXIT, SWITCH, TARGET, WORKER, createWorld, decks } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "P06";
const fault = params.get("fault");
const world = createWorld(task, fault);
window.__gameTest = { getSnapshot: world.getSnapshot, getEvents: world.getEvents, loadScenario: world.loadScenario };
const find = id => document.getElementById(id);
const stage = find("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x192337);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
camera.position.set(0.3, 7.4, 15);
camera.lookAt(0, 0.65, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.append(renderer.domElement);
new ResizeObserver(() => {
  if (!stage.clientHeight) return;
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
}).observe(stage);
scene.add(new THREE.HemisphereLight(0xd4edff, 0x303044, 2.2));
const lamp = new THREE.DirectionalLight(0xffeacd, 2.1);
lamp.position.set(-4, 9, 5);
scene.add(lamp);

function mesh(geometry, at, color, unlit = false) {
  const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const object = new THREE.Mesh(geometry, new Material({ color }));
  object.position.set(...at);
  scene.add(object);
  return object;
}
const box = (size, at, color, unlit) => mesh(new THREE.BoxGeometry(...size), at, color, unlit);
const orb = (radius, at, color) => mesh(new THREE.SphereGeometry(radius, 16, 12), at, color, true);
for (const { x: [a, b], y: [low, high], z: [l, r], id } of (task === "P06" ? decks.slice(0, 1) : decks)) {
  const angle = Math.atan2(high - low, b - a);
  const length = Math.hypot(b - a, high - low);
  const cx = (a + b) / 2;
  const cy = (low + high) / 2;
  box([length, 0.15, r - l], [cx, cy - 0.075, (l + r) / 2], id === "lower" ? 0x465567 : 0x526b7b).rotation.z = angle;
  for (const z of [l + 0.045, r - 0.045]) {
    box([length, 0.025, 0.065], [cx, cy + 0.015, z], 0x9bb3bc, true).rotation.z = angle;
  }
}
box(COVER.map(([a, b]) => b - a), COVER.map(([a, b]) => (a + b) / 2), 0x92684e);
for (const z of COVER[2]) box([0.31, 1.83, 0.08], [0, 0.925, z], 0xf3b573, true);
const avatar = mesh(new THREE.CapsuleGeometry(0.16, 0.33, 5, 12), [0, 0, 0], 0xf2f9ff, true);
let source;
if (task === "C08") {
  box([0.24, TARGET[1], 0.24], [TARGET[0], TARGET[1] / 2, TARGET[2]], 0x56667a);
  source = orb(0.27, TARGET, 0xff9a57);
} else {
  box([0.48, EMITTER[1], 0.43], [EMITTER[0], EMITTER[1] / 2, EMITTER[2]], 0x506781);
  source = orb(0.22, EMITTER, 0xff9a57);
}
let worker;
let switchRing;
if (task === "P06") {
  worker = mesh(new THREE.CapsuleGeometry(0.17, 0.29, 5, 10), [WORKER[0], 0.35, WORKER[2]], 0xf7d489, true);
  switchRing = box([0.48, 0.035, 0.48], [SWITCH[0], 0.021, SWITCH[2]], 0x88bdff, true);
}
if (task !== "A08") box([0.65, 0.03, 0.7], [EXIT[0], 0.019, EXIT[2]], 0x78dbac, true);
const pulse = mesh(new THREE.CylinderGeometry(0.038, 0.038, 1, 10), [0, 0, 0], 0xff5678, true);
const contact = orb(0.12, [0, 0, 0], 0xff5678);
const up = new THREE.Vector3(0, 1, 0);
const liveColor = 0xff9a57;
const safeColor = 0x7de3b1;
find("task").textContent = "PlayableWorld-Bench · " + task;
find("device-label").textContent = task === "C08" ? "Target" : "Emitter";
find("action").textContent = { A08: "", C08: "Space  Shoot", P06: "E  Interact" }[task];
find("objective").textContent = {
  A08: "Wait for a pulse behind the barrier. Compare the same position on the raised deck and the open side path.",
  C08: "Press Space to aim at the target. Climb the west ramp for a clear shot, then use the marked exit.",
  P06: "Stay behind the barrier, stand on the blue cutoff pad and press E. Detour around the barrier, rescue the worker with E, and reach the green exit.",
}[task];
function draw() {
  const state = world.getSnapshot();
  const [x, y, z] = state.avatar.position;
  avatar.position.set(x, y + 0.34, z);
  const disabled = (task === "C08" ? state.target.disabled : !state.emitter.active) && fault !== "stale_emitter_feedback";
  find("device").textContent = disabled ? "Disabled" : task === "C08" ? "Ready" : "Armed";
  source.material.color.setHex(disabled ? safeColor : liveColor);
  if (worker) {
    worker.material.color.setHex(state.worker.rescued ? safeColor : 0xf7d489);
    switchRing.material.color.setHex(disabled ? safeColor : 0x88bdff);
  }
  find("last-action").textContent = state.lastAction ?? "Waiting";
  find("mission").textContent = { none: "In progress", failure: "Failed", victory: "Exit reached" }[state.outcome];
  const beam = state.beam;
  const visible = Boolean(beam && state.tick <= beam.untilTick && fault !== "hide_beam");
  pulse.visible = contact.visible = visible;
  if (visible) {
    const from = new THREE.Vector3(...beam.from);
    const impact = new THREE.Vector3(...beam.impact);
    const direction = impact.clone().sub(from);
    pulse.position.copy(from).lerp(impact, 0.5);
    pulse.scale.y = direction.length();
    pulse.quaternion.setFromUnitVectors(up, direction.normalize());
    contact.position.copy(impact);
  }
  renderer.render(scene, camera);
}
addEventListener("keydown", e => { if (e.isTrusted && !e.repeat) world.input(e.code, true); });
addEventListener("keyup", e => { if (e.isTrusted) world.input(e.code, false); });
addEventListener("blur", world.release);
let previous;
let pending = 0;
const stepMs = 1000 / 60;
renderer.setAnimationLoop(now => {
  pending += Math.min(150, now - (previous ?? now));
  previous = now;
  while (pending >= stepMs) {
    world.step();
    pending -= stepMs;
  }
  draw();
});
