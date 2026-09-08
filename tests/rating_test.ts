// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RALLY RATING — the scorer that decides which seeds become levels.
//
// What is worth asserting about a tool whose output is a judgement, and
// what is not. A test that pins seed 38's score to 72.7 would fail on every
// change to the generator AND on every deliberate move of a band, and would
// say nothing when it did — `start-work`'s seed-pinned-fixture trap exactly.
// So nothing here asserts a score.
//
// What it does assert is that the tool cannot silently stop working:
//
//   * the rule book is WELL FORMED — a band with its ends the wrong way
//     round scores every stage zero and looks like a bad generator
//   * every facet still publishes the stats `character.ts` reads, which is
//     the one stringly contract in the module
//   * the fingerprint is comparable — axes in range, distance zero against
//     itself, a demand that sums to one
//   * corners are read on the pacenote scale
//   * the ladder scorer catches the two things it exists for: a campaign
//     that does not climb, and a campaign that is the same stage six times
//   * it is deterministic, like everything else in the engine

import { describe, expect, it } from "vitest";
import {
  CHARACTER_AXES,
  RATING,
  characterDistance,
  rateLadder,
  rateSeed,
  rateTrack,
  stepDemand,
  walkStage,
  type LadderStep,
  type StageRating,
} from "@engine";
import { stageTerrain, stageTrack } from "./support/stages.ts";

/** A spread wide enough to exercise every facet — three countries, two
 * shapes, three length bands — and small enough to stay well inside the
 * per-file minute. Taken from the shared corpus, so a stage another suite
 * has already built costs nothing here. */
const CORPUS: {
  seed: number;
  length: "short" | "medium" | "long";
  shape: "sprint" | "circuit";
  biome: "taiga" | "desert" | "alpine";
}[] = [
  { seed: 3, length: "short", shape: "sprint", biome: "taiga" },
  { seed: 7, length: "medium", shape: "sprint", biome: "taiga" },
  { seed: 11, length: "medium", shape: "sprint", biome: "desert" },
  { seed: 5, length: "medium", shape: "circuit", biome: "alpine" },
  { seed: 19, length: "long", shape: "sprint", biome: "alpine" },
];

function rated(entry: (typeof CORPUS)[number]): StageRating {
  const track = stageTrack(entry.seed, entry.length, { biome: entry.biome }, entry.shape);
  return rateTrack(track, stageTerrain(track), { length: entry.length, shape: entry.shape });
}

const RATINGS = CORPUS.map(rated);

