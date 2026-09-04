// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUDIO GUARDS — the faults in this subsystem that are invisible without
// a test, because every one of them is a SILENCE rather than a crash.
//
// Five kinds, and each has bitten a game that shipped without the guard:
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
//   * A BED THAT SAYS NOTHING. The tyres as loud on a straight as in a
//     corner, an engine that does not change with load — a bed whose numbers
//     are constants is the loudest thing in the mix for the whole run.
//   * A CUTOFF PAST NYQUIST. Fine on a laptop, a torn speaker on the 16 kHz
//     session iOS hands a Bluetooth headset.
//
// No DOM: the synth is replaced with a recorder, which is also the only way
// to assert what a sound actually asked the instrument for.

import { describe, expect, it } from "vitest";

import { TUNING, createGame, standSolid, step, type GameEvent, type GameState } from "@engine";

import {
  callGainAtSpeed,
  createWorld,
  worldRoster,
  worldTargets,
  type WorldVoice,
} from "../pwa/src/game/audio/ambience.ts";
import { STAGE_BANK } from "../pwa/src/game/audio/bank-stage.ts";
import { UI_BANK } from "../pwa/src/game/audio/bank-ui.ts";
import { WORLD_BANK } from "../pwa/src/game/audio/bank-world.ts";
import { CAR_BANK, RUN_BANK } from "../pwa/src/game/audio/bank.ts";
import { createDriveBed } from "../pwa/src/game/audio/drive-bed.ts";
import {
  engineTargets,
  noteHz,
  rpmAt,
  type EngineLayer,
  type EngineVoice,
} from "../pwa/src/game/audio/engine-voice.ts";
import { LISTENERS, listenerFor } from "../pwa/src/game/audio/listener.ts";
import { stageTrack, trackFor, type Setting } from "../pwa/src/game/audio/music-pick.ts";
import { playDef } from "../pwa/src/game/audio/play.ts";
import {
  roadTargets,
  SURFACES,
  WET_SURFACES,
  type RoadLayer,
  type RoadVoice,
} from "../pwa/src/game/audio/road-voice.ts";
import { heardFrom, soundForEvent, soundForThunder } from "../pwa/src/game/audio/route.ts";
import { CIRCUIT_TRACK } from "../pwa/src/game/audio/scores/circuit.ts";
import { DESERT_TRACK } from "../pwa/src/game/audio/scores/desert.ts";
import { ENDLESS_TRACK } from "../pwa/src/game/audio/scores/endless.ts";
import { MENU_TRACK } from "../pwa/src/game/audio/scores/menu.ts";
import { POLAR_TRACK } from "../pwa/src/game/audio/scores/polar.ts";
import { SPRUCE_TRACK } from "../pwa/src/game/audio/scores/spruce.ts";
import { TAIGA_TRACK } from "../pwa/src/game/audio/scores/taiga.ts";
import type { SoundBank } from "../pwa/src/game/audio/types.ts";
import { flattenTrack, noteFrequency, trackSeconds, type Track } from "../pwa/src/lib/tracker.ts";
import {
  MAX_CUTOFF_RATIO,
  MIN_ATTACK_MS,
  envelopeShape,
  safeCutoff,
  shaperPush,
  shaperSteepness,
  type LayerSpec,
  type LayerTarget,
  type NoiseOptions,
  type Synth,
  type ToneOptions,
} from "../pwa/src/lib/voice.ts";

/** One layer the recorder built: what it was made of, every target it was
 * steered to, and whether it is still standing. */
type RecordedLayer = {
  spec: LayerSpec;
  sets: { target: LayerTarget; glide: number }[];
  stopped: boolean;
  generation: number;
};

/** A synth that plays nothing and remembers everything, with a clock the test
 * drives by hand, a lock it can throw, and a context it can replace. */
function recorder(): Synth & {
  tones: ToneOptions[];
  noises: NoiseOptions[];
  layers: RecordedLayer[];
  clock: number;
  locked: boolean;
  generation: number;
} {
  const rec = {
    tones: [] as ToneOptions[],
    noises: [] as NoiseOptions[],
    layers: [] as RecordedLayer[],
    clock: 0,
    locked: false,
    generation: 0,
    unlock: () => {},
    autostart: () => {},
    resume: () => {},
    now: () => (rec.locked ? null : rec.clock),
    tone: (o: ToneOptions) => void rec.tones.push(o),
    noise: (o: NoiseOptions) => void rec.noises.push(o),
    layer(spec: LayerSpec) {
      if (rec.locked) return null;
      const layer: RecordedLayer = { spec, sets: [], stopped: false, generation: rec.generation };
      rec.layers.push(layer);
      return {
        set: (target: LayerTarget, glide: number) => void layer.sets.push({ target, glide }),
        stop: () => void (layer.stopped = true),
        alive: () => !layer.stopped && layer.generation === rec.generation,
      };
    },
  };
  return rec;
}

const BANKS: [string, SoundBank][] = [
  ["run", RUN_BANK],
  ["ui", UI_BANK],
  ["world", WORLD_BANK],
];

const SCORES: [string, Track][] = [
  ["menu", MENU_TRACK],
  ["taiga", TAIGA_TRACK],
  ["spruce", SPRUCE_TRACK],
  ["polar", POLAR_TRACK],
  ["desert", DESERT_TRACK],
  ["circuit", CIRCUIT_TRACK],
  ["endless", ENDLESS_TRACK],
];

const loudest = (bank: SoundBank): number =>
  Math.max(...Object.values(bank).flatMap((d) => d.voices.map((v) => v.volume ?? 0)));

