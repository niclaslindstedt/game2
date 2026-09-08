#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generates the PWA install icons, the favicon, and the social-preview
// image from the same geometry as pwa/public/icons/icon.svg — a white car
// at the head of the flick itself: two yellow tyre tracks swinging out one
// way and whipping back the other, an S drawn on Swedish blue. Pure Node
// (the shared lib/png.mjs encoder), so the pipeline needs no native image
// dependencies. Rerun with `npm run icons` / `make icons` after changing the
// mark, and keep icon.svg in lockstep.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng, encodeRgbaPng } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "pwa", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Palette — mirrors PALETTE in pwa/src/identity.ts and the SVG's stops.
const SKY_TOP = [18, 48, 105]; // #123069 hudShadow
const SKY_BOT = [31, 127, 224]; // #1f7fe0 skyHigh
const CHALK = [246, 243, 234]; // #f6f3ea rumbleWhite
const SUN = [255, 210, 62]; // #ffd23e sun
const INK = [18, 48, 105]; // #123069 hudShadow
const CAR_EDGE = 9; // how wide the car's ink outline draws

// --- geometry in the SVG's 512-unit space -----------------------------------
// The flick is a pendulum, so the mark is two circular arcs joined tangentially
// at (216.94, 355.72): the car is thrown away from the corner, then whipped back into
// it. Each arc carries a pair of tracks at a constant radial offset — the inner
// track of the first sweep stays the inner track of the second, so the pair runs
// continuously through the inflection instead of crossing over.
const TRACK_GAP = 40; // radial offset of each track from the arc's spine
const TRACK_W = 13; // half width of one track
// The second centre is not free: it sits on the first arc's radial through the
// joint, at R1 + R2 from the first centre, or the tracks meet with a step.
const ARCS = [
  { cx: 233.5, cy: 545, r: 190, from: 206, to: 267, out: +1 },
  { cx: 201.688, cy: 181.389, r: 175, from: 5, to: 87, out: -1 },
];
// The tail dissolves into the sky along this axis (the SVG's fade gradient).
// Kept short: yellow lerped a long way into blue passes through mud.
const FADE = { x1: 78, y1: 462, x2: 168, y2: 408 };

// The car, as rounded boxes in its own frame (+x is the nose, +y is its right).
// Drawn at the head of the swoosh, yawed out of its line of travel — and the
// front wheels are on opposite lock, which is what a driver does next.
const CAR = { cx: 356, cy: 222, angle: (-35 * Math.PI) / 180 };
const LOCK = (-22 * Math.PI) / 180;
const BODY = { x: 0, y: 0, hw: 96, hh: 46, r: 18, a: 0 };
// One cabin, not a windscreen and a rear screen: at a launcher's icon size two
// dark bands read as a domino, where a single greenhouse still reads as a car.
const GLASS = [{ x: -8, y: 0, hw: 32, hh: 29, r: 11, a: 0 }];
const WHEELS = [
  { x: 56, y: -50, hw: 22, hh: 10, r: 5, a: LOCK },
  { x: 56, y: 50, hw: 22, hh: 10, r: 5, a: LOCK },
  { x: -58, y: -50, hw: 22, hh: 10, r: 5, a: 0 },
  { x: -58, y: 50, hw: 22, hh: 10, r: 5, a: 0 },
];

function skyAt(v) {
  const t = Math.max(0, Math.min(1, v));
  return [
    SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * t,
    SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * t,
    SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * t,
  ];
}

/** How opaque the tracks are at (x, y) — 0 at the tail, 1 past the fade axis. */
function trackAlpha(x, y) {
  const ax = FADE.x2 - FADE.x1;
  const ay = FADE.y2 - FADE.y1;
  const t = ((x - FADE.x1) * ax + (y - FADE.y1) * ay) / (ax * ax + ay * ay);
  return Math.max(0, Math.min(1, t));
}

