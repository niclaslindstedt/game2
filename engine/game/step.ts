// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game orchestrator: createGame builds a run (stage + car at the start
// grid), step advances it one fixed timestep and returns the events that
// step emitted. The app's render loop and the headless simulator drive this
// same function — there is no other way to advance a run.

import { clamp } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import { flatTrack, STAGE_RULES, trainSolidsNear, type Track } from "../mapgen/index.ts";
import { TUNING } from "./defs/tuning.ts";
import { clutchDump, spinHeadroom, stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { clipKerbs, clipSolids, collideCar } from "./collision.ts";
import { CLIMATE, snowBite, snowGrip, snowRide, snowWade, temperatureAt } from "./climate.ts";
import { snowUnder, type SnowUnder } from "./snowpack.ts";
import { stepCooling } from "./cooling.ts";
import { sandAt } from "./sandstorm.ts";
import { beyondDriving } from "./damage.ts";
import { onItsWheels, stepRolling } from "./roll.ts";
import {
  boardHalfWidth,
  crossedFinish,
  crossedGate,
  crossedLip,
  locate,
  locatePoint,
  pathCurvature,
  trackLost,
  type TrackPoint,
} from "./track.ts";
import { rollTilt, updateSlip, type CarInput, type GameEvent, type GameState } from "./state.ts";
import { stepTraffic } from "./traffic.ts";
import { status } from "../output.ts";
import { blowWind } from "./start.ts";
import {
  drown,
  offRoadSurface,
  rollOutInput,
  sendBack,
  stepDrowning,
  stepOverturned,
  stepStuck,
  stepWrongWay,
} from "./recover.ts";

export { blowWind, createGame, DEFAULT_HOUR, DEFAULT_SANDSTORMS } from "./start.ts";
export type { CreateGameOptions } from "./start.ts";

const T = TUNING;

/** R27 — the crowd noise. Stands are in stage order, so passing one is
 * progress reaching its arc position: a cursor walks them, each is heard
 * exactly once, and no step ever looks at more than the stands it just went
 * by. Crawling past a crowd is not an event — nobody cheers a car being
 * driven home — so a slow pass spends the stand silently rather than
 * banking it for later. */
function cheerFor(state: GameState, events: GameEvent[]): void {
  const from = state.cheeredS;
  const to = state.progressS;
  if (to <= from) return;
  state.cheeredS = to;
  if (state.car.u < STAGE_RULES.crowd.cheerSpeed) return;
  for (const stand of state.terrain.stands) {
    if (stand.s <= from) continue;
    if (stand.s > to) break;
    events.push({ type: "cheer", size: stand.size });
  }
}

/** R28 — DID THIS MOVE TAKE THE CAR THROUGH THE BOARD IT OWES? The gate is
 * a line across the stage exactly as the finish is (`boardHalfWidth`), and
 * only ONE of them is ever armed: the next board due. That is what makes
 * the boards ordered — a car cannot take the fourth without the third — and
 * it is also what makes a missed board recoverable, since driving back down
 * the stage and through it forwards is still a crossing.
 *
 * Asked off the move the handling just made, before anything else in the
 * step can pick the car up: a respawn lands it ON the board behind it, and
 * a teleport must never be allowed to count as driving through anything.
 *
 * Progress alone would not do. Progress is the nearest sample, so a car
 * cutting the stage across country walks it past every board it never went
 * near — which is the whole thing the boards are here to catch. */
function throughBoard(state: GameState, x0: number, z0: number, x1: number, z1: number): boolean {
  const boards = state.track.checkpoints;
  const due = boards[state.checkpointsPassed];
  if (due === undefined) return false;
  return crossedGate(state.track, due.index, boardHalfWidth(state.track), x0, z0, x1, z1);
}

/** R28 — book the board the car has just driven through. */
function checkIn(state: GameState, events: GameEvent[]): void {
  const index = state.checkpointsPassed;
  state.checkpointsPassed = index + 1;
  events.push({
    type: "checkpoint",
    index,
    count: state.track.checkpoints.length,
    split: state.checkpointTimes.length,
    time: state.raceTime,
  });
  state.checkpointTimes.push(state.raceTime);
}

/** HOW MUCH OF A POINT IS OPEN COUNTRY rather than road, 0..1 — the weight
 * the terrain lattice carries against the road's own ribbon, and the weight
 * the body's corners carry against the ground under its middle (ground.ts,
 * `readSeat`).
 *
 * 0 over the mat, ramped across `offTrack.verge` and 1 from the line the
 * car counts as off the road outward, on the smoothstep R16 hands the
 * shoulder over with — so both surfaces and both seat rules meet with no
 * step and no kink at the seam the car crosses at speed. Measured against
 * the STAGE's half-width rather than the sample's, because that is the line
 * `offRoad` itself is drawn at and the two have to reach 1 together.
 *
 * A DECK has no verge to ramp across: past a parapet is air rather than a
 * shoulder leaning away, so a bridge keeps the hard edge it has always had
 * — the ribbon, clamped to the mat (track.ts, `profileOf`), for a corner
 * hanging over the parapet with the car still on the deck, and the country
 * outright for a car that has left it, which over a bridge is the river bed
 * and a car falling into it. And off the END of the road — past the apron
 * R24 shelves — the terrain owns the ground however little lateral offset
 * the fix reports.
 */
function countryShare(track: Track, fix: TrackPoint): number {
  if (track.samples[fix.index].deck != null) return fix.offRoad ? 1 : 0;
  if (fix.offRoad) return 1;
  const out = (Math.abs(fix.lateral) - track.width / 2) / T.offTrack.verge;
  const t = clamp(out, 0, 1);
  return t * t * (3 - 2 * t);
}

/** The ground under the car, refilled every step. `stepGrounded` and
 * `stepAirborne` read this and never keep a reference, and a run is 120
 * steps a second, so the whole run shares one record instead of allocating
 * one per step. Every field is written on both paths below — an off-road
 * step must not leave its terrain probe behind for the next road step. */
const GROUND: GroundContext = {
  surface: "gravel",
  hold: 1,
  groundY: 0,
  slope: 0,
  slopeLat: 0,
  roadCurve: 0,
  snowGive: 0,
  snowWade: 0,
  snowPack: 0,
  snowWall: 0,
  lip: false,
  windX: 0,
  windZ: 0,
  sand: 0,
  t: 0,
  rng: createRng(0),
  drive: 1,
  groundAt: () => 0,
  country: 0,
};

/** The reader `groundAt` uses on a green stage: no snow has ever been
 * worked anywhere, so nothing is taken off the ground and the whole model
 * is one closure call that returns zero. */
const ZERO_CUT = (): number => 0;

/** Scratch for the snow under a point — one record, refilled, because the
 * readers below run half a dozen times a step and a fresh object each
 * would be a thousand allocations a second for two numbers. */
const UNDER: SnowUnder = { rest: 0, base: 0 };

/** R47 — THE SNOW AT ONE POINT: how worked it is, and how far above the
 * bare ground it is therefore holding the wheels (`snowRide`). Written into
 * the two scratch numbers below rather than returned, because the step asks
 * it three times a tick. */
let standPack = 0;
let standRest = 0;
let standRide = 0;
function snowStand(state: GameState, index: number, x: number, z: number): void {
  snowUnder(state.track, state.terrain, index, x, z, UNDER);
  standRest = UNDER.rest;
  standPack = standRest > 0 ? state.snow.workAt(x, z, UNDER.base) : 0;
  standRide = standRest > 0 ? snowRide(standRest, standPack) : 0;
}

/** R47 — WHAT THE SNOW UNDER THE CAR IS DOING TO IT THIS STEP: how much of
 * it the wheels are ploughing, how worked it is, how hard it therefore
 * holds, and whether the car is in a rut with a wall to climb out of
 * (`snowpack.ts`, `TUNING.snow`).
 *
 * EVERY READING IS TAKEN AT THE WHEELS, never at the car's middle, and that
 * is the whole difference between a model and a decoration. The middle of a
 * car is the crown it STRADDLES: nothing has ever driven there, it is
 * untouched however many times the car has been over, and a plough depth
 * read off it is the depth of snow the car is NOT in. Read there, a car
 * driving back down its own ruts finds them exactly as heavy as fresh
 * powder and there is no reason to follow anything.
 *
 * Read AFTER the two ground branches have said what surface the car is on
 * and how hard it holds, because the polish is a multiplier on that: the
 * surface row is tuned at the worked track's own grip, and this only ever
 * hands grip back where nothing has driven. On a green stage it returns on
 * its first line. */
function readSnow(
  state: GameState,
  index: number,
  ctx: GroundContext,
  sinH: number,
  cosH: number,
): void {
  ctx.snowGive = 0;
  ctx.snowWade = 0;
  ctx.snowPack = 0;
  ctx.snowWall = 0;
  if (!state.snow.white) return;
  const car = state.car;
  // The driver's right axis in world space is (cos h, -sin h).
  const rx = cosH * T.snow.wheelAt;
  const rz = -sinH * T.snow.wheelAt;
  snowStand(state, index, car.x + rx, car.z + rz);
  const rightRide = standRide;
  const rightRest = standRest;
  let pack = standPack;
  let wade = standRest > 0 ? snowWade(standRest, standPack) : 0;
  snowStand(state, index, car.x - rx, car.z - rz);
  const leftRide = standRide;
  pack = (pack + standPack) / 2;
  wade = (wade + (standRest > 0 ? snowWade(standRest, standPack) : 0)) / 2;
  if (rightRest <= 1e-3 && standRest <= 1e-3) return;
  ctx.snowPack = pack;
  ctx.snowWade = wade;
  // Whatever snow is standing under the wheels is rise the face check
  // gives away rather than charges for — the deeper of the two lines,
  // because the car only has to be clear of one of them.
  ctx.snowGive = Math.max(rightRide, leftRide);
  ctx.hold *= snowGrip(pack);
  // THE WALL, on the side the car is sliding TOWARD: a rut holds a car
  // that is going along it and costs it nothing, and the shoulder behind a
  // car sliding the other way is not in its way.
  const side = car.w >= 0 ? 1 : -1;
  const reach = T.snow.wheelAt + T.snow.wallOut;
  snowStand(state, index, car.x + cosH * side * reach, car.z - sinH * side * reach);
  ctx.snowWall = Math.max(0, standRide - (side > 0 ? rightRide : leftRide));
}

/** R47 — AND THE SNOW THE CAR HAS JUST DRIVEN OVER IS PACKED BY IT: four
 * wheels, at the position the step left them.
 *
 * Charged by the DISTANCE covered rather than per tick, and that is the
 * whole of what makes it a physical model instead of a timer. A pass over
 * a cell is a pass whether the car crossed it at 40 m/s or crawled it, and
 * a car standing still packs nothing more than it already has — where a
 * per-tick charge would have a stationary car sink to the floor of the
 * snow in a second and a car at speed leave almost no mark at all. */
function carveSnow(state: GameState, index: number, moved: number): void {
  const car = state.car;
  const share = Math.min(1, moved / CLIMATE.pack.cell);
  if (share <= 1e-4) return;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const across = T.snow.wheelAt;
  const along = T.snow.axleAt;
  for (const lz of [along, -along]) {
    for (const lx of [across, -across]) {
      // Forward is (sin h, cos h) and right is (cos h, -sin h).
      const x = car.x + sinH * lz + cosH * lx;
      const z = car.z + cosH * lz - sinH * lx;
      snowUnder(state.track, state.terrain, index, x, z, UNDER);
      state.snow.carve(x, z, UNDER, share);
    }
  }
}

/** What this step multiplies the drive by, and the SPENDING of the mass
 * start's catch-up: past the end of its window a slot owes nothing more and
 * the ledger is torn up, so a circuit that winds progress back to the grid
 * for its second lap cannot launch the whole field a second time. */
function driveGain(state: GameState): number {
  const owed = state.catchUp;
  if (!owed) return 1;
  if (state.progressS >= owed.untilS) {
    state.catchUp = null;
    return 1;
  }
  return 1 + owed.gain;
}

/** Seconds until the lights go out, counting down through the whole start
 * control: `intro + countdown` on the first frame, 0 the moment the stage
 * is live. The HUD's gantry and the tick on the audio bed both read it, so
 * neither has to know how the beats before the green are divided up. */
export function startsIn(state: GameState): number {
  if (state.phase !== "intro" && state.phase !== "countdown") return 0;
  return Math.max(0, T.intro + T.countdown - state.t);
}

/** Skip the establishing shot: hand the car straight to the start line with
 * the lights already counting. Returns the seconds of sim it jumped, which
 * is what everything ELSE on the road owes to keep the stagger — a start
 * control the player walked out of early is still a start control.
 *
 * A no-op once the lights are up: the countdown itself is the one part of
 * the start nobody gets to skip. */
export function skipIntro(state: GameState): number {
  if (state.phase !== "intro") return 0;
  const jumped = T.intro - state.t;
  state.t = T.intro;
  state.phase = "countdown";
  state.stuck.since = state.t;
  return jumped;
}

/** Advance the run by one fixed timestep. Returns the events it emitted. */
export function step(state: GameState, input: CarInput): GameEvent[] {
  const events: GameEvent[] = [];
  state.t += T.dt;

  // The wind blows through every phase — the grid's flags and fumes drift
  // before the lights go green — and so does the storm that is bringing it,
  // so a stage can be started with the wall already on the horizon.
  blowWind(state.env, state.t, state.wind);
  sandAt(state.env, state.t, state.sand);
  // R44 — and the traffic drives through every phase too: the public roads
  // do not wait for the lights. It is resolved against the car HERE, off
  // the pose the last step left, exactly as the rival field is on its own
  // tick — and the car's own step below starts from whatever it was dealt.
  stepTraffic(state, events);

  // THE START CONTROL. Two beats, one held car: the establishing shot while
  // the crew in front leaves, and then the lights. Both are the same thing
  // as far as the car is concerned — nothing it does moves it — so they
  // share the grid hold below and differ only in when they hand over.
  if (state.phase === "intro" || state.phase === "countdown") {
    if (state.phase === "intro") {
      if (state.t >= T.intro) state.phase = "countdown";
    } else if (state.t >= T.intro + T.countdown) {
      state.phase = "racing";
      events.push({ type: "go" });
    }
    // The grid: steering wiggles are allowed, the car does not move — and
    // a throttle held through the lights is revving, not being wedged, so
    // the wedge clock only starts when the flag drops.
    //
    // REVVING IS THE ONE THING THE GRID DOES. Nothing is geared yet and the
    // road speed the revs are normally read off is zero, so here they are
    // their own state: the throttle blips them up and the flywheel lets
    // them fall. It is the only thing the player can do while they wait,
    // and both the tachometer and the engine note answer it.
    const grid = state.car;
    const revTarget = clamp(input.throttle, 0, 1);
    const revRate = revTarget > grid.rev ? T.revs.blip : T.revs.settle;
    grid.rev += (revTarget - grid.rev) * clamp(revRate * T.dt, 0, 1);
    // ...and on the green those revs are handed to the tyres. Everything the
    // engine was carrying arrives at a standing axle in one go, so the driver
    // who spent the countdown against the limiter leaves on four spinning
    // wheels and the one who waited with the pedal up simply drives away.
    // The seed goes in on the last grid frame, which is this one: the car is
    // handed to the handling model already lit.
    if (state.phase === "racing") grid.launchSpin = clutchDump(state.spec, grid, state.surface);
    grid.pedal = revTarget;
    state.stuck.since = state.t;
    return events;
  }
  // NOBODY IS DRIVING IT until the step below says otherwise. Every branch
  // from here to the handling is a car out of the driver's hands — the
  // flag is out, it is under water, it is on its roof — and a pedal left
  // at whatever it was last pressed to is an engine still drinking at a
  // car nobody is in. The driven case writes it back beside the cooling.
  state.car.pedal = 0;
  if (state.phase === "finished" || state.phase === "retired") return events;

  // R25 — the roll-out. The clock has stopped; the car has not. Nothing the
  // player is doing reaches it any more: it coasts down the run-out on a
  // trailing brake, holding the road it is on, until it is stopped.
  if (state.phase === "rollout") state.rollout += T.dt;
  else state.raceTime += T.dt;
  // Going down in deep water is time that still costs the run but is not
  // being driven — the clock above runs, and nothing below it does.
  if (state.drowning) {
    stepDrowning(state, events);
    return events;
  }
  // ...and neither is a car lying on its roof. The roll has stopped and it
  // has stopped somewhere nobody drives away from, so the same rule holds:
  // the clock above runs and nothing below it does, until the crew are put
  // back at the last split board.
  if (state.overturned) {
    stepOverturned(state, events);
    return events;
  }
  const drive = state.phase === "rollout" ? rollOutInput(state) : input;
  const car = state.car;
  const track = state.track;
  const terrain = state.terrain;
  const prevX = car.x;
  const prevZ = car.z;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress and respawn. Both searches start
  // from where the car IS (`nearIndex`), never from how far the run has
  // GOT: progress is a monotonic score and a car that has doubled back
  // leaves it standing hundreds of metres up the road. The road's grade is
  // read from behind the CAR, so a car pointed down the stage asks for it
  // from up the stage (`locate`'s `back`).
  const hint = state.nearIndex;
  const flat = flatTrack(track);
  const back = sinH * flat.sinHeading[hint] + cosH * flat.cosHeading[hint] < 0;
  const preFix = locate(track, car.x, car.z, hint, back);
  const gain = driveGain(state);
  // WHERE THE CAR IS GOING, in world space — which sideways is nowhere near
  // where it is pointing. Everything below that asks the ground what it is
  // about to do to the car reads this rather than the heading: the shape
  // that throws a car is the shape under its PATH, and a car crossing a
  // brow in a drift meets it just as squarely as one driving straight at
  // it. (Both takeoff gates already read `pace` for the same reason — this
  // is the direction half of the same idea.)
  const dirX = sinH * car.u + cosH * car.w;
  const dirZ = cosH * car.u - sinH * car.w;
  // ONE GROUND, road and country alike — the surface every height in the
  // step below is read off, wherever it is asked about.
  //
  // The two are stated in different places: the mat is the road's own
  // ribbon (`locate` — its crown, its wheel tracks, the shoulder), and the
  // country is the terrain lattice, which is what the renderer draws and
  // what R16's hand-over leans the shoulder onto. They agree over the mat
  // and for the bare metre and a half past it, and then they part: the
  // ribbon's cross-section is a FORMULA and runs on for ever, gently, where
  // the real ground drops away down an embankment. Metres out — which is
  // where a car's own corners are asking (ground.ts, `corners`) — the
  // ribbon is a fiction worth up to a body's height.
  //
  // That fiction never stayed a height. The body's momentum is measured
  // against the ground the wheels found (`Seat.foot`), and reading the
  // fiction on one step and the truth on the next made a foot that fell at
  // tens of m/s — a whole loft opened in a single hundred-and-twentieth of
  // a second, on ground that only ever went down, and the car thrown up
  // into the air at the verge line and left riding the fiction across the
  // country. A seam between two readers is not a shape; it is a teleport.
  //
  // So the ribbon hands over to the terrain ACROSS the verge, on the same
  // smoothstep R16 draws with, and by the line where the car counts as off
  // the road the two branches below are reading the identical surface. A
  // DECK is the exception the ribbon is right about: past a parapet is air,
  // not a verge, and the lattice under a bridge is the river bed.
  //
  // R47 — ...and on a white stage, less however far the traffic has
  // already worked the snow down here (`snowpack.ts`). Everything that
  // DREW the world drew it at the untouched depth — the tiles, the road
  // mesh, the shelf — so the trail is a hole taken out of the drawn
  // ground rather than a shape either reader knows about, and it is
  // taken out of BOTH of them at once, which is what keeps the seam at
  // the verge a seam a car drives over.
  const snow = state.snow;
  const cut = snow.white ? snow.cutAt : ZERO_CUT;
  const groundAt = (x: number, z: number): number => {
    const fix = locate(track, x, z, preFix.index);
    const share = countryShare(track, fix);
    const sank = cut(x, z);
    if (share <= 0) return fix.elevation - sank;
    if (share >= 1) return terrain.groundAt(x, z) - sank;
    return fix.elevation + (terrain.groundAt(x, z) - fix.elevation) * share - sank;
  };
  const country = countryShare(track, preFix);
  // The ground under the car as the step BEGINS, read off that same one
  // surface: `wheelSpeed` divides the move by `dt`, so a pre-move height
  // from a different reader than the post-move one is the seam again.
  const groundY = country <= 0 ? preFix.elevation - cut(car.x, car.z) : groundAt(car.x, car.z);
  let ctx: GroundContext;
  if (preFix.offRoad) {
    // The wild: the terrain owns the ground — the RIDDEN lattice surface
    // (terrain.groundAt), which is the exact ground the renderer draws.
    // The brow is read along the TRAVEL over the same wide baseline the
    // road uses, so the crest check fires off a mountain shoulder exactly
    // like it fires off a lip — this is where the spontaneous cliff jumps
    // come from. The grade the car stands on is read over its own short
    // baseline, along the heading AND across it: the along slope pitches
    // the nose and pushes back on a climb, the lateral slope pulls the car
    // toward the hillside's downhill side.
    const ground = terrain.groundAt;
    const span = T.air.crestSpan;
    const grade = T.hills.gradeSpan;
    const here = ground(car.x, car.z);
    // A stationary car has no path to read a brow along; the nose is the
    // only direction it has, and at a standstill nothing is launching anyway.
    const pace = Math.hypot(dirX, dirZ);
    const goX = pace > 1e-6 ? dirX / pace : sinH;
    const goZ = pace > 1e-6 ? dirZ / pace : cosH;
    const fwd = ground(car.x + goX * span, car.z + goZ * span);
    const back = ground(car.x - goX * span, car.z - goZ * span);
    const ahead = ground(car.x + sinH * grade, car.z + cosH * grade);
    const behind = ground(car.x - sinH * grade, car.z - cosH * grade);
    // The car's right axis in world space is (cos h, -sin h).
    const right = ground(car.x + cosH * grade, car.z - sinH * grade);
    const left = ground(car.x - cosH * grade, car.z + sinH * grade);
    ctx = GROUND;
    // Off the stage is not always off the ROAD: the asphalt branches the
    // route abandons at its junctions (R17) are real tarmac, and a car
    // exploring one gets tarmac grip on it.
    ctx.surface = offRoadSurface(state, car.x, car.z);
    // Deep snow holds as the air at the car's own height makes it hold.
    ctx.hold = ctx.surface === "snowfield" ? snowBite(temperatureAt(track.climate, car.y)) : 1;
    ctx.groundY = groundY;
    ctx.slope = (ahead - behind) / (2 * grade);
    ctx.slopeLat = (right - left) / (2 * grade);
    ctx.roadCurve = (fwd + back - 2 * here) / (span * span);
    // A brow out in the country is a shape the ground happens to have, and
    // the car bobs over it or is thrown by it on the strength of its own
    // momentum alone. The training ground is the one place off a road where
    // something was BUILT to throw the car (`mapgen/arena.ts`), and its
    // ramp's lip is entitled to the same launch a stage's jump gets: off
    // the top, at the speed the ramp was drawn around, rather than glued to
    // the landing face until the flight starts late and reads as a hop.
    ctx.lip = track.arena !== null && track.arena.lipAt(car.x, car.z);
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.sand = state.sand.sand;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    // The car's own corners reach back over the mat it has just left, and a
    // corner over a road is standing on the road: the shared surface above,
    // not the bare lattice, which is why this is not `terrain.groundAt`.
    ctx.groundAt = groundAt;
    ctx.country = country;
  } else {
    // How sharply the road curves under the car ALONG ITS PATH — what
    // decides whether it throws the car, and how much of the car's weight
    // is still on the tires while it does not. Both the stage's brows and
    // the road's own cross-section, weighted by which way the car is going
    // (`pathCurvature`). A jump lip anywhere in that window is NOT a brow:
    // its drop is an EDGE the ground-follow throws the car off (car.ts,
    // `air.edgeSpeed`), and reading it here would fire a stutter of hops on
    // the run-up instead — and the lip owns the whole surface there,
    // cross-section included.
    const reach = Math.max(1, Math.round(T.air.crestSpan / track.step));
    const lipNear =
      crossedLip(track, Math.max(-1, preFix.index - reach - 1), preFix.index + reach) >= 0;
    // THE GRADE, TURNED ONTO THE CAR'S OWN AXES. The road states its shape
    // in its own frame — `slope` down the centerline, `slopeLat` across it —
    // and a car is under no obligation to agree with either. `GroundContext`
    // asks for the gradient on the CAR's axes (it is what gravity is
    // resolved along, what pitches the nose and leans the body, and what the
    // wheels' vertical speed is dotted against), and the wild's branch below
    // reads its ground that way. Handing the road's own frame over unturned
    // gave every car pointed the other way an inverted hill: gravity pushing
    // it back down a descent and hurrying it up a climb, the camber pulling
    // it toward the crown, and the nose sitting on the wrong attitude the
    // whole way. Straight down the stage `turn` is 0 and this is the
    // identity, which is why it went unnoticed.
    const fwdX = flat.sinHeading[preFix.index];
    const fwdZ = flat.cosHeading[preFix.index];
    // The car's nose against the road's, as a rotation: cos and sin of the
    // angle between them, taken off the two unit vectors rather than an
    // atan2 nobody needs the angle from.
    const turnCos = sinH * fwdX + cosH * fwdZ;
    const turnSin = sinH * fwdZ - cosH * fwdX;
    ctx = GROUND;
    ctx.surface = preFix.surface;
    // A road with a storm running over it is a road with sand ON it, and
    // loose material on a made surface is the classic desert hazard: the
    // hold goes with it for as long as the front lasts (`sandstorm.ts`).
    ctx.hold = track.samples[preFix.index].bite * (1 - state.sand.sand * T.sand.grip);
    ctx.groundY = groundY;
    ctx.slope = preFix.slope * turnCos + preFix.slopeLat * turnSin;
    ctx.slopeLat = preFix.slopeLat * turnCos - preFix.slope * turnSin;
    ctx.roadCurve = lipNear ? 0 : pathCurvature(track, preFix, dirX, dirZ);
    ctx.lip = lipNear;
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.sand = state.sand.sand;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    // On the mat the road IS the ground: its own profile — crown, tracks,
    // shoulder and the grassed slope past it (R16), interpolated between
    // samples — read wherever the step lands the car, and handed over to
    // the country past the verge by the shared reader above. Nothing is
    // seated on the profile: a road is smooth across the body's length, and
    // the cross-section under the wheels is what the car is meant to ride,
    // not a face to be lifted clear of — which is what `country` says.
    ctx.groundAt = groundAt;
    ctx.country = country;
  }
  // R47 — ...and the winter on top of whichever of the two it was: how
  // deep the snow the wheels are pushing through is, how worked it is,
  // and what both do to the grip the branch above just settled.
  readSnow(state, preFix.index, ctx, sinH, cosH);

  if (car.rolling) {
    // Past its outside wheels and turning: the body is a shape going over
    // (roll.ts) — including the flights BETWEEN its contacts, which belong
    // to the roll and not to the ordinary air, because a turning body flies
    // about its own centre while the wheel plane the air flies goes round
    // with it. The DRIVER is still in it: the pedals and the wheel reach the
    // world through whatever of the car is still standing on rubber, which
    // on two wheels is most of it and on a roof is none. It ends either back
    // on its wheels or lying on a flank or its roof, and `stepOverturned`
    // above is what happens in the second case.
    stepRolling(state.spec, car, drive, ctx, events, state.stats);
  } else if (car.airborne) {
    stepAirborne(state.spec, car, drive, ctx, events, state.stats);
  } else {
    stepGrounded(state.spec, car, drive, ctx, events, state.stats);
  }
  // THE TEMPERATURE, stepped after the move that made it: the engine's heat
  // comes from the pedal that was just asked for, and the air that carries
  // it away from the pace the car is actually doing. A sound car never
  // moves the needle; a holed radiator is a clock the driver is racing
  // (game/cooling.ts), and one that runs out is an engine at 1 — which is
  // the retire below.
  stepCooling(car, drive.throttle, car.u, T.dt, events);
  // ...and the pedal that made it, kept for the presentation to read: the
  // exhaust is fuel burned, and this is the half of that the needle cannot
  // tell it (`CarState.pedal`).
  car.pedal = clamp(drive.throttle, 0, 1);
  // ...and WHERE that roll stopped is the whole of the question. Asked of
  // a body that has finished moving, so a car mid-roll and a car in the
  // air are both still having their go: only one that is down, still and
  // past the basin its own weight could right it from has actually come to
  // rest on something that is not its wheels.
  // ...asked of the ROLL and of the BOX'S OWN PITCH, but never of the
  // springs'. `car.pitch` is two things under one name: the rotation a
  // crashing body has been left at, and the nose angle a DRIVEN car carries
  // on its suspension — and the second reaches `attitude.pitchMax` where the
  // box stops standing on its tyres at less than half of that, so reading it
  // raw declares a car merely driving down a hill to be up on its bumper,
  // `stepOverturned` returns before anything moves, and the car freezes on
  // the spot. `settlePitch` CLAMPS the springs at that number, so the two
  // meanings separate exactly: within it, it is an attitude and reads level;
  // past it, nothing but a crash can have put the car there.
  //
  // And it has to be read, because with a free pitch axis half the ways a
  // car ends up off its wheels do not show in the roll at all. A body at no
  // roll and half a turn of pitch is lying on its ROOF — and was left there
  // for good, because the run never marked it overturned and the crew were
  // never taken back. One at half a turn of BOTH is sitting squarely on its
  // tyres facing backwards, and was being teleported to the last board for
  // it.
  const nose = Math.abs(rollTilt(car.pitch)) > T.attitude.pitchMax ? car.pitch : 0;
  if (!car.rolling && !car.airborne && !onItsWheels(car.roll, nose)) {
    state.overturned = { since: state.t };
  }
  // R47 — THE TRAIL. The wheels that have just been carried over the snow
  // packed what they crossed, and it stays packed: the next lap, the next
  // corner taken twice, and the way back out of the field are all driven
  // on it. Only a car standing on its wheels leaves one — a car in the
  // air is over the snow and a rolling one is throwing it about, and
  // neither is pressing four contact patches into it.
  if (state.snow.white && !car.airborne && !car.rolling) {
    carveSnow(state, preFix.index, Math.hypot(car.x - prevX, car.z - prevZ));
  }

  const fix = locatePoint(track, car.x, car.z, state.nearIndex);
  // The finish is a LINE across the road, and the move just made is what
  // either crossed it or did not. Asked here rather than at the end of the
  // step, so a respawn cannot teleport the car over the gate and win.
  // ...and never on the training ground, whose ribbon is an approach road
  // and not a stage: its far end is a place the car drives out of onto the
  // pad, not a line the session is over at.
  const finished =
    !track.endless && track.arena === null && crossedFinish(track, prevX, prevZ, car.x, car.z);
  // R28 — and the split board it owes, asked here for the same reason.
  const checkedIn = throughBoard(state, prevX, prevZ, car.x, car.z);
  state.nearIndex = fix.index;
  // R22 — A CIRCUIT'S ROAD RUNS BACK INTO ITS OWN START LINE, so its first
  // sample and its last are the same piece of gravel and the nearest-sample
  // search is free to answer with either. Progress only ever creeps forward,
  // which on a sprint is the whole of the rule — but on a circuit the car
  // stands ON that seam twice a lap: once on the grid, once on the line it
  // laps at. Taking the far end there pins progress at the length of the
  // road for the WHOLE of the next lap, and everything downstream reads it:
  // the pacenotes, the crowd, the gauge on the map, and the bot's plan,
  // which is why a bot that drove lap one cleanly used to spend laps two
  // and three driving a stage it thought it had already finished.
  //
  // So a jump of more than half a lap ahead is the ROAD wrapping, not the
  // run advancing, and progress ignores it. There is nothing to weigh: a
  // car cannot cover half a lap in one step, so the only thing this rule
  // can ever throw away is the seam.
  const wrapped = track.circuit && fix.index - state.progressIndex > track.samples.length / 2;
  if (!wrapped) state.progressIndex = Math.max(state.progressIndex, fix.index);
  state.progressS = track.samples[state.progressIndex].s;
  state.lateral = fix.lateral;
  state.stats.topSpeed = Math.max(state.stats.topSpeed, car.u);
  // THE ODOMETER'S OWN NUMBER: the ground this step actually covered,
  // measured off the move rather than off the speedo, so a car sliding
  // sideways is credited with the arc it travelled and a car sitting on the
  // brakes with its wheels lit up is credited with nothing. Taken from the
  // same `prevX`/`prevZ` the finish line and the split boards are crossed
  // between — a respawn or a placed car moves the body outside the step, so
  // the teleport is never in the reading.
  state.stats.distance += Math.hypot(car.x - prevX, car.z - prevZ);
  // Revs on the move: the DRIVEN WHEELS read back through the gearing, which
  // with a gear engaged is the only thing the crank can be doing. Normally
  // that is just how far up the gear the road speed is; when the axle is lit
  // up (`car.wheelspin`) the needle flares away from the road with the
  // wheels, which is what wheelspin looks and sounds like in a car. The
  // limiter caps both. The gearbox still shifts on ROAD speed, so a flare
  // can never be mistaken for a gear that has run out.
  // An endless stage keeps the road materialized well past the horizon —
  // the bot's plan, the pacenotes, and the renderer all read ahead of the
  // car, and none of them may ever see the end of the world.
  if (track.endless) track.extend?.(state.progressS + STAGE_RULES.endless.horizon);
  terrain.sync(state.progressS);
  // R26 — the marking keeps up with the road for the same reason the
  // terrain does, and an endless run forgets what it has driven past.
  state.kerbs.extend(track.samples.length);
  if (track.endless) state.kerbs.pruneBefore(state.progressS - 400);

  // Water reads as an event on entry (the splash) and as a surface while
  // in it (the grounded step already slowed the car down) — on the road's
  // fords and out in the wild's lakes and streams alike.
  const nowSurface = car.airborne
    ? state.surface
    : fix.offRoad
      ? offRoadSurface(state, car.x, car.z)
      : track.samples[fix.index].surface;
  if (!car.airborne && nowSurface === "water" && state.surface !== "water") {
    events.push({ type: "splash", speed: Math.abs(car.u), deep: false });
    state.stats.splashes += 1;
  }
  state.surface = nowSurface;

  // Off-road accounting. Exploring never times out: nothing but a crash —
  // or the reset input — brings a wandering car back to the track.
  if (fix.offRoad !== state.offRoad && !car.airborne) {
    state.offRoad = fix.offRoad;
    state.offRoadSince = state.t;
    events.push({ type: "offRoad", off: fix.offRoad });
  }
  if (state.offRoad) state.stats.offRoadTime += T.dt;
  // The wrong way first, because it can VETO being lost. A car that has
  // turned round on the road is reported off it by the fix above — that
  // search cannot reach back past thirty metres — and the way-home
  // guidance believes it: RETURN TO TRACK, over a car whose wheels are on
  // the track. `stepWrongWay` takes an honest fix to answer its own
  // question, so when it says the car is on the road going backwards, it
  // is the one that knows.
  stepWrongWay(state, fix);
  state.lost = !state.wrongWay && trackLost(state);

  // Solid contact: deep water still swallows the car whole, but the wild's
  // props and the forest's trunks BEND it instead of ending it — impulse,
  // crush and yaw kick live in collision.ts, and no amount of it ever ends
  // the excursion. Keep hitting things until the car cannot move.
  let crashed = false;
  // R13 — the parapet, and it is checked whether or not the car is off the
  // road. It stands ON the deck's edge: the car it exists for is the one
  // that has only just put a wheel wide, and by the time the road is
  // willing to call that car off-road it is already through the wall and
  // into the river. Nothing to pay where there are no bridges near — the
  // field answers an empty list off one lookup. A homestead's walls, cars
  // and lane trees (R37) come out of the same query for the same reason: a
  // car up the drive is on a road, and the trees beside it are still trees.
  const fixtures = terrain.fixturesNear(car.x, car.z, 2.5);
  if (fixtures.length > 0) {
    collideCar(state.spec, car, fixtures, events, state.stats, terrain.fell);
  }
  // R41 — and the TRAIN, wherever it is on its line this second: a run of
  // moving solids on the rails, standing only where the car is near the
  // line and a wagon is over that piece of it. Checked on the road or off
  // it, for the parapet's reason — the crossing IS the road.
  for (const crossing of state.track.rails) {
    const wagons = trainSolidsNear(crossing, state.t, car.x, car.z, 2.5);
    if (wagons.length > 0) collideCar(state.spec, car, wagons, events, state.stats);
  }
  if (fix.offRoad) {
    const water = terrain.waterAt(car.x, car.z);
    if (water !== null && water - car.y > T.crash.deepWater) {
      // The entry gets its own splash whether or not the shallows already
      // gave it one: a car going under displaces a different amount of
      // water from a car wading, and this is the big one. A plunge
      // straight off a cliff into the sea never grounds in the shallows at
      // all, so for that one this is also the only splash there is.
      events.push({
        type: "splash",
        speed: Math.hypot(car.u, car.vy),
        deep: true,
      });
      // ...but the STAT counts water ENTRIES, not splash events, and the
      // shallows this car waded through to get here already booked one.
      // Double-counting would quietly file every drowning in the sim
      // table's ford column as two fords.
      if (state.surface !== "water") state.stats.splashes += 1;
      drown(state, events, water);
      crashed = true;
    }
    if (!crashed) {
      const solids = terrain.obstaclesNear(car.x, car.z, 2.5);
      solids.push(...terrain.treesNear(car.x, car.z, 2.5));
      // The field is handed the right to take a solid OUT of the world: a
      // trunk the car snapped, a stone it knocked off its bed. Nothing
      // stands there afterwards on either side of the wall — the piece is
      // a `solidBreak` the renderer tumbles away. What stands under the
      // ride-over bar is the WHEELS' business first (a thump and a lurch,
      // `clipSolids`); the body only meets what stands over it.
      if (solids.length > 0) {
        clipSolids(state.spec, car, state.t, solids, events, terrain.fell);
        collideCar(state.spec, car, solids, events, state.stats, terrain.fell);
      }
    }
  }
  // R26 — and the anti-cut blocks, which are tested WHEREVER the car is.
  // A block's inner edge sits inside the road's own edge, so the wheel that
  // mounts one belongs to a car whose centre is still on the road and whose
  // `offRoad` is still false: gating this on leaving the road would make
  // every apex on the stage free to cut by exactly the margin that matters.
  if (!crashed) {
    clipKerbs(state.spec, car, state.t, state.kerbs.blocksNear(car.x, car.z, 2.5), events);
  }
  // A wreck is driven, not teleported: wear reaching 1 leaves a car with
  // nothing left to give still sitting where it stopped. Only the wedge
  // check below, or the reset input, ever brings it home — and the two land
  // in different places (see `respawn`).
  //
  // Neither reaches a car that is BEYOND DRIVING — a dead engine, two
  // wheels gone. Putting one of those back on the road would only park it
  // there: the run is over, and it is over where the car comes to rest
  // (`retire` below), not at a board it will never drive away from.
  const done = beyondDriving(car);
  if (done === null) {
    if (drive.reset && !crashed) sendBack(state, events);
    else if (!crashed) stepStuck(state, drive, events);
  } else if (
    state.phase === "racing" &&
    !crashed &&
    !car.airborne &&
    Math.abs(car.u) <= T.collision.retire.restSpeed &&
    Math.abs(car.w) <= T.collision.retire.restSpeed
  ) {
    state.phase = "retired";
    car.u = 0;
    car.w = 0;
    car.yawRate = 0;
    updateSlip(car);
    events.push({ type: "retire", reason: done });
    status(`Retired from stage ${state.seed} (${done}) after ${state.raceTime.toFixed(2)} s`);
  }

  // R25 — the crowd, which only exists to be driven past.
  if (state.phase === "racing") cheerFor(state, events);
  // R28 — the split board this move drove through, if it drove through one.
  if (checkedIn && state.phase === "racing") checkIn(state, events);

  // R28 — THE STAGE IS ALL OF ITS BOARDS. A line crossed with splits still
  // owed is a stage that was cut rather than driven, so it books nothing:
  // not the lap, not the finish. The run simply carries on, and the way
  // back to the board it owes is the way it always is — turn round and
  // drive to it, or take the way-home button, which puts the car at the
  // last board it DID take and hands it the road from there.
  const owed = track.checkpoints.length - state.checkpointsPassed;
  if (finished && owed > 0 && state.phase === "racing") {
    events.push({ type: "missed", next: state.checkpointsPassed, count: track.checkpoints.length });
  }

  // Through the gate. On a circuit (R22) it is the same line the run
  // started on, so crossing it books a lap and — until the last one — puts
  // the car back at the top of the road it is already standing on. On the
  // last crossing the CLOCK is over; the car need not be, because a sprint
  // has R25's run-out behind its gate and coasts down it. Whatever has no
  // run-out — a circuit, a synthetic rig, an endless stage's absent finish
  // — is simply over at the line, having nothing to coast down.
  if (finished && owed <= 0 && state.phase === "racing") {
    const lapTime = state.raceTime - state.lapStart;
    const best = state.lapTimes.every((t) => lapTime < t);
    state.lapTimes.push(lapTime);
    if (state.lap < state.laps) {
      events.push({ type: "lap", lap: state.lap, time: lapTime, best });
      status(`Lap ${state.lap} of stage ${state.seed} in ${lapTime.toFixed(2)} s`);
      state.lap += 1;
      state.lapStart = state.raceTime;
      // The road carries straight on into its own opening straight, so
      // progress starts again from the grid — which is where the car
      // physically is.
      state.progressIndex = 0;
      state.progressS = track.samples[0].s;
      // R28 — the boards are the LAP's, so the next lap drives through all
      // of them again. The times stay on one list for the whole run.
      state.checkpointsPassed = 0;
      // R27's crowd is windowed on the same arc position, so it needs the
      // same rewind: a mark left at the end of the last lap is one the
      // whole of the next lap sits behind, and nobody would cheer again.
      state.cheeredS = state.progressS;
    } else {
      events.push({ type: "finish", time: state.raceTime });
      status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
      state.phase = track.finishS !== null ? "rollout" : "finished";
      state.rollout = 0;
    }
  }
  // ...and the end of the roll-out: stopped, or out of road to stop on.
  if (
    state.phase === "rollout" &&
    (car.u <= T.rollOut.restSpeed ||
      state.rollout >= T.rollOut.maxTime ||
      state.progressIndex >= track.samples.length - 1)
  ) {
    state.phase = "finished";
  }

  // Revs on the move: the DRIVEN WHEELS read back through the gearing, which
  // with a gear engaged is the only thing the crank can be doing. Normally
  // that is just how far up the gear the road speed is; when the axle is lit
  // up (`car.wheelspin`) the needle flares away from the road with the
  // wheels, which is what wheelspin looks and sounds like in a car. The
  // limiter caps both. The gearbox still shifts on ROAD speed, so a flare
  // can never be mistaken for a gear that has run out.
  //
  // LAST IN THE STEP, both of them, because the handling is not the last
  // thing in it to move the car: a shunt, the ground catching a car that has
  // spun round, a respawn — all land after the spin was sized against the
  // headroom the gear had at the time, and any of them can leave an axle
  // turning faster than the engine driving it, which is the one thing this
  // model exists to rule out. Cheap to re-clamp, and nothing later can undo
  // it.
  car.wheelspin = Math.min(car.wheelspin, spinHeadroom(state.spec, car));
  car.rev = clamp(
    (Math.max(0, car.u) + car.wheelspin) / state.spec.gearTop[car.gear],
    0,
    T.revs.limiter,
  );

  return events;
}
