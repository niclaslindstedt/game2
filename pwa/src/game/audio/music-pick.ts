// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH SCORE A STAGE GETS — the one table that turns a country, a sky and a
// shape of road into a piece of music.
//
// DOM-free and synth-free on purpose: the app asks it as a run starts, the
// tests read it, and nothing about it needs a browser. The scores it names
// live in `scores/` and are loaded by `music.ts` only when one is wanted.
//
// THE DECISIONS, in the order they win:
//
//   1. THE SHAPE OF THE ROAD comes first. A circuit is laps of one loop and
//      wants something that turns over quickly; an endless stage is a
//      cruise with no finish to build toward and wants the long one. Both
//      trump the weather, because a player picked them.
//   2. THE COUNTRY. The desert has its own score whatever the sky is doing
//      — its storm is sand, not rain, and the dry score fits it.
//   3. THE SKY over the taiga. A storm or rain takes the dark score; dusk,
//      night and dawn take the cold one; a clear day is the anthem.

import type { BiomeId, GameState, TimeOfDay, Weather } from "@engine";

/** Every score this build has. */
export type TrackId = "menu" | "taiga" | "spruce" | "polar" | "desert" | "circuit" | "endless";

/** What the picker reads. */
export type Setting = {
  biome: BiomeId;
  weather: Weather;
  timeOfDay: TimeOfDay;
  circuit: boolean;
  endless: boolean;
};

export function trackFor(setting: Setting): TrackId {
  if (setting.circuit) return "circuit";
  if (setting.endless) return "endless";
  if (setting.biome === "desert") return "desert";
  if (setting.weather !== "clear") return "spruce";
  if (setting.timeOfDay !== "day") return "polar";
  return "taiga";
}

/** The score for the stage a state is on. */
export function stageTrack(state: Pick<GameState, "track" | "env">): TrackId {
  return trackFor({
    biome: state.track.knobs.biome,
    weather: state.env.weather,
    timeOfDay: state.env.timeOfDay,
    circuit: state.track.circuit,
    endless: state.track.endless,
  });
}
