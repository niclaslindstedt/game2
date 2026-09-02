// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES. Eight can
// be driven from, and they are one ladder from behind the wheel to high
// above the roof (the ids and the order are PLAY_CAMERAS in settings.ts):
//
//   cockpit — from the driver's seat, inside the car: the fascia, the dials
//             and the wheel are in frame and the road is what is left
//             between the screen pillars.
//   hood    — on the car's own scuttle, over its bonnet.
//   bumper  — down at the nose, ahead of every panel: no bodywork at all.
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
//           backdrop, where a bot is driving and nobody is watching the apex.
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
// And two BEATS override whichever of them is up. The establishing shot
// opens every stage: the camera circles the start control while the crew in
// front leaves, then comes down onto the car it will be driven from
// (camera-start.ts). The flying finish closes it: the camera stops
// travelling with the car, plants itself where it stood, and turns to watch
// it go (camera-finish.ts). This file owns WHEN each of the two has the
// frame; they own what the shot is.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import { verticalFovFor } from "../lib/fov.ts";
import { createSlack } from "../lib/slack.ts";
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
import { createFinishCamera } from "./camera-finish.ts";
import {
  CAMERA_SHAKE,
  fadeShake,
  inCarBlow,
  outsideBlow,
  rattleAt,
  type ShakeSource,
} from "./camera-shake.ts";
import { createMapCamera, type MapPose } from "./camera-map.ts";
import { createStartCamera } from "./camera-start.ts";
import { createSweepCamera } from "./camera-sweep.ts";
import { DEFAULT_SETTINGS, PLAY_CAMERAS, type PlayCamera } from "./settings.ts";

/** `free` is god mode: the developer tool that takes the lens off the car
 * and flies it (camera-free.ts). It is not on the ladder the camera key
 * walks, for the same reason the drone and the map are not — it is placed
 * deliberately or not at all. */
export type CameraMode = PlayCamera | "drone" | "map" | "free";
/** The modes the camera key walks, in the order it walks them — the same
 * inside-out ladder the options screen lists, so the key and the setting
 * never disagree about what "the next camera" means. */
export const PLAY_MODES: CameraMode[] = PLAY_CAMERAS.map((cam) => cam.id);

/** The modes camera-eye.ts owns — the ones taken from inside the car. */
const IN_CAR: InCarCamera[] = ["cockpit", "hood", "bumper"];

/** How far to the side the drone flies, m. The menu's cards sit in the
 * middle of the screen, so a drone parked squarely behind the car puts the
 * one thing worth watching underneath them. Offsetting the CAMERA walks the
 * car off to the side of frame, where it stays visible beside the card at
 * every viewport. */
const DRONE_SIDE = 26;
/** Far plane while driving, m — comfortably past the widest fog ceiling. The
 * map view solves its own, along with its own near plane, because a stage is
 * kilometres wide and a quarter-metre near plane under a far one that distant
 * leaves the depth buffer nothing to separate a lake from the ground under
 * it with. */
const DRIVING_FAR = 900;
/** Near plane while driving, m. The in-car views each pull it closer still
 * — the nearest bodywork decides it, and camera-eye.ts's rows carry their
 * own. Pulling it in costs depth precision that nothing at this range
 * spends. */
const DRIVING_NEAR = 0.25;
/** God mode's field of view, deg — the same register the chase rigs sit in
 * at rest, so a distance judged while flying reads the same as one judged
 * from behind the car. Fixed rather than speed-stretched: the free camera
 * has no speed worth dramatising, and a fov that breathed would make two
 * screenshots of one spot disagree about how far away things are. */
