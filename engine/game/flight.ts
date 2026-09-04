// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR OFF THE GROUND, and the moment it comes back.
//
// Three things happen here and they are one motion. THE LAUNCH: a lip throws
// the car, and whatever the tyres were doing at the instant they let go is
// what it carries into the air — a car that leaves crossed up is already
// turning. THE FLIGHT: the velocity is committed, the nose answers only
// faintly, and turbulence rolls the body. THE LANDING: the springs take what
// they can, the underside takes the rest, and a body still travelling
// sideways when the tyres bite trips over its own outside wheels
// (`tripOnLanding`) — which is the commonest way a rally car ends up on its
// roof, and the one moment in the whole model where the driver's hands and
// feet decide between a save and a rollover.
//
// Past that line the car belongs to `roll.ts`.

import { clamp } from "../lib/math.ts";
import { surfaceGripFor } from "./limits.ts";
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
import { landingDamage } from "./collision.ts";
import { groundPull, settlePitch, stepSuspension, windCarry } from "./body.ts";
import { settleWheelspin } from "./drivetrain.ts";
import { footOn, readSeat, seatOn, standOn, wheelSpeed, type GroundContext } from "./ground.ts";
import {
  beginRoll,
  goesOver,
  landRolled,
  massSpread,
  onItsWheels,
  rollBed,
  rollStand,
} from "./roll.ts";
import type { Surface } from "../mapgen/index.ts";

const T = TUNING;
const D = TUNING.drift;

/** Leave the ground. A car that launches crossed up trips over its outside
 * wheels, so the roll it carries into the air is the slide the tires were
 * fighting plus the rotation already in the body: straight and level flies
 * flat, properly sideways goes a long way over, and once in a while it goes
 * all the way round. Physics decides — nothing here aims for it.
 *
 * `hop` marks a lift the flight's own gravity would not have allowed: the
 * ground let the body go at `air.hold` of its weight, and the arcade
 * gravity will have it back before the flight is anything. It flies the
 * same way, but it is the car BOBBING over a brow, not a jump — so it
 * draws no turbulence, books no air time and no jump, and (through
 * `settling`, which is the same fact read from a landing's side) the bot
 * keeps driving through it.
 *
 * `sudden` is the ground going in one step — a lip, an edge — under tyres
 * that were holding a slide a moment ago: that is the trip, below. A body
 * that lifted off its wheels over a brow left tyres that had already
 * unloaded across the whole of the loft, and they let go of nothing. */
export function launch(
  car: CarState,
  vy: number,
  events: GameEvent[],
  stats: RunStats,
  hop = false,
  sudden = true,
): void {
  car.airborne = true;
  car.settling = hop;
  car.airTime = 0;
  car.vy = vy;
  // The body's lift over the ground is the flight's now: the wheels have
  // stopped reaching after it.
  car.y += car.loft;
  car.loft = 0;
  car.loftRate = 0;
  // Nothing is standing on the tires up here, and nothing about the ground
  // the car just left applies to the one it comes down on. It arrives back
  // at its own weight and the landing's own skitter decides the rest.
  car.weight = 1;
  if (sudden) {
    car.rollRate = -(car.w * T.air.rollFromSlide + car.yawRate * T.air.rollFromYaw);
    // The same trip about the vertical axis: the tires that were holding
    // the slide let go all at once, so the car keeps turning the way the
    // slide was turning it. Sideways off a ledge is a car that SPINS as it
    // falls, which is the whole difference between a jump and going over
    // the edge in a drift. (Heading grows clockwise and rotating the frame
    // that way reduces `w`, so continuing the slide is a negative rate.)
    car.yawRate -= car.w * T.air.yawFromSlide;
  }
  if (hop) return;
  events.push({ type: "takeoff", vy });
  stats.jumps += 1;
}

