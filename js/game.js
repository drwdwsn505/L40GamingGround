// Game loop and race state. Created/destroyed per race.

class Game {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    // config: { playerCharacterId, aiCount, laps, difficulty, onFinish }

    // Load the requested track before anything that depends on track
    // geometry (item boxes, starting grid, collision).
    Track.load(config.trackId || "oval");

    this.karts = [];
    this.aiDrivers = [];
    this.itemBoxes = buildItemBoxes();
    this.projectiles = [];
    this.hazards = [];
    this.events = []; // transient screen effects

    this.elapsed = 0;
    this.state = "countdown"; // countdown | racing | finished | paused
    this.countdownTime = 3.2;
    this.lastCountdownSec = Math.ceil(this.countdownTime);
    this.postRaceTime = 0;
    this.finishedOrder = [];
    this.paused = false;

    this.buildRoster();
    this.wirePlayerSounds();
  }

  wirePlayerSounds() {
    const p = this.player;
    p.onDriftStart = () => Sound.driftOn();
    p.onDriftEnd = () => Sound.driftOff();
    p.onMiniTurbo = (tier) => Sound.play("miniturbo", tier);
    p.onSpinOut = () => Sound.play("thunk");
    p.onItemUsed = (item) => {
      switch (item.id) {
        case "BOOST": case "STAR": Sound.play("boost"); break;
        case "GREEN": case "RED":  Sound.play("zap");   break;
        case "BANANA":             Sound.play("driftPop"); break;
        case "LIGHTNING":          Sound.play("thunder"); break;
      }
    };
    this._prevPlayerLap = 0;
  }

  buildRoster() {
    const playerChar = getCharacter(this.config.playerCharacterId);
    const playerCount = 1;
    const total = playerCount + this.config.aiCount;
    const grid = Track.startingGrid(total);

    // Player goes in a middle grid slot so there's cars ahead + behind.
    const playerSlot = Math.min(2, total - 1);
    const player = new Kart(playerChar, grid[playerSlot], true);
    player.totalLaps = this.config.laps;
    this.karts.push(player);
    this.player = player;

    // AI racers: every character except the player, then repeat if needed.
    const pool = CHARACTERS.filter(c => c.id !== playerChar.id);
    for (let i = 0, g = 0; i < this.config.aiCount; i++, g++) {
      if (g === playerSlot) g++;
      const ch = pool[i % pool.length];
      const kart = new Kart(ch, grid[g], false);
      kart.totalLaps = this.config.laps;
      this.karts.push(kart);
      this.aiDrivers.push(new AIDriver(kart, this.config.difficulty));
    }
  }

  update(dt) {
    if (this.paused) return;
    // Countdown.
    if (this.state === "countdown") {
      this.countdownTime -= dt;
      const sec = Math.max(0, Math.ceil(this.countdownTime));
      if (sec !== this.lastCountdownSec) {
        this.lastCountdownSec = sec;
        if (sec === 0) Sound.play("go");
        else if (sec <= 3) Sound.play("countdown");
      }
      if (this.countdownTime <= 0) {
        this.state = "racing";
      }
      return;
    }

    this.elapsed += dt;

    // Engine hum follows player speed.
    const sp = this.player.physics.maxSpeed;
    Sound.engineUpdate(Math.max(0, this.player.speed / sp));

    // Input — player controls.
    const p = this.player;
    if (!p.finished) {
      p.applyInput(
        Input.accelerate(), Input.brake(),
        Input.left(), Input.right(),
        Input.drift(), dt
      );
      if (Input.useItem()) {
        p.useItem(this.karts, this.projectiles, this.hazards, this.events);
      }
    } else {
      // After finishing, coast gently.
      p.applyInput(false, true, false, false, false, dt);
    }

    // AI.
    for (const ai of this.aiDrivers) {
      ai.step(dt, this.hazards, this.karts);
      if (ai.consumePendingUseItem()) {
        ai.kart.useItem(this.karts, this.projectiles, this.hazards, this.events);
      }
    }

    // Kart physics + checkpoints.
    for (const k of this.karts) k.update(dt, this.elapsed, this.karts);

    // Kart-vs-kart collisions.
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        collideKarts(this.karts[i], this.karts[j]);
      }
    }

    // Item boxes.
    for (const box of this.itemBoxes) box.update(dt);
    for (const k of this.karts) {
      if (k.item) continue;
      for (const box of this.itemBoxes) {
        if (!box.active()) continue;
        const d = Math.hypot(k.x - box.x, k.y - box.y);
        if (d < box.radius + k.radius) {
          box.consume();
          const pos = this.computePosition(k);
          k.giveItem(rollItem(pos, this.karts.length));
          if (k.isPlayer) Sound.play("collect");
          break;
        }
      }
    }

    // Lap chime when the player completes a lap.
    if (this.player.lap > this._prevPlayerLap) {
      this._prevPlayerLap = this.player.lap;
      if (!this.player.finished) Sound.play("chime");
    }

    // Projectiles & hazards.
    for (const p of this.projectiles) p.update(dt, this.karts);
    for (const h of this.hazards) h.update(dt, this.karts);
    this.projectiles = this.projectiles.filter(x => !x.dead);
    this.hazards = this.hazards.filter(x => !x.dead);

    // Screen effects.
    for (const e of this.events) e.time -= dt;
    this.events = this.events.filter(e => e.time > 0);

    // Track newly finished karts.
    for (const k of this.karts) {
      if (k.finished && !this.finishedOrder.includes(k)) {
        this.finishedOrder.push(k);
      }
    }

    // Race end condition: player finished, then a short buffer for results.
    if (this.player.finished) {
      this.postRaceTime += dt;
      if (this.postRaceTime > 2.5 || this.finishedOrder.length === this.karts.length) {
        this.state = "finished";
        this.config.onFinish(this.buildResults());
      }
    }
  }

  buildResults() {
    // Racers that didn't cross the line get estimated times based on progress.
    const remaining = this.karts.filter(k => !k.finished);
    remaining.sort((a, b) => progressOrder(b) - progressOrder(a));
    const finished = [...this.finishedOrder];
    const order = [...finished, ...remaining];
    return order.map((k, i) => ({
      position: i + 1,
      name: k.isPlayer ? "You" : k.character.name,
      characterId: k.character.id,
      isPlayer: k.isPlayer,
      time: k.finishTime,
      lapTimes: k.lapTimes,
    }));
  }

  computePosition(kart) {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return progressOrder(b) - progressOrder(a);
    });
    return sorted.indexOf(kart) + 1;
  }

  togglePause() {
    if (this.state !== "racing" && this.state !== "countdown") return;
    this.paused = !this.paused;
    if (this.paused) { Sound.engineStop(); Sound.driftOff(); }
  }

  draw() {
    const ctx = this.ctx;
    Track.draw(ctx);

    // Item boxes.
    for (const b of this.itemBoxes) b.draw(ctx);

    // Hazards.
    for (const h of this.hazards) h.draw(ctx);

    // Karts (draw in progress order, leader on top).
    const drawOrder = [...this.karts].sort((a, b) => progressOrder(a) - progressOrder(b));
    for (const k of drawOrder) k.draw(ctx);

    // Projectiles on top.
    for (const p of this.projectiles) p.draw(ctx);

    // Lightning flash.
    for (const e of this.events) {
      if (e.type === "LIGHTNING") {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, e.time)})`;
        ctx.fillRect(0, 0, Track.width, Track.height);
      }
    }
  }
}
