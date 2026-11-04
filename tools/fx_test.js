const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8000/tv?nohero&demo=0&q=2&time=night'); await p.waitForTimeout(7000);
  await p.screenshot({ path: '/tmp/fx_night.png' });
  // birth ceremony
  const png = fs.readFileSync('/tmp/cut_5.png').toString('base64');
  await p.evaluate(async (png) => { await fetch('/api/fish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reef': '1' }, body: JSON.stringify({ kind: 'a_angel', png: 'data:image/png;base64,' + png }) }); }, png);
  await p.waitForTimeout(900); await p.screenshot({ path: '/tmp/fx_birth1.png' });
  await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/fx_birth2.png' });
  await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/fx_birth3.png' });
  // tap a fish
  await p.evaluate(() => ReefTV.setSky('day'));
  await p.waitForTimeout(6000);
  const pos = await p.evaluate(() => { const f = __reef.fishes().filter(f => !f.hidden && !f.floor() && f.kind === 'a_shark')[0] || __reef.fishes().filter(f => !f.hidden && !f.floor())[0]; return { x: f.x, y: f.y, id: f.id }; });
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(350);
  await p.screenshot({ path: '/tmp/fx_tap.png' });
  console.log('errors:', JSON.stringify(errs), 'fish:', await p.evaluate(() => __reef.fishes().length), 'quality:', await p.evaluate(() => ReefTV.quality()));
  await b.close();
})();
