// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car-to-track queries: progress tracking along the sampled centerline,
// signed lateral offset, and the driving surface under the car. Progress is
// found by a bounded local search around the last known sample, so the cost
// per step is constant and progress only ever creeps forward while the run
// is being driven — a car that leaves the road keeps its last on-road
// progress. The one thing that moves it back is a respawn, which puts the
// car at a checkpoint (R28) and hands it the road since that board to drive
// again.

import { STAGE_RULES, finishIndex, type Surface, type Track } from "../mapgen/index.ts";
import { BLOCK, flatTrack, GROUP, GROUP_SHIFT, type FlatTrack } from "../mapgen/flat.ts";
import { corridorOffset, crossOffset, ROAD_CROSS } from "../mapgen/road.ts";
import { TUNING } from "./defs/tuning.ts";
import type { GameState } from "./state.ts";

/** A place on the road, with the way to it from where the car is standing.
 * Two of them matter, and they are DIFFERENT places: `wayHome` is the
 * nearest road at the car's own progress — where the co-driver points a
 * driver who is picking their way back — and `lastCheckpoint` is the board
 * a respawn puts the car back at, which is behind that and costs the road
 * in between. */
export type WayHome = {
  x: number;
  /** Road elevation at that point, m. */
  y: number;
  z: number;
  heading: number;
  /** Index of the sample it stands on — what a respawn winds progress back
   * to, so the run is not credited with road it is about to drive again. */
  index: number;
  /** Ground distance from the car to it, m. */
  distance: number;
  /** Where it lies relative to the way the car is POINTING, radians: 0 dead
   * ahead, ±π/2 straight out to the sides, ±π directly behind. The way home
   * being BESIDE the car is a different situation from it being behind it —
   * one is a car crossing a clearing, the other is a car leaving. */
  bearing: number;
};

/** WHERE THE ROAD IS from here: the car's own progress on it, which is the
 * furthest it has got — a car that doubles back is pointed forward to where
 * it earned, not at the nearest piece of road behind it. The one place it
 * stops short is the finish: a run ends by driving THROUGH the gate, so it
 * never points at a line the car still has to cross.
 *
 * This is the co-driver's call and nothing else. Where the RESET button
 * takes the car is `lastCheckpoint`. */
export function wayHome(state: GameState): WayHome {
  const track = state.track;
  const index = track.endless
    ? state.progressIndex
    : Math.min(state.progressIndex, Math.max(0, finishIndex(track) - HOME_BACKOFF));
  return poseAt(state, index);
}

/** R28 — WHERE A RESPAWN PUTS THE CAR: the last split board it drove
 * through this lap, or the start line while it has passed none. A car that
 * drowned, wedged itself or gave up loses the road since that board and
 * drives it again — which is the whole reason the boards sit just past the
 * corners that are worth being sent back through. */
export function lastCheckpoint(state: GameState): WayHome {
  const passed = state.checkpointsPassed;
  const board = passed > 0 ? state.track.checkpoints[passed - 1] : undefined;
  return poseAt(state, board?.index ?? 0);
}

/** The pose of a centerline sample, with the way to it from the car. */
function poseAt(state: GameState, index: number): WayHome {
  const s = state.track.samples[index];
  const car = state.car;
  // The car's own axes: forward is (sin h, cos h) and its right is
  // (cos h, -sin h) — the same frame the handling and the terrain reads use.
  const dx = s.x - car.x;
  const dz = s.z - car.z;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  return {
    x: s.x,
    y: s.elevation,
    z: s.z,
    heading: s.heading,
    index,
    distance: Math.hypot(dx, dz),
    bearing: Math.atan2(dx * cosH - dz * sinH, dx * sinH + dz * cosH),
  };
}

