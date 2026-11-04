const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8000/tv?nohero&demo=0'); await p.waitForTimeout(1200);
  await p.click('body');
  await p.evaluate(() => { ReefSound.setOption('bub', false); ReefSound.setOption('wav', false); ReefSound.setOption('mus', false); ReefSound.toggle(); });
  await p.waitForTimeout(2500);
  // Spectrum of the live output: is there any tonal peak (a "beep"/hum), or only smooth low rumble?
  const res = await p.evaluate(async () => {
    const out = []; 
    for (let k = 0; k < 8; k++) {
      const an = ReefSound._an(); const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f);
      const sr = ReefSound._sr(), binHz = sr / an.fftSize;
      let max = -999, maxI = 0, num = 0, den = 0; const lo = [];
      for (let i = 2; i < f.length; i++) { const lin = Math.pow(10, f[i] / 20); num += i * binHz * lin; den += lin; if (f[i] > max) { max = f[i]; maxI = i; } if (i * binHz < 3000) lo.push(f[i]); }
      lo.sort((a, c) => a - c); const med = lo[lo.length >> 1];
      out.push({ peakHz: Math.round(maxI * binHz), peakAboveMedianDb: +(max - med).toFixed(1), centroidHz: Math.round(num / den) });
      await new Promise(r => setTimeout(r, 400));
    }
    return out;
  });
  console.log(res.map(r => `peak ${r.peakHz}Hz  +${r.peakAboveMedianDb}dB over median  centroid ${r.centroidHz}Hz`).join('\n'));
  console.log('level dBFS', (await p.evaluate(() => ReefSound.level())).toFixed(1), 'errors', JSON.stringify(errs));
  await b.close();
})();