/** THE STEP THAT DECIDES WHETHER THE CAR IS STILL ON THE GROUND — the move
 * across the world, and then the ground it finds when it gets there.
 *
 * A grounded car RIDES the road: its vertical speed is the road's own, so a
 * ramp pitches the nose up and a dip drops it with no hop at all. It leaves
 * only when the ground falls away faster than gravity could pull the body
 * down after it — which is why the same crest launches a car at pace and
 * holds it at a crawl — or when the ground under its middle simply runs out
 * (an edge), or when a flagged jump lip says the launch is NOW.
 *
 * `prevVy` and `prevWheelVy` are what the body and the wheels were doing
 * vertically when the step began; everything here is grown from those SPEEDS
 * and never from heights, because the seat a body sits on also moves as the
 * attitude settles onto a hillside, and that is the body being lifted rather
 * than the ground going anywhere. */
export function rideGround(
  spec: CarSpec,
  car: CarState,
  ctx: GroundContext,
  prevVy: number,
  prevWheelVy: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // ── Move ─────────────────────────────────────────────────────────────────
  const carry = windCarry(car);
  // Where the step started: what the ground has to be measured against to
  // tell a hill the wheels climb from a wall that refuses them.
  const fromX = car.x;
  const fromZ = car.z;
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;

  // ── Ground follow / takeoff ──────────────────────────────────────────────
  // The car RIDES the road: its vertical speed is the road's own, so a ramp
  // pitches the nose up and a dip drops it, smoothly, with no hop (the
  // renderer reads the attitude straight off vy/u). It leaves the ground
  // only when the road falls away faster than gravity could pull it down —
  // so the same crest launches you at pace and holds you at a crawl.
  // The wheels climb whatever the ground does under the DIRECTION OF TRAVEL,
  // which in a slide is nowhere near the heading. `slope` and `slopeLat` are
  // the ground's gradient resolved onto the car's own axes and (u, w) is its
  // velocity on those same axes, so the pair of them is the gradient dotted
  // with the velocity — the same number whichever way the car is pointing.
  // Taking only the along-heading half made a car sliding across a uniform
  // hillside report a vertical speed that swung with its own yaw. The jolt
  // cap below now hides most of what that cost the springs, but this is also
  // the number the landings, the bounce and the renderer read, and it should
  // be the speed the wheels are actually going up or down at.
  const roadVy = car.u * ctx.slope + car.w * (ctx.slopeLat ?? 0);
  // Both takeoff gates below are on the speed the car is COVERING GROUND
  // at, not on the speed it is pointing at. Sideways, those are different
  // numbers — a car at full lock crossing a lip has most of its pace in
  // `w` — and reading `u` alone glued every drift to the ground exactly
  // where a drift most wants to fly: over a crest, off a ledge, over the
  // top of a mountain. The lip does not care which way the nose is.
  const pace = Math.hypot(car.u, car.w);
  // The far end of the same number the tires were weighed with at the top of
  // the step: how hard the ground is asking to be followed down.
  const roadPull = groundPull(ctx.roadCurve, pace);
  // Ride the ground under the wheels, read where the car actually IS — a
  // slide carries the car ACROSS the slope, which the along-heading slope
  // can't see, and a road is read the same way so that leaving it and
  // coming back onto it is one continuous surface.
  //
  // THE EDGE. A cliff lip or a cut bank falls away by more than `edgeDrop`
  // under the car's middle in one step — at pace that is a flight, not a
  // face to be driven down, and at a crawl it is a drop. Everything else
  // the ground can do — a lip, a kink, a brow, a step the wheels cannot
  // follow — is the body's own momentum against the ground below.
  const at = readSeat(car, ctx);
  // PROPPED ON A FACE. Out in the wild the seat is lifted off the ground
  // under the middle by whatever corner asks for the most, and a corner up
  // against a face the wheels cannot climb asks for the top of its reach
  // (ground.ts, `corners`): a car nosed into a bank sits on a plane a couple
  // of metres up it. That plane is the contact model's fiction, not a hill
  // the body is standing on, and it comes down as fast as the car backs off
  // the face — so the body follows it, the way it follows the wall check,
  // and the momentum model below starts again only once the seat is back
  // within the wheels' reach of the ground. Without this a car reversing
  // off a bank was thrown a body-height into the air and fell for the
  // better part of a second before the driver had it back.
  if (at.seat - at.centre > T.air.leave) {
    car.loft = 0;
    car.loftRate = 0;
    car.foot = at.foot - at.centre;
    car.footVy = 0;
    car.footMean = 0;
    standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
  } else {
    // THE BODY HAS ITS OWN VERTICAL MOMENTUM. It arrives at this step with
    // the vertical speed it had (`prevVy` — the ground's own while the ground
    // was carrying it, its own once it was not) and falls from there at
    // `air.hold` of gravity; the ground can only ever push it UP. So the body
    // is put where its momentum takes it and compared with the ground the
    // wheels have just found: under the ground, and the ground has the car;
    // above it, and the ground is falling away faster than the body can
    // follow — the wheels reach down after it on their droop and the gap
    // between the two is `car.loft`. For the first `air.loft` of that the car
    // is grounded and light, its body up off the arches; past it the wheels
    // have run out of reach and it is flying with the speed it has actually
    // got, which is what makes a crest a MOMENT at pace and nothing at a
    // crawl: the same brow holds a slow car, unloads a quick one and throws a
    // fast one, and the one it only just throws lifts off late and low.
    //
    // The body carries the SMOOTHED grade's speed while it is carried, so a
    // rut, a kerb or the bump layer at pace — shapes the springs absorb, read
    // off the raw ground under the wheels — open a gap of a few centimetres
    // that the next rise closes, and only the shape of the hill can reach
    // past the droop. What the smoothing hides at a lattice crease or a road
    // crown is exactly what this catches: the ground turns down under a body
    // still going up, and the car skips.
    //
    // A HOP — a lift the flight's own gravity would have had back before it
    // was anything — is marked as one (`launch`'s `hop`), so it bobs the car
    // over a brow without booking a jump. A cliff edge is found by the rule
    // above before the body gets here; a jump LIP (R6) is flagged by the
    // road, and the flight it throws the car into is a jump whatever the
    // grade it sits on, with the launch speed the lip is designed around:
    // the wheels are on the steepest last metre of the ramp when the ground
    // drops away and the body, a wheelbase long, is carrying the ramp's
    // average — `launchKeep` of the wheels' climb, or the smoothed grade's,
    // whichever is more. From either direction: a car coming back the other
    // way climbs the landing face and is thrown off the top of it.
    //
    // The gap is grown from the two SPEEDS — the body's against the wheels'
    // over the ground they actually covered — and never read off heights: the
    // seat the body sits on also moves as the attitude settles onto a
    // hillside, and that is the body being lifted, not the ground going
    // anywhere. The wheels' speed is the FOOT's (ground.ts, `Seat.foot`): the
    // mean of the four, because the body rides the four and not the point
    // under its middle — a rut takes one wheel down a hand's width and the
    // body a quarter of that, and a bump shorter than the wheelbase is under
    // one axle at a time. Read off the centre alone, the road's own
    // cross-section lofted a car crossing it at a crawl. And the speed the
    // body ARRIVES with is the SMALLEST of the three it could have: the
    // smoothed grade's, which against a wall says the car is climbing at
    // absurd speed while the wheels go nowhere, and four metres short of a
    // cliff lip says it is already diving; the middle's own, which a kerb
    // spikes for one step while the body has not moved; and the foot's,
    // whose corners are inside the wall before the middle has reached it.
    // Only ground the car has actually been carried along carries the body
    // on — and a body already up off its wheels is carrying its own speed,
    // which nothing under it bounds.
    //
    // ...smallest going UP. Going DOWN the body is never slower than the foot
    // has been: the smoothed grade under a car sliding across a banked,
    // crowned road reads a gentler descent than the wheels are actually on,
    // and a body reset to that every step kept falling behind ground that
    // was only doing what it had done for the last second — a car drifting
    // across a wide S-bend lifted off nothing. What the foot has BEEN doing
    // is read over `air.footLag` (`car.footMean`), so one step's blip in a
    // four-wheel mean crossing the ruts sideways is not a speed the body
    // has to have; the gap itself is still grown from the raw speed, and
    // the springs answer that.
    const smallest = (a: number, b: number): number => (Math.abs(a) < Math.abs(b) ? a : b);
    const carriedVy =
      car.loft > 0
        ? prevVy
        : Math.min(smallest(smallest(prevVy, prevWheelVy), car.footVy), car.footMean);
    const bodyVy = carriedVy - T.air.gravity * T.air.hold * dt;
    const footVy = ctx.lip ? wheelSpeed(ctx, at.centre) : (at.foot - (ctx.groundY + car.foot)) / dt;
    const loft = Math.max(0, car.loft + (bodyVy - footVy) * dt);
    car.foot = at.foot - at.centre;
    car.footVy = footVy;
    car.footMean += (footVy - car.footMean) * clamp(dt / T.air.footLag, 0, 1);
    if (at.centre < ctx.groundY - T.air.edgeDrop) {
      // Off the edge with the speed the body has, which off a cliff lip is
      // none of the dive the grade ahead of it reads: the car sails off at
      // pace and DROPS at a crawl — a car creeping over an edge falls from
      // where it was, it is never set down the face. The drop is the GROUND
      // under the middle falling away, never the seat: a car sliding along a
      // face it cannot climb is held up on a corner, and that lift coming
      // off as it slides clear is not a cliff.
      launch(car, bodyVy, events, stats, pace < T.air.crestSpeed);
    } else if (ctx.lip && bodyVy - footVy >= T.air.edgeSpeed) {
      // THE LIP. The ground under the middle has just gone at edge speed
      // within reach of a flagged jump lip: the car leaves NOW, from the top
      // of the ramp, and not two steps down the landing face when the reach
      // has run out — with the launch speed the lip is designed around.
      launch(car, Math.max(roadVy, prevWheelVy * T.air.launchKeep, bodyVy), events, stats);
    } else if (loft <= 0) {
      car.loft = 0;
      car.loftRate = 0;
      standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
    } else {
      // The wheels stand on the ground (the wall check included); the body
      // is up off them, at its own speed — which is what the camera, the
      // attitude and the springs read, so a lifting body rides its springs
      // out to the droop the way a car cresting a brow does.
      standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
      // The body is never more than `leave` above the wheels: past that the
      // rest of the gap is ground the wheels have already left, and the
      // body's height is the reach, not the drop. Between `loft` and `leave`
      // the car is SKIPPING — the wheels off the ground for a few tenths,
      // the tyres carrying nothing, the car still steered — which is what a
      // bump at pace does to a real car and the whole difference between
      // going light over one and flying off it.
      car.loft = Math.min(loft, T.air.leave);
      car.loftRate = bodyVy - footVy;
      car.vy = bodyVy;
      // A jump is the body going UP off the ground at `hopRate` or more, at
      // pace, over ground that is falling away faster than the flight's own
      // gravity could follow. Everything else is a hop or a drop: the ground
      // going away under a body that was barely rising, or not at all — a
      // bump, the crown of a road, a car backing off a face its nose had
      // ridden up, a creep over an edge — or a brow the flight's gravity
      // would have held the car on (`hold`), which the body bobs over; and
      // only the air's own length can make a flight of that (`hopTime`).
      // ...and a body that came off its wheels over a brow left tyres that
      // had unloaded across the whole of the loft; one whose foot plunged at
      // edge speed left tyres that were holding it a step ago — the trip.
      if (loft > T.air.leave) {
        const hop = pace < T.air.crestSpeed || bodyVy < T.air.hopRate || roadPull < T.air.gravity;
        launch(car, bodyVy, events, stats, hop, car.loftRate >= T.air.edgeSpeed);
      }
    }
  }
}

