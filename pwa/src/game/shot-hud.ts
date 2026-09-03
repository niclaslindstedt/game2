// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD, ON ITS WAY INTO A PICTURE. The instruments are DOM over the
// canvas, so none of them are in the drawing buffer a screenshot is lifted
// from (screenshots.ts) — this is the half that puts them there.
//
// Two steps, and the split is timing rather than tidiness:
//
//   `readHudLayer` is SYNCHRONOUS and is called at the SHUTTER, beside the
//   debug overlay's boxes and for the same reason (App.tsx): the picture
//   has to carry the clock, the call and the place that were on screen when
//   the button went down, and the frame that serves the request is one or
//   three later. It serializes and nothing more — no decode, no canvas —
//   so a press never costs a frame.
//
//   `drawHudLayer` is ASYNCHRONOUS and runs with the stamp and the encode,
//   long after the drawing buffer has been read.
//
// NOTHING HERE IS LOAD-BEARING. Every failure — a browser that will not
// paint a `<foreignObject>`, a stylesheet it will not read back, a decode
// that never resolves — leaves the picture exactly as it was before the HUD
// was asked for, which is the frame the game shipped with for a year. A
// screenshot is never lost over its instruments.
//
// THREE THINGS A LAYER CANNOT REPRODUCE, none of them worth the machinery
// it would take to: `backdrop-filter` has nothing behind it inside an image,
// so the results card comes out translucent rather than frosted; the
// safe-area insets are zero in there, so a notched phone puts its
// instruments a few pixels off where the screen had them; and a CSS
// transition mid-sweep renders at its DESTINATION, so the tach needle in a
// picture is where the revs actually are rather than where the dial had got
// to. All three are fractions of a HUD that is otherwise the browser's own
// layout of the game's own stylesheet.

import { hudLayerSvg, type HudCover } from "./shot-plan.ts";

/** The HUD, serialized at the moment the shutter was pressed. The size is
 * the app-root's CSS box, which is the same rectangle the canvas fills. */
export type HudLayer = { svg: string; width: number; height: number };

/** The declarations the HUD inherits from the ancestors that are NOT coming
 * with it into the layer. The font is the one that matters — it is set on
 * `body` (styles.css), and a HUD that lost it would come back in the
 * browser's default serif at the browser's default size, which is a
 * different HUD rather than a slightly wrong one. Read off the live page
 * instead of restated, so this list never has to be kept in step with a
 * stylesheet. */
const INHERITED = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "line-height",
  "letter-spacing",
  "color",
  "direction",
] as const;

/** The page's own CSS, gathered once a session. It cannot change under a
 * running build — the app ships one stylesheet — and a screenshot is a
 * keypress, not a place to walk a few thousand rules again. */
let sheet: string | null = null;

/**
 * The HUD as it stands right now, or null when there is none to take: the
 * instruments are down (ALT is held, or a menu is up), or the window has no
 * size to speak of.
 */
export function readHudLayer(): HudLayer | null {
  try {
    const hud = document.querySelector<HTMLElement>(".hud");
    if (!hud) return null;
    // The HUD's own box is the flow one it never uses — its instruments are
    // pinned to the app-root around it, so THAT is the rectangle the layer
    // has to be, and it is the canvas's rectangle too.
    const host = hud.parentElement ?? document.documentElement;
    const box = host.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return null;
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    // XML rather than `outerHTML`: a `<foreignObject>` is parsed as XML, and
    // one unclosed `<br>` off the HTML serializer is a layer that does not
    // parse at all.
    const markup = new XMLSerializer().serializeToString(hud);
    const svg = hudLayerSvg({
      markup,
      css: pageCss(),
      width,
      height,
      inherited: inheritedOn(host),
    });
    return { svg, width, height };
  } catch {
    return null;
  }
}

