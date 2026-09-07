// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW LONG A LOAD TOOK LAST TIME, on THIS machine.
//
// Three of the five phases a race is stood up in are one indivisible call
// each — compiling the road, building the country and its forest, compiling
// every shader the stage is about to need — so there is nothing inside them
// to count, and the loading card has nothing to fill a bar from
// (`race-loader.ts`). What it has instead is history: the same phase on the
// same device took a knowable number of milliseconds the last time, and a
// bar run against that is right to within whatever the machine is doing
// differently this time.
//
// It is per DEVICE and cannot be anything else — the whole point is that a
// phone and a desktop are a factor of ten apart on exactly this work — so it
// lives in local storage beside the player's own settings rather than
// anywhere it could be shared.
//
// The estimate is deliberately SLOW to move. A load that ran while the phone
// was thermally throttled, or while a browser was still fetching the render
// chunk, is not what the next one will cost, and a card that believed every
// reading would swing between wildly different bars on consecutive presses
// of the same button.

const KEY = "scandi-flick-load-times";

/** How much of a new reading is taken, 0–1. A fifth means a genuine change —
 * a different stage length, a machine that has got slower — is most of the
 * way there within a handful of loads, while one freak reading moves the bar
 * by a fifth of the way to itself and no further. */
const BLEND = 0.2;

/** A reading further from the running estimate than this is not the same
 * work: the first campaign stage after an endless one, a machine that has
 * just come off battery saver. Taken WHOLE rather than blended, because
 * creeping towards it a fifth at a time would spend five loads drawing bars
 * against a number nothing on this device has ever measured. */
const RESET_RATIO = 4;

/** What every phase of the last load cost, by step id, or an empty map on a
 * machine that has never stood a race up — which the card reads as "nothing
 * to claim" rather than as zero. */
export function loadedTimes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const times: Record<string, number> = {};
    for (const [id, ms] of Object.entries(parsed as Record<string, unknown>)) {
      // A stored blob is a file anybody can edit and a build from before a
      // step was renamed: anything that is not a sane duration is dropped
      // rather than drawn, since a NaN width is a bar that vanishes.
      if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0) times[id] = ms;
    }
    return times;
  } catch {
    return {};
  }
}

/** Fold what a load actually cost into what the next one expects. */
export function rememberTimes(spent: Record<string, number>): void {
  const times = loadedTimes();
  for (const [id, ms] of Object.entries(spent)) {
    if (!Number.isFinite(ms) || ms < 0) continue;
    const was = times[id];
    const jumped =
      was === undefined || was <= 0 || ms > was * RESET_RATIO || ms * RESET_RATIO < was;
    times[id] = jumped ? ms : was + (ms - was) * BLEND;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(times));
  } catch {
    // A full or refused store costs the next card its bar and nothing else.
  }
}
