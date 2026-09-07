// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP MARK'S SKID MARKS, as paths anything in the app can draw.
//
// The mark is the flick itself: two tyre tracks that swing the car away from
// the corner and whip it back — one S of two tangent arcs each — with the car
// held sideways at the head of them. The car belongs to the ICON and stays
// there; the TRACKS are the part worth reusing, because a track is a thing
// that gets LAID, and a stroke that draws itself from nothing to full is the
// app's own mark saying it is working (`mark-tracks.tsx`).
//
// THE GEOMETRY IS STATED THREE TIMES and they must agree: here, as the two
// `d` strings; in `pwa/public/icons/icon.svg`, as the same two; and in
// `scripts/generate-icons.mjs`, as the arc centres and radii the raster icons
// are drawn from. None can import either of the others, so that is not a
// comment anybody has to remember — `tests/app_mark_test.ts` reads the SVG
// and holds these to it.
//
// `pathLength` is the reason this is worth a module rather than two strings
// in a stylesheet: declaring both tracks 100 units long lets a dash animation
// be written in PERCENT, so the long track and the short one draw at the same
// rate and finish together without either being measured.

/** The box the two tracks actually ink, stroke and round caps included.
 * NOT the icon's own 512-square: the mark is drawn low and left inside that,
 * with the car filling the top right, so a tracks-only drawing framed on the
 * square is a small S adrift in a lot of empty blue. */
export const MARK_TRACKS_VIEWBOX = "14 180 415 312";

/** The two tyre tracks, tail first: every path runs from the point the mark
 * dissolves out of, up through the inflection, to where the car is held. Draw
 * them in that direction and the mark is being LAID; reverse it and the car
 * is reversing. */
export const MARK_TRACKS = [
  "M 26.78 444.17 A 230 230 0 0 1 213.45 315.88 A 135 135 0 0 0 336.17 193.16",
  "M 98.68 479.24 A 150 150 0 0 1 220.43 395.57 A 215 215 0 0 0 415.87 200.13",
] as const;

/** How wide a track is drawn in the icon's space. */
export const MARK_WIDTH = 26;

/** What every track is declared to be long, so a dash animation over it is
 * written in percent. */
export const MARK_LENGTH = 100;
