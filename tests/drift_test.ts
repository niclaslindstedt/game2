// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The slide, moment by moment. There is no drift mode to test: what these
// assert is that turning hard at pace IS the drift, that it builds smoothly
// instead of snapping, that it costs the car very little speed, and that it
// parks at an angle rather than spinning. Runs on a synthetic dead-straight
// stage so nothing but the scripted input shapes the car's motion.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1500, feature: "none" }];

function game(carId = "compact", surface?: "gravel" | "asphalt"): GameState {
  // A slide carries the car tens of meters sideways; widen the test road so
  // the handling is measured, not the off-road respawn.
  const base = compileTrack(0, STRAIGHT);
  const track = {
    ...base,
    width: 220,
    // The paving is the generator's to place, so a surface comparison has to
    // seal the straight itself. The bank goes with it: a dead-flat road is
    // the only one on which the two surfaces differ by nothing else.
    samples: surface ? base.samples.map((s) => ({ ...s, surface, bank: 0 })) : base.samples,
  };
  return createGame({ seed: 0, carId, skipCountdown: true, track });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, ...input }));
  }
  return events;
}

/** Speed to the gearbox's ceiling on the straight before the corner. */
function upToSpeed(state: GameState, seconds: number): void {
  run(state, { throttle: 1 }, seconds);
}

describe("turning at pace", () => {
  it("a committed turn at speed slides the car — no handbrake, no flick", () => {
    const state = game();
    upToSpeed(state, 8);
    expect(state.car.u).toBeGreaterThan(30);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.slide).toBeGreaterThan(0.5);
    expect(state.car.drifting).toBe(true);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
  });

  it("a gentle turn at the same speed stays gripped", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 0.25 }, 1.5);
    // The slide is a continuous quantity, not a mode, so a gentle turn is
    // allowed a hair of it — the hand-over from grip to slide starts before
    // the tires are truly out of grip precisely so that nothing happens AT
    // the limit. What a gentle turn is not allowed is an ANGLE.
    expect(state.car.slide).toBeLessThan(0.05);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.05);
  });

  it("the angle moves WITH the wheel — no lock is a cliff", () => {
    // The one thing the handling must not do: turn a small change of lock
    // into a large change of angle. Sweep the throw and check both that the
    // angle rises all the way up it and that no step is a jump.
    const locks = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const angles = locks.map((lock) => {
      const state = game();
      upToSpeed(state, 8);
      run(state, { throttle: 1, steer: lock }, 2.5);
      return Math.abs(state.car.slip);
    });
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeGreaterThan(angles[i - 1]);
      // A tenth of the throw is worth at most ~9° more angle. The model this
      // replaced put 30° into one such step, which is what made a drift feel
      // like a mode the car switched into rather than something asked for.
      expect(angles[i] - angles[i - 1]).toBeLessThan(0.16);
    }
    // ...and the whole throw is worth a real spread, not a hair either side
    // of one angle: half lock is a shallower drift than full lock.
    expect(angles[0]).toBeLessThan(0.1);
    expect(angles[angles.length - 1]).toBeGreaterThan(0.4);
  });

  it("the exit overshoots a tad from a deep drift and gathers clean from a shallow one", () => {
    // Unwinding out of a big slide, the rotation outlives the lock and
    // carries the nose a little past centre — the dab of opposite lock. A
    // moderate slide has nothing to catch.
    const past = (lock: number): number => {
      const state = game();
      upToSpeed(state, 8);
      run(state, { throttle: 1, steer: lock }, 2.5);
      const side = Math.sign(state.car.slip);
      let crossed = 0;
      for (let i = 0; i < 24; i++) {
        run(state, { throttle: 1, steer: 0 }, 0.08);
        // Stop at the verge. A drift this big ends a long way out on a road
        // this wide, and the car carries on out there on the throttle: keep
        // sampling and what gets measured is a tree, not the exit.
        if (state.offRoad) break;
        crossed = Math.min(crossed, state.car.slip * side);
      }
      return -crossed;
    };
    expect(past(1)).toBeGreaterThan(0.005);
    expect(past(1)).toBeLessThan(0.12);
    expect(past(0.6)).toBeLessThan(0.01);
  });

  it("the angle builds over tenths of a second, it does not snap out", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 0.1);
    // A tenth of a second in, the car has barely started to rotate: no kick
    // throws the tail out from under the driver.
    expect(Math.abs(state.car.slip)).toBeLessThan(0.1);
    run(state, { throttle: 1, steer: 1 }, 0.9);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
  });

  it("costs very little speed — the tires redirect the car, they do not brake it", () => {
    const state = game();
    upToSpeed(state, 8);
    const before = Math.hypot(state.car.u, state.car.w);
    run(state, { throttle: 1, steer: 1 }, 2);
    expect(state.car.slide).toBeGreaterThan(0.5);
    // Two full seconds pinned sideways on the power — a longer drift than
    // any real corner asks for — and the car still carries most of its
    // pace. Measured on the velocity's MAGNITUDE: a slide turns speed, the
    // forward component alone would count that turn as a loss.
    expect(Math.hypot(state.car.u, state.car.w)).toBeGreaterThan(before * 0.82);
  });

  it("a held slide parks at an angle instead of spinning", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    const settled = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: 1 }, 2);
    // Still sideways, and no more sideways than it was: the deepening
    // forces saturate.
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
    expect(Math.abs(state.car.slip)).toBeLessThan(settled + 0.15);
    expect(Math.abs(state.car.slip)).toBeLessThan(1);
  });

  it("counter-steer gathers it up", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    const sideways = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: -0.4 }, 1);
    expect(Math.abs(state.car.slip)).toBeLessThan(sideways * 0.5);
    // The slide itself is all but gone. What angle is left belongs to the
    // turn the counter-steer is now itself asking for — a held 0.4 of lock
    // at this speed is a real corner — so the readout is asked once the
    // hands come back to centre rather than while they are still steering.
    expect(state.car.slide).toBeLessThan(0.2);
    run(state, { throttle: 1, steer: 0 }, 0.4);
    expect(state.car.drifting).toBe(false);
  });

  it("the handbrake unsticks the rear without teleporting the car sideways", () => {
    const state = game();
    upToSpeed(state, 5);
    const speed = state.car.u;
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.05);
    // Six frames of handbrake: no injected sideways speed, no lost pace.
    expect(Math.abs(state.car.slip)).toBeLessThan(0.06);
    expect(state.car.u).toBeGreaterThan(speed * 0.97);
    // A FLICK provokes the drift within a few tenths...
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.3);
    expect(state.car.drifting).toBe(true);
    // ...and HOLDING it with the power down and full lock takes the rear far
    // past the saturation band. Stated against the SAME car on the same lock
    // without the lever, because that is the claim — the handbrake reaches an
    // angle the wheel alone cannot — and because how deep the wheel alone
    // goes is now a property of the drivetrain (`TUNING.drivetrain[].depth`).
    // A front-driver washes wide where a rear-driver comes round, and the
    // lever is exactly how the front-driver gets there anyway.
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.7);
    const withLever = Math.abs(state.car.slip);

    const wheelOnly = game();
    upToSpeed(wheelOnly, 5);
    run(wheelOnly, { throttle: 1, steer: 1 }, 1.05);
    expect(withLever).toBeGreaterThan(Math.abs(wheelOnly.car.slip) * 1.4);
    expect(withLever).toBeGreaterThan(TUNING.drift.angleSpan);
  });

  it("stays gripped below the speed where turning outruns the tires", () => {
    const state = game();
    run(state, { throttle: 0.2 }, 0.5);
    expect(state.car.u).toBeLessThan(TUNING.drift.slideFrom);
    run(state, { throttle: 0.2, steer: 1 }, 0.5);
    expect(state.car.drifting).toBe(false);
  });

  it("counts sideways time and score for the balance table", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    expect(state.stats.driftCount).toBe(1);
    expect(state.stats.driftTime).toBeGreaterThan(0.5);
    expect(state.stats.driftScore).toBeGreaterThan(0);
  });
});

