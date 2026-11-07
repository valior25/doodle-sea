// End-to-end test of the static build: a mock ntfy relay + static file server + two browser pages (TV and phone).
//   node tools/build_web.js && node tools/web_test.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web');
const subs = {};                                   // topic -> Set(res)
const relay = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const m = /^\/([^/]+)(\/sse)?/.exec(req.url);
  if (req.method === 'GET' && m && m[2]) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('event: open\ndata: {}\n\n');
    (subs[m[1]] = subs[m[1]] || new Set()).add(res); req.on('close', () => subs[m[1]].delete(res)); return;
  }
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    (subs[m[1]] || []).forEach(r => r.write('event: message\ndata: ' + JSON.stringify({ event: 'message', message: b }) + '\n\n'));
    res.writeHead(200); res.end('{}');
  });
});
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const site = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]), f = path.join(WEB, p === '/' ? 'index.html' : p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await new Promise(r => relay.listen(8911, r)); await new Promise(r => site.listen(8910, r));
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const init = 'window.REEF_SIGNAL="http://localhost:8911";';
  const tvCtx = await b.newContext({ viewport: { width: 1280, height: 720 } }), phCtx = await b.newContext({ viewport: { width: 390, height: 800 } });
  await tvCtx.addInitScript(init); await phCtx.addInitScript(init);
  const tv = await tvCtx.newPage(), ph = await phCtx.newPage();
  const errs = []; tv.on('pageerror', e => errs.push('tv ' + e.message)); ph.on('pageerror', e => errs.push('ph ' + e.message));
  await tv.goto('http://localhost:8910/tv.html'); await tv.waitForTimeout(1200);
  const join = await tv.evaluate(() => Reef.joinInfo.url);
  ok(/scan\.html#r=[a-z0-9]{22}$/.test(join), 'TV makes a join URL: ' + join);
  await ph.goto(join); await ph.waitForTimeout(500);
  await tv.waitForFunction(() => Reef.peerCount() === 1, null, { timeout: 20000 }).catch(() => {});
  const peers = await tv.evaluate(() => Reef.peerCount());
  ok(peers === 1, 'phone connected to TV (peers=' + peers + ')');
  // upload a fish through the phone's fetch (same path scan.js uses)
  const png = await ph.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#f80'; x.beginPath(); x.ellipse(60, 60, 50, 30, 0, 0, 7); x.fill(); return c.toDataURL('image/png'); });
  const rec = await ph.evaluate(async png => { const r = await Reef.api('POST', '/api/fish', { kind: 'a_whale', png, cid: Reef.cid(), name: 'בדיקה' }); return r; }, png);
  ok(rec && rec.id && rec.name === 'בדיקה', 'upload from phone returns the record');
  await tv.waitForTimeout(800);
  const tvList = await tv.evaluate(() => fetch('/api/fish').then(r => r.json()));
  ok(tvList.length === 1 && tvList[0].id === rec.id, 'TV stored the fish');
  const tvImg = await tv.evaluate(id => Reef.fishUrl(id).slice(0, 5), rec.id), phImg = await ph.evaluate(id => Reef.fishUrl(id).slice(0, 5), rec.id);
  ok(tvImg === 'blob:' && phImg === 'blob:', 'picture available on both screens');
  await ph.evaluate(id => Reef.api('PATCH', '/api/fish/' + id, { name: 'דני' }), rec.id);
  const nm = await tv.evaluate(() => fetch('/api/fish').then(r => r.json()).then(l => l[0].name));
  ok(nm === 'דני', 'rename from phone reaches TV');
  await ph.evaluate(() => Reef.api('POST', '/api/feed', {}));
  // refresh the TV: fish persist (IndexedDB), same QR
  await tv.reload(); await tv.waitForTimeout(1500);
  const after = await tv.evaluate(() => fetch('/api/fish').then(r => r.json()).then(l => ({ n: l.length, url: Reef.joinInfo.url })));
  ok(after.n === 1 && after.url === join, 'after reload: fish kept, same QR');
  await tv.screenshot({ path: '/tmp/web_tv.png' });
  await ph.evaluate(id => Reef.api('DELETE', '/api/fish/' + id), rec.id);
  const left = await tv.evaluate(() => fetch('/api/fish').then(r => r.json()).then(l => l.length));
  ok(left === 0, 'delete from phone works');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); process.exit(process.exitCode || 0);
})();
