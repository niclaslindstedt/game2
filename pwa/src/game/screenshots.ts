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
  notesFit,
  notesLayout,
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
 * THE CAPTION ON A DEVELOPER PICTURE, drawn into the pixels.
 *
 * The debug overlay is DOM over the canvas, so none of what it says is in
 * the drawing buffer a picture is lifted from — which is exactly wrong for
 * the one kind of picture whose whole purpose is to be handed to somebody
 * else. So a developer capture carries its boxes with it and they are
 * PAINTED ON, and the file stays self-describing after it has left the game.
 *
 * Structural rather than imported from debug-info.ts: this module knows how
 * to draw a titled list of key/value rows, and nothing about what a stage
 * is. `legend` is the layer ramp's chips, when one is painted.
 */
export type ShotNotes = {
  boxes: { title: string; rows: { k: string; v: string }[] }[];
  /** The one line worth copying — the link that reproduces the frame. */
  repro?: string;
  legend?: { at: string; color: string }[];
};

/**
 * Sign a grabbed frame, encode it, and file it in the roll.
 *
 * Resolves the capture, or null when the browser declined to encode one.
 * Never throws: a picture that could not be taken is a keypress that did
 * nothing, and never a run that ended.
 */
export async function keepShot(
  frame: HTMLCanvasElement,
  label: string,
  notes?: ShotNotes | null,
): Promise<Capture | null> {
  armScreenshots();
  try {
    const ctx = frame.getContext("2d");
    if (ctx && notes) drawNotes(ctx, frame.width, frame.height, notes);
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
export function captureFrame(
  source: HTMLCanvasElement,
  label: string,
  notes?: ShotNotes | null,
): Promise<Capture | null> {
  const frame = grabFrame(source);
  return frame ? keepShot(frame, label, notes) : Promise.resolve(null);
}

/** The instrument look, restated for the canvas: the same monospace, the
 * same ink and the same panel the debug overlay wears in the DOM
 * (styles.css). A picture of the overlay and a picture with the overlay
 * painted on have to read as the same tool. */
const NOTE_FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const NOTE_PANEL = "rgba(6, 14, 30, 0.82)";
const NOTE_EDGE = "rgba(159, 216, 255, 0.4)";
const NOTE_INK = "#dff1ff";
const NOTE_KEY = "rgba(159, 216, 255, 0.75)";
const NOTE_TITLE = "#ffd23e";

/** Break `text` into lines that fit `width` at the ctx's current font. Words
 * first; a single word longer than the column is cut rather than allowed to
 * run off the panel, because a truncated NUMBER is the one thing a caption
 * may not produce. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    while (ctx.measureText(line).width > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = NOTE_PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = NOTE_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Paint the notes onto a grabbed frame: the boxes down the left, the layer
 * legend and the repro line along the foot. Left and bottom for the same
 * reason the overlay uses them — the middle of the picture is the thing
 * being reported, and the mark owns the bottom right. */
function drawNotes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: ShotNotes,
): void {
  if (!notesFit(width, height)) return;
  const L = notesLayout(width, height);
  // The bottom-right corner belongs to the mark, and the mark goes on AFTER
  // this — so the strips along the foot stop above it rather than being
  // signed across. Lifting them keeps the repro line the full width of the
  // picture, which matters more than the corner does: it is the one line
  // somebody has to be able to select and paste.
  const signed = stampFits(width, height) ? stampLayout(width, height) : null;
  const bottom = height - (signed ? signed.mark + signed.pad * 2 : 0);
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // The boxes. Each is measured before it is drawn, because a value that
  // wrapped to three lines has to be inside its own panel rather than over
  // the next one.
  let y = L.pad;
  const valueWidth = L.width - L.inset * 2 - L.key;
  for (const box of notes.boxes) {
    ctx.font = `${L.font}px ${NOTE_FONT_STACK}`;
    const wrapped = box.rows.map((row) => ({ row, lines: wrapText(ctx, row.v, valueWidth) }));
    const rows = wrapped.reduce((n, r) => n + r.lines.length, 0);
    const boxHeight = L.inset * 2 + L.line * (rows + 1);
    if (y + boxHeight > bottom - L.pad - L.line * 3) break;
    panel(ctx, L.pad, y, L.width, boxHeight);
    let at = y + L.inset;
    ctx.fillStyle = NOTE_TITLE;
    ctx.font = `bold ${L.title}px ${NOTE_FONT_STACK}`;
    ctx.fillText(box.title, L.pad + L.inset, at);
    at += L.line;
    ctx.font = `${L.font}px ${NOTE_FONT_STACK}`;
    for (const { row, lines } of wrapped) {
      ctx.fillStyle = NOTE_KEY;
      ctx.fillText(row.k, L.pad + L.inset, at);
      ctx.fillStyle = NOTE_INK;
      lines.forEach((line, i) => ctx.fillText(line, L.pad + L.inset + L.key, at + L.line * i));
      at += L.line * lines.length;
    }
    y += boxHeight + L.gap;
  }

  // The legend, then the repro line under it — the two things that are about
  // the whole picture rather than about one corner of it.
  let foot = bottom - L.pad;
  if (notes.repro) {
    ctx.font = `${L.font}px ${NOTE_FONT_STACK}`;
    const wide = width - L.pad * 2 - L.inset * 2 - L.key;
    const lines = wrapText(ctx, notes.repro, wide);
    const boxHeight = L.inset * 2 + L.line * lines.length;
    foot -= boxHeight;
    panel(ctx, L.pad, foot, width - L.pad * 2, boxHeight);
    ctx.fillStyle = NOTE_TITLE;
    ctx.font = `bold ${L.title}px ${NOTE_FONT_STACK}`;
    ctx.fillText("REPRO", L.pad + L.inset, foot + L.inset);
    ctx.fillStyle = NOTE_INK;
    ctx.font = `${L.font}px ${NOTE_FONT_STACK}`;
    lines.forEach((line, i) =>
      ctx.fillText(line, L.pad + L.inset + L.key, foot + L.inset + L.line * i),
    );
    foot -= L.gap;
  }
  if (notes.legend && notes.legend.length > 0) {
    ctx.font = `${L.font}px ${NOTE_FONT_STACK}`;
    const boxHeight = L.inset * 2 + L.line;
    foot -= boxHeight;
    let x = L.pad + L.inset;
    // Measured first so the strip is exactly as wide as its own chips: a
    // legend padded to the frame is a bar across the bottom of the picture.
    for (const stop of notes.legend) x += L.chip + L.gap + ctx.measureText(stop.at).width + L.font;
    panel(ctx, L.pad, foot, Math.min(width - L.pad * 2, x - L.pad + L.inset), boxHeight);
    x = L.pad + L.inset;
    const chipY = foot + L.inset + Math.round((L.line - L.chip) / 2);
    for (const stop of notes.legend) {
      ctx.fillStyle = stop.color;
      ctx.fillRect(x, chipY, L.chip, L.chip);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.strokeRect(x + 0.5, chipY + 0.5, L.chip - 1, L.chip - 1);
      x += L.chip + L.gap;
      ctx.fillStyle = NOTE_INK;
      ctx.fillText(stop.at, x, foot + L.inset);
      x += ctx.measureText(stop.at).width + L.font;
    }
  }
  ctx.restore();
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
