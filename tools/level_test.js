const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.goto('http://localhost:8000/tv?nohero&demo=0'); await p.waitForTimeout(1200);
  await p.click('body'); await p.evaluate(() => { ReefSound.toggle(); });
  const read = async (label) => { const v = []; for (let i = 0; i < 12; i++) { v.push(await p.evaluate(() => ReefSound.level())); await p.waitForTimeout(500); } console.log(label, 'dBFS min/avg/max:', Math.min(...v).toFixed(1), (v.reduce((a, c) => a + c, 0) / v.length).toFixed(1), Math.max(...v).toFixed(1)); };
  await p.waitForTimeout(2500); await read('sea vol 50%');
  await p.evaluate(() => ReefSound.setVolume(1)); await p.waitForTimeout(1200); await read('sea vol 100%');
  await p.evaluate(() => ReefSound.setVolume(0.2)); await p.waitForTimeout(1200); await read('sea vol 20%');
  await p.evaluate(() => { ReefSound.setVolume(0.5); ReefSound.chime(true); }); await p.waitForTimeout(150);
  const peak = []; for (let i = 0; i < 8; i++) { peak.push(await p.evaluate(() => ReefSound.level())); await p.waitForTimeout(60); } console.log('chime (fx 70%) peak dBFS:', Math.max(...peak).toFixed(1));
  await p.evaluate(() => ReefSound.setMuted(true)); await p.waitForTimeout(1500); console.log('muted dBFS:', (await p.evaluate(() => ReefSound.level())).toFixed(1));
  await b.close();
})();
