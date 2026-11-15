export const HZ = 60;
export const OPENING_TICKS = 24;
export const UPPER_Y = 2.65;
export const RAMP_START = 5.8;
export const RAMP_END = 0.7;

function rect(id, x1, x2, z1, z2, y) {
  return { id, x1, x2, z1, z2, y };
}

export const layout = {
  lower: rect('lower_deck', -6.05, 6.05, -1.5, 7.28, 0),
  upper: rect('upper_deck', -5.05, 5.65, -4.9, RAMP_END, UPPER_Y),
  ramp: rect('ramp', 2.52, 5.65, RAMP_END, RAMP_START,
    z => UPPER_Y * Math.min(1, Math.max(0, (RAMP_START - z) / (RAMP_START - RAMP_END)))),
  bridge: rect('exit_bridge', 0.85, 3.85, -7.68, -4.9, UPPER_Y),
  exit: rect('exit_deck', -0.35, 5.05, -11.5, -7.68, UPPER_Y),
  A: rect('plate_A', -3.69, -1.69, -0.02, 1.78, 0),
  B: rect('plate_B', -3.65, -1.73, -3.06, -1.24, UPPER_Y),
  gate: rect('door', 0.85, 3.85, -6.14, -5.82, UPPER_Y),
  goal: rect('goal', 0.82, 3.88, -10.96, -8.58, UPPER_Y),
  bridgeRails: [
    rect('left_bridge_wall', 0.79, 1.04, -7.81, -4.88, UPPER_Y),
    rect('right_bridge_wall', 3.66, 3.91, -7.81, -4.88, UPPER_Y),
  ],
  rampRails: [
    rect('left_ramp_wall', 2.42, 2.62, 0.72, 5.55, UPPER_Y),
    rect('right_ramp_wall', 5.55, 5.75, 0.72, 5.55, UPPER_Y),
  ],
};

const floors = [layout.lower, layout.upper, layout.ramp, layout.bridge, layout.exit];
const scenarios = new Set(['box_on_A_before_B', 'avatar_near_closed_door']);
const GRAVITY = 18;

function body(x, y, z, radius) {
  return { x, y, z, radius, vy: 0, support: null, moving: false, angle: Math.PI };
}

function inside(r, x, z) {
  return x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;
}

function overlaps(r, x, z, margin) {
  return x + margin > r.x1 && x - margin < r.x2 &&
    z + margin > r.z1 && z - margin < r.z2;
}

function supportingFloor(b) {
  let floor = null;
  for (const candidate of floors) {
    if (!overlaps(candidate, b.x, b.z, b.radius * 0.52)) continue;
    const height = typeof candidate.y === 'function' ? candidate.y(b.z) : candidate.y;
    const rampContinuation = b.support === 'ramp' || b.support === 'upper_deck';
    const step = rampContinuation ? 0.13 : 0.055;
    if (height <= b.y + (b.support ? step : 0.0001) && (!floor || height > floor.height)) {
      floor = { id: candidate.id, height };
    }
  }
  return floor;
}

function stepHeight(b) {
  const floor = supportingFloor(b);
  if (floor && b.support && Math.abs(b.y - floor.height) < 0.135) {
    b.y = floor.height;
    b.support = floor.id;
    return;
  }
  b.vy -= GRAVITY / HZ;
  const y = b.y + b.vy / HZ;
  if (floor && y <= floor.height) {
    b.y = floor.height;
    b.vy = 0;
    b.support = floor.id;
  } else {
    b.y = y;
    b.support = null;
  }
}

function plateContact(b, plate, floor, margin) {
  return b.support === floor && Math.abs(b.y - plate.y) < 0.015 &&
    overlaps(plate, b.x, b.z, margin);
}

function wallCollision(b, x, z, passable) {
  if (b.y >= UPPER_Y - 0.32 && b.y < UPPER_Y + 1.2) {
    if (layout.bridgeRails.some(wall => overlaps(wall, x, z, b.radius))) return true;
    if (!passable && overlaps(layout.gate, x, z, b.radius)) return true;
  }
  const railTop = layout.ramp.y(z);
  return b.y > railTop - 0.32 && b.y < railTop + 0.46 &&
    layout.rampRails.some(wall => overlaps(wall, x, z, b.radius));
}

export class Game {
  constructor() {
    this.attemptId = 0;
    this.events = [];
    this.sequence = 0;
    this.reset();
  }

  emit(type, data) {
    this.events.push({ sequence: ++this.sequence, type, attemptId: this.attemptId, tick: this.tick, data });
  }

  contact(entityId, objectId, active) {
    const plate = objectId === layout.A.id ? 'A' : objectId === layout.B.id ? 'B' : null;
    const data = { actorId: entityId, entityId, objectId, active, contacting: active };
    if (plate) data.plate = plate;
    this.emit('contact_changed', data);
  }

  reset(source, scenario) {
    const previousAttemptId = this.attemptId;
    if (source) this.attemptId++;
    this.tick = 0;
    this.avatar = body(-2.69, 0, 5.55, 0.29);
    this.box = body(-2.69, 0, 3.68, 0.49);
    this.avatar.support = this.box.support = layout.lower.id;
    this.A = false;
    this.B = false;
    this.dualActiveSinceTick = null;
    this.unlocked = false;
    this.passable = false;
    this.unlockTick = null;
    this.doorContact = false;
    this.crossedDoor = false;
    this.goalCrossed = false;
    this.outcome = 'none';
    if (scenario === 'box_on_A_before_B') {
      Object.assign(this.box, { x: -2.69, z: 0.88 });
      Object.assign(this.avatar, { x: -2.69, y: UPPER_Y, z: -0.55, support: layout.upper.id });
      this.A = plateContact(this.box, layout.A, layout.lower.id, this.box.radius);
    }
    if (scenario === 'avatar_near_closed_door') {
      Object.assign(this.avatar, { x: 2.35, y: UPPER_Y, z: -4.9, support: layout.upper.id });
    }
    if (source) this.emit('attempt_restarted', { previousAttemptId, source, scenario: scenario ?? null });
    if (this.A) this.contact('box', layout.A.id, true);
  }

