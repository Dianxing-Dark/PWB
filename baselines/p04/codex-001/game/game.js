import * as THREE from './three.module.js';
import { FreightSimulation, gateX, bayX, aperture, period } from './simulation.js';

const game = new FreightSimulation();
const byId = id => document.getElementById(id);
const keys = new Set();
window.__gameTest = {
  getSnapshot: () => game.snapshot(),
  getEvents: (afterSequence = -1) => structuredClone(game.events.filter(e => e.sequence > afterSequence)),
  loadScenario: id => {
    const result = game.loadScenario(id);
    if (result.ok) keys.clear();
    return result;
  }
};
const restart = () => { keys.clear(); game.restart(); };
byId('retry').addEventListener('click', restart);
window.addEventListener('keydown', event => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR'].includes(event.code)) {
    event.preventDefault();
    if (event.code === 'KeyR' && !event.repeat) restart();
    keys.add(event.code);
  }
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

const mount = byId('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x263943);
scene.fog = new THREE.FogExp2(0x263943, 0.026);
const camera = new THREE.OrthographicCamera();
camera.position.set(10, 13, 25);
camera.lookAt(1.6, 0.3, 0);
function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  const aspect = width / height;
  const span = Math.max(6.8, 14.6 / aspect);
  Object.assign(camera, { left: -span * aspect, right: span * aspect, top: span, bottom: -span, near: 0.1, far: 120 });
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resize).observe(mount);
resize();
scene.add(new THREE.HemisphereLight(0xe0f5ff, 0x687274, 2));
const sun = new THREE.DirectionalLight(0xffe1b9, 2.7);
sun.position.set(-10, 19, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 15, bottom: -15, far: 65 });
sun.shadow.normalBias = 0.035;
scene.add(sun);

function block(parent, w, h, d, x, y, z, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const steel = 0x344b52;
const deck = 0x637c7d;
const amber = 0xffae48;
const dark = 0x202e33;
block(scene, 120, 0.3, 80, 0, -6.1, 0, 0x344953);
const grid = new THREE.GridHelper(110, 55, 0x54666a, 0x455a60);
grid.position.y = -5.93;
scene.add(grid);
function dock(left, right, y) {
  const x = (left + right) / 2;
  const length = right - left;
  block(scene, length, 0.58, 4.9, x, y - 0.29, 0, deck);
  block(scene, length - 0.08, 0.18, 4.94, x, y - 0.48, 0, steel);
  for (const legX of [left + 0.65, right - 0.65]) {
    for (const z of [-1.8, 1.8]) {
      block(scene, 0.35, y + 5.9, 0.38, legX, (y - 5.9) / 2, z, steel);
      block(scene, 0.72, 0.24, 0.72, legX, -5.8, z, dark);
    }
  }
  for (const z of [-2.32, 2.32]) block(scene, length - 0.18, 0.018, 0.055, x, y + 0.012, z, amber);
  for (let stripe = left + 0.35; stripe < right; stripe += 0.65) {
    block(scene, 0.31, 0.018, 0.035, stripe, y + 0.012, 0, 0x9caeaa);
  }
}
dock(-10, -5, 0);
dock(7, 14, 3.4);

function sign(label, x, y, z, color, width) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#162328'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 46px monospace'; ctx.fillText(label, 256, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width / 4, 1);
  scene.add(sprite);
}
sign('LOW DOCK', -8.5, 1.1, -2.15, '#ffc06a', 2.8);
sign('DELIVERY', 12.75, 4.6, -1.35, '#9af1bf', 2.7);
block(scene, 1.95, 0.026, 2.45, bayX + 0.975, 3.417, 0, 0x30876e);
for (const z of [-1.22, 1.22]) block(scene, 1.96, 0.028, 0.06, bayX + 0.975, 3.435, z, 0x98f4c0);
block(scene, 0.06, 0.028, 2.45, bayX, 3.435, 0, 0x98f4c0);
for (const z of [-1, 1]) {
  block(scene, 0.22, 2.65, 0.23, gateX, 4.725, z * aperture, amber);
  block(scene, 0.16, 1.1, 0.96, gateX, 3.95, z * 1.95, steel);
}
block(scene, 0.35, 0.26, 3.17, gateX, 6.05, 0, steel);
const lamp = block(scene, 0.39, 0.1, 0.48, gateX, 6.05, 0, amber);
const barrier = new THREE.Group();
scene.add(barrier);
for (let z = -1.29; z < 1.4; z += 0.26) block(barrier, 0.1, 2, 0.075, gateX, 4.45, z, 0xd17b4c);
for (const y of [3.6, 4.55, 5.4]) block(barrier, 0.12, 0.075, 2.78, gateX, y, 0, amber);

