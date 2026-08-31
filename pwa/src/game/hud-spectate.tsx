// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPECTATOR'S BANNER — who is on screen, and the two presses that change
// it. Nothing else.
//
// Watching a run-out is still DRIVING, from the passenger seat: the crew
// under the camera is on the same stage, against the same clock, in a car
// with its own gearbox and its own dents. So the driving layout stays up and
// simply reads THAT car — the clock top left, the dials and the damage
// bottom left, the minimap and the position board top right. What is left
// over is the one thing no instrument on that layout can say: whose car it
// is. That is this, and this is all of it.
//
// It stands in the CO-DRIVER'S SLOT (`.hud-pace`, above the car), which is
// free for exactly as long as the mode lasts: there is nobody in this car to
// be called a corner, so `Hud` takes the pacenotes down and hands the space
// over. What the feed IS lives in spectate.ts.

import { playUi } from "./audio/ui.ts";
import type { Watched } from "./spectate.ts";

export type SpectateProps = {
  watched: Watched;
  /** Walk the feed one car down the road (+1) or back up it (-1). */
  onStep: (by: number) => void;
  /** Stand down and put the results card back up. The run-out carries on
   * either way — it simply goes back to being settled at a rate nobody
   * watches. */
  onLeave: () => void;
};

export function SpectateBanner({
  watched,
  onStep,
  onLeave,
  belowMirror,
}: SpectateProps & {
  /** The mirror is up, so the banner drops below the glass — the same
   * bargain the co-driver's calls strike for the same slot. */
  belowMirror: boolean;
}) {
  const step = (by: number): void => {
    playUi("select");
    onStep(by);
  };
  return (
    <div className={`hud-pace hud-spectate ${belowMirror ? "hud-pace-under-glass" : ""}`}>
      <div className="hud-spec-head">
        <span className="hud-spec-tag">SPECTATING</span>
        <span className="hud-spec-out">
          {watched.running} CAR{watched.running === 1 ? "" : "S"} STILL OUT
        </span>
      </div>
      {/* The arrows are ONE stop on a controller's walk, not two — the pair
          either side of a value is what a thumb reads as one control
          (`data-nav-steps`, menu-nav.ts). */}
      <div className="hud-spec-steps" data-nav-steps data-nav-focus>
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
      </div>
      <button
        type="button"
        className="hud-spec-leave"
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

/** The gap at the last board the watched crew and the player share, written
 * the way a timing screen writes one: signed, to a tenth, and said in words
 * underneath, because a sign alone leaves the reader working out whose
 * favour it is in.
 *
 * It hangs under the clock, in the chip the ghost's gap uses while the
 * player is the one driving — the same reading in the same corner: how the
 * car on screen is doing against the time already on the sheet. The tones
 * are the other way round from a driver's own split, though: this crew being
 * DOWN is the player keeping their place, so it is the good colour. */
export function SpectateGap({ watched }: { watched: Watched }) {
  if (watched.gap === null) return null;
  const behind = watched.gap > 0;
  return (
    <div className={`hud-chip hud-gap ${behind ? "" : "hud-gap-down"}`} aria-label="Gap to you">
      {behind ? "+" : "−"}
      {Math.abs(watched.gap).toFixed(1)}
      <span className="hud-chip-sub">
        {behind ? "DOWN" : "UP"} ON YOU AT {watched.board}
      </span>
    </div>
  );
}
