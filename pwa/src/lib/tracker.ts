// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The music sequencer: a tracker module played on the SFX synth (synth.ts).
//
// A score is pure data, shaped like a tracker module:
//   - `instruments`: named patches (wave, envelope, filter, vibrato, pan…)
//   - `patterns`:    named sections, each mapping a voice to note tokens on a
//                    fixed sixteenth-note grid
//   - `order`:       the arrangement — pattern names in play order
// The whole arrangement loops, so a two-minute track with verse / chorus /
// breakdown sections is `order: ["intro", "a", "b", "a", …]` over a handful of
// composed patterns. Nothing is recorded; the app ships no audio files.
//
// Playback is the classic two-clock scheduler: a coarse JS interval books
// notes a beat ahead on the sample-accurate AudioContext clock, so the groove
// never drifts with the frame rate.
//
// THE ONE THING THIS INSTRUMENT DOES THAT A CHIP TRACKER CANNOT: a patch can
// HOLD. Every synth voice decays exponentially across its length, so a whole
// note written as sixteen ties is a pluck with a long tail rather than a pad —
// which is why chip scores are all arpeggios and re-struck ostinatos. `hold`
// keeps a note at its peak for a fraction of its length first, so a pad is a
// pad, a string line swells and sits, and a bass can actually hold a root
// under a chorus. It is the difference between a SNES cue and a PlayStation
// one, and it costs one automation event per note.

import type { FilterOptions, NoiseColor, Synth, VibratoOptions, WaveType } from "./voice.ts";

/** A named patch: how one voice sounds, independent of what it plays. */
export type Instrument = {
  /** Oscillator for pitched voices; "noise" makes every hit a noise burst
   * (shape it with `filter` — highpass ≈ hats, bandpass ≈ snares). */
  wave: WaveType | "noise";
  volume: number;
  /** Note length as a fraction of its step span; 1 fills the step exactly,
   * smaller is pluckier. Default 0.9. */
  gate?: number;
  /** Volume ramp-up in ms — pads and strings swell, plucks snap. */
  attackMs?: number;
  /**
   * Hold the note at its peak for this fraction of its gated length before the
   * decay, 0..1. THE PAD KNOB: without it every note falls to a ten-thousandth
   * of its peak across its own length, so a held chord is a pluck. 0.5–0.8 is
   * a sustained voice; 0 is the classic decaying one.
   */
  hold?: number;
  /** Detuned dual-oscillator chorus width in cents. */
  detuneCents?: number;
  vibrato?: VibratoOptions;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  /** 0–1 send into the synth's shared echo bus. */
  echo?: number;
  filter?: FilterOptions;
  /** Spectral tilt for a `wave: "noise"` patch — brown for a floor tom, white
   * for a hat. Ignored by pitched voices. */
  color?: NoiseColor;
  /** Waveshaper grit, 0–1. A driven sawtooth is a distorted guitar; a driven
   * triangle is a growling bass. */
  drive?: number;
  /** End-pitch multiplier — every note glides to `pitch × slide`. 0.25 on a
   * triangle makes a kick drum; slight values make toms and drops. */
  slide?: number;
};

/**
 * One pattern (a section of the score): voice name → step tokens. A token is a
 * note name ("A4", "C#3"), "." for a rest, "=" to tie (sustain the previous
 * note through this step), or any other word (conventionally "x") to trigger a
 * noise voice. Voices with fewer steps than the pattern's longest voice cycle
 * within the pattern — a one-bar drum line loops under an eight-bar lead — so
 * their length must divide the pattern length. Voices a pattern omits stay
 * silent through it.
 */
export type Pattern = Record<string, string[]>;

export type Track = {
  bpm: number;
  /** Grid resolution: steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
  instruments: Record<string, Instrument>;
  patterns: Record<string, Pattern>;
  /** Arrangement: pattern names in play order; the whole list loops. */
  order: string[];
};

