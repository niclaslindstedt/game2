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
// only where they stand but how HEAVY they are: from `far` outwards they
// answer the car slowly and their swing is a sprung mass that overshoots a
// turn and settles back into it, so a camera at a distance reads as
// something being flown rather than something bolted on. The two the game
// is actually driven from — `close` and `chase` — share one steady
// character and differ only in where they stand: a boom is answered
// briskly and settles without overshooting, at either length.
// In the air the framing goes loose and pulls wide, which reads as flying.
// Landings and splashes kick a decaying shake. Over a CLIFF they stay up at
// the top and let the car fall away below them, which is the one thing a
// chase rig must not follow.
//
// The hood cam is the one that is not a rig, because it is not standing
// anywhere: it is sat in the car, and what makes it worth driving from is
// that the eye has WEIGHT (HEAD) and the road has GRAIN (GRAIN).
//
// And two BEATS override whichever of them is up. The establishing shot
// opens every stage: the camera circles the start control while the crew in
// front leaves, then comes down onto the car it will be driven from
// (camera-start.ts). The flying finish closes it: the moment the car crosses
// the line the camera stops travelling with it, plants itself where it
// stood, and simply turns to watch the car go — the shot every rally
// broadcast cuts to, and the reason R25 builds road past the gate for the
// car to disappear down.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

import type { HoodEye } from "./car-styles.ts";
import {
  NEUTRAL_MOVE,
  createFreeFly,
  poseOf,
  type FreeFlyMove,
  type FreeFlyPose,
  type FreeFlyRig,
} from "./camera-free.ts";
import { createStartCamera } from "./camera-start.ts";
import { ISLAND_MARGIN } from "./map-island.ts";
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

/** The map view's design fov, deg — tight enough that the stage reads as a
 * model on a table rather than a fisheyed globe. */
const MAP_FOV = 42;
/** How far above the horizon the map camera sits by default, radians (~57°).
 * Steeper flattens the hills and lakeshores into a paint job and the map
 * stops being worth looking at; shallower and the far half of the stage
 * starts hiding behind the near ridges. The player can tilt away from it —
 * see `nudgeMap` — and these are the ends of that travel: never overhead,
 * where relief disappears, and never so low that the stage is a strip of
 * land seen edge-on. */
const MAP_PITCH = 1.0;
const MAP_PITCH_MIN = 0.16;
const MAP_PITCH_MAX = 1.45;
/** How close the map view can be pulled in, as a fraction of the distance
 * that frames the whole stage. A third of the way in is a valley filling the
 * pane; closer than that and there is no map left to read. */
const MAP_ZOOM_MIN = 0.3;
const MAP_ZOOM_MAX = 1;
/** How long the map holds still after the player last touched it, s, before
 * the slow turn picks up again from wherever they left it. */
const MAP_HOLD = 4;
/** Vertical slack around the framed footprint, m — hills, trees and gates
 * stand above the ground plane the fit is solved in, and the near and far
 * planes are cut from that footprint (see updateMap). */
const MAP_RELIEF = 140;
/** Landscape kept around the stage's bounds, meters. The map view cuts the
 * world to the route dilated by `ISLAND_MARGIN` (map-island.ts), so that IS
 * what there is to frame — anything further out has been clipped away. A
 * little over, so the coastline is not flush with the frame. */
const MAP_MARGIN = ISLAND_MARGIN * 1.08;
/** Azimuth rate, rad/s — a full turn every ~70 s. */
const MAP_SPIN = 0.09;
/** How far short of the map's centre the view aims, as a fraction of the
 * standoff — the correction a pitched frustum needs (see updateMap). */
const MAP_LEAN = 0.06;
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
/** Near plane while driving, m, and the closer one the hood cam needs. The
 * bonnet sits about a third of a metre under that lens, and a head thrown
 * down by a landing takes most of the margin the default near plane leaves:
 * clipped, the panel would open a hole for the landscape to show through.
 * Pulling it in costs depth precision that nothing at this range spends. */
const DRIVING_NEAR = 0.25;
const HOOD_NEAR = 0.1;
/** God mode's field of view, deg — the same register the chase rigs sit in
 * at rest, so a distance judged while flying reads the same as one judged
 * from behind the car. Fixed rather than speed-stretched: the free camera
 * has no speed worth dramatising, and a fov that breathed would make two
 * screenshots of one spot disagree about how far away things are. */
