const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8205/scan'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/p_scan.png' });
  await p.setInputFiles('#fGal', '/tmp/photo_0.jpg'); await p.waitForSelector('#preview', { state: 'visible', timeout: 30000 }); await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/p_prev.png' });
  await p.click('#send'); await p.waitForSelector('#done', { state: 'visible' }); await p.waitForTimeout(700); await p.screenshot({ path: '/tmp/p_done.png' });
  await p.click('#doneFind'); await p.waitForTimeout(300);
  await p.click('nav button[data-t=fish]'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/p_fish.png' });
  await p.click('#gallery .g'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/p_sheet.png' });
  const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://localhost:8205/print?sel=a_shark,clown'); await q.waitForTimeout(600); const n = await q.textContent('#count'); await q.screenshot({ path: '/tmp/p_print.png' });
  await q.goto('http://localhost:8205/'); await q.waitForTimeout(300); await q.screenshot({ path: '/tmp/p_index.png' });
  console.log(n, errs); await b.close();
})();
