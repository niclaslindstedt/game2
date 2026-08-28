// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TAKING A PICTURE OF THE GAME — what the SCREENSHOT bind (ENTER, or the
// shutter on the HUD's button row where there is no keyboard) actually
// does, and the one place the frame, the roll and the gallery meet. What is
// DECIDED about a picture — its size, its name, where the mark goes — is
// next door in shot-plan.ts; this module is the canvas work.
//
// WHAT IS IN THE PICTURE is the rendered frame and nothing else: the world,
// the car, the weather, the mirror — everything the renderer drew — with
// the app's mark stamped into the corner. The HUD is NOT in it, and that is
// a decision rather than an omission. The HUD is DOM over the canvas, so
// putting it in the picture would mean rasterizing a live stylesheet, and
// what a rally screenshot is about is the car sideways in the trees. A
// speedo and a minimap over the top of that is the instrument panel of the
// machine the picture happened to be taken on.
//
// THE REAR-VIEW MIRROR IS IN IT, and that is not a leak in the rule above:
// the mirror is a render pass, not DOM (mirror.ts), so it is part of the
// frame in the same way the road is. It also happens to be right — the
// picture is what the driver was looking at, and half of what makes a rally
// screenshot worth sending is the car that was behind you.
//
// WHEN IT IS TAKEN is the delicate half. The renderer runs on a plain WebGL
// context with no `preserveDrawingBuffer`, which means the drawing buffer
// is only guaranteed to hold the frame until control goes back to the
// browser — so the pixels have to be lifted out INSIDE the animation
// callback that drew them, and cannot wait for a promise. That is why this
// module is in two halves:
//
//   `grabFrame` is synchronous and must be called from the frame loop, in
//   the same task as `renderer.render` (App.tsx does exactly that);
//   `keepShot` is asynchronous and does everything that can wait — the
//   stamp, the PNG encode, and the write into the roll.
//
// A capture is a REQUEST, never a freeze: the run keeps stepping, the
// picture lands a frame or three later, and the driver gets a receipt on
// the HUD when it does.

import { APP_NAME, APP_SHORT_NAME } from "../identity.ts";
import { configureShotStore, putShot, type ShotMeta } from "../lib/shot-store.ts";
import {
  STAMP_FONT_STACK,
  shotFileName as planFileName,
  shotSize,
  stampFits,
  stampLayout,
} from "./shot-plan.ts";
// The app mark, read from the same SVG the icons are generated from
// (pwa/public/icons/icon.svg) rather than restated here: the geometry has
// two homes already, and a third drawn in Canvas2D would be a third thing
// to keep in step. Inlined at build time, so a picture taken offline is
// signed exactly like one taken online.
import iconSvg from "../../public/icons/icon.svg?raw";

/** How many pictures the roll keeps. Forty frames of a stage at 1920 wide
 * is on the order of thirty megabytes — the same magnitude as the game's
 * own precache, and nothing a player has to be told about. Oldest out. */
export const MAX_SHOTS = 40;

let armed = false;
/** The decoded app mark, and the one attempt at decoding it. Held for the
 * session: it is the same picture on every shot, and decoding an SVG per
 * capture would be work done once a press for no reason. */
let markPromise: Promise<CanvasImageSource | null> | null = null;

/**
 * Name the roll and start the mark decoding.
 *
 * Called from every entry point that touches screenshots — the app arming
 * the feature, a capture, the gallery opening — rather than once at boot,
 * because a player who has switched the feature off should pay for none of
 * it. Idempotent, and it has to run before the store is read: an unnamed
 * store is a different database, so a gallery that skipped this would open
 * on an empty roll.
 */
export function armScreenshots(): void {
  if (armed) return;
  armed = true;
  configureShotStore({ dbName: `${APP_SHORT_NAME.toLowerCase()}-shots`, limit: MAX_SHOTS });
  markPromise = decodeMark();
}

/** The app mark as something `drawImage` will take, or null where the
 * browser would not decode it. Never rejects: an unsigned picture is worth
 * more than a keypress that did nothing. */
