// Top-level menu + screen wiring. Owns the animation frame loop for the game
// screen, and renders static character previews on the menu.

(function () {
  const state = {
    selectedCharacterId: null,
    trackId: TRACKS[0].id,
    laps: 3,
    aiCount: 5,
    difficulty: "normal",
    soundOn: true,
    game: null,
    lastFrame: 0,
    rafId: null,
  };

  const screens = {
    menu: document.getElementById("menu"),
    game: document.getElementById("game-screen"),
    results: document.getElementById("results-screen"),
    leaderboard: document.getElementById("leaderboard-screen"),
    help: document.getElementById("help-screen"),
  };

  function show(screenKey) {
    for (const key in screens) {
      screens[key].classList.toggle("active", key === screenKey);
    }
  }

  // --- Character select ---
  function renderCharacterGrid() {
    const grid = document.getElementById("character-grid");
    grid.innerHTML = "";
    for (const ch of CHARACTERS) {
      const card = document.createElement("div");
      card.className = "character-card";
      card.dataset.id = ch.id;
      card.innerHTML = `
        <canvas width="80" height="80"></canvas>
        <h4 style="color:${ch.color}">${ch.name}</h4>
        <div class="stats">${ch.description}</div>
        ${statBar("Speed", ch.stats.topSpeed)}
        ${statBar("Accel", ch.stats.acceleration)}
        ${statBar("Grip",  ch.stats.handling)}
        ${statBar("Mass",  ch.stats.weight)}
      `;
      const canvas = card.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      drawKartSprite(ctx, 40, 40, -Math.PI / 2, ch, 1.1);
      card.addEventListener("click", () => selectCharacter(ch.id));
      grid.appendChild(card);
    }
  }
  function statBar(label, value) {
    const pct = (value / 5) * 100;
    return `<div class="stat-bar"><span style="width:44px">${label}</span>
      <span class="track"><span class="fill" style="width:${pct}%"></span></span></div>`;
  }
  function selectCharacter(id) {
    state.selectedCharacterId = id;
    document.querySelectorAll(".character-card").forEach(el => {
      el.classList.toggle("selected", el.dataset.id === id);
    });
    const btn = document.getElementById("start-btn");
    btn.disabled = false;
    btn.textContent = `Race as ${getCharacter(id).name}`;
  }

  // --- Track picker ---
  function populateTrackSelect() {
    const sel = document.getElementById("track-select");
    sel.innerHTML = "";
    for (const t of TRACKS) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === state.trackId) opt.selected = true;
      sel.appendChild(opt);
    }
    updateTrackDescription();
  }
  function updateTrackDescription() {
    const t = TRACKS.find(x => x.id === state.trackId) || TRACKS[0];
    document.getElementById("track-description").textContent = t.description;
  }

  // --- Hook menu controls ---
  document.getElementById("track-select").addEventListener("change", e => {
    state.trackId = e.target.value;
    updateTrackDescription();
  });
  document.getElementById("lap-select").addEventListener("change", e => {
    state.laps = parseInt(e.target.value, 10);
  });
  document.getElementById("ai-select").addEventListener("change", e => {
    state.aiCount = parseInt(e.target.value, 10);
  });
  document.getElementById("difficulty-select").addEventListener("change", e => {
    state.difficulty = e.target.value;
  });
  document.getElementById("sound-select").addEventListener("change", e => {
    state.soundOn = e.target.value === "on";
    Sound.setEnabled(state.soundOn);
  });
  document.getElementById("start-btn").addEventListener("click", startRace);
  document.getElementById("leaderboard-btn").addEventListener("click", () => {
    renderLeaderboard();
    show("leaderboard");
  });
  document.getElementById("help-btn").addEventListener("click", () => show("help"));
  document.getElementById("help-back-btn").addEventListener("click", () => show("menu"));
  document.getElementById("lb-back-btn").addEventListener("click", () => show("menu"));
  document.getElementById("clear-lb-btn").addEventListener("click", () => {
    if (confirm("Clear all leaderboard entries?")) {
      Leaderboard.clear();
      renderLeaderboard();
    }
  });
  document.getElementById("rematch-btn").addEventListener("click", startRace);
  document.getElementById("back-btn").addEventListener("click", () => show("menu"));

  document.getElementById("resume-btn").addEventListener("click", () => {
    if (state.game) state.game.togglePause();
    updatePauseOverlay();
  });
  document.getElementById("quit-btn").addEventListener("click", quitToMenu);

  // --- Leaderboard ---
  function renderLeaderboard() {
    const tbody = document.querySelector("#leaderboard-table tbody");
    tbody.innerHTML = "";
    const entries = Leaderboard.all();
    if (entries.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="text-align:center;color:var(--muted)">
        No times recorded yet. Complete a race to set one!</td>`;
      tbody.appendChild(tr);
      return;
    }
    entries.forEach((e, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(getCharacter(e.characterId).name)}</td>
        <td>${formatTime(e.time)}</td>
        <td>${e.laps}</td>
        <td>${e.difficulty}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // --- Race lifecycle ---
  function startRace() {
    if (!state.selectedCharacterId) return;
    // User gesture — ok to init audio now.
    if (state.soundOn) Sound.ensure();
    const canvas = document.getElementById("game-canvas");
    state.game = new Game(canvas, {
      playerCharacterId: state.selectedCharacterId,
      trackId: state.trackId,
      aiCount: state.aiCount,
      laps: state.laps,
      difficulty: state.difficulty,
      onFinish: handleFinish,
    });
    show("game");
    Input.setEnabled(true);
    state.lastFrame = performance.now();
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;

    if (Input.pause()) {
      if (state.game) state.game.togglePause();
      updatePauseOverlay();
    }

    if (state.game) {
      state.game.update(dt);
      state.game.draw();
      renderHUD();
      renderCountdown();
      renderWrongWay();
    }

    Input.endFrame();
    state.rafId = requestAnimationFrame(frame);
  }

  function renderHUD() {
    const g = state.game;
    if (!g) return;
    const p = g.player;
    document.getElementById("hud-lap").textContent =
      `${Math.min(p.lap + 1, p.totalLaps)}/${p.totalLaps}`;
    document.getElementById("hud-pos").textContent =
      `${g.computePosition(p)}/${g.karts.length}`;
    document.getElementById("hud-time").textContent = g.elapsed.toFixed(2);
    const label = document.getElementById("item-label");
    const box = document.getElementById("item-box");
    if (p.item) {
      label.textContent = p.item.label;
      box.style.boxShadow = `0 0 14px ${p.item.color}`;
    } else {
      label.textContent = "—";
      box.style.boxShadow = "none";
    }
  }

  function renderCountdown() {
    const el = document.getElementById("countdown");
    const g = state.game;
    if (!g) { el.classList.add("hidden"); return; }
    if (g.state === "countdown") {
      const sec = Math.ceil(g.countdownTime);
      el.textContent = sec > 3 ? "Ready" : sec > 0 ? String(sec) : "GO!";
      el.classList.remove("hidden");
    } else if (g.elapsed < 0.6 && g.state === "racing") {
      el.textContent = "GO!";
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  function renderWrongWay() {
    const el = document.getElementById("wrong-way");
    if (!el) return;
    const show = !!state.game && state.game.wrongWay;
    el.classList.toggle("hidden", !show);
  }

  function updatePauseOverlay() {
    const overlay = document.getElementById("pause-overlay");
    if (state.game && state.game.paused) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
  }

  function quitToMenu() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.game = null;
    state.rafId = null;
    Sound.engineStop();
    Sound.driftOff();
    document.getElementById("pause-overlay").classList.add("hidden");
    show("menu");
  }

  function handleFinish(results) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    Sound.engineStop();
    Sound.driftOff();
    Sound.play("chime");

    const playerResult = results.find(r => r.isPlayer);
    renderResults(results, playerResult);
    show("results");

    // Leaderboard check — only if player actually finished.
    if (playerResult && playerResult.time != null) {
      if (Leaderboard.qualifies(playerResult.time)) {
        showNameModal(playerResult);
      }
    }
  }

  function renderResults(results, playerResult) {
    const body = document.getElementById("results-body");
    const title = document.getElementById("results-title");
    if (playerResult && playerResult.time != null) {
      title.textContent =
        playerResult.position === 1 ? "🏆 You Won!" :
        playerResult.position <= 3  ? "Podium Finish!" :
        "Race Finished";
    } else {
      title.textContent = "Race Ended";
    }
    let html = "<ol>";
    for (const r of results) {
      const cls = r.isPlayer ? "me" : "";
      const time = r.time != null ? formatTime(r.time) : "DNF";
      html += `<li class="${cls}">${escapeHtml(r.name)}
        <span style="float:right;color:var(--muted)">${time}</span></li>`;
    }
    html += "</ol>";
    if (playerResult && playerResult.lapTimes.length) {
      html += `<h3 style="margin-top:14px">Your Lap Splits</h3><ul>`;
      playerResult.lapTimes.forEach((t, i) => {
        html += `<li>Lap ${i + 1}: ${formatTime(t)}</li>`;
      });
      html += "</ul>";
    }
    body.innerHTML = html;
  }

  function showNameModal(playerResult) {
    const modal = document.getElementById("name-modal");
    const body = document.getElementById("name-modal-body");
    const input = document.getElementById("name-input");
    body.innerHTML = `You finished in <strong>${formatTime(playerResult.time)}</strong>.<br>
      Enter your name for the leaderboard.`;
    input.value = "";
    modal.classList.remove("hidden");
    setTimeout(() => input.focus(), 50);

    const save = () => {
      const name = (input.value.trim() || "Player").slice(0, 12);
      Leaderboard.add({
        name,
        characterId: playerResult.characterId,
        time: playerResult.time,
        laps: state.laps,
        difficulty: state.difficulty,
      });
      modal.classList.add("hidden");
    };
    const skip = () => modal.classList.add("hidden");

    document.getElementById("name-save-btn").onclick = save;
    document.getElementById("name-skip-btn").onclick = skip;
    input.onkeydown = e => { if (e.key === "Enter") save(); };
  }

  // --- Boot ---
  renderCharacterGrid();
  populateTrackSelect();
  show("menu");
})();