/** Signed distance from car-frame point (lx, ly) to one rounded box part. */
function boxSdf(part, lx, ly) {
  const dx = lx - part.x;
  const dy = ly - part.y;
  const cos = Math.cos(-part.a);
  const sin = Math.sin(-part.a);
  const px = Math.abs(dx * cos - dy * sin) - (part.hw - part.r);
  const py = Math.abs(dx * sin + dy * cos) - (part.hh - part.r);
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - part.r;
}

/** Color of the mark at 512-space point (x, y), or null for background. */
function markAt(x, y) {
  // Car first (it sits on top of the tracks).
  const dx = x - CAR.cx;
  const dy = y - CAR.cy;
  const cos = Math.cos(-CAR.angle);
  const sin = Math.sin(-CAR.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const body = boxSdf(BODY, lx, ly);
  if (body <= 0) {
    if (body > -CAR_EDGE) return INK;
    if (GLASS.some((g) => boxSdf(g, lx, ly) <= 0)) return INK;
    return CHALK;
  }
  if (WHEELS.some((w) => boxSdf(w, lx, ly) <= 0)) return INK;
  // Tracks: annulus bands either side of each arc's spine, clipped to its sweep.
  for (const arc of ARCS) {
    const r = Math.hypot(x - arc.cx, y - arc.cy);
    let deg = (Math.atan2(y - arc.cy, x - arc.cx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    if (deg < arc.from || deg > arc.to) continue;
    for (const side of [+1, -1]) {
      if (Math.abs(r - (arc.r + side * arc.out * TRACK_GAP)) <= TRACK_W) {
        const a = trackAlpha(x, y);
        const sky = skyAt(y / 512);
        return [
          sky[0] + (SUN[0] - sky[0]) * a,
          sky[1] + (SUN[1] - sky[1]) * a,
          sky[2] + (SUN[2] - sky[2]) * a,
        ];
      }
    }
  }
  return null;
}

/** Where inside a pixel the renderers sample — a 2x2 supersample, for edges
 * that are soft rather than staircased. */
const SAMPLES = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

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
      for (const [ox, oy] of SAMPLES) {
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

/**
 * THE MARK IN TWO LAYERS, for Apple's Icon Composer — the sky on its own, and
 * the tracks and car on transparency.
 *
 * macOS 26 draws an app icon rather than displaying one: a layered `.icon`
 * is composited by the system with its own parallax, blur and specular
 * highlight, and re-lit for the dark, clear and tinted appearances the player
 * can choose in the Dock. That treatment is the whole point, and it can only
 * be applied to layers that arrive SEPARATE — a flattened square gets shown
 * as-is and looks like an app that has not been touched since Sequoia.
 *
 * Splitting is free here and nowhere else: `markAt` already answers "the mark,
 * or nothing" per sample, so the foreground is the same render with `null`
 * spelled as a transparent pixel instead of as the sky behind it. Anything
 * downstream would have to guess the sky back out of the flattened pixels.
 *
 * The layers are FULL BLEED, with no inset and no rounding: the system owns
 * the mask on macOS 26, and shipping a rounded corner inside a layer it is
 * about to round again is the one mistake that cannot be undone later.
 */
function renderIconLayers(size) {
  const sky = Buffer.alloc(size * size * 3);
  const mark = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [ox, oy] of SAMPLES) {
        const u = (x + ox) / size;
        const v = (y + oy) / size;
        const hit = markAt(u * 512, v * 512);
        if (hit) {
          r += hit[0];
          g += hit[1];
          b += hit[2];
          a += 255;
        }
      }
      const skyHere = skyAt((y + 0.5) / size);
      const o3 = (y * size + x) * 3;
      sky[o3] = skyHere[0];
      sky[o3 + 1] = skyHere[1];
      sky[o3 + 2] = skyHere[2];

      // Straight (unpremultiplied) alpha, which is what a PNG carries and what
      // Icon Composer reads: the colour of a partly covered pixel is the
      // mark's own, not the mark faded toward a background that is not there.
      const o4 = (y * size + x) * 4;
      const covered = a / 255; // how many of the samples the mark actually hit
      if (covered > 0) {
        mark[o4] = r / covered;
        mark[o4 + 1] = g / covered;
        mark[o4 + 2] = b / covered;
        mark[o4 + 3] = a / SAMPLES.length;
      }
    }
  }
  return { background: encodePng(size, size, sky), foreground: encodeRgbaPng(size, size, mark) };
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
      // Speed streaks: run in off the left edge and stop short of the mark at
      // ragged lengths, fading up out of the sky so they read as motion rather
      // than as a row of bars.
      const stripeRow = Math.floor(y / 20);
      // A scrambled length, not a linear one: `row * k % n` climbs in steps and
      // stacks into a bar chart.
      const streakEnd = 120 + ((Math.imul(stripeRow + 1, 2654435761) >>> 8) % 420);
      if (stripeRow % 4 === 1 && x < streakEnd) {
        // A short ramp: yellow lerped a long way into blue passes through mud.
        const t = Math.min(1, x / 110);
        c = [c[0] + (SUN[0] - c[0]) * t, c[1] + (SUN[1] - c[1]) * t, c[2] + (SUN[2] - c[2]) * t];
      }
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

// THE MASTER RASTER — the mark at the largest size any store asks for, and
// the one file the SHELLS derive their own icon sets from. Neither shell may
// read the other's assets (a shell imports the core, never another shell), so
// the full-resolution mark lives here, in the website's own icon directory,
// where both of them already look. Not in the manifest: nothing serves it to a
// browser, and an install icon above 512 buys nothing.
writeFileSync(join(iconsDir, "icon-1024.png"), renderIcon(1024));
writeFileSync(join(iconsDir, "pwa-192.png"), renderIcon(192));
writeFileSync(join(iconsDir, "pwa-512.png"), renderIcon(512));
writeFileSync(join(iconsDir, "pwa-512-maskable.png"), renderIcon(512, 0.78));
writeFileSync(join(iconsDir, "apple-touch-icon-180.png"), renderIcon(180));
writeFileSync(join(root, "pwa", "public", "favicon.ico"), pngToIco(renderIcon(32), 32));
writeFileSync(join(root, "pwa", "public", "og.png"), renderOg(1200, 630));

// The native app's set (native/app.config.js): the App Store wants the icon at
// 1024, and the splash shows the same tile at 200 px on the brand sky — the
// launcher icon, held up while the WebView paints its first frame.
const nativeDir = join(root, "native", "assets");
mkdirSync(nativeDir, { recursive: true });
writeFileSync(join(nativeDir, "icon.png"), renderIcon(1024));
writeFileSync(join(nativeDir, "splash-icon.png"), renderIcon(1024));
writeFileSync(join(nativeDir, "favicon.png"), renderIcon(48));

// THE MAC APP STORE'S LAYERS (tauri/store/icon-layers/) — the two halves of
// the mark, for Icon Composer to build a macOS 26 `.icon` out of on a Mac.
// They sit beside the SHELL THAT SUBMITS THEM, like every other store asset in
// this repo, and they are written from here because this is the only module
// that knows the mark's geometry; `tauri/scripts/` may not import a top-level
// script. `tauri/store/README.md` has the actool step that turns them into an
// Assets.car, and the `platform-shells` skill has the why.
const macLayerDir = join(root, "tauri", "store", "icon-layers");
mkdirSync(macLayerDir, { recursive: true });
const layers = renderIconLayers(1024);
writeFileSync(join(macLayerDir, "background.png"), layers.background);
writeFileSync(join(macLayerDir, "foreground.png"), layers.foreground);

console.log(
  "icons: icon-1024, pwa-192, pwa-512, pwa-512-maskable, apple-touch-180, favicon.ico, og.png, " +
    "native/assets/{icon,splash-icon,favicon}.png, tauri/store/icon-layers/{background,foreground}.png",
);
