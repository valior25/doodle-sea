const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8000/tv?nohero&demo=0'); await p.waitForTimeout(1500);
  await p.click('#menuBtn'); await p.waitForTimeout(500);
  await p.click('#mSndOn'); await p.waitForTimeout(500);
  // measure the real output level of the synthesised audio with an analyser on the destination
  const lvl = await p.evaluate(async () => {
    // tap the live graph: wrap destination connect by creating an analyser via a MediaStreamDestination is overkill; instead render the same graph offline is not possible,
    // so check engine state + that nodes were created without throwing.
    return ReefSound.status();
  });
  console.log('status', JSON.stringify(lvl));
  await p.fill('#mFxVol', '40'); await p.dispatchEvent('#mFxVol', 'input'); await p.fill('#mVol', '20'); await p.dispatchEvent('#mVol', 'input');
  await p.click('#mTest'); await p.waitForTimeout(1200);
  console.log('sliders', await p.evaluate(() => [document.getElementById('mVolNum').textContent, document.getElementById('mFxNum').textContent].join(' / ')));
  await p.waitForTimeout(9000);     // let pad / twinkle / bubble schedulers fire at least once
  // a fish joins: the chime must be triggered from the page
  await p.evaluate(() => { window.__chimes = 0; const o = ReefSound.chime; ReefSound.chime = function () { window.__chimes++; return o.apply(this, arguments); }; });
  const png = require('fs').readFileSync('/tmp/cut_0.png').toString('base64');
  await p.evaluate(async (png) => { await fetch('/api/fish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'a_whale', png: 'data:image/png;base64,' + png }) }); }, png);
  await p.waitForTimeout(2500);
  console.log('chimes on join:', await p.evaluate(() => window.__chimes), '| errors:', JSON.stringify(errs));
  await b.close();
})();
