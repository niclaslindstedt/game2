// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES. Six can be
// driven from, and they are one ladder from inside the car to high above it
// (the ids and the order are PLAY_CAMERAS in settings.ts):
//
//   hood  — in-car/bumper: the road rushes, the nose barely leads the slide.
//   close — the same rig as chase pulled in tight behind the bumper.
//   chase — the classic arcade rally view: low, tight behind the car,
//           tracking a blend of nose and travel direction so a drift swings
//           the car across the frame while the road keeps flowing.
//   far   — stood back and a little higher: less drama, more warning.
//   heli  — high and behind, the shot a chase helicopter would fly.
//   top   — over the roof, tilted just far enough forward to show the road
//           the car is about to be on.
//
// Two more are placed by the app and never cycled into, because neither one
// can be driven from:
//
//   drone — high overhead, trailing and slowly circling: the menu's living
//           backdrop, where a bot is driving and nobody is watching the apex.
//   map   — the whole stage framed from the sky, turning: the Roam page's
//           look at what a seed actually builds.
//
// Every mode but the hood cam is the SAME rig with different proportions —
// one table of numbers (CHASE_RIGS), one update function — so an angle is a
// row rather than another camera to maintain. What separates them is not
// only where they stand but how HEAVY they are: the far rigs answer the car
// slowly and their swing is a sprung mass that overshoots a turn and settles
// back into it, so a camera at a distance reads as something being flown
// rather than something bolted on. In the air the framing goes loose and
// pulls wide, which reads as flying. Landings and splashes kick a decaying
// shake.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

import { PLAY_CAMERAS, type PlayCamera } from "./settings.ts";
import { GROUND_REACH } from "./terrain.ts";

export type CameraMode = PlayCamera | "drone" | "map";
/** The modes the camera key walks, in the order it walks them — the same
 * inside-out ladder the options screen lists, so the key and the setting
 * never disagree about what "the next camera" means. */
export const PLAY_MODES: CameraMode[] = PLAY_CAMERAS.map((cam) => cam.id);

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

/** A camera behind the car, as a set of numbers. The distance and height
 * decide how big the car is in frame; the aim point decides the PITCH, and
 * the pitch is what a shot is really made of — where the car sits
 * vertically and how much sky is left over the horizon. */
type ChaseRig = {
  /** Standoff behind the car at a standstill, m, and the metres added per
   * m/s of pace — the "straining ahead" cue. */
  dist: number;
  distPerSpeed: number;
  /** Height over the car's own y, m. */
  height: number;
  /** How much of the drift's slip angle the framing carries, 0..1. At 1 the
   * camera aims down the car's TRAVEL and the whole slide shows across the
   * frame; at 0 it follows the nose and the drift is invisible. */
  driftWeight: number;
  /** How briskly the camera answers the car, 1/s — the one knob for how
   * HEAVY the rig is, because a camera that snaps to everything the car
   * does has no weight at all. The nose-follow uses it directly; the drift
   * offset winds on at that rate and unwinds at DRIFT_SETTLE of it, and the
   * standoff and height ease at RIG_EASE of it. A camera bolted to a boom
   * behind the bumper is brisk; something with mass flying above the trees
   * is not. */
  followRate: number;
  /** Design fov at a standstill, deg, what a m/s of pace adds, and the
   * ceiling before the world turns into a tunnel. */
  fov: number;
  fovPerSpeed: number;
  fovMax: number;
  /** How far down the road the aim point sits, m, how high over the car's
   * own y, and how far the road's gradient lifts it — a ramp should show
   * the sky over the brow instead of burying the aim in the hillside. */
  aimAhead: number;
  aimHeight: number;
  aimClimb: number;
  /** How far the camera RISES per unit of downhill gradient, m. Going down,
   * a camera that hangs above the road as it falls away reads as dropping
   * into the descent rather than as a flat road that happens to be tilted.
   * ...and how far it DUCKS per unit of uphill, which is less: climbing,
   * the camera settling toward the road puts the brow high in the frame,
   * but a camera under the roofline loses the car. Both are 0 for the
   * cameras that already fly well over the terrain. */
  dropLift: number;
  climbDuck: number;
  /** Lateral swing toward the outside of the turn, m per rad/s of yaw rate,
   * so a turn reads in the framing before the drift angle develops, and the
   * most of it a turn can ever buy, m. */
  swing: number;
  swingMax: number;
  /** The swing is sprung rather than eased: natural frequency in rad/s, and
   * the damping ratio. Under 1 the camera OVERSHOOTS the new framing and
   * settles back into it, which is what reads as a heavy thing being swung
   * around — a first-order ease just arrives, and arriving is what makes a
   * distant camera look bolted to the car. Close in, near-critical and
   * quick: at four metres an overshoot is a lurch, not a sway. */
  swingFreq: number;
  swingDamp: number;
  /** Share of the body's suspension travel the camera rides, 0..1 — a
   * touch, so a landing lands in the FRAME too and does not just happen to
   * the car in front of it. */
  heave: number;
  /** Scale on the impact shake. Distance is its own damping: a hit that
   * rattles a bumper cam is barely a wobble from a hundred feet up. */
  shake: number;
};

