// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GROUND ITSELF. Everything above this decides what the roads and the
// people did to the country; this is where that becomes a HEIGHT — the bare
// land plus the corridor's earthworks, held under R31's cone, cut down
// through the rock where the road is bored or benched, carved through by
// the streams, and finally sampled on the ground lattice the car actually
// rides, because between two lattice corners the analytic field is not the
// ground at all.
//
// Beside the height it answers everything else a point has: what stands on
// it (water, ice, snow), how far it is from the nearest road or built
// thing, and which surface a branch under it is made of.

import { cellKey } from "../lib/math.ts";
import { smooth } from "../lib/noise.ts";
import type { Surface, Track } from "./compile.ts";
import type { CarParkField } from "./carparks.ts";
import { GROUND_CELL, TILE_SINK } from "./lattice.ts";
import { handoverAt, ROAD_CROSS } from "./road.ts";
import { landOf, STAGE_RULES as R } from "./rules.ts";
import type { SpurIndex } from "./spur-index.ts";
import { type RoadClear } from "./river.ts";
import { rectDistance } from "./farms.ts";
import {
  BED_DEPTH,
  carveGround,
  clamp01,
  inStream,
  streamWaterAt,
  WADE_LIP,
  type Stream,
} from "./terrain-streams.ts";
import {
  blanketDepth,
  CLIMATE,
  icyCountry,
  snowlineOf,
  snowyCountry,
  temperatureAt,
} from "../game/climate.ts";
import type { Cone } from "./terrain-cone.ts";
import type { SampleIndex } from "./terrain-index.ts";
import type { PadField } from "./terrain-pads.ts";
import type { Shaping } from "./terrain-shape.ts";

export type Ground = ReturnType<typeof createGround>;