const lift = new THREE.Group();
scene.add(lift);
block(lift, 5, 0.36, 3.9, 0, -0.18, 0, 0x526a6f);
block(lift, 4.8, 0.18, 3.7, 0, -0.42, 0, dark);
for (const z of [-1.88, 1.88]) {
  block(lift, 4.94, 0.035, 0.09, 0, 0.018, z, amber);
  for (let x = -2.25; x < 2.5; x += 0.46) block(lift, 0.22, 0.13, 0.07, x, -0.28, z * 1.037, amber);
}
const crate = new THREE.Group();
scene.add(crate);
block(crate, 0.82, 0.81, 0.82, 0, 0.405, 0, 0xb56533);
for (const x of [-0.34, 0.34]) block(crate, 0.11, 0.85, 0.85, x, 0.425, 0, 0xf7b55c);
block(crate, 0.32, 0.21, 0.018, 0, 0.51, 0.42, 0xffdf9e);
const worker = new THREE.Group();
scene.add(worker);
const legs = [-0.13, 0.13].map(z => block(worker, 0.22, 0.42, 0.16, 0, 0.22, z, dark));
block(worker, 0.35, 0.44, 0.47, 0, 0.62, 0, 0x4db9b0);
block(worker, 0.26, 0.25, 0.31, 0.022, 0.94, 0, 0xcc9c78);
block(worker, 0.34, 0.13, 0.38, 0.02, 1.075, 0, amber);
block(worker, 0.055, 0.33, 0.48, -0.15, 0.66, 0, 0x95efe1);

const labels = { lowDock: 'LOW DOCK', outbound: 'LIFT ASCENDING', highDock: 'HIGH DOCK', inbound: 'LIFT DESCENDING' };
let last = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += Math.min(100, now - last);
  last = now;
  const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  while (accumulator >= 1000 / 60) {
    game.step(x, z);
    accumulator -= 1000 / 60;
  }
  const state = game.snapshot();
  lift.position.fromArray(state.platform.position);
  crate.position.fromArray(state.box.position);
  worker.position.fromArray(state.avatar.position);
  if (x || z) worker.rotation.y = -Math.atan2(z, x);
  legs.forEach((leg, i) => { leg.position.x = (x || z) ? Math.sin(state.tick * 0.34 + i * Math.PI) * 0.085 : 0; });
  barrier.visible = !state.gate.passable;
  lamp.material.color.setHex(state.gate.passable ? 0x75edab : 0xe67546);
  byId('phase').textContent = labels[state.platform.phase];
  byId('gate').textContent = state.gate.passable ? 'GATE OPEN' : 'GATE CLOSED';
  byId('gate').classList.toggle('open', state.gate.passable);
  byId('clock').textContent = (state.platform.phaseTick / 60).toFixed(1) + ' / 10 s';
  byId('fill').style.width = (state.platform.phaseTick / period * 100) + '%';
  byId('cargo').textContent = state.cargoDelivered ? '▣  CARGO 1 / 1' : '▣  CARGO 0 / 1';
  byId('result').hidden = state.outcome === 'none';
  if (state.outcome !== 'none') {
    byId('result-tag').textContent = state.outcome === 'victory' ? 'TRANSFER COMPLETE' : 'TRANSFER INTERRUPTED';
    byId('result-title').textContent = state.outcome === 'victory' ? 'Cargo delivered.' : 'Dropped off the deck.';
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
