// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRANSIT — the camera going from one car to another.
//
// A spectator feed (spectate.ts) changes cars: the results card opens itself
// on the leader of what is left, NEXT walks back down the road to the crew
// behind, PREVIOUS walks up it, and a crew who crosses the line under the
// camera hands the frame to whoever is still driving. Every one of those is a
// jump of hundreds of metres, sometimes a kilometre, and a CUT across a gap
// that size tells the viewer nothing: the new car simply appears somewhere,
// and the stage between the two might as well not exist.
//
// So the camera GOES there, and the move is the plainest one that can carry
// that distance: IT SLIDES BACKWARDS UP THE ROAD, gathering speed and then
// losing it again, and stops behind the crew coming the other way. That is
// the whole shot. Everything below is in service of it staying readable, and
// the temptation each thing resists is the same one: dressing a move up until
// the viewer can no longer tell where they have been taken.
//
//   IT FOLLOWS THE ROAD, NOT THE LINE BETWEEN THE CARS. Both ends of a
//   transit are cars on the same stage, so the road already runs from one to
//   the other — and it goes ROUND the hills rather than over them. A flight
//   along the straight line has to climb whatever is in the way, which on a
//   rally stage is a ridge, a stand of trees and usually a hill; forty metres
//   of altitude and a hard tilt down to keep the ground in frame is a shot
//   nobody can place themselves in. Following the road costs no altitude at
//   all, crosses nothing nobody is racing on, and keeps the one thing the
//   viewer is being carried along in the middle of the frame.
//
//   IT INTERPOLATES ORIENTATION, NEVER AN AIM POINT. The destination is up
//   the road BEHIND the lens, so an aim point walked in a straight line from
//   in front of the camera to a car behind it passes through the camera
//   itself, and a lens asked to look at the point it is standing on tumbles.
//   What is turned here is the ORIENTATION: the pose the shot started in, the
//   pose the rig has written for the frame it is landing on, and — through
//   the middle, where a bend would otherwise leave the shot travelling
//   sideways — the road's own heading under the lens.
//
//   IT RISES A LITTLE, AND ONLY A LITTLE. Enough to see over the crest the
//   road is about to go under, and to give the ground something to move
//   against; not enough to become a map. The aim goes down the road at road
//   height, so the tilt that lift is worth falls out of the geometry rather
//   than being a gesture laid on top of it.
//
//   IT LANDS ON THE RIG, NOT NEAR IT. The destination is re-read every frame
//   off the pose the chase camera has already written — the car it is built
//   around is still driving — and the last frame of the flight is the rig's
//   own frame, in position AND in aim, so the hand-over has nothing to catch
//   up.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState, Track } from "@engine";

/** How long the move takes, s: this much, plus a second for every
 * `TIME_SPAN` metres of road. A fixed second is the right length for the two
 * hundred metres between two cars in the same fight and a nonsense for the
 * kilometre between the leader and the crew who went off — covering that in
 * the same beat is a scrub through a position rather than a move over the
 * stage. */
const TIME_MIN = 0.85;
const TIME_MAX = 2.1;
const TIME_SPAN = 800;

/** Road between the two ends under which there is no move at all, m.
 * Changing which VIEW a car is watched from is not a transit — the lens is
 * already there — and a move with nowhere to go still lifts and settles,
 * which is a hop over a car standing still. */
const MIN_TRAVEL = 12;

/** How far over the road the lens rides at the middle of the move, m, and
 * the road that buys all of it. Deliberately modest: this is a camera on a
 * long boom running back up the stage, not an aircraft. Under `LIFT_SPAN` it
 * is faded down with the distance, so a short move stays at road height
 * where it belongs. */
const LIFT = 14;
const LIFT_SPAN = 260;

/** …and the hard floor under the lens, m, checked against the ground it is
 * actually over on every frame. Following the road means the ground under
 * the lens is the road, so this almost never binds — which is exactly why it
 * is cheap to keep: the almost is a cutting, a bridge deck, and the ends of
 * the move, where the path is the lateral blend rather than the road. */
const GUARD = 6;

/** How far down the road the middle of the move is watching, m, and how far
 * over the road the point it is watching sits. The drop from the lens to it
 * IS the pitch of the shot — about nine degrees at full lift, which is a
 * camera looking where it is going rather than one looking at the ground. */
const AIM_REACH = 90;
const AIM_UP = 3;

/** The lens's own right axis — the one that pitch is taken about. */
const RIGHT = new THREE.Vector3(1, 0, 0);

