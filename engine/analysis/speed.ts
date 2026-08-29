// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPEED PROFILE — how fast a car would be at every metre of a stage.
//
// Half the questions in this module are meaningless without one. "Is this
// crest too sharp" has no answer until you know how fast the road arrives
// at it; "does this jump land on the road" depends entirely on how quickly
// the lip was met; "is this corner an ambush" is a question about the
// speed in front of it. So the profile is computed once, in one place, and
// every metric that needs a speed reads the same numbers.
//
// It is the standard three passes: the fastest each corner can be held at
// given the reference grip, then backward for what can be braked for, then
// forward for what can be accelerated to. It is not a lap time and it is
// not the bot — the bot is a driver with a strategy and this is a
// yardstick. What it buys is the difference between "this corner is tight"
// and "this corner arrives 14 m/s faster than anything can hold".
//
// The reference car is deliberately MODEST (`ANALYSIS.drive`). A stage
// that only the best car in the game, driven perfectly, can hold is a stage
// most runs cannot.

import type { Track } from "../mapgen/compile.ts";
import { ANALYSIS } from "./budgets.ts";

/** The fastest the reference car could be going at every sample, m/s. */
export function speedProfile(track: Track): number[] {
  const D = ANALYSIS.drive;
  const n = track.samples.length;
  const v = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const curvature = Math.abs(track.samples[i].curvature);
    // A corner's limit is the speed its radius can hold at the reference
    // grip; a straight's is the car's own top speed.
    const corner = curvature > 1e-6 ? Math.sqrt(D.latAccel / curvature) : Infinity;
    v[i] = Math.min(D.topSpeed, corner);
  }
  // Backward: nothing may arrive at a corner faster than it can shed by the
  // time it gets there.
  for (let i = n - 2; i >= 0; i--) {
    const step = Math.max(1e-3, track.samples[i + 1].s - track.samples[i].s);
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * D.brake * step));
  }
  // Forward: and nothing may leave one faster than it can accelerate to.
  // Power, not grip, so the limit falls off with speed — a rally car gains
  // very little at 55 m/s and a great deal at 15.
  for (let i = 1; i < n; i++) {
    const step = Math.max(1e-3, track.samples[i].s - track.samples[i - 1].s);
    const pull = (D.brake * D.pullShare * D.topSpeed) / Math.max(12, v[i - 1] + 12);
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * pull * step));
  }
  return v;
}
