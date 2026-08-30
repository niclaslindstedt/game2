// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRANSIT — the camera flying from one car to another.
//
// A spectator feed (spectate.ts) changes cars: NEXT walks back down the road
// to the crew behind, PREVIOUS walks up it, and a crew who crosses the line
// under the camera hands the frame to whoever is still driving. Every one of
// those is a jump of hundreds of metres, sometimes a kilometre, and a CUT
// across a gap that size tells the viewer nothing: the new car simply appears
// somewhere, and the stage between the two might as well not exist.
//
// So the camera GOES there, and it goes in a second flat. Three things make
// the move readable at that speed:
//
//   IT ARCS, AND THE ARC CLEARS THE COUNTRY. The ground between two cars on a
//   rally stage is a ridge, a stand of trees and usually a hill; a flight
//   along the straight line between them is a flight through all of it. So
//   the ground is sampled along that line once, at the moment the flight
//   starts, and the arc is lifted until its apex rides just over the tallest
//   thing it found. On flat ground `CLEARANCE` alone is what makes it an arc
//   rather than a slide.
//
//   IT LANDS ON THE RIG, NOT NEAR IT. The destination is re-read every frame
//   off the pose the chase camera has already written — the car it is built
//   around is still driving — and the last frame of the flight is the rig's
//   own frame, so the hand-over has nothing to catch up.
//
//   THE AIM WHIPS ROUND FIRST. The lens turns onto the target several times
//   faster than the body travels, so the viewer knows WHO they are going to
//   before the ground starts moving underneath them.

import * as THREE from "three";
import type { GameState } from "@engine";

/** How long the flight takes, s. One second is the whole brief: long enough
 * to read as a move over the country, short enough that nobody watching a
 * results card is waiting on it. */
const TIME = 1;

/** How far over the tallest GROUND between the two cars the apex rides, m.
 * The crest is sampled off the terrain, and what stands on the terrain is
 * not in it: the old spruce is 16 m before its instance scale, so most of
 * this number is canopy. Past that it is "just above" — the arc is a way
 * over the hill, not a satellite view — and on flat ground it is the whole
 * reason the flight is an arc rather than a slide. */
const CLEARANCE = 26;

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

/** How far ahead of the lens the old aim point is taken when the flight
 * starts, m. Only the DIRECTION matters — it is the point the aim blends
 * away from — so this is any distance that is not nearly zero. */
const AIM_REACH = 25;

/** How much faster the aim turns than the body travels. The lens is on the
 * target a quarter of the way in, which is what stops the flight reading as
 * the camera being dragged somewhere it is not looking. */
const AIM_SNAP = 3.6;

/** How far above the target car's own height the aim sits, m. */
const AIM_UP = 0.9;

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

/** Smoothstep, so the flight leaves and arrives at rest. */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** The arch, 0..1: up over `RAMP`, held, and down over the last `RAMP`. */
function arch(t: number): number {
  return ease(t / RAMP) * ease((1 - t) / RAMP);
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
   * it would be standing in had there been no flight; this reads that as the
   * destination and pulls the lens back along the arc toward where it came
   * from. `fov` is the rig's design fov, and the returned number is the
   * design fov for this frame. On the frame the flight ENDS it touches
   * nothing and hands the rig's own pose straight back, so there is no pop
   * between the last flown frame and the first driven one. */
  fly: (camera: THREE.PerspectiveCamera, to: GameState, rigFov: number, dt: number) => number;
  /** Abandon a flight — a cut is wanted instead. */
  reset: () => void;
};

export function createSweepCamera(): SweepCamera {
  /** How far through the flight, 0..1. One means there is no flight. */
  let at = 1;
  /** Where the lens was standing when it started, and the point it was
   * looking at from there. */
  const from = new THREE.Vector3();
  const fromAim = new THREE.Vector3();
  /** The height the arc has to get over, m — the tallest ground or water on
   * the line between the two cars, read once when the flight starts. */
  let crest = 0;
  const scratch = new THREE.Vector3();
  const aim = new THREE.Vector3();

  return {
    flying: () => at < 1,
    reset: () => {
      at = 1;
    },
    start: (camera, to) => {
      from.copy(camera.position);
      camera.getWorldDirection(scratch);
      fromAim.copy(from).addScaledVector(scratch, AIM_REACH);
      // THE TALLEST THING IN THE WAY. Water counts as ground: a lake's
      // surface is opaque from underneath, so an arc that dipped through one
      // would spend the middle of the flight showing nothing at all.
      const car = to.car;
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
      at = Math.min(1, at + dt / TIME);
      // Arrived: the rig's pose is already in `camera`, and the kindest thing
      // to do with it is nothing.
      if (at >= 1) return rigFov;
      // Where the rig has stood itself THIS frame — the destination, re-read
      // every frame because the car it is built around is still driving.
      const toX = camera.position.x;
      const toY = camera.position.y;
      const toZ = camera.position.z;
      const travelled = ease(at);
      const x = from.x + (toX - from.x) * travelled;
      const z = from.z + (toZ - from.z) * travelled;
      const base = from.y + (toY - from.y) * travelled;
      // The lift is measured against the MIDDLE of the flight, because that
      // is where the apex lands: enough to clear the crest from there, and
      // none at either end. Zero when the lens is already over everything,
      // which is a flight that has no reason to climb.
      const arc = arch(at);
      const apex = Math.max(0, crest + CLEARANCE - (from.y + toY) / 2);
      // …and the ground actually under the lens, as a floor. Faded on the
      // same profile as the arc, so it can lift the middle of a flight over
      // something the crest walk stepped past and can never fight the
      // landing at either end.
      const under = Math.max(to.terrain.groundAt(x, z), to.terrain.waterAt(x, z) ?? -Infinity);
      camera.position.set(x, Math.max(base + apex * arc, under + GUARD * arc), z);
      const car = to.car;
      const turned = ease(Math.min(1, at * AIM_SNAP));
      aim.set(
        fromAim.x + (car.x - fromAim.x) * turned,
        fromAim.y + (car.y + AIM_UP - fromAim.y) * turned,
        fromAim.z + (car.z - fromAim.z) * turned,
      );
      camera.lookAt(aim);
      return rigFov + FOV_BOOST * arc;
    },
  };
}