/**
 * IS THE PLAYER LOST — the one question the way-home guidance answers to.
 *
 * Off the road is not lost. Two wheels on the verge is off the road; so is a
 * car cutting the inside of a hairpin, and so is one crossing a clearing
 * with the stage running along beside it. What a driver actually needs
 * telling is that they are LEAVING: far enough out that the road is not the
 * next thing under the wheels, and pointed away from it rather than across
 * it (TUNING.offTrack.guide).
 *
 * Coming ON is the interesting half; going OFF is not a threshold at all.
 * RETURN TO TRACK is an instruction, and the only thing that carries it out
 * is the track being under the wheels again — so once it is up, the car
 * being back on the road is the one thing that takes it down. Nearing the
 * road is not reaching it and neither is aiming at it: a sign that cleared
 * on the approach would go dark with the last stretch of scrub still to
 * pick through, and come back on the first steer that wandered.
 */
export function trackLost(state: GameState): boolean {
  if (!state.offRoad) return false;
  if (state.lost) return true;
  const guide = TUNING.offTrack.guide;
  const home = wayHome(state);
  return home.distance > guide.near && Math.abs(home.bearing) > guide.away;
}

/** WHICH WAY THE CAR IS GOING ALONG THE STAGE, read at one centerline
 * sample. The two fields answer different questions and the wrong-way call
 * needs both: a spun car POINTS back up the stage while its momentum still
 * carries it down, and a car reversing out of a ditch TRAVELS back up it
 * while still pointing down the road. */
export type StageDirection = {
  /** How far the nose is off the road's own heading, rad — 0 pointing down
   * the stage, π straight back up it. Unsigned: which side of the road's
   * line the car has swung to says nothing about the way it is facing. */
  facing: number;
  /** Ground speed along the road, m/s — negative running back up it.
   * Measured off the car's whole velocity rather than its forward speed, so
   * a car crossed up at the exit of a corner is credited with the ground it
   * is actually covering and reverse is simply a negative one. */
  along: number;
};

/** Read the direction of travel against the road at `index`. */
export function stageDirection(state: GameState, index: number): StageDirection {
  const flat = flatTrack(state.track);
  const roadX = flat.sinHeading[index];
  const roadZ = flat.cosHeading[index];
  const car = state.car;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // The car's world velocity: forward along (sin h, cos h) plus sideways
  // along its right, (cos h, -sin h) — the frame the handling works in.
  const vx = car.u * sinH + car.w * cosH;
  const vz = car.u * cosH - car.w * sinH;
  return {
    facing: Math.acos(Math.max(-1, Math.min(1, sinH * roadX + cosH * roadZ))),
    along: vx * roadX + vz * roadZ,
  };
}

/** Where the car sits against the centerline: everything a fix knows that
 * costs only the search. */
export type TrackPoint = {
  index: number;
  s: number;
  /** Signed lateral offset, meters; positive toward the car's map-view right
   * of the direction of travel. */
  lateral: number;
  /** True when the car is beyond the road edge plus the verge. */
  offRoad: boolean;
  surface: Surface | "nature";
};

export type TrackFix = TrackPoint & {
  /** Road height under the car, interpolated between samples AND across the
   * road's own cross-section (road.ts) — the road is a ramp with a crown
   * and a pair of worn wheel tracks in it, not a flat staircase. */
  elevation: number;
  /** Road slope dy/ds under the car, interpolated the same way. */
  slope: number;
  /** Cross-slope under the car, dy per meter to its RIGHT: the camber that
   * sheds a car toward the outside of the road, the wheel track that holds
   * it once it drops into one, and R19's bank, which on a corner is the
   * biggest of the three — a banked turn leans the car into the corner and
   * pulls it away from the outside edge. */
  slopeLat: number;
};

/** Samples a respawn lands short of the finish gate by (2 m each), so the
 * car comes back with road left to cross the line with rather than being
 * dropped onto it. */
const HOME_BACKOFF = 2;

/** Half the width of a start/finish gate, m: the road plus the verge that
 * still counts as being on it. The posts stand at its ends. */
export function gateHalfWidth(track: Track): number {
  return track.width / 2 + TUNING.offTrack.verge;
}

