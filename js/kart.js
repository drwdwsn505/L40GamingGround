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

    // Drift state.
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;   // seconds spent drifting this session

    // Event hooks (optional — set by Game).
    this.onBoost = null;
    this.onMiniTurbo = null;
    this.onDriftStart = null;
    this.onDriftEnd = null;
    this.onItemUsed = null;
    this.onSpinOut = null;

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

  applyInput(accelerate, brake, left, right, drift, dt) {
    // Spinout disables input and cancels any drift (no reward).
    if (this.spin > 0) { this.endDrift(false); return; }

    const p = this.physics;
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const movingFast = Math.abs(this.speed) > p.maxSpeed * 0.35;

    // Drift entry: must be holding drift, steering, and above speed threshold.
    if (drift && movingFast && steer !== 0 && !this.drifting) {
      this.drifting = true;
      this.driftDir = steer;
      this.driftCharge = 0;
      if (this.onDriftStart) this.onDriftStart();
    }
    // Drift exit: released button, slowed too much, or spun out.
    if (this.drifting && (!drift || !movingFast)) {
      this.endDrift(true);
    }

    const turnScale = Math.min(1, 0.3 + Math.abs(this.speed) / p.maxSpeed);
    const turnMult = this.drifting ? 1.5 : 1.0;
    if (left)  this.angle -= p.turnRate * turnScale * turnMult * (60 * dt);
    if (right) this.angle += p.turnRate * turnScale * turnMult * (60 * dt);
    // Drift curl: bias steering in drift direction so the kart arcs tighter.
    if (this.drifting) {
      this.angle += this.driftDir * p.turnRate * 0.25 * turnScale * (60 * dt);
      this.driftCharge += dt;
    }

    const maxSpd = (p.maxSpeed + this.boostSpeed) * (this.shrinkTimer > 0 ? 0.65 : 1);
    // Drifting slightly taxes acceleration (you trade speed for cornering).
    const accelMult = this.drifting ? 0.85 : 1.0;
    if (accelerate) this.speed += p.accel * accelMult * (60 * dt);
    if (brake) {
      if (this.speed > 0) this.speed -= p.brake * (60 * dt);
      else this.speed -= p.accel * 0.6 * (60 * dt);
    }
    this.speed = clamp(this.speed, -maxSpd * 0.5, maxSpd);
  }

  // Close a drift. When `award`, grant a mini-turbo scaled to charge time.
  endDrift(award) {
    if (!this.drifting) return;
    const charge = this.driftCharge;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftDir = 0;
    if (!award) return;
    // Three charge tiers → progressively stronger boosts.
    let tier = -1;
    if (charge >= 1.6) {
      this.boost = Math.max(this.boost, 1.2);
      this.boostSpeed = Math.max(this.boostSpeed, 2.6);
      tier = 2;
    } else if (charge >= 1.0) {
      this.boost = Math.max(this.boost, 0.8);
      this.boostSpeed = Math.max(this.boostSpeed, 1.8);
      tier = 1;
    } else if (charge >= 0.6) {
      this.boost = Math.max(this.boost, 0.4);
      this.boostSpeed = Math.max(this.boostSpeed, 1.1);
      tier = 0;
    }
    if (tier >= 0 && this.onMiniTurbo) this.onMiniTurbo(tier);
    if (this.onDriftEnd) this.onDriftEnd(tier);
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

    // Move along facing, with grip-dependent lag. On slippery tracks (low
    // gripMod), velocity catches up to facing over time, letting karts slide.
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    const desiredVx = fx * effSpeed;
    const desiredVy = fy * effSpeed;
    const lerpAmt = Math.min(1, Track.gripMod * (60 * dt));
    this.vx = this.vx + (desiredVx - this.vx) * lerpAmt;
    this.vy = this.vy + (desiredVy - this.vy) * lerpAmt;
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
    if (this.onItemUsed) this.onItemUsed(item);
  }

  spinOut() {
    if (this.invuln > 0 || this.starTimer > 0) return;
    this.spin = 1.2;
    this.invuln = 1.5;
    this.speed *= 0.25;
    if (this.onSpinOut) this.onSpinOut();
  }

  draw(ctx) {
    // Drift spark trail. Color tiers with charge: white → blue → orange.
    if (this.drifting) {
      const c = this.driftCharge;
      const sparkColor = c >= 1.6 ? "#ff8a00" : c >= 1.0 ? "#4cc9f0" : "#ffffff";
      const bx = this.x - Math.cos(this.angle) * 12;
      const by = this.y - Math.sin(this.angle) * 12;
      for (let i = 0; i < 6; i++) {
        const jitter = (Math.random() - 0.5) * 10;
        const sx = bx + Math.cos(this.angle + Math.PI / 2) * jitter;
        const sy = by + Math.sin(this.angle + Math.PI / 2) * jitter;
        ctx.fillStyle = sparkColor;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

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

// Collision resolution for two karts. Applies mass-weighted position push-out,
// a velocity impulse along the normal, and a small angular jolt so contact
// visibly rotates the lighter kart. Returns the impact severity (the inward
// component of relative velocity; >= 0).
function collideKarts(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius;
  if (dist === 0 || dist >= minDist) return 0;
  const overlap = minDist - dist;
  const nx = dx / dist, ny = dy / dist;
  const totalMass = a.physics.mass + b.physics.mass;
  const aShare = b.physics.mass / totalMass;
  const bShare = a.physics.mass / totalMass;
  a.x -= nx * overlap * aShare;
  a.y -= ny * overlap * aShare;
  b.x += nx * overlap * bShare;
  b.y += ny * overlap * bShare;

  // Relative velocity along the contact normal (negative = closing).
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vAlong = rvx * nx + rvy * ny;
  let severity = 0;
  if (vAlong < 0) {
    severity = -vAlong;
    const impulse = severity * 0.7;
    a.speed -= impulse * aShare;
    b.speed += impulse * bShare;

    // Angular jolt: the lighter kart rotates away from the impact more.
    // Cross product of forward × normal determines which way to rotate. In a
    // near-head-on hit both crosses collapse to near-zero (and picking up
    // only float noise), so fall back to explicitly opposite signs so the
    // two karts rotate apart instead of in lockstep.
    const twist = Math.min(0.45, severity * 0.06);
    const afx = Math.cos(a.angle), afy = Math.sin(a.angle);
    const bfx = Math.cos(b.angle), bfy = Math.sin(b.angle);
    const aCross = afx * ny - afy * nx;
    const bCross = bfx * (-ny) - bfy * (-nx);
    const EPS = 1e-6;
    let aSign, bSign;
    if (Math.abs(aCross) < EPS && Math.abs(bCross) < EPS) {
      aSign = +1; bSign = -1;
    } else {
      aSign = Math.sign(aCross) || 1;
      bSign = Math.sign(bCross) || -1;
    }
    a.angle += aSign * twist * aShare;
    b.angle += bSign * twist * bShare;

    // Reduce grip momentarily so the hit pushes them sideways before they
    // snap back to facing — makes contact feel weighty.
    const slide = Math.min(2.2, severity * 0.9);
    a.vx -= nx * slide * aShare;
    a.vy -= ny * slide * aShare;
    b.vx += nx * slide * bShare;
    b.vy += ny * slide * bShare;
  }
  return severity;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
