// Tiny procedural-audio sound module. Uses WebAudio to synthesize every SFX
// so no asset files are required. The AudioContext is created lazily and
// resumed on the first user gesture.

const Sound = (() => {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let driftNoise = null;
  let driftGain = null;
  let enabled = true;

  function init() {
    if (ctx) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      enabled = false;
    }
  }

  function ensure() {
    if (!enabled) return false;
    if (!ctx) init();
    if (!ctx) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function tone({ freq = 440, duration = 0.2, type = "sine", vol = 0.25, attack = 0.01 } = {}) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(g); g.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function sweep({ from, to, duration = 0.3, type = "sine", vol = 0.25 } = {}) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    g.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(g); g.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noiseBurst({ duration = 0.2, vol = 0.2, lowpass = 1500 } = {}) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.linearRampToValueAtTime(0, now + duration);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(now);
  }

  const sfx = {
    collect:   () => { sweep({ from: 600, to: 1200, duration: 0.18, type: "square",   vol: 0.15 }); },
    zap:       () => { sweep({ from: 900, to: 180,  duration: 0.22, type: "sawtooth", vol: 0.18 }); },
    thunk:     () => { sweep({ from: 300, to: 80,   duration: 0.2,  type: "sine",     vol: 0.3  }); noiseBurst({ duration: 0.1, vol: 0.1, lowpass: 400 }); },
    chime:     () => { tone({ freq: 880,  duration: 0.28, type: "triangle", vol: 0.2 }); setTimeout(() => tone({ freq: 1320, duration: 0.36, type: "triangle", vol: 0.2 }), 120); },
    countdown: () => { tone({ freq: 660,  duration: 0.22, type: "square",   vol: 0.2 }); },
    go:        () => { tone({ freq: 1320, duration: 0.5,  type: "square",   vol: 0.25 }); },
    boost:     () => { noiseBurst({ duration: 0.25, vol: 0.15, lowpass: 2200 }); sweep({ from: 300, to: 900, duration: 0.25, type: "sawtooth", vol: 0.15 }); },
    miniturbo: (tier) => {
      const base = 500 + tier * 200;
      sweep({ from: base, to: base + 900, duration: 0.28, type: "triangle", vol: 0.2 });
    },
    thunder:   () => { noiseBurst({ duration: 0.5, vol: 0.3, lowpass: 600 }); },
    driftPop:  () => { sweep({ from: 220, to: 330, duration: 0.08, type: "sawtooth", vol: 0.1 }); },
  };

  function engineUpdate(speedFraction) {
    if (!ensure()) return;
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = "sawtooth";
      engineOsc.frequency.value = 70;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    const now = ctx.currentTime;
    const target = 70 + Math.max(0, Math.min(1, speedFraction)) * 180;
    engineOsc.frequency.setTargetAtTime(target, now, 0.05);
    engineGain.gain.setTargetAtTime(Math.max(0.01, speedFraction * 0.05), now, 0.05);
  }

  function engineStop() {
    if (engineGain && ctx) {
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  }

  function driftOn() {
    if (!ensure()) return;
    if (driftNoise) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    driftNoise = ctx.createBufferSource();
    driftNoise.buffer = buffer;
    driftNoise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 1.2;
    driftGain = ctx.createGain();
    driftGain.gain.value = 0;
    driftNoise.connect(filter); filter.connect(driftGain); driftGain.connect(master);
    driftNoise.start();
    driftGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.03);
  }

  function driftOff() {
    if (driftNoise && ctx) {
      driftGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      const node = driftNoise;
      const g = driftGain;
      driftNoise = null;
      driftGain = null;
      setTimeout(() => { try { node.stop(); } catch {} }, 200);
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) { engineStop(); driftOff(); }
  }

  return {
    init, ensure, setEnabled,
    engineUpdate, engineStop,
    driftOn, driftOff,
    play(name, arg) { const fn = sfx[name]; if (fn) fn(arg); },
    isEnabled() { return enabled; },
  };
})();
