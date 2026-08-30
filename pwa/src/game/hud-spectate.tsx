// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPECTATOR'S STRIP — the one line of chrome over a run-out being watched.
//
// It is the broadcast lower third and nothing else: who is on screen, what
// their clock says, whether they are beating the time already on the sheet,
// and the three presses that are the whole of the mode — back one car, on one
// car, and out to the results.
//
// Everything the DRIVING hud reads is somebody else's car now (the dials, the
// damage, the minimap, the pace notes), so none of it is here: `Hud` hands the
// screen over to this strip whole rather than dressing the driving layout in
// numbers that are not the player's. What the feed IS lives in spectate.ts.

import { playUi } from "./audio/ui.ts";
import type { Watched } from "./spectate.ts";
import { formatTime, ordinal } from "../lib/util.ts";

export type SpectateProps = {
  watched: Watched;
  /** Walk the feed one car down the road (+1) or back up it (-1). */
  onStep: (by: number) => void;
  /** Stand down and put the results card back up. The run-out carries on
   * either way — it simply goes back to being settled at a rate nobody
   * watches. */
  onLeave: () => void;
};

/** The gap at the last board the two of them share, written the way a timing
 * screen writes one: signed, to a tenth, and said in words underneath,
 * because a sign alone leaves the reader working out whose favour it is in.
 *
 * The tones are the other way round from a driver's own split: this crew
 * being DOWN is the player keeping their place, so it is the good colour. */
function Gap({ gap, board }: { gap: number; board: number }) {
  const behind = gap > 0;
  return (
    <span className={`hud-spec-gap ${behind ? "hud-spec-gap-safe" : "hud-spec-gap-threat"}`}>
      {behind ? "+" : "−"}
      {Math.abs(gap).toFixed(1)}
      <span className="hud-chip-sub">
        {behind ? "DOWN" : "UP"} ON YOU AT {board}
      </span>
    </span>
  );
}

export function SpectateStrip({ watched, onStep, onLeave }: SpectateProps) {
  const step = (by: number): void => {
    playUi("select");
    onStep(by);
  };
  return (
    <div className="hud-spectate pointer-events-auto">
      <div className="hud-spec-head">
        <span className="hud-spec-tag">SPECTATING</span>
        <span className="hud-spec-out">
          {watched.running} CAR{watched.running === 1 ? "" : "S"} STILL OUT
        </span>
      </div>
      <div className="hud-spec-row">
        {/* The arrows are ONE stop on a controller's walk, not two — the pair
            either side of a value is what a thumb reads as one control
            (`data-nav-steps`, menu-nav.ts). */}
        <span className="hud-spec-steps" data-nav-steps data-nav-focus>
          <button
            type="button"
            className="hud-spec-step"
            data-nav-step="left"
            onClick={() => step(-1)}
            aria-label="Previous car"
          >
            ‹
          </button>
          <span className="hud-spec-who">
            {/* The number rides WITH the name, as the plate off the car's own
                door does. On its own line it reads as a stray digit between
                two labels rather than as the thing identifying the car. */}
            <span className="hud-spec-name">
              <span className="hud-spec-no">{watched.number}</span>
              {watched.alias.toUpperCase()}
            </span>
            <span className="hud-spec-driver">{watched.driver}</span>
          </span>
          <button
            type="button"
            className="hud-spec-step"
            data-nav-step="right"
            onClick={() => step(1)}
            aria-label="Next car"
          >
            ›
          </button>
        </span>
        <span className="hud-spec-numbers">
          {/* A staggered rally knows where a car is at a BOARD and nowhere
              between them (R29), so the caption says which board the place
              came off. A mass start reads the road itself and says so. */}
          {watched.place !== null && (
            <span className="hud-spec-place">
              {ordinal(watched.place)}
              <span className="hud-chip-sub">
                OF {watched.of} {watched.live ? "ON THE ROAD" : `AT SPLIT ${watched.board}`}
              </span>
            </span>
          )}
          <span className="hud-spec-clock">
            {formatTime(watched.time)}
            <span className="hud-chip-sub">THEIR CLOCK</span>
          </span>
          {watched.gap !== null && <Gap gap={watched.gap} board={watched.board} />}
        </span>
      </div>
      <button
        type="button"
        className="hud-pause-act hud-spec-leave"
        data-nav-back
        onClick={() => {
          playUi("select");
          onLeave();
        }}
      >
        BACK TO RESULTS
      </button>
    </div>
  );
}
