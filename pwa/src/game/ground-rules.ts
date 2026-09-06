// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE COUNTRY'S GROUND IS, as rules — stated once and DOM-free, so the
// tile paint (terrain.ts), the dust a wheel throws (ground-tint.ts, through
// car-fx.ts), the road's own colour (road-mesh.ts, textures.ts) and the
// tests all read the same answer:
//
//   - THE ELEVATION ZONES (R40, `BiomeLand.zones`): where a country's meadow
//     goes to rock and where its rock goes under snow. The taiga's rock line
//     runs 26..52 m and it has no snow; the alpine's stands a couple of
//     hundred metres higher with a snowline over it.
//   - THE SLOPE: a face shows rock whatever its height, and sheds snow.
//   - THE GRIT (`Biome.grit`): what a bladed road in this country is made
//     of, and so what colour its mat, its wheel tracks and its speckle are.

import * as THREE from "three";
import {
  CLIMATE,
  LAKE_Y,
  biomeRules,
  snowCoverAt,
  snowlineOf,
  type BiomeLand,
  type Climate,
} from "@engine";

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export type Zones = BiomeLand["zones"];

/** The zones of a country by id; unnamed, the taiga's, exactly as the
 * engine resolves an id it does not know. */
export function zonesOf(biome: string | undefined): Zones {
  return biomeRules(biome).land.zones;
}

/** The ground lattice's cell, m — the step the slope is read over. Restated
 * from the engine's `GROUND_CELL` on purpose: it is the reading's own
 * baseline, not a mesh size, and a finer step on a 14 m lattice reads the
 * same flat triangle twice. */
const STEP = 14;

/** The normal's Y where a slope starts showing bare rock, and the width of
 * that band — a flank steeper than about 45° is rock all the way. */
export const ROCK_SLOPE = { from: 0.88, band: 0.18 };
/** THE SNOW. Over `fade` metres the ground goes white, starting `lead`
 * metres UNDER the country's snowline — the road turns to packed snow at
 * the line itself, and a white road through bare grit is a road drawn on
 * the wrong picture, so the verge is already patched white when the road
 * gets there. On gentle ground first: a face's own snowline stands `climb`
 * metres higher per unit of lean (the normal's Y off vertical), so a slope
 * that would shed snow is rock a good way above the line, and anything
 * steeper than `slope.from` holds none at all. `patch` is the noise band
 * about the line where the rock still breaks through the cover, and
 * `patchFade` how far above the line those windows have closed. */
export const SNOW = {
  fade: CLIMATE.fade,
  lead: 10,
  climb: 120,
  slope: { from: 0.84, band: 0.24 },
  patch: 22,
  patchFade: 70,
};

/** THE ZONES UNDER A CLIMATE: the country's own, with its snowline brought
 * down to wherever the cold freezes the ground (`snowlineOf`, climate.ts)
 * — the zones the PAINT and the powder read, so a winter taiga is white to
 * the eye exactly where it is snow to the wheels. Not the zones the trees
 * are planted by: a forest stands through its winter, and `plantZone`
 * keeps the country's own line for that. */
export function zonesUnder(climate: Climate, zones: Zones): Zones {
  const snow = snowlineOf(climate, zones);
  return snow === zones.snow ? zones : { ...zones, snow: Number.isFinite(snow) ? snow : null };
}

/** Whether the ground at a height is under a winter's snow — where the
 * ground cover is not planted, because it is under the blanket. */
export function frozenAt(biome: string | undefined, climate: Climate, y: number): boolean {
  return snowCoverAt(climate, zonesOf(biome), y) > 0.5;
}

/** How much bare rock the ground shows, 0..1: steep flanks first (mountain
 * sides, the cut walls beside the road), then sheer altitude. The tile paint
 * lays the biome's bedrock over the meadow by exactly this much, and the
 * renderer asks the same question of the ground under the wheels — what a
 * tire throws has to be what it is standing on. */
export function bareRock(y: number, normalY: number, zones: Zones): number {
  const steep = clamp01((ROCK_SLOPE.from - normalY) / ROCK_SLOPE.band);
  return steep + (1 - steep) * clamp01((y - zones.rock.from) / (zones.rock.to - zones.rock.from));
}

/** How much of the ground lies under snow, 0..1, before the rock windows
 * the paint cuts in it: none in a country with no snowline, none on a face,
 * and a fade in over the first `SNOW.fade` metres above a line that climbs
 * with the ground's lean. The same rule for the tile paint and for what a
 * wheel throws up there. */
export function snowLie(y: number, normalY: number, zones: Zones): number {
  if (zones.snow === null) return 0;
  const line = zones.snow - SNOW.lead + (1 - normalY) * SNOW.climb;
  const lie = 1 - clamp01((SNOW.slope.from - normalY) / SNOW.slope.band);
  return clamp01((y - line) / SNOW.fade) * lie;
}