// Power oversteer is the REAR-DRIVEN car's, and only its: these run on the
// roster's rear-driver, because a front-driven car answers the throttle by
// pulling itself straight (see the drivetrain block below).
describe("rear-wheel drive", () => {
  const rwd = (): GameState => game("classic");

  /** Build speed, then hold a full-lock power slide for a second. */
  function enterDrift(state: GameState): void {
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.drifting).toBe(true);
  }

  it("centering the wheel lets the slide linger, then hands the car back", () => {
    const state = rwd();
    enterDrift(state);
    const entrySign = Math.sign(state.car.slip);
    // Wheel straight, power still down: the driven rear keeps the tail out
    // for a beat — the drift does not snap off the instant the wheel
    // centres...
    run(state, { throttle: 1 }, 0.4);
    expect(state.car.drifting).toBe(true);
    expect(Math.sign(state.car.slip)).toBe(entrySign);
    // ...but the angle is COMMANDED by the wheel, so with no input it
    // gathers itself within a couple of seconds — slower than a counter
    // (see below), never needing one.
    run(state, { throttle: 1 }, 1.6);
    expect(state.car.drifting).toBe(false);
  });

  it("lifting the throttle calms the car without any counter-steer", () => {
    const state = rwd();
    enterDrift(state);
    run(state, {}, 1.5);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.15);
  });

  it("over-holding the counter swings the pendulum into an opposite drift", () => {
    const state = rwd();
    enterDrift(state);
    const entrySign = Math.sign(state.car.slip);
    // Full counter-lock held straight through the catch: the body's yaw
    // momentum plus the power carries the slip past centre into a second
    // drift the other way — which needs its own counter.
    run(state, { throttle: 1, steer: -1 }, 1.2);
    expect(Math.sign(state.car.slip)).toBe(-entrySign);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);
    expect(state.car.drifting).toBe(true);
  });

  it("a timed counter-and-release settles the car back to straight", () => {
    const state = rwd();
    enterDrift(state);
    // Counter until the nose is nearly back, then breathe everything —
    // the skilled exit: no pendulum, pace kept.
    run(state, { throttle: 1, steer: -0.7 }, 0.55);
    run(state, {}, 1.2);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.15);
  });
});

