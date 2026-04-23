// Items system: ItemBox spawners on track, Item objects held by karts, and
// projectile/hazard entities (shells, bananas, star effect, lightning effect).

const ITEM_TYPES = {
  BOOST:     { id: "BOOST",     label: "Boost",        color: "#ff9d47" },
  GREEN:     { id: "GREEN",     label: "Green Shell",  color: "#56e39f" },
  RED:       { id: "RED",       label: "Red Shell",    color: "#ff5252" },
  BANANA:    { id: "BANANA",    label: "Banana",       color: "#ffd60a" },
  LIGHTNING: { id: "LIGHTNING", label: "Lightning",    color: "#9d4edd" },
  STAR:      { id: "STAR",      label: "Star",         color: "#ffee66" },
};

// Item probabilities by race position.
// Leader gets mostly bananas and green shells; last place gets strong items.
function rollItem(position, totalRacers) {
  // position 1 = leader, totalRacers = last
  const rank = (position - 1) / Math.max(1, totalRacers - 1); // 0..1
  let weights;
  if (rank < 0.2) {
    weights = { BOOST: 1, BANANA: 4, GREEN: 3, RED: 1, LIGHTNING: 0, STAR: 0 };
  } else if (rank < 0.5) {
    weights = { BOOST: 3, BANANA: 3, GREEN: 3, RED: 3, LIGHTNING: 0.3, STAR: 0.3 };
  } else if (rank < 0.8) {
    weights = { BOOST: 3, BANANA: 2, GREEN: 2, RED: 4, LIGHTNING: 1, STAR: 1 };
  } else {
    weights = { BOOST: 2, BANANA: 1, GREEN: 1, RED: 3, LIGHTNING: 2, STAR: 3 };
  }
  return weightedPick(weights);
}

function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return ITEM_TYPES[k];
  }
  return ITEM_TYPES.BOOST;
}

class ItemBox {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.respawnTimer = 0; // 0 = active
    this.phase = Math.random() * Math.PI * 2;
  }
  update(dt) {
    this.phase += dt * 3;
    if (this.respawnTimer > 0) this.respawnTimer = Math.max(0, this.respawnTimer - dt);
  }
  active() { return this.respawnTimer === 0; }
  consume() { this.respawnTimer = 3; }
  draw(ctx) {
    if (!this.active()) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.phase * 0.5);
    const s = 1 + Math.sin(this.phase) * 0.08;
    ctx.scale(s, s);
    // box body
    ctx.fillStyle = "#f5f5ff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(0, -12);
    ctx.lineTo(12, 0); ctx.lineTo(0, 12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // question mark
    ctx.fillStyle = "#ff5577";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("?", 0, 1);
    ctx.restore();
  }
}

// Projectile: shell that moves across the track.
class Shell {
  constructor(owner, x, y, vx, vy, homing) {
    this.owner = owner;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.homing = !!homing;
    this.radius = 8;
    this.life = 6; // seconds
    this.bouncesLeft = homing ? 0 : 2;
    this.dead = false;
  }
  update(dt, karts) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    if (this.homing) {
      // Target the racer nearest ahead of the owner in progress order.
      const target = findHomingTarget(this.owner, karts);
      if (target) {
        const dx = target.x - this.x, dy = target.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const desiredVx = (dx / d);
        const desiredVy = (dy / d);
        // Steer toward target.
        this.vx += (desiredVx * 8 - this.vx) * 0.08;
        this.vy += (desiredVy * 8 - this.vy) * 0.08;
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const max = 7;
        this.vx = (this.vx / speed) * max;
        this.vy = (this.vy / speed) * max;
      }
    }

    // Advance + clamp to track (bounce off outer/inner boundary for green
    // shells, vanish for red shells on off-track).
    const prevX = this.x, prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;

    if (!Track.isOnTrack(this.x, this.y)) {
      if (this.bouncesLeft > 0) {
        // reflect toward track center roughly
        this.x = prevX; this.y = prevY;
        const nx = this.x - Track.cx, ny = this.y - Track.cy;
        const nlen = Math.hypot(nx, ny) || 1;
        const inward = { x: -nx / nlen, y: -ny / nlen };
        // check if we're outside outer or inside inner
        const outerVal = (nx * nx) / (Track.outerRx * Track.outerRx) + (ny * ny) / (Track.outerRy * Track.outerRy);
        const normal = outerVal > 1 ? inward : { x: -inward.x, y: -inward.y };
        const dot = this.vx * normal.x + this.vy * normal.y;
        this.vx -= 2 * dot * normal.x;
        this.vy -= 2 * dot * normal.y;
        this.bouncesLeft--;
      } else {
        this.dead = true;
        return;
      }
    }

    // Collisions with karts.
    for (const k of karts) {
      if (k === this.owner) continue;
      if (k.invuln > 0) continue;
      const d = Math.hypot(k.x - this.x, k.y - this.y);
      if (d < this.radius + 14) {
        k.spinOut();
        this.dead = true;
        return;
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.homing ? "#ff5252" : "#56e39f";
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // shell pattern
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    ctx.restore();
  }
}

// Stationary hazard on the track.
class Banana {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 9;
    this.life = 15; // seconds
    this.dead = false;
  }
  update(dt, karts) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    for (const k of karts) {
      if (k.invuln > 0) continue;
      const d = Math.hypot(k.x - this.x, k.y - this.y);
      if (d < this.radius + 14) {
        k.spinOut();
        this.dead = true;
        return;
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(0.4);
    ctx.fillStyle = "#ffd60a";
    ctx.strokeStyle = "#5a4500";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function findHomingTarget(owner, karts) {
  // Prefer the kart just ahead of owner in race order.
  const ahead = karts
    .filter(k => k !== owner && !k.finished)
    .filter(k => progressOrder(k) > progressOrder(owner))
    .sort((a, b) => progressOrder(a) - progressOrder(b));
  if (ahead.length > 0) return ahead[0];
  // fallback: nearest other kart
  let nearest = null, best = Infinity;
  for (const k of karts) {
    if (k === owner) continue;
    const d = Math.hypot(k.x - owner.x, k.y - owner.y);
    if (d < best) { best = d; nearest = k; }
  }
  return nearest;
}

function progressOrder(k) {
  return k.lap * Track.checkpointCount * 1000 + k.nextCheckpoint * 1000 + k.progressFraction();
}

// Item box placement around the track — two rows of 8 boxes.
function buildItemBoxes() {
  const boxes = [];
  const count = 8;
  const offsets = [-40, 40];
  for (let i = 0; i < count; i++) {
    const theta = Track.finishAngle + ((i + 0.5) / count) * Math.PI * 2;
    for (const off of offsets) {
      const rx = Track.midRx() + off;
      const ry = Track.midRy() + off * (Track.midRy() / Track.midRx());
      const x = Track.cx + rx * Math.cos(theta);
      const y = Track.cy + ry * Math.sin(theta);
      boxes.push(new ItemBox(x, y));
    }
  }
  return boxes;
}
