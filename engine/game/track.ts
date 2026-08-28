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
import { flatTrack, GROUP, GROUP_SHIFT, type FlatTrack } from "../mapgen/flat.ts";
import { corridorOffset, crossOffset } from "../mapgen/road.ts";
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
  const lo = Math.max(0, hint - 15);
  const hi = Math.min(samples.length - 1, hint + 45);
  let best = lo;
  let bestD2 = Infinity;
  // Over the flat arrays, not the sample objects: this window is sixty-odd
  // samples and the run walks it twice per physics step, which is the
  // single hottest loop in the engine. Whole groups of eight are stepped
  // over when their bounding circle proves none of them can beat the
  // distance the walk is already holding — which is most of the window,
  // most of the time: it reaches ninety meters up the road for the rare
  // step that needs it, not for the ordinary one that does not.
  const flat = flatTrack(track);
  const fx = flat.x;
  const fz = flat.z;
  // The bound the groups are tested against. It starts at the hint's own
  // sample, which is IN the window, so it is an upper bound on the nearest
  // one — and a group further off than an upper bound cannot hold the
  // answer, so the far end of the window is dropped without being walked.
  // Only ever read at a group boundary, so the root is taken there rather
  // than on every improvement along the way.
  const seed = lo > hint ? lo : hint > hi ? hi : hint;
  const seedX = x - fx[seed];
  const seedZ = z - fz[seed];
  let bound = Math.sqrt(seedX * seedX + seedZ * seedZ);
  let bounded = true;
  let i = lo;
  while (i <= hi) {
    if ((i & (GROUP - 1)) === 0 && i + GROUP - 1 <= hi) {
      if (!bounded) {
        const found = Math.sqrt(bestD2);
        if (found < bound) bound = found;
        bounded = true;
      }
      const g = i >> GROUP_SHIFT;
      const gx = x - flat.groupX[g];
      const gz = z - flat.groupZ[g];
      const reach = bound + flat.groupR[g];
      // Strictly conservative: the margin can only ever keep a group in the
      // walk that could have been dropped, never drop one that holds the
      // answer.
      if (gx * gx + gz * gz > reach * reach * (1 + 1e-9)) {
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
  const halfRoad = track.width / 2;
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
    s.deck != null
      ? crossOffset(s, onRoad, track.width)
      : corridorOffset(s, fix.lateral, track.width);
  // The camber the car SITS on is the mat's, read at the edge at furthest:
  // the chamfer off a paved edge is a curb, and rolling the body onto it
  // would tip the car over a step a few centimeters wide.
  const probe = 0.5;
  fix.elevation = crown + cross;
  fix.slope = slope;
  fix.slopeLat =
    (crossOffset(s, Math.min(halfRoad, onRoad + probe), track.width) -
      crossOffset(s, Math.max(-halfRoad, onRoad - probe), track.width)) /
    (2 * probe);
  return fix;
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

/** True when a jump lip sits between the two progress positions. */
export function crossedLip(track: Track, fromIndex: number, toIndex: number): number {
  for (let i = fromIndex + 1; i <= toIndex && i < track.samples.length; i++) {
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
