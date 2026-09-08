// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MACOS ICON — the one platform whose icon is not simply the app mark in a
// square, and the file that says why.
//
// Every other launcher in this repo takes the mark full-bleed: Windows, Linux,
// Android and iOS all either fill the tile or apply their own mask over one.
// The Dock does not. A macOS app icon is a ROUNDED SQUARE FLOATING ON NOTHING,
// smaller than its own canvas, with a shadow under it — and an icon that
// ignores that is instantly legible as one, because it is visibly larger than
// every icon beside it and has hard corners where they have soft ones.
//
// So the mark is re-shaped here rather than re-drawn: masked to Apple's
// continuous-corner squircle, inset inside its canvas to leave the margin the
// shadow lives in, lit from above, and dropped onto a soft shadow.
//
// TWO MACOS ICON SYSTEMS EXIST AND THIS FILE SERVES THE OLDER ONE.
//
//   ≤ macOS 15 (Sequoia)  The app ships a finished picture and the system
//                         displays it. Everything below — the inset, the
//                         corner, the shadow, the lighting — is the app's job,
//                         and this is where it is done.
//   ≥ macOS 26 (Tahoe)    The system DRAWS the icon: a layered `.icon` is
//                         masked, lit, blurred and re-tinted by the compositor
//                         for the light, dark, clear and tinted appearances a
//                         player picks in the Dock. Layers, not a picture —
//                         `make icons` writes them to tauri/store/icon-layers/
//                         and tauri/store/README.md has the Icon Composer step.
//
// Both ship, and they do not fight: macOS 26 prefers the Assets.car when the
// bundle has one and falls back to this `.icns` when it does not, while every
// older system reads only the `.icns`. Shipping just this one is not a bug on
// Tahoe — it is an icon that stays flat while its neighbours pick up the
// glass, which is what "looks dated" means in practice.

import { encodeRgbaPng, resize } from "./png.mjs";

/**
 * How much of the canvas the icon body fills.
 *
 * Apple's macOS icon grid draws the standard rounded-square body at 824 points
 * in a 1024-point canvas, and the remaining margin is not padding — it is the
 * room the shadow and the system's own hover and bounce effects need. An icon
 * drawn edge to edge is not "bigger", it is misaligned with the Dock's whole
 * optical rhythm.
 */
const BODY = 824 / 1024;

/**
 * The corner, as the exponent of a superellipse.
 *
 * Apple's corner is CONTINUOUS: the curvature ramps in rather than switching
 * from straight to circular at a tangent point, which is why an Apple icon's
 * corner reads as softer than a same-radius circular one. A superellipse is
 * the standard approximation and it is three lines — `n = 2` gives back the
 * plain circular arc, and around 4 sits where Apple's own shape does.
 */
const CORNER_N = 4;

/** The corner radius as a fraction of the body's width — Apple's ~22.5%. */
const CORNER_R = 0.225;

/** How far the body sits above the canvas centre, as a fraction of the canvas.
 *
 * The shadow falls DOWNWARD, so a body centred in its canvas ends up looking
 * low once the shadow is under it. Every macOS icon is nudged up to pay for
 * it. */
const LIFT = 0.012;

/** The drop shadow: how far below the body, how soft, and how dark. */
const SHADOW = { drop: 0.018, blur: 0.028, alpha: 0.34 };

/**
 * Coverage of the squircle at a point, 0..1, with an antialiased edge.
 *
 * `x` and `y` are in units of the body's half-width from the body's centre, so
 * the shape is |x| ≤ 1 and |y| ≤ 1 with the corners rounded off.
 */
function squircle(x, y, feather) {
  const flat = 1 - CORNER_R;
  const dx = Math.max(Math.abs(x) - flat, 0);
  const dy = Math.max(Math.abs(y) - flat, 0);
  // Outside the flats in both axes, distance runs through the superelliptical
  // corner; along an edge one term is zero and it degenerates to the straight
  // side, which is exactly what a rounded rectangle wants.
  const corner = Math.pow(Math.pow(dx, CORNER_N) + Math.pow(dy, CORNER_N), 1 / CORNER_N);
  const outside = Math.max(Math.abs(x), Math.abs(y), flat + corner) - 1;
  return Math.min(1, Math.max(0, 0.5 - outside / feather));
}

/**
 * The lighting the Dock expects, applied to one already-shaped pixel.
 *
 * A macOS icon is lit from above and slightly in front. Three effects, each
 * deliberately weak — the mark is already a sky gradient, and stacking a
 * strong second gradient on it turns the blue to mud:
 *
 *   RAMP      a few percent brighter at the top than the bottom, which is what
 *             makes a flat square read as a physical tile;
 *   SHEEN     a broad soft highlight across the upper third, the reflection of
 *             the light rather than the light itself;
 *   RIM       one bright hairline along the top edge and one dark along the
 *             bottom, which is the whole of what "bevelled" means at 32 px.
 *
 * `t` is the vertical position inside the body, 0 at its top edge and 1 at its
 * bottom; `edge` is the distance in from the body's outline, in the same units.
 */
