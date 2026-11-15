import { createWorkshop } from './scene.js';

const STEP = 1000 / 60;
const SPEED = 4.1 / 60;
const REACH = 1.42;
const layout = {
  left: -8.4, right: 8.4, back: -5.2, front: 5.45, height: 2.65,
  upperEdge: -1.35, rampLeft: 5.6, rampFoot: 3.92
};
const positions = {
  ore: [-3.65, 0, 1.38],
  fiber: [3.52, layout.height, -3.33],
  bench: [-0.52, layout.height, -2.94],
  delivery: [-5.84, layout.height, -2.94]
};
const labels = { ore: '矿石', fiber: '纤维', bench: '合成台', delivery: '交付站' };
const actions = { ore: '拾取矿石', fiber: '拾取纤维', bench: '使用合成台', delivery: '交付组件' };
const scenarioIds = new Set(['bench_with_ore', 'bench_ready', 'under_delivery', 'at_delivery']);
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const keys = new Set();
const events = [];
let sequence = 0;
let pendingUse = 0;
let accumulator = 0;
let heading = Math.PI;
let moving = false;
let soundEnabled = true;
let audio;

const $ = id => document.getElementById(id);
const counts = Object.fromEntries(['ore', 'fiber', 'kit'].map(id => [id, $('count-' + id)]));
const stepEls = ['ore', 'fiber', 'kit', 'delivery'].map(id => $('step-' + id));
const markerEls = Object.fromEntries(
  [...Object.keys(positions), 'player'].map(id => [id, $('marker-' + id)])
);

function startState(attemptId) {
  return {
    attemptId, tick: 0, outcome: 'none',
    avatar: { position: [-6.32, 0, 3.45], supportSurface: 'lower' },
    ore: { position: positions.ore, collected: false },
    fiber: { position: positions.fiber, collected: false },
    bench: { position: positions.bench },
    delivery: { position: positions.delivery },
    inventory: { ore: 0, fiber: 0, kit: 0 }
  };
}

let state = startState(0);

function emit(type, data) {
  events.push({ sequence: ++sequence, type, attemptId: state.attemptId, tick: state.tick, data });
}

function feedback(message, warning = false) {
  $('feedback-text').textContent = message;
  $('feedback').classList.toggle('warn', warning);
}

function restart(scenario) {
  const next = startState(state.attemptId + 1);
  if (scenario) {
    const crafted = scenario === 'under_delivery' || scenario === 'at_delivery';
    next.ore.collected = true;
    next.fiber.collected = scenario !== 'bench_with_ore';
    next.inventory = {
      ore: crafted ? 0 : 1,
      fiber: scenario === 'bench_ready' ? 1 : 0,
      kit: crafted ? 1 : 0
    };

    const under = scenario === 'under_delivery';
    const destination = crafted ? positions.delivery : positions.bench;
    next.avatar = {
      position: [destination[0], under ? 0 : layout.height, destination[2] + (under ? 0 : 0.96)],
      supportSurface: under ? 'lower' : 'upper'
    };
  }
  state = next;
  keys.clear();
  pendingUse = 0;
  accumulator = 0;
  heading = Math.PI;
  moving = false;
  emit('attempt_restarted', scenario ? { scenarioId: scenario } : {});
  if (!scenario) feedback('前往下层托盘，拾取矿石。');
  else if (scenario === 'under_delivery') feedback('已持有组件。沿坡道抵达上层交付站。');
  else if (scenario === 'at_delivery') feedback('组件已就绪，可在此交付。');
  else if (scenario === 'bench_ready') feedback('原料齐全，可在合成台制作组件。');
  else feedback('已拾取矿石。合成还需要 1 份纤维。');
  updateHUD();
}

window.__gameTest = {
  getSnapshot() {
    return structuredClone(state);
  },
  getEvents(afterSequence = -1) {
    return structuredClone(events.filter(event => event.sequence > afterSequence));
  },
  loadScenario(id) {
    if (!scenarioIds.has(id)) return { ok: false, reason: 'unknown_scenario' };
    restart(id);
    return { ok: true, reason: null };
  }
};

