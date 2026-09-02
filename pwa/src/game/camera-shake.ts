// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BLOW DOES TO THE PICTURE — the camera's half of being hit, and the
// one place the size of it is written down.
//
// A hit happens to the CAR. The body drops onto its springs, the nose dips,
// a kerb rolls it onto two wheels, and every one of those is drawn: the
// engine loads `ride`, `pitchLoad` and `rollRate` at the contact
// (engine/game/collision.ts) and car-mesh.ts puts the shell where they say.
// That is the car shaking, and it is what a player outside the car should be
// watching. A camera stood five metres behind it is not attached to any of
// that — a boom does not feel a cone — so when the picture ITSELF jumps, the
// hit stops reading as something that happened to the car and starts reading
// as something that happened to the game.
//
// So the outside rigs take a blow through `outside` below, which is ZERO for
// running into things, and the in-car rigs take it through `inCar`, which is
// all of it: behind the wheel there is a head on a neck and the whole of what
// says the car hit something is that the head keeps going (camera-eye.ts's
// directional jolt — never this rattle, which is a lens on a mount).
//
// What is left for the outside rigs — a landing, a ford, a respawn — is a
// WAVE with a decaying envelope rather than a fresh random offset per frame.
// White noise at the amplitude a blow deserves is not a rougher shot, it is a
// broken one: the picture is thrown somewhere different every frame with no
// shape between the throws, which is the same failure GRAIN (camera-eye.ts)
// and SHAKE (car-shake.ts) are both arranged around, and at 30 fps it aliases
// into a slow lurch that has nothing to do with the impact.
//
// Plain arithmetic, no three.js and no DOM, so the tests can read the numbers
// without standing up a renderer.

/** What KIND of blow the camera was handed. The camera does not care how
 * hard — that is the strength — it cares whose fault it is:
 *
 *   contact — the car ran into something: a tree, a boulder, a kerb block,
 *             another car. The car takes this one on its own springs.
 *   landing — the whole car came down at once, on all four wheels or its
 *             belly. Nothing was hit; the ground arrived.
 *   water   — a ford taken at pace, or a car going into a lake.
 *   reset   — the run being put back on the road after a respawn. */
export type ShakeSource = "contact" | "landing" | "water" | "reset";

/** How hard a blow moves the CAMERA, per family and per source. */
export const CAMERA_SHAKE = {
  /** One dial over every camera shake in the game — the outside rattle and
   * the in-car jolt alike. Here so that "less shake, all of it" is one
   * number rather than a sweep through two tables. */
  master: 1,

  /** Share of a blow the OUTSIDE rigs take as a rattle, 0..1.
   *
   * `contact` is 0 and that is the whole point of this module: a camera on a
   * boom did not hit the tree. The car did, and the car is in frame doing
   * it. The other three are things that happen to the car as a WHOLE, where
   * the ground meeting the car and the shot both belong to the same moment —
   * a landing that leaves the picture perfectly still reads as the car being
   * set down by hand — so they keep a share, sized to be felt rather than
   * read. */
  outside: { contact: 0, landing: 0.55, water: 0.45, reset: 0.5 },

  /** ...and the share the IN-CAR rigs take, as the directional jolt that
   * throws the driver's head. All of it, every time: this is the only thing
   * in a cockpit frame that says the car hit something, and a head thrown at
   * the corner that took the blow is a description of the hit rather than a
   * rattle on top of it. */
  inCar: { contact: 1, landing: 1, water: 1, reset: 1 },

  /** How far the lens travels at a full blow, m. The blow scale saturates at
   * `ceiling` and each rig scales it again (`shake` in CHASE_RIGS), so the
   * most the chase camera ever moves is about a tenth of this — a couple of
   * centimetres at five metres of standoff, which is a shudder in the frame
   * and not a lost apex. */
  travel: 0.14,

  /** The three oscillators, Hz, deliberately incommensurate so a blow never
   * settles into a hum. The ceiling is the slowest frame rate the game is
   * played at, not how sharp a jolt would be nice: much past 8 Hz a 30 fps
   * phone stops resolving the wave and starts resolving its own sampling.
   * Same reasoning, and the same ceiling, as GRAIN in camera-eye.ts. */
  freq: [4.7, 6.1, 7.7],

  /** The most blow the shot can be carrying at once, 0..1 — two hits in a
   * second are worse than one, but not twice as bad. */
  ceiling: 0.8,

  /** How the envelope comes down: a proportional term (1/s), so a big blow
   * loses more per second than a small one, and a linear drain (per second)
   * that takes the tail to actual zero instead of leaving the picture
   * trembling forever. */
  fade: 6,
  drain: 0.4,

  /** Master on the share of the body's own suspension travel an outside rig
   * rides (`heave` in CHASE_RIGS). Not part of a blow at all — it is on every
   * frame, and it is the other way the camera moves when the car runs over
   * something, because a contact loads the same springs a landing does and
   * nothing can tell one 1.9 Hz spring answer from the other.
   *
   * It is turned down rather than off. At zero a landing happens entirely to
   * the car and the shot around it is glass, which reads as the car having
   * been set down by hand — and the whole travel is under a tenth of a metre
   * to begin with, so this was never the loud half of the problem. */
  heave: 0.7,

  /** How much relative head speed a unit of blow is worth to the neck, m/s.
   * The blow scale runs 0..~0.9 over everything from a kerb to a head-on
   * shunt and the neck's travel is a tenth of a metre: this is what turns one
   * into the other, and the per-rig `jolt` scales it again. */
  jolt: 5,
} as const;

/** What a blow of `strength` from `source` is worth to a camera stood outside
 * the car — 0 for anything the car ran into. */
export function outsideBlow(strength: number, source: ShakeSource): number {
  return strength * CAMERA_SHAKE.master * CAMERA_SHAKE.outside[source];
}

/** ...and what it is worth to the head behind the wheel, as m/s of impulse
 * along the direction the blow came from. */
export function inCarBlow(strength: number, source: ShakeSource): number {
  return strength * CAMERA_SHAKE.master * CAMERA_SHAKE.inCar[source] * CAMERA_SHAKE.jolt;
}

/** Take one frame off a shot's blow envelope. */
export function fadeShake(shake: number, dt: number): number {
  return Math.max(0, shake - CAMERA_SHAKE.fade * dt * shake - CAMERA_SHAKE.drain * dt);
}

/** Where the rattle has the lens at time `t`, in metres. `phase` is redrawn
 * per blow so two hits in a row are not the same wobble twice; each axis
 * takes its own mix of the three oscillators, so the lens wanders instead of
 * sliding up and down one diagonal. */
export function rattleAt(t: number, amount: number, phase: number): { x: number; y: number } {
  if (amount <= 0) return { x: 0, y: 0 };
  const w = t * Math.PI * 2;
  const a = Math.sin(w * CAMERA_SHAKE.freq[0] + phase);
  const b = Math.sin(w * CAMERA_SHAKE.freq[1] + phase * 1.7 + 2.1);
  const c = Math.sin(w * CAMERA_SHAKE.freq[2] + phase * 0.6 + 4.3);
  const reach = CAMERA_SHAKE.travel * amount;
  return { x: (a * 0.6 + c * 0.4) * reach, y: (b * 0.7 + c * 0.3) * reach };
}
