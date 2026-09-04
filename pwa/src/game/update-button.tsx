// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NEW-BUILD BUTTON: the only thing the app says on its own initiative,
// and it says it as quietly as a thing can and still be there.
//
// A BUTTON, NOT A CARD. An update that arrives is never urgent — the build
// in the tab keeps working, and the new one installs whenever the player
// feels like it — so it gets a mark in the bottom-right corner and nothing
// else: no heading, no version line, no plate lying across the screen. The
// corner is the one place both surfaces it can arrive over keep clear (the
// instrument cluster is bottom-left, the minimap dock top-right), and being
// this small is also why there is no way to dismiss it: ignoring it costs
// less than the press that would have hidden it.
//
// TWO PRESSES, because in a run it stands inside the right thumb's steering
// zone and one stray tap must not throw away the stage. The first press
// arms it and the mark becomes the word; the second reloads. It disarms
// itself after a few seconds, so a mis-tap decays back to a corner mark
// rather than sitting there loaded.
//
// The state it renders comes from the framework's `usePwaUpdate`; only the
// look, the arming and the sound are ours.

import { useEffect, useState } from "react";

import { playUi } from "./audio/ui.ts";

/** How long an armed button waits for its second press before going quiet. */
const ARM_MS = 4000;

type UpdateButtonProps = {
  needRefresh: boolean;
  /** The waiting build's version, once `version.json` has been read; the
   * button shows before that lands, so it is optional and only ever reaches
   * the hover label. */
  incomingVersion?: string | null;
  onReload: () => void;
};

/** The mark: an arrow coming down onto a line — a build arriving, which is
 * what has happened. Deliberately NOT the curling arrow the HUD's action
 * row already uses for the way back to the last split board: two circular
 * arrows on one screen meaning two different things is one too many. */
function UpdateGlyph() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="update-nudge-mark">
      <path
        d="M 50 11 V 49"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <polygon points="26,43 74,43 50,77" fill="currentColor" />
      <path
        d="M 24 89 H 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UpdateButton({ needRefresh, incomingVersion, onReload }: UpdateButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!needRefresh) return null;

  // The whole message, spent on the one thing a corner mark cannot show:
  // WHICH build is waiting. It is a tooltip on a pointer and the label a
  // screen reader reads; on a phone the mark alone is the message.
  const waiting = incomingVersion ? `New build v${incomingVersion} ready` : "New build ready";
  const label = armed ? "Press again to restart and install" : `${waiting} — restart to install`;

  return (
    <button
      type="button"
      className="update-nudge"
      data-armed={armed ? "" : undefined}
      title={label}
      aria-label={label}
      onClick={() => {
        if (!armed) {
          playUi("select");
          setArmed(true);
          return;
        }
        playUi("start");
        onReload();
      }}
    >
      <UpdateGlyph />
      <span className="update-nudge-word" aria-hidden="true">
        RESTART
      </span>
    </button>
  );
}