function light(rgb, t, edge) {
  const ramp = 1 + 0.075 * (0.5 - t);
  const sheen = 0.06 * Math.max(0, 1 - Math.pow(t / 0.45, 2));
  const rim = edge < 0.012 ? (t < 0.5 ? 0.22 : -0.16) * (1 - edge / 0.012) : 0;
  return rgb.map((c) => Math.max(0, Math.min(255, c * ramp + 255 * sheen + 255 * rim)));
}

/**
 * Shape one square RGBA raster into a macOS app icon of the same size.
 *
 * The source is the app mark, full bleed and opaque; what comes back is the
 * mark inside the squircle, lit, with a shadow under it and transparency
 * everywhere else.
 */
export function macIcon(source, size) {
  const src = resize(source, size);
  const out = Buffer.alloc(size * size * 4);

  const half = (BODY * size) / 2;
  const cx = size / 2;
  const cy = size / 2 - LIFT * size;
  // One pixel of feather regardless of size, expressed in body units, so a
  // 16-pixel icon is as clean-edged as a 1024-pixel one.
  const feather = 1 / half;

  // The shadow first, as its own coverage field: the body's silhouette pushed
  // down and blurred. Sampled on a small ring rather than convolved — a true
  // Gaussian over a 1024² canvas is seconds of work for a difference nobody
  // can see under an opaque icon.
  const drop = SHADOW.drop * size;
  const blur = Math.max(1, SHADOW.blur * size);
  const RING = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      let shade = 0;
      for (let i = 0; i < RING; i++) {
        const angle = (i / RING) * Math.PI * 2;
        for (const spread of [0.45, 1]) {
          const sx = px + Math.cos(angle) * blur * spread;
          const sy = py + Math.sin(angle) * blur * spread - drop;
          shade += squircle((sx - cx) / half, (sy - cy) / half, feather);
        }
      }
      shade = (shade / (RING * 2)) * SHADOW.alpha;

      const bx = (px - cx) / half;
      const by = (py - cy) / half;
      const cover = squircle(bx, by, feather);

      const at = (y * size + x) * 4;
      if (cover <= 0) {
        // Shadow alone, in black.
        out[at + 3] = Math.round(255 * shade);
        continue;
      }

      const t = (by + 1) / 2;
      const edge = 1 - Math.max(Math.abs(bx), Math.abs(by));
      const [r, g, b] = light([src[at], src[at + 1], src[at + 2]], t, edge);
      // Over the shadow, so a soft edge sits on darkness rather than on the
      // desktop and never shows a pale halo.
      const a = cover + shade * (1 - cover);
      out[at] = Math.round((r * cover) / a);
      out[at + 1] = Math.round((g * cover) / a);
      out[at + 2] = Math.round((b * cover) / a);
      out[at + 3] = Math.round(255 * a);
    }
  }
  return out;
}

/**
 * The `.icns` ladder, as Apple's four-character type codes.
 *
 * Every entry is a PNG payload, which the modern codes all accept — the
 * ancient run-length `is32`/`s8mk` pairs are not written, because nothing
 * since Mountain Lion reads them and a Finder that would need them cannot run
 * this app anyway (`minimumSystemVersion`).
 *
 * The @2x codes are not optional decoration: the Dock picks the entry that
 * matches the display, and an icon with no `ic13` is an icon that gets a
 * 128-pixel picture scaled up on every Retina Mac made since 2012.
 */
export const ICNS_LADDER = [
  { type: "icp4", size: 16 },
  { type: "icp5", size: 32 },
  { type: "ic11", size: 32 }, // 16@2x
  { type: "ic12", size: 64 }, // 32@2x
  { type: "ic07", size: 128 },
  { type: "ic13", size: 256 }, // 128@2x
  { type: "ic08", size: 256 },
  { type: "ic14", size: 512 }, // 256@2x
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 }, // 512@2x
];

/**
 * Build the `.icns` file — a magic word, the total length, then one
 * length-prefixed block per entry. Both lengths INCLUDE their own eight-byte
 * header, which is the detail that turns a hand-rolled writer into a file
 * Finder shows as a blank page.
 */
export function icnsFile(source) {
  const blocks = ICNS_LADDER.map(({ type, size }) => {
    const png = encodeRgbaPng(size, macIcon(source, size));
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const body = Buffer.concat(blocks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}
