// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a sound IS in this game: a list of synth voices fired together.
//
// Its own module because four unrelated things need the shape — the bank, the
// player, the interface's own small bank, and the audition tool — and none of
// them should have to import the others to describe it.

import type { NoiseOptions, ToneOptions } from "../../lib/voice.ts";

/** One voice of a sound. `call` picks which synth method fires it; the rest is
 * that method's own options, exactly as the synth declares them — so the bank
 * cannot drift from what the instrument can be told to do. */
export type SoundVoice = ({ call: "tone" } & ToneOptions) | ({ call: "noise" } & NoiseOptions);

/** One sound: the voices that make it, and a sentence saying what it is meant
 * to feel like. The description is not decoration — it is what the next person
 * retuning the numbers checks their work against. */
export type SoundDef = {
  description: string;
  voices: SoundVoice[];
};

/** A bank of sounds, by id. */
export type SoundBank = Record<string, SoundDef>;

/**
 * How one PLAY of a sound differs from the authored one.
 *
 * The bank is static data, and almost everything in a rally stage is not: an
 * impact at 4 m/s and one at 30 m/s are the same EVENT and nothing like the
 * same noise. Rather than author a def per intensity — or push the whole sound
 * back into code — a play may scale what the author wrote. Three axes, because
 * they are the three the ear reads as "bigger": louder, lower, and (through
 * the same multiplier) darker.
 */
export type PlayShape = {
  /** Multiply every voice's volume. */
  gain?: number;
  /** Multiply every pitch and every filter frequency. Below 1 is bigger and
   * heavier — a large thing resonates low — above 1 is smaller and tinnier. */
  pitch?: number;
  /** Multiply every duration. A big hit rings longer than a small one. */
  stretch?: number;
  /** Stereo placement, -1..1, replacing whatever the author set. */
  pan?: number;
};