async function decodeMark(): Promise<CanvasImageSource | null> {
  try {
    // The source carries a viewBox and no width or height, which leaves an
    // `<img>` with no intrinsic size to lay out from — so the size the
    // viewBox already states is written onto the element before the decode.
    const sized = iconSvg.replace(/<svg\b/, '<svg width="512" height="512"');
    const image = new Image(512, 512);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** The picture's file name — the game, where it was taken, and when. */
export function shotFileName(label: string, takenAt: number): string {
  return planFileName(APP_SHORT_NAME, label, takenAt);
}

/**
 * Lift the frame off the drawing buffer. SYNCHRONOUS, and it has to be
 * called from inside the animation callback that drew the frame — see the
 * note at the top of this file. Returns the pixels on a 2D canvas, or null
 * if there was no buffer to read (a canvas of no size, a context the
 * browser had already released under a backgrounded tab).
 */
export function grabFrame(source: HTMLCanvasElement): HTMLCanvasElement | null {
  try {
    if (source.width < 1 || source.height < 1) return null;
    const size = shotSize(source.width, source.height);
    const frame = document.createElement("canvas");
    frame.width = size.width;
    frame.height = size.height;
    const ctx = frame.getContext("2d");
    if (!ctx) return null;
    // Smoothed, because the only resample this ever does is a DOWNSCALE of
    // a frame that was already anti-aliased.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, size.width, size.height);
    return frame;
  } catch {
    return null;
  }
}

/** What a finished capture hands back: the roll entry and the pixels. No
 * object URL — the roll already holds the blob, and the gallery mints (and
 * revokes) its own per tile, which is the only place one is ever shown. */
export type Capture = { meta: ShotMeta; blob: Blob };

/**
 * Sign a grabbed frame, encode it, and file it in the roll.
 *
 * Resolves the capture, or null when the browser declined to encode one.
 * Never throws: a picture that could not be taken is a keypress that did
 * nothing, and never a run that ended.
 */
export async function keepShot(frame: HTMLCanvasElement, label: string): Promise<Capture | null> {
  armScreenshots();
  try {
    const ctx = frame.getContext("2d");
    // The mark is awaited rather than skipped when it is late: the first
    // picture of a session is the one most likely to be shown to somebody,
    // and this is a decode of an inlined SVG, not a network trip.
    if (ctx) drawStamp(ctx, frame.width, frame.height, (await markPromise) ?? null);
    const blob = await toPng(frame);
    if (!blob) return null;
    const takenAt = Date.now();
    const meta = putShot({ takenAt, width: frame.width, height: frame.height, label, blob });
    return { meta, blob };
  } catch {
    return null;
  }
}

/** Grab and keep in one call — everything a caller inside the frame loop
 * has to do, with the synchronous half done before the first await. */
export function captureFrame(source: HTMLCanvasElement, label: string): Promise<Capture | null> {
  const frame = grabFrame(source);
  return frame ? keepShot(frame, label) : Promise.resolve(null);
}

/** Stamp the mark and the app's name into the corner shot-plan.ts chose.
 * A null mark draws the name alone, which is what a browser that would not
 * decode the icon gets rather than an unsigned picture. */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mark: CanvasImageSource | null,
): void {
  if (!stampFits(width, height)) return;
  const layout = stampLayout(width, height);
  ctx.save();
  ctx.font = `600 ${layout.font}px ${STAMP_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const label = APP_NAME.toUpperCase();
  // The name's width is the browser's to tell us — the fallback stack means
  // the face that actually renders it is not knowable ahead of time — so
  // the badge is laid out from its RIGHT edge inwards.
  const nameWidth = ctx.measureText(label).width;
  const markWidth = mark ? layout.mark + layout.gap : 0;
  const bottom = height - layout.pad;
  const left = width - layout.pad - markWidth - nameWidth;
  if (mark) ctx.drawImage(mark, left, bottom - layout.mark, layout.mark, layout.mark);
  // Sky, snow, a white car: the frame under the stamp can be any colour at
  // all, so the name carries its own dark edge rather than trusting the
  // picture to provide one.
  ctx.shadowColor = "rgba(9, 24, 51, 0.85)";
  ctx.shadowBlur = Math.max(2, Math.round(layout.font * 0.28));
  ctx.shadowOffsetY = Math.max(1, Math.round(layout.font * 0.08));
  ctx.fillStyle = "#ffffff";
  // Centred on the mark rather than sat on its baseline: the two are one
  // badge, and a badge with its halves on different lines reads as two
  // things that happened to land next to each other.
  ctx.fillText(label, left + markWidth, bottom - layout.mark / 2);
  ctx.restore();
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}
