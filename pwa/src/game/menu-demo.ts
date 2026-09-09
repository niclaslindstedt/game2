// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD BEHIND THE CARDS. The menu's backdrop is the real game — the engine
// steps on bot input under the drone camera for as long as a menu page is up
// (App.tsx) — so the menu needs a stage, and this is the one decision about
// WHICH stage that is.
//
// It is its own module, and DOM-free, because getting it wrong does not look
// like a bug: it looks like the menu being slow. Standing a road up is the
// most expensive thing this game does, and the menu is the one place there is
// no loading card to hide it behind.

import type { StageLength, StageShape } from "@engine";
import type { StageSpec } from "./stage-spec.ts";

/** What the demo takes from the PLAYER rather than from the road: the car and
 * the sky they last chose to race in, plus the dials a road of its own would
 * be rolled with. Spelt as a slice of `StageSpec` because that is where every
 * one of these fields is already described, and satisfied by `RaceSettings`
 * without either module having to know the other exists — which is what keeps
 * this decision out of the menu's `.tsx` and inside the root test suite. */
export type DemoConditions = Pick<
  StageSpec,
  "knobs" | "carId" | "hour" | "weather" | "season" | "temperature" | "sandstorms"
>;

/** THE ROAD THE MENU'S DEMO DRIVES: the one already standing, wherever there
 * is one.
 *
 * Compiling a route and building the country around it is the better part of
 * two seconds, and none of it can be cut into frames — which is the whole
 * reason a race is stood up behind a loading card (`race-loader.ts`). The menu
 * has no card. The press that walks out of a run, and the one that steps back
 * off Roam's map, are both answered by cards going up over whatever is behind
 * them, so a demo that insisted on a road of its own would pay for it with the
 * menu frozen where it stood.
 *
 * It does not have to. A stage walked out of is already compiled, already
 * built and already warm, and it makes a better backdrop than a stranger:
 * dressed as a demo — the player's car, one lap, no grid, no lights — the
 * app's track cache is still holding its road and the renderer answers with a
 * body swap instead of a world.
 *
 * What comes off the standing road is everything the compiled track is KEYED
 * on (`ensureTrack` in App.tsx): the seed, the band, the dials, the season and
 * the depth of field its apron was built for. The rest is the player's, so the
 * menu still previews the car and the weather they last chose to race in.
 *
 * A road of its own is rolled from `seed` where there is nothing worth taking:
 * the boot, with nothing standing at all; THE TRAINING GROUND, which is a
 * place rather than a stage, and one a bot let loose in never finishes and so
 * never rolls off; and an ENDLESS road, which is compiled fresh however it is
 * asked for, so adopting one buys nothing and re-buys it on every settings
 * change behind the cards. Medium is the length that shows the most road in
 * the least time. */
export function demoStage(
  race: DemoConditions,
  seed: number,
  standing: StageSpec | null,
): StageSpec {
  const adopt = standing && !standing.arena && standing.length !== "endless" ? standing : null;
  const road = adopt
    ? {
        seed: adopt.seed,
        length: adopt.length,
        shape: adopt.shape,
        knobs: adopt.knobs,
        season: adopt.season,
        temperature: adopt.temperature,
        cars: adopt.cars,
      }
    : {
        seed,
        length: "medium" as StageLength,
        shape: "sprint" as StageShape,
        knobs: race.knobs,
        season: race.season,
        temperature: race.temperature,
      };
  return {
    ...road,
    laps: 1,
    carId: race.carId,
    hour: race.hour,
    weather: race.weather,
    sandstorms: race.sandstorms,
    skipCountdown: true,
    grid: null,
  };
}
