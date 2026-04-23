// AI racer driver. Follows a lookahead point on the track center line,
// dodges hazards, and uses its item when appropriate.

class AIDriver {
  constructor(kart, difficulty = "normal") {
    this.kart = kart;
    // Higher skill = better cornering, smarter item use, more boost usage.
    const skillMap = { easy: 0.6, normal: 0.85, hard: 1.0 };
    this.skill = skillMap[difficulty] ?? 0.85;
    // Base lookahead distance (in radians around track).
    this.lookahead = 0.35 + (1 - this.skill) * 0.15;
    this.itemHoldTime = 0;
    // Random per-frame jitter seed.
    this.jitter = Math.random() * Math.PI * 2;
  }

  step(dt, hazards, karts) {
    const k = this.kart;
    if (k.finished) {
      // Ease off and coast.
      k.applyInput(false, false, false, false, false, dt);
      return;
    }

    // Target a point slightly ahead on the center line.
    const myTheta = Track.angleOf(k.x, k.y);
    let targetTheta = myTheta + this.lookahead + (this.skill < 0.7 ? 0.05 : 0);
    // Convert normalized theta (from angleOf) back to world theta.
    const worldTheta = Track.finishAngle + targetTheta;

    let target = Track.centerPointAt(worldTheta);

    // Dodge hazards: if a banana is close and in front, aim a bit offset.
    for (const h of hazards) {
      const dx = h.x - k.x, dy = h.y - k.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 80) {
        const relAngle = Math.atan2(dy, dx) - k.angle;
        const normalized = Math.atan2(Math.sin(relAngle), Math.cos(relAngle));
        if (Math.abs(normalized) < Math.PI / 3) {
          // Offset target laterally away from hazard.
          const perpX = -Math.sin(k.angle) * (normalized > 0 ? -40 : 40);
          const perpY =  Math.cos(k.angle) * (normalized > 0 ? -40 : 40);
          target = { x: target.x + perpX, y: target.y + perpY };
        }
      }
    }

    // Steering: find angle difference to target.
    const desired = Math.atan2(target.y - k.y, target.x - k.x);
    let diff = desired - k.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steerThresh = 0.05;
    const left = diff < -steerThresh;
    const right = diff > steerThresh;

    // Throttle / brake: slow slightly when facing far off the target.
    const turningHard = Math.abs(diff) > 0.7;
    const accelerate = !turningHard || Math.random() < 0.85;
    const brake = turningHard && this.skill < 0.7 && Math.random() < 0.3;

    // Random mistake for low-skill: occasionally drop inputs.
    const mistake = Math.random() < (1 - this.skill) * 0.03;
    k.applyInput(
      !mistake && accelerate,
      brake,
      !mistake && left,
      !mistake && right,
      false,
      dt
    );

    // Item usage: simple policies per item type.
    if (k.item && k.itemCooldown === 0) {
      this.itemHoldTime += dt;
      const item = k.item;
      let shouldUse = false;
      switch (item.id) {
        case "BOOST":
          // Use on straightaways.
          shouldUse = Math.abs(diff) < 0.2 && this.itemHoldTime > 0.5;
          break;
        case "GREEN": {
          // Use if someone's in front within a narrow cone, or after 3s.
          const ahead = anyKartAhead(k, karts, 200, 0.2);
          shouldUse = ahead || this.itemHoldTime > 3;
          break;
        }
        case "RED": {
          const ahead = anyKartAhead(k, karts, 500, 1.2);
          shouldUse = ahead;
          break;
        }
        case "BANANA":
          // Use if chased by someone close behind.
          shouldUse = anyKartBehind(k, karts, 90) || this.itemHoldTime > 4;
          break;
        case "LIGHTNING":
          // Use when we're mid-pack or behind.
          shouldUse = this.itemHoldTime > 1 && Math.random() < 0.02;
          break;
        case "STAR":
          shouldUse = this.itemHoldTime > 0.5 + Math.random() * 1.5;
          break;
      }
      if (shouldUse) {
        this._pendingUse = true;
      }
    } else {
      this.itemHoldTime = 0;
    }
  }

  consumePendingUseItem() {
    const v = this._pendingUse;
    this._pendingUse = false;
    return !!v;
  }
}

function anyKartAhead(me, karts, maxDist, cone) {
  for (const k of karts) {
    if (k === me) continue;
    const dx = k.x - me.x, dy = k.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) continue;
    const rel = Math.atan2(dy, dx) - me.angle;
    const normalized = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(normalized) < cone) return true;
  }
  return false;
}
function anyKartBehind(me, karts, maxDist) {
  for (const k of karts) {
    if (k === me) continue;
    const dx = k.x - me.x, dy = k.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) continue;
    const rel = Math.atan2(dy, dx) - me.angle;
    const normalized = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(normalized) > Math.PI - 0.5) return true;
  }
  return false;
}
