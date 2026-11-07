/* net.js — the "no server" build (GitHub Pages).  Does nothing when window.REEF_MODE !== 'static'.

   The TV page becomes the server: it keeps the fish in IndexedDB and answers the same /api/* calls the Node
   server answers.  A phone that scans the QR code opens scan.html#r=<room>; the two browsers find each other
   through a tiny public message relay (ntfy.sh, only ever carries the connection handshake) and then talk
   directly over a WebRTC data channel.  Pictures never leave the home.

   To the rest of the code nothing changes: fetch('/api/…'), EventSource('/api/events') and Reef.fishUrl(id)
   are answered here instead of by the network. */
(function () {
  'use strict';
  if (window.REEF_MODE !== 'static') return;
  var R = window.Reef;
  var nativeFetch = window.fetch.bind(window), NativeES = window.EventSource;
  var SIGNAL = window.REEF_SIGNAL || 'https://ntfy.sh';
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var path = location.pathname.split('/').pop() || '';
  var ROLE = /^scan/.test(path) ? 'phone' : /^tv/.test(path) ? 'tv' : null;
  if (!ROLE) return;

  var MAX_FISH = 60, CHUNK = 12000;
  var KNOWN = ['fish', 'angel', 'shark', 'dolphin', 'puffer', 'octopus', 'turtle', 'seahorse', 'jelly', 'crab', 'star', 'tang', 'clown',
    'a_angel', 'a_shark', 'a_dolphin', 'a_whale', 'a_turtle', 'a_octopus', 'a_jelly', 'a_seahorse', 'a_crab', 'a_manta'];
  var NAMES = ['פלפל', 'זית', 'פיסטוק', 'שקשוקה', "צ'יפס", 'שניצל', 'טורבו', 'גזר', 'פופקורן', 'קשת', 'חלווה', 'בועה', 'גל', 'נחשול', 'לימון', 'תפוז', 'מנטה', 'קרמבו', 'בורקס', 'פיקסל', "ג'לי", "קראנץ'", 'נענע', 'חומוס'];

  function noop() {}
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(''); }
  function sha(s) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function cleanName(s) {
    var t = String(s || '').replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f\u007f<>"'`\\\d‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
    return Array.from(t).slice(0, 12).join('').trim();
  }
  function resp(status, json) { return { status: status, json: json }; }

  // ── fish pictures as in-memory URLs ────────────────────────────────────────
  var urls = {};                                           // id -> blob: URL
  R.fishUrl = function (id) { return urls[id] || ''; };
  function setUrl(id, blob) { if (urls[id]) URL.revokeObjectURL(urls[id]); urls[id] = URL.createObjectURL(blob); }
  function dropUrl(id) { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
  function b64ToBlob(b64) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: 'image/png' }); }
  function blobToB64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = no; r.readAsDataURL(blob); }); }

  // ── fake EventSource for /api/events ───────────────────────────────────────
  var sources = [];
  function FakeES() {
    var me = this; me.L = {}; me.onopen = null; me.readyState = 0; sources.push(me);
    setTimeout(function () { me.readyState = 1; if (me.onopen) me.onopen({}); }, 0);
  }
  FakeES.prototype.addEventListener = function (t, fn) { (this.L[t] = this.L[t] || []).push(fn); };
  FakeES.prototype.close = function () { var i = sources.indexOf(this); if (i >= 0) sources.splice(i, 1); };
  function dispatchLocal(type, payload) { sources.slice().forEach(function (s) { (s.L[type] || []).forEach(function (fn) { try { fn({ data: JSON.stringify(payload || {}) }); } catch (e) { console.error(e); } }); }); }
  window.EventSource = function (url) { return /\/api\/events/.test(String(url)) ? new FakeES() : new NativeES(url); };

  // ── message chunking over a data channel ───────────────────────────────────
  function sendMsg(dc, obj) {
    if (!dc || dc.readyState !== 'open') return false;
    var s = JSON.stringify(obj), id = rand(6), n = Math.max(1, Math.ceil(s.length / CHUNK));
    for (var i = 0; i < n; i++) dc.send(JSON.stringify({ m: id, i: i, n: n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
    return true;
  }
  function receiver(onmsg) {
    var parts = {};
    return function (ev) {
      var c; try { c = JSON.parse(ev.data); } catch (e) { return; }
      var p = parts[c.m] || (parts[c.m] = { a: [], k: 0 });
      if (p.a[c.i] == null) { p.a[c.i] = c.d; p.k++; }
      if (p.k === c.n) { delete parts[c.m]; try { onmsg(JSON.parse(p.a.join(''))); } catch (e) { console.error(e); } }
    };
  }

  // ── signalling relay (handshake only) ──────────────────────────────────────
  function Signal(topic, onmsg) {
    var es = new NativeES(SIGNAL + '/' + topic + '/sse?since=15s');
    es.addEventListener('message', function (e) { try { onmsg(JSON.parse(JSON.parse(e.data).message)); } catch (x) {} });
    return {
      send: function (o) { return nativeFetch(SIGNAL + '/' + topic, { method: 'POST', body: JSON.stringify(o) }).catch(noop); },
      close: function () { try { es.close(); } catch (e) {} }
    };
  }
  function gathered(pc) {
    return new Promise(function (ok) {
      if (pc.iceGatheringState === 'complete') return ok();
      var t = setTimeout(done, 2500);
      function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); ok(); }
      function chk() { if (pc.iceGatheringState === 'complete') done(); }
      pc.addEventListener('icegatheringstatechange', chk);
    });
  }
  function topicFor(room) { return sha('doodle-sea:' + room).then(function (h) { return 'ds-' + h.slice(0, 32); }); }

  // ════════════════════════════════════════════════════════════════════════════
  //  TV: the hub
  // ════════════════════════════════════════════════════════════════════════════
  function idb() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('doodle-sea', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('fish', { keyPath: 'id' }); r.result.createObjectStore('png'); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    });
  }
  function tx(db, store, mode, fn) {
    return new Promise(function (ok, no) { var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { ok(out && out.result); }; t.onerror = function () { no(t.error); }; });
  }

  function startHub() {
    var db = null, fish = [], peers = {}, hubId = rand(8), sig = null, room = null, buckets = {};
    var ready;
    try { room = localStorage.getItem('reef.room'); } catch (e) {}
    if (!room) { room = rand(22); try { localStorage.setItem('reef.room', room); } catch (e) {} }

    function limited(key, max, ms) {
      var now = Date.now(), b = buckets[key] || (buckets[key] = { n: 0, t: now });
      if (now - b.t > ms) { b.n = 0; b.t = now; } b.n++; return b.n > max;
    }
    function freshName() { var used = {}; fish.forEach(function (f) { used[f.name] = 1; }); var free = NAMES.filter(function (n) { return !used[n]; }), pool = free.length ? free : NAMES; return pool[Math.floor(Math.random() * pool.length)]; }
    function emit(type, payload) {
      dispatchLocal(type, payload);
      Object.keys(peers).forEach(function (k) { var p = peers[k]; if (p.open) sendMsg(p.dc, { ev: type, d: payload || {} }); });
    }
    function pngDims(b64) {
      try { var bin = atob(b64.slice(0, 48)); if (bin.charCodeAt(1) !== 80) return null; var u = function (o) { return ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0; }; return { w: u(16), h: u(20) }; } catch (e) { return null; }
    }
    function saveRec(rec) { return tx(db, 'fish', 'readwrite', function (s) { return s.put(rec); }); }

    ready = idb().then(function (d) {
      db = d;
      return tx(db, 'fish', 'readonly', function (s) { return s.getAll(); });
    }).then(function (list) {
      fish = (list || []).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      return Promise.all(fish.map(function (f) { return tx(db, 'png', 'readonly', function (s) { return s.get(f.id); }).then(function (blob) { if (blob) setUrl(f.id, blob); }); }));
    }).then(function () { fish = fish.filter(function (f) { return urls[f.id]; }); });

    function handle(method, p, body, peer) {
      return ready.then(function () {
        var m;
        if (method === 'GET' && p === '/api/fish') return resp(200, fish);
        if (method === 'GET' && p === '/api/info') return resp(200, { urls: [], host: location.host, count: fish.length, max: MAX_FISH });
        if (method === 'GET' && (m = /^\/fish\/([a-z0-9]+)\.png$/.exec(p))) {
          return tx(db, 'png', 'readonly', function (s) { return s.get(m[1]); }).then(function (blob) { return blob ? blobToB64(blob).then(function (b) { return { status: 200, b64: b }; }) : resp(404, { error: 'no picture' }); });
        }
        if (method === 'POST' && p === '/api/fish') {
          if (limited('up:' + peer, 10, 60000)) return resp(429, { error: 'slow down a little' });
          var b = body || {}, kind = String(b.kind || '');
          if (KNOWN.indexOf(kind) < 0) return resp(400, { error: 'unknown creature' });
          var mm = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png || ''));
          if (!mm) return resp(400, { error: 'png expected' });
          var dim = pngDims(mm[1]); if (!dim || dim.w < 16 || dim.h < 16 || dim.w > 2400 || dim.h > 2400) return resp(400, { error: 'bad image size' });
          var cid = String(b.cid || '').slice(0, 40);
          if (cid) { var dup = fish.filter(function (f) { return f.cid === cid; })[0]; if (dup) return resp(200, strip(dup)); }
          var id = Date.now().toString(36) + rand(6), blob = b64ToBlob(mm[1]);
          var rec = { id: id, kind: kind, t: Date.now(), name: cleanName(b.name) || freshName(), cid: cid };
          return tx(db, 'png', 'readwrite', function (s) { return s.put(blob, id); }).then(function () { setUrl(id, blob); fish.push(rec); return saveRec(rec); }).then(function () {
            var gone = []; while (fish.length > MAX_FISH) gone.push(fish.shift());
            return Promise.all(gone.map(function (g) { dropUrl(g.id); return tx(db, 'fish', 'readwrite', function (s) { return s.delete(g.id); }).then(function () { return tx(db, 'png', 'readwrite', function (s) { return s.delete(g.id); }); }); })).then(function () {
              gone.forEach(function (g) { emit('remove', { id: g.id }); }); emit('add', strip(rec)); return resp(201, strip(rec));
            });
          });
        }
        var one = /^\/api\/fish\/([a-z0-9]+)$/.exec(p);
        if (method === 'DELETE' && one) {
          var i = fish.findIndex(function (f) { return f.id === one[1]; }); if (i < 0) return resp(404, { error: 'no such fish' });
          fish.splice(i, 1); dropUrl(one[1]);
          return tx(db, 'fish', 'readwrite', function (s) { return s.delete(one[1]); }).then(function () { return tx(db, 'png', 'readwrite', function (s) { return s.delete(one[1]); }); }).then(function () { emit('remove', { id: one[1] }); return resp(200, { ok: true }); });
        }
        if (method === 'PATCH' && one) {
          var f = fish.filter(function (x) { return x.id === one[1]; })[0]; if (!f) return resp(404, { error: 'no such fish' });
          var nm = cleanName((body || {}).name); if (!nm) return resp(400, { error: 'name needed' });
          f.name = nm; return saveRec(f).then(function () { emit('rename', { id: f.id, name: nm }); return resp(200, strip(f)); });
        }
        if (method === 'POST' && p === '/api/feed') { if (limited('feed:' + peer, 4, 6000)) return resp(429, { error: 'enough for now' }); var x = Math.min(0.95, Math.max(0.05, +(body || {}).x || Math.random())); emit('feed', { x: x, n: 9 }); return resp(200, { ok: true }); }
        if (method === 'POST' && p === '/api/wave') { if (limited('wave:' + peer, 3, 5000)) return resp(429, { error: 'enough for now' }); emit('wave', {}); return resp(200, { ok: true }); }
        if (method === 'POST' && p === '/api/poke') {
          var d = body || {}, pid = String(d.id || ''), action = String(d.action || '');
          if (!fish.some(function (q) { return q.id === pid; }) || ['jump', 'bubbles', 'hello', 'find'].indexOf(action) < 0) return resp(400, { error: 'bad poke' });
          if (limited('poke:' + pid, 1, 2000)) return resp(429, { error: 'one at a time' });
          emit('poke', { id: pid, action: action }); return resp(200, { ok: true });
        }
        return resp(404, { error: 'not found' });
      });
    }
    function strip(f) { return { id: f.id, kind: f.kind, t: f.t, name: f.name }; }

    // ── peers ────────────────────────────────────────────────────────────────
    function addPeer(from) {
      if (peers[from] && (peers[from].open || Date.now() - peers[from].t < 8000)) return;
      if (peers[from]) closePeer(from);
      var pc = new RTCPeerConnection({ iceServers: ICE }), dc = pc.createDataChannel('api'), P = peers[from] = { pc: pc, dc: dc, open: false, t: Date.now() };
      dc.onopen = function () { P.open = true; dispatchEvent(new Event('reef:peers')); };
      dc.onclose = function () { closePeer(from); };
      dc.onmessage = receiver(function (m) {
        if (!m.rq) return;
        handle(m.rq[0], m.rq[1], m.rq[2], from).then(function (r) { sendMsg(dc, { m: m.m, rs: r }); }, function () { sendMsg(dc, { m: m.m, rs: resp(500, { error: 'failed' }) }); });
      });
      pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(from); };
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); }).then(function () {
        sig.send({ t: 'offer', to: from, from: hubId, sdp: pc.localDescription.sdp });
      }).catch(function () { closePeer(from); });
      setTimeout(function () { if (peers[from] === P && !P.open) closePeer(from); }, 30000);
    }
    function closePeer(id) { var P = peers[id]; if (!P) return; delete peers[id]; try { P.dc.close(); } catch (e) {} try { P.pc.close(); } catch (e) {} dispatchEvent(new Event('reef:peers')); }
    function listen() {
      topicFor(room).then(function (topic) {
        sig = Signal(topic, function (m) {
          if (m.t === 'hello' && m.from) addPeer(m.from);
          else if (m.t === 'answer' && m.to === hubId && peers[m.from] && !peers[m.from].open) peers[m.from].pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(noop);
        });
      });
    }
    listen();

    R.joinInfo = { room: room };
    function join() { var base = location.href.split('#')[0].replace(/[^/]*$/, ''); return base + 'scan.html#r=' + room; }
    R.joinInfo.url = join();
    R.joinInfo.label = location.host + location.pathname.replace(/[^/]*$/, '') + 'scan.html';
    R.peerCount = function () { return Object.keys(peers).filter(function (k) { return peers[k].open; }).length; };
    R.newRoom = function () {                           // a fresh QR: old phones can no longer join
      Object.keys(peers).forEach(closePeer); if (sig) sig.close();
      room = rand(22); try { localStorage.setItem('reef.room', room); } catch (e) {}
      R.joinInfo.room = room; R.joinInfo.url = join(); listen(); location.reload();
    };

    window.fetch = function (input, opts) {
      var u; try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return nativeFetch(input, opts); }
      if (u.origin !== location.origin || u.pathname.indexOf('/api/') !== 0) return nativeFetch(input, opts);
      var method = ((opts && opts.method) || 'GET').toUpperCase(), body = null;
      try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
      return handle(method, u.pathname, body, 'tv').then(function (r) { return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } }); });
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phone: the client
  // ════════════════════════════════════════════════════════════════════════════
  function startPhone() {
    var room = null;
    var m = /[#&]r=([a-z0-9]+)/.exec(location.hash);
    try { if (m) { room = m[1]; localStorage.setItem('reef.joinRoom', room); } else room = localStorage.getItem('reef.joinRoom'); } catch (e) { room = m && m[1]; }
    document.addEventListener('DOMContentLoaded', function () {
      var off = document.getElementById('off');
      if (off) off.textContent = room ? 'מתחברים לטלוויזיה… אם זה נתקע, סרקו שוב את הקוד שעל המסך.' : 'פתחו את הדף הזה דרך קוד ה-QR שמוצג על הטלוויזיה.';
    });
    var cid = rand(8), dc = null, pc = null, open = false, sig = null, pending = {}, waiters = [], retry = 0, helloTimer = 0;

    function onOpen() { open = true; clearInterval(helloTimer); retry = 0; waiters.splice(0).forEach(function (w) { w(); }); sources.forEach(function (s) { if (s.onopen) s.onopen({}); }); }
    function onClose() {
      if (!open && !dc) return; open = false; dc = null; try { pc.close(); } catch (e) {}
      Object.keys(pending).forEach(function (k) { pending[k].no(new TypeError('Failed to fetch')); delete pending[k]; });
      setTimeout(connect, Math.min(8000, 1000 * ++retry));
    }
    function ensurePng(id) {
      if (urls[id]) return Promise.resolve();
      return rpc('GET', '/fish/' + id + '.png').then(function (r) { if (r.b64) setUrl(id, b64ToBlob(r.b64)); });
    }
    var incoming = receiver(function (msg) {
      if (msg.rs && pending[msg.m]) { var p = pending[msg.m]; delete pending[msg.m]; p.ok(msg.rs); return; }
      if (!msg.ev) return;
      if (msg.ev === 'add') ensurePng(msg.d.id).then(function () { dispatchLocal('add', msg.d); });
      else { if (msg.ev === 'remove') dropUrl(msg.d.id); dispatchLocal(msg.ev, msg.d); }
    });
    function connect() {
      if (!room) return;
      cid = rand(8); open = false;
      if (sig) sig.close();
      topicFor(room).then(function (topic) {
        sig = Signal(topic, function (p) {
          if (p.t !== 'offer' || p.to !== cid) return;
          pc = new RTCPeerConnection({ iceServers: ICE });
          pc.ondatachannel = function (e) { dc = e.channel; dc.onmessage = incoming; dc.onopen = onOpen; dc.onclose = onClose; if (dc.readyState === 'open') onOpen(); };
          pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') onClose(); };
          pc.setRemoteDescription({ type: 'offer', sdp: p.sdp }).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return gathered(pc); }).then(function () {
            sig.send({ t: 'answer', to: p.from, from: cid, sdp: pc.localDescription.sdp });
          }).catch(noop);
        });
        var hello = function () { if (!open) sig.send({ t: 'hello', from: cid }); };
        setTimeout(hello, 400); clearInterval(helloTimer); helloTimer = setInterval(hello, 3000);
      });
    }
    function whenReady() {
      if (open) return Promise.resolve();
      if (!room) return Promise.reject(new TypeError('Failed to fetch'));
      return new Promise(function (ok, no) { var t = setTimeout(function () { no(new TypeError('Failed to fetch')); }, 25000); waiters.push(function () { clearTimeout(t); ok(); }); });
    }
    function rpc(method, p, body) {
      return whenReady().then(function () {
        return new Promise(function (ok, no) {
          var id = rand(8), t = setTimeout(function () { delete pending[id]; no(new TypeError('Failed to fetch')); }, 30000);
          pending[id] = { ok: function (r) { clearTimeout(t); ok(r); }, no: function (e) { clearTimeout(t); no(e); } };
          if (!sendMsg(dc, { m: id, rq: [method, p, body == null ? null : body] })) { clearTimeout(t); delete pending[id]; no(new TypeError('Failed to fetch')); }
        });
      });
    }
    window.fetch = function (input, opts) {
      var u; try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return nativeFetch(input, opts); }
      if (u.origin !== location.origin || u.pathname.indexOf('/api/') !== 0) return nativeFetch(input, opts);
      var method = ((opts && opts.method) || 'GET').toUpperCase(), body = null;
      try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
      return rpc(method, u.pathname, body).then(function (r) {
        var done = function () { return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } }); };
        if (method === 'GET' && u.pathname === '/api/fish' && Array.isArray(r.json)) return Promise.all(r.json.map(function (f) { return ensurePng(f.id).catch(noop); })).then(done);
        if (method === 'POST' && u.pathname === '/api/fish' && r.json && r.json.id) return ensurePng(r.json.id).catch(noop).then(done);
        return done();
      });
    };
    connect();
    addEventListener('online', function () { if (!open) connect(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !open) connect(); });
  }

  if (ROLE === 'tv') startHub(); else startPhone();
})();
