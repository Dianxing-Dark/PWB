import * as THREE from './three.module.js';

const stepMs = 1000 / 60;
const speed = 3.6 / 60;
const avatarRadius = 0.28;
const cargoRadius = 0.46;
const gateZ = -2.65;
const upperHeight = 2.15;
const plateA = { x: 0, z: 2.63, half: 0.79, surface: 'lower' };
const plateB = { x: 0, z: -0.33, half: 0.67, surface: 'upper' };
const keys = new Set();
const events = [];
let state;
let nextSequence = 0;
let accumulator = 0;
let previousFrame = performance.now();

function inside(x, z, left, right, north, south) {
  return x >= left && x <= right && z >= north && z <= south;
}

function surfaces(x, z) {
  const result = [];
  if (inside(x, z, -5, 5, 1.45, 7)) result.push({ id: 'lower', y: 0 });
  if (inside(x, z, 3.05, 5, 2.35, 6.25)) {
    result.push({ id: 'ramp', y: upperHeight * (6.25 - z) / 3.9 });
  }
  if (inside(x, z, -2.5, 5, -5.35, 2.35)) result.push({ id: 'upper', y: upperHeight });
  return result;
}

function onPlate(body, plate, radius, round) {
  if (body.surface !== plate.surface) return false;
  const dx = Math.max(0, Math.abs(body.x - plate.x) - plate.half);
  const dz = Math.max(0, Math.abs(body.z - plate.z) - plate.half);
  return round ? Math.hypot(dx, dz) < radius : Math.max(dx, dz) < radius;
}

function emit(type, data) {
  events.push({ sequence: nextSequence++, type, attemptId: state.attemptId, tick: state.tick, data });
}

function contact(plateId, actorId, active) {
  emit('contact_changed', { actorId, objectId: plateId, plateId, active });
}

function reset(scenario) {
  const previousAttemptId = state?.attemptId;
  const seated = scenario === 'box_on_A_before_B';
  const upstairs = seated || scenario === 'avatar_near_closed_door';
  state = {
    attemptId: previousAttemptId === undefined ? 0 : previousAttemptId + 1,
    tick: 0,
    avatar: { x: 0, y: upstairs ? upperHeight : 0, z: seated ? 0.95 : upstairs ? -1.93 : 5.83, surface: upstairs ? 'upper' : 'lower', vy: 0 },
    box: { x: 0, y: 0, z: seated ? 2.63 : 4.3, surface: 'lower', vy: 0 },
    a: false, b: false, since: null, unlocked: false, passable: false,
    openedAt: null, goalCrossed: false, outcome: 'none'
  };
  state.a = onPlate(state.box, plateA, cargoRadius, false);
  keys.clear();
  accumulator = 0;
  previousFrame = performance.now();
  if (previousAttemptId !== undefined) emit('attempt_restarted', { previousAttemptId, scenario: scenario ?? null });
  if (state.a) contact('A', 'box', true);
}

function gravity(body) {
  const candidates = surfaces(body.x, body.z);
  if (body.surface !== null) {
    const support = candidates.reverse().find(({ y }) => y <= body.y + 0.13 && y >= body.y - 0.13);
    if (support) {
      body.y = support.y;
      body.surface = support.id;
      return;
    }
    body.surface = null;
  }
  body.vy -= 9.81 / 60;
  const nextY = body.y + body.vy / 60;
  const landing = candidates.filter(({ y }) => y <= body.y + 0.00001 && y >= nextY)
    .sort((a, b) => b.y - a.y)[0];
  if (landing) {
    body.y = landing.y;
    body.surface = landing.id;
    body.vy = 0;
  } else {
    body.y = nextY;
  }
}

function overlapsCargo(x, z, box) {
  return Math.hypot(
    Math.max(0, Math.abs(x - box.x) - cargoRadius),
    Math.max(0, Math.abs(z - box.z) - cargoRadius)
  ) < avatarRadius;
}

function hitsStop(x, z, radius) {
  return inside(x, z, -1.55 - radius, 1.55 + radius, 1.72 - radius, 1.94 + radius);
}

