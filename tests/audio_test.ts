// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUDIO GUARDS — the faults in this subsystem that are invisible without
// a test, because every one of them is a SILENCE rather than a crash.
//
// Four kinds, and each has bitten a game that shipped without the guard:
//
//   * A SCORE THAT WILL NOT PLAY. A mistyped note, a pattern named in the
//     order that nobody wrote, a voice whose bar count does not divide its
//     pattern — all of them throw the first time the sequencer reaches that
//     bar, which is forty seconds into a stage on a player's machine.
//   * AN EVENT NOTHING ANSWERS. A new `GameEvent` arrives and simply makes no
//     noise; nothing anywhere reports it.
//   * A MIX THAT CREEPS. Every retune nudges one sound up to be heard over
//     the last one, and six months later the whole bank is at full scale and
//     the limiter is doing all the work.
//   * A BED WITH HOLES IN IT. The engine is one-shot grains overlapping, so a
//     cadence that drifts past the grain's own life is a stutter — audible
//     instantly, and impossible to see in a diff.
//
// No DOM: the synth is replaced with a recorder, which is also the only way
// to assert what a sound actually asked the instrument for.

import { describe, expect, it } from "vitest";

import { TUNING, createGame, step, type GameEvent } from "@engine";

import { RUN_BANK } from "../pwa/src/game/audio/bank.ts";
import { createDriveBed } from "../pwa/src/game/audio/drive-bed.ts";
import { playRoadGrain, type RoadVoice } from "../pwa/src/game/audio/road-grain.ts";
import { GRAIN_MS, noteHz, rpmAt } from "../pwa/src/game/audio/engine-bed.ts";
import { playDef } from "../pwa/src/game/audio/play.ts";
import { soundForEvent } from "../pwa/src/game/audio/route.ts";
import { UI_BANK } from "../pwa/src/game/audio/bank-ui.ts";
import { MENU_TRACK } from "../pwa/src/game/audio/scores/menu.ts";
import { TAIGA_TRACK } from "../pwa/src/game/audio/scores/taiga.ts";
import type { SoundBank } from "../pwa/src/game/audio/types.ts";
import { flattenTrack, noteFrequency, trackSeconds } from "../pwa/src/lib/tracker.ts";
import type { NoiseOptions, Synth, ToneOptions } from "../pwa/src/lib/voice.ts";

/** A synth that plays nothing and remembers everything, with a clock the test
 * drives by hand. */
function recorder(): Synth & {
  tones: ToneOptions[];
  noises: NoiseOptions[];
  clock: number;
} {
  const rec = {
    tones: [] as ToneOptions[],
    noises: [] as NoiseOptions[],
    clock: 0,
    unlock: () => {},
    autostart: () => {},
    resume: () => {},
    now: () => rec.clock,
    tone: (o: ToneOptions) => void rec.tones.push(o),
    noise: (o: NoiseOptions) => void rec.noises.push(o),
  };
  return rec;
}

const BANKS: [string, SoundBank][] = [
  ["run", RUN_BANK],
  ["ui", UI_BANK],
];

