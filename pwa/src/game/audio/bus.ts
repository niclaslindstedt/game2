// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's single audio surface: ONE underlying synth (one AudioContext)
// shared by the effects and the music, wrapped into two volume-scaled views so
// the options screen can mix them independently. Unlocking on any user gesture
// unlocks everything, because there is only ever one context to unlock.
//
// Two views rather than two synths is not a saving, it is the requirement: a
// browser gives a page one usable AudioContext's worth of goodwill, and the
// echo bus and the master limiter only do their jobs if every voice in the
// game — a tyre layer, a crash, a bass note — passes through the same pair.

import { createSynth } from "@niclaslindstedt/oss-game-framework/audio/synth";
import type { Synth } from "@niclaslindstedt/oss-game-framework/audio/voice";
import { clamp01, scaledView } from "@niclaslindstedt/oss-game-framework/audio/view";

import { ROOM } from "./room.ts";

/** The one synth, in THIS game's room (room.ts). */
const raw = createSynth(ROOM);

let sfxVolume = 1;
let musicVolume = 1;

/** Set the 0–1 master volumes (called by the options screen). */
export function setAudioVolumes(v: { music: number; sfx: number }): void {
  musicVolume = clamp01(v.music);
  sfxVolume = clamp01(v.sfx);
}

/** Every sound effect routes through this view — a fader over the one synth
 * (the framework's `scaledView`: a one-shot scaled to nothing is skipped, a
 * layer re-reads the fader every frame). */
export const sfx: Synth = scaledView(raw, () => sfxVolume);

/** The music sequencer routes through this one. */
export const music: Synth = scaledView(raw, () => musicVolume);

/** Start (or revive) audio from a real user gesture. Safe to call on every
 * pointer down — it is a no-op once the context is running. */
export function unlockAudio(): void {
  raw.unlock();
}
