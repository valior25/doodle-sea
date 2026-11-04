/* capture.js — from a phone photo of a coloured sheet to a transparent cut-out.

   photo ─▶ find the 4 corner markers ─▶ identify the creature ─▶ undo perspective
         ─▶ flatten lighting / white-balance on the paper ─▶ cut along the silhouette
         ─▶ replace the printed outline with the child's own colours ─▶ RGBA sprite

   Pure JS, runs in the phone's browser. API:
     Capture.process(imageSource) → Promise<{ id, creature, canvas, render(boost), markers }>
   Rejects with Error(message-in-Hebrew) when the sheet can't be read.            */
(function (root) {
  'use strict';
  var C = root.Creatures, S = C.SHEET;

  var WORK_MAX = 2400;      // longest edge of the working copy of the photo
  var OUT_MAX = 900;        // longest edge of the final sprite
  var OUTLINE_MM = 1.3;     // printed outline width (must match sheet.js)
  var TRIM_MM = 0.95;       // extra trim each side so no dark rim survives

  // ── linear algebra ───────────────────────────────────────────────────────
  function solve(A, b) {                         // gaussian elimination, n×n
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var t = M[c]; M[c] = M[piv]; M[piv] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }
  function homography(src, dst) {                // 4 point pairs → 3×3 (flat, h22=1)
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], X = dst[i][0], Y = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    var h = solve(A, b);
    return h ? h.concat([1]) : null;
  }
  function apply(h, x, y) {
    var d = h[6] * x + h[7] * y + h[8];
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  }

  // ── hull / quad ──────────────────────────────────────────────────────────
  function hull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 0) hi.pop(); hi.push(pts[i]); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  function bestQuad(h) {                          // max-area quadrilateral on the hull
    if (h.length < 4) return null;
    if (h.length > 48) { var step = h.length / 48, g = []; for (var i = 0; i < 48; i++) g.push(h[Math.floor(i * step)]); h = g; }
    var best = null, bestA = 0;
    for (var a = 0; a < h.length; a++) for (var b = a + 1; b < h.length; b++) {
      var dx = h[b][0] - h[a][0], dy = h[b][1] - h[a][1], cM = 0, cP = null, dM = 0, dP = null;
      for (var k = 0; k < h.length; k++) {
        var c = (h[k][0] - h[a][0]) * dy - (h[k][1] - h[a][1]) * dx;
        if (c > cM) { cM = c; cP = h[k]; } if (-c > dM) { dM = -c; dP = h[k]; }
      }
      if (cP && dP && (cM + dM) > bestA) { bestA = cM + dM; best = [h[a], cP, h[b], dP]; }
    }
    return best;
  }

  // ── step 1: markers ──────────────────────────────────────────────────────
  function grayOf(data, n) {
    var g = new Float32Array(n);
    for (var i = 0; i < n; i++) g[i] = data[i * 4] * 0.30 + data[i * 4 + 1] * 0.55 + data[i * 4 + 2] * 0.15;
    return g;
  }
  function integral(gray, W, H) {
    var I = new Float64Array((W + 1) * (H + 1));
    for (var y = 0; y < H; y++) {
      var row = 0;
      for (var x = 0; x < W; x++) { row += gray[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
    }
    return I;
  }

  function findMarkers(gray, I, W, H, ratio) {
    var win = Math.max(25, Math.round(Math.max(W, H) / 14)) | 1, hw = win >> 1;
    var bin = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var y0 = Math.max(0, y - hw), y1 = Math.min(H, y + hw + 1);
      for (var x = 0; x < W; x++) {
        var x0 = Math.max(0, x - hw), x1 = Math.min(W, x + hw + 1);
        var sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        var mean = sum / ((x1 - x0) * (y1 - y0));
        bin[y * W + x] = gray[y * W + x] < mean * ratio ? 1 : 0;
      }
    }
    var seen = new Uint8Array(W * H), q = new Int32Array(W * H), found = [];
    var maxArea = W * H / 25, minArea = Math.max(120, (Math.min(W, H) / 60) * (Math.min(W, H) / 60));
    for (var s = 0; s < W * H; s++) {
      if (!bin[s] || seen[s]) continue;
      var head = 0, tail = 0, x2, y2, minX = W, maxX = 0, minY = H, maxY = 0;
      q[tail++] = s; seen[s] = 1;
      var boundary = [], area = 0;
      while (head < tail) {
        var p = q[head++]; x2 = p % W; y2 = (p / W) | 0; area++;
        if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2; if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
        var edge = false;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x2 + dx, ny = y2 + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) { edge = true; continue; }
          var np = ny * W + nx;
          if (!bin[np]) edge = true; else if (!seen[np]) { seen[np] = 1; q[tail++] = np; }
        }
        if (edge) boundary.push([x2, y2]);
        if (area > maxArea) break;
      }
      if (area < minArea || area > maxArea) continue;
      var bw = maxX - minX + 1, bh = maxY - minY + 1, asp = bw / bh;
      if (asp < 0.35 || asp > 2.9 || area / (bw * bh) < 0.28) continue;
      var quad = bestQuad(hull(boundary));
      if (!quad) continue;
      var dec = decode(gray, W, H, quad);
      if (dec) found.push({ id: dec.id, corner: dec.corner, quad: dec.quad, center: [(quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4] });
    }
    return found;
  }

  function decode(gray, W, H, quad) {
    var Hq = homography([[0, 0], [6, 0], [6, 6], [0, 6]], quad);
    if (!Hq) return null;
    var offs = [[0.5, 0.5], [0.33, 0.33], [0.67, 0.33], [0.33, 0.67], [0.67, 0.67]], vals = [];
    for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++) {
      var sum = 0, n = 0;
      for (var o = 0; o < offs.length; o++) {
        var pt = apply(Hq, c + offs[o][0], r + offs[o][1]), xi = Math.round(pt[0]), yi = Math.round(pt[1]);
        if (xi >= 0 && yi >= 0 && xi < W && yi < H) { sum += gray[yi * W + xi]; n++; }
      }
      vals.push(n ? sum / n : 255);
    }
    var mn = 1e9, mx = -1e9; vals.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; });
    if (mx - mn < 40) return null;
    var mid = (mn + mx) / 2, cells = vals.map(function (v) { return v < mid ? 0 : 1; }), ring = 0;
    for (var rr = 0; rr < 6; rr++) for (var cc = 0; cc < 6; cc++) if ((rr === 0 || rr === 5 || cc === 0 || cc === 5) && cells[rr * 6 + cc] === 0) ring++;
    if (ring < 19) return null;                    // the 20 ring cells must be black
    var bits = [];
    for (var r2 = 1; r2 < 5; r2++) for (var c2 = 1; c2 < 5; c2++) bits.push(cells[r2 * 6 + c2]);
    var hit = C.lookup[bits.join('')];
    return hit ? { id: hit.id, corner: hit.corner, quad: quad } : null;
  }

  // ── step 2: warp the sheet ───────────────────────────────────────────────
  function sampleRGB(d, W, H, x, y, out) {         // bilinear
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) { out[0] = out[1] = out[2] = 255; return; }
    var x0 = x | 0, y0 = y | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
    var i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1) * 4, i01 = (y1 * W + x0) * 4, i11 = (y1 * W + x1) * 4;
    for (var c = 0; c < 3; c++) {
      out[c] = (d[i00 + c] * (1 - fx) + d[i10 + c] * fx) * (1 - fy) + (d[i01 + c] * (1 - fx) + d[i11 + c] * fx) * fy;
    }
  }

  function warpRegion(data, W, H, Hm, mmX0, mmY0, mmW, mmH, ppm) {
    var w = Math.round(mmW * ppm), h = Math.round(mmH * ppm), out = new Float32Array(w * h * 3), px = [0, 0, 0];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var p = apply(Hm, mmX0 + x / ppm, mmY0 + y / ppm);
      sampleRGB(data, W, H, p[0], p[1], px);
      var o = (y * w + x) * 3; out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2];
    }
    return { w: w, h: h, rgb: out };
  }

  // ── step 3: lighting + white balance, estimated from bare paper ──────────
  function paperField(data, W, H, Hm, c, pl) {
    // low-res view of the whole sheet; paper = outside the (dilated) creature,
    // away from markers and the caption strip
    var ppm = 1.2, sw = Math.round(S.w * ppm), sh = Math.round(S.h * ppm);
    var full = warpRegion(data, W, H, Hm, 0, 0, S.w, S.h, ppm);
    var mask = document.createElement('canvas'); mask.width = sw; mask.height = sh;
    var m = mask.getContext('2d'); m.fillStyle = '#fff'; m.fillRect(0, 0, sw, sh);
    m.fillStyle = '#000'; m.strokeStyle = '#000'; m.lineJoin = 'round';
    m.setTransform(ppm * pl.s, 0, 0, ppm * pl.s, ppm * pl.tx, ppm * pl.ty);
    var P = new Path2D(c.d); m.fill(P); m.lineWidth = 7 / pl.s; m.stroke(P);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.fillRect(0, (S.h - 30) * ppm, sw, 30 * ppm); m.fillRect(0, 0, sw, 24 * ppm);
    C.CORNERS.forEach(function (k) { m.fillRect((S.pos[k][0] - 3) * ppm, (S.pos[k][1] - 3) * ppm, (S.marker + 6) * ppm, (S.marker + 6) * ppm); });
    var md = m.getImageData(0, 0, sw, sh).data;

    var gx = 12, gy = 9, bw = sw / gx, bh = sh / gy, cells = [];
    for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
      var samples = [];
      for (var y = Math.floor(j * bh); y < Math.floor((j + 1) * bh); y++) for (var x = Math.floor(i * bw); x < Math.floor((i + 1) * bw); x++) {
        if (md[(y * sw + x) * 4] > 128) { var o = (y * sw + x) * 3; samples.push([full.rgb[o], full.rgb[o + 1], full.rgb[o + 2], full.rgb[o] * 0.3 + full.rgb[o + 1] * 0.55 + full.rgb[o + 2] * 0.15]); }
      }
      if (samples.length < 25) { cells.push(null); continue; }
      samples.sort(function (a, b) { return a[3] - b[3]; });
      var top = samples.slice(Math.floor(samples.length * 0.6)), acc = [0, 0, 0];
      top.forEach(function (s) { acc[0] += s[0]; acc[1] += s[1]; acc[2] += s[2]; });
      cells.push([acc[0] / top.length, acc[1] / top.length, acc[2] / top.length]);
    }
    // fill gaps (under the creature) by diffusion from known neighbours
    var known = cells.filter(function (v) { return v; });
    if (known.length < 6) return null;
    for (var iter = 0; iter < 40; iter++) {
      var holes = 0;
      for (var jj = 0; jj < gy; jj++) for (var ii = 0; ii < gx; ii++) {
        if (cells[jj * gx + ii]) continue;
        var s2 = [0, 0, 0], n = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var a = ii + d[0], b = jj + d[1];
          if (a >= 0 && b >= 0 && a < gx && b < gy && cells[b * gx + a]) { var v = cells[b * gx + a]; s2[0] += v[0]; s2[1] += v[1]; s2[2] += v[2]; n++; }
        });
        if (n) cells[jj * gx + ii] = [s2[0] / n, s2[1] / n, s2[2] / n]; else holes++;
      }
      if (!holes) break;
    }
    return { cells: cells, gx: gx, gy: gy, bw: S.w / gx, bh: S.h / gy };
  }
  function whiteAt(F, mmx, mmy, out) {             // bilinear over block centres
    var fx = mmx / F.bw - 0.5, fy = mmy / F.bh - 0.5;
    fx = Math.max(0, Math.min(F.gx - 1, fx)); fy = Math.max(0, Math.min(F.gy - 1, fy));
    var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(F.gx - 1, x0 + 1), y1 = Math.min(F.gy - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    var a = F.cells[y0 * F.gx + x0] || [250, 250, 250], b = F.cells[y0 * F.gx + x1] || a, cc = F.cells[y1 * F.gx + x0] || a, d = F.cells[y1 * F.gx + x1] || a;
    for (var k = 0; k < 3; k++) out[k] = (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (cc[k] * (1 - tx) + d[k] * tx) * ty;
  }

  // ── main ─────────────────────────────────────────────────────────────────
  function toCanvas(src) {
    var sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
    var k = Math.min(1, WORK_MAX / Math.max(sw, sh)), cnv = document.createElement('canvas');
    cnv.width = Math.round(sw * k); cnv.height = Math.round(sh * k);
    cnv.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, cnv.width, cnv.height);
    return cnv;
  }

  function process(src) {
    return new Promise(function (resolve, reject) {
      try { resolve(run(src)); } catch (e) { reject(e); }
    });
  }

  function run(src) {
    var photo = toCanvas(src), W = photo.width, H = photo.height;
    var data = photo.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    var gray = grayOf(data, W * H), I = integral(gray, W, H);

    var chosen = null, bestCount = 0, ratios = [0.58, 0.68, 0.48, 0.78, 0.40];
    for (var t = 0; t < ratios.length; t++) {
      var found = findMarkers(gray, I, W, H, ratios[t]), groups = {};
      found.forEach(function (f) { var g = groups[f.id] = groups[f.id] || {}; if (!g[f.corner]) g[f.corner] = f; });
      Object.keys(groups).forEach(function (id) {
        var n = Object.keys(groups[id]).length;
        bestCount = Math.max(bestCount, n);
        if (n >= 3 && (!chosen || n > chosen.n)) chosen = { id: id, g: groups[id], n: n };
      });
      if (chosen && chosen.n === 4) break;           // all four found: done
    }
    if (!chosen) {
      var e = new Error(bestCount ? 'מצאתי רק ' + bestCount + ' מתוך 4 הריבועים השחורים. צלמו את כל הדף, מלמעלה, באור טוב ובלי צללים.' : 'לא מצאתי את הריבועים השחורים בפינות הדף. ודאו שכל הדף נכנס בתמונה ושהוא מודפס בגודל מלא.');
      e.code = 'markers'; throw e;
    }

    var c = C.byId(chosen.id), pl = C.place(c), half = S.marker / 2;
    // where each marker centre should be on the sheet (mm) vs. where we saw it (px)
    var corners = C.CORNERS, src4 = [], dst4 = [];
    corners.forEach(function (k) {
      var f = chosen.g[k], mm = [S.pos[k][0] + half, S.pos[k][1] + half];
      if (f) { src4.push(mm); dst4.push(f.center); }
    });
    if (src4.length === 3) {                                      // 3 markers: complete the parallelogram
      var all = {}; corners.forEach(function (k) { all[k] = chosen.g[k] ? chosen.g[k].center : null; });
      var miss = corners.filter(function (k) { return !all[k]; })[0];
      var opp = { tl: 'br', br: 'tl', tr: 'bl', bl: 'tr' }[miss], adj = corners.filter(function (k) { return k !== miss && k !== opp; });
      all[miss] = [all[adj[0]][0] + all[adj[1]][0] - all[opp][0], all[adj[0]][1] + all[adj[1]][1] - all[opp][1]];
      src4 = []; dst4 = [];
      corners.forEach(function (k) { src4.push([S.pos[k][0] + half, S.pos[k][1] + half]); dst4.push(all[k]); });
    }
    var Hm = homography(src4, dst4);                              // sheet mm → photo px
    if (!Hm) { var e2 = new Error('לא הצלחתי ליישר את הדף. נסו לצלם שוב ישר מלמעלה.'); e2.code = 'warp'; throw e2; }

    // crop = the creature's bounding box on the sheet, plus a margin
    // Artwork paths sit on the OUTER edge of the printed line, so the whole line (plus a margin) lies inside the path
    var lineMM = (c.art && c.art.lineW) ? c.art.lineW * pl.s : OUTLINE_MM;
    var cutMM = (c.art && c.art.lineW) ? 2 * (lineMM + TRIM_MM) : OUTLINE_MM + TRIM_MM * 2;   // stroke width; half of it eats inward
    var b = c.bbox, mar = 2.5;
    var cx0 = pl.tx + pl.s * b.x - mar, cy0 = pl.ty + pl.s * b.y - mar, cw = pl.s * b.w + mar * 2, ch = pl.s * b.h + mar * 2;
    var ppm = Math.min(7, OUT_MAX / Math.max(cw, ch)); ppm = Math.max(ppm, 3);
    var rect = warpRegion(data, W, H, Hm, cx0, cy0, cw, ch, ppm), w = rect.w, h = rect.h;

    // paper lighting: divide it out so the background becomes white
    var F = paperField(data, W, H, Hm, c, pl), px = rect.rgb, white = [0, 0, 0], tmp = [250, 250, 250];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var o = (y * w + x) * 3;
      if (F) whiteAt(F, cx0 + x / ppm, cy0 + y / ppm, white); else white = tmp;
      px[o] = Math.min(255, px[o] / Math.max(60, white[0]) * 252);
      px[o + 1] = Math.min(255, px[o + 1] / Math.max(60, white[1]) * 252);
      px[o + 2] = Math.min(255, px[o + 2] / Math.max(60, white[2]) * 252);
    }

    // masks: full silhouette, and the "inside the printed outline" region
    function pathMask(strokeMM, fill) {
      var m = document.createElement('canvas'); m.width = w; m.height = h;
      var g = m.getContext('2d');
      g.setTransform(ppm * pl.s, 0, 0, ppm * pl.s, ppm * (pl.tx - cx0), ppm * (pl.ty - cy0));
      var P = new Path2D(c.d);
      if (fill) { g.fillStyle = '#fff'; g.fill(P); }
      if (strokeMM) {
        g.globalCompositeOperation = fill ? 'destination-out' : 'source-over';
        g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineWidth = strokeMM / pl.s; g.stroke(P);
      }
      return m;
    }
    var outer = pathMask(0, true);                                               // alpha = full silhouette
    var inner = pathMask(cutMM, true);                        // minus outline band
    var oa = outer.getContext('2d').getImageData(0, 0, w, h).data, ia = inner.getContext('2d').getImageData(0, 0, w, h).data;

    // bleed the child's colours outward over the removed outline band
    var rgb = new Float32Array(px), have = new Uint8Array(w * h), n = w * h;
    for (var i = 0; i < n; i++) have[i] = ia[i * 4 + 3] > 140 ? 1 : 0;
    var passes = Math.ceil((cutMM / 2) * ppm) + 4;
    for (var pass = 0; pass < passes; pass++) {
      var nxt = new Uint8Array(have), grew = false;
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
        var ii = yy * w + xx;
        if (have[ii] || oa[ii * 4 + 3] < 8) continue;
        var sr = 0, sg = 0, sb = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = xx + dx, ny = yy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (have[ni]) { sr += rgb[ni * 3]; sg += rgb[ni * 3 + 1]; sb += rgb[ni * 3 + 2]; cnt++; }
        }
        if (cnt) { rgb[ii * 3] = sr / cnt; rgb[ii * 3 + 1] = sg / cnt; rgb[ii * 3 + 2] = sb / cnt; nxt[ii] = 1; grew = true; }
      }
      have = nxt; if (!grew) break;
    }

    // measure how pale the colouring is, to pick a sensible default boost
    var ink = 0, cntInk = 0, colorful = 0;
    for (var k = 0; k < n; k += 7) if (ia[k * 4 + 3] > 140) { var mx = Math.max(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]), mn = Math.min(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]); if (mx - mn > 28 && mx > 60) colorful++; ink += 255 - (rgb[k * 3] * 0.3 + rgb[k * 3 + 1] * 0.55 + rgb[k * 3 + 2] * 0.15); cntInk++; }
    if (cntInk > 200 && colorful / cntInk < 0.012) throw new Error('הדף עוד לא צבוע. צבעו את החיה קודם ואז צלמו שוב.');
    var meanInk = cntInk ? ink / cntInk : 40;
    var autoBoost = meanInk < 28 ? 0.9 : meanInk < 55 ? 0.6 : meanInk < 90 ? 0.35 : 0.2;

    function render(boost) {
      boost = Math.max(0, Math.min(1, boost == null ? autoBoost : boost));
      var out = document.createElement('canvas'); out.width = w; out.height = h;
      var g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
      var gain = 1 + boost * 1.5, sat = 1 + boost * 0.9;
      for (var i = 0; i < n; i++) {
        var r = rgb[i * 3], gg = rgb[i * 3 + 1], bb = rgb[i * 3 + 2];
        r = 255 - (255 - r) * gain; gg = 255 - (255 - gg) * gain; bb = 255 - (255 - bb) * gain;
        var l = r * 0.3 + gg * 0.55 + bb * 0.15;
        r = l + (r - l) * sat; gg = l + (gg - l) * sat; bb = l + (bb - l) * sat;
        d[i * 4] = r < 0 ? 0 : r > 255 ? 255 : r; d[i * 4 + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i * 4 + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb;
        d[i * 4 + 3] = oa[i * 4 + 3];
      }
      g.putImageData(img, 0, 0);
      return out;
    }
    return { id: c.id, colorful: colorful / Math.max(1, cntInk), meanInk: meanInk, creature: c, canvas: render(autoBoost), render: render, autoBoost: autoBoost, markers: chosen.n };
  }

  root.Capture = { process: process, _homography: homography };
})(window);
