// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES. Six can be
// driven from, and they are one ladder from inside the car to high above it
// (the ids and the order are PLAY_CAMERAS in settings.ts):
//
//   hood  — from the driver's seat, over the car's own bonnet: the road
//           rushes, the head rides a neck, and the road buzzes through it.
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
// The five outside cameras are the SAME rig with different proportions —
// one table of numbers (CHASE_RIGS), one update function — so an angle is a
// row rather than another camera to maintain. What separates them is not
// only where they stand but how HEAVY they are: the far rigs answer the car
// slowly and their swing is a sprung mass that overshoots a turn and settles
// back into it, so a camera at a distance reads as something being flown
// rather than something bolted on. In the air the framing goes loose and
// pulls wide, which reads as flying. Landings and splashes kick a decaying
// shake.
//
// The hood cam is the one that is not a rig, because it is not standing
// anywhere: it is sat in the car, and what makes it worth driving from is
// that the eye has WEIGHT (HEAD) and the road has GRAIN (GRAIN).
//
// And one BEAT overrides whichever of them is up: the flying finish. The
// moment the car crosses the line the camera stops travelling with it,
// plants itself where it stood, and simply turns to watch the car go — the
// shot every rally broadcast cuts to, and the reason R25 builds road past
// the gate for the car to disappear down.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

import type { HoodEye } from "./car-styles.ts";
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
/** Near plane while driving, m, and the closer one the hood cam needs. The
 * bonnet sits about a third of a metre under that lens, and a head thrown
 * down by a landing takes most of the margin the default near plane leaves:
 * clipped, the panel would open a hole for the landscape to show through.
 * Pulling it in costs depth precision that nothing at this range spends. */
const DRIVING_NEAR = 0.25;
const HOOD_NEAR = 0.1;
/** How far down the road the hood cam's aim point is thrown, m. Only the
 * DIRECTION matters — far enough out that the pitch and the glance read as
 * angles rather than as a point being circled. */
const AIM_REACH = 20;

/** The driver's head. The hood camera's eye is not bolted to the scuttle:
 * it rides a neck, and the neck is a damped spring chasing the mount. That
 * one model produces every part of the effect — the head plunges and
 * rebounds when the car drops into a rut, is thrown forward under the
 * brakes and sideways through a corner, and settles a beat after the car
 * does. The spring damps RELATIVE motion (head against seat), never motion
 * against the world: damped against the world the head would trail metres
 * behind the car at pace. */
const HEAD = {
  /** Neck stiffness per axis, rad/s. Under a sustained load the head sits
   * `accel / stiff²` off the seat: 10 m/s² of braking against 11 rad/s is
   * 8 cm of lean, which reads as somebody bracing rather than as a toy on
   * a dashboard. Vertical is the stiffest — a head bobs quickly. */
  stiffLong: 11,
  stiffLat: 10,
  stiffVert: 12,
  /** Damping ratio per axis, 0..1. Under 1 the head overshoots and settles,
   * and one visible rebound off a bump IS the effect; far under 0.4 and it
   * rings like a spring toy for the rest of the straight. */
  dampLong: 0.62,
  dampLat: 0.58,
  dampVert: 0.44,
  /** How far the head is allowed off the mount, m. The vertical limit stays
   * well inside the eye's clearance over the bonnet (EYE_RISE in
   * car-styles.ts), so no landing drops the lens into the panel. */
  limLong: 0.12,
  limLat: 0.1,
  limVert: 0.1,
  /** Ceiling on how fast the head may travel relative to the car, m/s. A
   * slammed landing hands the neck ten metres a second of relative speed in
   * one step; ungoverned the head would cross its whole travel inside a
   * frame, which reads as a glitch rather than as a hit. */
  maxSpeed: 2.4,
  /** Radians of gaze per metre the head is thrown forward: braking pitches
   * a head down, not just forward. */
  nod: 0.5,
  /** Radians of head tilt per metre it is thrown sideways — the neck pivots
   * at its base, so the top of the head leads the lean. */
  tilt: 0.5,
  /** How much of the body's attitude the gaze takes, 0..1. Under 1 because
   * a driver levels their head against the car: the horizon still tips with
   * the camber, only less than the bodyshell does. */
  rollFollow: 0.55,
  pitchFollow: 0.75,
  /** Fixed downward aim, rad — what puts the bonnet in the bottom of the
   * frame instead of just below it. */
  aimDown: 0.05,
  /** How much of a narrow viewport's vertical widening the aim gives back,
   * 0..1 of half of it. At 1 the bonnet holds exactly the angle off the
   * nose it takes in landscape and every extra degree becomes sky, which is
   * more sky than the rest of the game's portrait framing carries; a little
   * under trades some of it back for road. */
  wideAim: 0.6,
  /** How much of the slip angle the driver glances into, and the ceiling on
   * it, rad. A driver in a slide looks where the car is GOING; the glance is
   * what shows the drift from a seat that otherwise points at the nose. */
  glance: 0.4,
  glanceMax: 0.32,
  /** How fast the glance follows the slide, 1/s. */
  glanceRate: 5,
  /** A mount jump this big means a respawn or a fresh stage, m — the head
   * is put back on the seat rather than flung across the map. */
  snap: 4,
} as const;