describe("the sound bank", () => {
  it("gives every sound a description and at least one voice", () => {
    for (const [name, bank] of BANKS) {
      for (const [id, def] of Object.entries(bank)) {
        expect(def.voices.length, `${name}/${id} has no voices`).toBeGreaterThan(0);
        // The description is what the next person retuning the numbers checks
        // their work against; a sound without one is a wall of magic numbers.
        expect(def.description.length, `${name}/${id} has no description`).toBeGreaterThan(40);
      }
    }
  });

  it("keeps every voice inside the mixing budget", () => {
    // The ceiling is the biggest crash in the game. Nothing may exceed it, and
    // anything that reaches it should be a once-a-run moment — this is the
    // guard against the slow creep where each retune is a little louder than
    // the last until the limiter is the mix.
    for (const [name, bank] of BANKS) {
      for (const [id, def] of Object.entries(bank)) {
        for (const voice of def.voices) {
          const volume = voice.volume ?? 0;
          expect(volume, `${name}/${id} voice is louder than the crash`).toBeLessThanOrEqual(0.1);
          expect(voice.durationMs, `${name}/${id} voice has no length`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps the interface quieter than the car", () => {
    // A menu click is heard hundreds of times a session and a crash a handful.
    // If they are the same size, the interface is what the game sounds like.
    const loudest = (bank: SoundBank): number =>
      Math.max(...Object.values(bank).flatMap((d) => d.voices.map((v) => v.volume ?? 0)));
    expect(loudest(UI_BANK)).toBeLessThan(loudest(RUN_BANK));
  });
});

describe("event routing", () => {
  /** Every shape a `GameEvent` can take, one of each. Written out rather than
   * derived, because the point is to notice when the union grows. */
  const EVERY_EVENT: GameEvent[] = [
    { type: "go" },
    { type: "takeoff", vy: 6 },
    { type: "landing", airTime: 1.2, clean: true },
    { type: "landing", airTime: 1.2, clean: false },
    { type: "splash", speed: 12, deep: false },
    { type: "splash", speed: 24, deep: true },
    { type: "shift", gear: 3 },
    { type: "boostStart" },
    { type: "boostEmpty" },
    { type: "offRoad", off: true },
    { type: "offRoad", off: false },
    { type: "impact", speed: 4, angle: 0, belly: false },
    { type: "impact", speed: 10, angle: 1, belly: false },
    { type: "impact", speed: 24, angle: 2, belly: true },
    { type: "partBreak", part: "bumperF" },
    { type: "crash" },
    { type: "sink" },
    { type: "respawn" },
    { type: "lap", lap: 1, time: 62, best: true },
    { type: "lap", lap: 2, time: 64, best: false },
    { type: "finish", time: 120 },
  ];

  it("answers every event with a sound the bank actually holds", () => {
    for (const event of EVERY_EVENT) {
      const hit = soundForEvent(event, 0);
      expect(hit, `${event.type} makes no sound`).not.toBeNull();
      expect(
        RUN_BANK[(hit as { id: string }).id],
        `${event.type} names a missing sound`,
      ).toBeTruthy();
    }
  });

  it("picks the shift direction off the gear it came from", () => {
    expect(soundForEvent({ type: "shift", gear: 3 }, 2)?.id).toBe("shift_up");
    expect(soundForEvent({ type: "shift", gear: 2 }, 3)?.id).toBe("shift_down");
  });

  it("climbs the impact ladder with closing speed", () => {
    const ids = [4, 10, 24].map(
      (speed) => soundForEvent({ type: "impact", speed, angle: 0, belly: false }, 0)?.id,
    );
    expect(ids).toEqual(["impact_scuff", "impact_hit", "impact_crunch"]);
  });

  it("takes a car going under an octave below a ford crossed at the same pace", () => {
    // The two are one bank sound at two sizes, and the size is the whole
    // difference between water the car drives through and water it does
    // not come out of.
    const ford = soundForEvent({ type: "splash", speed: 18, deep: false }, 0);
    const lake = soundForEvent({ type: "splash", speed: 18, deep: true }, 0);
    expect(lake?.id).toBe(ford?.id);
    expect(lake?.shape?.gain ?? 1).toBeGreaterThan(ford?.shape?.gain ?? 1);
    expect(lake?.shape?.pitch ?? 1).toBeLessThan(ford?.shape?.pitch ?? 1);
    expect(lake?.shape?.stretch ?? 1).toBeGreaterThan(ford?.shape?.stretch ?? 1);
  });

  it("makes a bigger landing louder and lower", () => {
    const hop = soundForEvent({ type: "landing", airTime: 0.4, clean: true }, 0);
    const flight = soundForEvent({ type: "landing", airTime: 2.5, clean: true }, 0);
    expect(flight?.shape?.gain ?? 0).toBeGreaterThan(hop?.shape?.gain ?? 0);
    expect(flight?.shape?.pitch ?? 1).toBeLessThan(hop?.shape?.pitch ?? 1);
  });
});

describe("shaping a play", () => {
  it("scales the volume a voice left off the synth's own default", () => {
    // `play.ts` copies the synth's defaults so it can scale a volume the
    // author never wrote. If the two drift, a shaped sound plays at the wrong
    // level and nothing else in the codebase would notice.
    const rec = recorder();
    playDef(
      rec,
      { description: "x".repeat(50), voices: [{ call: "tone", from: 100, durationMs: 10 }] },
      { gain: 0.5 },
    );
    expect(rec.tones[0].volume).toBeCloseTo(0.06 * 0.5, 6);
    rec.tones.length = 0;
    playDef(
      rec,
      { description: "x".repeat(50), voices: [{ call: "noise", durationMs: 10 }] },
      { gain: 0.5 },
    );
    expect(rec.noises[0].volume).toBeCloseTo(0.05 * 0.5, 6);
  });

  it("moves the filter with the pitch, and leaves a still voice still", () => {
    const rec = recorder();
    playDef(
      rec,
      {
        description: "x".repeat(50),
        voices: [
          {
            call: "tone",
            from: 400,
            durationMs: 100,
            filter: { type: "lowpass", frequency: 1000, to: 2000 },
          },
        ],
      },
      { pitch: 0.5 },
    );
    const tone = rec.tones[0];
    expect(tone.from).toBe(200);
    // No authored glide, so no glide after shaping — otherwise every scaled
    // hit turns into a swoop.
    expect(tone.to).toBeUndefined();
    expect(tone.filter?.frequency).toBe(500);
    expect(tone.filter?.to).toBe(1000);
  });
});

describe("the scores", () => {
  const SCORES: [string, typeof MENU_TRACK][] = [
    ["menu", MENU_TRACK],
    ["taiga", TAIGA_TRACK],
  ];

  it("flattens, with every note token a note", () => {
    for (const [name, track] of SCORES) {
      const flat = flattenTrack(track);
      expect(flat.totalSteps, name).toBeGreaterThan(0);
      for (const { instrument, tokens } of flat.voices) {
        if (instrument.wave === "noise") continue; // any word triggers a burst
        for (const token of tokens) {
          if (token === "." || token === "=") continue;
          expect(() => noteFrequency(token), `${name}: ${token}`).not.toThrow();
        }
      }
    }
  });

  it("runs long enough to be a loop and short enough to come round", () => {
    // A theme the player hears the whole of before the first corner is a
    // jingle; one that never repeats a section is not an arrangement.
    for (const [name, track] of SCORES) {
      const seconds = trackSeconds(track);
      expect(seconds, `${name} is too short`).toBeGreaterThan(70);
      expect(seconds, `${name} is too long`).toBeLessThan(150);
      expect(
        Object.keys(track.patterns).length,
        `${name} has too few sections`,
      ).toBeGreaterThanOrEqual(4);
      expect(track.order.length, `${name} repeats nothing`).toBeGreaterThan(
        Object.keys(track.patterns).length,
      );
    }
  });

  it("keeps the music under the sound effects", () => {
    // The score plays continuously under an engine; it is the bed, not the
    // event. Nothing in it may be as loud as an ordinary contact.
    for (const [name, track] of SCORES) {
      for (const [voice, instrument] of Object.entries(track.instruments)) {
        expect(instrument.volume, `${name}/${voice}`).toBeLessThanOrEqual(0.06);
      }
    }
  });

  it("gives each score a real pad — something that holds", () => {
    // The whole difference between this and a chip score. A track whose every
    // voice decays from the moment it starts has no bed in it, whatever the
    // note data says.
    for (const [name, track] of SCORES) {
      const holds = Object.values(track.instruments).filter((i) => (i.hold ?? 0) >= 0.8);
      expect(holds.length, `${name} has no sustaining voice`).toBeGreaterThan(0);
    }
  });

  it("refuses an arrangement that names a pattern nobody wrote", () => {
    expect(() => flattenTrack({ ...MENU_TRACK, order: ["nope"] })).toThrow(/unknown pattern/);
  });
});

describe("the sequencer", () => {
  it("reads notes as equal temperament from A4", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440, 6);
    expect(noteFrequency("A5")).toBeCloseTo(880, 6);
    expect(noteFrequency("C4")).toBeCloseTo(261.6256, 3);
    expect(() => noteFrequency("Db4")).toThrow(); // flats do not exist here
  });

  it("cycles a short voice line inside a longer pattern", () => {
    const flat = flattenTrack({
      bpm: 120,
      stepsPerBeat: 4,
      instruments: { a: { wave: "square", volume: 0.01 }, b: { wave: "square", volume: 0.01 } },
      patterns: { p: { a: ["C4", ".", ".", "."], b: ["C4", "."] } },
      order: ["p"],
    });
    expect(flat.totalSteps).toBe(4);
    expect(flat.voices[1].tokens).toEqual(["C4", ".", "C4", "."]);
  });

  it("refuses a voice whose length does not divide its pattern", () => {
    expect(() =>
      flattenTrack({
        bpm: 120,
        stepsPerBeat: 4,
        instruments: { a: { wave: "square", volume: 0.01 }, b: { wave: "square", volume: 0.01 } },
        patterns: { p: { a: ["C4", ".", ".", "."], b: ["C4", ".", "."] } },
        order: ["p"],
      }),
    ).toThrow(/does not divide/);
  });
});

describe("the road bed", () => {
  /** A stage with the countdown skipped and the car already rolling. */
  function rolling(): ReturnType<typeof createGame> {
    const state = createGame({ seed: 4242, length: "short", skipCountdown: true });
    for (let i = 0; i < 600; i++) {
      step(state, {
        steer: 0,
        throttle: 1,
        brake: 0,
        handbrake: false,
        boost: false,
        shiftUp: false,
        shiftDown: false,
        reset: false,
      });
    }
    return state;
  }

  it("books grains ahead of the clock, with no hole between them", () => {
    const rec = recorder();
    const bed = createDriveBed(rec);
    const state = rolling();
    // Twenty frames of a 60 Hz display, the clock advancing with them.
    for (let frame = 0; frame < 20; frame++) {
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    // The hum is one tone per grain, so its start times ARE the cadence.
    const starts = rec.tones
      .filter((t) => t.type === "triangle" && (t.holdMs ?? 0) > 0)
      .map((t) => t.at ?? 0)
      .sort((a, b) => a - b);
    expect(starts.length).toBeGreaterThan(4);
    const cadence = GRAIN_MS / 1000;
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      // Three layers share a start time, so a gap is either zero or exactly
      // one cadence — never one and a half, which is the stutter this guards.
      expect(gap === 0 || Math.abs(gap - cadence) < 1e-6, `gap ${gap}`).toBe(true);
    }
  });

  it("holds its grains long enough to overlap into something continuous", () => {
    const rec = recorder();
    const bed = createDriveBed(rec);
    bed.update(rolling(), 1 / 60);
    const hum = rec.tones.find((t) => t.type === "triangle" && (t.holdMs ?? 0) > 0);
    expect(hum).toBeTruthy();
    // At least two grains sounding at once, or the bed is a pulse train at the
    // cadence rather than an engine.
    expect(hum?.holdMs ?? 0).toBeGreaterThan(GRAIN_MS * 1.5);
  });

  it("re-anchors after a stall rather than booking grains in the past", () => {
    // THE JITTER GUARD. WebAudio starts a source whose time has already gone
    // the instant it is handed over, so a stall that leaves the anchor behind
    // the clock fires every missed grain at once, stacked on the next one.
    // What the player hears is a lurch, and the only fix is to give up on the
    // missed grains — the bed's phase means nothing, its regularity is all.
    const rec = recorder();
    const bed = createDriveBed(rec);
    const state = rolling();
    bed.update(state, 1 / 60);
    rec.tones.length = 0;
    rec.noises.length = 0;
    // A stall SHORT of a full re-sync is the dangerous one: long enough to
    // strand the anchor behind the clock, short enough that a scheduler
    // watching only for a catastrophic gap keeps calmly booking into the past.
    rec.clock += 0.4;
    bed.update(state, 1 / 60);
    const booked = [...rec.tones, ...rec.noises].map((v) => v.at ?? 0);
    expect(booked.length).toBeGreaterThan(0);
    expect(Math.min(...booked)).toBeGreaterThanOrEqual(rec.clock);
  });

  it("says nothing while the audio clock is locked", () => {
    const rec = recorder();
    const bed = createDriveBed(rec);
    rec.now = () => null;
    bed.update(rolling(), 1 / 60);
    expect(rec.tones.length + rec.noises.length).toBe(0);
  });

  it("goes quiet under the wheels in the air, and keeps the wind", () => {
    const rec = recorder();
    const bed = createDriveBed(rec);
    const state = rolling();
    state.car.airborne = true;
    bed.update(state, 1 / 60);
    // The wind is a highpass grain; the tyres are the bandpass ones. Airborne
    // there must be no bandpass roll at all — the silence IS the jump.
    const rolls = rec.noises.filter((n) => n.filter?.type === "bandpass" && (n.holdMs ?? 0) > 0);
    const wind = rec.noises.filter((n) => n.filter?.type === "highpass" && (n.holdMs ?? 0) > 0);
    expect(rolls.length).toBe(0);
    expect(wind.length).toBeGreaterThan(0);
  });

  it("counts the lights down once each", () => {
    const rec = recorder();
    const bed = createDriveBed(rec);
    const state = createGame({ seed: 7, length: "short" });
    let ticks = 0;
    const before = () => rec.tones.filter((t) => t.type === "square").length;
    while (state.t < TUNING.countdown) {
      const was = before();
      bed.update(state, TUNING.dt);
      rec.clock += TUNING.dt;
      if (before() > was) ticks++;
      step(state, {
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        boost: false,
        shiftUp: false,
        shiftDown: false,
        reset: false,
      });
    }
    expect(ticks).toBe(TUNING.countdown);
  });
});

describe("the engine's own arithmetic", () => {
  it("turns revs into the firing note of a four-cylinder", () => {
    // Two firings per revolution: 3000 rpm is 100 Hz and nothing chosen by ear.
    expect(noteHz(3000)).toBeCloseTo(100, 6);
  });

  it("puts idle at the bottom of the band and the limiter at the top", () => {
    expect(rpmAt(0)).toBe(900);
    expect(rpmAt(1)).toBe(7000);
    expect(rpmAt(-5)).toBe(900); // a car rolling backwards still idles
  });
});

describe("the tyres", () => {
  const ROLLING: RoadVoice = {
    speed: 30,
    air: 0.8,
    surface: "gravel",
    corner: 0,
    slide: 0,
    sideways: 0,
    airborne: false,
  };

  /** The summed level of the ROLLING bed — the surface's roar (a still
   * bandpass) and its crunch (a highpass well above the wind's). The wind sits
   * under 2 kHz and the scrub sweeps, so neither is counted here. */
  function rollingLevel(voice: Partial<RoadVoice>): number {
    const rec = recorder();
    playRoadGrain(rec, { ...ROLLING, ...voice }, 0);
    return rec.noises
      .filter((n) => n.filter?.to === undefined)
      .filter((n) => n.filter?.type === "bandpass" || (n.filter?.frequency ?? 0) > 2000)
      .reduce((sum, n) => sum + (n.volume ?? 0), 0);
  }

  it("keeps a straight quiet and makes the corner the event", () => {
    // The bed is what the player hears for the whole run, so a constant hiss
    // is a constant hiss — it says nothing about what the car is doing and it
    // is the loudest thing in the mix while saying it. Loose or sealed, the
    // noise a tyre makes is the noise of being asked to turn the car.
    for (const surface of ["gravel", "asphalt"]) {
      const straight = rollingLevel({ surface });
      const turning = rollingLevel({ surface, corner: 1 });
      expect(turning, `${surface} sounds the same through a corner`).toBeGreaterThan(
        straight * 2.5,
      );
    }
  });

  it("makes tarmac the quietest thing under the car, and a bass one", () => {
    // Rolling straight down a sealed road the player should be hearing the
    // ENGINE, and under it a dull bass drumming — not a quieter version of
    // the dirt road, which is what a bright band with a crunch over it is.
    expect(rollingLevel({ surface: "asphalt" })).toBeLessThan(
      rollingLevel({ surface: "gravel" }) * 0.4,
    );
    expect(rollingLevel({ surface: "asphalt" })).toBeLessThan(
      rollingLevel({ surface: "nature" }) * 0.4,
    );
    const rec = recorder();
    playRoadGrain(rec, { ...ROLLING, surface: "asphalt" }, 0);
    // No crunch: a sealed surface has no loose material to throw, so there is
    // no highpass layer over the roar at all.
    expect(
      rec.noises.filter((n) => n.filter?.type === "highpass" && (n.volume ?? 0) > 0),
    ).toHaveLength(
      1, // the wind, and nothing else
    );
    // And the roar itself is DOWN there, where a tyre drums the body.
    const roar = rec.noises.find((n) => n.filter?.type === "bandpass");
    expect(roar?.filter?.frequency).toBeLessThan(200);
  });

  it("sings on tarmac from the cornering load alone, and digs only on a slide", () => {
    // A tyre protests while it is still winning; a loose surface has nothing
    // to protest WITH and only makes its second noise once the car has gone.
    const scrub = (voice: Partial<RoadVoice>): number => {
      const rec = recorder();
      playRoadGrain(rec, { ...ROLLING, ...voice }, 0);
      const sing = rec.noises.filter((n) => (n.filter?.q ?? 0) > 5);
      const dig = rec.noises.filter((n) => n.filter?.to !== undefined);
      return [...sing, ...dig, ...rec.tones].reduce((sum, v) => sum + (v.volume ?? 0), 0);
    };
    expect(scrub({ surface: "asphalt", corner: 1 })).toBeGreaterThan(0);
    expect(scrub({ surface: "asphalt", corner: 0 })).toBe(0);
    expect(scrub({ surface: "gravel", corner: 1 })).toBe(0);
    expect(scrub({ surface: "gravel", corner: 1, slide: 0.8 })).toBeGreaterThan(0);
  });
});