const FREE_FOV = 58;

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
   * rings like a spring toy for the rest of the straight. Vertical is the
   * best damped, because vertical is the axis the road feeds continuously:
   * a neck that rings at every rut adds a second bump to every bump the car
   * actually hit, and the rebounds pile up into a shot that never sits
   * still. Lean and brace are one-off gestures and can afford to swing. */
  dampLong: 0.62,
  dampLat: 0.58,
  dampVert: 0.58,
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

/** A ceiling something approaches instead of hitting: linear well under it
 * (`tanh x ≈ x`), never quite at it. Both of the hood camera's limits are
 * this shape, and for the same reason — a clamp is a WALL, and arriving at
 * a wall is a step. The neck's travel clamped is a landing that throws the
 * head into the end of its reach and stops it dead inside one frame, which
 * is the single biggest jolt the view has and reads as the picture breaking
 * rather than as the car landing; the grain's drive clamped is a surface
 * that gets rougher and rougher until abruptly it does not. */
const soften = (v: number, lim: number): number => lim * Math.tanh(v / lim);

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
   * frame rate the moment the car is quick.
   *
   * The top one is the ceiling, and what sets it is the SLOWEST frame rate
   * the game is played at, not how fine a buzz would be nice. 8 Hz gets
   * seven samples a period on a desktop's 60 and nearly four on a phone's
   * 30, which is still a wave. Much past that the picture stops resolving
   * the wave and starts resolving the sampling: the eye is thrown a
   * different distance every frame with no shape between the throws, which
   * is not a rougher road, it is a rougher PICTURE. */
  freq: [3.3, 5.5, 7.9],
  /** How far the head travels and how far the gaze wobbles at the reference
   * pace on gravel — m and rad. */
  heave: 0.013,
  sway: 0.0065,
  nod: 0.0055,
  tilt: 0.0042,
  /** The pace those are quoted at, m/s (~110 km/h), and the ceiling the
   * grain keeps growing to. Below the reference it fades out linearly: a
   * car being crawled back onto the road does not shake. Above it the
   * growth is SOFT, because there are springs in the way: the road hits the
   * tyres, the suspension takes most of it, and only the residue reaches
   * the seat. A rougher surface or a quicker pace works those springs
   * harder too, so twice the road is nowhere near twice the shake — the
   * drive saturates toward the ceiling instead of running at it. (What the
   * springs DID pass on is not modelled here at all: it is `car.ride`,
   * which the neck already rides.) */
  pace: 30,
  paceMax: 1.5,
  /** What each surface does to it. Asphalt is the smooth one and open
   * country is the rough one; a ford's bed is somewhere between. The spread
   * is what makes leaving the road READ, so the rough end has to stay a
   * clear step above gravel without becoming a picture nobody can drive
   * from — the moment a surface is unreadable the grain has stopped
   * describing it. */
  surface: { gravel: 1, asphalt: 0.4, nature: 1.6, water: 1.15 },
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
  /** Share of the CLIFF hold this rig takes, 0..1 (see CLIFF). The low
   * rigs take all of it — they are the ones the drop happens TO. The two
   * that already fly a long way over the terrain take a fraction: from
   * twenty metres up, holding another twelve only makes the car small. */
  cliff: number;
};