function moveAxis(axis, distance) {
  if (!distance) return;
  const { avatar, box } = state;
  const x = avatar.x + (axis === 'x' ? distance : 0);
  const z = avatar.z + (axis === 'z' ? distance : 0);
  if (avatar.y < 0.4 && avatar.y > -0.4 && hitsStop(x, z, avatarRadius)) return;
  if (avatar.y >= upperHeight - 0.1 && z < gateZ + 0.16 + avatarRadius && z > gateZ - 0.16 - avatarRadius) {
    if (Math.abs(x) > 1.03 - avatarRadius || !state.passable) return;
  }
  if (Math.abs(avatar.y - box.y) < 0.72 && overlapsCargo(x, z, box)) {
    const cargoX = box.x + (axis === 'x' ? distance : 0);
    const cargoZ = box.z + (axis === 'z' ? distance : 0);
    if (!box.surface || (box.y < 0.4 && hitsStop(cargoX, cargoZ, cargoRadius))) return;
    box.x = cargoX;
    box.z = cargoZ;
  }
  avatar.x = x;
  avatar.z = z;
}

function update() {
  if (state.outcome !== 'none') return;
  state.tick++;
  const { avatar, box } = state;
  const oldZ = avatar.z;
  const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const dz = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  const scale = speed / (Math.hypot(dx, dz) || 1);
  if (avatar.y > -0.3) {
    moveAxis('x', dx * scale);
    moveAxis('z', dz * scale);
  }
  gravity(avatar);
  gravity(box);

  const a = onPlate(box, plateA, cargoRadius, false);
  const b = onPlate(avatar, plateB, avatarRadius, true);
  if (a !== state.a) contact('A', 'box', a);
  if (b !== state.b) contact('B', 'avatar', b);
  state.a = a;
  state.b = b;
  if (!a || !b) state.since = null;
  else if (state.since === null) state.since = state.tick;

  if (!state.unlocked && state.since !== null && state.tick - state.since >= 120) {
    state.unlocked = true;
    state.openedAt = state.tick;
    emit('door_state_changed', { doorId: 'gate', unlocked: true, passable: false });
  }
  if (state.unlocked && !state.passable && state.tick - state.openedAt >= 18) {
    state.passable = true;
    emit('door_state_changed', { doorId: 'gate', unlocked: true, passable: true });
  }
  if (state.passable && avatar.surface === 'upper' && Math.abs(avatar.x) <= 1.03 - avatarRadius &&
      oldZ >= gateZ && avatar.z < gateZ) {
    state.goalCrossed = true;
  }
  if (avatar.y < -3.6 || box.y < -3.6) state.outcome = 'failure';
  else if (state.goalCrossed && avatar.surface === 'upper' && inside(avatar.x, avatar.z, -1.45, 1.45, -5.08, -3.77)) {
    state.outcome = 'victory';
  }
  if (state.outcome !== 'none') emit('outcome_changed', { outcome: state.outcome });
}

function position({ x, y, z }) {
  return [x, y, z];
}

reset();
window.__gameTest = {
  getSnapshot() {
    return {
      attemptId: state.attemptId, tick: state.tick,
      avatar: { position: position(state.avatar), supportSurface: state.avatar.surface },
      box: { position: position(state.box), supportSurface: state.box.surface },
      plates: { A: { active: state.a }, B: { active: state.b } },
      dualActiveSinceTick: state.since,
      door: { unlocked: state.unlocked, passable: state.passable },
      goalCrossed: state.goalCrossed, outcome: state.outcome
    };
  },
  getEvents(afterSequence = -1) {
    return events.filter(({ sequence }) => sequence > afterSequence)
      .map(event => ({ ...event, data: { ...event.data } }));
  },
  loadScenario(id) {
    if (id !== 'box_on_A_before_B' && id !== 'avatar_near_closed_door') {
      return { ok: false, reason: 'Unknown scenario' };
    }
    reset(id);
    return { ok: true, reason: null };
  }
};

window.addEventListener('keydown', event => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'KeyR' && !event.repeat && state.outcome !== 'none') reset();
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
document.getElementById('retry').addEventListener('click', () => reset());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151e28);
const camera = new THREE.OrthographicCamera();
camera.position.set(5.6, 15, 19);
camera.lookAt(0.45, 0.6, 0.8);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch {
  document.getElementById('scene').textContent = 'WebGL 2 is required to display Relay Vault.';
}
const viewport = document.getElementById('scene');
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  const resize = () => {
    const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
    const height = Math.max(15.2, 14.6 / aspect);
    camera.left = -height * aspect / 2;
    camera.right = -camera.left;
    camera.top = height / 2;
    camera.bottom = -camera.top;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
  };
  new ResizeObserver(resize).observe(viewport);
  resize();
}

