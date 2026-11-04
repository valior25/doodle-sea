// Takes the README screenshots.  usage: node tools/shots.js <filledPort> <emptyPort> <outDir>
const { chromium } = require('playwright'); const fs = require('fs');
const [FULL, EMPTY, OUT] = [process.argv[2] || '8240', process.argv[3] || '8241', process.argv[4] || 'docs/screens'];
fs.mkdirSync(OUT, { recursive: true });
const W = 1600, H = 900, wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const mk = async (port, vp, extra) => { const c = await b.newContext(Object.assign({ viewport: vp, deviceScaleFactor: 1 }, extra || {})); const p = await c.newPage(); p.on('pageerror', e => console.log('pageerror', e.message)); await p.addInitScript(() => { try { localStorage.setItem('reef.music1', JSON.stringify({ on: false, vol: 0.4 })); } catch (e) {} }); return p; };
  // 1 hero (empty aquarium)
  let p = await mk(EMPTY, { width: W, height: H }); await p.goto(`http://localhost:${EMPTY}/tv`); await wait(7000); await p.screenshot({ path: `${OUT}/01-hero.jpg` });
  // 2 aquarium with fish + QR chip
  p = await mk(FULL, { width: W, height: H }); await p.goto(`http://localhost:${FULL}/tv`); await wait(12000); await p.screenshot({ path: `${OUT}/02-aquarium.jpg` });
  // 2b night
  await p.mouse.move(700, 300); await p.click('#menuBtn'); await wait(700); await p.screenshot({ path: `${OUT}/03-menu-fish.jpg` });
  // fish sheet
  const g = p.locator('#mGallery .g').first(); if (await g.count()) { await g.click(); await wait(700); await p.screenshot({ path: `${OUT}/04-menu-fish-card.jpg` }); await p.mouse.click(40, 40); await wait(400); }
  await p.click('.tab[data-t="add"]'); await wait(500); await p.screenshot({ path: `${OUT}/05-menu-add.jpg` });
  await p.click('.tab[data-t="set"]'); await wait(500); await p.screenshot({ path: `${OUT}/06-menu-settings.jpg` });
  await p.evaluate(() => { const s = document.querySelector('#menu .pane.on, #menu .pane:not([hidden])'); const sc = document.querySelector('#menu'); (s || sc).scrollTop = 99999; document.querySelectorAll('#menu *').forEach(e => { if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = 99999; }); }); await wait(500); await p.screenshot({ path: `${OUT}/07-menu-settings-sky.jpg` });
  await p.click('#mSky [data-s="night"]'); await wait(400); await p.click('#mClose'); await wait(3500); await p.screenshot({ path: `${OUT}/08-night.jpg` });
  await p.mouse.move(800, 400); await wait(300); await p.click('#menuBtn'); await wait(500); await p.click('.tab[data-t="set"]'); await p.click('#mSky [data-s="dusk"]'); await p.click('#mClose'); await wait(3500); await p.screenshot({ path: `${OUT}/09-dusk.jpg` });
  await p.mouse.move(820, 420); await wait(300); await p.click('#menuBtn'); await wait(500); await p.click('.tab[data-t="set"]'); await p.click('#mSky [data-s="day"]'); await p.click('#mClose'); await wait(1500);
  // 3 phone
  const ph = { width: 390, height: 844 }; const phone = async () => { const c = await b.newContext({ viewport: ph, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const q = await c.newPage(); q.on('pageerror', e => console.log('pageerror', e.message)); return q; };
  let q = await phone(); await q.goto(`http://localhost:${FULL}/scan`); await wait(900); await q.screenshot({ path: `${OUT}/10-phone-scan.jpg` });
  await q.setInputFiles('#fGal', '/tmp/demo/a_dolphin__1.jpg'); await q.waitForSelector('#preview', { state: 'visible', timeout: 25000 }); await q.fill('#fname', 'דני הדולפין'); await wait(500); await q.screenshot({ path: `${OUT}/11-phone-preview.jpg` });
  await q.click('#send'); await q.waitForSelector('#done', { state: 'visible' }); await wait(900); await q.screenshot({ path: `${OUT}/12-phone-done.jpg` });
  await q.goto(`http://localhost:${FULL}/scan`); await wait(600); const tabs = await q.$$('.tabbar button, nav button, .tabs button'); if (tabs.length >= 3) { await tabs[1].click(); await wait(500); await q.screenshot({ path: `${OUT}/13-phone-feed.jpg` }); await tabs[2].click(); await wait(800); await q.screenshot({ path: `${OUT}/14-phone-fish.jpg` }); }
  // 4 print page + one sheet
  p = await mk(FULL, { width: 1280, height: 900 }); await p.goto(`http://localhost:${FULL}/print`); await wait(1200); await p.screenshot({ path: `${OUT}/15-print.jpg` });
  await p.locator('.item').nth(0).click(); await p.locator('.item').nth(3).click(); await wait(400); await p.screenshot({ path: `${OUT}/16-print-selected.jpg` });
  await b.close(); console.log('done');
})();
