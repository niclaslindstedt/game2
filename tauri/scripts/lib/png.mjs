// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PNG in and PNG out, in pure Node — the pixels the desktop shell's icon
// pipeline is built on.
//
// **This tree may not import the repository's own `scripts/lib/png.mjs`.**
// `scripts/` is tooling, which may import anything while nothing imports it,
// and `tauri/` is a platform shell that lives outside the npm workspace with
// its own dependency tree. So the encoder is spelled again over here, small
// and on purpose: a decoder for the one shape of file `make icons` writes is
// fifty lines over `zlib`, and the alternative is a native image dependency on
// every packaging runner.

import { deflateSync, inflateSync } from "node:zlib";

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode a PNG to an RGBA pixel buffer.
 *
 * Only the shape `make icons` writes is understood — 8 bits per channel, RGB
 * or RGBA, no interlace — and anything else is refused BY NAME rather than
 * mis-decoded, because a wrong icon compiles fine and ships. `label` is what
 * that refusal calls the file.
 */
export function decodePng(file, label = "the source") {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${label} is not a PNG`);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.toString("ascii", at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      const interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(
          `${label} is not an 8-bit non-interlaced RGB/RGBA PNG (depth ${depth}, ` +
            `colour type ${colour}, interlace ${interlace}) — regenerate it with \`make icons\``,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (!width || !channels) throw new Error(`${label} has no IHDR`);

  // Every scanline is one filter byte followed by the pixels, and each filter
  // is undone against the line above it (PNG filters 0-4).
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`${label} uses PNG filter ${filter}`);
      line[i] = (line[i] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      rgba[to] = line[from];
      rgba[to + 1] = line[from + 1];
      rgba[to + 2] = line[from + 2];
      rgba[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
    previous = line;
  }
  return { width, height, rgba };
}

/**
 * Resize by averaging every source pixel that falls under each output pixel.
 *
 * A box filter rather than nearest-neighbour, because the mark is thin yellow
 * tracks on blue and nearest sampling at a sixteenth of the size drops whole
 * tracks between the samples it keeps. Alpha is averaged with the colour,
 * which is right for the straight-alpha rasters this pipeline carries and
 * wrong for nothing it has.
 */
export function resize(source, size) {
  const { width, height, rgba } = source;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor((y * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / size));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / size));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const at = (sy * width + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += rgba[at + c];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const to = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) out[to + c] = Math.round(sum[c] / count);
    }
  }
  return out;
}

/** Encode an RGBA pixel buffer as the 8-bit RGBA PNG Tauri and Apple want. */
export function encodeRgbaPng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