function tryMove(dx, dz) {
  const { left, right, back, front, height, rampLeft, rampFoot, upperEdge } = layout;
  const { position, supportSurface } = state.avatar;
  const x = Math.max(left + 0.26, Math.min(right - 0.26, position[0] + dx));
  const z = Math.max(back + 0.28, Math.min(front - 0.26, position[2] + dz));
  let surface = supportSurface;

  if (surface === 'lower' && x >= rampLeft && z > upperEdge && z < rampFoot) {
    if (position[2] < rampFoot) return;
    surface = 'ramp';
  } else if (surface === 'upper' && z > upperEdge) {
    if (x < rampLeft) return;
    surface = 'ramp';
  } else if (surface === 'ramp') {
    if (z >= rampFoot) surface = 'lower';
    else if (z <= upperEdge) surface = 'upper';
    else if (x < rampLeft) return;
  }

  const y = surface === 'ramp' ? height * (rampFoot - z) / (rampFoot - upperEdge)
    : surface === 'upper' ? height : 0;
  state.avatar.position = [x, y, z];
  if (surface !== supportSurface) {
    state.avatar.supportSurface = surface;
    emit('contact_changed', { id: 'avatar', surface: supportSurface, active: false, before: supportSurface, after: surface });
    emit('contact_changed', { id: 'avatar', surface, active: true, before: supportSurface, after: surface });
    if (surface === 'upper' && !state.fiber.collected) feedback('已到达上层，前往托盘拾取纤维。');
  }
}

function targets(sameFloor) {
  const [x, , z] = state.avatar.position;
  const nearby = [];
  for (const [id, [tx, y, tz]] of Object.entries(positions)) {
    if (state[id].collected) continue;
    const floor = y === 0 ? 'lower' : 'upper';
    if ((state.avatar.supportSurface === floor) !== sameFloor) continue;
    const distance = Math.hypot(x - tx, z - tz);
    if (distance <= REACH) nearby.push({ id, distance });
  }
  return nearby.sort((a, b) => a.distance - b.distance);
}

function setInventory(id, amount, source) {
  const before = state.inventory[id];
  state.inventory[id] = amount;
  emit('inventory_changed', { id, before, after: amount, source });
}

function use() {
  const id = targets(true)[0]?.id;
  if (!id) {
    const other = targets(false)[0]?.id;
    if (other === 'delivery') feedback('交付站在上层。请沿坡道上楼。', true);
    else if (other) feedback(labels[other] + '位于另一层，请走坡道。', true);
    else feedback('请先靠近原料、合成台或交付站。', true);
    playSound('warning');
    return;
  }
  if (id === 'ore' || id === 'fiber') {
    state[id].collected = true;
    setInventory(id, state.inventory[id] + 1, id);
    emit('material_collected', { id });
    const ready = state.ore.collected && state.fiber.collected;
    feedback('已拾取' + labels[id] + ' ×1。' +
      (ready ? '前往上层合成台。' : id === 'ore' ? '从右侧坡道前往上层。' : '矿石位于下层。'));
    playSound('pick');
    return;
  }
  if (id === 'bench') {
    const { inventory } = state;
    if (!inventory.ore || !inventory.fiber) {
      const missing = [inventory.ore ? '' : '矿石', inventory.fiber ? '' : '纤维'].filter(Boolean).join('和');
      feedback(inventory.kit ? '组件已制成，前往上层交付站。' : '合成需要 1 矿石和 1 纤维。缺少' + missing + '。', true);
      playSound('warning');
      return;
    }
    const before = { ...inventory };
    setInventory('ore', before.ore - 1, 'bench');
    setInventory('fiber', before.fiber - 1, 'bench');
    setInventory('kit', before.kit + 1, 'bench');
    emit('kit_crafted', { id: 'kit', before, after: { ...inventory } });
    feedback('合成成功！携带 1 份组件前往上层交付站。');
    playSound('craft');
    return;
  }
  if (!state.inventory.kit) {
    feedback('交付需要 1 份组件。请先在合成台制作。', true);
    playSound('warning');
    return;
  }
  setInventory('kit', state.inventory.kit - 1, 'delivery');
  emit('kit_delivered', { id: 'kit', remaining: state.inventory.kit });
  state.outcome = 'victory';
  emit('outcome_changed', { outcome: state.outcome });
  feedback('交付成功！工单已完成。');
  playSound('victory');
}