scene.add(new THREE.HemisphereLight(0xd3eeff, 0x526173, 2.2));
const light = new THREE.DirectionalLight(0xffead3, 2.15);
light.position.set(-6, 12, 5);
scene.add(light);

function mesh(geometry, color, parent = scene, glow = 0) {
  const material = new THREE.MeshStandardMaterial({
    color, roughness: 0.77, emissive: color, emissiveIntensity: glow
  });
  const object = new THREE.Mesh(geometry, material);
  parent.add(object);
  return object;
}

function block(x, y, z, width, height, depth, color, parent, glow) {
  const object = mesh(new THREE.BoxGeometry(width, height, depth), color, parent, glow);
  object.position.set(x, y, z);
  return object;
}

function label(message, x, y, z, width, color, height = width * 0.34) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * height / width);
  const context = canvas.getContext('2d');
  context.font = 'bold ' + Math.round(canvas.height * 0.66) + 'px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(message, 256, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  sign.rotation.x = -Math.PI / 2;
  sign.position.set(x, y, z);
  scene.add(sign);
}

function deck(left, right, north, south, y, color, edge) {
  const width = right - left;
  const depth = south - north;
  const x = (left + right) / 2;
  const z = (north + south) / 2;
  block(x, y - 0.22, z, width, 0.44, depth, color);
  block(x, y - 0.1, south + 0.008, width, 0.05, 0.026, edge);
  block(right + 0.008, y - 0.1, z, 0.026, 0.05, depth, edge);
  for (let offset = 1; offset < width; offset++) {
    block(left + offset, y + 0.002, z, 0.012, 0.004, depth, 0x33424f);
  }
  for (let offset = 1; offset < depth; offset++) {
    block(x, y + 0.003, north + offset, width, 0.004, 0.012, 0x33424f);
  }
}

const voidGrid = new THREE.GridHelper(90, 60, 0x31404d, 0x25333f);
voidGrid.position.y = -4.2;
scene.add(voidGrid);
deck(-5, 5, 1.45, 7, 0, 0x283747, 0x748695);
deck(-2.5, 5, -5.35, 2.35, upperHeight, 0x354858, 0x83a8b5);
block(0, 0.17, 1.83, 3.1, 0.34, 0.22, 0x775539);
for (let x = -4.7; x < 5; x += 0.38) {
  block(x, 0.012, 6.88, 0.22, 0.018, 0.065, 0xb2824e);
}

const rampAngle = Math.atan2(upperHeight, 3.9);
const rampLength = Math.hypot(upperHeight, 3.9);
const ramp = new THREE.Group();
ramp.position.set(4.025, upperHeight / 2, 4.3);
ramp.rotation.x = rampAngle;
scene.add(ramp);
block(0, -0.1, 0, 1.95, 0.2, rampLength, 0x425766, ramp);
for (const x of [-0.93, 0.93]) block(x, 0.014, 0, 0.055, 0.028, rampLength, 0x7ac0c3, ramp);
for (let z = -1.92; z <= 2; z += 0.41) {
  block(0, 0.008, z, 1.73, 0.016, 0.036, 0x627788, ramp);
}
label('↑ RAMP', 4.02, 0.015, 6.63, 1.65, '#afedf0');
label('↑ CARGO', 0, 0.015, 6.62, 2.05, '#ffcd90');
label('↑ GATE', 0, upperHeight + 0.015, -1.67, 1.65, '#d2e4ea');
label('← B', 3.95, upperHeight + 0.015, 0.6, 1.38, '#a9ebd9');

function makePlate(plate, y, accent, letter, labelZ) {
  const size = plate.half * 2;
  block(plate.x, y + 0.008, plate.z, size + 0.07, 0.018, size + 0.07, 0x142029);
  const face = block(plate.x, y + 0.023, plate.z, size, 0.025, size, accent);
  block(plate.x, y + 0.039, plate.z, size - 0.16, 0.012, size - 0.16, 0x263a44);
  label(letter, plate.x, y + 0.048, plate.z, 0.92, '#f1faf7', 0.64);
  label(letter === 'A' ? 'A / LOWER' : 'B / UPPER', plate.x, y + 0.015, labelZ, 1.9,
    letter === 'A' ? '#ffc278' : '#8ff1ce');
  return face;
}

const faceA = makePlate(plateA, 0, 0xffad58, 'A', 3.61);
const faceB = makePlate(plateB, upperHeight, 0x73e3c1, 'B', 0.71);
block(0, upperHeight + 0.015, -4.39, 2.9, 0.03, 1.31, 0x23584b);
for (const x of [-1.42, 1.42]) block(x, upperHeight + 0.036, -4.39, 0.04, 0.02, 1.3, 0x8ff1ce, scene, 0.25);
label('EXIT', 0, upperHeight + 0.035, -4.42, 1.65, '#c2ffe7');

