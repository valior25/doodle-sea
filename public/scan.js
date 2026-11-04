(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, I = window.Icons, R = window.Reef, C = window.Creatures;
  var result = null, sending = false, cid = null, last = null;

  [].forEach.call(document.querySelectorAll('[data-ic]'), function (el) { el.innerHTML = I.svg(el.dataset.ic, +el.dataset.sz || 22); });
  function lab(el, icon, text) { el.innerHTML = I.svg(icon, 24) + '<span>' + text + '</span>'; }
  lab($('cam'), 'camera', 'צלמו את הדף'); lab($('gal'), 'image', 'בחירה מהגלריה'); lab($('send'), 'check', 'שלחו לאקווריום');
  lab($('feed'), 'drop', 'האכילו את החיות'); lab($('wave'), 'wave', 'עושים גלים'); lab($('doneFind'), 'target', 'איפה החיה שלי?');
  [['scan', 'camera', 'צילום'], ['feed', 'drop', 'משחק'], ['fish', 'fish', 'החיות']].forEach(function (t, i) { var b = document.querySelectorAll('nav button')[i]; b.innerHTML = I.svg(t[1], 26) + t[2]; });

  // tabs
  function tab(t) {
    [].forEach.call(document.querySelectorAll('nav button'), function (x) { x.classList.toggle('on', x.dataset.t === t); });
    [].forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x.id === 't-' + t); });
    if (t === 'fish') loadGallery();
    scrollTo(0, 0);
  }
  [].forEach.call(document.querySelectorAll('nav button'), function (b) { b.onclick = function () { tab(b.dataset.t); }; });

  function note(kind, html) { $('note').innerHTML = html ? '<div class="msg ' + kind + '">' + html + '</div>' : ''; if (html) { var n = $('note'); setTimeout(function () { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50); } }
  var tt = 0; function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, 3500); }
  function show(which) {
    $('intro').style.display = which === 'intro' ? '' : 'none';
    $('spin').style.display = which === 'spin' ? 'block' : 'none';
    $('preview').style.display = which === 'preview' ? 'block' : 'none';
    $('done').style.display = which === 'done' ? 'block' : 'none';
  }

  $('cam').onclick = function () { $('fCam').click(); };
  $('gal').onclick = function () { $('fGal').click(); };
  $('fCam').onchange = $('fGal').onchange = function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) handle(f); };
  $('again').onclick = function () { result = null; note(); show('intro'); $('fCam').click(); };
  $('doneMore').onclick = function () { note(); show('intro'); };

  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) { return new Promise(function (res, rej) { var u = URL.createObjectURL(file), i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = u; }); }

  function handle(file) {
    note(); show('spin'); cid = R.cid();
    loadBitmap(file).then(function (bmp) {
      return new Promise(function (r) { setTimeout(r, 40); }).then(function () { return Capture.process(bmp); });
    }).then(function (r) {
      window.__res = r; result = r; $('boost').value = Math.round(r.autoBoost * 100);
      drawPreview(); show('preview');
      note('ok', 'זיהינו: <b>' + R.esc(r.creature.he) + '</b>. אפשר לכוונן את הצבעים ולשלוח.');
    }).catch(function (e) {
      show('intro');
      var m = e && e.message ? e.message : 'נסו לצלם שוב.'; note('err', /^הדף עוד לא צבוע/.test(m) ? '<b>רגע, החיה עוד לבנה!</b><br>' + R.esc(m.replace(/^הדף עוד לא צבוע\.\s*/, '')) : '<b>אוי, לא הצלחנו לקרוא את הדף.</b><br>' + R.esc(m));
    });
  }

  function drawPreview() {
    var cv = $('pv'), g = cv.getContext('2d'), s = result.render($('boost').value / 100), W = cv.width, H = cv.height;
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#46cdea'); bg.addColorStop(0.6, '#1368a8'); bg.addColorStop(1, '#073a6d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var k = Math.min((W * 0.86) / s.width, (H * 0.86) / s.height), w = s.width * k, h = s.height * k;
    g.save(); g.shadowColor = 'rgba(0,20,50,.5)'; g.shadowBlur = 24; g.shadowOffsetY = 10; g.drawImage(s, (W - w) / 2, (H - h) / 2, w, h); g.restore();
    result.cur = s;
  }
  $('boost').oninput = function () { if (result) drawPreview(); };

  $('fname').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('fname').blur(); } };
  $('send').onclick = function () {
    if (!result || sending) return;
    sending = true; $('send').disabled = true; note();
    var s = result.cur || result.render($('boost').value / 100), url = s.toDataURL('image/png'), name = result.creature.he;
    R.api('POST', '/api/fish', { kind: result.id, png: url, cid: cid, name: $('fname').value.trim() })
      .then(function (rec) {
        last = rec; $('doneImg').src = url; $('doneT').textContent = (rec.name || name) + ' בדרך לאקווריום!';
        result = null; $('fname').value = ''; show('done'); R.vibrate([40, 40, 80]);
      })
      .catch(function (e) { note('err', '<b>השליחה נכשלה.</b><br>' + R.esc(R.friendly(e))); })
      .then(function () { sending = false; $('send').disabled = false; });
  };
  $('doneFind').onclick = function () { if (last) poke(last.id, 'find'); };

  function poke(id, action) { R.api('POST', '/api/poke', { id: id, action: action }).catch(function (e) { toast(R.friendly(e)); }); R.vibrate(25); }
  $('feed').onclick = function () { R.api('POST', '/api/feed', {}).catch(function (e) { toast(R.friendly(e)); }); R.vibrate(30); };
  $('wave').onclick = function () { R.api('POST', '/api/wave', {}).catch(function (e) { toast(R.friendly(e)); }); R.vibrate(20); };

  // ── album + fish sheet ────────────────────────────────────────────────────
  var pending = {}, list = [];
  function paintGallery() {
    var g = $('gallery'); g.innerHTML = '';
    var shown = list.filter(function (f) { return !pending[f.id]; });
    $('gempty').style.display = shown.length ? 'none' : '';
    shown.slice().reverse().forEach(function (f) {
      var cr = C.byId(f.kind), b = document.createElement('button'); b.className = 'g';
      b.innerHTML = '<img src="/fish/' + R.esc(f.id) + '.png" alt=""><b>' + R.esc(f.name || (cr && cr.he) || '') + '</b>';
      b.onclick = function () { openSheet(f, cr); };
      g.appendChild(b);
    });
  }
  function loadGallery() { fetch('/api/fish').then(function (r) { return r.json(); }).then(function (l) { list = l; paintGallery(); setOff(false); }).catch(function () { setOff(true); }); }
  function setOff(v) { $('off').style.display = v ? 'block' : 'none'; }

  var sheet = $('sheet'), holdT = 0, holdRaf = 0;
  function closeSheet() { sheet.classList.remove('on'); sheet.innerHTML = ''; }
  sheet.addEventListener('click', function (e) { if (e.target === sheet) { var n = $('shName'); if (n) n.blur(); closeSheet(); } });
  function openSheet(f, cr) {
    sheet.innerHTML = '<div class="box"><div class="pic"><img src="/fish/' + R.esc(f.id) + '.png" alt=""></div>' +
      '<input class="nm" id="shName" maxlength="12" aria-label="שם החיה" value="' + R.esc(f.name || '') + '">' +
      '<div class="meta">' + R.esc(cr ? cr.he : '') + ' · הצטרף ב-' + R.esc(R.date(f.t)) + '</div>' +
      '<div class="grid2"><button class="btn blue sm" id="shFind">' + I.svg('target', 22) + 'איפה הוא?</button><button class="btn sm" id="shJump">' + I.svg('jump', 22) + 'קפיצה</button></div>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn sm hold" id="shDel"><i></i><span>' + I.svg('trash', 22) + 'החזיקו להסרה</span></button><button class="btn ghost sm" id="shClose">סגירה</button></div></div>';
    sheet.classList.add('on');
    var nm = $('shName');
    function saveName() { var v = nm.value.trim(); if (v && v !== f.name) R.api('PATCH', '/api/fish/' + f.id, { name: v }).then(function () { f.name = v; paintGallery(); }).catch(function (e) { toast(R.friendly(e)); }); }
    nm.onblur = saveName; nm.onkeydown = function (e) { if (e.key === 'Enter') nm.blur(); };
    $('shFind').onclick = function () { poke(f.id, 'find'); };
    $('shJump').onclick = function () { poke(f.id, 'jump'); };
    $('shClose').onclick = function () { saveName(); closeSheet(); };
    var del = $('shDel'), bar = del.querySelector('i');
    function start(e) { if (holdT) return; if (e.cancelable) e.preventDefault(); holdT = performance.now(); (function tick() { var k = Math.min(1, (performance.now() - holdT) / 800); bar.style.transform = 'scaleX(' + k + ')'; if (k >= 1) { end(); removeFish(f); return; } holdRaf = requestAnimationFrame(tick); })(); }
    function end() { holdT = 0; cancelAnimationFrame(holdRaf); bar.style.transform = 'scaleX(0)'; }
    del.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { del.addEventListener(ev, end); });
    del.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  var undoQ = [];
  function removeFish(f) {
    closeSheet(); pending[f.id] = 1; paintGallery(); R.vibrate(30);
    var item = { f: f, t: setTimeout(function () { commit(item); }, 6000) }; undoQ.push(item); showUndo();
  }
  function commit(item) {
    var i = undoQ.indexOf(item); if (i >= 0) undoQ.splice(i, 1); showUndo();
    R.api('DELETE', '/api/fish/' + item.f.id).catch(function () {}).then(function () { delete pending[item.f.id]; loadGallery(); });
  }
  function showUndo() {
    if (!undoQ.length) { $('undo').classList.remove('show'); return; }
    $('undoMsg').textContent = 'הסרתם את ' + (undoQ[undoQ.length - 1].f.name || 'החיה'); $('undo').classList.add('show');
  }
  $('undoBtn').onclick = function () { var it = undoQ.pop(); if (it) { clearTimeout(it.t); delete pending[it.f.id]; paintGallery(); } showUndo(); };
  addEventListener('pagehide', function () { undoQ.slice().forEach(function (it) { clearTimeout(it.t); try { fetch('/api/fish/' + it.f.id, { method: 'DELETE', keepalive: true, headers: { 'X-Reef': '1' } }); } catch (e) {} }); });

  // connectivity hint
  fetch('/api/info').then(function () { setOff(false); }).catch(function () { setOff(true); });
  addEventListener('online', function () { setOff(false); }); addEventListener('offline', function () { setOff(true); });
})();
