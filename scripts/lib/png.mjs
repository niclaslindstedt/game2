// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Minimal PNG encoder — pure Node (zlib only), no native image dependencies.
// Shared by the icon generator, the OG-image generator, and the track
// preview tool. RGB, 8-bit, no alpha: exactly what those pipelines need.
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGB pixel buffer (width*height*3 bytes) as a PNG file. */
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A simple RGB canvas with pixel and disk painters, for the generators. */
export function createCanvas(width, height, bg = [0, 0, 0]) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = bg[0];
    rgb[i * 3 + 1] = bg[1];
    rgb[i * 3 + 2] = bg[2];
  }
  const set = (x, y, [r, g, b]) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return;
    const o = (yi * width + xi) * 3;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
  };
  const disk = (cx, cy, radius, color) => {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) set(x, y, color);
      }
    }
  };
  /** Fill a convex polygon (3 or 4 points, in order) — how the track
   * preview lays down a road: one quad per band of the cross-section, per
   * pair of samples. Bounding box plus a half-plane test, which is all a
   * convex fill needs and keeps this file dependency-free. */
  const poly = (points, color) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [px, py] of points) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(width - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(height - 1, Math.ceil(maxY));
    if (x1 < x0 || y1 < y0) return;
    // A degenerate sliver (a road band thinner than a pixel at this zoom)
    // would rasterize to nothing; give it the one pixel it deserves.
    if (x1 === x0 && y1 === y0) {
      set(x0, y0, color);
      return;
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        let inside = true;
        let sign = 0;
        for (let i = 0; i < points.length && inside; i++) {
          const [ax, ay] = points[i];
          const [bx, by] = points[(i + 1) % points.length];
          const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          if (Math.abs(cross) < 1e-9) continue;
          const s = cross > 0 ? 1 : -1;
          if (sign === 0) sign = s;
          else if (s !== sign) inside = false;
        }
        if (inside) set(x, y, color);
      }
    }
  };

  /** Straight line, for axes, leaders and the arrow off a car's nose. */
  const line = (x0, y0, x1, y1, color) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color);
    }
  };

  /** A label, in the 3x5 font below, at `scale` pixels per font pixel.
   * Anything the font does not know is drawn as a blank — a preview is
   * allowed to be missing a comma, and a generator is not allowed to throw
   * over one. Returns the width drawn, so captions can be laid out. */
  const text = (str, x, y, color, scale = 1) => {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const glyph = FONT_3X5[ch];
      if (glyph) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 3; col++) {
            if (!(glyph[row] & (0b100 >> col))) continue;
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                set(cx + col * scale + dx, y + row * scale + dy, color);
              }
            }
          }
        }
      }
      cx += 4 * scale;
    }
    return cx - x;
  };

  return {
    width,
    height,
    rgb,
    set,
    disk,
    poly,
    line,
    text,
    toPng: () => encodePng(width, height, rgb),
  };
}

/** A 3x5 bitmap font, one 3-bit row per scanline, MSB leftmost. Small on
 * purpose: what a generated preview needs is a corner's NAME on the corner
 * and a number beside a bar, at a size that never competes with the picture
 * it is labelling. Upper case only — a caption in a contact sheet is a tag,
 * not prose. */
const FONT_3X5 = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b111, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b110, 0b011],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b011],
  V: [0b101, 0b101, 0b101, 0b010, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  0: [0b111, 0b101, 0b101, 0b101, 0b111],
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b111, 0b001, 0b111, 0b100, 0b111],
  3: [0b111, 0b001, 0b011, 0b001, 0b111],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b111, 0b001, 0b111],
  6: [0b111, 0b100, 0b111, 0b101, 0b111],
  7: [0b111, 0b001, 0b010, 0b010, 0b010],
  8: [0b111, 0b101, 0b111, 0b101, 0b111],
  9: [0b111, 0b101, 0b111, 0b001, 0b111],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  "+": [0b000, 0b010, 0b111, 0b010, 0b000],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  ":": [0b000, 0b010, 0b000, 0b010, 0b000],
  "/": [0b001, 0b001, 0b010, 0b100, 0b100],
  "%": [0b101, 0b001, 0b010, 0b100, 0b101],
  "(": [0b001, 0b010, 0b010, 0b010, 0b001],
  ")": [0b100, 0b010, 0b010, 0b010, 0b100],
  "°": [0b110, 0b110, 0b000, 0b000, 0b000],
};