/** The ladder, in numbers. `chase` is the reference frame — proportions read
 * off Sega Rally: roof-height camera pitched a few degrees down, close
 * behind, so the car anchors the BOTTOM of the frame and the horizon rides
 * high. `close` and `far` are that same shot pulled in and stood back;
 * `heli` and `top` trade the drama for what the driver cannot otherwise
 * see, which is the road past the next crest.
 *
 * The frame does NOT change when the car leaves the ground: pulling back
 * for a jump makes the biggest moment in the stage read as small and safe,
 * and it is the one moment the camera should hold its nerve. */
const CHASE_RIGS: Record<Exclude<PlayCamera, "hood">, ChaseRig> = {
  close: {
    dist: 3.9,
    distPerSpeed: 0.014,
    height: 1.6,
    driftWeight: 0.85,
    followRate: 5,
    fov: 60,
    fovPerSpeed: 0.4,
    fovMax: 88,
    aimAhead: 7,
    aimHeight: 0.65,
    aimClimb: 5,
    dropLift: 2.2,
    climbDuck: 1,
    swing: 0.4,
    swingMax: 1.2,
    swingFreq: 6.5,
    swingDamp: 1,
    heave: 0.45,
    shake: 1.15,
  },
  chase: {
    dist: 5.6,
    distPerSpeed: 0.02,
    height: 2,
    driftWeight: 0.8,
    followRate: 4.5,
    fov: 58,
    fovPerSpeed: 0.38,
    fovMax: 86,
    aimAhead: 8,
    aimHeight: 0.8,
    aimClimb: 6,
    dropLift: 2.6,
    climbDuck: 1.2,
    swing: 0.45,
    swingMax: 1.3,
    swingFreq: 6,
    swingDamp: 0.95,
    heave: 0.4,
    shake: 1,
  },
  far: {
    dist: 9.8,
    distPerSpeed: 0.03,
    height: 3.3,
    driftWeight: 0.75,
    followRate: 3.8,
    fov: 56,
    fovPerSpeed: 0.3,
    fovMax: 80,
    aimAhead: 11,
    aimHeight: 1,
    aimClimb: 7,
    dropLift: 3.2,
    climbDuck: 1.5,
    swing: 1.1,
    swingMax: 2.4,
    swingFreq: 3.2,
    swingDamp: 0.72,
    heave: 0.3,
    shake: 0.85,
  },
  // Standoff and aim are a pair: 10 m up and 18 m back puts the car 29°
  // below the horizontal, and an aim 12 m ahead pitches the shot 17° down,
  // so the car sits three quarters of the way down the frame — the arcade
  // read, flown — with the horizon still inside the top third.
  heli: {
    dist: 18,
    distPerSpeed: 0.07,
    height: 10,
    driftWeight: 0.9,
    followRate: 2.4,
    fov: 50,
    fovPerSpeed: 0.16,
    fovMax: 62,
    aimAhead: 12,
    aimHeight: 1.05,
    aimClimb: 4,
    dropLift: 0,
    climbDuck: 0,
    swing: 3.4,
    swingMax: 4.5,
    swingFreq: 1.7,
    swingDamp: 0.5,
    heave: 0,
    shake: 0.35,
  },
  // Over the roof, tilted only far enough to see what is coming. The wide
  // fov is what buys that tilt: with the camera almost directly above the
  // car, the car sits ~76° below the horizontal, so a narrow frame has to
  // point nearly straight down to hold it — and straight down is a map,
  // which gives a driver no warning at all. Opening the frame to ~70°
  // lets the shot pitch back to ~57° and still keep the car three quarters
  // down it, which reaches some 45 m of road past the nose.
  top: {
    dist: 4,
    distPerSpeed: 0.05,
    height: 20,
    driftWeight: 1,
    followRate: 2.8,
    fov: 68,
    fovPerSpeed: 0.12,
    fovMax: 78,
    aimAhead: 8,
    aimHeight: 0,
    aimClimb: 0,
    dropLift: 0,
    climbDuck: 0,
    swing: 3.8,
    swingMax: 5,
    swingFreq: 1.5,
    swingDamp: 0.45,
    heave: 0,
    shake: 0.3,
  },
};

