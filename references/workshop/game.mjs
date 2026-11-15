import * as THREE from "three";
import { createWorld, layouts } from "./world.mjs";

const params = new URLSearchParams(location.search);
const task = params.get("task") ?? "A07";
const fault = params.get("fault");
const layout = layouts[task];
const world = createWorld(task, fault);
window.__gameTest = { getSnapshot: world.getSnapshot, getEvents: world.getEvents, loadScenario: world.loadScenario };

const node = id => document.getElementById(id);
const stage = node("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202938);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
camera.position.set(0.9, 9.2, 16.6);
camera.lookAt(0.55, 0.7, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.append(renderer.domElement);
new ResizeObserver(() => {
  if (!stage.clientHeight) return;
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
}).observe(stage);

scene.add(new THREE.HemisphereLight(0xdaecff, 0x252e37, 2.1));
const lamp = new THREE.DirectionalLight(0xffedc8, 2);
lamp.position.set(-4, 7, 5);
scene.add(lamp);

function piece(geometry, position, color, plain = false) {
  const Material = plain ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const mesh = new THREE.Mesh(geometry, new Material({ color }));
  mesh.position.set(...position);
  scene.add(mesh);
  return mesh;
}
const box = (size, pos, color, plain = false) => piece(new THREE.BoxGeometry(...size), pos, color, plain);
const lift = ([x, y, z], meters) => [x, y + meters, z];
const bridge = [];
for (const { id, x: [a, b], z: [c, d], from, to } of layout.decks) {
  const angle = Math.atan2(to - from, b - a);
  const length = Math.hypot(b - a, to - from);
  const x = (a + b) / 2;
  const y = (from + to) / 2;
  const ramp = box([length, 0.14, d - c], [x, y - 0.07, (c + d) / 2], id === "lower" ? 0x526878 : 0x83979d);
  ramp.rotation.z = angle;
  const rails = [c + 0.045, d - 0.045].map(z => {
    const edge = box([length, 0.028, 0.065], [x, y + 0.025, z], id === "bridge" ? 0xf3b15d : 0xbbcbcd, true);
    edge.rotation.z = angle;
    return edge;
  });
  if (id === "bridge") bridge.push(ramp, ...rails);
}
const avatar = piece(new THREE.CapsuleGeometry(0.16, 0.24, 6, 12), [0, 0, 0], 0x79dfff, true);
const objects = layout.objects;
const gate = objects.gate ? box([0.17, 1.35, 1.69], lift(objects.gate, 0.675), 0xf37f70, true) : null;
if (objects.switch) box([0.42, 0.045, 0.46], lift(objects.switch, 0.028), 0x78b7ff, true);
if (objects.exit) box([0.65, 0.055, 0.67], lift(objects.exit, 0.031), 0x7de1aa, true);
if (objects.delivery) box([0.66, 0.055, 0.64], lift(objects.delivery, 0.031), 0x7de1aa, true);
if (objects.bench) box([0.59, 0.55, 0.49], lift(objects.bench, 0.28), 0x9fc3db);
const materials = {};
if (task === "C06") {
  materials.ore = piece(new THREE.DodecahedronGeometry(0.24), lift(objects.ore, 0.24), 0xf2b35a, true);
  materials.fiber = piece(new THREE.TorusGeometry(0.16, 0.049, 12, 24), lift(objects.fiber, 0.24), 0xc7a1ff, true);
}

node("title").textContent = layout.title;
node("objective").textContent = layout.instructions;

function draw() {
  const state = world.getSnapshot();
  avatar.position.set(...lift(state.avatar.position, 0.28));
  if (task === "A07") {
    const open = state.gate.open && fault !== "stale_gate_feedback";
    gate.position.y = state.gate.position[1] + 0.675 + (open ? 1.43 : 0);
    gate.material.color.setHex(open ? 0x7de1aa : 0xf37f70);
    node("mechanism").textContent = open ? "Gate open" : "Gate closed";
  } else if (task === "C06") {
    for (const id of Object.keys(materials)) materials[id].visible = !state[id].collected;
    const { ore, fiber, kit } = state.inventory;
    node("mechanism").textContent = fault === "stale_inventory" ? "Mineral 1 · Fiber 1 · Kit 0" :
      "Mineral " + ore + " · Fiber " + fiber + " · Kit " + kit;
  } else {
    const extended = state.bridge.extended || fault === "stale_bridge_feedback";
    for (const part of bridge) part.visible = extended;
    node("mechanism").textContent = extended ? "Bridge extended" : "Bridge retracted";
  }
  node("progress").textContent = state.outcome === "victory" ? "Complete" :
    state.action ?? (state.avatar.supportSurface ? "In progress" : "Falling");
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
