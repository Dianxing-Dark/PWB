"use strict";

const $ = id => document.getElementById(id);
const ctx = $("world").getContext("2d");
const room = { x: 32, z: 48, w: 1016, h: 506 };
const pit = { x: 238, z: 350, w: 204, h: 155 };
const goal = { x: 911, z: 241, w: 111, h: 118 };
const gate = { x: 798, z: 240, w: 36, h: 120 };
const walls = [
  { x: 798, z: 48, w: 36, h: 192 },
  { x: 798, z: 360, w: 36, h: 194 }
];
const plates = {
  A: { x: 411, z: 161, w: 58, h: 58 },
  B: { x: 551, z: 391, w: 58, h: 58 }
};
const held = new Set();
const events = [];
let state;

function emit(type, data) {
  events.push({ sequence: events.length + 1, type, attemptId: state.attemptId, tick: state.tick, data });
}

function reset(scenario = null) {
  const previous = state;
  const onA = scenario === "box_on_A_before_B";
  state = {
    attemptId: previous ? previous.attemptId + 1 : 0,
    tick: 0,
    avatar: onA ? { x: 509, z: 420, r: 15 } :
      scenario === "avatar_near_closed_door" ? { x: 764, z: 300, r: 15 } : { x: 120, z: 190, r: 15 },
    box: { x: onA ? 440 : 247, z: 190, r: 24 },
    facing: 0,
    plates: { A: onA, B: false },
    dualActiveSinceTick: null,
    unlocked: false,
    gateContact: false,
    crossed: false,
    goalCrossed: false,
    outcome: "none"
  };
  held.clear();
  accumulator = 0;
  lastTime = performance.now();
  if (previous) emit("attempt_restarted", { previousAttemptId: previous.attemptId, scenario });
  if (onA) emit("contact_changed", { actorId: "box", objectId: "A", active: true, touching: true });
  render();
}

function overlaps(x, z, r, rect) {
  return x + r > rect.x && x - r < rect.x + rect.w && z + r > rect.z && z - r < rect.z + rect.h;
}

function contains(x, z, rect) {
  return x >= rect.x && x <= rect.x + rect.w && z >= rect.z && z <= rect.z + rect.h;
}

function blocked(x, z, r, isBox = false) {
  return x - r < room.x || z - r < room.z || x + r > room.x + room.w || z + r > room.z + room.h ||
    walls.some(wall => overlaps(x, z, r, wall)) ||
    ((!state.unlocked || isBox) && overlaps(x, z, r, gate)) ||
    (isBox && overlaps(x, z, r, pit));
}

function move(axis, amount) {
  const { avatar, box } = state;
  const x = avatar.x + (axis === "x" ? amount : 0);
  const z = avatar.z + (axis === "z" ? amount : 0);
  if (blocked(x, z, avatar.r)) return;
  const boxBounds = { x: box.x - box.r, z: box.z - box.r, w: 2 * box.r, h: 2 * box.r };
  if (overlaps(x, z, avatar.r, boxBounds)) {
    const separation = avatar.r + box.r;
    const destination = (axis === "x" ? x : z) + Math.sign(amount) * separation;
    const bx = axis === "x" ? destination : box.x;
    const bz = axis === "z" ? destination : box.z;
    if (blocked(bx, bz, box.r, true)) return;
    box[axis] = destination;
  }
  avatar[axis] += amount;
}

function setContact(id, actorId, active) {
  if (state.plates[id] === active) return;
  state.plates[id] = active;
  emit("contact_changed", { actorId, objectId: id, active, touching: active });
}

function finish(outcome) {
  state.outcome = outcome;
  emit("outcome_changed", { previous: "none", outcome });
}

function step() {
  if (state.outcome !== "none") return;
  state.tick++;
  const dx = Number(held.has("KeyD")) - Number(held.has("KeyA"));
  const dz = Number(held.has("KeyS")) - Number(held.has("KeyW"));
  if (dx || dz) {
    const speed = 3 / Math.hypot(dx, dz);
    state.facing = Math.atan2(dz, dx);
    if (dx) move("x", dx * speed);
    if (dz) move("z", dz * speed);
  }
  const { avatar, box } = state;
  const fallen = contains(avatar.x, avatar.z, pit);
  setContact("A", "box", overlaps(box.x, box.z, box.r, plates.A));
  setContact("B", "avatar", !fallen && overlaps(avatar.x, avatar.z, avatar.r, plates.B));
  if (!state.plates.A || !state.plates.B) {
    state.dualActiveSinceTick = null;
  } else {
    state.dualActiveSinceTick ??= state.tick;
    if (!state.unlocked && state.tick - state.dualActiveSinceTick >= 120) {
      state.unlocked = true;
      emit("door_state_changed", { doorId: "gate", unlocked: true, passable: true });
    }
  }
  if (fallen) {
    emit("contact_changed", { actorId: "avatar", objectId: "pit", active: true, touching: true });
    finish("failure");
    return;
  }
  const gateContact = overlaps(avatar.x, avatar.z, avatar.r, gate);
  if (gateContact !== state.gateContact) {
    state.gateContact = gateContact;
    emit("contact_changed", { actorId: "avatar", objectId: "gate", active: gateContact, touching: gateContact });
  }
  if (state.unlocked && avatar.x - avatar.r >= gate.x + gate.w) state.crossed = true;
  if (state.crossed && contains(avatar.x, avatar.z, goal)) {
    state.goalCrossed = true;
    emit("contact_changed", { actorId: "avatar", objectId: "goal", active: true, touching: true });
    finish("victory");
  }
}