/** The ladder, in numbers. `chase` is the reference frame — proportions read
 * off Sega Rally: roof-height camera pitched a few degrees down, close
 * behind, so the car anchors the BOTTOM of the frame and the horizon rides
 * high. `close` and `far` are that same shot pulled in and stood back;
 * `heli` and `top` trade the drama for what the driver cannot otherwise
 * see, which is the road past the next crest.
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
    cliff: 1,
  },
  chase: {
    dist: 5.6,
    distPerSpeed: 0.02,
    height: 2,
    driftWeight: 0.8,
    followRate: 5,
    fov: 58,
    fovPerSpeed: 0.38,
    fovMax: 86,
    aimAhead: 8,
    aimHeight: 0.8,
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
  /** Turn, tilt and zoom the map view by hand: azimuth and pitch in radians,
   * zoom as a MULTIPLIER on the standoff (below 1 pulls in). The slow turn
   * holds for `MAP_HOLD` after every nudge and then picks up from there. */
  nudgeMap: (dAz: number, dPitch: number, zoomBy: number) => void;
  /** Put the map back on its framing: whole stage, default tilt. */
  resetMap: () => void;
  /** Advance to the next PLAYABLE mode; a no-op read while overhead. */
  cycle: () => CameraMode;
  /** God mode's rig, and the channel its controls write into. The move is
   * rewritten by the app every frame and CONSUMED by `update` — the look
   * deltas and the wheel steps are per-frame accumulators, so leaving them
   * standing would spin the camera forever. */
  free: FreeFlyRig;
  freeMove: FreeFlyMove;
  /** Where the camera is standing and what it is looking at, whatever mode
   * is up — what the debug overlay prints and the repro line carries. */
  pose: () => FreeFlyPose;
  /** Where the hood camera sits on the car now on the stage, body-local m —
   * pushed when the car's meshes are built, because the mount is read off
   * that car's own silhouette. */
  setHoodEye: (eye: HoodEye) => void;
  /** The driver has thrown the establishing shot away. The engine's own skip
   * is instant; this lets the camera fly the rest of the shot at speed
   * instead of cutting (camera-start.ts). */
  skipStartShot: () => void;
  /** Rewind the establishing shot for a new run. */
  resetStartShot: () => void;
  update: (state: GameState, dt: number) => void;
  kick: (strength: number) => void;
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
  let shake = 0;
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
  /** Seconds the camera has been alive — the drone's circling and the map
   * view's azimuth both walk off it, so neither depends on frame rate. */
  let orbit = 0;
  /** How far the map view stands off the stage to FRAME it, m — the renderer
   * hangs the fog off it so the built ground always dissolves before its
   * edge. Zoom moves the camera, never this: fog that closed in as the
   * player leaned in would grey out the thing they leaned in to see. */
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
  /** Where the map is being looked at from: the azimuth the turn has walked
   * to, the tilt, and how far in it is zoomed (1 frames the whole stage). */
  let mapAz = 0;
  let mapPitch = MAP_PITCH;
  let mapZoom = 1;
  const free = createFreeFly();
  const freeMove: FreeFlyMove = { ...NEUTRAL_MOVE };
  /** Seconds since the player last moved the map themselves. */
  let mapHeld = MAP_HOLD;

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

    const sx = (Math.random() - 0.5) * shake * rig.shake;
    const sy = (Math.random() - 0.5) * shake * rig.shake;
    const ride = car.y + height_ + car.ride * rig.heave + held;
    camera.position.set(camX + sx, Math.max(ride, floor) + sy, camZ);
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
    const offLong = soften((head.x - seat.x) * fwdX + (head.z - seat.z) * fwdZ, HEAD.limLong);
    const offLat = soften((head.x - seat.x) * rightX + (head.z - seat.z) * rightZ, HEAD.limLat);
    const offUp = soften(head.y - seat.y, HEAD.limVert);
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
    const wantGrain = soften((speed / GRAIN.pace) * surface, GRAIN.paceMax);
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
  const updateMap = (state: GameState, dt: number): void => {
    mapHeld += dt;
    // The turn is the page's idle state, not a mode: a drag interrupts it and
    // it picks up again from wherever the drag finished, so nothing ever
    // snaps back to a framing the player did not choose.
    if (mapHeld >= MAP_HOLD) mapAz += MAP_SPIN * dt;
    const b = state.track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    fov = MAP_FOV;
    const vHalf = (verticalFovFor(MAP_FOV, camera.aspect) * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    // The island is the route dilated by a margin, so what has to fit is a
    // circle on the bounds' own DIAGONAL — not on its longer side. Fitting
    // the side instead runs the two nearest corners of a squarish stage off
    // the bottom of the pane, which is exactly where the start line tends to
    // be.
    const radius = Math.max(100, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2) + MAP_MARGIN;
    // Fit BOTH axes, and only the depth axis is foreshortened. The map lies
    // in the ground plane and the camera looks down it at MAP_PITCH, so what
    // the pane must hold vertically is the footprint's depth SQUASHED by
    // sin(pitch). Fitting the raw span to the vertical angle instead — as a
    // fit that ignored the pitch would — pushes the camera a fifth too far
    // out and leaves the map floating in a paneful of sky.
    mapRange = Math.max((radius * Math.sin(mapPitch)) / Math.tan(vHalf), radius / Math.tan(hHalf));
    const range = mapRange * mapZoom;
    const az = mapAz;
    const ground = Math.cos(mapPitch) * range;
    camera.position.set(
      cx + Math.sin(az) * ground,
      Math.sin(mapPitch) * range,
      cz + Math.cos(az) * ground,
    );
    // Aimed a little SHORT of the centre, on the camera's own side. The fit
    // above is symmetric in ANGLE, and a pitched frustum spends more of its
    // vertical angle on the near half of the ground than on the far one — so
    // an aim on the exact middle runs the nearest coast off the bottom of the
    // pane while leaving empty sky at the top.
    const lean = range * MAP_LEAN;
    camera.lookAt(cx + Math.sin(az) * lean, 0, cz + Math.cos(az) * lean);
    // The frustum is cut to the footprint it is actually looking at. A stage
    // is kilometres across, and a driving near plane a quarter of a metre out
    // under a far plane that distant leaves the depth buffer barely a metre
    // of resolution out where the map is — which is a lake and the lakebed
    // under it swapping places every time the view turns. Everything drawn
    // lies within `reach` of the centre, so those two distances ARE the
    // planes, and the buffer spends its whole range on the map.
    const reach = radius + MAP_RELIEF;
    camera.near = Math.max(1, range - reach);
    camera.far = range + reach;
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
    // The height the car last left the ground at, kept in every mode so a
    // camera switched to mid-flight knows how far the fall already is
    // (CLIFF). Grounded it tracks the car, which is the same thing.
    if (!state.car.airborne) takeoff = state.car.y;
    // The finish owns the shot in every mode a player can drive from.
    // Overhead it does not: the drone is the menu's backdrop, where a bot
    // finishes a stage every couple of minutes and nobody is watching it
    // arrive, and the map view is not a camera anybody is driving under.
    const watching = state.phase === "rollout" || state.phase === "finished";
    const inCar = mode === "hood" && !watching;
    // The map view solves BOTH of its planes from the stage it is framing
    // (see updateMap); every other camera stands in the world and takes the
    // driving pair. The finish camera is standing on the ground outside the
    // car whichever view it planted from, so it takes the outside near plane
    // even when the player was in the hood a moment ago.
    if (mode !== "map") {
      camera.near = inCar ? HOOD_NEAR : DRIVING_NEAR;
      camera.far = DRIVING_FAR;
    }
    // God mode is nobody's shot but the pilot's: the finish never takes it,
    // and it keeps flying whatever phase the run beneath it is in.
    if (watching && mode !== "free" && mode !== "drone" && mode !== "map") {
      updateFinish(state, dt);
      camera.fov = verticalFovFor(fov, camera.aspect);
      camera.updateProjectionMatrix();
      return;
    }
    if (!watching) planted = null;
    if (mode === "free") {
      free.update(camera, freeMove, dt);
      freeMove.yawDelta = 0;
      freeMove.pitchDelta = 0;
      freeMove.speedSteps = 0;
      camera.fov = verticalFovFor(FREE_FOV, camera.aspect);
      camera.updateProjectionMatrix();
      return;
    }
    if (mode === "hood") updateHood(state, dt);
    else if (mode === "drone") updateDrone(state, dt);
    else if (mode === "map") updateMap(state, dt);
    else updateChase(CHASE_RIGS[mode], state, dt);
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
    camera.fov = verticalFovFor(shot, camera.aspect);
    camera.updateProjectionMatrix();
  };

  return {
    camera,
    mode: () => mode,
    mapRange: () => mapRange,
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
    nudgeMap: (dAz, dPitch, zoomBy) => {
      mapHeld = 0;
      mapAz += dAz;
      mapPitch = clamp(mapPitch + dPitch, MAP_PITCH_MIN, MAP_PITCH_MAX);
      mapZoom = clamp(mapZoom * zoomBy, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
    },
    resetMap: () => {
      mapHeld = 0;
      mapPitch = MAP_PITCH;
      mapZoom = 1;
    },
    skipStartShot: startShot.skip,
    resetStartShot: startShot.reset,
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
      // rather than swinging across the gap between them. A stage builds its
      // car, so this is also where a fresh run drops whatever the last one
      // left the rig holding — the ground under a new stage is found, not
      // flown down to, and nobody starts a run mid-plunge.
      seated = false;
      floored = false;
      held = 0;
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
