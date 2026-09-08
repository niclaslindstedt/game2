// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAPTION COMPOSITING for the store screenshots — shared by `store-shots.mjs`
// (the real capture) and `store-shot-sweep.mjs` (the time-matrix explorer), so
// a swept frame is composed exactly like the one that ships.
//
// IT COMPOSITES IN A BROWSER PAGE, not with an image library, and that is a
// decision rather than an omission. This repository has no native image
// dependency and does not want one — `scripts/lib/png.mjs` is a zlib encoder
// for the icon pipeline, which is nowhere near enough to lay type — and the
// browser is already open. Better: the band is then drawn with the GAME'S OWN
// stylesheet values, in the game's own type stack, so a caption sits under a
// frame it visibly belongs to instead of beside it.
//
// THE FONT IS A REAL RISK AND IS REPORTED RATHER THAN HIDDEN. The game asks
// for `Avenir Next Condensed`, falls back through `Arial Narrow` and `Roboto
// Condensed`, and lands on `system-ui` — so a Linux runner with no condensed
// face draws a caption in something wider than a Mac does. `resolvedFont()`
// says which family actually rendered, and the drivers print it, because a set
// whose type quietly changed between two machines is the one defect nobody
// notices until the listing is live. The HUD in the frame uses the same stack,
// so caption and HUD always agree with each other — what varies is which of
// the two pictures you shipped.
/* global document, HTMLImageElement */

import { PALETTE } from "../../pwa/src/identity.ts";

/** The game's own type stack — `body` in pwa/src/styles.css. Restated because
 * a stylesheet is not importable from Node; the drivers report which family of
 * it actually resolved, which is what keeps the copy honest. */
export const TYPE_STACK =
  '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';

/** The band's ground: the deep blue the HUD stamps its chrome in, so the
 * caption reads as part of the game's interface rather than as a sticker on
 * top of it. `hudShadow` and `sun` are `PALETTE` — the identity module is the
 * single source, and this file asks it rather than restating two hex codes. */
const BAND_BG = PALETTE.hudShadow;
const BAND_INK = PALETTE.hudInk;
const BAND_RULE = PALETTE.sun;

/** How long a full-raster composite may take. Ten minutes, for the reason
 * `PATIENCE` in recipes.mjs is ten minutes — and not imported from there,
 * because this module knows nothing about staging a run. */
const SHUTTER_MS = 600_000;

/**
 * Which font family actually drew the caption on this machine.
 *
 * Chromium reports the *requested* stack from `getComputedStyle`, so the
 * answer comes from measuring instead: the first family whose rendered width
 * differs from a known-absent one is the one in use. Cheap, and it is the only
 * question worth asking here.
 */
