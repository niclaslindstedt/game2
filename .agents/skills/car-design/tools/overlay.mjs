// Lay one cell of a preview sheet over a reference photo at half opacity,
// the sky keyed out, registered by a similarity transform on two of the
// landmarks the sheet reported (`<out>.marks.json`). Needs playwright-core
// resolvable (symlink the repo's node_modules into the working directory)
// and CHROMIUM_PATH.
//   node overlay.mjs <photo> <sheet.png> <marks.json> <row:col>
//     <markA> <ax> <ay> <markB> <bx> <by> <out.png>
//   e.g. ... ref-side.jpg elevations.png elevations.marks.json 0:0
//          axleF 201 454 axleR 718 454 overlay-side.png
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const [photo, sheet, marksPath, key, mA, ax, ay, mB, bx, by, out] = process.argv.slice(2);
const marks = JSON.parse(readFileSync(marksPath, "utf8"))[key];
const [row, col] = key.split(":").map(Number);
const CW = 1320,
  CH = 930;
const A = { x: marks[mA].x - col * CW, y: marks[mA].y - row * CH };
const B = { x: marks[mB].x - col * CW, y: marks[mB].y - row * CH };
const b64 = (f) => readFileSync(f).toString("base64");
const mime = (f) => (f.endsWith(".png") ? "png" : "jpeg");
const html = `<canvas id=c></canvas><script>
const photo = new Image(), render = new Image(); let n = 0;
const go = () => { if (++n < 2) return;
  const c = document.getElementById('c'); c.width = photo.width; c.height = photo.height;
  const g = c.getContext('2d'); g.drawImage(photo, 0, 0);
  // Key the sky out of the render so only the car lands on the photo.
  const k = document.createElement('canvas'); k.width = ${CW}; k.height = ${CH};
  const kg = k.getContext('2d'); kg.drawImage(render, ${col * CW}, ${row * CH}, ${CW}, ${CH}, 0, 0, ${CW}, ${CH});
  const im = kg.getImageData(0, 0, k.width, k.height); const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - 0x3f, dg = d[i+1] - 0xa9, db = d[i+2] - 0xf5;
    if (dr*dr + dg*dg + db*db < 40*40) d[i+3] = 0;
  }
  kg.putImageData(im, 0, 0);
  const P = [${A.x}, ${A.y}], Q = [${B.x}, ${B.y}];
  const pa = [${ax}, ${ay}], pb = [${bx}, ${by}];
  const s = Math.hypot(pb[0]-pa[0], pb[1]-pa[1]) / Math.hypot(Q[0]-P[0], Q[1]-P[1]);
  const th = Math.atan2(pb[1]-pa[1], pb[0]-pa[0]) - Math.atan2(Q[1]-P[1], Q[0]-P[0]);
  g.save(); g.globalAlpha = 0.55; g.translate(pa[0], pa[1]); g.rotate(th); g.scale(s, s); g.translate(-P[0], -P[1]);
  g.drawImage(k, 0, 0); g.restore();
  g.fillStyle = 'lime'; for (const p of [pa, pb]) { g.beginPath(); g.arc(p[0], p[1], 5, 0, 7); g.fill(); }
  g.fillStyle = 'yellow'; g.font = '20px monospace'; g.fillText('scale ' + s.toFixed(3) + ' px/px  rot ' + (th*57.3).toFixed(1) + ' deg', 10, 24);
  document.title = 'done'; };
photo.onload = go; render.onload = go;
photo.src = 'data:image/${mime(photo)};base64,${b64(photo)}';
render.src = 'data:image/${mime(sheet)};base64,${b64(sheet)}';
</script>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 2600, height: 1800 } });
await page.setContent(html);
await page.waitForFunction("document.title === 'done'");
await page.locator("#c").screenshot({ path: out });
await browser.close();
console.log(out);
