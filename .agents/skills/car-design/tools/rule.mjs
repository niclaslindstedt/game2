// Ruled crop of a reference photo (or of an overlay): draws a region of the
// image scaled up with a labelled grid line every `step` SOURCE pixels, so
// landmarks are read as source-pixel coordinates rather than eyeballed.
// Needs playwright-core resolvable and CHROMIUM_PATH.
//   node rule.mjs <image> <x0> <y0> <x1> <y1> <scale> <step> <out.png>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [img, x0, y0, x1, y1, scale, step, out] = process.argv.slice(2);
const b64 = readFileSync(resolve(img)).toString("base64");
const ext = img.endsWith(".png") ? "png" : "jpeg";
const X0 = +x0,
  Y0 = +y0,
  X1 = +x1,
  Y1 = +y1,
  S = +scale,
  STEP = +step;
const W = Math.round((X1 - X0) * S),
  H = Math.round((Y1 - Y0) * S);
const html = `<canvas id=c width=${W} height=${H}></canvas><script>
const im = new Image(); im.onload = () => {
  const c = document.getElementById('c').getContext('2d');
  c.imageSmoothingEnabled = true;
  c.drawImage(im, ${X0}, ${Y0}, ${X1 - X0}, ${Y1 - Y0}, 0, 0, ${W}, ${H});
  c.font = '12px monospace';
  for (let x = Math.ceil(${X0} / ${STEP}) * ${STEP}; x <= ${X1}; x += ${STEP}) {
    const px = (x - ${X0}) * ${S};
    c.strokeStyle = x % (${STEP} * 5) === 0 ? 'rgba(255,0,0,0.9)' : 'rgba(255,0,0,0.45)';
    c.lineWidth = 1; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, ${H}); c.stroke();
    c.fillStyle = 'yellow'; c.fillText(String(x), px + 2, 12);
    c.fillText(String(x), px + 2, ${H} - 4);
  }
  for (let y = Math.ceil(${Y0} / ${STEP}) * ${STEP}; y <= ${Y1}; y += ${STEP}) {
    const py = (y - ${Y0}) * ${S};
    c.strokeStyle = y % (${STEP} * 5) === 0 ? 'rgba(0,255,255,0.9)' : 'rgba(0,255,255,0.45)';
    c.lineWidth = 1; c.beginPath(); c.moveTo(0, py); c.lineTo(${W}, py); c.stroke();
    c.fillStyle = 'yellow'; c.fillText(String(y), 2, py - 2);
    c.fillText(String(y), ${W} - 40, py - 2);
  }
  document.title = 'done';
};
im.src = 'data:image/${ext};base64,${b64}';
</script>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.waitForFunction("document.title === 'done'");
await page.locator("#c").screenshot({ path: out });
await browser.close();
console.log(`${out}: ${W}x${H}`);
