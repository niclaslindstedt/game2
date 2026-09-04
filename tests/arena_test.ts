// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND (engine/mapgen/arena.ts) — the one level in this game
// that was authored rather than generated, and therefore the one level whose
// tests can name a place and say what is there.
//
// Everything else in `tests/` measures a PROPERTY of whatever the seed built,
// because naming a spot on a generated stage is a fixture that breaks on the
// next generator change. Here the spot IS the deliverable: the skidpad is at
// a radius somebody chose, the ramp throws the car because it was built to,
// and if either stops being true the level is broken even though nothing in
// the generator moved.

import { describe, expect, it } from "vitest";
import {
  ARENA_PAD,
  ARENA_REACH,
  NEUTRAL_INPUT,
  onItsWheels,
  compileArena,
  createGame,
  createTerrain,
  step,
  type ArenaPlan,
  type CarInput,
  type GameState,
} from "@engine";

const track = compileArena();
const plan = track.arena as ArenaPlan;
const field = createTerrain(track);

/** A point in the arena's own frame — `u` east across the pad, `v` north
 * along it, both metres from the middle — in world coordinates. Every
 * assertion below is written in that frame, because that is the frame the
 * level was authored in. */
function at(u: number, v: number): { x: number; z: number } {
  const { x, z, heading } = plan.frame;
  return {
    x: x + u * Math.cos(heading) + v * Math.sin(heading),
    z: z - u * Math.sin(heading) + v * Math.cos(heading),
  };
}

/** Stand a car on the arena, pointed along +v, and drive it. */
function drive(
  u: number,
  v: number,
  speed: number,
  seconds: number,
  input: Partial<CarInput> = {},
): GameState {
  const state = createGame({ seed: 1, track, skipCountdown: true, quiet: true });
  const p = at(u, v);
  state.car.x = p.x;
  state.car.z = p.z;
  state.car.heading = plan.frame.heading;
  state.car.y = field.groundAt(p.x, p.z) + 0.4;
  state.car.u = speed;
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
  return state;
}

type Flight = {
  /** Seconds off the ground, and how far up the arena the car flew, m. */
  air: number;
  distance: number;
  overturned: boolean;
};

/** Coast a car at `speed` along +v from (u, v) and report the flight it
 * takes, or null if it never left the ground. The run stops at the pad's
 * north rim so the berm past it can never be mistaken for the feature under
 * test — a car that runs out of arena launches off the bank, and every jump
 * number in this file would quietly be that instead. */
function flight(u: number, v: number, speed: number): Flight | null {
  const state = createGame({ seed: 1, track, skipCountdown: true, quiet: true });
  const p = at(u, v);
  state.car.x = p.x;
  state.car.z = p.z;
  state.car.heading = plan.frame.heading;
  state.car.y = field.groundAt(p.x, p.z) + 0.4;
  state.car.u = speed;
  let takeoff: number | null = null;
  let landed: number | null = null;
  let wasAir = false;
  for (let i = 0; i < 8 * 120; i++) {
    step(state, NEUTRAL_INPUT);
    const along = alongV(state.car.x, state.car.z);
    if (along > ARENA_PAD) break;
    if (state.car.airborne && !wasAir && takeoff === null) takeoff = along;
    if (!state.car.airborne && wasAir && takeoff !== null && landed === null) landed = along;
    wasAir = state.car.airborne;
  }
  if (takeoff === null) return null;
  return {
    air: state.stats.airTime,
    distance: (landed ?? takeoff) - takeoff,
    overturned: state.overturned !== null,
  };
}

/** How far up the arena a world point is, m — the `v` of `at`, inverted. */
function alongV(x: number, z: number): number {
  const { heading } = plan.frame;
  return (x - plan.frame.x) * Math.sin(heading) + (z - plan.frame.z) * Math.cos(heading);
}

/** ...and the whole of `at` inverted: a world point back in the arena's own
 * frame, which is the frame every number in the layout is stated in. */
function localOf(x: number, z: number): { u: number; v: number } {
  const { heading } = plan.frame;
  const dx = x - plan.frame.x;
  const dz = z - plan.frame.z;
  return {
    u: dx * Math.cos(heading) - dz * Math.sin(heading),
    v: dx * Math.sin(heading) + dz * Math.cos(heading),
  };
}

