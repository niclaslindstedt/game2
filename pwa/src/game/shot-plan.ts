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

/** A coarse yes/no map of where the HUD put ink over a picture: `cols` by
 * `rows` cells, row 0 at the top, 1 where an instrument covers the cell.
 * Read off the rasterized layer rather than off the DOM (shot-hud.ts),
 * because what matters is where the pixels LANDED — an instrument is a panel
 * with a shadow under a shape with a shadow under it, and no bounding box
 * anybody could walk says where that comes to. */
export type HudCover = { cols: number; rows: number; on: Uint8Array };

/** A rectangle of the picture, in picture pixels. */
export type Box = { left: number; right: number; top: number; bottom: number };

/**
 * HOW FAR THE STAMP HAS TO BE LIFTED to stand clear of the instruments.
 *
 * The bottom-right corner is the quietest rectangle a rally FRAME has, and
 * it stays the right corner now that the HUD is in the picture too — but it
 * is not always the last pixel of one. A phone held upright puts the whole
 * instrument cluster along the foot, and a signature dropped on it takes the
 * speedo with it. So the badge slides UP the corner until it finds room,
 * which on a window held sideways is no distance at all: the cluster is over
 * on the left there and the stamp is already standing on grass.
 *
 * Returns pixels, and zero when there is nowhere better to be — a picture
 * covered corner to corner (the results card is one) gets the signature it
 * would have had anyway, rather than one floating in its middle.
 */
export function stampLift(cover: HudCover | null, box: Box, width: number, height: number): number {
  if (!cover || cover.cols < 1 || cover.rows < 1 || width < 1 || height < 1) return 0;
  const rowHeight = height / cover.rows;
  const from = clamp(Math.floor((box.left / width) * cover.cols), cover.cols);
  const to = clamp(Math.ceil((box.right / width) * cover.cols) - 1, cover.cols);
  const tall = Math.max(1, Math.ceil((box.bottom - box.top) / rowHeight));
  // Down from the foot, because the corner the badge wants is the one it
  // already has: the first band deep enough to hold it wins, and the lift is
  // how far that band's floor is off the picture's.
  for (let floor = cover.rows - 1; floor >= tall - 1; floor--) {
    if (clearBand(cover, from, to, floor - tall + 1, floor)) {
      return Math.round((cover.rows - 1 - floor) * rowHeight);
    }
  }
  return 0;
}

/** Whether every cell of a band of rows, over a range of columns, is free of
 * instruments. */
function clearBand(
  cover: HudCover,
  from: number,
  to: number,
  top: number,
  bottom: number,
): boolean {
  for (let row = top; row <= bottom; row++) {
    for (let col = from; col <= to; col++) {
      if (cover.on[row * cover.cols + col]) return false;
    }
  }
  return true;
}

function clamp(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

/** The name's typeface, the same condensed stack the HUD is set in
 * (styles.css) so a picture is signed in the game's own hand. Restated
 * rather than read off the document: a canvas font is a string, not a
 * computed style, and asking the DOM for one mid-capture is a layout flush
 * inside a frame. */
export const STAMP_FONT_STACK =
  '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui';

// ── The developer picture's notes ─────────────────────────────────────────
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
// Same arithmetic-not-graphics split as the stamp above: what goes where is
// here, the drawing is in screenshots.ts.

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

// ── The HUD layer ─────────────────────────────────────────────────────────
//
// THE HUD IS IN THE PICTURE. It is what the driver was looking at — the
// clock they were chasing, the call they took the corner on, the place they
// were running — and a rally screenshot with none of that in it is a photo
// of some trees. The player who wants the frame on its own already has two
// ways to it that cost nothing: OPTIONS' HUD switch takes the instruments
// down for good, and holding ALT takes them off for as long as the key is
// held. Neither is the shutter's business to guess at.
//
// The HUD is DOM over the canvas, so it is not in the drawing buffer a
// picture is lifted from and has to be RASTERIZED into it: the live subtree
// and the page's own stylesheet, wrapped in a `<foreignObject>` so the
// browser lays out and paints its own HUD rather than this file drawing a
// second one in Canvas2D. A redrawn HUD would be a copy to keep in step with
// every instrument that ever moves, and it would be wrong the first time
// somebody changed a stylesheet.
//
// Same arithmetic-not-graphics split as the stamp and the notes above: the
// document is ASSEMBLED here, where a test can read it, and the serializing,
// decoding and compositing are next door (shot-hud.ts).

/** The class the layer's wrapper wears, and what `:root` is rewritten to on
 * the way in. Inside an SVG the document's root element is the `<svg>`, so a
 * `:root` rule — which is where the HUD's ink, its shadow and every other
 * colour it is drawn in are declared — would match nothing at all and the
 * whole HUD would come out in the browser's default black. */
export const HUD_LAYER_ROOT = "shot-hud-root";

/** Everything the HUD layer is built from. `markup` is the HUD subtree
 * serialized as XML, `css` the page's own stylesheet, and `inherited` the
 * declarations the HUD gets from the ancestors that are NOT coming with it
 * (the font off `body`, most of all) — read from the live page rather than
 * restated, so nothing here has to know what the app is set in. */
export type HudLayerSource = {
  markup: string;
  css: string;
  /** The app-root's box in CSS pixels — the same rectangle the canvas
   * fills, which is what lets the layer be drawn over the picture with no
   * arithmetic beyond a scale. */
  width: number;
  height: number;
  inherited: string;
};

/**
 * The HUD as a standalone SVG document, ready to be decoded as an image.
 *
 * The viewport is the app-root's CSS box and the viewBox matches it, so
 * `vw`, `vh` and `vmin` — which the HUD sizes its minimap, its glass and its
 * pacenote strip in — resolve to exactly what they resolved to on screen.
 * The picture is usually bigger than that (a drawing buffer is CSS pixels
 * times the device ratio), and the scaling is left to the draw: an SVG is
 * rasterized at the size it is painted, so the HUD comes out at the
 * picture's resolution rather than upscaled from the window's.
 */
export function hudLayerSvg(source: HudLayerSource): string {
  const width = Math.max(1, Math.round(source.width));
  const height = Math.max(1, Math.round(source.height));
  // The wrapper stands in for `.app-root`: the HUD's instruments are pinned
  // with `position: absolute`, and without a positioned box of the window's
  // own size around them they would pin themselves to the SVG and pile up in
  // the corner.
  const style = `position:relative;width:${width}px;height:${height}px;overflow:hidden;${source.inherited}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<foreignObject x="0" y="0" width="${width}" height="${height}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" class="${HUD_LAYER_ROOT}" style="${escapeAttr(style)}">`,
    `<style>${cdata(rootedCss(source.css))}</style>`,
    source.markup,
    "</div></foreignObject></svg>",
  ].join("");
}

/** The page's stylesheet with every `:root` pointed at the layer's wrapper —
 * see `HUD_LAYER_ROOT`. A plain replace is enough because `:root` is only
 * ever a selector: it takes no arguments and cannot appear inside a value. */
function rootedCss(css: string): string {
  return css.split(":root").join(`.${HUD_LAYER_ROOT}`);
}

/** A stylesheet is dropped into the document verbatim rather than escaped,
 * because CSS is full of `&` and `>` and a nesting selector that came back
 * as `&amp;` would style nothing. The one sequence CDATA cannot carry is its
 * own terminator, which is split across two sections instead. */
function cdata(text: string): string {
  return `<![CDATA[${text.split("]]>").join("]]]]><![CDATA[>")}]]>`;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
