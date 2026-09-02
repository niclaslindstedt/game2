// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app icon, in the one format Tauri insists on.
//
// **Tauri refuses anything but an RGBA PNG at COMPILE time**, inside
// `generate_context!`, with `icon … is not RGBA` — and the website's icons are
// RGB, because `scripts/lib/png.mjs` (the repo's own encoder) writes RGB and a
// launcher icon has no use for an alpha channel. So the icons are RE-ENCODED
// rather than re-drawn: one source raster, the same one the manifest already
// installs, decoded, resized and widened to 8-bit RGBA at the sizes Tauri's
// bundler wants. Nothing here is a design decision — the art is
// `pwa/public/icons/`, made by `make icons`, and a change to the mark happens
// there and lands here on the next build (OSS_SPEC §11.2: this output is
// generated and gitignored).
//
// Pure Node, like the encoder it mirrors: a PNG decoder for the one shape of
// file the icon generator writes (8-bit, non-interlaced, RGB or RGBA) is fifty
// lines over `zlib`, and it keeps this tree free of a native image dependency
// — which matters on the packaging runners, where `sharp` would be a second
// platform-specific download.
//
// Usage:
//   node scripts/icons.mjs            # write tauri/src-tauri/icons/
//   node scripts/icons.mjs --check    # fail if they are missing or stale

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");

/** The one raster everything else is derived from — the manifest's own
 * 512-pixel install icon. */
const SOURCE = join(REPO_DIR, "pwa", "public", "icons", "pwa-512.png");
const OUT_DIR = join(APP_DIR, "src-tauri", "icons");

/** The sizes `tauri.conf.json` lists, and nothing beyond them: an icon nobody
 * reads is a file that goes stale without anyone noticing. */
const SIZES = [32, 128, 256, 512];

/** WINDOWS NEEDS AN `.ico`, AND NOTHING ELSE IN THIS TREE MAKES ONE.
 *
 * `tauri-build` embeds a Windows Resource file into the executable and looks
 * for `icons/icon.ico` to do it — on a Windows target it FAILS THE BUILD
 * without one ("required for generating a Windows Resource file"). The PNGs
 * above do not satisfy it.
 *
 * The sizes are Windows' own ladder: 16 and 32 are the ones actually drawn
 * (the title bar, the taskbar, Explorer's small views), 48 is the shell's
 * medium icon, and 256 is what a large-icon view scales from. */
const ICO_PATH = join(OUT_DIR, "icon.ico");
const ICO_SIZES = [16, 32, 48, 256];

const check = process.argv.includes("--check");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

/**
 * Decode the source PNG to an RGBA pixel buffer.
 *
 * Only the shape the icon generator writes is understood — 8 bits per
 * channel, RGB or RGBA, no interlace — and anything else is refused by name
 * rather than mis-decoded, because a wrong icon compiles fine and ships.
 */
function decodePng(file) {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${SOURCE} is not a PNG`);
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
        fail(
          `${SOURCE} is not an 8-bit non-interlaced RGB/RGBA PNG (depth ${depth}, ` +
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
  if (!width || !channels) fail(`${SOURCE} has no IHDR`);

  // Every scanline is one filter byte followed by the pixels, and each filter
  // is undone against the line above it (PNG filters 0–4).
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
      else if (filter !== 0) fail(`${SOURCE} uses PNG filter ${filter}`);
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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Resize by averaging every source pixel that falls under each output pixel.
 *
 * A box filter rather than nearest-neighbour, because the mark is thin yellow
 * tracks on blue and nearest sampling at a sixteenth of the size drops whole
 * tracks between the samples it keeps.
 */
function resize(source, size) {
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

/** Encode an RGBA pixel buffer as the 8-bit RGBA PNG Tauri wants. */
function encodeRgbaPng(size, rgba) {
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
  ihdr[9] = 6; // colour type: RGBA — the whole point of this script
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * One icon directory entry, as a classic DIB (the BMP-in-ICO format).
 *
 * Bottom-up BGRA under a `BITMAPINFOHEADER` whose height is DOUBLED, because
 * the format still describes two stacked bitmaps — the colour one and a 1-bit
 * AND mask. The mask is all zeroes (every pixel opaque as far as it is
 * concerned) and the alpha channel does the real work, which is what every
 * 32-bit icon since Windows XP does. Its rows are still padded to four bytes,
 * and a parser that reads the header will read them.
 */
function dibEntry(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — colour + mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Bottom-up: the last row of the image is the first row of the DIB.
    const from = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const at = from + x * 4;
      const to = (y * size + x) * 4;
      pixels[to] = rgba[at + 2]; // B
      pixels[to + 1] = rgba[at + 1]; // G
      pixels[to + 2] = rgba[at]; // R
      pixels[to + 3] = rgba[at + 3]; // A
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

/** The whole `.ico` — a 6-byte header, one 16-byte directory entry per size,
 * then the images. 256 is written as `0`, which is how the format spells it. */
function icoFile(source) {
  const images = ICO_SIZES.map((size) => dibEntry(size, resize(source, size)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(ICO_SIZES.length, 4);

  let offset = 6 + ICO_SIZES.length * 16;
  const directory = ICO_SIZES.map((size, at) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(images[at].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[at].length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...images]);
}

function outputs() {
  return SIZES.map((size) => ({ size, path: join(OUT_DIR, `${size}x${size}.png`) }));
}

function newerThanSource(path) {
  try {
    return statSync(path).mtimeMs >= statSync(SOURCE).mtimeMs;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (check) {
  const stale = [...outputs(), { path: ICO_PATH }].filter(({ path }) => !newerThanSource(path));
  if (stale.length) {
    fail(
      `${stale.length} icon(s) missing or older than ${SOURCE}. Run ` +
        "`npm --prefix tauri run icons`.",
    );
  }
  console.log(`✓ ${SIZES.length} icons and the Windows .ico are current`);
} else {
  const source = decodePng(readFileSync(SOURCE));
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { size, path } of outputs()) {
    writeFileSync(path, encodeRgbaPng(size, resize(source, size)));
  }
  writeFileSync(ICO_PATH, icoFile(source));
  console.log(`✓ ${SIZES.length} icons and a ${ICO_SIZES.length}-size .ico → ${OUT_DIR}`);
}
