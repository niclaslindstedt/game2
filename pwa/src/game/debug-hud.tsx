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

import { useState } from "react";

import type { GameState } from "@engine";

import { debugBoxes, reproQuery, type DebugContext } from "./debug-info.ts";

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
