/* menu.js — the drawer of the TV / desktop page: fish album, add a fish from a photo, settings.
   Deleting needs a long press and can be undone for a few seconds. */
(function () {
  'use strict';
  var C = window.Creatures, S = window.ReefSound, I = window.Icons, R = window.Reef;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };

  // ── DOM ───────────────────────────────────────────────────────────────────
  function fab(id, icon, label) { var b = document.createElement('button'); b.id = id; b.className = 'fab'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = I.svg(icon, 26); document.body.appendChild(b); return b; }
  var btn = fab('menuBtn', 'menu', 'תפריט (M)'), snd = fab('sndBtn', 'sound-on', 'השתקה (S)'), snap = fab('snapBtn', 'camera', 'צילום האקווריום (P)');
  var scrim = document.createElement('div'); scrim.id = 'menuScrim';
  var drop = document.createElement('div'); drop.id = 'dropHint'; drop.textContent = 'שחררו כאן תמונה של דף צבוע';
  var menu = document.createElement('aside'); menu.id = 'menu'; menu.setAttribute('aria-label', 'תפריט');
  menu.innerHTML =
    '<header><h2>' + I.svg('fish', 26) + 'ים של ציורים</h2><button class="xbtn" id="mClose" aria-label="סגירה">' + I.svg('close', 22) + '</button></header>' +
    '<div class="tabs" role="tablist">' +
      '<button class="tab on" data-t="fish" role="tab">' + I.svg('fish', 20) + 'החיות <span id="mCount"></span></button>' +
      '<button class="tab" data-t="add" role="tab">' + I.svg('plus', 20) + 'הוספה</button>' +
      '<button class="tab" data-t="set" role="tab">' + I.svg('gear', 20) + 'הגדרות</button></div>' +
    '<div class="body">' +
    '<div class="pane on" data-p="fish">' +
      '<div class="mrow" style="margin-top:8px"><button class="mbtn" id="mFeed">' + I.svg('drop', 20) + 'האכלה</button><button class="mbtn alt" id="mWave">' + I.svg('wave', 20) + 'גלים</button></div>' +
      '<div class="card2"><div id="mGallery"></div>' +
      '<div class="empty" id="mEmpty">' + I.svg('fish', 40) + '<div>הים מחכה לחיה הראשונה!</div><button class="mbtn" id="mGoAdd" style="margin-top:12px">' + I.svg('plus', 20) + 'הוספת חיה</button></div></div>' +
    '</div>' +
    '<div class="pane" data-p="add">' +
      '<div class="card2"><h3>' + I.svg('image', 22) + 'מתמונה של דף צבוע</h3>' +
      '<p class="sub">צלמו את הדף בטלפון (סרקו את הקוד למטה), או הוסיפו כאן תמונה שלו. אפשר גם לגרור תמונה לכל מקום במסך.</p>' +
      '<div class="mrow" style="margin-top:10px"><button class="mbtn" id="mPick">' + I.svg('image', 20) + 'בחירת תמונה</button><button class="mbtn alt" id="mCam" style="display:none">' + I.svg('camera', 20) + 'מצלמת המחשב</button></div>' +
      '<div id="mVideoWrap"><video id="mVideo" playsinline muted></video><div class="mrow" style="margin-top:10px"><button class="mbtn" id="mSnap">' + I.svg('camera', 20) + 'צלמו</button><button class="mbtn ghost" id="mCamStop">ביטול</button></div></div>' +
      '<div id="mPreview"><canvas id="mPv" width="800" height="600"></canvas>' +
        '<div class="vslider"><span>' + I.svg('crayon', 20) + '</span><input type="range" id="mBoost" min="0" max="100" value="50" aria-label="צבעים חיים"><span>חיים יותר</span></div>' +
        '<div class="mrow"><button class="mbtn alt" id="mSend">' + I.svg('check', 20) + 'הכניסו לאקווריום</button><button class="mbtn ghost" id="mAgain">ביטול</button></div></div>' +
      '<div id="mMsg" role="status"></div><input type="file" id="mFile" accept="image/*" hidden></div>' +
      '<div class="card2"><h3>' + I.svg('phone', 22) + 'סריקה מהטלפון</h3><div class="mqr"><div class="q" id="mQr"></div><div><div class="sub" style="margin:0 0 6px">אותה רשת Wi-Fi. סרקו או הקלידו:</div><div class="u" id="mUrl"></div></div></div></div>' +
      '<div class="card2"><h3>' + I.svg('print', 22) + 'דפי צביעה</h3><div class="mrow"><a class="mbtn alt" href="/print" target="_blank" rel="noopener">' + I.svg('print', 20) + 'הדפסת דפים</a></div></div>' +
    '</div>' +
    '<div class="pane" data-p="set">' +
      '<div class="card2"><h3>' + I.svg('star', 22) + 'שיר הרקע</h3>' +
        '<div class="mrow"><button class="mbtn alt" id="mMus"></button></div>' +
        '<div class="vol" style="margin-top:12px"><span class="num" id="mTCur">0:00</span><input type="range" id="mSeek" min="0" max="1000" value="0" aria-label="התקדמות השיר"><span class="num" id="mTDur">0:00</span></div>' +
        '<p class="sub" style="margin-top:10px">עוצמת השיר</p><div class="vol"><input type="range" id="mMVol" min="0" max="100" value="45" aria-label="עוצמת השיר"><span class="num" id="mMVolNum">45</span></div>' +
        '<p class="sub">השיר חוזר שוב ושוב. צלילי הים שקטים יותר ברקע.</p></div>' +
      '<div class="card2"><h3>' + I.svg('sound-on', 22) + 'צלילי ים</h3>' +
        '<div class="mrow"><button class="mbtn alt" id="mSndOn"></button><button class="mbtn ghost" id="mMute"></button></div>' +
        '<div class="pills"><button class="pill" data-opt="bub">' + I.svg('drop', 18) + 'בועות עדינות</button><button class="pill" data-opt="wav">' + I.svg('wave', 18) + 'גלים איטיים</button></div>' +
        '<p class="sub" style="margin-top:14px">עוצמת הים</p><div class="vol"><input type="range" id="mVol" min="0" max="100" value="50" aria-label="עוצמת הים"><span class="num" id="mVolNum">50</span></div>' +
        '<p class="sub" style="margin-top:10px">צלילי אפקטים (כשחיה מצטרפת)</p><div class="vol"><input type="range" id="mFxVol" min="0" max="100" value="70" aria-label="עוצמת אפקטים"><span class="num" id="mFxNum">70</span><button id="mTest">נסו</button></div>' +
      '</div>' +
      '<div class="card2"><h3>' + I.svg('sun', 22) + 'שמיים</h3><div class="pills" id="mSky">' +
        '<button class="pill" data-s="auto">לפי השעה</button><button class="pill" data-s="day">יום</button><button class="pill" data-s="dusk">שקיעה</button><button class="pill" data-s="night">לילה</button></div>' +
        '<div class="sw"><b>לילה טוב (אפל ורגוע)</b><button class="pill" id="mGood">' + I.svg('moon', 18) + 'הפעלה</button></div></div>' +
      '<div class="card2"><h3>' + I.svg('gear', 22) + 'תצוגה</h3><div class="pills" id="mQ"><button class="pill" data-q="0">חסכוני</button><button class="pill" data-q="1">רגיל</button><button class="pill" data-q="2">מרהיב</button></div>' +
        '<p class="sub">אם האקווריום מתקשה במחשב ישן, בחרו חסכוני.</p>' +
        '<div class="mrow" style="margin-top:10px"><button class="mbtn ghost" id="mFull">' + I.svg('expand', 20) + 'מסך מלא</button><button class="mbtn ghost" id="mSave">' + I.svg('download', 20) + 'שמירת תמונה</button></div>' +
        '<p class="sub">מקשים: <span class="kbd">M</span> תפריט · <span class="kbd">S</span> השתקה · <span class="kbd">F</span> מסך מלא · <span class="kbd">D</span> אוכל · <span class="kbd">P</span> צילום · <span class="kbd">N</span> לילה טוב</p></div>' +
    '</div></div>';
  var sheet = document.createElement('div'); sheet.id = 'sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  [btn, snd, snap, scrim, menu, sheet, drop].forEach(function (e) { if (e.parentNode !== document.body) document.body.appendChild(e); });
  menu.setAttribute('inert', ''); // hidden drawer must not take focus

  function open(tab) { document.body.classList.add('menu-open'); menu.removeAttribute('inert'); setTab(typeof tab === 'string' ? tab : 'fish'); refreshGallery(); setTimeout(function () { $('#mClose').focus(); }, 60); }
  function close() { document.body.classList.remove('menu-open'); menu.setAttribute('inert', ''); stopCam(); closeSheet(); btn.focus(); }
  function toggle() { document.body.classList.contains('menu-open') ? close() : open(); }
  btn.onclick = function () { open(); }; scrim.onclick = close; $('#mClose').onclick = close;
  function setTab(t) { $$('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); }); $$('.pane').forEach(function (p) { p.classList.toggle('on', p.dataset.p === t); }); }
  $$('.tab').forEach(function (b) { b.onclick = function () { setTab(b.dataset.t); }; });
  $('#mGoAdd').onclick = function () { setTab('add'); };

  // ── sound ─────────────────────────────────────────────────────────────────
  var vol = $('#mVol'), volNum = $('#mVolNum'), fxv = $('#mFxVol'), fxNum = $('#mFxNum'), sOn = $('#mSndOn'), mute = $('#mMute');
  S.onchange(function (s) {
    snd.innerHTML = I.svg(!s.on || s.muted ? 'sound-off' : s.vol < 0.34 ? 'sound-low' : 'sound-on', 26);
    snd.title = !s.on ? 'הפעלת צלילי ים (S)' : s.muted ? 'ביטול השתקה (S)' : 'השתקה (S)';
    sOn.innerHTML = I.svg(s.on ? 'close' : 'sound-on', 20) + (s.on ? 'כיבוי הצלילים' : 'הפעלת צלילי ים');
    mute.innerHTML = I.svg(s.muted ? 'sound-on' : 'sound-off', 20) + (s.muted ? 'ביטול השתקה' : 'השתקה');
    mute.style.opacity = s.on ? 1 : .5;
    vol.value = Math.round(s.vol * 100); volNum.textContent = Math.round(s.vol * 100);
    fxv.value = Math.round(s.fx * 100); fxNum.textContent = Math.round(s.fx * 100);
    $$('.pill[data-opt]').forEach(function (p) { p.classList.toggle('on', !!s[p.dataset.opt]); });
  });
  $$('.pill[data-opt]').forEach(function (p) { p.onclick = function () { S.setOption(p.dataset.opt, !S.status()[p.dataset.opt]); }; });
  snd.onclick = function () { if (!S.status().on) S.toggle(); else S.toggleMute(); };
  sOn.onclick = function () { S.toggle(); };
  mute.onclick = function () { if (!S.status().on) S.toggle(); else S.toggleMute(); };
  vol.oninput = function () { S.setVolume(vol.value / 100); };
  fxv.oninput = function () { S.setFxVolume(fxv.value / 100); };
  $('#mTest').onclick = function () { S.chime(true); };
  S.arm();


  // ── background song ───────────────────────────────────────────────────────
  var M = window.ReefMusic, seeking = false;
  function mmss(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  if (M) {
    M.onchange(function (s) {
      var card = $('#mMus').closest('.card2'); if (card) card.style.display = s.missing ? 'none' : '';     // no song installed
      $('#mMus').innerHTML = I.svg(s.on ? 'close' : 'sound-on', 20) + (s.on ? 'עצירת השיר' : 'הפעלת השיר');
      if (!seeking) $('#mSeek').value = s.d ? Math.round(s.t / s.d * 1000) : 0;
      $('#mTCur').textContent = mmss(s.t); $('#mTDur').textContent = mmss(s.d);
      $('#mMVol').value = Math.round(s.vol * 100); $('#mMVolNum').textContent = Math.round(s.vol * 100);
    });
    $('#mMus').onclick = function () { M.toggle(); };
    $('#mMVol').oninput = function () { M.setVolume($('#mMVol').value / 100); };
    var sk = $('#mSeek');
    sk.oninput = function () { seeking = true; var s = M.status(); $('#mTCur').textContent = mmss(sk.value / 1000 * s.d); };
    sk.onchange = function () { var s = M.status(); if (s.d) M.seek(sk.value / 1000 * s.d); seeking = false; };
  }

  // ── sky / quality / view ──────────────────────────────────────────────────
  function paintSettings() {
    var t = window.ReefTV; if (!t) return;
    var s = t.sky(); $$('#mSky .pill').forEach(function (p) { p.classList.toggle('on', p.dataset.s === s.mode && !s.goodNight); });
    $('#mGood').classList.toggle('on', s.goodNight); $('#mGood').lastChild.textContent = s.goodNight ? 'כיבוי' : 'הפעלה';
    $$('#mQ .pill').forEach(function (p) { p.classList.toggle('on', +p.dataset.q === t.quality()); });
  }
  $$('#mSky .pill').forEach(function (p) { p.onclick = function () { ReefTV.setSky(p.dataset.s); paintSettings(); }; });
  $('#mGood').onclick = function () { ReefTV.goodNight(!ReefTV.sky().goodNight); paintSettings(); };
  $$('#mQ .pill').forEach(function (p) { p.onclick = function () { ReefTV.setQuality(+p.dataset.q); paintSettings(); }; });
  $('#mFull').onclick = function () { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
  function savePhoto() {
    try {
      var c = ReefTV.snapshot(); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'aquarium-' + new Date().toISOString().slice(0, 10) + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); ReefTV.toast('התמונה נשמרה'); }, 'image/png');
    } catch (e) {}
  }
  $('#mSave').onclick = savePhoto; snap.onclick = savePhoto;

  // ── messages ──────────────────────────────────────────────────────────────
  var msg = $('#mMsg');
  function say(kind, text) { msg.className = kind || ''; msg.textContent = text || ''; }

  // ── add a fish from a photo ───────────────────────────────────────────────
  var result = null, pv = $('#mPv'), preview = $('#mPreview'), cid = null;
  function showPreview() {
    var g = pv.getContext('2d'), s = result.render($('#mBoost').value / 100), W = pv.width, H = pv.height;
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#46cdea'); bg.addColorStop(0.6, '#1368a8'); bg.addColorStop(1, '#073a6d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var k = Math.min(W * 0.86 / s.width, H * 0.86 / s.height), w = s.width * k, h = s.height * k;
    g.save(); g.shadowColor = 'rgba(0,20,50,.5)'; g.shadowBlur = 24; g.shadowOffsetY = 10; g.drawImage(s, (W - w) / 2, (H - h) / 2, w, h); g.restore();
    result.cur = s;
  }
  function handleSource(src) {
    result = null; cid = R.cid(); preview.style.display = 'none'; say('busy', 'קוראים את הציור...');
    setTimeout(function () {
      Capture.process(src).then(function (r) {
        result = r; $('#mBoost').value = Math.round(r.autoBoost * 100);
        preview.style.display = 'block'; showPreview();
        say('ok', 'זיהינו: ' + r.creature.he + '. אפשר לכוונן צבעים ולשלוח.');
      }).catch(function (e) { say('err', (e && e.message) || 'לא הצלחנו לקרוא את הדף. נסו תמונה אחרת.'); });
    }, 30);
  }
  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) { say('err', 'זה לא קובץ תמונה.'); return; }
    var p = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); }) : viaImg(file);
    p.then(handleSource, function () { say('err', 'לא הצלחנו לפתוח את התמונה.'); });
  }
  function viaImg(file) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  $('#mPick').onclick = function () { $('#mFile').click(); };
  $('#mFile').onchange = function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) handleFile(f); };
  $('#mBoost').oninput = function () { if (result) showPreview(); };
  $('#mAgain').onclick = function () { result = null; preview.style.display = 'none'; say(); };
  var sending = false;
  $('#mSend').onclick = function () {
    if (!result || sending) return; sending = true; $('#mSend').disabled = true;
    var s = result.cur || result.render($('#mBoost').value / 100);
    R.api('POST', '/api/fish', { kind: result.id, png: s.toDataURL('image/png'), cid: cid })
      .then(function () { result = null; preview.style.display = 'none'; say('ok', 'החיה בדרך למסך!'); setTimeout(function () { close(); }, 900); })
      .catch(function (e) { say('err', R.friendly(e)); })
      .then(function () { sending = false; $('#mSend').disabled = false; });
  };

  // camera of the computer (works on localhost / https)
  var stream = null, video = $('#mVideo'), vwrap = $('#mVideoWrap');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) $('#mCam').style.display = '';
  function stopCam() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } vwrap.style.display = 'none'; }
  $('#mCam').onclick = function () {
    say(); navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(function (s) {
      stream = s; video.srcObject = s; video.play(); vwrap.style.display = 'block';
    }).catch(function () { say('err', 'אין גישה למצלמה. אפשר לאשר אותה בדפדפן או לבחור תמונה.'); });
  };
  $('#mCamStop').onclick = stopCam;
  $('#mSnap').onclick = function () {
    if (!video.videoWidth) return;
    var c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
    stopCam(); handleSource(c);
  };

  // drag & drop anywhere
  var dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  addEventListener('dragenter', function (e) { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
  addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  addEventListener('dragover', function (e) { e.preventDefault(); });
  addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { open('add'); handleFile(f); }
  });

  // ── play ──────────────────────────────────────────────────────────────────
  $('#mFeed').onclick = function () { R.api('POST', '/api/feed', {}).catch(function () {}); };
  $('#mWave').onclick = function () { R.api('POST', '/api/wave', {}).catch(function () {}); };

  // ── album ─────────────────────────────────────────────────────────────────
  var pending = {}, seen = null, list = [];
  function paintGallery() {
    var g = $('#mGallery'); g.innerHTML = '';
    var shown = list.filter(function (f) { return !pending[f.id]; });
    $('#mEmpty').style.display = shown.length ? 'none' : ''; $('#mCount').textContent = shown.length ? '(' + shown.length + ')' : '';
    shown.slice().reverse().forEach(function (f) {
      var cr = C.byId(f.kind), b = document.createElement('button'); b.className = 'g' + (seen && !seen[f.id] ? ' fresh' : '');
      b.innerHTML = '<img src="' + R.esc(R.fishUrl(f.id)) + '" alt="">' + '<b>' + R.esc(f.name || (cr && cr.he) || '') + '</b>';
      b.setAttribute('aria-label', R.esc(f.name || (cr && cr.he) || 'חיה'));
      b.onclick = function () { openSheet(f, cr); };
      g.appendChild(b);
    });
    seen = {}; list.forEach(function (f) { seen[f.id] = 1; });
  }
  function refreshGallery() { fetch('/api/fish').then(function (r) { return r.json(); }).then(function (l) { list = l; paintGallery(); paintSettings(); }).catch(function () {}); }
  addEventListener('reef:change', function () { if (document.body.classList.contains('menu-open')) refreshGallery(); });

  // ── fish sheet: rename, show me, jump, remove (hold) ──────────────────────
  var cur = null, holdT = 0, holdRaf = 0;
  function openSheet(f, cr) {
    cur = f;
    sheet.innerHTML = '<div class="box"><div class="pic"><img src="' + R.esc(R.fishUrl(f.id)) + '" alt=""></div>' +
      '<input class="nm" id="shName" maxlength="12" aria-label="שם החיה" value="' + R.esc(f.name || '') + '">' +
      '<div class="meta">' + R.esc(cr ? cr.he : '') + ' · הצטרף ב-' + R.esc(R.date(f.t)) + '</div>' +
      '<div class="mrow"><button class="mbtn alt" id="shFind">' + I.svg('target', 20) + 'איפה הוא?</button><button class="mbtn" id="shJump">' + I.svg('jump', 20) + 'קפיצה</button></div>' +
      '<div class="mrow" style="margin-top:10px"><button class="mbtn hold" id="shDel"><i></i><span>' + I.svg('trash', 20) + 'החזיקו להסרה</span></button><button class="mbtn ghost" id="shClose">סגירה</button></div></div>';
    sheet.classList.add('on');
    var nm = $('#shName');
    function saveName() { var v = nm.value.trim(); if (v && v !== f.name) { R.api('PATCH', '/api/fish/' + f.id, { name: v }).then(function () { f.name = v; paintGallery(); }).catch(function () {}); } }
    nm.onblur = saveName; nm.onkeydown = function (e) { if (e.key === 'Enter') { nm.blur(); } };
    $('#shFind').onclick = function () { saveName(); closeSheet(); close(); setTimeout(function () { ReefTV.poke(f.id, 'find'); }, 450); };
    $('#shJump').onclick = function () { ReefTV.poke(f.id, 'jump'); };
    $('#shClose').onclick = function () { saveName(); closeSheet(); };
    var del = $('#shDel'), bar = $('i', del);
    function holdStart(e) { if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return; if (holdT) return; e.preventDefault(); holdT = performance.now(); (function tick() { var k = Math.min(1, (performance.now() - holdT) / 800); bar.style.transform = 'scaleX(' + k + ')'; if (k >= 1) { holdEnd(); removeFish(f); return; } holdRaf = requestAnimationFrame(tick); })(); }
    function holdEnd() { if (holdT && performance.now() - holdT < 800) { var sp = del.querySelector('span'); sp.lastChild.textContent = 'המשיכו ללחוץ...'; setTimeout(function () { sp.lastChild.textContent = 'החזיקו להסרה'; }, 1200); } holdT = 0; cancelAnimationFrame(holdRaf); bar.style.transform = 'scaleX(0)'; }
    del.addEventListener('pointerdown', holdStart); del.addEventListener('keydown', holdStart);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach(function (ev) { del.addEventListener(ev, holdEnd); });
    setTimeout(function () { $('#shClose').focus(); }, 30);
  }
  sheet.addEventListener('keydown', function (e) { if (e.key !== 'Tab') return; var f = $$('button,input', sheet); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } });
  function closeSheet() { var was = sheet.classList.contains('on'); sheet.classList.remove('on'); sheet.innerHTML = ''; cur = null; if (was && document.body.classList.contains('menu-open')) { var t = $('.g'); (t || $('#mClose')).focus(); } }
  sheet.addEventListener('pointerdown', function (e) { if (e.target === sheet) { var n = $('#shName'); if (n) n.blur(); closeSheet(); } });

  // removal can be undone for a few seconds (the delete is only sent after that)
  var undoEl = document.getElementById('undo'), undoMsg = document.getElementById('undoMsg'), undoBtn = document.getElementById('undoBtn'), undoQ = [], undoTimer = 0;
  function removeFish(f) {
    closeSheet(); pending[f.id] = 1; paintGallery(); R.vibrate(20);
    var item = { f: f, t: setTimeout(function () { commit(item); }, 6000) }; undoQ.push(item); showUndo();
  }
  function commit(item) {
    var i = undoQ.indexOf(item); if (i >= 0) undoQ.splice(i, 1);
    R.api('DELETE', '/api/fish/' + item.f.id).catch(function () {}).then(function () { delete pending[item.f.id]; refreshGallery(); });
    showUndo();
  }
  function showUndo() {
    if (!undoQ.length) { undoEl.classList.remove('show'); return; }
    var last = undoQ[undoQ.length - 1]; undoMsg.textContent = 'הסרתם את ' + (last.f.name || 'החיה');
    undoEl.classList.add('show');
  }
  undoBtn.onclick = function () { var it = undoQ.pop(); if (it) { clearTimeout(it.t); delete pending[it.f.id]; paintGallery(); } showUndo(); };
  addEventListener('pagehide', function () { undoQ.slice().forEach(function (it) { clearTimeout(it.t); try { fetch('/api/fish/' + it.f.id, { method: 'DELETE', keepalive: true, headers: { 'X-Reef': '1' } }); } catch (e) {} }); });

  // ── QR for the phone ──────────────────────────────────────────────────────
  fetch('/api/info').then(function (r) { return r.json(); }).then(function (info) {
    var isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname), base = isLocal && info.urls.length ? info.urls[0] : location.origin, url = base + '/scan';
    if (R.joinInfo) url = R.joinInfo.url;
    if (window.qrcode) { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('#mQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    $('#mUrl').innerHTML = R.joinInfo ? R.esc(R.joinInfo.label) : (isLocal && info.urls.length ? info.urls : [location.origin]).map(function (u) { return R.esc(u.replace('http://', '')) + '/scan'; }).join('<br>');
  }).catch(function () {});

  // ── keys ──────────────────────────────────────────────────────────────────
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (sheet.classList.contains('on')) closeSheet(); else close(); }
    else if (e.key === 'm' || e.key === 'M' || e.key === 'צ') toggle();
    else if (e.key === 's' || e.key === 'S' || e.key === 'ד') { if (!S.status().on) S.toggle(); else S.toggleMute(); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'פ') savePhoto();
  });

  window.__menu = { open: open, close: close };
})();
