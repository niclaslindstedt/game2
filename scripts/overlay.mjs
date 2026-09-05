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
const [ax, ay] = pair(need("anchor"));
const [bx, by] = pair(need("at"));
const scale = Number(value("scale") ?? 1);
const scaleX = Number(value("scale-x") ?? scale);
const scaleY = Number(value("scale-y") ?? scale);
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
  async ({ underUrl, overUrl, ax, ay, bx, by, scaleX, scaleY, alpha, crop, zoom }) => {
    const load = (src) =>
      new Promise((ok, fail) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = fail;
        img.src = src;
      });
    const photo = await load(underUrl);
    const render = await load(overUrl);
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
  },
);
await page.setViewportSize({ width: size.w, height: size.h });
const canvas = await page.$("#c");
await canvas.screenshot({ path: out });
await browser.close();
console.log(out);
