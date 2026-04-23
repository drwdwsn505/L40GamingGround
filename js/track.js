// Oval race track built around the canvas center. Tracks are defined by an
// inner + outer ellipse; the playable area is between the two. Checkpoints
// are evenly spaced around the middle line and racers must cross them in
// order to count a lap.
const Track = {
  width: 1024,
  height: 640,
  cx: 512,
  cy: 320,
  outerRx: 440,
  outerRy: 260,
  innerRx: 230,
  innerRy: 100,
  checkpointCount: 8,
  // The finish line sits at checkpoint 0. Angle 0 points to +X in canvas coords.
  finishAngle: -Math.PI / 2,

  // Center-line radius (midway between inner and outer).
  midRx() { return (this.outerRx + this.innerRx) / 2; },
  midRy() { return (this.outerRy + this.innerRy) / 2; },

  // Normalized "on-track" test. Returns true when point is between the two
  // ellipses.
  isOnTrack(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    const outerVal = (dx * dx) / (this.outerRx * this.outerRx) + (dy * dy) / (this.outerRy * this.outerRy);
    const innerVal = (dx * dx) / (this.innerRx * this.innerRx) + (dy * dy) / (this.innerRy * this.innerRy);
    return outerVal <= 1 && innerVal >= 1;
  },

  // Angle from track center to a point, normalized to [0, 2π).
  angleOf(x, y) {
    const a = Math.atan2(y - this.cy, x - this.cx);
    return (a - this.finishAngle + Math.PI * 2) % (Math.PI * 2);
  },

  // Point on the center line at given theta (world angle, not normalized).
  centerPointAt(theta) {
    return {
      x: this.cx + this.midRx() * Math.cos(theta),
      y: this.cy + this.midRy() * Math.sin(theta),
    };
  },

  // Checkpoint angle in world coords (not normalized).
  checkpointAngle(i) {
    return this.finishAngle + (i / this.checkpointCount) * Math.PI * 2;
  },

  // The tangent (direction of travel) at a given theta, pointing
  // counter-clockwise around the track.
  tangentAt(theta) {
    const tx = -this.midRx() * Math.sin(theta);
    const ty =  this.midRy() * Math.cos(theta);
    const len = Math.hypot(tx, ty);
    return { x: tx / len, y: ty / len };
  },

  // Starting grid positions — 2 x N rows behind the finish line.
  startingGrid(count) {
    const positions = [];
    const theta0 = this.finishAngle;
    // Place just "before" the finish (smaller theta).
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const thetaOffset = -0.04 - row * 0.05;
      const rxOffset = col === 0 ? -30 : 30;
      const theta = theta0 + thetaOffset;
      const rx = this.midRx() + rxOffset;
      const ry = this.midRy() + rxOffset * (this.midRy() / this.midRx());
      positions.push({
        x: this.cx + rx * Math.cos(theta),
        y: this.cy + ry * Math.sin(theta),
        angle: Math.atan2(-this.midRy() * Math.sin(theta), this.midRx() * Math.cos(theta)) * -1
             + Math.PI / 2, // face tangent direction (ccw)
        // Precompute a better facing angle: tangent of ellipse, ccw dir.
      });
    }
    // Properly compute facing for each: use ellipse tangent (ccw).
    positions.forEach((p, i) => {
      const theta = theta0 + (-0.04 - Math.floor(i / 2) * 0.05);
      const t = this.tangentAt(theta);
      p.angle = Math.atan2(t.y, t.x);
    });
    return positions;
  },

  // Draw the scenery, track, checkpoints, and finish line.
  draw(ctx, options = {}) {
    ctx.save();

    // grass (background)
    ctx.fillStyle = "#2b6b3c";
    ctx.fillRect(0, 0, this.width, this.height);

    // grass details
    ctx.fillStyle = "#245a32";
    for (let i = 0; i < 60; i++) {
      const gx = (i * 97) % this.width;
      const gy = (i * 53) % this.height;
      ctx.fillRect(gx, gy, 6, 3);
    }

    // outer track fill (asphalt)
    ctx.fillStyle = "#3d3d54";
    ellipseFill(ctx, this.cx, this.cy, this.outerRx, this.outerRy);

    // inner island (back to grass)
    ctx.fillStyle = "#2b6b3c";
    ellipseFill(ctx, this.cx, this.cy, this.innerRx, this.innerRy);

    // center island decoration
    ctx.fillStyle = "#245a32";
    ellipseFill(ctx, this.cx, this.cy, this.innerRx - 20, this.innerRy - 20);
    ctx.fillStyle = "#56e39f";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = this.cx + (this.innerRx - 40) * Math.cos(a);
      const py = this.cy + (this.innerRy - 40) * Math.sin(a);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // track boundary stripes
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ellipseStroke(ctx, this.cx, this.cy, this.outerRx - 6, this.outerRy - 6);
    ellipseStroke(ctx, this.cx, this.cy, this.innerRx + 6, this.innerRy + 6);
    ctx.setLineDash([]);

    // finish line (checkered band)
    this.drawFinishLine(ctx);

    // checkpoints (hidden in-game unless debug)
    if (options.debug) {
      ctx.strokeStyle = "rgba(255,255,0,0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i < this.checkpointCount; i++) {
        const theta = this.checkpointAngle(i);
        const inner = {
          x: this.cx + this.innerRx * Math.cos(theta),
          y: this.cy + this.innerRy * Math.sin(theta),
        };
        const outer = {
          x: this.cx + this.outerRx * Math.cos(theta),
          y: this.cy + this.outerRy * Math.sin(theta),
        };
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(outer.x, outer.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  },

  drawFinishLine(ctx) {
    const theta = this.finishAngle;
    const inner = {
      x: this.cx + this.innerRx * Math.cos(theta),
      y: this.cy + this.innerRy * Math.sin(theta),
    };
    const outer = {
      x: this.cx + this.outerRx * Math.cos(theta),
      y: this.cy + this.outerRy * Math.sin(theta),
    };
    const steps = 12;
    const bandWidth = 10;
    const dx = (outer.x - inner.x) / steps;
    const dy = (outer.y - inner.y) / steps;
    // Perpendicular to finish line to make band thicker along travel direction.
    const len = Math.hypot(outer.x - inner.x, outer.y - inner.y);
    const px = -(outer.y - inner.y) / len * bandWidth;
    const py =  (outer.x - inner.x) / len * bandWidth;
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#111";
      ctx.beginPath();
      ctx.moveTo(inner.x + dx * i - px, inner.y + dy * i - py);
      ctx.lineTo(inner.x + dx * (i + 1) - px, inner.y + dy * (i + 1) - py);
      ctx.lineTo(inner.x + dx * (i + 1) + px, inner.y + dy * (i + 1) + py);
      ctx.lineTo(inner.x + dx * i + px, inner.y + dy * i + py);
      ctx.closePath();
      ctx.fill();
    }
  },
};

function ellipseFill(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function ellipseStroke(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}
