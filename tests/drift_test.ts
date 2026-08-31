// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The slide, moment by moment. There is no drift mode to test: what these
// assert is that turning hard at pace IS the drift, that it builds smoothly
// instead of snapping, that it costs the car very little speed, and that it
// parks at an angle rather than spinning. Runs on a synthetic dead-straight
// stage so nothing but the scripted input shapes the car's motion.
//
// On the REAR-DRIVER, because that is the layout every knob in the drift
// group is calibrated against (`drivetrain.rwd.depth` is the 1 the others
// give away from). The front-driver reaches a fraction of these angles on
// the wheel alone and has to be asked for the rest with a pedal or the
// lever — its own contract is "the front-driver has to be asked" below, and
// putting the shape-of-the-slide tests on it would only measure how far
// short of the reference it deliberately falls.
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

function game(carId = "classic", surface?: "gravel" | "asphalt"): GameState {
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

/** ...and the same straight with a road wide enough to hold a HELD LOCK.
 * A car circling at a fixed lock leaves the crown within a couple of seconds
 * however wide the road looks from the driver's seat, and the surface under
 * it is `nature` the moment it does — so a test comparing two SURFACES at a
 * settled radius has to keep the car on the one it is asking about, or it
 * quietly answers about a third. The TRACK's width is what does it; a
 * sample's own `width` is not where the ground under the car is read from
 * and widening those alone changes nothing. */
function circuit(carId: string, surface: "gravel" | "asphalt"): GameState {
  const base = compileTrack(0, STRAIGHT);
  const track = {
    ...base,
    width: 900,
    samples: base.samples.map((s) => ({ ...s, surface, bank: 0 })),
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

/** Which way the car is actually TRAVELLING, in world radians — the nose
 * turned by the slip. What a drift's exit is allowed to do to this is the
 * difference between the driver finishing the corner and the tires doing
 * it for them. */
function travelDir(state: GameState): number {
  const { heading, u, w } = state.car;
  return Math.atan2(
    Math.sin(heading) * u + Math.cos(heading) * w,
    Math.cos(heading) * u - Math.sin(heading) * w,
  );
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
    // A hair more of one on the rear-driver than on either other layout: its
    // slide starts earliest of the three (`drivetrain.rwd.entry`), so a
    // quarter of the throw is already a few percent into the hand-over.
    expect(state.car.slide).toBeLessThan(0.08);
    expect(state.car.drifting).toBe(false);
    // Three degrees. Whatever the slide reads, a quarter of the throw is a
    // turn and not an angle — which is the half of this that matters.
    expect(Math.abs(state.car.slip)).toBeLessThan(0.06);
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
    // The ANGLE is the thing a counter gathers, and the only thing this can
    // ask about while the hands are still on it. `car.slide` is not: the
    // demand it answers is sign-blind — a held 0.4 of lock at this speed is
    // a real corner's worth of it whichever way it points — so a car being
    // caught reads as sliding right up until the hands come back to centre.
    // Which is exactly why the DRIFT readout is taken off the angle.
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

  it("letting go of the wheel does not finish the corner", () => {
    // The exit belongs to the driver. Dropping the wheel mid-slide gathers
    // the NOSE up — but the car carries on out toward the outside of the
    // road, going very nearly where it was already going. What the tires may
    // not do is swing the whole car round the corner on the driver's behalf
    // and hand it back straight, on the line and up to speed, with nothing
    // left to catch.
    const state = rwd();
    enterDrift(state);
    const before = travelDir(state);
    run(state, { throttle: 1 }, 1.2);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.1);
    const dropped = Math.abs(travelDir(state) - before);

    // ...and it is LOCK that takes the car back, exactly as hard as it ever
    // did. The fade is what a CENTRED wheel costs the front tires, never a
    // blanket loss of grip.
    const holding = rwd();
    enterDrift(holding);
    const held = travelDir(holding);
    run(holding, { throttle: 1, steer: 1 }, 1.2);
    const steered = Math.abs(travelDir(holding) - held);

    // The RATIO is the contract, not either number on its own: the same
    // slide with the wheel still asking has to take the car several times
    // further round the corner than the same slide dropped. Written this way
    // it survives the angles being rescaled — which is what makes one layout
    // slidier than another — and still catches tires that finish a corner on
    // the driver's behalf. The floor under each keeps it from passing by
    // having both go nowhere.
    expect(dropped).toBeLessThan(0.3);
    expect(steered).toBeGreaterThan(0.9);
    expect(steered).toBeGreaterThan(dropped * 3.5);
  });

  it("lifting the throttle calms the car without any counter-steer", () => {
    const state = rwd();
    enterDrift(state);
    run(state, {}, 1.5);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.15);
  });

  it("booting it mid-drift brings the tail round again", () => {
    // The friction circle: rubber already near saturation, asked to put the
    // power down as well, has less grip left to corner with — and on a driven
    // REAR axle that is the tail stepping out. A stab, not a state: what
    // rotates the car is the torque arriving faster than the tires can shed
    // it, so the angle spikes and then settles back to whatever the wheel is
    // asking for.
    const state = rwd();
    enterDrift(state);
    run(state, { steer: 1 }, 0.6);
    const lifted = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: 1 }, 0.25);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(lifted * 1.15);
    run(state, { throttle: 1, steer: 1 }, 1.2);
    expect(Math.abs(state.car.slip)).toBeLessThan(lifted);
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
describe("front-wheel drive", () => {
  it("the boot is the rear-driver's move — the front-driver just goes straight on", () => {
    // Same trade at the other axle: a driven FRONT axle asked for torque it
    // has no grip left for loses its NOSE, not its tail. So the stab that
    // brings a saloon's tail round does nothing at all for the hatch, which
    // is rotated on the lift and on the lever instead.
    const state = game("compact");
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1);
    run(state, { steer: 1 }, 0.6);
    const lifted = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: 1 }, 0.25);
    expect(Math.abs(state.car.slip)).toBeLessThan(lifted);
  });
});

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

  it("turns tighter on tarmac the more its rubber is made for tarmac", () => {
    // The other half of the surface, and the half that used to be missing.
    // Breaking away later is only worth having if the grip that buys it
    // reaches the wheel: with no surface in the steering's own authority
    // every car took a WIDER line on tarmac than on gravel while arriving
    // faster, which makes the one surface a car should be quick on a place
    // to run wide.
    //
    // The contract is the ORDERING, not a flat "tarmac is tighter for
    // everybody": the advantage is quoted against the car's own loose-
    // surface rubber, so the hatch on sealed tires gains a great deal and
    // the saloon on skinny loose ones gains almost nothing — and on gravel
    // the saloon's own slide hands its wheel extra authority that the
    // gripped paved car does not need and does not get. What must never
    // happen again is the hatch, billed as the tarmac car, cornering wider
    // on tarmac than on the loose.
    // At a PINNED speed, because tarmac's lower drag and better traction
    // make the car faster on the same pedal, and a faster car holds a wider
    // radius at the same lock whatever the surface. Left to run, the two
    // arrive at the corner 6 m/s apart and the comparison measures the
    // straight rather than the turn.
    const radii = ["compact", "coupe", "classic"].map((id) => {
      const out: number[] = [];
      for (const surface of ["gravel", "asphalt"] as const) {
        const state = circuit(id, surface);
        const speed = (): number => Math.hypot(state.car.u, state.car.w);
        // Up to the mark first, then held there — never accelerated past it
        // and asked to come back, which 2.5 s of corner is not long enough
        // to do. The pedal never CLOSES either: a shut throttle is a lift,
        // which is a move, and this is a question about the wheel alone.
        for (let i = 0; i < 120 * 60 && speed() < 30; i++) {
          step(state, { ...NEUTRAL_INPUT, throttle: 1 });
        }
        for (let i = 0; i < Math.round(2.5 / TUNING.dt); i++) {
          step(state, { ...NEUTRAL_INPUT, steer: 0.45, throttle: speed() < 30 ? 0.6 : 0.3 });
        }
        out.push(speed() / Math.abs(state.car.yawRate));
      }
      return out;
    });
    // The hatch — sealed tires, the most paved grip in the roster — turns
    // meaningfully tighter on the surface it is built for.
    const [hatchLoose, hatchSealed] = radii[0];
    expect(hatchSealed).toBeLessThan(hatchLoose * 0.95);
    // ...and the gain falls away with the rubber: the coupe's all-round
    // tires buy some of it, the saloon's loose ones none. Ordering the
    // ratios is what pins the advantage to `tyres.sealed / tyres.loose`
    // rather than to the surface alone.
    const [hatch, coupe, saloon] = radii.map(([loose, sealed]) => sealed / loose);
    expect(hatch).toBeLessThan(coupe);
    expect(coupe).toBeLessThan(saloon);
  });

  it("can be drifted on tarmac — on a move, and less than on gravel", () => {
    // Tarmac's whole slip vocabulary is a fraction of gravel's, so what
    // counts as sideways is sized in the surface too. The contract is that
    // the fraction is real on both sides: a paved corner CAN be drifted, and
    // it is a smaller drift than the same provocation buys on the loose.
    const angle = (surface: "gravel" | "asphalt"): number => {
      const state = game("compact", surface);
      upToSpeed(state, 10);
      run(state, { steer: 1, handbrake: true }, 0.5);
      run(state, { steer: 1, throttle: 0.3 }, 0.5);
      expect(state.car.drifting).toBe(true);
      return Math.abs(state.car.slip);
    };
    const sealed = angle("asphalt");
    const loose = angle("gravel");
    expect(sealed).toBeLessThan(loose);
    // ...and the wheel ALONE on tarmac is not a drift, which is the other
    // side of the same bargain: a paved corner is driven round unless the
    // driver asks for something.
    const plain = game("compact", "asphalt");
    upToSpeed(plain, 10);
    run(plain, { throttle: 0.35, steer: 0.45 }, 2.5);
    expect(plain.car.drifting).toBe(false);
  });
});

