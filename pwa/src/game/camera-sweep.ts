// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRANSIT — the camera flying from one car to another.
//
// A spectator feed (spectate.ts) changes cars: the results card opens itself
// on the leader of what is left, NEXT walks back down the road to the crew
// behind, PREVIOUS walks up it, and a crew who crosses the line under the
// camera hands the frame to whoever is still driving. Every one of those is a
// jump of hundreds of metres, sometimes a kilometre, and a CUT across a gap
// that size tells the viewer nothing: the new car simply appears somewhere,
// and the stage between the two might as well not exist.
//
// So the camera GOES there, and the move it makes is the one a helicopter
// makes when the leader has gone through the gate and the next car is still
// out on the stage: IT FLIES BACKWARDS UP THE ROAD. It holds the way it was
// already facing — down the road, the way the cars come — backs off the line,
// rises over whatever country is in the way, and settles in behind the crew
// coming the other way, pointing the same way it started. The car it lands on
// drives INTO the frame rather than being swung round to.
//
// Four things make that readable, and each of them is a way of getting it
// wrong that a transit invites:
//
//   IT NEVER AIMS AT THE TARGET. The destination is up the road BEHIND the
//   lens, so an aim point walked in a straight line from in front of the
//   camera to a car behind it passes through the camera itself, and a lens
//   asked to look at the point it is standing on tumbles — a whip round to
//   the back, a tumble at the crossing, and a whip back to the front on the
//   last frame. What is interpolated here is the ORIENTATION, from the one
//   the shot started in to the one the rig has written for the frame it is
//   landing on, along the short way round. Two cameras both pointing down
//   the same road barely turn at all, which is the whole point.
//
//   IT LEAVES BACKWARDS. The first move is along the lens's own back axis —
//   away from the line — rather than straight at the destination, so the
//   shot reads as a camera retreating and not as one being dragged sideways.
//   It is worth nothing when the destination is not actually behind, so it
//   is scaled by how much of it is.
//
//   THE ARC CLEARS THE COUNTRY, AND THE LENS TILTS DOWN OVER IT. The ground
//   between two cars on a rally stage is a ridge, a stand of trees and
//   usually a hill; a flight along the line between them is a flight through
//   all of it. The ground is sampled along that line once, at the moment the
//   flight starts, and the arc is lifted until its apex rides just over the
//   tallest thing it found — and the lens pitches down by as much as the lift
//   is worth, so the road stays in the bottom of the frame instead of the
//   shot becoming a horizon.
//
//   IT LANDS ON THE RIG, NOT NEAR IT. The destination is re-read every frame
//   off the pose the chase camera has already written — the car it is built
//   around is still driving — and the last frame of the flight is the rig's
//   own frame, in position AND in aim, so the hand-over has nothing to catch
//   up.