const FREE_FOV = 58;

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
 * own roof, which every one of them holds at about 13°. That angle is the
 * whole of whether a player can see where they are going, because it is what
 * decides how far up the frame the roofline reaches and how much road is
 * left above it: at 13° the roof sits around three fifths of the way down
 * the frame and the sight line grazing it lands on the road a couple of
 * metres past the bumper. Height is therefore a CONSEQUENCE of the standoff,
 * not a free number — a boom half as long needs half as much height over the
 * roof for the same shot, and a camera set at roof height, whatever its
 * length, is a camera looking at a roof.
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
    height: 2.15,
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

/** Clearance a chase camera is never allowed under, m — over the ground
 * AND over any water. The camera trails the car, so on any real descent the
 * ground behind is higher than the ground under the wheels and a fixed
 * roof-height camera is simply inside the hill; run along a shoreline and
 * the same camera drops under the lake, which is the sheet of flat blue
 * that swallows half the frame. Both are checked at the camera's own
 * position, never the car's. */
const CHASE_CLEARANCE = 1.3;

/** How that floor is allowed to MOVE, which matters far more than where it
 * is. The ground under a trailing camera is not a smooth reading: the
 * terrain's lattice kinks at every cell edge, a shoreline swaps the ground
 * for the water's surface, and the far country can step outright where two
 * fields meet. Taken as a bare `groundAt` under a single point, each of
 * those arrives in the picture in ONE FRAME — a cut, not a movement — and
 * the steeper the ground, the bigger it is. That is the shake on a cliff
 * top, and the reason a cliff top has felt broken.
 *
 * Two rules fix it. The ground is read over the camera's own FOOTPRINT
 * rather than under a point, so a lateral wobble on steep ground (the swing,
 * the impact shake) cannot pump the camera up and down. And the floor may
 * rise at once — a camera inside a hill shows nothing at all — but only ever
 * SINKS at a bounded rate, so ground falling away under the camera is
 * something it flies down, never something it is cut to. */
const FLOOR = {
  /** Radius of the footprint the ground is read over, m. */
  span: 1.8,
  /** How fast the floor closes on a target below it, 1/s, and the ceiling on
   * that, m/s. The rate is brisk enough that an ordinary descent — the
   * ground under a trailing camera drops some 8 m/s on a steep one — tracks
   * within a metre; the ceiling is what turns a cliff-sized step into a
   * second of descent. */
  sink: 10,
  sinkMax: 16,
  /** A jump this big between frames is a respawn or a fresh stage, m: the
   * floor is taken where it is found rather than flown down to. */
  snap: 24,
};

/** The footprint's points: the middle and the four corners. */
const FOOTPRINT: [number, number][] = [
  [0, 0],
  [FLOOR.span, FLOOR.span],
  [FLOOR.span, -FLOOR.span],
  [-FLOOR.span, FLOOR.span],
  [-FLOOR.span, -FLOOR.span],
];

/** THE SURFACE IS NOT THE SHAPE. R16 builds a real dirt road across its
 * width: a crown down the middle, two worn wheel tracks either side of it,
 * a loose edge outside those, and a shoulder that steps down into the
 * verge. The car RIDES all of it — it drops fifteen centimetres into a
 * track and climbs back out over the crown, and it should: that is what
 * tells a driver from inside the car that the road has been used. The
 * CAMERA should not. Line a corner up so the car crosses the road and a
 * camera hung off the car's own height heaves nearly ten centimetres up and
 * down on a stage that is DEAD FLAT — a bump with nothing under it,
 * arriving exactly where the shot is supposed to be at its steadiest.
 *
 * So the camera hangs off the car on a LOOSE LINKAGE. There is `reach` of
 * play in it, and the linkage recovers that play at `recover` per second.
 * Inside the play the camera barely moves; past it the linkage is tight and
 * the camera moves one for one, so a crest, a landing, a cliff and a jump
 * all arrive at full size and only ever late by the play itself. The clamp
 * is also what makes a respawn free: the reading can never be further than
 * the play from the truth, so there is no jump to catch and no snap case to
 * write.
 *
 * The two quantities it is hung on are separated by different things, and
 * the numbers say which.
 *
 * The HEIGHT is separated by SIZE, and it has to be: a long sweeper crosses
 * the wheel tracks over several seconds, and no filter quick enough to
 * leave a crest alone would ever reject that. What separates them instead
 * is that the cross-section is BOUNDED and the terrain is not — so the play
 * covers the whole cross-section and the recovery is slow enough that
 * almost nothing leaks through it.
 *
 * The in-car views hang their HORIZON on the same idea and separate it by
 * TIME instead — camera-eye.ts states why. */
