const { chromium } = require('playwright');
(async () => {
  const [,, url, out, wait='4000', w='1600', h='900'] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  p.on('console', m => { if (m.type()==='error') console.log('console:', m.text()); });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto(url); await p.waitForTimeout(+wait);
  await p.screenshot({ path: out });
  await b.close();
})();
