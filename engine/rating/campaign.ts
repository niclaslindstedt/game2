// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LADDER — judging a set of stages TOGETHER, which is the question a
// campaign actually asks and the one no single stage's rating can answer.
//
// The failure this module exists to catch: take the sweep, sort by score,
// keep the top six. Every one of them is a good stage and the campaign is
// terrible, because they score well for the same reasons and are therefore
// the same road six times. The player learns it on the first level and
// drives it five more times with different trees on it.
//
// So a ladder is scored on four things a stage cannot be scored on:
//
//   IT CLIMBS. The difficulty goes up in the order the stages are played,
//   without a wall in the middle of it.
//   ITS STAGES ARE UNLIKE EACH OTHER. Measured on the closest PAIR, not on
//   the average — four distinct stages will happily hide a duplicate.
//   EVERY RUNG HAS A REASON. Each stage leads the ladder on something: it
//   is the tight one, or the fast one, or the one with the drop.
//   IT USES WHAT THE GAME HAS. Three weathers, four seasons, a day that
//   runs from before dawn into the dark, sprints and circuits, four length
//   bands — and, the one that is about the garage rather than the road,
//   three cars that each want a different kind of stage.
//
// The quality floor sits under all of it (`ladder.quality`), because
// variety is not a licence to ship six bad roads that are bad in different
// ways.

import type { Season, Weather } from "../game/state.ts";
import type { BiomeId } from "../mapgen/biomes.ts";
import { RATING } from "./scales.ts";
import {
  CHARACTER_AXES,
  characterDistance,
  facetScore,
  rankNotes,
  trait,
  traitNotes,
  type Character,
  type Demand,
  type Note,
  type StageRating,
  type Trait,
} from "./types.ts";

/** What a level is driven IN, as opposed to what it is. Kept beside the
 * rating rather than inside it for the reason `campaign.ts` in the app
 * gives: a road is what the generator builds, and the hour, the weather and
 * the season are what it is driven in — the same seed at dusk in the rain
 * is the same road. The ladder cares about both. */
export type StageConditions = {
  hour: number;
  weather: Weather;
  season: Season;
  biome: BiomeId;
};

export type LadderStep = {
  id: string;
  name: string;
  rating: StageRating;
  conditions: StageConditions;
};

export type LadderReport = {
  id: string;
  label: string;
  steps: LadderStep[];
  traits: Trait[];
  score: number;
  notes: Note[];
  stats: Record<string, number>;
  /** Which car each rung asks for, in ladder order — the row a curator
   * reads to see whether the garage is being used. */
  demands: Demand[];
  /** ...and what each rung asks for overall, road and conditions together,
   * in the same order. The numbers `climb`, `spread` and `step` are read
   * off, so a curator can see WHY the ladder scored what it did. */
  asks: number[];
};

export type CampaignReport = {
  ladders: LadderReport[];
  traits: Trait[];
  /** 0..100 over the whole campaign: the ladders, plus what only shows up
   * when they are read against each other. */
  score: number;
  notes: Note[];
  stats: Record<string, number>;
};

/** HOW MUCH A RUNG ASKS FOR — the road AND what it is driven in.
 *
 * The road's own `difficulty` is a fact about geometry and it is only half
 * of what a campaign climbs with. Rated on the road alone the committed
 * taiga ladder reads as barely climbing at all, while what it actually does
 * over its four sprints is noon-clear, dawn-clear, dusk-rain,
 * midnight-storm — the cheapest lever in the game, used correctly, and
 * invisible to anything that only looks at the road.
 *
 * Exported because it is the number the ladder is ORDERED on, and a curator
 * moving a level needs to be able to ask what a rung asks for before
 * committing it. */
export function stepDemand(step: LadderStep): number {
  const L = RATING.ladder;
  const W = L.conditionWeights;
  const conditions =
    (W.weather * L.weatherDemand[step.conditions.weather] +
      W.dark * darkness(step.conditions.hour) +
      W.season * L.seasonDemand[step.conditions.season]) /
    (W.weather + W.dark + W.season);
  return step.rating.difficulty * (1 - L.conditionShare) + conditions * L.conditionShare;
}

/** How dark the stage is driven in, 0 (broad day) to 1 (the middle of the
 * night). Read off the same day-parts the coverage check uses, so a level
 * cannot be night for one and dusk for the other. */
function darkness(hour: number): number {
  const D = RATING.ladder.dayParts;
  if (hour < D.night || hour >= D.dusk) return 1;
  if (hour < D.day) return 0;
  return 0.5;
}