  loadScenario(id) {
    if (!scenarios.has(id)) return { ok: false, reason: 'Unknown scenario' };
    this.reset('scenario', id);
    return { ok: true, reason: null };
  }

  moveAxis(axis, amount, pushing) {
    if (!amount) return;
    const a = this.avatar;
    const b = this.box;
    const x = a.x + (axis === 'x' ? amount : 0);
    const z = a.z + (axis === 'z' ? amount : 0);
    if (wallCollision(a, x, z, this.passable)) return;
    const touchDistance = a.radius + b.radius;
    const sameHeight = a.y < b.y + 0.95 && a.y + 0.95 > b.y;
    const touchingBox = sameHeight && Math.abs(x - b.x) < touchDistance &&
      Math.abs(z - b.z) < touchDistance;
    if (touchingBox) {
      const side = a[axis] - b[axis];
      if (side * amount < 0 && Math.abs(side) >= touchDistance - Math.abs(amount) - 0.001) {
        const boxTravel = amount * 0.73;
        const bx = b.x + (axis === 'x' ? boxTravel : 0);
        const bz = b.z + (axis === 'z' ? boxTravel : 0);
        if (!pushing || !b.support || wallCollision(b, bx, bz, this.passable)) return;
        b[axis] += boxTravel;
        a[axis] = b[axis] + Math.sign(side) * touchDistance;
        return;
      }
      if (Math.abs(a[axis] + amount - b[axis]) <= Math.abs(side)) return;
    }
    a[axis] += amount;
  }

  finish(outcome) {
    if (this.outcome !== outcome) {
      const previous = this.outcome;
      this.outcome = outcome;
      this.emit('outcome_changed', { previous, outcome });
    }
  }

  step(keys) {
    if (this.outcome !== 'none') return;
    this.tick++;
    const a = this.avatar;
    const b = this.box;
    const oldX = a.x;
    const oldZ = a.z;
    const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const dz = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
    if (dx || dz) {
      const stride = (a.support ? 4.18 : 1.16) / HZ / Math.hypot(dx, dz);
      this.moveAxis('x', dx * stride, Boolean(a.support));
      this.moveAxis('z', dz * stride, Boolean(a.support));
      a.angle = Math.atan2(dx, dz);
    }
    a.moving = Math.hypot(a.x - oldX, a.z - oldZ) > 0.002;
    stepHeight(a);
    stepHeight(b);

    const onA = plateContact(b, layout.A, layout.lower.id, b.radius);
    const onB = plateContact(a, layout.B, layout.upper.id, a.radius * 0.82);
    if (onA !== this.A) this.contact('box', layout.A.id, onA);
    if (onB !== this.B) this.contact('avatar', layout.B.id, onB);
    this.A = onA;
    this.B = onB;

    const doorway = this.passable && a.support === layout.bridge.id &&
      overlaps(layout.gate, a.x, a.z, a.radius);
    if (doorway !== this.doorContact) this.contact('avatar', 'doorway', doorway);
    this.doorContact = doorway;
    if (this.passable && a.support === layout.bridge.id &&
      a.x > layout.gate.x1 && a.x < layout.gate.x2 &&
      oldZ >= layout.gate.z1 - a.radius && a.z < layout.gate.z1 - a.radius) {
      if (!this.crossedDoor) this.contact('avatar', 'door_exit', true);
      this.crossedDoor = true;
    }
    if (!this.goalCrossed && this.crossedDoor && a.support === layout.exit.id &&
      inside(layout.goal, a.x, a.z)) {
      this.goalCrossed = true;
      this.contact('avatar', layout.goal.id, true);
    }

    if (!this.unlocked) {
      if (onA && onB) {
        this.dualActiveSinceTick ??= this.tick;
        if (this.tick - this.dualActiveSinceTick >= 120) {
          this.unlocked = true;
          this.unlockTick = this.tick;
          this.emit('door_state_changed', {
            objectId: 'door', previous: { unlocked: false, passable: false }, unlocked: true, passable: false,
          });
        }
      } else {
        this.dualActiveSinceTick = null;
      }
    } else if (!this.passable && this.tick - this.unlockTick >= OPENING_TICKS) {
      this.passable = true;
      this.emit('door_state_changed', {
        objectId: 'door', previous: { unlocked: true, passable: false }, unlocked: true, passable: true,
      });
    }

    if (a.y < -4.65) this.finish('failure');
    if (this.goalCrossed) this.finish('victory');
  }

  getSnapshot() {
    const position = b => [b.x, b.y, b.z];
    return {
      attemptId: this.attemptId,
      tick: this.tick,
      avatar: { position: position(this.avatar), supportSurface: this.avatar.support },
      box: { position: position(this.box), supportSurface: this.box.support },
      plates: { A: { active: this.A }, B: { active: this.B } },
      dualActiveSinceTick: this.dualActiveSinceTick,
      door: { unlocked: this.unlocked, passable: this.passable },
      goalCrossed: this.goalCrossed,
      outcome: this.outcome,
    };
  }

  getEvents(afterSequence) {
    return this.events.filter(event => event.sequence > afterSequence).map(event => structuredClone(event));
  }
}
