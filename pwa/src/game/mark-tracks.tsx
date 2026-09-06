// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP MARK'S TWO SKID MARKS, LAID.
//
// The tracks off the icon (`app-mark.ts`), drawn from nothing to full the way
// the car laid them — tail first, up through the inflection, out to where the
// car is held. Without the car: on the icon it is the subject and the tracks
// are what it left behind, but on its own the pair of tracks IS the mark, and
// a car parked at the end of them reads as a car that has stopped.
//
// Two ways of laying them, and the difference is the whole point of each:
//
//   "once" — laid on arrival and left there. A flourish, for a title that has
//            just come up (the boot card, the menu's wordmark). It says the
//            game has arrived.
//   "loop" — laid, held, dissolved from the tail, again. A load in progress
//            (`loading-screen.tsx`). It says the game is working.
//
// Under both is the same faint GHOST of the finished shape. On a loop it is
// what keeps the card balanced — the bright stroke is drawn from the tail, so
// for most of every cycle only the lower-left half is inked and the mark reads
// as sitting left of whatever is under it. On a one-shot it is what the mark
// is drawn INTO, so the space it will fill is held from the first frame and
// the title beside it never shifts.

import { MARK_LENGTH, MARK_TRACKS, MARK_TRACKS_VIEWBOX, MARK_WIDTH } from "./app-mark.ts";

/** How the pair is laid: once and left, or over and over. */
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
    <svg
      className={`mark-tracks mark-tracks-${lay}${className ? ` ${className}` : ""}`}
      viewBox={MARK_TRACKS_VIEWBOX}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {MARK_TRACKS.map((d) => (
        <path key={d} className="mark-track-ghost" d={d} strokeWidth={MARK_WIDTH} />
      ))}
      {MARK_TRACKS.map((d, i) => (
        <path
          key={d}
          className="mark-track"
          d={d}
          pathLength={MARK_LENGTH}
          strokeWidth={MARK_WIDTH}
          // The inner wheel lays its track a moment before the outer one
          // does, which is what the pair looks like on a real road.
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </svg>
  );
}