/** True when the move from (x0,z0) to (x1,z1) took the car through the
 * finish gate, forwards. Progress alone does not end a run: progress is the
 * nearest sample, and a car climbing the mountain beside the closing
 * straight passes every one of them without ever crossing the line. The
 * test is the LINE — the plane across the road at the gate, entered between
 * its posts, in the direction of travel — so it counts a car airborne over
 * it and refuses one that drove around it. */
export function crossedFinish(
  track: Track,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  const at = finishIndex(track);
  const s = track.samples[at];
  const flat = flatTrack(track);
  const fwdX = flat.sinHeading[at];
  const fwdZ = flat.cosHeading[at];
  const before = (x0 - s.x) * fwdX + (z0 - s.z) * fwdZ;
  const after = (x1 - s.x) * fwdX + (z1 - s.z) * fwdZ;
  if (before >= 0 || after < 0) return false;
  // Where on the line it crossed: the step is a fraction of a meter at rally
  // pace, so the segment is straight enough to interpolate.
  const t = after === before ? 0 : -before / (after - before);
  const cx = x0 + (x1 - x0) * t;
  const cz = z0 + (z1 - z0) * t;
  const lateral = (cx - s.x) * fwdZ + (cz - s.z) * -fwdX;
  return Math.abs(lateral) <= gateHalfWidth(track);
}

/** Locate the car against the centerline, searching near `hint` — POSITION
 * ONLY. The road profile over it (the height the car rides, the slope along
 * and the camber across) is half a dozen cross-section evaluations, and
 * most of a run's fixes never read one: the fix taken after the move only
 * wants to know which sample the car is at, how far off line, and whether
 * that counts as off the road. `locate` is this plus the profile.
 *
 * The object is allocated with the profile's fields already on it, at zero,
 * so both callers hand the same shape to everything downstream. */
export function locatePoint(track: Track, x: number, z: number, hint: number): TrackPoint {
  const samples = track.samples;
  const last = samples.length - 1;
  const lo = Math.max(0, hint - 15);
  const hi = Math.min(last, hint + 45);
  const flat = flatTrack(track);
  // The bound the group test starts from. It is the hint's own sample, which
  // is IN the window, so it is an upper bound on the nearest one — and a
  // group further off than an upper bound cannot hold the answer, so the far
  // end of the window is dropped without being walked.
  const seed = lo > hint ? lo : hint > hi ? hi : hint;
  const seedX = x - flat.x[seed];
  const seedZ = z - flat.z[seed];
  const near = inWindow(flat, x, z, lo, hi, Math.sqrt(seedX * seedX + seedZ * seedZ));
  // THE WINDOW IS A HEAD START, NOT THE ANSWER. It holds the nearest sample
  // only while the hint is honest about where the car is — and a hint is the
  // caller's last answer, which a car that has been off in the country, or
  // turned round and driven back down the stage, has long since left behind.
  // A window that has cut the real answer off does not say so: it returns
  // whichever sample it was cornered into, and since `lateral` only measures
  // ACROSS that sample's own piece of road, a car in line with a piece it
  // never reached is reported as standing ON it and handed its height. That
  // is a car teleported to the elevation of road hundreds of metres away.
  //
  // So the road is searched WHOLE, every time. What the window buys is the
  // bound it is searched under: the car is normally within a few metres of
  // the road, and against a bound that tight every block of the road but the
  // one it is standing in fails on its first test. The window costs what it
  // always did, and the search behind it costs a handful of circle tests.
  const nearX = x - flat.x[near];
  const nearZ = z - flat.z[near];
  const best = whole(flat, x, z, near, nearX * nearX + nearZ * nearZ);
  const s = samples[best];
  // Project the offset onto the sample's right axis for a signed lateral.
  const dx = x - s.x;
  const dz = z - s.z;
  const lateral = dx * flat.cosHeading[best] + dz * -flat.sinHeading[best];
  // Off the END of the road is off the road too. The nearest sample at
  // either end of the stage stays the nearest however far past it the car
  // gets, and its lateral offset alone would report a car a kilometre
  // behind the start line as sitting on the road — a flat invisible ribbon
  // running to the horizon, holding the car at the start's elevation over
  // valleys and through hillsides. Road is drawn and shelved for one apron
  // past each end (R24); past that the terrain owns the ground. A circuit
  // has no such end — its road runs back into its own start line.
  // Only the two end samples can be run off the end of, so the test itself
  // is only reached there — every other fix skips the call.
  const offEnd =
    (best === 0 || best === samples.length - 1) && pastApron(track, best, flat, best, dx, dz);
  const offRoad = offEnd || Math.abs(lateral) > track.width / 2 + TUNING.offTrack.verge;
  // Allocated at the full width so `locate` can fill the profile in place
  // and everything downstream sees one object shape.
  const fix: TrackFix = {
    index: best,
    s: s.s,
    lateral,
    offRoad,
    surface: offRoad ? "nature" : s.surface,
    elevation: 0,
    slope: 0,
    slopeLat: 0,
  };
  return fix;
}

