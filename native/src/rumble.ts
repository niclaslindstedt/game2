// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PAGE'S PULSE, READ AND SIZED — every decision in the haptics bridge,
// and no effect at all.
//
// The website decides WHAT is felt (`pwa/src/game/rumble.ts`) and describes
// each pulse as a duration and a strength, because those are the two things
// a browser motor and a phone's haptic engine have between them. A phone has
// no duration to give: iOS offers a fixed vocabulary of taps and nothing
// that runs for 200 ms, so a long pulse has to be spent as a BURST of them.
// Turning one into the other is the whole job of this module.
//
// Pure, like `navigation.ts` beside it, so the root suite can hold the seam
// together without a device: the message the page posts is parsed here and
// asserted against the script that posts it (`tests/rumble_test.ts`).

/** One pulse as the page describes it: how long, and how hard, 0..1. */
export type Rumble = { ms: number; strength: number };

/** The three taps the shell spends a pulse on. Named rather than imported
 * from `expo-haptics` so this module stays free of the native side — the
 * effect half maps them onto `ImpactFeedbackStyle`. */
export type TapStyle = "light" | "medium" | "heavy";

/** A pulse as this platform can actually play it: `count` taps of `style`,
 * `gapMs` apart. */
export type Burst = { style: TapStyle; count: number; gapMs: number };

/** How far apart the taps in a burst sit, ms. Close enough to read as one
 * long event rather than three knocks, and far enough that the Taptic
 * Engine has re-armed — under about 40 ms it simply drops the second tap. */
const TAP_GAP_MS = 55;

/** How much of a pulse's duration one tap stands in for, ms — what turns a
 * length into a count. Sized so the game's own pulses land where they
 * should: a 45 ms scuff and an 18 ms shift are one tap, a 160 ms hit is two,
 * and the 260 ms crash is three. */
const MS_PER_TAP = 85;

/** The most taps one pulse is ever worth. A crash is three; anything longer
 * would still be buzzing while the car is back on its wheels. */
const MAX_TAPS = 3;

/** Where the strength bands fall, 0..1. The light band is deliberately wide:
 * the drift and the gearbox both live in it, and both are meant to be felt
 * without being noticed. */
const MEDIUM_FROM = 0.45;
const HEAVY_FROM = 0.72;

/** The message the injected bridge posts, as JSON. */
type Message = { sf?: unknown; ms?: unknown; strength?: unknown };

/** The kind field the bridge stamps on its messages — the WebView's channel
 * carries anything the page cares to post, so a rumble says so. */
export const RUMBLE_KIND = "rumble";

/**
 * A `WebView` message, if it is a rumble the shell should play.
 *
 * Everything that is not one — another bridge's message later, a stray
 * `postMessage` from the page, a truncated payload — comes back null rather
 * than throwing: a message channel that can crash the shell is a message
 * channel that can crash the game.
 */
export function parseRumble(raw: string): Rumble | null {
  let message: Message;
  try {
    message = JSON.parse(raw) as Message;
  } catch {
    return null;
  }
  if (!message || message.sf !== RUMBLE_KIND) return null;
  const { ms, strength } = message;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  if (typeof strength !== "number" || !Number.isFinite(strength)) return null;
  return { ms, strength: Math.min(1, Math.max(0, strength)) };
}

/** How to play one pulse on a device that has taps rather than a motor.
 *
 * The COUNT comes from the duration, because that is what duration means on
 * hardware with none: a 45 ms scuff is one tap and a 260 ms crash is three,
 * so the difference between them is felt as length even though no single tap
 * is longer than another. The STYLE comes from the strength, which is the
 * axis the phone actually has and the browser does not. */
export function rumbleBurst(pulse: Rumble): Burst {
  const style: TapStyle =
    pulse.strength >= HEAVY_FROM ? "heavy" : pulse.strength >= MEDIUM_FROM ? "medium" : "light";
  const count = Math.min(MAX_TAPS, Math.max(1, Math.round(pulse.ms / MS_PER_TAP)));
  return { style, count, gapMs: TAP_GAP_MS };
}
