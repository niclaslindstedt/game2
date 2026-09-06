// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WORLD — what the country sounds like with the car taken out of it.
//
// Four layers that never stop and a roster of calls raised on a loose
// clock, all read off the state rather than reported by the engine, because
// the engine has no weather, no birds and no idea a train has a horn:
//
//   TREES   wind in the canopy (or across the flats): a soft pink hush that
//           rises with the gale and is the floor the birds sit on
//   PASS    the wind over a col: thin, cold and gusting, there only above
//           the treeline and stronger the higher the road climbs
//   CROWD   the murmur of the start control and the finish — people, from
//           a distance, only near the stands and the line
//   TRAIN   the rumble of a consist on the line, by how far off it is
//
// and the calls: birds by day in the taiga, cicadas by day in the desert,
// choughs, cowbells and a marmot on the mountain, meltwater beside an
// alpine road, an owl at dusk, crickets and a coyote after dark, a cow or a
// sheep behind a fence the road runs past, the diesel's horn as it comes to
// the crossing and the bell on the crossing itself — and, over the northern
// countries, GEESE AND SWANS going over, which is the one call on the
// roster that comes from the sky and the one the SEASON decides: a skein on
// passage in spring and autumn is a different sound from the pair that
// nests down the valley all summer. `skein.ts` draws them.
//
// TWO RULES KEEP THE WORLD A WORLD. It is QUIET — a bird that can be heard
// over a drift is a bird inside the car — and it is THINNED BY SPEED: at
// 140 km/h the wind is the only thing outside the car anyone can hear, so
// every call fades with `air` and the roster is mostly silent down a
// straight. The world is what the player hears at the start line, in a
// hairpin, and in the moment after a crash.
//
// DOM-free: the roster and the layer targets are pure functions, and the
// scheduler takes its clock and its dice as arguments so the tests can run
// it by hand.

import type { BiomeId, BiomeRules, Season, TimeOfDay } from "@engine";

import type { LayerSpec, LayerTarget, Synth } from "../../lib/voice.ts";

import { WORLD_BANK } from "./bank-world.ts";
import { playSound } from "./play.ts";
import { createRack, type Rack } from "./rack.ts";
import type { PlayShape } from "./types.ts";

/** What the country is doing around the car this instant. */
export type WorldVoice = {
  biome: BiomeId;
  timeOfDay: TimeOfDay;
  /** Which season is being driven — read by the birds on passage, and by
   * nothing else: everything else out there sounds the same in May as it
   * does in September. */
  season: Season;
  /** How wet the stage is, 0..1 — rain quiets the birds. */
  wet: number;
  /** How much wind is in the air, 0..1 of a gale. */
  gale: number;
  /** How far above the treeline the car is, 0..1 — nothing in the forest
   * and the valley, 1 at the snowline (`exposureOf`). What the pass wind
   * reads, what takes the trees out of the hush, and what moves the herd
   * away and the marmots closer. */
  exposure: number;
  /** How near running water the road is, 0..1 — a ford, a stream under a
   * deck — for the meltwater. */
  water: number;
  /** How fast the car is going, 0..1 of what it can do — what thins the
   * roster. */
  air: number;
  /** How near the crowd is, 0..1 — the start control and the finish. */
  crowd: number;
  /** The nearest paddock the road runs past, or none. */
  stock: { kind: "cows" | "sheep"; near: number; pan: number } | null;
  /** The train on the line, or none. `near` is 0..1 by distance; `horn`
   * says it is on its way to the crossing and close enough to sound;
   * `bell` says the car is at the crossing while it is on the line. */
  train: { near: number; pan: number; horn: boolean; bell: boolean } | null;
  /** The listener's own scale on all of it. */
  world: number;
};

export type WorldLayer = "trees" | "pass" | "crowd" | "train";

export const WORLD_LAYERS: Record<WorldLayer, LayerSpec> = {
  trees: { kind: "noise", color: "pink", filter: { type: "lowpass", q: 0.7 } },
  // Thin on purpose: a wind with nothing to blow through is a whistle over
  // rock, not a rush through leaves, and the band is what says COLD.
  pass: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 1.4 } },
  crowd: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 0.9 }, echo: 0.2 },
  train: { kind: "noise", color: "brown", filter: { type: "lowpass", q: 1.1 } },
};

