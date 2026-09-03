// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The zero state of a car and of a run's ledger. Its own module because
// more than the stepper needs a car that has not started: the analysis
// driving the reference car over an apex, a test staging one contact, and
// the traffic on the public roads — every one of which would otherwise
// hand-roll a partial with a field somebody forgot.

import { DAMAGE_ZONES, type CarState, type RunStats } from "./state.ts";

export function freshStats(): RunStats {
  return {
    driftCount: 0,
    driftTime: 0,
    driftScore: 0,
    spins: 0,
    rolls: 0,
    jumps: 0,
    airTime: 0,
    cleanLandings: 0,
    splashes: 0,
    offRoadTime: 0,
    impacts: 0,
    crashes: 0,
    respawns: 0,
    topSpeed: 0,
  };
}

/** A car at rest at the origin, every field at the value a run starts it
 * at. */
export function freshCar(): CarState {
  return {
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    u: 0,
    w: 0,
    vy: 0,
    wheelVy: 0,
    yawRate: 0,
    slip: 0,
    airborne: false,
    airTime: 0,
    settling: false,
    roll: 0,
    rollRate: 0,
    pitch: 0,
    ride: 0,
    rideRate: 0,
    settle: 0,
    weight: 1,
    loft: 0,
    loftRate: 0,
    foot: 0,
    footVy: 0,
    footMean: 0,
    pitchLoad: 0,
    kerbFrom: 0,
    slide: 0,
    drifting: false,
    chain: 0,
    spun: false,
    spinDir: 0,
    rolling: false,
    wheelspin: 0,
    launchSpin: 0,
    flick: 0,
    flickDir: 1,
    lift: 0,
    brakeLoad: 0,
    provoked: 0,
    thrown: 0,
    gear: 0,
    rev: 0,
    gearbox: "auto",
    shiftCutUntil: 0,
    steer: 0,
    braking: false,
    locked: false,
    reversing: false,
    damage: {
      zones: new Array(DAMAGE_ZONES).fill(0),
      belly: 0,
      wear: 0,
      systems: { engine: 0, suspension: 0, gearbox: 0, steering: 0, brakes: 0 },
      wheels: [0, 0, 0, 0],
      broken: [],
      version: 0,
    },
    damageScale: 1,
  };
}
