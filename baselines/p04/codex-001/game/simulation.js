const low = { id: 'lowDock', left: -10, right: -5, width: 2.45, y: 0 };
const high = { id: 'highDock', left: 7, right: 14, width: 2.45, y: 3.4 };
export const gateX = 8.7;
export const bayX = 11.55;
export const aperture = 1.42;
export const period = 600;
const scenarioStarts = {
  low_dock_before_departure: [0, -5.65, 1.32],
  adjacent_low_ledge: [118, -5.45, 1.3],
  high_dock_before_gate_opens: [275, 8.2, 0],
  high_dock_before_gate_closes: [402, 8.2, 0],
  cargo_ready_to_load: [0, -7, 0],
  high_gate_without_cargo: [275, 8.2, 0]
};

function liftAt(tick) {
  const phaseTick = tick % period;
  const phase = phaseTick < 120 ? 'lowDock' : phaseTick < 270 ? 'outbound' :
    phaseTick < 450 ? 'highDock' : 'inbound';
  const progress = phaseTick < 120 ? 0 : phaseTick < 270 ? (phaseTick - 120) / 150 :
    phaseTick < 450 ? 1 : (600 - phaseTick) / 150;
  return { position: [-2.5 + progress * 7, progress * 3.4, 0], phase, phaseTick };
}

function body(id, x, y, z, radius, supportSurface) {
  return { id, x, y, z, radius, supportSurface, vy: 0 };
}

export class FreightSimulation {
  constructor() {
    this.attemptId = 0;
    this.events = [];
    this.reset();
  }

  emit(type, data) {
    this.events.push({ sequence: this.events.length + 1, type, attemptId: this.attemptId, tick: this.tick, data });
  }

  reset(tick = 0, x = -7, z = 0) {
    this.tick = tick;
    this.platform = liftAt(tick);
    this.passable = this.isOpen(this.platform.phaseTick);
    const surface = x > 0 ? high : low;
    this.avatar = body('avatar', x, surface.y, z, 0.29, surface.id);
    this.box = body('box', -5.85, 0, 0, 0.42, low.id);
    this.cargoDelivered = false;
    this.outcome = 'none';
  }

  restart(...start) {
    this.attemptId++;
    this.reset(...start);
    this.emit('attempt_restarted', {});
  }

  loadScenario(id) {
    if (!Object.hasOwn(scenarioStarts, id)) return { ok: false, reason: 'Unknown scenario' };
    this.restart(...scenarioStarts[id]);
    return { ok: true, reason: '' };
  }

  snapshot() {
    const actor = b => ({ position: [b.x, b.y, b.z], supportSurface: b.supportSurface });
    return {
      attemptId: this.attemptId, tick: this.tick,
      platform: { ...this.platform, position: [...this.platform.position] },
      avatar: actor(this.avatar), box: actor(this.box), gate: { passable: this.passable },
      cargoDelivered: this.cargoDelivered, outcome: this.outcome
    };
  }

  isOpen(phaseTick) {
    return phaseTick >= 285 && phaseTick < 405;
  }

  move(b, dx, dz, passable) {
    let x = b.x + dx;
    let z = b.z + dz;
    if (b.y >= high.y - 0.12 && b.y < high.y + 2) {
      const margin = b.radius + 0.07;
      const blocked = !passable || Math.abs(z) + b.radius > aperture;
      if (blocked && b.x <= gateX && x > gateX - margin) x = Math.min(b.x, gateX - margin);
      if (blocked && b.x > gateX && x < gateX + margin) x = Math.max(b.x, gateX + margin);
      if (Math.abs(b.x - gateX) < margin && Math.abs(z) > Math.abs(b.z) &&
          Math.abs(z) + b.radius > aperture) z = b.z;
    }
    return { x, z };
  }

  settle(b, surfaces) {
    const previous = b.supportSurface;
    b.vy -= 18 / 60;
    const nextY = b.y + b.vy / 60;
    const support = surfaces.find(s => b.x >= s.left && b.x <= s.right &&
      Math.abs(b.z) <= s.width && b.y >= s.y - 0.00001 && nextY <= s.y);
    b.supportSurface = support?.id ?? null;
    b.y = support?.y ?? nextY;
    if (support) b.vy = 0;
    if (previous !== b.supportSurface) {
      for (const [surfaceId, touching] of [[previous, false], [b.supportSurface, true]]) {
        if (surfaceId) this.emit('contact_changed', {
          actorId: b.id, objectId: surfaceId, supportSurface: surfaceId, touching
        });
      }
    }
  }

  step(horizontal, depth) {
    if (this.outcome !== 'none') return;
    this.tick++;
    const previous = this.platform;
    const platform = liftAt(this.tick);
    const passable = this.isOpen(platform.phaseTick);
    const [liftX, liftY] = platform.position;
    const surfaces = [low, high, { id: 'platform', left: liftX - 2.5, right: liftX + 2.5, width: 1.95, y: liftY }];
    for (const b of [this.avatar, this.box]) {
      if (b.supportSurface === 'platform') {
        b.x += liftX - previous.position[0];
        b.y += liftY - previous.position[1];
      }
    }
    const a = this.avatar;
    const b = this.box;
    const oldX = [a.x, b.x];
    const scale = 4.5 / 60 / Math.max(1, Math.hypot(horizontal, depth));
    const dx = horizontal * scale;
    const dz = depth * scale;
    const next = this.move(a, dx, dz, passable);
    const gap = a.radius + b.radius;
    if (Math.abs(a.y - b.y) < 0.55 && Math.hypot(next.x - b.x, next.z - b.z) < gap) {
      const separation = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = separation > 0.0001 ? (b.x - a.x) / separation : 1;
      const nz = separation > 0.0001 ? (b.z - a.z) / separation : 0;
      const push = Math.max(0, dx * nx + dz * nz);
      Object.assign(b, this.move(b, push * nx, push * nz, passable));
      const remaining = Math.hypot(next.x - b.x, next.z - b.z);
      if (remaining < gap) {
        Object.assign(next, this.move(a, b.x - nx * gap - a.x, b.z - nz * gap - a.z, passable));
      }
    }
    Object.assign(a, next);
    for (const actor of [a, b]) this.settle(actor, surfaces);
    this.platform = platform;
    if (previous.phase !== platform.phase) this.emit('platform_phase_changed', {
      previousPhase: previous.phase, phase: platform.phase, phaseTick: platform.phaseTick
    });
    if (passable !== this.passable) this.emit('door_state_changed', { passable, phaseTick: platform.phaseTick });
    this.passable = passable;
    for (const [index, actor] of [a, b].entries()) {
      if (passable && oldX[index] <= gateX && actor.x > gateX && actor.supportSurface === high.id &&
          Math.abs(actor.z) + actor.radius <= aperture) {
        this.emit('gate_crossed', { actorId: actor.id, phaseTick: platform.phaseTick });
      }
    }
    if (b.supportSurface === high.id && b.x >= bayX && b.x <= 13.5 && Math.abs(b.z) < 1.22) {
      this.cargoDelivered = true;
      this.outcome = 'victory';
    } else if (a.y < -3.1 || b.y < -3.1) {
      this.outcome = 'failure';
    }
    if (this.outcome !== 'none') this.emit('outcome_changed', { outcome: this.outcome });
  }
}