/** …and the same for the lift, which is why the shape is a PLATEAU rather
 * than a lob: a lob is only at its height for an instant, so the crest it
 * was raised for has to be cleared by the one frame that passes over it. */
const RAMP = 0.34;

/** Smoothstep, so the move leaves and arrives at rest — and IS the speeding
 * up and slowing down that makes it read as one gesture. */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Up over `RAMP`, held, and down over the last `RAMP`. */
function plateau(t: number): number {
  return ease(t / RAMP) * ease((1 - t) / RAMP);
}

/** Where the road is at arc position `s` — the point between the two samples
 * it falls between, heading interpolated the short way round. Indexed off
 * the track's own spacing and then corrected against the samples' own `s`,
 * so it stays right if the spacing is ever not exactly uniform. */
type RoadPoint = { x: number; z: number; y: number; heading: number };
function roadAt(track: Track, s: number, out: RoadPoint): RoadPoint {
  const samples = track.samples;
  const last = samples.length - 1;
  const at = clamp(Math.floor(s / track.step), 0, Math.max(0, last - 1));
  const a = samples[at];
  const b = samples[Math.min(last, at + 1)];
  const span = b.s - a.s;
  const f = span > 1e-6 ? clamp((s - a.s) / span, 0, 1) : 0;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.y = a.elevation + (b.elevation - a.elevation) * f;
  out.heading = angleLerp(a.heading, b.heading, f);
  return out;
}

/** The arc position of the road nearest `(x, z)`. Walked over the whole
 * stage rather than a window, because the two ends of a transit are hundreds
 * of metres apart and neither one's hint is any use for the other — and it
 * is walked ONCE per move rather than per frame. */
function nearestS(track: Track, x: number, z: number): number {
  const samples = track.samples;
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dx = samples[i].x - x;
    const dz = samples[i].z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return samples[best].s;
}

export type SweepCamera = {
  /** Begin a move from wherever the camera is standing now to the car in
   * `to`. Call it BEFORE anything re-stands the rig: the pose it captures is
   * the frame that is on screen. */
  start: (camera: THREE.PerspectiveCamera, to: GameState) => void;
  /** Whether the move still owns the frame. */
  flying: () => boolean;
  /** Move this frame OVER the pose the rig has already written.
   *
   * The caller runs the play rig FIRST, so `camera` arrives holding the pose
   * it would be standing in had there been no transit — position and aim
   * both; this reads that as the destination and pulls the lens back up the
   * road toward where it came from. `rigFov` is the rig's design fov, and the
   * returned number is the design fov for this frame. On the frame the move
   * ENDS it touches nothing and hands the rig's own pose straight back, so
   * there is no pop between the last flown frame and the first driven one. */
  fly: (camera: THREE.PerspectiveCamera, to: GameState, rigFov: number, dt: number) => number;
  /** Abandon a move — a cut is wanted instead. */
  reset: () => void;
};

