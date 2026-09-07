// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP MARK'S TWO SKID MARKS, FILLED.
//
// The tracks off the icon (`app-mark.ts`), filling from nothing to full the
// way the car laid them — from the tail at the bottom up to where the car is
// held at the top, BOTH AT ONCE, because a car lays two tracks with the same
// wheels at the same moment. Without the car: on the icon it is the subject
// and the tracks are what it left behind, but on its own the pair of tracks
// IS the mark, and a car parked at the end of them reads as a car that has
// stopped.
//
// Two ways of filling them:
//
//   "once" — filled on arrival and left there. A flourish beside a title that
//            has just come up (the menu's wordmark). It says the game has
//            arrived.
//   "loop" — filled, held, faded, again. A load in progress
//            (`loading-screen.tsx`). It says the game is working.
//
// IT IS A WIPE, NOT A STROKE, AND THAT IS THE WHOLE DESIGN. The obvious way
// to draw a line on is `stroke-dashoffset`, and it was the first way this
// worked — but that property animates on the MAIN THREAD, and the main thread
// is exactly what this card is covering for. Standing a long stage up blocks
// it for seconds at a stretch (compiling the road, building the country and
// its forest are single indivisible calls), and a card that freezes for those
// seconds is worse than no card at all: it reads as a hung game.
//
// So the fill is a BAND that slides up over the finished shape, and a band is
// a `transform` — which browsers run on the COMPOSITOR, off the main thread,
// so it keeps moving through a block that would freeze a stroke animation
// solid. The band is honest about the shape because both tracks descend
// strictly (`tests/app_mark_test.ts` walks them and proves it): every point
// further along a track is higher up the box than the one before it, so a
// bottom-to-top band uncovers each track in the order the car laid it, and
// one band covers both.
//
// The double translate is how a wipe is done with transforms alone. The
// clipping box slides up over the drawing while the drawing slides down by
// the same amount inside it, so the drawing stays PUT on screen and only the
// window into it moves. Two transforms, no layout, nothing for the main
// thread to do once it has started them.

import { MARK_TRACKS, MARK_TRACKS_VIEWBOX, MARK_WIDTH } from "./app-mark.ts";

/** How the pair is filled: once and left, or over and over. */
export type MarkLay = "once" | "loop";

export function MarkTracks({
  lay,
  className,
  title,
}: {
  lay: MarkLay;
  className?: string;
  /** Set only where the marks are the whole of what an element says. Beside a
   * wordmark they are decoration and stay out of the accessibility tree. */
  title?: string;
}) {
  return (
    <div
      className={`mark-tracks mark-tracks-${lay}${className ? ` ${className}` : ""}`}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
    >
      {/* The finished shape, faint, under everything. It holds the space the
          fill is about to take, so nothing beside the mark shifts as it runs
          and the card never shows a half-drawn mark adrift of its own box. */}
      {track("mark-tracks-ghost")}
      {/* ...and the bright pair over it, behind a window that slides up. */}
      <div className="mark-tracks-wipe">
        <div className="mark-tracks-slide">{track("mark-tracks-fill")}</div>
      </div>
    </div>
  );
}

/** One copy of the pair, as its own svg. Drawn twice — once faint and once
 * bright — because the wipe has to clip the bright copy without touching the
 * faint one under it. */
function track(className: string) {
  return (
    <svg className={className} viewBox={MARK_TRACKS_VIEWBOX} focusable="false" aria-hidden="true">
      {MARK_TRACKS.map((d) => (
        <path key={d} d={d} strokeWidth={MARK_WIDTH} />
      ))}
    </svg>
  );
}
