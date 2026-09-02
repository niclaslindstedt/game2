// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A VOICE IS — the parameter shapes every sound in the game is written
// in, and the interface the instrument that plays them presents.
//
// Split from the instrument itself (`synth.ts`) because these types are read
// by code that must stay DOM-FREE: the sound bank, the event router, the beds,
// the sequencer and the tests over all of them describe sounds without ever
// making one, and the moment any of them reaches for `synth.ts` it drags
// `AudioContext` into a build that has no browser in it.
//
// So: this file is the vocabulary, `synth.ts` is the only thing that can
// pronounce it.
//
// TWO KINDS OF VOICE, and the split is the whole design of the audio:
//
//   * A ONE-SHOT (`tone`, `noise`) starts, does its envelope and stops. A
//     hit, a note, a click. Everything in the banks and the scores.
//   * A LAYER (`layer`) never stops. It is a node graph that stays built for
//     the whole run and is STEERED — its pitch, its level, its cutoff are
//     moved on the audio thread with smoothed parameter automation. The
//     engine, the tyres, the wind, the weather and the ambience are all
//     layers. Nothing about a layer depends on the frame rate: a stalled
//     main thread leaves it holding its last value, never with a hole in it.

export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

/** How a noise buffer is coloured. White is flat (hiss, grit, sizzle); pink
 * falls 3 dB an octave (tyre roar, rain, spray); brown falls 6 (rumble,
 * distant weight, the body of an impact). */
export type NoiseColor = "white" | "pink" | "brown";

export type FilterType = "lowpass" | "highpass" | "bandpass";