describe("the training ground", () => {
  it("is a track with an arena on it, and no generated stage ever is", () => {
    expect(plan).not.toBeNull();
    expect(compileArena().arena).not.toBeNull();
    expect(track.checkpoints).toHaveLength(0);
    expect(track.pacenotes).toHaveLength(0);
  });

  it("stands its pad on the end of the approach road it is reached along", () => {
    const last = track.samples[track.samples.length - 1];
    // The pad's middle is a pad's half-width up the road, so its south rim
    // lands on the road's last metre and the gate is the road's own
    // continuation.
    expect(Math.hypot(plan.frame.x - last.x, plan.frame.z - last.z)).toBeCloseTo(ARENA_PAD, 3);
    expect(plan.frame.heading).toBeCloseTo(last.heading, 6);
  });

  it("builds the same ground twice — it is a level, not a roll", () => {
    const other = createTerrain(compileArena());
    for (let i = 0; i < 500; i++) {
      const p = at(((i * 37) % 320) - 160, ((i * 91) % 320) - 160);
      expect(other.groundAt(p.x, p.z)).toBe(field.groundAt(p.x, p.z));
      expect(other.spurSurfaceAt(p.x, p.z)).toBe(field.spurSurfaceAt(p.x, p.z));
    }
    expect(compileArena().arena?.cones).toHaveLength(plan.cones.length);
  });
});

describe("the ground the training ground is made of", () => {
  it("is sealed on one half and loose on the other, with a graded road between", () => {
    const surface = (u: number, v: number): string | null => {
      const p = at(u, v);
      return field.spurSurfaceAt(p.x, p.z);
    };
    expect(surface(-60, 0)).toBe("asphalt");
    expect(surface(-60, 70)).toBe("asphalt");
    expect(surface(60, 0)).toBe("gravel");
    expect(surface(60, -70)).toBe("gravel");
    // The seam down the middle, and the ring round the outside, are both
    // bladed stone whichever half they are running through.
    expect(surface(0, 40)).toBe("gravel");
    expect(surface(-104, 0)).toBe("gravel");
    expect(surface(0, 104)).toBe("gravel");
    // Past the rim the arena has no surface at all and the country does.
    expect(surface(0, -ARENA_PAD - 10)).toBeNull();
    expect(surface(ARENA_PAD + 30, 0)).toBeNull();
  });

  it("keeps the pad flat enough that a car crossing it never leaves the ground", () => {
    const state = drive(-95, -100, 22, 5, { throttle: 1 });
    expect(state.car.airborne).toBe(false);
    expect(state.stats.airTime).toBe(0);
    expect(state.surface).toBe("asphalt");
  });

  it("banks the ring's far corner up into the bank behind it", () => {
    const height = (u: number, v: number): number => {
      const p = at(u, v);
      return plan.heightAt(p.x, p.z);
    };
    // Across the mat at the corner's 45°: the inside of the turn is nearly
    // on the pad and the outside stands well over it.
    const inner = height(89, 89);
    const outer = height(98, 98);
    expect(outer - inner).toBeGreaterThan(1.5);
    // ...and the straights either side of it are not banked at all.
    expect(height(0, 104)).toBeLessThan(0.5);
  });

  it("rings itself with a bank that rises and then lets the country back", () => {
    const height = (u: number, v: number): number => {
      const p = at(u, v);
      return plan.heightAt(p.x, p.z);
    };
    expect(height(0, 0)).toBeLessThan(1);
    expect(height(ARENA_PAD + 16, 0)).toBeGreaterThan(3);
    // Past its whole reach the arena is asserting nothing: the height it
    // contributes is zero and the weight it blends at is too.
    const out = at(ARENA_REACH + 5, 0);
    expect(plan.heightAt(out.x, out.z)).toBe(0);
    expect(plan.weightAt(out.x, out.z)).toBe(0);
  });

  it("cuts a gate in the bank where the approach road comes in", () => {
    const gate = at(0, -ARENA_PAD - 12);
    const wall = at(70, -ARENA_PAD - 12);
    expect(plan.heightAt(gate.x, gate.z)).toBeLessThan(0.5);
    expect(plan.heightAt(wall.x, wall.z)).toBeGreaterThan(1.5);
  });

  it("is dry, and nothing grows on it", () => {
    for (let i = 0; i < 200; i++) {
      const p = at(((i * 53) % 220) - 110, ((i * 29) % 220) - 110);
      expect(field.waterAt(p.x, p.z)).toBeNull();
      expect(field.treesNear(p.x, p.z, 6)).toHaveLength(0);
    }
  });
});