export type TrackPlayer = {
  /** Start looping `track`, replacing whatever was playing. */
  play: (track: Track) => void;
  stop: () => void;
  /** Halt the scheduler without forgetting the track or losing the play
   * position — `resume()` picks the arrangement back up where it left off. */
  pause: () => void;
  /** Re-arm the scheduler after a `pause()`; a no-op when not paused. */
  resume: () => void;
  playing: () => boolean;
};

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

/** "A4" → 440; equal temperament from A4. Throws on junk so a typo in a score
 * surfaces the first time it plays rather than as a silent rest. Flats do not
 * exist in this grammar: E♭ is `D#`. */
export function noteFrequency(name: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`unparseable note "${name}"`);
  const semitone = NOTE_INDEX[match[1] as string] as number;
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Split bar strings ("A2 . = G2") into step tokens; the bars concatenate.
 * This is how a pattern is written — one string per bar, so a miscount is
 * visible on the page rather than hidden in a flat list. */
export function bars(...lines: string[]): string[] {
  return lines.flatMap((line) => line.trim().split(/\s+/));
}

/** A score compiled for playback: every voice expanded to one flat token
 * stream covering the whole arrangement. */
export type FlatTrack = {
  totalSteps: number;
  voices: { instrument: Instrument; tokens: string[] }[];
};

/** How long one loop of `track` lasts, in seconds. What a score is judged
 * against: a theme written to the wrong length is one the player never hears
 * the back half of. */
export function trackSeconds(track: Track): number {
  return (flattenTrack(track).totalSteps * 60) / track.bpm / track.stepsPerBeat;
}

/** Expand patterns through `order` into per-voice flat token streams. Throws
 * on unknown pattern/instrument names and non-dividing voice lengths, so an
 * arrangement typo fails a test instead of playing garbage. */
export function flattenTrack(track: Track): FlatTrack {
  const names = Object.keys(track.instruments);
  const streams = new Map<string, string[]>(names.map((n) => [n, []]));

  for (const patternName of track.order) {
    const pattern = track.patterns[patternName];
    if (!pattern) throw new Error(`unknown pattern "${patternName}" in order`);
    const lengths = Object.values(pattern).map((tokens) => tokens.length);
    const patternSteps = Math.max(...lengths, 0);
    if (patternSteps === 0) throw new Error(`pattern "${patternName}" is empty`);

    for (const voice of Object.keys(pattern)) {
      if (!track.instruments[voice]) {
        throw new Error(`pattern "${patternName}" uses unknown instrument "${voice}"`);
      }
    }
    for (const name of names) {
      const stream = streams.get(name) as string[];
      const line = pattern[name];
      if (!line) {
        for (let i = 0; i < patternSteps; i++) stream.push(".");
        continue;
      }
      if (patternSteps % line.length !== 0) {
        throw new Error(
          `pattern "${patternName}" voice "${name}": ${line.length} steps ` +
            `does not divide the pattern length ${patternSteps}`,
        );
      }
      for (let i = 0; i < patternSteps; i++) stream.push(line[i % line.length] as string);
    }
  }

  const totalSteps = streams.size ? (streams.values().next().value as string[]).length : 0;
  return {
    totalSteps,
    voices: names.map((name) => ({
      instrument: track.instruments[name] as Instrument,
      tokens: streams.get(name) as string[],
    })),
  };
}

const LOOKAHEAD_S = 0.28; // how far ahead notes are booked
const TICK_MS = 90; // how often the JS clock checks in

