// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VIEW FROM INSIDE THE CAR — three of them, one rig.
//
//   cockpit — behind the wheel: the fascia, the dials, the rim and the
//             screen pillars are all in frame, and the road is what is left
//             between them. The most involving and the least forgiving.
//   hood    — on the car's own scuttle, over its bonnet. The screen and the
//             cabin are behind the lens; what fills the bottom of the frame
//             is the car's own paint.
//   bumper  — down at the nose, ahead of every panel: no bodywork at all,
//             the ground close under the lens, and speed nowhere to hide.
//
// What separates these three from the chase rigs is not where they stand —
// it is that a camera bolted to a bodyshell is a STILL PHOTOGRAPH. The
// stage's ground is a smooth loft, so on a straight a lens welded to the
// scuttle does not move at all, and the picture in front of it is a painted
// slab. Two things put the motion back, and both live here:
//
//   THERE IS A HEAD ON A NECK. The eye is not bolted to the mount: it sits
//   on top of a neck hinged at the base of it, and it is pushed off upright
//   by what the driver is being pushed by — thrown toward the nose under the
//   brakes, tipped back under power, leaned out of a corner, dropped into a
//   dip. The neck is a stiff, well damped spring, so it arrives a beat after
//   the car and settles without bouncing, and the arc it swings on bounds
//   the whole thing: at 22 cm and ten degrees, nothing in the game can move
//   the picture more than about four centimetres. Not a landing, not a shunt
//   into a boulder.
//
//   What pushes it is read off the CAR'S OWN RATES — `u`, `w`, `vy`,
//   `yawRate`, which the engine keeps — and never off where the mount has
//   got to. That is the difference between a neck and a rattle, and it is
//   not obvious from outside. At 120 km/h the mount covers half a metre
//   between frames, so a head that chases it has every quantity dominated by
//   road speed rather than by load: a fraction of a percent of disagreement
//   is centimetres of lean nothing asked for, parked in one direction, in
//   proportion to SPEED, leaving the brakes nothing left to move. Worse, the
//   engine steps at a fixed 120 Hz off an accumulator, so on a display whose
//   rate 120 is not a multiple of — 144 being the common one — some frames
//   step twice and some not at all, and a chased mount hands the neck tens
//   of metres a second of phantom motion several times a second. The machine
//   it was tuned on is steady and somebody else's shakes itself apart.
//   Differencing a VELOCITY has no such term: the error is bounded by the
//   acceleration, so the same missed step is worth a fraction of one bump.
//
//   The load is then smoothed by a critically damped follower before the
//   neck sees it, and that smoothing IS the head's inertia: everything the
//   car does faster than it is carried rigidly instead of answered. Carried
//   is what a player wants. A head moving against the shell moves the fascia
//   a hand's reach from the lens, not the road twenty metres out — the road
//   barely stirs while the dashboard swims, which is read, correctly, as the
//   camera shaking. Carried, the cabin and the road move together, which is
//   read as the car moving.
//
//   THE ROAD HAS GRAIN. Under the big motions the surface arrives as a
//   vibration, applied as MOTION rather than as load — a mass on a spring at
//   ~3 Hz answers a 10 Hz road with almost nothing. It is the one thing here
//   nothing filters, so it is also the one that moves the cabin freely, and
//   the seat with bodywork closest to the lens takes the LEAST of it.
//
// And a HIT throws the head. An impact hands the neck a directional impulse
// and rings a small rotational wobble on top of it, so the picture waves and
// recovers rather than jittering: that wave is the only thing in the frame
// that says the car hit something, once the bodywork is behind the lens. It
// is also the ONLY thing a hit does to this camera. The chase rigs answer a
// kick with a decaying random rattle, and from a boom four metres back that
// reads as a knock; applied to a lens with a dashboard under it, a fresh
// random offset every frame is not a knock, it is the cabin teleporting.
//
// Every number is a ROW in `EYE_RIGS`, and the player owns four of them
// (`EyeTuning`, from OPTIONS ▸ VIEW): seat height, seat reach, field of
// view, and how much head motion they want at all — the last of which winds
// the neck, the grain, the jolt and the wobble down together, to nothing.

import * as THREE from "three";
import type { GameState } from "@engine";

import { angleLerp, clamp } from "../lib/angles.ts";
import { MAX_VFOV, verticalFovFor } from "../lib/fov.ts";
import { createSlack } from "../lib/slack.ts";

/** The three views that are taken from inside (or off the nose of) the car,
 * as opposed to the five rigs that stand behind it. */
export type InCarCamera = "cockpit" | "hood" | "bumper";

/** Where one of them mounts on the car, in body-local metres (+z the nose,
 * +x its right side, y from the ground). */
export type CarEye = { x: number; y: number; z: number };

/** All three mounts for the car that is on the stage. Read off that car's
 * own silhouette, so a low sedan seats every shot lower than an upright
 * hatch does. */
export type CarEyes = Record<InCarCamera, CarEye>;

/** The player's own adjustments to whichever in-car view is up. These are
 * the knobs OPTIONS ▸ VIEW moves, and the ones the tooling sweeps from the
 * URL — one struct so a variant is a single value to pass around. */
