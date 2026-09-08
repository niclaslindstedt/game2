// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOTOR — the one place in the app that actually makes a device buzz.
//
// `rumble.ts` decides WHAT is felt and how big it is, DOM-free and testable;
// this is the half that touches a device, and it is deliberately the whole
// of it: two roads out, one switch, and nothing else.
//
// The two roads, and why there are two. In a browser the pulse goes to the
// Vibration API, which is a duration and nothing more — an Android motor is
// on or off. In the store app it goes over the shell seam instead
// (`shell-host.ts` → `native/src/haptics.ts`): an iOS WebView has no
// Vibration API at all, and the phone underneath it has the best haptics the
// game will ever run on, so the page describes the pulse and lets the shell
// spend it. The website is still the product — every pulse in the game is
// authored, decided and switched off in here, and the shell only plays what
// it is handed.

import { askShellRumble, shellHost } from "../shell-host.ts";
import { deviceControls } from "./input.ts";
import { createRunRumble, type Rumble, type RunRumble } from "./rumble.ts";

/** The player's switch (`Settings.rumble`), read on every pulse. */
let wanted = true;

/** Buzz for `ms`, or stop the motor outright at 0. Wrapped, because a
 * browser is allowed to refuse: a page that has not been touched yet throws
 * rather than buzzing on some engines, and a stage is not worth losing to a
 * failed buzz. */
function motor(ms: number): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* no motor, or the page has not earned one yet */
  }
}

/** Set by the options page the moment the row is moved. */
export function setRumble(on: boolean): void {
  wanted = on;
  // A slide can be running when the switch goes off, and the motor keeps a
  // pulse it has already been given: end it now rather than a tenth of a
  // second after the player asked for quiet.
  if (!on) motor(0);
}

/** Whether this device can be felt at all — which is what decides whether
 * the options page offers the row.
 *
 * The store app always can. A browser is asked TWICE, because the Vibration
 * API answers for machines that have no motor: desktop Chromium exposes
 * `navigator.vibrate` and does nothing with it, so a laptop would be offered
 * a switch that controls nothing. A device driven by touch is the honest
 * test of a device somebody is holding. */
export function canRumble(): boolean {
  if (shellHost() === "native") return true;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  return deviceControls().touch;
}

function shake(pulse: Rumble): void {
  if (!wanted) return;
  if (shellHost() === "native") {
    askShellRumble(Math.round(pulse.ms), pulse.strength);
    return;
  }
  motor(Math.round(pulse.ms));
}

/** The run's rumble, wired to this device. One per app: there is one motor
 * and one car, and the ledger inside it is what keeps them agreeing. */
export const runRumble: RunRumble = createRunRumble(shake);
