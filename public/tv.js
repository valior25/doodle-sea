/* tv.js — the aquarium (Canvas 2D, no dependencies).
   World layers (back → front):
     sky/water (day·dusk·night, baked) · feathered light rays · back seaweed · background schools · far fish · fog · mid fish ·
     sand shadows · bottom dwellers · near fish · birth ceremonies · name tags · sky dimming · foreground reef + anemones · front weeds ·
     particles · caustics · surface · vignette · flash.
   Everything is procedural and cached; a quality governor (Q0–Q2) keeps it smooth on weak TVs.                          */
(function () {
  'use strict';

  var C = window.Creatures;
  var cv = document.getElementById('tank'), ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, unit = 100, time = 0;
  var P = new URLSearchParams(location.search);
  var NO_DEMO = P.get('demo') === '0', SHOW_FPS = P.has('fps'), NO_HERO = P.has('nohero');

  // ── helpers ───────────────────────────────────────────────────────────────
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { t = clamp(t, 0, 1); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function bell(u) { return u < 0.3 ? smooth(u / 0.3) : u < 0.7 ? 1 : smooth((1 - u) / 0.3); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  var HAS_FILTER = (function () { try { return 'filter' in mk(1, 1).getContext('2d'); } catch (e) { return false; } })();

  // ── quality governor ──────────────────────────────────────────────────────
  //   Q2 full · Q1 lighter · Q0 lite.  Steps down when frames are slow, back up when comfortably fast.  ?q=0|1|2 forces a tier.
  var TIERS = [
    { dpr: 1,   strips: 12, parts: 100, schools: 0,  halos: 0,  caus: 1, rays: 4, snow: 40 },
    { dpr: 1.5, strips: 24, parts: 220, schools: 14, halos: 12, caus: 2, rays: 6, snow: 70 },
    { dpr: 2,   strips: 40, parts: 400, schools: 22, halos: 24, caus: 3, rays: 7, snow: 90 }
  ];
  var Qforced = P.has('q'), Q = 2;
  try { var sq = parseInt(localStorage.getItem('reef.q'), 10); if (sq >= 0 && sq <= 2) Q = sq; } catch (e) {}
  if (Qforced) Q = clamp(parseInt(P.get('q'), 10) || 0, 0, 2);
  var emaMs = 16, govSlow = 0, govFast = 0, govClock = 0, govLast = -999, T = TIERS[Q];

  function setQ(q) {
    q = clamp(q, 0, 2); if (q === Q) return; Q = q; T = TIERS[Q]; govLast = time;
    try { localStorage.setItem('reef.q', String(Q)); } catch (e) {}
    resize(); initSnow(); buildSchools();
  }
  function govern(dtMs) {
    emaMs += (dtMs - emaMs) * 0.05; govClock += dtMs;
    if (Qforced || govClock < 2000) return;
    govClock = 0;
    if (emaMs > 26) { govSlow++; govFast = 0; } else if (emaMs < 20) { govFast++; govSlow = 0; } else { govSlow = 0; govFast = 0; }
    if (govSlow >= 3 && Q > 0) { govSlow = 0; setQ(Q - 1); }
    else if (govFast >= 10 && Q < 2 && time - govLast > 60) { govFast = 0; setQ(Q + 1); }
  }

  // ── the sky: day / dusk / night ───────────────────────────────────────────
  //   mode: 'auto' follows the real clock (deep blue at night, never black), or 'day' | 'dusk' | 'night'.  "Good night" = full night, slower fish.
  var sky = { d: 0, n: 0, mode: P.get('time') || 'auto', goodNight: false };
  function skyTargets() {
    if (sky.goodNight) return [0, 1];
    var m = sky.mode;
    if (m === 'day') return [0, 0];
    if (m === 'dusk') return [1, 0.2];
    if (m === 'night') return [0, 1];
    var d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    function ramp(a, b) { return smooth((h - a) / (b - a)); }
    if (h >= 7 && h < 18) return [0, 0];
    if (h >= 18 && h < 20) { var u = (h - 18) / 2; return [Math.sin(Math.PI * Math.min(u * 1.2, 1)) * 0.9, ramp(18.5, 20) * 0.55]; }
    if (h >= 20 || h < 5) return [0, 0.55];
    if (h >= 5 && h < 7) { var v = (h - 5) / 2; return [Math.sin(Math.PI * v) * 0.8, (1 - ramp(5, 7)) * 0.55]; }
    return [0, 0];
  }
  function updateSky(dt) {
    var tg = skyTargets(), k = Math.min(1, dt * (sky.goodNight ? 0.5 : 0.35));
    sky.d += (tg[0] - sky.d) * k; sky.n += (tg[1] - sky.n) * k;
  }

  // ── static layers ─────────────────────────────────────────────────────────
  var bgs = {}, bgScale = 1, fgReef, vignette, caustic, fogFill, raySprite, moonSprite, sparkleSprite, heartSprite, columnSprite, glowSprite;
  var sandBack = 0, sandFront = 0, weedBack = [], weedFront = [], anemones = [], rocksFar = [];

  function sandTop(x, base) { return base + Math.sin(x * 0.0042 + 0.6) * H * 0.012 + Math.sin(x * 0.0113 + 2) * H * 0.006; }

  var PAL = {
    day:   { water: ['#54d3e6', '#2aa9d6', '#1368a8', '#073a6d'], glow: 'rgba(255,255,255,.50)', gx: 0.62, rock: '8,70,125', ra: 0.5, sb: ['#6fa9b0', '#4f8b98', '#1e5a78'], sf: ['#e6d3a1', '#c9b27b', '#8b7a55'] },
    dusk:  { water: ['#ffb36b', '#c9607a', '#52408f', '#1c1a58'], glow: 'rgba(255,214,150,.55)', gx: 0.7, rock: '70,40,100', ra: 0.55, sb: ['#8a6f8f', '#5d4b7a', '#2a2a5e'], sf: ['#d9a889', '#b07f78', '#6b5568'] },
    night: { water: ['#123f80', '#0d3070', '#08245a', '#06214a'], glow: 'rgba(207,230,255,.30)', gx: 0.3, rock: '6,34,84', ra: 0.6, sb: ['#2b5a7a', '#1f4565', '#12304f'], sf: ['#6d8aa0', '#516f88', '#324862'] }
  };

  function buildWorld(key, scale) {
    var pal = PAL[key], r = rng(7), cw = Math.round(W * scale), ch = Math.round(H * scale), cnv = mk(cw, ch), g = cnv.getContext('2d');
    g.scale(scale, scale);
    var wg = g.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, pal.water[0]); wg.addColorStop(0.18, pal.water[1]); wg.addColorStop(0.55, pal.water[2]); wg.addColorStop(1, pal.water[3]);
    g.fillStyle = wg; g.fillRect(0, 0, W, H);
    var sg = g.createRadialGradient(W * pal.gx, -H * 0.1, 0, W * pal.gx, -H * 0.1, H * 0.9);
    sg.addColorStop(0, pal.glow); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H);

    function rockMass(cx, base, w, h, a) {
      g.beginPath(); g.moveTo(cx - w / 2, base);
      var n = 9, pts = [];
      for (var i = 0; i <= n; i++) { var u = i / n, bump = Math.sin(u * Math.PI); pts.push([cx - w / 2 + u * w, base - h * Math.pow(bump, 0.75) * (0.6 + 0.4 * r())]); }
      pts.forEach(function (p) { g.lineTo(p[0], p[1]); }); g.lineTo(cx + w / 2, base); g.closePath();
      var gr = g.createLinearGradient(0, base - h, 0, base);
      gr.addColorStop(0, 'rgba(' + pal.rock + ',0)'); gr.addColorStop(0.3, 'rgba(' + pal.rock + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + pal.rock + ',' + (a + 0.12) + ')');
      g.fillStyle = gr; g.fill();
      g.save(); g.strokeStyle = 'rgba(160,225,250,.14)'; g.lineWidth = 2; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
    }
    rockMass(W * 0.12, H * 0.84, W * 0.34, H * 0.40, pal.ra * 0.7);
    rockMass(W * 0.46, H * 0.84, W * 0.28, H * 0.26, pal.ra * 0.55);
    rockMass(W * 0.86, H * 0.84, W * 0.40, H * 0.48, pal.ra * 0.75);
    rockMass(W * 0.66, H * 0.84, W * 0.22, H * 0.22, pal.ra * 0.5);

    function dune(base, cs) {
      g.beginPath(); g.moveTo(0, H); for (var x = 0; x <= W; x += 8) g.lineTo(x, sandTop(x, base)); g.lineTo(W, H); g.closePath();
      var gr = g.createLinearGradient(0, base - H * 0.02, 0, H); gr.addColorStop(0, cs[0]); gr.addColorStop(0.25, cs[1]); gr.addColorStop(1, cs[2]); g.fillStyle = gr; g.fill();
    }
    dune(sandBack, pal.sb); dune(sandFront, pal.sf);
    g.save(); g.globalAlpha = 0.22; g.strokeStyle = '#fff4d0'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (var k = 0; k < 90; k++) { var rx = r() * W, ry = sandFront + 6 + r() * (H - sandFront - 8), rl = 30 + r() * 90; g.beginPath(); g.moveTo(rx, ry); g.quadraticCurveTo(rx + rl / 2, ry - 4 - r() * 4, rx + rl, ry); g.stroke(); }
    g.globalAlpha = 0.5;
    for (var p = 0; p < 140; p++) { var px = r() * W, py = sandFront + 4 + r() * (H - sandFront - 6), pr = 1 + r() * 3.2; g.fillStyle = r() < 0.5 ? 'rgba(90,70,40,.35)' : 'rgba(255,248,220,.5)'; g.beginPath(); g.ellipse(px, py, pr * 1.4, pr, 0, 0, 6.3); g.fill(); }
    // a few baked shells and a starfish on the sand
    g.globalAlpha = 0.9;
    for (var s = 0; s < 7; s++) { var sx = r() * W, sy = sandFront + 14 + r() * (H - sandFront - 20), sr = (5 + r() * 7) * (H / 1080); g.fillStyle = ['#f6c9c0', '#fff1d6', '#e9b7d6'][s % 3]; g.beginPath(); g.ellipse(sx, sy, sr * 1.2, sr * 0.8, r() * 3, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(120,70,60,.35)'; g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, sr * 0.55, 0, 6.3); g.stroke(); }
    g.restore();
    return cnv;
  }

  function buildSprites() {
    // feathered god-ray: soft on both edges, fading with depth
    raySprite = mk(128, 512); var rg = raySprite.getContext('2d'), im = rg.createImageData(128, 512), d = im.data;
    for (var y = 0; y < 512; y++) for (var x = 0; x < 128; x++) { var u = (x / 127 - 0.5) * 2, a = Math.exp(-u * u * 3.2) * Math.pow(1 - y / 512, 1.3); var o = (y * 128 + x) * 4; d[o] = 235; d[o + 1] = 252; d[o + 2] = 255; d[o + 3] = a * 255; }
    rg.putImageData(im, 0, 0);
    moonSprite = mk(256, 256); var mg = moonSprite.getContext('2d'), mr = mg.createRadialGradient(128, 128, 0, 128, 128, 128);
    mr.addColorStop(0, 'rgba(210,232,255,.9)'); mr.addColorStop(0.18, 'rgba(190,220,255,.35)'); mr.addColorStop(1, 'rgba(190,220,255,0)'); mg.fillStyle = mr; mg.fillRect(0, 0, 256, 256);
    glowSprite = mk(128, 128); var gg = glowSprite.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,248,205,.55)'); gr.addColorStop(1, 'rgba(255,248,205,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    columnSprite = mk(64, 256); var cg = columnSprite.getContext('2d'), cl = cg.createLinearGradient(0, 0, 0, 256);
    cl.addColorStop(0, 'rgba(255,251,224,0)'); cl.addColorStop(0.5, 'rgba(255,251,224,.6)'); cl.addColorStop(1, 'rgba(255,251,224,.15)');
    var cim = cg.createImageData(64, 256), cd = cim.data; cg.fillStyle = cl; cg.fillRect(0, 0, 64, 256);
    var raw = cg.getImageData(0, 0, 64, 256); for (var yy = 0; yy < 256; yy++) for (var xx = 0; xx < 64; xx++) { var uu = (xx / 63 - 0.5) * 2, o2 = (yy * 64 + xx) * 4; raw.data[o2 + 3] *= Math.exp(-uu * uu * 2.4); } cg.putImageData(raw, 0, 0);
    sparkleSprite = mk(24, 24); var sg = sparkleSprite.getContext('2d'); sg.translate(12, 12); sg.fillStyle = '#fff6c8';
    sg.beginPath(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rad = i % 2 ? 2.6 : 11; sg.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } sg.closePath(); sg.fill();
    sg.fillStyle = 'rgba(255,255,255,.9)'; sg.beginPath(); sg.arc(0, 0, 2.6, 0, 6.3); sg.fill();
    heartSprite = mk(24, 24); var hg = heartSprite.getContext('2d'); hg.translate(12, 13); hg.fillStyle = '#ff8fb5'; hg.beginPath();
    hg.moveTo(0, 8); hg.bezierCurveTo(-14, -2, -8, -12, 0, -5); hg.bezierCurveTo(8, -12, 14, -2, 0, 8); hg.fill();
    hg.fillStyle = 'rgba(255,255,255,.55)'; hg.beginPath(); hg.ellipse(-4.5, -4, 2.2, 1.4, -0.6, 0, 6.3); hg.fill();
  }

  function buildStatic() {
    sandBack = H * 0.80; sandFront = H * 0.90;
    var px = W * DPR * H * DPR; bgScale = px > 3.5e6 ? Math.min(1, DPR) : DPR; bgScale = Math.min(bgScale, DPR);
    bgs = { day: buildWorld('day', bgScale), dusk: buildWorld('dusk', bgScale), night: buildWorld('night', bgScale) };
    buildSprites();

    // foreground reef at the corners: fat finger-coral (3 passes: dark edge · colour · highlight), rocks, brain coral, tube sponges
    fgReef = mk(W * DPR, H * DPR);
    var f = fgReef.getContext('2d'); f.scale(DPR, DPR);
    function rock(cx, cy, rx, ry, c1, c2, fr) {
      var gr = f.createRadialGradient(cx - rx * 0.3, cy - ry * 0.5, ry * 0.1, cx, cy, Math.max(rx, ry)); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      f.fillStyle = gr; f.beginPath(); for (var a = 0; a <= 6.3; a += 0.35) { var wob = 1 + (fr() - 0.5) * 0.18; f.lineTo(cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob); } f.closePath(); f.fill();
    }
    function tree(x, y, ang, len, w, col, depth, seed, pass) {
      var fr = rng(seed);
      (function rec(x, y, ang, len, w, depth) {
        if (depth <= 0 || len < 6) return;
        var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        f.lineCap = 'round'; f.lineWidth = pass === 0 ? w * 1.55 : pass === 1 ? w : w * 0.38;
        f.strokeStyle = pass === 0 ? 'rgba(40,18,60,.55)' : pass === 1 ? col[0] : col[1];
        var off = pass === 2 ? -w * 0.18 : 0;
        f.beginPath(); f.moveTo(x + off, y + off); f.lineTo(x2 + off, y2 + off); f.stroke();
        if (pass === 1 && depth <= 2) { f.fillStyle = col[1]; f.beginPath(); f.arc(x2, y2, w * 0.55, 0, 6.3); f.fill(); }     // rounded polyp tips
        var spread = 0.38 + fr() * 0.32;
        rec(x2, y2, ang - spread, len * (0.74 + fr() * 0.08), w * 0.76, depth - 1);
        rec(x2, y2, ang + spread, len * (0.74 + fr() * 0.08), w * 0.76, depth - 1);
        if (fr() < 0.3) rec(x2, y2, ang + (fr() - 0.5) * 0.3, len * 0.62, w * 0.66, depth - 1);
      })(x, y, ang, len, w, depth);
    }
    var COLS = [['#ff7a8a', '#ffc2cc'], ['#ff9e5e', '#ffd2a8'], ['#f5c04a', '#fff0a8'], ['#c47bff', '#e6c8ff'], ['#4fd1c5', '#bdf5ee'], ['#ff6fb0', '#ffc6df']];
    function reefCorner(side, sd) {
      var s = side, bx = side > 0 ? 0 : W, u = H / 1080, fr = rng(sd), X = function (v) { return bx + s * v * u; };
      rock(X(150), H + 20 * u, 300 * u, 190 * u, '#5a4b6e', '#241c3c', fr); rock(X(330), H + 30 * u, 220 * u, 140 * u, '#6b5a7e', '#2a2146', fr); rock(X(60), H - 130 * u, 130 * u, 150 * u, '#52456a', '#211a38', fr);
      for (var i = 0; i < 5; i++) { var ang = -Math.PI / 2 + s * (fr() - 0.5) * 0.9, bxx = X(60 + i * 70), byy = H - (60 + fr() * 70) * u, ln = (52 + fr() * 40) * u, ww = (15 + fr() * 6) * u, col = COLS[(i + (s > 0 ? 0 : 3)) % COLS.length], seed = sd * 31 + i; for (var ps = 0; ps < 3; ps++) tree(bxx, byy, ang, ln, ww, col, 4, seed, ps); }
      var bx0 = X(300), by0 = H - 70 * u, bgd = f.createRadialGradient(bx0 - 20 * u, by0 - 30 * u, 4, bx0, by0, 90 * u); bgd.addColorStop(0, '#9be3a0'); bgd.addColorStop(1, '#3a9a6a');
      f.fillStyle = bgd; f.beginPath(); f.ellipse(bx0, by0, 90 * u, 62 * u, 0, Math.PI, 0); f.fill(); f.strokeStyle = 'rgba(20,90,60,.45)'; f.lineWidth = 3 * u;
      for (var q = 0; q < 6; q++) { f.beginPath(); f.ellipse(bx0, by0, (20 + q * 14) * u, (12 + q * 9) * u, 0, Math.PI * 1.05, Math.PI * 1.95); f.stroke(); }
      for (var t = 0; t < 4; t++) { var tx = X(20 + t * 38), th = (80 + fr() * 70) * u, tw = 20 * u, tg = f.createLinearGradient(tx - tw, 0, tx + tw, 0); tg.addColorStop(0, '#ff6fb0'); tg.addColorStop(1, '#a8338a'); f.fillStyle = tg; f.beginPath(); f.moveTo(tx - tw, H); f.lineTo(tx - tw * 0.9, H - th); f.ellipse(tx, H - th, tw * 0.9, tw * 0.35, 0, Math.PI, 0, true); f.lineTo(tx + tw, H); f.closePath(); f.fill(); f.fillStyle = '#5a1648'; f.beginPath(); f.ellipse(tx, H - th, tw * 0.75, tw * 0.25, 0, 0, 6.3); f.fill(); }
    }
    reefCorner(1, 31); reefCorner(-1, 77);

    vignette = mk(W * DPR, H * DPR); var v = vignette.getContext('2d'); v.scale(DPR, DPR);
    var vg = v.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.45, W / 2, H * 0.5, Math.max(W, H) * 0.78); vg.addColorStop(0, 'rgba(2,20,48,0)'); vg.addColorStop(1, 'rgba(2,20,48,.5)'); v.fillStyle = vg; v.fillRect(0, 0, W, H);

    // depth fog: lighter near the surface, deeper blue lower down; drawn over far / mid fish
    fogFill = ctx.createLinearGradient(0, 0, 0, H); fogFill.addColorStop(0, 'rgba(90,205,230,1)'); fogFill.addColorStop(0.5, 'rgba(24,120,185,1)'); fogFill.addColorStop(1, 'rgba(6,60,120,1)');

    // swaying plants (gradients cached once)
    var wr = rng(99), u2 = H / 1080; weedBack = []; weedFront = []; anemones = [];
    for (var i2 = 0; i2 < 16; i2++) { var s2 = { x: wr() * W, h: H * (0.14 + wr() * 0.2), ph: wr() * 6.3, w: 7 + wr() * 7, hue: 150 + wr() * 25 }; var ry = sandTop(s2.x, sandBack) + 8; s2.root = ry; var gb = ctx.createLinearGradient(0, ry, 0, ry - s2.h); gb.addColorStop(0, 'hsla(' + s2.hue + ',45%,30%,.78)'); gb.addColorStop(1, 'hsla(' + s2.hue + ',50%,40%,.8)'); s2.g = gb; weedBack.push(s2); }
    for (var j = 0; j < 9; j++) { var edge = j < 5 ? wr() * 0.16 : 0.84 + wr() * 0.16, s3 = { x: edge * W, h: H * (0.26 + wr() * 0.28), ph: wr() * 6.3, w: 12 + wr() * 9, hue: 105 + wr() * 40 }; s3.root = H + 6; var gf = ctx.createLinearGradient(0, s3.root, 0, s3.root - s3.h); gf.addColorStop(0, 'hsl(' + s3.hue + ',62%,34%)'); gf.addColorStop(1, 'hsl(' + s3.hue + ',70%,52%)'); s3.g = gf; weedFront.push(s3); }
    [[0.19, 0.955, '#ff8fb8', '#ffd1e6'], [0.80, 0.965, '#b78bff', '#e5d6ff'], [0.36, 0.975, '#ff9e6e', '#ffe0c8']].forEach(function (a, i) { var an = { x: a[0] * W, y: a[1] * H, c1: a[2], c2: a[3], n: 16, ph: i * 2.1, s: u2 * (1.1 - i * 0.12) }; anemones.push(an); });
  }

  function buildCaustic() {
    var S = 256, c = mk(S, S), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data, TAU = Math.PI * 2;
    for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) {
      var u = i / S * TAU, v = j / S * TAU;
      var s1 = Math.sin(2 * u + 1.3 * Math.sin(v + 0.7)) + Math.sin(3 * v + 1.1 * Math.sin(2 * u));
      var s2 = Math.sin(3 * u - v + 1.2 * Math.sin(2 * v - u)) + Math.sin(2 * (u + v) + 0.9 * Math.sin(3 * u));
      var a = Math.pow(1 - Math.abs(Math.sin(s1 * 1.3)), 7), b = Math.pow(1 - Math.abs(Math.sin(s2 * 1.3)), 7), val = clamp(Math.max(a, b) * 1.1, 0, 1), o = (j * S + i) * 4;
      d[o] = 255; d[o + 1] = 255; d[o + 2] = 240; d[o + 3] = val * 255;
    }
    x.putImageData(im, 0, 0); caustic = ctx.createPattern(c, 'repeat');
  }

  // ── particles: one shared pool ────────────────────────────────────────────
  //   types: 1 bubble · 2 sparkle · 3 droplet · 4 heart
  var PN = 400, px_ = new Float32Array(PN), py_ = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), pl = new Float32Array(PN), pm = new Float32Array(PN), pr_ = new Float32Array(PN), pph = new Float32Array(PN), pt = new Uint8Array(PN), pcur = 0;
  function emit(type, x, y, n, o) {
    o = o || {};
    var cap = Math.min(PN, T.parts);
    for (var k = 0; k < n; k++) {
      var i = pcur; pcur = (pcur + 1) % cap;
      px_[i] = x + rand(-(o.spread || 0), o.spread || 0); py_[i] = y + rand(-(o.spread || 0) * 0.6, (o.spread || 0) * 0.6); pt[i] = type; pph[i] = rand(0, 6.3);
      if (type === 1) { pr_[i] = o.r || rand(2, 7); pvx[i] = o.vx || 0; pvy[i] = -(o.vy || rand(30, 90)); pm[i] = pl[i] = 9; }
      else if (type === 2) { var a = rand(0, 6.28), sp = rand(60, 200) * (o.speed || 1); pvx[i] = Math.cos(a) * sp; pvy[i] = Math.sin(a) * sp - 40; pm[i] = pl[i] = rand(0.8, 1.5); pr_[i] = rand(0.5, 1); }
      else if (type === 3) { pvx[i] = (o.vx || 0) + rand(-60, 60); pvy[i] = -(o.vy || rand(260, 340)) * rand(0.7, 1.1); pm[i] = pl[i] = 2.2; pr_[i] = rand(1.5, 3.4); }
      else { pvx[i] = rand(-20, 20); pvy[i] = -rand(50, 80); pm[i] = pl[i] = rand(1.4, 2); pr_[i] = rand(0.8, 1.2); }
    }
  }
  function updateParticles(dt) {
    for (var i = 0; i < PN; i++) {
      if (pl[i] <= 0) continue;
      pl[i] -= dt; var ty = pt[i];
      if (ty === 1) { py_[i] -= -pvy[i] * dt; px_[i] += pvx[i] * dt + Math.sin(time * 3 + pph[i]) * 14 * dt; pvy[i] -= 18 * dt; if (py_[i] < -20) pl[i] = 0; }
      else if (ty === 2) { px_[i] += pvx[i] * dt; py_[i] += pvy[i] * dt; pvy[i] += 160 * dt; pvx[i] *= 0.985; }
      else if (ty === 3) { px_[i] += pvx[i] * dt; py_[i] += pvy[i] * dt; pvy[i] += 480 * dt; if (pvy[i] > 0 && py_[i] > H * 0.045) pl[i] = 0; }
      else { px_[i] += pvx[i] * dt + Math.sin(time * 2 + pph[i]) * 20 * dt; py_[i] += pvy[i] * dt; }
    }
  }
  function drawParticles() {
    ctx.lineWidth = 1.3; var i, a;
    for (i = 0; i < PN; i++) if (pl[i] > 0 && pt[i] === 1) {                 // bubbles
      var r = pr_[i]; ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.fillStyle = 'rgba(210,245,255,.12)'; ctx.beginPath(); ctx.arc(px_[i], py_[i], r, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(px_[i] - r * 0.35, py_[i] - r * 0.38, Math.max(0.8, r * 0.22), 0, 6.3); ctx.fill();
    }
    ctx.fillStyle = 'rgba(235,252,255,.9)';
    for (i = 0; i < PN; i++) if (pl[i] > 0 && pt[i] === 3) { ctx.globalAlpha = Math.min(1, pl[i] / pm[i] * 1.6); ctx.beginPath(); ctx.arc(px_[i], py_[i], pr_[i], 0, 6.3); ctx.fill(); }
    for (i = 0; i < PN; i++) if (pl[i] > 0 && pt[i] === 2) { a = pl[i] / pm[i]; ctx.globalAlpha = a; var s = 10 + 12 * pr_[i] * a; ctx.drawImage(sparkleSprite, px_[i] - s / 2, py_[i] - s / 2, s, s); }
    for (i = 0; i < PN; i++) if (pl[i] > 0 && pt[i] === 4) { a = Math.min(1, pl[i] / pm[i] * 1.8); ctx.globalAlpha = a; var hs = 20 * pr_[i]; ctx.drawImage(heartSprite, px_[i] - hs / 2, py_[i] - hs / 2, hs, hs); }
    ctx.globalAlpha = 1;
  }
  var rings = [];                                             // expanding ripple / ring effects
  function ring(x, y, r1, dur, o) { o = o || {}; if (rings.length < 14) rings.push({ x: x, y: y, r0: o.r0 || 4, r1: r1, t: 0, dur: dur, a: o.a || 0.6, flat: o.flat || 1, lw: o.lw || 3 }); }
  function drawRings(dt) {
    for (var i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt; if (r.t >= r.dur) { rings.splice(i, 1); continue; }
      var u = r.t / r.dur, rad = lerp(r.r0, r.r1, easeOutCubic(u));
      ctx.strokeStyle = 'rgba(235,252,255,' + (r.a * (1 - u)) + ')'; ctx.lineWidth = Math.max(0.6, r.lw * (1 - u)); ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.flat, 0, 0, 6.3); ctx.stroke();
    }
  }
  function burst(x, y, n) { emit(1, x, y, n, { spread: 14, vy: null }); }
  var snow = [];
  function initSnow() { snow = []; for (var i = 0; i < T.snow; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, r: rand(0.8, 2.6), v: rand(4, 14), ph: rand(0, 6.3), a: rand(0.12, 0.45) }); }

  // ── sprites ───────────────────────────────────────────────────────────────
  var BIG = { whale: 1, manta: 1, shark: 1, dolphin: 1 };
  var POSE_FIX = {};                            // drawings drawn at an angle are straightened so the fish swims level
  function straighten(img, id) {
    var a = POSE_FIX[id]; if (!a) return img;
    var w = img.width, h = img.height, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), W2 = Math.ceil(w * c + h * sn), H2 = Math.ceil(w * sn + h * c), o = mk(W2, H2), g = o.getContext('2d');
    g.translate(W2 / 2, H2 / 2); g.rotate(a); g.drawImage(img, -w / 2, -h / 2); return o;
  }
  function prepSprite(img, flip) {
    var max = 448, k = Math.min(1, max / Math.max(img.width, img.height));
    var w = Math.max(8, Math.round(img.width * k)), h = Math.max(8, Math.round(img.height * k)), pad = 6;
    var out = mk(w + pad * 2, h + pad * 2), o = out.getContext('2d');
    var sil = mk(w, h), s = sil.getContext('2d'); s.drawImage(img, 0, 0, w, h); s.globalCompositeOperation = 'source-in'; s.fillStyle = 'rgba(8,44,84,.92)'; s.fillRect(0, 0, w, h);
    for (var a = 0; a < 14; a++) { var ang = a / 14 * 6.283; o.drawImage(sil, pad + Math.cos(ang) * 3.2, pad + Math.sin(ang) * 3.2); }
    o.imageSmoothingQuality = 'high'; try { o.filter = 'saturate(1.18) contrast(1.07)'; } catch (e) {} o.drawImage(img, pad, pad, w, h); try { o.filter = 'none'; } catch (e) {}   // crisper, richer colours (baked once)
    var halo = makeHalo(img, w, h);
    if (flip) { var fl = mk(out.width, out.height), fx = fl.getContext('2d'); fx.translate(out.width, 0); fx.scale(-1, 1); fx.drawImage(out, 0, 0); if (halo) { var fh = mk(halo.width, halo.height), hx = fh.getContext('2d'); hx.translate(halo.width, 0); hx.scale(-1, 1); hx.drawImage(halo, 0, 0); halo = fh; } return { c: fl, halo: halo }; }
    return { c: out, halo: halo };
  }
  function makeHalo(img, w, h) {                               // soft coloured glow for the night (built once, quarter size)
    try {
      var sw = Math.max(8, w >> 2), sh = Math.max(8, h >> 2), tiny = mk(8, 8), t = tiny.getContext('2d'); t.drawImage(img, 0, 0, 8, 8);
      var d = t.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return null; r /= n; g /= n; b /= n; var m = Math.max(r, g, b, 1), boost = 255 / m * 0.9; r = Math.min(255, r * boost); g = Math.min(255, g * boost); b = Math.min(255, b * boost);
      var pad = 14, out = mk(sw + pad * 2, sh + pad * 2), o = out.getContext('2d');
      var col = mk(sw, sh), c = col.getContext('2d'); c.drawImage(img, 0, 0, sw, sh); c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; c.fillRect(0, 0, sw, sh);
      if (HAS_FILTER) { o.filter = 'blur(7px)'; o.drawImage(col, pad, pad); o.drawImage(col, pad, pad); }
      else for (var k = 1; k <= 3; k++) { o.globalAlpha = 0.28; for (var a = 0; a < 8; a++) o.drawImage(col, pad + Math.cos(a * 0.785) * k * 3, pad + Math.sin(a * 0.785) * k * 3); }
      return out;
    } catch (e) { return null; }
  }
  // demo fish: the real line drawing (eyes, scales, fins...) coloured in, so even the placeholders show their faces
  var artCache = {};
  function loadArt(c) { if (!c.art) return Promise.resolve(null); return artCache[c.id] || (artCache[c.id] = loadImage(c.art.src.replace(/\.svg$/, '.png')).catch(function () { return null; })); }
  function demoSpriteArt(c, img) {
    var r = rng(c.id.length * 977 + (Math.random() * 1e5 | 0));
    var pals = [['#ff8a3d', '#ffd23f', '#e84a5f'], ['#3dc4ff', '#7cf2c2', '#2f6bff'], ['#ff6fb0', '#ffd0e6', '#a84bff'], ['#6be36b', '#e9ff7a', '#18a874'], ['#ffb347', '#fff2a8', '#ff5e3a'], ['#7a8cff', '#c7b8ff', '#ff7ac6']];
    var pal = pals[(r() * pals.length) | 0], W0 = img.width, H0 = img.height, k = Math.min(1, 460 / Math.max(W0, H0)), w = Math.round(W0 * k), h = Math.round(H0 * k);
    var cnv = mk(w, h), x = cnv.getContext('2d'), P2 = new Path2D(c.d);
    x.save(); x.scale(k, k); x.clip(P2);
    var gr = x.createLinearGradient(0, 0, W0 * 0.45, H0); gr.addColorStop(0, pal[0]); gr.addColorStop(0.55, pal[1]); gr.addColorStop(1, pal[2]); x.fillStyle = gr; x.fillRect(0, 0, W0, H0);
    var kind = (r() * 3) | 0; x.strokeStyle = 'rgba(255,255,255,.35)'; x.fillStyle = 'rgba(255,255,255,.3)'; x.lineWidth = W0 / 22;
    if (kind === 0) for (var i = 0; i < 9; i++) { x.beginPath(); x.moveTo(W0 * (0.1 + i * 0.1), -5); x.lineTo(W0 * (0.04 + i * 0.1), H0 + 5); x.stroke(); }
    else if (kind === 1) for (var j = 0; j < 30; j++) { x.beginPath(); x.arc(r() * W0, r() * H0, W0 / 55 + r() * W0 / 28, 0, 6.3); x.fill(); }
    else for (var q = 0; q < 8; q++) { x.beginPath(); x.moveTo(-5, H0 * q / 8); x.lineTo(W0 + 5, H0 * (q - 1.4) / 8); x.stroke(); }
    x.restore();
    x.globalCompositeOperation = 'multiply'; x.drawImage(img, 0, 0, w, h);          // the black-and-white drawing on top: lines stay dark, white becomes the colour
    x.globalCompositeOperation = 'destination-in'; x.save(); x.scale(k, k); x.fill(P2); x.restore();   // cut to the animal
    return prepSprite(straighten(cnv, c.id), c.faceLeft);
  }
  function demoSprite(c) {
    var r = rng(c.id.length * 977 + (Math.random() * 1e5 | 0));
    var pals = [['#ff8a3d', '#ffd23f', '#e84a5f'], ['#3dc4ff', '#7cf2c2', '#2f6bff'], ['#ff6fb0', '#ffd0e6', '#a84bff'], ['#6be36b', '#e9ff7a', '#18a874'], ['#ffb347', '#fff2a8', '#ff5e3a']];
    var pal = pals[(r() * pals.length) | 0], b = c.bbox, sc = 440 / Math.max(b.w, b.h), cw = Math.ceil(b.w * sc), ch = Math.ceil(b.h * sc), cnv = mk(cw, ch), x = cnv.getContext('2d');
    x.save(); x.scale(sc, sc); x.translate(-b.x, -b.y);
    var P2 = new Path2D(c.d), gr = x.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h); gr.addColorStop(0, pal[0]); gr.addColorStop(0.55, pal[1]); gr.addColorStop(1, pal[2]);
    x.fillStyle = gr; x.fill(P2); x.save(); x.clip(P2);
    var kind = (r() * 3) | 0; x.strokeStyle = 'rgba(255,255,255,.55)'; x.fillStyle = 'rgba(255,255,255,.45)'; x.lineWidth = b.w / 26;
    if (kind === 0) for (var i = 0; i < 9; i++) { x.beginPath(); x.moveTo(b.x + b.w * (0.1 + i * 0.1), b.y - 5); x.lineTo(b.x + b.w * (0.04 + i * 0.1), b.y + b.h + 5); x.stroke(); }
    else if (kind === 1) for (var j = 0; j < 26; j++) { x.beginPath(); x.arc(b.x + r() * b.w, b.y + r() * b.h, b.w / 60 + r() * b.w / 30, 0, 6.3); x.fill(); }
    else for (var q = 0; q < 8; q++) { x.beginPath(); x.moveTo(b.x - 5, b.y + b.h * q / 8); x.lineTo(b.x + b.w + 5, b.y + b.h * (q - 1.4) / 8); x.stroke(); }
    x.restore(); x.lineCap = 'round'; x.lineWidth = b.w / 150;
    (c.lines || []).forEach(function (d) { x.strokeStyle = 'rgba(60,30,40,.6)'; x.stroke(new Path2D(d)); });
    (c.eyes || []).forEach(function (e) { x.fillStyle = '#fff'; x.beginPath(); x.arc(e[0], e[1], e[2], 0, 6.3); x.fill(); x.strokeStyle = 'rgba(40,20,30,.8)'; x.stroke(); x.fillStyle = '#1b1022'; x.beginPath(); x.arc(e[0] + e[2] * 0.2, e[1], e[2] * 0.55, 0, 6.3); x.fill(); });
    x.restore(); return prepSprite(cnv, false);
  }

  // name tags: cached offscreen pill, only shown on arrival and tap
  function makeTag(text) {
    var c = mk(10, 10), x = c.getContext('2d'), fs = 34; x.font = '500 ' + fs + 'px Rubik, system-ui, sans-serif'; x.direction = 'rtl';
    var tw = Math.ceil(x.measureText(text).width), w = tw + 44, h = fs + 24; c.width = w; c.height = h; x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); if (x.roundRect) x.roundRect(0, 0, w, h, h / 2); else x.rect(0, 0, w, h); x.fill();
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(w / 2, h * 0.28, w * 0.4, h * 0.16, 0, 0, 6.3); x.fill();
    x.font = '500 ' + fs + 'px Rubik, system-ui, sans-serif'; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#0b4a7a'; x.fillText(text, w / 2, h / 2 + 2);
    return c;
  }

  // ── fish ──────────────────────────────────────────────────────────────────
  var fishes = [], foods = [], births = [], idleBusy = false, byId = {}, realCount = 0, flashT = 0;
  function bounds() { return { x0: W * 0.07, x1: W * 0.93, y0: H * 0.13, y1: H * 0.74 }; }

  function Fish(rec, spr, opt) {
    opt = opt || {};
    this.id = rec.id; this.kind = rec.kind; this.demo = !!rec.demo; this.name = rec.name || '';
    this.c = C.byId(rec.kind) || C.list[0]; this.bid = this.c.id.replace(/^a_/, ''); this.m = this.c.motion;
    this.sprite = spr.c; this.halo = spr.halo; this.aspect = spr.c.width / spr.c.height;
    this.z = BIG[this.bid] ? rand(0, 0.5) : Math.random(); this.dir = Math.random() < 0.5 ? -1 : 1; this.face = this.dir;
    this.ph = Math.random() * 6.3; this.vx = this.vy = 0; this.panic = 0; this.gulp = 0; this.pause = 0; this.boost = 1;
    this.born = time; this.alpha = 1; this.dying = 0; this.hidden = false; this.popT = 0; this.act = null; this.cool = 0; this.tagT = 0; this.tag = null; this.find = 0; this.hearts = 0; this.tapN = 0; this.tapT = 0; this.nextIdle = time + rand(12, 40);
    this.resize();
    var b = bounds(); this.x = rand(b.x0, b.x1); this.y = rand(b.y0, b.y1); if (this.floor()) this.y = this.floorY();
    this.pickTarget();
  }
  Fish.prototype.floor = function () { return this.m === 'crab' || this.m === 'star'; };
  Fish.prototype.resize = function () {
    var depth = 0.62 + 0.5 * this.z, long = unit * this.c.size * depth, cap = (BIG[this.bid] ? 0.16 : 0.2) * W; long = Math.min(long, cap);
    if (this.aspect >= 1) { this.w = long; this.h = long / this.aspect; } else { this.h = long; this.w = long * this.aspect; }
    this.speed = (0.045 + Math.random() * 0.05) * W * (0.7 + 0.5 * (1 - this.z * 0.4)) * (this.m === 'swim' ? 1 : 0.5);
    if (this.bid === 'turtle' || this.bid === 'whale') this.speed *= 0.55; if (this.bid === 'shark') this.speed *= 0.85;
  };
  Fish.prototype.floorY = function () { return lerp(sandBack + H * 0.03, sandFront + H * 0.045, this.z) - this.h * 0.32; };
  Fish.prototype.pickTarget = function () {
    var b = bounds();
    if (this.floor()) { this.tx = clamp(this.x + rand(-W * 0.25, W * 0.25), b.x0, b.x1); this.ty = this.floorY(); }
    else {
      var side = this.dir > 0 ? 1 : -1, dx = rand(0.15, 0.55) * W * (Math.random() < 0.8 ? side : -side);
      this.tx = clamp(this.x + dx, b.x0, b.x1);
      this.ty = Math.random() < 0.55 ? rand(b.y0, b.y1) : clamp(this.y + rand(-H * 0.18, H * 0.18), b.y0, b.y1);
      if (this.m === 'jelly') this.ty = clamp(this.y + rand(-H * 0.35, H * 0.1), b.y0, b.y1);
    }
    this.next = time + rand(4, 9);
  };

  Fish.prototype.react = function (kind) {
    if (this.act || this.hidden || this.dying) return;
    var map = { swim: 'roll', octo: 'pulse', jelly: 'pulse', horse: 'spin', crab: 'hop', star: 'pulse' };
    var k = kind || ((this.bid === 'dolphin' || this.bid === 'whale') ? 'jump' : map[this.m] || 'roll');
    var d = { roll: 0.7, spin: 0.8, hop: 0.7, pulse: 0.9, jump: 1.2 }[k] || 0.8;
    this.act = { k: k, t: 0, d: d, y0: this.y }; this.tagT = 2.2; this.cool = time + 1.2;
    if (k === 'roll') this.boost = 2.4;
    emit(1, this.x, this.y, 6, { spread: this.w * 0.25 });
    if (time - this.tapT < 5) this.tapN++; else this.tapN = 1; this.tapT = time;
    if (this.tapN >= 3) { emit(4, this.x, this.y - this.h * 0.4, 3, { spread: this.w * 0.2 }); this.tapN = 0; } else emit(4, this.x, this.y - this.h * 0.45, 1);
    var sk = this.bid === 'dolphin' ? 'dolphin' : this.bid === 'whale' ? 'whale' : this.m;
    if (window.ReefSound) ReefSound.play('squeak', sk);
  };

  Fish.prototype.update = function (dt) {
    if (this.hidden) return;
    this.tagT = Math.max(0, this.tagT - dt);
    if (this.act) {
      this.act.t += dt;
      if (this.act.k === 'spout') {
        var u = this.act.t / this.act.d;
        if (!this.act.spouted && u > 0.42) { this.act.spouted = 1; var topY = this.y - (this.y - H * 0.19) * 1 - this.h * 0.45; emit(3, this.x + this.dir * this.w * 0.12, H * 0.19 - this.h * 0.45, 14, { spread: 6 }); ring(this.x, H * 0.045, this.w * 0.5, 1.2, { a: 0.5, flat: 0.25 }); }
      }
      if (this.act.k === 'jump') {
        var uj = this.act.t / this.act.d, py = this.y - (this.y - H * 0.2) * Math.sin(Math.PI * uj);
        if (!this.act.exit && uj > 0.2 && py < H * 0.05) { this.act.exit = 1; emit(3, this.x, H * 0.045, 16, { spread: this.w * 0.2 }); ring(this.x, H * 0.045, this.w * 0.6, 1, { a: 0.6, flat: 0.25 }); }
        if (this.act.exit && !this.act.enter && uj > 0.72) { this.act.enter = 1; emit(3, this.x, H * 0.045, 18, { spread: this.w * 0.2 }); ring(this.x, H * 0.045, this.w * 0.7, 1.1, { a: 0.6, flat: 0.25 }); }
      }
      if (this.act.t >= this.act.d) { if (this.act.k === 'jump' || this.act.k === 'spout') idleBusy = false; this.act = null; }
    }
    this.boost += (1 - this.boost) * Math.min(1, dt * 1.6);
    if (this.dying) { this.dying += dt; this.alpha = clamp(1 - this.dying / 2, 0, 1); this.y -= dt * 38; this.x += Math.sin(time * 2 + this.ph) * 10 * dt; return; }
    this.panic = Math.max(0, this.panic - dt); this.gulp = Math.max(0, this.gulp - dt);
    if (this.floor()) return this.updateFloor(dt);

    // quiet species moments: whale spouts, dolphin leaps (one at a time on the whole screen)
    if (!idleBusy && !this.act && !this.demo && time > this.nextIdle && time - this.born > 6 && !births.length && T.parts >= 220) {
      this.nextIdle = time + rand(25, 45);
      if (this.bid === 'whale') { idleBusy = true; this.act = { k: 'spout', t: 0, d: 9, y0: this.y }; }
      else if (this.bid === 'dolphin') { idleBusy = true; this.act = { k: 'jump', t: 0, d: 1.6, y0: this.y, big: 1 }; this.tagT = 0; if (window.ReefSound) ReefSound.play('squeak', 'dolphin'); }
    }
    var food = null, best = W * 0.38;
    if (this.m !== 'jelly' && foods.length) for (var i = 0; i < foods.length; i++) { var f = foods[i], d = Math.hypot(f.x - this.x, f.y - this.y); if (d < best) { best = d; food = f; } }
    if (food) {
      this.tx = food.x; this.ty = food.y; this.next = time + 1;
      if (best < Math.max(this.w, this.h) * 0.5 + 26) { food.dead = 1; this.gulp = 0.3; emit(1, this.x + this.dir * this.w * 0.4, this.y, 3, { spread: 8 }); emit(2, this.x + this.dir * this.w * 0.4, this.y, 2); if (window.ReefSound) ReefSound.play('nom'); if (Math.random() < 0.4) emit(4, this.x, this.y - this.h * 0.4, 1); }
    } else if (this.greet && time < this.greet.until) { this.tx = this.greet.x; this.ty = this.greet.y; this.next = time + 1; }
    else if (time > this.next || Math.hypot(this.tx - this.x, this.ty - this.y) < 50) this.pickTarget();

    var dx = this.tx - this.x, dy = this.ty - this.y, dl = Math.hypot(dx, dy) || 1, nightSlow = sky.goodNight ? lerp(1, 0.5, sky.n) : 1;
    var sp = this.speed * this.boost * nightSlow * (this.panic > 0 ? 2.2 : food ? 1.6 : 1), dvx = dx / dl * sp, dvy = dy / dl * sp * 0.6;
    if (this.m === 'octo' || this.m === 'jelly') { var pulse = Math.max(0, Math.sin(this.ph)); sp *= 0.25 + 1.3 * pulse * pulse; dvx = dx / dl * sp; dvy = dy / dl * sp * (this.m === 'jelly' ? 1 : 0.8); if (this.m === 'jelly') dvy += 14; }
    if (this.m === 'horse') { dvx *= 0.6; dvy *= 0.5; dvy += Math.sin(time * 0.9 + this.ph) * 10; }
    var k = Math.min(1, dt * (this.panic > 0 ? 4 : 2.2)); this.vx += (dvx - this.vx) * k; this.vy += (dvy - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    var b = bounds();
    if (this.x < b.x0 - 40 || this.x > b.x1 + 40) { this.x = clamp(this.x, b.x0 - 40, b.x1 + 40); this.pickTarget(); }
    this.y = clamp(this.y, food ? 12 : b.y0 - 30, b.y1 + 30);
    if (Math.abs(this.vx) > 5) this.dir = this.vx > 0 ? 1 : -1;
    this.face += (this.dir - this.face) * Math.min(1, dt * 5);
    var freq = this.m === 'swim' ? 3 + Math.hypot(this.vx, this.vy) * 0.018 : this.m === 'horse' ? 4.5 : 2.4;
    if (this.bid === 'turtle' || this.bid === 'whale') freq *= 0.55;
    this.ph += dt * freq * (this.panic > 0 ? 1.6 : 1);
    if (this.m === 'swim' && Math.hypot(this.vx, this.vy) > this.speed * 1.5 && Math.random() < dt * 5) emit(1, this.x - this.dir * this.w * 0.4, this.y, 1, { r: rand(1.5, 3.5) });
  };
  Fish.prototype.updateFloor = function (dt) {
    var b = bounds(); this.ty = this.floorY();
    if (this.pause > 0) { this.pause -= dt; this.vx *= 0.9; }
    else { var dx = this.tx - this.x; if (Math.abs(dx) < 8 || time > this.next) { this.pause = rand(1.5, 5); this.pickTarget(); } var sp = (this.m === 'crab' ? 0.05 : 0.008) * W * (this.panic > 0 ? 3 : 1); this.vx += (Math.sign(dx) * sp - this.vx) * Math.min(1, dt * 3); }
    this.x = clamp(this.x + this.vx * dt, b.x0, b.x1); this.y += (this.ty - this.y) * Math.min(1, dt * 4);
    this.ph += dt * (Math.abs(this.vx) > 6 ? 14 : 1.2); if (this.m === 'star') this.spin = (this.spin || 0) + this.vx * dt * 0.004;
  };

  var haloBudget = 0;
  Fish.prototype.draw = function (ctx) {
    var a = this.alpha; if (this.hidden || a <= 0) return;
    var S = this.sprite, w = this.w, h = this.h, m = this.m, gulp = this.gulp > 0 ? 1 + 0.12 * Math.sin(this.gulp / 0.3 * Math.PI) : 1;
    var act = this.act, offY = 0, rot = 0, sy = 1, sc = 1;
    if (act) {
      var u = act.t / act.d;
      if (act.k === 'roll') sy = Math.cos(u * 6.283); else if (act.k === 'spin') rot = u * 6.283;
      else if (act.k === 'hop') offY = -Math.abs(Math.sin(u * 6.283)) * unit * 0.22; else if (act.k === 'pulse') sc = 1 + 0.22 * Math.sin(u * 18.85) * (1 - u);
      else if (act.k === 'jump') offY = -(act.y0 - H * 0.2) * Math.sin(Math.PI * u); else if (act.k === 'spout') offY = -(act.y0 - H * 0.19) * bell(u);
    }
    if (this.popT && time - this.popT < 0.5) sc *= 0.35 + 0.65 * easeOutBack((time - this.popT) / 0.5);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, this.y + offY);
    if (sky.n > 0.06 && this.halo && haloBudget > 0) {                 // night: a soft coloured glow around the child's drawing
      haloBudget--; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * sky.n * (0.34 + 0.14 * Math.sin(time * 1.3 + this.ph)) * (m === 'jelly' || m === 'octo' ? 1.5 : 1);
      var hs = 1.4; ctx.drawImage(this.halo, -w * hs / 2, -h * hs / 2, w * hs, h * hs); ctx.restore();
    }
    ctx.rotate(rot); ctx.scale(sc, sc * sy);
    var nMax = T.strips, far = this.z < 0.34;
    if (m === 'swim') {
      var pitch = clamp(Math.atan2(this.vy, Math.abs(this.vx) + 40) * 0.8, -0.45, 0.45) * Math.sign(this.face || 1);
      ctx.rotate(pitch); ctx.scale(this.face * gulp, gulp);
      var wave = { turtle: 0.025, shark: 0.05, dolphin: 0.06, whale: 0.035, manta: 0.03 }[this.bid] || 0.075;
      strips(ctx, S, w, h, this.ph, wave * w, 'h', nMax, far);
    } else if (m === 'horse') { ctx.rotate(Math.sin(time * 1.1 + this.ph) * 0.06); ctx.scale(this.face * gulp, gulp); strips(ctx, S, w, h, this.ph, w * 0.07, 'v', nMax, far); }
    else if (m === 'octo') { var p = Math.sin(this.ph), sq = 1 + p * 0.07; ctx.rotate(clamp(this.vx * 0.0016, -0.35, 0.35)); ctx.scale((1 / sq) * gulp, sq * gulp); strips(ctx, S, w, h, this.ph, w * 0.12, 'v', nMax, far); }
    else if (m === 'jelly') { var q = Math.sin(this.ph); ctx.rotate(clamp(this.vx * 0.0012, -0.25, 0.25)); ctx.scale(1 + q * 0.09, 1 - q * 0.07); strips(ctx, S, w, h, this.ph * 0.7, w * 0.1, 'v', nMax, far); }
    else if (m === 'crab') { var walk = Math.abs(this.vx) > 6; ctx.rotate(walk ? Math.sin(this.ph) * 0.035 : 0); ctx.translate(0, walk ? -Math.abs(Math.sin(this.ph)) * 3 : 0); ctx.drawImage(S, -w / 2, -h / 2, w, h); }
    else { ctx.rotate(this.spin || 0); var br = 1 + Math.sin(time * 0.8 + this.ph) * 0.015; ctx.scale(br, br); ctx.drawImage(S, -w / 2, -h / 2, w, h); }
    ctx.restore();
  };

  // slice the sprite into strips and offset them with a travelling wave (fewer slices for far / weak tiers)
  function strips(ctx, S, dw, dh, phase, amp, mode, nMax, far) {
    var sw = S.width, sh = S.height, n, i;
    // every strip is SHEARED so its edges meet the neighbours' edges exactly: the wave is a continuous,
    // piece-wise linear bend, so outlines stay connected instead of stepping apart
    if (mode === 'h') {
      n = clamp(Math.round(dw / 11), 8, nMax); if (far) n = Math.min(n, 9);
      var wf = function (u) { return Math.sin(phase - u * 3.4) * amp * Math.pow(1 - u, 1.5); };
      for (i = 0; i < n; i++) {
        var u0 = i / n, u1 = (i + 1) / n, y0 = wf(u0), y1 = wf(u1), x0 = -dw / 2 + u0 * dw, k = (y1 - y0) / (dw / n);
        ctx.save(); ctx.transform(1, k, 0, 1, 0, y0 - k * x0);
        ctx.drawImage(S, u0 * sw, 0, (u1 - u0) * sw + 1, sh, x0, -dh / 2, dw / n + 1, dh); ctx.restore();
      }
    } else {
      n = clamp(Math.round(dh / 10), 8, nMax); if (far) n = Math.min(n, 9);
      var wg = function (v) { return Math.sin(phase - v * 3.0) * amp * Math.pow(v, 1.7); };
      for (i = 0; i < n; i++) {
        var v0 = i / n, v1 = (i + 1) / n, d0 = wg(v0), d1 = wg(v1), yy = -dh / 2 + v0 * dh, k2 = (d1 - d0) / (dh / n);
        ctx.save(); ctx.transform(1, 0, k2, 1, d0 - k2 * yy, 0);
        ctx.drawImage(S, 0, v0 * sh, sw, (v1 - v0) * sh + 1, -dw / 2, yy, dw, dh / n + 1); ctx.restore();
      }
    }
  }

  // ── the birth ceremony ────────────────────────────────────────────────────
  //   a soft light column + a glowing bubble carries the little fish up; at 1.5 s it POPS (ring, sparkles, bubbles),
  //   the fish springs out and dashes away, and a name tag shows.  When several arrive together they are staggered.
  function startBirth(f) {
    var recent = births.filter(function (b) { return time - b.t0 < 5; }).length, delay = recent * 0.7;
    f.hidden = true; f.birth = true;
    var b = { f: f, t0: time + delay, x: rand(W * 0.3, W * 0.7), y0: sandFront - unit * 0.3, y1: H * 0.42, popped: false, quiet: recent >= 2, lastSpark: 0 };
    f.x = b.x; f.y = b.y1; births.push(b); return b;
  }
  function updateBirths(dt) {
    for (var i = births.length - 1; i >= 0; i--) {
      var b = births[i], f = b.f, u = time - b.t0; if (u < 0) continue;
      if (u < 1.5 && time - b.lastSpark > 0.12) { b.lastSpark = time; var k = easeOutCubic(u / 1.5), y = lerp(b.y0, b.y1, k); emit(2, b.x + rand(-20, 20), y + rand(-10, 30), 1, { speed: 0.4 }); }
      if (u >= 1.5 && !b.popped) {
        b.popped = true; var px = b.x, py = b.y1, r = Math.max(f.w, f.h);
        emit(1, px, py, 18, { spread: r * 0.35 }); emit(2, px, py, 14, { speed: 1.2 }); ring(px, py, r * 1.3, 0.9, { a: 0.7, lw: 4 }); ring(px, py, r * 0.8, 0.7, { a: 0.5 });
        flashT = 0.25; f.hidden = false; f.birth = false; f.x = px; f.y = py; f.popT = time; f.boost = 2.2; f.pickTarget();
        if (!b.quiet) f.tagT = 3.2;
        if (window.ReefSound) ReefSound.chime();
        var near = fishes.filter(function (o) { return o !== f && !o.floor() && !o.hidden && !o.birth && !o.dying; }).sort(function (a, c) { return Math.hypot(a.x - px, a.y - py) - Math.hypot(c.x - px, c.y - py); }).slice(0, 2);
        near.forEach(function (o) { o.greet = { x: px + rand(-60, 60), y: py + rand(-40, 40), until: time + 1.6 }; });
        births.splice(i, 1);
      }
    }
  }
  function drawBirths() {
    for (var i = 0; i < births.length; i++) {
      var b = births[i], f = b.f, u = time - b.t0; if (u < 0 || b.popped) continue;
      var k = easeOutCubic(u / 1.5), x = b.x + Math.sin(u * 5) * 10, y = lerp(b.y0, b.y1, k), r = Math.max(f.w, f.h) * 0.62 * Math.min(1, 0.45 + u * 1.2);
      var ca = Math.min(1, u / 0.5) * 0.28 * (1 - sky.n * 0.4);                                    // light column from above
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ca; ctx.drawImage(columnSprite, x - f.w * 0.45, 0, f.w * 0.9, y + r * 0.2); ctx.globalAlpha = 0.55 * Math.min(1, u / 0.4); ctx.drawImage(glowSprite, x - r * 1.5, y - r * 1.5, r * 3, r * 3); ctx.restore();
      var wob = 1 + 0.04 * Math.sin(u * 38), sp = 0.35 * wob;                                         // the little fish inside
      ctx.save(); ctx.translate(x, y); ctx.scale(sp * f.face, sp); ctx.drawImage(f.sprite, -f.w / 2, -f.h / 2, f.w, f.h); ctx.restore();
      var gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(0.8, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,.34)');
      ctx.fillStyle = gr; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    }
  }

  // ── soft separation: big drawings must not pile on top of each other ──────
  var sepTick = 0;
  function separate(dt) {
    if ((sepTick++ & 1)) return;
    var n = fishes.length, step = dt * 2;
    for (var i = 0; i < n; i++) { var a = fishes[i]; if (a.hidden || a.dying || a.floor()) continue;
      for (var j = i + 1; j < n; j++) { var b = fishes[j]; if (b.hidden || b.dying || b.floor()) continue; if (Math.abs(a.z - b.z) > 0.35) continue;
        var dx = b.x - a.x, dy = b.y - a.y, ax = (a.w + b.w) * 0.36, ay = (a.h + b.h) * 0.36, ox = 1 - Math.abs(dx) / ax, oy = 1 - Math.abs(dy) / ay;
        if (ox > 0 && oy > 0) {
          var push = Math.min(ox, oy) * 70, sg = dy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dy);
          a.vy -= push * sg * step; b.vy += push * sg * step; a.y -= push * sg * step * 0.35; b.y += push * sg * step * 0.35;
          var sx = dx === 0 ? 1 : Math.sign(dx), px = Math.min(ox, oy) * 40 * step; a.tx -= sx * px * 8; b.tx += sx * px * 8;
          if (Math.min(ox, oy) > 0.45 && Math.random() < 0.04) { a.pickTarget(); }
        } }
    }
  }

  // ── background schools: tiny, calm, low-contrast life behind the drawings ──
  var schools = [], schoolSprites = null;
  function buildSchools() {
    schools = []; if (!T.schools) return;
    schoolSprites = [0, 1].map(function (k) { var c = mk(26, 12), g = c.getContext('2d'); g.fillStyle = k ? 'rgba(94,200,232,.4)' : 'rgba(11,79,138,.5)'; g.beginPath(); g.moveTo(1, 6); g.quadraticCurveTo(10, -2, 20, 5); g.lineTo(26, 1); g.lineTo(26, 11); g.lineTo(20, 7); g.quadraticCurveTo(10, 14, 1, 6); g.fill(); return c; });
    for (var s = 0; s < 3; s++) { var sc = { cx: rand(0.2, 0.8) * W, cy: rand(0.25, 0.65) * H, tx: 0, ty: 0, next: 0, m: [] }; for (var i = 0; i < T.schools; i++) sc.m.push({ x: sc.cx + rand(-60, 60), y: sc.cy + rand(-30, 30), vx: rand(-20, 20), vy: rand(-8, 8), k: Math.random() < 0.5 ? 0 : 1 }); schools.push(sc); }
  }
  function updateSchools(dt) {
    for (var s = 0; s < schools.length; s++) {
      var sc = schools[s]; if (time > sc.next) { sc.tx = rand(0.1, 0.9) * W; sc.ty = rand(0.2, 0.7) * H; sc.next = time + rand(10, 25); }
      var cx = 0, cy = 0, n = sc.m.length; sc.m.forEach(function (m) { cx += m.x; cy += m.y; }); cx /= n; cy /= n;
      sc.cx += (sc.tx - sc.cx) * dt * 0.1; sc.cy += (sc.ty - sc.cy) * dt * 0.1;
      for (var i = 0; i < n; i++) { var m = sc.m[i], ax = (sc.cx - m.x) * 0.5 + (cx - m.x) * 0.4, ay = (sc.cy - m.y) * 0.5 + (cy - m.y) * 0.4;
        if ((i & 3) === 0) for (var j = i + 1; j < Math.min(n, i + 5); j++) { var o = sc.m[j], dx = m.x - o.x, dy = m.y - o.y, d2 = dx * dx + dy * dy; if (d2 < 196 && d2 > 0.1) { ax += dx / d2 * 120; ay += dy / d2 * 120; } }
        m.vx += ax * dt; m.vy += ay * dt; var sp = Math.hypot(m.vx, m.vy), mx = 85; if (sp > mx) { m.vx *= mx / sp; m.vy *= mx / sp; } m.x += m.vx * dt; m.y += m.vy * dt; }
    }
  }
  function drawSchools() {
    if (!schools.length) return; var a = 0.8 - sky.n * 0.3;
    ctx.globalAlpha = a;
    schools.forEach(function (sc) { sc.m.forEach(function (m) { var fl = m.vx < 0 ? -1 : 1; ctx.save(); ctx.translate(m.x, m.y); ctx.scale(fl, 1); ctx.rotate(clamp(m.vy / 90, -0.5, 0.5) * fl); ctx.drawImage(schoolSprites[m.k], -13, -6, 26, 12); ctx.restore(); }); });
    ctx.globalAlpha = 1;
  }

  // ── scene drawing ─────────────────────────────────────────────────────────
  function drawRays(t) {
    var n = T.rays, k = 1 - sky.n * 0.8; if (k < 0.05) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var sway = Math.sin(t * 0.18 + i * 1.7) * W * 0.03, x0 = (i + 0.3) / n * W * 1.12 - W * 0.04 + sway, ww = W * (0.07 + 0.04 * Math.sin(i * 2.1 + t * 0.3)) * (1 + sky.d * 0.2);
      ctx.globalAlpha = (0.075 + 0.04 * Math.sin(t * 0.5 + i * 2.3)) * k * (1 - sky.d * 0.4);
      ctx.save(); ctx.translate(x0, 0); ctx.transform(1, 0, -0.26, 1, 0, 0); ctx.drawImage(raySprite, -ww / 2, 0, ww, H * 0.98); ctx.restore();
    }
    ctx.restore();
  }
  function drawWeed(list, t, front) {
    for (var q = 0; q < list.length; q++) {
      var s = list[q], rootY = s.root, segs = 9, pts = [];
      for (var i = 0; i <= segs; i++) { var u = i / segs, sw = Math.sin(t * 0.9 + s.ph + u * 2.6) * (6 + 22 * u * u) * (front ? 1.25 : 0.9) + Math.sin(t * 0.37 + s.ph * 2) * 8 * u; pts.push([s.x + sw, rootY - u * s.h]); }
      ctx.fillStyle = s.g; ctx.beginPath();
      for (var l = 0; l <= segs; l++) { var wl = s.w * (1 - l / segs) * 0.5 + 1; if (l === 0) ctx.moveTo(pts[l][0] - wl, pts[l][1]); else ctx.lineTo(pts[l][0] - wl, pts[l][1]); }
      for (var r = segs; r >= 0; r--) { var wr = s.w * (1 - r / segs) * 0.5 + 1; ctx.lineTo(pts[r][0] + wr, pts[r][1]); }
      ctx.closePath(); ctx.fill();
    }
  }
  function drawAnemones(t) {
    for (var a = 0; a < anemones.length; a++) {
      var an = anemones[a], sc = an.s;
      ctx.fillStyle = 'rgba(70,30,80,.55)'; ctx.beginPath(); ctx.ellipse(an.x, an.y + 4 * sc, 34 * sc, 11 * sc, 0, 0, 6.3); ctx.fill();
      for (var i = 0; i < an.n; i++) {
        var u = i / (an.n - 1) - 0.5, bx = an.x + u * 56 * sc, len = (46 + 20 * Math.cos(u * 3)) * sc, sw = Math.sin(t * 1.3 + an.ph + i * 0.7) * 11 * sc, lean = u * 52 * sc;
        ctx.lineCap = 'round'; ctx.strokeStyle = an.c1; ctx.lineWidth = 9 * sc; ctx.beginPath(); ctx.moveTo(bx, an.y); ctx.quadraticCurveTo(bx + lean * 0.5 + sw * 0.5, an.y - len * 0.55, bx + lean + sw, an.y - len); ctx.stroke();
        ctx.strokeStyle = an.c2; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.moveTo(bx, an.y); ctx.quadraticCurveTo(bx + lean * 0.5 + sw * 0.5, an.y - len * 0.55, bx + lean + sw, an.y - len); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(bx + lean + sw, an.y - len, 3.2 * sc, 0, 6.3); ctx.fill();
      }
    }
  }
  function drawFog(a) { ctx.globalAlpha = a; ctx.fillStyle = fogFill; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  function drawShadows() {
    for (var i = 0; i < fishes.length; i++) {
      var f = fishes[i]; if (f.hidden || f.alpha <= 0.05) continue;
      if (f.floor() && !f.dying) { ctx.save(); ctx.globalAlpha = 0.28 * f.alpha; ctx.fillStyle = '#1b2a3a'; ctx.beginPath(); ctx.ellipse(f.x, f.y + f.h * 0.38, f.w * 0.42, f.h * 0.11, 0, 0, 6.3); ctx.fill(); ctx.restore(); }
      else if (!f.floor() && f.y > H * 0.5) { var k = clamp((f.y - H * 0.5) / (H * 0.25), 0, 1); ctx.save(); ctx.globalAlpha = 0.1 * k * f.alpha; ctx.fillStyle = '#10243a'; ctx.beginPath(); ctx.ellipse(f.x, lerp(sandBack, sandFront, f.z) + H * 0.05, f.w * 0.36, f.h * 0.08, 0, 0, 6.3); ctx.fill(); ctx.restore(); }
    }
  }
  function drawCaustics(t) {
    if (!caustic) return; var k = 1 - sky.n * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    function layer(scale, vx, vy, alpha, y0, y1) { ctx.save(); ctx.globalAlpha = alpha * k; ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip(); ctx.translate(t * vx, t * vy); ctx.scale(scale, scale); ctx.fillStyle = caustic; ctx.fillRect(-t * vx / scale - 10, -t * vy / scale - 10, W / scale + 300, H / scale + 300); ctx.restore(); }
    if (T.caus >= 2) { layer(2.1, 14, 6, 0.026, 0, H); }
    if (T.caus >= 3) layer(1.5, -10, 8, 0.022, 0, H);
    layer(1.7, 12, -5, T.caus === 1 ? 0.14 : 0.18, sandBack, H);        // strong on the sea floor
    layer(3.2, 8, 3, 0.07, 0, H * 0.09);                                 // a shimmering band just under the surface
    ctx.restore();
  }
  function drawSurface(t) {
    ctx.save(); var g = ctx.createLinearGradient(0, 0, 0, H * 0.07); g.addColorStop(0, 'rgba(255,255,255,' + (0.55 - sky.n * 0.25) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); for (var x = 0; x <= W; x += 16) ctx.lineTo(x, H * 0.012 + Math.sin(x * 0.012 + t * 1.3) * 4 + Math.sin(x * 0.031 - t * 0.9) * 2.5); ctx.lineTo(W, 0); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawTags() {
    for (var i = 0; i < fishes.length; i++) {
      var f = fishes[i]; if (f.tagT <= 0 || f.hidden || f.dying) continue;
      if (!f.tag) f.tag = makeTag(f.name || (f.c.he || ''));
      var th = unit * 0.2, tw = f.tag.width * th / f.tag.height, x = clamp(f.x - tw / 2, 8, W - tw - 8), y = Math.max(8, f.y - f.h * 0.62 - th - 8);
      var a = Math.min(1, f.tagT / 0.4) * Math.min(1, (time - (f.born)) > 0 ? 1 : 0); ctx.globalAlpha = a; ctx.drawImage(f.tag, x, y, tw, th); ctx.globalAlpha = 1;
    }
  }
  function drawFindRings() {
    for (var i = 0; i < fishes.length; i++) {
      var f = fishes[i]; if (f.find <= time || f.hidden) continue; var left = f.find - time, r = Math.max(f.w, f.h) * 0.7, pul = 0.5 + 0.5 * Math.sin(time * 12.5);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.45 * pul) * Math.min(1, left) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.8, 0, 0, 6.3); ctx.stroke();
      var by = f.y - r * 0.8 - 18 - Math.abs(Math.sin(time * 4)) * 8; ctx.fillStyle = 'rgba(255,226,122,' + Math.min(1, left) + ')'; ctx.beginPath(); ctx.moveTo(f.x, by + 14); ctx.lineTo(f.x - 11, by); ctx.lineTo(f.x + 11, by); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  var last = performance.now(), fpsN = 0, fpsT = last, frameN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    var dtMs = now - last, dt = Math.min(0.05, dtMs / 1000 || 0.016); last = now; time += dt; var t = time; frameN++;
    govern(dtMs);

    // ── update ──
    updateSky(dt);
    for (var i = 0; i < fishes.length; i++) fishes[i].update(dt);
    fishes = fishes.filter(function (f) { return !(f.dying > 2); });
    updateBirths(dt); separate(dt); updateSchools(dt);
    foods.forEach(function (f) { f.y += f.vy * dt; f.x += Math.sin(t * 2 + f.ph) * 10 * dt; });
    foods = foods.filter(function (f) { return !f.dead && f.y < sandFront; });
    ventClock += dt; if (ventClock > 0.4) { ventClock = 0; emit(1, vents[(Math.random() * 2) | 0] * W + rand(-6, 6), sandFront, 1, { r: rand(2, 8), vy: rand(50, 110) }); }
    if (Math.random() < dt * 1.2) emit(1, rand(0, W), H + 10, 1, { r: rand(1.5, 4), vy: rand(40, 80) });
    updateParticles(dt);
    for (i = 0; i < snow.length; i++) { var s = snow[i]; s.y += s.v * dt; s.x += Math.sin(t * 0.4 + s.ph) * 8 * dt; if (s.y > H) { s.y = -4; s.x = Math.random() * W; } }
    revealHero(); flashT = Math.max(0, flashT - dt);

    // ── draw ──
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(bgs.day, 0, 0, cv.width, cv.height);
    if (sky.d > 0.01) { ctx.globalAlpha = Math.min(1, sky.d); ctx.drawImage(bgs.dusk, 0, 0, cv.width, cv.height); }
    if (sky.n > 0.01) { ctx.globalAlpha = Math.min(1, sky.n); ctx.drawImage(bgs.night, 0, 0, cv.width, cv.height); }
    ctx.globalAlpha = 1; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (sky.n > 0.05) { ctx.globalAlpha = Math.min(1, sky.n) * 0.9; ctx.drawImage(moonSprite, W * 0.3 - W * 0.14, -W * 0.1, W * 0.28, W * 0.28); ctx.globalAlpha = 1; }

    drawRays(t); drawWeed(weedBack, t, false); drawSchools();
    var order = fishes.slice().sort(function (a, b) { return a.z - b.z; }), farL = [], midL = [], nearL = [], floorL = [];
    for (i = 0; i < order.length; i++) { var f = order[i]; if (f.floor()) floorL.push(f); else if (f.z < 0.34) farL.push(f); else if (f.z < 0.67) midL.push(f); else nearL.push(f); }
    haloBudget = T.halos;
    for (i = 0; i < farL.length; i++) farL[i].draw(ctx); drawFog(0.07);
    for (i = 0; i < midL.length; i++) midL[i].draw(ctx); drawFog(0.025);
    drawShadows();
    for (i = 0; i < floorL.length; i++) floorL[i].draw(ctx);
    for (i = 0; i < nearL.length; i++) nearL[i].draw(ctx);
    drawBirths(); drawTags(); drawFindRings();
    if (sky.n > 0.01) { ctx.fillStyle = 'rgba(8,20,60,' + (0.3 * sky.n) + ')'; ctx.fillRect(0, 0, W, H); }       // night dims the drawings gently (never black)

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fgReef, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawAnemones(t); drawWeed(weedFront, t, true);
    for (i = 0; i < foods.length; i++) { var fd = foods[i]; ctx.fillStyle = fd.c; ctx.beginPath(); ctx.arc(fd.x, fd.y, fd.r, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(fd.x - fd.r * 0.3, fd.y - fd.r * 0.3, fd.r * 0.35, 0, 6.3); ctx.fill(); }
    drawRings(dt); drawParticles();
    ctx.fillStyle = 'rgba(230,250,255,1)'; for (i = 0; i < snow.length; i++) { var sn = snow[i]; ctx.globalAlpha = sn.a * (1 + 0.4 * sky.n); ctx.beginPath(); ctx.arc(sn.x, sn.y, sn.r, 0, 6.3); ctx.fill(); } ctx.globalAlpha = 1;
    drawCaustics(t); drawSurface(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(vignette, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.12 * Math.min(1, flashT / 0.25)) + ')'; ctx.fillRect(0, 0, W, H); }

    if (SHOW_FPS) { fpsN++; if (now - fpsT > 1000) { var el = document.getElementById('fps'); el.style.display = 'block'; el.textContent = fpsN + ' fps · Q' + Q + ' · ' + fishes.length + ' creatures · ' + emaMs.toFixed(1) + ' ms'; fpsN = 0; fpsT = now; } }
  }
  var vents = [0.17, 0.83], ventClock = 0;

  // ── food ──────────────────────────────────────────────────────────────────
  function dropFood(x01, atY) {
    if (foods.length > 30) return;
    var n = 9, x = x01 * W, y0 = atY != null ? atY : 0;
    for (var i = 0; i < n; i++) foods.push({ x: x + rand(-60, 60), y: y0 + rand(-4, 24) - i * 5, vy: rand(60, 90), ph: rand(0, 6.3), c: Math.random() < 0.5 ? '#ffb347' : '#ff7a59', r: rand(3, 5.2) });
  }

  // ── data / live updates ───────────────────────────────────────────────────
  function loadImage(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function countReal() { return Object.keys(byId).length; }
  var arrivals = [];
  function addFish(rec, fresh) {
    if (byId[rec.id]) return Promise.resolve();
    byId[rec.id] = true;
    return loadImage('/fish/' + rec.id + '.png').then(function (img) {
      if (!byId[rec.id]) return;                                  // removed while its picture was loading
      var cr = C.byId(rec.kind), f = new Fish(rec, prepSprite(straighten(img, rec.kind), cr && cr.faceLeft));
      fishes.push(f); realCount = countReal();
      if (fresh) {
        startBirth(f); arrivals = arrivals.filter(function (t0) { return time - t0 < 5; }); arrivals.push(time);
        if (arrivals.length >= 3) toast(arrivals.length + ' חיות חדשות הגיעו!'); else toast((f.name || f.c.he || 'חיה') + ' הגיעה!');
      }
      refreshDemo();
    }).catch(function () { delete byId[rec.id]; });
  }
  function removeFish(id) {
    if (!byId[id]) return; delete byId[id]; realCount = countReal();
    fishes.forEach(function (f) { if (f.id === id && !f.dying) { if (f.act && (f.act.k === 'jump' || f.act.k === 'spout')) idleBusy = false; f.act = null; f.dying = 0.001; f.hidden = false; births = births.filter(function (b) { return b.f !== f; }); } });
    refreshDemo();
  }
  var demoMade = false;
  var listLoaded = false;
  function refreshDemo() {
    if (!listLoaded) return;
    if (NO_DEMO) { revealHero(); return; }
    var keep = 0; fishes.forEach(function (f) { if (!f.demo || f.dying) return; keep++; if (realCount >= 4 || (realCount >= 1 && keep > 4)) f.dying = 0.001; });
    if (realCount < 4 && !demoMade) { demoMade = true; makeDemos(); }
    if (realCount < 4 && fishes.filter(function (f) { return f.demo && !f.dying; }).length === 0) makeDemos();
  }
  var demoBusy = 0;
  function makeDemos() {
    if (demoBusy) return; demoBusy = 12;
    ['a_angel', 'a_shark', 'a_turtle', 'a_jelly', 'a_octopus', 'a_seahorse', 'a_crab', 'a_dolphin', 'a_manta', 'clown', 'tang', 'a_whale'].forEach(function (id, i) {
      var c = C.byId(id); if (!c) { demoBusy--; return; }
      loadArt(c).then(function (img) {
        demoBusy--; if (realCount >= 4) return;
        var sp = img ? demoSpriteArt(c, img) : demoSprite(c);
        var f = new Fish({ id: 'demo' + i + Math.random().toString(36).slice(2, 5), kind: id, demo: true, name: c.he }, sp); f.x = rand(W * 0.1, W * 0.9); fishes.push(f);
        if (realCount >= 1 && fishes.filter(function (q) { return q.demo && !q.dying; }).length > 4) f.dying = 0.001;
      });
    });
  }
  function reconcile(list) {
    var seen = {}; list.forEach(function (r) { seen[r.id] = 1; });
    Object.keys(byId).forEach(function (id) { if (!seen[id]) removeFish(id); });
    var chain = Promise.resolve(); list.forEach(function (r) { chain = chain.then(function () { return addFish(r, false); }); }); return chain;
  }
  function connect() {
    fetch('/api/fish').then(function (r) { return r.json(); }).then(reconcile).then(function () { listLoaded = true; refreshDemo(); }).catch(function () { listLoaded = true; refreshDemo(); });
    var es = new EventSource('/api/events');
    es.addEventListener('add', function (e) { addFish(JSON.parse(e.data), true).then(function () { dispatchEvent(new Event('reef:change')); }); });
    es.addEventListener('remove', function (e) { removeFish(JSON.parse(e.data).id); dispatchEvent(new Event('reef:change')); });
    es.addEventListener('rename', function (e) { var d = JSON.parse(e.data); fishes.forEach(function (f) { if (f.id === d.id) { f.name = d.name; f.tag = null; f.tagT = 2.5; } }); dispatchEvent(new Event('reef:change')); });
    es.addEventListener('feed', function (e) { dropFood(JSON.parse(e.data).x); });
    es.addEventListener('wave', function () { fishes.forEach(function (f) { f.panic = 1.1; f.pickTarget(); }); emit(1, W / 2, H * 0.6, 20, { spread: W * 0.3 }); ring(W / 2, H * 0.5, W * 0.4, 1.6, { a: 0.35, flat: 0.3 }); });
    es.addEventListener('poke', function (e) { var d = JSON.parse(e.data); pokeFish(d.id, d.action); });
    es.onopen = function () { fetch('/api/fish').then(function (r) { return r.json(); }).then(reconcile); };
  }
  function pokeFish(id, action) {
    fishes.forEach(function (f) {
      if (f.id !== id) return;
      if (action === 'find') { f.find = time + 3; f.tagT = 3; }
      else if (action === 'jump') { f.cool = 0; f.act = null; f.react('jump'); }
      else if (action === 'bubbles') { emit(1, f.x, f.y, 14, { spread: f.w * 0.3 }); f.tagT = 2; if (window.ReefSound) ReefSound.play('blub'); }
      else { f.cool = 0; f.act = null; f.react(); }
    });
  }

  // ── overlays ──────────────────────────────────────────────────────────────
  var hero = document.getElementById('hero'), badge = document.getElementById('badge'), toastEl = document.getElementById('toast');
  var heroGone = false, qrHidden = false;
  try { qrHidden = localStorage.getItem('reef.qrHidden') === '1'; } catch (e) {}
  var qrTab = document.getElementById('qrTab');
  document.getElementById('badgeX').innerHTML = Icons.svg('close', 16); qrTab.innerHTML = Icons.svg('phone', 16) + 'QR';
  function paintBadge() { var on = heroGone; badge.classList.toggle('show', on && !qrHidden); qrTab.classList.toggle('show', on && qrHidden); }
  function setQrHidden(v) { qrHidden = v; try { localStorage.setItem('reef.qrHidden', v ? '1' : '0'); } catch (e) {} paintBadge(); }
  document.getElementById('badgeX').onclick = function () { setQrHidden(true); }; qrTab.onclick = function () { setQrHidden(false); };
  function revealHero() {
    var want = realCount === 0 && !NO_HERO;
    if (want && heroGone) { heroGone = false; hero.classList.remove('gone'); paintBadge(); }
    if (!want && !heroGone) { heroGone = true; hero.classList.add('gone'); paintBadge(); }
  }
  function showBadge() { setQrHidden(!qrHidden); }
  var toastTimer = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3800); }
  function setupQR() {
    fetch('/api/info').then(function (r) { return r.json(); }).then(function (info) {
      var here = location.origin, isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname), base = isLocal && info.urls.length ? info.urls[0] : here, url = base + '/scan';
      var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); var svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      document.getElementById('qrBig').innerHTML = svg; document.getElementById('qrSmall').innerHTML = svg;
      var all = (isLocal && info.urls.length ? info.urls : [here]).map(function (u) { return u.replace('http://', '') + '/scan'; });
      document.getElementById('urlBig').innerHTML = all.join('<br>'); document.getElementById('urlSmall').innerHTML = all.join('<br>');
    }).catch(function () {});
  }

  // ── boot / resize ─────────────────────────────────────────────────────────
  function resize() {
    W = innerWidth; H = innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, T.dpr, Math.sqrt(3.7e6 / Math.max(1, W * H)) * 1.0);
    DPR = Math.max(DPR, Math.min(1, window.devicePixelRatio || 1) * 0.67);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    unit = Math.min(W * 0.17, H * 0.30); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingQuality = 'high';
    buildStatic(); fishes.forEach(function (f) { f.resize(); if (f.floor()) f.y = f.floorY(); });
  }
  addEventListener('resize', function () { resize(); buildSchools(); });
  resize(); buildCaustic(); initSnow(); buildSchools(); setupQR(); connect();
  requestAnimationFrame(frame);

  // ── interaction ───────────────────────────────────────────────────────────
  var lastTap = 0;
  function onTap(x, y) {
    if (time - lastTap < 0.04) return; lastTap = time;
    var hit = null, order = fishes.slice().sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < order.length; i++) { var f = order[i]; if (f.hidden || f.dying) continue; var ex = (x - f.x) / (f.w * 0.6), ey = (y - f.y) / (f.h * 0.6); if (ex * ex + ey * ey < 1.44) { hit = f; break; } }
    if (hit) { if (time >= hit.cool) hit.react(); else { hit.tagT = 1.8; emit(1, hit.x, hit.y, 3, { spread: hit.w * 0.2 }); if (window.ReefSound) ReefSound.play('blub'); } }
    else {
      ring(x, y, 70, 1.1, { a: 0.7, flat: 0.55 }); ring(x, y, 110, 1.4, { a: 0.4, flat: 0.55 }); emit(1, x, y, 3, { spread: 10 });
      dropFood(x / W, Math.max(0, Math.min(y, H * 0.5) - 40));
      fishes.forEach(function (f) { if (!f.floor() && !f.hidden && Math.hypot(f.x - x, f.y - y) < W * 0.3) { f.tx = clamp(x, W * 0.07, W * 0.93); f.ty = clamp(y, H * 0.13, H * 0.74); f.next = time + 1.5; } });   // curious, not scared
      if (window.ReefSound) ReefSound.play('blub');
    }
  }
  cv.addEventListener('pointerdown', function (e) { onTap(e.clientX, e.clientY); });
  addEventListener('keydown', function (e) {
    if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    if (e.key === 'q' || e.key === 'Q') showBadge();
    if (e.key === 'd' || e.key === 'D') dropFood(Math.random());
    if (e.key === 'n' || e.key === 'N') { sky.goodNight = !sky.goodNight; sky.manualNight = sky.goodNight; toast(sky.goodNight ? 'לילה טוב' : 'בוקר טוב'); }
  });
  var idle = setTimeout(function () { document.body.classList.add('idle'); }, 6000); addEventListener('mousemove', function () { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 3500); });
  addEventListener('keydown', function () { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 4000); });
  addEventListener('pointerdown', function () { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 4000); if (sky.goodNight && !sky.manualNight) sky.goodNight = false; }, true);

  // keep the screen awake while the aquarium is on (works on localhost / https)
  var wl = null; function wake() { try { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(function (l) { wl = l; }).catch(function () {}); } catch (e) {} }
  wake(); document.addEventListener('visibilitychange', wake);

  // ── public handle for the menu & tests ────────────────────────────────────
  window.ReefTV = {
    snapshot: function () {                                        // a dated picture of the aquarium
      var c = mk(cv.width, cv.height), g = c.getContext('2d'); g.drawImage(cv, 0, 0);
      var h = Math.round(c.height * 0.06), gr = g.createLinearGradient(0, c.height - h * 1.8, 0, c.height); gr.addColorStop(0, 'rgba(2,20,48,0)'); gr.addColorStop(1, 'rgba(2,20,48,.65)'); g.fillStyle = gr; g.fillRect(0, c.height - h * 1.8, c.width, h * 1.8);
      g.font = '500 ' + Math.round(h * 0.5) + 'px Rubik, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)'; g.textBaseline = 'middle';
      var d = new Date(), txt = 'ים של ציורים · ' + d.toLocaleDateString('he-IL'); g.direction = 'rtl'; g.textAlign = 'right'; g.fillText(txt, c.width - h * 0.6, c.height - h * 0.7);
      flashT = 0.4; if (window.ReefSound) ReefSound.play('shutter'); return c;
    },
    setSky: function (m) { sky.mode = m; sky.goodNight = false; }, goodNight: function (on) { sky.goodNight = !!on; sky.manualNight = !!on; },
    sky: function () { return { mode: sky.mode, goodNight: sky.goodNight, n: sky.n, d: sky.d }; },
    quality: function () { return Q; }, setQuality: function (q) { Qforced = true; setQ(q); },
    poke: pokeFish, dropFood: dropFood, toast: toast,
    fishList: function () { return fishes.filter(function (f) { return !f.demo; }).map(function (f) { return { id: f.id, name: f.name }; }); }
  };
  window.__reef = { fishes: function () { return fishes; }, dropFood: dropFood, burst: burst, time: function () { return time; }, births: function () { return births; }, sky: sky, emit: emit };
})();