/** The road buzzing up through the seat. The stage's ground is a smooth
 * loft — it has grades, crests and dips, but no GRAIN — so a lens bolted to
 * the bodyshell sits perfectly still on a straight, and the bonnet in front
 * of it is a painted slab pinned to the glass. The grain is put back here,
 * on the head: it is what the neck has left after filtering the shell's own
 * vibration, which is why it is applied as motion rather than shaken into
 * the spring (a mass on a spring at ~2 Hz answers a 10 Hz road with almost
 * nothing). The GAZE wobbles as well as the eye — a few thousandths of a
 * radian is a couple of pixels of horizon, and without it only the near
 * bodywork would tremble while the world stayed nailed down. */
const GRAIN = {
  /** The three oscillators, Hz: a thump through the springs, the surface's
   * chatter, and a fine buzz on top. Deliberately incommensurate, so the
   * pattern never settles into a hum, and in TIME rather than in distance —
   * a wavelength short enough to read as vibration aliases against the
   * frame rate the moment the car is quick. */
  freq: [4.7, 7.9, 11.3],
  /** How far the head travels and how far the gaze wobbles at the reference
   * pace on gravel — m and rad. */
  heave: 0.016,
  sway: 0.008,
  nod: 0.0075,
  tilt: 0.006,
  /** The pace those are quoted at, m/s (~110 km/h), and the ceiling the
   * grain keeps growing to. Below the reference it fades out linearly: a
   * car being crawled back onto the road does not shake. */
  pace: 30,
  paceMax: 1.5,
  /** What each surface does to it. Asphalt is the smooth one and open
   * country is punishing; a ford's bed is somewhere between. */
  surface: { gravel: 1, asphalt: 0.42, nature: 1.9, water: 1.2 },
  /** How fast the grain follows the wheels leaving and finding the ground,
   * 1/s. In the air the road stops arriving, and the silence is most of
   * what makes a jump read as flight from inside the car. */
  rate: 7,
} as const;

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

/** THE FINISH SHOT. The camera stops dead at the line and lets the car
 * leave, so everything here is about what a planted camera does.
 *
 * It rises a little as it plants — a broadcast camera is on a rostrum, not
 * on the road — and pulls its field of view in over the same beat, which is
 * a lens going long: the car recedes into a flatter, tighter frame instead
 * of racing away down a wide-angle tunnel. Both ease in over `settle`
 * rather than cutting, because a cut would land in the middle of the one
 * moment the player is watching. */
const FINISH = {
  /** Seconds the plant takes to complete. */
  settle: 1.1,
  /** How far the camera rises onto its rostrum, m. Deliberately modest: the
   * gate's banner hangs at 4.7 m, and a camera that climbs to meet it turns
   * the arch into a wall ruled across the middle of the frame. Staying
   * under it leaves the gate where it belongs — an arch over the top third,
   * with the road and the departing car running away beneath it. */
  lift: 1,
  /** ...and how far back off the line it drifts while it does, m. A nudge,
   * not a retreat: the whole point of the shot is that the camera STAYS. */
  back: 1.5,
  /** The long lens it settles to, degrees. */
  fov: 46,
  /** How fast the aim follows the car, 1/s. Loose: a planted camera pans,
   * and a pan that tracks perfectly reads as a lock rather than an
   * operator. */
  pan: 3.4,
  /** How far above the car's own height the aim sits, m. */
  aimUp: 0.7,
};

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
  /** Where the hood camera sits on the car now on the stage, body-local m —
   * pushed when the car's meshes are built, because the mount is read off
   * that car's own silhouette. */
  setHoodEye: (eye: HoodEye) => void;
  update: (state: GameState, dt: number) => void;
  kick: (strength: number) => void;
  resize: (width: number, height: number) => void;
};

