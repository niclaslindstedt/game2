// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LANDING YOU CAN STILL SAVE.
//
// A car that comes down crossed up is a car whose tyres bite while the body
// is still going sideways: the bottom stops and the top does not, and it goes
// over its outside wheels. How hard they bite used to be one number times the
// surface, so the whole of a crossed-up landing was decided by the sideways
// speed the flight happened to end with, and nothing the driver did between
// the lip and the ground could change it by a thousandth of a radian.
//
// It is now three things, and every one of them is committed IN THE AIR —
// the lock is already wound on when the rubber touches, the pedal is already
// pressed, and the attitude that decides how hard the car arrives was set
// over the lip. That is what makes the moment skill rather than a dice roll,
// and these tests hold it to the four claims that make it one: the hands
// change the outcome, the sign of the hands is the rally answer and not its
// opposite, the pedals change it through the friction circle, and the save is
// never free.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  compileTrack,
  createGame,
  step,
  updateSlip,
  type CarInput,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STAGE: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

/** ONE CROSSED-UP LANDING, staged at the instant the tyres touch.
 *
 * ONE STEP of flight, deliberately. Flying the car to its own landing varies
 * four things at once — a bigger throw is also a longer flight, and a flight
 * is a second of turbulence, of air drag on the nose, and of yaw authority
 * carrying the car off the road onto ground at a different height. Measured
 * that way a harder arrival came down SOFTER than a gentle one and a full
 * lock landed a second later somewhere else entirely, and neither number was
 * about the trip at all. So the car is put one step above the ground with the
 * descent it is arriving at and the lock the flight has already wound on, and
 * the step that follows is the bite and nothing else.
 *
 * `car.steer` is the RACK, and setting it is not a cheat: it is where a
 * driver who committed over the lip has the wheel by the time the rubber
 * touches, which is the whole point — a rack crossing from lock to lock takes
 * longer than most landings, so the input that matters was given in the air.
 *
 * The slide is to the car's RIGHT (`across` positive), so the right wheels
 * dig in and the body goes over them: negative roll. Steering right is the
 * catch, steering left is the mistake. Nothing about that is written down
 * anywhere in the model — it falls out of the sign of the lock against the
 * sign of the slide — which is exactly why it is worth a test. */
type Landing = { state: GameState; bite: number };

function landCrossed(
  input: Partial<CarInput>,
  { across = 11, drop = 6 }: { across?: number; drop?: number } = {},
): Landing {
  const state = createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  // The crash and nothing else. A body thrown off the road tumbles through
  // whatever is standing there, and a trunk it snaps costs it twenty metres a
  // second in one step — any measurement of what the DRIVER is worth has to
  // sweep the scenery out of the way first.
  state.terrain.obstaclesNear = () => [];
  state.terrain.treesNear = () => [];
  const car = state.car;
  car.airborne = true;
  car.y = state.terrain.groundAt(car.x, car.z) + 0.02;
  car.vy = -drop;
  car.u = 28;
  car.w = across;
  car.steer = input.steer ?? 0;
  updateSlip(car);
  const before = car.rollRate;
  step(state, { ...NEUTRAL_INPUT, ...input });
  return { state, bite: Math.abs(car.rollRate - before) };
}

/** How hard the trip hit the body, rad/s. Unsigned: a bigger number is always
 * a worse landing, whichever side it went over. */
const tripped = (landing: Landing): number => landing.bite;

describe("the trip, and what the driver can do about it", () => {
  it("puts less roll in when the wheel is pointed along the travel", () => {
    // THE CATCH. Aim the front tyres where the car is actually going and they
    // stop refusing to go there: they roll, they make no lateral force, and
    // the front axle's share of the moment goes with them.
    const caught = tripped(landCrossed({ steer: 1 }));
    const coasted = tripped(landCrossed({}));
    expect(caught).toBeLessThan(coasted * 0.85);
    // ...AND THE WHEEL CAN BE OVERDONE, which nobody wrote down either. The
    // best catch points the fronts exactly along the travel, so a full lock
    // into a slide shallower than the lock is past the mark and the front
    // tyres are refusing again on the other side of it. This landing slides
    // at about 21° and full lock is 31°: half of it is the better save, and
    // a player who learns that has learned something true.
    expect(tripped(landCrossed({ steer: 0.5 }))).toBeLessThan(caught);
  });

  it("...and more when it is pointed the other way", () => {
    // THE MISTAKE, and it has to be a mistake: a model where any lock at all
    // helped would teach the player to saw at the wheel, and one where the
    // sign did not matter would teach them nothing.
    expect(tripped(landCrossed({ steer: -1 }))).toBeGreaterThan(tripped(landCrossed({})));
  });

  it("puts less roll in when the tyres are already spending their budget", () => {
    // THE FRICTION CIRCLE. A tyre has one budget and the trip is that budget
    // spent sideways; a pedal takes its share along the car first, and the
    // bite gets what is left of the circle. Both pedals, because the circle
    // does not care which end of it is being asked for.
    const coasted = tripped(landCrossed({}));
    expect(tripped(landCrossed({ brake: 1 }))).toBeLessThan(coasted);
    expect(tripped(landCrossed({ throttle: 1 }))).toBeLessThan(coasted);
    expect(tripped(landCrossed({ handbrake: true }))).toBeLessThan(coasted);
  });

  it("...and the save is never free", () => {
    // THE PRICE, and the reason the brake is not simply the right answer to
    // every landing: rubber that is not gripping is not scrubbing the
    // sideways speed off either. The car that talked its way out of the roll
    // is still travelling sideways, into whatever is next.
    const saved = landCrossed({ brake: 1 });
    const coasted = landCrossed({});
    expect(tripped(saved)).toBeLessThan(tripped(coasted));
    expect(Math.abs(saved.state.car.w)).toBeGreaterThan(Math.abs(coasted.state.car.w));
  });

  it("puts more roll in when the car arrives HARD", () => {
    // THE ARRIVAL. The moment is the lateral force times the weight's height
    // and the force is what the load will pay for, so a car that slams down
    // loads its tyres past its own weight while the springs are taking it,
    // and bites that much harder. Getting the car flat and level in the air
    // is not decoration.
    const slammed = tripped(landCrossed({}, { drop: 6 }));
    const settled = tripped(landCrossed({}, { drop: 3 }));
    expect(settled).toBeGreaterThan(0); // both actually landed
    expect(slammed).toBeGreaterThan(settled);
    // ...and it stops at the slam the springs call a full one: past that the
    // suspension is bottomed and there is no more load to find.
    expect(tripped(landCrossed({}, { drop: 12 }))).toBeCloseTo(slammed, 5);
  });

  it("is the difference between driving on and going over", () => {
    // The whole point, at a landing sat right on the line: the same car, the
    // same flight, the same sideways speed — caught, it drives away; sawed
    // the wrong way, it is on its roof. If this ever stops being true the
    // knobs have drifted until the moment is decided before the driver
    // reaches it, which is the failure the whole group exists to prevent.
    expect(landCrossed({ steer: 1, brake: 1 }, { across: 16 }).state.car.rolling).toBe(false);
    expect(landCrossed({ steer: -1 }, { across: 16 }).state.car.rolling).toBe(true);
  });
});