/** The nearest centerline sample to `(x, z)` in the window `[lo, hi]`,
 * walked over the flat arrays rather than the sample objects: the run does
 * this twice per physics step and it is the single hottest loop in the
 * engine.
 *
 * Whole groups of eight are stepped over when their bounding circle proves
 * none of them can beat the distance the walk is already holding — which is
 * most of any window, most of the time. `bound` is a distance already known
 * to be achievable (the hint's own sample), so the pruning has something to
 * bite on from the first group rather than after the first improvement, and
 * the square root behind it is taken at a group boundary rather than on
 * every improvement along the way. */
function inWindow(
  flat: FlatTrack,
  x: number,
  z: number,
  lo: number,
  hi: number,
  bound: number,
): number {
  const fx = flat.x;
  const fz = flat.z;
  let best = lo;
  let bestD2 = Infinity;
  let bounded = true;
  let i = lo;
  while (i <= hi) {
    if ((i & (GROUP - 1)) === 0 && i + GROUP - 1 <= hi) {
      if (!bounded) {
        const found = Math.sqrt(bestD2);
        if (found < bound) bound = found;
        bounded = true;
      }
      if (skip(x, z, flat.groupX, flat.groupZ, flat.groupR, i >> GROUP_SHIFT, bound)) {
        i += GROUP;
        continue;
      }
    }
    const dx = x - fx[i];
    const dz = z - fz[i];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
      bounded = false;
    }
    i++;
  }
  return best;
}

/** The nearest centerline sample on the WHOLE road, given one already in
 * hand — the window's answer, which is almost always the right one and
 * whose distance is what makes this cheap. Three tiers: a circle per block
 * of sixty-four samples, a circle per group of eight inside a block that
 * survives, and the samples themselves inside a group that survives. A car
 * a few metres off the road rejects every block but its own on one test
 * each, so an ordinary step pays a couple of dozen multiplies for the
 * guarantee that the road it is being handed is the road it is on. */
function whole(flat: FlatTrack, x: number, z: number, best: number, bestD2: number): number {
  const n = flat.x.length;
  const perBlock = GROUP * BLOCK;
  let bound = Math.sqrt(bestD2);
  for (let b = 0; b < flat.blockX.length; b++) {
    if (skip(x, z, flat.blockX, flat.blockZ, flat.blockR, b, bound)) continue;
    const groupTo = Math.min(flat.groupX.length - 1, ((b + 1) * perBlock - 1) >> GROUP_SHIFT);
    for (let g = (b * perBlock) >> GROUP_SHIFT; g <= groupTo; g++) {
      if (skip(x, z, flat.groupX, flat.groupZ, flat.groupR, g, bound)) continue;
      const to = Math.min(n, (g + 1) * GROUP);
      for (let i = g * GROUP; i < to; i++) {
        const dx = x - flat.x[i];
        const dz = z - flat.z[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
          bound = Math.sqrt(d2);
        }
      }
    }
  }
  return best;
}

/** True when a bounding circle is provably further off than `bound`, so
 * nothing inside it can beat what the walk is already holding. Strictly
 * conservative: the margin can only ever keep a circle in the walk that
 * could have been dropped, never drop one that holds the answer. */
