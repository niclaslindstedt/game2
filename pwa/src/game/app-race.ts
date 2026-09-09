// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A RUN IS STOOD UP FROM: the training ground as a spec, the backdrop
// a menu page drives under, how many cars a mode puts on the grid and where
// the player starts on it, the difficulty the rivals are given, and the
// camera a run opens on. One question each, and each of them asked in more
// than one place — the menu's way in, a `?mode=` link, a replay — which is
// why none of them lives inside `App.tsx`'s own handlers.

import {
  ARENA_KNOBS,
  DEFAULT_KNOBS,
  GRID_MAX,
  GRID_MIN,
  type GridSlot,
  type Difficulty,
} from "@engine";

import { lapsOverride } from "./app-url.ts";
import type { CameraMode } from "./camera.ts";
import { playerSlot, RALLY_FIELD, type FieldPlan } from "./standings.ts";
import { type StageSpec } from "./stage-spec.ts";
import { gridSize, raceLaps, type PlayMode, type RaceSettings } from "./menu.tsx";
import { type MenuPage } from "./main-menu.tsx";
import { demoStage } from "./menu-demo.ts";
import { TRAINING_LEVEL, TRAINING_LOCATION } from "./training.ts";
import { PLAY_CAMERAS, type PlayCamera } from "./settings.ts";

/** THE TRAINING GROUND as a stage spec. There is only one of it — the
 * place is authored (`mapgen/arena.ts`), the conditions are fixed, and the
 * only thing a player chooses is the car — so it is stated once here and
 * read by the menu's way in and by a `?mode=training` link alike. */
export function trainingSpec(carId: string): StageSpec {
  return {
    arena: true,
    seed: TRAINING_LEVEL.seed,
    length: TRAINING_LEVEL.length,
    shape: "sprint",
    laps: 1,
    // The dials the arena's own country was built with, so the debug
    // overlay states the ground that is actually there.
    knobs: { ...DEFAULT_KNOBS, ...ARENA_KNOBS, biome: TRAINING_LOCATION.biome },
    carId,
    hour: TRAINING_LEVEL.hour,
    weather: TRAINING_LEVEL.weather,
    season: TRAINING_LEVEL.season,
    // Nobody is waiting on the line: the training ground is a place you
    // arrive at, not a stage you are sent down.
    skipCountdown: true,
    grid: null,
  };
}

/** What a menu page wants standing behind it, and how it is framed.
 *
 * `standing` is the stage on screen, for the demo to take its road from —
 * null where the demo is to roll one of its own (see `demoStage`). */
export function backdropFor(
  page: MenuPage,
  race: RaceSettings,
  seed: number,
  demoSeed: number,
  standing: StageSpec | null,
) {
  if (page.page === "roam") {
    return {
      camera: "map" as CameraMode,
      stage: {
        seed,
        length: race.length,
        shape: race.shape,
        laps: lapsOverride() ?? raceLaps(race),
        knobs: race.knobs,
        carId: race.carId,
        hour: race.hour,
        weather: race.weather,
        season: race.season,
        temperature: race.temperature,
        sandstorms: race.sandstorms,
        skipCountdown: true,
        grid: null,
      } satisfies StageSpec,
    };
  }
  return { camera: "drone" as CameraMode, stage: demoStage(race, demoSeed, standing) };
}

/** What a run is CALLED, for the line the log opens with. */
export const MODE_NAME: Record<PlayMode, string> = {
  campaign: "Campaign",
  timetrial: "Time trial",
  headsup: "Heads up",
  roam: "Roam",
  training: "Training",
  replay: "Replay",
};

/** HOW MANY CARS a run puts on the road, the player included. One on
 * everything that races alone — a time trial, the training ground, the menu
 * behind a card — which is what makes this the one question the grid, the
 * apron and the entry list are all asked.
 *
 * HEADS UP is held to `GRID_MAX`: the authored roster on the apron the rule
 * book lays. ROAM is not — its slider goes to a full `GRID_CEILING` grid,
 * the stage is compiled with the run-up to stand it (`apronForGrid`) and
 * the roster is dressed out with club entries. */
export function fieldCars(race: RaceSettings, mode: PlayMode): number {
  if (mode === "headsup") return gridSize(Math.min(race.headsUp.cars, GRID_MAX));
  if (mode === "roam" && race.roam.opponents > 0) return gridSize(race.roam.opponents + 1);
  return 1;
}

/** HOW THE FIELD IS ENTERED for a run, or null where nobody is entered at
 * all: the campaign runs the whole roster a rally interval apart at the
 * campaign's own difficulty (R29) as GHOSTS — every crew's stage written
 * down before the green, and nothing on the road solid — and every other
 * field in the game is a MASS START with every car solid: that is the
 * discipline where a rival can be leaned on or put in the trees, and one
 * grid and one green is what makes it one. A heads-up race is always that;
 * Roam is that whenever its opponents slider is off zero.
 *
 * An ENDLESS stage takes a mass start but never the campaign's ghosts: a
 * trace is a whole run written down before the green, and a road that never
 * finishes has no such thing to write. */
export function fieldPlan(race: RaceSettings, mode: PlayMode, spec: StageSpec): FieldPlan | null {
  if (mode === "campaign") {
    if (spec.length === "endless") return null;
    return { ...RALLY_FIELD, difficulty: runDifficulty(race, mode) };
  }
  const cars = fieldCars(race, mode);
  if (cars < GRID_MIN) return null;
  return { difficulty: runDifficulty(race, mode), cars, massStart: true, contact: true };
}

/** WHERE THE PLAYER STANDS at the green: the back row of the grid on a mass
 * start, and nothing — the line itself, alone — everywhere else. Stated once
 * because three ways into a run ask it, and the apron the stage is built
 * with has to agree with it (`apronForGrid`, off the same `fieldCars`). */
export function gridSlotFor(race: RaceSettings, mode: PlayMode): GridSlot | null {
  const cars = fieldCars(race, mode);
  return cars < GRID_MIN ? null : playerSlot(cars);
}

/** WHICH DIFFICULTY THIS RUN IS DRIVEN AT. The same word the field is
 * entered on — HEADS UP keeps its own, everything else takes the campaign's
 * — and it is asked for on every mode, not only the two that enter anybody:
 * a difficulty says what a hit costs the player's own car
 * (`damageScaleFor`), and a time trial with nobody on the road is still
 * driven at one setting or another. */
export function runDifficulty(race: RaceSettings, mode: PlayMode): Difficulty {
  return mode === "headsup" ? race.headsUp.difficulty : race.difficulty;
}

/** The camera a run opens on: the player's own choice from OPTIONS, unless
 * the tooling pins one with `?camera=` the way it pins the seed — a shot of
 * a given angle should not depend on what is in the screenshot machine's
 * local storage. */
export function startCamera(chosen: PlayCamera): PlayCamera {
  const param = new URLSearchParams(location.search).get("camera");
  return PLAY_CAMERAS.some((cam) => cam.id === param) ? (param as PlayCamera) : chosen;
}
