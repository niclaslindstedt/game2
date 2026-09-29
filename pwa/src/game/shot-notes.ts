// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVELOPER PICTURE'S NOTES — where the caption a developer's screenshot
// carries goes, in picture pixels. Everything else decided about a picture
// before a pixel is touched (its size, its file name, the stamp and where it
// stands over the instruments, the HUD layer's document) is the framework's
// `@niclaslindstedt/oss-game-framework/shots/shot-plan`; this is the one part
// only this game draws. The canvas work that acts on it is screenshots.ts.
//
// DOM-FREE, for the same reason the framework's half is: it is arithmetic
// rather than graphics, and keeping it away from a canvas is what lets the
// suite hold it to a promise.
//
// A screenshot of a generator problem is only worth sending if it says which
// seed it is, which dials built it and where the lens was standing — and the
// debug overlay that says all that is DOM over the canvas, so none of it is
// in the drawing buffer the picture is lifted from. So the notes are DRAWN
// INTO the picture instead of captured from the page: it costs a few
// rectangles of Canvas2D and buys a file that is still self-describing after
// it has been pasted into a chat window, saved to a desktop, or handed to
// somebody who has never opened the game.
//
// What goes where is here; the drawing is in screenshots.ts.

/** Where a developer picture's notes go, in picture pixels. */
export type NotesLayout = {
  /** Margin from the picture's edges. */
  pad: number;
  /** The rows' size, and the title's above them. */
  font: number;
  title: number;
  /** Baseline to baseline. */
  line: number;
  /** How wide the key column is — the keys are short and known, and a
   * column is what makes a stack of rows readable as a table. */
  key: number;
  /** How wide the whole block is. */
  width: number;
  /** Inside a box, and between two of them. */
  inset: number;
  gap: number;
  /** The legend's colour chips. */
  chip: number;
};

/** How much of the SHORT side a note row is set at, and its bounds. Short
 * side for the same reason the mark is: a phone held sideways and one held
 * upright have to come out with type of the same weight. The floor is what
 * keeps a note legible in a chat window; the ceiling stops a 4K frame being
 * captioned in headlines. */
const NOTE_OF_SHORT_SIDE = 0.019;
export const NOTE_MIN = 11;
const NOTE_MAX = 24;

/** The rest of the block's proportions, all off the row's own size — one
 * panel, one scale, so it cannot come apart at a size nobody tested.
 *
 * The leading and the panel's inset are the DEBUG OVERLAY'S own, restated as
 * ratios: `line-height: 1.35` and `padding: 0.3rem 0.45rem` on `.debug-box`
 * in styles.css. A picture of the overlay and a picture with the overlay
 * painted on have to read as the same tool — and the density is also what
 * decides whether four boxes and twenty-five rows fit a 720p frame at all,
 * which at a looser leading they do not. */
const LINE_OF_FONT = 1.35;
const PAD_OF_FONT = 1.1;
const INSET_OF_FONT = 0.45;
const GAP_OF_FONT = 0.5;
const KEY_OF_FONT = 6.4;
const CHIP_OF_FONT = 0.85;
/** ...except the block's WIDTH, which is bounded by the picture as well:
 * wide enough for the longest row the overlay writes, and never more than
 * this share of the frame, because the middle of the picture is the thing
 * being reported. */
const WIDTH_OF_FONT = 34;
const WIDTH_OF_PICTURE = 0.46;

/** The row size a picture of this size naturally reads at. */
export function noteFont(width: number, height: number): number {
  const short = Math.max(1, Math.min(width, height));
  return Math.round(Math.min(NOTE_MAX, Math.max(NOTE_MIN, short * NOTE_OF_SHORT_SIDE)));
}

/**
 * The block's proportions, at the natural size or at a given one.
 *
 * The override is what lets a caption SHRINK TO FIT rather than lose a box
 * off the bottom. A racing overlay is four panels and twenty-five rows,
 * which at the natural size is taller than a 720p frame has room for — and a
 * picture that quietly dropped the CAR box would be a picture missing
 * exactly the numbers a handling bug is argued from. The caller steps the
 * size down to `NOTE_MIN` looking for a fit (screenshots.ts); everything
 * else about the panel follows the row, so nothing comes apart on the way.
 */
export function notesLayout(
  width: number,
  height: number,
  font = noteFont(width, height),
): NotesLayout {
  return {
    font,
    title: Math.round(font * 1.02),
    line: Math.round(font * LINE_OF_FONT),
    pad: Math.round(font * PAD_OF_FONT),
    inset: Math.round(font * INSET_OF_FONT),
    gap: Math.round(font * GAP_OF_FONT),
    key: Math.round(font * KEY_OF_FONT),
    width: Math.round(Math.min(font * WIDTH_OF_FONT, width * WIDTH_OF_PICTURE)),
    chip: Math.round(font * CHIP_OF_FONT),
  };
}

/** Whether a picture is big enough to caption. Under this the notes would be
 * most of the frame, and a report whose picture has been buried under its own
 * caption reports nothing. */
export function notesFit(width: number, height: number): boolean {
  const layout = notesLayout(width, height);
  return width >= layout.width * 2 && height >= layout.line * 12;
}
