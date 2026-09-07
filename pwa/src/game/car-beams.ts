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

/** THE TWO STOPS AS SHAPES, both written against the optics `car/lamps.ts`
 * authors for a bowl — and both taken off a real lamp's isolux plot rather
 * than guessed at. The plot's contours, high beam over low:
 *
 *              109 lx      10 lx      1 lx
 *   HIGH        25 m        82 m      260 m
 *   LOW      27.5 lx@25 m   41 m      131 m
 *
 * Three numbers come straight out of that, and each is a RATIO, which is
 * why they survive a car whose bowls are authored differently:
 *
 *   LIGHT  27.5 against 109 at the same 25 m — a low beam is a QUARTER of a
 *          main beam, not the half a reading of the regulations suggests.
 *   REACH  the same lux contour stands at twice the distance on high beam,
 *          at 10 lx (82/41) and again at 1 lx (260/131). Twice, exactly.
 *   CONE   and they are opposite shapes: the high beam's envelope closes to
 *          a pencil inside ±10°, where the low beam holds ±30° the whole way
 *          out. A low beam is a broad wash across the near road; a main beam
 *          is a corridor down it. Most people guess this the wrong way round.
 *
 * THE AIM is the one that decides whether any of the rest is visible, and
 * it is the one a bowl's authored `tilt` gets wrong by an order of
 * magnitude. `tilt` is a SLOPE, so a lamp 0.68 m up aimed at 0.072 puts its
 * axis into the road 9 m past the bumper — and everything past that is lit
 * by the thin upper edge of the cone at a grazing angle, which on a Lambert
 * road is nothing at all. That is a puddle in front of the car, not a beam,
 * and no amount of intensity fixes it: turning it up makes a brighter
 * puddle with the same black road behind it.
 *
 * A real lamp is aimed nearly LEVEL — ECE R48 sets a low beam 1.0–1.5%
 * below the horizontal and a main beam at essentially nothing — and the
 * plot shows what that buys: a core out at 25 m with light running to 82 and
 * beyond, because the axis meets the road far enough away that the whole
 * near stretch sits inside the cone at a usable angle. So both stops are
 * flattened hard, main beam furthest: its axis reaches the road around 35 m
 * out, the low beam's around 20, which is the half-degree of real aim
 * difference expressed where it can actually be seen. */
const MAIN = { light: 1, reach: 1.4, cone: 0.85, tilt: 0.28 };
const DIPPED = { light: 0.25, reach: 0.7, cone: 1.7, tilt: 0.5 };

/** One stop's shape laid on a set of lamps. */
function shaped(
  plan: readonly LampSource[],
  by: { reach: number; cone: number; tilt: number },
): readonly LampSource[] {
  return plan.map((lamp) => ({
    ...lamp,
    reach: lamp.reach * by.reach,
    cone: lamp.cone * by.cone,
    tilt: lamp.tilt * by.tilt,
  }));
}

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
  return shaped(low.length > 0 ? low : plan, DIPPED);
}

/** The nose as MAIN BEAM throws it: the low beams FIRST, then the driving
 * lamps and the pods behind them.
 *
 * The order is what the LIGHTING row spends its cap on, and it has to start
 * with the low beams for the same reason a real car keeps them lit on main
 * beam — they are the lamps that light the road you are ON, where a driving
 * lamp lights the one you are coming to. Taken strongest-first instead (the
 * order `car/lamps.ts` ranks a plan in), a car whose pods out-gather its
 * headlamps spends a two-beam budget on two narrow pencils aimed a hundred
 * metres out and leaves the near road black — which is MAIN BEAM LOOKING
 * DIMMER THAN DIPPED, the one thing the two stops may never do.
 *
 * That is also the invariant worth stating: whatever the row is paying for,
 * the lamps lit on main are a superset of the lamps lit on dipped. */
export function mainOf(plan: readonly LampSource[]): readonly LampSource[] {
  const low = plan.filter((lamp) => lamp.role === LOW_BEAM);
  return shaped([...low, ...plan.filter((lamp) => lamp.role !== LOW_BEAM)], MAIN);
}

/** WHAT A CAR'S NOSE IS WORTH at a given stop of the switch, as a share of
 * the driving lamps' budget. Stated here because it is asked twice: by the
 * beams `car-lamps.ts` aims, and by anything else lighting the world off a
 * car's headlamps — the dust register the FIELD writes into (field-cars.ts)
 * most of all, where a second answer would have a rival on dipped beams
 * lighting a cloud harder than the car being driven does. */
export function headShareAt(stage: LampStage): number {
  if (stage === "off") return 0;
  return stage === "dipped" ? DIPPED.light : MAIN.light;
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