export type FilterOptions = {
  type: FilterType;
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
   * `delayMs`. The sequencer uses this for drift-free scheduling. */
  at?: number;
  /** Volume ramp-up time; 0 (the default) is a hard onset. */
  attackMs?: number;
  /**
   * Hold the peak this long before the decay starts — the SUSTAIN.
   *
   * Every tone is otherwise attack-then-decay: the level falls exponentially
   * across the WHOLE remaining duration, a tenth of the peak a quarter of the
   * way in. That is right for a blip, a hit or a plucked note, and it is why a
   * longer `durationMs` makes a sound ring on rather than sustain. A pad, a
   * swell or a crowd wants a hold. Clamped so the decay always has the last
   * moment of the note to happen in.
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
   * stacking a sawtooth on top. It is a SOFT saturation at every setting —
   * 0.2–0.4 is warmth, 0.6 is an overdriven amp, 1 is as far as it goes and
   * still a curve rather than a clip. A hard clip folds every harmonic in
   * at once and aliases, and over a Bluetooth codec that reads as a torn
   * speaker rather than as an engine.
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
  /** Hold the peak this long before the decay — see `ToneOptions.holdMs`. */
  holdMs?: number;
  /** Stereo position, -1 to 1. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
};

/**
 * WHAT A LAYER IS MADE OF — decided once, when it is built. Everything that
 * cannot be automated smoothly lives here: which oscillator or which colour
 * of noise, the filter's TYPE and resonance, the saturation curve, the
 * chorus width. Everything that moves is a `LayerTarget`.
 */
export type LayerSpec = {
  kind: "tone" | "noise";
  /** A pitched layer's oscillator. */
  type?: WaveType;
  /** A noise layer's colour. */
  color?: NoiseColor;
  /** A pitched layer plays a detuned pair this wide, cents. */
  detuneCents?: number;
  /** The saturation curve a pitched layer is folded through; how HARD it is
   * pushed into that curve is `LayerTarget.grit`, which is smooth. */
  drive?: number;
  /** The filter's type and resonance; its cutoff is `LayerTarget.cutoff`.
   * No filter when omitted. */
  filter?: { type: FilterType; q?: number };
  vibrato?: VibratoOptions;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
};

/** Where a layer is being steered to. Every field is reached over the glide
 * the caller names, on the audio thread, so a frame that arrives late leaves
 * the layer holding rather than stepping. */
export type LayerTarget = {
  /** Linear level, on the same scale as a one-shot's `volume`. 0 is silence
   * and costs nothing — the node graph stays but renders quiet. */
  level: number;
  /** A pitched layer's frequency, Hz. */
  hz?: number;
  /** The filter's cutoff, Hz. Held under Nyquist like every other cutoff. */
  cutoff?: number;
  /** How hard a driven layer is pushed into its curve, 0..1. */
  grit?: number;
  /** Stereo position, -1..1. */
  pan?: number;
};

/** A layer once it exists. */
export type Layer = {
  /** Steer the layer. `glideS` is the time constant every parameter moves
   * on — a few hundredths for a pitch, a tenth or two for a level. */
  set: (target: LayerTarget, glideS: number) => void;
  /** Tear the node graph down. The layer is dead afterwards. */
  stop: () => void;
  /** False once the audio context that made it is gone — the owner builds a
   * fresh one on the next frame. */
  alive: () => boolean;
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
  /** Build a continuous voice, silent until steered. Null while the context
   * is locked or unavailable — try again next frame. */
  layer: (spec: LayerSpec) => Layer | null;
  /** The AudioContext clock in seconds, or null while locked/unavailable.
   * Absolute `at` times are measured on this clock. */
  now: () => number | null;
};

// ── The envelope ─────────────────────────────────────────────────────────

/**
 * THE SHORTEST ONSET A VOICE MAY HAVE, ms — and the reason the music does not
 * tick.
 *
 * A gain that jumps from nothing to full scale between two samples is a step,
 * and a step is broadband: what the ear gets is a CLICK sitting on top of the
 * note, loudest in the treble because that is where a step's energy is. Worse,
 * a step is also what makes a resonant filter RING at its own cutoff — so on a
 * hi-hat (a few milliseconds of noise highpassed at 6 kHz, several a second
 * under a score) the ring IS the sound the player hears, and it reads as a
 * broken speaker rather than as a cymbal.
 *
 * A millisecond and a half of ramp is far below the ~10 ms the ear resolves as
 * an attack, so nothing is softened and every percussive voice keeps its snap;
 * it is purely the discontinuity that goes. It is only ever a FLOOR — a voice
 * that asked for a real attack keeps its own — and it is bounded by the
 * voice's own length, so a two-millisecond tick is still a tick.
 */
export const MIN_ATTACK_MS = 1.5;

/**
 * THE HIGHEST CUTOFF A FILTER MAY BE ASKED FOR, as a fraction of the sample
 * rate — and the reason a hi-hat does not scream on a phone.
 *
 * A biquad's coefficients are computed from its cutoff divided by Nyquist
 * (half the sample rate). At or past 1 that maths is degenerate and what comes
 * out is not a filter: WebKit hands back a loud, harsh burst, once per note.
 *
 * The catch is that the sample rate is NOT a constant. A desktop context runs
 * at 44.1 or 48 kHz, where nothing this game authors comes close. iOS picks
 * the rate from the live audio ROUTE, and a Bluetooth headset in hands-free
 * mode drops the whole session to 16 kHz — Nyquist 8000. That is a fault
 * nobody can hear on a laptop, that arrives several times a second, and that
 * sounds exactly like a broken speaker.
 *
 * 0.45 rather than 0.5 because a biquad sitting exactly on Nyquist is still
 * numerically nasty; a tenth of an octave of headroom costs nothing anywhere.
 */
export const MAX_CUTOFF_RATIO = 0.45;

/** The cutoff a filter actually gets on a context running at `sampleRate`:
 * what it asked for, held inside the band that rate can represent. */
export function safeCutoff(hz: number, sampleRate: number): number {
  const ceiling = sampleRate * MAX_CUTOFF_RATIO;
  return Math.min(Math.max(20, hz), ceiling);
}

/**
 * THE SATURATION CURVE, as arithmetic — so a test can read how hard a drive
 * actually folds a waveform without a browser.
 *
 * `tanh` rather than a hard clip: a hard clip folds every harmonic in at once
 * and aliases, and over a Bluetooth codec that reads as a torn speaker. The
 * steepness runs 1 (nearly linear) to 10 (a fully driven amp) — deliberately
 * NOT exponential in the drive, because a curve steep enough to be a square
 * wave at half travel leaves the top half of the knob doing nothing but
 * adding hash.
 */
export function shaperSteepness(drive: number): number {
  return 1 + 9 * Math.min(1, Math.max(0, drive));
}

/** How hot an oscillator is pushed into the curve for a given drive. A
 * curve does nothing to a signal that never reaches its knee; the gain in
 * front of it is what "drive" is. */
export function shaperPush(drive: number): number {
  return 1 + 3 * Math.min(1, Math.max(0, drive));
}

/** One point on a gain curve: where it is going, when it gets there, and how
 * it travels — an immediate jump, or a ramp of one of the two shapes. */
export type EnvelopeStep = { at: number; value: number; ramp: "set" | "exp" | "lin" };

/**
 * THE GAIN CURVE OF ONE VOICE, as data — attack, hold, decay — so the shape a
 * sound has can be read (and tested) without a browser in the room.
 *
 * `decay` is the difference between the two shapes the instrument plays. An
 * EXPONENTIAL fall is a voice with a tail: a note, a swell, anything that has
 * to sit under something else. A LINEAR one falls evenly across its whole
 * length and is a HIT — a stick, a hat, a stone off the floorpan.
 */
export function envelopeShape(
  peak: number,
  t0: number,
  t1: number,
  attackMs: number,
  holdMs: number,
  decay: "exp" | "lin",
): EnvelopeStep[] {
  const durationMs = (t1 - t0) * 1000;
  // An exponential ramp may not touch zero — WebAudio throws rather than
  // silently flooring it — and a voice CAN legitimately arrive at zero: a
  // muted track in the audition page is a patch whose volume is 0. The floor
  // is far below anything audible, so a voice that lands on it is silence
  // either way; what it buys is that no caller has to know the rule.
  const floor = decay === "exp" ? 0.0001 : 0;
  const top = decay === "exp" ? Math.max(1e-5, peak) : peak;
  const rise = Math.min(Math.max(attackMs, MIN_ATTACK_MS), durationMs * 0.5) / 1000;
  const level = t0 + rise;
  const steps: EnvelopeStep[] = [
    { at: t0, value: floor, ramp: "set" },
    { at: level, value: top, ramp: decay === "exp" ? "exp" : "lin" },
  ];
  // THE HOLD NEEDS ITS OWN EVENT TO EXIST AT ALL: a ramp starts from the time
  // of the PREVIOUS automation point, so without this the decay below would
  // begin at the top of the attack and the voice would fall through the
  // sustain rather than sitting on it. A hair of the duration is always left
  // for the decay itself.
  if (holdMs > 0) {
    const decayFrom = Math.min(level + holdMs / 1000, t1 - 0.005);
    if (decayFrom > level) steps.push({ at: decayFrom, value: top, ramp: "set" });
  }
  steps.push({ at: t1, value: floor, ramp: decay });
  return steps;
}