const position = actor => [actor.x / 60, 0, actor.z / 60];
window.__gameTest = {
  getSnapshot() {
    return {
      attemptId: state.attemptId, tick: state.tick,
      avatar: { position: position(state.avatar) },
      box: { position: position(state.box), supportSurface: "floor" },
      plates: { A: { active: state.plates.A }, B: { active: state.plates.B } },
      dualActiveSinceTick: state.dualActiveSinceTick,
      door: { unlocked: state.unlocked, passable: state.unlocked },
      goalCrossed: state.goalCrossed, outcome: state.outcome
    };
  },
  getEvents(afterSequence = -1) {
    return events.filter(event => event.sequence > afterSequence)
      .map(event => ({ ...event, data: { ...event.data } }));
  },
  loadScenario(id) {
    if (id !== "box_on_A_before_B" && id !== "avatar_near_closed_door") {
      return { ok: false, reason: "Unknown scenario" };
    }
    reset(id);
    return { ok: true, reason: null };
  }
};

function rect(x, z, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, z, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x + .5, z + .5, w - 1, h - 1);
  }
}

function line(points, color, width = 1, dash = []) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function label(value, x, z, color, size = 12, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, z);
}

function disc(x, z, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, z, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function paintRoom() {
  rect(0, 0, 1080, 600, "#0c171a");
  rect(room.x, room.z, room.w, room.h, "#192b30", "#507072");
  for (let x = 33; x < 1048; x += 30) line([[x, 49], [x, 553]], "#263c40");
  for (let z = 49; z < 554; z += 30) line([[33, z], [1047, z]], "#263c40");
  label("OPERATIONS FLOOR", 32, 26, "#8db2b3");
  label("EVACUATION BAY", 1048, 26, "#8db2b3", 12, "right");
  label("RELAY CONTROL  /  XZ PLANE", 32, 576, "#759697", 11);
  label("ATTEMPT " + String(state.attemptId + 1).padStart(2, "0"), 1048, 576, "#759697", 11, "right");
  rect(68, 131, 105, 117, "#233b3f", "#507173");
  label("ENTRY", 120, 259, "#9db9ba", 11, "center");
  line([[281, 190], [410, 190]], "#a58654", 2, [7, 9]);
  line([[390, 183], [403, 190], [390, 197]], "#e7ba75", 2);
  line([[469, 190], [687, 190], [687, 300], [798, 300]], state.plates.A ? "#f6c37c" : "#5e503a", 3);
  line([[609, 420], [687, 420], [687, 306], [798, 306]], state.plates.B ? "#66edd4" : "#385d5a", 3);
  disc(687, 303, 11, "#1a292b", state.unlocked ? "#66edd4" : "#68888a");
  rect(pit.x - 6, pit.z - 6, pit.w + 12, pit.h + 12, "#50372b", "#bf7950");
  for (let x = pit.x - 4; x < pit.x + pit.w; x += 14) {
    line([[x, pit.z - 1], [x + 6, pit.z - 6]], "#f8ab66", 3);
    line([[x, pit.z + pit.h + 5], [x + 6, pit.z + pit.h]], "#f8ab66", 3);
  }
  const shade = ctx.createLinearGradient(0, pit.z, 0, pit.z + pit.h);
  shade.addColorStop(0, "#05090c");
  shade.addColorStop(1, "#121b21");
  rect(pit.x, pit.z, pit.w, pit.h, shade, "#120e0d");
  label("▲", 340, 408, "#ffad70", 24, "center");
  label("OPEN PIT", 340, 439, "#efb288", 14, "center");
  rect(goal.x, goal.z, goal.w, goal.h, "#193a39", "#519c90");
  rect(goal.x + 8, goal.z + 8, goal.w - 16, goal.h - 16, "#244d47", "#3c7268");
  label("→", 966, 284, "#78f4d7", 32, "center");
  label("EXIT", 966, 321, "#b6f9e8", 16, "center");
  for (const wall of walls) {
    rect(wall.x, wall.z, wall.w, wall.h, "#2e4549", "#638084");
    rect(wall.x + 5, wall.z + 1, 5, wall.h - 2, "#455f61");
    for (let z = wall.z + 15; z < wall.z + wall.h - 8; z += 22) rect(wall.x + 16, z, 12, 3, "#16282c");
  }
  rect(gate.x, gate.z, gate.w, gate.h, state.unlocked ? "#244f47" : "#513632", state.unlocked ? "#66e9cb" : "#e99e77");
  if (!state.unlocked) {
    for (let z = 248; z < 360; z += 12) line([[800, z], [832, z]], "#b36b53", 2);
  }
  label(state.unlocked ? "GATE OPEN" : "GATE SEALED", 816, 220, state.unlocked ? "#8cf9dd" : "#ffd1a9", 11, "center");
}

function paintPlate(id, accent, caption) {
  const { x, z, w, h } = plates[id];
  const active = state.plates[id];
  rect(x, z, w, h, active ? "#31534d" : "#17282d", active ? accent : "#6a817e");
  rect(x + 6, z + 6, w - 12, h - 12, "#294045", accent);
  label(id, x + w / 2, z + h / 2, accent, 23, "center");
  label(caption, x + w / 2, z + h + 18, accent, 11, "center");
}

function paintActors() {
  const { x, z, r } = state.box;
  rect(x - r + 4, z - r + 7, 48, 48, "#0a1418");
  rect(x - r, z - r, 48, 48, "#735036", "#f4bd74");
  rect(x - r + 5, z - r + 5, 38, 38, "#9f7245", "#cc9757");
  line([[x - 16, z + 16], [x + 16, z - 16]], "#67452e", 6);
  rect(x - 15, z - 8, 30, 16, "#392f26");
  label("CRATE", x, z, "#ffe0ab", 9, "center");
  const player = state.avatar;
  disc(player.x + 3, player.z + 5, 17, "#0c191c");
  disc(player.x, player.z, 16, "#153d40", "#96ffe5");
  disc(player.x, player.z, 11, "#64d7c1", "#a0f7e6");
  const a = state.facing;
  line([[player.x + Math.cos(a) * 4, player.z + Math.sin(a) * 4],
    [player.x + Math.cos(a) * 11, player.z + Math.sin(a) * 11]], "#163f44", 4);
}

function render() {
  paintRoom();
  paintPlate("A", "#ffc17b", "A / CRATE PLATE");
  paintPlate("B", "#78edda", "B / OPERATOR PLATE");
  paintActors();
  for (const id of ["A", "B"]) {
    $("lamp" + id).classList.toggle("on", state.plates[id]);
    $(id.toLowerCase() + "Text").textContent = state.plates[id] ? "ENGAGED" : "IDLE";
  }
  const progress = state.unlocked ? 100 : state.dualActiveSinceTick === null ? 0 :
    Math.floor((state.tick - state.dualActiveSinceTick) * 100 / 120);
  $("chargeText").textContent = progress + "%";
  $("fill").style.width = progress + "%";
  $("lampDoor").classList.toggle("on", state.unlocked);
  $("gateText").textContent = state.unlocked ? "OPEN" : "SEALED";
  const failed = state.outcome === "failure";
  $("overlay").hidden = state.outcome === "none";
  $("status").textContent = failed ? "▲  ATTEMPT FAILED" :
    state.outcome === "victory" ? "●  EXIT REACHED" : "●  SYSTEM ONLINE";
  if (state.outcome !== "none") {
    $("resultLabel").textContent = failed ? "ATTEMPT FAILED" : "RELAY RESTORED";
    $("resultTitle").textContent = failed ? "You fell into the pit" : "Exit reached";
    $("resultDetail").textContent = failed ? "Retry to return to the entry bay." : "Both plates powered the gate and you reached the exit.";
  }
}

const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
window.addEventListener("keydown", event => {
  if (movementKeys.has(event.code)) {
    event.preventDefault();
    held.add(event.code);
  }
  if (event.code === "KeyR" && !event.repeat) {
    event.preventDefault();
    reset();
  }
});
window.addEventListener("keyup", event => held.delete(event.code));
window.addEventListener("blur", () => held.clear());
$("retry").addEventListener("click", () => reset());

const tickTime = 1000 / 60;
let accumulator = 0;
let lastTime = performance.now();
function frame(now) {
  accumulator += Math.max(0, now - lastTime);
  lastTime = now;
  while (accumulator >= tickTime) {
    step();
    accumulator -= tickTime;
  }
  render();
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
