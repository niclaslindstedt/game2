// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHEN THE RUN GOES WRONG, and what it costs to put it right. A car can
// leave the stage in five different ways — off into the country, into the
// water, onto its roof, wedged against something solid, or pointed back up
// the road it came down — and each has its own grace period, its own
// warning, and its own way back. The rules for all of them are here; the
// step that notices is `step.ts`'s.

import { type Underfoot } from "../mapgen/index.ts";
import { TUNING } from "./defs/tuning.ts";
import { plant, seatOn } from "./ground.ts";
import {
  locatePoint,
  lastCheckpoint,
  stageDirection,
  wayHome,
  type TrackPoint,
  type WayHome,
} from "./track.ts";
import {
  NEUTRAL_INPUT,
  stillCar,
  updateSlip,
  type CarInput,
  type GameEvent,
  type GameState,
} from "./state.ts";
import { healCar } from "./car-state.ts";

const T = TUNING;

/** What the car is driving on when it is not on the stage road: water it
 * has waded into, one of the branches the route abandons at its junctions
 * (R17), or plain nature. A spur is a REAL road, sealed or graded, and it
 * keeps its own surface here: collapsing a gravel branch into `nature`
 * gives a car driving down a drawn gravel road a field's grip, a field's
 * speed cap, and a rooster tail of torn grass. */
export function offRoadSurface(state: GameState, x: number, z: number): Underfoot {
  if (state.terrain.waterAt(x, z) !== null) return "water";
  // R48 — a body the cold has frozen solid is a floor, and the floor has
  // less to hold with than anything else the car can be on (climate.ts).
  // Asked before the spur and before the blanket: a lake is not a road,
  // and the snow does not lie on it.
  if (state.terrain.iceAt(x, z) !== null) return "ice";
  const spur = state.terrain.spurSurfaceAt(x, z);
  if (spur !== null) return spur;
  // The open country under a winter's blanket is deep snow, not turf
  // (climate.ts) — from where the blanket is more than a dusting.
  return state.terrain.blanketAt(x, z) > 0.1 ? "snowfield" : "nature";
}

/** Put the car back on the road at `home`, and wind progress back with it:
 * the road between there and wherever the car got to is road the run has to
 * drive again, and leaving progress out there would credit it twice and
 * hand the ghost gap a jump it never drove.
 *
 * WHICH place that is says what happened. A drowning and a press of the
 * reset button are both the run being GIVEN UP on, so they cost the road
 * back to the last split board (R28) — which is the whole reason the boards
 * sit just past the corners worth being sent back through. The wedge rescue
 * is neither: nobody asked for it, the car is pinned against a trunk
 * through no decision of the driver's, and a rescue that costs a checkpoint
 * would put the car back at a board it has already proved it can drive from
 * into the same trunk, forever. That one goes to the road where the car
 * stands, exactly as it always has. */