const SLACK = {
  /** The camera's height. The play is clear of the cross-section's whole
   * range — a crown to the bottom of a wheel track is under 0.2 m, and the
   * step off the mat onto the verge under 0.4 — and far under the smallest
   * thing the generator builds that the camera is meant to fly. */
  ground: { reach: 0.35, recover: 0.2 },
} as const;

/** THE CLIFF. Driving off a cliff top is the one place the chase rig has
 * nothing sensible to follow. Riding the car down keeps it exactly two
 * metres over the roof for the whole plunge, so a twenty-five metre drop
 * reads as nothing happening; and the floor alone cannot save it, because
 * the camera clears the lip a fifth of a second after the car does and from
 * then on there is no ground under it either.
 *
 * So the camera simply declines to come all the way down. It holds part of
 * the height it had at the top and lets the car sink away below it — which
 * is what the moment actually is: the car is gone, nothing the driver does
 * matters now, and all that is left to do is watch it fall. The aim is
 * already at the car, so the shot pitches over the edge on its own.
 *
 * The hold is keyed to how far the car has fallen BELOW WHERE IT LEFT THE
 * GROUND, not to how long it has been in the air, so a lip, a crest and a
 * designed ramp jump — every one of which lands near the height it launched
 * from — never touch it. The frame does not change for a jump (CHASE_RIGS);
 * it changes for a fall. */
