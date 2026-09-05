// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES. Eight can
// be driven from, and they are one ladder walked BACKWARDS from the nose to
// high above the roof (the ids and the order are PLAY_CAMERAS in
// settings.ts):
//
//   bumper  — down at the nose, ahead of every panel: no bodywork at all.
//   hood    — on the car's own scuttle, over its bonnet.
//   cockpit — from the driver's seat, inside the car: the fascia, the dials
//             and the wheel are in frame and the road is what is left
//             between the screen pillars.
//   close   — the same rig as chase pulled in tight behind the bumper.
//   chase   — the classic arcade rally view: low, tight behind the car,
//             tracking a blend of nose and travel direction so a drift
//             swings the car across the frame while the road keeps flowing.
//   far     — stood back and a little higher: less drama, more warning.
//   heli    — high and behind, the shot a chase helicopter would fly.
//   top     — over the roof, tilted just far enough forward to show the road
//             the car is about to be on.
//
// Two more are placed by the app and never cycled into, because neither one
// can be driven from:
//
//   drone — high overhead, trailing and slowly circling: the menu's living
//           backdrop, where a bot is driving and nobody is watching the
//           apex. Its own rig, in camera-drone.ts — it carries none of the
//           chase machinery, only the slow circling that keeps a backdrop
//           from reading as a paused screenshot.
//   map   — the whole stage framed from the sky, turning: the Roam page's
//           look at what a seed actually builds. Its own rig, in
//           camera-map.ts — it frames a FOOTPRINT rather than following a
//           body, so it shares nothing with the chase rigs but the lens.
//
// The five outside cameras are the SAME rig with different proportions —
// one table of numbers (CHASE_RIGS), one update function — so an angle is a
// row rather than another camera to maintain. What separates them is not
// only where they stand but how HEAVY they are: from `far` outwards they
// answer the car slowly and their swing is a sprung mass that overshoots a
// turn and settles back into it, so a camera at a distance reads as
// something being flown rather than something bolted on. The two the game
// is actually driven from — `close` and `chase` — share one steady
// character and differ only in where they stand: a boom is answered
// briskly and settles without overshooting, at either length.
// In the air the framing goes loose and pulls wide, which reads as flying.
// Landings and splashes leave a small decaying rattle; running into things
// leaves the outside shot alone, because a boom did not hit the tree and the
// car is right there in frame taking it on its own springs (camera-shake.ts).
// Over a CLIFF they stay up at the top and let the car fall away below them,
// which is the one thing a chase rig must not follow.
//
// The three IN-CAR cameras are their own table and their own update, in
// camera-eye.ts, because none of them is standing anywhere: they are sat in
// (or bolted to) the car, and what makes them worth driving from is that the
// eye has WEIGHT, the road has GRAIN, and a hit throws the head.
//
// WALKING THE LADDER IS A MOVE, NEVER A CUT. The lens is FLOWN from where it
// was standing to where the new rig has stood it, over about a third of a
// second (camera-change.ts). Between the outside rigs most of that hand-over
// was already in the numbers — they share a standoff and a height, and those
// ease — and the flight only carries the part that never eased, which is the
// aim. The four steps that cross between the two families had nothing in
// common to ease at all, and the flight is the whole of them: it reads as
// climbing into the car and back out of it, which is what it is.
//
// And three BEATS override whichever of them is up, all three of them the
// same gesture — the lens stops being a rig and becomes an operator standing
// somewhere. The establishing shot opens every stage: the camera circles the
// start control while the crew in front leaves, then comes down onto the car
// it will be driven from (camera-start.ts). The flying finish closes it: the
// camera stops travelling with the car, plants itself where it stood, and
// turns to watch it go (camera-finish.ts). And the roll takes the frame
// whenever it happens, for the one reason the other two do not share — a car
// past its outside wheels is not a thing a BOOM can follow, so the outside
// rigs plant, come to rest, and watch it go over from the verge
// (camera-roll.ts). The three seats inside the car keep theirs and go round
// with the body, which is the same decision read the other way. This file
// owns WHEN each of the three has the frame; they own what the shot is.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import { MAX_VFOV, verticalFovFor } from "../lib/fov.ts";
import { createSlack } from "../lib/slack.ts";
import { createSprung } from "../lib/sprung.ts";
import type { GameState } from "@engine";

