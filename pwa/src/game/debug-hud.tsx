// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The debug overlay: the boxes in the corner of a screenshot that say
// exactly what the picture is of.
//
// It is deliberately NOT part of the HUD. The HUD is the game's chrome and
// goes away when ALT is held (so a shot can be judged on the pixels alone);
// these boxes stay up, because a picture with nothing to say where it was
// taken is the one thing this whole feature exists to stop.
//
// Every row carries its key in `data-k`, so a headless pass can read a value
// straight out of the DOM instead of parsing the PNG it just captured.
//
// The COPY button at the foot of this file is the same facts with the boxes
// switched OFF — god mode's own, for a flight taken to look at the picture
// rather than to read numbers over it. See `DebugCopyButton`.

import { useState } from "react";

import type { GameState } from "@engine";

import { copyText } from "../lib/copy-text.ts";
import {
  debugBoxes,
  debugReport,
  reproQuery,
  type DebugBox,
  type DebugContext,
} from "./debug-info.ts";
import { playUi } from "./audio/ui.ts";

type DebugHudProps = {
  ctx: DebugContext;
  state: GameState;
  /** True while ALT is hiding the game's own HUD — worth saying on screen,
   * because a HUD that vanished and stayed vanished (a stuck modifier) is
   * otherwise indistinguishable from one that broke. */
  hudHidden: boolean;
};

/** The repro strip: the one line worth copying off this screen. It is
 * pointer-interactive (the rest of the overlay is not) so it can be
 * selected on a desktop and copied with the button on a phone. */
function ReproStrip({ query }: { query: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}${location.pathname}${query}`;
  return (
    <div className="debug-repro pointer-events-auto">
      <span className="debug-repro-label">REPRO</span>
      <code className="debug-repro-text">{query}</code>
      <button
        type="button"
        className="debug-repro-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "COPIED" : "COPY URL"}
      </button>
    </div>
  );
}

export function DebugHud({ ctx, state, hudHidden }: DebugHudProps) {
  const boxes = debugBoxes(ctx, state);
  return (
    <div className="debug-hud pointer-events-none absolute inset-0 select-none">
      <div className="debug-boxes">
        {hudHidden && <div className="debug-badge">HUD HIDDEN — RELEASE ALT</div>}
        {boxes.map((box) => (
          <div key={box.title} className="debug-box">
            <div className="debug-box-title">{box.title}</div>
            {box.rows.map((row) => (
              <div key={row.k} className="debug-row" data-k={row.k}>
                <span className="debug-row-k">{row.k}</span>
                <span className="debug-row-v">{row.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* The crosshair god mode aims with. A free camera with nothing
          marking its centre makes "the thing in the middle of the shot" a
          matter of opinion, and the point of the repro line is that it is
          not. */}
      {ctx.god && <div className="debug-crosshair" aria-hidden="true" />}
      <ReproStrip query={reproQuery(ctx)} />
    </div>
  );
}

/** How long the button says what happened, ms — the same beat the map's own
 * copy button holds its receipt for. */
const SAID_MS = 2400;

/**
 * COPY DEBUG INFO, for a flight taken with the overlay OFF.
 *
 * God mode without the boxes is the ordinary way to LOOK at something: the
 * whole screen is the thing being judged, and four panels of numbers over it
 * are four panels in the way. But the moment the thing is worth reporting,
 * every one of those numbers is wanted — and there is nothing on screen to
 * read them off. So the facts get a button instead of a panel, exactly as
 * the developer map's do (menu-roam.tsx): one press, and the boxes and the
 * link are on the clipboard as text.
 *
 * It is deliberately NOT offered while the overlay is up. Up there the boxes
 * are already on screen and the repro strip already has a button, and a
 * second one beside it would be two buttons for one job.
 *
 * `read` is called at the PRESS rather than watched, because what it reads
 * moves under the hand: a flying camera's pose is a different pose a frame
 * later, and the line worth copying is the one from the moment somebody
 * decided to copy it.
 */
export function DebugCopyButton({
  read,
}: {
  read: () => { boxes: DebugBox[]; repro: string } | null;
}) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="debug-copy"
      title="Copy the place, the camera, the stage and the REPRO link as text"
      data-debug-copy
      onClick={() => {
        const now = read();
        const say = (text: string): void => {
          setSaid(text);
          setTimeout(() => setSaid(null), SAID_MS);
        };
        if (!now) {
          say("NO STAGE YET");
          return;
        }
        playUi("select");
        // The whole URL rather than the query alone: this text is going
        // somewhere else — a chat, an issue, another agent's prompt — and a
        // query string on its own is only a link to whoever already knows
        // which build it came off.
        const url = `${location.origin}${location.pathname}${now.repro}`;
        void copyText(debugReport(now.boxes, url)).then((ok) => say(ok ? "COPIED" : "COPY FAILED"));
      }}
    >
      {said ?? "COPY DEBUG INFO"}
    </button>
  );
}
