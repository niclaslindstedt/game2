// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Lay one picture over another, half transparent, scaled and anchored — a
// rendered elevation over the reference photograph it was measured from,
// so the two can be judged as one picture instead of read side by side.
//
//   node scripts/overlay.mjs --under photo.jpg --over render.png \
//     --anchor 415,838 --at 460,316 --scale 1.9 --out previews/overlay.png
//     # `--anchor` is a point on the photograph, `--at` the point on the
//     # render that has to land on it; `--scale` is photo pixels per render
//     # pixel (`--scale-x` / `--scale-y` to stretch one axis on its own).
//   ... --alpha 0.55        # the render's opacity (default 0.5)
//   ... --crop x,y,w,h      # the photograph's region to keep, in its pixels
//   ... --zoom 2            # the output's magnification
//   ... --key               # drop the render's sky, so only the car lands
//   ... --marks previews/elev.marks.json --cell 0:0 //       --on axleF=201,454 --on axleR=718,454 [--length-factor 0.95]
//     # register on two of the landmarks the sheet reported instead of
//     # stating anchor, at and scale by hand: the first mark is the anchor,
//     # the scale is the marks' distance ratio, and `--length-factor` is
//     # the compression a side view's lengths carry (car-creation skill)
//     # — on an end view every axis is real, so leave it off
//
// Requires Chromium (CHROMIUM_PATH overrides discovery) — a browser canvas
// is the one image compositor a web session is guaranteed to have.

/* global Image, document */
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const need = (name) => {
  const v = value(name);
  if (v === null) throw new Error(`--${name} is required`);
  return v;
};
const pair = (s) => s.split(",").map(Number);

const under = resolve(need("under"));
const over = resolve(need("over"));
const out = resolve(value("out") ?? "previews/overlay.png");
const key = args.includes("--key");

/** Two landmarks, named on the sheet's marks file and placed on the
 * photograph by hand, decide the whole registration: the first lands on
 * its photo point, and the distance between the two sets the scale. Both
 * frames are level, so no rotation is solved. */
let ax, ay, bx, by, scaleX, scaleY;
const marksPath = value("marks");
if (marksPath) {
  const cell = value("cell") ?? "0:0";
  const marks = JSON.parse(readFileSync(resolve(marksPath), "utf8"))[cell];
  if (!marks) throw new Error(`no cell ${cell} in ${marksPath}`);
  const on = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--on") {
      const [name, xy] = args[i + 1].split("=");
      if (!marks[name]) throw new Error(`no landmark ${name} in cell ${cell}`);
      on.push({ render: marks[name], photo: pair(xy) });
    }
  }
  if (on.length !== 2) throw new Error("--marks needs exactly two --on name=x,y");
  const [p, q] = on;
  const scale =
    Math.hypot(q.photo[0] - p.photo[0], q.photo[1] - p.photo[1]) /
    Math.hypot(q.render.x - p.render.x, q.render.y - p.render.y);
  const factor = Number(value("length-factor") ?? 1);
  [ax, ay] = p.photo;
  [bx, by] = [p.render.x, p.render.y];
  // Registered on the hubs, the lengths already agree: the render's
  // wheelbase is the compressed one and the photo's the real one, and the
  // scale between them absorbs the factor. The HEIGHTS are real and would
  // read tall at that scale, so they take the factor instead.
  scaleX = scale;
  scaleY = scale * factor;
} else {
  [ax, ay] = pair(need("anchor"));
  [bx, by] = pair(need("at"));
  const scale = Number(value("scale") ?? 1);
  scaleX = Number(value("scale-x") ?? scale);
  scaleY = Number(value("scale-y") ?? scale);
}
const alpha = Number(value("alpha") ?? 0.5);
const crop = value("crop") ? pair(value("crop")) : null;
const zoom = Number(value("zoom") ?? 1);

const dataUrl = (file) => {
  const ext = extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
};

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);
const size = await page.evaluate(
  async ({ underUrl, overUrl, ax, ay, bx, by, scaleX, scaleY, alpha, crop, zoom, key }) => {
    const load = (src) =>
      new Promise((ok, fail) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = fail;
        img.src = src;
      });
    const photo = await load(underUrl);
    let render = await load(overUrl);
    if (key) {
      // The sheet's sky is one flat colour; everything within a short
      // distance of it goes transparent, and the car is what is left.
      const k = document.createElement("canvas");
      k.width = render.width;
      k.height = render.height;
      const kg = k.getContext("2d");
      kg.drawImage(render, 0, 0);
      const im = kg.getImageData(0, 0, k.width, k.height);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - 0x3f;
        const dg = d[i + 1] - 0xa9;
        const db = d[i + 2] - 0xf5;
        if (dr * dr + dg * dg + db * db < 40 * 40) d[i + 3] = 0;
      }
      kg.putImageData(im, 0, 0);
      render = k;
    }
    const [cx, cy, cw, ch] = crop ?? [0, 0, photo.width, photo.height];
    const canvas = document.getElementById("c");
    canvas.width = Math.round(cw * zoom);
    canvas.height = Math.round(ch * zoom);
    const g = canvas.getContext("2d");
    g.scale(zoom, zoom);
    g.translate(-cx, -cy);
    g.drawImage(photo, 0, 0);
    g.globalAlpha = alpha;
    // The render's `at` point lands on the photograph's `anchor`, and the
    // render is scaled about that point.
    g.translate(ax, ay);
    g.scale(scaleX, scaleY);
    g.drawImage(render, -bx, -by);
    return { w: canvas.width, h: canvas.height };
  },
  {
    underUrl: dataUrl(under),
    overUrl: dataUrl(over),
    ax,
    ay,
    bx,
    by,
    scaleX,
    scaleY,
    alpha,
    crop,
    zoom,
    key,
  },
);
await page.setViewportSize({ width: size.w, height: size.h });
const canvas = await page.$("#c");
await canvas.screenshot({ path: out });
await browser.close();
console.log(out);