function tick() {
  state.tick++;
  moving = false;
  if (state.outcome !== 'none') return;

  const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const dz = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  if (dx || dz) {
    const old = state.avatar.position;
    const step = SPEED / Math.hypot(dx, dz);
    tryMove(dx * step, 0);
    tryMove(0, dz * step);
    moving = old[0] !== state.avatar.position[0] || old[2] !== state.avatar.position[2];
    heading = Math.atan2(dx, dz);
  }
  if (pendingUse) {
    pendingUse--;
    use();
  }
}

function updateHUD() {
  const { inventory, outcome } = state;
  for (const id of Object.keys(counts)) {
    counts[id].value = inventory[id];
    $('item-' + id).classList.toggle('has', inventory[id] > 0);
  }
  const won = outcome === 'victory';
  const steps = [state.ore.collected, state.fiber.collected, inventory.kit > 0 || won, won];
  const current = steps.indexOf(false);
  stepEls.forEach((el, i) => {
    el.classList.toggle('done', steps[i]);
    el.classList.toggle('current', i === current);
  });
  $('progress').textContent = steps.filter(Boolean).length + ' / 4';
  $('status').textContent = won ? '工单完成' : '工位就绪';
  $('victory').hidden = !won;
  updateProximity();
}

const levelNames = { lower: ['01', '下层'], upper: ['02', '上层'], ramp: ['↗', '坡道'] };
let displayedLevel;
let displayedTarget;
function updateProximity() {
  const level = state.avatar.supportSurface;
  if (level !== displayedLevel) {
    $('level').innerHTML = levelNames[level][0] + ' <b>' + levelNames[level][1] + '</b>';
    displayedLevel = level;
  }
  const target = state.outcome === 'none' ? targets(true)[0]?.id : null;
  if (target === displayedTarget) return;
  $('action').hidden = !target;
  $('action-text').textContent = target ? actions[target] : '';
  for (const id of Object.keys(positions)) markerEls[id].classList.toggle('near', id === target);
  displayedTarget = target;
}

const tones = {
  pick: [510, 740],
  craft: [380, 520, 660],
  victory: [523, 659, 784, 1047],
  warning: [185, 155]
};
function playSound(type) {
  if (!soundEnabled || !window.AudioContext) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    tones[type].forEach((frequency, i) => {
      const time = audio.currentTime + i * 0.087;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(0.10, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.17);
      osc.connect(gain).connect(audio.destination);
      osc.start(time);
      osc.stop(time + 0.18);
    });
  } catch {
    // Play remains available on devices without an audio output.
  }
}

addEventListener('keydown', event => {
  const { code, repeat } = event;
  if (moveKeys.has(code)) {
    event.preventDefault();
    keys.add(code);
  } else if (code === 'KeyE') {
    event.preventDefault();
    if (!repeat && state.outcome === 'none') pendingUse++;
  } else if (code === 'KeyR' && !repeat) restart();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  keys.clear();
  pendingUse = 0;
  accumulator = 0;
});
$('action').addEventListener('click', () => pendingUse++);
$('reset').addEventListener('click', () => restart());
$('again').addEventListener('click', () => restart());
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-text').textContent = soundEnabled ? '音效开' : '音效关';
  if (soundEnabled) playSound('pick');
});
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    keys.add(button.dataset.move);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, () => keys.delete(button.dataset.move));
  }
}

let workshop;
try {
  workshop = createWorkshop($('scene'), layout, positions, markerEls);
} catch (error) {
  console.error(error);
  $('scene').innerHTML = '<div class="scene-error">无法启动 3D 视图。请在支持 WebGL 2 的浏览器中打开。</div>';
}
updateHUD();
let lastTime;
let hudEvent = sequence;
let renderedAttempt = state.attemptId;
function frame(time) {
  const elapsed = lastTime === undefined ? 0 : time - lastTime;
  lastTime = time;
  accumulator += Math.min(elapsed, 250);
  while (accumulator >= STEP) {
    tick();
    accumulator -= STEP;
  }
  if (hudEvent !== sequence) {
    updateHUD();
    hudEvent = sequence;
  } else {
    updateProximity();
  }
  workshop?.render(state, heading, moving, time / 1000, renderedAttempt !== state.attemptId);
  renderedAttempt = state.attemptId;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
