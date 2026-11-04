// Simulates phone photos of coloured sheets and runs the real capture pipeline on them.
const { chromium } = require('playwright');
const fs = require('fs');
const cases = JSON.parse(process.argv[2] || '[{"id":"shark","rot":0,"tilt":0.0004}]');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('console', m => console.log('console:', m.text()));
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8000/print');
  await p.addScriptTag({ path: 'public/capture.js' });
  const results = await p.evaluate(async (cases) => {
    function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
    async function sheetCanvas(c, ppm) {
      let artHref; if (c.art) { const b = await (await fetch(c.art.src)).blob(); artHref = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
      const svg = SheetArt.svg(c, { artHref });
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('width="297mm" height="210mm"', 'width="' + 297 * ppm + '" height="' + 210 * ppm + '"'));
      await img.decode();
      const cv = document.createElement('canvas'); cv.width = 297 * ppm; cv.height = 210 * ppm;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); return cv;
    }
    function colorIn(cv, c, ppm, seed) {
      const r = rng(seed), g = cv.getContext('2d'), pl = Creatures.place(c);
      g.save(); g.setTransform(ppm * pl.s, 0, 0, ppm * pl.s, ppm * pl.tx, ppm * pl.ty);
      const P = new Path2D(c.d);
      const pals = [['#e8281e', '#ffd21e', '#2b6fe0'], ['#1a9a4a', '#f4a11a', '#8a2be2'], ['#e0368e', '#22b8c8', '#ffe14a']];
      const pal = pals[Math.floor(r() * pals.length)];
      // marker-like streaks, clipped a little beyond the outline (kids overshoot)
      const b = c.bbox;
      g.save(); g.lineWidth = 6.5 / pl.s * (ppm / 8) * 1.0; g.stroke; g.clip(P);
      g.lineCap = 'round'; g.globalAlpha = 0.82;
      for (let i = 0; i < 160; i++) {
        g.strokeStyle = pal[Math.floor(r() * 3)];
        g.lineWidth = (3 + r() * 3) * 8 / ppm / pl.s * ppm / 8 * 2.2;
        const x = b.x + r() * b.w, y = b.y + r() * b.h, a = r() * 0.8 - 0.4 + Math.PI / 2, l = 20 + r() * 50;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.restore();
      // overshoot outside the line
      if (!window.__clean) { g.globalAlpha = 0.5; g.strokeStyle = pal[0]; g.lineWidth = 7 / pl.s; g.stroke(P); }
      g.restore();
    }
    function photo(sheet, o) {
      const W = 2200, H = 1650, out = document.createElement('canvas'); out.width = W; out.height = H;
      const g = out.getContext('2d'), sw = sheet.width, sh = sheet.height;
      const sd = sheet.getContext('2d').getImageData(0, 0, sw, sh).data;
      // forward map: sheet px → photo px as rotation + perspective
      const th = (o.rot || 0) * Math.PI / 180, cx = sw / 2, cy = sh / 2, sc = (W * 0.78) / Math.max(sw, sh) * (o.rot % 180 ? 1.0 : 1.0) * (Math.abs(Math.cos(th)) > 0.7 ? 0.9 : 0.62);
      const quad = [[0, 0], [sw, 0], [sw, sh], [0, sh]].map(([x, y]) => {
        const dx = (x - cx) * sc, dy = (y - cy) * sc;
        let X = dx * Math.cos(th) - dy * Math.sin(th), Y = dx * Math.sin(th) + dy * Math.cos(th);
        const k = 1 + (o.tilt || 0) * X * 1000 / 1000 * 1.0 + (o.tiltY || 0) * Y;  // perspective: size varies along X / Y
        return [W / 2 + X / k + (o.dx || 0), H / 2 + Y / k + (o.dy || 0)];
      });
      const Hf = Capture._homography([[0, 0], [sw, 0], [sw, sh], [0, sh]], quad);
      // inverse via swapping roles
      const Hi = Capture._homography(quad, [[0, 0], [sw, 0], [sw, sh], [0, sh]]);
      const img = g.createImageData(W, H), d = img.data, r = rng(5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dd = Hi[6] * x + Hi[7] * y + 1, u = (Hi[0] * x + Hi[1] * y + Hi[2]) / dd, v = (Hi[3] * x + Hi[4] * y + Hi[5]) / dd, i = (y * W + x) * 4;
        let R = 92, G = 70, B = 52;                           // wooden table
        if (u >= 0 && v >= 0 && u < sw - 1 && v < sh - 1) {
          const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, a = (y0 * sw + x0) * 4, bb = a + 4, c2 = a + sw * 4, e = c2 + 4;
          R = (sd[a] * (1 - fx) + sd[bb] * fx) * (1 - fy) + (sd[c2] * (1 - fx) + sd[e] * fx) * fy;
          G = (sd[a + 1] * (1 - fx) + sd[bb + 1] * fx) * (1 - fy) + (sd[c2 + 1] * (1 - fx) + sd[e + 1] * fx) * fy;
          B = (sd[a + 2] * (1 - fx) + sd[bb + 2] * fx) * (1 - fy) + (sd[c2 + 2] * (1 - fx) + sd[e + 2] * fx) * fy;
        }
        // lighting: gradient + warm cast + a soft shadow band + noise
        let L = 1 - (o.light || 0.3) * (x / W) - 0.18 * Math.exp(-Math.pow((y - H * 0.7 - x * 0.2) / 140, 2)) * (o.shadow ? 1 : 0);
        const n = (r() - 0.5) * 14;
        d[i] = Math.max(0, Math.min(255, R * L * 1.0 + n)); d[i + 1] = Math.max(0, Math.min(255, G * L * 0.96 + n)); d[i + 2] = Math.max(0, Math.min(255, B * L * 0.88 + n)); d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const o2 = document.createElement('canvas'); o2.width = W; o2.height = H; const g2 = o2.getContext('2d'); g2.filter = 'blur(1.2px)'; g2.drawImage(out, 0, 0);
      return o2;
    }
    const res = [], ppm = 8; window.__clean = true;
    for (const cs of cases) {
      const c = Creatures.byId(cs.id), sheet = await sheetCanvas(c, ppm); colorIn(sheet, c, ppm, 11);
      const ph = photo(sheet, cs), t0 = performance.now();
      try {
        const r = await Capture.process(ph);
        res.push({ id: cs.id, ok: r.id === cs.id, got: r.id, ms: Math.round(performance.now() - t0), w: r.canvas.width, h: r.canvas.height, markers: r.markers, boost: r.autoBoost, png: r.canvas.toDataURL('image/png'), photo: ph.toDataURL('image/jpeg', 0.7) });
      } catch (e) { res.push({ id: cs.id, ok: false, err: e.message, ms: Math.round(performance.now() - t0), photo: ph.toDataURL('image/jpeg', 0.7) }); }
    }
    return res;
  }, cases);
  res = results; let i = 0;
  for (const r of results) {
    console.log(r.id, r.ok ? 'OK' : 'FAIL', r.err || '', r.ms + 'ms', r.w ? r.w + 'x' + r.h : '', 'markers', r.markers, 'boost', r.boost);
    if (r.png) fs.writeFileSync('/tmp/cut_' + i + '.png', Buffer.from(r.png.split(',')[1], 'base64'));
    fs.writeFileSync('/tmp/photo_' + i + '.jpg', Buffer.from(r.photo.split(',')[1], 'base64')); i++;
  }
  await b.close();
})();