/** How fine a map of the instruments the stamp is placed against. Coarse on
 * purpose: the question it answers is "is this corner of the picture busy",
 * and a grid this size is a few kilobytes of alpha rather than a copy of the
 * frame. Taller than it is wide because the answer is a HEIGHT — how far up
 * the badge has to go — and a row is what that is measured in. */
const COVER_COLS = 32;
const COVER_ROWS = 64;
/** Ink, rather than the ghost of a text shadow shrunk into a cell this big.
 * Low, because the cost of reading an empty corner as busy is a signature a
 * few pixels higher than it had to be, and the cost of the other mistake is
 * a signature across the speedo. */
const COVER_ALPHA = 8;

/**
 * Paint a layer over a grabbed frame, scaled to it, and say where it landed.
 *
 * Resolves either way: a layer the browser declined to draw is a picture
 * without instruments, never a picture that failed — and a null map is a
 * stamp placed the way it was before the HUD was ever in the frame.
 */
export async function drawHudLayer(
  ctx: CanvasRenderingContext2D,
  layer: HudLayer,
  width: number,
  height: number,
): Promise<HudCover | null> {
  try {
    const image = await decodeLayer(layer.svg);
    if (!image || taints(image)) return null;
    ctx.drawImage(image, 0, 0, width, height);
    return coverOf(image);
  } catch {
    /* the frame, unadorned */
    return null;
  }
}

/** Where the instruments put ink, at a size the stamp can be placed against
 * without a copy of the picture being read back. */
function coverOf(image: CanvasImageSource): HudCover | null {
  try {
    const map = document.createElement("canvas");
    map.width = COVER_COLS;
    map.height = COVER_ROWS;
    const ctx = map.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, COVER_COLS, COVER_ROWS);
    const { data } = ctx.getImageData(0, 0, COVER_COLS, COVER_ROWS);
    const on = new Uint8Array(COVER_COLS * COVER_ROWS);
    for (let cell = 0; cell < on.length; cell++) {
      on[cell] = (data[cell * 4 + 3] ?? 0) > COVER_ALPHA ? 1 : 0;
    }
    return { cols: COVER_COLS, rows: COVER_ROWS, on };
  } catch {
    return null;
  }
}

/** The page's stylesheet as text. Same-origin sheets only — a cross-origin
 * one throws on `cssRules` and is skipped, which is the right answer anyway:
 * the layer cannot fetch it either. */
function pageCss(): string {
  if (sheet !== null) return sheet;
  const parts: string[] = [];
  for (const style of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(style.cssRules)) parts.push(rule.cssText);
    } catch {
      continue;
    }
  }
  // Not cached when there was nothing to read: a sheet that had not landed
  // yet would otherwise be remembered as empty for the rest of the session,
  // and every picture after it would carry an unstyled HUD.
  if (parts.length === 0) return "";
  sheet = parts.join("\n");
  return sheet;
}

/** What the HUD is getting from above, as a declaration list. */
function inheritedOn(host: Element): string {
  const computed = getComputedStyle(host);
  return INHERITED.map((property) => `${property}:${computed.getPropertyValue(property)}`)
    .filter((declaration) => !declaration.endsWith(":"))
    .join(";");
}

/** The layer as something `drawImage` will take, or null where the browser
 * would not decode it. A data URL rather than a blob: it is unambiguously
 * same-origin, which is what keeps the canvas it is drawn onto readable. */
async function decodeLayer(svg: string): Promise<CanvasImageSource | null> {
  try {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * Whether drawing this image would make a canvas unreadable.
 *
 * Asked of a one-pixel scratch canvas BEFORE the real frame is touched,
 * because tainting is not something a canvas recovers from: a browser that
 * treats an SVG image as foreign would let the draw succeed and then refuse
 * the encode, and the whole picture — HUD, world and all — would come back
 * as PICTURE FAILED. One pixel is enough to find that out, and costs
 * nothing to throw away.
 */
function taints(image: CanvasImageSource): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d");
    if (!ctx) return true;
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}
