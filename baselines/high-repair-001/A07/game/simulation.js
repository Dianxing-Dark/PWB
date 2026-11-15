export const layout = Object.freeze({
  rampStart: -10.4,
  rampEnd: -5.75,
  end: 8.85,
  deckY: 2.65,
  deckHalfWidth: 1.36,
  gateX: 1.65,
  switchX: -0.73,
  switchZ: -0.95,
  floorMinX: -11.13,
  floorMaxX: 11.13,
  floorMinZ: -3.12,
  floorMaxZ: 3.76,
});

export const HZ = 60;
export const OPEN_TICKS = 120;
const GATE_CLEARANCE = 0.41;
const AVATAR_RADIUS = 0.25;
const WALK_STEP = 4.55 / HZ;
const INTERACT_RADIUS = 1.56;
const GATE_LEFT = layout.gateX - GATE_CLEARANCE;
const GATE_RIGHT = layout.gateX + GATE_CLEARANCE;
const PATH_EDGE = layout.deckHalfWidth - AVATAR_RADIUS;
const LOWER = 'lower_floor';
const RAMP = 'access_ramp';
const UPPER = 'upper_walkway';

const starts = {
  normal: [-10.86, 0, 0, LOWER],
  gate_approach: [-1.33, layout.deckY, -0.17, UPPER],
  below_gate: [-0.35, 0, 0, LOWER],
};
const limit = (value, min, max) => Math.max(min, Math.min(value, max));

export class Simulation {
  constructor() {
    this.attemptId = 0;
    this.events = [];
    this.reset('normal');
  }

  reset(start) {
    const [x, y, z, surface] = starts[start];
    this.tick = 0;
    this.avatar = { x, y, z, surface, facing: Math.PI / 2, walking: false };
    this.outcome = 'none';
    this.open = false;
    this.openedAt = null;
    this.gateSide = -1;
    this.gateContact = false;
  }

  emit(type, data) {
    this.events.push({
      sequence: this.events.length,
      type,
      attemptId: this.attemptId,
      tick: this.tick,
      data,
    });
  }

  restart(start = 'normal') {
    this.attemptId += 1;
    this.reset(start);
    this.emit('attempt_restarted', { scenarioId: start });
  }

  nearSwitch() {
    const { x, z, surface } = this.avatar;
    return surface === UPPER &&
      Math.hypot(x - layout.switchX, z - layout.switchZ) <= INTERACT_RADIUS;
  }

  changeGate(open) {
    this.open = open;
    if (open) this.openedAt = this.tick;
    this.emit('gate_changed', { gateId: 'gate', open });
  }

  contact(objectId, touching) {
    this.emit('contact_changed', { avatarId: 'avatar', objectId, touching });
  }

  moveOnLower(x, z) {
    const avatar = this.avatar;
    x = limit(x, layout.floorMinX, layout.floorMaxX);
    z = limit(z, layout.floorMinZ, layout.floorMaxZ);
    if (x >= layout.rampStart && x < layout.rampEnd && Math.abs(z) <= PATH_EDGE) {
      const height = this.rampHeight(x);
      if (height <= 0.18) {
        avatar.surface = RAMP;
        avatar.y = height;
      } else if (height < 1.3) {
        return;
      }
    }
    avatar.x = x;
    avatar.z = z;
  }

  rampHeight(x) {
    return layout.deckY * (x - layout.rampStart) / (layout.rampEnd - layout.rampStart);
  }

  moveOnDeck(x, z) {
    const avatar = this.avatar;
    if (x < layout.rampStart) {
      avatar.surface = LOWER;
      avatar.x = x;
      avatar.y = 0;
      avatar.z = z;
      return false;
    }

    let blocked = false;
    if (!this.open) {
      if (this.gateSide < 0 && x >= GATE_LEFT) {
        x = GATE_LEFT;
        blocked = true;
      } else if (this.gateSide > 0 && x <= GATE_RIGHT) {
        x = GATE_RIGHT;
        blocked = true;
      }
    }
    avatar.x = Math.min(x, layout.end - AVATAR_RADIUS);
    avatar.z = limit(z, -PATH_EDGE, PATH_EDGE);
    avatar.surface = x < layout.rampEnd ? RAMP : UPPER;
    avatar.y = avatar.surface === RAMP ? this.rampHeight(x) : layout.deckY;
    return blocked;
  }

  step(horizontal, vertical, interact) {
    this.tick += 1;
    const avatar = this.avatar;
    const oldX = avatar.x;
    const oldZ = avatar.z;
    const oldSurface = avatar.surface;
    const oldSide = this.gateSide;
    if (this.open && this.tick === this.openedAt + OPEN_TICKS) {
      this.changeGate(false);
      if (avatar.surface === UPPER && avatar.x > GATE_LEFT && avatar.x < GATE_RIGHT) {
        avatar.x = oldSide < 0 ? GATE_LEFT : GATE_RIGHT;
      }
    }
    if (interact && !this.open && this.nearSwitch()) this.changeGate(true);

    const length = Math.hypot(horizontal, vertical) || 1;
    const dx = WALK_STEP * horizontal / length;
    const dz = WALK_STEP * vertical / length;
    let blocked = false;
    if (avatar.surface === LOWER) {
      this.moveOnLower(avatar.x + dx, avatar.z);
      if (avatar.surface === LOWER) this.moveOnLower(avatar.x, avatar.z + dz);
      else this.moveOnDeck(avatar.x, avatar.z + dz);
    } else {
      blocked = this.moveOnDeck(avatar.x + dx, avatar.z + dz);
    }
    if (avatar.x <= GATE_LEFT) this.gateSide = -1;
    if (avatar.x >= GATE_RIGHT) this.gateSide = 1;
    if (oldSurface !== avatar.surface) {
      this.contact(oldSurface, false);
      this.contact(avatar.surface, true);
    }
    if (this.gateContact !== blocked) {
      this.gateContact = blocked;
      this.contact('gate', blocked);
    }
    avatar.walking = Math.hypot(avatar.x - oldX, avatar.z - oldZ) > 0.001;
    if (dx || dz) avatar.facing = Math.atan2(dx, dz);

    if (this.outcome === 'none' && this.open && avatar.surface === UPPER &&
      oldSide < 0 && this.gateSide > 0) {
      this.outcome = 'victory';
      this.emit('outcome_changed', { outcome: 'victory' });
    }
  }

  snapshot() {
    const { x, y, z, surface } = this.avatar;
    return {
      attemptId: this.attemptId,
      tick: this.tick,
      avatar: { position: [x, y, z], supportSurface: surface },
      outcome: this.outcome,
      gate: { open: this.open, openedAt: this.openedAt, position: [layout.gateX, layout.deckY, 0] },
      switch: { position: [layout.switchX, layout.deckY, layout.switchZ] },
    };
  }

  loadScenario(id) {
    if (id !== 'gate_approach' && id !== 'below_gate') {
      return { ok: false, reason: 'Unknown scenario' };
    }
    this.restart(id);
    return { ok: true, reason: null };
  }
}
