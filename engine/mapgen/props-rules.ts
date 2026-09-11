// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIALS THE WILD IS DRAWN FROM — every number `props.ts` reads when it
// decides what stands on a patch of open country, and nothing that decides
// it. The builders there are a page of arithmetic each; these are the
// authored figures under them, and keeping the two apart is what lets a
// reader change the size of a boulder field without reading the search that
// places one.
//
// One block per KIND of thing, in the order the field builds them: the deep
// wild's obstacles and its blowdowns, the litter and the boulder fields the
// open ground sheds, the outcrops where the bedrock breaks surface, the
// slabs in the cut wall beside the road, and the timber a logging block
// leaves stacked. Units are on every one of them; the spatial ones are a
// CELL EDGE in metres — one candidate is seeded per cell, and the density
// beside it is the share of cells that actually carry one.
//
// What is NOT here is the QUILT's own dials — the stand noise, the tree
// cell, the clump. Those stay beside the quilt code in `props.ts` that
// reads them, because they say what KIND OF PLACE a patch of ground is
// rather than what stands on it, and that is a different question with
// different readers (the map view paints the forest from the same rows).

import { STAGE_RULES } from "./rules.ts";

/** R32 — what the SOIL decides about a wood, stated in the rules data so
 * that the map view's FOLIAGE layer paints the same rule the forest is
 * planted from (pwa/src/game/map-layers.ts) rather than a copy of it. */
export const { depth: ROOT_DEPTH, thin: ROOT_THIN, full: ROOT_FULL } = STAGE_RULES.forest.rooting;
/** ...and what it BURIES. Loose stone lies on the surface where the cover is
 * thin and is buried where it is deep: `SHED_BURIES` is the soil depth that
 * hides all of it, and `SHED_MIN` the share that shows anyway, because a
 * field always turns up a few. */
export const SHED_BURIES = 2.6;
export const SHED_MIN = 0.18;

/** One obstacle candidate per grid cell of this edge, m. */
export const OB_CELL = 56;
/** Fraction of cells that actually hold one. */
export const OB_DENSITY = 0.45;
/** Obstacles keep this far from the road centerline beyond the half-width. */
export const OB_ROAD_CLEAR = 10;
/** Share of the deep wild's fallen trunks that came down in a gale and
 * still hold their root plate up on end at the butt. They are a KIND of
 * their own (`rootlog`) rather than a flag on a log: the plate stands a
 * metre and a half over a thing you could otherwise drive across, so the
 * collision shape has to know about it too. */
export const ROOTED_LOG_SHARE = 0.45;

/** Blowdowns: metres of period for the noise that says where a gale went
 * through this forest, the level it has to reach for one, and what the deep
 * wild's fallen timber is multiplied by inside it. A trunk down on its own is
 * a prop somebody dropped; five of them lying parallel down the same slope is
 * weather, and weather is what a boreal forest is mostly made of. */
export const WINDTHROW_SCALE = 190;
export const WINDTHROW_FROM = 0.56;
export const WINDTHROW_DENSITY = 2.6;
/** The most trunks one candidate lays down in the middle of a blowdown, and
 * how far apart they lie ACROSS the fall line, m — far enough apart that a
 * car meets one at a time. */
export const BLOWDOWN_MAX = 3;
export const BLOWDOWN_GAP_MIN = 5.5;
export const BLOWDOWN_GAP_MAX = 10;
/** How far apart the ground is sampled to read which way is downhill, m, and
 * the gradient below which a slope has no opinion and the gale decides. */
export const FALL_SPAN = 5;
export const FALL_SLOPE = 0.06;

/** One loose-rock candidate per grid cell of this edge, m, and the share
 * of cells that hold one — the open ground's rock litter, a field of its
 * own because it runs much closer to the road than the deep-wild props
 * above and because most of the landscape carries some. */
export const ROCK_CELL = 30;
export const ROCK_DENSITY = 0.38;
/** How big a loose rock gets, as the radius of the lump before it is
 * squashed: the small end is pebble litter the field drops (see
 * SOLID_PROP_HEIGHT), the big end is a boulder that ends a run. */
