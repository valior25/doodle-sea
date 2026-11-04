// Renders the README motion GIF frames to /tmp/mf.  usage: node tools/motion/render.js [fps]
// then: ffmpeg -framerate 15 -i /tmp/mf/%04d.png -vf "scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a" -loop 0 docs/demo.gif
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:960,height:540}});
fs.writeFileSync(__dirname+'/_m.html',fs.readFileSync(__dirname+'/motion.html','utf8').replace('__SHAPES__',fs.readFileSync(__dirname+'/shapes.json','utf8')));
await p.goto('file://'+__dirname+'/_m.html');await p.waitForTimeout(800);
const fps=+process.argv[2]||15, T=13, only=process.argv[3];
fs.rmSync('/tmp/mf',{recursive:true,force:true});fs.mkdirSync('/tmp/mf');
const ts= only? only.split(',').map(Number) : [...Array(fps*T).keys()].map(i=>i/fps);
let i=0;for(const t of ts){await p.evaluate(t=>draw(t),t);await p.waitForTimeout(only?250:30);await p.screenshot({path:`/tmp/mf/${String(i++).padStart(4,'0')}.png`});}
await b.close();fs.rmSync(__dirname+'/_m.html');})();