/** Score ONE location's ladder — six stages of a country, in the order they
 * are played. */
export function rateLadder(id: string, label: string, steps: LadderStep[]): LadderReport {
  const L = RATING.ladder;
  const difficulties = steps.map(stepDemand);
  const characters = steps.map((step) => step.rating.character);

  let rising = 0;
  let worstStep = 0;
  let worstAt = 0;
  for (let i = 1; i < difficulties.length; i++) {
    const change = difficulties[i] - difficulties[i - 1];
    if (change > 0) rising++;
    if (Math.abs(change) > Math.abs(worstStep)) {
      worstStep = change;
      worstAt = i;
    }
  }
  const pairs = Math.max(1, difficulties.length - 1);
  const spread =
    difficulties.length > 0 ? Math.max(...difficulties) - Math.min(...difficulties) : 0;

  const closest = closestPair(characters);
  const identity = leadShare(characters);
  const conditions = conditionCoverage(steps);
  const cars = carCoverage(steps);
  const formats = formatCoverage(steps);
  const quality =
    steps.length > 0 ? steps.reduce((a, step) => a + step.rating.score, 0) / steps.length : 0;

  const traits: Trait[] = [
    trait("ladder.climb", "share of the rungs that go up", "share", rising / pairs, L.climb, 1.2),
    trait("ladder.spread", "how far the ladder travels", "difficulty", spread, L.spread, 1.1),
    trait(
      "ladder.step",
      "the biggest single step between two rungs",
      "difficulty",
      Math.abs(worstStep),
      L.step,
      1.0,
    ),
    trait(
      "ladder.apart",
      "how unlike each other the two most similar stages are",
      "distance",
      closest.distance,
      L.apart,
      1.4,
    ),
    trait(
      "ladder.identity",
      "share of the stages that lead the ladder on something",
      "share",
      identity.share,
      L.identity,
      1.0,
    ),
    trait(
      "ladder.conditions",
      "how much of the weather, the calendar and the clock it uses",
      "share",
      conditions.score,
      L.conditions,
      0.9,
    ),
    trait(
      "ladder.cars",
      "whether every car is the right car somewhere",
      "share",
      cars.score,
      L.cars,
      1.1,
    ),
    trait(
      "ladder.formats",
      "how mixed its shapes and lengths are",
      "share",
      formats,
      L.formats,
      0.7,
    ),
    trait("ladder.quality", "the mean rating of its stages", "score", quality, L.quality, 1.2),
  ];

  const notes: Note[] = traitNotes(traits, sayLadder);
  if (closest.a >= 0 && closest.distance < L.apart.min) {
    notes.push({
      code: "ladder.apart",
      sense: "thin",
      message: `${steps[closest.a].name} and ${steps[closest.b].name} are the same stage twice (${closest.distance.toFixed(2)} apart) — ${nearestAxes(characters[closest.a], characters[closest.b])}`,
      value: closest.distance,
    });
  }
  if (worstAt > 0 && Math.abs(worstStep) > L.step.max) {
    notes.push({
      code: "ladder.step",
      sense: "much",
      message:
        worstStep > 0
          ? `${steps[worstAt].name} is a wall after ${steps[worstAt - 1].name} (+${worstStep.toFixed(2)} difficulty)`
          : `${steps[worstAt].name} steps back ${Math.abs(worstStep).toFixed(2)} after ${steps[worstAt - 1].name}`,
      value: worstStep,
    });
  }
  for (const step of identity.anonymous) {
    notes.push({
      code: "ladder.identity",
      sense: "thin",
      message: `${steps[step].name} leads the ladder on nothing — no reason to be on it`,
      value: 0,
    });
  }
  for (const missing of cars.unwanted) {
    notes.push({
      code: "ladder.cars",
      sense: "thin",
      message: `nothing on this ladder is a ${missing} stage`,
      value: 0,
    });
  }
  for (const missing of conditions.missing) {
    notes.push({ code: "ladder.conditions", sense: "thin", message: `never ${missing}`, value: 0 });
  }

  return {
    id,
    label,
    steps,
    traits,
    score: Math.round(facetScore(traits) * 1000) / 10,
    notes: rankNotes(notes),
    stats: {
      levels: steps.length,
      easiest: Math.round(Math.min(...difficulties) * 1000) / 1000,
      hardest: Math.round(Math.max(...difficulties) * 1000) / 1000,
      spread: Math.round(spread * 1000) / 1000,
      biggestStep: Math.round(worstStep * 1000) / 1000,
      closestPair: Math.round(closest.distance * 1000) / 1000,
      meanScore: Math.round(quality * 10) / 10,
    },
    demands: steps.map((step) => step.rating.demand),
    asks: difficulties.map((value) => Math.round(value * 1000) / 1000),
  };
}

