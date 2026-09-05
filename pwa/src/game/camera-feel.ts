// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE OUTSIDE CAMERA CONVEYS OF THE CAR — the frame as an instrument.
//
// A chase camera is the one thing a player is looking at for the whole
// stage, and nearly everything it does is FRAMING: where the car sits, how
// much road is left over it. This module is the part that is not framing.
// Three readings off the car are folded into the picture, each small enough
// that a player who is not looking for it never notices and a player who is
// can drive on it:
//
//   GRIP AS HEIGHT. The camera stands at its rig's own height while the car
//   is standing on its full weight on the surface the rig was tuned for, and
//   HOVERS UP as the grip goes — a car gone light over a brow, a car
//   skittering after a landing, a car on sand — up to the top of its travel
//   when there is no grip at all, which is flying. Somewhere the tires are
//   holding harder than that reference (a sealed road under a car on the
//   right tires) it settles a little below. The read is the cue a good
//   driver already has in the seat of their pants: the picture lifts, the
//   car is light, this is not the moment to turn in.
//
//   ATTITUDE AS TILT. The frame takes a share of what the car's own body
//   does. It pitches BACK a degree or two up a climb and forward down a
//   drop, nods with the dive under the brakes and the squat on the power,
//   and BANKS into a turn — leaning into a right-hander the way a rider
//   does, a touch for a gripped corner and more for a slide, because the
//   slide is where the grip has left one side of the car. Every angle here
//   is a degree or two: the horizon must never read as the game rolling the
//   world, only as the picture having weight.
//
//   SPEED AS A TREMOR. Past the pace a car reaches on its own, the lens
//   starts to tremble — a gentle buzz that grows with speed, so that a car
//   pouring off a cliff and gaining on gravity to three hundred is FELT to
//   be doing it. Below the onset there is nothing: pace inside the car's
//   own gears is the fov's job (`fovPerSpeed` in the rigs) and this is not
//   allowed to fight it.
//
// Plain arithmetic, no three.js and no DOM, so the tests read the numbers
// without standing up a renderer. Every number lives in CAMERA_FEEL; the
// rigs (CHASE_RIGS in camera.ts) only scale them.

import { surfaceGripFor, tyreLoad, type CarState, type GameState } from "@engine";

import { clamp } from "../lib/angles.ts";

const DEG = Math.PI / 180;

/** The knobs. Master dials first: 0 turns a whole reading off, so "less of
 * all of it" is one number and never a sweep through a table. */
