// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R28 — THE SPLIT, as the car goes through a board: how long the piece of
// road that has just gone by took, which board of how many it was, whether it
// was the quickest that piece has ever been taken on this machine, and how
// the run stands against whatever it is chasing.
//
// It is a FLASH and not an instrument. A board goes past, it is read once in
// the half second after it, and then it is behind you — so it goes up under
// the mirror where the eyes already are (`--split-top` in styles.css) and the
// run's own clock takes it away again a few seconds later (SPLIT_HOLD in
// App.tsx). The record book behind the two green words is split-records.ts.

import { formatTime } from "../lib/util.ts";

/** R28 — the SPLIT: what the board the car has just gone through said. */
export type HudSplit = {
  id: number;
  /** Which board it was, 1-based, and how many the lap has. */
  index: number;
  count: number;
  /** The race clock as the car went through, seconds — what the reading ages
   * off (SPLIT_HOLD in App.tsx), not something the board prints. */
  time: number;
  /** THE READING ITSELF: how long the road since the last board took,
   * seconds. A segment rather than the running total, because the total is
   * already the biggest thing on the screen, and what a driver wants off a
   * board is what the piece of stage they have just driven cost. */
  segment: number;
  /** Seconds up (positive: slower) or down (negative: quicker) on whoever
   * this run is being measured against — null when it is measured against
   * nobody, which is a stage nothing has been driven on yet. */
  delta: number | null;
  /** Who that is, for the caption under the gap. */
  against: string;
  /** That segment was covered quicker than this machine has ever covered it
   * (split-records.ts). The record time itself is never shown anywhere: what
   * a driver can read at 140 km/h is two words, not a second number. */
  record: boolean;
};

/** The segment time big, which board it was in brackets beside it, and the
 * record's two words in green when there are any. The board is not NAMED as
 * a board: at rally pace a time and a count say everything an abbreviation
 * in front of them would, and the abbreviation is the part that has to be
 * read rather than seen.
 *
 * Under it, the gap to whoever the run is being measured against — the
 * arcade's own yellow and leading with a minus when the run is up on them,
 * red and a plus when it is down. A stage nobody has driven yet has no gap to show, and then the time
 * is the whole readout: a zero would read as dead level with a car that is
 * not there. */
export function SplitBoard({ split }: { split: HudSplit }) {
  const { delta } = split;
  const up = delta !== null && delta < 0;
  return (
    <div
      className={`hud-split ${delta === null ? "" : up ? "hud-split-up" : "hud-split-down"}`}
      role="status"
    >
      <div className="hud-split-time">
        {formatTime(split.segment)}
        <span className="hud-split-of">
          ({split.index}/{split.count})
        </span>
        {split.record && <span className="hud-split-record">NEW RECORD!</span>}
      </div>
      {delta !== null && (
        <div className="hud-split-gap">
          {up ? "−" : "+"}
          {Math.abs(delta).toFixed(2)}
          <span className="hud-split-against">{split.against}</span>
        </div>
      )}
    </div>
  );
}