/** One airborne physics step. The velocity vector is committed; the nose
 * answers only faintly and turbulence rolls the car — flight is flight.
 * The landing at the end of it is where the car's weight is loudest: the
 * springs take what they can, the underside takes the rest, and a slam
 * past what either can swallow throws the whole car back off the ground. */
export function stepAirborne(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  stats: RunStats,
): void {
  // Nothing is thrown across a car whose wheels are off the ground: the
  // flick's load settles out in the air rather than waiting to be spent on
  // whatever the landing finds. The rear a move had unstuck settles with
  // it — there is nothing under it to be stuck to.
  car.flick = Math.max(0, car.flick - T.steering.flickSettle * T.dt);
  car.provoked = Math.max(0, car.provoked - D.provokeSettle * T.dt);
  // The chain the last corner left cools in the air like everything else the
  // tires are carrying — a jump between two corners is rubber getting a rest
  // — and nothing off the ground is spinning: a car crossed up in flight is
  // a car crossed up in flight, and the tires decide again when it lands.
  car.chain = Math.max(0, car.chain - D.linkFade * T.dt);
  car.spun = false;
  const dt = T.dt;
  const descent = car.vy;
  car.airTime += dt;
  if (!car.settling) stats.airTime += dt;
  car.steer += (input.steer - car.steer) * clamp(T.steering.rackRate * dt, 0, 1);
  car.braking = false;
  car.locked = false; // ...and nothing under the wheels to drag them across
  car.reversing = false; // nothing to back out of in the air
  car.planted = false; // ...nor anything under them to be planted on

  car.yawRate += car.steer * T.air.yawAuthority * dt;
  // A bounce is not a flight: the car is settling onto the ground it has
  // already hit, so the air's own hands stay off it.
  const air = car.settling ? 0 : 1;
  car.yawRate += (ctx.rng.next() - 0.5) * 2 * T.air.turbulence * air * dt;
  // The body keeps rolling the way the take-off sent it — the wheel does
  // nothing about it, which is the whole point of being in the air.
  car.rollRate += (ctx.rng.next() - 0.5) * 2 * T.air.rollTurbulence * air * dt;
  car.rollRate *= Math.exp(-T.air.rollDamp * dt);
  car.roll += car.rollRate * dt;
  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  car.u -= T.air.drag * car.u * dt;
  updateSlip(car);

  // Nothing is holding the driven wheels back off the ground, so they answer
  // the throttle alone and wind straight to the limiter — the undriven pair
  // keeps turning at whatever the road handed them at take-off. It goes after
  // the yaw: a car spinning in the air trades sideways speed for forward
  // speed every step, and a spin sized against the old one would leave the
  // wheels turning faster than the engine driving them.
  settleWheelspin(spec, car, input.throttle > 0 ? 1 : 0, dt);

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const carry = windCarry(car);
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;
  car.vy -= T.air.gravity * dt;
  car.y += car.vy * dt;
  // In the air the body's LONG AXIS lies along the arc: up over the launch,
  // down into the landing. Which END of it leads decides the sign, and the
  // speed the arc is read against is the whole travel, sideways included —
  // the speed floor keeps a near-vertical plunge from reading as a right
  // angle when there is barely any of it left.
  //
  // `lead` is how much of that travel comes out of the NOSE: +1 dead ahead,
  // 0 dead sideways — where the arc says nothing about the pitch, because
  // the car is falling across itself — and -1 dead astern, where a
  // descending car has its nose UP, not down. Read against the unsigned
  // speed the nose went down whichever way the car was travelling, which
  // on a hillside is a car diving into the hill: a spun car sliding
  // backwards down a slope buried its nose metres into the ground it was
  // flying over.
  const path = Math.max(6, Math.hypot(car.u, car.w));
  const lead = car.u / path;
  settlePitch(car, Math.atan2(car.vy * lead, path));

  // The ground under where the car has just moved TO — the road's profile
  // or the terrain, whichever the step is over, read there and not carried
  // forward from where the flight began: on a steep descent a stale height
  // is already above the road, which lands the car in mid-air.
  const groundNow = ctx.groundAt(car.x, car.z);
  // A hop or a bounce that finds the ground gone from under it — the body
  // bobbed over a brow and the far side was a lip, or the edge — is a
  // flight from here on: it draws the air's turbulence, books its air, and
  // is the jump the takeoff never announced.
  if (car.settling && car.airTime > T.air.hopTime) {
    car.settling = false;
    events.push({ type: "takeoff", vy: car.vy });
    stats.jumps += 1;
  }
  // WHERE THE CAR MEETS THE GROUND. Its wheels on an ordinary flight; a
  // corner of the shell on one that is going over (roll.ts, `rollStand` —
  // exactly zero for any car that is not rolling, so a jump is unchanged
  // by its being here).
  //
  // A car is four metres long, and out in the wild the ground under one
  // end of it is nothing like the ground under its middle: reading the
  // point under the middle alone flew a car pitched into a hillside on
  // through it, an end of the body a metre inside the hill, until the
  // MIDDLE finally reached the ground. So the flight lands on the plane
  // the body meets — `seatOn`, the same footprint the grounded step
  // stands the car on (ground.ts), read at the attitude the flight is
  // holding. Flat ground and the road's own smooth profile give the
  // centre back exactly, so an ordinary jump lands where it always did.
  const meets =
    groundNow + (seatOn(car, groundNow, ctx.groundAt) - groundNow) * ctx.country + rollStand(car);
  if (car.y <= meets && (car.rolling || !onItsWheels(car.roll, 0))) {
    // Nothing for the tyres to do: it is a corner of the body arriving,
    // and the roll that put it there carries on from the contact.
    landRolled(spec, car, groundNow, rollBed(ctx), events, stats);
    return;
  }
  if (car.y <= meets) {
    car.y = meets;
    car.airborne = false;
    // The wheels arrive at the ground's own speed along the path — read off
    // the ground itself over the last step's travel, never off the smoothed
    // grade: at the foot of a cliff the grade over a wheelbase says the car
    // is climbing at absurd speed, and a first grounded step handed that as
    // the wheels' momentum reads the slope it landed on as an edge and
    // throws the car straight back off it. The landing below is the jolt;
    // this only says what the wheels are doing from here on.
    const behind = ctx.groundAt(
      car.x - (sinH * car.u + cosH * car.w) * dt,
      car.z - (cosH * car.u - sinH * car.w) * dt,
    );
    car.wheelVy = (groundNow - behind) / dt;
    // ...and the foot the next grounded step measures its wheels from,
    // moving at the speed the ground here is: the flight's own speed is
    // what the springs get, not what the body carries on with.
    car.foot = footOn(car, ctx.groundAt) - groundNow;
    car.footVy = car.wheelVy;
    car.footMean = car.wheelVy;
    // A SOFT touchdown — the chassis coming back down off its own bounce,
    // or a hop's few centimetres of lift closing again — is one landing
    // still happening, not a new arrival: it pays no speed, unsettles no
    // tyres and trips nothing, and the springs are the whole of it.
    const soft = car.settling;
    // Straight nose AND upright: coming down on your side is never clean,
    // however well the nose was lined up.
    const clean =
      soft ||
      (Math.abs(car.slip) <= T.air.cleanSlipLimit &&
        Math.abs(rollTilt(car.roll)) < T.air.rollLandLimit);
    if (soft) {
      // Nothing to pay.
    } else if (clean) {
      car.u *= T.air.cleanKeep;
      stats.cleanLandings += 1;
    } else {
      car.u *= T.air.sloppyKeep;
      // Shot dampers let the whole car skip and hunt on a bad touchdown.
      const wobble = 1 + T.collision.systems.wobble * car.damage.systems.suspension;
      car.yawRate += -Math.sign(car.slip) * T.air.sloppyWobble * wobble;
    }
    // ...and a car that came down going SIDEWAYS may not be coming down on
    // its wheels for long: the tyres bite, the body does not, and it trips.
    const tumbling = !soft && tripOnLanding(spec, car, ctx.surface, events, stats);
    // The ground hits back: descent the suspension cannot absorb crushes
    // the underside (collision.ts).
    const slam = car.u * ctx.slope - car.vy;
    // ...and the wheels start hopping on their own tires. That is what the
    // car is doing for the next half second, and until it stops the tires
    // are only intermittently holding anything (`tyreLoad`). It takes the
    // HARDEST arrival so far rather than adding: a slam followed by its own
    // small rebound is ONE landing, and a chassis bounce must not stack its
    // way into a car with no grip at all.
    if (!soft) car.settle = Math.max(car.settle, clamp(slam / T.suspension.settleSlam, 0, 1));
    landingDamage(spec, car, slam, events, stats);
    // Pick the road's own vertical speed back up instead of zeroing: land on
    // a brow and the car may be off the ground again next step, and a stale
    // zero there is a bounce where there should be a flight.
    car.vy = car.u * ctx.slope;
    // The same quantity for a car that landed on its WHEELS: the descent's
    // own kinetic energy per kg, which is what the springs and the ground
    // between them just had to absorb. One scale for both, so the effects
    // never have to know which kind of arrival they are drawing.
    const took = 0.5 * slam * slam;
    events.push({ type: "landing", airTime: car.airTime, slam, took, clean });
    car.airTime = 0;
    if (tumbling) {
      // OVER IT GOES: the trip is worth more than the lift up over the
      // body's own sill corner, so the centre carries past it and nothing
      // brings the car back. Neither a bounce nor a flight — the roll owns
      // it from the next step, on the ground, turning (roll.ts).
      car.settling = false;
    } else {
      // Past what the springs can travel through, the CHASSIS comes back
      // off the ground — a real bounce, small and capped, that lands again
      // a beat later. Each rebound is a fraction of the last, so a slam
      // bounces once or twice and is done; it can never turn into a second
      // jump.
      const rebound = slam - T.suspension.bounceSpeed;
      if (rebound > 0) {
        car.airborne = true;
        car.settling = true;
        car.vy += Math.min(rebound * T.suspension.bounceKeep, T.suspension.bounceMax);
      } else {
        car.settling = false;
      }
    }
    // The springs take the whole descent as one jolt whether the chassis
    // came back up or not: this is the squat a landing travels through.
    stepSuspension(spec, car, car.vy - descent, 0);
    return;
  }
  stepSuspension(spec, car, 0, 0);
}

