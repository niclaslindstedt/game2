// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BARE LANDSCAPE: the country before anybody laid a road across it —
// the ground surface of the layered geology (R32), the water standing on
// it (R35), and both read the way a road builder reads a map.
//
// It lives on its own, apart from the terrain field that shapes itself
// around the road, because two things need it and only one of them is the
// terrain. The other is the road NETWORK: a branch leaving a junction has
// to know where the water is before it drives into it, and a road built on
// an embankment across a lake — ending in mid-air over open water — is a
// mistake you can see from a kilometer up. Deterministic in the seed and
// the dials, and nothing else: the same country every time.
//
// The ORDER here is the point. The geology makes the ground, the pour
// works out what water stands on it, and only then does anything ask where
// a road could go. Water that is decided after the road — or worse, BY the
// road — agrees with the road by construction, and a generator arranged
// that way cannot tell the difference between a stage that runs along a
// lake shore and one that runs straight through the lake.
//
// What it adds to the geology underneath it is the road builder's two
// questions: how high is the ground, and can I build here. The LAYERS —
// which of rock, soil and groundwater is showing — belong to `geology.ts`,
// and everything that cares (what grows, what surfaces, what the ground is
// painted) asks that.

import { icyCountry, waterFrozen, type Climate } from "../game/climate.ts";
import { biomeRules } from "./biomes.ts";
import { createGeology, type GeologyField } from "./geology.ts";
import { createWaterField, SEA, type WaterField } from "./water.ts";
import { STAGE_RULES as R, type StageKnobs } from "./rules.ts";

/** The sea's own table, m. The name the rest of the generator has always
 * known it by; `SEA` is where it is defined and what the pour treats as
 * the floor under every body it finds. */
export const LAKE_Y = SEA;

export type LandField = {
  /** Ground height of the bare landscape at a point, m. */
  heightAt: (x: number, z: number) => number;
  /** The floor a crossing's water is laid against (R12, R13), m: the bare
   * ground, or — where standing water covers it — the water's own level
   * plus the bed a crossing cuts under its surface, so a ford beside a
   * lake wades AT the lake's level: never under it, which put the dip's
   * whole apron under the lake, and never at the freeboard the ROAD keeps
   * over it, which is metres of water drawn over the bank. */
  surfaceAt: (x: number, z: number) => number;
  /** True where the bare landscape is under water — with a margin, so a
   * road keeps off the shallows and the shoreline as well as the lake.
   *
   * Measured against the level of the water actually standing HERE, not
   * against one table for the whole world: the shore of a tarn three
   * hundred metres up is as much a shore as the sea's, and a builder that
   * only knows the sea walks straight into it. */
  flooded: (x: number, z: number, margin?: number) => boolean;
  /** True where standing water lies within `within` metres of a point —
   * a SETBACK from the waterline, measured across the ground.
   *
   * This and `flooded` are asked by different callers for different
   * reasons, and the difference is the whole point. `flooded`'s margin is
   * a HEIGHT: it answers "would a thing at this height be in the water",
   * which is what something deciding how high to build wants. A setback is
   * a DISTANCE, and it is what a route wants — because a height margin, on
   * a shore, puts a road exactly where the ground is steepest. Water is
   * flat and shores are not: a metre of freeboard is a stride on a beach
   * and a hundred metres up a cliff, so a rule that keeps a road "3 m
   * above the lake" is a rule that pins it to the top of the bank on
   * anything steep, which is the one place a verge cannot be cut.
   * Measuring the room the road actually needs, in the units it needs it
   * in, puts it back on the flat instead. */
  nearWater: (x: number, z: number, within: number) => boolean;
  /** R48 — the same setback, counting only the water that is still WATER.
   * A body the cold has frozen solid is a floor rather than an obstacle,
   * so the rally's own route steers by this one and drives across what it
   * skips. Everything laid on the country for good — a public road, a
   * railway, a farm — keeps using `nearWater`: a tarmac road is built for
   * every season, and a season is not a reason to put one on a lake. */
  nearOpenWater: (x: number, z: number, within: number) => boolean;
  /** R48 — whether the cold has frozen a body standing at this LEVEL solid
   * (climate.ts). Asked of a level rather than a point because that is all
   * it depends on, and because everything with a level in hand — a pour's
   * body, a shore reading, a tile of drawn sheet — can then ask it. */
  frozen: (level: number) => boolean;
  /** R48 — the ICE standing over a point, m: the flat surface of a body
   * the cold has frozen solid, or null on dry ground and on open water.
   * What a rally road across a lake is laid ON. */
  iceAt: (x: number, z: number) => number | null;
  /** R48 — `water.shoreLevelAt` counting only the water that is still
   * WATER: the level a road near here has to keep its freeboard over, or
   * null where the only water in reach has frozen. It is what stops the
   * freeboard putting a STEP at the waterline of a lake the route is about
   * to drive onto — a road held metres over the sheet at the shore and
   * laid flat on it a stride later. */
  openShoreLevelAt: (x: number, z: number) => number | null;
  /** R48 — and the mirror of `nearOpenWater`: is there ICE within `within`
   * metres of this point. What the corner rule is measured with, because a
   * corner is refused for being NEAR the sheet rather than only for
   * standing on it — the search probes every six metres and its Euler walk
   * diverges from the compiler's by a metre or two more, so a turn checked
   * only at its own probe points can still put a dozen of the compiled
   * road's samples over a shoreline it never sampled. */
  nearIce: (x: number, z: number, within: number) => boolean;
  /** The standing water itself (R35) — levels, depths and bodies, poured
   * onto the bare ground before any road exists. */
  water: WaterField;
  /** The layers under it (R32) — what the ground is MADE of here, for
   * everything that plants, paints or judges rather than builds. */
  geology: GeologyField;
};

