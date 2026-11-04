// QA: pushes every image in DIR through the real scan page (gallery button), then reports
const { chromium } = require('playwright'); const fs = require('fs');
const DIR = process.argv[2] || '/tmp/qa', PORT = process.argv[3] || '8231';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 430, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png)$/.test(f)).sort(); const out = [];
  for (const f of files) {
    const want = f.split('__')[0]; const t0 = Date.now();
    await p.goto('http://localhost:' + PORT + '/scan'); await p.waitForTimeout(300);
    await p.setInputFiles('#fGal', DIR + '/' + f);
    let st = 'timeout';
    try {
      await p.waitForFunction(() => { const d = id => getComputedStyle(document.getElementById(id)).display !== 'none'; return d('preview') || document.getElementById('note').textContent.trim().length > 0; }, null, { timeout: 25000 });
      if (await p.evaluate(() => getComputedStyle(document.getElementById('preview')).display !== 'none')) {
        await p.click('#send'); await p.waitForFunction(() => getComputedStyle(document.getElementById('done')).display !== 'none', null, { timeout: 15000 }); st = 'ok';
      } else st = 'note: ' + await p.evaluate(() => document.getElementById('note').textContent.trim());
    } catch (e) { st = 'ERR ' + e.message.split('\n')[0]; }
    out.push({ f, want, st, ms: Date.now() - t0 }); process.stdout.write(st === 'ok' ? '.' : 'x');
  }
  console.log(); fs.writeFileSync('/tmp/qa_upload.json', JSON.stringify({ out, errs }, null, 1));
  const bad = out.filter(o => o.st !== 'ok'); console.log('uploaded', out.length - bad.length, '/', out.length, 'page errors', errs.length); bad.forEach(o => console.log(' ', o.f, o.st)); await b.close();
})();