/** The ground's own slope-normal Y at a world position, read off the
 * RIDDEN lattice (the surface the physics uses). */
function normalAt(groundAt: (x: number, z: number) => number, x: number, z: number): number {
  const dx = (groundAt(x - STEP, z) - groundAt(x + STEP, z)) / (2 * STEP);
  const dz = (groundAt(x, z - STEP) - groundAt(x, z + STEP)) / (2 * STEP);
  return 1 / Math.hypot(dx, 1, dz);
}

/** The paint rules above, asked at a world position off the ridden ground
 * lattice, so anything reading the ground the car is on agrees with what is
 * drawn under it. `biome` is the country's id; unnamed, the taiga's zones. */
export function rockAt(
  groundAt: (x: number, z: number) => number,
  x: number,
  z: number,
  biome?: string,
): number {
  return bareRock(groundAt(x, z), normalAt(groundAt, x, z), zonesOf(biome));
}

export function snowAt(
  groundAt: (x: number, z: number) => number,
  x: number,
  z: number,
  biome?: string,
  climate?: Climate,
): number {
  const zones = climate ? zonesUnder(climate, zonesOf(biome)) : zonesOf(biome);
  return snowLie(groundAt(x, z), normalAt(groundAt, x, z), zones);
}

// ── What grows where ────────────────────────────────────────────────────

/** The context that owns a patch of ground for planting. Context beats
 * community: the water decides the shoreline and the stream banks, the
 * altitude decides the highland and the snow, and only ground that is none
 * of those grows whatever the quilt says it grows. */
export type PlantZone = "shore" | "snow" | "riparian" | "highland" | "community";

/** Which context a height stands in, in a country — the rule `mixAt`
 * (planting.ts) turns into a mix. Read off the same zones as the paint,
 * so the flora and the ground always tell the same story about how high
 * up this is: the highland takes over where the paint starts going to
 * rock, and over the snowline nothing is planted at all. */
export function plantZone(biome: string, y: number, riparian: boolean): PlantZone {
  const rules = biomeRules(biome);
  // R40 — a country with no water has no shoreline, however low its pans
  // lie: the height test is only a shoreline where there is water to
  // stand at.
  if (rules.water && y < LAKE_Y + 4) return "shore";
  const { rock, snow } = rules.land.zones;
  if (snow !== null && y > snow) return "snow";
  if (riparian) return "riparian";
  if (y > rock.from) return "highland";
  return "community";
}

// ── The grit ────────────────────────────────────────────────────────────

/** R40 — the speckle a grit is painted as: its ground and the four fleck
 * shades over it, as CSS colours, for the loose road's texture.
 *
 * The ground is the grit BLEACHED by its own paleness. Stone keeps its
 * colour on a road; sand does not — a road bladed out of sand goes the
 * colour of dry sand in the sun, nearly hueless, and drawn at the grit's
 * own tone it comes out ochre. A grit as dark as gravel or grey chippings
 * is left exactly as it is. The flecks are then two steps down (the wet and
 * the shaded stones) and two steps up toward white (the sun on the dry
 * ones), in the shares the taiga's gravel map was authored in — which is
 * what the road's edge fix is calibrated against.
 *
 * Plain sRGB arithmetic on purpose: the canvas is painted in sRGB, and the
 * shades are steps of the grit AS DRAWN, not of its linear light. */
export function looseShades(grit: number): { ground: string; flecks: string[] } {
  const rgb = [(grit >> 16) & 255, (grit >> 8) & 255, grit & 255];
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const bleach = clamp01((light - 0.62) / 0.25);
  const ground = rgb.map((v) => v + (255 - v) * bleach);
  const css = (c: number[]): string => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
  const dark = (k: number): string => css(ground.map((v) => v * k));
  const pale = (t: number): string => css(ground.map((v) => v + (255 - v) * t));
  return { ground: css(ground), flecks: [dark(0.89), pale(0.16), dark(0.76), pale(0.38)] };
}

/** R40 — the GRAVEL road's paint, for a country's own grit: the mat is the
 * grit a step lighter and a shade brighter (the loose dry stone on top),
 * the wheel tracks the grit a step darker (the packed subgrade showing
 * through). The offsets are the taiga's own — `ROAD_PAINT.gravel` IS this
 * rule applied to its grit — so a grey mountain grit comes out as a grey
 * road with the same wear on it. In HSL, because the hue is the grit's and
 * must not move. */
export function loosePaint(grit: number): { loose: THREE.Color; worn: THREE.Color } {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(grit).getHSL(hsl, THREE.SRGBColorSpace);
  return {
    loose: new THREE.Color().setHSL(
      hsl.h,
      Math.min(1, hsl.s * 1.37),
      Math.min(1, hsl.l + 0.127),
      THREE.SRGBColorSpace,
    ),
    worn: new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.145), THREE.SRGBColorSpace),
  };
}