function skip(
  x: number,
  z: number,
  cx: Float64Array,
  cz: Float64Array,
  cr: Float64Array,
  at: number,
  bound: number,
): boolean {
  const dx = x - cx[at];
  const dz = z - cz[at];
  const reach = bound + cr[at];
  return dx * dx + dz * dz > reach * reach * (1 + 1e-9);
}

/** Locate the car against the centerline, and read the road's profile under
 * where it lands. */
export function locate(track: Track, x: number, z: number, hint: number): TrackFix {
  // `locatePoint` allocates the profile's fields zeroed; this is the one
  // function that fills them, which is why it may look at them.
  const fix = locatePoint(track, x, z, hint) as TrackFix;
  const flat = flatTrack(track);
  const samples = track.samples;
  const best = fix.index;
  const s = samples[best];
  const dx = x - s.x;
  const dz = z - s.z;
  const halfRoad = s.width / 2;
  // Ground height and slope come from BETWEEN the samples. The nearest
  // sample alone quantizes the road to the 2 m sample grid, and on a graded
  // road that staircase reads as the ground falling away — a car that hops
  // its way up every ramp and phantom-launches at every sample crossing.
  // Project onto the sample's forward axis, then blend toward the neighbour
  // the car is heading for.
  const along = dx * flat.sinHeading[best] + dz * flat.cosHeading[best];
  const next = clampIndex(samples, best + Math.sign(along));
  const f = Math.min(1, Math.abs(along) / track.step);
  const here = flat.elevation[best];
  const crown = here + (flat.elevation[next] - here) * f;
  const hereSlope = slopeOn(flat, best);
  const slope = hereSlope + (slopeOn(flat, next) - hereSlope) * f;
  // Across the road: the sample's elevation is the CROWN, and where the car
  // actually sits depends on how far out it is — down the camber, or in one
  // of the two tracks every car before it wore into the gravel. Past the mat
  // the ribbon carries on into the shoulder and the ground leaning away from
  // it, and the HEIGHT follows it out there: the same corridor profile the
  // road mesh is drawn from and that `terrain.groundAt` hands the car the
  // moment it counts as off the road. Reading the mat's edge instead left
  // the car floating over its own verge and dropping a step onto the ground
  // at the boundary. A bridge is the exception — past a deck's edge is air,
  // not a verge, and a car with two wheels on the parapet is still on the
  // deck.
  const onRoad = Math.max(-halfRoad, Math.min(halfRoad, fix.lateral));
  const cross =
    s.deck != null ? crossOffset(s, onRoad, s.width) : corridorOffset(s, fix.lateral, s.width);
  // The camber the car SITS on, read over the SAME profile its height came
  // from. Two wheels on the verge is still on the road (`offTrack.verge`),
  // and for as long as this read the mat alone — clamped at the edge — the
  // shoulder was a place the car's height followed down while its physics
  // insisted the ground was level: no lean, no pull toward the ditch, and a
  // vertical speed that disagreed with the elevation the car was being put
  // at. The ground beside a road is the first slope anyone actually drives
  // onto, and it was the one slope the handling could not feel.
  //
  // A DECK is the exception the clamp was really for: past a parapet is air,
  // not a verge, so a bridge reads its own mat and nothing outside it.
  const probe = 0.5;
  const profile = s.deck != null ? crossOffset : corridorOffset;
  const at = s.deck != null ? onRoad : fix.lateral;
  const lo = s.deck != null ? Math.max(-halfRoad, at - probe) : at - probe;
  const hi = s.deck != null ? Math.min(halfRoad, at + probe) : at + probe;
  fix.elevation = crown + cross;
  fix.slope = slope;
  fix.slopeLat = (profile(s, hi, s.width) - profile(s, lo, s.width)) / (hi - lo);
  return fix;
}

