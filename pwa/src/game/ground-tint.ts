// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GROUND UNDER THE CAR IS MADE OF, as colors — the answers the
// grit a wheel throws (the renderer's wheel logic) and the cloud the car
// tows (plume.ts) are both read off, so a stage never has a rooster tail of
// one substance under a plume of another.
//
// They are two answers rather than one, and the difference is the point: a
// wheel throws whatever it is standing on, where a cloud can only be made
// of ground that has loose dry dust in it. `groundTint` is the first
// question and `plumeGround` the second.
//
// Colors, and the one thing only a colour can say — that a given ground has
// nothing to hang in the air. WHEN an effect happens otherwise stays with
// whoever owns the effect.

import * as THREE from "three";

import { biomeFor } from "./biome.ts";
import { type DustTint } from "./dust.ts";

/** Dry grit: the loose stuff lying on top of a graded road. */
export const GRIT = 0xb29268;

/** Water, thrown as a blue sheet. */
export const SPRAY = 0x4fa0f0;

/** WET GROUND. Rain does not merely dampen a gravel road, it changes what
 * the road IS: the dust is gone, and what a wheel picks up is clods of the
 * soaked grit under it — the one thing on a stage darker than the road
 * itself. Two tones because a clod is not one: wet earth, with the water's
 * own sheen on the faces that catch the sky. */
export const MUD_CLODS: DustTint = { base: 0x4a3a29, fleck: 0x6d5a43, fleckMix: 0.34 };

/** Off the road there is turf on top of the earth, and a wheel brings up
 * both — but MOSTLY THE EARTH. A tyre digging into a verge cuts straight
 * through the turf into the soil under it, so what comes out of the arch is
 * dirt with torn grass through it, not a spray of grass with dirt through
 * it. The majority tone has to be the earth for the same reason the wild
 * lifts no cloud at all (`plumeGround`): green is what a FIELD is, and a
 * green cloud coming off a car reads as the effect having picked up the
 * ground's paint rather than as anything the wheels dug up. The blades are
 * the biome's own meadow taken a shade down — a blade in the air is not lit
 * like the field it came out of. */
export const WILD_DUST: DustTint = {
  base: 0x4a3520,
  fleck: new THREE.Color(biomeFor().ground.grass).multiplyScalar(0.86).getHex(),
  fleckMix: 0.3,
};

/** What a mountain gives instead. Above the tree line and on the steep
 * flanks there is no turf to tear — a wheel scrabbles on bedrock and throws
 * the stone itself, the biome's own rock with the darker shade of it
 * through the cloud. Lighter than the rock face it comes off, because
 * shattered grit catches the sky where a flat face does not. */
export const STONE_DUST: DustTint = {
  base: new THREE.Color(biomeFor().ground.bedrock).multiplyScalar(1.06).getHex(),
  fleck: biomeFor().ground.bedrockDark,
  fleckMix: 0.32,
};

/** Tire smoke — boiled off the rubber, so it is the one cloud in the game
 * that has nothing to do with the ground under the car. */
export const SMOKE = 0xd8d5cf;

/** …and what it turns into once the same tire has been sliding for a while.
 * Cooking rubber stops giving up clean white smoke and starts giving up
 * SOOT, and the tell that a drift has gone from committed to expensive is
 * that the cloud behind the car goes black. Mixed grain by grain rather
 * than blended, so a smoking tire throws some of each and the cloud reads
 * as DARKENING rather than as a different effect switching on. */
const RUBBER_SOOT = 0x24211e;

/** How fast a sliding tire cooks and how fast it cools, as shares of the
 * heat per second at full slide, and how black the cloud ever gets.
 *
 * Judged against the length of a real sealed-surface drift, which is about
 * a second: a flick caught early comes out grey, a slide held to the exit
 * comes out properly dark, and nothing ever gets there without committing.
 * The soot is the reward for holding a slide, not the price of turning the
 * wheel — and it cools faster than it builds, so the black is gone within
 * a second of the tires hooking back up. */
export const SOOT = { heat: 0.9, cool: 0.75, mix: 0.7 };

/** The live tint the tarmac smoke is spawned with — ONE object for the life
 * of the app, rewritten in place. It is set on a path that runs several
 * times a second, and a fresh object each time is garbage the collector
 * answers with a pause in the middle of a drift. */
const smokeTint: DustTint = { base: SMOKE, fleck: RUBBER_SOOT, fleckMix: 0 };

/** Tire smoke at a given heat, 0..1 — white off a tire that has only just
 * let go, sootier the longer it has been cooking. */
export function sootySmoke(heat: number): DustTint {
  smokeTint.fleckMix = Math.max(0, Math.min(1, heat)) * SOOT.mix;
  return smokeTint;
}

/** What a wheel throws where. The road's is one tone of dry grit; the
 * WILD's is two, because a verge is grass with earth under it — the wheel
 * tears the turf and both come up together, mostly green with dark clods
 * through it. But the wild is not one ground: a mountain flank has no turf
 * on it, and green grit coming off bare rock is the tell. So off the road
 * the cloud is chosen from the ground the car is actually standing on, by
 * the same rule the terrain is PAINTED with, and a burst at a time rather
 * than blended — a hillside going over to rock throws some of each, which
 * reads as the ground changing instead of the effect switching.
 *
 * `wet` is the weather's own answer, and it comes FIRST: a soaked meadow
 * and a soaked gravel road throw the same dark clods, because the dry
 * difference between them is a difference between two kinds of DUST and
 * that is exactly what the rain has taken away.
 */
export function groundTint(surface: string, wet: boolean, rock: () => number): number | DustTint {
  if (surface === "water") return SPRAY;
  if (wet && surface !== "asphalt") return MUD_CLODS;
  if (surface !== "nature") return GRIT;
  return Math.random() < rock() ? STONE_DUST : WILD_DUST;
}

/** What HANGS IN THE AIR behind the car, which is a narrower question than
 * what a wheel throws, and the two must not be answered together.
 *
 * A wheel throws whatever it is standing on: a verge gives it clods and torn
 * turf, and those are GRAINS — thrown, arcing, back on the ground inside a
 * second. A CLOUD is something else. It is fine dry dust lifted off a
 * surface that has nothing binding it, and grass is precisely the thing that
 * binds a surface: turf holds its soil down, which is why a car crossing a
 * meadow leaves torn ground behind it and no plume over it at all. A green
 * cloud is not a quieter version of a dust cloud — it is a substance that
 * does not exist, and the effect reads as the ground's paint having been
 * smeared into the air.
 *
 * So off the road the plume comes off BARE STONE and nothing else: `amount`
 * is the share of the ground under the wheels that is exposed bedrock, by
 * the same test the terrain is painted with, so a scree flank throws a full
 * cloud, a meadow throws none, and a hillside going over to rock fades
 * between the two instead of switching. Null means this ground has no dust
 * in it to lift.
 */
export type PlumeGround = {
  /** What the hanging dust is coloured. */
  tint: number | DustTint;
  /** How much of this ground is actually loose dust, 0..1 — the cloud's own
   * density on top of everything pace already decides. */
  amount: number;
} | null;

export function plumeGround(surface: string, wet: boolean, rock: () => number): PlumeGround {
  if (surface === "water" || surface === "asphalt" || wet) return null;
  if (surface !== "nature") return { tint: GRIT, amount: 1 };
  const bare = rock();
  return bare > 0 ? { tint: STONE_DUST, amount: bare } : null;
}
