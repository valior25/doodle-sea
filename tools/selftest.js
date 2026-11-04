// Server self-test (Node only, no dependencies):  node tools/selftest.js [port]   — run while the server is up.
const http = require('http'), zlib = require('zlib');
const PORT = +process.argv[2] || 8000; let fails = 0;
function crc(b) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
function png(w, h) { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; const raw = Buffer.alloc((w * 4 + 1) * h, 0x80); return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
function req(method, path, body, headers) { return new Promise((res, rej) => { const d = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body)); const r = http.request({ port: PORT, host: '127.0.0.1', method, path, headers: Object.assign({ 'X-Reef': '1' }, d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, headers || {}) }, x => { const ch = []; x.on('data', c => ch.push(c)); x.on('end', () => { const t = Buffer.concat(ch); let j = null; try { j = JSON.parse(t.toString()); } catch (e) {} res({ s: x.statusCode, j, t, h: x.headers }); }); }); r.on('error', rej); if (d) r.write(d); r.end(); }); }
function ok(c, name, extra) { console.log((c ? '  ✓ ' : '  ✕ ') + name + (c || !extra ? '' : '  → ' + extra)); if (!c) fails++; }
(async () => {
  console.log('Doodle Sea server self-test, port ' + PORT);
  const pages = ['/', '/tv', '/scan', '/print', '/check', '/creatures.js', '/art/a_shark.svg', '/fonts/rubik-hebrew-400-normal.woff2'];
  for (const p of pages) { const r = await req('GET', p); ok(r.s === 200 && r.t.length > 100, 'GET ' + p, r.s); }
  const info = await req('GET', '/api/info'); ok(info.s === 200 && Array.isArray(info.j.urls), 'api/info');
  const dataURL = 'data:image/png;base64,' + png(64, 48).toString('base64');
  const up = await req('POST', '/api/fish', { kind: 'a_shark', png: dataURL, cid: 'st' + Date.now() }); ok(up.s === 201 && up.j.id, 'upload fish', up.s);
  const id = up.j && up.j.id;
  const again = await req('POST', '/api/fish', { kind: 'a_shark', png: dataURL, cid: 'dup' }); const dup = await req('POST', '/api/fish', { kind: 'a_shark', png: dataURL, cid: 'dup' }); ok(again.j.id === dup.j.id, 'same cid does not duplicate');
  const list = await req('GET', '/api/fish'); ok(list.j.some(f => f.id === id), 'fish listed');
  const pic = await req('GET', '/fish/' + id + '.png'); ok(pic.s === 200 && pic.h['content-type'] === 'image/png', 'fish picture served');
  const pa = await req('PATCH', '/api/fish/' + id, { name: 'בדיקה' }); ok(pa.s === 200 && pa.j.name === 'בדיקה', 'rename');
  ok((await req('PATCH', '/api/fish/' + id, { name: '<b>x</b>' })).j.name === 'bx/b', 'name sanitised');
  ok((await req('POST', '/api/feed', {})).s === 200, 'feed'); ok((await req('POST', '/api/poke', { id, action: 'find' })).s === 200, 'poke');
  ok((await req('POST', '/api/fish', { kind: 'nope', png: dataURL })).s === 400, 'unknown creature rejected');
  ok((await req('POST', '/api/fish', { kind: 'a_shark', png: 'data:image/png;base64,AAAA' })).s === 400, 'bad png rejected');
  ok((await req('POST', '/api/fish', '{bad', { 'Content-Type': 'application/json' })).s === 400, 'bad json rejected');
  ok((await req('POST', '/api/fish', '{}', { 'Content-Type': 'text/plain', 'X-Reef': '' })).s === 415, 'plain POST refused');
  ok((await req('POST', '/api/feed', {}, { Origin: 'http://evil.example' })).s === 403, 'foreign Origin refused');
  ok((await req('GET', '/%2e%2e/%2e%2e/etc/passwd')).s === 404, 'path traversal blocked');
  ok((await req('GET', '/%E0%A4%A')).s === 400, 'malformed URL = 400');
  const del = await req('DELETE', '/api/fish/' + id); ok(del.s === 200, 'delete'); ok((await req('GET', '/fish/' + id + '.png')).s === 404, 'picture gone');
  ok((await req('DELETE', '/api/fish/' + id)).s === 404, 'delete twice = 404');
  // SSE
  const got = await new Promise(res => { const r = http.get({ port: PORT, host: '127.0.0.1', path: '/api/events' }, x => { x.on('data', c => { if (/event: feed/.test(c.toString())) { r.destroy(); res(true); } }); setTimeout(() => req('POST', '/api/feed', {}), 300); }); setTimeout(() => { r.destroy(); res(false); }, 4000); r.on('error', () => {}); });
  ok(got, 'live events (SSE)');
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  ✕ could not reach the server: ' + e.message); process.exit(1); });
