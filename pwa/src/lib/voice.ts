// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A VOICE IS — the parameter shapes every sound in the game is written
// in, and the interface the instrument that plays them presents.
//
// Split from the instrument itself (`synth.ts`) because these types are read
// by code that must stay DOM-FREE: the sound bank, the event router, the road
// bed, the sequencer and the tests over all of them describe sounds without
// ever making one, and the moment any of them reaches for `synth.ts` it drags
// `AudioContext` into a build that has no browser in it.
//
// So: this file is the vocabulary, `synth.ts` is the only thing that can
// pronounce it.

export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

/** How a noise buffer is coloured. White is flat (hiss, grit, sizzle); pink
 * falls 3 dB an octave (tyre roar, rain, spray); brown falls 6 (rumble,
 * distant weight, the body of an impact). */
export type NoiseColor = "white" | "pink" | "brown";

export type FilterOptions = {
  type: "lowpass" | "highpass" | "bandpass";
  /** Cutoff/center frequency in Hz at the start of the sound. */
  frequency: number;
  /** Sweep the cutoff to this Hz across the sound's length — the gesture the
   * static version cannot make. Defaults to `frequency` (no sweep). */
  to?: number;
  /** Resonance; WebAudio default (~1) when omitted. Past ~6 the filter starts
   * to sing at its own cutoff, which is a whistle rather than a colour. */
  q?: number;
};

export type VibratoOptions = {
  /** LFO rate in Hz (5–7 reads as a singer, 2–3 as a wobble). */
  rateHz: number;
  /** Peak pitch deviation in cents. */
  depthCents: number;
  /** Fade the vibrato in after this long. */
  delayMs?: number;
};

export type ToneOptions = {
  type?: WaveType;
  /** Start frequency in Hz. */
  from: number;
  /** End frequency (exponential glide); defaults to `from`. */
  to?: number;
  durationMs: number;
  volume?: number;
  /** Schedule the sound this far in the future (for little arrangements). */
  delayMs?: number;
  /** Absolute AudioContext start time in seconds (see `now()`); overrides
   * `delayMs`. Sequencers and beds use this for drift-free scheduling. */
  at?: number;
  /** Volume ramp-up time; 0 (the default) is a hard onset. */
  attackMs?: number;
  /**
   * Hold the peak this long before the decay starts — the SUSTAIN.
   *
   * Every tone is otherwise attack-then-decay: the level falls exponentially
   * across the WHOLE remaining duration, a tenth of the peak a quarter of the
   * way in. That is right for a blip, a hit or a plucked note, and it is why a
   * longer `durationMs` makes a sound ring on rather than sustain.
   *
   * A hold is what a BED needs — an engine, a wind, a scrub, anything made of
   * overlapping grains rather than of events. With the peak held, grains fired
   * a fraction of a hold apart tile into a level, continuous sound; without
   * one they sum into a pulse at the cadence, however fast that cadence is.
   * Clamped so the decay always has the last moment of the note to happen in.
   */
  holdMs?: number;
  /** Layer a second oscillator detuned by ± this many cents — the cheap
   * chorus that makes one waveform sound like a mass of something. */
  detuneCents?: number;
  vibrato?: VibratoOptions;
  /** Stereo position, -1 (left) to 1 (right); 0 = center. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
  filter?: FilterOptions;
  /**
   * Waveshaper drive, 0 (clean) to 1 (hard). What turns a smooth oscillator
   * into something with combustion behind it: the shaper adds odd harmonics,
   * so a driven triangle gains the buzz a chip voice can only fake by
   * stacking a sawtooth on top. 0.2–0.4 is grit; past 0.7 it is a fuzz pedal.
   */
  drive?: number;
};

export type NoiseOptions = {
  durationMs: number;
  volume?: number;
  delayMs?: number;
  /** Absolute AudioContext start time in seconds; overrides `delayMs`. */
  at?: number;
  /** Spectral tilt of the source. See `NoiseColor` — this is the field that
   * decides whether a sound is a hiss, a roar or a rumble, before any filter
   * touches it. Defaults to white. */
  color?: NoiseColor;
  /** Shape it further: highpass ≈ sizzle, lowpass ≈ thump, bandpass ≈ a
   * material. `filter.to` sweeps, which is what a whoosh is made of. */
  filter?: FilterOptions;
  /** Ramp up over this long instead of starting at full level. */
  attackMs?: number;
  /** Hold the peak this long before the decay — see `ToneOptions.holdMs`. A
   * noise BED needs one for exactly the same reason a pitched one does. */
  holdMs?: number;
  /** Stereo position, -1 to 1. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
};

export type Synth = {
  /** Create/resume the AudioContext. Call from a user gesture handler. */
  unlock: () => void;
  /** Start audio with NO user gesture behind it — but ONLY where the browser
   * says that is allowed (`navigator.getAutoplayPolicy`: a browser grants it
   * to an origin the player already engages with). Anywhere that cannot
   * answer the question it is a deliberate no-op rather than a guess: a
   * context built outside a gesture lands in a state iOS Safari will not
   * resume, so the caller keeps waiting for a real one. */
  autostart: () => void;
  /** Resume an already-created context that fell out of "running" (a
   * browser/OS suspend or an iOS interruption). Unlike `unlock` it never
   * creates a context, so it is safe to call from a timer or a browser event
   * outside a user gesture — a no-op while still locked, and a no-op while
   * the page is backgrounded, where the silence is deliberate. */
  resume: () => void;
  tone: (options: ToneOptions) => void;
  noise: (options: NoiseOptions) => void;
  /** The AudioContext clock in seconds, or null while locked/unavailable.
   * Absolute `at` times are measured on this clock. */
  now: () => number | null;
};
