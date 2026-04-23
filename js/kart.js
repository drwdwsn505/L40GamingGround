// Kart entity. Handles physics, collision, checkpoint progress, items, and
// drawing. Used by both the player and the AI (AI just drives it differently).

class Kart {
  constructor(character, position, isPlayer = false) {
    this.character = character;
    this.physics = derivePhysics(character);
    this.x = position.x;
    this.y = position.y;
    this.angle = position.angle;
    this.vx = 0; this.vy = 0;
    this.speed = 0;       // scalar speed along facing
    this.isPlayer = isPlayer;

    // Race progress.
    this.lap = 0;
    this.nextCheckpoint = 0;
    this.totalLaps = 3;
    this.finished = false;
    this.finishTime = null;
    this.lapTimes = [];
    this.lapStartElapsed = 0;

    // Status effects.
    this.boost = 0;         // seconds of speed boost remaining
    this.boostSpeed = 0;    // extra max speed from boost
    this.spin = 0;          // seconds of spinning out
    this.invuln = 0;        // seconds of invulnerability
    this.starTimer = 0;     // seconds of star power
    this.shrinkTimer = 0;   // seconds of shrunk (lightning'd)

    // Items.
    this.item = null;       // ITEM_TYPES entry or null
    this.itemCooldown = 0;

    // Misc.
    this.name = isPlayer ? "You" : character.name;
    this.radius = 14;
    this.lateralLockUntil = 0;
  }

  // Expose progress as a 0..1 fraction to the NEXT checkpoint. Used both for
  // tiebreaking in leaderboards and for red-shell target selection.
  progressFraction() {
    const targetAngle = Track.checkpointAngle(this.nextCheckpoint);
    const myAngle = this.angleFromStart();
    const nextNorm = ((this.nextCheckpoint / Track.checkpointCount) * Math.PI * 2);
    // Distance in arc from previous checkpoint to current position.
    const prevAngle = ((this.nextCheckpoint - 1 + Track.checkpointCount) / Track.checkpointCount) * Math.PI * 2;
    const span = nextNorm - prevAngle;
    let frac = (myAngle - prevAngle) / span;
    if (frac < 0) frac += 1;
    if (frac > 1) frac = 1;
    return frac;
  }

  angleFromStart() {
    return Track.angleOf(this.x, this.y);
  }

  applyInput(accelerate, brake, left, right, dt) {
    // Spinout disables input.
    if (this.spin > 0) return;

    const p = this.physics;
    const turnScale = Math.min(1, 0.3 + Math.abs(this.speed) / p.maxSpeed);
    if (left)  this.angle -= p.turnRate * turnScale * (60 * dt);
    if (right) this.angle += p.turnRate * turnScale * (60 * dt);

    const maxSpd = (p.maxSpeed + this.boostSpeed) * (this.shrinkTimer > 0 ? 0.65 : 1);
    if (accelerate) this.speed += p.accel * (60 * dt);
    if (brake) {
      if (this.speed > 0) this.speed -= p.brake * (60 * dt);
      else this.speed -= p.accel * 0.6 * (60 * dt);
    }
    this.speed = clamp(this.speed, -maxSpd * 0.5, maxSpd);
  }

