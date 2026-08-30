// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MENU'S GLYPHS — one small drawing per idea the menus keep repeating.
//
// A menu that has to write a sentence under every row is a menu explaining
// itself, and the explanations are what push a stage grid off a phone. A
// glyph says the same thing in a corner of the space and says it in every
// language, so the words left on screen can be the ones that are actually
// specific: a stage's name, a time, a place.
//
// They are drawn rather than lettered for the reason the padlock always was:
// an emoji is a different picture in every shell, and an icon font is a
// download that can fail. Everything here is one 24x24 box, stroked in
// `currentColor` at a weight that survives being 14px tall on a phone —
// which is the size these are actually read at.
//
// Meaning is shared across surfaces on purpose: the trophy is the campaign
// on the front door AND the best finish on a stage box, the stopwatch is the
// time trial AND a lap record. A player learns each mark once.

import type { JSX } from "preact";

/** Every mark the menus can ask for, in the order the contact sheet walks
 * them (`make glyphs`). One list, so a mark added here is a mark the sheet
 * shows without being told twice. */
export const GLYPH_NAMES = [
  "trophy",
  "stopwatch",
  "headsup",
  "roam",
  "camera",
  "sliders",
  "standings",
  "terminal",
  "lock",
  "sprint",
  "circuit",
  "clipboard",
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

/** The 24x24 body of each mark. Stroke geometry only — the wrapper sets the
 * paint, so a glyph inherits the colour of whatever row it sits in. */
const GLYPHS: Record<GlyphName, JSX.Element> = {
  // A cup with two handles: the championship, and a stage's best finish.
  trophy: (
    <>
      <path d="M8 4h8v5.5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.2a2.6 2.6 0 0 0 2.9 4" />
      <path d="M16 5.5h2.8a2.6 2.6 0 0 1-2.9 4" />
      <path d="M12 13.5V17M8.5 20h7M10 17h4" />
    </>
  ),
  // A stopwatch: the clock, wherever the clock is the opponent.
  stopwatch: (
    <>
      <circle cx="12" cy="14" r="7.2" />
      <path d="M12 10.5V14l2.6 2" />
      <path d="M9.6 3h4.8M12 3v2.4" />
    </>
  ),
  // The chequered flag: a race, and nothing carried out of it. Two cars seen
  // from above were the first draft and read as a pair of pills at the size
  // this is actually looked at.
  headsup: (
    <>
      <path d="M5 3.5v17.5" />
      <path d="M5 4.5h14v9H5z" />
      <path
        d="M5 4.5h3.5v4.5H5zM12 4.5h3.5v4.5H12zM8.5 9H12v4.5H8.5zM15.5 9H19v4.5h-3.5z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  // The road ahead: any seed, any length, no ladder. A compass was the first
  // draft and went to a blob with a slash in it at 14px.
  roam: (
    <>
      <path d="M4 20.5 9.4 3.5M20 20.5 14.6 3.5" />
      <path d="M12 5.5v2.6M12 11v2.6M12 16.4V19" />
    </>
  ),
  camera: (
    <>
      <rect x="2.6" y="7.4" width="18.8" height="12.4" rx="2.4" />
      <path d="M8.4 7.4 9.9 5h4.2l1.5 2.4" />
      <circle cx="12" cy="13.6" r="3.6" />
    </>
  ),
  // Three faders: the settings, as a mixing desk rather than a list.
  sliders: (
    <>
      <path d="M3 6.5h4M13 6.5h8" />
      <circle cx="10" cy="6.5" r="2.4" />
      <path d="M3 12h9M18 12h3" />
      <circle cx="15" cy="12" r="2.4" />
      <path d="M3 17.5h2M11 17.5h10" />
      <circle cx="8" cy="17.5" r="2.4" />
    </>
  ),
  // A table read as three bars, the winner tallest.
  standings: (
    <>
      <rect x="3" y="13" width="5" height="7.5" rx="1" />
      <rect x="9.5" y="7.5" width="5" height="13" rx="1" />
      <rect x="16" y="15.5" width="5" height="5" rx="1" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.8" y="4.5" width="18.4" height="15" rx="2.4" />
      <path d="M7 9.5l3 2.5-3 2.5M12.5 14.5H17" />
    </>
  ),
  // The padlock: a stage that is not open yet, and nothing else.
  lock: (
    <>
      <path d="M7.5 10.5v-3a4.5 4.5 0 0 1 9 0v3" />
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  // A start and a finish with road between them.
  sprint: (
    <>
      <path d="M3 12h12" />
      <path d="M11.5 8l4 4-4 4" />
      <path d="M19 4.5v15" />
    </>
  ),
  // A track seen from above — both kerbs of a closed loop. The same road,
  // driven again.
  circuit: (
    <>
      <path d="M8 4.5h8a7 7 0 0 1 0 14H8a7 7 0 0 1 0-14Z" />
      <path d="M9.5 9h5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 1 0-5Z" />
    </>
  ),
  // One sheet behind another: take a copy of this. The only mark here that
  // stands alone rather than beside a word, so it is drawn as the shape
  // every other application already uses for the same idea.
  clipboard: (
    <>
      <rect x="8.5" y="3" width="12.5" height="15.5" rx="2.2" />
      <path d="M15.5 21H5.2A2.2 2.2 0 0 1 3 18.8V7.5" />
    </>
  ),
};

/** One mark, sized by the row it sits in (`1em` of the current font size
 * unless the caller's CSS says otherwise). Always decorative: every glyph in
 * this menu sits beside a word, or inside a control that names itself. */
export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      className={`menu-glyph ${className ?? ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
}