/** Score the WHOLE campaign: every ladder, plus the two things that only
 * show up when the ladders are read against each other. */
export function rateCampaign(ladders: LadderReport[]): CampaignReport {
  const L = RATING.ladder;
  const everyStep = ladders.flatMap((ladder) => ladder.steps);
  const characters = everyStep.map((step) => step.rating.character);
  const closest = closestPair(characters);

  // The countries are the campaign's own biggest lever of variety and the
  // one it cannot lose by accident, so this is a coverage check rather than
  // a band: a campaign that visits one country is a campaign with one
  // landscape in it.
  const biomes = new Set(everyStep.map((step) => step.conditions.biome));
  const cars = carCoverage(everyStep);

  const traits: Trait[] = [
    trait(
      "campaign.apart",
      "how unlike each other the two most similar stages ANYWHERE are",
      "distance",
      closest.distance,
      L.campaignApart,
      1.3,
    ),
    trait(
      "campaign.cars",
      "whether every car is the right car somewhere in the game",
      "share",
      cars.score,
      L.cars,
      1.0,
    ),
    trait(
      "campaign.conditions",
      "how much of the weather, the calendar and the clock the game uses",
      "share",
      conditionCoverage(everyStep).score,
      L.conditions,
      0.9,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayLadder);
  if (closest.a >= 0 && closest.distance < L.campaignApart.min) {
    notes.push({
      code: "campaign.apart",
      sense: "thin",
      message: `${everyStep[closest.a].name} and ${everyStep[closest.b].name} are the same stage in two countries (${closest.distance.toFixed(2)} apart)`,
      value: closest.distance,
    });
  }

  // The ladders carry the weight: the campaign IS its ladders, and these
  // three traits are a check on the seams between them.
  let sum = 0;
  for (const ladder of ladders) sum += ladder.score;
  const ladderMean = ladders.length > 0 ? sum / ladders.length : 0;
  const seams = facetScore(traits) * 100;

  return {
    ladders,
    traits,
    score: Math.round((ladderMean * 0.75 + seams * 0.25) * 10) / 10,
    notes: rankNotes(notes),
    stats: {
      ladders: ladders.length,
      levels: everyStep.length,
      countries: biomes.size,
      closestPair: Math.round(closest.distance * 1000) / 1000,
      ladderMean: Math.round(ladderMean * 10) / 10,
    },
  };
}

function closestPair(characters: Character[]): { a: number; b: number; distance: number } {
  let best = { a: -1, b: -1, distance: 1 };
  for (let i = 0; i < characters.length; i++) {
    for (let k = i + 1; k < characters.length; k++) {
      const distance = characterDistance(characters[i], characters[k]);
      if (distance < best.distance) best = { a: i, b: k, distance };
    }
  }
  return best;
}

/** The axes two stages agree most closely on — what to say when they turn
 * out to be the same stage twice. */
function nearestAxes(a: Character, b: Character): string {
  const same = [...CHARACTER_AXES]
    .sort((x, y) => Math.abs(a[x] - b[x]) - Math.abs(a[y] - b[y]))
    .slice(0, 3);
  return `both ${same.join(", ")}`;
}

/** Which stages LEAD the ladder on at least one axis, and which lead on
 * nothing. A stage that is the extreme of something is a stage a player can
 * name; one that is in the middle of everything is filler. */
function leadShare(characters: Character[]): { share: number; anonymous: number[] } {
  if (characters.length === 0) return { share: 1, anonymous: [] };
  const leads = new Set<number>();
  for (const axis of CHARACTER_AXES) {
    let high = 0;
    let low = 0;
    for (let i = 1; i < characters.length; i++) {
      if (characters[i][axis] > characters[high][axis]) high = i;
      if (characters[i][axis] < characters[low][axis]) low = i;
    }
    leads.add(high);
    leads.add(low);
  }
  const anonymous: number[] = [];
  for (let i = 0; i < characters.length; i++) if (!leads.has(i)) anonymous.push(i);
  return { share: leads.size / characters.length, anonymous };
}

/** How much of the weather, the calendar and the clock a set of levels
 * uses. Three coverages, averaged: a campaign gets variety from these more
 * cheaply than from anything else it can do, and throwing it away is the
 * commonest thing a hand-built ladder does. */
function conditionCoverage(steps: LadderStep[]): { score: number; missing: string[] } {
  const D = RATING.ladder.dayParts;
  const weathers: Weather[] = ["clear", "rain", "storm"];
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
  const parts = ["night", "day", "dusk"];

  const seenWeather = new Set(steps.map((s) => s.conditions.weather));
  const seenSeason = new Set(steps.map((s) => s.conditions.season));
  const seenPart = new Set(steps.map((s) => dayPart(s.conditions.hour, D)));

  const missing: string[] = [];
  for (const weather of weathers) if (!seenWeather.has(weather)) missing.push(`in the ${weather}`);
  for (const season of seasons) if (!seenSeason.has(season)) missing.push(`in ${season}`);
  for (const part of parts) if (!seenPart.has(part)) missing.push(`at ${part}`);

  const score =
    (seenWeather.size / weathers.length +
      seenSeason.size / seasons.length +
      seenPart.size / parts.length) /
    3;
  return { score, missing };
}

function dayPart(hour: number, D: { night: number; day: number; dusk: number }): string {
  if (hour < D.night || hour >= D.dusk) return "night";
  if (hour < D.day) return "day";
  return "dusk";
}

/** WHETHER EVERY CAR IS THE RIGHT CAR SOMEWHERE. For each of the three, the
 * best share it reaches on any level; the ladder scores the WORST of those
 * three, because a campaign in which nothing ever asks for the classic has
 * a car in the garage nobody has a reason to take out.
 *
 * Scaled against an even split: a demand of 1/3 is "this road has no
 * opinion", so the measure is how far past no-opinion the best level for
 * that car gets. */
function carCoverage(steps: LadderStep[]): { score: number; unwanted: string[] } {
  const names: Record<keyof Demand, string> = {
    grip: "sealed-road grip",
    power: "power-and-gearing",
    slide: "sideways",
  };
  const unwanted: string[] = [];
  let worst = 1;
  for (const car of ["grip", "power", "slide"] as (keyof Demand)[]) {
    let best = 0;
    for (const step of steps) best = Math.max(best, step.rating.demand[car]);
    // A third is no opinion; two thirds is a road that plainly wants one
    // car. Scored across that gap.
    const reach = Math.min(1, Math.max(0, (best - 1 / 3) / (2 / 3 - 1 / 3)));
    if (reach < 0.34) unwanted.push(names[car]);
    worst = Math.min(worst, reach);
  }
  return { score: worst, unwanted };
}

/** How mixed a ladder's shapes and length bands are — the two format
 * levers, averaged. */
function formatCoverage(steps: LadderStep[]): number {
  if (steps.length === 0) return 1;
  const shapes = new Set(steps.map((step) => step.rating.shape));
  const lengths = new Set(steps.map((step) => step.rating.length));
  return (shapes.size / 2 + Math.min(1, lengths.size / 3)) / 2;
}

function sayLadder(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "ladder.climb":
      return `the ladder only goes up ${(t.value * 100).toFixed(0)}% of the time — it does not climb`;
    case "ladder.spread":
      return short
        ? `the last stage asks for barely more than the first (${t.value.toFixed(2)})`
        : `${t.value.toFixed(2)} between the easiest and the hardest — either a tutorial or a wall`;
    case "ladder.step":
      return `one rung steps ${t.value.toFixed(2)} — a wall in the middle of the campaign`;
    case "ladder.apart":
    case "campaign.apart":
      return `two of the stages are barely distinguishable (${t.value.toFixed(2)} apart)`;
    case "ladder.identity":
      return `only ${(t.value * 100).toFixed(0)}% of the stages lead on anything — the rest are filler`;
    case "ladder.conditions":
    case "campaign.conditions":
      return `uses only ${(t.value * 100).toFixed(0)}% of the weather, the calendar and the clock`;
    case "ladder.cars":
    case "campaign.cars":
      return `one of the three cars is never the right car (${(t.value * 100).toFixed(0)}%)`;
    case "ladder.formats":
      return `one shape and one length band — no format variety`;
    default:
      return short
        ? `the stages average ${t.value.toFixed(1)} — variety is not a licence for bad roads`
        : `${t.value.toFixed(1)}`;
  }
}
