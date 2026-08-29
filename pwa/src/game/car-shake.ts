// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR SHAKING ON ITS MOUNTS — what an engine being worked does to the
// body sat on top of it.
//
// A car standing still with the throttle open is doing something, and until
// now the only place it showed was the needle and the noise. This is the
// third: the shell trembles, a few millimetres, and the picture stops being
// a parked model with a soundtrack. It is at its strongest exactly where
// there is nothing else moving — on the grid, and off the line with the
// wheels lit — and it is gone by the time the car has any pace, because a
// moving car has the road's own grain (camera-eye.ts) doing this job
// better.
//
// Presentation only, and deliberately so: nothing here reaches the engine,
// the physics never sees a millimetre of it, and a frame that does not draw
// it is not a frame that plays differently.
//
// Plain arithmetic, no three.js and no DOM.

/** How hard the body trembles, and how fast. */
export const SHAKE = {
  /** Revs below which the engine is merely running, 0..1. A car ticking
   * over does not shake; one being held against the limiter does. */
  from: 0.55,
  /** Road speed the tremble has faded out by, m/s. Low: this is the
   * standing car's effect. Past it the springs have real work to do and the
   * road's grain is what the body is answering. */
  calm: 14,
  /** The three oscillators, Hz, deliberately incommensurate so the tremble
   * never settles into a hum. The ceiling is not chosen for how a real
   * engine shakes — it is the slowest frame rate the game is played at. Much
   * past 8 Hz a 30 fps phone stops resolving the wave and starts resolving
   * its own sampling, which is a rougher PICTURE rather than a rougher
   * idle. Same reasoning, and the same ceiling, as GRAIN in camera-eye.ts. */
  freq: [4.3, 6.7, 8.1],
  /** How far the body moves at a full tremble, m. Six millimetres: enough
   * that the reflections crawl and the shut lines stir, not enough to read
   * as a bump. */
  heave: 0.006,
  /** ...and how far it rocks about the two horizontal axes, rad. An engine
   * rocks a car across its length more than along it, so the roll is the
   * bigger of the two. */
  roll: 0.0035,
  pitch: 0.002,
} as const;

/** How hard the car is trembling right now, 0..1 — the revs, less whatever
 * road speed there is to drown them out. `rev` carries the wheelspin in it
 * (the engine reads it back through the gearing), so an axle lit up off the
 * line shakes the body hardest of all: maximum revs, no road speed, and the
 * one moment the player most needs telling that the tyres are not gripping. */
export function revTremble(rev: number, u: number): number {
  const revved = Math.min(1, Math.max(0, (rev - SHAKE.from) / (1 - SHAKE.from)));
  const still = Math.min(1, Math.max(0, 1 - Math.abs(u) / SHAKE.calm));
  return revved * still;
}

/** Where the tremble has the body at time `t`, in metres and radians.
 * Each axis takes its own mix of the three oscillators, so the shell
 * wanders rather than travelling up and down one diagonal. */
export function trembleAt(
  t: number,
  amount: number,
): { heave: number; roll: number; pitch: number } {
  const phase = t * Math.PI * 2;
  const a = Math.sin(phase * SHAKE.freq[0]);
  const b = Math.sin(phase * SHAKE.freq[1] + 1.3);
  const c = Math.sin(phase * SHAKE.freq[2] + 3.9);
  return {
    heave: (a * 0.5 + c * 0.5) * SHAKE.heave * amount,
    roll: (b * 0.7 + c * 0.3) * SHAKE.roll * amount,
    pitch: (a * 0.6 + b * 0.4) * SHAKE.pitch * amount,
  };
}
