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
// there and lands here on the next build (OSS_GAME_SPEC §11.2: this output is
// generated and gitignored).
//
// Pure Node, like the encoder it mirrors: a PNG decoder for the one shape of
// file the icon generator writes (8-bit, non-interlaced, RGB or RGBA) is fifty
// lines over `zlib`, and it keeps this tree free of a native image dependency
// — which matters on the packaging runners, where `sharp` would be a second
// platform-specific download.
//
// THE MACOS SET IS THE ONE EXCEPTION to "nothing here is a design decision".
// A Dock icon is not the mark in a square — it is a rounded square floating on
// its own shadow, inset inside its canvas — so the macOS ladder is RE-SHAPED
// as well as re-encoded, by `lib/mac-icon.mjs`, which carries the geometry and
// the reasoning. The mark itself is still untouched.
//
// Usage:
//   node scripts/icons.mjs            # write tauri/src-tauri/icons/
//   node scripts/icons.mjs --check    # fail if they are missing or stale

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ICNS_LADDER, icnsFile } from "./lib/mac-icon.mjs";
import { decodePng, encodeRgbaPng, resize } from "./lib/png.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");

/** The one raster everything else is derived from — the app mark at the
 * largest size anything asks for, written by `make icons`.
 *
 * A THOUSAND-PIXEL SOURCE RATHER THAN THE INSTALL ICON, because macOS asks for
 * `ic10` at 1024 and an icon upscaled from 512 is soft in exactly the place a
 * Retina Dock shows it largest. Everything below 512 is a downscale of this
 * one file, which is also what keeps the whole ladder identical to the mark
 * instead of diverging per size. */
const SOURCE = join(REPO_DIR, "pwa", "public", "icons", "icon-1024.png");
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

/** MACOS NEEDS AN `.icns`, AND IT IS NOT ONE OF THE PNGs EITHER.
 *
 * `tauri.conf.json`'s icon list feeds the Windows resource and the Linux
 * desktop entry; a macOS bundle reads `Contents/Resources/icon.icns` and
 * nothing else, so a `.app` built without one ships with the blank generic
 * document icon in the Dock. The whole ladder inside it is `lib/mac-icon.mjs`.
 */
const ICNS_PATH = join(OUT_DIR, "icon.icns");

const check = process.argv.includes("--check");

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

/** Say what is wrong and stop. The decoder throws rather than exiting, so
 * every refusal it makes arrives here and is printed the same way. */
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (check) {
  const stale = [...outputs(), { path: ICO_PATH }, { path: ICNS_PATH }].filter(
    ({ path }) => !newerThanSource(path),
  );
  if (stale.length) {
    fail(
      `${stale.length} icon(s) missing or older than ${SOURCE}. Run ` +
        "`npm --prefix tauri run icons`.",
    );
  }
  console.log(`✓ ${SIZES.length} icons, the Windows .ico and the macOS .icns are current`);
} else {
  let source;
  try {
    source = decodePng(readFileSync(SOURCE), SOURCE);
  } catch (error) {
    fail(error.message);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { size, path } of outputs()) {
    writeFileSync(path, encodeRgbaPng(size, resize(source, size)));
  }
  writeFileSync(ICO_PATH, icoFile(source));
  writeFileSync(ICNS_PATH, icnsFile(source));
  console.log(
    `✓ ${SIZES.length} icons, a ${ICO_SIZES.length}-size .ico and a ` +
      `${ICNS_LADDER.length}-entry .icns → ${OUT_DIR}`,
  );
}
