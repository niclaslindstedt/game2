// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE CAMERA IS, from outside: the handle the app and the renderer hold
// (`GameCamera`) — every mode the lens can be put in, every reading taken off
// it, and every event that has to reach it, from a change of seat down to the
// blow a tree hands the driver's neck.
//
// It is its own file for the reason `renderer-face.ts` is: the surface is
// read by half a dozen modules that have no business importing the rig, and
// a type stated beside the machine it describes is a type nobody can read
// without the machine in the way.
//
// `camera.ts` builds one; the rigs behind each mode are the `camera-*`
// modules it names.

import * as THREE from "three";
import type { GameState } from "@engine";

import type { CarEyes, EyeTuning } from "./camera-eye.ts";
import type { FreeFlyMove, FreeFlyPose, FreeFlyRig } from "./camera-free.ts";
import type { ShakeSource } from "./camera-shake.ts";
// The ladder itself stays in `camera.ts`, beside the rigs that walk it.
// Type-only, so the pair is a cycle on paper and nothing at all once the
// types are erased.
import type { CameraMode, MapPose } from "./camera.ts";

export type GameCamera = {
  camera: THREE.PerspectiveCamera;
  mode: () => CameraMode;
  /** How far the TV cam's live tripod is from the car, m — the distance its
   * shot is focused at, for the one pass in the game that has a focal plane
   * (camera-tv-lens.ts). Meaningless, and never read, in any other mode. */
  tvFocus: () => number;
  /** Whether a TRIPOD is what is drawing this frame. False in every mode but
   * `tv`, and false inside it for the road between the corners and for the
   * flight back onto the boom (camera-tv-cut.ts) — which is the whole of what
   * the focal plane above is honest for: a chase boom has no shallow depth of
   * field, and a lens mid-flight is not standing where the focus was solved
   * from. */
  tvTrackside: () => boolean;
  /** Hold the TV mode on its tripods for the rest of the session — the pin a
   * scripted still needs so it comes off the same lens every time it is
   * taken (camera-tv-cut.ts). Nothing in the game asks for it. */
  pinTvStand: () => void;
  /** THE MAP VIEW (camera-map.ts): the whole stage from the sky, and the
   * handles the Roam page steers it by — turn, tilt, zoom, pan, and the
   * framing a link can park it on. Exposed one method at a time rather than
   * as the rig itself, so the app talks to ONE camera whatever mode is up. */
  mapRange: () => number;
  setMode: (mode: CameraMode) => void;
  nudgeMap: (dAz: number, dPitch: number, zoomBy: number) => void;
  panMap: (dxFrac: number, dyFrac: number) => void;
  resetMap: () => void;
  reframeMap: () => void;
  placeMap: (pose: Partial<MapPose>) => void;
  holdMap: (held: boolean) => void;
  mapPose: () => MapPose;
  /** Advance to the next PLAYABLE mode; a no-op read while overhead. The
   * ladder is the eight views a stage is driven from, unless the run is one
   * nobody is steering — a replay — in which case it also walks the TV
   * gallery (`DRIVING_MODES`, `PLAY_MODES`). */
  cycle: (watching?: boolean) => CameraMode;
  /** God mode's rig, and the channel its controls write into. The move is
   * rewritten by the app every frame and CONSUMED by `update` — the look
   * deltas and the wheel steps are per-frame accumulators, so leaving them
   * standing would spin the camera forever. */
  free: FreeFlyRig;
  freeMove: FreeFlyMove;
  /** Fly the free camera on a clock of its own, for a frame whose world is
   * being held still — god mode stops the run under it and draws it with
   * dt 0, which is a dt the flight cannot take its own step from. A no-op
   * in every other mode. */
  flyOnly: (dt: number) => void;
  /** Where the camera is standing and what it is looking at, whatever mode
   * is up — what the debug overlay prints and the repro line carries. */
  pose: () => FreeFlyPose;
  /** Put a different LENS on god mode's camera, deg of vertical fov; 0 or
   * less puts the design lens back. For tools shooting a frame the design
   * number was not authored for — see `freeFov`. */
  setFreeFov: (deg: number) => void;
  /** How far the camera may SEE, m — the far plane, with a near plane scaled
   * under it to keep the depth buffer honest. 0 or less restores the driving
   * pair. See `reachFar`. */
  setReach: (far: number) => void;
  /** Where the three in-car views mount on the car now on the stage,
   * body-local m — pushed when the car's meshes are built, because every one
   * of them is read off that car's own silhouette. */
  setEyes: (eyes: CarEyes) => void;
  /** The player's seat, lens and head-motion settings for the in-car views
   * (OPTIONS ▸ VIEW). */
  setViewTuning: (tuning: EyeTuning) => void;
  /** The driver has thrown the establishing shot away. The engine's own skip
   * is instant; this lets the camera fly the rest of the shot at speed
   * instead of cutting (camera-start.ts). */
  skipStartShot: () => void;
  /** Rewind the establishing shot for a new run. */
  resetStartShot: () => void;
  /** PUT THE LENS ON THIS CAR, wherever it has been. The spectator feed hands
   * `update` another crew's game entirely (App.tsx), so every reading the rig
   * carries — its yaw, its floor, its sway, and above all the flying finish's
   * PLANT, which is taken from wherever the camera was standing — belongs to
   * a different road. This drops all of it and stands the rig around `state`
   * in one call, with no time in it.
   *
   * `fly` makes the change a flight back up the road over the country
   * between the two rather than a cut (camera-sweep.ts) — which is what a
   * spectator
   * CHANGING crew wants, and what standing the feed down does not: the
   * results card is the destination there, and a shot nobody is going to look
   * at is not worth a second. */
  retake: (state: GameState, fly?: boolean) => void;
  /** THE CAR HAS BEEN PICKED UP AND PUT DOWN ON THE SAME RUN — a respawn:
   * drowned, driven off the map, or the reset button pressed. Everything a
   * rig carries from frame to frame is an angle, a standoff and a floor
   * measured where the car WAS, and the car is now back at the last split
   * board, quite possibly facing the way it came. Eased across that gap the
   * boom spends the best part of a second swinging round the car to find the
   * stage again — which is the game taking the camera away at the exact
   * moment the player asked for it back. So the readings are dropped and the
   * shot is STOOD where the car is, in the one frame the press cost. */
  replant: () => void;
  update: (state: GameState, dt: number) => void;
  /** Hand the shot a blow. `dir` is the world direction it came FROM the
   * car's middle toward — the in-car views throw the driver's head along it
   * and let the neck spend the impulse, which is the only thing in an in-car
   * frame that says the car hit something. `source` says what KIND of blow it
   * was, and camera-shake.ts decides from that how much of it each family of
   * camera takes: an outside rig takes none of a `contact`, because the car
   * is the thing that ran into the tree and the car is what is in frame. */
  kick: (strength: number, dir?: { x: number; y: number; z: number }, source?: ShakeSource) => void;
  resize: (width: number, height: number) => void;
};
