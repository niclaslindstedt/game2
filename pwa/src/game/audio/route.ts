// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH SOUND AN EVENT MAKES, and how big it is.
//
// Split out from the bus so it can be reasoned about — and tested — as what it
// is: a pure function from a `GameEvent` to a bank id and a scale. Nothing
// here touches the synth, so the whole opinion about what a rally stage sounds
// like is one table a reader can check against the bank.
//
// WHAT AN EVENT DECIDES, AND WHAT IT ONLY SCALES. Some events pick a different
// SOUND — a clean landing and a slammed one are two different things happening
// to a car. Most only scale the one they have (`PlayShape`: louder, lower,
// longer). Reaching for a new def when a shape would do is how a bank ends up
// with nine landings that are the same four voices at different volumes.

import type { GameEvent } from "@engine";

import type { PlayShape } from "./types.ts";

/** Closing speeds that separate a brush from a hit from a wreck, m/s. The
 * engine reports no contact under its own scuff floor (3 m/s), so the bottom
 * rung starts there: a branch clipped at walking pace is silent by design. */
const HIT_SPEED = 7;
const CRUNCH_SPEED = 15;

/** Air time under which a landing is a hop rather than a jump, s — the shape
 * scale is measured from here so a kerb is not a forty-metre flight. */
const HOP_TIME = 0.35;

/** Take a value from `lo`..`hi` to 0..1. */
function ramp(value: number, lo: number, hi: number): number {
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** What one event sounds like. Null means the event is silent — several are,
 * and deliberately.
 *
 * `lastGear` is the gear the car was in before this step, which is the only
 * way to tell an upshift from a downshift: the event carries where the box
 * WENT, not where it came from. */
export function soundForEvent(
  event: GameEvent,
  lastGear: number,
): { id: string; shape?: PlayShape } | null {
  switch (event.type) {
    case "go":
      return { id: "race_go" };

    case "finish":
      return { id: "finish" };

    // R22 — a lap in the book. A quicker one than any before it says so by
    // arriving higher: the same voice, lifted, which is a scale and not a
    // second sound.
    case "lap":
      return { id: "lap", shape: event.best ? { pitch: 1.18, gain: 1.15 } : undefined };

    case "cheer":
      // R27 — how big the crowd is decides how loud and how WIDE it is: a
      // knot of six at a corner is a thinner, tighter sound than the bank
      // at the finish, and stretching it is most of what carries that.
      return {
        id: "cheer",
        shape: {
          gain: 0.55 + 0.75 * event.size,
          pitch: 1.06 - 0.12 * event.size,
          stretch: 0.85 + 0.35 * event.size,
        },
      };

    case "shift":
      return { id: event.gear > lastGear ? "shift_up" : "shift_down" };

    case "boostStart":
      return { id: "boost_start" };

    case "boostEmpty":
      return { id: "boost_empty" };

    case "offRoad":
      return { id: event.off ? "offroad_enter" : "offroad_exit" };

    case "takeoff": {
      // How hard the car left the ground. A gentle crest barely registers; a
      // launch off a lip unloads the suspension with a clonk.
      const hard = ramp(event.vy, 1, 9);
      return { id: "takeoff", shape: { gain: 0.5 + hard, pitch: 1.1 - 0.25 * hard } };
    }

    case "landing": {
      // Air time is the weight of the landing: a longer flight is more of the
      // car arriving at once. `clean` picks WHICH landing, because a wheels-on
      // arrival and a slammed one are not one sound at two sizes.
      const big = ramp(event.airTime, HOP_TIME, 2.2);
      return {
        id: event.clean ? "land_clean" : "land_hard",
        shape: { gain: 0.55 + 0.75 * big, pitch: 1.12 - 0.28 * big, stretch: 0.85 + 0.5 * big },
      };
    }

    case "splash": {
      // How much water the car moved. A ford is a sheet thrown off the
      // nose at whatever pace it was crossed at; going INTO a lake is the
      // whole side of the car displacing at once, so it takes the same
      // sound down an octave and stretches it into the longest water in
      // the game — which is right, because the car is not coming out.
      const force = ramp(event.speed, 4, 26);
      if (!event.deep) return { id: "splash", shape: { gain: 0.6 + 0.6 * force } };
      return {
        id: "splash",
        shape: { gain: 1.1 + 0.5 * force, pitch: 0.74 - 0.1 * force, stretch: 1.5 + 0.5 * force },
      };
    }

    case "sink":
      return { id: "sink" };

    case "impact": {
      // Three rungs, because an impact spans a brush past a branch and a
      // head-on into a boulder, and no amount of scaling makes one of those
      // the other. Inside a rung the shape does the rest.
      if (event.speed < HIT_SPEED) {
        return { id: "impact_scuff", shape: { gain: 0.6 + ramp(event.speed, 3, HIT_SPEED) } };
      }
      const id = event.speed < CRUNCH_SPEED ? "impact_hit" : "impact_crunch";
      const big = ramp(event.speed, HIT_SPEED, 28);
      return {
        id,
        shape: {
          gain: 0.7 + 0.6 * big,
          pitch: 1.1 - 0.3 * big,
          stretch: 0.9 + 0.4 * big,
          // A belly landing happened UNDER the player rather than off to one
          // side; anything else is placed by where on the ring it landed. The
          // rendered world mirrors the engine's map view, so the pan is
          // flipped here exactly as the HUD flips its damage ledger.
          pan: event.belly ? 0 : Math.max(-0.7, Math.min(0.7, -Math.sin(event.angle))),
        },
      };
    }

    case "partBreak":
      return { id: "part_break" };

    case "solidBreak": {
      // Two materials, two sounds — and the SIZE of what gave way sets the
      // pitch, because the difference between a sapling and an old spruce
      // is heard before it is seen. Anything the ground made takes the
      // stone knock; anything that grew takes the crack.
      const wooden =
        event.solid.kind === "tree" || event.solid.kind === "stump" || event.solid.kind === "log";
      const big = ramp(event.solid.size, 0.5, 1.8);
      return {
        id: wooden ? "wood_break" : "stone_shove",
        shape: { gain: 0.7 + 0.5 * big, pitch: 1.15 - 0.35 * big, stretch: 0.9 + 0.5 * big },
      };
    }

    case "crash":
      return { id: "crash" };

    case "respawn":
      return { id: "respawn" };

    default:
      return null;
  }
}
