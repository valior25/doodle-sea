const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8000/tv?nohero'); await p.waitForTimeout(2500);
  await p.screenshot({ path: '/tmp/menu_closed.png' });
  await p.click('#menuBtn'); await p.waitForTimeout(700);
  // sound
  await p.click('#mSndOn'); await p.waitForTimeout(600);
  await p.fill('#mVol', '35'); await p.dispatchEvent('#mVol', 'input'); await p.waitForTimeout(400);
  const s1 = await p.evaluate(() => ({ st: ReefSound.status(), btn: document.getElementById('sndBtn').textContent, mute: document.getElementById('mMute').textContent }));
  await p.click('#mMute'); await p.waitForTimeout(300);
  const s2 = await p.evaluate(() => ({ st: ReefSound.status(), btn: document.getElementById('sndBtn').textContent, mute: document.getElementById('mMute').textContent }));
  await p.click('#mMute'); await p.waitForTimeout(300);
  console.log('sound on :', JSON.stringify(s1)); console.log('muted    :', JSON.stringify(s2));
  // upload a simulated photo through the menu
  await p.setInputFiles('#mFile', '/tmp/photo_0.jpg'); await p.waitForSelector('#mPreview', { state: 'visible', timeout: 25000 });
  await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/menu_open.png' });
  await p.click('#mSend'); await p.waitForTimeout(2500);
  await p.mouse.move(700, 400); await p.waitForTimeout(200); await p.click('#menuBtn'); await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/menu_gallery.png' });
  const gal = await p.evaluate(() => document.querySelectorAll('#mGallery .g').length);
  console.log('gallery items:', gal, '| errors:', JSON.stringify(errs));
  await b.close();
})();
