#!/usr/bin/env node
/* Doodle Sea — tiny zero-dependency server.
   Serves the pages, stores scanned fish, and pushes live events to the TV.  Run:  node server.js   (PORT=8000 by default)

   Safety on a home Wi-Fi (kids + guests + other web pages open on phones):
     · every change (POST/PATCH/DELETE) must come from our own pages: same-origin + JSON/X-Reef header (blocks other sites)
     · rate limits per client on uploads, feeding and pokes · size/shape checks on uploaded PNGs
     · a corrupt fish.json never wipes the aquarium: it is kept aside and the list is rebuilt from the PNG files   */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.REEF_DATA || path.join(ROOT, 'data');
const FISH_DIR = path.join(DATA, 'fish');
const DB = path.join(DATA, 'fish.json');
const MAX_FISH = +process.env.MAX_FISH || 60;     // oldest swim away when exceeded
const MAX_BODY = 6 * 1024 * 1024;

fs.mkdirSync(FISH_DIR, { recursive: true });

// ── names ──────────────────────────────────────────────────────────────────
const NAMES = ['פלפל', 'זית', 'פיסטוק', 'שקשוקה', "צ'יפס", 'שניצל', 'טורבו', 'גזר', 'פופקורן', 'קשת', 'חלווה', 'בועה', 'גל', 'נחשול', 'לימון', 'תפוז', 'מנטה', 'קרמבו', 'בורקס', 'פיקסל', "ג'לי", "קראנץ'", 'נענע', 'חומוס'];
function cleanName(s) {                           // 12 chars, no digits / links / control characters
  return String(s || '').replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f\u007f<>"'`\\\d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().split('').length ? Array.from(String(s || '').replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f\u007f<>"'`\\\d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('').trim() : '';
}
function freshName() {
  const used = new Set(fish.map(f => f.name));
  const free = NAMES.filter(n => !used.has(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── storage ────────────────────────────────────────────────────────────────
let fish = [];
function loadFish() {
  let list = null;
  try { list = JSON.parse(fs.readFileSync(DB, 'utf8')); if (!Array.isArray(list)) throw new Error('not a list'); list = list.filter(x => x && typeof x.id === 'string' && /^[a-z0-9]+$/.test(x.id)); }
  catch (e) {
    if (fs.existsSync(DB)) {                      // corrupt file: keep it, never overwrite it silently
      try { fs.renameSync(DB, DB + '.bad-' + Date.now()); console.error('fish.json was unreadable; kept as fish.json.bad-*, rebuilding from PNG files'); } catch (e2) {}
    }
    list = [];
  }
  const known = new Set(list.map(f => f.id));
  try {                                           // adopt orphan PNGs (e.g. after a corrupt/missing database)
    fs.readdirSync(FISH_DIR).filter(n => /^[a-z0-9]+\.png$/.test(n)).forEach(n => {
      const id = n.slice(0, -4);
      if (!known.has(id)) list.push({ id, kind: 'fish', t: fs.statSync(path.join(FISH_DIR, n)).mtimeMs, name: '' });
    });
  } catch (e) {}
  list = list.filter(f => fs.existsSync(path.join(FISH_DIR, f.id + '.png')));
  list.sort((a, b) => (a.t || 0) - (b.t || 0));
  fish = list;
  fish.forEach(f => { if (!f.name) f.name = freshName(); });
  save();
}
function save() { try { fs.writeFileSync(DB + '.tmp', JSON.stringify(fish)); fs.renameSync(DB + '.tmp', DB); } catch (e) { console.error('save failed', e.message); } }
loadFish();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

// ── live events (Server-Sent Events) ───────────────────────────────────────
const clients = new Set();
function broadcast(type, payload) {
  const msg = 'event: ' + type + '\ndata: ' + JSON.stringify(payload || {}) + '\n\n';
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

function lanUrls() {
  // Rank addresses: real home/office Wi-Fi first, virtual adapters (VirtualBox, WSL, Docker, VPN) last.
  const out = [];
  let nets = {}; try { nets = os.networkInterfaces(); } catch (e) {}      // can throw on some Android builds
  for (const name of Object.keys(nets)) for (const n of nets[name] || []) {
    if (n.family !== 'IPv4' || n.internal) continue;
    const a = n.address, p = a.split('.').map(Number);
    let rank = 5;
    if (a.startsWith('192.168.')) rank = (a.startsWith('192.168.56.') || a.startsWith('192.168.99.')) ? 6 : 1;
    else if (p[0] === 10) rank = 2;
    else if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) rank = 7;
    else if (p[0] === 169) rank = 9;
    if (/virtual|vbox|vmware|wsl|hyper|docker|vethernet|tailscale|zerotier|vpn/i.test(name)) rank += 5;
    if (/wi-?fi|wlan|wireless/i.test(name)) rank -= 0.5;
    out.push({ url: 'http://' + a + ':' + PORT, rank, name });
  }
  out.sort((x, y) => x.rank - y.rank);
  return out.map(o => o.url);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── guards ─────────────────────────────────────────────────────────────────
function hostOk(h) {                               // only the machine itself, a LAN address or a *.local name (blocks DNS-rebinding names)
  const n = String(h || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return !!n && (/^[\d.]+$/.test(n) || n.indexOf(':') >= 0 || n === 'localhost' || /\.(local|lan|home|localdomain)$/.test(n) || n.indexOf('.') < 0);
}
function sameOrigin(req) {                         // a page on another site cannot drive our API
  if (!hostOk(req.headers.host)) return false;
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}
const buckets = new Map();                          // key -> {n, t}
function limited(key, max, windowMs) {
  if (process.env.REEF_NO_LIMIT === '1') return false;     // tests only
  const now = Date.now(), b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(key, b);
  if (buckets.size > 2000) for (const [k, v] of buckets) if (now - v.t > 120000) buckets.delete(k);
  return b.n > max;
}
const recentCid = new Map();                        // idempotency: client id -> record
function pngSize(buf) { return buf.length > 24 && buf.slice(1, 4).toString() === 'PNG' ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null; }

const KNOWN = ['fish', 'angel', 'shark', 'dolphin', 'puffer', 'octopus', 'turtle', 'seahorse', 'jelly', 'crab', 'star', 'tang', 'clown',
  'a_angel', 'a_shark', 'a_dolphin', 'a_whale', 'a_turtle', 'a_octopus', 'a_jelly', 'a_seahorse', 'a_crab', 'a_manta'];

async function api(req, res, url) {
  const u = new URL(url, 'http://x');
  const p = u.pathname, ip = req.socket.remoteAddress || '?';

  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'GET' && p === '/api/fish') return json(res, 200, fish);
  if (req.method === 'GET' && p === '/api/info') return json(res, 200, { urls: lanUrls(), host: req.headers.host || '', count: fish.length, max: MAX_FISH });

  // everything below changes something
  if (!sameOrigin(req)) return json(res, 403, { error: 'cross-site request refused' });
  const ctype = String(req.headers['content-type'] || '');
  if (req.method !== 'DELETE' && !/^application\/json/i.test(ctype) && req.headers['x-reef'] !== '1') return json(res, 415, { error: 'json expected' });

  async function body() { try { const t = (await readBody(req)).toString('utf8'); return t ? JSON.parse(t) : {}; } catch (e) { return null; } }

  if (req.method === 'POST' && p === '/api/fish') {
    if (limited('up:' + ip, +process.env.REEF_UPLOAD_LIMIT || 10, 60000)) return json(res, 429, { error: 'slow down a little' });
    const b = await body(); if (!b) return json(res, 400, { error: 'bad json' });
    const cid = String(b.cid || '').slice(0, 40);
    if (cid && recentCid.has(cid)) return json(res, 200, recentCid.get(cid));            // a retry of the same upload
    const kind = String(b.kind || '');
    if (KNOWN.indexOf(kind) < 0) return json(res, 400, { error: 'unknown creature' });
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png || ''));
    if (!m) return json(res, 400, { error: 'png expected' });
    const buf = Buffer.from(m[1], 'base64'), dim = pngSize(buf);
    if (!dim || dim.w < 16 || dim.h < 16 || dim.w > 2400 || dim.h > 2400) return json(res, 400, { error: 'bad image size' });
    const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    fs.writeFileSync(path.join(FISH_DIR, id + '.png'), buf);
    const rec = { id, kind, t: Date.now(), name: cleanName(b.name) || freshName() };
    fish.push(rec);
    const gone = [];
    while (fish.length > MAX_FISH) { const old = fish.shift(); gone.push(old.id); try { fs.unlinkSync(path.join(FISH_DIR, old.id + '.png')); } catch (e) {} }
    save();
    if (cid) { recentCid.set(cid, rec); if (recentCid.size > 60) recentCid.delete(recentCid.keys().next().value); }
    gone.forEach(g => broadcast('remove', { id: g }));
    broadcast('add', rec);
    return json(res, 201, rec);
  }

  const one = /^\/api\/fish\/([a-z0-9]+)$/.exec(p);
  if (req.method === 'DELETE' && one) {
    if (limited('del:' + ip, 30, 60000)) return json(res, 429, { error: 'slow down' });
    const i = fish.findIndex(f => f.id === one[1]);
    if (i < 0) return json(res, 404, { error: 'no such fish' });
    fish.splice(i, 1); save();
    try { fs.unlinkSync(path.join(FISH_DIR, one[1] + '.png')); } catch (e) {}
    broadcast('remove', { id: one[1] });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'PATCH' && one) {
    const b = await body(); if (!b) return json(res, 400, { error: 'bad json' });
    const f = fish.find(x => x.id === one[1]); if (!f) return json(res, 404, { error: 'no such fish' });
    const nm = cleanName(b.name); if (!nm) return json(res, 400, { error: 'name needed' });
    f.name = nm; save(); broadcast('rename', { id: f.id, name: nm });
    return json(res, 200, f);
  }

  if (req.method === 'POST' && p === '/api/feed') {
    if (limited('feed:' + ip, 4, 6000)) return json(res, 429, { error: 'enough for now' });
    const b = (await body()) || {};
    const x = Math.min(0.95, Math.max(0.05, +b.x || Math.random()));
    broadcast('feed', { x, n: 9 });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/wave') {            // a gentle "hello" ripple from the phone
    if (limited('wave:' + ip, 3, 5000)) return json(res, 429, { error: 'enough for now' });
    broadcast('wave', {});
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/poke') {            // phone remote: make ONE fish react / show itself
    const b = await body(); if (!b) return json(res, 400, { error: 'bad json' });
    const id = String(b.id || ''), action = String(b.action || '');
    if (!fish.some(f => f.id === id) || ['jump', 'bubbles', 'hello', 'find'].indexOf(action) < 0) return json(res, 400, { error: 'bad poke' });
    if (limited('poke:' + id, 1, 2000)) return json(res, 429, { error: 'one at a time' });
    broadcast('poke', { id, action });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'not found' });
}

function serveFile(req, res, file, extra) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const headers = Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }, extra || {});   // always revalidate: updated pages show up on a normal refresh
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));        // audio needs byte ranges so the song can be rewound / sought
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], end) : end; } else { start = Math.max(0, st.size - +m[2]); }
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      code = 206; headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(code, headers);
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(file, { start, end }); rs.on('error', () => { try { res.destroy(); } catch (e) {} }); res.on('close', () => rs.destroy()); rs.pipe(res);
  });
}

const PAGES = { '/': 'index.html', '/tv': 'tv.html', '/scan': 'scan.html', '/print': 'print.html', '/check': 'check.html' };

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    let pathname; try { pathname = decodeURIComponent(url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad url'); }
    if (pathname.startsWith('/api/')) return await api(req, res, url);
    if (pathname.startsWith('/fish/')) {
      const name = path.basename(pathname);
      if (!/^[a-z0-9]+\.png$/.test(name)) { res.writeHead(404); return res.end(); }
      return serveFile(req, res, path.join(FISH_DIR, name), { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    if (PAGES[pathname]) return serveFile(req, res, path.join(PUBLIC, PAGES[pathname]), { 'Cache-Control': 'no-cache' });
    const rel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    return serveFile(req, res, file, { 'Cache-Control': 'no-cache' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500); }
    res.end('error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🐠  Doodle Sea is running\n');
  console.log('  TV screen :  http://localhost:' + PORT + '/tv');
  lanUrls().forEach(u => console.log('  On your Wi-Fi: ' + u + '   (open /scan on the phone)'));
  console.log('');
});
