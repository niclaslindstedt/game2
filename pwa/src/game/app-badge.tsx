// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP'S MARK, DRAWN — the launcher icon as a component.
//
// The same thing that is on the home screen, the browser tab and the store
// listing: the flick itself, two tyre tracks swinging a car away from the
// corner and whipping it back, on Swedish blue and yellow. It stands beside
// the game's name on the menu and over the publisher's on the boot card, so
// the mark a player installed the game by is the mark they are met by.
//
// The GEOMETRY is `app-mark.ts` and is shared with the loading card, which
// draws the tracks alone and lays them from nothing (`loading-screen.tsx`).
// This is the whole badge: the rounded square, the tracks with their tail
// dissolving into the sky, and the car at the head of them.
//
// It is drawn rather than <img>-ed off `icons/icon.svg` for one reason worth
// stating: an image is a second request that arrives after the card it is on,
// so the boot screen would come up with a hole in it. Inline SVG is in the
// first paint. `tests/app_mark_test.ts` is what keeps the two agreeing.

import { useId } from "preact/hooks";

import {
  MARK_CAR,
  MARK_COLORS,
  MARK_FADE,
  MARK_RADIUS,
  MARK_TRACKS,
  MARK_VIEWBOX,
  MARK_WIDTH,
} from "./app-mark.ts";

export function AppBadge({ className }: { className?: string }) {
  // Every badge on a page needs gradient ids of its own: two <defs> under one
  // id would have the second silently painted with the first.
  const id = useId();
  const sky = `mark-sky-${id}`;
  const tail = `mark-tail-${id}`;
  return (
    <svg
      className={`app-badge${className ? ` ${className}` : ""}`}
      viewBox={MARK_VIEWBOX}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK_COLORS.skyHigh} />
          <stop offset="1" stopColor={MARK_COLORS.skyLow} />
        </linearGradient>
        {/* The tail dissolves into the sky rather than stopping. */}
        <linearGradient
          id={tail}
          gradientUnits="userSpaceOnUse"
          x1={MARK_FADE.x1}
          y1={MARK_FADE.y1}
          x2={MARK_FADE.x2}
          y2={MARK_FADE.y2}
        >
          <stop offset="0" stopColor={MARK_COLORS.track} stopOpacity="0" />
          <stop offset="1" stopColor={MARK_COLORS.track} stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx={MARK_RADIUS} fill={`url(#${sky})`} />
      <g fill="none" stroke={`url(#${tail})`} strokeWidth={MARK_WIDTH}>
        {MARK_TRACKS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g transform={`translate(${MARK_CAR.at.x},${MARK_CAR.at.y}) rotate(${MARK_CAR.angle})`}>
        {MARK_CAR.parts.map((part, i) => (
          <rect
            key={i}
            x={-part.w / 2}
            y={-part.h / 2}
            width={part.w}
            height={part.h}
            rx={part.r}
            fill={part.paint === "ink" ? MARK_COLORS.ink : MARK_COLORS.shell}
            transform={`translate(${part.x},${part.y}) rotate(${part.turn})`}
          />
        ))}
      </g>
    </svg>
  );
}