/** Slow, all of them: the world does not happen, it is there. The pass is
 * the slowest, so its gusts arrive rather than switch. */
export const WORLD_GLIDE: Record<WorldLayer, number> = {
  trees: 0.5,
  pass: 0.6,
  crowd: 0.4,
  train: 0.3,
};

/** The hush a country has with no wind at all. The taiga's is the trees;
 * the desert's is nearly nothing, because there is nearly nothing there to
 * move; the alpine's is a thinner forest than the taiga's — spruce and
 * larch on a slope, with pasture between — and it gives out with the trees
 * as the road climbs (see `exposure`). */
const HUSH: Record<BiomeId, number> = { taiga: 0.006, desert: 0.0025, alpine: 0.0045 };

/** THE WIND OVER THE PASS: how loud with nothing else blowing, and how much
 * a gale adds. Even a still day has air moving over a col, which is why the
 * floor is not zero — but it is a floor the car's own wind buries. */
const PASS = { still: 0.007, gale: 0.014 };

/**
 * How far above the treeline a height stands, 0..1 — nothing at the
 * treeline and below, 1 at the snowline. A country with no snowline has no
 * pass, whatever its hills do: the taiga's crests are inside its forest.
 */
export function exposureOf(y: number, zones: BiomeRules["land"]["zones"]): number {
  if (zones.snow === null) return 0;
  const span = zones.snow - zones.treeline;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (y - zones.treeline) / span));
}

/** Where every layer of the world should be. */
export function worldTargets(voice: WorldVoice): Record<WorldLayer, LayerTarget> {
  const w = voice.world;
  // The car's own wind takes over from everything the air does out there —
  // a hush nobody can hear at speed is a hush that is costing the mix for
  // nothing.
  const still = 1 - 0.7 * voice.air;
  // The canopy: a floor that the gale lifts, and that thins with the trees
  // as the road climbs out of them.
  const hush = (HUSH[voice.biome] + 0.02 * voice.gale) * (1 - 0.6 * voice.exposure) * still;
  // The pass: there only above the treeline, louder the higher the road
  // is, and gusting with the wind the engine is already breathing — so the
  // squall the car is shoved by is the one the player hears cross the col.
  const pass = (PASS.still + PASS.gale * voice.gale) * voice.exposure * still;
  return {
    trees: { level: hush * w, cutoff: 500 + 900 * voice.gale },
    pass: { level: pass * w, cutoff: 900 + 1100 * voice.gale },
    crowd: { level: 0.014 * voice.crowd * w, cutoff: 900 },
    train: {
      level: voice.train ? 0.03 * voice.train.near * voice.train.near * w : 0,
      cutoff: voice.train ? 120 + 380 * voice.train.near : 120,
    },
  };
}

/** One kind of call the world can make: which sound, how often, and how
 * loud, for the setting it is in. */
export type WorldCall = {
  id: string;
  /** Seconds between two of them, min and max — the scheduler rolls inside. */
  gap: [number, number];
  gain: number;
};

/**
 * THE BIRDS ON PASSAGE — geese and swans going over, in the two northern
 * countries only. What the season buys is the whole point of them:
 *
 *   SPRING / AUTUMN  skeins on the move, so they are OFTEN — a stage should
 *                    have one over it — and they go over at night too,
 *                    which is when a person is most likely to have heard
 *                    real ones and is free of every competing call.
 *   SUMMER           the same birds between one lake and the next, so they
 *                    are a quarter as often and they are day birds.
 *
 * A skein sounds high and far off, so unlike the trees and the choughs it
 * is barely touched by rain — but nothing sets off in a gale, and the
 * desert has neither bird.
 */
function passageCalls(voice: WorldVoice, dry: number): WorldCall[] {
  if (voice.biome === "desert") return [];
  const passage = voice.season !== "summer";
  const night = voice.timeOfDay === "night";
  if (!passage && night) return [];
  // High and going somewhere: the weather thins them rather than grounding
  // them, and only a gale actually keeps them down.
  const flying = (0.35 + 0.65 * dry) * (1 - 0.7 * voice.gale);
  if (passage) {
    return night
      ? [{ id: "goose_honk", gap: [20, 50], gain: 0.75 * flying }]
      : [
          { id: "goose_honk", gap: [14, 34], gain: flying },
          { id: "swan_call", gap: [34, 80], gain: 0.9 * flying },
        ];
  }
  return [
    { id: "goose_honk", gap: [40, 95], gain: 0.7 * flying },
    { id: "swan_call", gap: [50, 120], gain: 0.8 * flying },
  ];
}

