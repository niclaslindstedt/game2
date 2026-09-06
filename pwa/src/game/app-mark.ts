// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP MARK'S SKID MARKS, as paths anything in the app can draw.
//
// The mark is the flick itself: two tyre tracks that swing the car away from
// the corner and whip it back — one S of two tangent arcs each — with the car
// held sideways at the head of them. The car is drawn from rounded boxes and
// belongs to the icon; the TRACKS are the part worth reusing, because a track
// is a thing that gets LAID, and a stroke that draws itself from nothing to
// full is the app's own mark saying it is working (`loading-screen.tsx`).
//
// THE GEOMETRY IS STATED THREE TIMES and they must agree: here, as the two
// `d` strings; in `pwa/public/icons/icon.svg`, as the same two; and in
// `scripts/generate-icons.mjs`, as the arc centres and radii the raster icons
// are drawn from. That is not a comment anybody has to remember —
// `tests/app_mark_test.ts` reads the SVG and holds these to it.
//
// `pathLength` is the reason this is worth a module rather than two strings
// in a stylesheet: declaring both tracks 100 units long lets a dash animation
// be written in PERCENT, so the long track and the short one draw at the same
// rate and finish together without either being measured.

/** The icon's own coordinate space — the badge's whole square. */
export const MARK_VIEWBOX = "0 0 512 512";

/** ...and the box the two TRACKS actually ink, stroke and round caps
 * included. The mark is drawn low and left inside the badge, with the car
 * filling the top right; anything showing the tracks ON THEIR OWN wants this
 * instead, or it draws a small S adrift in a lot of empty square. */
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

/** Where the tail dissolves into the sky, in the icon's space. Kept short:
 * yellow lerped a long way into blue passes through mud. */
export const MARK_FADE = { x1: 78, y1: 462, x2: 168, y2: 408 };

/** THE CAR at the head of the tracks, yawed out of its line of travel with
 * the front wheels already on opposite lock — which is what a driver does
 * next. Rounded boxes in the car's own frame: `+x` is the nose, `+y` its
 * right, and the frame is stood at `MARK_CAR.at` turned `MARK_CAR.angle`.
 *
 * `ink` is the dark outline colour and the glass; the shell is the paint. One
 * cabin, not a windscreen and a rear screen: at a launcher's icon size two
 * dark bands read as a domino, where a single greenhouse still reads as a
 * car. */
export const MARK_CAR = {
  at: { x: 356, y: 222 },
  angle: -35,
  /** Drawn in order, so a later box sits on an earlier one. */
  parts: [
    { x: 56, y: -50, w: 44, h: 20, r: 5, turn: -22, paint: "ink" },
    { x: 56, y: 50, w: 44, h: 20, r: 5, turn: -22, paint: "ink" },
    { x: -58, y: -50, w: 44, h: 20, r: 5, turn: 0, paint: "ink" },
    { x: -58, y: 50, w: 44, h: 20, r: 5, turn: 0, paint: "ink" },
    { x: 0, y: 0, w: 192, h: 92, r: 18, turn: 0, paint: "ink" },
    { x: 0, y: 0, w: 174, h: 74, r: 9, turn: 0, paint: "shell" },
    { x: -8, y: 0, w: 64, h: 58, r: 11, turn: 0, paint: "ink" },
  ],
} as const;

/** The mark's own three colours, which are the app's (`identity.ts`) with the
 * icon's own darker sky at the top of the gradient. */
export const MARK_COLORS = {
  skyHigh: "#123069",
  skyLow: "#1f7fe0",
  track: "#ffd23e",
  ink: "#123069",
  shell: "#f6f3ea",
} as const;

/** The corner radius of the badge the mark is set in. */
export const MARK_RADIUS = 96;