export async function resolvedFont(page) {
  return page.evaluate((stack) => {
    const measure = (family) => {
      const probe = document.createElement("span");
      probe.textContent = "COMMIT TO THE SLIDE 0123456789";
      probe.style.cssText = `position:absolute;visibility:hidden;font-size:64px;font-family:${family}`;
      document.body.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    // A family no machine has, so its width IS the generic fallback's.
    const fallback = measure('"no-such-family-anywhere", sans-serif');
    for (const family of stack.split(",").map((f) => f.trim())) {
      if (family === "sans-serif" || family === "system-ui") continue;
      if (Math.abs(measure(`${family}, "no-such-family-anywhere", sans-serif`) - fallback) > 0.5) {
        return family.replace(/"/g, "");
      }
    }
    // None of the named faces is installed, so the stack falls through to its
    // own `sans-serif`. Said plainly, because it is the difference between the
    // set a Mac shoots and the set a Linux runner shoots — and the game's HUD
    // in the same frame falls through identically, so the two always agree
    // with each other. Which of the two pictures you shipped is the question.
    return "sans-serif (no condensed face installed — shoot the shipping set on macOS)";
  }, TYPE_STACK);
}

/**
 * Compose one store frame from a raw device-resolution capture.
 *
 * `framed` — the gameplay sits BELOW a caption band, inset on the band's own
 * ground. Nothing in the game is covered, which is the entire point: this
 * game's HUD lives along the top and bottom edges (the clock and the mirror up
 * top, the dials and the news column at the foot), so a caption laid over the
 * frame would hide exactly what the shot is there to show.
 *
 * `bleed` — full-bleed gameplay with the caption over the top edge on a fade.
 * Every pixel of the game stays 1:1, at the cost of the HUD's top row. It is
 * what Steam wants and what a phone store card does not.
 *
 * `caption: null` returns the capture untouched — `--no-captions`, which is
 * how you look at the game rather than at the listing.
 */
export async function compose(page, rawPng, device, caption, layout = "framed") {
  const { width, height } = device.raster;
  if (!caption) return rawPng;

  const bandHeight = Math.round(height * (layout === "bleed" ? 0.15 : 0.17));
  const inset = layout === "bleed" ? 0 : Math.round(width * 0.028);
  const shot = `data:image/png;base64,${rawPng.toString("base64")}`;

  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
       html, body { margin: 0; padding: 0; background: ${BAND_BG}; }
       .sheet {
         position: relative;
         width: ${width}px; height: ${height}px;
         overflow: hidden;
         background: ${BAND_BG};
       }
       .shot {
         position: absolute;
         left: ${inset}px;
         top: ${layout === "bleed" ? 0 : bandHeight}px;
         width: ${width - inset * 2}px;
         height: ${layout === "bleed" ? height : height - bandHeight - inset}px;
         object-fit: contain;
         object-position: center;
       }
       .band {
         position: absolute; left: 0; top: 0;
         width: ${width}px; height: ${bandHeight}px;
         display: flex; flex-direction: column;
         align-items: center; justify-content: center;
         gap: ${Math.round(bandHeight * 0.11)}px;
         ${
           layout === "bleed"
             ? `background: linear-gradient(to bottom, ${BAND_BG} 0%, ${BAND_BG}cc 62%, transparent 100%);`
             : `background: ${BAND_BG};`
         }
       }
       .band span {
         font-family: ${TYPE_STACK};
         font-weight: 700;
         /* Sized off the BAND rather than the frame, and capped against the
            width, so a long caption shrinks instead of running off the edge —
            the one failure mode a fixed size has. */
         font-size: ${Math.round(
           Math.min(bandHeight * 0.34, (width * 0.92) / Math.max(12, caption.length * 0.58)),
         )}px;
         letter-spacing: 0.06em;
         text-transform: uppercase;
         color: ${BAND_INK};
         text-align: center;
         line-height: 1;
         white-space: nowrap;
       }
       .rule { width: ${Math.round(width * 0.24)}px; height: ${Math.max(
         2,
         Math.round(bandHeight * 0.035),
       )}px; background: ${BAND_RULE}; }
     </style></head><body>
       <div class="sheet">
         <img class="shot" src="${shot}">
         <div class="band"><span>${escapeHtml(caption)}</span><div class="rule"></div></div>
       </div>
     </body></html>`,
    { waitUntil: "load" },
  );
  // The capture is a data: URI, so `load` has already decoded it — but a zero
  // check costs nothing and turns "the frame came out empty" into an error
  // that names its cause.
  const drawn = await page.evaluate(() => {
    const img = document.querySelector("img.shot");
    return img instanceof HTMLImageElement && img.naturalWidth > 0;
  });
  if (!drawn) throw new Error("the capture did not decode into the compositor page");

  // A generous timeout for the same reason the capture has one: a 2868x1320
  // screenshot under software rasterization takes longer than Playwright's
  // 30-second default, and that failure reads as a broken harness.
  return page.screenshot({ clip: { x: 0, y: 0, width, height }, timeout: SHUTTER_MS });
}

/**
 * A contact sheet: the sweep's samples in a grid, each labelled with the stage
 * offset it was taken at, so picking a winner is reading a number off the
 * picture rather than counting cells.
 */
export async function contactSheet(page, frames, { columns = 3, cell = 640 } = {}) {
  const rows = Math.ceil(frames.length / columns);
  const cellHeight = Math.round(cell * 0.62);
  const label = Math.round(cellHeight * 0.14);
  const width = columns * cell;
  const height = rows * (cellHeight + label);

  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
       html, body { margin: 0; background: ${BAND_BG}; }
       .grid { display: grid; grid-template-columns: repeat(${columns}, ${cell}px); }
       figure { margin: 0; }
       img { display: block; width: ${cell}px; height: ${cellHeight}px; object-fit: contain; }
       figcaption {
         height: ${label}px; line-height: ${label}px;
         font-family: ${TYPE_STACK}; font-weight: 700;
         font-size: ${Math.round(label * 0.62)}px; letter-spacing: 0.08em;
         color: ${BAND_INK}; text-align: center;
         background: ${BAND_BG};
       }
     </style></head><body><div class="grid">${frames
       .map(
         (f) =>
           `<figure><img src="data:image/png;base64,${f.png.toString("base64")}">` +
           `<figcaption>${escapeHtml(f.label)}</figcaption></figure>`,
       )
       .join("")}</div></body></html>`,
    { waitUntil: "load" },
  );
  return page.screenshot({ clip: { x: 0, y: 0, width, height }, timeout: SHUTTER_MS });
}

/** Captions and labels are ours, not a player's — but a `&` in one would
 * still come out as an entity rather than an ampersand, which is exactly the
 * kind of defect that reaches a listing. */
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