export function createTrackPlayer(synth: Synth): TrackPlayer {
  let interval: ReturnType<typeof setInterval> | null = null;
  let flat: FlatTrack | null = null;
  let bpm = 0;
  let stepsPerBeat = 0;
  let stepIndex = 0;
  let nextStepTime = 0;

  /** Book every voice's note that starts on step `index` at time `at`. */
  const scheduleStep = (t: FlatTrack, index: number, at: number): void => {
    const stepS = 60 / bpm / stepsPerBeat;
    for (const { instrument, tokens } of t.voices) {
      const token = tokens[index % tokens.length];
      if (!token || token === "." || token === "=") continue;

      // The note sustains through following "=" ties.
      let steps = 1;
      while (tokens[(index + steps) % tokens.length] === "=" && steps < tokens.length) steps++;
      const durationMs = steps * stepS * 1000 * (instrument.gate ?? 0.9);
      // A hold is written as a fraction so one patch reads the same under a
      // sixteenth and under a whole note — the pad holds most of whatever it
      // is given rather than a fixed number of milliseconds of it.
      const holdMs = durationMs * (instrument.hold ?? 0);

      if (instrument.wave === "noise") {
        synth.noise({
          durationMs,
          volume: instrument.volume,
          at,
          color: instrument.color,
          filter: instrument.filter,
          attackMs: instrument.attackMs,
          holdMs,
          pan: instrument.pan,
          echo: instrument.echo,
        });
      } else {
        const pitch = noteFrequency(token);
        synth.tone({
          type: instrument.wave,
          from: pitch,
          to: pitch * (instrument.slide ?? 1),
          durationMs,
          volume: instrument.volume,
          at,
          attackMs: instrument.attackMs,
          holdMs,
          detuneCents: instrument.detuneCents,
          vibrato: instrument.vibrato,
          pan: instrument.pan,
          echo: instrument.echo,
          filter: instrument.filter,
          drive: instrument.drive,
        });
      }
    }
  };

  const tick = (): void => {
    if (!flat) return;
    const now = synth.now();
    if (now === null) {
      // The context fell out of "running" — a browser/OS suspend or an iOS
      // interruption. Nudge it here every tick rather than waiting on a user
      // gesture that may never come, so the music self-heals. `resume` is
      // async, so we still bail and pick up on a later tick once it lands.
      synth.resume();
      return;
    }
    // (Re)anchor after unlock, a stall, or a clock that jumped BACKWARDS — a
    // rebuilt AudioContext (the iOS zombie recovery) starts its clock near
    // zero, stranding the old nextStepTime unreachably far ahead. Legitimate
    // scheduling never books past now + LOOKAHEAD_S + one step, so anything
    // two seconds out is a stale clock rather than a plan.
    //
    // ANY lateness counts, not just a catastrophic one: a step booked in the
    // past does not wait its turn, it sounds the moment it is handed over. A
    // scheduler that crawls back up from behind one step at a time therefore
    // empties its whole backlog into a single instant — half a bar as one
    // chord — where re-anchoring costs nothing but a beat arriving late.
    if (nextStepTime === 0 || nextStepTime < now || nextStepTime > now + 2) {
      nextStepTime = now + 0.05;
    }
    const stepS = 60 / bpm / stepsPerBeat;
    while (nextStepTime < now + LOOKAHEAD_S) {
      scheduleStep(flat, stepIndex, nextStepTime);
      stepIndex = (stepIndex + 1) % flat.totalSteps;
      nextStepTime += stepS;
    }
  };

  return {
    play(next) {
      flat = flattenTrack(next);
      bpm = next.bpm;
      stepsPerBeat = next.stepsPerBeat;
      stepIndex = 0;
      nextStepTime = 0;
      interval ??= setInterval(tick, TICK_MS);
      tick();
    },

    stop() {
      flat = null;
      stepIndex = 0;
      nextStepTime = 0;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    },

    pause() {
      // Keep `flat`, `stepIndex` and `bpm` — only the scheduler stops. The
      // stale `nextStepTime` is re-anchored to the live clock on resume (the
      // tick's stall guard), so the arrangement continues from this step.
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    },

    resume() {
      if (flat === null || interval !== null) return; // nothing paused
      interval = setInterval(tick, TICK_MS);
      tick();
    },

    playing() {
      return flat !== null;
    },
  };
}
