// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE URL THAT STANDS A RUN AT A MOMENT. A `?start=1` link opens on the
// lights; these parameters open it further along — mid-stage at an arc
// position, a step short of the line, or stopped with a dead engine — and
// on the discipline and campaign level a card needs to have anything to
// say (`engine/game/place.ts` does the standing; App.tsx's launch block
// reads this). A results card, a retirement card or a pause card is then
// one page load away instead of a whole driven stage.
//
// DOM-free on purpose: it is handed the query string rather than reading
// `location`, so the root suite can hold the reader to its contract.

import type { RetireReason, RunMoment } from "@engine";

/** The disciplines a link may open a run in. The same four words as the
 * menu's `PlayMode`, restated here rather than imported because the menu is
 * a Preact module and this file is read by the DOM-free suite. */
export const PLACE_MODES = ["campaign", "timetrial", "headsup", "roam"] as const;
export type PlaceMode = (typeof PLACE_MODES)[number];

export type PlaceRequest = {
  /** `?at=racing|finish|retire`, with `?s=` (metres along the stage),
   * `?time=` (the race clock, s), `?speed=` (m/s) and `?reason=engine|wheels`
   * beside it. Null when the link asks for the lights, as every link did
   * before there was a way to ask for anything else. */
  moment: RunMoment | null;
  /** `?paused=1` — the pause card up over the first frame. */
  paused: boolean;
  /** `?mode=` — which discipline the run is in. Null leaves it to the
   * launch block's own default (Roam, or the campaign once a level is
   * named). */
  mode: PlaceMode | null;
  /** `?level=` — the campaign level the run is entered on, by id. Not
   * checked against the campaign here: the launch block looks it up and
   * ignores a name it does not know. */
  levelId: string | null;
};

/** A finite, non-negative number off the query, or undefined. */
function num(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function placeFromQuery(search: string): PlaceRequest {
  const params = new URLSearchParams(search);
  const rawMode = params.get("mode");
  const mode = PLACE_MODES.find((m) => m === rawMode) ?? null;
  const levelId = params.get("level");
  const at = params.get("at");
  let moment: RunMoment | null = null;
  if (at === "racing") {
    moment = { at, s: num(params, "s"), time: num(params, "time"), speed: num(params, "speed") };
  } else if (at === "finish") {
    moment = { at, time: num(params, "time"), speed: num(params, "speed") };
  } else if (at === "retire") {
    const rawReason = params.get("reason");
    const reason: RetireReason | undefined =
      rawReason === "engine" || rawReason === "wheels" ? rawReason : undefined;
    moment = { at, reason, s: num(params, "s"), time: num(params, "time") };
  }
  return { moment, paused: params.get("paused") === "1", mode, levelId };
}
