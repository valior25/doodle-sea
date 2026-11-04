// QA: makes scribbled "kid colouring" photos of every sheet (lots of overshoot), saved to OUT dir
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
      // ── scribbles: marker colours, inside AND well outside the outline, never on the four corner markers ──
      const pl = Creatures.place(c), b = c.bbox, px = (x, y) => [ppm * (pl.tx + pl.s * x), ppm * (pl.ty + pl.s * y)];
      const pals = [['#e8281e', '#ffd21e', '#2b6fe0'], ['#1a9a4a', '#f4a11a', '#8a2be2'], ['#e0368e', '#22b8c8', '#ffe14a'], ['#ff7a00', '#00a86b', '#d6001c', '#1f3cff']], pal = pals[(v + id.length) % pals.length];
      const over = [0.04, 0.12, 0.22][v % 3];                       // how far outside the animal the scribbles roam
      const x0 = b.x - b.w * over, x1 = b.x + b.w * (1 + over), y0 = b.y - b.h * over, y1 = b.y + b.h * (1 + over);
      g.save(); g.beginPath(); g.rect(ppm * 22, ppm * 22, 297 * ppm - ppm * 44, 210 * ppm - ppm * 44); g.clip();   // keep the marker corners clean
      g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 0.85; g.globalCompositeOperation = 'multiply';   // marker over the printed line: the black outline stays visible
      for (let k = 0; k < 16 + v * 4; k++) {
        g.strokeStyle = pal[Math.floor(r() * pal.length)]; g.lineWidth = ppm * (2.2 + r() * 3);
        g.beginPath(); let [x, y] = px(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)); g.moveTo(x, y);
        const type = r();
        for (let j = 0; j < 4; j++) {
          const [qx, qy] = px(Math.max(x0, Math.min(x1, (type < .5 ? x0 + r() * (x1 - x0) : (x0 + x1) / 2 + (r() - .5) * (x1 - x0) * .9))), y0 + r() * (y1 - y0));
          if (type < 0.5) g.lineTo(qx, qy); else g.quadraticCurveTo(x + (r() - .5) * 400, y + (r() - .5) * 400, qx, qy); x = qx; y = qy;
        } g.stroke();
      }
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
