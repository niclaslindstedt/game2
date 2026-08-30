// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SENDING A PICTURE SOMEWHERE ELSE — the three ways a screenshot can leave
// the game, and an honest answer about which of them this device has.
//
// There is no single "share" on the web, so this module answers the
// question the gallery actually has — what can this browser do with a PNG?
// — and gives each answer its own verb. The gallery offers the ones that
// come back true, in this order, because that is the order of how directly
// each gets the picture to a person:
//
//   SHARE   `navigator.share({ files })`, the platform's own sheet. On a
//           phone this is the whole point: the camera roll, Messages, and
//           whatever chat app the player actually uses. Desktop Safari and
//           Windows Chrome raise a real sheet too, which is why this is
//           never gated on "is this touch" — it is gated on `canShare`, and
//           the browser is the one that knows.
//   COPY    the clipboard, as an image/png item. Where there is no sheet
//           there is nearly always a paste target one window away.
//   SAVE    a download. The floor: every browser can put a file on a disk.
//
// EVERY PROBE IS A REAL PROBE. `navigator.share` exists in browsers that
// will refuse a file payload, and `navigator.clipboard.write` exists in
// browsers with no PNG writer, so both are asked about the exact thing
// being sent rather than about their own existence. A button offered on a
// false positive is a button that does nothing when pressed, which is worse
// than one that was never there.
//
// SHARING NEEDS THE GESTURE. Both `share` and `write` want transient user
// activation, so they have to be called from the press itself and never
// after an `await` that outlives it. That is why nothing here decodes,
// re-encodes or fetches: a caller hands over a Blob it already holds.
//
// …except the SHUTTER, whose picture does not exist yet at the moment of the
// press — the drawing buffer can only be read inside the animation callback
// that filled it, which is frames away (game/screenshots.ts). That is what
// `beginImageCopy` is for, and why the clipboard is the one verb here with a
// second entry point.

/** The one MIME type everything here moves. */
export const MIME_PNG = "image/png";

/** A PNG blob as a named File — what `navigator.share` wants, and what
 * decides the name the receiving app shows. */
export function pngFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: MIME_PNG });
}

/** Whether the platform's share sheet will take THIS file. */
export function canShareImage(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  // `share` and `canShare` are optional in the DOM lib, so the pair is
  // narrowed here rather than declared as globals — which also keeps this
  // module loadable somewhere with no DOM at all.
  const nav = navigator as Navigator & {
    share?: (data: { files?: File[] }) => Promise<void>;
    canShare?: (data: { files?: File[] }) => boolean;
  };
  if (typeof nav.share !== "function") return false;
  // `canShare` is the only honest answer about files, and a browser with
  // `share` but no `canShare` predates file sharing entirely.
  if (typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Whether a PNG can go on the clipboard. */
export function canCopyImage(): boolean {
  if (typeof navigator === "undefined" || typeof ClipboardItem === "undefined") return false;
  if (typeof navigator.clipboard?.write !== "function") return false;
  // Firefox ships `ClipboardItem` with a text-only writer, and `supports`
  // is how it says so. A browser without the probe supports PNG — it is the
  // one type the spec makes mandatory.
  const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
  if (typeof supports !== "function") return true;
  try {
    return supports(MIME_PNG);
  } catch {
    return true;
  }
}

/** Raise the platform's share sheet. True when the picture went somewhere,
 * false when it did not — INCLUDING a player dismissing the sheet, which
 * arrives as an AbortError and is an ordinary outcome rather than a failure
 * worth reporting. */
export async function shareImage(
  file: File,
  data: { title?: string; text?: string } = {},
): Promise<boolean> {
  try {
    await navigator.share({ ...data, files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** Put the PNG on the clipboard. */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [MIME_PNG]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** A clipboard write that was CLAIMED before the picture existed. `settle`
 * hands over the PNG once it has been encoded — or null, when there was no
 * picture to hand over, which releases the claim rather than pasting
 * something stale. `done` says whether the clipboard took it. */
export type PendingCopy = {
  settle: (blob: Blob | null) => void;
  done: Promise<boolean>;
};

/**
 * Claim the clipboard for a picture that has not been taken yet.
 *
 * CALL THIS INSIDE THE PRESS. `ClipboardItem` takes a PROMISE of a blob as
 * well as a blob, and that is the whole trick: the write is issued while the
 * gesture's transient activation is still live, and the browser holds the
 * clipboard open until the picture arrives a few frames later. Awaiting the
 * encode first and writing afterwards is the same call outside its
 * activation, which Safari refuses outright.
 *
 * Where the promise form is not taken, it falls back to writing the finished
 * blob — which works in Chrome, whose activation outlives the encode — so the
 * worst case is a copy that silently did not happen on one browser rather
 * than one that throws on all of them.
 */
export function beginImageCopy(): PendingCopy {
  let hand: (blob: Blob | null) => void = () => {};
  const picture = new Promise<Blob | null>((resolve) => {
    hand = resolve;
  });
  if (!canCopyImage()) return { settle: hand, done: Promise.resolve(false) };
  // The clipboard's own promise must REJECT where the picture never came,
  // because resolving it with nothing would put an empty item on the
  // clipboard — which is worse than leaving what was already there.
  const wanted = picture.then((blob) => {
    if (!blob) throw new Error("no picture");
    return blob;
  });
  const later = (): Promise<boolean> => wanted.then(copyImage, () => false);
  try {
    return {
      settle: hand,
      done: navigator.clipboard.write([new ClipboardItem({ [MIME_PNG]: wanted })]).then(
        () => true,
        // A browser that took the item and then refused the promise still
        // has an ordinary blob write left to try.
        later,
      ),
    };
  } catch {
    return { settle: hand, done: later() };
  }
}

/** Save the PNG to the player's downloads. The path that always works.
 *
 * The anchor is put in the document rather than clicked detached: Firefox
 * ignores a click on an element that is not in a document, and the object
 * URL is revoked on a later task because revoking it in this one races the
 * download that has only just been started. */
export function saveImage(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