export function createGameCamera(width: number, height: number): GameCamera {
  const camera = new THREE.PerspectiveCamera(60, width / height, DRIVING_NEAR, DRIVING_FAR);
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
  /** The hood camera's mount, body-local m. The scuttle of the compact
   * hatch until a stage's car is built and pushes its own. */
  let hoodEye: HoodEye = { x: -0.16, y: 1.21, z: 0.66 };
  /** The mount in the world, this frame and last — the neck needs the seat's
   * own velocity to damp against. */
  const seat = new THREE.Vector3();
  const seatWas = new THREE.Vector3();
  /** The driver's head: where it is and how fast it is going, world m. */
  const head = new THREE.Vector3();
  const headVel = new THREE.Vector3();
  let seated = false;
  /** How far into the slide the driver is looking, rad off the nose. */
  let glance = 0;
  /** How hard the road is coming through the seat right now, 0..~1.5 — pace
   * and surface, eased so the wheels leaving the ground fades it. */
  let grain = 0;
  /** Where the camera was standing when the car crossed the line, and where
   * it is aiming now. Null until it plants; cleared when a fresh run puts
   * the camera back in the player's hands. */
  let planted: { x: number; y: number; z: number; back: THREE.Vector3 } | null = null;
  const aim = new THREE.Vector3();

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

  /** Where the mount is in the world. The eye is bolted to the BODY, so it
   * takes the load pitch the brakes and the power put in, then the springs'
   * heave, then the attitude of whatever the wheels are standing on — the
   * same order car-mesh.ts hangs the meshes in, so the lens sits on the
   * bonnet it is looking at however the car is thrown about. */
  const seatAt = (car: GameState["car"], out: THREE.Vector3): void => {
    const { x, y, z } = hoodEye;
    // Nose-up is a NEGATIVE rotation about the car's +x axis (as it is in
    // car-mesh.ts), and a positive roll lifts the +x side.
    const cl = Math.cos(car.pitchLoad);
    const sl = Math.sin(car.pitchLoad);
    const ly = y * cl + z * sl + car.ride;
    const lz = z * cl - y * sl;
    const cp = Math.cos(car.pitch);
    const sp = Math.sin(car.pitch);
    const py = ly * cp + lz * sp;
    const pz = lz * cp - ly * sp;
    const cr = Math.cos(car.roll);
    const sr = Math.sin(car.roll);
    const bx = x * cr - py * sr;
    const by = x * sr + py * cr;
    const ch = Math.cos(car.heading);
    const sh = Math.sin(car.heading);
    out.set(car.x + bx * ch + pz * sh, car.y + by, car.z - bx * sh + pz * ch);
  };

  /** The view from the driver's seat, over the car's own bonnet. Two things
   * separate it from a lens taped to the scuttle: the head has MASS, so it
   * lags every bump, stop and corner and settles a beat late (HEAD), and the
   * driver GLANCES into a slide instead of staring down the nose — which is
   * what shows the drift from a camera that is pointing the same way the car
   * is. */
  const updateHood = (state: GameState, dt: number): void => {
    const car = state.car;
    yaw = angleLerp(yaw, car.heading, clamp(14 * dt, 0, 1));
    const wantFov = Math.min(92, 64 + car.u * 0.42);
    fov += (wantFov - fov) * clamp(5 * dt, 0, 1);

    seatAt(car, seat);
    if (!seated || seat.distanceTo(seatWas) > HEAD.snap) {
      // A fresh stage or a respawn: the car has been picked up and put down
      // somewhere else, and no neck stretches across that.
      head.copy(seat);
      headVel.set(0, 0, 0);
      seatWas.copy(seat);
      seated = true;
    }
    const step = Math.max(dt, 1e-4);
    const svx = (seat.x - seatWas.x) / step;
    const svy = (seat.y - seatWas.y) / step;
    const svz = (seat.z - seatWas.z) / step;
    seatWas.copy(seat);

    // The neck works in the CAR's axes: a head is thrown back under power
    // and sideways through a corner, and those are different springs.
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;
    // Substepped for the same reason the chase cam's swing is: a stiff
    // spring stepped over a hitching tab's whole frame rings or blows up.
    for (let left = dt; left > 0; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      const dx = head.x - seat.x;
      const dy = head.y - seat.y;
      const dz = head.z - seat.z;
      const rvx = headVel.x - svx;
      const rvy = headVel.y - svy;
      const rvz = headVel.z - svz;
      const aLong =
        -HEAD.stiffLong * HEAD.stiffLong * (dx * fwdX + dz * fwdZ) -
        2 * HEAD.dampLong * HEAD.stiffLong * (rvx * fwdX + rvz * fwdZ);
      const aLat =
        -HEAD.stiffLat * HEAD.stiffLat * (dx * rightX + dz * rightZ) -
        2 * HEAD.dampLat * HEAD.stiffLat * (rvx * rightX + rvz * rightZ);
      const aUp = -HEAD.stiffVert * HEAD.stiffVert * dy - 2 * HEAD.dampVert * HEAD.stiffVert * rvy;
      headVel.x += (aLong * fwdX + aLat * rightX) * h;
      headVel.z += (aLong * fwdZ + aLat * rightZ) * h;
      headVel.y += aUp * h;
      head.x += headVel.x * h;
      head.y += headVel.y * h;
      head.z += headVel.z * h;
    }

    // Govern the neck's own speed, then its reach. A slam hands the spring
    // ten metres a second of relative velocity in a single step: uncapped
    // the head crosses its whole travel inside one frame, which reads as the
    // picture glitching rather than as the car landing.
    let rvx = headVel.x - svx;
    let rvy = headVel.y - svy;
    let rvz = headVel.z - svz;
    const rel = Math.hypot(rvx, rvy, rvz);
    if (rel > HEAD.maxSpeed) {
      const k = HEAD.maxSpeed / rel;
      rvx *= k;
      rvy *= k;
      rvz *= k;
      headVel.set(svx + rvx, svy + rvy, svz + rvz);
    }
    const offLong = clamp(
      (head.x - seat.x) * fwdX + (head.z - seat.z) * fwdZ,
      -HEAD.limLong,
      HEAD.limLong,
    );
    const offLat = clamp(
      (head.x - seat.x) * rightX + (head.z - seat.z) * rightZ,
      -HEAD.limLat,
      HEAD.limLat,
    );
    const offUp = clamp(head.y - seat.y, -HEAD.limVert, HEAD.limVert);
    head.set(
      seat.x + offLong * fwdX + offLat * rightX,
      seat.y + offUp,
      seat.z + offLong * fwdZ + offLat * rightZ,
    );

    const speed = Math.hypot(car.u, car.w);
    const slip = speed > 3 ? Math.atan2(car.w, Math.max(0.001, car.u)) : 0;
    const wantGlance = clamp(slip * HEAD.glance, -HEAD.glanceMax, HEAD.glanceMax);
    glance += (wantGlance - glance) * clamp(HEAD.glanceRate * dt, 0, 1);

    // The road's own grain, on top of everything the neck did with the big
    // motions: the surface underfoot at the pace it is passing.
    const surface = car.airborne ? 0 : GRAIN.surface[state.surface];
    const wantGrain = Math.min(speed / GRAIN.pace, GRAIN.paceMax) * surface;
    grain += (wantGrain - grain) * clamp(GRAIN.rate * dt, 0, 1);
    const phase = orbit * Math.PI * 2;
    const g1 = Math.sin(phase * GRAIN.freq[0]);
    const g2 = Math.sin(phase * GRAIN.freq[1] + 1.7);
    const g3 = Math.sin(phase * GRAIN.freq[2] + 4.1);
    // Each axis takes its own mix of the three, so the eye travels on a
    // wander rather than up and down a diagonal line.
    const g4 = Math.sin(phase * GRAIN.freq[1] * 0.83 + 2.4);
    const heave = (g1 * 0.55 + g2 * 0.3 + g3 * 0.15) * GRAIN.heave * grain;
    const sway = (g4 * 0.6 + g3 * 0.4) * GRAIN.sway * grain;

    const sx = (Math.random() - 0.5) * shake * 0.4;
    const sy = (Math.random() - 0.5) * shake * 0.4;
    camera.position.set(head.x + sx + sway * rightX, head.y + sy + heave, head.z + sway * rightZ);
    const look = yaw + glance;
    // A narrow viewport buys back its horizontal field by opening the frame
    // vertically (hor+), and every degree of that lands half at the top and
    // half at the bottom. Unanswered, the bottom half fills with bonnet: a
    // portrait phone would drive looking at its own paint. Aiming up by
    // half the widening holds the hood at the same ANGLE off the nose it
    // takes in landscape, and spends the extra field on road and sky.
    const widen = (((verticalFovFor(fov, camera.aspect) - fov) * Math.PI) / 360) * HEAD.wideAim;
    // The gaze rides the body's attitude, less what a driver levels out, and
    // nods with the head's own lean — braking tips a head down as well as
    // forward.
    const pitch =
      (car.pitch + car.pitchLoad) * HEAD.pitchFollow -
      HEAD.nod * offLong -
      HEAD.aimDown +
      widen +
      (g2 * 0.6 + g3 * 0.4) * GRAIN.nod * grain;
    const reach = Math.cos(pitch) * AIM_REACH;
    aim.set(
      camera.position.x + Math.sin(look) * reach,
      camera.position.y + Math.sin(pitch) * AIM_REACH,
      camera.position.z + Math.cos(look) * reach,
    );
    camera.lookAt(aim);
    // Positive body roll lifts the car's RIGHT side, which tips everything
    // bolted to it — the driver included — to the left; the neck adds its
    // own tilt on top, the top of the head leading the lean.
    camera.rotateZ(
      car.roll * HEAD.rollFollow - HEAD.tilt * offLat + (g1 * 0.5 + g3 * 0.5) * GRAIN.tilt * grain,
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

  /**
   * The flying finish: the camera stops where it is and watches the car go.
   *
   * The plant is taken from wherever the camera happened to be on the last
   * racing frame — whichever rig was up, hood included — so the shot begins
   * from the view the player was already in rather than cutting to a
   * position they have never seen. From there it only rises, eases back,
   * and pans.
   */
  const updateFinish = (state: GameState, dt: number): void => {
    const car = state.car;
    if (!planted) {
      // Behind the camera along its own view axis: which way "back off the
      // line" is, without assuming the camera was ever facing down the road.
      const back = new THREE.Vector3();
      camera.getWorldDirection(back);
      back.y = 0;
      if (back.lengthSq() < 1e-6) back.set(0, 0, 1);
      back.normalize().negate();
      planted = { x: camera.position.x, y: camera.position.y, z: camera.position.z, back };
      aim.set(car.x, car.y + FINISH.aimUp, car.z);
    }
    // A smoothstep on the roll-out's own clock, so the plant is a fixed
    // gesture and not something a slow frame can outrun.
    const t = Math.min(1, state.rollout / FINISH.settle);
    const ease = t * t * (3 - 2 * t);
    const px = planted.x + planted.back.x * FINISH.back * ease;
    const pz = planted.z + planted.back.z * FINISH.back * ease;
    const ground = state.terrain.groundAt(px, pz);
    camera.position.set(px, Math.max(planted.y + FINISH.lift * ease, ground + CHASE_CLEARANCE), pz);
    // The pan lags the car, which is what makes it read as an operator
    // following it rather than a rig bolted to it.
    const follow = clamp(FINISH.pan * dt, 0, 1);
    aim.x += (car.x - aim.x) * follow;
    aim.y += (car.y + FINISH.aimUp - aim.y) * follow;
    aim.z += (car.z - aim.z) * follow;
    camera.lookAt(aim);
    fov += (FINISH.fov - fov) * clamp(2.4 * dt, 0, 1);
  };

  const update = (state: GameState, dt: number): void => {
    shake = Math.max(0, shake - 6 * dt * shake - 0.4 * dt);
    orbit += dt;
    if (mode !== "map") camera.far = DRIVING_FAR;
    // The finish owns the shot in every mode a player can drive from.
    // Overhead it does not: the drone is the menu's backdrop, where a bot
    // finishes a stage every couple of minutes and nobody is watching it
    // arrive, and the map view is not a camera anybody is driving under.
    const watching = state.phase === "rollout" || state.phase === "finished";
    const inCar = mode === "hood" && !watching;
    // The finish camera is standing on the ground outside the car whichever
    // view it planted from, so it takes the outside near plane even when the
    // player was in the hood a moment ago.
    camera.near = inCar ? HOOD_NEAR : DRIVING_NEAR;
    if (watching && mode !== "drone" && mode !== "map") {
      updateFinish(state, dt);
      camera.fov = verticalFovFor(fov, camera.aspect);
      camera.updateProjectionMatrix();
      return;
    }
    if (!watching) planted = null;
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
    setHoodEye: (eye) => {
      hoodEye = eye;
      // A different car is a different seat; the head takes its new one
      // rather than swinging across the gap between them.
      seated = false;
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