export function createSweepCamera(): SweepCamera {
  /** How far through the move, 0..1. One means there is no move. */
  let at = 1;
  /** …and how long this one is given, s. */
  let span = TIME_MIN;
  /** Where the lens was standing when it started, the way it was facing, and
   * where the road was under it: an arc position, the metres it stood to the
   * side of the road there, and the metres it stood above it. The two
   * offsets are what make the path exact at the ends and the ROAD in the
   * middle — a lens that started out in a field lands on the rig rather than
   * being snapped onto the centreline first. */
  const fromQuat = new THREE.Quaternion();
  let fromS = 0;
  const fromOff = new THREE.Vector2();
  let fromRise = 0;
  /** How much of the lift this move has earned — read once, off the road it
   * had to cover when it started, so neither the height nor the length of
   * the move jitters as the car it is chasing drives on. */
  let lift = 0;

  const road = { x: 0, z: 0, y: 0, heading: 0 };
  const toQuat = new THREE.Quaternion();
  const pitch = new THREE.Quaternion();

  /** Where along the road a point is, and how far off it stands. A circuit's
   * `progressS` runs on across the laps while its samples cover one, so the
   * arc position is taken modulo the lap and the two ends are always joined
   * the SHORT way round. */
  const lap = (track: Track): number => (track.circuit ? track.length : 0);
  const local = (track: Track, s: number): number => {
    const round = lap(track);
    if (round <= 0) return clamp(s, 0, track.length);
    const wrapped = s % round;
    return wrapped < 0 ? wrapped + round : wrapped;
  };
  /** How much road there is from `from` to `to`, signed, and on a circuit
   * always the SHORT way round: half a lap back is a transit, and the other
   * three quarters of one is a tour. */
  const reach = (track: Track, from: number, to: number): number => {
    const round = lap(track);
    const delta = to - from;
    if (round <= 0) return delta;
    if (delta > round / 2) return delta - round;
    if (delta < -round / 2) return delta + round;
    return delta;
  };

  return {
    flying: () => at < 1,
    reset: () => {
      at = 1;
    },
    start: (camera, to) => {
      const track = to.track;
      const here = local(track, nearestS(track, camera.position.x, camera.position.z));
      const there = local(track, to.progressS);
      const delta = reach(track, here, there);
      if (Math.abs(delta) < MIN_TRAVEL) {
        // Already there: this is a change of VIEW and not a transit, and the
        // kindest thing a transit can do with one is not happen.
        at = 1;
        return;
      }
      fromS = here;
      span = clamp(TIME_MIN + Math.abs(delta) / TIME_SPAN, TIME_MIN, TIME_MAX);
      lift = LIFT * clamp(Math.abs(delta) / LIFT_SPAN, 0, 1);
      roadAt(track, here, road);
      fromOff.set(camera.position.x - road.x, camera.position.z - road.z);
      fromRise = camera.position.y - road.y;
      fromQuat.copy(camera.quaternion);
      at = 0;
    },
    fly: (camera, to, rigFov, dt) => {
      at = Math.min(1, at + dt / span);
      // Arrived: the rig's pose is already in `camera`, and the kindest thing
      // to do with it is nothing.
      if (at >= 1) return rigFov;
      const track = to.track;
      // Where the rig has stood itself THIS frame, and the way it is facing
      // from there — the destination, both halves of it re-read every frame
      // because the car it is built around is still driving.
      toQuat.copy(camera.quaternion);
      const there = local(track, to.progressS);
      roadAt(track, there, road);
      const toOffX = camera.position.x - road.x;
      const toOffZ = camera.position.z - road.z;
      const toRise = camera.position.y - road.y;

      // THE PATH: along the road, with the two ends' own offsets off it
      // blended across. Exact at both ends by construction.
      const travelled = ease(at);
      // The reach is re-read every frame with the destination, or the move
      // would land on the road the car was standing on when it STARTED —
      // fifty metres back up the stage by the time it gets there.
      const s = local(track, fromS + reach(track, fromS, there) * travelled);
      roadAt(track, s, road);
      const x = road.x + fromOff.x + (toOffX - fromOff.x) * travelled;
      const z = road.z + fromOff.y + (toOffZ - fromOff.y) * travelled;
      const rise = fromRise + (toRise - fromRise) * travelled;
      const over = plateau(at);
      const under = Math.max(to.terrain.groundAt(x, z), to.terrain.waterAt(x, z) ?? -Infinity);
      const y = Math.max(road.y + rise + lift * over, under + GUARD * over);
      camera.position.set(x, y, z);

      // THE AIM: one slow turn from the pose the shot started in to the pose
      // it is landing in, and nothing else. Both of those look down the road
      // — a camera behind a car faces the way it is driving — so on a stage
      // that bends between them this is a steady sweep across the angle the
      // road turns through, spread over the whole move.
      //
      // The aim deliberately does NOT track the road under it. A path that
      // follows a corner covers it at the speed the middle of a move travels
      // at, and a lens pinned to that tangent pans at two or three degrees a
      // FRAME through the apex — which is a whip, and reads as being thrown
      // rather than carried. Letting the aim cut the corner while the body
      // follows it costs a few degrees of the road sliding toward the edge
      // of frame, and buys a shot that turns at a rate a person could.
      camera.quaternion.slerpQuaternions(fromQuat, toQuat, travelled);
      // …and down by as much as the lift is worth, about the lens's own
      // right axis: a shot riding `lift` metres over a road it is watching
      // `AIM_REACH` down has to drop its aim by that angle to keep the road
      // in the frame. Local, so it adds no yaw of its own and cannot argue
      // with the turn above; and it grows and dies with the lift, so both
      // ends of the move are the rig's own pitch exactly.
      const dip = Math.atan2(y - road.y - AIM_UP, AIM_REACH);
      if (dip > 1e-4) camera.quaternion.multiply(pitch.setFromAxisAngle(RIGHT, -dip));
      return rigFov;
    },
  };
}