import {
  NEUTRAL_TUNING,
  createEyeCamera,
  type CarEyes,
  type EyeTuning,
  type InCarCamera,
} from "./camera-eye.ts";
import {
  NEUTRAL_MOVE,
  createFreeFly,
  poseOf,
  type FreeFlyMove,
  type FreeFlyPose,
  type FreeFlyRig,
} from "./camera-free.ts";
import { createViewChange } from "./camera-change.ts";
import { createDroneCamera } from "./camera-drone.ts";
import { createFinishCamera } from "./camera-finish.ts";
import {
  CHASE_CLEARANCE,
  CLIFF,
  FLOOR,
  HEIGHT_SPRING,
  SLACK,
  groundOver,
} from "./camera-ground.ts";
import {
  CAMERA_SHAKE,
  fadeShake,
  inCarBlow,
  outsideBlow,
  rattleAt,
  type ShakeSource,
} from "./camera-shake.ts";
import { createMapCamera, type MapPose } from "./camera-map.ts";
import { createRollCamera } from "./camera-roll.ts";
import { createStartCamera } from "./camera-start.ts";
import { createSweepCamera } from "./camera-sweep.ts";
import { DEFAULT_SETTINGS, PLAY_CAMERAS, type PlayCamera } from "./settings.ts";

/** `free` is god mode: the developer tool that takes the lens off the car
 * and flies it (camera-free.ts). It is not on the ladder the camera key
 * walks, for the same reason the drone and the map are not — it is placed
 * deliberately or not at all. */
export type CameraMode = PlayCamera | "drone" | "map" | "free";
/** The modes the camera key walks, in the order it walks them — the same
 * nose-backwards ladder the options screen lists, so the key and the
 * setting never disagree about what "the next camera" means. */
export const PLAY_MODES: CameraMode[] = PLAY_CAMERAS.map((cam) => cam.id);

/** The modes camera-eye.ts owns — the ones taken from inside the car. */
const IN_CAR: InCarCamera[] = ["bumper", "hood", "cockpit"];

/** Far plane while driving, m — comfortably past the widest fog ceiling. The
 * map view solves its own, along with its own near plane, because a stage is
 * kilometres wide and a quarter-metre near plane under a far one that distant
 * leaves the depth buffer nothing to separate a lake from the ground under
 * it with. */
const DRIVING_FAR = 900;

/** The far plane god mode's camera is actually using, m, and the near plane
 * under it. The driving pair unless a tool has asked to see further
 * (`?air=`, `setReach`).
 *
 * A STILL can afford what a run cannot. 900 m is sized to the fog a driver
 * is looking through, and past it there is nothing to draw because there is
 * nothing they could see; a preview taken from two hundred metres up with
 * the horizon in the frame is looking at kilometres, and on the driving pair
 * the country simply stops partway out. The near plane moves with it because
 * the depth buffer is a ratio: a quarter-metre near plane under a six
 * kilometre far one has nothing left to separate a lake from the ground
 * under it — the same trade camera-map.ts makes for the same reason. */
let reachFar = DRIVING_FAR;
/** Near plane while driving, m. The in-car views each pull it closer still
 * — the nearest bodywork decides it, and camera-eye.ts's rows carry their
 * own. Pulling it in costs depth precision that nothing at this range
 * spends. */
const DRIVING_NEAR = 0.25;
/** …and the near plane that rides with `reachFar` — declared after the pair
 * it defaults to. */
let reachNear = DRIVING_NEAR;
/** God mode's field of view, deg — the same register the chase rigs sit in
 * at rest, so a distance judged while flying reads the same as one judged
 * from behind the car. Fixed rather than speed-stretched: the free camera
 * has no speed worth dramatising, and a fov that breathed would make two
 * screenshots of one spot disagree about how far away things are. */
const FREE_FOV = 58;

/** The lens the free camera is actually wearing, deg. `FREE_FOV` unless a
 * tool has asked for another one (`?freefov=`, `setFreeFov`).
 *
 * It exists for PANORAMAS. three's fov is vertical, and `verticalFovFor`
 * leaves a design number alone at or above 16:9 — so widening the viewport
 * past that widens the HORIZONTAL field instead of showing more of the same
 * lens. At 58° a 4:1 frame is about 131° across, 6:1 is 146°, and by 8:1 it
 * is 155° and the ground visibly domes. A wide strip therefore has to be
 * shot on a LONGER lens: drop the vertical fov and the horizontal field
 * stays where it looks right however wide the frame gets. */
let freeFov = FREE_FOV;

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
   * the car in front of it. Scaled again by `CAMERA_SHAKE.heave`, which is
   * the one dial over how much of the car's own bobbing the outside shot
   * takes at all. */
  heave: number;
  /** Scale on the rattle a blow leaves in the shot (camera-shake.ts, which
   * owns how big one is and which blows an outside camera takes at all —
   * running into something is not one of them). Distance is its own damping:
   * a landing that shudders a bumper cam is barely a wobble from a hundred
   * feet up. */
  shake: number;
  /** Share of the CLIFF hold this rig takes, 0..1 (see CLIFF). The low
   * rigs take all of it — they are the ones the drop happens TO. The two
   * that already fly a long way over the terrain take a fraction: from
   * twenty metres up, holding another twelve only makes the car small. */
  cliff: number;
};

