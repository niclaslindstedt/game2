// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the DRIVETRAIN is worth. The roster's three cars differ by data
// alone, so these assert the behaviours those numbers are supposed to buy:
// a rear axle that steps out on the throttle at walking pace, a front axle
// that pulls the car straight out of a slide instead of into one, a weight
// throw that unsticks a car no driven wheel could, and tires that make a
// surface a choice. Run on a synthetic dead-straight stage, widened so the
// handling is measured rather than the off-road respawn.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  carById,
  compileTrack,
  driveBiteOf,
  driveLoadOf,
  createGame,
  step,
  surfaceBreakawayFor,
  surfaceGripFor,
  type CarInput,
  type GameState,
  type SegmentPlan,
  type Surface,
  type Underfoot,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 4000, feature: "none" }];

function game(carId: string, surface?: Surface): GameState {
  const base = compileTrack(0, STRAIGHT);
  return createGame({
    seed: 0,
    carId,
    skipCountdown: true,
    track: {
      ...base,
      width: 400,
      samples: surface ? base.samples.map((s) => ({ ...s, surface, bank: 0 })) : base.samples,
    },
  });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
}

/** Hold the car at `speed` while it is steered, so the slip angle it
 * settles at is about the YAW and not about what the throttle did to pace.
 * The ground speed is what is pinned — the slip angle itself is untouched. */
function pinned(state: GameState, input: Partial<CarInput>, speed: number, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
    const ground = Math.hypot(state.car.u, state.car.w);
    state.car.u *= speed / ground;
    state.car.w *= speed / ground;
  }
}

/** Put the car on the straight at `speed`, in the gear that speed belongs
 * to — a car dropped in at pace in first would be on its rev limiter. */
function atSpeed(state: GameState, speed: number): void {
  state.car.u = speed;
  const gear = state.spec.gearTop.findIndex((top) => top > speed * 1.02);
  state.car.gear = gear < 0 ? state.spec.gearTop.length - 1 : gear;
}

const RWD = "classic";
const FWD = "compact";
const AWD = "coupe";