export const CAMERA_FEEL = {
  /** GRIP AS HEIGHT. The reference is a car standing on its full weight on
   * GRAVEL (`TUNING.surfaces.grip` is quoted against it) with this car's own
   * loose-surface tires — that reads as 1, and the rig's `hover` is what the
   * camera rises by at 0. */
  grip: {
    master: 1,
    /** How much of the grip a FULL slide is read as spending, 0..1. A drift
     * is not flying — the tires are still redirecting the car — but it is
     * the car being asked for more than it has, and the picture lifting a
     * little through the slide is part of how the slide reads as a risk. */
    slideCost: 0.3,
    /** How far BELOW the rig's height the camera may settle when the car
     * has MORE than its reference grip, as a share of the rig's `hover`.
     * Bounded because the rig's height is a framing decision: a sealed road
     * may lower the picture a little, never bury it in the roof. */
    sink: 0.35,
    /** How briskly the reading is followed, 1/s — losing grip shows at once
     * (it is a warning), getting it back a beat later, so a landing's
     * skitter is seen to settle rather than snapped away. */
    rise: 5,
    settle: 3,
  },

  /** ATTITUDE AS TILT. Degrees, all of them. */
  tilt: {
    master: 1,
    /** Share of the road's own pitch the frame takes — a 10° climb at 0.2
     * tips the shot 2° back; a drop tips it the same forward. The rest of
     * the slope stays in the framing (the rig's `aimClimb` lifts the aim so
     * the brow shows); this is the camera's own ATTITUDE, on top. */
    slope: 0.2,
    /** ...and its ceiling either way, deg. */
    slopeMax: 2.5,
    /** Share of the BODY's load pitch — the dive under the brakes, the
     * squat on the power (`CarState.pitchLoad`), a few degrees at most. */
    dive: 0.5,
    /** Bank INTO a slide, deg per rad of slip angle: 3 puts a 30° drift at
     * about 1.6°. Positive leans the frame into the turn — the horizon's
     * right end rises through a right-hander, the way a rider leans; a
     * negative value leans out of it, like a car body on its springs. */
    drift: 3,
    /** Bank into a gripped turn, deg per g of lateral acceleration. Subtler
     * than the slide's: a turn is a thing the car is doing, a slide is a
     * thing being done to it. Same sign convention. */
    turn: 0.6,
    /** The most bank the shot ever takes, deg — a spin has yaw rates that
     * would otherwise roll the horizon. */
    bankMax: 2.5,
    /** How briskly the tilts are followed, 1/s. */
    rate: 6,
  },

  /** SPEED AS A TREMOR. */
  speed: {
    master: 1,
    /** Where the tremor starts, m/s, and where it is at full strength. The
     * onset sits just past the top of the fastest car's top gear, so a run
     * on the power never buzzes and a fall off a cliff does — 47 m/s is
     * ~170 km/h, 83 is 300. It grows as the SQUARE of the way between, so
     * the first of it is felt long before it is seen. */
    from: 47,
    full: 83,
    /** How far the lens travels at full, m, and how far the gaze wanders,
     * rad — the nod is what makes the WORLD tremble rather than just the
     * car in front of the lens (a few centimetres moves what is close; a
     * few thousandths of a radian moves the horizon). Both are scaled by
     * the rig's own `shake`, which is distance doing its own damping. */
    travel: 0.025,
    nod: 0.003,
    /** The oscillators, Hz — incommensurate so the buzz never settles into
     * a hum, and under 8 for the reason camera-shake.ts gives: past that a
     * 30 fps phone resolves its own sampling instead of the wave. Offset
     * from the rattle's three so a landing at pace is two textures. */
    freq: [4.3, 5.9, 7.3],
  },
};

/** THE GRIP READING, 0..~1.5: 0 with no wheel on the ground, 1 for a car
 * standing on its whole weight on gravel, over 1 where the tires are holding
 * harder than that. What the handling model actually spends
 * (`surfaceGripFor · tyreLoad`, car.ts) quoted against the reference, less
 * the share a slide is read as costing. */
export function gripReading(state: GameState): number {
  const car = state.car;
  if (car.airborne) return 0;
  const reference = surfaceGripFor(state.spec, "gravel");
  const surface = reference > 0 ? surfaceGripFor(state.spec, state.surface) / reference : 1;
  const sliding = 1 - CAMERA_FEEL.grip.slideCost * clamp(car.slide, 0, 1);
  return tyreLoad(car) * surface * sliding;
}

/** How far a grip reading stands the camera off its rig's height, m —
 * `hover` at no grip, 0 at the reference, and a bounded dip below it. */
export function hoverFor(grip: number, hover: number): number {
  const G = CAMERA_FEEL.grip;
  return clamp((1 - grip) * hover, -G.sink * hover, hover) * G.master;
}

/** The bank the car is asking the frame for, rad — positive leans into a
 * right-hander. The turn's share is lateral acceleration (a yaw rate on its
 * own is a car spinning in a car park); the slide's is the slip angle, which
 * runs NEGATIVE through a right-hand drift because the car is yawed further
 * right than it is travelling, so it is taken off. Both are scaled by how
 * much of the car is on the ground: a body in the air has no side with more
 * grip than the other. */
export function bankWanted(car: CarState): number {
  const T = CAMERA_FEEL.tilt;
  const latG = (car.u * car.yawRate) / 9.81;
  const slip = Math.abs(car.u) > 3 ? car.slip : 0;
  const deg = clamp(latG * T.turn - slip * T.drift, -T.bankMax, T.bankMax);
  const grounded = car.airborne ? 0 : clamp(tyreLoad(car), 0, 1);
  return deg * DEG * grounded * T.master;
}