/** How the two other easings are geared off a rig's `followRate`. The drift
 * offset winds ON fast and unwinds SLOWLY — a camera that re-centres the
 * instant a slide ends reads as the game grabbing the wheel — and the
 * standoff and height follow a little behind the yaw. The chase rig's 4.5
 * puts them at 1.6 and 3.0, which is the frame the other five are judged
 * against. */
const DRIFT_SETTLE = 0.36;
const RIG_EASE = 0.67;

/** Longest step the swing spring is integrated over, s. */
const SPRING_STEP = 1 / 90;

/** Clearance a chase camera is never allowed under, m — over the ground
 * AND over any water. The camera trails the car, so on any real descent the
 * ground behind is higher than the ground under the wheels and a fixed
 * roof-height camera is simply inside the hill; run along a shoreline and
 * the same camera drops under the lake, which is the sheet of flat blue
 * that swallows half the frame. Both are checked at the camera's own
 * position, never the car's. */
const CHASE_CLEARANCE = 1.3;

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
  /** Lateral camera offset toward the outside of the current turn, m, and
   * the speed it is moving at — the swing is a sprung mass, so it carries
   * momentum through the moment the wheel comes back. */
  let swing = 0;
  let swingVel = 0;
  /** Seconds the camera has been alive — the drone's circling and the map
   * view's azimuth both walk off it, so neither depends on frame rate. */
  let orbit = 0;
  /** How far the map view is standing off the stage, m — the renderer hangs
   * the fog off it so the built ground always dissolves before its edge. */
  let mapRange = 0;

  const updateChase = (rig: ChaseRig, state: GameState, dt: number): void => {
    const car = state.car;
    const speed = Math.hypot(car.u, car.w);
    // The Sega Rally read: the camera follows the ROAD, so a drift swings
    // the car across the frame while the road keeps flowing to the
    // vanishing point. Airborne it follows the travel direction fully; the
    // nose is doing its own thing.
    const slip = speed > 3 ? Math.atan2(car.w, Math.max(0.001, car.u)) : 0;
    const wantOff = slip * (car.airborne ? 1 : rig.driftWeight);
    // The drift arrives in the frame at full speed, but once the car has
    // settled the leftover angle unwinds gently: a camera that snaps back
    // to centre the instant the slide ends reads as the game grabbing the
    // wheel. A slide building the OTHER way (the pendulum) counts as
    // developing, not settling.
    const developing =
      Math.abs(wantOff) > Math.abs(driftOff) ||
      (Math.sign(wantOff) !== Math.sign(driftOff) && Math.abs(wantOff) > 0.05);
    const driftRate = rig.followRate * (developing ? 1 : DRIFT_SETTLE);
    driftOff += (wantOff - driftOff) * clamp(driftRate * dt, 0, 1);
    // Half the follow rate in the air: the framing goes loose while the car
    // is ballistic, which is what reads as flying rather than as a camera
    // welded to a boom.
    const follow = car.airborne ? rig.followRate * 0.5 : rig.followRate;
    headYaw = angleLerp(headYaw, car.heading, clamp(follow * dt, 0, 1));
    yaw = headYaw + driftOff;

    // Grounded, vy/u is the slope under the wheels, and the camera rides
    // high over a descent and settles toward the road on a climb. Both
    // directions serve the same read — what is ahead of the car should own
    // the frame, and on a hill that is either the drop or the brow.
    const grade = clamp(car.vy / Math.max(8, car.u), -0.5, 0.5);
    const gradeLift = car.airborne ? 0 : -grade * (grade < 0 ? rig.dropLift : rig.climbDuck);
    const wantDist = rig.dist + car.u * rig.distPerSpeed;
    const wantHeight = rig.height + gradeLift;
    const ease = clamp(rig.followRate * RIG_EASE * dt, 0, 1);
    dist += (wantDist - dist) * ease;
    height_ += (wantHeight - height_) * ease;

    // Speed lives in the FOV: it stretches hard with pace (capped before
    // the boost overrun turns the world into a tunnel).
    const wantFov = Math.min(rig.fovMax, rig.fov + car.u * rig.fovPerSpeed);
    fov += (wantFov - fov) * clamp(4 * dt, 0, 1);

    const wantSwing = clamp(-car.yawRate * rig.swing, -rig.swingMax, rig.swingMax);
    // Integrated in bounded substeps rather than over the whole frame: a
    // stiff spring stepped at a hitching tab's dt rings or blows up, and
    // clamping the step instead would make the sway run slow on a weak
    // machine — the sway would then be a frame-rate reading.
    const w2 = rig.swingFreq * rig.swingFreq;
    const damp = 2 * rig.swingDamp * rig.swingFreq;
    for (let left = dt; left > 0; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      swingVel += (w2 * (wantSwing - swing) - damp * swingVel) * h;
      swing += swingVel * h;
    }
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const sx = (Math.random() - 0.5) * shake * rig.shake;
    const sy = (Math.random() - 0.5) * shake * rig.shake;
    const camX = car.x - Math.sin(yaw) * dist + rightX * swing + sx;
    const camZ = car.z - Math.cos(yaw) * dist + rightZ * swing;
    // The floor is read where the CAMERA is: trailing a car down a hill
    // puts it inside the slope it just came over, and no amount of height
    // above the CAR fixes that. Water counts as ground here — a lake's
    // surface is opaque from underneath, so dropping below one costs the
    // whole frame. Never sink under either: a shot from too high still
    // shows the game.
    const surface = state.terrain.waterAt(camX, camZ);
    const under = Math.max(state.terrain.groundAt(camX, camZ), surface ?? -Infinity);
    const floor = under + CHASE_CLEARANCE;
    const want = car.y + height_ + car.ride * rig.heave + sy;
    camera.position.set(camX, Math.max(want, floor), camZ);
    // The drop from camera to aim point over the run between them IS the
    // pitch of the shot — a few degrees for the chase rigs, most of a right
    // angle for the one over the roof. On a slope the aim rides the climb
    // (vy/u is the road's gradient while grounded).
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.lookAt(
      car.x + Math.sin(yaw) * rig.aimAhead,
      car.y + rig.aimHeight + climb * rig.aimClimb + sy * 0.5,
      car.z + Math.cos(yaw) * rig.aimAhead,
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
    // Bolted to the BODY, so it rides the springs with it: the hood cam
    // squats through a landing and dives under the brakes because the thing
    // it is mounted to does.
    camera.position.set(
      car.x + Math.sin(yaw) * 0.4 + sx,
      car.y + 1.15 + car.ride + sy,
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
    else updateChase(CHASE_RIGS[mode], state, dt);
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
      // Genuinely a no-op from the overhead views: the drone and the map are
      // the menu's own framing, and walking them onto a driving camera would
      // leave a menu page standing over a shot nobody asked for.
      const at = PLAY_MODES.indexOf(mode);
      if (at < 0) return mode;
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
