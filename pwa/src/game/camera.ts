// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES; four ship:
//
//   chase — the classic arcade rally view: low, tight behind the car,
//           tracking a blend of nose and travel direction so a drift swings
//           the car across the frame while the road keeps flowing.
//   hood  — in-car/bumper: the road rushes, the nose barely leads the slide.
//   drone — high overhead, trailing and slowly circling: the menu's living
//           backdrop, where a bot is driving and nobody is watching the
//           apex. Not in the play cycle — you cannot drive from up there.
//   map   — the whole stage framed from the sky, turning: the Roam page's
//           look at what a seed actually builds.
//
// In the air chase and hood go loose and pull wide, which reads as flying.
// Landings and splashes kick a decaying shake.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

import { GROUND_REACH } from "./terrain.ts";

export type CameraMode = "chase" | "hood" | "drone" | "map";
/** The modes the camera key walks. Drone and map are placed by the app,
 * never cycled into — neither one can be driven from. */
export const PLAY_MODES: CameraMode[] = ["chase", "hood"];

/** The map view's design fov, deg — tight enough that the stage reads as a
 * model on a table rather than a fisheyed globe. */
const MAP_FOV = 42;
/** How far above the horizon the map camera sits, radians (~57°). Steeper
 * flattens the hills and lakeshores into a paint job and the map stops being
 * worth looking at; shallower and the far half of the stage starts hiding
 * behind the near ridges. */
const MAP_PITCH = 1.0;
/** Landscape kept around the stage's bounds, meters. This is the LAND's own
 * reach rather than a chosen margin: ground exists within `GROUND_REACH` of
 * the road and not a meter further, so framing exactly that much shows the
 * whole map — every lake and hillside the seed built, and nothing of the
 * void past the edge. A little over, so the coastline is not flush with the
 * frame. */
const MAP_MARGIN = GROUND_REACH * 1.06;
/** Azimuth rate, rad/s — a full turn every ~70 s. */
const MAP_SPIN = 0.09;
/** How far past the map's centre the view aims, as a fraction of the
 * standoff — the correction a pitched frustum needs (see updateMap). */
const MAP_LEAN = 0.08;
/** How far to the side the drone flies, m. The menu's cards sit in the
 * middle of the screen, so a drone parked squarely behind the car puts the
 * one thing worth watching underneath them. Offsetting the CAMERA walks the
 * car off to the side of frame, where it stays visible beside the card at
 * every viewport. */
const DRONE_SIDE = 26;
/** Far plane while driving, m — comfortably past the widest fog ceiling.
 * The map view solves its own, because a stage is kilometres wide. */
const DRIVING_FAR = 900;

/** Aspect ratio the fov numbers in this file are tuned against (landscape). */
const REF_ASPECT = 16 / 9;
/** Vertical fov ceiling on narrow viewports, deg — where hor+ stops before
 * a phone held upright turns into a fisheye. */
const MAX_VFOV = 110;

/** three.js fov is VERTICAL, so a fixed number collapses the horizontal
 * field on a narrow viewport: portrait would see ~30° across, and every
 * degree of yaw would sweep three times more of the frame width than in
 * landscape — steering and drift READ as wildly amplified even though the
 * physics is identical. Below the reference aspect the horizontal field is
 * held instead (hor+), so a turn sweeps the same share of the frame
 * whichever way the phone is held. */
function verticalFovFor(designFov: number, aspect: number): number {
  if (!(aspect < REF_ASPECT)) return designFov;
  const halfH = Math.atan(Math.tan((designFov * Math.PI) / 360) * REF_ASPECT);
  return Math.min(MAX_VFOV, (Math.atan(Math.tan(halfH) / aspect) * 360) / Math.PI);
}

export type GameCamera = {
  camera: THREE.PerspectiveCamera;
  mode: () => CameraMode;
  /** The map view's standoff distance, m (0 until it has framed a stage). */
  mapRange: () => number;
  setMode: (mode: CameraMode) => void;
  /** Advance to the next PLAYABLE mode; a no-op read while overhead. */
  cycle: () => CameraMode;
  update: (state: GameState, dt: number) => void;
  kick: (strength: number) => void;
  resize: (width: number, height: number) => void;
};