export type EyeTuning = {
  /** Seat height, m over the rig's own mount. */
  rise: number;
  /** Seat reach, m toward the nose. */
  ahead: number;
  /** Added to the rig's design field of view, deg. */
  fov: number;
  /** How much head there is at all: a scale on the neck's travel, the road
   * grain, the impact jolt and the wobble together. 0 bolts the lens to the
   * body — a still photograph, and the right answer for anybody the motion
   * makes ill. */
  motion: number;
};

export const NEUTRAL_TUNING: EyeTuning = { rise: 0, ahead: 0, fov: 0, motion: 1 };

/** THE NECK, AS ANATOMY. The eye does not float about on the end of three
 * independent springs: it sits on top of a neck, the neck is hinged at the
 * base of it, and everything the picture is allowed to do follows from those
 * two facts. So the travel is not a free number here — it is `length` and
 * `leanMax`, and the furthest the view can ever move is the arc between
 * them. A stiff neck at 22 cm and 10° reaches under four centimetres, and
 * NOTHING in the game can push it past that: not a landing, not a shunt into
 * a boulder, not a frame the machine took a quarter of a second over.
 *
 * The arc is also why the axes are not independent. Lean the neck any
 * direction and the eye comes DOWN a little, because it is swinging, not
 * sliding — which is most of what makes the motion read as a head rather
 * than as a camera on rails. The spine's own give is the one genuinely
 * vertical part, and it is small: a spine is stiff in compression.
 *
 * Stiffness is then tuned against the SUSTAINED load, not against the reach.
 * A rally car corners and brakes at 10-17 m/s² for most of a stage, and the
 * head sits `accel / stiff²` off upright under it: soft enough to make that
 * look dramatic is soft enough to spend the stage jammed at the end of the
 * arc, where every change of load throws the head from one stop to the
 * other. Sized so the everyday corner lands around half the lean, the same
 * corner reads as bracing and what is left is there for the moments that
 * deserve it. Damping at or just under 1 settles without a second bump; far
 * under it the head rings like a spring toy for the rest of the straight and
 * every rut adds a bounce the car never made. */
type Neck = {
  /** How far the eye sits above the hinge at the base of the neck, m. With
   * `leanMax` this is the whole of the geometry: the arc's radius. */
  length: number;
  /** How far off upright the neck may lean, rad. Approached and never
   * reached (see `soften`), so it is a bound on the picture rather than a
   * wall for it to hit. */
  leanMax: number;
  /** How far the spine gives, m — the only travel that is not the arc. */
  squash: number;
  stiffLong: number;
  stiffLat: number;
  stiffVert: number;
  dampLong: number;
  dampLat: number;
  dampVert: number;
  /** The corner the LOAD is smoothed at before the neck is allowed to
   * answer it, rad/s — the head's INERTIA, and the knob that decides whether
   * the cabin sits still. Everything the car does faster than this is
   * carried rather than answered (see the head's note at the top of the
   * file). It wants to sit between the two things it has to tell apart: a
   * load builds over about a third of a second, and a stage's chatter is
   * several times a second, so a few rad/s keeps the brakes and the corner
   * and lets the rest through to the shell alone. The follower is second
   * order, which is what makes that gap wide enough to aim at — a single
   * ease slow enough to reject the chatter is also slow enough to make the
   * brakes arrive late, and a driver feels that at once. */
  settle: number;
  /** Ceiling on how fast the head may travel relative to the mount, m/s. A
   * slammed landing hands the neck ten metres a second of relative speed in
   * one step; ungoverned the head would cross its whole travel inside a
   * frame, which reads as a glitch rather than as a hit. It is an emergency
   * stop and nothing else: set anywhere near the speed the head reaches
   * under an ordinary corner it stops being a governor and becomes a
   * second, harsher travel limit, on all the motion that was fine. */
  maxSpeed: number;
};

/** The rotational ring a hit leaves behind. The linear jolt alone moves the
 * head and, through `nod` and `tilt`, tips the gaze with it — but a head
 * that is struck also TURNS, and it turns for longer than it travels. This
 * is that: three damped oscillators on the gaze, excited by the impulse and
 * left to ring themselves out. */
type Wobble = {
  /** Natural frequency, rad/s, and damping ratio. Under 1 so it waves; over
   * about 0.7 so it waves ONCE. */
  freq: number;
  damp: number;
  /** Radians of gaze per m/s of impulse on the axis that drives it: a hit
   * from the side turns the head and rolls it, one from ahead nods it. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Ceiling on each, rad — a head-on shunt at 30 m/s must still leave a
   * picture somebody can drive out of. Set close to what an everyday landing
   * already asks for, it stops being a ceiling and becomes the answer to
   * every hit: a clipped kerb, a heavy landing and a shunt into a boulder
   * all arrive at exactly the same size, and the wave stops saying anything
   * about what was hit. */
  max: number;
};

