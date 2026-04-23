// Track-bound world entities: boost pads, oil slicks, and moving obstacles.
// Created per-race from the current Track.features definition.

class BoostPad {
  // Oriented rectangle placed tangent to the track center line.
  constructor(x, y, orientation, length, width) {
    this.x = x;
    this.y = y;
    this.orientation = orientation; // angle in radians
    this.length = length;           // along tangent
    this.width = width;             // perpendicular to tangent
    // Cooldowns are keyed by kart identity so we don't re-trigger every frame.
    this.cooldowns = new WeakMap();
    this.phase = 0;
  }

  contains(px, py) {
    const dx = px - this.x, dy = py - this.y;
    const c = Math.cos(-this.orientation), s = Math.sin(-this.orientation);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return Math.abs(lx) <= this.length / 2 && Math.abs(ly) <= this.width / 2;
  }

  update(dt, karts) {
    this.phase = (this.phase + dt * 4) % (Math.PI * 2);
    // Decay cooldowns.
    for (const k of karts) {
      const cd = this.cooldowns.get(k);
      if (cd != null) {
        const remaining = cd - dt;
        if (remaining <= 0) this.cooldowns.delete(k);
        else this.cooldowns.set(k, remaining);
      }
    }
    // Trigger for any kart inside.
    for (const k of karts) {
      if (this.cooldowns.has(k)) continue;
      if (!this.contains(k.x, k.y)) continue;
      k.boost = Math.max(k.boost, 0.55);
      k.boostSpeed = Math.max(k.boostSpeed, 1.4);
      this.cooldowns.set(k, 0.7);
      if (k.isPlayer && k.onBoostPad) k.onBoostPad();
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.orientation);
    // Glow base.
    ctx.fillStyle = "rgba(255, 140, 40, 0.25)";
    roundedRect(ctx, -this.length / 2, -this.width / 2, this.length, this.width, 4);
    ctx.fill();
    // Chevrons, animated forward.
    ctx.fillStyle = "#ff9d47";
    const chevCount = 3;
    const step = this.length / chevCount;
    for (let i = 0; i < chevCount; i++) {
      const t = (i / chevCount) + Math.sin(this.phase + i) * 0.02;
      const cx = -this.length / 2 + step * (t + 0.5);
      const h = this.width * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx - step * 0.3, -h);
      ctx.lineTo(cx + step * 0.2, 0);
      ctx.lineTo(cx - step * 0.3,  h);
      ctx.lineTo(cx - step * 0.1,  0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

class OilSlick {
  constructor(x, y, radius) {
    this.x = x; this.y = y;
    this.radius = radius;
  }
  update(dt, karts) {
    for (const k of karts) {
      if (k.invuln > 0 || k.starTimer > 0) continue;
      const d = Math.hypot(k.x - this.x, k.y - this.y);
      if (d < this.radius + k.radius * 0.6) {
        k.spinOut();
      }
    }
  }
  draw(ctx) {
    ctx.save();
    // Dark base.
    ctx.fillStyle = "rgba(10, 10, 14, 0.75)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Rainbow sheen via additive blending.
    ctx.globalCompositeOperation = "lighter";
    const colors = ["rgba(140, 80, 180, 0.28)", "rgba(80, 140, 200, 0.28)", "rgba(220, 100, 120, 0.22)"];
    for (let i = 0; i < colors.length; i++) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(this.x - 2 + i * 1.5, this.y - 2, this.radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class Obstacle {
  // Moves sinusoidally across the track width at a fixed angle around the
  // track. Hitting it spins you out.
  constructor(theta, amplitude, period, phase) {
    this.thetaOffset = theta;       // radians from finish line
    this.amplitude = amplitude;     // peak lateral offset in pixels
    this.period = period;           // seconds per full oscillation
    this.phase = phase || 0;
    this.time = 0;
    this.radius = 16;
    this.x = 0; this.y = 0;
    this.recompute();
  }
  recompute() {
    const osc = Math.sin(this.time * 2 * Math.PI / this.period + this.phase) * this.amplitude;
    const theta = Track.finishAngle + this.thetaOffset;
    const rx = Track.midRx() + osc;
    const ry = Track.midRy() + osc * (Track.midRy() / Track.midRx());
    this.x = Track.cx + rx * Math.cos(theta);
    this.y = Track.cy + ry * Math.sin(theta);
  }
  update(dt, karts) {
    this.time += dt;
    this.recompute();
    for (const k of karts) {
      if (k.invuln > 0 || k.starTimer > 0) continue;
      const d = Math.hypot(k.x - this.x, k.y - this.y);
      if (d < this.radius + k.radius) {
        k.spinOut();
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 3, this.radius + 2, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body: red barrel with yellow hazard stripes that rotate.
    ctx.fillStyle = "#c0392b";
    ctx.strokeStyle = "#501010";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + this.time * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      ctx.lineTo(Math.cos(a) * (this.radius - 2), Math.sin(a) * (this.radius - 2));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Build the hazard entities from the currently-loaded Track's feature defs.
function buildHazards() {
  const out = [];
  const f = Track.features || {};
  for (const pad of (f.boostPads || [])) {
    const theta = Track.finishAngle + pad.theta;
    const rx = Track.midRx() + pad.radialOffset;
    const ry = Track.midRy() + pad.radialOffset * (Track.midRy() / Track.midRx());
    const x = Track.cx + rx * Math.cos(theta);
    const y = Track.cy + ry * Math.sin(theta);
    const t = Track.tangentAt(theta);
    const orient = Math.atan2(t.y, t.x);
    const length = Track.midRx() * pad.arc;
    out.push(new BoostPad(x, y, orient, length, pad.width));
  }
  for (const oil of (f.oilSlicks || [])) {
    const theta = Track.finishAngle + oil.theta;
    const rx = Track.midRx() + oil.radialOffset;
    const ry = Track.midRy() + oil.radialOffset * (Track.midRy() / Track.midRx());
    const x = Track.cx + rx * Math.cos(theta);
    const y = Track.cy + ry * Math.sin(theta);
    out.push(new OilSlick(x, y, oil.radius));
  }
  for (const ob of (f.obstacles || [])) {
    out.push(new Obstacle(ob.theta, ob.amplitude, ob.period, ob.phase));
  }
  return out;
}