import * as THREE from "three";
import { clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

/** How long the flight takes, s: this much, plus a second for every
 * `TIME_SPAN` metres of ground, capped. A fixed second is the right length
 * for the two hundred metres between two cars in the same fight and a
 * nonsense for the kilometre between the leader and the crew who went off —
 * covering that in the same beat is a scrub through a position rather than a
 * move over the country. */
const TIME_MIN = 0.9;
const TIME_MAX = 1.9;
const TIME_SPAN = 900;

/** Ground between the two poses under which there is no flight at all, m.
 * Changing which VIEW a car is watched from is not a transit — the lens is
 * already there — and a flight with nowhere to go still climbs its clearance
 * and comes back down, which is a lob over a car standing still. */
const MIN_TRAVEL = 12;

/** How far over the tallest GROUND between the two cars the apex rides, m.
 * The crest is sampled off the terrain, and what stands on the terrain is
 * not in it: the old spruce is 16 m before its instance scale, so most of
 * this number is canopy. Past that it is "just above" — the arc is a way
 * over the hill, not a satellite view. */
const CLEARANCE = 26;

/** …and the ground over which that clearance is worth all of it, m. Under it
 * the arch is faded down with the distance, because the clearance is what
 * makes a LONG flight an arc rather than a slide, and on a short one it is
 * just a hop nobody asked for. The crest itself is never faded: a ridge in
 * the way has to be cleared however near it is. */
const ARC_SPAN = 260;

/** …and the hard floor under the lens, m, checked against the ground it is
 * actually over on every frame. The crest above is 28 samples along a line
 * that can be a kilometre, which is enough to find a ridge and not enough to
 * promise it found a spur; a camera through a hillside is a black frame, and
 * this is what makes that impossible rather than unlikely. */
const GUARD = 9;

/** Points along the line the ground is sampled at. The line can be a
 * kilometre, so this is a sample every few tens of metres — enough to find a
 * ridge, and it is walked ONCE per flight rather than per frame. */
const SAMPLES = 28;

/** The retreat off the line: the share of the whole flight the lens backs
 * straight away along its own axis before the arc takes over, and the metres
 * that is allowed to reach. The bump peaks at 4/27 of the reach a third of
 * the way in and is gone by the end, so it shapes the DEPARTURE and cannot
 * argue with the landing. */
const DEPART_FRAC = 0.35;
const DEPART_MAX = 110;

/** How much faster the aim turns than the body travels. Down-the-road to
 * down-the-road is a few degrees and takes no time at all; a hand-over from
 * the drone or from god mode is closer to a right angle, and this puts it on
 * its new heading by two thirds of the way in so the last third is nothing
 * but settling into the rig. */
const TURN_SNAP = 1.6;

/** How far ahead the tilt assumes the shot is looking, m, and the most it
 * will pitch down, rad. A lens `lift` metres above the line it would
 * otherwise be flying has to drop its aim by `atan(lift / reach)` to hold
 * the same ground in frame — the tilt is that angle, so it grows and dies
 * with the arc rather than being a gesture bolted onto it. */
const TILT_REACH = 130;
const TILT_MAX = 0.42;

/** Degrees of extra field of view at the apex. The world stretching as the
 * camera accelerates and settling as it arrives is most of what sells a
 * second's flight as speed rather than as a scrub through a position. */
const FOV_BOOST = 9;

/** How much of the flight is spent climbing, and the same again descending.
 * What is left in the middle is held at FULL lift, which is what makes the
 * shape an ARCH rather than a lob: a lob is only at its clearance for an
 * instant, so anything standing between the two cars has to be cleared by
 * the one frame that passes over it, and everything either side of that
 * frame is lower than the apex the crest was measured for. */
const RAMP = 0.32;

/** The lens's own right axis — the one the tilt below pitches about. */
const RIGHT = new THREE.Vector3(1, 0, 0);

/** Smoothstep, so the flight leaves and arrives at rest. */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** The arch, 0..1: up over `RAMP`, held, and down over the last `RAMP`. */
function arch(t: number): number {
  return ease(t / RAMP) * ease((1 - t) / RAMP);
}

/** The departure, 0..~0.148 — the Hermite tangent basis `t(1-t)²`. Its slope
 * at zero is 1 and at one is 0, so the reach it scales IS the speed the
 * flight leaves at, and the landing does not know it happened. */
function depart(t: number): number {
  return t * (1 - t) * (1 - t);
}

export type SweepCamera = {
  /** Begin a flight from wherever the camera is standing now to the car in
   * `to`. Call it BEFORE anything re-stands the rig: the pose it captures is
   * the frame that is on screen. */
  start: (camera: THREE.PerspectiveCamera, to: GameState) => void;
  /** Whether the flight still owns the frame. */
  flying: () => boolean;
  /** Fly this frame OVER the pose the rig has already written.
   *
   * The caller runs the play rig FIRST, so `camera` arrives holding the pose
   * it would be standing in had there been no flight — position and aim
   * both; this reads that as the destination and pulls the lens back along
   * the arc toward where it came from. `rigFov` is the rig's design fov, and
   * the returned number is the design fov for this frame. On the frame the
   * flight ENDS it touches nothing and hands the rig's own pose straight
   * back, so there is no pop between the last flown frame and the first
   * driven one. */
  fly: (camera: THREE.PerspectiveCamera, to: GameState, rigFov: number, dt: number) => number;
  /** Abandon a flight — a cut is wanted instead. */
  reset: () => void;
};

export function createSweepCamera(): SweepCamera {
  /** How far through the flight, 0..1. One means there is no flight. */
  let at = 1;
  /** …and how long this one is given, s. */
  let span = TIME_MIN;
  /** Where the lens was standing when it started, and the way it was facing
   * from there — the two ends of everything below. */
  const from = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  /** The retreat off the line, in metres of world, already pointing the way
   * the lens's own back axis pointed when the flight started. */
  const away = new THREE.Vector3();
  /** The height the arc has to get over, m — the tallest ground or water on
   * the line between the two cars, read once when the flight starts — and
   * how much of `CLEARANCE` this flight's length has earned. */
  let crest = 0;
  let reach = 0;
  const scratch = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toQuat = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();

  return {
    flying: () => at < 1,
    reset: () => {
      at = 1;
    },
    start: (camera, to) => {
      const car = to.car;
      const ground = Math.hypot(car.x - camera.position.x, car.z - camera.position.z);
      // Already there: this is a change of VIEW and not a transit, and the
      // kindest thing a transit can do with one is not happen.
      if (ground < MIN_TRAVEL) {
        at = 1;
        return;
      }
      from.copy(camera.position);
      fromQuat.copy(camera.quaternion);
      span = clamp(TIME_MIN + ground / TIME_SPAN, TIME_MIN, TIME_MAX);
      reach = clamp(ground / ARC_SPAN, 0, 1);
      // THE RETREAT. Straight back along the lens's own axis, flattened —
      // the shot backs off the line, it does not climb off it — and worth
      // only as much as the destination actually lies that way. A crew being
      // walked back UP the road is in front, and a camera that reversed away
      // from them first would be going the wrong way in the one second it
      // has to explain itself.
      camera.getWorldDirection(scratch);
      scratch.y = 0;
      if (scratch.lengthSq() < 1e-6) scratch.set(0, 0, 1);
      away.copy(scratch).normalize().negate();
      const behind = clamp(
        (away.x * (car.x - from.x) + away.z * (car.z - from.z)) / Math.max(1e-3, ground),
        0,
        1,
      );
      away.multiplyScalar(Math.min(DEPART_MAX, ground * DEPART_FRAC) * behind);
      // THE TALLEST THING IN THE WAY. Water counts as ground: a lake's
      // surface is opaque from underneath, so an arc that dipped through one
      // would spend the middle of the flight showing nothing at all.
      crest = Math.max(from.y, car.y);
      for (let i = 0; i <= SAMPLES; i++) {
        const f = i / SAMPLES;
        const x = from.x + (car.x - from.x) * f;
        const z = from.z + (car.z - from.z) * f;
        crest = Math.max(crest, to.terrain.groundAt(x, z), to.terrain.waterAt(x, z) ?? -Infinity);
      }
      at = 0;
    },
    fly: (camera, to, rigFov, dt) => {
      at = Math.min(1, at + dt / span);
      // Arrived: the rig's pose is already in `camera`, and the kindest thing
      // to do with it is nothing.
      if (at >= 1) return rigFov;
      // Where the rig has stood itself THIS frame, and the way it is facing
      // from there — the destination, both halves of it re-read every frame
      // because the car it is built around is still driving.
      toPos.copy(camera.position);
      toQuat.copy(camera.quaternion);
      const travelled = ease(at);
      const back = depart(at);
      const x = from.x + (toPos.x - from.x) * travelled + away.x * back;
      const z = from.z + (toPos.z - from.z) * travelled + away.z * back;
      const base = from.y + (toPos.y - from.y) * travelled;
      // The lift is measured against the MIDDLE of the flight, because that
      // is where the apex lands: enough to clear the crest from there, and
      // none at either end. Zero when the lens is already over everything,
      // which is a flight that has no reason to climb.
      const arc = arch(at);
      const apex = Math.max(0, crest + CLEARANCE * reach - (from.y + toPos.y) / 2);
      // …and the ground actually under the lens, as a floor. Faded on the
      // same profile as the arc, so it can lift the middle of a flight over
      // something the crest walk stepped past and can never fight the
      // landing at either end.
      const under = Math.max(to.terrain.groundAt(x, z), to.terrain.waterAt(x, z) ?? -Infinity);
      const y = Math.max(base + apex * arc, under + GUARD * arc);
      camera.position.set(x, y, z);
      // THE AIM, along the short way round from the one the shot started in
      // to the one it is landing in. Nothing here knows where the target car
      // is, and nothing here should: the rig on the other end of the flight
      // has already decided how that car is framed, and every frame of the
      // transit is on its way to being that frame.
      camera.quaternion.slerpQuaternions(fromQuat, toQuat, ease(Math.min(1, at * TURN_SNAP)));
      // …then down by as much as the arc has climbed, about the lens's own
      // right axis, so the ground the shot is flying over stays under it.
      const dip = Math.min(TILT_MAX, Math.atan2(Math.max(0, y - base), TILT_REACH));
      if (dip > 1e-4) camera.quaternion.multiply(tilt.setFromAxisAngle(RIGHT, -dip));
      return rigFov + FOV_BOOST * arc;
    },
  };
}