/** How sharply the road's CROSS-SECTION curves under the car, 1/m —
 * negative over the crown, positive through the trough at the shoulder. The
 * transverse half of what `curvatureAt` measures along the stage, read over
 * a baseline sized to the road itself (`air.crossSpan` of its half-width),
 * because a road is shaped in tens of metres one way and single metres the
 * other.
 *
 * This is the shape a car crossing a road actually goes over: up the verge,
 * over the crown, out the far side. Nothing about that is visible along the
 * centerline, which is why a road taken transversely used to be perfectly
 * flat as far as the takeoff was concerned however fast it was taken.
 *
 * A deck has no cross-section worth the name and no ground past its
 * parapet, so a bridge reports none. */
export function crossCurvature(track: Track, fix: TrackPoint, share: number): number {
  const s = track.samples[fix.index];
  if (s.deck != null) return 0;
  // A share of the half-width, but never wider than the corridor's own
  // outer geometry: the features on this axis stop at the shoulder however
  // wide the mat is, so past `reach` a bigger baseline reads more road
  // rather than more shape, and on a very wide one it would reach out of
  // the far verge and report the whole carriageway as a hump.
  const half = s.width / 2;
  const span = Math.min(half * share, ROAD_CROSS.reach);
  if (span < 1e-6) return 0;
  // The corridor is only the ground as far as the ribbon's own geometry
  // goes (R16's hand-over): past `reach` the profile holds its last value
  // for want of anything to say, and the country out there belongs to the
  // terrain lattice. Probing into that flat would invent a trough at the
  // edge of every wide road, so the arms stop at the corridor's own limit
  // and the stencil takes the two it actually got — the same uneven-arm
  // second difference `curvatureAt` uses where a stage runs out of samples.
  const limit = half + ROAD_CROSS.reach;
  const at = Math.max(-limit, Math.min(limit, fix.lateral));
  const hi = Math.min(limit, at + span);
  const lo = Math.max(-limit, at - span);
  const ahead = hi - at;
  const behind = at - lo;
  if (ahead < 1e-6 || behind < 1e-6) return 0;
  const here = corridorOffset(s, at, s.width);
  const rise = (corridorOffset(s, hi, s.width) - here) / ahead;
  const fall = (here - corridorOffset(s, lo, s.width)) / behind;
  return (2 * (rise - fall)) / (ahead + behind);
}

/** THE CURVATURE THE CAR IS ACTUALLY GOING OVER, 1/m — the road's vertical
 * shape resolved onto the direction the car is TRAVELLING in, which is what
 * decides whether the ground can hold it (`air.crestPull`) and how much of
 * its weight is still on the tires while it does.
 *
 * A road is a surface, not a line, and it is curved both ways: along the
 * stage it brows and dips, across it there is a crown, a bank where R19 put
 * one, and the break where the shoulder leans away. Which of those a car
 * meets depends entirely on where it is pointed. Straight down the stage it
 * is all the first; riding up the verge and over the road it is all the
 * second — and that case used to read as dead flat, because the only thing
 * ever measured was the centerline's own profile. So a car could cross a
 * gravel road at any speed at all and never leave the ground, over the same
 * crown that throws it when the stage happens to run over a brow.
 *
 * `dirX, dirZ` is the world-space direction of travel and need not be
 * normalized — a stationary car reads nothing, which is right. The two
 * curvatures are combined as a second directional derivative: each weighted
 * by the square of the travel's component along its own axis, so a car
 * driving down the road feels the stage's brows, a car crossing it feels
 * the crown, and one sliding diagonally over the verge feels both. */
export function pathCurvature(track: Track, fix: TrackPoint, dirX: number, dirZ: number): number {
  const speed = Math.hypot(dirX, dirZ);
  if (speed < 1e-6) return 0;
  const flat = flatTrack(track);
  const i = fix.index;
  // The road's own axes: forward is (sin h, cos h) and its right is
  // (cos h, -sin h) — the same frame the lateral offset is measured in.
  const fwdX = flat.sinHeading[i];
  const fwdZ = flat.cosHeading[i];
  const along = (dirX * fwdX + dirZ * fwdZ) / speed;
  const across = (dirX * fwdZ - dirZ * fwdX) / speed;
  const A = TUNING.air;
  return (
    curvatureAt(track, i, A.crestSpan) * along * along +
    crossCurvature(track, fix, A.crossSpan) * across * across
  );
}

