// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The handling model — one grounded step and one airborne step of the car.
// There is no drift MODE here: a slide is simply a turn the tires cannot
// pay for, so the car rotates further than the road bends and the gravel
// starts flying. The tires REDIRECT the car rather than braking it, which
// is why going sideways costs pace but is never felt as a handbrake. The
// other two moments: the jump (the lip throws you, the air is committed —
// velocity is fixed, the nose barely answers) and the landing (aligned
// keeps your speed, sideways scrubs it and wobbles). Under all three the
// SPRINGS carry the body: the wheels track the ground exactly, the body
// lags them, and every dip, landing and bank is a jolt it squats through
// and rebounds out of — the car's weight, made visible. Numbers live in
// defs/, not here.

import { clamp } from "../lib/math.ts";
import { askedSlide, latCeiling, slideFloor, surfaceGripFor } from "./limits.ts";
import { damageEffects } from "./damage.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  rollTilt,
  rotateFrame,
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";
import { groundPull, settlePitch, stepSuspension, tyreLoad } from "./body.ts";
import { landingDamage } from "./collision.ts";
import { readDrift, slideFactor } from "./drift.ts";
import {
  engineAccel,
  revs,
  settleLaunchSpin,
  settleWheelspin,
  stepGearbox,
  wheelspinShare,
} from "./drivetrain.ts";
import { rideGround } from "./flight.ts";
import { groundJolt, type GroundContext } from "./ground.ts";
import {
  beginRoll,
  goesOver,
  goesOverEnd,
  leanTorque,
  massSpread,
  onItsWheels,
  rollBed,
} from "./roll.ts";

export { clutchDump, spinHeadroom } from "./drivetrain.ts";
export { launch, stepAirborne } from "./flight.ts";
export { tyreLoad } from "./body.ts";
export type { GroundContext } from "./ground.ts";

const T = TUNING;
/** The drift group, used on nearly every line below. */
const D = TUNING.drift;

