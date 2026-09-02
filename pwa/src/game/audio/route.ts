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

import type { Clap } from "../weather.ts";

import type { PlayShape } from "./types.ts";

/** Closing speeds that separate a brush from a hit from a wreck, m/s. The
 * engine reports no contact under its own scuff floor (3 m/s), so the bottom
 * rung starts there: a branch clipped at walking pace is silent by design. */
const HIT_SPEED = 7;
const CRUNCH_SPEED = 15;

/** How hard the wheels arrive for a landing to be as loud as it gets, m/s of
 * descent the springs had to swallow, and the share of that the gentlest
 * touchdown is still worth. A landing is sized by its SLAM rather than by
 * its air time, because air time is a guess at the same thing and a bad
 * one: a short hop off a steep lip lands harder than a long floaty flight
 * that comes down on ground running away underneath it. The floor is the
 * mass of the car — a small jump has to sound like something. */
const SLAM_FULL = 11;
const SLAM_FLOOR = 0.3;

/** Take a value from `lo`..`hi` to 0..1. */
function ramp(value: number, lo: number, hi: number): number {
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** What one event sounds like. Null means the event is silent.
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

    // R28 — a split board, passed. The last board of a lap is the same
    // gate a touch higher, so a driver counting them hears the count end.
    case "checkpoint":
      return {
        id: "checkpoint",
        shape: event.index === event.count - 1 ? { pitch: 1.12 } : undefined,
      };

    // R28 — the line, refused. The one event on this list whose job is to be
    // heard INSTEAD of another one, so it is sized to sit where `finish` was
    // going to and nowhere quieter.
    case "missed":
      return { id: "missed" };

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

    case "offRoad":
      return { id: event.off ? "offroad_enter" : "offroad_exit" };

    case "takeoff": {
      // How hard the car left the ground. A gentle crest barely registers; a
      // launch off a lip unloads the suspension with a clonk.
      const hard = ramp(event.vy, 1, 9);
      return { id: "takeoff", shape: { gain: 0.5 + hard, pitch: 1.1 - 0.25 * hard } };
    }

    case "landing": {
      // The slam is the weight of the landing: the faster the springs had to
      // stop the car, the more of it arrives at once. `clean` picks WHICH
      // landing, because a wheels-on arrival and a slammed one are not one
      // sound at two sizes.
      const big = SLAM_FLOOR + (1 - SLAM_FLOOR) * ramp(Math.abs(event.slam), 0, SLAM_FULL);
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

    case "partBreak": {
      // Three things come off a car and none of them sounds like the
      // others: glass goes in one bright crash, a door or a wheel is a
      // heavy thing hitting the road, and a mirror or a bumper is the
      // part-break as authored.
      const part = event.part;
      if (part.startsWith("glass") || part.startsWith("lamps")) {
        return { id: "part_break", shape: { pitch: 1.7, gain: 1.1, stretch: 0.8 } };
      }
      if (part.startsWith("wheel") || part.startsWith("door")) {
        return { id: "impact_hit", shape: { pitch: 0.7, gain: 1.2, stretch: 1.3 } };
      }
      return { id: "part_break" };
    }

    // THE ONE PIECE OF DAMAGE NEWS NOBODY CAN SEE, told. A system giving is
    // a knock; a system gone is the heavier of the two, and the engine
    // going — the run's end — is the heaviest of all.
    case "systemFail":
      return event.spent
        ? {
            id: "system_gone",
            shape: event.system === "engine" ? { gain: 1.2, pitch: 0.9 } : undefined,
          }
        : { id: "system_give" };

    // A tyre letting go: the same thump as a block ridden over, lower and
    // flatter — and lower still for the wheel coming off, under the
    // `partBreak` that is the wheel itself hitting the road.
    case "wheelFail":
      return event.off
        ? { id: "kerb_block", shape: { pitch: 0.4, gain: 1 } }
        : { id: "kerb_block", shape: { pitch: 0.55, gain: 0.9 } };

    // The run over, short of the line: the same note as the water taking
    // the car, because it is the same news.
    case "retire":
      return { id: "crash" };

    // A drift taken past saving. Sized by the SPEED it let go at and not by
    // the angle: past `drift.spinAt` the car is round either way, and what
    // decides how big the moment is — how long the scrub lasts, how much
    // there is to drag — is how much of it there was to lose.
    case "spin": {
      const fast = ramp(event.speed, 8, 30);
      return {
        id: "spin",
        shape: { gain: 0.6 + 0.6 * fast, pitch: 1.12 - 0.24 * fast, stretch: 0.7 + 0.6 * fast },
      };
    }

    // R26 — an anti-cut block ridden over. One sound at one size band: what
    // a block costs is the LINE, and a slab taken at 40 km/h and one taken
    // at 130 are the same slab. It gets heavier and lower with the speed
    // it was taken at, and no further.
    case "kerbHit": {
      const hard = ramp(event.speed, 3, 14);
      return { id: "kerb_block", shape: { gain: 0.7 + 0.5 * hard, pitch: 1.08 - 0.18 * hard } };
    }

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

/** How far a strike has to be before its crack has been smeared into a
 * roll, m. Inside this the channel itself is audible; past it the air has
 * eaten the transient and what arrives is the hills answering. */
const CRACK_RANGE = 1200;
/** …and how far a clap is still worth playing at all, m. */
const ROLL_RANGE = 9000;

/**
 * WHAT A CLAP OF THUNDER SOUNDS LIKE FROM HERE.
 *
 * A CUE rather than an event: the simulation has no weather in it, so the
 * strike is the app's own knowledge and this is where the opinion about it
 * lives — the same job `soundForEvent` does, for the one moment nothing
 * reports.
 *
 * Distance decides all four axes and each for a physical reason. It picks
 * the SOUND (a crack has a transient, a roll has had its torn off by the
 * air). It sets the GAIN, because the energy spreads. It drops the PITCH,
 * which here moves every filter with it — high frequencies are absorbed by
 * air per metre travelled, so a far strike is not a quiet near one, it is a
 * darker one. And it STRETCHES, because what makes distant thunder roll for
 * seconds is the same wavefront arriving off a dozen hillsides.
 */
export function soundForThunder(clap: Clap): { id: string; shape: PlayShape } {
  const pan = Math.max(-1, Math.min(1, clap.pan));
  if (clap.distance < CRACK_RANGE) {
    const close = 1 - ramp(clap.distance, 0, CRACK_RANGE);
    return {
      id: "thunder_near",
      shape: {
        gain: 0.6 + 0.4 * close,
        pitch: 0.88 + 0.22 * close,
        stretch: 1.15 - 0.15 * close,
        pan,
      },
    };
  }
  const far = ramp(clap.distance, CRACK_RANGE, ROLL_RANGE);
  return {
    id: "thunder_far",
    shape: { gain: 0.9 - 0.62 * far, pitch: 1.02 - 0.3 * far, stretch: 1 + 0.55 * far, pan },
  };
}

/** A play, as heard from a seat: the listener's gain on every one-shot and
 * its muffle on the pitch, which moves every filter with it. */
export function heardFrom(
  shape: PlayShape | undefined,
  ear: { events: number; muffle: number },
): PlayShape {
  return {
    ...shape,
    gain: (shape?.gain ?? 1) * ear.events,
    pitch: (shape?.pitch ?? 1) * ear.muffle,
  };
}
