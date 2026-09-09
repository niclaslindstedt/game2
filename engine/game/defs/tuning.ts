// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Global handling tuning — the numbers that shape the FEEL, shared by every
// car (per-car numbers live in cars.ts). Grouped by what they shape: the
// grip (which is also the drift — there is no separate drift model), the
// jump (takeoff, airborne, landing), and the surfaces. Tweak here, verify
// with `npm run sim` and the drift/jump tests; the render layer never reads
// these directly.
//
// It is written one chapter to a file — `tuning-run.ts`, `tuning-drive.ts`,
// `tuning-drift.ts`, `tuning-body.ts`, `tuning-ground.ts` and the two
// halves of the collision model — so retuning one subject never opens the
// others. This is the single object they add up to, and `TUNING` is the
// only name anything outside this directory knows.

import { BODY_TUNING } from "./tuning-body.ts";
import { CONTACT_TUNING } from "./tuning-contact.ts";
import { DAMAGE_TUNING } from "./tuning-damage.ts";
import { DRIFT_TUNING } from "./tuning-drift.ts";
import { DRIVE_TUNING } from "./tuning-drive.ts";
import { GROUND_TUNING } from "./tuning-ground.ts";
import { RUN_TUNING } from "./tuning-run.ts";

export const TUNING = {
  ...RUN_TUNING,
  ...DRIVE_TUNING,
  ...DRIFT_TUNING,
  ...BODY_TUNING,
  ...GROUND_TUNING,
  collision: { ...CONTACT_TUNING, ...DAMAGE_TUNING },
} as const;
