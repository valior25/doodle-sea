// demo: makes neatly coloured "kid colouring" photos of every sheet (lots of overshoot), saved to OUT dir
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.argv[2] || '/tmp/qa', PORT = process.argv[3] || '8231', N = +(process.argv[4] || 3);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:' + PORT + '/print'); await p.addScriptTag({ path: 'public/capture.js' });
  const ids = await p.evaluate(() => Creatures.list.filter(c => !c.hidden).map(c => c.id));
  for (const id of ids) for (let v = 0; v < N; v++) {
    const url = await p.evaluate(async ([id, v]) => {
      function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
      const c = Creatures.byId(id), ppm = 6, r = rng(1000 + v * 77 + id.length * 13 + id.charCodeAt(id.length - 1));
      let artHref; if (c.art) { const bl = await (await fetch(c.art.src)).blob(); artHref = await new Promise(rs => { const f = new FileReader(); f.onload = () => rs(f.result); f.readAsDataURL(bl); }); }
      const svg = SheetArt.svg(c, { artHref });
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('width="297mm" height="210mm"', 'width="' + 297 * ppm + '" height="' + 210 * ppm + '"')); await img.decode();
      const cv = document.createElement('canvas'); cv.width = 297 * ppm; cv.height = 210 * ppm; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
      // ── neat kid colouring: pastel gradient fill inside the animal (+ a little marker overshoot) ──
      const pl = Creatures.place(c), P = new Path2D(c.d), bb = c.bbox;
      const pals = [['#ff8a5c', '#ffd34e', '#ff5c8a'], ['#3fb6e8', '#7be0b0', '#6a7bff'], ['#ff6fa8', '#c47bff', '#ffd1e8'], ['#ffb02e', '#ff6a3d', '#ffe27a'], ['#46c28e', '#1fa3c8', '#b6e86b'], ['#9b7bff', '#5cc8ff', '#ff9bd0']];
      const pal = pals[(v * 5 + id.length * 3 + id.charCodeAt(2)) % pals.length];
      g.save(); g.setTransform(ppm * pl.s, 0, 0, ppm * pl.s, ppm * pl.tx, ppm * pl.ty);
      g.globalCompositeOperation = 'multiply'; g.save(); g.clip(P);
      const grad = g.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.2, bb.y + bb.h); grad.addColorStop(0, pal[0]); grad.addColorStop(0.55, pal[1]); grad.addColorStop(1, pal[2]);
      g.globalAlpha = 0.9; g.fillStyle = grad; g.fillRect(bb.x - 20, bb.y - 20, bb.w + 40, bb.h + 40);
      g.globalAlpha = 0.35; g.lineCap = 'round'; for (let k = 0; k < 24; k++) { g.strokeStyle = pal[k % 3]; g.lineWidth = bb.w * 0.018; const x = bb.x + r() * bb.w, y = bb.y + r() * bb.h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + bb.w * 0.07, y + bb.h * 0.06); g.stroke(); }
      g.restore();
      g.globalAlpha = 0.8; g.strokeStyle = pal[(v + 1) % 3]; g.lineCap = 'round'; g.lineWidth = bb.w * 0.02;   // a few strokes that wander over the line
      for (let k = 0; k < 4; k++) { const x = bb.x + r() * bb.w, y = bb.y + r() * bb.h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bb.w * 0.1, y - bb.h * 0.12, x + bb.w * 0.17, y + bb.h * 0.03); g.stroke(); }
      g.restore();
      // ── photo: rotation + perspective + table + light + noise ──
      const W = 1900, H = 1425, out = document.createElement('canvas'); out.width = W; out.height = H; const gg = out.getContext('2d');
      const sw = cv.width, sh = cv.height, sd = g.getImageData(0, 0, sw, sh).data;
      const th = (r() * 8 - 4) * Math.PI / 180 * (v % 2 ? 1 : 0.4), sc = (W * 0.86) / sw, cx = sw / 2, cy = sh / 2, tilt = (r() - .5) * 0.00016, tiltY = (r() - .5) * 0.00012;
      const quad = [[0, 0], [sw, 0], [sw, sh], [0, sh]].map(([x, y]) => { const dx = (x - cx) * sc, dy = (y - cy) * sc; const X = dx * Math.cos(th) - dy * Math.sin(th), Y = dx * Math.sin(th) + dy * Math.cos(th); const k = 1 + tilt * X + tiltY * Y; return [W / 2 + X / k, H / 2 + Y / k]; });
      const Hi = Capture._homography(quad, [[0, 0], [sw, 0], [sw, sh], [0, sh]]);
      const im = gg.createImageData(W, H), d = im.data; const light = 0.1 + r() * 0.25, shadow = v % 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dd = Hi[6] * x + Hi[7] * y + 1, u = (Hi[0] * x + Hi[1] * y + Hi[2]) / dd, vv = (Hi[3] * x + Hi[4] * y + Hi[5]) / dd, i = (y * W + x) * 4;
        let R = 92, G = 70, B = 52;
        if (u >= 0 && vv >= 0 && u < sw - 1 && vv < sh - 1) { const x0_ = u | 0, y0_ = vv | 0, fx = u - x0_, fy = vv - y0_, a = (y0_ * sw + x0_) * 4, bb = a + 4, c2 = a + sw * 4, e = c2 + 4;
          R = (sd[a] * (1 - fx) + sd[bb] * fx) * (1 - fy) + (sd[c2] * (1 - fx) + sd[e] * fx) * fy; G = (sd[a + 1] * (1 - fx) + sd[bb + 1] * fx) * (1 - fy) + (sd[c2 + 1] * (1 - fx) + sd[e + 1] * fx) * fy; B = (sd[a + 2] * (1 - fx) + sd[bb + 2] * fx) * (1 - fy) + (sd[c2 + 2] * (1 - fx) + sd[e + 2] * fx) * fy; }
        const L = 1 - light * (x / W) - (shadow ? 0.16 * Math.exp(-Math.pow((y - H * 0.7 - x * 0.2) / 140, 2)) : 0), n = (r() - .5) * 14;
        d[i] = Math.max(0, Math.min(255, R * L + n)); d[i + 1] = Math.max(0, Math.min(255, G * L * 0.96 + n)); d[i + 2] = Math.max(0, Math.min(255, B * L * 0.88 + n)); d[i + 3] = 255;
      }
      gg.putImageData(im, 0, 0); return out.toDataURL('image/jpeg', 0.82);
    }, [id, v]);
    fs.writeFileSync(`${OUT}/${id}__${v}.jpg`, Buffer.from(url.split(',')[1], 'base64')); process.stdout.write('.');
  }
  console.log('\nmade', ids.length * N, 'images in', OUT); await b.close();
})();