describe("the rule book", () => {
  it("has a well-formed band behind every trait", () => {
    for (const rating of RATINGS) {
      for (const facet of rating.facets) {
        for (const trait of facet.traits) {
          expect(trait.band.min, trait.id).toBeLessThanOrEqual(trait.band.max);
          expect(trait.band.under, trait.id).toBeGreaterThan(0);
          expect(trait.band.over, trait.id).toBeGreaterThan(0);
          expect(trait.weight, trait.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("names every trait exactly once", () => {
    const ids = RATINGS[0].facets.flatMap((facet) => facet.traits.map((trait) => trait.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("measures a finite number for every trait on every stage", () => {
    for (const rating of RATINGS) {
      for (const facet of rating.facets) {
        for (const trait of facet.traits) {
          expect(Number.isFinite(trait.value), `${trait.id} on seed ${rating.seed}`).toBe(true);
          expect(trait.score).toBeGreaterThanOrEqual(0);
          expect(trait.score).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  // The whole module is a set of BANDS rather than budgets, and a trait
  // whose band starts at the bottom of its own range cannot report a stage
  // as thin — which is what separates this from `analysis/`. One trait is
  // allowed to be that way and it is documented as borrowed from arcade
  // track-design practice; a second one appearing is a trait that has
  // quietly turned into a ceiling.
  it("keeps a floor under all but the one trait that is allowed none", () => {
    const floorless = RATINGS[0].facets
      .flatMap((facet) => facet.traits)
      .filter((trait) => trait.band.min <= 0);
    expect(floorless.map((trait) => trait.id)).toEqual(["relief.offCamber"]);
  });
});

describe("the fingerprint", () => {
  it("puts every axis inside its own range", () => {
    for (const rating of RATINGS) {
      for (const axis of CHARACTER_AXES) {
        expect(rating.character[axis], `${axis} on seed ${rating.seed}`).toBeGreaterThanOrEqual(0);
        expect(rating.character[axis], `${axis} on seed ${rating.seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is zero distance from itself and non-zero between two different stages", () => {
    expect(characterDistance(RATINGS[0].character, RATINGS[0].character)).toBe(0);
    expect(characterDistance(RATINGS[0].character, RATINGS[1].character)).toBeGreaterThan(0);
  });

  it("hands the road to one of three cars, in shares that sum to one", () => {
    for (const rating of RATINGS) {
      const { grip, power, slide } = rating.demand;
      expect(grip + power + slide).toBeCloseTo(1, 6);
      // Every road can be driven in every car, so no share is ever zero.
      for (const share of [grip, power, slide]) expect(share).toBeGreaterThan(0);
    }
  });

  it("orders difficulty inside 0..1", () => {
    for (const rating of RATINGS) {
      expect(rating.difficulty).toBeGreaterThanOrEqual(0);
      expect(rating.difficulty).toBeLessThanOrEqual(1);
    }
  });
});

describe("reading the road", () => {
  it("classifies corners on the pacenote radii", () => {
    const track = stageTrack(7, "medium");
    for (const corner of walkStage(track).corners) {
      expect(corner.radius).toBeLessThanOrEqual(175);
      expect(corner.note).toBeGreaterThanOrEqual(1);
      expect(corner.note).toBeLessThanOrEqual(10);
      // 1-4 is the tight stuff, 5-7 a real corner, 8-10 a bend in a high
      // gear — the cut points R3's own vocabulary answers to.
      const expected = corner.note <= 4 ? "hard" : corner.note <= 7 ? "medium" : "soft";
      expect(corner.severity).toBe(expected);
    }
  });

  it("measures the timed stage, never the run-out", () => {
    const track = stageTrack(7, "medium");
    const walk = walkStage(track);
    expect(walk.distance).toBe(track.finishS);
    expect(walk.distance).toBeLessThan(track.length);
    expect(track.samples[walk.end].s).toBeLessThanOrEqual(walk.distance);
  });

  it("cuts the stage into places that last at least the window", () => {
    const walk = walkStage(stageTrack(7, "medium"));
    expect(walk.windows.length).toBeGreaterThan(1);
    for (const window of walk.windows) expect(window.to).toBeGreaterThan(window.from);
  });
});

describe("the whole rating", () => {
  it("is deterministic in the seed", () => {
    const once = rateSeed(4, { length: "short" });
    const twice = rateSeed(4, { length: "short" });
    expect(twice.score).toBe(once.score);
    expect(twice.character).toEqual(once.character);
    expect(twice.difficulty).toBe(once.difficulty);
  });

  it("scores inside 0..100 and says something about every stage", () => {
    for (const rating of RATINGS) {
      expect(rating.score).toBeGreaterThan(0);
      expect(rating.score).toBeLessThanOrEqual(100);
      // A rating with nothing to say is a rating that measured nothing —
      // every stage gets at least the remarks the facets always publish.
      expect(rating.notes.length).toBeGreaterThan(0);
    }
  });

  it("weights every facet the rule book names", () => {
    const ids = RATINGS[0].facets.map((facet) => facet.id).sort();
    expect(ids).toEqual(Object.keys(RATING.weights).sort());
  });
});

describe("the ladder", () => {
  const step = (
    name: string,
    rating: StageRating,
    hour: number,
    weather: "clear" | "rain" | "storm",
    season: "spring" | "summer" | "autumn" | "winter",
  ): LadderStep => ({
    id: name,
    name,
    rating,
    conditions: { hour, weather, season, biome: "taiga" },
  });

  it("marks a ladder of the same stage six times down on how apart it is", () => {
    const same = RATINGS[1];
    const ladder = rateLadder(
      "same",
      "Same",
      [0, 1, 2, 3].map((i) => step(`level ${i}`, same, 12, "clear", "summer")),
    );
    const apart = ladder.traits.find((trait) => trait.id === "ladder.apart");
    expect(apart?.value).toBe(0);
    expect(apart?.score).toBe(0);
    expect(ladder.notes.some((note) => note.code === "ladder.apart")).toBe(true);
  });

  it("marks a ladder that does not climb down on how it climbs", () => {
    const steps = RATINGS.map((rating, i) => step(`level ${i}`, rating, 12, "clear", "summer"));
    const descending = [...steps].sort((a, b) => stepDemand(b) - stepDemand(a));
    expect(
      rateLadder("down", "Down", descending).traits.find((t) => t.id === "ladder.climb")?.value,
    ).toBe(0);
  });

  // A rung asks for its ROAD and for what it is driven in. The committed
  // campaign climbs largely on the second — clear noon, then dawn, then
  // rain at dusk, then a midnight storm — so a ladder scorer that reads only
  // the road would tell a curator to re-seed levels that are doing exactly
  // the right thing with the cheapest lever the game has.
  it("asks more of the same road driven in a midnight storm", () => {
    const road = RATINGS[1];
    const noon = step("noon", road, 12, "clear", "summer");
    const storm = step("storm", road, 23, "storm", "winter");
    expect(stepDemand(storm)).toBeGreaterThan(stepDemand(noon));
    expect(stepDemand(noon)).toBeLessThan(road.difficulty);
  });

  it("rewards a ladder that climbs, varies and uses the calendar", () => {
    const conditions: [
      number,
      "clear" | "rain" | "storm",
      "spring" | "summer" | "autumn" | "winter",
    ][] = [
      [12, "clear", "summer"],
      [6, "rain", "spring"],
      [18, "storm", "autumn"],
      [23, "clear", "winter"],
      [13, "rain", "summer"],
    ];
    const rungs = RATINGS.map((rating, i) => step(`level ${i}`, rating, ...conditions[i]));
    // Ordered on what each rung ASKS FOR — the road AND what it is driven in
    // — and compared against the same stages in the wrong order rather than
    // against a fixed number: two rungs can genuinely ask for the same
    // thing, a tie is not a climb, so the honest assertion is that putting
    // them in order helps.
    const ladder = rateLadder(
      "good",
      "Good",
      [...rungs].sort((a, b) => stepDemand(a) - stepDemand(b)),
    );
    const wrongWayRound = rateLadder(
      "down",
      "Down",
      [...rungs].sort((a, b) => stepDemand(b) - stepDemand(a)),
    );
    const flat = rateLadder(
      "flat",
      "Flat",
      [...RATINGS]
        .sort((a, b) => a.difficulty - b.difficulty)
        .map((rating, i) => step(`level ${i}`, rating, 12, "clear", "summer")),
    );
    expect(ladder.traits.find((t) => t.id === "ladder.climb")!.value).toBeGreaterThan(
      wrongWayRound.traits.find((t) => t.id === "ladder.climb")!.value,
    );
    expect(ladder.traits.find((t) => t.id === "ladder.conditions")!.value).toBeGreaterThan(
      flat.traits.find((t) => t.id === "ladder.conditions")!.value,
    );
    expect(ladder.score).toBeGreaterThan(flat.score);
  });
});