/** THE ROSTER — which calls a setting has in it, and how busy each is. The
 * decisions: the taiga is birds and nothing else by day; the desert is
 * insects; the mountain is choughs above the treeline and cowbells below
 * it, with a marmot from the scree once in a long while and meltwater
 * wherever the road meets a stream; the north's two skies both have geese and
 * swans crossing them (`passageCalls`); dusk hands all of them over to an owl;
 * night belongs to the crickets and, out on the flats, a coyote. Rain
 * sends the birds to cover, and nothing flies in a storm or a gale. */
export function worldRoster(voice: WorldVoice): WorldCall[] {
  const { biome, timeOfDay, wet, gale, exposure } = voice;
  const dry = 1 - 0.85 * wet;
  const calls: WorldCall[] = [];
  calls.push(...passageCalls(voice, dry));
  if (biome === "alpine") {
    // A flock stays down in weather: rain thins the choughs like every
    // bird, a storm grounds them outright, and a gale keeps them on the
    // rock. The herd is on the alm and is left behind as the road climbs;
    // the marmots are the other way about.
    const flying = dry * (1 - wet) * (1 - 0.6 * gale);
    const alm = 1 - 0.8 * exposure;
    const scree = 0.4 + 0.6 * exposure;
    if (timeOfDay === "day") {
      calls.push({ id: "chough", gap: [5, 14], gain: flying });
      calls.push({ id: "cowbell", gap: [6, 16], gain: alm * dry });
      calls.push({ id: "marmot", gap: [40, 110], gain: scree * dry });
      calls.push({ id: "raven", gap: [25, 60], gain: 0.8 });
    } else if (timeOfDay === "dawn" || timeOfDay === "dusk") {
      // The herd is on the move at both ends of the day, so the bells are
      // busier than at noon; the flock is going to roost or coming off it.
      calls.push({ id: "chough", gap: [10, 26], gain: 0.7 * flying });
      calls.push({ id: "cowbell", gap: [5, 12], gain: alm * dry });
      calls.push({ id: "marmot", gap: [60, 140], gain: 0.6 * scree * dry });
      calls.push({ id: "owl", gap: [14, 34], gain: 0.7 });
    } else {
      // A summer herd stays out on the alm overnight; a bell now and then
      // is what a mountain night sounds like from a road.
      calls.push({ id: "owl", gap: [9, 24], gain: 0.9 });
      calls.push({ id: "cowbell", gap: [14, 34], gain: 0.4 * alm * dry });
    }
    if (voice.water > 0) calls.push({ id: "meltwater", gap: [4, 9], gain: voice.water });
  } else if (biome === "taiga") {
    if (timeOfDay === "day" || timeOfDay === "dawn") {
      calls.push({ id: "bird_chirp", gap: [2, 6], gain: dry });
      calls.push({ id: "bird_trill", gap: [6, 16], gain: dry });
      calls.push({ id: "raven", gap: [18, 50], gain: 0.9 });
    } else if (timeOfDay === "dusk") {
      calls.push({ id: "bird_chirp", gap: [5, 14], gain: 0.7 * dry });
      calls.push({ id: "owl", gap: [9, 24], gain: 1 });
      calls.push({ id: "raven", gap: [25, 60], gain: 0.8 });
    } else {
      calls.push({ id: "owl", gap: [7, 20], gain: 1 });
      calls.push({ id: "bird_chirp", gap: [20, 50], gain: 0.4 * dry });
    }
  } else {
    if (timeOfDay === "day") {
      calls.push({ id: "cicada", gap: [2.5, 7], gain: 1 });
      calls.push({ id: "raven", gap: [20, 55], gain: 0.8 });
    } else if (timeOfDay === "dawn" || timeOfDay === "dusk") {
      calls.push({ id: "cicada", gap: [5, 12], gain: 0.7 });
      calls.push({ id: "cricket", gap: [2, 5], gain: 0.8 });
      calls.push({ id: "owl", gap: [14, 34], gain: 0.8 });
    } else {
      calls.push({ id: "cricket", gap: [1.4, 3.5], gain: 1 });
      calls.push({ id: "coyote", gap: [22, 60], gain: 1 });
      calls.push({ id: "owl", gap: [15, 40], gain: 0.7 });
    }
  }
  if (voice.stock) {
    calls.push({
      id: voice.stock.kind === "cows" ? "cow" : "sheep",
      gap: voice.stock.kind === "cows" ? [4, 9] : [2.5, 6],
      gain: voice.stock.near,
    });
  }
  return calls;
}

