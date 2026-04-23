// Six unique racers. Stats are 1-5 on each axis; totals roughly balanced.
// topSpeed    -> max forward velocity
// acceleration-> how quickly they reach top speed
// handling    -> turn rate & grip off-line
// weight      -> how hard they are to push around on contact
const CHARACTERS = [
  {
    id: "blaze",
    name: "Blaze",
    color: "#ff5252",
    accent: "#ffd166",
    description: "All-rounder. No weaknesses, no surprises.",
    stats: { topSpeed: 3, acceleration: 3, handling: 3, weight: 3 },
  },
  {
    id: "nova",
    name: "Nova",
    color: "#ff9ecb",
    accent: "#ffffff",
    description: "Top speed demon, but fragile and floaty.",
    stats: { topSpeed: 5, acceleration: 2, handling: 2, weight: 2 },
  },
  {
    id: "bolt",
    name: "Bolt",
    color: "#ffd60a",
    accent: "#0d1b2a",
    description: "Instant off the line. Hits a ceiling fast.",
    stats: { topSpeed: 2, acceleration: 5, handling: 4, weight: 2 },
  },
  {
    id: "onyx",
    name: "Onyx",
    color: "#6a5acd",
    accent: "#2a2452",
    description: "Heavy hitter. Slow to spin up, never gets bumped.",
    stats: { topSpeed: 4, acceleration: 2, handling: 2, weight: 5 },
  },
  {
    id: "fern",
    name: "Fern",
    color: "#56e39f",
    accent: "#0c3b2e",
    description: "Cornering wizard. Glues to the racing line.",
    stats: { topSpeed: 3, acceleration: 3, handling: 5, weight: 2 },
  },
  {
    id: "tide",
    name: "Tide",
    color: "#4cc9f0",
    accent: "#03045e",
    description: "Balanced with a hair more top end than handling.",
    stats: { topSpeed: 4, acceleration: 3, handling: 3, weight: 3 },
  },
];

function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

// Convert a 1-5 stat into a physics coefficient.
function statToCoeff(stat, min, max) {
  return min + (max - min) * ((stat - 1) / 4);
}

function derivePhysics(character) {
  const s = character.stats;
  return {
    maxSpeed: statToCoeff(s.topSpeed, 4.2, 6.4),        // px per frame at 60fps
    accel: statToCoeff(s.acceleration, 0.06, 0.14),
    brake: 0.18,
    friction: 0.985,
    turnRate: statToCoeff(s.handling, 0.035, 0.060),    // radians per frame
    grip: statToCoeff(s.handling, 0.85, 0.97),          // lateral velocity damping
    mass: statToCoeff(s.weight, 0.6, 1.6),
    offTrackFactor: 0.45,                               // speed multiplier while off track
  };
}

// Small canvas renderer used in the character select grid and in-race sprites.
function drawKartSprite(ctx, x, y, angle, character, scale = 1, options = {}) {
  const { color, accent } = character;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // shadow
  if (!options.noShadow) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // body
  ctx.fillStyle = color;
  roundedRect(ctx, -16, -10, 32, 20, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // nose
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(14, -6);
  ctx.lineTo(20, 0);
  ctx.lineTo(14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // cockpit / driver
  ctx.fillStyle = "#111";
  roundedRect(ctx, -4, -6, 10, 12, 3);
  ctx.fill();

  // wheels
  ctx.fillStyle = "#1a1a1a";
  drawWheel(ctx, -10, -12);
  drawWheel(ctx, 10, -12);
  drawWheel(ctx, -10, 12);
  drawWheel(ctx, 10, 12);

  // star flash overlay
  if (options.star) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(options.starPhase || 0);
    ctx.fillStyle = "#ffd166";
    roundedRect(ctx, -18, -12, 36, 24, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawWheel(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#1a1a1a";
  roundedRect(ctx, -4, -3, 8, 6, 1.5);
  ctx.fill();
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
