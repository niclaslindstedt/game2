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
//   THE HEAD HAS MASS. The eye is not on the mount: it rides a neck, and
//   the neck is a damped spring chasing the mount. That one model produces
//   the whole effect — the head plunges and rebounds into a rut, is thrown
//   forward under the brakes and sideways through a corner, and settles a
//   beat after the car does. The spring damps RELATIVE motion (head against
//   seat), never motion against the world: damped against the world the
//   head would trail metres behind the car at pace.
//
//   THE ROAD HAS GRAIN. Under the big motions the surface arrives as a
//   vibration the neck has already filtered, so it is applied as MOTION
//   rather than shaken into the spring — a mass on a spring at ~2 Hz answers
//   a 10 Hz road with almost nothing.
//
// And a HIT throws the head. An impact hands the neck a directional impulse
// and rings a small rotational wobble on top of it, so the picture waves and
// recovers rather than jittering: that wave is the only thing in the frame
// that says the car hit something, once the bodywork is behind the lens.
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

/** The neck, per axis. Under a sustained load the head sits `accel / stiff²`
 * off the seat: 10 m/s² of braking against 11 rad/s is 8 cm of lean, which
 * reads as somebody bracing rather than as a toy on a dashboard. Damping
 * under 1 lets it overshoot and settle, and one visible rebound off a bump
 * IS the effect; far under 0.4 it rings like a spring toy for the rest of
 * the straight. Vertical is the best damped, because vertical is the axis
 * the road feeds continuously — a neck that rings at every rut adds a second
 * bump to every bump the car actually hit. */
