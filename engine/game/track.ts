// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car-to-track queries: progress tracking along the sampled centerline,
// signed lateral offset, and the driving surface under the car. Progress is
// found by a bounded local search around the last known sample, so the cost
// per step is constant and progress can only creep forward or slightly back
// — a car that leaves the road keeps its last on-road progress for respawn.

import type { Surface, Track } from "../mapgen/index.ts";
import { corridorOffset, crossOffset } from "../mapgen/road.ts";
import { TUNING } from "./defs/tuning.ts";
import type { GameState } from "./state.ts";

/** The way back onto the road: the exact pose a respawn puts the car in,
 * and how far it is from where the car has wandered to. Guidance and the
 * reset read the SAME point — an arrow that pointed anywhere else would be
 * lying about where the button takes you. */
export type WayHome = {
  x: number;
  /** Road elevation at that point, m. */
  y: number;
  z: number;
  heading: number;
  /** Ground distance from the car to it, m. */
  distance: number;
  /** Where it lies relative to the way the car is POINTING, radians: 0 dead
   * ahead, ±π/2 straight out to the sides, ±π directly behind. The way home
   * being BESIDE the car is a different situation from it being behind it —
   * one is a car crossing a clearing, the other is a car leaving. */
  bearing: number;
};

/** Progress is monotonic, so this is always the furthest the car has got —
 * a car that doubles back is sent forward to where it earned, not to the
 * nearest piece of road behind it. The one place it stops short is the
 * finish: a run ends by driving THROUGH the gate, so the way home may never
 * drop the car on the far side of a line it still has to cross. */
export function wayHome(state: GameState): WayHome {
  const track = state.track;
  const index = track.endless
    ? state.progressIndex
    : Math.min(state.progressIndex, Math.max(0, finishIndex(track) - HOME_BACKOFF));
  const s = track.samples[index];
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
 * it. Both tests carry hysteresis (TUNING.offTrack.guide), because a
 * wandering car crosses either of them back and forth and an instrument that
 * blinks is worse than one that is late.
 */
export function trackLost(state: GameState): boolean {
  if (!state.offRoad) return false;
  const guide = TUNING.offTrack.guide;
  const home = wayHome(state);
  const away = Math.abs(home.bearing);
  return state.lost
    ? home.distance > guide.nearClear && away > guide.awayClear
    : home.distance > guide.near && away > guide.away;
}

export type TrackFix = {
  index: number;
  s: number;
  /** Signed lateral offset, meters; positive toward the car's map-view right
   * of the direction of travel. */
  lateral: number;
  /** True when the car is beyond the road edge plus the verge. */
  offRoad: boolean;
  surface: Surface | "nature";
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

/** The sample the finish gate stands on: the second to last, so the closing
 * straight still runs on past the line and a flying finish has somewhere to
 * land. The renderer builds the gate here too — the line the timer watches
 * is the line the player sees. */
export function finishIndex(track: Track): number {
  return Math.max(0, track.samples.length - 2);
}

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
  const s = track.samples[finishIndex(track)];
  const fwdX = Math.sin(s.heading);
  const fwdZ = Math.cos(s.heading);
  const before = (x0 - s.x) * fwdX + (z0 - s.z) * fwdZ;
  const after = (x1 - s.x) * fwdX + (z1 - s.z) * fwdZ;
  if (before >= 0 || after < 0) return false;
  // Where on the line it crossed: the step is a fraction of a meter at rally
  // pace, so the segment is straight enough to interpolate.
  const t = after === before ? 0 : -before / (after - before);
  const cx = x0 + (x1 - x0) * t;
  const cz = z0 + (z1 - z0) * t;
  const lateral = (cx - s.x) * Math.cos(s.heading) + (cz - s.z) * -Math.sin(s.heading);
  return Math.abs(lateral) <= gateHalfWidth(track);
}

/** Locate the car against the centerline, searching near `hint`. */
export function locate(track: Track, x: number, z: number, hint: number): TrackFix {
  const samples = track.samples;
  const lo = Math.max(0, hint - 15);
  const hi = Math.min(samples.length - 1, hint + 45);
  let best = lo;
  let bestD2 = Infinity;
  for (let i = lo; i <= hi; i++) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  const s = samples[best];
  // Project the offset onto the sample's right axis for a signed lateral.
  const dx = x - s.x;
  const dz = z - s.z;
  const rightX = Math.cos(s.heading);
  const rightZ = -Math.sin(s.heading);
  const lateral = dx * rightX + dz * rightZ;
  const halfRoad = track.width / 2;
  const offRoad = Math.abs(lateral) > halfRoad + TUNING.offTrack.verge;
  const surface = offRoad ? "nature" : s.surface;
  // Ground height and slope come from BETWEEN the samples. The nearest
  // sample alone quantizes the road to the 2 m sample grid, and on a graded
  // road that staircase reads as the ground falling away — a car that hops
  // its way up every ramp and phantom-launches at every sample crossing.
  // Project onto the sample's forward axis, then blend toward the neighbour
  // the car is heading for.
  const along = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
  const next = clampIndex(samples, best + Math.sign(along));
  const f = Math.min(1, Math.abs(along) / track.step);
  const crown = s.elevation + (samples[next].elevation - s.elevation) * f;
  const slope = slopeAt(track, best) + (slopeAt(track, next) - slopeAt(track, best)) * f;
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
  const onRoad = Math.max(-halfRoad, Math.min(halfRoad, lateral));
  const cross =
    s.deck != null ? crossOffset(s, onRoad, track.width) : corridorOffset(s, lateral, track.width);
  // The camber the car SITS on is the mat's, read at the edge at furthest:
  // the chamfer off a paved edge is a curb, and rolling the body onto it
  // would tip the car over a step a few centimeters wide.
  const probe = 0.5;
  const slopeLat =
    (crossOffset(s, Math.min(halfRoad, onRoad + probe), track.width) -
      crossOffset(s, Math.max(-halfRoad, onRoad - probe), track.width)) /
    (2 * probe);
  return {
    index: best,
    s: s.s,
    lateral,
    offRoad,
    surface,
    elevation: crown + cross,
    slope,
    slopeLat,
  };
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
  const reach = Math.max(1, Math.round(span / track.step));
  const back = track.samples[clampIndex(track.samples, index - reach)];
  const mid = track.samples[index];
  const fwd = track.samples[clampIndex(track.samples, index + reach)];
  const behind = mid.s - back.s;
  const ahead = fwd.s - mid.s;
  if (behind < 1e-6 || ahead < 1e-6) return 0;
  const rise = (fwd.elevation - mid.elevation) / ahead;
  const fall = (mid.elevation - back.elevation) / behind;
  return (2 * (rise - fall)) / (behind + ahead);
}

/** Approximate road slope (dy/ds) at a sample, from the ground behind it —
 * backward-looking on purpose, so a jump lip reports the RAMP that throws
 * the car rather than averaging in the drop on its far side. */
export function slopeAt(track: Track, index: number): number {
  const samples = track.samples;
  const i1 = Math.max(0, index - 2);
  const rise = samples[index].elevation - samples[i1].elevation;
  const run = Math.max(1e-6, samples[index].s - samples[i1].s);
  return rise / run;
}