export const ROCK_SIZE_MIN = 0.3;
export const ROCK_SIZE_MAX = 2.1;
/** Boulder fields: metres of period for the noise that says where the
 * ground sheds stone, the level it has to reach for one, and what the
 * litter there gets multiplied by. An isolated rock in a meadow reads as a
 * prop somebody placed; a slope carrying forty of them reads as geology,
 * which is the whole reason to have them. */
export const BOULDER_SCALE = 130;
export const BOULDER_FROM = 0.62;
export const BOULDER_DENSITY = 1.5;
export const BOULDER_SIZE = 1.5;
/** Share of the litter under a WOODED grove that is a cut stump rather
 * than a rock, and the size band one comes in. A stump is a round solid a
 * collision circle describes exactly, which is why the litter field grows
 * these and leaves the long fallen trunks to the deep wild. */
export const STUMP_SHARE = 0.3;
export const STUMP_SIZE_MIN = 0.75;
export const STUMP_SIZE_MAX = 1.35;
/** Grove density at or above which the ground counts as wooded — a meadow
 * has nothing to have been felled. (The communities that are ALL stumps
 * whatever their density says are the biome's `felled` list.) */
export const STUMP_GROVE_DENSITY = 0.5;

/** ROCKY OUTCROPS: one candidate per grid cell of this edge, m, and the
 * share of those that carry one. A lone boulder in a field reads as a prop
 * somebody placed however well it is drawn; a knot of stone shouldering out
 * of a hillside reads as the hill itself, which is the only reason to have
 * rocks in a landscape at all. So the deep wild grows CLUSTERS: half a dozen
 * to a dozen stones bedded into one slope, biggest first, strung out along
 * the contour the way a bed of rock actually breaks surface. */
export const OUTCROP_CELL = 120;
export const OUTCROP_CHANCE = 0.75;
/** How many stones one outcrop is made of. */
export const OUTCROP_MIN = 5;
export const OUTCROP_MAX = 10;
/** How far its stones spread from its middle, m — along the contour, and
 * this much again halved up and down the slope. */
export const OUTCROP_SPREAD = 8;
/** How big its stones get, smallest at the ends of the band and biggest in
 * the middle. The small end is set by what the field is ALLOWED to place: a
 * stone has to stand SOLID_PROP_HEIGHT over the ground once it is bedded in,
 * and one too small to do that is litter the renderer scatters for itself. */
export const OUTCROP_SIZE_MIN = 0.8;
export const OUTCROP_SIZE_MAX = 1.7;
/** The gradient the ground under one has to have. Bedrock shows where the
 * hill is steep, which is the same rule the terrain's own paint follows —
 * so an outcrop stands in ground that is already painted as rock. */
export const OUTCROP_SLOPE = 0.22;
/** How deep into the hill a stone is bedded, as a share of its own height.
 * This is the whole difference between geology and litter: a rock sitting ON
 * a slope was dropped there, one sunk half its depth INTO it grew there. */
export const OUTCROP_SINK = 0.45;

/** One CUT-WALL SLAB candidate per grid cell of this edge, m — a fine grid,
 * because a slab only ever stands in the narrow band beside the road where
 * the ground is climbing out of a cut. (The outcrops above are the same rock
 * out in the country; these are the face the road was cut through.) */
export const SLAB_CELL = 16;
/** ...and the share of those that stand up where the ground allows one. */
export const SLAB_CHANCE = 0.7;
/** How far out from the road the wall is measured, and how far it has to
 * have climbed over the road there, m: the cut an outcrop belongs to. */
export const SLAB_WALL_SPAN = 16;
export const SLAB_WALL_RISE = 6;
/** How far past the road edge an outcrop's foot may sit, m. */
export const SLAB_BAND = 10;

/** One timber-stack candidate per grid cell of this edge, m, and the share
 * of those that stand. Cut timber is stacked where it was cut and left for
 * the lorry, so a stack only appears on ground a logging grove owns — one
 * every few hundred metres of a logging block, which is what makes the
 * block read as one. How big one STANDS is solids.ts's (`solidShape`), like
 * every other solid. */
export const TIMBER_CELL = 110;
export const TIMBER_CHANCE = 0.55;
