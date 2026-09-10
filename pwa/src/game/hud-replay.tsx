// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE REPLAY BAR — the one strip on screen while a recorded run is being
// watched (game/replay.ts).
//
// A replay is the game's own frames: the same stage, the same car, the same
// physics, driven off the controls the run was driven on. So there is nothing
// to add to the HUD — the clock, the dials, the route and the damage all read
// the recording exactly as they read the run — and the only two things a
// WATCHER has that a driver does not are the answers to "what am I looking
// at" and "keep this".
//
// TOP CENTRE, where the spectator's banner stands (hud-spectate.tsx) and for
// the same reason: both name what is being watched rather than saying
// anything about the driving, and both belong to a frame nobody is steering.
// The corners either side stay claimed — the clock top-left, the route and
// the place top-right — and the bar is centred between them, giving up its
// second line before it reaches either. It stays up for the whole recording,
// the results card included — the disk is most likely to be wanted at the
// end, when the player has just seen how it went.
//
// THE DISK IS THE WHOLE OFFER. A run watched from the results card is not
// stored until it is pressed: somebody who only wanted to see the corner they
// lost it on owes the roll nothing, and a game that quietly kept every run
// would fill a browser profile with runs nobody chose.

import { playUi } from "./audio/ui.ts";

/** The save mark: a floppy disk — the body with its corner cut, the shutter
 * at the top and the label at the foot. Stroked rather than filled, which is
 * how the menu draws its marks (menu-glyphs.tsx) and the only weight that
 * survives being fourteen pixels tall; the HUD's own `.hud-glyph` fills, so
 * the paint is stated here instead.
 *
 * Drawn rather than lettered for the reason every mark in this game is: an
 * emoji is a different picture in every shell, and an icon font is a download
 * that can fail. */
function DiskGlyph() {
  return (
    <svg
      className="hud-replay-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.6 3.4h11.2l3.8 3.8v13.4a1.2 1.2 0 0 1-1.2 1.2H4.6a1.2 1.2 0 0 1-1.2-1.2V4.6a1.2 1.2 0 0 1 1.2-1.2Z" />
      <path d="M8 3.4h6.6v4.8H8Z" />
      <path d="M7 13.6h10v8.2H7Z" />
    </svg>
  );
}

export type ReplayBarProps = {
  /** The stage the recording was driven on, as the roll names it. */
  title: string;
  /** ...and the line under it: the discipline, the car, the result. */
  line: string;
  /** Keep this replay. Null once it is already on the roll, which is what
   * turns the press into the word SAVED — a button that would do nothing is
   * worse than no button. */
  onSave: (() => void) | null;
  /** Leave the recording for the main menu. */
  onLeave: () => void;
};

export function ReplayBar({ title, line, onSave, onLeave }: ReplayBarProps) {
  return (
    <div className="hud-replay pointer-events-auto">
      <div className="hud-replay-text">
        <div className="hud-replay-label">REPLAY</div>
        <div className="hud-replay-title">{title}</div>
        <div className="hud-replay-line">{line}</div>
      </div>
      <div className="hud-replay-acts">
        <button
          type="button"
          className={`hud-pause-act hud-replay-save ${onSave ? "" : "hud-replay-kept"}`}
          disabled={onSave === null}
          title={onSave ? "Keep this replay" : "Kept"}
          aria-label={onSave ? "Keep this replay" : "Kept"}
          onClick={() => {
            if (!onSave) return;
            playUi("select");
            onSave();
          }}
        >
          <DiskGlyph />
          <span className="hud-replay-word">{onSave ? "SAVE" : "SAVED"}</span>
        </button>
        {/* `data-nav-back` is what a controller's B button presses
            (menu-nav.ts) — the way out of a replay is the way out of any
            card. */}
        <button
          type="button"
          className="hud-pause-act hud-replay-exit"
          data-nav-back
          onClick={() => {
            playUi("select");
            onLeave();
          }}
        >
          EXIT
        </button>
      </div>
    </div>
  );
}
