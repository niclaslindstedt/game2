#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generates the PWA install icons, the favicon, and the social-preview
// image from the same geometry as pwa/public/icons/icon.svg — a red car
// caught mid-drift with two tire arcs sweeping behind it on the game's sky
// blue. Pure Node (the shared lib/png.mjs encoder), so the pipeline needs
// no native image dependencies. Rerun with `npm run icons` / `make icons`
// after changing the mark, and keep icon.svg in lockstep.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "pwa", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Palette — mirrors PALETTE in pwa/src/identity.ts and the SVG's stops.
const SKY_TOP = [31, 127, 224]; // #1f7fe0
const SKY_BOT = [63, 169, 245]; // #3fa9f5
const CHALK = [246, 243, 234]; // #f6f3ea
const RED = [226, 60, 44]; // #e23c2c
const INK = [18, 48, 105]; // #123069

// --- geometry in the SVG's 512-unit space -----------------------------------
// Tire arcs: circles centered at the arc centers implied by the SVG paths.
// `M 96 512 A 300 300 0 0 1 396 212` — center at (96+300, 512) = (396, 512).
const ARCS = [
  { cx: 396, cy: 512, r: 300, w: 15 },
  { cx: 400, cy: 512, r: 220, w: 15 },
];
// The car slab: center, rotation, half extents, matching the SVG transform.
const CAR = { cx: 352, cy: 168, angle: (52 * Math.PI) / 180, hw: 88, hh: 52, stripe: 30, edge: 10 };

function skyAt(v) {
  const t = Math.max(0, Math.min(1, v));
  return [
    SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * t,
    SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * t,
    SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * t,
  ];
}

/** Color of the mark at 512-space point (x, y), or null for background. */
function markAt(x, y) {
  // Car first (it sits on top of the arcs).
  const dx = x - CAR.cx;
  const dy = y - CAR.cy;
  const cos = Math.cos(-CAR.angle);
  const sin = Math.sin(-CAR.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  if (Math.abs(lx) <= CAR.hw && Math.abs(ly) <= CAR.hh) {
    const edge = Math.abs(lx) > CAR.hw - CAR.edge || Math.abs(ly) > CAR.hh - CAR.edge;
    if (edge) return INK;
    if (Math.abs(lx) <= CAR.stripe) return CHALK;
    return RED;
  }
  // Tire arcs: annulus bands, only above their centers (the sweep).
  for (const arc of ARCS) {
    const d = Math.hypot(x - arc.cx, y - arc.cy);
    if (Math.abs(d - arc.r) <= arc.w && y <= arc.cy) return CHALK;
  }
  return null;
}

/** Render the mark at `size`, with the geometry scaled by `inset` toward the
 * center (maskable icons keep the mark inside the safe zone). */
function renderIcon(size, inset = 1) {
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Supersample 2×2 for soft edges.
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const u = ((x + ox) / size - 0.5) / inset + 0.5;
        const v = ((y + oy) / size - 0.5) / inset + 0.5;
        const px = u * 512;
        const py = v * 512;
        const mark = px >= 0 && px < 512 && py >= 0 && py < 512 ? markAt(px, py) : null;
        const c = mark ?? skyAt(v);
        r += c[0];
        g += c[1];
        b += c[2];
      }
      const o = (y * size + x) * 3;
      rgb[o] = r / 4;
      rgb[o + 1] = g / 4;
      rgb[o + 2] = b / 4;
    }
  }
  return encodePng(size, size, rgb);
}

/** The OG image: the mark on the right, speed stripes on the left. */
function renderOg(width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  const markSize = height;
  const markX = width - markSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = y / height;
      let c = skyAt(v);
      // Horizontal chalk speed stripes streaking toward the mark.
      const stripeRow = Math.floor(y / 36);
      const phase = (stripeRow * 137) % 400;
      const streakEnd = markX + 60 - phase;
      if (stripeRow % 3 === 1 && x > streakEnd - 220 && x < streakEnd) c = CHALK;
      if (x >= markX) {
        const mark = markAt(((x - markX) / markSize) * 512, (y / markSize) * 512);
        if (mark) c = mark;
      }
      const o = (y * width + x) * 3;
      rgb[o] = c[0];
      rgb[o + 1] = c[1];
      rgb[o + 2] = c[2];
    }
  }
  return encodePng(width, height, rgb);
}

/** Wrap one PNG in an ICO container (valid since Vista). */
function pngToIco(png, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header[6] = size < 256 ? size : 0;
  header[7] = size < 256 ? size : 0;
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bpp
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

writeFileSync(join(iconsDir, "pwa-192.png"), renderIcon(192));
writeFileSync(join(iconsDir, "pwa-512.png"), renderIcon(512));
writeFileSync(join(iconsDir, "pwa-512-maskable.png"), renderIcon(512, 0.78));
writeFileSync(join(iconsDir, "apple-touch-icon-180.png"), renderIcon(180));
writeFileSync(join(root, "pwa", "public", "favicon.ico"), pngToIco(renderIcon(32), 32));
writeFileSync(join(root, "pwa", "public", "og.png"), renderOg(1200, 630));
console.log("icons: pwa-192, pwa-512, pwa-512-maskable, apple-touch-180, favicon.ico, og.png");