/** How much of a call survives the car's own speed. The taper is steep:
 * past half of what the car can do the roster is as good as silent. */
export function callGainAtSpeed(air: number): number {
  return Math.max(0, 1 - 1.6 * air);
}

/** How often the crossing bell strikes, s. */
const BELL_GAP_S = 0.5;

/** The world's scheduler, for the life of one app. */
export type World = {
  /** Steer the layers and raise whatever calls are due. `now` is the audio
   * clock, in seconds. */
  update: (voice: WorldVoice, now: number) => void;
  /** Forget every clock — a new run's first bird is not owed by the last. */
  reset: () => void;
  /** Tear the layers down. */
  stop: () => void;
};

export function createWorld(synth: Synth, random: () => number = Math.random): World {
  const rack: Rack<WorldLayer> = createRack(synth, WORLD_LAYERS, WORLD_GLIDE);
  /** When each call is next due, by id. */
  const due = new Map<string, number>();
  let hornSounded = false;
  let bellAt = -Infinity;

  const roll = (gap: [number, number]): number => gap[0] + (gap[1] - gap[0]) * random();

  return {
    update(voice, now) {
      rack.apply(worldTargets(voice));

      // The roster. A call that is not on it forgets its clock, so a bird
      // that went quiet at dusk does not owe a chirp the moment the sun is
      // back — it rolls a fresh gap like everything else.
      const roster = worldRoster(voice);
      const onRoster = new Set(roster.map((c) => c.id));
      for (const id of [...due.keys()]) if (!onRoster.has(id)) due.delete(id);
      const speedGain = callGainAtSpeed(voice.air) * voice.world;
      for (const call of roster) {
        const at = due.get(call.id);
        if (at === undefined) {
          // The first one comes sooner than the gap says: a stage should
          // have a bird in it before the lights go out.
          due.set(call.id, now + roll(call.gap) * 0.35);
          continue;
        }
        if (now < at) continue;
        due.set(call.id, now + roll(call.gap));
        const gain = call.gain * speedGain;
        if (gain < 0.05) continue;
        const shape: PlayShape = {
          gain,
          // Every call is a little different from the last, and it comes
          // from somewhere: a roster of identical chirps from dead centre is
          // a ringtone, not a forest.
          pitch: 0.94 + 0.12 * random(),
          pan:
            voice.stock && (call.id === "cow" || call.id === "sheep")
              ? voice.stock.pan
              : (random() - 0.5) * 1.4,
        };
        playSound(synth, WORLD_BANK, call.id, shape);
      }

      // The railway. The horn sounds once per train, as it comes to the
      // crossing; the bell strikes for as long as the car is at the crossing
      // with a train on the line.
      const train = voice.train;
      if (train?.horn && !hornSounded) {
        hornSounded = true;
        playSound(synth, WORLD_BANK, "train_horn", {
          gain: (0.4 + 0.6 * train.near) * voice.world,
          pitch: 0.9 + 0.1 * train.near,
          pan: train.pan,
        });
      }
      if (!train) hornSounded = false;
      if (train?.bell && now - bellAt >= BELL_GAP_S) {
        bellAt = now;
        playSound(synth, WORLD_BANK, "crossing_bell", { gain: 0.8 * voice.world, pan: train.pan });
      }
    },

    reset() {
      due.clear();
      hornSounded = false;
      bellAt = -Infinity;
    },

    stop() {
      rack.stop();
    },
  };
}