/** How many countries are kept built. The same seed's land is asked for by
 * the route search, the country the plan is sized against, the compiler and
 * the terrain field — four times over, for one stage — and each of those
 * would otherwise pour the same water again from scratch. Two is enough to
 * hold a stage while a menu builds the next one behind it. */
const MEMO = 2;
const memo: { key: string; land: LandField }[] = [];

/** The country a seed's stage is laid across, at its dial positions.
 *
 * Memoized, because it is a pure function of exactly those two things and
 * because the pour inside it is the most expensive thing in the generator.
 * Everything it hands out is read-only, so sharing one field between the
 * search, the compiler and the terrain is sharing a value, not state. */
export function createLandField(
  seed: number,
  knobs: StageKnobs,
  /** R48 — the cold the country is under, which decides which of its
   * bodies are ice rather than water. Omitted, nothing is frozen: the
   * water is the country's own and every road keeps off all of it, which
   * is what a summer stage and every tool that only wants the LAND want. */
  climate?: Climate,
): LandField {
  const cold = climate === undefined ? "" : `${climate.season}|${climate.temperature}`;
  const key = `${seed}|${knobs.biome}|${knobs.elevation}|${knobs.steepness}|${knobs.water}|${knobs.trees}|${knobs.asphalt}|${knobs.width}|${knobs.challenge}|${knobs.peaks}|${cold}`;
  const had = memo.find((entry) => entry.key === key);
  if (had) return had.land;
  const land = buildLandField(seed, knobs, climate);
  memo.push({ key, land });
  if (memo.length > MEMO) memo.shift();
  return land;
}

