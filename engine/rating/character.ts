// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHARACTER OF A STAGE — the fingerprint two roads are held apart by,
// the difficulty a ladder is ordered on, and which car the road asks for.
//
// This is the half of the module the campaign is actually built out of, and
// it is deliberately kept clear of the facets' judgement. A facet says a
// stage is WRONG; an axis says only that it is UNLIKE its neighbour, and no
// value on any axis is better than another. Mixing the two produces the
// campaign nobody wants: six stages that all score 94 because they are all
// the same excellent stage.
//
// Every axis is read off a number a facet already measured rather than
// recomputed here — `axis()` throws on a key a facet stopped publishing, so
// a stat renamed in one place fails loudly in the tests instead of quietly
// scoring a stage as flat.

import { TUNING } from "../game/defs/tuning.ts";
import { RATING } from "./scales.ts";
import type { Walk } from "./walk.ts";
import { scale01, type Character, type Demand, type Facet } from "./types.ts";

/** Read one number out of the facet that measured it. Named rather than
 * merged, because two facets both publish a `crests` and a merged bag would
 * silently hand back whichever ran last. */
function stat(facets: Facet[], facetId: string, key: string): number {
  const facet = facets.find((f) => f.id === facetId);
  const value = facet?.stats[key];
  if (value === undefined) {
    throw new Error(`rating: ${facetId}.${key} is not published by its facet`);
  }
  return value;
}

/** How hard a corner of each severity counts toward `tight`. A stage of
 * open sweepers is not a tight stage however many of them there are, and a
 * stage with four hairpins in it is, so the density has to be weighted by
 * what the corners ask for or the axis measures corner COUNT and calls a
 * fast forest road technical. */
const SEVERITY_WEIGHT = { soft: 0.5, medium: 1, hard: 1.9 };

export function stageCharacter(walk: Walk, facets: Facet[]): Character {
  const C = RATING.character;
  const weighted =
    (stat(facets, "flow", "soft") * SEVERITY_WEIGHT.soft +
      stat(facets, "flow", "medium") * SEVERITY_WEIGHT.medium +
      stat(facets, "flow", "hard") * SEVERITY_WEIGHT.hard) /
    walk.km;

  const exposure = stat(facets, "risk", "exposure");
  const pinch = stat(facets, "risk", "pinch");

  return {
    tight: scale01(weighted, C.tight.lo, C.tight.hi),
    fast: scale01(stat(facets, "pace", "meanKmh"), C.fast.lo, C.fast.hi),
    vertical: scale01(stat(facets, "relief", "climb") / walk.km, C.vertical.lo, C.vertical.hi),
    airborne: scale01(stat(facets, "features", "jumps") / walk.km, C.airborne.lo, C.airborne.hi),
    sealed: scale01(stat(facets, "features", "sealedShare"), C.sealed.lo, C.sealed.hi),
    enclosed: scale01(stat(facets, "scenery", "enclosure"), C.enclosed.lo, C.enclosed.hi),
    // Exposure and a road with no room on it are the same fear from two
    // directions, so the axis is the pair: a cliff-edge road is exposed,
    // and so is a lane through trees at 140 km/h.
    exposed: scale01(0.62 * exposure + 0.38 * pinch, C.exposed.lo, C.exposed.hi),
    slick: scale01(slickness(walk), C.slick.lo, C.slick.hi),
    long: scale01(walk.distance, C.long.lo, C.long.hi),
  };
}

/** HOW LITTLE THE SURFACES HOLD, against dry gravel — the axis that
 * separates an alpine ice crossing from the same road in summer.
 *
 * Read off the surface table the physics itself uses, weighted by the
 * metres of each, and multiplied by the sample's own `bite`, which is where
 * the climate lives: a snow road at −12° and the same road at slush are the
 * same `surface` and very different roads, and `bite` is the one number
 * that knows which one this stage is being driven on. */
function slickness(walk: Walk): number {
  const samples = walk.track.samples;
  const grip = TUNING.surfaces.grip;
  let held = 0;
  let metres = 0;
  for (let i = 1; i <= walk.end; i++) {
    const step = samples[i].s - samples[i - 1].s;
    const surface = samples[i].surface;
    const base = surface in grip ? grip[surface as keyof typeof grip] : grip.gravel;
    held += Math.min(1, base * samples[i].bite) * step;
    metres += step;
  }
  return metres > 0 ? Math.max(0, 1 - held / metres) : 0;
}

/** HOW MUCH THE STAGE ASKS OF THE DRIVER, 0..1 — the one number a ladder is
 * ordered on, and not the same thing as the rating. A gentle opening stage
 * should be EASY and GOOD; a wall of hairpins in the dark can be hard and
 * bad. Keeping them apart is what lets a campaign climb without the last
 * rung having to be the best stage in the game. */
export function stageDifficulty(character: Character): number {
  const D = RATING.difficulty;
  let sum = 0;
  let weight = 0;
  for (const [axis, share] of Object.entries(D)) {
    sum += character[axis as keyof Character] * share;
    weight += share;
  }
  return weight > 0 ? Math.min(1, Math.max(0, sum / weight)) : 0;
}

/** WHICH OF THE THREE CARS THE ROAD IS FOR, as shares that sum to 1. */
export function stageDemand(character: Character): Demand {
  const rows = RATING.demand;
  // Each row divided by its own middle first — see `demand.scale`. The
  // three rows are sums over different axes with different natural sizes,
  // and comparing them raw says only which row has the biggest weights.
  const raw = {
    grip: blend(character, rows.grip) / rows.scale.grip,
    power: blend(character, rows.power) / rows.scale.power,
    slide: blend(character, rows.slide) / rows.scale.slide,
  };
  const floored = {
    grip: Math.max(rows.floor, raw.grip),
    power: Math.max(rows.floor, raw.power),
    slide: Math.max(rows.floor, raw.slide),
  };
  const total = floored.grip + floored.power + floored.slide;
  return {
    grip: floored.grip / total,
    power: floored.power / total,
    slide: floored.slide / total,
  };
}

function blend(character: Character, row: Readonly<Record<string, number>>): number {
  let sum = 0;
  for (const [axis, weight] of Object.entries(row)) {
    sum += character[axis as keyof Character] * weight;
  }
  return Math.max(0, sum);
}
