// Records the promo clips (TV screen + phone screen) against a running EMPTY server and writes /tmp/promo/timeline.json
// usage: node tools/promo.js <port> <photosDir>     then: tools/promo_mix.sh
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = process.argv[2] || '8250', PH = process.argv[3] || '/tmp/demo', OUT = '/tmp/promo';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const CSS = `@font-face{font-family:RubikP;src:url(/fonts/rubik-hebrew-700-normal.woff2);font-weight:700}
#cap{position:fixed;left:0;right:0;bottom:7%;text-align:center;font:700 54px RubikP,sans-serif;color:#fff;text-shadow:0 4px 24px #021a3a,0 0 6px #021a3a;direction:rtl;opacity:0;transition:opacity .5s;pointer-events:none;z-index:99999}
#cap small{display:block;font-size:30px;font-weight:700;opacity:.92;margin-top:6px}
#cap.on{opacity:1}
#card{position:fixed;left:50%;top:50%;width:560px;transform:translate(-50%,-46%) rotate(-3deg) scale(.9);opacity:0;transition:.7s;border-radius:18px;box-shadow:0 30px 70px #021a3acc;z-index:99998;pointer-events:none}
#card.on{opacity:1;transform:translate(-50%,-50%) rotate(-3deg) scale(1)}
#card.out{opacity:0;transform:translate(-50%,-56%) rotate(-3deg) scale(.95)}
#end{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#0f6fb0cc,#06284fee);opacity:0;transition:opacity 1s;z-index:99997;pointer-events:none;color:#fff;text-align:center;font-family:RubikP,sans-serif;direction:rtl}
#end.on{opacity:1}#end h1{font-size:92px;margin:0 0 12px}#end p{font-size:38px;margin:6px 0;opacity:.95}`;
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const T0 = Date.now(), now = () => (Date.now() - T0) / 1000; const tl = { events: [] }; const mark = (k) => { tl[k] = now(); console.log(k, now().toFixed(1)); };
  const tvc = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT + '/tv', size: { width: 1280, height: 720 } } });
  const tv = await tvc.newPage(); tv.on('pageerror', e => console.log('tv err', e.message));
  await tv.addInitScript(() => { try { localStorage.setItem('reef.music1', JSON.stringify({ on: false, vol: 0.4 })); } catch (e) {} });
  await tv.goto(`http://localhost:${PORT}/tv`); tl.tvStart = 0;
  await tv.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); document.body.insertAdjacentHTML('beforeend', '<div id="cap"></div><img id="card"><div id="end"></div>'); }, CSS);
  const cap = async (html) => tv.evaluate(h => { const c = document.getElementById('cap'); if (!h) { c.classList.remove('on'); return; } c.classList.remove('on'); setTimeout(() => { c.innerHTML = h; c.classList.add('on'); }, 350); }, html);
  const card = async (src, on) => tv.evaluate(([s, o]) => { const c = document.getElementById('card'); if (s) c.src = s; c.classList.remove('out'); if (o) c.classList.add('on'); else { c.classList.remove('on'); c.classList.add('out'); } }, [src, on]);
  await wait(1500);                                                    // 1 · hero
  await cap('ציור על דף. חיה על המסך.<small>ים של ציורים</small>'); await wait(2600); await cap('');
  await wait(200);
  // 2 · colouring (sheet card)
  const tmp = fs.readFileSync(`${PH}/a_whale__0.jpg`).toString('base64'); await card('data:image/jpeg;base64,' + tmp, true);
  await cap('1 · מדפיסים דף וצובעים<small>מותר לצאת מהקווים</small>'); await wait(3000); await cap(''); await wait(300);
  await card(null, false);
  // 3 · phone
  const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: OUT + '/phone', size: { width: 390, height: 844 } } });
  const ph = await pc.newPage(); const phoneStart = now(); tl.phoneStart = phoneStart;
  await ph.goto(`http://localhost:${PORT}/scan`); await cap('2 · מצלמים בטלפון<small>ונותנים שם</small>'); await wait(1800);
  await ph.setInputFiles('#fGal', `${PH}/a_whale__0.jpg`); await ph.waitForSelector('#preview', { state: 'visible', timeout: 25000 }); await wait(1800);
  await ph.click('#fname'); await ph.keyboard.type('מובי', { delay: 110 }); await wait(500);
  await cap(''); mark('send'); await ph.click('#send'); await ph.waitForSelector('#done', { state: 'visible' }); await wait(1400);
  tl.phoneEnd = now();
  await cap('3 · והיא שוחה על המסך<small>עם השם שבחרתם</small>'); await wait(5000); await cap('');
  // 4 · the family joins
  await wait(700); await cap('עוד דף, עוד חיה<small>הים מתמלא</small>');
  const more = ['a_dolphin__0', 'tang__0', 'a_turtle__0', 'clown__0', 'a_octopus__0', 'a_jelly__0', 'a_shark__0', 'a_crab__0', 'a_seahorse__0', 'a_manta__0'];
  const ph2 = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
  const NM = ['גולש','אלמוג','פנינה','נמרוד','קורל','בועי','צדפי','שחר','ספיר','גלי'];
  for (const f of more) {
    await ph2.goto(`http://localhost:${PORT}/scan`); await ph2.setInputFiles('#fGal', `${PH}/${f}.jpg`);
    await ph2.waitForSelector('#preview', { state: 'visible', timeout: 25000 }); await ph2.fill('#fname', NM[more.indexOf(f)]); await ph2.click('#send'); await ph2.waitForSelector('#done', { state: 'visible' }); await wait(1900);
  }
  mark('allIn'); await wait(4500); await cap('');
  await wait(600); await tv.mouse.move(640, 300); await wait(400);
  await tv.evaluate(() => { document.getElementById('end').innerHTML = '<div><h1>ים של ציורים</h1><p>הדף הבא כבר מחכה</p><p style="opacity:.75;font-size:30px">קוד פתוח · ברשת הביתית · בלי הרשמה · בלי ענן · בחינם</p></div>'; document.getElementById('end').classList.add('on'); });
  await wait(4000); mark('end');
  await pc.close(); await tvc.close(); await b.close();
  const vid = d => fs.readdirSync(`${OUT}/${d}`).filter(f => f.endsWith('.webm')).map(f => `${OUT}/${d}/${f}`)[0];
  tl.tv = vid('tv'); tl.phone = vid('phone'); fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify(tl, null, 1)); console.log(JSON.stringify(tl));
})();
