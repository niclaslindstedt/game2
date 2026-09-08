// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FILMSTRIP'S THUMBNAILS — one small picture per shot, made once and
// kept for as long as the shot is on the roll, so that showing the whole
// roll costs what a strip of eighty-pixel tiles should cost.
//
// WHY THIS EXISTS AT ALL. A screenshot is the window it was taken through,
// which is to say around two million pixels; the strip draws it at about
// seven thousand. Handing the original straight to an `<img>` makes the
// browser decode all two million anyway and hold the bitmap — eight
// megabytes a tile, forty tiles on a full roll — and it does the decoding
// on the main thread, which on this card is also the thread stepping the
// game behind the menu. That is a stall you can feel from the press.
//
// So the picture is shrunk before it is ever shown. `createImageBitmap`
// does the decode AND the resize off the main thread, which is the whole
// point of using it rather than an `<img>` and a canvas; what comes back is
// re-encoded small and handed out as an object URL, so the markup stays an
// ordinary `<img>` and the CSS stays the CSS.
//
// ONE AT A TIME. Forty shrinks started together are forty decodes in
// flight, and a browser that obliges is a browser with no memory left for
// the frame. The queue below is the throttle; the gallery's own viewport
// gating is what decides which tiles ever ask.
//
// NOTHING HERE MAY THROW. A browser without `createImageBitmap`, a canvas
// that would not give up a context, a blob that will not decode: each one
// falls back to the full picture, which is exactly what the strip showed
// before this module existed — slower, and still a gallery.

import { thumbSize, type Shot } from "./shot-roll.ts";

/** The tile's own pixels: the strip's widest tile is 5rem — eighty CSS
 * pixels — at two device pixels each, which is as sharp as a thumbnail of
 * this size can be told from a sharper one. */
export const THUMB_BOX = { width: 160, height: 90 } as const;

type Made = {
  /** The URL once it exists, so a release can revoke it without awaiting. */
  url: string | null;
  /** The one shrink of this picture; every later caller joins it. */
  work: Promise<string | null>;
};

const made = new Map<string, Made>();

/** The tail of the queue. Every shrink chains onto it, so exactly one is
 * ever decoding. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * The thumbnail for one picture, made if it has not been made yet. Resolves
 * to an object URL this module owns — a caller must NEVER revoke it, or the
 * next tile to show the same picture gets a broken image.
 */
export function thumbUrl(entry: Shot): Promise<string | null> {
  const held = made.get(entry.id);
  if (held) return held.work;
  const record: Made = { url: null, work: Promise.resolve(null) };
  record.work = enqueue(() => shrink(entry)).then((url) => {
    record.url = url;
    return url;
  });
  made.set(entry.id, record);
  return record.work;
}

/** Let go of every thumbnail whose picture has left the roll — a delete, or
 * the cap pushing the oldest off. What is still on the roll is KEPT: the
 * pictures do not change, and a gallery opened twice should pay once. */
export function releaseThumbs(keep: ReadonlySet<string>): void {
  for (const [id, record] of made) {
    if (keep.has(id)) continue;
    made.delete(id);
    if (record.url) URL.revokeObjectURL(record.url);
    // A shrink still in flight has nobody left to show it; revoke whatever
    // it produces rather than leaking the URL it is about to mint.
    else void record.work.then((url) => (url ? URL.revokeObjectURL(url) : undefined));
  }
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

async function shrink(entry: Shot): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== "function") return whole(entry);
    const size = thumbSize(entry.width, entry.height, THUMB_BOX.width, THUMB_BOX.height);
    const bitmap = await createImageBitmap(entry.blob, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      // A tile this small is never studied; the cheap filter is the right
      // one, and it is the one that keeps the decode off the frame budget.
      resizeQuality: "low",
    });
    const small = await encode(bitmap, size);
    bitmap.close();
    return small ? URL.createObjectURL(small) : whole(entry);
  } catch {
    return whole(entry);
  }
}

/** The full picture, for a browser that could not shrink it. */
function whole(entry: Shot): string | null {
  try {
    return URL.createObjectURL(entry.blob);
  } catch {
    return null;
  }
}

async function encode(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}
