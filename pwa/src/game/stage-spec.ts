// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH STAGE IS STANDING — the one description every way into a run is
// reduced to before the engine is asked for anything, and the comparison that
// says whether two of them are the same world.
//
// It is its own module rather than a block of App.tsx because it is what
// everything that BUILDS a run has to agree on: the menu's ways in, a tooling
// link, the menu's own demo backdrop, and a replay rebuilding the world a
// recorded tape was driven in (replay.ts). DOM-free, so the root suite can
// hold the comparison to its contract.

import {
  DEFAULT_SANDSTORMS,
  NUMERIC_KNOBS,
  type GearboxMode,
  type GridSlot,
  type Season,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Weather,
} from "@engine";

/** Everything that decides WHICH stage is standing: change any of it and
 * the run is rebuilt. */
export type StageSpec = {
  seed: number;
  length: StageLength;
  /** R25 — a sprint from a start to a finish, or a circuit raced over laps. */
  shape: StageShape;
  /** Laps a circuit is raced over; 1 on anything that does not come back. */
  laps: number;
  /** The generator's dials — what KIND of country the seed is built in. */
  knobs: StageKnobs;
  carId: string;
  /** The box, when the stage insists on one. Normally absent: which gearbox
   * the car is driven with is the PLAYER's option, read fresh off OPTIONS
   * every time a stage is built. Two things pin it — the benchmark, because
   * the two boxes scale the gear tops and the drive between them
   * (`gearedSpec`) and a measurement that inherited one would be timing a
   * different car, and a REPLAY, because the box the run was driven in is
   * part of the run. */
  gearbox?: GearboxMode;
  /** The hour the stage starts at, 0..24 (`RaceEnv.hour`). */
  hour: number;
  weather: Weather;
  season: Season;
  /** The air at the datum, °C, or null (or absent — the campaign's levels
   * never name one) for the season's own in the country (climate.ts).
   * Part of the ROAD, with the season: the two decide what the compiled
   * track is made of, so the cached track is keyed on both. */
  temperature?: number | null;
  /** How often the SANDSTORMS come, 0..1, or absent for the default
   * (`DEFAULT_SANDSTORMS`) — read only in a country whose wind lifts the
   * ground (`BiomeRules.blown`, `game/sandstorm.ts`). Unlike the season
   * and the temperature it is NOT part of the road: the fronts cross a
   * stage that was compiled without knowing about them, so the cached
   * track is untouched by it and only the RUN is rebuilt. */
  sandstorms?: number;
  /** What a hit COSTS this car, 0..1, when the stage insists on one. Normally
   * absent: it is a reading of the difficulty the player is racing at
   * (`damageScaleFor`), taken fresh on every build. A REPLAY pins it, because
   * it is the one difficulty setting that reaches the physics and a recording
   * driven at another one bends a different amount of metal. */
  damageScale?: number;
  /** The menu's demo has no grid to sit on — nobody is waiting for it. */
  skipCountdown: boolean;
  /** Where the player is stood when the whole field leaves together: the
   * last row of the mass-start grid, deepest into the apron behind the start
   * gate, and the drive it is owed for the rows in front of it
   * (engine/sim/grid.ts). Null on every other start — a rally interval, a
   * time trial, Roam — where the player is on the line on their own and owes
   * nobody anything. */
  grid: GridSlot | null;
  /** How many cars the stage is BUILT FOR, the player included; one — or
   * absent — on every start that is one car on the line.
   *
   * It is part of the STAGE rather than of the field because it moves the
   * ground: a mass start stands one row per car behind the start gate, and
   * the run-up has to be long enough to hold the back one (`apronForGrid`).
   * The route never moves for it — the same seed is the same road whoever is
   * standing on it — but the apron and the shelf under it do, which makes
   * this part of what the compiled track is keyed on. */
  cars?: number;
  /** THE TRAINING GROUND instead of a generated stage: the hand-built
   * arena (`mapgen/arena.ts`) and the approach road it stands on. It is a
   * flag rather than a length or a shape because it is neither — nothing
   * about the seed, the band, the dials or the laps describes it, and a
   * stage spec that pretended otherwise would send the generator looking
   * for a road that was never generated. */
  arena?: boolean;
};

/** Whether two specs are the same world — the question `applyStage` asks
 * before it rebuilds anything. Every field that moves the ROAD or the RUN is
 * compared; the ones that do not (the box, the damage scale) are read fresh
 * on each build and are deliberately not here. */
export function sameStage(a: StageSpec | null, b: StageSpec): boolean {
  return (
    a !== null &&
    (a.arena ?? false) === (b.arena ?? false) &&
    a.seed === b.seed &&
    a.length === b.length &&
    a.shape === b.shape &&
    a.laps === b.laps &&
    a.knobs.biome === b.knobs.biome &&
    NUMERIC_KNOBS.every((key) => a.knobs[key] === b.knobs[key]) &&
    a.carId === b.carId &&
    a.gearbox === b.gearbox &&
    a.hour === b.hour &&
    a.weather === b.weather &&
    a.season === b.season &&
    (a.temperature ?? null) === (b.temperature ?? null) &&
    (a.sandstorms ?? DEFAULT_SANDSTORMS) === (b.sandstorms ?? DEFAULT_SANDSTORMS) &&
    a.skipCountdown === b.skipCountdown &&
    a.grid?.number === b.grid?.number &&
    a.grid?.back === b.grid?.back &&
    // The field's depth is the apron's length, and the apron is compiled
    // into the track — so a stage asked for with more cars on it is not the
    // stage already standing, even where everything else about it matches.
    (a.cars ?? 1) === (b.cars ?? 1)
  );
}
