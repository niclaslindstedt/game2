// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH GEARS ARE SENSIBLE RIGHT NOW — the window a shift asked for by a
// THUMB FLICK is allowed to land inside.
//
// A FLICK IS NOT A BUTTON. A key on a keyboard and a shoulder on a pad are
// both decisions: the driver reached for a control that does one thing, and
// the box gives them exactly what they asked for, including the deliberate
// over-rev that sets a car up for a corner. Neither is held to this window.
//
// The flick is different in kind. It is the same two centimetres of thumb
// that also brakes and also holds the throttle, made on a phone being driven
// one-handed over rough ground, and it produces shifts nobody meant. Holding
// it to gears the car can actually use is what makes it cost nothing instead
// of a bogged exit or a locked rear axle.
//
// The two halves are not the same rule, because the two mistakes are not:
//
// - UP is refused until the gear has RUN OUT — the shift light's own
//   threshold, so the lamp on the cluster tells the driver exactly when the
//   flick will take. Shifting up early is not dangerous, it is just slow, and
//   the light is where a player already looks to avoid it.
// - DOWN is refused while the lower ratio could not HOLD the speed the car is
//   already doing. That one is not a matter of taste: the engine would be
//   sitting on its limiter, with the taper (car.ts) leaving no torque and the
//   driven axle dragged back to a speed the car is not travelling at.
//
// DOM-free, so the tests can read it and the input manager can hold its
// answer without knowing anything about the HUD that draws it.

import { TUNING, type GameState } from "@engine";

/** Which gears a guarded shift may take. Both false is a car that has to
 * stay in the gear it is in until the revs say otherwise. */
export type ShiftWindow = { up: boolean; down: boolean };

/** Nothing shifts anywhere: the grid, a finished run, god mode. */
export const NO_SHIFTS: ShiftWindow = { up: false, down: false };

/** Where the needle sits at idle, on a 0..1 dial — the floor the tach and
 * this both draw so a stopped engine still reads as running. */
const IDLE_FLOOR = 0.18;

/** Where the shift light comes on, on that dial: the top of the gear, with
 * enough of it left to reach for the next one before it runs out. */
const SHIFT_LIGHT_AT = 0.83;

/** The dial as the GEARBOX reads it: road speed through the current gearing,
 * with no wheelspin in it. The shift light hangs off this rather than off the
 * needle, because a needle flared by a lit-up axle is not a gear that has run
 * out — a car spinning its wheels in second wants the throttle backed off,
 * never third. */
export function gearedRev(state: GameState): number {
  const top = state.spec.gearTop[state.car.gear];
  const geared = Math.min(Math.max(0, state.car.u) / top, TUNING.revs.limiter);
  return Math.min(1, IDLE_FLOOR + (1 - IDLE_FLOOR) * geared);
}

/** True while a higher gear exists and the gear the car is in has run out —
 * the shift light on the cluster, and the up half of the window. */
export function shiftLightOn(state: GameState): boolean {
  return (
    state.phase === "racing" &&
    state.car.gear < state.spec.gearTop.length - 1 &&
    gearedRev(state) > SHIFT_LIGHT_AT
  );
}

/** ...and the down half: a lower gear exists, and its ratio would hold the
 * speed the car is doing rather than pinning the engine on the limiter. */
function lowerGearFits(state: GameState): boolean {
  if (state.phase !== "racing" || state.car.gear <= 0) return false;
  return Math.max(0, state.car.u) < state.spec.gearTop[state.car.gear - 1] * TUNING.revs.limiter;
}

export function shiftWindow(state: GameState): ShiftWindow {
  // The automatic takes its own gears; a guarded request against it would be
  // a gear the box hands straight back, which reads as the control not
  // working rather than as the box doing its job.
  if (state.car.gearbox !== "manual") return NO_SHIFTS;
  return { up: shiftLightOn(state), down: lowerGearFits(state) };
}