export type EyeRig = {
  /** Design field of view at a standstill, deg, what a m/s of pace adds, the
   * ceiling before the world turns into a tunnel, and how fast it follows. */
  fov: number;
  fovPerSpeed: number;
  fovMax: number;
  fovRate: number;
  /** How fast the gaze follows the car's own heading, 1/s. Brisk: this is a
   * head on a neck looking down a road, not a camera on a boom. */
  yawRate: number;
  neck: Neck;
  /** How much of the neck's own lean the GAZE takes, 0..1 — a share, not a
   * rate, because the head is sitting on the thing that leaned. Well under 1
   * in every row: a driver whose eyes rode the full lean would be studying
   * the floor every time they touched the brakes, so the head rolls back on
   * the neck and keeps most of the road. What is left over is the part worth
   * having — the car goes down on its nose under the brakes and the view
   * tips a little further than the car did, tips back a little under power,
   * and leans into the corner with the driver. A tad of each. */
  nod: number;
  tilt: number;
  /** How much of the body's attitude the gaze takes, 0..1. Under 1 because
   * a driver levels their head against the car; a lens bolted to the nose
   * has no neck to do it with and takes nearly all of it. */
  rollFollow: number;
  pitchFollow: number;
  /** Fixed downward aim, rad — what puts the bonnet (or the fascia) in the
   * bottom of the frame instead of just below it. */
  aimDown: number;
  /** How much of a narrow viewport's vertical widening the aim gives back,
   * 0..1 of half of it (see the note in `update`). A view whose frame is
   * already centred on what matters wants none of it: compensating then only
   * decides which of the two useless halves — roof or fascia — gets the
   * extra. */
  wideAim: number;
  /** Where hor+ is allowed to stop for this view, deg of VERTICAL field
   * (lib/fov.ts). A shot looking out through a fixed aperture needs its own
   * ceiling; one with an open frame can take the global one. */
  vfovMax: number;
  /** How much of the slip angle the driver glances into, the ceiling on it,
   * rad, and how fast it follows. A driver in a slide looks where the car is
   * GOING; the glance is what shows the drift from a seat that otherwise
   * points at the nose. */
  glance: number;
  glanceMax: number;
  glanceRate: number;
  /** Scale on the road's grain, and on the directional jolt a hit hands the
   * neck. The grain is the one motion here applied straight to the head
   * rather than through the neck, so it is also the one that moves the cabin
   * with nothing filtering it: from a seat with a fascia under the lens a
   * centimetre of it at 8 Hz is a dashboard visibly buzzing, and the view
   * that needs the LEAST of it is the one that looks like it needs the
   * most. */
  grain: number;
  jolt: number;
  wobble: Wobble;
  /** The play the horizon is hung on, rad (see `ROLL_PLAY`). */
  rollPlay: { reach: number; recover: number };
  /** Near plane, m. The nearest bodywork decides it: the bonnet sits about a
   * third of a metre under the hood lens and the wheel rim about a quarter
   * under the cockpit one, and a head thrown down by a landing takes most of
   * whatever margin is left. Clipped, either would open a hole for the
   * landscape to show through. */
  near: number;
};

/** THE LADDER, IN NUMBERS.
 *
 * `hood` is the reference row: it is the view this game was tuned around,
 * and the other two are stated as departures from it.
 *
 * `cockpit` sits half a metre further back and 15 cm lower, which is a
 * different bargain in every line. The screen is an APERTURE now rather than
 * an open frame, so the field of view is pulled in — a wide lens spends its
 * extra degrees on pillar and fascia, not on road. The neck is looser and
 * travels further, because from inside the car there is a whole cabin to
 * measure the head's movement against and every centimetre of it reads. And
 * the glance is bigger: the driver's own screen pillar is what a slide
 * throws the road behind, so the head has to move further to see round it.
 *
 * `bumper` is the opposite car. There is no head down there — it is a lens
 * on the nose — so the neck is stiff and short and the horizon follows the
 * body almost exactly. What it has instead is the widest frame on the ladder
 * and the ground half a metre under it, which is the whole reason to drive
 * from it: at the same speed, this is the picture that reads fastest. */
