// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SNOW REMEMBERS. Every other surface in the game is a fact about a
// place: gravel is gravel whoever drove over it and however often. Snow is
// not. A tyre rolling through it does not brush it aside — it COMPRESSES
// it, from the hundred-odd kg/m³ a fresh fall settles at to the four to six
// hundred traffic works it up to, and since the mass has nowhere to go the
// same snow now stands at a fraction of its old height and STAYS there.
//
// That is the whole model, and everything a winter stage does follows from
// it (the numbers, and why each is what it is, are `CLIMATE.pack`):
//
//   * A car on untouched snow leaves a trail that is a real hole in the
//     ground — two wheel tracks pressed down to what they packed, a crown
//     standing between them where the body straddled, and a wall of
//     untouched snow either side.
//   * The trail is EASIER to drive than the field beside it. What holds a
//     car back in snow is the depth it has to plough, and a track has
//     almost none left; so a car follows its own trail out of a field, and
//     follows the field's out of a corner.
//   * ...and it HOLDS WORSE. Packed snow is a floor a tread slides on where
//     fresh snow is crystals it cuts into — measured on winter roads, 0.2
//     against 0.43. So the racing line is the fast line and the loose line
//     is the one that grips, and a snow stage is that choice, corner by
//     corner.
//   * The stage's own road arrives already worn: R16's five lines
//     (`wearAt`) ARE the pack the traffic before this car left in it, so a
//     snow road is a shallow cover over the crown with two polished tracks
//     cut through it, and the bank at the lip is the field it was bladed
//     out of.
//
// WHAT IS STORED is only what has CHANGED. The untouched depth at a point
// is analytic — the blanket off the road (terrain.ts), the cover on it
// (`TrackSample.snow`) — and so is how worn the road already was, so a
// stage nobody has driven costs nothing and reads exactly as it always
// did. Only the cells a wheel has actually crossed are kept, in a hash
// table of the carved share alone, grown as the run needs it and capped so
// a car that spends a stage in the country cannot grow it without end.
//
// Deterministic, like everything else in the engine: the cells are written
// in step order and read by interpolation, so two runs of one seed leave
// the same snow and a replay drives its own ruts.

import { clamp } from "../lib/math.ts";
import { handoverAt, ROAD_CROSS, snowWear } from "../mapgen/road.ts";
import { flatTrack, type Track } from "../mapgen/index.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { CLIMATE, packedBy, packedDepth, snowRide, snowWade } from "./climate.ts";
import { TUNING } from "./defs/tuning.ts";

/** WHAT SNOW LIES UNDER A POINT, before this run touched it: how deep it
 * stood, and how worked the traffic that came before had already left it.
 * Filled rather than returned — the step asks it four times per tick, once
 * per wheel, and a fresh object per wheel per tick is a hundred and
 * something allocations a second for two numbers. */
export type SnowUnder = { rest: number; base: number };

export type Snowpack = {
  /** False on every stage the climate leaves green — every reader below is
   * then a constant, and the whole model costs a summer nothing. */
  white: boolean;
  /** HOW FAR TRAFFIC HAS LET THE GROUND DOWN at a point since the stage was
   * drawn, m and never negative — the one number the physics subtracts,
   * because everything that DREW the world drew it at the untouched depth.
   * A pure lookup: the step reads it a score of times a tick off every
   * corner of the car, so it may not go asking the road where it is. */
  cutAt: (x: number, z: number) => number;
  /** ...and HOW FAR THE SNOW'S OWN SURFACE HAS COME DOWN there, m — which
   * is a different number from `cutAt` and the one anything DRAWING the
   * snow wants.
   *
   * `cutAt` is how far the WHEELS were let down: the car rides on the
   * column it packed, and packing a column both shortens it and firms it,
   * so the wheels sink by only the part of the loss that was loose. The
   * SURFACE loses the whole of it. A car's chassis working a patch of deep
   * snow to a quarter packed drops the top of it by 0.28 m and the wheels
   * by 0.036 — so a renderer reading the wheels' number draws a trough
   * eight times too shallow, which is a car leaving no visible mark on
   * snow it has demonstrably flattened. */
  sunkAt: (x: number, z: number) => number;
  /** ...and how worked the snow there is now, 0..1, against `floor` as the
   * pack it had before anybody drove on it. Read once a tick, for the grip
   * and for the trail, so it may be the more careful of the two. */
  workAt: (x: number, z: number, floor: number) => number;
  /** Pack the snow under a wheel that has just crossed a point: `under` is
   * what lay there untouched, `share` how much of a full wheel's weight
   * went through it. */
  carve: (x: number, z: number, under: SnowUnder, share: number) => void;
  /** How many cells the run has worked — what the trail costs, and what
   * the cap is counted against. */
  readonly worked: number;
};

