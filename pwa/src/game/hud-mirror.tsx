// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLASS, AS A SWITCH — the strip of rear view at the top of the frame is
// something the player can put a finger on.
//
// The mirror is a second pass over the whole scene (mirror.ts) and the most
// expensive thing in a driving frame, so the press that stands it down
// belongs on the thing itself rather than three cards deep in the options:
// tap the glass and the picture goes out, tap it again and it comes back.
//
// THE MIRROR NEVER MOVES. What the press takes away is the PICTURE, not the
// glass: off, the strip stays exactly where it hung and goes flat grey, a
// mirror with nothing in it. That is the whole reason it is worth pressing
// on a phone — the target is the same fifth of the screen wide whichever
// state it is in, so switching the rear view off is not a gesture that makes
// switching it back on harder. A strip that shrank to a finger's height to
// say it was off would be the one thing on this screen that punished the
// player for using it.
//
// TWO SWITCHES, AND THEY ARE NOT THE SAME SWITCH:
//   * OPTIONS ▸ HUD ▸ REAR VIEW is whether the game has a mirror at all.
//     Off, there is no glass and nothing here to press.
//   * This one is what the mirror is SHOWING, for this session. Nothing is
//     saved: a player who blanked it over one jump is not saying what they
//     want the next time the game is opened.
// Which is why the press only ever stops the RENDERING. To be rid of the
// mirror, switch it off in the menu.
//
// The switch is placed off the same three numbers styles.css restates from
// mirror.ts (`--glass-*`) — see the parity note there — so it sits exactly on
// the glass in every viewport. It keeps that place in the views that put the
// picture somewhere else: from the cockpit the rear view is in the mirror
// hanging in the windscreen, and the switch for it still stands where the
// strip would be. One mirror, one place to reach for it.
//
// THE WORDS FLOAT OVER IT, because a grey rectangle at the top of the frame
// has to say what it is or it reads as something broken. Blank, the label
// stands on the glass for as long as the picture is off; switched back on, it
// says so over the returning road and fades out of the way, since a mirror
// showing the road behind explains itself.

import { useEffect, useRef, useState } from "react";

/** Where the top of the frame hangs, which is whatever the mirror is doing
 * over it: the picture, the blanked glass it toggles to, or nothing at all.
 * The first two hang in the same box — a blanked mirror takes up exactly the
 * room the picture did — and only the third frees it. The HUD's root writes
 * it out as `data-glass`, and styles.css drops the split's band and the
 * co-driver's calls below the glass off that one attribute. */
export type GlassSlot = "live" | "blank" | "off";

/** How long the label stands over a mirror that has just come back on, ms.
 * Matched to the fade in styles.css: the words are gone from the DOM on the
 * frame the animation finishes, so nothing is left half-transparent over the
 * road. */
const SAID_MS = 1400;

export function MirrorSwitch({ live, onToggle }: { live: boolean; onToggle: () => void }) {
  /** Whether the mirror coming back on is still being announced. Only that
   * direction is transient — blank, the label is the only thing on the glass
   * and it stays. */
  const [saying, setSaying] = useState(false);
  /** The first render is the state the stage STARTED in, not a press, and a
   * mirror that has always been on has nothing to announce. */
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) {
      pressed.current = true;
      return;
    }
    if (!live) return;
    setSaying(true);
    const timer = setTimeout(() => setSaying(false), SAID_MS);
    return () => clearTimeout(timer);
  }, [live]);
  return (
    <button
      type="button"
      className={`hud-mirror ${live ? "" : "hud-mirror-blank"}`}
      onClick={onToggle}
      title={live ? "Switch the rear view off" : "Switch the rear view on"}
      aria-label={live ? "Switch the rear-view mirror off" : "Switch the rear-view mirror on"}
    >
      {(!live || saying) && (
        <span className={`hud-mirror-label ${live ? "hud-mirror-said" : ""}`}>
          Rear view mirror {live ? "on" : "off"}
        </span>
      )}
    </button>
  );
}
