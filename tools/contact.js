const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const src = fs.readFileSync('public/creatures.js', 'utf8');
  await p.setContent('<body style="margin:0;background:#fff"><div id=g style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px"></div></body>');
  await p.addScriptTag({ content: src });
  await p.evaluate(() => {
    const g = document.getElementById('g');
    Creatures.list.forEach(c => {
      const b = c.bbox, pad = 14;
      const det = (c.lines||[]).map(d=>`<path d="${d}" fill="none" stroke="#555" stroke-width="2.2" stroke-linecap="round"/>`).join('') +
        (c.dashes||[]).map(d=>`<path d="${d}" fill="none" stroke="#999" stroke-width="1.8" stroke-dasharray="5 5" stroke-linecap="round"/>`).join('') +
        (c.eyes||[]).map(e=>`<circle cx="${e[0]}" cy="${e[1]}" r="${e[2]}" fill="#fff" stroke="#333" stroke-width="2.2"/><circle cx="${e[0]+e[2]*0.2}" cy="${e[1]}" r="${e[2]*0.45}" fill="#222"/>`).join('');
      const el = document.createElement('div');
      el.innerHTML = `<svg viewBox="${b.x-pad} ${b.y-pad} ${b.w+2*pad} ${b.h+2*pad}" style="width:100%;height:230px;border:1px solid #ddd"><path d="${c.d}" fill="#fff6" stroke="#222" stroke-width="3" stroke-linejoin="round"/>${det}</svg><div style="font:14px sans-serif">${c.id} ${c.he}</div>`;
      g.appendChild(el);
    });
  });
  await p.screenshot({ path: '/tmp/contact.png', fullPage: true });
  const n = await p.evaluate(() => Object.keys(Creatures.codes).length + ' codes, ' + Object.keys(Creatures.lookup).length + ' lookup');
  console.log(n);
  await b.close();
})();
