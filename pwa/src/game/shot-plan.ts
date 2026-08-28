// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING DECIDED ABOUT A SCREENSHOT BEFORE A PIXEL IS TOUCHED: how big
// the picture is, what it is called, and where the app's mark goes on it.
// The canvas work that acts on all three is next door in screenshots.ts.
//
// DOM-FREE, deliberately and load-bearingly. These are the parts of taking
// a picture that are arithmetic rather than graphics, and keeping them out
// of reach of a canvas is what lets the test suite hold them to a promise —
// a stamp is drawn into the corner of a picture that leaves the game, and
// nobody ever sees it before it does.
//
// THE MARK GOES BOTTOM RIGHT, and not by coin toss. The car sits
// middle-bottom of the frame in every chase camera, the sky and the corner
// call own the top, and the bottom-left is where the road runs out of frame
// on the inside of a right-hander — which is the half of the picture a
// drift screenshot is usually about. The bottom-right corner is the
// quietest rectangle a rally frame has.

/** The longest side a picture is allowed. A 4K screen at the HIGH
 * resolution ceiling has a drawing buffer nobody wants to send anywhere,
 * and a rally screenshot is going into a chat window, not onto a wall. The
 * cap is a DOWNSCALE only: a smaller frame is kept at its own size rather
 * than blown up into pixels the renderer never drew. */
const MAX_SIDE = 2560;

/** The picture's size for a drawing buffer this big — the frame itself, or
 * as much of it as `MAX_SIDE` allows, with the aspect kept. */
export function shotSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_SIDE || longest < 1) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = MAX_SIDE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The picture's file name, on disk and in a share sheet: the game, where
 * the picture was taken, and when — sortable, lowercase, no spaces. */
export function shotFileName(app: string, label: string, takenAt: number): string {
  const stamp = new Date(takenAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${slug(app)}-${slug(label) || "shot"}-${stamp}.png`;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      // Apostrophes are DROPPED rather than separated on: a stage called
      // Devil's Elbow is not "devil-s-elbow" to anybody.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  );
}

/** Where the stamp's parts go, in picture pixels. */
export type StampLayout = {
  /** The app-icon square's side. */
  mark: number;
  /** The margin from the picture's right and bottom edges. */
  pad: number;
  /** The size the name is set at. */
  font: number;
  /** Between the mark and the first letter of the name. */
  gap: number;
};

/** How much of the SHORT side the mark takes, and the ceiling and floor on
 * the result. Short side rather than width, because a mark scaled off the
 * width would be a postage stamp on a phone held sideways and a billboard
 * on one held upright. The bounds are what keep the signature a signature:
 * a mark that scaled forever would be a logo across the corner of a 4K
 * frame, and one that scaled all the way down would be a smudge. */
const MARK_OF_SHORT_SIDE = 0.075;
const MARK_MIN = 26;
const MARK_MAX = 84;

/** The rest of the stamp's proportions, all off the mark: it is one badge,
 * and a badge whose parts scale against different things comes apart at
 * some size nobody tested. */
const PAD_OF_MARK = 0.5;
const FONT_OF_MARK = 0.42;
const GAP_OF_MARK = 0.3;

export function stampLayout(width: number, height: number): StampLayout {
  const short = Math.max(1, Math.min(width, height));
  const mark = Math.round(Math.min(MARK_MAX, Math.max(MARK_MIN, short * MARK_OF_SHORT_SIDE)));
  return {
    mark,
    pad: Math.round(mark * PAD_OF_MARK),
    font: Math.round(mark * FONT_OF_MARK),
    gap: Math.round(mark * GAP_OF_MARK),
  };
}

/** Whether a picture is big enough to be worth signing. Below this the
 * stamp would be most of the frame — which happens to nothing the game
 * captures today, but a thumbnail that reused this would find out the hard
 * way, and an unsigned picture is better than a defaced one. */
export function stampFits(width: number, height: number): boolean {
  const layout = stampLayout(width, height);
  return width >= layout.mark * 6 && height >= layout.mark * 3;
}

/** The name's typeface, the same condensed stack the HUD is set in
 * (styles.css) so a picture is signed in the game's own hand. Restated
 * rather than read off the document: a canvas font is a string, not a
 * computed style, and asking the DOM for one mid-capture is a layout flush
 * inside a frame. */
export const STAMP_FONT_STACK =
  '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui';
