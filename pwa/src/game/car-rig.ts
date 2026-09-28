// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S RIG, as the game states it: which bones a modelled car carries
// (`scripts/blender/car.py`), in the ENGINE's wheel order, and the clips
// baked onto them — stated here once, handed to Blender by the driver
// (`scripts/lib/car-model-data.mjs`), and read back by the lab that plays
// them beside the code-built car (`make cars ARGS="--rig --models"`).
//
// In a race a model's wheels are not posed through its bones at all: its
// wheel geometry is poured into the code car's own wheel groups
// (`car-models.ts`), which car-mesh.ts steers, spins and hangs off the
// springs exactly as it always has. The rig is the model's own statement of
// the same motion — for the lab, and for any host that draws the glTF
// alone — so its numbers are the ones car-mesh.ts poses by, never its own.

import { TUNING, WHEEL_PARTS } from "@engine";

import { WHEEL_STEER_LOCK } from "./wheel-steer.ts";

/** Each wheel's bone, in the engine's order ([FL, FR, RL, RR], as
 * `WHEEL_PARTS` and car-mesh.ts's wheel groups run). A wheel bone runs out
 * along its axle, so a turn about it is the wheel rolling; a lift is the
 * suspension's travel, up the car. */
export const WHEEL_BONES = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"] as const;

/** The two bones the front wheels are steered about, standing up through
 * each front wheel's centre. */
export const STEER_BONES = ["steer_fl", "steer_fr"] as const;

/** THE CLIPS a model carries, each with its peak a quarter of the way in
 * and its trough three quarters: `steer` a sine lock to lock
 * (the visual lock car-mesh.ts turns a front wheel by, `WHEEL_STEER_LOCK`),
 * `travel` from full bump to full droop (a sine too, the springs'
 * own reach, the engine's `TUNING.suspension`), and `roll` one revolution of
 * every wheel, forward, at a steady rate. */
export const CAR_CLIPS = {
  steer: { seconds: 2, peak: WHEEL_STEER_LOCK, trough: -WHEEL_STEER_LOCK },
  travel: { seconds: 2, peak: TUNING.suspension.travel, trough: -TUNING.suspension.droop },
  roll: { seconds: 1, peak: Math.PI / 2, trough: (3 * Math.PI) / 2 },
} as const;

export type CarClip = keyof typeof CAR_CLIPS;

/** Where in a clip its peak and its trough land, s. */
export function clipMoments(name: CarClip): { peak: number; trough: number } {
  const s = CAR_CLIPS[name].seconds;
  return { peak: s / 4, trough: (3 * s) / 4 };
}

/** Which wheel a bone is, by the engine's part name. */
export function wheelPartOf(bone: (typeof WHEEL_BONES)[number]): (typeof WHEEL_PARTS)[number] {
  return WHEEL_PARTS[WHEEL_BONES.indexOf(bone)];
}