// THE LINKED DRIFT and THE SPIN — the two ends of the same idea. A drift
// leaves the tires worse than it found them, so the corner after it goes
// deeper; and past a point the car is simply gone, which is what stops the
// escalation being free.
describe("one drift after another", () => {
  /** Provoke a slide, hold it, then straighten and run on for `rest`. */
  function bout(state: GameState, side: number, rest: number): number {
    let peak = 0;
    for (let i = 0; i < Math.round(0.9 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, steer: side, throttle: 0, handbrake: i < 25 });
      peak = Math.max(peak, Math.abs(state.car.slip));
    }
    run(state, { throttle: 1 }, rest);
    return peak;
  }

  it("the second drift goes deeper than the first, and the third deeper still", () => {
    const state = game("coupe");
    upToSpeed(state, 12);
    const first = bout(state, 1, 0.7);
    const second = bout(state, -1, 0.7);
    const third = bout(state, 1, 0.7);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    // ...and the chain that did it is a real, bounded thing on the car.
    expect(state.car.chain).toBeGreaterThan(0);
    expect(state.car.chain).toBeLessThanOrEqual(1);
  });

  it("...and the tires come back if the driver gives them a straight", () => {
    const linked = game("coupe");
    upToSpeed(linked, 12);
    bout(linked, 1, 0.7);
    const second = bout(linked, -1, 0.7);

    const rested = game("coupe");
    upToSpeed(rested, 12);
    bout(rested, 1, 8);
    const after = bout(rested, -1, 0.7);
    // Same car, same two provocations — the only difference is the road
    // between them, and that is what a cooling chain has to be worth.
    expect(after).toBeLessThan(second);
    expect(rested.car.chain).toBeLessThan(linked.car.chain);
  });

  it("goes too far into a spin, and the spin is the end of the corner", () => {
    // On tarmac, where the whole slip vocabulary is smaller and the wall is
    // correspondingly closer: full lock and the lever held is not a drift
    // anybody is managing, and it has to cost the corner rather than simply
    // being the deepest angle available.
    const state = circuit("classic", "asphalt");
    upToSpeed(state, 12);
    const entry = Math.hypot(state.car.u, state.car.w);
    run(state, { steer: 1, handbrake: true, throttle: 0 }, 1.6);
    expect(state.car.spun).toBe(true);
    expect(state.stats.spins).toBeGreaterThan(0);
    // Four tires dragged sideways is the most effective brake in the game,
    // which is why a spin costs a run far more than the corner it happened in.
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThan(entry * 0.6);
  });

  it("a car pointing the wrong way at walking pace is not spinning", () => {
    // The spin has a speed floor on both sides of it. Without one on the
    // ENTRY, a car beached on a bank or scrabbling out of a ditch at an
    // angle enters on its slip and leaves on its speed in the same step,
    // chattering the counter while the scrub pins it there and takes away
    // the steering it needs to drive out.
    const state = circuit("classic", "asphalt");
    upToSpeed(state, 12);
    run(state, { steer: 1, handbrake: true, throttle: 0 }, 8);
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThan(TUNING.drift.spinOut);
    expect(state.car.spun).toBe(false);
  });
});