describe("the drivetrain", () => {
  it("gives the roster one car of each layout", () => {
    expect(carById(FWD).drive).toBe("fwd");
    expect(carById(RWD).drive).toBe("rwd");
    expect(carById(AWD).drive).toBe("awd");
  });

  it("lets the rear-driver step its tail out at walking pace, on the throttle", () => {
    // 10 km/h — far below the speed at which the WHEEL can unstick anything.
    // Only torque through a driven rear axle gets the car sideways here.
    const state = game(RWD);
    atSpeed(state, 2.8);
    pinned(state, { steer: 1, throttle: 1 }, 2.8, 1.5);
    expect(state.car.drifting).toBe(true);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);

    // Off the throttle at the same speed and lock it simply turns: the
    // torque is doing this, not the steering.
    const coasting = game(RWD);
    atSpeed(coasting, 2.8);
    pinned(coasting, { steer: 1, throttle: 0 }, 2.8, 1.5);
    expect(coasting.car.drifting).toBe(false);
    expect(Math.abs(coasting.car.slip)).toBeLessThan(Math.abs(state.car.slip) / 2);
  });

  it("gives no such thing to the front-driver or the four-wheel-drive", () => {
    for (const carId of [FWD, AWD]) {
      const state = game(carId);
      atSpeed(state, 2.8);
      pinned(state, { steer: 1, throttle: 1 }, 2.8, 1.5);
      expect(state.car.drifting).toBe(false);
    }
  });

  it("makes the throttle deepen a rear-driven slide and straighten a front-driven one", () => {
    const deltas: Record<string, number> = {};
    for (const carId of [FWD, RWD, AWD]) {
      const power = game(carId);
      atSpeed(power, 30);
      pinned(power, { steer: 0.55, throttle: 1 }, 30, 1.2);
      const lift = game(carId);
      atSpeed(lift, 30);
      pinned(lift, { steer: 0.55, throttle: 0 }, 30, 1.2);
      deltas[carId] = Math.abs(power.car.slip) - Math.abs(lift.car.slip);
    }
    // The rear axle feeds the slide, the front axle pulls the car out of
    // it, and driving all four sits between the two. That ORDER is the
    // whole point of the layout being physics rather than a badge.
    expect(deltas[RWD]).toBeGreaterThan(deltas[AWD]);
    expect(deltas[AWD]).toBeGreaterThan(deltas[FWD]);
    expect(deltas[RWD]).toBeGreaterThan(0);
    expect(deltas[FWD]).toBeLessThanOrEqual(0);
  });

  it("gets the front-driver sideways on a flick, at a lock that alone would not", () => {
    // Turn straight in on a moderate lock: the front-driver understeers up
    // to its limit and settles at a small angle.
    const plain = game(FWD);
    atSpeed(plain, 25);
    pinned(plain, { steer: 0.55, throttle: 1 }, 25, 0.6);
    const gripped = Math.abs(plain.car.slip);

    // Now the move the game is named after: full lock AWAY from the corner,
    // then snap onto it. Nothing about the corner has changed — only the
    // weight thrown across the car on the way in.
    const flicked = game(FWD);
    atSpeed(flicked, 25);
    pinned(flicked, { steer: -1, throttle: 1 }, 25, 0.3);
    pinned(flicked, { steer: 0.55, throttle: 1 }, 25, 0.6);
    expect(Math.abs(flicked.car.slip)).toBeGreaterThan(gripped * 1.5);
    expect(flicked.car.drifting).toBe(true);
  });

  it("throws no weight when the hands are chasing the car rather than crossing it", () => {
    // Winding ON more lock is not a flick however fast it is done: the
    // guard is that the wheel has to cross the car, or every correction
    // mid-corner would unstick the rear.
    const state = game(FWD);
    atSpeed(state, 25);
    pinned(state, { steer: 0.2, throttle: 1 }, 25, 0.4);
    pinned(state, { steer: 1, throttle: 1 }, 25, 0.02);
    expect(state.car.flick).toBe(0);
  });

  it("makes the tires a real choice: road rubber gains on tarmac, gravel rubber does not", () => {
    // Each car against ITSELF across the two surfaces, as the FRACTION of
    // its slide that survives the sealed road. How far into a slide a car
    // is at a given lock is mostly its layout, so the absolute drop mostly
    // measures how loose the car already was; the fraction is scale-free
    // and is what the tires actually decide — how much a sealed road is
    // worth to THIS car. Road rubber keeps almost none of its gravel
    // slide; a gravel tire finds little there and keeps most of it, and
    // that asymmetry is what makes the surface a choice rather than a
    // ranking every car agrees on.
    const slideAt = (carId: string, surface: Surface): number => {
      const state = game(carId, surface);
      atSpeed(state, 30);
      pinned(state, { steer: 0.6, throttle: 1 }, 30, 1);
      return state.car.slide;
    };
    const kept = (carId: string): number => slideAt(carId, "asphalt") / slideAt(carId, "gravel");
    expect(kept(FWD)).toBeLessThan(kept(AWD));
    expect(kept(AWD)).toBeLessThan(kept(RWD));
    // ...and it is the tires saying so: the ordering is their sealed/loose
    // ratio, read back off the catalog.
    const ratio = (carId: string): number =>
      carById(carId).tyres.sealed / carById(carId).tyres.loose;
    expect(ratio(FWD)).toBeGreaterThan(ratio(AWD));
    expect(ratio(AWD)).toBeGreaterThan(ratio(RWD));
  });

  it("puts the power down where there is nothing to put it down on", () => {
    // A standing start through water, as a fraction of the same start on
    // dry gravel. One driven axle carrying all the torque spins it away;
    // four driven wheels share it out and the car simply goes. This is the
    // four-wheel-drive's whole case, and the rear-driver's whole cost.
    const keptInWater = (carId: string): number => {
      const dry = game(carId, "gravel");
      run(dry, { throttle: 1 }, 3);
      const wet = game(carId, "water");
      run(wet, { throttle: 1 }, 3);
      return wet.car.u / dry.car.u;
    };
    expect(keptInWater(AWD)).toBeGreaterThan(keptInWater(FWD));
    expect(keptInWater(FWD)).toBeGreaterThan(keptInWater(RWD));
  });

  it("gives the rear-driver a tarmac drift the other two layouts do not have", () => {
    // THE SEALED ROAD IS THE REAR-DRIVER'S GROUND. What makes a paved
    // surface hard to hang a car out on is that the rubber peaks a few
    // degrees off straight and falls away past it, so there is nothing to
    // hang it out ON — and a driven rear axle supplies that itself by
    // spinning the tyres up against grip that is actually there. A driven
    // front answers the same question by washing the nose wide.
    const held = (carId: string, surface: Surface): number => {
      const state = game(carId, surface);
      atSpeed(state, 30);
      pinned(state, { steer: 0.85, throttle: 1 }, 30, 2.5);
      return Math.abs(state.car.slip);
    };
    const paved = {
      fwd: held(FWD, "asphalt"),
      awd: held(AWD, "asphalt"),
      rwd: held(RWD, "asphalt"),
    };
    // Half again what either other layout finds on the same road at the same
    // lock — where on GRAVEL the three sit within a stride of each other.
    expect(paved.rwd).toBeGreaterThan(paved.fwd * 1.5);
    expect(paved.rwd).toBeGreaterThan(paved.awd * 1.5);
    // ...and it is a real drift, not an angle under the readout: the smoke
    // off a sealed road and the tyres singing both hang off this flag.
    const state = game(RWD, "asphalt");
    atSpeed(state, 30);
    pinned(state, { steer: 0.85, throttle: 1 }, 30, 2.5);
    expect(state.car.drifting).toBe(true);
    // It costs nothing anywhere else: the claw-back is measured against
    // GRAVEL's breakaway, so the loose surfaces are untouched by it.
    for (const drive of ["fwd", "rwd", "awd"] as const) {
      expect(surfaceBreakawayFor({ ...carById(FWD), drive }, "gravel")).toBe(
        TUNING.surfaces.breakaway.gravel,
      );
    }
  });

  it("gives the four-wheel-drive grip where there is least of it to have", () => {
    // Four driven wheels each spend half as much of their friction budget on
    // going forwards, which is worth almost nothing where the budget is large
    // and a great deal where it has nearly run out. So the winter road is
    // this layout's, and the graded stone it shares with everybody.
    const spec = carById(AWD);
    const asIf = (drive: "fwd" | "rwd" | "awd", surface: Underfoot): number =>
      surfaceGripFor({ ...spec, drive }, surface);
    for (const surface of ["ice", "snow", "snowfield", "water"] as const) {
      expect(asIf("awd", surface)).toBeGreaterThan(asIf("fwd", surface));
      expect(asIf("fwd", surface)).toBe(asIf("rwd", surface));
    }
    // Most of it on the ice, least on a packed snow road — the shortfall
    // against gravel is what it is read against, so it tracks how bad the
    // ground actually is.
    const gain = (surface: Underfoot): number => asIf("awd", surface) / asIf("fwd", surface);
    expect(gain("ice")).toBeGreaterThan(gain("snowfield"));
    expect(gain("snowfield")).toBeGreaterThan(gain("snow"));
    // ...and nothing at all on the two surfaces a stage is mostly made of,
    // where there is no shortfall to claw back.
    for (const surface of ["gravel", "asphalt"] as const) {
      expect(asIf("awd", surface)).toBe(asIf("fwd", surface));
    }
  });

  it("stands the car's weight on the wheels that drive it, and moves it with the hill", () => {
    // A tyre pulls what the friction under it and the load ON it allow, so
    // what a layout can put down is the share of the car pressing its DRIVEN
    // tyres into the ground. Four driven wheels have all of it; a
    // two-wheel-drive has whatever sits over its one axle — which is why
    // four-wheel drive is worth roughly twice a two-wheel drive off the
    // line, and why none of it is true of cornering or braking.
    const compact = carById("compact");
    const coupe = carById("coupe");
    const classic = carById("classic");
    expect(driveLoadOf(coupe, 0)).toBe(1);
    expect(driveLoadOf(compact, 0)).toBeCloseTo(compact.balance, 10);
    expect(driveLoadOf(classic, 0)).toBeCloseTo(1 - classic.balance, 10);
    expect(driveLoadOf(coupe, 0)).toBeGreaterThan(1.7 * driveLoadOf(classic, 0));

    // ...AND IT MOVES WITH THE HILL. Climbing, gravity pitches weight off
    // the nose and onto the tail: a front-driver's driven axle goes light on
    // the one gradient it most needs the grip, a rear-driver's digs in, and
    // a four-wheel drive neither gains nor loses because it already has all
    // of it. This is the whole reason the three cars climb differently.
    for (const grade of [0.08, 0.2, 0.35]) {
      expect(driveLoadOf(compact, grade)).toBeLessThan(driveLoadOf(compact, 0));
      expect(driveLoadOf(classic, grade)).toBeGreaterThan(driveLoadOf(classic, 0));
      expect(driveLoadOf(coupe, grade)).toBe(1);
    }
    // A descent does not run it backwards into a front-driver's favour past
    // what the model is tuned for; it is the same rule read the other way,
    // and the floor is what stops either end reaching zero.
    expect(driveLoadOf(compact, -3)).toBeLessThanOrEqual(1);
    expect(driveLoadOf(classic, 3)).toBeLessThanOrEqual(1);
    expect(driveLoadOf(classic, -3)).toBeGreaterThanOrEqual(TUNING.drivetrain.loadFloor);
    expect(driveLoadOf(compact, 3)).toBeGreaterThanOrEqual(TUNING.drivetrain.loadFloor);
  });

  it("charges the climb against the same budget the pedal spends", () => {
    // Holding station on a grade needs that much of gravity out of the
    // driven tyres before the car moves at all, and it comes out of the
    // friction everything else is paid from. Without it the advantage of
    // four driven wheels is invisible: off a hill their bite is over 1 and
    // clamped, so they already lose nothing and cannot be given less.
    const sand = (id: string, grade: number): number => {
      const spec = carById(id);
      return driveBiteOf(spec, surfaceGripFor(spec, "sand"), grade);
    };
    for (const id of ["compact", "coupe", "classic"]) {
      expect(sand(id, 0.25)).toBeLessThan(sand(id, 0));
    }
    // Level, the four-wheel drive is over the clamp and has nothing to
    // prove; on a real climb it still has most of its budget where the
    // two-wheel drives have spent well over half of theirs.
    expect(sand("coupe", 0)).toBeGreaterThan(1);
    expect(sand("coupe", 0.25)).toBeGreaterThan(2 * sand("classic", 0.25));
    expect(sand("coupe", 0.25)).toBeGreaterThan(1.9 * sand("compact", 0.25));
    // A DESCENT IS NOT CHARGED — what going down a hill costs is brakes,
    // which is a different tyre and a different rule — but the weight still
    // MOVES, and forwards this time. So a rear-driver has less on its driven
    // axle going down than on the flat and a front-driver has more, which is
    // the same rule read the other way round and not an exception to it.
    const level = { rwd: sand("classic", 0), fwd: sand("compact", 0) };
    expect(sand("classic", -0.25)).toBeLessThan(level.rwd);
    expect(sand("compact", -0.25)).toBeGreaterThan(level.fwd);
    // ...and neither is charged the climb's cut, so both stay above what
    // the same gradient uphill leaves them.
    expect(sand("classic", -0.25)).toBeGreaterThan(sand("classic", 0.25));
    expect(sand("compact", -0.25)).toBeGreaterThan(sand("compact", 0.25));
  });

  it("digs a two-wheel drive into a climb and drives a four-wheel one up it", () => {
    // The behaviour all of the above is for, measured on the real engine:
    // full throttle from a standstill up a sand grade, how lit the driven
    // axle gets. The four-wheel drive barely spins at any gradient a stage
    // can build; both two-wheel drives spin from the start and spin WORSE
    // the steeper it gets.
    const dig = (carId: string, grade: number): number => {
      const base = compileTrack(0, STRAIGHT);
      const state = createGame({
        seed: 0,
        carId,
        skipCountdown: true,
        quiet: true,
        track: {
          ...base,
          width: 400,
          samples: base.samples.map((s) => ({
            ...s,
            surface: "sand" as const,
            bank: 0,
            elevation: s.s * grade,
            slope: grade,
          })),
        },
      });
      let peak = 0;
      for (let i = 0; i < Math.round(6 / TUNING.dt); i++) {
        step(state, { ...NEUTRAL_INPUT, throttle: 1 });
        peak = Math.max(peak, state.car.wheelspin);
      }
      return peak;
    };
    for (const grade of [0, 0.25]) {
      expect(dig("coupe", grade)).toBeLessThan(dig("compact", grade));
      expect(dig("coupe", grade)).toBeLessThan(dig("classic", grade));
    }
    // The hill is what separates them: a front-driver loses more of its
    // traction to a climb than a rear-driver does, because the weight it
    // needs is leaving the axle that drives it.
    const worse = (carId: string): number => dig(carId, 0.35) / dig(carId, 0);
    expect(worse("compact")).toBeGreaterThan(worse("classic"));
  });

  it("puts the slide's speed floor where the layout can reach it", () => {
    // The floor under the whole slide is the drivetrain's. The rear-driver's
    // sits at walking pace, which is the only reason its tail-out above
    // registers at all.
    // The floor is a RAMP `slideSpan` wide, so a layout that is meant to
    // slide at a given speed needs its floor that much below it — a floor
    // sitting exactly at walking pace leaves the slide 1% open there.
    const floor = (drive: "fwd" | "rwd" | "awd"): number =>
      TUNING.drift.slideFrom * TUNING.drivetrain[drive].driftFloor;
    expect(floor("rwd") + TUNING.drift.slideSpan).toBeLessThan(2.8);
    // ...and it is the ONLY exception: the game's floor is a rule the
    // player is told, so the other two sit exactly on it.
    expect(floor("fwd")).toBe(TUNING.drift.slideFrom);
    expect(floor("awd")).toBe(TUNING.drift.slideFrom);
  });
});