/** R47 — HOW HARD THE BODY IS PRESSING the snow at a point, 0..1: nothing
 * at all while the car is riding OVER the snow on its wheels, and all of it
 * once the snow is well over the sills.
 *
 * The thing that makes a car's mark in deep snow is its own FRONT: the snow
 * under the body has to come down for the car to be where it is, so a
 * trail through a field is a broad trough with two furrows cut in the floor
 * of it. But that is a fact about DEEP snow and about nothing else. A car
 * on a snow ROAD is riding on a cover a few centimetres thick, its floor a
 * clear `TUNING.snow.clearance` above it, and the body never touches it —
 * what is left in an alpine road is four tyre tracks and unbroken snow
 * between them, which is the one thing a picture of a real winter road
 * always shows and the crown-on-everything model always got wrong.
 *
 * So the belly is asked the same question the resistance asks
 * (`car.ts`'s bulldozing term): how much snow stands ABOVE where the wheels
 * are riding (`snowWade`), against how far the body reaches down into it.
 *
 * AND IT IS A RAMP BETWEEN TWO HEIGHTS, not a switch at one. The part of a
 * car that meets snow first is not its floor but its NOSE — the valance and
 * the sump guard, hanging `TUNING.snow.dam` below it — so the body starts
 * disturbing the snow while the sills are still clear and is pressing the
 * whole width of itself by the time they are not. Which matters, because a
 * rally car rides high: measured against the floor alone, even the deep
 * taiga blanket a stage at -6 °C lays leaves the sills clear by a couple of
 * centimetres, and a switch there is a car that never presses snow
 * anywhere. Measured against the nose, the road is clear and the field is
 * not, which is the distinction this exists to draw.
 *
 * Read by the carve (`step.ts`, how hard the nose line presses) and by the
 * renderer (`snow-marks.ts`, whether a belly pan is drawn at all), which is
 * why it is stated here rather than in either: the drawn trough and the
 * pressed one have to be the same trough. */
export function snowBelly(rest: number, pack: number): number {
  const S = TUNING.snow;
  return clamp((snowWade(rest, pack) - (S.clearance - S.dam)) / S.dam, 0, 1);
}

/** Cells the pack remembers — about ten thousand square metres of worked
 * ground at `CLIMATE.pack.cell`, which is a trail down the whole of a long
 * stage with room either side for the corners a car ran wide out of. Past
 * it new snow simply stops being remembered rather than the memory growing
 * without end; every rut already cut keeps its shape. */
const CELLS = 1 << 16;

/** A cell's key. The world is tens of kilometres across at a `pack.cell`
 * grain, so a cell index fits in twenty bits either way with room to
 * spare, and the pair packs into one exact double — which is what lets
 * the index be a plain `Map` rather than a hash table written out by
 * hand. */
function keyOf(i: number, j: number): number {
  return i * 0x100000 + j;
}

/** The worked cells: where each one's readings live, and the readings.
 * Nothing is ever removed. */
type Cells = {
  at: Map<number, number>;
  /** How far the WHEELS have been let down at this corner, m. */
  cut: Float32Array;
  /** ...and how far the SNOW'S SURFACE has, m — the whole of what the
   * packing took out of the column, which is what the world is drawn at. */
  sunk: Float32Array;
  /** ...and how worked its snow is now, 0..1. */
  work: Float32Array;
};