// The wheel is not a switch, and a surface is not one number. Both of these
// are what a player means by "the steering feels wrong on tarmac": a lock
// that arrives in a single tick, and a sealed road that lets the car hang
// out at the same rally angle gravel does.
describe("the wheel, and what the surface does with it", () => {
  it("takes a beat to reach the lock the driver asked for", () => {
    const state = game();
    upToSpeed(state, 8);
    // One tick of full lock is not full lock: the rack (and the hands on it)
    // have weight, so turn-in builds instead of arriving.
    run(state, { throttle: 1, steer: 1 }, TUNING.dt);
    expect(state.car.steer).toBeGreaterThan(0);
    expect(state.car.steer).toBeLessThan(0.2);
    // ...and it does get all the way there, well inside a corner.
    run(state, { throttle: 1, steer: 1 }, 0.6);
    expect(state.car.steer).toBeGreaterThan(0.95);
  });

  it("breaks away at a smaller angle on tarmac than on gravel", () => {
    const held = { throttle: 0.35, steer: 1 } as const;
    const loose = game("compact", "gravel");
    const sealed = game("compact", "asphalt");
    for (const state of [loose, sealed]) {
      upToSpeed(state, 10);
      run(state, held, 2.5);
    }
    // Same car, same lock, same pace: the sealed road holds the nose in
    // line where the loose one lets the tail come round.
    expect(Math.abs(sealed.car.slip)).toBeLessThan(Math.abs(loose.car.slip) * 0.7);
    // And it is not simply slower — the grip is spent carrying speed.
    expect(sealed.car.u).toBeGreaterThan(loose.car.u);
  });
});

// THE SPEED FLOOR. A drift is the drama this game is made of, and drama at
// walking pace is not drama — it is a car that will not go where it is
// pointed. Under TUNING.drift.slideFrom the wheel does one thing and one
// thing only, and no lever on the car is a way round that.
describe("the floor under the slide", () => {
  /** Park the car at a chosen ground speed on the test straight. */
  function at(kmh: number, carId = "compact"): GameState {
    const state = game(carId);
    state.car.u = kmh / 3.6;
    return state;
  }

  it("will not go sideways below the floor, however hard the wheel is turned", () => {
    const state = at(60);
    run(state, { steer: 1 }, 1.2);
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThan(TUNING.drift.slideFrom);
    expect(state.car.slide).toBe(0);
    expect(state.car.drifting).toBe(false);
    // It still STEERS: the whole point of the floor is that the wheel keeps
    // its ordinary job under it.
    expect(Math.abs(state.car.yawRate)).toBeGreaterThan(0.1);
  });

  it("gives the handbrake nothing to work with down there either", () => {
    const plain = at(60);
    const yanked = at(60);
    run(plain, { steer: 1 }, 1.2);
    run(yanked, { steer: 1, handbrake: true }, 1.2);
    expect(yanked.car.slide).toBe(0);
    expect(yanked.car.drifting).toBe(false);
    // The lever is a pair of locked rear wheels down here and nothing else:
    // it must not buy any more angle than the wheel alone already had.
    expect(Math.abs(yanked.car.slip)).toBeLessThanOrEqual(Math.abs(plain.car.slip) * 1.05);
  });

  it("but the same lock at pace is a drift", () => {
    const state = at(110);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.slide).toBeGreaterThan(0.5);
    expect(state.car.drifting).toBe(true);
  });

  it("lets a slide go as the car slows into the floor", () => {
    const state = at(110);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.slide).toBeGreaterThan(0.5);
    // Off the power and hard on the brakes, still on full lock: the angle
    // has to be gone by the time the car is under the floor, not carried
    // down to a standstill.
    run(state, { brake: 1, steer: 1 }, 4);
    expect(Math.hypot(state.car.u, state.car.w) * 3.6).toBeLessThan(70);
    expect(state.car.slide).toBe(0);
  });
});