/** The pitch the car is asking the frame for, rad — positive tips the shot
 * BACK, which is a climb (`grade` is rise over run, the camera's own eased
 * reading of the hill) and the body squatting on the power. */
export function pitchWanted(grade: number, car: CarState): number {
  const T = CAMERA_FEEL.tilt;
  const slope = clamp(Math.atan(grade) * T.slope, -T.slopeMax * DEG, T.slopeMax * DEG);
  return (slope + car.pitchLoad * T.dive) * T.master;
}

/** How much of the tremor a speed is worth, 0..1. */
export function tremorAmount(speed: number): number {
  const S = CAMERA_FEEL.speed;
  const t = clamp((speed - S.from) / Math.max(1, S.full - S.from), 0, 1);
  return t * t * S.master;
}

/** Where the tremor has the lens and the gaze at time `t`. Each axis takes
 * its own mix of the three oscillators, so the lens wanders instead of
 * sliding along one diagonal — the same arrangement as the rattle a blow
 * leaves (camera-shake.ts), on its own frequencies. `scale` is the rig's. */
export function tremorAt(
  t: number,
  amount: number,
  scale: number,
): { x: number; y: number; nod: number; tilt: number } {
  if (amount <= 0) return { x: 0, y: 0, nod: 0, tilt: 0 };
  const S = CAMERA_FEEL.speed;
  const w = t * Math.PI * 2;
  const a = Math.sin(w * S.freq[0] + 0.9);
  const b = Math.sin(w * S.freq[1] + 3.3);
  const c = Math.sin(w * S.freq[2] + 5.1);
  const reach = S.travel * amount * scale;
  const gaze = S.nod * amount * scale;
  return {
    x: (a * 0.5 + c * 0.5) * reach,
    y: (b * 0.7 + a * 0.3) * reach,
    nod: (c * 0.6 + b * 0.4) * gaze,
    tilt: (a * 0.6 - b * 0.4) * gaze,
  };
}

/** What one frame of feel comes to, for the rig to apply: metres of lift
 * over its height, radians of bank (positive into a right-hander) and pitch
 * (positive back), and the tremor's own offsets. */
export type FeelFrame = {
  lift: number;
  bank: number;
  pitch: number;
  x: number;
  y: number;
};

/** The eased readings an outside rig carries from frame to frame. */
export type CameraFeel = {
  /** Stand the readings on the car as it is now, with no time in it — for a
   * rig that has been picked up and put down somewhere else. */
  drop: (state: GameState) => void;
  /** One frame. `grade` is the rig's eased rise-over-run of the hill,
   * `hover` and `shake` the rig's own scales, `t` the camera's clock. */
  step: (
    state: GameState,
    grade: number,
    hover: number,
    shake: number,
    t: number,
    dt: number,
  ) => FeelFrame;
};

export function createCameraFeel(): CameraFeel {
  let grip = 1;
  let bank = 0;
  let pitch = 0;
  return {
    drop: (state) => {
      grip = gripReading(state);
      bank = 0;
      pitch = 0;
    },
    step: (state, grade, hover, shake, t, dt) => {
      const car = state.car;
      const want = gripReading(state);
      const rate = want < grip ? CAMERA_FEEL.grip.rise : CAMERA_FEEL.grip.settle;
      grip += (want - grip) * clamp(rate * dt, 0, 1);
      const ease = clamp(CAMERA_FEEL.tilt.rate * dt, 0, 1);
      bank += (bankWanted(car) - bank) * ease;
      pitch += (pitchWanted(grade, car) - pitch) * ease;
      const speed = Math.hypot(car.u, car.w, car.vy);
      const tremor = tremorAt(t, tremorAmount(speed), shake);
      return {
        lift: hoverFor(grip, hover),
        bank: bank + tremor.tilt,
        pitch: pitch + tremor.nod,
        x: tremor.x,
        y: tremor.y,
      };
    },
  };
}
