// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NEW-BUILD CARD: the only thing the app says on its own initiative.
//
// It wears the menu's arcade chrome rather than a web app's toast chrome,
// because it is the one surface that can appear over EITHER the menu or a
// running stage, and a rounded grey bar with body type on it reads as the
// browser talking rather than as the game talking.
//
// A card, not a modal: an update that arrives mid-stage must never take the
// wheel. It sits low and off to the side of everything the driver is reading
// — the instrument cluster is bottom-left, the minimap dock is top-right —
// and waits, and the run keeps going behind it.
//
// The state it renders comes from the framework's `usePwaUpdate`; only the
// look and the sound are ours.

import { playUi } from "./audio/ui.ts";

type UpdateCardProps = {
  needRefresh: boolean;
  /** The waiting build's version, once `version.json` has been read; the
   * card shows before that lands, so the line is optional. */
  incomingVersion?: string | null;
  onReload: () => void;
  onDismiss: () => void;
};

export function UpdateCard({ needRefresh, incomingVersion, onReload, onDismiss }: UpdateCardProps) {
  if (!needRefresh) return null;
  return (
    <div className="update-card" role="status" aria-live="polite">
      <div className="update-card-text">
        <span className="update-card-title">NEW BUILD READY</span>
        {/* The button already says what to press, so the second line spends
            itself on the one thing only it can say: WHICH build is waiting.
            Until `version.json` lands there is nothing to name, and the
            instruction takes the line instead of leaving it empty. */}
        <span className="update-card-sub">
          {incomingVersion ? `v${incomingVersion}` : "RESTART TO INSTALL"}
        </span>
      </div>
      <button
        type="button"
        className="update-card-go"
        onClick={() => {
          playUi("start");
          onReload();
        }}
      >
        RESTART
      </button>
      <button
        type="button"
        className="update-card-x"
        aria-label="Dismiss"
        onClick={() => {
          playUi("back");
          onDismiss();
        }}
      >
        ✕
      </button>
    </div>
  );
}