/** True when the car has run off one of the stage's ENDS — past the apron
 * of dirt the generator lays before the start gate and after the flying
 * finish (R24). Only the two end samples can report it: anywhere else the
 * road carries on past the nearest sample in both directions.
 *
 * Two stages have no such end. An endless one has only a frontier the stream
 * has not reached yet, and a CIRCUIT (R22) closes onto its own start line —
 * its last sample IS its first, so the road past either of them is the lap
 * carrying on, not country. */
function pastApron(
  track: Track,
  index: number,
  flat: FlatTrack,
  at: number,
  dx: number,
  dz: number,
): boolean {
  if (track.circuit) return false;
  const first = index === 0;
  const last = index === track.samples.length - 1 && !track.endless;
  if (!first && !last) return false;
  const along = dx * flat.sinHeading[at] + dz * flat.cosHeading[at];
  const past = first ? -along : along;
  return past > STAGE_RULES.startZone.apron;
}

function clampIndex(samples: { length: number }, index: number): number {
  return Math.min(samples.length - 1, Math.max(0, index));
}

/** True when a jump lip sits between the two positions on the road — in
 * EITHER direction. A lip is a crest with a ramp up to it, and a crest does
 * not care which way it is met: a car that turned round and came back at one
 * climbs the face it landed on and is thrown off the top of it exactly like
 * the car that took it the way the stage intended. Answering only for a car
 * driving up-index left the other one driving into the ramp instead of over
 * it — the road heaving up under the wheels and the springs paying for it. */
export function crossedLip(track: Track, fromIndex: number, toIndex: number): number {
  const last = track.samples.length - 1;
  if (toIndex >= fromIndex) {
    for (let i = Math.max(0, fromIndex + 1); i <= toIndex && i <= last; i++) {
      if (track.samples[i].jump) return i;
    }
    return -1;
  }
  for (let i = Math.min(last, fromIndex - 1); i >= toIndex && i >= 0; i--) {
    if (track.samples[i].jump) return i;
  }
  return -1;
}

/** Vertical curvature of the road at a sample, 1/m — negative over a brow,
 * positive through a dip. Measured over a baseline WIDER than the bump layer
 * the generator lays under every stage (`R.elevation.bump`, ~9–16 m): a
 * short window reads that road TEXTURE as a series of launches at pace, when
 * what decides a takeoff is the shape of the hill. */
export function curvatureAt(track: Track, index: number, span: number): number {
  const { elevation, arc } = flatTrack(track);
  const reach = Math.max(1, Math.round(span / track.step));
  const back = clampIndex(track.samples, index - reach);
  const fwd = clampIndex(track.samples, index + reach);
  const behind = arc[index] - arc[back];
  const ahead = arc[fwd] - arc[index];
  if (behind < 1e-6 || ahead < 1e-6) return 0;
  const rise = (elevation[fwd] - elevation[index]) / ahead;
  const fall = (elevation[index] - elevation[back]) / behind;
  return (2 * (rise - fall)) / (behind + ahead);
}

/** Approximate road slope (dy/ds) at a sample, from the ground behind it —
 * backward-looking on purpose, so a jump lip reports the RAMP that throws
 * the car rather than averaging in the drop on its far side. */
export function slopeAt(track: Track, index: number): number {
  return slopeOn(flatTrack(track), index);
}

/** `slopeAt` against a flat table already in hand — `locate` reads it twice
 * per call and has no reason to look the table up again for each. */
function slopeOn(flat: FlatTrack, index: number): number {
  const i1 = Math.max(0, index - 2);
  const rise = flat.elevation[index] - flat.elevation[i1];
  const run = Math.max(1e-6, flat.arc[index] - flat.arc[i1]);
  return rise / run;
}