export function respawn(state: GameState, events: GameEvent[], home: WayHome, whole = false): void {
  const car = state.car;
  car.x = home.x;
  car.z = home.z;
  car.y = home.y;
  car.heading = home.heading;
  stillCar(car);
  plant(car, state.terrain.groundAt);
  car.u = T.offTrack.respawnSpeed;
  // WHAT THE CREW HAND BACK. A car set down where it started with the whole
  // run still in front of it is handed the car that left the line: an
  // attempt that has driven nothing carries nothing out of the lake with it
  // (`whole`, decided by `sendBack`). Anywhere else they only ever get to a
  // WRECK — the chassis is patched to a drivable fraction, and the dents,
  // the torn-off parts and the hurt systems all stay.
  if (whole) {
    healCar(car);
    events.push({ type: "repair" });
  } else if (car.damage.wear >= 1) {
    car.damage.wear = T.collision.repairTo;
  }
  // ...and the car has been standing while they did it, so the needle is
  // back off the line. The coolant is still on the road, which is why this
  // is a reprieve and not a repair: a holed core climbs straight back.
  car.heat = 0;
  car.heatCall = 0;
  state.drowning = null;
  state.overturned = null;
  state.progressIndex = home.index;
  state.nearIndex = home.index;
  state.progressS = state.track.samples[home.index].s;
  state.cheeredS = state.progressS;
  state.offRoad = false;
  // A respawn sets the car down facing down the stage, so whatever the
  // TURN AROUND sign was telling the driver has been done for them — and
  // its search cursor goes with the car, the one move on the stage that no
  // amount of local searching could follow.
  state.wrongWay = false;
  state.wrongWayFor = 0;
  state.wrongWayAt = home.index;
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

/** R28 — THE RUN GIVEN UP ON: a drowning, a car left lying on its roof, or
 * the reset button. All three cost the road back to the last split board,
 * and all three land here so they cost it the same way.
 *
 * WHILE THE RUN HAS TAKEN NO BOARD AT ALL — the first lap, before the first
 * one — that board is the START LINE, and being put back on it is not a
 * penalty inside a run: it is the run beginning again with nothing behind
 * it. So the car begins again too, whole, exactly as pressing RESTART hands
 * over a fresh one. A later lap of a circuit crosses the same line with a
 * lap already driven, which is why the lap is asked about as well: a free
 * rebuild every time round would be the cheapest way to drive a circuit. */
export function sendBack(state: GameState, events: GameEvent[]): void {
  const fromTheLine = state.checkpointsPassed === 0 && state.lap === 1;
  respawn(state, events, lastCheckpoint(state), fromTheLine);
}

/** The water has the car. It is a crash the moment it goes in — the entry
 * costs the run whatever happens next — but the car is not lifted off the
 * lake until it has gone down: `stepDrowning` owns the seconds in between,
 * and the respawn is at the far end of them. The far end is not the only
 * end: a car whose entry carries it back onto a bank drives out instead
 * (`beach`), and pays only the seconds it spent swimming. */
export function drown(state: GameState, events: GameEvent[], waterY: number): void {
  const car = state.car;
  state.stats.crashes += 1;
  events.push({ type: "crash" });
  state.drowning = { since: state.t, waterY, under: false };
  // Whatever the entry was — a wade off the verge or a plunge off a deck —
  // it is a swim from here: the springs, the slide and the flight all stop
  // being things that are happening to this car.
  car.airborne = false;
  car.settling = false;
  car.airTime = 0;
  car.loft = 0;
  car.loftRate = 0;
  car.drifting = false;
  car.chain = 0;
  car.spun = false;
  car.rolling = false;
  car.sliding = false;
  car.slide = 0;
  car.braking = false;
  car.locked = false;
  car.reversing = false;
  // A body arriving fast enough to reach the bed before it has floated at
  // all skips the whole beat, so the water is allowed to swallow only so
  // much of a plunge — and none of a bounce. A car that arrives off a bank
  // still RISING keeps that climb through the entry otherwise, and the
  // buoyancy spring pays it straight back as a dip: the hull ducks under
  // its own waterline on a moment the water should have taken.
  car.vy = Math.min(0, Math.max(car.vy, -T.crash.drown.plunge));
}

/** Is the car over ground it could drive away from? Measured as the water
 * standing over the GROUND, not over the car: a drowning hull is being held
 * at its waterline, so asking how deep the water is over the body would
 * answer "deep" on a car sitting on a beach with its wheels in a puddle.
 * The bar is `crash.deepWater` less `drown.shallows` — under the one that
 * put the car in, so a hull bobbing on that bar cannot beach and drown
 * again on alternate steps. */
export function aground(state: GameState): boolean {
  const car = state.car;
  const water = state.terrain.waterAt(car.x, car.z);
  if (water === null) return true;
  return water - state.terrain.groundAt(car.x, car.z) <= T.crash.deepWater - T.crash.drown.shallows;
}

/** The car drives itself out. No respawn and no checkpoint to pay: the run
 * is exactly where the car left it, wet and pointing wherever the water
 * swung it. What this owes is a car the driving model can take back — the
 * wheels on the ground rather than on a waterline that is now behind it,
 * and the wedge clock re-anchored where it stands, or the two seconds it
 * takes to crawl off a beach look to that rule like a car pinned against a
 * trunk. */
export function beach(state: GameState, events: GameEvent[]): void {
  const car = state.car;
  const terrain = state.terrain;
  state.drowning = null;
  car.y = seatOn(car, terrain.groundAt(car.x, car.z), terrain.groundAt);
  car.vy = 0;
  car.wheelVy = 0;
  plant(car, terrain.groundAt);
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  // A shallow splash, not the deep one: this is the car heaving itself out
  // rather than the water closing over it, and the beat needs a sound or
  // the run simply resumes as though nothing had it.
  events.push({ type: "splash", speed: Math.abs(car.u), deep: false });
}

/** What the water leaves of the car's YAW after one step.
 *
 * Water resists with the SQUARE of the rate through it, so the constant it
 * takes a rotation over is not a constant: a hull that arrives spinning is
 * stopped in a fraction of the time a drifting one is. Written as a plain
 * `exp(-dt/slewIn)` it is linear drag, which takes the same FRACTION per
 * second however violent the spin is — and that is what carried a car
 * landing in a lake through two full turns before it settled. The whole
 * five seconds is a fixed 2.16 x the entry rate however fast the car came
 * in, so an airborne arrival at `drift.overYaw` simply spun, and the water
 * read as not being there at all.
 *
 * The square term is bounded rather than punitive: it is the difference
 * between a car the lake grabs and a car the lake ignores, and past about
 * `slewAbove` the swing a float wants is untouched. */
export function spinDrag(yawRate: number, slewIn: number, above: number): number {
  return Math.exp((-T.dt / slewIn) * (1 + Math.abs(yawRate) / above));
}

/** One step of a car going down. Nothing else in the run advances while
 * this is running — no progress, no surface, no wedge clock, and no input:
 * the seconds ARE the penalty, and a driver who could steer out of them
 * would not be paying it. Unless the car drives itself out — see `beach`. */
export function stepDrowning(state: GameState, events: GameEvent[]): void {
  const car = state.car;
  const d = state.drowning as NonNullable<GameState["drowning"]>;
  const D = T.crash.drown;
  const age = state.t - d.since;

  // The water takes the momentum, but not instantly: the car carries its
  // entry line a few metres into the lake, and keeps swinging on its yaw
  // long after it has stopped going anywhere. The TRAVEL decays over a flat
  // constant — that carry is the entry the car is allowed to wade back out
  // on (`beach`), and it is short enough already. The YAW does not: see
  // `spinDrag`.
  car.u *= Math.exp(-T.dt / D.stopIn);
  car.w *= Math.exp(-T.dt / D.stopIn);
  car.yawRate *= spinDrag(car.yawRate, D.slewIn, D.slewAbove);
  car.heading += car.yawRate * T.dt;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  car.x += (sinH * car.u + cosH * car.w) * T.dt;
  car.z += (cosH * car.u - sinH * car.w) * T.dt;
  updateSlip(car);

  // ...and that line is the car's one way out. A lake has a shore, a river
  // has a far bank, and an entry taken at pace can carry the car up one
  // before the water has it: a hull that reaches ground it could drive
  // from was WADING, and the run goes on. Only while it still floats —
  // past that the water is already taking it down and there is nothing
  // left to drive with. Checked before the depth maths below, which is
  // what would otherwise pull a car standing on a beach down to a
  // waterline metres out from under it and bury it in the bank.
  if (age < D.float && aground(state)) {
    beach(state, events);
    return;
  }

  // Where the hull wants to sit. For the first `float` seconds that is its
  // waterline; after it, the waterline itself walks down to the bed and
  // takes the car with it. Smoothstepped, so the water starts winning
  // gradually rather than the car dropping on a cue.
  const going = Math.min(1, Math.max(0, (age - D.float) / (D.duration - D.float)));
  const gone = going * going * (3 - 2 * going);
  // Both halves are held off the LAND. The float rides the waterline or the
  // ground under it, whichever is higher — a car carrying its entry up a
  // shoal rides the shoal, and holding it at a waterline half a metre
  // inside that is the hull sinking through the beach rather than into the
  // lake. It is also what makes the hand-back a step rather than a jump:
  // by the time the car is aground it is already standing at the height it
  // will drive away from.
  const ground = state.terrain.groundAt(car.x, car.z);
  const afloat = Math.max(d.waterY - D.draft, ground);
  // ...and the sink can only go as deep as there is water: a shallow tarn
  // is a car settled on the bottom with its roof awash, not a car sinking
  // through the landscape.
  const bottom = Math.max(ground - D.draft, d.waterY - D.depth);
  const rest = (1 - gone) * afloat + gone * bottom;

  // Buoyancy, as an underdamped spring: the entry is swallowed, the hull
  // corks back up past its waterline, and the rocking dies out over the
  // float. That bob is the whole difference between a car settling in a
  // lake and a car waiting on a timer.
  car.vy += (rest - car.y) * D.buoyancy * T.dt;
  car.vy -= car.vy * Math.min(1, D.damping * T.dt);
  car.y += car.vy * T.dt;

  // The attitude forgets the crash and takes the water's: level while it
  // floats, rocking as it settles, nose down once the heavy end starts to
  // go. The springs unload — nothing is standing on them any more.
  const follow = Math.min(1, D.settle * T.dt);
  const swell = D.rock * Math.exp(-age / D.calm) * Math.sin(age * D.rockRate);
  car.roll += (swell - car.roll) * follow;
  car.rollRate = 0;
  car.pitch += (-D.noseDown * gone - car.pitch) * follow;
  car.ride += (0 - car.ride) * follow;
  car.rideRate = 0;
  car.pitchLoad += (0 - car.pitchLoad) * follow;

  // The gulp: the water closing over the roof for good. Not the entry —
  // a fast plunge ducks the whole car under on the way in and corks it
  // straight back up, and calling that the sinking spends the moment
  // three seconds before the car actually goes.
  if (!d.under && gone > 0 && car.y + D.roof <= d.waterY) {
    d.under = true;
    events.push({ type: "sink" });
  }

  if (age >= D.duration) sendBack(state, events);
}

/** ON ITS ROOF. The roll is over and the car is lying on a face of itself
 * that is not its wheels, which — unlike every other way a run goes wrong
 * — is not something a driver can work out of: there is no tyre on the
 * ground, so the throttle, the wheel and the lever all reach nothing. So
 * the beat is simply looked at, and then the crew are put back at the last
 * split board (R28) exactly as a drowning does.
 *
 * The car is left EXACTLY as the roll left it: nothing settles it further,
 * nothing rocks it, and nothing rights it. What is on the screen for these
 * seconds is the pose the physics chose.
 *
 * This is also how the RIVALS behave, without a line of their own: every
 * car in the field is stepped through here (sim/field.ts), so a crew that
 * rolls out is back at their own last board a beat later and drives the
 * rest of the stage from it. */
export function stepOverturned(state: GameState, events: GameEvent[]): void {
  const lying = state.overturned as NonNullable<GameState["overturned"]>;
  if (state.t - lying.since < T.air.roll.lieFor) return;
  sendBack(state, events);
}

/** The wedge check: a car pinned against a trunk with the throttle buried
 * is not driving out of it, and since nothing else brings a car home any
 * more, this is the one thing that does. The anchor moves whenever the car
 * covers real ground, so only genuinely going nowhere accumulates. */
export function stepStuck(state: GameState, input: CarInput, events: GameEvent[]): void {
  const car = state.car;
  // Backing out counts as asking. A car pinned against a trunk in front and
  // a boulder behind is the wedge this rescue exists for, and a driver — or
  // a bot — working the brake to get out of it must not stop the clock by
  // trying: without this the reverse attempt is unbounded.
  const asking = (input.throttle > 0.5 || car.reversing) && !car.airborne;
  // The distance is only ever needed to decide whether a car that IS asking
  // has got anywhere, so a car that is not asking never measures it.
  if (
    !asking ||
    Math.hypot(car.x - state.stuck.x, car.z - state.stuck.z) > T.offTrack.stuck.radius
  ) {
    state.stuck.x = car.x;
    state.stuck.z = car.z;
    state.stuck.since = state.t;
  } else if (state.t - state.stuck.since >= T.offTrack.stuck.after) {
    respawn(state, events, wayHome(state));
  }
}

/** THE TURN AROUND SIGN: the car is on the road and driving down it the
 * wrong way. Both halves of `stageDirection` have to agree before the dwell
 * timer even starts — a spin and a reverse out of a ditch each satisfy one
 * of them, and neither is a driver who has set off back up the stage.
 *
 * Off the road there is no direction to be wrong about, and the guidance
 * that is owed there is the way home instead: a car picking its way back
 * across a clearing is pointed wherever the ground lets it be pointed.
 *
 * Coming OFF is not the same threshold as coming on. TURN AROUND is an
 * instruction, and the one thing that carries it out is the nose coming
 * back round (`wrongWay.back`) — stopping does not, and neither does
 * swinging the nose just inside the angle the sign came up at, which on a
 * narrow road is a three-point turn strobing the sign at every shuffle.
 *
 * It takes its own fix whenever the car has dropped behind its progress,
 * because the run's fix cannot follow it there: that one hunts from
 * `progressIndex`, which only climbs, and its search reaches fifteen
 * samples back — so a car more than thirty metres down the road it came up
 * is pinned to the far end of that window, reading the heading of a corner
 * it is nowhere near and reported off a road it is squarely on. The extra
 * search costs a car at its own progress nothing, which is every step of a
 * run that never doubles back. */
export function stepWrongWay(state: GameState, fix: TrackPoint): void {
  const W = T.wrongWay;
  const car = state.car;
  const here =
    fix.index < state.progressIndex
      ? locatePoint(state.track, car.x, car.z, state.wrongWayAt)
      : fix;
  state.wrongWayAt = here.index;
  const { facing, along } = stageDirection(state, here.index);
  if (state.wrongWay) {
    if (facing < W.back) {
      state.wrongWay = false;
      state.wrongWayFor = 0;
    }
    return;
  }
  const backwards =
    state.phase === "racing" && !here.offRoad && facing > W.away && along < -W.speed;
  state.wrongWayFor = backwards ? state.wrongWayFor + T.dt : 0;
  if (state.wrongWayFor >= W.after) state.wrongWay = true;
}

/** R25 — how a car is driven once the clock has stopped. The player is out
 * of the loop from the moment the nose crosses the line, so the roll-out is
 * driven by the stage instead: off the throttle, easing onto the brakes
 * rather than standing on them (a car that stops dead at the gate never
 * looks like it CROSSED anything), and steering back toward the middle of
 * the road it is on so a car that arrived sideways straightens up and
 * coasts rather than driving off into the trees while nobody is at the
 * wheel. Deterministic: it reads the state and nothing else. */
export function rollOutInput(state: GameState): CarInput {
  const roll = T.rollOut;
  // Half the road's width is the whole correction — enough to gather a car
  // that crossed the line off-line, gentle enough that it is a driver
  // straightening up and not a rail.
  const wanted = -state.lateral / (state.track.width * 0.5);
  return {
    ...NEUTRAL_INPUT,
    steer: Math.max(-roll.steer, Math.min(roll.steer, wanted * roll.steer)),
    brake: Math.min(1, state.rollout / roll.brakeRamp) * roll.brake,
  };
}
