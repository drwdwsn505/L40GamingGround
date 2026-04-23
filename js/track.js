// Oval race tracks built around the canvas center. Tracks are defined by an
// inner + outer ellipse; the playable area is between the two. Checkpoints
// are evenly spaced around the middle line and racers must cross them in
// order to count a lap.

// Track definitions. Each varies radii + color theme; grip affects how much
// the kart slides sideways on the surface.
const TRACKS = [
  {
    id: "oval",
    name: "Grand Oval",
    description: "Classic shape, balanced speed and cornering.",
    outerRx: 440, outerRy: 260,
    innerRx: 230, innerRy: 100,
    theme: {
      grass: "#2b6b3c", grassDark: "#245a32",
      asphalt: "#3d3d54", asphaltLine: "#ffffff",
      center: "#56e39f",
    },
    gripMod: 1.0,
    features: {
      // theta: radians around track from finish (0 = finish line, ccw)
      // radialOffset: perpendicular offset from the center line (+ = outer)
      boostPads: [
        { theta: 0.5,               radialOffset: -20, arc: 0.08, width: 40 },
        { theta: Math.PI,           radialOffset: -25, arc: 0.08, width: 40 },
        { theta: Math.PI + 1.2,     radialOffset:  25, arc: 0.08, width: 40 },
      ],
      oilSlicks: [
        { theta: 1.2,               radialOffset:  10, radius: 15 },
        { theta: Math.PI * 1.7,     radialOffset: -10, radius: 15 },
      ],
      obstacles: [
        { theta: Math.PI * 0.5 + 0.2, amplitude: 45, period: 3.5, phase: 0 },
      ],
    },
  },
  {
    id: "speedway",
    name: "Sunset Speedway",
    description: "Wider track, long straights. Top-speed machines shine.",
    outerRx: 470, outerRy: 280,
    innerRx: 200, innerRy:  90,
    theme: {
      grass: "#3a2a5a", grassDark: "#2a1f44",
      asphalt: "#4a4055", asphaltLine: "#ffd166",
      center: "#ff9ecb",
    },
    gripMod: 1.0,
    features: {
      boostPads: [
        { theta: 0.2,               radialOffset: 0,   arc: 0.10, width: 50 },
        { theta: Math.PI - 0.2,     radialOffset: 0,   arc: 0.10, width: 50 },
        { theta: Math.PI + 0.2,     radialOffset: 0,   arc: 0.10, width: 50 },
        { theta: Math.PI * 2 - 0.2, radialOffset: 0,   arc: 0.10, width: 50 },
      ],
      oilSlicks: [
        { theta: Math.PI * 0.55,    radialOffset:  20, radius: 14 },
      ],
      obstacles: [],
    },
  },
  {
    id: "hotloop",
    name: "Hot Loop",
    description: "Tighter corners. Reward for high handling.",
    outerRx: 400, outerRy: 230,
    innerRx: 250, innerRy: 130,
    theme: {
      grass: "#6d3a1f", grassDark: "#5a2e18",
      asphalt: "#4a3a3a", asphaltLine: "#ff8b3d",
      center: "#ffd166",
    },
    gripMod: 1.0,
    features: {
      boostPads: [
        { theta: Math.PI * 0.5,     radialOffset: -15, arc: 0.08, width: 35 },
        { theta: Math.PI * 1.5,     radialOffset: -15, arc: 0.08, width: 35 },
      ],
      oilSlicks: [
        { theta: Math.PI * 0.25,    radialOffset:  10, radius: 13 },
        { theta: Math.PI * 0.75,    radialOffset: -10, radius: 13 },
        { theta: Math.PI * 1.25,    radialOffset:  10, radius: 13 },
        { theta: Math.PI * 1.75,    radialOffset: -10, radius: 13 },
      ],
      obstacles: [
        { theta: Math.PI,           amplitude: 35, period: 2.8, phase: 0 },
      ],
    },
  },
  {
    id: "glacier",
    name: "Glacier Ring",
    description: "Slippery. Karts slide more; steer early.",
    outerRx: 440, outerRy: 260,
    innerRx: 230, innerRy: 100,
    theme: {
      grass: "#d9e8f3", grassDark: "#bcd4e6",
      asphalt: "#7a96b6", asphaltLine: "#ffffff",
      center: "#9ecae1",
    },
    gripMod: 0.6,
    features: {
      boostPads: [
        { theta: 0.4,               radialOffset: 0,   arc: 0.08, width: 40 },
        { theta: Math.PI + 0.4,     radialOffset: 0,   arc: 0.08, width: 40 },
      ],
      oilSlicks: [
        { theta: Math.PI * 0.35,    radialOffset:  15, radius: 18 },
        { theta: Math.PI * 0.85,    radialOffset: -15, radius: 18 },
        { theta: Math.PI * 1.35,    radialOffset:  15, radius: 18 },
        { theta: Math.PI * 1.85,    radialOffset: -15, radius: 18 },
      ],
      obstacles: [],
    },
  },
];

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
  theme: TRACKS[0].theme,
  gripMod: 1.0,
  currentId: "oval",

  load(id) {
    const def = TRACKS.find(t => t.id === id) || TRACKS[0];
    this.outerRx = def.outerRx;
    this.outerRy = def.outerRy;
    this.innerRx = def.innerRx;
    this.innerRy = def.innerRy;
    this.theme = def.theme;
    this.gripMod = def.gripMod;
    this.currentId = def.id;
    this.features = def.features || { boostPads: [], oilSlicks: [], obstacles: [] };
    return def;
  },

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
    const th = this.theme;

    // grass (background)
    ctx.fillStyle = th.grass;
    ctx.fillRect(0, 0, this.width, this.height);

    // grass details
    ctx.fillStyle = th.grassDark;
    for (let i = 0; i < 60; i++) {
      const gx = (i * 97) % this.width;
      const gy = (i * 53) % this.height;
      ctx.fillRect(gx, gy, 6, 3);
    }

    // outer track fill (asphalt)
    ctx.fillStyle = th.asphalt;
    ellipseFill(ctx, this.cx, this.cy, this.outerRx, this.outerRy);

    // inner island (back to grass)
    ctx.fillStyle = th.grass;
    ellipseFill(ctx, this.cx, this.cy, this.innerRx, this.innerRy);

    // center island decoration
    ctx.fillStyle = th.grassDark;
    ellipseFill(ctx, this.cx, this.cy, this.innerRx - 20, this.innerRy - 20);
    ctx.fillStyle = th.center;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = this.cx + (this.innerRx - 40) * Math.cos(a);
      const py = this.cy + (this.innerRy - 40) * Math.sin(a);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // track boundary stripes
    ctx.strokeStyle = th.asphaltLine;
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
