// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TEMPERATURE GAUGE — the one piece of damage in this game that takes
// its time, and the only one the driver is still deciding about while it
// happens.
//
// A radiator stands ahead of everything else on a car, which is why a
// nose-on fold reaches it before it reaches the block: `collision.ts` deals
// `systems.cooling` from the same nose crush it deals `systems.engine`
// from, and deals it harder. What a holed core costs is not power. The
// engine goes on making its heat, the coolant that carried the heat away is
// on the road two corners back, and the needle climbs — heat made by the
// throttle, shed by the air coming through what is left of the core. Past
// the red line the engine starts eating itself, and an engine that has
// eaten itself is the run over where it stops (`damage.ts`'s
// `beyondDriving`).
//
// So the driver has a choice a crash normally never leaves them: lift on
// the straights, short-shift, give away ten seconds a split, and limp a
// holed radiator to the line. That is the point of the module.
//
// It WRITES the ledger (`systems.engine`) and the car's own `heat`, which
// makes it a sibling of collision.ts rather than of damage.ts — damage.ts
// reads the ledger and never writes it, and this never reads back what
// damage.ts derives.

import { clamp } from "../lib/math.ts";
import { callDamage } from "./collision.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarState, GameEvent } from "./state.ts";

const C = TUNING.collision.cooling;

/** How much of the cooling system is still doing its job, 0..1 — the share
 * of the shedding a core this badly holed has left. Read by the gauge here
 * and by nothing else: what a driver feels is the temperature, not the
 * radiator. */
function coolingLeft(car: CarState): number {
  return 1 - C.lost * car.damage.systems.cooling;
}

/** Step the temperature one physics tick. `throttle` is the pedal actually
 * being asked for, 0..1 (a cut shift or a dead engine is not making heat),
 * and `speed` the ground pace in m/s that decides the ram air.
 *
 * Everything about the shape of this is a first-order balance, deliberately:
 * a sound car makes its heat and sheds more of it at every speed, so the
 * needle sits on its peg for a whole stage and the system is invisible until
 * something folds the nose. */
export function stepCooling(
  car: CarState,
  throttle: number,
  speed: number,
  dt: number,
  events: GameEvent[],
): void {
  const dead = car.damage.systems.engine >= 1;
  // A seized engine makes no heat. It also does not cool anything down that
  // matters — the run is already over — but the gauge falling back off the
  // red is what stops the call chattering while the car coasts to rest.
  const made = dead ? 0 : C.idleHeat + C.loadHeat * clamp(throttle, 0, 1);
  const shed = (C.still + C.ram * (Math.abs(speed) / C.airSpeed)) * coolingLeft(car);
  car.heat = clamp(car.heat + (made - shed) * dt, 0, C.heatMax);

  // THE TWO LINES, called out in both directions. A temperature is a thing
  // to be managed rather than a line that has been crossed for good, so
  // unlike every other damage call these re-arm — and they re-arm LOWER
  // than they fire, or a needle sitting exactly on one announces itself
  // twice a second all the way to the finish.
  if (car.heatCall < 2 && car.heat >= C.redline) {
    car.heatCall = 2;
    events.push({ type: "overheat", level: "red" });
  } else if (car.heatCall === 2 && car.heat < C.clearAt) {
    car.heatCall = 1;
    events.push({ type: "overheat", level: "clear" });
  } else if (car.heatCall === 0 && car.heat >= C.warnAt) {
    car.heatCall = 1;
    events.push({ type: "overheat", level: "warn" });
  } else if (car.heatCall === 1 && car.heat < C.warnAt * C.rearm) {
    car.heatCall = 0;
  }

  if (car.heatCall < 2 || dead) return;
  // Past the line the engine is cooking itself: a flat rate for being there
  // at all, and more for every point past it. A needle pinned hard over
  // finishes the engine in well under a minute; one wavering on the line
  // takes most of a stage, which is exactly long enough to be a decision.
  const over = car.heat - C.redline;
  const sys = car.damage.systems;
  const was = sys.engine;
  sys.engine = Math.min(1, was + (C.cookRate + C.cookPerOver * over) * dt);
  callDamage("engine", was, sys.engine, events);
  // `damage.version` is what anything watching the ledger reads to know it
  // moved — the renderer's re-bend, and the trace that writes a rival's
  // whole run down before the green (sim/trace.ts) and only keeps a copy
  // when the version changes. Cooking is the one damage that arrives a
  // hundred and twenty times a second, so it is booked on the PERCENT
  // rather than on the step: a whole cook is at most a hundred marks, and
  // a rival that boiled its engine away is a rival whose ledger says so.
  if (Math.floor(sys.engine * 100) !== Math.floor(was * 100)) car.damage.version += 1;
}

/** What the heat is doing to the engine's output THIS instant, 0..1 of it —
 * the timing pulled out of a hot motor, which is what a driver feels long
 * before anything breaks. Faded in from the first warning so the loss
 * arrives with the warning rather than after it. Read by damage.ts. */
export function heatPower(car: CarState): number {
  const past = clamp((car.heat - C.warnAt) / (C.redline - C.warnAt), 0, 1);
  return 1 - C.heatPower * past;
}