/** One grounded physics step. Returns events emitted this step. */
export function stepGrounded(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const prevVy = car.vy;
  const prevWheelVy = car.wheelVy;
  const prevU = car.u;
  // WHAT THE GROUND IS DOING TO THE WEIGHT ON THE TIRES, before anything
  // spends it. The shape under the car's path either lifts weight off it or
  // presses weight on, and everything below that asks what the tires hold
  // has to see the answer — so this comes first, off the pace and the
  // ground the step is starting from.
  //
  // It EASES rather than arriving: the load takes a beat to reach the
  // contact patch, and the lag is also what keeps the seam between two
  // ground models — the road's corridor and the open lattice beside it —
  // from reading as a step in the grip when a car crosses it.
  {
    const S = T.suspension;
    const pull = groundPull(ctx.roadCurve, Math.hypot(car.u, car.w));
    const want = clamp(1 - (S.weightGain * pull) / T.air.gravity, S.weightFloor, S.weightCeil);
    car.weight += (want - car.weight) * clamp(S.weightRate * dt, 0, 1);
  }
  // The surface and the car's own rubber, as one number: the slide's
  // ceiling, the lateral rate and how much torque the driven axle can put
  // down all read it, so the tires are felt in all three.
  //
  // ...times how much of the car is actually STANDING on them, which for
  // the half second after a landing is not all of it. It multiplies in HERE
  // rather than inside `surfaceGripFor`, and the reason is who else reads
  // that: the bot quotes every corner it plans against it, and nobody plans
  // around a landing — what a car of this kind holds on this surface is a
  // standing fact, and what THIS car has under it right now is not. From
  // this one line the slide threshold, the redirect rate, the traction
  // ceiling and the driven axle's bite all go light together, which is why
  // a landing unsticks the car instead of playing an animation at it.
  const surfaceGrip = surfaceGripFor(spec, ctx.surface) * tyreLoad(car);
  const surfaceDrag = T.surfaces.drag[ctx.surface];
  const surfacePower = T.surfaces.power[ctx.surface];
  // Everything the crashes have done, as the multipliers the rest of this
  // function drives through (damage.ts). Read once, never written back:
  // collision.ts owns the ledger, the handling model only spends it.
  const hurt = damageEffects(car, Math.abs(car.u), ctx.t);
  /** Which wheels this car drives — the row every line below reads. */
  const DR = T.drivetrain[spec.drive];

  // The rack, and the hands on it, have weight: the lock EASES toward what
  // the driver is asking for instead of arriving in one tick. Everything
  // below reads `car.steer` rather than the raw input — the lag has to be
  // upstream of the whole model, or the slide would be commanded off a lock
  // the front wheels have not reached yet.
  // The rack's own SPEED — how fast the hands are moving, which is a
  // different thing from where they have got to, and the only thing a
  // flick is made of. Read BEFORE the lock moves: the throw belongs to the
  // wheel crossing the car, not to where it ends up.
  const rackVel = (input.steer - car.steer) * T.steering.rackRate;
  const crossing = clamp(-(input.steer * car.steer) / T.steering.flickCross, 0, 1);
  const thrown = crossing * clamp(Math.abs(rackVel) / T.steering.flickRate, 0, 1);
  // The throw takes time to cross the car and time to come back, so it is
  // HELD rather than read off the rack each step — see flickSettle.
  car.flick = Math.max(thrown, car.flick - T.steering.flickSettle * dt);
  // The weight moving forward off the driven axle, chasing the pedal at the
  // rate the mass actually travels. See `CarState.lift`.
  const wasLifted = car.lift;
  car.lift += (1 - input.throttle - car.lift) * clamp(T.grip.liftSettle * dt, 0, 1);
  /** THE BOOT, 0..1 — how hard the power is coming back on, read off the rate
   * the weight is moving back onto the driven axle. A stab off a closed
   * throttle tops this out; a throttle already open cannot move it at all. */
  const boot = clamp((wasLifted - car.lift) / (T.grip.liftSettle * dt), 0, 1);
  const flick = car.flick;
  // Which way the mass was sent. Latched with the load: by the time the
  // tires feel it the rack has long since arrived, and the lock's own sign
  // would throw the car back the way it came.
  if (thrown > 0) car.flickDir = Math.sign(rackVel);
  car.steer += (input.steer - car.steer) * clamp(T.steering.rackRate * dt, 0, 1);
  // THE PULL: a body folded harder down one side drags that way, and the
  // driver holds a correction into it for the rest of the stage. It goes on
  // the lock the TIRES see, not on `car.steer` — that is where the driver's
  // hands are, and the rack would ease the pull away as fast as it appeared.
  const steer = clamp(car.steer + hurt.pull, -1, 1);
  // Brake lights, so only a car being SLOWED lights them — a car backing out
  // of a ditch is under power, not under the brake.
  car.braking = input.brake > 0.2 && car.u > 3;
  // THE LEVER, as much of it as the car still has: one cable to the rear,
  // and a cut brake line takes most of it (damage.ts). Every place below
  // that used to ask whether the handbrake is pulled asks how much of it
  // is doing anything instead, so a broken lever is a weak one, not a
  // switch that is either there or not.
  const lever = input.handbrake ? hurt.lever : 0;
  // ...and the rear wheels dragged rather than rolled, which is a different
  // question from the pedal and from the angle both. See `CarState.locked`.
  car.locked = lever > 0.5 && car.u > 3;
  // The weight the BRAKE pitches onto the nose, on the same lag as the lift
  // and for the same reason. Only while the pedal is actually slowing the
  // car: backing out of a ditch on the same pedal loads nothing, and neither
  // does a car already stopped. See `CarState.brakeLoad`.
  const braked = car.u > T.reverse.engageBelow ? input.brake : 0;
  car.brakeLoad += (braked - car.brakeLoad) * clamp(T.grip.liftSettle * dt, 0, 1);
  // Which of its two jobs the brake pedal is doing this tick: it slows a car
  // that is still rolling forward, and once it has stopped one the same pedal
  // backs it out. Throttle always wins — gas is the way out of reverse, with
  // no gear to select first.
  //
  // The manoeuvre LATCHES, and stays latched through the pedal coming up
  // until the car is back at a stop. That is what separates "the driver put
  // this car in reverse" from "something threw it backwards": a rebound off a
  // cliff face is also negative `u`, and it belongs to the collision, which
  // gets to keep every bit of it.
  // AND IT NEEDS AN ENGINE. Reverse is the one place the drivetrain is
  // asked for a shove outside the throttle path, so it is the one place a
  // dead motor can be forgotten about: without this gate a car whose engine
  // has seized backs itself out of the trees at full pace, which is the
  // whole of "engine dead" meaning nothing.
  car.reversing =
    input.throttle === 0 &&
    hurt.power > 0 &&
    (input.brake > 0 ? car.u <= T.reverse.engageBelow : car.reversing && car.u < -T.standstill);

  stepGearbox(spec, car, input, ctx.t, hurt, events);

  // ── Yaw ──────────────────────────────────────────────────────────────────
  // Steering authority fades with speed (stability) and with standstill
  // (you cannot pivot a parked car). Once the tires give up, the car gets
  // extra rotation and the slip itself turns the nose — the tail leads and
  // you catch it on the counter — both fading in with the slide so that
  // grip and slide are one continuous response, not two modes.
  // Everything below reads the SPEED, not the signed velocity: a car rolling
  // backwards — reversing out of a ditch, or sliding back down a climb it
  // could not carry — is moving, and a wheel with no authority at all is how
  // you get stuck twice. Going backwards it answers the other way round,
  // which is `backwards` below, applied once to the lock.
  const speed = Math.abs(car.u);
  const backwards = car.u < 0 ? -1 : 1;
  const speedFactor = clamp(speed / T.steering.deadSpeed, 0, 1);
  // A bent rack answers late and short: steering damage bleeds authority.
  const rack = hurt.steering;
  // ...and how fast that authority bleeds off with speed is the car's own
  // composure: a stable car calms down at pace and is lazy to turn in with
  // it, a nervous one stays sharp and stays nervous. It is why a stage of
  // long fast sweepers and a stage of hairpins want different cars.
  const fadeSpeed = T.steering.fadeSpeed / spec.stability;
  // ...and how much of it reaches the road is the TIRES', because the front
  // wheels are what point the car and a front wheel can only pull as hard as
  // what it is standing on lets it. Without this term grip only ever took
  // things away: in the gripped range the yaw is `steer × steerGain` with no
  // surface in it at all, so every car in the roster held a WIDER line on
  // tarmac than on gravel at the same lock while arriving a third faster,
  // and the one surface a car should be quick on was a place to run wide.
  //
  // Measured against GRAVEL, not against an abstract 1: gravel is this
  // game's reference surface, and quoting the advantage against anything
  // else quietly hands every car a different wheel on the surface most of
  // the stage is made of. The car's own loose-surface rubber is what makes
  // that reference the car's own. Sub-linear (`steerGrip` under 1): a tire
  // with half again the grip does not hand the driver half again the yaw.
  //
  // Off the SURFACE's own grip and never `surfaceGrip`, which carries the
  // landing's transient load with it. What a road is worth to the rack is a
  // standing fact; what this car has under it half a second after touching
  // down is not, and folding the two together made a landing take the
  // steering away at the same moment it took the grip — which nets out as a
  // landed car sliding LESS than one on the flat.
  const bite = 1 + T.grip.steerGrip * (surfaceGripFor(spec, ctx.surface) / spec.tyres.loose - 1);
  const steerGain = (spec.steerRate / (1 + speed / fadeSpeed)) * speedFactor * rack * bite;
  const rev = revs(spec, car, speed);
  // The lateral grip the tires have to spend, and the turn the wheel is
  // asking them for: the handbrake unsticks the rear by lowering the
  // ceiling, so the same lock asks far more of what is left.
  // Written so a whole lever is EXACTLY `handbrakeGrip` and no lever is
  // exactly 1: `1 - (1 - g)` is not bit-equal to `g`, and the field's crews
  // are deterministic to the bit — a rounding of that size, applied to
  // every sound car on every step, is a different race.
  const leverGrip =
    lever >= 1 ? T.grip.handbrakeGrip : lever <= 0 ? 1 : 1 - (1 - T.grip.handbrakeGrip) * lever;
  const gripCeiling = spec.gripAccel * surfaceGrip * leverGrip;
  // Speed is not the only way to unstick a driven axle. At the bottom of the
  // gear a rear axle with real torque under it spins up under power and the
  // tail steps out at walking pace, where the wheel's own lateral ask is
  // almost nothing — which is how a rear-driver is drifted at 10 km/h and
  // why a front-driver, whose axle simply goes straight on when it lets go,
  // cannot be. It enters the SAME demand the wheel does, so the slow slide
  // IS the fast one: one model, one readout, one plume of dust.
  // ...and it is a LOW-SPEED effect, faded out by the same floor the slide
  // itself starts at: below that speed torque is the only thing that can
  // unstick an axle, above it the wheel's own lateral ask has long taken
  // over and a car still being thrown sideways by its own throttle in fifth
  // is not a rear-driver, it is a car nobody can keep on the road. Without
  // this the term fires at the bottom of EVERY gear, fifth included.
  const slow = clamp(1 - speed / D.slideFrom, 0, 1);
  const spinDemand =
    (T.grip.torqueSpin *
      DR.spin *
      spec.torque *
      input.throttle *
      Math.abs(steer) *
      (1 - rev) *
      slow *
      slow) /
    Math.max(0.5, surfaceGrip);
  // ...and the weight a FLICK throws across the car, which unsticks it with
  // no driven axle involved at all. It is a SPIKE — the hands are only
  // crossing for an instant — and the slide's own release is what carries
  // it through the corner afterwards, which is exactly how the move works:
  // the flick sets the angle up, the wheel then drives it.
  const flickDemand = flick * T.grip.flickThrow * DR.flick * speedFactor;
  // ...and the weight coming BACK, which is a driven axle being asked for
  // torque it has no grip left to spend. Enters the same demand the wheel
  // does, so booting it mid-corner is one more way of asking for the angle
  // rather than a mode of its own.
  const bootDemand = boot * T.grip.bootThrow * DR.spin * spec.torque * speedFactor;
  const demand =
    Math.abs(car.u * steer * steerGain) / gripCeiling + spinDemand + flickDemand + bootDemand;
  // WHAT A MOVE BUYS. `depth` is what the WHEEL alone can develop, and on
  // anything but a rear-driver that is deliberately not much — a front axle
  // out of grip washes wide, whatever else is happening. The three ways a
  // driver takes the weight off the rear lift that ceiling toward the
  // reference slide: the mass thrown by a flick, the nose pitched down on a
  // trailed brake, and the rear wheels locked outright. The largest one
  // wins rather than the sum — they are all the same axle letting go, and a
  // driver doing two at once is not owed twice the angle for it.
  const asking = Math.max(
    lever * D.leverDepth,
    flick * D.flickDepth,
    car.brakeLoad * D.brakeDepth * DR.brake,
  );
  // ...and it is HELD once made. The lever comes up in one tick and the
  // weight it moved does not, so a raw reading would collapse the slide the
  // car is allowed in a single step — and the exit's spring, which is sized
  // off exactly that collapse, would fire mid-corner with the lock still on
  // and stand a hairpin's pivot straight up. See `CarState.provoked`.
  car.provoked = Math.max(clamp(asking, 0, 1), car.provoked - D.provokeSettle * dt);
  const provoked = car.provoked;
  // ...and what the move put into the car's ROTATION outlives the weight
  // it moved: see `CarState.thrown`.
  car.thrown = Math.max(provoked, car.thrown - D.thrownSettle * dt);
  // THE LIFT IS THE FOURTH MOVE, and the only one that does not argue with
  // the speed floor. Coming off the power takes weight off the driven axle
  // like the rest of them, so it has to lift the DEPTH — on a layout whose
  // own is 0.42 there is nothing under `liftSpan`'s setpoint for the pedal
  // to move, which is why a lift used to do nothing at all to a front-driver
  // on a surface with a small slip vocabulary. But it is not an ASK: the
  // lever and the brake are things a driver does to get a car round, and a
  // closed throttle is a driver stopping doing something. So it never claims
  // `provokeFloor`, and a lift-drift is let go by the floor as the car runs
  // out of speed — which is exactly the shape a lift should have.
  //
  // SQUARED, because the ask belongs to a CLOSED throttle and `car.lift` is
  // simply `1 - throttle` lagged: read straight, a car cruising a corner on
  // a third of the pedal is two-thirds lifted, and the depth it opened up
  // made every layout slide like the one above it whenever the driver was
  // not flat out. The square leaves a maintenance throttle almost nothing
  // and hands a driver who genuinely came off the power all of it.
  const lifted = clamp(car.lift * car.lift * D.liftDepth * DR.liftYaw, 0, 1);
  // ...and THE CHAIN the last drift left in the tires. Rubber that has just
  // been scrubbed is past its peak, so the next corner is entered on less
  // than the last one had: it lets go earlier and it goes deeper once it
  // has. Booked on drift starts (below) rather than grown from the slide, so
  // it escalates a SEQUENCE without ever feeding itself.
  const chain = clamp(car.chain, 0, 1);
  const { asked, sliding, open } = slideFactor(car, demand, {
    // Both of these are `limits.ts`, not restatements of it: a move argues
    // with the speed floor as well as with the depth (the corners that need
    // one are the slow ones), and the bot has to be able to ask the same
    // two questions about a corner it has not reached yet.
    floor: slideFloor(spec, provoked),
    entryAt: D.entryAt * DR.entry * (1 - D.linkEntry * chain),
    depth: askedSlide(spec, Math.max(provoked, lifted)),
    release: D.release * DR.release,
  });
  // The wheel does not just unstick the car — it NAMES the angle. Every
  // force that deepens a slide fades as the slip approaches what this much
  // lock is asking for at this speed, and is gone once the car is past it.
  // The setpoint has to MOVE with the wheel: a fade band at a fixed angle
  // leaves the deepening forces with no equilibrium below it, which is the
  // same two-state car the commanded demand above exists to avoid.
  // How far sideways THIS surface lets the car go: gravel's breakaway is a
  // long way out, a sealed road's is a few degrees off straight. It scales
  // the angle the slide asks for and the band it fades over together — one
  // is the setpoint and the other is the room around it, and stretching one
  // without the other would make the paved car's drift sharp-edged instead
  // of small.
  const breakaway = T.surfaces.breakaway[ctx.surface];
  // A CLOSED THROTTLE ASKS FOR MORE ANGLE. Lifting mid-corner throws the
  // weight onto the nose and takes it off the driven axle, and the tail
  // comes round: it is the oldest way there is of making a car turn in
  // harder than the wheel alone will. It has to move the SETPOINT rather
  // than push against it — every deepening force, the lift's own rotation
  // included, fades out as the car reaches the angle being asked for, so a
  // lift applied at the bottom of that band is a lift that does nothing.
  // With the setpoint moved, the band reopens and the whole machinery
  // carries the car to the deeper angle, where `liftGrip` is meanwhile
  // pulling the line tighter — one pedal, both halves of a rally turn-in.
  // ...and the chain deepens the same setpoint, for the same reason it
  // brought the breakaway forward above: the corner is being taken on tires
  // the last corner already used, and less grip is a bigger angle.
  // ...and the OTHER pedal deepens it on a DRIVEN REAR, which is the
  // steady-state drift a rear-driver has and a front-driver does not: the
  // rear tyre's longitudinal force is what holds the car out there, so the
  // angle stays for as long as the throttle is down. On the layout whose
  // `powerYaw` is zero this term is exactly 1 and the throttle is still the
  // way OUT of a slide (`pullStraight`) — the two pedals swap jobs between
  // the layouts, which is the single thing a player relearns moving from
  // one to the other.
  // Normalised on the OPEN throttle, so `angleSpan` is what a rear-driver
  // holds at full lock ON THE POWER — the state a rally car actually spends
  // a corner in — and coming off it is what costs the angle. Written as a
  // gain over 1 instead, this was a bonus on top of the reference and the
  // saloon sat 10% deeper than the number said it would.
  // SQUARED, for the reason `lifted` below is: `car.lift` is `1 - throttle`
  // lagged, so a car cruising a corner on a third of the pedal reads as
  // two-thirds lifted. Read straight, that took the angle off every corner
  // nobody was flat out in — which is most of them, for a bot and for a
  // player — and the saloon stopped drifting stages it had always drifted.
  // The ask belongs to a CLOSED throttle: squaring leaves a maintenance
  // throttle nearly all of its angle and takes it from a driver who has
  // genuinely come off the power.
  const power = D.powerSpan * DR.powerYaw;
  const pedal = 1 - car.lift * car.lift;
  const onPower = (1 + power * pedal) / (1 + power);
  const askedSlip =
    D.angleSpan *
    breakaway *
    asked *
    onPower *
    (1 + D.liftSpan * car.lift) *
    (1 + D.linkDepth * chain);
  const sat = clamp(1 - (Math.abs(car.slip) - askedSlip) / (D.angleBand * breakaway), 0, 1);
  // THE SPIN. Past this much slip the fronts are pointed so far from where
  // the car is going that neither the held lock nor the catch has anything
  // to pull against, and the car is round: it keeps rotating on the momentum
  // it has and drags four tires sideways across the road until that momentum
  // is gone. It is the top edge of the drift and the reason overdoing one
  // costs something — without it the deepest angle the car could be pushed
  // to was also a corner it got away with.
  //
  // Held through a hysteresis rather than read fresh each step: a bare
  // threshold flickers a car sitting near it several times a second, and
  // what is wanted is one moment the player can name. It ends when the angle
  // comes back under `spinBack`, or at `spinOut` whatever the angle.
  //
  // That speed floor is on the ENTRY as well, and it has to be: a car
  // pointing the wrong way at walking pace — beached on a bank, scrabbling
  // out of a ditch, reversing off a rock — is not spinning, it is parked
  // askew. Guarding only the exit let such a car enter on its angle and
  // leave on its speed in the same step, chattering the counter while the
  // scrub pinned it there and took away the steering it needed to drive out.
  //
  // GROUND speed, not `speed` — which is `|car.u|`, the along-the-nose
  // component. A car at seventy degrees of slip has almost no `u` however
  // fast it is actually travelling, so a spin gated on it drops out the
  // instant it succeeds and re-enters on the next step: twenty-six spin
  // events and twenty-six counted spins inside two seconds, off one yank of
  // the lever. It is the same reason `slideFactor`'s own floor reads the
  // speedo rather than the nose.
  const wasSpun = car.spun;
  const overGround = Math.hypot(car.u, car.w);
  const spinning = Math.abs(car.slip) > (wasSpun ? D.spinBack : D.spinAt) * breakaway;
  // ...and once spun, spun until the speed is gone: the slip is read from
  // the nearer axis, so a car going round reads as straight twice a turn,
  // and one that left the spin there swapped ends on the lock it still had
  // on and counted a fresh spin each time. A spin is over at `spinOut`, and
  // nowhere else — which is what "past a point the car is simply gone"
  // means.
  car.spun = (spinning || wasSpun) && overGround > D.spinOut;
  if (car.spun && !wasSpun) {
    events.push({ type: "spin", slip: Math.abs(car.slip), speed: overGround });
    stats.spins += 1;
    // The way the car is turning as it goes — the slide's own sense if the
    // yaw has not made its mind up.
    car.spinDir = Math.sign(car.yawRate) || -Math.sign(car.slip) || 1;
  }
  if (!car.spun) car.spinDir = 0;
  const spun = car.spun ? 1 : 0;
  const deepening = Math.sign(steer) === -Math.sign(car.slip) && car.slip !== 0;
  // ...and a spun car has almost none of it: the front wheels are as crossed
  // up as the body is, so whatever they are pointed at, it is not the road
  // ahead. `spinSteer` is what is left — enough that the driver is still in
  // the car, far too little to save the corner.
  const hands = spun ? D.spinSteer : 1;
  const steerTerm = steer * backwards * (steerGain + spec.driftYaw * speedFactor * asked) * hands;
  // THE FALLING SIDE OF THE TYRE. Everything below this line finds an
  // equilibrium: the deepening forces fade over `angleBand` as the car
  // reaches the angle the wheel asked for, and a held slide parks inside
  // that band. Past the TOP of it the wheel has nothing left to say — every
  // force it commands has faded out — and a real rear tyre out there is
  // past its peak: the force holding the tail FALLS as the angle grows, so
  // a car carried beyond what the wheel asked for, by a flick, the lever,
  // the throttle or a landing taken crossed up, has a tail that keeps
  // coming on its own, all the way to `spinAt`. This is that: from the top
  // of the band the slip itself turns the car further, and only lock the
  // OTHER way holds it, which is what makes over-doing a drift something
  // that can happen, and catching it something that has to be done in
  // time. Measured from the wheel's own setpoint rather than from a fixed
  // angle, and driven by what CARRIED the car past it — the move that
  // unstuck the rear (`thrown`, which outlives the weight it moved), or
  // the lift — and never by the wheel alone: the wheel names the angle, a
  // held lock finds that angle at any speed and parks there, and only what
  // goes past the name runs. Neither
  // a landing nor the chain drives it: the skitter already takes the grip,
  // the chain already deepens the ask and brings the breakaway forward,
  // and a car that came down hard and slid on tyres that were still
  // hopping is owed a wobble it can drive out of, not a spin it cannot —
  // the landing that goes further than that trips the car over instead
  // (`tripSlide`). Not the loop the slide model is built to avoid —
  // nothing here touches how much the car is sliding, only which way a
  // car already past the peak is turning. It hands over at `spinAt`: a
  // spun car is round and rotating on the momentum it has, and pushing it
  // on from here would carry it through backwards, where four dragged
  // tyres stop scrubbing.
  const counter = clamp(steer * backwards * Math.sign(car.slip), 0, 1);
  const carried = Math.max(car.thrown, lifted);
  // ...and it is a thing that happens at PACE. The model has no yaw inertia
  // — the nose answers its target at a rate — and what that leaves out is
  // exactly this: a car at 60 km/h has a tail its tyres can arrest, a car
  // at 120 has one they cannot. So the run comes in above the slide's own
  // floor, over `overSpeed` of it, which is also what keeps the lever's
  // hairpin — full lock and the handbrake held, well under the floor — a
  // pivot rather than a spin.
  const runPace = clamp((overGround - D.slideFrom) / (D.overSpeed * D.slideFrom), 0, 1);
  const overFrom = askedSlip + D.overFrom * D.angleBand * breakaway;
  const overPeak = clamp(
    (Math.abs(car.slip) - overFrom) /
      Math.max(D.overBand * breakaway, D.spinAt * breakaway - overFrom),
    0,
    1,
  );
  const runYaw =
    -Math.sign(car.slip) *
    D.overYaw *
    overPeak *
    carried *
    runPace *
    (1 - counter) *
    (1 - spun) *
    sliding *
    speedFactor;
  // ...and THROUGH THE SPIN (`spinCarry`, below the yaw's own settling):
  // past `spinAt` the tail is gone and the car turns on its momentum.
  const spinPace = clamp(overGround / D.slideFrom, 0, 1);
  // The slip's self-rotation scales with steering commitment, so holding
  // into the slide sustains it, releasing lets grip straighten the car, and
  // counter-steer exits fast. An unconditional slip term would be a
  // positive feedback loop — a car that never stops rotating once sideways.
  // Full commitment on the counter too: it damps the catch, which is what
  // keeps the exit a gather-up instead of a twitch.
  const commitment =
    T.steering.commitmentFloor + (1 - T.steering.commitmentFloor) * Math.abs(steer);
  /** How much the wheel is steered INTO the slide, 0..1 — what gates the
   * power's oversteer off while the driver is still asking for the angle. */
  const intoSlide = clamp(steer * -Math.sign(car.slip), 0, 1);
  // Through the speed floor like everything else that swings the tail: under
  // it the handbrake is a pair of locked rear wheels and nothing more, which
  // is what stops the lever from being a way round the floor at 30 km/h.
  const handbrakeYaw =
    lever * Math.sign(steer) * backwards * T.grip.handbrakeYaw * speedFactor * open;
  // The weight throw itself. Signed by the direction the RACK IS MOVING,
  // which is the way the mass is being sent — during the crossing the lock
  // itself is still on the old side and would throw the car backwards.
  const flickYaw = car.flickDir * backwards * T.grip.flickYaw * DR.flick * flick * speedFactor;
  // RWD power oversteer: the driven rear keeps feeding the slide — but only
  // once the wheel stops asking for the angle. Steered into the slide the
  // corner behaves classically (saturation parks it); released after the
  // turn, the tail lingers out for a beat before grip gathers the car up —
  // and a counter-steer settles it faster still. The soft sign keeps the
  // term from chattering through the instant the slip crosses centre.
  const tailDir = clamp(-car.slip / T.steering.tailSoftSlip, -1, 1);
  const powerYaw =
    tailDir *
    T.grip.powerYaw *
    DR.powerYaw *
    spec.torque *
    input.throttle *
    sliding *
    speedFactor *
    (1 - intoSlide);
  // The front axle's opposite number. Driven front wheels pull the car
  // toward where they POINT, so on a front-driver the throttle is the way
  // OUT of a slide and never into one — ungated by the wheel, because
  // power-on understeer is exactly what is felt while still asking for the
  // corner. The pedals swap jobs between the two layouts, which is the
  // single thing a player has to relearn moving between them.
  const pullStraight =
    car.slip *
    T.grip.pullStraight *
    DR.pullStraight *
    spec.torque *
    input.throttle *
    sliding *
    speedFactor;
  // ...and the same pull TIGHTENING a slow corner: the front-driver's
  // turn-in bite, strongest at the bottom of the gear and gone by the top
  // of it. Nothing at all on a rear-driver, which is why one is quick out
  // of a hairpin and the other is quick into it.
  const pullIn =
    steer *
    backwards *
    T.grip.pullIn *
    DR.pullIn *
    spec.torque *
    input.throttle *
    (1 - rev) *
    speedFactor;
  // A LIFT swings the tail: the weight comes off the driven axle and the
  // car rotates. `T.grip.liftGrip` is the other half of the same lift — one
  // tightens the line, this one swings the nose — and together they are how
  // a front-driver rotates at all without pulling the handbrake.
  // The rotation does not stop when the hands do. While the slide is letting
  // go, the yaw answers its target more slowly, so the nose keeps swinging
  // for a beat after the lock comes off and can carry a little PAST centre —
  // which is the dab of opposite lock on the way out of a big drift. It is
  // exactly zero while the wheel is still asking for the angle it has.
  const liftYaw =
    tailDir * T.grip.liftYaw * DR.liftYaw * (1 - input.throttle) * sliding * speedFactor;
  // ...and the BRAKE swings it harder, because the transfer is bigger: a
  // lift takes the drive off one axle, a brake stands the whole car on its
  // nose. It is what turns a trailed brake from a way of arriving slower
  // into a way of arriving pointed, and — with the depth it opens above —
  // it is how a front-driver gets round a corner it would otherwise wash
  // straight out of. Off the lagged load, so a stab on the straight is a
  // brake and nothing more.
  const brakeYaw = tailDir * T.grip.brakeYaw * DR.brake * car.brakeLoad * sliding * speedFactor;
  const releasing = clamp(sliding - asked, 0, 1);
  // ...and as it lets go the rear bites again and WEATHERVANES the car:
  // a torque pulling the nose back toward the direction the car is actually
  // travelling. That, against the yaw's own lag above, is a spring with
  // damping — which is what lets the nose swing back through centre and a
  // little past it instead of easing to zero and stopping there.
  // ...and neither the weathervane nor the slip's own self-straightening
  // below survives a spin whole (`spinHold`): they are the tyre's hold on
  // the car's travel read as a torque, and a spun tyre has let go.
  const hold = spun ? D.spinHold : 1;
  const straighten = car.slip * D.releaseSnap * DR.snap * releasing * speedFactor * hold;
  // Saturation gates EVERYTHING that deepens the slide except the power's
  // own oversteer; counter-steer keeps full authority, because it always
  // has somewhere to go.
  const yawTarget =
    (deepening ? steerTerm * sat : steerTerm) +
    handbrakeYaw * sat +
    flickYaw +
    pullIn +
    powerYaw +
    liftYaw * sat +
    brakeYaw * sat +
    pullStraight +
    straighten +
    runYaw -
    car.slip * T.grip.slipYaw * commitment * sat * sliding * hold;
  const yawResponse =
    (T.grip.yawResponse.grip + (T.grip.yawResponse.slide - T.grip.yawResponse.grip) * sliding) *
    (1 - D.releaseHang * releasing);
  car.yawRate += (yawTarget - car.yawRate) * clamp(yawResponse * dt, 0, 1);
  // THROUGH THE SPIN. The model has no yaw inertia — the nose chases a
  // target rate — and a spun car is the one place that shows: past
  // `spinAt` nothing under the car is holding the tail, and it turns on
  // the momentum it has, the way it was already turning (`spinDir`),
  // through backwards and on until the speed is scrubbed out of it
  // (`spinOut`) — where it stops is where it stops, and often enough that
  // is facing the way it came. So while spun the yaw never falls under
  // `spinCarry` in the spin's own direction (scaled by the ground speed
  // over the slide floor, and the counter takes only `spinSteer` of it
  // away, which is the spin the driver cannot influence enough to save).
  // A floor rather than a term in the target above: round on its tail the
  // car reads as straight, the slide shuts and the lock the driver still
  // has on steers the other way, and a target-rate term was cancelled to
  // nothing there — the car parked rolling backwards at pace with nothing
  // scrubbing it.
  if (car.spun) {
    const carry = car.spinDir * D.spinCarry * spinPace * (1 - counter * D.spinSteer);
    if (car.spinDir * car.yawRate < car.spinDir * carry) car.yawRate = carry;
  }

  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  updateSlip(car);

  // ── Longitudinal ─────────────────────────────────────────────────────────
  const shiftCut = ctx.t < car.shiftCutUntil ? 0 : 1;
  // How much of the pedal the tyres are refusing to take. Settled BEFORE the
  // torque is asked for, so the spin a stab of throttle lights costs that
  // same stab its shove rather than the next one's.
  settleLaunchSpin(spec, car, surfaceGrip, input.throttle * shiftCut, dt);
  // A folded radiator starves the engine, and past the misfire threshold the
  // ignition drops beats outright: a badly hurt car lurches up the road
  // instead of pulling up it. It limps — right up until the engine is dead,
  // and then nothing here pushes at all (step.ts retires the run once it
  // has coasted to a stop).
  const damagePower = hurt.power * hurt.firing;
  const accel =
    engineAccel(spec, car, surfaceGrip) *
    input.throttle *
    surfacePower *
    shiftCut *
    damagePower *
    ctx.drive;
  car.u += accel * dt;
  if (car.reversing) {
    // Backing out. The brake's own retardation is off while this runs, or the
    // two would fight over the same pedal and the car would sit still. Once
    // the pedal comes up the drivetrain gathers the car back to a stop —
    // rolling drag alone is tuned for a car with an engine holding it up
    // against it, and would let a released reverse coast on for a minute.
    car.u =
      input.brake > 0
        ? Math.max(-T.reverse.top, car.u - T.reverse.accel * input.brake * dt)
        : Math.min(0, car.u + T.reverse.coastStop * dt);
  } else {
    // THE LEVER IS A BRAKE. Two wheels dragged down the road is about a
    // third of what four of them do (`grip.handbrakeBrake`), and the model
    // used to charge nothing for it at all: the lever unstuck the rear, span
    // the car and cost it no speed, so the last resort was the cheapest move
    // in the game and there was never a reason not to hold it.
    //
    // The DEEPER of the two demands rather than their sum: with the pedal
    // already down the rears are locked whichever handle did it, and a
    // driver standing on both is owed one axle's worth of braking, not
    // three. The pedal's own damage (`hurt.brake` — a boiled circuit, a
    // hose) is on both, because a lever that has lost its cable has already
    // been taken away up at `lever` itself.
    const pedal = Math.max(input.brake, lever * T.grip.handbrakeBrake);
    // A spent chassis cannot hold its hubs square, so the car pulls up long.
    car.u -= spec.brake * hurt.brake * pedal * Math.sign(car.u) * dt;
  }
  // A ploughing floorpan, a rim on the road and a shell that is no longer
  // the shape it was drawn as: the MECHANICAL losses, each a share of the
  // speed, on top of what the surface itself costs.
  car.u -= (surfaceDrag + hurt.drag) * car.u * dt;
  // ...and THE AIR through the holes the crash left, spent the way the air
  // spends it: ½·ρ·CdA·u² over the car's own mass. The square is the whole
  // character of it — nothing at the exit of a hairpin, and the whole top
  // end on a straight, so a car with its doors and its bonnet gone still
  // pulls away from a corner like a rally car and simply never arrives.
  car.u -=
    ((T.collision.aero.density * hurt.aero) / (2 * spec.mass)) * car.u * Math.abs(car.u) * dt;
  // ...and what a seized engine or a hub on the road takes at ANY speed:
  // the constant part, which is what brings a car that cannot drive to
  // the standstill the retire rule is waiting for (damage.ts).
  if (hurt.coastBrake > 0 && !car.reversing) {
    car.u -= Math.sign(car.u) * Math.min(Math.abs(car.u), hurt.coastBrake * dt);
  }
  if (ctx.surface === "nature") {
    // The rough-ground cap: open nature is fast but never road-fast.
    car.u -= Math.max(0, car.u - T.surfaces.natureTop) * T.surfaces.natureOverDrag * dt;
  }
  // Grade: gravity along the road — the hills push back (or push on). A
  // face steeper than the car can climb pushes back HARDER, which is what
  // stops a car nosed into a bank in a couple of steps and rolls it back
  // out; but the descent is no steeper than a hill the car can stand on:
  // the grade is read over a baseline, and within it of a cliff lip it
  // reports the whole drop as a slope, which as gravity hurried a car
  // creeping toward the edge over it at several g. A drop is flown, never
  // driven down (the takeoff below).
  const grade = Math.max(ctx.slope, -T.collision.climbLimit);
  car.u -= 9.8 * T.hills.gravityAlong * grade * dt;
  // The standstill snap, which is also what stops a car creeping on a slope.
  // It has to stand down while the car is backing out, or reverse never gets
  // past its own first tick.
  if (Math.abs(car.u) < T.standstill && input.throttle === 0 && !car.reversing) car.u = 0;

  // The nose, as a vector. Nothing below turns the car — the yaw is long
  // since integrated — so the wind's head/tail component and the move at
  // the bottom are the same heading read once.
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);

  // ── Wind ─────────────────────────────────────────────────────────────────
  // Head/tailwind on the top end; the sideways carry is applied in the move.
  {
    const along = ctx.windX * sinH + ctx.windZ * cosH;
    car.u += along * T.wind.longForce * dt;
  }

  // ── Lateral grip: the tires REDIRECT the car, they do not brake it ────────
  // The velocity swings back in behind the nose at `latRate` while its
  // MAGNITUDE is kept — a corner taken sideways comes out at pace, which is
  // the whole point. Only the fraction a sliding tire really burns off is
  // lost, and it scales with sin²(slip), so ordinary cornering costs
  // nothing at all. Weight transfer is the player's tool against running
  // wide: staying on the power keeps the rear loose, lifting tightens the
  // line — and the bot breathes the throttle the same way.
  // Across the grade (off-road): a hillside pulls the car toward its
  // downhill side. Applied HERE, with the slip refreshed, so the redirect
  // below sees the deflection and the tires get to fight it — a gentle
  // slope is a lean, a steep one a slide, and the ground answers back
  // instead of reading as a tilted carpet. (Before the slip update the
  // redirect would rebuild `w` from the stale angle and erase the pull.)
  if (ctx.slopeLat) {
    car.w -= 9.8 * T.hills.gravityAlong * ctx.slopeLat * dt;
    updateSlip(car);
  }
  const lift = 1 + T.grip.liftGrip * (1 - input.throttle) * sliding;
  // The lever comes in through the speed floor like everything else that
  // takes the rear away: under it the handbrake stops the car and does not
  // unstick it, so a yank at 40 km/h is a brake and nothing more.
  // The lever locks the REAR wheels — the fronts keep rolling and keep
  // steering, so what the car loses is its tail, not its ability to change
  // direction. `handbrakeLat` is what the redirect keeps for that reason,
  // and it sits well above `handbrakeGrip` (which is the rear letting go,
  // up at the slide threshold): cut the two together and the car pivots
  // beautifully while carrying straight on past the apex, which is the one
  // thing the lever is supposed to be for.
  const leverLat = 1 + (T.grip.handbrakeLat - 1) * open * lever;
  // Bent arms, a twisted shell that moves the geometry under load, and the
  // downforce of a wing that is no longer on the car — all three through
  // `hurt.grip`, floored so they can never stack into an unpointable car.
  const grip = surfaceGrip * lift * leverLat * hurt.grip;
  // THE HANDS ARE WHAT RE-GRIP THE CAR. Sideways, the front tires are as
  // crossed up as the body is: pointed nowhere near where the car is going,
  // they have almost nothing to pull against, and it is LOCK — either way,
  // the held corner or the catch — that aims them back along the travel and
  // lets them bite. So the redirect keeps its full rate wherever the wheel
  // is asking for something, and fades to `1 - tailFade` only where a
  // centred wheel meets a real slip angle.
  //
  // That one gate is what makes the exit belong to the driver. Without it,
  // dropping the wheel mid-slide let the tires eat the car's whole sideways
  // momentum on their own: the velocity swung thirty degrees back in behind
  // the nose after the hands came off, so the slide finished the corner by
  // itself and handed the car back straight, on the road, faster than it
  // went in. Now letting go leaves the car going where it was already
  // going — out toward the outside of the road, aimed off the line — and
  // steering is what tips it back into the middle.
  //
  // The angle is sized in the surface's own breakaway, for the same reason
  // `askedSlip` is: a sealed road's whole slip vocabulary is a few degrees
  // wide, and a fade sized for gravel would never reach it.
  const tailAt = clamp(
    (Math.abs(car.slip) - T.grip.tailPeak * breakaway) / (T.grip.tailBand * breakaway),
    0,
    1,
  );
  // Through the speed floor like everything else that keeps a car sideways:
  // under it the wheel steers the car and that is all it does, so a slow
  // scrabble out of a ditch cannot use a centred wheel to go on sliding.
  // ...and a SPUN car has given the lock's exemption up: the fade above is
  // held off by a wheel that still has something to pull against, and past
  // `spinAt` it has not. So the fade arrives in full however much lock is
  // wound on, which is what makes a spin a thing the car does rather than
  // a thing the driver is doing.
  const crossed = Math.max(tailAt * tailAt * (3 - 2 * tailAt) * (1 - Math.abs(steer)), spun) * open;
  const tail = 1 - T.grip.tailFade * crossed;
  const latRate = (spec.gripLat + (spec.driftLat - spec.gripLat) * sliding) * grip * tail;
  // THE TRACTION CEILING. The redirect is a RATE, and a rate times a speed
  // is a force the tires have to find: unbounded, the car pulls whatever
  // lateral acceleration the geometry asks for, which is how it ends up
  // carrying a hairpin's radius at a straight's speed. Capped at what the
  // tires hold, speed costs radius instead — the line a car can hold flat
  // out grows as u², so a sweeper is a drift at pace and a hairpin has to be
  // braked for. Past the ceiling the velocity stops catching the nose up and
  // the car runs WIDE at a bigger angle, which is the point of a drift.
  // It saturates rather than clipping, because a hard min() is a cliff: one
  // notch of lock either side of it would separate a gripped car from a
  // sideways one. `tanh` rolls off the way a tire does, and `latGive` is the
  // bite it never loses — without that residual slope the angle runs away
  // the instant the demand touches the ceiling, since nothing but slip is
  // left to answer more lock with.
  const travel = Math.hypot(car.u, car.w);
  const ceiling = latCeiling(spec, grip);
  const demanded = travel * latRate * Math.abs(car.slip);
  const over = demanded / ceiling;
  const held = ceiling * (T.grip.latGive * over + (1 - T.grip.latGive) * Math.tanh(over));
  // ...and a spun tyre has let go of most of it (`drift.spinHold`).
  const heldRate = (demanded > 1e-6 ? (latRate * held) / demanded : latRate) * hold;
  if (car.u > 1) {
    const swung = car.slip * Math.exp(-heldRate * dt);
    // `travel` is this same speed: nothing between there and here moves the
    // car, and the magnitude is what the redirect keeps.
    // ...and a spun car scrubs far harder: sin² is the price of dragging a
    // tire sideways, and four of them dragged fully sideways is the most
    // effective brake in the game. It is why a spin costs a run so much more
    // than the corner it happened in.
    // ...and a car sideways with its rear wheels DRAGGED scrubs harder than
    // one sideways on rolling tyres. It is the other half of what the lever
    // costs — the half that is paid in the corner rather than on the way in
    // — and it is what makes a hairpin taken on the handbrake a corner the
    // driver has to get back on the throttle out of.
    const dragged = 1 + (T.grip.handbrakeScrub - 1) * lever;
    const scrub = T.grip.scrub * (spun ? D.spinScrub : dragged);
    const kept = travel * Math.exp(-scrub * Math.sin(car.slip) ** 2 * dt);
    car.u = kept * Math.cos(swung);
    car.w = kept * Math.sin(swung);
  } else {
    car.w *= Math.exp(-heldRate * dt);
  }
  updateSlip(car);

  // ── Attitude: the body sits on the ground it is standing on ─────────────
  // The wheels are what the car's attitude is made of, so both angles come
  // from the ground under them and neither feeds back into the handling.
  // Roll unwinds whatever the last flight left toward the NEAREST upright —
  // a car most of the way over finishes the roll instead of rewinding it —
  // and then settles onto the CAMBER: out in the wild a hillside tips the
  // car the way the hillside goes, which is the same cross-slope that is
  // already pulling it downhill. On the road it is the road's OWN camber
  // (R16 — the crown it sheds water off, the wheel track it drops into):
  // a fraction of a degree where a hillside is tens of them, and never the
  // drift's, which contributes nothing to how level the car sits.
  //
  // A roll rate the ground was handed and did not take — a landing that
  // tripped the car but not over (`air.tripSlide`), a low solid clipped
  // under the sill — plays out first: the body LURCHES over on its springs
  // and the recovery below brings it back, which is the near-miss the
  // player gets to see before the one that goes over.
  car.roll += car.rollRate * dt;
  car.rollRate *= Math.exp(-T.air.leanDamp * dt);
  // ...unless the lurch is worth the lift up over the body's own sill
  // corner, at which point there is no near-miss and no recovery: the car
  // is past its outside wheels and the roll owns it from here (roll.ts).
  // THE PITCH HERE IS THE SPRINGS', NOT THE BOX'S. A car being driven
  // carries its nose angle on its suspension — `settlePitch` eases it onto
  // the grade, up to `attitude.pitchMax` — and that is an attitude, not a
  // rotation of the body. The crash model's pitch is the other thing
  // entirely: the plane the box is actually turning over in. So the roll is
  // asked with the pitch the box has, which while driving is none of it;
  // reading the springs' angle instead stands a car merely driving down a
  // steep hill on its own bumper, and every hop and every edge in the suite
  // said so.
  const mass = massSpread(spec);
  if (
    goesOver(car.roll, car.rollRate, mass, rollBed(ctx)) ||
    goesOverEnd(car.pitch, car.pitchRate, mass, rollBed(ctx)) ||
    !onItsWheels(car.roll, 0)
  ) {
    beginRoll(car, events, stats);
    return;
  }
  // ── The body's lean, and the driver's authority over it ────────────────
  // A car standing on all four wheels is held by its springs, and this game
  // keeps it FLAT on purpose: a rally car goes sideways level, and the roll
  // is the ground's camber, never a lean into the slide. That is the ease
  // below and it is unchanged for every ordinary metre of every stage.
  //
  // A car UP ON TWO WHEELS is a different thing entirely, and it used to get
  // the same treatment: the ease dragged it back to the camber at a fixed
  // rate whatever the driver did. So the most retrievable moment in any
  // accident — the car caught itself, the tyres are down, it is balanced
  // over — was the one moment nothing the player pressed could matter.
  //
  // Past the lean the springs can hold it is a rigid body pivoting on its
  // outer contact line, and `leanTorque` is what turns it: gravity down the
  // same surface a rollover runs on, plus the lateral force the tyres are
  // making, working on the lever of the weight's own height. Steer INTO the
  // side the car is standing on and it comes back down onto four wheels;
  // steer away and it holds up there, or goes over — which `goesOver` above
  // has already had its say about. None of that is scripted; it is the sign
  // of the cornering against the sign of the lean.
  //
  // The lateral acceleration is the one the tyres are actually making:
  // speed times the rate the nose is coming round, which is the centripetal
  // term and the same quantity a load transfer is written on.
  const bed = rollBed(ctx);
  const lean = rollTilt(car.roll);
  const camber = ctx.slopeLat ? Math.atan(ctx.slopeLat) : 0;
  // ...and this branch is also where `planted` is decided, because it IS the
  // question: the springs carrying the body, or a rigid body up on its outer
  // contact line. Nothing else in the game may draw that line a second time.
  if (Math.abs(lean - camber) > T.air.leanFree) {
    // Only the TORQUE is added here. The rate was integrated and damped a
    // few lines up, where every roll rate the ground hands the body is —
    // doing either again is a second helping of both.
    car.rollRate += leanTorque(car.roll, 0, car.u * car.yawRate, mass, bed) * dt;
    car.planted = false;
  } else {
    car.roll += (camber - lean) * clamp(T.air.rollRecover * dt, 0, 1);
    car.planted = true;
  }
  settlePitch(car, Math.atan(ctx.slope));

  // ── Drift readout ────────────────────────────────────────────────────────
  readDrift(car, sliding, breakaway, stats, dt);

  // ── Move, then the ground the car finds ──────────────────────────────────
  rideGround(spec, car, ctx, prevVy, prevWheelVy, events, stats);

  // ── Suspension ───────────────────────────────────────────────────────────
  // Whatever the ground just did to the wheels, the body has to catch up
  // with: the shape under the car, capped, and the bumps in it, on their own
  // ceiling (ground.ts). Landings and impacts arrive as velocity steps of
  // their own and are not capped here. A car that has just launched has
  // nothing under its wheels to be jolted by.
  const jolt = car.airborne ? 0 : groundJolt(car, prevVy, prevWheelVy);
  stepSuspension(spec, car, jolt, (car.u - prevU) / dt);
  // A FACE MET AT PACE reaches the belly the way a landing does. The
  // wheels' vertical speed jumping UPWARD in one step — the foot of a bank
  // arriving under a car at speed — is what the springs are handed above,
  // and they lift the body with the wheels up to the most one bump may
  // throw into them (`suspension.bumpMax`); past that the body has met the
  // ground before the wheels could lift it, and the underside folds by the
  // rest, charged as the arrival it is (`landingDamage`, with the tolerance
  // a landing has — which shot dampers narrow). So it is the SPRINGS that
  // decide what a bank costs: a bank taken at the speed that carries the
  // car up it stays free; the same bank at twice that speed costs the
  // belly. The WHEELS' speed alone, and only rising: the smoothed grade
  // predicting a drop the wheels have not made yet — the nose creeping out
  // over an edge — is nothing arriving under the car, and read against it
  // a car rolling off a table folded its floor on thin air.
  if (!car.airborne) {
    const over = car.wheelVy - prevWheelVy - T.suspension.bumpMax;
    if (over > 0) landingDamage(spec, car, T.collision.hardLandSpeed + over, events, stats);
  }
  // The hopping dies down with them. Only on the ground: a car back in the
  // air off its own rebound is still the same landing, and it has nothing
  // to settle against up there.
  car.settle = Math.max(0, car.settle - T.suspension.settleFade * dt);

  // ── The driven wheels ────────────────────────────────────────────────────
  // How far ahead of the road the engine is spinning them, once the step has
  // settled. It goes LAST because it is measured against the speed the car
  // ended up at and the slide it ended up in: sized against the speed it
  // started from, a step that accelerated hard would leave the wheels
  // turning faster than their own engine could turn them. An engaging shift
  // takes the pedal away, and with it the spin.
  settleWheelspin(spec, car, wheelspinShare(spec, car, surfaceGrip, input.throttle * shiftCut), dt);
}