function buildLandField(seed: number, knobs: StageKnobs, climate?: Climate): LandField {
  const geology = createGeology(seed, knobs);
  const heightAt = geology.surfaceAt;
  const water = createWaterField(geology.groundAt, heightAt);
  // R48 — CAN this country hold ice at all? Every ice reader below is the
  // plain one when it cannot, predicate and all, because the search asks
  // them of every probe point of every candidate segment: a summer that
  // paid for a callback and a second block lookup per step measured a
  // fifth again on the plan phase of `make analyze`, to answer "no" a
  // million times.
  const icy = climate !== undefined && icyCountry(climate, biomeRules(knobs.biome).land.zones);
  const frozen = icy
    ? (level: number) => waterFrozen(climate as Climate, level)
    : (): boolean => false;
  const iceAt = icy
    ? (x: number, z: number): number | null => {
        const level = water.levelAt(x, z);
        return level !== null && frozen(level) ? level : null;
      }
    : (): number | null => null;
  return {
    heightAt,
    frozen,
    iceAt,
    nearOpenWater: icy
      ? (x, z, within) => water.nearestAt(x, z, within, (level) => !frozen(level)) !== null
      : (x, z, within) => water.nearestAt(x, z, within) !== null,
    openShoreLevelAt: icy
      ? (x, z) => water.shoreLevelAt(x, z, (level) => !frozen(level))
      : (x, z) => water.shoreLevelAt(x, z),
    nearIce: icy ? (x, z, within) => water.nearestAt(x, z, within, frozen) !== null : () => false,
    surfaceAt: (x, z) => {
      const ground = heightAt(x, z);
      const level = water.shoreLevelAt(x, z);
      return level === null || level < ground ? ground : level + R.water.bedDepth;
    },
    // Standing water, and only standing water: a road may not be built
    // into a lake. Waterlogged GROUND is a different question — a mire is
    // ground you can lay a road over, and `geology.wetAt` is where that is
    // asked.
    flooded: (x, z, margin = 0) => {
      const level = water.shoreLevelAt(x, z);
      return level !== null && heightAt(x, z) < level + margin;
    },
    nearWater: (x, z, within) => water.nearestAt(x, z, within) !== null,
    water,
    geology,
  };
}

/** THE GROUND A ROAD MAY BE BUILT ON at a point, m — the base the road's
 * own roll (R34) then rides on top of, which is why the roll is subtracted
 * out of every answer that is a CLEARANCE rather than the land itself.
 *
 * Three grounds, in the order they win:
 *
 *   THE ICE (R48). A body the cold has frozen solid is a floor, and the
 *   floor is flat: the base is set so the road's surface lands exactly on
 *   the sheet, neither filled up off the lake bed nor floating over it.
 *
 *   THE FREEBOARD. Open water beside or under the line — the road stands
 *   clear of it by `elevation.follow.freeboard`, so a stage along a shore
 *   is a stage on the bank and never a causeway in the shallows. R35: the
 *   water it clears is the water actually HERE, at its own level. Against
 *   one table for the whole world a road crossing a tarn two hundred
 *   metres up reads the sea's level, decides it is comfortably clear, and
 *   drives straight through the lake.
 *
 *   THE COUNTRY, everywhere else.
 *
 * Stated once because THREE walks read it: the search's, which judges the
 * height of a road; the compiler's, which builds it; and the trial walk
 * that sizes the country around it. Two copies of this rule that drift
 * apart is a stage validated against a road nobody laid, or a landscape
 * that does not fit its own stage.
 *
 * It keeps a road out of water it was ROUTED into; it is not what keeps it
 * from being routed there. `keepsDry` in the searches does that, and this
 * is the backstop under it — the START in particular is a point no search
 * chooses at all. */
export function buildableAt(land: LandField, x: number, z: number, roll: number): number {
  const ice = land.iceAt(x, z);
  if (ice !== null) return ice - roll;
  const ground = land.heightAt(x, z);
  const water = land.openShoreLevelAt(x, z);
  return water === null ? ground : Math.max(ground, water + R.elevation.follow.freeboard - roll);
}

/** ...and the BARE ground under a point for the fill-and-cut caps (R34):
 * the country, or the ice where a body is frozen. A road across a frozen
 * lake stands on the lake — measured against the bed under it, every metre
 * of it would read as an embankment nobody built. */
export function landUnder(land: LandField, x: number, z: number): number {
  return land.iceAt(x, z) ?? land.heightAt(x, z);
}
