const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const tv = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const phoneCtx = await b.newContext({ ...devices['iPhone 13'] }); const ph = await phoneCtx.newPage();
  for (const p of [tv, ph]) { p.on('pageerror', e => console.log('pageerror:', e.message)); p.on('console', m => m.type()==='error' && console.log('console:', m.text())); }
  await tv.goto('http://localhost:8000/tv?nohero'); await tv.waitForTimeout(1500);
  await ph.goto('http://localhost:8000/scan');
  for (const [i, f] of ['/tmp/photo_0.jpg', '/tmp/photo_2.jpg', '/tmp/photo_3.jpg'].entries()) {
    await ph.setInputFiles('#fGal', f);
    await ph.waitForSelector('#preview', { state: 'visible', timeout: 20000 });
    if (i === 0) await ph.screenshot({ path: '/tmp/phone_preview.png' });
    await ph.click('#send'); await ph.waitForSelector('#intro', { state: 'visible' }); await ph.waitForTimeout(600);
    if (i === 0) await tv.waitForTimeout(1200), await tv.screenshot({ path: '/tmp/tv_arrival.png' });
  }
  await ph.screenshot({ path: '/tmp/phone_done.png' });
  await ph.click('nav button[data-t=feed]'); await ph.click('#feed'); await ph.waitForTimeout(300);
  await tv.waitForTimeout(6000);
  await tv.screenshot({ path: '/tmp/tv_final.png' });
  await ph.click('nav button[data-t=fish]'); await ph.waitForTimeout(500); await ph.screenshot({ path: '/tmp/phone_gallery.png' });
  console.log('fish on server:', await (await fetch('http://localhost:8000/api/fish')).json().then(a => a.length));
  await b.close();
})();