export const EYE_RIGS: Record<InCarCamera, EyeRig> = {
  cockpit: {
    // The widest frame on the ladder, and it is spent on CABIN rather than
    // on road: from the seat, a screen pillar either side of the windscreen
    // and a mirror hanging in the top of it are what say the player is
    // inside something. A narrower lens crops all of that away and leaves a
    // hood cam with a dashboard at the bottom.
    fov: 68,
    fovPerSpeed: 0.34,
    fovMax: 84,
    fovRate: 5,
    yawRate: 14,
    // The heaviest head on the ladder, and the one that moves least against
    // what it is sitting in. Everything a head does here is measured against
    // a dashboard a hand's reach away, so the same centimetre that reads as
    // weight from the scuttle reads as the cabin sliding about from the
    // seat: the neck is stiff enough to keep the everyday load inside a
    // third of its reach, damped so nothing rebounds twice, and given the
    // slowest mount on the ladder to chase.
    neck: {
      // A real one: the eye about 22 cm over the hinge at the base of it,
      // and a STIFF one — ten degrees of lean, which is under four
      // centimetres of picture, and a spine that gives a couple more.
      length: 0.22,
      leanMax: 0.175,
      squash: 0.028,
      stiffLong: 24,
      stiffLat: 23,
      stiffVert: 22,
      dampLong: 1,
      dampLat: 0.95,
      dampVert: 1,
      settle: 3.5,
      maxSpeed: 2.2,
    },
    nod: 0.3,
    tilt: 0.35,
    rollFollow: 0.62,
    pitchFollow: 0.8,
    // Aimed further down than the other two, and for the cabin's sake rather
    // than the road's: what is above the screen from this seat is headliner,
    // and what is below it is the wheel, the dials and the floor. Trading a
    // few degrees of the first for the second is trading nothing for the
    // things this camera exists to show.
    aimDown: 0.085,
    // The screen aperture already sits centred on the gaze, so a narrow
    // viewport's extra degrees are split evenly between the roof above it
    // and the fascia below — and the cap is what stops there being many.
    wideAim: 0.05,
    vfovMax: 80,
    // A smaller glance than the view from the scuttle, which is the
    // opposite of what it looks like it should be. From INSIDE there is a
    // screen pillar a foot from the eye, so every degree of glance swings it
    // across the frame — the same head movement that reads as looking into
    // the slide from the bonnet reads as losing sight of the road from the
    // seat. The neck's own lateral travel is doing most of the work here
    // anyway, and it costs no yaw at all.
    glance: 0.36,
    glanceMax: 0.27,
    glanceRate: 5,
    // The least grain on the ladder, for the same reason the neck is the
    // stiffest: this is the only seat with bodywork close enough for a
    // centimetre of head travel to be a large movement, and it is also the
    // seat that needs the grain least — the shell's own buzz already arrives
    // here, carried whole.
    grain: 0.4,
    jolt: 0.85,
    // Waves once and is done. The gaze swing a ring this size makes is the
    // same number of degrees whatever is in frame, but from inside the car
    // it sweeps a screen pillar across the road, so it is worth less here
    // than it is from the bonnet and has to be spent faster.
    wobble: { freq: 9, damp: 0.75, yaw: 0.045, pitch: 0.04, roll: 0.055, max: 0.12 },
    rollPlay: { reach: 0.16, recover: 0.35 },
    near: 0.05,
  },
  hood: {
    fov: 64,
    fovPerSpeed: 0.42,
    fovMax: 92,
    fovRate: 5,
    yawRate: 14,
    // The loosest neck of the three, and it can afford to be: the nearest
    // thing to this lens is the car's own bonnet, a metre out and low in the
    // frame, so head travel here reads as the weight of the shot rather than
    // as the furniture moving.
    neck: {
      length: 0.22,
      leanMax: 0.21,
      squash: 0.038,
      stiffLong: 20,
      stiffLat: 19,
      stiffVert: 18,
      dampLong: 0.85,
      dampLat: 0.8,
      dampVert: 0.85,
      settle: 5,
      maxSpeed: 2.2,
    },
    nod: 0.28,
    tilt: 0.32,
    rollFollow: 0.55,
    pitchFollow: 0.75,
    aimDown: 0.05,
    wideAim: 0.6,
    vfovMax: MAX_VFOV,
    glance: 0.4,
    glanceMax: 0.32,
    glanceRate: 5,
    grain: 0.9,
    jolt: 1,
    wobble: { freq: 9, damp: 0.65, yaw: 0.055, pitch: 0.05, roll: 0.07, max: 0.14 },
    rollPlay: { reach: 0.16, recover: 0.35 },
    near: 0.1,
  },
  bumper: {
    fov: 70,
    fovPerSpeed: 0.44,
    fovMax: 96,
    fovRate: 5,
    yawRate: 16,
    // Barely a neck at all, and chasing a mount that is barely settled: a
    // lens bolted to the nose has no head to give inertia to, so what little
    // travel there is exists to stop a landing driving the lens through the
    // bumper rather than to describe anybody bracing.
    neck: {
      // Nobody's neck: a short stiff mount with barely five degrees in it,
      // which is what keeps a landing from driving the lens through the
      // bumper without pretending there is a driver down here.
      length: 0.18,
      leanMax: 0.09,
      squash: 0.018,
      stiffLong: 26,
      stiffLat: 25,
      stiffVert: 24,
      dampLong: 0.9,
      dampLat: 0.88,
      dampVert: 0.9,
      settle: 9,
      maxSpeed: 1.2,
    },
    nod: 0.15,
    tilt: 0.15,
    rollFollow: 0.9,
    pitchFollow: 0.95,
    aimDown: 0.012,
    wideAim: 0.35,
    vfovMax: MAX_VFOV,
    glance: 0.24,
    glanceMax: 0.22,
    glanceRate: 6,
    grain: 0.7,
    jolt: 0.8,
    wobble: { freq: 12, damp: 0.7, yaw: 0.03, pitch: 0.04, roll: 0.04, max: 0.09 },
    rollPlay: { reach: 0.1, recover: 0.5 },
    near: 0.1,
  },
};

/** A ceiling something approaches instead of hitting: linear well under it
 * (`tanh x ≈ x`), never quite at it. Both of the eye's limits are this
 * shape, and for the same reason — a clamp is a WALL, and arriving at a wall
 * is a step. The neck's travel clamped is a landing that throws the head into
 * the end of its reach and stops it dead inside one frame, which is the
 * single biggest jolt the view has and reads as the picture breaking rather
 * than as the car landing; the grain's drive clamped is a surface that gets
 * rougher and rougher until abruptly it does not. */
export function soften(v: number, lim: number): number {
  if (lim <= 1e-4) return 0;
  return lim * Math.tanh(v / lim);
}

/** The road buzzing up through the seat. The stage's ground is a smooth loft
 * — it has grades, crests and dips, but no GRAIN — so this is where the
 * surface is put back: as motion on the head, which is what the neck has
 * left after filtering the shell's own vibration. The GAZE wobbles as well
 * as the eye — a few thousandths of a radian is a couple of pixels of
 * horizon, and without it only the near bodywork would tremble while the
 * world stayed nailed down. */
