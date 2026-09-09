// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE THREE PLACES A DRIVER'S HEAD CAN BE, as data: the bumper on the
// ground, the hood over the nose, and the cockpit behind the wheel. Each
// row says how the neck carries the head — how much of the body's pitch,
// roll and heave reaches it, how much it leads a corner, and how hard the
// road shakes it — and the rig is the whole difference between the three
// views. `camera-eye.ts` drives them.

import { MAX_VFOV } from "../lib/fov.ts";
import type { EyeRig, InCarCamera } from "./camera-eye.ts";

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
    // The NARROWEST frame on the ladder, and it is what makes the seat a
    // seat. A wide lens from in here spends its extra degrees on headliner,
    // door card and the far pillar, and the windscreen shrinks to a
    // letterbox in the middle of a room; a long one fills the frame with the
    // screen, its pillars just inside the edges and the mirror hanging into
    // the top of it, which is where a driver's own eye has them — and it
    // puts the glass, and whatever the stage has thrown on it, right up
    // against the lens. Still wide enough at pace that a pillar stays in
    // each corner: crop those away and it is a hood cam with a dashboard.
    fov: 50,
    fovPerSpeed: 0.28,
    fovMax: 64,
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
    fov: 54,
    fovPerSpeed: 0.42,
    fovMax: 82,
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
    fov: 60,
    fovPerSpeed: 0.44,
    fovMax: 86,
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
