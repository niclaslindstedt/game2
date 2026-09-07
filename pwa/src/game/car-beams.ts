// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH LAMPS BURN, AND HOW HARD — the arithmetic behind a car's light
// switch, with no three.js and no scene in it. `car-lamps.ts` owns the
// spotlights this decides the shape of; everything here is numbers, so the
// rules can be held by a test rather than by a screenshot.
//
// The whole file rests on one fact about real cars: A DIP SWITCH DOES NOT
// DIM A HEADLAMP, IT LIGHTS A DIFFERENT ONE. A car carries two sets of lamps
// on its nose — the low beams, and the driving lamps beside or above them —
// and `car/lamps.ts` already knows which of a body's bowls is which, because
// the role it gives each one off its aperture IS that distinction: `main` is
// the low beam, `spot` and `flood` are the driving lamps and the pod bar.

import type { LampRole, LampSource } from "./car/lamps.ts";
import type { LampStage } from "./daylight.ts";

/** The role `car/lamps.ts` gives a low beam. On dipped these burn alone: the
 * pods go dark, which is what the law says about auxiliary driving lamps
 * everywhere they are legal at all — they may only be wired to come on WITH
 * main beam — and it is why a rally car's bar is the thing that lights up
 * when the road finally opens out. */
const LOW_BEAM: LampRole = "main";

/** WHAT A LOW BEAM IS, against the full-beam picture the body's own optics
 * are authored for. Three ratios, off the real photometry:
 *
 *   REACH   a low beam shows an obstacle at about 60 m where a main beam
 *           shows one at 120 — half the road, and the number a driver
 *           actually feels, because it is where the light stops.
 *   LIGHT   the hot spot runs some 20–36 kcd against a main beam's 40–75
 *           (FMVSS 108 caps the upper beam at 75 000 cd at H-V), so a bit
 *           under half.
 *   CONE    and it is the WIDER of the two, which is the way round most
 *           people guess wrong: a low beam is a short broad wash across the
 *           near road, a main beam a narrow corridor down it.
 *
 * The AIM barely moves, and deliberately. A real low beam sits 1.0–1.5%
 * below the horizontal against a main beam's nothing at all (ECE R48's
 * initial inclination), which is half a degree — nothing next to how far the
 * light reaches. The nudge here is the same sign and the same order: the low
 * beam is the one pointed at the road. */
const DIPPED = { light: 0.45, reach: 0.5, cone: 1.2, tilt: 1.25 };

/** How far a car that made this one dip has to draw clear again before the
 * beams go back up, as a multiple of the reach they dipped at. A car sitting
 * exactly on the line would otherwise switch them every frame — which is not
 * only ugly: every change rewrites materials across the whole field. */
const DIP_BACK_AT = 1.25;

/** The nose as the dipped stop throws it: the low beams only, at a low
 * beam's own reach, spread and aim. A body with no low beam authored at all
 * dips what it has rather than going dark — a bare face is allowed, and a
 * car with no lights is not. */
export function dippedOf(plan: readonly LampSource[]): readonly LampSource[] {
  const low = plan.filter((lamp) => lamp.role === LOW_BEAM);
  return (low.length > 0 ? low : plan).map((lamp) => ({
    ...lamp,
    reach: lamp.reach * DIPPED.reach,
    cone: lamp.cone * DIPPED.cone,
    tilt: lamp.tilt * DIPPED.tilt,
  }));
}

/** WHAT A CAR'S NOSE IS WORTH at a given stop of the switch, as a share of
 * the driving lamps' budget. Stated here because it is asked twice: by the
 * beams `car-lamps.ts` aims, and by anything else lighting the world off a
 * car's headlamps — the dust register the FIELD writes into (field-cars.ts)
 * most of all, where a second answer would have a rival on dipped beams
 * lighting a cloud harder than the car being driven does. */
export function headShareAt(stage: LampStage): number {
  if (stage === "off") return 0;
  return stage === "dipped" ? DIPPED.light : 1;
}

/** HOW FAR A CAR'S MAIN BEAM THROWS, m — the longest of the lamps it would
 * light with the switch right up. The LIGHTING row's cap is not read: a
 * player on a cheaper picture still has the car's own lamps, and dipping for
 * a rival at a different distance depending on a video option would be a
 * setting that changes how the game behaves rather than how it looks. */
export function beamReach(plan: readonly LampSource[]): number {
  return plan.reduce((far, lamp) => Math.max(far, lamp.reach), 0);
}

/**
 * THE DIP SWITCH: the stop a car is actually running, given what the sky
 * asks for (`ceiling`), how far off the nearest car ahead is (`company`, m,
 * `Infinity` for an empty road), how far this car's own beams throw
 * (`reach`, m) and which stop it is on now.
 *
 * The rule every highway code states is a distance — around two hundred
 * metres, oncoming or following — and what it is really saying is "do not
 * put your main beam on another driver". So the honest threshold is not a
 * constant: it is where this car's own light ENDS, because past that there
 * is nobody being dazzled and inside it there is. It falls out of the
 * hardware, which means a machine carrying a pod bar dips earlier than one
 * on a pair of sealed beams — and that is true of the real ones too.
 *
 * Only main beam is ever taken down. Dipped beams dazzle nobody: that is
 * the entire reason they have a cut-off.
 */
export function dipFor(
  ceiling: LampStage,
  company: number,
  reach: number,
  now: LampStage,
): LampStage {
  if (ceiling !== "main") return ceiling;
  const line = now === "main" ? reach : reach * DIP_BACK_AT;
  return company <= line ? "dipped" : "main";
}
