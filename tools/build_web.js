#!/usr/bin/env node
// Builds the static, server-less version of Doodle Sea into ./web (what GitHub Pages serves).
//   node tools/build_web.js          -> web/
// Pages use relative links, so it works from https://user.github.io/doodle-sea/ as well as from a custom domain.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'public'), OUT = path.join(__dirname, '..', 'web');
const SKIP = new Set(['test', 'fish', 'check.html']);
fs.rmSync(OUT, { recursive: true, force: true });
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const n of fs.readdirSync(from)) {
    if (SKIP.has(n) || (from.endsWith('audio') && n !== 'README.txt')) continue;
    const a = path.join(from, n), b = path.join(to, n);
    if (fs.statSync(a).isDirectory()) { copy(a, b); continue; }
    if (/\.(html|js|css)$/.test(n)) fs.writeFileSync(b, fix(n, fs.readFileSync(a, 'utf8'))); else fs.copyFileSync(a, b);
  }
}
function fix(name, s) {
  if (name === 'mode.js') return "window.REEF_MODE = 'static';\n";
  if (name === 'net.js') return s;
  s = s.replace(/(src|href)="\/(tv|scan|print)(["#?])/g, '$1="$2.html$3');         // page links
  s = s.replace(/(src|href)="\/(?!\/)/g, '$1="');                                     // absolute -> relative
  s = s.replace(/url\(\/fonts\//g, 'url(fonts/');
  s = s.replace(/(['"])\/art\//g, '$1art/').replace(/(['"])\/audio\//g, '$1audio/');
  s = s.replace(/href="\/print"/g, 'href="print.html"').replace(/href=\\?"\/print\\?"/g, m => m.replace('/print', 'print.html'));
  if (name === 'index.html') {
    s = s.replace(/<a class="c" href="scan.html">.*?<\/a>/, '<div class="c"><b data-ic="phone"></b><strong>הטלפון</strong><span>סורקים את ה-QR שעל המסך</span></div>');
    s = s.replace('פותחים על המסך הגדול', 'פותחים על הטלוויזיה');
  }
  return s;
}
copy(SRC, OUT);
// the print link inside menu.js is built from a JS string
const mj = path.join(OUT, 'menu.js'); fs.writeFileSync(mj, fs.readFileSync(mj, 'utf8').replace(/href="\/print"/g, 'href="print.html"'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('built ->', OUT);