const GRAIN = {
  /** The three oscillators, Hz: a thump through the springs, the surface's
   * chatter, and a fine buzz on top. Deliberately incommensurate, so the
   * pattern never settles into a hum, and in TIME rather than in distance —
   * a wavelength short enough to read as vibration aliases against the frame
   * rate the moment the car is quick.
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
   * grain keeps growing to. Below the reference it fades out linearly: a car
   * being crawled back onto the road does not shake. Above it the growth is
   * SOFT, because there are springs in the way: the road hits the tyres, the
   * suspension takes most of it, and only the residue reaches the seat. A
   * rougher surface or a quicker pace works those springs harder too, so
   * twice the road is nowhere near twice the shake. (What the springs DID
   * pass on is not modelled here at all: it is `car.ride`, which the neck
   * already rides.) */
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
   * 1/s. In the air the road stops arriving, and the silence is most of what
   * makes a jump read as flight from inside the car. */
  rate: 7,
} as const;

/** How far down the road the aim point is thrown, m. Only the DIRECTION
 * matters — far enough out that the pitch and the glance read as angles
 * rather than as a point being circled. */
const AIM_REACH = 20;

/** A mount jump this big means a respawn or a fresh stage, m — the head is
 * put back on the seat rather than flung across the map. */
const SNAP = 4;

/** THE HORIZON HANGS ON PLAY. The body settles onto the camber under its
 * wheels, and R16's road has a cross-section: a crown, two worn wheel tracks
 * and a loose edge. A wheel track's trough is worth about five degrees of
 * roll, which is also about what R19 banks a gravel corner — so SIZE cannot
 * separate them. What can is TIME: a bank is HELD for the length of a corner
 * and a wheel track is CROSSED in a second, so the play is wide enough to
 * stay out of the way of both and the recovery does the work. The bank is
 * handed over inside its own runoff; the crossing leaks about a fifth of
 * itself. The clamp is still there for the one case time cannot handle — a
 * hillside off the road, which is tens of degrees and would otherwise lag
 * into the scenery. Per-rig, because a lens on the bumper has no neck to
 * hold anything level with. */

/** A camera sat in the car, with a head on it. One instance drives all three
 * in-car views: switching between them re-seats the head rather than keeping
 * three necks warm, which is right — a player who changes camera is asking
 * for a new shot, not for the old one's momentum. */
export type EyeCamera = {
  /** Where the three mounts are on the car now on the stage. */
  setEyes: (eyes: CarEyes) => void;
  /** The player's own seat, lens and motion settings. */
  setTuning: (tuning: EyeTuning) => void;
  /** Throw the head along a world direction at `speed` m/s of impulse — an
   * impact, a landing, a kerb. The direction need not be normalised. */
  jolt: (x: number, y: number, z: number, speed: number) => void;
  /** Put the head back on the seat: a fresh car, a fresh stage, a respawn. */
  reseat: () => void;
  /** Drive the camera for one frame. Returns the DESIGN fov (horizontal
   * reference) the shot wants, for the caller to blend and convert. */
  update: (
    view: InCarCamera,
    state: GameState,
    dt: number,
    camera: THREE.PerspectiveCamera,
  ) => number;
  /** Which rig is up — what the caller reads the near plane off. */
  rigOf: (view: InCarCamera) => EyeRig;
};

/** Longest step the springs are integrated over, s. A stiff spring stepped
 * at a hitching tab's dt rings or blows up, and clamping the step instead
 * would make the motion run slow on a weak machine — the head would then be
 * a frame-rate reading. */
const SPRING_STEP = 1 / 90;

/** The default mount, until a stage's car is built and pushes its own: the
 * compact hatch's scuttle. */
const FALLBACK: CarEye = { x: -0.16, y: 1.21, z: 0.66 };