export function createSnowpack(white: boolean): Snowpack {
  /** Allocated on the first cell actually carved: a stage nobody drives on
   * never pays for the table, and a green one never can. */
  let cells: Cells | null = null;

  /** One cell corner's reading off `of`, or `miss` where nothing has ever
   * driven there, interpolated across the cell the point falls in. Both
   * readers below are the same walk over a different array, which is why
   * they are one function: the interpolation has to agree with the carve's
   * own splat to the bit, and two copies of it would be two chances to
   * disagree. */
  const across = (x: number, z: number, of: Float32Array, miss: number): number => {
    const table = cells;
    if (!table) return miss;
    const c = CLIMATE.pack.cell;
    const gx = x / c;
    const gz = z / c;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const at = (di: number, dj: number): number => {
      const e = table.at.get(keyOf(i + di, j + dj));
      return e === undefined ? miss : of[e];
    };
    const a = at(0, 0);
    const b = at(1, 0);
    const d = at(0, 1);
    const f = at(1, 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (d * (1 - fx) + f * fx) * fz;
  };

  const cutAt = (x: number, z: number): number => (cells ? across(x, z, cells.cut, 0) : 0);

  const sunkAt = (x: number, z: number): number => (cells ? across(x, z, cells.sunk, 0) : 0);

  const workAt = (x: number, z: number, floor: number): number => {
    const base = clamp(floor, 0, 1);
    if (!cells || base >= 1) return base;
    // An untouched corner answers with the ground's own pack rather than
    // with nothing, so the edge of a trail fades into the road it is on
    // instead of reading as fresh powder laid across the racing line.
    const worked = across(x, z, cells.work, base);
    return worked > base ? worked : base;
  };

  /** Work one cell corner by `share` of a pass, and record how far it went
   * down for it. A corner nobody has reached is added; past `CELLS` it is
   * simply not recorded, which leaves that patch of snow untouched rather
   * than taking a rut away from somewhere else. */
  const workCorner = (i: number, j: number, under: SnowUnder, share: number): void => {
    if (share <= 1e-4) return;
    const table = (cells ??= {
      at: new Map<number, number>(),
      cut: new Float32Array(CELLS),
      sunk: new Float32Array(CELLS),
      work: new Float32Array(CELLS),
    });
    const key = keyOf(i, j);
    let e = table.at.get(key);
    if (e === undefined) {
      if (table.at.size >= CELLS) return;
      e = table.at.size;
      table.at.set(key, e);
      table.work[e] = under.base;
    }
    const before = Math.max(table.work[e], under.base);
    const after = packedBy(before, share);
    table.work[e] = after;
    // How far the wheels now stand below where they stood before. Capped
    // against what THIS point can give: a corner worked once out in a deep
    // field and again beside a bladed road must not let the ground down by
    // the field's depth twice.
    const room = Math.max(0, under.rest * (CLIMATE.blanket.ride - CLIMATE.pack.floor));
    const fell = snowRide(under.rest, before) - snowRide(under.rest, after);
    table.cut[e] = Math.min(room, table.cut[e] + Math.max(0, fell));
    // ...and the SURFACE's own fall, which is the whole of what came out of
    // the column rather than the share of it the wheels stand lower for.
    // Capped against what the column has to give: everything above the
    // floor a fully worked one stands at.
    const depth = Math.max(0, under.rest * (1 - CLIMATE.pack.floor));
    const dropped = packedDepth(under.rest, before) - packedDepth(under.rest, after);
    table.sunk[e] = Math.min(depth, table.sunk[e] + Math.max(0, dropped));
  };

  const carve = (x: number, z: number, under: SnowUnder, share: number): void => {
    // Nothing to pack where nothing lies, and nothing left to take where
    // the traffic before this car already wore the snow to a floor.
    if (!white || share <= 0 || under.rest <= 1e-3 || under.base >= 1) return;
    const c = CLIMATE.pack.cell;
    const gx = x / c;
    const gz = z / c;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    // Split across the same four corners the readers interpolate over, at
    // the same weights — a write that spread differently from the read
    // would leave a trail that is not where the wheel went.
    workCorner(i, j, under, share * (1 - fx) * (1 - fz));
    workCorner(i + 1, j, under, share * fx * (1 - fz));
    workCorner(i, j + 1, under, share * (1 - fx) * fz);
    workCorner(i + 1, j + 1, under, share * fx * fz);
  };

  return {
    white,
    cutAt,
    sunkAt,
    workAt,
    carve,
    get worked(): number {
      return cells ? cells.at.size : 0;
    },
  };
}

/** WHERE THE SNOW IS, before anybody drove on it — the analytic half of the
 * model, and the only part of it that has to know what a road is.
 *
 * Two grounds meet here and they are stated in different places. Out in the
 * country the snow is the terrain's blanket (climate.ts, terrain.ts): as
 * deep as the cold at this height makes it, untouched, cleared to nothing
 * along every corridor. On the road it is `TrackSample.snow` — a fraction
 * of that, because the road was bladed — already worn into the five lines
 * R16 draws (`snowWear`), which is the traffic that came before this stage
 * and the reason a snow road has tracks in it on the very first lap.
 *
 * Between them is R16's hand-over: the same smoothstep the road's own
 * height leans onto the lattice over, so the cover on the mat becomes the
 * bank in the field without a step in either the depth or the packing.
 *
 * `index` is the sample the caller has already located the car against —
 * every wheel of a car is within a couple of metres of its middle, so the
 * lateral offset is projected onto that sample rather than searched for
 * again four times a tick. */
export function snowUnder(
  track: Track,
  terrain: TerrainField,
  index: number,
  x: number,
  z: number,
  out: SnowUnder,
): void {
  const blanket = terrain.blanketAt(x, z);
  const s = track.samples[index];
  out.rest = blanket;
  out.base = 0;
  if (!s || s.snow <= 0) return;
  const flat = flatTrack(track);
  // Across the road: the offset projected onto the sample's right axis,
  // which is its heading turned a quarter — the same signed lateral
  // `locate` measures, so a wheel to the driver's right reads as one.
  const dx = x - s.x;
  const dz = z - s.z;
  const lateral = dx * flat.cosHeading[index] + dz * -flat.sinHeading[index];
  const out2 = Math.abs(lateral) - s.width / 2;
  if (out2 >= ROAD_CROSS.reach) return;
  const half = s.width / 2;
  const hand = handoverAt(Math.max(0, out2));
  out.rest = s.snow * hand + blanket * (1 - hand);
  // Past the mat the edge's own wear is held, exactly as `snowSinkAt`
  // holds it: the verge carries the mat's edge out with it, so it carries
  // how worn that edge was too.
  out.base = snowWear(Math.max(-half, Math.min(half, lateral)), s.width, 1) * hand;
}
