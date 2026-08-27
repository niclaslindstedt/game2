// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's single audio surface: ONE underlying synth (one AudioContext)
// shared by the effects and the music, wrapped into two volume-scaled views so
// the options screen can mix them independently. Unlocking on any user gesture
// unlocks everything, because there is only ever one context to unlock.
//
// Two views rather than two synths is not a saving, it is the requirement: a
// browser gives a page one usable AudioContext's worth of goodwill, and the
// echo bus and the master limiter only do their jobs if every voice in the
// game — a tyre grain, a crash, a bass note — passes through the same pair.

import { createSynth } from "../../lib/synth.ts";
import type { Synth } from "../../lib/voice.ts";

const raw = createSynth();

let sfxVolume = 1;
let musicVolume = 1;

/** Clamp to the 0–1 the sliders promise. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Set the 0–1 master volumes (called by the options screen). */
export function setAudioVolumes(v: { music: number; sfx: number }): void {
  musicVolume = clamp01(v.music);
  sfxVolume = clamp01(v.sfx);
}

/** The music volume right now — read by the music player so a theme asked for
 * while the slider is at zero never starts a scheduler nobody can hear. */
export function musicLevel(): number {
  return musicVolume;
}

/**
 * A synth view whose every sound is scaled by a live master volume.
 *
 * The defaults mirror the synth's own, because a voice that leaves `volume`
 * off still has to be scaled by the slider — and the only way to scale a
 * default is to know it. A scaled-to-nothing voice is skipped outright rather
 * than played at zero: an engine bed is a dozen nodes a second, and a muted
 * game should not be building them.
 */
function scaledView(volume: () => number): Synth {
  return {
    unlock: () => raw.unlock(),
    autostart: () => raw.autostart(),
    resume: () => raw.resume(),
    now: () => raw.now(),
    tone(options) {
      const scaled = (options.volume ?? 0.06) * volume();
      if (scaled < 0.001) return;
      raw.tone({ ...options, volume: scaled });
    },
    noise(options) {
      const scaled = (options.volume ?? 0.05) * volume();
      if (scaled < 0.001) return;
      raw.noise({ ...options, volume: scaled });
    },
  };
}

/** Every sound effect routes through this view. */
export const sfx: Synth = scaledView(() => sfxVolume);

/** The music sequencer routes through this one. */
export const music: Synth = scaledView(() => musicVolume);

/** Start (or revive) audio from a real user gesture. Safe to call on every
 * pointer down — it is a no-op once the context is running. */
export function unlockAudio(): void {
  raw.unlock();
}