const wallColor = 0x3d505f;
block(-1.765, upperHeight + 0.78, gateZ, 1.47, 1.56, 0.32, wallColor);
block(3.015, upperHeight + 0.78, gateZ, 3.97, 1.56, 0.32, wallColor);
for (const x of [-1.11, 1.11]) {
  block(x, upperHeight + 0.91, gateZ, 0.16, 1.82, 0.39, 0x6c8994);
}
block(0, upperHeight + 1.76, gateZ, 2.38, 0.16, 0.39, 0x6c8994);
const gate = new THREE.Group();
gate.position.set(0, upperHeight, gateZ);
scene.add(gate);
block(0, 0.78, 0, 2.06, 1.56, 0.26, 0x663f39, gate);
for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) {
  block(x, 0.78, 0.145, 0.065, 1.38, 0.04, 0xe18b62, gate);
}
const gateLamp = block(0, upperHeight + 1.76, gateZ + 0.22, 0.68, 0.061, 0.045, 0xff936b, scene, 0.7);

const cargo = new THREE.Group();
scene.add(cargo);
block(0, 0.46, 0, 0.92, 0.92, 0.92, 0x8e592f, cargo);
for (const x of [-0.35, 0.35]) {
  block(x, 0.47, 0, 0.11, 0.94, 0.95, 0xe6a050, cargo);
}
block(0, 0.46, 0.474, 0.42, 0.15, 0.03, 0xffcc80, cargo);

const player = new THREE.Group();
scene.add(player);
const body = mesh(new THREE.CapsuleGeometry(0.26, 0.36, 5, 16), 0x6acff8, player);
body.position.y = 0.45;
const helmet = mesh(new THREE.SphereGeometry(0.22, 18, 12), 0xb6eaff, player);
helmet.position.y = 0.91;
block(0, 0.93, -0.17, 0.27, 0.095, 0.12, 0x244958, player);
const marker = mesh(new THREE.TorusGeometry(0.32, 0.018, 6, 28), 0x75d9ff, player, 0.45);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.026;

const hud = Object.fromEntries([
  'attempt', 'a-led', 'b-led', 'door-led', 'relay-status', 'relay-time',
  'charge', 'result', 'result-title', 'result-copy'
].map(id => [id, document.getElementById(id)]));

function render() {
  player.position.set(...position(state.avatar));
  cargo.position.set(...position(state.box));
  faceA.material.emissiveIntensity = state.a ? 0.85 : 0.13;
  faceB.material.emissiveIntensity = state.b ? 0.85 : 0.13;
  const opening = state.unlocked ? Math.min(1, (state.tick - state.openedAt) / 18) : 0;
  gate.position.y = upperHeight + 1.68 * opening;
  gateLamp.material.color.setHex(state.passable ? 0x8ff1ce : 0xff936b);
  gateLamp.material.emissive.copy(gateLamp.material.color);
  if (renderer) renderer.render(scene, camera);
  const charge = state.unlocked ? 120 : state.since === null ? 0 : state.tick - state.since;
  hud.attempt.textContent = 'ATTEMPT ' + String(state.attemptId + 1).padStart(2, '0');
  hud['a-led'].classList.toggle('active', state.a);
  hud['b-led'].classList.toggle('active', state.b);
  hud['door-led'].classList.toggle('active', state.passable);
  hud['relay-status'].textContent = state.passable ? 'GATE OPEN' : state.unlocked ? 'GATE OPENING' :
    state.since !== null ? 'RELAY CHARGING' : 'GATE LOCKED';
  hud['relay-time'].textContent = (charge / 60).toFixed(1) + ' / 2.0 s';
  hud.charge.value = charge;
  hud.result.hidden = state.outcome === 'none';
  if (state.outcome !== 'none') {
    const victory = state.outcome === 'victory';
    hud['result-title'].textContent = victory ? 'Vault cleared' : 'Signal lost';
    hud['result-copy'].textContent = victory ? 'You reached the exit.' : 'An object fell from the vault.';
  }
}

function frame(now) {
  accumulator += Math.max(0, Math.min(now - previousFrame, 250));
  previousFrame = now;
  while (accumulator >= stepMs) {
    update();
    accumulator -= stepMs;
  }
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