type Neck = {
  stiffLong: number;
  stiffLat: number;
  stiffVert: number;
  dampLong: number;
  dampLat: number;
  dampVert: number;
  /** How far the head is allowed off the mount, m. */
  limLong: number;
  limLat: number;
  limVert: number;
  /** Ceiling on how fast the head may travel relative to the car, m/s. A
   * slammed landing hands the neck ten metres a second of relative speed in
   * one step; ungoverned the head would cross its whole travel inside a
   * frame, which reads as a glitch rather than as a hit. */
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
   * picture somebody can drive out of. */
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
  /** Radians of gaze per metre the head is thrown forward and sideways —
   * braking pitches a head down as well as forward, and the neck pivots at
   * its base, so the top of the head leads a lean. */
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
  /** Scale on the road's grain, on the random impact shake, and on the
   * directional jolt a hit hands the neck. */
  grain: number;
  shake: number;
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
    neck: {
      stiffLong: 10,
      stiffLat: 9,
      stiffVert: 11.5,
      dampLong: 0.6,
      dampLat: 0.56,
      dampVert: 0.58,
      limLong: 0.14,
      limLat: 0.1,
      limVert: 0.11,
      maxSpeed: 2.4,
    },
    nod: 0.55,
    tilt: 0.6,
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
    grain: 1.15,
    shake: 0.3,
    jolt: 1.25,
    wobble: { freq: 8, damp: 0.45, yaw: 0.075, pitch: 0.06, roll: 0.095, max: 0.17 },
    rollPlay: { reach: 0.16, recover: 0.35 },
    near: 0.05,
  },
  hood: {
    fov: 64,
    fovPerSpeed: 0.42,
    fovMax: 92,
    fovRate: 5,
    yawRate: 14,
    neck: {
      stiffLong: 11,
      stiffLat: 10,
      stiffVert: 12,
      dampLong: 0.62,
      dampLat: 0.58,
      dampVert: 0.58,
      limLong: 0.12,
      limLat: 0.1,
      limVert: 0.1,
      maxSpeed: 2.4,
    },
    nod: 0.5,
    tilt: 0.5,
    rollFollow: 0.55,
    pitchFollow: 0.75,
    aimDown: 0.05,
    wideAim: 0.6,
    vfovMax: MAX_VFOV,
    glance: 0.4,
    glanceMax: 0.32,
    glanceRate: 5,
    grain: 1,
    shake: 0.4,
    jolt: 1,
    wobble: { freq: 9, damp: 0.5, yaw: 0.055, pitch: 0.05, roll: 0.07, max: 0.13 },
    rollPlay: { reach: 0.16, recover: 0.35 },
    near: 0.1,
  },
  bumper: {
    fov: 70,
    fovPerSpeed: 0.44,
    fovMax: 96,
    fovRate: 5,
    yawRate: 16,
    neck: {
      stiffLong: 16,
      stiffLat: 15,
      stiffVert: 17,
      dampLong: 0.7,
      dampLat: 0.68,
      dampVert: 0.7,
      limLong: 0.06,
      limLat: 0.05,
      limVert: 0.05,
      maxSpeed: 2.4,
    },
    nod: 0.25,
    tilt: 0.25,
    rollFollow: 0.9,
    pitchFollow: 0.95,
    aimDown: 0.012,
    wideAim: 0.35,
    vfovMax: MAX_VFOV,
    glance: 0.24,
    glanceMax: 0.22,
    glanceRate: 6,
    grain: 0.8,
    shake: 0.5,
    jolt: 0.8,
    wobble: { freq: 12, damp: 0.6, yaw: 0.03, pitch: 0.04, roll: 0.04, max: 0.09 },
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
  /** Drive the camera for one frame. `shake` is the decaying random rattle
   * camera.ts keeps for every mode. Returns the DESIGN fov (horizontal
   * reference) the shot wants, for the caller to blend and convert. */
  update: (
    view: InCarCamera,
    state: GameState,
    dt: number,
    camera: THREE.PerspectiveCamera,
    shake: number,
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
  /** The mount in the world, this frame and last — the neck needs the seat's
   * own velocity to damp against. */
  const seat = new THREE.Vector3();
  const seatWas = new THREE.Vector3();
  /** The driver's head: where it is and how fast it is going, world m. */
  const head = new THREE.Vector3();
  const headVel = new THREE.Vector3();
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
    shake: number,
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
      head.copy(seat);
      headVel.set(0, 0, 0);
      seatWas.copy(seat);
      wob.yaw = wob.pitch = wob.roll = 0;
      wobVel.yaw = wobVel.pitch = wobVel.roll = 0;
      if (seatedOn !== view) rollSlack = createSlack(rig.rollPlay);
      seatedOn = view;
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
    const n = rig.neck;
    for (let left = dt; left > 0; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      const dx = head.x - seat.x;
      const dy = head.y - seat.y;
      const dz = head.z - seat.z;
      const rvx = headVel.x - svx;
      const rvy = headVel.y - svy;
      const rvz = headVel.z - svz;
      const aLong =
        -n.stiffLong * n.stiffLong * (dx * fwdX + dz * fwdZ) -
        2 * n.dampLong * n.stiffLong * (rvx * fwdX + rvz * fwdZ);
      const aLat =
        -n.stiffLat * n.stiffLat * (dx * rightX + dz * rightZ) -
        2 * n.dampLat * n.stiffLat * (rvx * rightX + rvz * rightZ);
      const aUp = -n.stiffVert * n.stiffVert * dy - 2 * n.dampVert * n.stiffVert * rvy;
      headVel.x += (aLong * fwdX + aLat * rightX) * h;
      headVel.z += (aLong * fwdZ + aLat * rightZ) * h;
      headVel.y += aUp * h;
      head.x += headVel.x * h;
      head.y += headVel.y * h;
      head.z += headVel.z * h;
      // The ring a hit left, spent: a damped oscillator per gaze axis.
      const w2 = rig.wobble.freq * rig.wobble.freq;
      const damp = 2 * rig.wobble.damp * rig.wobble.freq;
      for (const axis of ["yaw", "pitch", "roll"] as const) {
        wobVel[axis] += (-w2 * wob[axis] - damp * wobVel[axis]) * h;
        wob[axis] += wobVel[axis] * h;
      }
    }

    // Govern the neck's own speed, then its reach. A slam hands the spring
    // ten metres a second of relative velocity in a single step: uncapped
    // the head crosses its whole travel inside one frame, which reads as the
    // picture glitching rather than as the car landing.
    let rvx = headVel.x - svx;
    let rvy = headVel.y - svy;
    let rvz = headVel.z - svz;
    const rel = Math.hypot(rvx, rvy, rvz);
    if (rel > n.maxSpeed) {
      const k = n.maxSpeed / rel;
      rvx *= k;
      rvy *= k;
      rvz *= k;
      headVel.set(svx + rvx, svy + rvy, svz + rvz);
    }
    const offLong = soften((head.x - seat.x) * fwdX + (head.z - seat.z) * fwdZ, n.limLong * motion);
    const offLat = soften(
      (head.x - seat.x) * rightX + (head.z - seat.z) * rightZ,
      n.limLat * motion,
    );
    const offUp = soften(head.y - seat.y, n.limVert * motion);
    head.set(
      seat.x + offLong * fwdX + offLat * rightX,
      seat.y + offUp,
      seat.z + offLong * fwdZ + offLat * rightZ,
    );

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

    const rattle = shake * rig.shake;
    const sx = (Math.random() - 0.5) * rattle;
    const sy = (Math.random() - 0.5) * rattle;
    camera.position.set(head.x + sx + sway * rightX, head.y + sy + heave, head.z + sway * rightZ);
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
    // nods with the head's own lean — braking tips a head down as well as
    // forward.
    const pitch =
      (car.pitch + car.pitchLoad) * rig.pitchFollow -
      rig.nod * offLong -
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
        rig.tilt * offLat +
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
      // The head keeps going where the car stopped: the impulse is added to
      // its own velocity and the neck spends it, which is why the recovery
      // needs no code of its own.
      headVel.x += ux;
      headVel.y += uy;
      headVel.z += uz;
      // ...and the same impulse, read in the car's axes, rings the gaze. A
      // hit from the side turns and rolls the head; one from ahead nods it.
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const along = ux * fwdX + uz * fwdZ;
      const across = ux * fwdZ - uz * fwdX;
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