/** THE TRIP. A car that touches down with the body still travelling
 * sideways has tyres that stop and a roof that does not: the bottom of the
 * car catches on the ground it has just been handed and the top keeps
 * going, over the outside wheels. Below `air.tripSlide` of sideways speed
 * the tyres spend it as a skip; past it, every further m/s is roll put
 * into the body.
 *
 * Whether that is a LEAN or a ROLL is not decided here and is not a number
 * anywhere: `goesOver` weighs the roll the body has just been handed
 * against the lift up to its own sill corner (roll.ts). Under it the
 * springs take the lurch back (`leanDamp`, `rollRecover`) and the car
 * drives on; over it the car is past its outside wheels and the roll owns
 * it — which is why the same landing can be survivable at one attitude and
 * not at another.
 *
 * WHAT THE TYRES ARE STANDING ON decides how hard it is, because the trip
 * IS the tyre biting: rubber that grips checks the bottom of the car hard
 * and sends the top over it, rubber that ploughs lets the whole car wash
 * sideways instead. It scales the ROLL the bite puts in and not the
 * sideways speed that is spent skipping first — that one is the tyre
 * failing to bite at all, which is the same speed whatever it is failing
 * to bite on, and scaling both would price the surface into the trip
 * twice. Read against gravel, which is the surface the numbers above are
 * written for: a crossed-up landing on tarmac is the one that goes over,
 * and the same landing in a sand section is a long ugly slide that stays
 * on its wheels. Returns true when the car is going over. */
function tripOnLanding(
  spec: CarSpec,
  car: CarState,
  surface: Surface | "nature",
  events: GameEvent[],
  stats: RunStats,
): boolean {
  const A = T.air;
  const bite = surfaceGripFor(spec, surface) / surfaceGripFor(spec, "gravel");
  const over = Math.abs(car.w) - A.tripSlide;
  if (over > 0) {
    // Sliding to the right, the right wheels dig in and the body goes over
    // them: the right side down, which is negative roll.
    car.rollRate -= Math.sign(car.w) * Math.min(over * A.tripRoll * bite, A.tripMax);
    car.w *= A.tripKeep;
    updateSlip(car);
  }
  if (!goesOver(car.roll, car.rollRate, massSpread(spec.mass))) return false;
  beginRoll(car, events, stats);
  return true;
}
