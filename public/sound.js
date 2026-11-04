/* sound.js — soft, calm, kid-safe sound for the aquarium, synthesised live (Web Audio, no audio files).

   HOUSE RULES (the owner found the first version stressful: "there are beeps"):
     · Nothing is a held tone. No drones, pads, twinkles, melodies.  Pitch only ever appears inside short filter sweeps of NOISE.
       Review test: if you can sing the pitch back, it is a beep.
     · Ambience = a soft, low-passed water wash, slowly breathing (no wind/hiss), plus rare soft "blub"s and very rare slow swells.
     · Effects are quiet (peak ≈ 0.12), warm (nothing above ≈ 4 kHz), short (≤ 150 ms tonal), never rhythmic;
       at most 3 voices at once and ≥ 80 ms between sounds.
   Two volumes: SEA (ambience) and EFFECTS (everything triggered by something happening: a fish joins, a tap, feeding, ...).
   API: ReefSound.{toggle,setVolume,setFxVolume,setOption,setMuted,toggleMute,chime,play,onchange,status,level,arm}   */
(function (root) {
  'use strict';
  var KEY = 'reef.sound4', OLD = ['reef.sound3', 'reef.sound2'];
  var st = { on: true, vol: 0.5, fx: 0.6, muted: false, bub: true, wav: true };
  try {
    var raw = localStorage.getItem(KEY); for (var oi = 0; !raw && oi < OLD.length; oi++) raw = localStorage.getItem(OLD[oi]);
    var saved = JSON.parse(raw || 'null');
    if (saved) {
      st.on = !!saved.on; st.muted = !!saved.muted;
      ['vol', 'fx'].forEach(function (k) { var v = +saved[k]; if (!isNaN(v)) st[k] = Math.min(1, Math.max(0, v)); });
      ['bub', 'wav'].forEach(function (k) { if (typeof saved[k] === 'boolean') st[k] = saved[k]; });
    }
  } catch (e) {}
  var ctx = null, master = null, sea = null, fx = null, analyser = null, started = false, listeners = [], timers = {};
  var pinkBuf = null, brownBuf = null, whiteBuf = null, lastFx = 0, voices = [];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function status() { return { on: st.on, vol: st.vol, fx: st.fx, muted: st.muted, bub: st.bub, wav: st.wav, playing: !!(started && st.on && !st.muted) }; }
  function emit() { listeners.forEach(function (f) { try { f(status()); } catch (e) {} }); }
  function audible() { return !!(ctx && started && st.on && !st.muted && ctx.state === 'running'); }
  function R(a, b) { return a + Math.random() * (b - a); }
  function pan(node, v) { var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (!p) return node; p.pan.value = v; node.connect(p); return p; }

  // ── noise buffers ─────────────────────────────────────────────────────────
  function mkBuf(kind, secs) {
    var len = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c), last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        else if (kind === 'white') d[i] = w * 0.5;
        else { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      }
      if (secs > 2) { var fade = 2048; for (var j = 0; j < fade; j++) { var k = j / fade; d[len - fade + j] = d[len - fade + j] * (1 - k) + d[j] * k; } }   // seamless loop
    }
    return buf;
  }
  function lfo(freq, depth, param) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; }
  function env(g, t, a, peak, hold, rel) { g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(peak, t + a); g.setValueAtTime(peak, t + a + hold); g.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); }

  // ── a "shaped noise burst": the only building block for effects ───────────
  //    o = { kind, f0, f1, q, a, d, peak, type('bandpass'|'highpass'|'lowpass'), pan, dest, delay }
  function burst(o) {
    var t = ctx.currentTime + 0.01 + (o.delay || 0), dur = o.a + o.d + 0.05;
    var src = ctx.createBufferSource(); src.buffer = o.kind === 'brown' ? brownBuf : o.kind === 'white' ? whiteBuf : pinkBuf; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0, t); if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.a + o.d);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.peak, t + o.a); g.gain.exponentialRampToValueAtTime(0.0003, t + o.a + o.d);
    src.connect(f); f.connect(g); pan(g, o.pan || 0).connect(o.dest || fx);
    src.start(t, Math.random() * 3); src.stop(t + dur);
  }
  function thump(t0, f0, f1, dur, peak) { burst({ kind: 'brown', f0: f0, f1: f1, q: 1.2, a: 0.004, d: dur, peak: peak * 1.6, delay: t0 || 0 }); }   // soft low 'bup' made of filtered noise
  function bpop(delay, f0, f1, gain, p) {                          // one round bubble pop (~60 ms): a dark sine that springs up in pitch, with a little wobble like a real bubble; nothing above ~1.5 kHz
    var t = ctx.currentTime + 0.01 + delay, o = ctx.createOscillator(), g = ctx.createGain(), wob = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.05);
    lfo.frequency.value = 95; lg.gain.value = 0.28; wob.gain.value = 0.72; lfo.connect(lg); lg.connect(wob.gain);
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42 * gain, t + 0.004); g.gain.setValueAtTime(0.38 * gain, t + 0.022); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.085);
    o.connect(wob); wob.connect(lp); lp.connect(g); pan(g, p || 0).connect(fx);
    o.start(t); lfo.start(t); o.stop(t + 0.1); lfo.stop(t + 0.1);
  }
  function allowed(dur) {                                         // ≥ 80 ms apart, ≤ 3 voices
    var now = performance.now();
    voices = voices.filter(function (e) { return e > now; });
    if (now - lastFx < 80 || voices.length >= 3) return false;
    lastFx = now; voices.push(now + dur * 1000); return true;
  }

  // ── the sounds ────────────────────────────────────────────────────────────
  var SND = {
    pop: function () { burst({ kind: 'pink', f0: 520, f1: 1150, q: 2.5, a: 0.004, d: 0.085, peak: 0.11 }); thump(0, 210, 90, 0.06, 0.07); },
    blub: function (dest, p) { burst({ kind: 'pink', f0: R(280, 420), f1: R(650, 850), q: 4, a: 0.012, d: R(0.05, 0.08), peak: 0.07, pan: p || R(-0.5, 0.5), dest: dest }); },
    sparkle: function (off) {                                      // water-droplet shimmer: tiny filtered ticks + a soft warm bloom
      var n = 4 + ((Math.random() * 3) | 0), d = off || 0;
      for (var i = 0; i < n; i++) { burst({ kind: 'white', f0: R(2400, 3700), q: 1.3, a: 0.001, d: 0.012, peak: 0.035, delay: d, pan: R(-0.6, 0.6) }); d += R(0.03, 0.09); }
      burst({ kind: 'pink', f0: 700, q: 3, a: 0.012, d: 0.4, peak: 0.05, delay: (off || 0) + 0.02 });
    },
    chime: function () {                                           // a fish joined: two round, friendly bubble "pom, pom!" (the second a little higher)
      bpop(0, 430, 720, 0.8, -0.15); bpop(0.17, 540, 1000, 1.0, 0.15);
    },
    whoosh: function () { burst({ kind: 'pink', f0: 300, f1: 1800, q: 1.2, a: 0.2, d: 0.28, peak: 0.06 }); },
    nom: function () { burst({ kind: 'pink', f0: 400, q: 2, a: 0.004, d: 0.04, peak: 0.06 }); burst({ kind: 'pink', f0: 360, q: 2, a: 0.004, d: 0.04, peak: 0.05, delay: 0.09 }); },
    shutter: function () { burst({ kind: 'white', f0: 1500, q: 1, a: 0.002, d: 0.025, peak: 0.1 }); burst({ kind: 'pink', f0: 500, type: 'lowpass', q: 0.5, a: 0.002, d: 0.04, peak: 0.06, delay: 0.05 }); },
    tick: function () { burst({ kind: 'pink', f0: 900, q: 1.5, a: 0.002, d: 0.018, peak: 0.04 }); },
    squeak: function (type) {                                      // a friendly "rubber" squeak per creature; noisy, low-passed, pitch jittered every time
      var P = { swim: [650, 900], octo: [380, 640], jelly: [300, 420], horse: [800, 1150], crab: [520, 520], whale: [160, 220], dolphin: [1100, 1500] }[type] || [650, 900];
      var j = R(0.92, 1.08), t = ctx.currentTime + 0.01, dur = type === 'whale' ? 0.15 : 0.09;
      burst({ kind: 'pink', f0: P[0] * j, f1: P[1] * j * (type === 'crab' ? 1.25 : 1), q: 3, a: 0.01, d: dur, peak: 0.07 });
      burst({ kind: 'pink', f0: P[1] * j, q: 2, a: 0.005, d: dur * 0.8, peak: 0.05 });
      if (type === 'dolphin') setTimeout(function () { if (ctx) burst({ kind: 'pink', f0: 1300, q: 3, a: 0.004, d: 0.06, peak: 0.04 }); }, 110);
    }
  };

  // ── the sea ───────────────────────────────────────────────────────────────
  function build() {
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    pinkBuf = mkBuf('pink', 2); brownBuf = mkBuf('brown', 6); whiteBuf = mkBuf('white', 2);
    master = ctx.createGain(); master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.03; comp.release.value = 0.4;
    master.connect(comp); comp.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; comp.connect(analyser);
    sea = ctx.createGain(); sea.gain.value = 0;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95; hp.Q.value = 0.5; sea.connect(hp); hp.connect(master);
    fx = ctx.createGain(); fx.gain.value = 0;
    var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 3600; fl.Q.value = 0.3; fx.connect(fl); fl.connect(master);

    // water wash: only very low-passed brown noise, slowly breathing
    var src = ctx.createBufferSource(); src.buffer = brownBuf; src.loop = true; src.start(0, Math.random() * 3);
    var lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.3; g.gain.value = 0.4;
    lfo(0.045, 80, lp.frequency); lfo(0.03, 0.1, g.gain); src.connect(lp); lp.connect(g); g.connect(sea);
    scheduleBlub(); scheduleSwell();
    return true;
  }
  function scheduleBlub() {
    timers.bub = setTimeout(function () {
      if (audible() && st.bub) { SND.blub(sea, R(-0.6, 0.6)); if (Math.random() < 0.2) setTimeout(function () { if (audible()) SND.blub(sea); }, R(180, 300)); }
      scheduleBlub();
    }, R(8000, 18000));
  }
  function scheduleSwell() {
    timers.wave = setTimeout(function () {
      if (audible() && st.wav) {
        var t = ctx.currentTime + 0.05, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), dur = R(8, 11);
        src.buffer = brownBuf; src.loop = true; lp.type = 'lowpass'; lp.Q.value = 0.3;
        lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(400, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(160, t + dur);
        env(g.gain, t, dur * 0.45, R(0.14, 0.2), dur * 0.05, dur * 0.5);
        src.connect(lp); lp.connect(g); pan(g, R(-0.4, 0.4)).connect(sea); src.start(t, Math.random() * 2); src.stop(t + dur + 0.3);
      }
      scheduleSwell();
    }, R(30000, 55000));
  }

  function apply() {
    if (!ctx || !master) return;
    var on = st.on && !st.muted, t = ctx.currentTime;
    master.gain.setTargetAtTime(on ? 1 : 0, t, 0.2);
    sea.gain.setTargetAtTime(Math.pow(st.vol, 1.6) * 0.5, t, 0.15);
    fx.gain.setTargetAtTime(Math.pow(st.fx, 1.5), t, 0.05);
  }
  function ensureStarted() { if (!ctx && !build()) return false; if (ctx.state === 'suspended') ctx.resume(); started = true; return true; }

  function play(name, a) {
    if (!audible() || !SND[name] || !st.fx) return;
    if (!allowed(name === 'chime' ? 0.9 : 0.25)) return;
    SND[name](a);
  }

  root.ReefSound = {
    status: status,
    onchange: function (f) { listeners.push(f); f(status()); },
    toggle: function () { st.on = !st.on; if (st.on) { st.muted = false; ensureStarted(); } save(); apply(); emit(); },
    setVolume: function (v) { st.vol = Math.min(1, Math.max(0, v)); if (st.on) ensureStarted(); save(); apply(); emit(); },
    setFxVolume: function (v) { st.fx = Math.min(1, Math.max(0, v)); save(); apply(); emit(); },
    setOption: function (k, v) { if (k === 'bub' || k === 'wav') { st[k] = !!v; save(); emit(); } },
    setMuted: function (m) { st.muted = !!m; if (!m && st.on) ensureStarted(); save(); apply(); emit(); },
    toggleMute: function () { if (!st.on) { st.on = true; st.muted = false; ensureStarted(); } else st.muted = !st.muted; save(); apply(); emit(); },
    chime: function (force) { if (force && !st.on) { st.on = true; st.muted = false; ensureStarted(); save(); apply(); emit(); } if (force) { lastFx = 0; voices = []; } play('chime'); },
    play: play,
    level: function () {
      if (!analyser) return -Infinity; var d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
      var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return 20 * Math.log10(Math.sqrt(s / d.length) + 1e-9);
    },
    _an: function () { return analyser; }, _sr: function () { return ctx.sampleRate; },
    arm: function () {
      if (!st.on) return;
      function go() { if (st.on) { ensureStarted(); apply(); emit(); } removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); }
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    }
  };
})(window);