/** The ladder, in numbers. `chase` is the reference frame — proportions read
 * off Sega Rally: the car anchors the BOTTOM of the frame and the horizon
 * rides high. `close` and `far` are that same shot pulled in and stood back;
 * `heli` and `top` trade the drama for what the driver cannot otherwise
 * see, which is the road past the next crest.
 *
 * What makes those three ONE shot at three lengths is not the height — it is
 * the LOOK-OVER ANGLE, the depression from the lens to the top of the car's
 * own roof. That angle is the whole of whether a player can see where they
 * are going, because it is what decides how far up the frame the roofline
 * reaches and how much road is left above it: `chase` and `far` hold about
 * 13°, which puts the roof around three fifths of the way down the frame
 * and lands the sight line grazing it on the road a couple of metres past
 * the bumper. Height is therefore a CONSEQUENCE of the standoff, not a free
 * number — a boom half as long needs half as much height over the roof for
 * the same shot, and a camera set at roof height, whatever its length, is a
 * camera looking at a roof.
 *
 * The angle is the means, though, and WHERE THE ROOFLINE LANDS is the end —
 * and the two only agree while the car fills the same amount of frame. At
 * four metres it does not: the same car subtends half again as much of the
 * picture as it does from `chase`, so the shared 13° hangs its roofline
 * higher up the frame and leaves proportionally less road over it, which
 * is the shortest shot on the ladder reading as sitting in the dirt behind
 * the car. So `close` takes about 18° instead — enough extra look-over to
 * put its roofline back where the rest of the ladder puts one, around
 * three fifths down. It costs it nothing else: what makes `close` the
 * tight shot is the length of the boom, not the height of it.
 *
 * `close` and `chase` carry IDENTICAL steadying numbers — the follow rate,
 * the swing spring, the hill lift and duck, the aim's climb. A boom is a
 * boom whatever length it is run out to, and a longer one that also answers
 * more slowly turns the same yaw lag into more metres of lateral travel: the
 * world sloshes across the frame, which is what a player reads as the shot
 * being unsteady rather than as the camera having weight. The heaviness that
 * makes a distant camera read as FLOWN starts at `far`, where the standoff
 * is long enough that the sway is legible as a gesture of its own.
 *
 * The frame does NOT change when the car leaves the ground: pulling back
 * for a jump makes the biggest moment in the stage read as small and safe,
 * and it is the one moment the camera should hold its nerve. */