export function createGameCamera(width: number, height: number): GameCamera {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.25, DRIVING_FAR);
  let mode: CameraMode = "chase";
  let yaw = 0;
  /** Chase yaw, decomposed: the part that follows the nose... */
  let headYaw = 0;
  /** ...and the drift's slip angle riding on top of it, rad. */
  let driftOff = 0;
  let dist = 6.2;
  let height_ = 2.0;
  let shake = 0;
  let fov = 60;
  /** Lateral camera offset toward the outside of the current turn, m. */
  let swing = 0;
  /** Seconds the camera has been alive — the drone's circling and the map
   * view's azimuth both walk off it, so neither depends on frame rate. */
  let orbit = 0;
  /** How far the map view is standing off the stage, m — the renderer hangs
   * the fog off it so the built ground always dissolves before its edge. */
  let mapRange = 0;

  const updateChase = (state: GameState, dt: number): void => {
    const car = state.car;
    const speed = Math.hypot(car.u, car.w);
    // Grounded: 20% nose, 80% travel — the Sega Rally read: the camera
    // follows the ROAD, so a drift swings the car across the frame while
    // the road keeps flowing to the vanishing point. Airborne: follow the
    // travel direction fully; the nose is doing its own thing.
    const slip = speed > 3 ? Math.atan2(car.w, Math.max(0.001, car.u)) : 0;
    const wantOff = slip * (car.airborne ? 1 : 0.8);
    // The drift arrives in the frame at full speed, but once the car has
    // settled the leftover angle unwinds gently: a camera that snaps back
    // to centre the instant the slide ends reads as the game grabbing the
    // wheel. A slide building the OTHER way (the pendulum) counts as
    // developing, not settling.
    const developing =
      Math.abs(wantOff) > Math.abs(driftOff) ||
      (Math.sign(wantOff) !== Math.sign(driftOff) && Math.abs(wantOff) > 0.05);
    driftOff += (wantOff - driftOff) * clamp((developing ? 4.5 : 1.6) * dt, 0, 1);
    headYaw = angleLerp(headYaw, car.heading, clamp((car.airborne ? 2.2 : 4.5) * dt, 0, 1));
    yaw = headYaw + driftOff;

    // Proportions read off the Sega Rally chase cam: roof-height camera
    // (~2 m) pitched only a few degrees down, close behind, so the car
    // anchors the BOTTOM of the frame and the horizon rides high. The frame
    // does NOT change when the car leaves the ground: pulling back for a
    // jump makes the biggest moment in the stage read as small and safe,
    // and it is the one moment the camera should hold its nerve.
    const wantDist = 5.6 + car.u * 0.02;
    const wantHeight = 2.0;
    dist += (wantDist - dist) * clamp(3 * dt, 0, 1);
    height_ += (wantHeight - height_) * clamp(3 * dt, 0, 1);

    // Speed lives in the FOV: it stretches hard with pace (capped before
    // the boost overrun turns the world into a tunnel).
    const wantFov = Math.min(86, 58 + car.u * 0.38);
    fov += (wantFov - fov) * clamp(4 * dt, 0, 1);

    // Turning swings the camera toward the OUTSIDE of the corner, so a
    // turn reads in the framing even before the drift angle does.
    const wantSwing = clamp(-car.yawRate * 0.45, -1.3, 1.3);
    swing += (wantSwing - swing) * clamp(4 * dt, 0, 1);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    camera.position.set(
      car.x - Math.sin(yaw) * dist + rightX * swing + sx,
      car.y + height_ + sy,
      car.z - Math.cos(yaw) * dist + rightZ * swing,
    );
    // Aim well down the road and low over the roof: the drop from camera
    // to aim point over ~14 m of run is the ~5° downward pitch of the
    // reference frame — car at the bottom, horizon high. On a slope the aim
    // rides the climb (vy/u is the road's gradient while grounded), so a
    // ramp shows the sky over the brow instead of the camera burying its
    // aim in the hillside.
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.lookAt(
      car.x + Math.sin(yaw) * 8,
      car.y + 0.8 + climb * 6 + sy * 0.5,
      car.z + Math.cos(yaw) * 8,
    );
  };

  const updateHood = (state: GameState, dt: number): void => {
    const car = state.car;
    // The hood cam sits on the car and looks where the NOSE points — in a
    // drift the world sweeps across the windshield, which is the drama.
    yaw = angleLerp(yaw, car.heading, clamp(14 * dt, 0, 1));
    const wantFov = Math.min(92, 64 + car.u * 0.42);
    fov += (wantFov - fov) * clamp(5 * dt, 0, 1);
    const sx = (Math.random() - 0.5) * shake * 0.6;
    const sy = (Math.random() - 0.5) * shake * 0.6;
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.position.set(
      car.x + Math.sin(yaw) * 0.4 + sx,
      car.y + 1.15 + sy,
      car.z + Math.cos(yaw) * 0.4,
    );
    camera.lookAt(
      car.x + Math.sin(yaw) * 12,
      car.y + 0.9 + climb * 9 + sy,
      car.z + Math.cos(yaw) * 12,
    );
  };

  /** The drone: high above and behind, trailing the car and circling it
   * slowly. The yaw follows the nose far more lazily than the chase cam
   * does — a drone has mass and a pilot, and a camera at this altitude that
   * snapped to every corner would read as a map scrolling rather than
   * something flying. The circling and the altitude breathe are what stop a
   * menu backdrop from looking like a paused screenshot. */
  const updateDrone = (state: GameState, dt: number): void => {
    const car = state.car;
    headYaw = angleLerp(headYaw, car.heading, clamp(0.9 * dt, 0, 1));
    // A full circle every ~46 s, ±0.55 rad off the car's heading.
    const circle = Math.sin(orbit * ((Math.PI * 2) / 46)) * 0.55;
    yaw = headYaw + circle;
    const wantDist = 40 + car.u * 0.22;
    // Breathes ±3 m over ~19 s, so the shot never sits perfectly still.
    const wantHeight = 34 + Math.sin(orbit * ((Math.PI * 2) / 19)) * 3;
    dist += (wantDist - dist) * clamp(1.2 * dt, 0, 1);
    height_ += (wantHeight - height_) * clamp(1.2 * dt, 0, 1);
    fov += (52 - fov) * clamp(2 * dt, 0, 1);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    camera.position.set(
      car.x - Math.sin(yaw) * dist + rightX * DRONE_SIDE,
      car.y + height_,
      car.z - Math.cos(yaw) * dist + rightZ * DRONE_SIDE,
    );
    // Aimed ahead of the car rather than at it, so the road the bot is
    // about to take is the thing in frame — and pitched to keep some sky in
    // the top of the shot, which is what makes it read as flying rather
    // than as a map scrolling past.
    camera.lookAt(
      car.x + Math.sin(yaw) * 46 + rightX * DRONE_SIDE * 0.55,
      car.y + 12,
      car.z + Math.cos(yaw) * 46 + rightZ * DRONE_SIDE * 0.55,
    );
  };

  /** The whole stage from the sky, turning: frame the built landscape and
   * walk the azimuth around it. The distance is solved from the camera's
   * ACTUAL half-angles after the hor+ correction, so the map fills its pane
   * at any shape of pane. */
  const updateMap = (state: GameState): void => {
    const b = state.track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 200);
    fov = MAP_FOV;
    const vHalf = (verticalFovFor(MAP_FOV, camera.aspect) * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const radius = span / 2 + MAP_MARGIN;
    // Fit BOTH axes, and only the depth axis is foreshortened. The map lies
    // in the ground plane and the camera looks down it at MAP_PITCH, so what
    // the pane must hold vertically is the footprint's depth SQUASHED by
    // sin(pitch). Fitting the raw span to the vertical angle instead — as a
    // fit that ignored the pitch would — pushes the camera a fifth too far
    // out and leaves the map floating in a paneful of sky.
    const range = Math.max(
      (radius * Math.sin(MAP_PITCH)) / Math.tan(vHalf),
      radius / Math.tan(hHalf),
    );
    mapRange = range;
    const az = orbit * MAP_SPIN;
    const ground = Math.cos(MAP_PITCH) * range;
    camera.position.set(
      cx + Math.sin(az) * ground,
      Math.sin(MAP_PITCH) * range,
      cz + Math.cos(az) * ground,
    );
    // Aimed a little BEYOND the centre, away from the camera: a pitched view
    // projects the near half larger than the far one, so an aim on the exact
    // middle runs the nearest coastline off the bottom of the pane while
    // leaving empty sky at the top.
    const lean = range * MAP_LEAN;
    camera.lookAt(cx + Math.sin(az) * -lean, 0, cz + Math.cos(az) * -lean);
    camera.far = Math.max(900, range * 2.4);
  };

  const update = (state: GameState, dt: number): void => {
    shake = Math.max(0, shake - 6 * dt * shake - 0.4 * dt);
    orbit += dt;
    if (mode !== "map") camera.far = DRIVING_FAR;
    if (mode === "hood") updateHood(state, dt);
    else if (mode === "drone") updateDrone(state, dt);
    else if (mode === "map") updateMap(state);
    else updateChase(state, dt);
    camera.fov = verticalFovFor(fov, camera.aspect);
    camera.updateProjectionMatrix();
  };

  return {
    camera,
    mode: () => mode,
    mapRange: () => mapRange,
    setMode: (next) => {
      mode = next;
    },
    cycle: () => {
      const at = PLAY_MODES.indexOf(mode);
      mode = PLAY_MODES[(at + 1) % PLAY_MODES.length];
      return mode;
    },
    update,
    kick: (strength) => {
      shake = Math.min(0.8, shake + strength);
    },
    resize: (width2, height2) => {
      camera.aspect = width2 / height2;
      camera.updateProjectionMatrix();
    },
  };
}