export function createGround(
  track: Track,
  cone: Cone,
  index: SampleIndex,
  padField: PadField,
  shaping: Shaping,
  world: {
    streams: Stream[];
    spurs: SpurIndex;
    carParks: CarParkField;
  },
) {
  const samples = track.samples;
  const { streams, spurs, carParks } = world;
  const { nearestRoad } = index;
  const { pads, platforms, clearings, platformAt } = padField;
  const { platformClearance, padClearance, clearingAt } = padField;
  const { ribbonY, sideOf, apronAt, shapeAt } = shaping;
  const { CORRIDOR_RANGE, SPUR_CONE_REACH } = cone;
  const { VERGE_CLIMB, shelfEnd, farField, land, biome, shape } = cone;
  const { lipAt } = cone;
  const rawHeight = (x: number, z: number): number => {
    shapeAt(x, z);
    return shape.raised < shape.ceiling ? shape.raised : shape.ceiling;
  };

  /** R18 — the ground the water has (`waterGroundAt`, where the rule is
   * written down): the bare country held under the road's cut, with the
   * streams' own carve left out of it. */
  const waterGround = (x: number, z: number): number => {
    const shaped = rawHeight(x, z);
    const bare = farField(x, z);
    return shaped < bare ? shaped : bare;
  };

  /** R18 — a stream's channel keeps off the ground a road STANDS ON. The
   * carve is a bed cut `depth` under the water and blended out over
   * `BANK`, and beside a crossing the water is inside the corridor by
   * design: the sheet at the anchor, the first step of the course leaving
   * across the road, a mouth wandering a flat valley floor. Each of those
   * cut the corridor's outer band down to a bed metres below the ribbon —
   * the mouth's first point, fourteen metres out on a hillside, carved a
   * six-metre face along the apron beside every ford on the slope. So
   * the channel may go no deeper beside a road than the road's own
   * embankment: the corridor's underside less a ford's `BED_DEPTH` — which
   * is exactly the channel a ford has under its water — falling away past
   * the lip at the grade a fill's side falls at (R31's `climb`, read the
   * other way round). On flat country that is below every channel and
   * changes nothing; under a road on nineteen metres of fill it is the
   * fill's own slope, and a river at the toe of the fill has that slope
   * for its near bank instead of a bed cut into it. Not a fade over one
   * cell, as it first was: the lattice corners a cell past the lip are the
   * ones the band's triangles are interpolated from, and a corner in the
   * channel pulled the band down with it. A DECK stands over a ravine on
   * purpose and pins nothing (R13). */
  const bareHeightAt = (x: number, z: number): number => {
    const raw = rawHeight(x, z);
    let carved = carveGround(streams, x, z, raw);
    if (carved >= raw) return raw;
    // R39 — and a channel keeps off the ground a VILLAGE stands on, for the
    // reason it keeps off the ground a road stands on. The courses are
    // traced round a town already (`waterClear`), so this only ever catches
    // a channel's BANK reaching in over the band's rim — but a bank is a
    // metre of hillside under a front wall, and the band is what the houses
    // are standing on.
    if (platforms.length > 0) {
      const platform = platformAt(x, z, raw);
      if (platform) carved = raw + (carved - raw) * (1 - platform.weight);
      if (carved >= raw) return raw;
    }
    const near = nearestRoad(x, z);
    if (!near) return carved;
    const s = samples[near.index];
    // A deck stands over its channel, and a bore under whatever runs over
    // it (R47): neither pins the carve.
    if (s.deck != null || s.tunnel) return carved;
    const lip = lipAt(near.index);
    const floor =
      ribbonY(s, sideOf(near.lateral) * Math.min(near.d, lip), s.width) -
      TILE_SINK -
      BED_DEPTH -
      Math.max(0, near.d - lip) * VERGE_CLIMB;
    // A floor on the CARVE, never a lift of the ground: where the road's
    // underside stands over ground a pad or a platform graded lower, the
    // carve is simply refused.
    return Math.min(raw, carved > floor ? carved : floor);
  };

  /** R34 — how much the ground at a point is a FACE THE ROAD WAS CUT
   * THROUGH, 0 (open country, or a bank battered back to something a car
   * could climb) to 1 (blasted rock standing over the verge).
   *
   * Two faces, and the larger of them is the answer. The CUTTING: how hard
   * this piece of road was cut — the cone's own grade, already decided per
   * sample by `cutClimb` off the surface, the cover and the dial — times
   * how much country is actually standing on the cut here, because a
   * cutting is only a cutting where the land WANTED to be above the road,
   * and the same blasted tarmac running out across a flat has no face
   * beside it at all. And the JOIN (R31): where a cone lets go of a
   * mountain standing over it, the ground it stands up between the two is
   * as steep as the excess makes it, and past `verge.climbable` that is
   * rock too — the one face a road builds without blasting, and the reason
   * the car never meets a grass hillside it cannot climb.
   *
   * Cheap where it has to be. Almost every point the props ask about is
   * nowhere near a road, and that answer costs an index lookup or two —
   * the ground is only shaped once a road is close enough to have cut
   * it. */
  const cutAt = (x: number, z: number): number => {
    const C = R.verge.cut;
    const near = nearestRoad(x, z);
    if (!near || near.d > CORRIDOR_RANGE) {
      const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
      if (!spur || spur.d > SPUR_CONE_REACH) return 0;
    }
    // R47 — the trench under a bore is blasted rock the whole way: the
    // shelf's floor, the step at the lip and the face at either mouth.
    // Nothing roots in it, and no reader calls the step a slope.
    if (near && samples[near.index].tunnel) return 1;
    shapeAt(x, z);
    // The join counts as rock from the RUNOFF's grade up, not from
    // `climbable`: the band the fade stands at a hair under climbable in
    // the field is a band the 14 m lattice reads back well over the car's
    // limit, and a declaration that began there left every such join a
    // grass slope to the analysis and to the props.
    const join = clamp01((shape.fadeGrade - VERGE_CLIMB) / (C.face.max - VERGE_CLIMB));
    const blast = clamp01(
      (shape.ownClimb - VERGE_CLIMB) / Math.max(1e-6, C.face.max - VERGE_CLIMB),
    );
    if (blast <= 0) return join;
    const over = farField(x, z) - shape.cone;
    if (over <= C.bare.over) return join;
    return Math.max(
      join,
      blast * smooth(clamp01((over - C.bare.over) / (C.bare.full - C.bare.over))),
    );
  };

  /** The DRAWN corridor surface at a point — the ribbon the road mesh
   * builds, with no tile sink under it — and two different weights on it.
   * Null when the point is nowhere near a road.
   *
   * `cover` is whether a road is DRAWN over this point at all: 1 anywhere
   * inside the corridor, fading out past its lip. It answers "is the thing
   * under the wheels here a road", which is what the water check wants.
   *
   * `hand` is R16's HAND-OVER — how much of the ribbon's own HEIGHT still
   * applies. It leaves 1 at the bare shoulder and is spent by the corridor's
   * outer lip, so the ribbon and the ground lattice meet there at a shared
   * height rather than one stopping in the air over the other
   * (`handoverAt`). The two are not the same question: one number for both
   * is a vertical face down each side of the road. */
  type Corridor = { y: number; cover: number; hand: number };
  const corridorGround = (x: number, z: number): Corridor | null => {
    let best: Corridor | null = null;
    /** Two roads covering one point — a drive's mat across the stage's
     * verge, a lane's across an arm's — are a CHAIN of hand-overs, in the
     * order they are considered: the stage's ribbon holds the ground by its
     * own `hand`, and what it hands over TO is not the bare lattice but the
     * next road's ribbon by that road's hand, and only then the lattice.
     * Inside the stage's shoulder the stage owns the ground outright (a
     * drive lies ON the stage's cross-section there — R37), and where the
     * stage's hand-over fades past its bare shoulder the drive's mat is what
     * it fades onto, instead of a ditch under the mat. Decided by a PICK
     * instead, the ground steps wherever the pick changes hands — the
     * stage's verge sagging into its ditch under the drive's mat, a
     * half-metre step across the mouth — and averaged by hand alone, the
     * drive's own crown is laid over the stage's shoulder. */
    let chainY = 0;
    let chainHand = 0;
    const consider = (d: number, width: number, y: number): void => {
      const edge = width / 2 + ROAD_CROSS.reach;
      if (d > edge + 3) return;
      const cover = 1 - smooth(clamp01((d - edge) / 3));
      const hand = handoverAt(d - width / 2);
      chainY += (1 - chainHand) * hand * y;
      chainHand += (1 - chainHand) * hand;
      const blended = chainHand > 0 ? chainY / chainHand : y;
      if (best && best.cover >= cover) {
        best.y = blended;
        best.hand = chainHand;
        return;
      }
      best = { y: blended, cover, hand: chainHand };
    };
    const near = nearestRoad(x, z);
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const considerRoute = (): void => {
      if (!(near && near.d < shelfEnd + 3)) return;
      // The stage's ribbon BETWEEN its samples, not the nearest one's. The
      // road mesh draws the ribbon interpolated along the stage and the car
      // on the mat rides that same interpolation (track.ts `locate`), so the
      // ground beside the road has to as well — elevation AND profile, since
      // the width, the bank and the lift all move from one sample to the
      // next. Read off the nearest sample alone, a graded road's shoulder is
      // a sawtooth of steps every two metres, and the seam between the mat
      // and its verge is a step the car drops down every time it crosses it.
      const s = samples[near.index];
      const along = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
      const next =
        samples[Math.max(0, Math.min(samples.length - 1, near.index + Math.sign(along)))];
      const f = Math.min(1, Math.abs(along) / track.step);
      const side = sideOf(near.lateral);
      const here = ribbonY(s, side * Math.min(near.d, s.width / 2 + ROAD_CROSS.reach), s.width);
      const there = ribbonY(
        next,
        side * Math.min(near.d, next.width / 2 + ROAD_CROSS.reach),
        next.width,
      );
      consider(near.d, s.width, here + (there - here) * f);
    };
    const considerSpur = (): void => {
      if (!spur) return;
      const w = spur.spur.width;
      consider(spur.d, w, ribbonY(spur.sample, Math.min(spur.d, w / 2 + ROAD_CROSS.reach), w));
    };
    // Where two ribbons cover one point the ground is the HIGHER of the
    // two chains — the stage's ribbon leading, and the arm's leading. Off
    // the stage's mat but on an arm's, the stage's hand-over is still
    // fading across the arm, and the stage's ribbon there is its shoulder
    // and verge: half a metre under the arm's mat where the arm climbs
    // away from the junction on the platform's plane, so led by the stage
    // the car on the arm rode a dip the arm's own drawn mat never had. Led
    // by whichever mat the point is ON instead, the ground STEPS at the
    // stage mat's edge, where the lead changes hands. Each chain is
    // continuous in position and the higher of two continuous surfaces is
    // too; and the higher ribbon is the one drawn on top, which is the one
    // the car should be standing on. Inside the stage's own shoulder its
    // hand is whole and the arm gets no say, as under a drive (R37).
    // (Read through a function: the considers assign `best` from inside
    // closures, which the type narrowing does not see.)
    const chained = (): Corridor | null => best;
    considerRoute();
    considerSpur();
    if (spur && near) {
      const led = chained();
      best = null;
      chainY = 0;
      chainHand = 0;
      considerSpur();
      considerRoute();
      const other = chained();
      if (!other || (led && led.y >= other.y)) best = led;
    }
    // The apron wins over both: at a junction the ground IS the junction —
    // one graded plane, right out to its rim, with no hand-over of its own
    // to make (R17).
    const apron = apronAt(x, z);
    if (apron && apron.weight > 0) {
      const under: Corridor = best ?? { y: apron.y, cover: apron.weight, hand: apron.weight };
      return {
        y: apron.y * apron.weight + under.y * (1 - apron.weight),
        cover: Math.max(apron.weight, under.cover),
        hand: Math.max(apron.weight, under.hand),
      };
    }
    return best;
  };

  // Lattice corners are hot (every off-road step reads several), so they
  // are cached; the cache clears whenever the field itself changes shape
  // (new streams carved, the endless prune re-anchoring the corridor).
  let cornerCache = new Map<number, number>();
  let blanketCache = new Map<number, number>();
  const cornerHeight = (i: number, j: number): number => {
    const key = cellKey(i, j);
    const hit = cornerCache.get(key);
    if (hit !== undefined) return hit;
    if (cornerCache.size > 8192) {
      cornerCache = new Map();
      blanketCache = new Map();
    }
    // The snow on the corner is cached beside its height — the lattice
    // the car rides is sunk into the blanket by `groundAt`, and it asks
    // how deep the blanket is at every step.
    const bare = bareHeightAt(i * GROUND_CELL, j * GROUND_CELL);
    const snow = blanketOver(i * GROUND_CELL, j * GROUND_CELL, bare);
    cornerCache.set(key, bare + snow);
    blanketCache.set(key, snow);
    return bare + snow;
  };
  const cornerBlanket = (i: number, j: number): number => {
    const key = cellKey(i, j);
    let hit = blanketCache.get(key);
    if (hit === undefined) {
      cornerHeight(i, j);
      hit = blanketCache.get(key) ?? 0;
    }
    return hit;
  };

  // Each lattice cell splits into two triangles along the same diagonal the
  // renderer's tile indexing uses — (i+1,j) to (i,j+1) — so this is the
  // exact drawn surface, not an approximation of it.
  const latticeAt = (x: number, z: number): number => {
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = cornerHeight(i, j);
      return h00 + fx * (cornerHeight(i + 1, j) - h00) + fz * (cornerHeight(i, j + 1) - h00);
    }
    const h11 = cornerHeight(i + 1, j + 1);
    return (
      h11 + (1 - fx) * (cornerHeight(i, j + 1) - h11) + (1 - fz) * (cornerHeight(i + 1, j) - h11)
    );
  };

  /** The winter's blanket under a point, m, interpolated across the same
   * triangles the lattice is (climate.ts) — zero everywhere the country is
   * not under snow, on the road and its verge, on the water, and in a
   * country that has no winter. */
  const blanketAt = (x: number, z: number): number => {
    if (!snowy) return 0;
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const b00 = cornerBlanket(i, j);
      return b00 + fx * (cornerBlanket(i + 1, j) - b00) + fz * (cornerBlanket(i, j + 1) - b00);
    }
    const b11 = cornerBlanket(i + 1, j + 1);
    return (
      b11 + (1 - fx) * (cornerBlanket(i, j + 1) - b11) + (1 - fz) * (cornerBlanket(i + 1, j) - b11)
    );
  };

  const groundAt = (x: number, z: number): number => {
    // R48 — over a body the cold has frozen SOLID the ground is the sheet.
    // It is a floor and it is flat, and it stands over the bed the lattice
    // draws: a car crossing a frozen lake drives on the ice, and there is
    // no lake under it as far as the wheels are concerned.
    const ice = iceAt(x, z);
    const lattice = ice ?? latticeAt(x, z);
    // Beside a road the DRAWN surface is the ribbon, not the tile under it
    // — its crown, its wheel tracks, its shoulder (R16). The lattice is 14 m
    // between corners and could not hold any of that, so out to the shoulder
    // the physics rides the ribbon; past it R16's hand-over leans onto the
    // tiles, and by the corridor's lip they have it.
    //
    // ...and under a winter's blanket the car rides INSIDE the drawn
    // surface, not on it: the lattice carries the snow at its full depth,
    // and the wheels stand on what they have packed of it
    // (`CLIMATE.blanket.ride`) — the rest is the sills ploughing through.
    const sink = snowy ? blanketAt(x, z) * (1 - CLIMATE.blanket.ride) : 0;
    const corridor = corridorGround(x, z);
    if (!corridor) return lattice - sink;
    return corridor.y * corridor.hand + (lattice - sink) * (1 - corridor.hand);
  };

  /** The ROAD standing over a point: the height of the ribbon the car
   * drives there, or null where no road covers the point — and null on a
   * BRIDGE, because a deck is a road over the water rather than ground
   * over it, and what runs under one is still the river it spans (R13). */
  const roadTopAt = (x: number, z: number): number | null => {
    const near = nearestRoad(x, z);
    // Only the actual ribbon hides water. The wider corridor is the graded
    // ground beside the road; suppressing water there would trim a ford's
    // channel at the road edge and make it look painted onto the tarmac.
    const onRoute = near !== null && near.d <= samples[near.index].width / 2 + 0.1;
    if (onRoute && samples[near.index].deck !== null) return null;
    // ...and a BRANCH is a road (R17). The route is not the only thing that
    // crosses a valley on fill: a lane carried over the same water is dry
    // mat with a channel under it in exactly the way the route's is, and
    // reading only the route left the sheet drawn across a branch's tarmac
    // — and told a car standing on it that it was in a river.
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const onBranch = spur !== null && spur.d <= spur.spur.width / 2 + 0.1;
    if (!onRoute && !onBranch) return null;
    const corridor = corridorGround(x, z);
    return corridor ? corridor.y : null;
  };

  /** R48 — the ICE standing over a point, m: the surface of a body the
   * cold has frozen solid, or null where the point is dry, where the water
   * covering it is still open, or where the drawn ground stands over it.
   *
   * Asked of the same ground `waterAt` is asked of — the LATTICE the world
   * actually shows, not the analytic field between its corners — so the
   * ice ends exactly where the water it replaced would have, and there is
   * no step at the shore for a car to fall down or climb. */
  const iceAt = (x: number, z: number): number | null => {
    if (!freezes) return null;
    // The body covering THIS point, at its own level — the same reading the
    // compiler classified the road's samples with, so the ground the car
    // stands on and the surface it is told it is on are the same number.
    // R48 — a RIVER the cold has closed is the same floor: whichever of the
    // two is here, and the reach is asked first because a river running
    // into a lake lies over the lake's own shore.
    const level = streamWaterAt(streams, x, z, true) ?? land.iceAt(x, z);
    if (level === null) return null;
    // ...but only where the world SHOWS the lake. The road builds its own
    // shoulder out over the first stride of a crossing, and on that
    // shoulder the car is on the road's fill, not on the sheet under it.
    return latticeAt(x, z) < level ? level : null;
  };

  const waterAt = (x: number, z: number): number | null => {
    // The ground the question is asked of is the one the world SHOWS: the
    // lattice the tiles are drawn on, not the analytic field between its
    // corners. A channel too narrow for the lattice to hold runs UNDER a
    // hillside the tiles never dip into, and a car up there is on the
    // hillside — there is nothing to drown in.
    const ground = latticeAt(x, z);
    // R35 — the standing water here is whatever the POUR left at this
    // point, at that body's own level, not one table for the whole world.
    // The level is asked of the bare country and the waterline is settled
    // against the drawn lattice, which is what keeps an embankment across
    // a lake dry on top and wet either side of it.
    // R48 — a body the cold has frozen solid is not water at all: it is
    // the ground the car is standing on. Nothing drowns in it and nothing
    // splashes. A REACH of river the cold has closed is the same floor,
    // and its open reaches — the drops, and the ford the stage wades —
    // are still exactly the water they were in summer (`freezeReach`).
    if (iceAt(x, z) !== null) return null;
    const lake = land.water.shoreLevelAt(x, z);
    const surface = lake !== null && ground < lake ? lake : streamWaterAt(streams, x, z, false);
    if (surface === null || ground >= surface - 0.02) return null;
    // R47 — water over a BORE is on the mountain, not on the road under
    // it: a stream crossing the ground over a tunnel is twenty metres
    // above the car driving through, and a car asked for the water at its
    // own position must not be told it is in a river.
    const bored = nearestRoad(x, z);
    if (bored && samples[bored.index].tunnel && bored.d <= samples[bored.index].width / 2 + 3) {
      return null;
    }
    // ...and a road over it is another layer again: an embankment across a
    // lake, or a shelf cut above a stream, is dry road with water below,
    // not water. Only a ford — whose ribbon lies AT the water it wades —
    // is still wet.
    const road = roadTopAt(x, z);
    if (road !== null && road > surface + WADE_LIP) return null;
    return surface;
  };

  /** R48 — standing water HERE, open or frozen: what nothing may be stood
   * on. `waterAt` stops answering for a body once the cold has turned it
   * into ground, and a crowd on a lake is a crowd on a lake whether or not
   * the lake would hold them. */
  const overWater = (x: number, z: number): boolean =>
    waterAt(x, z) !== null || iceAt(x, z) !== null;

  /** Distance from a point to the nearest ABANDONED BRANCH's mat edge, or
   * Infinity when there is none near — nothing is planted on a road, and a
   * spur is as much a road as the stage is (R17). */
  const builtClearance = (x: number, z: number): number => {
    let yard = pads.length > 0 ? padClearance(x, z) : Infinity;
    if (clearings.length > 0) yard = Math.min(yard, clearingAt(x, z).d);
    if (spurs.spurs.length === 0) return yard;
    const spur = spurs.nearest(x, z);
    return Math.min(yard, spur ? spur.d - spur.spur.width / 2 : Infinity);
  };
  // R42 — a trodden path is not a road (a road may cross one), but nothing
  // grows on one either: the forest reads the paths, the placers do not.
  const spurClearance = (x: number, z: number): number => {
    const built = builtClearance(x, z);
    if (carParks.carParks.length === 0) return built;
    return Math.min(built, carParks.trailClearance(x, z));
  };

  // ── THE WINTER'S BLANKET (climate.ts) ────────────────────────────────
  // Where the country is frozen the untouched ground lies under half a
  // metre and more of snow, and the ground the world SHOWS is the top of
  // it: the analytic field below is the bare country plus the blanket, so
  // every tile corner, every tree foot and every stone stands on the snow.
  // It is cleared wherever something has driven or bladed it — the stage's
  // own corridor out to its lip, an abandoned arm, a drive, a yard, a car
  // park's trails — and it ramps back to full depth over `blanket.verge`
  // metres, which is the bank a ploughed road stands between. It keeps off
  // the water and a stream's channel, and it is not laid at all in a
  // country the climate leaves green, nor on the training ground, which
  // was never a country. How deep it lies is the cold's at THIS height
  // (`blanketDepth`), read off the bare ground so the roads and the nature
  // are drawn onto a temperature that already exists.
  const climate = track.climate;
  const zones = landOf(track.knobs).zones;
  const snowy = track.arena === null && snowyCountry(climate, zones);
  const snowline = snowlineOf(climate, zones);
  /** R48 — whether any body on this country CAN be frozen: its ground has
   * to reach the height the air drops to `CLIMATE.ice` at. A fast no for
   * every warm stage, so the ice costs a summer nothing at all — and a
   * loose yes, because it asks about the country's ceiling rather than
   * about the lakes, which lie well under it. */
  const freezes = track.arena === null && icyCountry(climate, zones);
  const blanketOver = (x: number, z: number, bare: number): number => {
    if (!snowy) return 0;
    const cover = clamp01((bare - snowline) / CLIMATE.fade);
    if (cover <= 0) return 0;
    const V = CLIMATE.blanket.verge;
    let clear = 1;
    const near = nearestRoad(x, z);
    if (near && near.d < CORRIDOR_RANGE) {
      clear = clamp01((near.d - lipAt(near.index)) / V);
      if (clear <= 0) return 0;
    }
    const spur = spurClearance(x, z);
    if (spur < V) {
      clear = Math.min(clear, clamp01(spur / V));
      if (clear <= 0) return 0;
    }
    const lake = land.water.shoreLevelAt(x, z);
    if (lake !== null && bare < lake + 1.5) {
      clear = Math.min(clear, clamp01((bare - lake - 0.3) / 1.2));
      if (clear <= 0) return 0;
    }
    if (inStream(streams, x, z, 1)) return 0;
    return blanketDepth(temperatureAt(climate, bare)) * cover * smooth(clear);
  };
  const heightAt = (x: number, z: number): number => {
    const bare = bareHeightAt(x, z);
    return snowy ? bare + blanketOver(x, z, bare) : bare;
  };

  /** Distance from a point to the nearest road's outer EDGE — stage or
   * abandoned branch, ribbon and verge included — negative on the road
   * itself. R18's water steers by it, and nothing is planted or stood
   * anywhere it comes back negative.
   *
   * Measured against the stage's NOMINAL corridor, deliberately: R18's
   * watercourses are traced against this, so a width that moves with the
   * road's own wander (R33) and its junction mouths (R17) would move every
   * river on every stage to buy a metre of accuracy the water cannot see.
   * What has to know the road's real width is the code that STANDS things
   * beside it — `props.ts` and the renderer's planting — and both ask the
   * sample rather than this. */
  const roadClear: RoadClear = (x, z) => {
    const near = nearestRoad(x, z);
    const stage = near ? near.d - shelfEnd : Infinity;
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const branch = spur ? spur.d - spur.spur.width / 2 - ROAD_CROSS.reach : Infinity;
    return Math.min(stage, branch);
  };

  /** R43 — distance from a point to the nearest energy plant's ground: a
   * solar farm's fence or a turbine's crane pad, negative inside. The
   * watercourses steer by it exactly as they steer by a road, because a
   * river through a field of panels is a field of panels standing in a
   * river; the country's paddocks and fields stay where the water finds
   * them, which is where a real field is. */
  const energyClear = (x: number, z: number): number => {
    let best = Infinity;
    for (const farm of track.solarFarms) {
      const { rect } = farm;
      const reach = Math.hypot(rect.width, rect.depth) / 2 + 1;
      if (Math.abs(x - rect.x) > reach || Math.abs(z - rect.z) > reach) continue;
      best = Math.min(best, rectDistance(rect, x, z));
    }
    for (const farm of track.windFarms) {
      for (const t of farm.turbines) {
        best = Math.min(best, Math.hypot(t.x - x, t.z - z) - R.energy.wind.pad.radius);
      }
    }
    return best;
  };
  const waterClear: RoadClear = (x, z) =>
    Math.min(
      roadClear(x, z),
      energyClear(x, z),
      platforms.length > 0 ? platformClearance(x, z) : Infinity,
    );

  const spurSurfaceAt = (x: number, z: number): Surface | null => {
    if (pads.length > 0 && padClearance(x, z) <= 0) return biome.loose;
    // R37 — a ploughed field is soft going: turned soil to the wheels.
    if (clearings.length > 0) {
      const clearing = clearingAt(x, z);
      if (clearing.d <= 0 && clearing.surface !== null) return clearing.surface;
    }
    if (spurs.spurs.length === 0) return null;
    const spur = spurs.nearest(x, z);
    if (!spur || spur.d > spur.spur.width / 2) return null;
    return spur.sample.surface;
  };

  // Everything solid that stands on this ground, and the region/grove quilt
  // that decides what kind of place it stands in (props.ts). It reads the
  // field through these functions rather than sharing its state, so the
  // engine's copy and the renderer's copy of the world always agree.
  return {
    rawHeight,
    waterGround,
    bareHeightAt,
    cutAt,
    corridorGround,
    cornerHeight,
    cornerBlanket,
    latticeAt,
    blanketAt,
    groundAt,
    roadTopAt,
    iceAt,
    waterAt,
    overWater,
    builtClearance,
    spurClearance,
    climate,
    zones,
    snowy,
    snowline,
    freezes,
    blanketOver,
    heightAt,
    roadClear,
    energyClear,
    waterClear,
    spurSurfaceAt,
    /** Drop the per-corner memo: an endless run's lattice moves on, and a
     * corner remembered from road the world has forgotten answers with a
     * height that is no longer under anything. */
    clearCornerCache: (): void => {
      cornerCache = new Map();
    },
  };
}