const CHASE_RIGS: Record<Exclude<PlayCamera, InCarCamera>, ChaseRig> = {
  close: {
    dist: 4.4,
    distPerSpeed: 0.014,
    height: 2.55,
    driftWeight: 0.85,
    followRate: 5,
    fov: 60,
    fovPerSpeed: 0.4,
    fovMax: 88,
    aimAhead: 7.5,
    aimHeight: 0.45,
    aimClimb: 5,
    dropLift: 2.2,
    climbDuck: 1,
    swing: 0.4,
    swingMax: 1.2,
    swingFreq: 6.5,
    swingDamp: 1,
    heave: 0.45,
    shake: 1.15,
    cliff: 1,
  },
  chase: {
    dist: 5.8,
    distPerSpeed: 0.02,
    height: 2.45,
    driftWeight: 0.8,
    followRate: 5,
    fov: 58,
    fovPerSpeed: 0.38,
    fovMax: 86,
    aimAhead: 8.5,
    aimHeight: 0.65,
    aimClimb: 5,
    dropLift: 2.2,
    climbDuck: 1,
    swing: 0.4,
    swingMax: 1.2,
    swingFreq: 6.5,
    swingDamp: 1,
    heave: 0.4,
    shake: 1,
    cliff: 1,
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
    cliff: 0.9,
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
    cliff: 0.4,
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
    cliff: 0.25,
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

export type { MapPose };

export type GameCamera = {
  camera: THREE.PerspectiveCamera;
  mode: () => CameraMode;
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
  /** Advance to the next PLAYABLE mode; a no-op read while overhead. */
  cycle: () => CameraMode;
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
  replant: (state: GameState) => void;
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

export function createGameCamera(width: number, height: number): GameCamera {
  const camera = new THREE.PerspectiveCamera(60, width / height, DRIVING_NEAR, DRIVING_FAR);
  const startShot = createStartCamera();
  let mode: CameraMode = DEFAULT_SETTINGS.camera;
  let yaw = 0;
  /** Chase yaw, decomposed: the part that follows the nose... */
  let headYaw = 0;
  /** ...and the drift's slip angle riding on top of it, rad. */
  let driftOff = 0;
  let dist = 6.2;
  let height_ = 2.0;
  /** How much blow the shot is still carrying, 0..`CAMERA_SHAKE.ceiling`,
   * and the phase its rattle is riding — redrawn per blow, so two hits in a
   * row are not the same wobble played twice. */
  let shake = 0;
  let shakePhase = 0;
  let fov = 60;
  /** Lateral camera offset toward the outside of the current turn, m, and
   * the speed it is moving at — the swing is a sprung mass, so it carries
   * momentum through the moment the wheel comes back. */
  let swing = 0;
  let swingVel = 0;
  /** The floor the chase rigs ride over (FLOOR), and where it was last read
   * — a camera that has been picked up and put down somewhere else takes the
   * ground it finds rather than flying to it. */
  let floor = -Infinity;
  let floorX = 0;
  let floorZ = 0;
  let floored = false;
  /** The cliff (CLIFF): the height the car left the ground at, and how far
   * the camera is currently holding above where the rig would otherwise put
   * it, m. */
  let takeoff = 0;
  let held = 0;
  /** Everything a chase rig carries from frame to frame — an angle, a
   * standoff, a spring and a floor — belongs to the road the lens was on.
   * When the camera is picked up and put down, on another crew's car
   * (`retake`) or in another seat on this one (a view change), it is HUNG
   * BACK ON THE CAR rather than eased across the gap: a rig that eases in
   * from a stale reading spends the first second of its shot aimed down a
   * road it is no longer on, and gives a view change a destination that is
   * still travelling. Read and cleared by `updateChase`, because the car it
   * is hung on is what that function is handed. */
  let restand = false;
  /** Whether a chase rig has already stood in the mode now up. The standoff
   * and the height EASE between the outside rigs — walking close → chase →
   * far runs the boom out, and that movement IS the hand-over — but a rig
   * arriving from a seat inside the car has nothing to ease from. */
  let planted = false;
  /** The play the camera hangs on (SLACK): the ground height every camera
   * that stands over the car is built from, with the road's own SURFACE
   * taken out of it. */
  const groundSlack = createSlack(SLACK.ground);
  /** ...carried on a spring into the height the chase rigs actually stand
   * on, led by the car's own vertical speed (HEIGHT_SPRING). */
  const groundSpring = createSprung(HEIGHT_SPRING);
  /** The car's CLIMB as the chase rigs read it, m/s: how fast the slack's
   * own reading is moving, eased. Inside the play the reading barely moves
   * — a wheel track, a crown, a ripple in the ground all stay inside it —
   * so this is zero across all of them and the car's own vertical speed on
   * a hill, which is what the spring's lead, the lift on a descent, the
   * duck on a climb and the aim's climb all want: the HILL, and nothing the
   * engine's grade term lets through. Snapped across a takeoff or a
   * landing, which are changes of movement rather than bumps in it. */
  let climbVy = 0;
  let slackWas = Number.NaN;
  let wasAirborne = false;
  /** Seconds the camera has been alive — the drone's circling walks off it,
   * so it does not depend on frame rate. */
  let orbit = 0;
  /** THE MAP VIEW, as its own rig — it shares nothing with the chase
   * cameras but the lens (camera-map.ts). */
  const map = createMapCamera();
  /** The three in-car views, and the player's own seat and lens settings —
   * one rig with a head on it (camera-eye.ts). */
  const eye = createEyeCamera();
  let tuning: EyeTuning = { ...NEUTRAL_TUNING };
  /** The shot the stage closes on: the camera planted at the line, watching
   * the car go (camera-finish.ts). */
  const finishShot = createFinishCamera();
  /** …and the shot the car goes OVER in: the lens planted at the side of
   * the road, watching the roll (camera-roll.ts). */
  const rollShot = createRollCamera();
  /** …and the flight between two cars, for a spectator changing crew
   * (camera-sweep.ts). */
  const sweepShot = createSweepCamera();
  /** The menu's backdrop, flown (camera-drone.ts). */
  const drone = createDroneCamera();
  /** …and the move from one seat to the next, for a player changing view
   * (camera-change.ts). */
  const change = createViewChange();
  const free = createFreeFly();
  const freeMove: FreeFlyMove = { ...NEUTRAL_MOVE };

  const updateChase = (rig: ChaseRig, state: GameState, dt: number): void => {
    const car = state.car;
    if (restand) {
      headYaw = car.heading;
      yaw = headYaw;
      driftOff = 0;
      swing = 0;
      swingVel = 0;
      floored = false;
      restand = false;
      groundSpring.drop();
      climbVy = car.vy;
      slackWas = Number.NaN;
    }
    // The height the shot is built from — the car's, less whatever of it is
    // only the road's cross-section (SLACK), carried on a spring led by the
    // car's climb so that a hill is followed and a bump is not
    // (HEIGHT_SPRING). The STAND and the AIM take the same one, so neither
    // the play nor the spring ever shows as pitch: what they cost is the
    // car riding up and down inside the frame, which is the car dropping
    // into a wheel track or rising off a lip, which is what is actually
    // happening.
    const slacked = groundSlack(car.y, dt);
    const moving = dt > 0 && !Number.isNaN(slackWas) ? (slacked - slackWas) / dt : climbVy;
    slackWas = slacked;
    if (car.airborne !== wasAirborne) climbVy = car.vy;
    else
      climbVy +=
        ((car.airborne ? car.vy : moving) - climbVy) * clamp(HEIGHT_SPRING.lead * dt, 0, 1);
    wasAirborne = car.airborne;
    const freq = car.airborne ? HEIGHT_SPRING.flying : HEIGHT_SPRING.ground;
    const lead = car.airborne ? car.vy : climbVy;
    const ground = groundSpring.step(slacked, freq, dt, lead);
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
    // the frame, and on a hill that is either the drop or the brow. Read
    // off the EASED climb: the lift is metres per unit of grade, and a
    // grade that jitters with the ground is a camera that pumps.
    const grade = clamp(climbVy / Math.max(8, car.u), -0.5, 0.5);
    const gradeLift = car.airborne ? 0 : -grade * (grade < 0 ? rig.dropLift : rig.climbDuck);
    const wantDist = rig.dist + car.u * rig.distPerSpeed;
    const wantHeight = rig.height + gradeLift;
    // Stood in one frame the first time a rig is used after the camera has
    // been put down somewhere else (`planted`), and eased from then on.
    const ease = planted ? clamp(rig.followRate * RIG_EASE * dt, 0, 1) : 1;
    dist += (wantDist - dist) * ease;
    height_ += (wantHeight - height_) * ease;

    // Speed lives in the FOV: it stretches hard with pace, capped before
    // the stretch turns the world into a tunnel.
    const wantFov = Math.min(rig.fovMax, rig.fov + car.u * rig.fovPerSpeed);
    fov += (wantFov - fov) * (planted ? clamp(4 * dt, 0, 1) : 1);
    planted = true;

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

    const camX = car.x - Math.sin(yaw) * dist + rightX * swing;
    const camZ = car.z - Math.cos(yaw) * dist + rightZ * swing;
    // The floor is read where the CAMERA is: trailing a car down a hill
    // puts it inside the slope it just came over, and no amount of height
    // above the CAR fixes that. Water counts as ground here — a lake's
    // surface is opaque from underneath, so dropping below one costs the
    // whole frame. Never sink under either: a shot from too high still
    // shows the game.
    //
    // Read over a footprint and sunk at a bounded rate (FLOOR), and read
    // before the impact shake is added rather than after: on ground this
    // steep a few centimetres of lateral jitter is metres of vertical one,
    // so a shake sampled INTO the terrain becomes a shake of the terrain.
    const standing = groundOver(state, camX, camZ) + CHASE_CLEARANCE;
    const gap = floor - standing;
    const jumped = !floored || Math.hypot(camX - floorX, camZ - floorZ) > FLOOR.snap;
    if (jumped || gap <= 0) floor = standing;
    else floor -= Math.min(gap, Math.min(gap * FLOOR.sink, FLOOR.sinkMax) * dt);
    floorX = camX;
    floorZ = camZ;
    floored = true;

    // How far the car has fallen below the ground it left, and the share of
    // that the camera keeps for itself (CLIFF).
    const fallen = car.airborne ? takeoff - car.y : 0;
    const wantHold = clamp((fallen - CLIFF.slack) * CLIFF.gain, 0, CLIFF.max) * rig.cliff;
    const holdRate = wantHold > held ? CLIFF.rise : CLIFF.settle;
    held += (wantHold - held) * clamp(holdRate * dt, 0, 1);

    // The rattle a blow left behind: a decaying WAVE the shot rides, not a
    // fresh random offset per frame (camera-shake.ts). The body's own
    // suspension travel comes in beside it through `heave` — that one is the
    // CAR moving in the frame, which is the half of a bump the outside shot
    // is supposed to show.
    const rattle = rattleAt(orbit, shake * rig.shake, shakePhase);
    const sx = rattle.x;
    const sy = rattle.y;
    const ride = ground + height_ + car.ride * rig.heave * CAMERA_SHAKE.heave + held;
    camera.position.set(camX + sx, Math.max(ride, floor) + sy, camZ);
    // The drop from camera to aim point over the run between them IS the
    // pitch of the shot — a few degrees for the chase rigs, most of a right
    // angle for the one over the roof. On a slope the aim rides the climb
    // (vy/u is the road's gradient while grounded) — the eased one, since
    // this is metres of aim height per unit of grade applied straight to
    // the lookAt, and read raw it was the pitch of the shot flickering with
    // every ripple in the ground.
    const climb = clamp(climbVy / Math.max(10, car.u), -0.4, 0.4);
    camera.lookAt(
      car.x + Math.sin(yaw) * rig.aimAhead,
      ground + rig.aimHeight + climb * rig.aimClimb + sy * 0.5,
      car.z + Math.cos(yaw) * rig.aimAhead,
    );
  };

  /** One step of the free camera, and the accumulated nudges it consumes.
   * Wanted from two places — the ordinary update below, and `flyOnly`, for a
   * frame whose world is deliberately being held still — so the clearing of
   * the deltas is stated here rather than at each call site. */
  const flyStep = (dt: number): void => {
    free.update(camera, freeMove, dt);
    freeMove.yawDelta = 0;
    freeMove.pitchDelta = 0;
    freeMove.speedSteps = 0;
    camera.fov = verticalFovFor(freeFov, camera.aspect);
    camera.updateProjectionMatrix();
  };

  /** Stand whichever rig is up around `state`. Split out of `update` because
   * `retake` needs the same dispatch: one list of modes, so a camera added
   * tomorrow is placed by both.
   *
   * The in-car rigs take no rattle — a kick reaches them as the directional
   * jolt `kick` already handed the neck, and a random offset per frame on top
   * of that is the cabin jumping about rather than the car being hit. */
  const placeFor = (inCar: InCarCamera | null, state: GameState, dt: number): void => {
    if (inCar) fov = eye.update(inCar, state, dt, camera);
    else if (mode === "drone") {
      fov = drone.update(camera, state, groundSlack(state.car.y, dt), orbit, dt);
    } else if (mode === "map") fov = map.update(camera, state, dt);
    else updateChase(CHASE_RIGS[mode as Exclude<PlayCamera, InCarCamera>], state, dt);
  };

  /** What a view owns of the LENS rather than of the pose: the near plane the
   * nearest bodywork decides, and where hor+ is allowed to stop for it
   * (lib/fov.ts). Both are read for the view being LEFT as well as the one
   * being taken while a change is in the air — a plane that steps at the
   * press opens a hole in the bodywork for one frame, and a ceiling that
   * steps re-frames a portrait viewport mid-move. */
  const nearFor = (view: CameraMode): number =>
    IN_CAR.includes(view as InCarCamera) ? eye.rigOf(view as InCarCamera).near : DRIVING_NEAR;
  const capFor = (view: CameraMode): number =>
    IN_CAR.includes(view as InCarCamera) ? eye.rigOf(view as InCarCamera).vfovMax : MAX_VFOV;

  /** Where the lens was sitting when the current change started — the view
   * itself has already been replaced by the time any of it is read. */
  let changeFrom: CameraMode = mode;
  /** The car the last frame was drawn around. A view is taken BETWEEN
   * frames, so this is what the pose on screen belongs to, and holding that
   * pose against any other car opens the move with the lens standing still
   * while the car drives out from under it. Null until the camera has stood
   * anywhere at all, which is the one case that cannot be flown from. */
  let drawnAround: GameState | null = null;

  /** Whether a view is one of the five hung off the boom behind the car —
   * the ones that share a standoff, a height and a yaw, and therefore the
   * only ones that have anything to ease between. */
  const onBoom = (view: CameraMode): boolean =>
    PLAY_MODES.includes(view) && !IN_CAR.includes(view as InCarCamera);

  /** Take a new view. A step between two cameras a player can DRIVE from is
   * flown (camera-change.ts); everything else is placed rather than walked
   * to — the overhead pair are the menu's own framing and god mode hands
   * over on its own terms — so those cut, as they always have. */
  const takeView = (next: CameraMode): void => {
    if (next === mode) return;
    if (PLAY_MODES.includes(next) && PLAY_MODES.includes(mode) && drawnAround) {
      changeFrom = mode;
      change.start(camera, fov, drawnAround.car);
    } else change.reset();
    // Arriving on the boom from anywhere else — a seat in the car, the
    // menu's drone — there is nothing to ease FROM: the standoff, the yaw
    // and the floor all belong to a shot that ended. Easing out of a stale
    // reading would hand the flight a destination still travelling, and put
    // the player twenty metres behind their own car while it arrived.
    if (onBoom(next) && !onBoom(mode)) {
      restand = true;
      planted = false;
    }
    mode = next;
  };

  const update = (state: GameState, dt: number): void => {
    shake = fadeShake(shake, dt);
    orbit += dt;
    drawnAround = state;
    // The height the car last left the ground at, kept in every mode so a
    // camera switched to mid-flight knows how far the fall already is
    // (CLIFF). Grounded it tracks the car, which is the same thing.
    if (!state.car.airborne) takeoff = state.car.y;
    // The finish owns the shot in every mode a player can drive from.
    // Overhead it does not: the drone is the menu's backdrop, where a bot
    // finishes a stage every couple of minutes and nobody is watching it
    // arrive, and the map view is not a camera anybody is driving under.
    const watching = state.phase === "rollout" || state.phase === "finished";
    const inCar = !watching && IN_CAR.includes(mode as InCarCamera) ? (mode as InCarCamera) : null;
    // The map view solves BOTH of its planes from the stage it is framing
    // (camera-map.ts); every other camera stands in the world and takes the
    // driving pair. The finish camera is standing on the ground outside the
    // car whichever view it planted from, so it takes the outside near plane
    // even when the player was behind the wheel a moment ago.
    if (mode !== "map") {
      const near = inCar ? eye.rigOf(inCar).near : reachNear;
      camera.near = change.flying() ? Math.min(near, nearFor(changeFrom)) : near;
      camera.far = reachFar;
    }
    // God mode is nobody's shot but the pilot's: the finish never takes it,
    // and it keeps flying whatever phase the run beneath it is in.
    if (watching && mode !== "free" && mode !== "drone" && mode !== "map") {
      // The shot the stage closes on is a bigger gesture than a change of
      // seat, and it plants from wherever the lens is: a half-finished move
      // is abandoned rather than flown out under it.
      change.reset();
      fov = finishShot.fly(camera, state, fov, CHASE_CLEARANCE, dt);
      camera.fov = verticalFovFor(fov, camera.aspect);
      camera.updateProjectionMatrix();
      return;
    }
    if (!watching) finishShot.reset();
    if (mode === "free") {
      flyStep(dt);
      return;
    }
    placeFor(inCar, state, dt);
    // THE VIEW CHANGE rides over the rig rather than instead of it: the rig
    // has just written the pose the move is landing on, so the last flown
    // frame and the first driven one are the same frame (camera-change.ts).
    if (change.flying()) fov = change.fly(camera, state, fov, dt);
    // …and the transit rides over it in exactly the same way, and for the
    // same reason: the rig has just written the pose this flight is aiming
    // at, so the last frame of the flight and the first frame after it are
    // the same frame (camera-sweep.ts). The two beats never overlap — a
    // spectator's crew is mid-stage, and the establishing shot only flies
    // through `intro`.
    if (sweepShot.flying()) fov = sweepShot.fly(camera, state, fov, dt);
    // The establishing shot rides OVER the driving camera rather than
    // instead of it: the rig has just written the pose the player will be
    // driving with, and the shot blends into that exact frame, so the
    // hand-over is seamless in whichever camera they chose. The overhead
    // views are the menu's own framing and are left alone — and a rushed
    // hand-over the menu interrupted is abandoned rather than left pending,
    // or it would resume over a frame nobody skipped from.
    const overhead = mode === "drone" || mode === "map";
    if (overhead) startShot.reset();
    const shot = !overhead && startShot.flying(state) ? startShot.fly(camera, state, fov, dt) : fov;
    // THE CAR GOING OVER outranks every beat above it, and rides over the rig
    // the same way they do: a boom cannot follow a rolling car, so the lens is
    // planted at the side of the road until it has finished (camera-roll.ts).
    //
    // THE SEATS KEEP THEIRS. A camera bolted to the car is not a shot that
    // fails on a roll, it is the roll from the one place nobody can buy a
    // ticket for: the bumper and the scuttle go round with the body, and the
    // cockpit takes the driver over with it. Nothing there needs rescuing,
    // and standing their lens on the verge would take away the best thing
    // about driving from inside the car.
    //
    // The overhead pair are left alone for their own reason — the drone is a
    // backdrop with a bot in it, and nobody is driving under the map.
    //
    // ASKED FIRST, and of every frame: the shot latches itself off when the
    // driver takes the car back and releases that latch when the car is
    // planted again, so it has to be told about every frame whether or not
    // this one could use it. Behind an `&&` on the view it would go blind for
    // the whole time the player was in the cockpit and come back still
    // holding a latch from an accident two corners ago.
    const going = rollShot.watching(state) && !overhead && !inCar;
    const watched = going ? rollShot.fly(camera, state, shot, CHASE_CLEARANCE, dt) : shot;
    if (!going) rollShot.reset();
    // The hor+ ceiling belongs to the view (`capFor`), so a move between two
    // of them carries it across with everything else: stepped at the press,
    // it would re-frame a portrait viewport a whole move before the lens got
    // there. A planted shot is an OUTSIDE one whichever view it planted from,
    // and the seat's own ceiling comes back with the hand-back.
    const cap = inCar ? eye.rigOf(inCar).vfovMax : MAX_VFOV;
    const at = change.at();
    const seatCap = change.flying() ? capFor(changeFrom) + (cap - capFor(changeFrom)) * at : cap;
    camera.fov = verticalFovFor(
      watched,
      camera.aspect,
      going ? MAX_VFOV + (seatCap - MAX_VFOV) * rollShot.at() : seatCap,
    );
    camera.updateProjectionMatrix();
  };

  return {
    camera,
    mode: () => mode,
    mapRange: map.range,
    free,
    freeMove,
    pose: () => poseOf(camera),
    setFreeFov: (deg) => {
      freeFov = deg > 0 ? deg : FREE_FOV;
    },
    setReach: (far) => {
      reachFar = far > 0 ? far : DRIVING_FAR;
      // Held to about a two-thousandth of the far plane, which is the ratio
      // the driving pair already runs at — and never nearer than the driving
      // near plane, so asking to see LESS far cannot push the nose of the car
      // through it.
      reachNear = far > 0 ? Math.max(DRIVING_NEAR, far / 2000) : DRIVING_NEAR;
    },
    setMode: (next) => {
      // Entering god mode is a HAND-OVER, not a cut: the flight starts from
      // the frame that was already on screen, so the first thing the pilot
      // sees is the thing they were just looking at.
      if (next === "free" && mode !== "free") free.takeOver(camera);
      takeView(next);
    },
    /** Fly the free camera on a clock of its OWN. God mode holds the run
     * (App.tsx), and a held frame is drawn with dt 0 so that nothing on the
     * ground moves — a camera taking its step from that dt would be held
     * along with it, and a frozen world nobody can walk around is a
     * photograph. A no-op in every other mode: nothing else flies. */
    flyOnly: (dt: number) => {
      if (mode !== "free") return;
      flyStep(dt);
    },
    nudgeMap: map.nudge,
    panMap: map.pan,
    resetMap: map.reset,
    reframeMap: map.reframe,
    placeMap: map.place,
    holdMap: map.hold,
    mapPose: map.pose,
    skipStartShot: startShot.skip,
    resetStartShot: startShot.reset,
    retake: (state, fly = false) => {
      // Captured BEFORE anything below moves the lens: the flight starts
      // from the frame that is actually on screen.
      if (fly) sweepShot.start(camera, state);
      else sweepShot.reset();
      // The flying finish plants itself wherever the camera was standing on
      // the frame it took over, and the shot is the whole of what a card is
      // laid over. Coming back from a spectator feed the camera is behind
      // somebody else's car, kilometres up the road — so the plant is
      // dropped and the rig is stood around THIS car again first.
      finishShot.reset();
      // ...and so does the roll's, for the same reason: a shot planted beside
      // a car that went over is not a shot to watch another crew from — and
      // neither is the latch that shot left behind, which belongs to an
      // accident on a different piece of road.
      rollShot.release();
      // A change of SEAT on the road the lens is leaving means nothing on the
      // road it is going to.
      change.reset();
      // Everything the rig carries from frame to frame, hung back on the car
      // rather than eased across the gap: an angle, a standoff, a floor and a
      // spring that all belonged to a different road.
      restand = true;
      held = 0;
      takeoff = state.car.y;
      // No time in it, so nothing eases: this writes the pose, it does not
      // fly to it.
      placeFor(IN_CAR.includes(mode as InCarCamera) ? (mode as InCarCamera) : null, state, 0);
    },
    replant: (state) => {
      // A verge lens planted for the accident, a flight between two seats,
      // a fall the cliff is still holding height for: all of them are
      // readings off the piece of road the car has just been taken off, and
      // none of them survives the move. `restand` is the same drop the rig
      // takes when it is hung on another crew's car, and `planted` is what
      // stands the standoff and the lens rather than easing them out of a
      // shot that ended.
      rollShot.release();
      change.reset();
      eye.reseat();
      restand = true;
      planted = false;
      held = 0;
      takeoff = state.car.y;
    },
    cycle: () => {
      // Genuinely a no-op from the overhead views: the drone and the map are
      // the menu's own framing, and walking them onto a driving camera would
      // leave a menu page standing over a shot nobody asked for.
      const at = PLAY_MODES.indexOf(mode);
      if (at < 0) return mode;
      takeView(PLAY_MODES[(at + 1) % PLAY_MODES.length]);
      return mode;
    },
    setEyes: (next) => {
      // A different car is a different seat; the head takes its new one
      // rather than swinging across the gap between them. A stage builds its
      // car, so this is also where a fresh run drops whatever the last one
      // left the rig holding — the ground under a new stage is found, not
      // flown down to, and nobody starts a run mid-plunge.
      eye.setEyes(next);
      change.reset();
      rollShot.release();
      restand = true;
      held = 0;
    },
    setViewTuning: (next) => {
      tuning = next;
      eye.setTuning(tuning);
    },
    update,
    kick: (strength, dir, source = "contact") => {
      const rattle = outsideBlow(strength, source);
      if (rattle > 0) {
        shake = Math.min(CAMERA_SHAKE.ceiling, shake + rattle);
        // A fresh phase per blow, so a second hit is a second wobble rather
        // than the first one getting louder in place. Renderer-side
        // randomness only: nothing here is ever read back by the engine.
        shakePhase = Math.random() * Math.PI * 2;
      }
      if (dir) eye.jolt(dir.x, dir.y, dir.z, inCarBlow(strength, source));
    },
    resize: (width2, height2) => {
      camera.aspect = width2 / height2;
      camera.updateProjectionMatrix();
    },
  };
}