const CLIFF = {
  /** How far the car has to be under its own takeoff before the camera
   * starts holding back, m. A stage's jumps live well inside this. */
  slack: 6,
  /** Share of the drop past that the camera keeps, and the most it ever
   * keeps, m. Half means a twenty-five metre cliff leaves the car ten
   * metres further down the frame than the rig would ever put it. */
  gain: 0.5,
  max: 12,
  /** How fast the hold winds on and comes back off, 1/s. Winding on is
   * quick because the drop itself is the shape of the gesture; coming off
   * is slow, so the camera settles back over the couple of seconds after
   * the landing instead of dropping onto the car like a lift. */
  rise: 5,
  settle: 1.4,
};

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
  /** The play the camera hangs on (SLACK): the ground height every camera
   * that stands over the car is built from, with the road's own SURFACE
   * taken out of it. */
  const groundSlack = createSlack(SLACK.ground);
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
  /** …and the flight between two cars, for a spectator changing crew
   * (camera-sweep.ts). */
  const sweepShot = createSweepCamera();
  const free = createFreeFly();
  const freeMove: FreeFlyMove = { ...NEUTRAL_MOVE };

  /** The highest thing under the camera's footprint — ground or water,
   * whichever is nearer the lens — over a square of FLOOR.span about the
   * point. Sampling the corners as well as the middle is what makes the
   * reading a SURFACE the camera stands on rather than a needle it balances
   * on: at the top of a slope steep enough to matter, the difference between
   * two points a metre apart is metres of height, and a camera that reads
   * one point is a camera that jitters by that difference. */
  const groundOver = (state: GameState, x: number, z: number): number => {
    const { groundAt, waterAt } = state.terrain;
    let high = -Infinity;
    for (const [dx, dz] of FOOTPRINT) {
      high = Math.max(high, groundAt(x + dx, z + dz), waterAt(x + dx, z + dz) ?? -Infinity);
    }
    return high;
  };

  const updateChase = (rig: ChaseRig, state: GameState, dt: number): void => {
    const car = state.car;
    // The height the shot is built from — the car's, less whatever of it is
    // only the road's cross-section (SLACK). The STAND and the AIM take the
    // same one, so the play never shows as pitch: what it costs is the car
    // riding a few centimetres up and down inside the frame, which is the
    // car dropping into a wheel track, which is what is actually happening.
    const ground = groundSlack(car.y, dt);
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

    // Speed lives in the FOV: it stretches hard with pace, capped before
    // the stretch turns the world into a tunnel.
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
    // (vy/u is the road's gradient while grounded).
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.lookAt(
      car.x + Math.sin(yaw) * rig.aimAhead,
      ground + rig.aimHeight + climb * rig.aimClimb + sy * 0.5,
      car.z + Math.cos(yaw) * rig.aimAhead,
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
    const ground = groundSlack(car.y, dt);
    camera.position.set(
      car.x - Math.sin(yaw) * dist + rightX * DRONE_SIDE,
      ground + height_,
      car.z - Math.cos(yaw) * dist + rightZ * DRONE_SIDE,
    );
    // Aimed ahead of the car rather than at it, so the road the bot is
    // about to take is the thing in frame — and pitched to keep some sky in
    // the top of the shot, which is what makes it read as flying rather
    // than as a map scrolling past.
    camera.lookAt(
      car.x + Math.sin(yaw) * 46 + rightX * DRONE_SIDE * 0.55,
      ground + 12,
      car.z + Math.cos(yaw) * 46 + rightZ * DRONE_SIDE * 0.55,
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
    camera.fov = verticalFovFor(FREE_FOV, camera.aspect);
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
    else if (mode === "drone") updateDrone(state, dt);
    else if (mode === "map") fov = map.update(camera, state, dt);
    else updateChase(CHASE_RIGS[mode as Exclude<PlayCamera, InCarCamera>], state, dt);
  };

  const update = (state: GameState, dt: number): void => {
    shake = fadeShake(shake, dt);
    orbit += dt;
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
      camera.near = inCar ? eye.rigOf(inCar).near : DRIVING_NEAR;
      camera.far = DRIVING_FAR;
    }
    // God mode is nobody's shot but the pilot's: the finish never takes it,
    // and it keeps flying whatever phase the run beneath it is in.
    if (watching && mode !== "free" && mode !== "drone" && mode !== "map") {
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
    camera.fov = verticalFovFor(shot, camera.aspect, inCar ? eye.rigOf(inCar).vfovMax : undefined);
    camera.updateProjectionMatrix();
  };

  return {
    camera,
    mode: () => mode,
    mapRange: map.range,
    free,
    freeMove,
    pose: () => poseOf(camera),
    setMode: (next) => {
      // Entering god mode is a HAND-OVER, not a cut: the flight starts from
      // the frame that was already on screen, so the first thing the pilot
      // sees is the thing they were just looking at.
      if (next === "free" && mode !== "free") free.takeOver(camera);
      mode = next;
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
      // Everything the rig carries from frame to frame, hung back on the car
      // rather than eased across the gap: an angle, a floor and a spring
      // that all belonged to a different road.
      headYaw = state.car.heading;
      driftOff = 0;
      yaw = headYaw;
      swing = 0;
      swingVel = 0;
      held = 0;
      takeoff = state.car.y;
      floored = false;
      // No time in it, so nothing eases: this writes the pose, it does not
      // fly to it.
      placeFor(IN_CAR.includes(mode as InCarCamera) ? (mode as InCarCamera) : null, state, 0);
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
    setEyes: (next) => {
      // A different car is a different seat; the head takes its new one
      // rather than swinging across the gap between them. A stage builds its
      // car, so this is also where a fresh run drops whatever the last one
      // left the rig holding — the ground under a new stage is found, not
      // flown down to, and nobody starts a run mid-plunge.
      eye.setEyes(next);
      floored = false;
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
