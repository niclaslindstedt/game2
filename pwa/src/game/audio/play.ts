// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Playing one sound out of a bank. This is the whole runtime: a def's voices
// go to the synth verbatim, optionally scaled by the play's own shape.
//
// Nothing here interprets. A voice's fields are the synth's fields, so the
// bank can never ask for something the instrument cannot do, and a sound is
// read by reading its numbers rather than by reading this file.

import type { Synth } from "../../lib/voice.ts";

import type { PlayShape, SoundBank, SoundDef, SoundVoice } from "./types.ts";

/** The synth's own volume defaults, needed only when a shape has to scale a
 * volume the author left off. Kept in step with `lib/synth.ts` — a drift here
 * is a shaped sound at the wrong level, which nothing else would catch, so
 * `tests/audio_test.ts` pins the pair. */
const DEFAULT_VOLUME = { tone: 0.06, noise: 0.05 } as const;

/** Apply a play's shape to one authored voice. */
function shaped(voice: SoundVoice, shape: PlayShape): SoundVoice {
  const { gain = 1, pitch = 1, stretch = 1, pan } = shape;
  if (gain === 1 && pitch === 1 && stretch === 1 && pan === undefined) return voice;
  const out = { ...voice } as SoundVoice;
  out.volume = (voice.volume ?? DEFAULT_VOLUME[voice.call]) * gain;
  out.durationMs = voice.durationMs * stretch;
  if (voice.delayMs !== undefined) out.delayMs = voice.delayMs * stretch;
  if (pan !== undefined) out.pan = pan;
  if (pitch !== 1) {
    if (voice.call === "tone" && out.call === "tone") {
      out.from = voice.from * pitch;
      // A voice with no `to` glides nowhere, and must keep not gliding: giving
      // it one here would turn every shaped hit into a swoop.
      if (voice.to !== undefined) out.to = voice.to * pitch;
    }
    // The filter moves WITH the pitch, or a shaped-down sound keeps the
    // brightness of the small version of itself and reads as a big thing
    // recorded through a small speaker.
    if (voice.filter) {
      out.filter = {
        ...voice.filter,
        frequency: voice.filter.frequency * pitch,
        ...(voice.filter.to === undefined ? {} : { to: voice.filter.to * pitch }),
      };
    }
  }
  return out;
}

/** Fire a def we already hold. */
export function playDef(synth: Synth, def: SoundDef, shape?: PlayShape): void {
  for (const voice of def.voices) {
    const { call, ...options } = shape ? shaped(voice, shape) : voice;
    if (call === "noise") synth.noise(options);
    else synth.tone(options as Parameters<Synth["tone"]>[0]);
  }
}

/**
 * Fire one sound by id.
 *
 * An unknown id is silent rather than a throw: a sound is presentation, and a
 * missing one should be a quiet moment in the game, never a dropped frame in
 * the middle of a stage.
 */
export function playSound(
  synth: Synth,
  bank: SoundBank,
  id: string | undefined,
  shape?: PlayShape,
): void {
  if (!id) return;
  const def = bank[id];
  if (def) playDef(synth, def, shape);
}