describe("the sound banks", () => {
  it("give every sound a description and at least one voice", () => {
    for (const [name, bank] of BANKS) {
      for (const [id, def] of Object.entries(bank)) {
        expect(def.voices.length, `${name}/${id} has no voices`).toBeGreaterThan(0);
        // The description is what the next person retuning the numbers checks
        // their work against; a sound without one is a wall of magic numbers.
        expect(def.description.length, `${name}/${id} has no description`).toBeGreaterThan(40);
      }
    }
  });

  it("keep every voice inside the mixing budget", () => {
    // The ceiling is the biggest crash in the game. Nothing may exceed it, and
    // anything that reaches it should be a once-a-run moment.
    for (const [name, bank] of BANKS) {
      for (const [id, def] of Object.entries(bank)) {
        for (const voice of def.voices) {
          expect(voice.volume ?? 0, `${name}/${id} is louder than the crash`).toBeLessThanOrEqual(
            0.1,
          );
          expect(voice.durationMs, `${name}/${id} voice has no length`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keep the interface and the world quieter than the car", () => {
    // A menu click is heard hundreds of times a session and a crash a handful;
    // a bird that can be heard over a drift is a bird inside the car.
    expect(loudest(UI_BANK)).toBeLessThan(loudest(RUN_BANK));
    expect(loudest(WORLD_BANK)).toBeLessThan(loudest(RUN_BANK) * 0.35);
  });

  it("serve the car and the stage as one bank, with no id claimed twice", () => {
    const car = Object.keys(CAR_BANK);
    const stage = Object.keys(STAGE_BANK);
    expect(car.filter((id) => stage.includes(id))).toEqual([]);
    expect(Object.keys(RUN_BANK).length).toBe(car.length + stage.length);
  });

  it("keeps the world's sounds under 5 kHz where a codec can carry them", () => {
    // A Bluetooth codec turns dense top end into a swirl. The birds are the
    // highest things in the game and they stop under 5 kHz.
    for (const [id, def] of Object.entries(WORLD_BANK)) {
      for (const voice of def.voices) {
        if (voice.call === "tone") expect(voice.from, `world/${id}`).toBeLessThan(5000);
      }
    }
  });
});

/** The two things a car takes out of the landscape — one of each material,
 * because the route splits on what gave way rather than on how hard. */
const SNAPPED_TREE = standSolid({ x: 0, y: 0, z: 0, kind: "tree", size: 1.2, spin: 0 });
const SHOVED_ROCK = standSolid({ x: 0, y: 0, z: 0, kind: "rock", size: 0.6, spin: 0 });

describe("event routing", () => {
  /** Every shape a `GameEvent` can take, one or more of each — KEYED BY THE
   * EVENT'S OWN TYPE, so the union cannot grow past this list quietly. A new
   * member of `GameEvent` is a missing key here, and a missing key is a
   * compile error rather than a test that goes on passing. */
  const EVERY_EVENT: Record<GameEvent["type"], GameEvent[]> = {
    go: [{ type: "go" }],
    takeoff: [{ type: "takeoff", vy: 6 }],
    landing: [
      { type: "landing", airTime: 1.2, slam: 9, took: 0.5 * 9 ** 2, clean: true },
      { type: "landing", airTime: 1.2, slam: 9, took: 0.5 * 9 ** 2, clean: false },
    ],
    splash: [
      { type: "splash", speed: 12, deep: false },
      { type: "splash", speed: 24, deep: true },
    ],
    shift: [{ type: "shift", gear: 3 }],
    offRoad: [
      { type: "offRoad", off: true },
      { type: "offRoad", off: false },
    ],
    impact: [
      { type: "impact", speed: 4, angle: 0, belly: false },
      { type: "impact", speed: 10, angle: 1, belly: false },
      { type: "impact", speed: 24, angle: 2, belly: true },
    ],
    partBreak: [{ type: "partBreak", part: "bumperF" }],
    kerbHit: [
      { type: "kerbHit", speed: 5 },
      { type: "kerbHit", speed: 20 },
    ],
    solidBreak: [
      { type: "solidBreak", solid: SNAPPED_TREE, broke: true, vx: 2, vy: 1, vz: 0 },
      { type: "solidBreak", solid: SHOVED_ROCK, broke: false, vx: 9, vy: 3, vz: 1 },
    ],
    spin: [
      { type: "spin", slip: 1.1, speed: 9 },
      { type: "spin", slip: 1.4, speed: 28 },
    ],
    rollover: [
      { type: "rollover", rate: 2.6, speed: 12 },
      { type: "rollover", rate: 9, speed: 30 },
    ],
    crash: [{ type: "crash" }],
    sink: [{ type: "sink" }],
    respawn: [{ type: "respawn" }],
    lap: [
      { type: "lap", lap: 1, time: 62, best: true },
      { type: "lap", lap: 2, time: 64, best: false },
    ],
    finish: [{ type: "finish", time: 120 }],
    cheer: [{ type: "cheer", size: 0.4 }],
    checkpoint: [
      { type: "checkpoint", index: 0, count: 3, split: 0, time: 30 },
      { type: "checkpoint", index: 2, count: 3, split: 2, time: 61 },
    ],
    missed: [{ type: "missed", next: 1, count: 3 }],
    systemFail: [
      { type: "systemFail", system: "engine", stage: "hurt" },
      { type: "systemFail", system: "engine", stage: "spent" },
      { type: "systemFail", system: "engine", stage: "dead" },
      { type: "systemFail", system: "cooling", stage: "spent" },
      { type: "systemFail", system: "gearbox", stage: "spent" },
    ],
    overheat: [
      { type: "overheat", level: "warn" },
      { type: "overheat", level: "red" },
      { type: "overheat", level: "clear" },
    ],
    wheelFail: [
      { type: "wheelFail", wheel: 1, off: false },
      { type: "wheelFail", wheel: 1, off: true },
    ],
    retire: [
      { type: "retire", reason: "engine" },
      { type: "retire", reason: "wheels" },
    ],
  };

  it("answers every event with a sound the bank actually holds", () => {
    // Nothing is silent any more: a split board and a system giving way
    // were the two moments the car reported that nobody could hear.
    for (const [type, events] of Object.entries(EVERY_EVENT)) {
      for (const event of events) {
        const hit = soundForEvent(event, 0);
        expect(hit, `${type} makes no sound`).not.toBeNull();
        expect(RUN_BANK[(hit as { id: string }).id], `${type} names a missing sound`).toBeTruthy();
      }
    }
  });

  it("tells a system giving from a system gone", () => {
    const give = soundForEvent({ type: "systemFail", system: "engine", stage: "hurt" }, 0);
    const gone = soundForEvent({ type: "systemFail", system: "engine", stage: "spent" }, 0);
    const dead = soundForEvent({ type: "systemFail", system: "engine", stage: "dead" }, 0);
    expect(give?.id).toBe("system_give");
    expect(gone?.id).toBe("system_gone");
    // The engine going is the run ending, and it is the heaviest of them —
    // heavier again at the line where it actually stops.
    const box = soundForEvent({ type: "systemFail", system: "gearbox", stage: "spent" }, 0);
    expect(gone?.shape?.gain ?? 1).toBeGreaterThan(box?.shape?.gain ?? 1);
    expect(dead?.shape?.gain ?? 1).toBeGreaterThan(gone?.shape?.gain ?? 1);
  });

  it("pitches the needle up and the good news down again", () => {
    const warn = soundForEvent({ type: "overheat", level: "warn" }, 0);
    const red = soundForEvent({ type: "overheat", level: "red" }, 0);
    const clear = soundForEvent({ type: "overheat", level: "clear" }, 0);
    expect(warn?.id).toBe("system_give");
    expect(red?.id).toBe("system_gone");
    // Coming out of the red is the same chirp as the warning, lifted and
    // quietened: heard as relief rather than as one more thing breaking.
    expect(clear?.id).toBe("system_give");
    expect(clear?.shape?.gain ?? 1).toBeLessThan(1);
    expect(clear?.shape?.pitch ?? 1).toBeGreaterThan(red?.shape?.pitch ?? 1);
  });

  it("lifts the last split board of a lap so the count can be heard ending", () => {
    const first = soundForEvent({ type: "checkpoint", index: 0, count: 3, split: 0, time: 1 }, 0);
    const last = soundForEvent({ type: "checkpoint", index: 2, count: 3, split: 2, time: 1 }, 0);
    expect(first?.id).toBe("checkpoint");
    expect(last?.shape?.pitch ?? 1).toBeGreaterThan(first?.shape?.pitch ?? 1);
  });

  it("sizes a spin by the speed it let go at", () => {
    const slow = soundForEvent({ type: "spin", slip: 1.2, speed: 9 }, 0);
    const fast = soundForEvent({ type: "spin", slip: 1.2, speed: 28 }, 0);
    expect(slow?.id).toBe("spin");
    expect(fast?.shape?.gain).toBeGreaterThan(slow?.shape?.gain ?? 0);
    expect(fast?.shape?.pitch).toBeLessThan(slow?.shape?.pitch ?? 0);
    expect(fast?.shape?.stretch).toBeGreaterThan(slow?.shape?.stretch ?? 0);
  });

  it("picks the shift direction off the gear it came from", () => {
    expect(soundForEvent({ type: "shift", gear: 3 }, 2)?.id).toBe("shift_up");
    expect(soundForEvent({ type: "shift", gear: 2 }, 3)?.id).toBe("shift_down");
  });

  it("keeps an anti-cut block off the impact ladder", () => {
    // R26 — a block ridden over is not a crash and must not sound like
    // one: a player who hears the car break here stops cutting apexes
    // instead of learning what cutting one costs.
    const soft = soundForEvent({ type: "kerbHit", speed: 5 }, 0);
    const hard = soundForEvent({ type: "kerbHit", speed: 20 }, 0);
    expect(soft?.id).toBe("kerb_block");
    expect(hard?.shape?.gain ?? 0).toBeGreaterThan(soft?.shape?.gain ?? 0);
    expect(hard?.shape?.pitch ?? 1).toBeLessThan(soft?.shape?.pitch ?? 1);
    for (const voice of RUN_BANK.kerb_block.voices) {
      expect(voice.filter?.frequency ?? 0).toBeLessThan(1000);
      expect(voice.filter?.to ?? 0).toBeLessThan(1000);
    }
    expect(RUN_BANK.impact_hit.voices.some((v) => (v.filter?.frequency ?? 0) > 1000)).toBe(true);
  });

  it("climbs the impact ladder with closing speed", () => {
    const ids = [4, 10, 24].map(
      (speed) => soundForEvent({ type: "impact", speed, angle: 0, belly: false }, 0)?.id,
    );
    expect(ids).toEqual(["impact_scuff", "impact_hit", "impact_crunch"]);
  });

  it("takes a car going under an octave below a ford crossed at the same pace", () => {
    const ford = soundForEvent({ type: "splash", speed: 18, deep: false }, 0);
    const lake = soundForEvent({ type: "splash", speed: 18, deep: true }, 0);
    expect(lake?.id).toBe(ford?.id);
    expect(lake?.shape?.gain ?? 1).toBeGreaterThan(ford?.shape?.gain ?? 1);
    expect(lake?.shape?.pitch ?? 1).toBeLessThan(ford?.shape?.pitch ?? 1);
    expect(lake?.shape?.stretch ?? 1).toBeGreaterThan(ford?.shape?.stretch ?? 1);
  });

  it("makes a harder landing louder and lower, and gives the gentlest some weight", () => {
    const hop = soundForEvent(
      { type: "landing", airTime: 2.5, slam: 2, took: 0.5 * 2 ** 2, clean: true },
      0,
    );
    const flight = soundForEvent(
      { type: "landing", airTime: 0.4, slam: 12, took: 0.5 * 12 ** 2, clean: true },
      0,
    );
    expect(flight?.shape?.gain ?? 0).toBeGreaterThan(hop?.shape?.gain ?? 0);
    expect(flight?.shape?.pitch ?? 1).toBeLessThan(hop?.shape?.pitch ?? 1);
    const feather = soundForEvent(
      { type: "landing", airTime: 0.1, slam: 0.2, took: 0.5 * 0.2 ** 2, clean: true },
      0,
    );
    const full = soundForEvent(
      { type: "landing", airTime: 2, slam: 14, took: 0.5 * 14 ** 2, clean: true },
      0,
    );
    expect(feather?.shape?.gain ?? 0).toBeGreaterThan(0.25 * (full?.shape?.gain ?? 1));
  });

  it("hears an impact from the seat it is watched from", () => {
    // A cabin is a lowpass and a helicopter is a long way off: the same
    // impact arrives duller inside and quieter from above.
    const hit = soundForEvent({ type: "impact", speed: 20, angle: 0, belly: false }, 0);
    const inside = heardFrom(hit?.shape, LISTENERS.cockpit);
    const above = heardFrom(hit?.shape, LISTENERS.heli);
    const behind = heardFrom(hit?.shape, LISTENERS.chase);
    expect(inside.pitch ?? 1).toBeLessThan(behind.pitch ?? 1);
    expect(above.gain ?? 1).toBeLessThan(behind.gain ?? 1);
    // …and a play with no shape of its own still gets the seat's.
    expect(heardFrom(undefined, LISTENERS.heli).gain).toBe(LISTENERS.heli.events);
  });
});

describe("thunder", () => {
  const clap = (distance: number, pan = 0): ReturnType<typeof soundForThunder> =>
    soundForThunder({ distance, pan });

  it("cracks up close and rolls from a distance", () => {
    expect(clap(300).id).toBe("thunder_near");
    expect(clap(6000).id).toBe("thunder_far");
    for (const id of ["thunder_near", "thunder_far"]) {
      expect(RUN_BANK[id], `${id} is not in the bank`).toBeDefined();
    }
  });

  it("gives the roll no onset at all", () => {
    for (const voice of RUN_BANK.thunder_far.voices)
      expect(voice.attackMs ?? 0).toBeGreaterThan(200);
    expect(Math.min(...RUN_BANK.thunder_near.voices.map((v) => v.attackMs ?? 0))).toBeLessThan(10);
  });

  it("takes a far strike quieter, lower and longer", () => {
    const near = clap(2000).shape;
    const far = clap(8000).shape;
    expect(far.gain ?? 1).toBeLessThan(near.gain ?? 1);
    expect(far.pitch ?? 1).toBeLessThan(near.pitch ?? 1);
    expect(far.stretch ?? 1).toBeGreaterThan(near.stretch ?? 1);
  });

  it("puts the strike where it happened, and never off the stage", () => {
    expect(clap(500, -0.8).shape.pan).toBeCloseTo(-0.8, 5);
    expect(clap(500, 4).shape.pan).toBe(1);
    expect(clap(5000, -4).shape.pan).toBe(-1);
  });
});

describe("shaping a play", () => {
  it("scales the volume a voice left off the synth's own default", () => {
    const rec = recorder();
    playDef(
      rec,
      { description: "x".repeat(50), voices: [{ call: "tone", from: 100, durationMs: 10 }] },
      { gain: 0.5 },
    );
    expect(rec.tones[0].volume).toBeCloseTo(0.06 * 0.5, 6);
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
    expect(tone.to).toBeUndefined();
    expect(tone.filter?.frequency).toBe(500);
    expect(tone.filter?.to).toBe(1000);
  });
});

describe("the scores", () => {
  it("flatten, with every note token a note", () => {
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

  it("run long enough to be a loop and short enough to come round", () => {
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

  it("keep the music under the sound effects", () => {
    for (const [name, track] of SCORES) {
      for (const [voice, instrument] of Object.entries(track.instruments)) {
        expect(instrument.volume, `${name}/${voice}`).toBeLessThanOrEqual(0.06);
      }
    }
  });

  it("give each score a real pad — something that holds", () => {
    for (const [name, track] of SCORES) {
      const holds = Object.values(track.instruments).filter((i) => (i.hold ?? 0) >= 0.8);
      expect(holds.length, `${name} has no sustaining voice`).toBeGreaterThan(0);
    }
  });

  it("have an arc — no two sections of a score are the same density", () => {
    // A section that is not a section: two patterns with the same voice
    // count and the same attacks per bar are one section written twice.
    for (const [name, track] of SCORES) {
      const seen = new Set<string>();
      for (const [section, pattern] of Object.entries(track.patterns)) {
        const bars = Math.max(...Object.values(pattern).map((v) => v.length)) / 16;
        let attacks = 0;
        for (const line of Object.values(pattern)) {
          const cycles = (bars * 16) / line.length;
          attacks += line.filter((t) => t !== "." && t !== "=").length * cycles;
        }
        const key = `${bars}/${Object.keys(pattern).sort().join(",")}/${Math.round(attacks / bars)}`;
        expect(seen.has(key), `${name}/${section} duplicates another section`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("are picked by the stage, and every pick is a score that exists", () => {
    const base: Setting = {
      biome: "taiga",
      weather: "clear",
      timeOfDay: "day",
      circuit: false,
      endless: false,
    };
    expect(trackFor(base)).toBe("taiga");
    expect(trackFor({ ...base, weather: "rain" })).toBe("spruce");
    expect(trackFor({ ...base, weather: "storm" })).toBe("spruce");
    expect(trackFor({ ...base, timeOfDay: "night" })).toBe("polar");
    expect(trackFor({ ...base, timeOfDay: "dusk" })).toBe("polar");
    expect(trackFor({ ...base, biome: "desert" })).toBe("desert");
    expect(trackFor({ ...base, biome: "desert", weather: "storm" })).toBe("desert");
    // The shape of the road wins over the sky.
    expect(trackFor({ ...base, circuit: true, weather: "storm" })).toBe("circuit");
    expect(trackFor({ ...base, endless: true, biome: "desert" })).toBe("endless");
    const ids = new Set(SCORES.map(([name]) => name));
    for (const weather of ["clear", "rain", "storm"] as const) {
      for (const timeOfDay of ["dawn", "day", "dusk", "night"] as const) {
        for (const biome of ["taiga", "desert"] as const) {
          expect(ids.has(trackFor({ ...base, weather, timeOfDay, biome }))).toBe(true);
        }
      }
    }
    expect(stageTrack(createGame({ seed: 4242, length: "short" }))).toBe("taiga");
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

describe("the engine", () => {
  const MIX = { engine: 1, exhaust: 1, tone: 1 };
  const at = (voice: Partial<EngineVoice>): Record<EngineLayer, LayerTarget> =>
    engineTargets({ rpm: 3000, rev: 0.35, load: 0.5, wear: 0, ...voice }, MIX);

  it("turns revs into the firing note of a four-cylinder", () => {
    // Two firings per revolution: 3000 rpm is 100 Hz and nothing chosen by ear.
    expect(noteHz(3000)).toBeCloseTo(100, 6);
    expect(at({ rpm: 3000 }).hum.hz).toBeCloseTo(100, 6);
    expect(at({ rpm: 3000 }).octave.hz).toBeCloseTo(200, 6);
  });

  it("puts idle at the bottom of the band and the limiter at the top", () => {
    expect(rpmAt(0)).toBe(900);
    expect(rpmAt(1)).toBe(7000);
    expect(rpmAt(-5)).toBe(900); // a car rolling backwards still idles
  });

  it("works harder under load — louder, and driven further into the curve", () => {
    const coasting = at({ load: 0.1 });
    const pulling = at({ load: 1 });
    expect(pulling.hum.level).toBeGreaterThan(coasting.hum.level * 1.5);
    expect(pulling.hum.grit ?? 0).toBeGreaterThan(coasting.hum.grit ?? 0);
    expect(pulling.bass.level).toBeGreaterThan(coasting.bass.level);
  });

  it("keeps the rasp and the turbo for the top of the band", () => {
    // A car pulling out of a hairpin never reaches the rasp; the turbo
    // needs load AND revs.
    expect(at({ rev: 0.2, load: 1 }).rasp.level).toBe(0);
    expect(at({ rev: 0.9, load: 1 }).rasp.level).toBeGreaterThan(0);
    expect(at({ rev: 0.9, load: 0.2 }).turbo.level).toBe(0);
    expect(at({ rev: 0.9, load: 1 }).turbo.level).toBeGreaterThan(0);
    expect(at({ rev: 0.9, load: 1 }).turbo.level).toBeGreaterThan(
      at({ rev: 0.5, load: 1 }).turbo.level,
    );
  });

  it("stands the bass on a floor a speaker can reproduce", () => {
    expect(at({ rpm: 900 }).bass.hz).toBeGreaterThanOrEqual(44);
    expect(at({ rpm: 7000 }).bass.hz).toBeCloseTo(7000 / 30 / 2, 6);
  });

  it("goes dark and loses its exhaust inside the cabin", () => {
    const outside = engineTargets({ rpm: 4000, rev: 0.6, load: 0.8, wear: 0 }, MIX);
    const inside = engineTargets(
      { rpm: 4000, rev: 0.6, load: 0.8, wear: 0 },
      {
        engine: LISTENERS.cockpit.engine,
        exhaust: LISTENERS.cockpit.exhaust,
        tone: LISTENERS.cockpit.tone,
      },
    );
    expect(inside.hum.cutoff ?? 0).toBeLessThan(outside.hum.cutoff ?? 0);
    expect(inside.rasp.level).toBeLessThan(outside.rasp.level);
    expect(inside.hum.level).toBeGreaterThan(outside.hum.level);
  });
});

describe("the tyres", () => {
  const MIX = { tyres: 1, scrub: 1, wind: 1, weather: 1 };
  const ROLLING: RoadVoice = {
    speed: 30,
    air: 0.8,
    surface: "gravel",
    corner: 0,
    slide: 0,
    spin: 0,
    sideways: 0,
    airborne: false,
    wet: 0,
    squall: 0.5,
    gale: 0,
  };
  const at = (voice: Partial<RoadVoice>): Record<RoadLayer, LayerTarget> =>
    roadTargets({ ...ROLLING, ...voice }, MIX);
  const SURFACE_LAYERS: RoadLayer[] = ["roarPink", "roarBrown", "body", "grain", "tear"];
  const SCRUB_LAYERS: RoadLayer[] = ["dig", "spray", "sing", "singTone"];
  const sum = (t: Record<RoadLayer, LayerTarget>, layers: RoadLayer[]): number =>
    layers.reduce((s, l) => s + t[l].level, 0);

  it("keeps a straight quiet and makes the corner the event", () => {
    for (const surface of ["gravel", "asphalt"]) {
      const straight = sum(at({ surface }), SURFACE_LAYERS);
      const turning = sum(at({ surface, corner: 1 }), SURFACE_LAYERS);
      expect(turning, `${surface} sounds the same through a corner`).toBeGreaterThan(
        straight * 2.5,
      );
    }
  });

  it("makes tarmac the quietest thing under the car, and a bass one", () => {
    expect(sum(at({ surface: "asphalt" }), SURFACE_LAYERS)).toBeLessThan(
      sum(at({ surface: "gravel" }), SURFACE_LAYERS) * 0.4,
    );
    expect(sum(at({ surface: "asphalt" }), SURFACE_LAYERS)).toBeLessThan(
      sum(at({ surface: "nature" }), SURFACE_LAYERS) * 0.4,
    );
    const tarmac = at({ surface: "asphalt" });
    expect(tarmac.grain.level).toBe(0); // no loose material to throw
    expect(tarmac.roarBrown.cutoff ?? 0).toBeLessThan(200);
    expect(tarmac.roarPink.level).toBe(0);
  });

  it("keeps the off-road bed out of the top end and fills its middle", () => {
    // A resonant bottom with a bright hiss over it and a hole between the
    // two is a sheet of metal being scoured, not a field being ploughed.
    const turf = at({ surface: "nature" });
    expect(turf.grain.level).toBe(0);
    expect(turf.body.level + turf.tear.level).toBeGreaterThan(turf.roarBrown.level * 0.9);
  });

  it("sings on tarmac from the cornering load alone, and digs only on a slide", () => {
    expect(sum(at({ surface: "asphalt", corner: 1 }), SCRUB_LAYERS)).toBeGreaterThan(0);
    expect(sum(at({ surface: "asphalt", corner: 0 }), SCRUB_LAYERS)).toBe(0);
    expect(sum(at({ surface: "gravel", corner: 1 }), SCRUB_LAYERS)).toBe(0);
    expect(sum(at({ surface: "gravel", corner: 1, slide: 0.8 }), SCRUB_LAYERS)).toBeGreaterThan(0);
  });

  it("hears a lit axle the same way it hears a slide", () => {
    // A launch with the wheels spinning is the tyre asked for more than the
    // road will give, going the other way.
    expect(at({ surface: "gravel", spin: 0.8 }).dig.level).toBeGreaterThan(0);
    expect(at({ surface: "asphalt", spin: 0.8 }).sing.level).toBeGreaterThan(0);
    // …even from a standstill, where nothing rolls yet.
    expect(at({ surface: "gravel", speed: 2, air: 0.02, spin: 0.9 }).dig.level).toBeGreaterThan(0);
  });

  it("throws the spray to the outside of the slide", () => {
    expect(at({ slide: 0.8, sideways: 6 }).spray.pan ?? 0).toBeLessThan(0);
    expect(at({ slide: 0.8, sideways: -6 }).spray.pan ?? 0).toBeGreaterThan(0);
  });

  it("goes quiet under the wheels in the air, and keeps the wind", () => {
    const flying = at({ airborne: true, corner: 1, slide: 0.8 });
    expect(sum(flying, [...SURFACE_LAYERS, ...SCRUB_LAYERS])).toBe(0);
    expect(flying.wind.level).toBeGreaterThan(at({}).wind.level);
  });

  it("makes no rolling noise on the start line, and the wind sells speed squared", () => {
    const parked = at({ speed: 0, air: 0 });
    expect(sum(parked, [...SURFACE_LAYERS, ...SCRUB_LAYERS, "wind"])).toBe(0);
    expect(at({ air: 1 }).wind.level / at({ air: 0.5 }).wind.level).toBeCloseTo(4, 6);
  });

  it("is heard less from the cockpit and more from the bumper", () => {
    const inside = roadTargets({ ...ROLLING, corner: 1 }, LISTENERS.cockpit);
    const nose = roadTargets({ ...ROLLING, corner: 1 }, LISTENERS.bumper);
    expect(sum(inside, SURFACE_LAYERS)).toBeLessThan(sum(nose, SURFACE_LAYERS));
    expect(inside.wind.level).toBeLessThan(nose.wind.level);
  });
});

describe("the weather", () => {
  const MIX = { tyres: 1, scrub: 1, wind: 1, weather: 1 };
  const ROLLING: RoadVoice = {
    speed: 30,
    air: 0.8,
    surface: "gravel",
    corner: 0,
    slide: 0,
    spin: 0,
    sideways: 0,
    airborne: false,
    wet: 0,
    squall: 0.5,
    gale: 0,
  };
  const at = (voice: Partial<RoadVoice>): Record<RoadLayer, LayerTarget> =>
    roadTargets({ ...ROLLING, ...voice }, MIX);
  const WEATHER: RoadLayer[] = ["rainSheet", "rainPatter", "galeRoar", "galeWhistle"];
  const level = (t: Record<RoadLayer, LayerTarget>, layers: RoadLayer[]): number =>
    layers.reduce((s, l) => s + t[l].level, 0);

  it("turns gravel into mud rather than putting rain on top of it", () => {
    const dry = SURFACES.gravel as (typeof SURFACES)[string];
    const mud = WET_SURFACES.gravel as (typeof SURFACES)[string];
    expect(mud.grain?.level ?? 0).toBeLessThan((dry.grain?.level ?? 0) * 0.2);
    expect(mud.hz).toBeLessThan(dry.hz);
    expect(mud.level).toBeGreaterThan(dry.level);
    expect(mud.corner).toBeLessThan(dry.corner);
  });

  it("makes wet tarmac the one surface the rain brightens", () => {
    const dry = SURFACES.asphalt as (typeof SURFACES)[string];
    const wet = WET_SURFACES.asphalt as (typeof SURFACES)[string];
    expect(wet.hz).toBeGreaterThan(dry.hz * 4);
    expect(wet.level).toBeGreaterThan(dry.level * 2);
  });

  it("mixes the two surfaces rather than flipping between them", () => {
    const dry = at({}).roarPink.cutoff ?? 0;
    const damp = at({ wet: 0.5 }).roarPink.cutoff ?? 0;
    const soaked = at({ wet: 1 }).roarPink.cutoff ?? 0;
    expect(soaked).toBeLessThan(damp);
    expect(damp).toBeLessThan(dry);
  });

  it("rains on a car that is doing nothing at all", () => {
    expect(level(at({ speed: 0, air: 0, wet: 1 }), WEATHER)).toBeGreaterThan(0);
    expect(level(at({ airborne: true, wet: 1 }), WEATHER)).toBeGreaterThan(0);
    expect(level(at({ speed: 0, air: 0, gale: 0.8 }), WEATHER)).toBeGreaterThan(0);
  });

  it("keeps the storm beside the wind rather than over it", () => {
    const total = (wet: number): number =>
      level(at({ wet }), [...WEATHER, "roarPink", "roarBrown", "grain", "wind"]);
    expect(total(1) - total(0)).toBeLessThan(0.08);
    expect(total(0.6)).toBeGreaterThan(total(0));
    expect(total(1)).toBeGreaterThan(total(0.6));
  });

  it("stops a wet tyre singing on tarmac", () => {
    const sing = (wet: number): number => at({ surface: "asphalt", corner: 1, wet }).sing.level;
    expect(sing(1)).toBeLessThan(sing(0) * 0.5);
  });

  it("is loudest on the windscreen and quietest from a helicopter", () => {
    const glass = roadTargets({ ...ROLLING, wet: 1 }, LISTENERS.cockpit);
    const sky = roadTargets({ ...ROLLING, wet: 1 }, LISTENERS.heli);
    expect(level(glass, ["rainSheet", "rainPatter"])).toBeGreaterThan(
      level(sky, ["rainSheet", "rainPatter"]),
    );
  });
});

describe("the listener", () => {
  it("puts the engine in the cabin and the world in the sky", () => {
    expect(LISTENERS.cockpit.engine).toBeGreaterThan(LISTENERS.heli.engine);
    expect(LISTENERS.cockpit.tone).toBeLessThan(LISTENERS.chase.tone);
    expect(LISTENERS.cockpit.wind).toBeLessThan(LISTENERS.bumper.wind);
    expect(LISTENERS.heli.world).toBeGreaterThan(LISTENERS.cockpit.world);
    expect(LISTENERS.chase.exhaust).toBeGreaterThan(LISTENERS.cockpit.exhaust);
  });

  it("only lets the wipers be heard from inside the glass", () => {
    expect(LISTENERS.cockpit.wipers).toBe(1);
    for (const view of ["close", "chase", "far", "heli", "top"] as const) {
      expect(LISTENERS[view].wipers, view).toBe(0);
    }
  });

  it("answers a camera it does not know with the chase view", () => {
    expect(listenerFor("drone")).toBe(LISTENERS.chase);
    expect(listenerFor(null)).toBe(LISTENERS.chase);
    expect(listenerFor("cockpit")).toBe(LISTENERS.cockpit);
  });
});

describe("the world", () => {
  const STILL: WorldVoice = {
    biome: "taiga",
    timeOfDay: "day",
    wet: 0,
    gale: 0,
    air: 0,
    crowd: 0,
    stock: null,
    train: null,
    world: 1,
  };
  const ids = (voice: Partial<WorldVoice>): string[] =>
    worldRoster({ ...STILL, ...voice }).map((c) => c.id);

  it("gives each country and each hour its own roster", () => {
    expect(ids({})).toContain("bird_chirp");
    expect(ids({})).not.toContain("cicada");
    expect(ids({ biome: "desert" })).toContain("cicada");
    expect(ids({ biome: "desert" })).not.toContain("bird_chirp");
    expect(ids({ timeOfDay: "night" })).toContain("owl");
    expect(ids({ biome: "desert", timeOfDay: "night" })).toContain("cricket");
    expect(ids({ biome: "desert", timeOfDay: "night" })).toContain("coyote");
    expect(ids({ biome: "desert", timeOfDay: "day" })).not.toContain("coyote");
    // Every id on every roster is a sound the world bank has.
    for (const biome of ["taiga", "desert"] as const) {
      for (const timeOfDay of ["dawn", "day", "dusk", "night"] as const) {
        for (const id of ids({ biome, timeOfDay })) expect(WORLD_BANK[id], id).toBeDefined();
      }
    }
  });

  it("sends the birds to cover in the rain and puts the stock on the roster", () => {
    const dry = worldRoster(STILL).find((c) => c.id === "bird_chirp");
    const wet = worldRoster({ ...STILL, wet: 1 }).find((c) => c.id === "bird_chirp");
    expect(wet?.gain ?? 1).toBeLessThan((dry?.gain ?? 0) * 0.3);
    expect(ids({ stock: { kind: "cows", near: 0.5, pan: 0 } })).toContain("cow");
    expect(ids({ stock: { kind: "sheep", near: 0.5, pan: 0 } })).toContain("sheep");
  });

  it("is thinned by speed until nothing is left of it", () => {
    expect(callGainAtSpeed(0)).toBe(1);
    expect(callGainAtSpeed(0.3)).toBeLessThan(1);
    expect(callGainAtSpeed(0.7)).toBe(0);
    expect(worldTargets({ ...STILL, air: 1 }).trees.level).toBeLessThan(
      worldTargets(STILL).trees.level,
    );
  });

  it("only rumbles with a train on the line, and only murmurs near people", () => {
    expect(worldTargets(STILL).train.level).toBe(0);
    expect(worldTargets(STILL).crowd.level).toBe(0);
    expect(
      worldTargets({ ...STILL, train: { near: 0.8, pan: 0, horn: false, bell: false } }).train
        .level,
    ).toBeGreaterThan(0);
    expect(worldTargets({ ...STILL, crowd: 1 }).crowd.level).toBeGreaterThan(0);
  });

  it("raises every call on its roster over a minute at rest, and none at speed", () => {
    const rec = recorder();
    let seed = 7;
    const dice = (): number => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    const world = createWorld(rec, dice);
    for (let i = 0; i < 60 * 30; i++) {
      world.update(STILL, i / 30);
    }
    expect(rec.tones.length).toBeGreaterThan(5);
    expect(rec.layers.length).toBe(3);
    // At the top of fourth the wind is the only thing outside the car.
    rec.tones.length = 0;
    world.reset();
    for (let i = 0; i < 60 * 30; i++) world.update({ ...STILL, air: 1 }, 100 + i / 30);
    expect(rec.tones.length).toBe(0);
  });

  it("sounds the horn once per train and rings the bell twice a second", () => {
    const rec = recorder();
    const world = createWorld(rec, () => 0.5);
    const train = { near: 0.9, pan: 0.3, horn: true, bell: true };
    for (let i = 0; i < 60; i++) world.update({ ...STILL, air: 1, train }, i / 30);
    // The horn's chord is the only pair of voices in the world bank a second
    // and a half long — one horn is two of them.
    const horns = rec.tones.filter((t) => t.durationMs === 1500);
    expect(horns.length).toBe(2);
    // Two seconds of bell at half-second strikes: four or five, never sixty.
    const bells = rec.tones.filter((t) => t.from === 1880);
    expect(bells.length).toBeGreaterThanOrEqual(4);
    expect(bells.length).toBeLessThanOrEqual(5);
  });
});

describe("the road bed", () => {
  const NEUTRAL = {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    shiftUp: false,
    shiftDown: false,
    reset: false,
  };

  /** A stage with the countdown skipped and the car already rolling. */
  function rolling(): GameState {
    const state = createGame({ seed: 4242, length: "short", skipCountdown: true });
    for (let i = 0; i < 600; i++) step(state, { ...NEUTRAL, throttle: 1 });
    return state;
  }

  it("builds its layers once and steers them every frame, booking nothing ahead", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    for (let frame = 0; frame < 30; frame++) {
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    // Six engine layers, fourteen road layers, three of the world — and no
    // more, however many frames go by.
    expect(rec.layers.length).toBe(6 + 14 + 3);
    for (const layer of rec.layers) {
      expect(layer.sets.length).toBe(30);
      for (const { target, glide } of layer.sets) {
        expect(Number.isFinite(target.level)).toBe(true);
        expect(target.level).toBeGreaterThanOrEqual(0);
        expect(glide).toBeGreaterThan(0);
      }
    }
    // Nothing is booked on the clock: a one-shot the bed raises plays now.
    for (const voice of [...rec.tones, ...rec.noises]) expect(voice.at).toBeUndefined();
  });

  it("says nothing while the audio clock is locked, and starts the moment it is not", () => {
    const rec = recorder();
    rec.locked = true;
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    bed.update(state, 1 / 60);
    expect(rec.layers.length + rec.tones.length + rec.noises.length).toBe(0);
    rec.locked = false;
    bed.update(state, 1 / 60);
    expect(rec.layers.length).toBeGreaterThan(0);
  });

  it("rebuilds every layer on a context that was replaced under it", () => {
    // THE APP-SWITCH GUARD. iOS hands a backgrounded PWA a dead AudioContext
    // and the synth replaces it; every layer built on the old one is gone,
    // and a bed that kept steering ghosts would be silent for the rest of
    // the run.
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    bed.update(state, 1 / 60);
    const before = rec.layers.length;
    rec.generation++;
    bed.update(state, 1 / 60);
    expect(rec.layers.length).toBe(before * 2);
    expect(rec.layers.filter((l) => l.generation === 1).length).toBe(before);
  });

  it("tears its layers down on a reset and builds fresh ones for the next run", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    bed.update(state, 1 / 60);
    bed.reset();
    expect(rec.layers.every((l) => l.stopped)).toBe(true);
    bed.update(state, 1 / 60);
    expect(rec.layers.filter((l) => !l.stopped).length).toBe(6 + 14 + 3);
  });

  it("goes quiet the moment nothing is hearing the run, and comes back", () => {
    // THE PAUSE CARD. Nothing is booked ahead, so a bed that is merely no
    // longer fed holds its last level: the engine note and the wind would
    // carry on behind a card that stopped the car. Silence has to be said.
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    bed.update(state, 1 / 60);
    bed.silence();
    expect(rec.layers.every((l) => l.stopped)).toBe(true);
    // …and said on every frame the card is up, which must cost nothing and
    // build nothing.
    const built = rec.layers.length;
    for (let frame = 0; frame < 30; frame++) bed.silence();
    expect(rec.layers.length).toBe(built);
    bed.update(state, 1 / 60);
    expect(rec.layers.filter((l) => !l.stopped).length).toBe(6 + 14 + 3);
  });

  it("keeps what a hushed run has already spent, where a reset hands it back", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = createGame({ seed: 4242, length: "short" });
    while (state.t < 2) step(state, NEUTRAL);
    bed.update(state, 1 / 60);
    // The marshal's whistle and the countdown's lights: cues raised off the
    // clock, each owed once per run.
    const spent = rec.tones.length + rec.noises.length;
    expect(spent).toBeGreaterThan(0);
    bed.silence();
    bed.update(state, 1 / 60);
    expect(rec.tones.length + rec.noises.length).toBe(spent);
    bed.reset();
    bed.update(state, 1 / 60);
    expect(rec.tones.length + rec.noises.length).toBeGreaterThan(spent);
  });

  it("follows the engine's revs, and hears more of it from the cockpit", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    bed.update(state, 1 / 60);
    const hum = rec.layers.find((l) => l.spec.kind === "tone" && l.spec.filter?.type === "lowpass");
    expect(hum).toBeDefined();
    expect(hum?.sets[0]?.target.hz).toBeCloseTo(noteHz(rpmAt(state.car.rev)), 3);
    const outside = hum?.sets[0]?.target.level ?? 0;
    bed.setView("cockpit");
    bed.update(state, 1 / 60);
    expect(hum?.sets[1]?.target.level ?? 0).toBeGreaterThan(outside);
  });

  it("counts the lights down once each, and blows the marshal's whistle once", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = createGame({ seed: 7, length: "short" });
    let ticks = 0;
    const before = () => rec.tones.filter((t) => t.from === 660).length;
    while (state.t < TUNING.intro + TUNING.countdown) {
      const was = before();
      bed.update(state, TUNING.dt);
      rec.clock += TUNING.dt;
      if (before() > was) ticks++;
      step(state, NEUTRAL);
    }
    expect(ticks).toBe(TUNING.countdown);
    expect(rec.tones.filter((t) => t.from === 2350).length).toBe(1);
  });

  it("crackles on a lift at revs, and not twice inside a second", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    state.car.rev = 0.8;
    // A second of hard acceleration loads the engine up…
    for (let i = 0; i < 60; i++) {
      state.car.u += 0.06;
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    // The crackle's first pop is the only forty-millisecond brown burst the
    // bed can raise; its pitch is rolled, so it is told by its length.
    const pops = () => rec.noises.filter((n) => n.color === "brown" && n.durationMs === 40).length;
    expect(pops()).toBe(0);
    // …and a second of coasting is the lift.
    for (let i = 0; i < 60; i++) {
      state.car.u -= 0.03;
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    expect(pops()).toBe(1);
    expect(bed.boost()).toBeLessThan(0.3);
  });

  it("works the wipers inside the car in the rain, and nowhere else", () => {
    const rec = recorder();
    const bed = createDriveBed(rec, () => 0.5);
    const state = rolling();
    state.env.weather = "rain";
    const strokes = () =>
      rec.noises.filter((n) => n.filter?.frequency === 900 && n.filter.to === 1700).length;
    bed.setView("chase");
    for (let i = 0; i < 180; i++) {
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    expect(strokes()).toBe(0);
    bed.setView("cockpit");
    for (let i = 0; i < 180; i++) {
      bed.update(state, 1 / 60);
      rec.clock += 1 / 60;
    }
    // Three seconds of a stroke every three quarters of a second.
    expect(strokes()).toBeGreaterThanOrEqual(3);
    expect(strokes()).toBeLessThanOrEqual(5);
  });
});

describe("the shape of a voice", () => {
  const SHAPES: [string, ReturnType<typeof envelopeShape>][] = [
    ["a held pad", envelopeShape(0.05, 0, 0.9, 300, 400, "exp")],
    ["a plucked note", envelopeShape(0.06, 0, 0.045, 0, 0, "exp")],
    ["a bare hi-hat burst", envelopeShape(0.009, 0, 0.014, 0, 0, "lin")],
    ["a swell", envelopeShape(0.03, 0, 0.4, 40, 200, "exp")],
  ];

  it("never starts a voice at full scale, however short or unshaped", () => {
    for (const [name, steps] of SHAPES) {
      expect(steps[0].value, name).toBeLessThanOrEqual(0.0001);
      expect(steps[0].ramp, name).toBe("set");
      expect(steps[1].at, name).toBeGreaterThan(steps[0].at);
      expect(steps[1].ramp, name).not.toBe("set");
    }
  });

  it("gets up to its peak fast enough that nothing is softened", () => {
    for (const [name, steps] of SHAPES) {
      if (name === "a held pad" || name === "a swell") continue;
      expect(steps[1].at, name).toBeLessThanOrEqual(MIN_ATTACK_MS / 1000 + 1e-9);
      expect(steps[1].value, name).toBeGreaterThan(0);
    }
  });

  it("holds a pad at its peak instead of falling through the sustain", () => {
    const pad = envelopeShape(0.05, 0, 0.9, 300, 400, "exp");
    const peaks = pad.filter((p) => p.value > 0.001);
    expect(peaks.length).toBe(2);
    expect(peaks[1].at - peaks[0].at).toBeCloseTo(0.4, 3);
    expect(pad[pad.length - 1].value).toBeLessThanOrEqual(0.0001);
  });

  it("saturates softly — the curve never steepens into a clip", () => {
    // A curve steep enough to be a square wave at half travel aliases, and
    // over a Bluetooth codec that is the torn-speaker sound.
    expect(shaperSteepness(0)).toBe(1);
    expect(shaperSteepness(1)).toBeLessThanOrEqual(10);
    expect(shaperSteepness(0.5)).toBeGreaterThan(shaperSteepness(0.2));
    expect(shaperPush(1)).toBeLessThanOrEqual(4);
  });
});

describe("what a filter may be asked for", () => {
  /** The sample rates an AudioContext actually comes back at: a desktop's,
   * and the ones iOS picks from the live Bluetooth route. */
  const RATES = [48000, 44100, 32000, 24000, 16000, 8000];
  const HEADSET_CEILING = 16000 * MAX_CUTOFF_RATIO;

  /** Every filter any sound in the game can ask for, by where it is written. */
  function authoredCutoffs(): { where: string; hz: number }[] {
    const out: { where: string; hz: number }[] = [];
    for (const [name, bank] of BANKS) {
      for (const [id, def] of Object.entries(bank)) {
        for (const voice of def.voices) {
          if (!voice.filter) continue;
          out.push({ where: `${name}/${id}`, hz: voice.filter.frequency });
          if (voice.filter.to !== undefined)
            out.push({ where: `${name}/${id} sweep`, hz: voice.filter.to });
        }
      }
    }
    for (const [name, track] of SCORES) {
      for (const [voice, patch] of Object.entries(track.instruments)) {
        if (!patch.filter) continue;
        out.push({ where: `${name}/${voice}`, hz: patch.filter.frequency });
        if (patch.filter.to !== undefined)
          out.push({ where: `${name}/${voice} sweep`, hz: patch.filter.to });
      }
    }
    return out;
  }

  it("holds every authored cutoff under Nyquist at every rate a context comes back at", () => {
    const cutoffs = authoredCutoffs();
    expect(cutoffs.length).toBeGreaterThan(40);
    for (const rate of RATES) {
      for (const { where, hz } of cutoffs) {
        const safe = safeCutoff(hz, rate);
        expect(safe, `${where} @ ${rate} Hz`).toBeLessThan(rate / 2);
        expect(safe, `${where} @ ${rate} Hz`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("leaves every authored cutoff untouched at desktop rates", () => {
    for (const rate of [44100, 48000]) {
      for (const { where, hz } of authoredCutoffs()) {
        expect(safeCutoff(hz, rate), `${where} @ ${rate} Hz`).toBe(Math.max(20, hz));
      }
    }
  });

  it("bites on a cutoff that would go over, at the rate iOS hands a headset", () => {
    const OVER = 8200;
    expect(safeCutoff(OVER, 16000)).toBe(HEADSET_CEILING);
    expect(safeCutoff(OVER, 48000)).toBe(OVER);
    expect(safeCutoff(0, 48000)).toBe(20);
  });

  it("keeps every kit's hats and shakers inside what a 16 kHz session can carry", () => {
    // A hi-hat authored entirely above 8 kHz has almost nothing left to pass
    // once the clamp has held it off Nyquist. The bar is on the content.
    for (const [name, track] of SCORES) {
      const hats = Object.entries(track.instruments).filter(
        ([, patch]) => patch.wave === "noise" && patch.filter?.type === "highpass",
      );
      expect(hats.length, `${name} has no hat`).toBeGreaterThan(0);
      for (const [voice, patch] of hats) {
        expect(patch.filter?.frequency ?? 0, `${name}/${voice}`).toBeLessThan(HEADSET_CEILING);
      }
    }
  });

  it("keeps every bed's cutoff inside the headset's band across the whole range", () => {
    // The beds' cutoffs are computed, not authored, so the sweep is the
    // only place they can be read. Nothing the engine or the road asks for
    // may go where a 16 kHz session cannot follow.
    for (const rev of [0, 0.5, 1]) {
      for (const load of [0, 1]) {
        const engine = engineTargets(
          { rpm: rpmAt(rev), rev, load, wear: 1 },
          { engine: 1, exhaust: 1, tone: 1 },
        );
        for (const [layer, target] of Object.entries(engine)) {
          if (target.cutoff !== undefined)
            expect(target.cutoff, layer).toBeLessThan(HEADSET_CEILING);
        }
      }
    }
    for (const surface of Object.keys(SURFACES)) {
      for (const wet of [0, 1]) {
        const road = roadTargets(
          {
            speed: 60,
            air: 1,
            surface,
            corner: 1,
            slide: 1,
            spin: 1,
            sideways: 8,
            airborne: false,
            wet,
            squall: 1,
            gale: 1,
          },
          { tyres: 1, scrub: 1, wind: 1, weather: 1 },
        );
        for (const [layer, target] of Object.entries(road)) {
          if (target.cutoff !== undefined)
            expect(target.cutoff, `${surface}/${layer}`).toBeLessThan(HEADSET_CEILING);
        }
      }
    }
  });
});
