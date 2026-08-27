// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD snapshot: everything the instruments read, derived from a
// GameState once per HUD tick (~12 Hz — the canvas is the 60 fps surface,
// the HUD is not). This is also where the app layer's SIGN BOUNDARY is
// paid: the rendered world mirrors the engine's map view, so the co-driver
// calls, the wind arrow and the damage ledger are all flipped into SCREEN
// space here, once, exactly as input.ts flips steering once.

import { DAMAGE_ZONES, TUNING, wayHome, type GameState } from "@engine";

import { buildMinimap } from "./minimap.tsx";
import type { HudDamage, HudPacenote, HudSnapshot } from "./hud.tsx";

/** How far ahead the co-driver calls, meters — four seconds at pace, with a
 * floor so slow corners still get called and a ceiling so a long straight
 * is not spent staring at the far end's turn. */
function callDistance(u: number): number {
  return Math.min(320, Math.max(150, u * 4));
}

/** Turn angle past which a call earns the LONG modifier, radians (~100°). */
const LONG_NOTE_ANGLE = 1.75;

/** The next co-driver calls: the note under or ahead of the car plus the
 * one after it (so combinations read as "hard left INTO easy right"). The
 * engine's positive dir grows the heading, which the mirrored screen shows
 * as a LEFT turn — the same one-flip rule input.ts applies to steering. */
function upcomingPacenotes(state: GameState): HudPacenote[] {
  const out: HudPacenote[] = [];
  for (const note of state.track.pacenotes) {
    if (note.endS <= state.progressS) continue;
    if (note.s - state.progressS > callDistance(state.car.u)) break;
    out.push({
      dir: note.dir > 0 ? "left" : "right",
      severity: note.severity,
      long: note.angle > LONG_NOTE_ANGLE,
      distance: Math.max(0, note.s - state.progressS),
    });
    if (out.length >= 2) break;
  }
  return out;
}

/** Tach reading, 0..1 of the redline: how far up the current gear the car
 * is, over an idle floor so the needle never falls off the dial. The engine
 * has no rev model — gearing plus FORWARD speed is the rev counter, and
 * forward speed is what the gearbox shifts on, so the needle and the shift
 * light always agree with the gear. */
function tachometer(state: GameState): number {
  const top = state.spec.gearTop[state.car.gear];
  return Math.min(1, 0.18 + 0.82 * Math.max(0, state.car.u / top));
}

/** The damage ledger flipped into SCREEN space for the HUD's 2D car: the
 * rendered world mirrors the engine's map view (the same one-flip rule as
 * steering and the wind arrow), so the engine's right-side zones — and its
 * right mirror — sit on the LEFT of the car the player sees. */
function damageSnapshot(state: GameState): HudDamage {
  const damage = state.car.damage;
  const zoneMax = TUNING.collision.zoneMax;
  const zones = Array.from(
    { length: DAMAGE_ZONES },
    (_, k) => damage.zones[(DAMAGE_ZONES - k) % DAMAGE_ZONES] / zoneMax,
  );
  const broken = damage.broken;
  return {
    zones,
    belly: damage.belly / zoneMax,
    wear: damage.wear,
    systems: { ...damage.systems },
    broken: {
      bumperF: broken.includes("bumperF"),
      bumperR: broken.includes("bumperR"),
      mirrorL: broken.includes("mirrorR"),
      mirrorR: broken.includes("mirrorL"),
      spoiler: broken.includes("spoiler"),
      hood: broken.includes("hood"),
      hatch: broken.includes("hatch"),
    },
  };
}

/** How far the run is up the road on the ghost, and whether there is one
 * to be up the road on. Both cars run the same stage, so the arc position
 * they have each reached IS the gap, in the one unit that needs no lookup
 * table and reads instantly at speed: metres of road. */
export function takeSnapshot(
  state: GameState,
  finishTime: number | null,
  ghostS: number | null = null,
): HudSnapshot {
  const rpm = tachometer(state);
  // The rendered world is a mirror of the engine's map view, so the wind
  // arrow's screen angle is the NEGATED car-relative bearing (the same
  // one-flip rule input.ts applies to steering).
  const windKmh = Math.hypot(state.wind.x, state.wind.z) * 3.6;
  const windScreenAngle =
    -(Math.atan2(state.wind.x, state.wind.z) - state.car.heading) * (180 / Math.PI);
  return {
    phase: state.phase,
    countdown: Math.max(0, TUNING.countdown - state.t),
    time: state.raceTime,
    // The speedo reads GROUND speed, not forward speed: a car crossed up
    // at 140 km/h is doing 140 km/h, and a needle that dips every time the
    // nose swings would tell the player the slide is costing them.
    speedKmh: Math.max(0, Math.hypot(state.car.u, state.car.w) * 3.6),
    gear: state.car.gear,
    reversing: state.car.reversing,
    gearbox: state.spec.gearbox,
    rpm,
    shiftUp: rpm > 0.83 && state.car.gear < state.spec.gearTop.length - 1,
    airborne: state.car.airborne,
    minimap: buildMinimap(state),
    pacenotes: state.phase === "racing" ? upcomingPacenotes(state) : [],
    seed: state.seed,
    carName: state.spec.name,
    offRoad: state.offRoad,
    homeDistance: state.offRoad ? wayHome(state).distance : 0,
    finishTime,
    boostLeft: state.car.boostLeft,
    boostMax: TUNING.boost.capacity,
    boosting: state.car.boosting,
    windKmh,
    windScreenAngle,
    damage: damageSnapshot(state),
    ghostGap: ghostS === null ? null : state.progressS - ghostS,
  };
}