describe("what the training ground is for", () => {
  it("throws a car off the ramp, further the faster it arrives", () => {
    // Coasting rather than driving, so the number under test is the speed
    // the car reached the lip at and not how hard the throttle was held.
    const slow = flight(72, -44, 18);
    const fast = flight(72, -44, 34);
    expect(slow).not.toBeNull();
    expect(fast).not.toBeNull();
    expect((slow as Flight).air).toBeGreaterThan(0.3);
    expect((fast as Flight).distance).toBeGreaterThan((slow as Flight).distance + 5);
    // Off a lip and back down on the wheels, not onto the roof.
    expect((fast as Flight).overturned).toBe(false);
  });

  it("counts the ramp as a JUMP and the table-top's crest as one too", () => {
    // The distinction is the engine's own (`launch`'s `hop`): a body that
    // bobs over a brow books no air time, draws no turbulence and is not a
    // landing. A built lip must never come out as one of those — a training
    // ramp the game does not think is a jump teaches the wrong lesson about
    // every jump on every stage.
    const over = drive(72, -44, 30, 3, {});
    expect(over.stats.airTime).toBeGreaterThan(0.5);
    expect(over.stats.jumps).toBeGreaterThan(0);
  });

  it("makes the table-top a crest you can drive — until you cannot", () => {
    // A table is not a ramp: it is a shape that rewards knowing how fast
    // you may take it, so the whole exercise is that the answer is a speed.
    expect(flight(34, 28, 22)).toBeNull();
    const over = flight(34, 28, 36);
    expect(over).not.toBeNull();
    expect((over as Flight).overturned).toBe(false);
  });

  it("stops a car against the yard's containers instead of letting it through", () => {
    const container = plan.solids.find((s) => s.kind === "container");
    expect(container).toBeDefined();
    const state = createGame({ seed: 1, track, skipCountdown: true, quiet: true });
    // Twelve metres short of a bay, aimed at it, at a speed that would put
    // the car well past it.
    const c = container as NonNullable<typeof container>;
    const back = plan.frame.heading;
    state.car.x = c.x - Math.sin(back) * 14;
    state.car.z = c.z - Math.cos(back) * 14;
    state.car.heading = back;
    state.car.y = field.groundAt(state.car.x, state.car.z) + 0.4;
    state.car.u = 18;
    for (let i = 0; i < 240; i++) step(state, NEUTRAL_INPUT);
    const gone = Math.hypot(state.car.x - c.x, state.car.z - c.z);
    expect(gone).toBeGreaterThan(1);
    expect(state.car.damage.wear).toBeGreaterThan(0);
  });

  it("puts a car OVER when it arrives at the roll lane's rail sideways", () => {
    // R1. The one exercise on the ground that is not about staying on your
    // wheels: the lane's rails are low enough to catch the car under its
    // centre of mass and let the top keep going, which is how a rally car
    // actually rolls. Placed beside the rail already sliding, because that
    // is what the exercise asks the driver to arrive with — a car that has
    // straightened up by the time it gets there simply scrapes down it.
    const state = drive(60, 30, 0, 0);
    state.car.u = 40;
    state.car.w = 18;
    let rolled = false;
    for (let i = 0; i < 120 * 6; i += 1) {
      step(state, NEUTRAL_INPUT);
      if (state.car.rolling) rolled = true;
    }
    expect(rolled).toBe(true);
    // ...and the same lane, taken straight, leaves the car on its wheels:
    // the rails are a trip for a car that is sideways, not a corridor that
    // rolls anything driven down it.
    const straight = drive(56, 20, 34, 3, { throttle: 1 });
    expect(straight.car.rolling).toBe(false);
    expect(onItsWheels(straight.car.roll, straight.car.pitch)).toBe(true);
  });

  it("gives the roll somewhere to carry to, and something to hit at the end", () => {
    // The run-out past the rails is deliberately empty for thirty metres —
    // that is where how far a roll carries becomes visible — and the debris
    // field is what a roll runs into when it does. Both are the exercise;
    // neither is dressing.
    const tyres = plan.structures.filter((s) => s.kind === "tyres");
    const inLane = tyres.filter((s) => {
      const v = alongV(s.x, s.z);
      return v > 58 && v < 92;
    });
    expect(inLane.length).toBeGreaterThanOrEqual(3);
    // Nothing standing in the thirty metres the roll is measured over.
    for (const solid of plan.solids) {
      const v = alongV(solid.x, solid.z);
      const { u } = localOf(solid.x, solid.z);
      if (u < 49 || u > 63) continue;
      expect(v > 56 && v < 61).toBe(false);
    }
  });

  it("lays its cones and its furniture on the ground, never off the side of it", () => {
    for (const cone of plan.cones) {
      expect(plan.surfaceAt(cone.x, cone.z)).not.toBeNull();
    }
    for (const solid of plan.solids) {
      // The fence stands ON the rim, so the pad's own edge is the bar.
      expect(plan.weightAt(solid.x, solid.z)).toBeGreaterThan(0);
      expect(solid.y).toBeCloseTo(field.groundAt(solid.x, solid.z), 2);
    }
  });
});

describe("a session on the training ground", () => {
  it("never finishes and never says the driver is lost", () => {
    const state = drive(0, -60, 30, 12, { throttle: 1 });
    expect(state.phase).not.toBe("finished");
    expect(state.lost).toBe(false);
    expect(state.wrongWay).toBe(false);
  });

  it("puts the car back on the approach road when the driver asks for it", () => {
    const state = drive(60, 40, 20, 2, { throttle: 1 });
    step(state, { ...NEUTRAL_INPUT, reset: true });
    const start = track.samples[0];
    expect(Math.hypot(state.car.x - start.x, state.car.z - start.z)).toBeLessThan(2);
  });
});