export function createEyeCamera(): EyeCamera {
  let eyes: CarEyes = { cockpit: FALLBACK, hood: FALLBACK, bumper: FALLBACK };
  let tuning: EyeTuning = { ...NEUTRAL_TUNING };
  /** Which view the standing head belongs to — a change re-seats it. */
  let seatedOn: InCarCamera | null = null;
  /** The mount in the world, and where it was last frame — the second only
   * to catch it being picked up and put down somewhere else. */
  const seat = new THREE.Vector3();
  const seatWas = new THREE.Vector3();
  /** Where the head has swung to and how fast it is going — in the CAR's
   * axes, and measured from where a head that was bolted down would be.
   * Both are small numbers by construction: centimetres, not the metres of
   * road that pass under the car while they are being worked out. */
  const lean = { long: 0, lat: 0, vert: 0 };
  const leanVel = { long: 0, lat: 0, vert: 0 };
  /** The load the driver is under, m/s², smoothed — the head's inertia —
   * and the rate that smoothing is moving at. */
  const load = { long: 0, lat: 0, vert: 0 };
  const loadVel = { long: 0, lat: 0, vert: 0 };
  /** Last frame's rates, for the one difference the load needs. */
  let wasU = 0;
  let wasW = 0;
  let wasVy = 0;
  let yaw = 0;
  let fov = 64;
  /** How far into the slide the driver is looking, rad off the nose. */
  let glance = 0;
  /** How hard the road is coming through the seat right now, 0..~1.5. */
  let grain = 0;
  /** Seconds the rig has been alive — the grain walks off it, so the buzz
   * does not depend on frame rate. */
  let clock = 0;
  /** The rotational ring a hit leaves: the angle on each axis and the rate
   * it is moving at, rad and rad/s. */
  const wob = { yaw: 0, pitch: 0, roll: 0 };
  const wobVel = { yaw: 0, pitch: 0, roll: 0 };
  let rollSlack = createSlack(EYE_RIGS.hood.rollPlay);
  const aim = new THREE.Vector3();

  /** Where the mount is in the world. The eye is bolted to the BODY, so it
   * takes the load pitch the brakes and the power put in, then the springs'
   * heave, then the attitude of whatever the wheels are standing on — the
   * same order car-mesh.ts hangs the meshes in, so the lens sits on the
   * bodywork it is looking at however the car is thrown about. */
  const seatAt = (car: GameState["car"], mount: CarEye, out: THREE.Vector3): void => {
    const { x } = mount;
    const y = mount.y + tuning.rise;
    const z = mount.z + tuning.ahead;
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

  const reseat = (): void => {
    seatedOn = null;
  };

  const update = (
    view: InCarCamera,
    state: GameState,
    dt: number,
    camera: THREE.PerspectiveCamera,
  ): number => {
    const rig = EYE_RIGS[view];
    const car = state.car;
    const motion = Math.max(0, tuning.motion);
    clock += dt;
    yaw = angleLerp(yaw, car.heading, clamp(rig.yawRate * dt, 0, 1));
    const wantFov = Math.min(rig.fovMax, rig.fov + tuning.fov + car.u * rig.fovPerSpeed);
    fov += (wantFov - fov) * clamp(rig.fovRate * dt, 0, 1);

    seatAt(car, eyes[view], seat);
    if (seatedOn !== view || seat.distanceTo(seatWas) > SNAP) {
      // A fresh stage, a respawn, or a press of the camera key: the seat has
      // been picked up and put down somewhere else, and no neck stretches
      // across that.
      lean.long = lean.lat = lean.vert = 0;
      leanVel.long = leanVel.lat = leanVel.vert = 0;
      load.long = load.lat = load.vert = 0;
      loadVel.long = loadVel.lat = loadVel.vert = 0;
      wasU = car.u;
      wasW = car.w;
      wasVy = car.vy;
      seatWas.copy(seat);
      wob.yaw = wob.pitch = wob.roll = 0;
      wobVel.yaw = wobVel.pitch = wobVel.roll = 0;
      if (seatedOn !== view) rollSlack = createSlack(rig.rollPlay);
      seatedOn = view;
    }
    // Every frame, and not only in the branch above: this is the only thing
    // the mount's position is still used for, and left behind it is a datum
    // the car drives away from — the jump test then passes a few frames
    // later and goes on passing, resetting the neck for the rest of the
    // stage. A head that is reseated every frame is a head bolted down.
    seatWas.copy(seat);

    // The neck works in the CAR's axes: a head is thrown back under power
    // and sideways through a corner, and those are different springs.
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;
    const n = rig.neck;

    // WHAT THE DRIVER IS BEING PUSHED BY, in their own axes, m/s². This is
    // the only thing that moves the head, and where it is read from is the
    // whole difference between a neck and a wobble.
    //
    // The tempting way is to watch the MOUNT and have the head chase it. It
    // does not work, and not for a subtle reason: at 120 km/h the mount
    // covers half a metre between frames, so every quantity in the chase is
    // dominated by road speed rather than by load, and a fraction of a
    // percent of disagreement between the head's path and the mount's — a
    // finite step, an exponential taken over one — is centimetres of lean
    // that nothing asked for. It parks the head at one end of its arc, in
    // proportion to SPEED, leaving the brakes nothing to move it with. It is
    // also a reading of the display: the engine steps at a fixed 120 Hz off
    // an accumulator, so on a monitor whose rate 120 is not a multiple of,
    // some frames step twice and some not at all, and a mount differenced
    // across them alternates between double speed and a dead stop.
    //
    // So the load is read off the car's own RATES instead, which the engine
    // keeps and which no camera has to reconstruct. Only velocities are
    // differenced, never positions, and the error in differencing a velocity
    // is bounded by the acceleration itself rather than by how fast the car
    // happens to be going — the same missed step that was worth 30 m/s of
    // phantom motion is worth a fraction of one bump.
    const perSec = 1 / Math.max(dt, 1e-4);
    // The CAR's vertical speed, and deliberately not the body's on top of
    // it. `rideRate` is the shell working on its springs — the chatter — and
    // a head given it back answers every rut twice: once carried, once on
    // the neck, the second one moving the cabin against the road. What is
    // left is the ground the wheels are actually following, which is what
    // lifts a driver over a crest and drops them into a dip.
    const mountUp = car.vy;
    // Turning is an acceleration even at a constant speed, and it is the
    // biggest one a rally driver spends their day under: the `u·yawRate`
    // term IS the corner.
    const rawLong = (car.u - wasU) * perSec - car.w * car.yawRate;
    const rawLat = (car.w - wasW) * perSec + car.u * car.yawRate;
    const rawVert = (mountUp - wasVy) * perSec;
    wasU = car.u;
    wasW = car.w;
    wasVy = mountUp;
    for (let left = dt; left > 0; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      // ...and SMOOTHED, which is the head's inertia. A body does not answer
      // a spike of load; it answers what the spike settles into. Everything
      // the car does faster than this is carried rigidly instead — and
      // carried is what a player wants, because it moves the cabin and the
      // road TOGETHER, where a head answering it moves one against the other,
      // which is what reads as the camera shaking.
      //
      // Two poles rather than one, and it matters more than the rate does. A
      // single ease steep enough to keep a rough stage's chatter out of the
      // neck is also slow enough to make the brakes take half a second to
      // reach the head, and a driver notices that immediately; a critically
      // damped follower at the same corner rejects an order of magnitude
      // more of the fast stuff while still arriving on a sustained load in a
      // third of a second. Loads are slow and chatter is not, and this is
      // the shape that can tell them apart.
      const wf = n.settle;
      loadVel.long += (wf * wf * (rawLong - load.long) - 2 * wf * loadVel.long) * h;
      loadVel.lat += (wf * wf * (rawLat - load.lat) - 2 * wf * loadVel.lat) * h;
      loadVel.vert += (wf * wf * (rawVert - load.vert) - 2 * wf * loadVel.vert) * h;
      load.long += loadVel.long * h;
      load.lat += loadVel.lat * h;
      load.vert += loadVel.vert * h;
      // The head, in the frame of the car it is being carried in: a spring
      // back toward upright, a damper, and the load pushing it the other
      // way. Nothing here knows how fast the car is going.
      const accLong =
        -n.stiffLong * n.stiffLong * lean.long -
        2 * n.dampLong * n.stiffLong * leanVel.long -
        load.long;
      const accLat =
        -n.stiffLat * n.stiffLat * lean.lat - 2 * n.dampLat * n.stiffLat * leanVel.lat - load.lat;
      const accVert =
        -n.stiffVert * n.stiffVert * lean.vert -
        2 * n.dampVert * n.stiffVert * leanVel.vert -
        load.vert;
      leanVel.long += accLong * h;
      leanVel.lat += accLat * h;
      leanVel.vert += accVert * h;
      lean.long += leanVel.long * h;
      lean.lat += leanVel.lat * h;
      lean.vert += leanVel.vert * h;
      // The ring a hit left, spent: a damped oscillator per gaze axis.
      const w2 = rig.wobble.freq * rig.wobble.freq;
      const damp = 2 * rig.wobble.damp * rig.wobble.freq;
      for (const axis of ["yaw", "pitch", "roll"] as const) {
        wobVel[axis] += (-w2 * wob[axis] - damp * wobVel[axis]) * h;
        wob[axis] += wobVel[axis] * h;
      }
    }

    // Govern how fast the head may move on the neck. A slam hands the spring
    // ten metres a second in a single step: uncapped the head crosses its
    // whole arc inside one frame, which reads as the picture glitching
    // rather than as the car landing. It is a bound on a body, so it is
    // stated as one — how fast a head goes, not how fast the car does.
    const rel = Math.hypot(leanVel.long, leanVel.lat, leanVel.vert);
    if (rel > n.maxSpeed) {
      const k = n.maxSpeed / rel;
      leanVel.long *= k;
      leanVel.lat *= k;
      leanVel.vert *= k;
    }
    // WHERE THE NECK HAS LEANED TO. The spring works in metres, which is the
    // right way to answer a load; the neck it is standing in works in
    // degrees off upright, which is the right way to bound one. So the
    // spring's displacement is read against the arc.
    //
    // `soften` is what makes the bound anatomy rather than a wall — the arc
    // is approached and never reached, at any speed, from any hit, on any
    // frame. Wound down by the player's own motion setting, the reach goes
    // to nothing and the head is simply bolted to the shell.
    const swing = n.length * Math.sin(n.leanMax) * motion;
    const offLong = soften(lean.long, swing);
    const offLat = soften(lean.lat, swing);
    const leanFwd = Math.asin(offLong / n.length);
    const leanSide = Math.asin(offLat / n.length);
    // A neck SWINGS, so leaning any direction also lowers the eye — the sag
    // off the arc. It is small (a centimetre at full lean) and it is most of
    // what separates a head from a camera sliding on rails, because it
    // couples the axes the way a body does: brake hard and the view drops as
    // well as pitching. The spine's own give is added to it, and is the only
    // part of the vertical that is not the arc.
    const sag = n.length * (1 - Math.cos(Math.hypot(leanFwd, leanSide)));
    const offUp = soften(lean.vert, n.squash * motion) - sag;
    // The spring's own state is put back inside the arc it is bounded by, so
    // the neck cannot wind up a lean it is never allowed to show and then
    // spend it later.
    lean.long = offLong;
    lean.lat = offLat;
    // ...and the lens is put at the mount, plus that lean. The shell's own
    // shake goes to it whole, where it moves the cabin and the road
    // together; only the lean moves one against the other.
    const drawX = seat.x + offLong * fwdX + offLat * rightX;
    const drawY = seat.y + offUp;
    const drawZ = seat.z + offLong * fwdZ + offLat * rightZ;

    const speed = Math.hypot(car.u, car.w);
    const slip = speed > 3 ? Math.atan2(car.w, Math.max(0.001, car.u)) : 0;
    const wantGlance = clamp(slip * rig.glance, -rig.glanceMax, rig.glanceMax);
    glance += (wantGlance - glance) * clamp(rig.glanceRate * dt, 0, 1);

    // The road's own grain, on top of everything the neck did with the big
    // motions: the surface underfoot at the pace it is passing.
    const surface = car.airborne ? 0 : GRAIN.surface[state.surface];
    const wantGrain = soften((speed / GRAIN.pace) * surface, GRAIN.paceMax);
    grain += (wantGrain - grain) * clamp(GRAIN.rate * dt, 0, 1);
    const drive = grain * rig.grain * motion;
    const phase = clock * Math.PI * 2;
    const g1 = Math.sin(phase * GRAIN.freq[0]);
    const g2 = Math.sin(phase * GRAIN.freq[1] + 1.7);
    const g3 = Math.sin(phase * GRAIN.freq[2] + 4.1);
    // Each axis takes its own mix of the three, so the eye travels on a
    // wander rather than up and down a diagonal line.
    const g4 = Math.sin(phase * GRAIN.freq[1] * 0.83 + 2.4);
    const heave = (g1 * 0.55 + g2 * 0.3 + g3 * 0.15) * GRAIN.heave * drive;
    const sway = (g4 * 0.6 + g3 * 0.4) * GRAIN.sway * drive;

    camera.position.set(drawX + sway * rightX, drawY + heave, drawZ + sway * rightZ);
    const look = yaw + glance + wob.yaw;
    // A narrow viewport buys back its horizontal field by opening the frame
    // vertically (hor+), and every degree of that lands half at the top and
    // half at the bottom. Unanswered, the bottom half fills with bodywork: a
    // portrait phone would drive looking at its own paint. Aiming up by a
    // share of the widening holds the bonnet at the same ANGLE off the nose
    // it takes in landscape, and spends the rest on road and sky.
    const widen =
      (((verticalFovFor(fov, camera.aspect, rig.vfovMax) - fov) * Math.PI) / 360) * rig.wideAim;
    // The gaze rides the body's attitude, less what a driver levels out, and
    // takes a share of the neck's own lean on top: the head is sitting on
    // the thing that leaned, so the brakes tip it forward and down and the
    // power tips it back, by a few degrees at the very most.
    const pitch =
      (car.pitch + car.pitchLoad) * rig.pitchFollow -
      rig.nod * leanFwd -
      rig.aimDown +
      widen +
      wob.pitch +
      (g2 * 0.6 + g3 * 0.4) * GRAIN.nod * drive;
    const reach = Math.cos(pitch) * AIM_REACH;
    aim.set(
      camera.position.x + Math.sin(look) * reach,
      camera.position.y + Math.sin(pitch) * AIM_REACH,
      camera.position.z + Math.cos(look) * reach,
    );
    camera.lookAt(aim);
    // Positive body roll lifts the car's RIGHT side, which tips everything
    // bolted to it — the driver included — to the left; the neck adds its own
    // tilt on top, the top of the head leading the lean. The body's roll
    // arrives through the play above: a driver's neck holds their head level
    // through the wheel track the car drops into and leans with the bank it
    // is held on, and without that separation a straight road rocks the
    // horizon every time the car wanders across the crown.
    camera.rotateZ(
      rollSlack(car.roll, dt) * rig.rollFollow -
        rig.tilt * leanSide +
        wob.roll +
        (g1 * 0.5 + g3 * 0.5) * GRAIN.tilt * drive,
    );
    return fov;
  };

  return {
    setEyes: (next) => {
      eyes = next;
      reseat();
    },
    setTuning: (next) => {
      tuning = next;
    },
    jolt: (x, y, z, speed) => {
      const len = Math.hypot(x, y, z);
      if (len < 1e-6 || speed <= 0) return;
      const rig = EYE_RIGS[seatedOn ?? "hood"];
      const motion = Math.max(0, tuning.motion);
      const push = speed * rig.jolt * motion;
      const ux = (x / len) * push;
      const uy = (y / len) * push;
      const uz = (z / len) * push;
      // Read in the car's axes, which is where the neck lives.
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const along = ux * fwdX + uz * fwdZ;
      const across = ux * fwdZ - uz * fwdX;
      // The head keeps going where the car stopped: the impulse is added to
      // its own speed on the neck and the spring spends it, which is why the
      // recovery needs no code of its own — and the arc still bounds where
      // it can get to, so the hardest shunt in the game reaches the end of a
      // neck's travel and no further.
      leanVel.long += along;
      leanVel.lat += across;
      leanVel.vert += uy;
      const w = rig.wobble;
      wobVel.yaw = clamp(wobVel.yaw + across * w.yaw * w.freq, -w.max * w.freq, w.max * w.freq);
      wobVel.pitch = clamp(
        wobVel.pitch - (along + Math.abs(uy)) * w.pitch * w.freq,
        -w.max * w.freq,
        w.max * w.freq,
      );
      wobVel.roll = clamp(wobVel.roll - across * w.roll * w.freq, -w.max * w.freq, w.max * w.freq);
    },
    reseat,
    update,
    rigOf: (view) => EYE_RIGS[view],
  };
}