  update(dt, elapsed, karts) {
    // Timers.
    this.boost = Math.max(0, this.boost - dt);
    if (this.boost === 0) this.boostSpeed = 0;
    this.spin = Math.max(0, this.spin - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.starTimer = Math.max(0, this.starTimer - dt);
    if (this.starTimer > 0) this.invuln = Math.max(this.invuln, this.starTimer);
    this.shrinkTimer = Math.max(0, this.shrinkTimer - dt);
    this.itemCooldown = Math.max(0, this.itemCooldown - dt);

    // Spinout spins the kart and kills speed.
    if (this.spin > 0) {
      this.angle += 12 * dt;
      this.speed *= 0.9;
    }

    // Off-track slow.
    const onTrack = Track.isOnTrack(this.x, this.y);
    const offFactor = onTrack ? 1 : this.physics.offTrackFactor;
    const effSpeed = this.speed * offFactor;

    // Move along facing.
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    this.vx = fx * effSpeed;
    this.vy = fy * effSpeed;
    this.x += this.vx;
    this.y += this.vy;

    // Apply friction.
    this.speed *= this.physics.friction;

    // Keep inside the arena.
    this.x = clamp(this.x, 8, Track.width - 8);
    this.y = clamp(this.y, 8, Track.height - 8);

    // Soft-wall bounce: push out of the center island so you can't cut through.
    this.pushOutOfInnerIsland();

    // Checkpoints / lap tracking.
    this.updateCheckpoints(elapsed);

    // Star particles.
    // (drawing handles the visual effect)
  }

  pushOutOfInnerIsland() {
    const dx = this.x - Track.cx, dy = this.y - Track.cy;
    const innerVal = (dx * dx) / (Track.innerRx * Track.innerRx) + (dy * dy) / (Track.innerRy * Track.innerRy);
    if (innerVal < 1) {
      // push outward along ellipse normal
      const len = Math.hypot(dx / Track.innerRx, dy / Track.innerRy) || 1;
      const scale = 1 / len;
      this.x = Track.cx + (dx * scale);
      this.y = Track.cy + (dy * scale);
      this.speed *= 0.85;
    }
  }

  updateCheckpoints(elapsed) {
    // Determine our current angle sector.
    const myA = this.angleFromStart();
    const targetNorm = (this.nextCheckpoint / Track.checkpointCount) * Math.PI * 2;
    // Tolerance window: did we pass the target checkpoint in this frame?
    // We say "crossed" if myA is within [targetNorm, targetNorm + sector) and
    // we previously were behind. Simpler heuristic: when rank moves past a
    // small window around targetNorm, advance.
    const windowSize = (Math.PI * 2) / Track.checkpointCount;
    // Normalize difference.
    let diff = myA - targetNorm;
    if (diff < 0) diff += Math.PI * 2;
    if (diff < windowSize * 0.5) {
      // we're within half a sector past the target — advance checkpoint.
      this.nextCheckpoint = (this.nextCheckpoint + 1) % Track.checkpointCount;
      if (this.nextCheckpoint === 0) {
        // completed a lap.
        this.lap += 1;
        this.lapTimes.push(elapsed - this.lapStartElapsed);
        this.lapStartElapsed = elapsed;
        if (this.lap >= this.totalLaps) {
          this.finished = true;
          this.finishTime = elapsed;
        }
      }
    }
  }

  // --- Items ---
  giveItem(item) {
    if (!this.item) this.item = item;
  }

  useItem(karts, projectiles, hazards, events) {
    if (!this.item || this.itemCooldown > 0 || this.spin > 0) return;
    const item = this.item;
    this.item = null;
    this.itemCooldown = 0.3;
    switch (item.id) {
      case "BOOST":
        this.boost = 1.3;
        this.boostSpeed = 3.0;
        break;
      case "GREEN": {
        const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
        projectiles.push(new Shell(this, this.x + fx * 22, this.y + fy * 22, fx * 9, fy * 9, false));
        break;
      }
      case "RED": {
        const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
        projectiles.push(new Shell(this, this.x + fx * 22, this.y + fy * 22, fx * 7, fy * 7, true));
        break;
      }
      case "BANANA": {
        const bx = this.x - Math.cos(this.angle) * 24;
        const by = this.y - Math.sin(this.angle) * 24;
        hazards.push(new Banana(bx, by));
        break;
      }
      case "LIGHTNING":
        for (const k of karts) {
          if (k === this) continue;
          if (k.starTimer > 0) continue;
          k.shrinkTimer = 4;
          k.spin = Math.min(k.spin + 0.4, 0.6);
        }
        events.push({ type: "LIGHTNING", time: 0.6 });
        break;
      case "STAR":
        this.starTimer = 5;
        this.invuln = 5;
        this.boost = Math.max(this.boost, 4.5);
        this.boostSpeed = Math.max(this.boostSpeed, 2.2);
        break;
    }
  }

  spinOut() {
    if (this.invuln > 0 || this.starTimer > 0) return;
    this.spin = 1.2;
    this.invuln = 1.5;
    this.speed *= 0.25;
  }

  draw(ctx) {
    const scale = this.shrinkTimer > 0 ? 0.65 : 1;
    const opts = {
      star: this.starTimer > 0,
      starPhase: performance.now() / 90,
    };
    drawKartSprite(ctx, this.x, this.y, this.angle, this.character, scale, opts);
    if (this.isPlayer) {
      ctx.save();
      ctx.strokeStyle = "#ffcc00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 22, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // nameplate for AI at low alpha
    if (!this.isPlayer) {
      ctx.save();
      ctx.font = "10px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.textAlign = "center";
      ctx.fillText(this.character.name, this.x, this.y - 22);
      ctx.restore();
    }
  }
}

// Collision resolution for two karts. Applies impulse based on masses.
function collideKarts(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius;
  if (dist === 0 || dist >= minDist) return;
  const overlap = minDist - dist;
  const nx = dx / dist, ny = dy / dist;
  const totalMass = a.physics.mass + b.physics.mass;
  const aShare = b.physics.mass / totalMass;
  const bShare = a.physics.mass / totalMass;
  a.x -= nx * overlap * aShare;
  a.y -= ny * overlap * aShare;
  b.x += nx * overlap * bShare;
  b.y += ny * overlap * bShare;
  // Relative velocity damping along normal.
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vAlong = rvx * nx + rvy * ny;
  if (vAlong < 0) {
    const impulse = -vAlong * 0.6;
    a.speed -= impulse * aShare;
    b.speed += impulse * bShare;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