// THE SPEED FLOOR. A drift is the drama this game is made of, and drama at
// walking pace is not drama — it is a car that will not go where it is
// pointed. Under TUNING.drift.slideFrom the wheel does one thing and one
// thing only, and no lever on the car is a way round that.
describe("the floor under the slide", () => {
  /** Park the car at a chosen ground speed on the test straight. In the
   * four-wheel-drive by default: the floor is only visible on a car that
   * both has one (the rear-driver's is at walking pace) and has enough
   * slide in it above the floor to see one taken away. */
  function at(kmh: number, carId = "coupe"): GameState {
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

  it("but the LEVER argues with it, because a hairpin is taken under it", () => {
    // The one exception, and the reason the floor can be as high as it is:
    // the corners that need a move are the slow ones, so a rule that shut
    // the lever off under 70 would shut it off exactly where it is for.
    const plain = at(60);
    const yanked = at(60);
    run(plain, { steer: 1 }, 1.2);
    run(yanked, { steer: 1, handbrake: true }, 1.2);
    expect(plain.car.slide).toBe(0);
    expect(yanked.car.slide).toBeGreaterThan(0.5);
    expect(Math.abs(yanked.car.slip)).toBeGreaterThan(Math.abs(plain.car.slip) * 2);
  });

  it("...and only the lever, and only so far down", () => {
    // It is a deliberate act that claims it, never a car simply going
    // slowly: a scrabble out of a ditch and a nudge on the grid are as
    // gripped as they ever were. And the exception has its own floor —
    // below `provokeFloor` of the rule, even the lever has nothing.
    const walking = at(20);
    run(walking, { steer: 1, handbrake: true }, 1.2);
    expect(walking.car.slide).toBe(0);
    expect(walking.car.drifting).toBe(false);
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
    // down to a standstill. A trailed brake lowers the floor (it is one of
    // the moves) but it never removes it, and four seconds of full brake is
    // a long way under even the lowered one.
    run(state, { brake: 1, steer: 1 }, 4);
    expect(Math.hypot(state.car.u, state.car.w) * 3.6).toBeLessThan(70);
    expect(state.car.slide).toBe(0);
  });
});

describe("the front-driver has to be asked", () => {
  /** The line the car is actually holding, m — the radius the tires and the
   * rotation together are managing, which is what "it understeers" is a
   * claim about. The angle is the other half and neither says it alone. */
  function radius(state: GameState): number {
    return Math.hypot(state.car.u, state.car.w) / Math.abs(state.car.yawRate);
  }

  /** A committed corner on the throttle, held long enough to settle. */
  function corner(carId: string, input: Partial<CarInput> = {}): GameState {
    const state = game(carId, "gravel");
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 0.85, ...input }, 2.5);
    return state;
  }

  it("washes wide where the rear-driver steps out — same lock, same speed", () => {
    const hatch = corner("compact");
    const saloon = corner("classic");
    // Under half the angle...
    expect(Math.abs(hatch.car.slip)).toBeLessThan(Math.abs(saloon.car.slip) * 0.6);
    // ...on a visibly wider line. Both halves matter: a car with less angle
    // on the SAME radius is a tidier car, not a front-driver. This one is
    // running out of road, which is what a front axle out of grip does.
    expect(radius(hatch)).toBeGreaterThan(radius(saloon) * 1.15);
  });

  it("rotates on a trailed brake instead — the pedal the hatch turns in on", () => {
    const power = corner("compact");
    // The same corner, arrived at the same way, but braked into rather than
    // powered through: off the gas, hard on the middle pedal, lock still on.
    const trailed = game("compact", "gravel");
    upToSpeed(trailed, 8);
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      run(trailed, { throttle: 0, brake: 0.7, steer: 0.85 }, 0.1);
      peak = Math.max(peak, Math.abs(trailed.car.slip));
    }
    // More angle than the throttle ever gave it, and a far tighter line —
    // the two halves of a turn-in, off one pedal.
    expect(peak).toBeGreaterThan(Math.abs(power.car.slip) * 1.15);
    expect(radius(trailed)).toBeLessThan(radius(power) * 0.75);
  });

  it("and the lever is what is left for a corner too tight for either", () => {
    // Under the floor, where the wheel alone has nothing at all and a hatch
    // on the brakes has already run out of speed to rotate with.
    const plain = game("compact", "gravel");
    plain.car.u = 60 / 3.6;
    run(plain, { steer: 1 }, 1.2);
    expect(plain.car.slide).toBe(0);

    const yanked = game("compact", "gravel");
    yanked.car.u = 60 / 3.6;
    run(yanked, { steer: 1, handbrake: true }, 0.6);
    expect(yanked.car.drifting).toBe(true);
    expect(Math.abs(yanked.car.slip)).toBeGreaterThan(Math.abs(plain.car.slip) * 2);
  });

  it("keeps the whole roster in order: the hatch slides least, the saloon most", () => {
    const angles = ["compact", "coupe", "classic"].map((id) => Math.abs(corner(id).car.slip));
    expect(angles[0]).toBeLessThan(angles[1]);
    expect(angles[1]).toBeLessThan(angles[2]);
  });
});
