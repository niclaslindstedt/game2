// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WATER THE GROUND CARRIES. A river (`river.ts`) is traced as a course
// over the bare country; this is what the TERRAIN then makes of it — the
// bed cut down into the ground, the banks run out either side of it, the
// pools and the ice, and the queries every consumer of the field asks
// about it: how deep the valley under a point is, where the nearest bed
// runs, whether a point is in the water at all.
//
// It is the leaf under `terrain.ts`: the field builds streams from the
// crossings it collects, and everything about the SHAPE of one is here.

import { smooth } from "../lib/noise.ts";
import type { Track, TrackSample } from "./compile.ts";
import {
  BANK,
  traceRivers,
  type River,
  type RiverAnchor,
  type RoadClear,
  type StandingWater,
} from "./river.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { streamFrozen, type Climate } from "../game/climate.ts";

/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. The terrain keeps its shelf flat under the same corridor so the
 * apron never floats or drowns, the physics rides it, and R26 keeps every
 * other road off it. One number, stated in the rule book — and the FLOOR
 * under the run-up rather than its length, since a mass start too deep for
 * it is stood on more (`Track.startApron`). */
export const APRON = R.startZone.apron;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// ── Streams ───────────────────────────────────────────────────────────────

export type Stream = {
  /** Water surface centerline, world space, source first — each point
   * carrying the half-width of the water there, because a river is not the
   * same size along its length (R18). */
  points: { x: number; z: number; y: number; w: number }[];
  /** Widest half-width in this piece, meters — what the bounding box is
   * padded by and what a cheap rejection tests against. */
  halfWidth: number;
  /** How far below its surface the bed is cut, m — a ford's is ankle-deep
   * and a bridged river's is over the roof (R13). */
  depth: number;
  /** True when the road crosses this water on a DECK rather than through
   * it: the renderer spans it, and the water runs well below the road. */
  bridged: boolean;
  /** Arc position of the crossing this piece belongs to (chunk
   * association / pruning). */
  centerS: number;
  /** Loose bounding box (bed + the widest bank), for cheap carve rejection. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The lowest the bed gets along this piece, m — what bounds the widest
   * bank any point could owe it, so a query over flat country is rejected
   * on the nine-metre bank and not the fifty-metre one. */
  bedMin: number;
  /** R48 — TRUE WHERE THE COLD HAS CLOSED THIS REACH: the sheet is the
   * ground the car drives on, nothing drowns in it, and the renderer draws
   * ice over it instead of water (`streamFrozen`, climate.ts).
   *
   * Per PIECE rather than per point, because a piece is a hundred metres of
   * river and that is the scale a reach freezes at: a river goes over in
   * its flats and stands open at its drops, and both are pieces. */
  frozen: boolean;
};

/** How far below the water surface a ford's bed is carved, meters. */
export const BED_DEPTH = 0.45;
/** R31 — a BANK IS A SLOPE A CAR CAN CLIMB OUT OF. The channel blends from
 * its bed back onto the country over `BANK` metres at least, and further
 * wherever the country stands high enough over the bed that nine metres
 * would make a wall of it: the blend is a smoothstep, whose steepest point
 * is one and a half times its mean, so the run a drop needs is that over
 * `verge.climbable`. A brook in flat country keeps its nine-metre banks; a
 * river ten metres down in a valley gets a bank twenty-five metres wide,
 * which is what a river bank is. `BANK_MAX` bounds it, and sizes the box a
 * stream's carve is rejected by. */
export const BANK_RUN = 1.5 / R.verge.climbable;
export const BANK_MAX = 50;
/** How far a surface may stand over water and still be IN it, m — a ford's
 * crown sheds the water it wades, and a road's camber is not a bank. */
export const WADE_LIP = 0.2;
/** Points per sliced piece of river — enough that a bounding box is worth
 * testing, few enough that a test which passes has little left to walk. */
export const RIVER_CHUNK = 8;

/** R48 — WHETHER A PIECE OF RIVER HAS FROZEN OVER, under a climate: its own
 * fall against `streamFrozen`'s rule (climate.ts), asked at the water's own
 * level because the air is a field and a reach on a shoulder goes over
 * while the one in the valley below it is still running.
 *
 * The FALL is the piece end to end — its drop over its run — rather than
 * the steepest step in it: what decides whether a cover can bridge is how
 * fast the reach flows, and a hundred metres of river has one speed.
 *
 * ...except at a FORD, which is held open. A crossing the stage wades is
 * broken open by whatever uses it and re-opened by the current under it as
 * fast as it closes, which is what a winter ford is; and the road laid
 * through it is water to the compiler, so a sheet the physics called ground
 * there would be a car driving on ice down a road that says it is wading.
 * A BRIDGED crossing is not that: the water runs its own course metres
 * below the deck and freezes like any other reach, and neither is a
 * CULVERT, which carries the stream in a pipe under the road's own fill and
 * puts nothing on the surface for a wheel to break. */
export function freezeReach(
  points: Stream["points"],
  anchor: RiverAnchor,
  near: number,
  climate?: Climate,
): boolean {
  if (climate === undefined || points.length < 2) return false;
  const wades = !anchor.bridged && anchor.culvert !== true;
  if (wades && near < anchor.edge + anchor.halfWidth) return false;
  let run = 0;
  let level = 0;
  for (let i = 0; i < points.length; i++) {
    level += points[i].y;
    if (i > 0) run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  if (run <= 0) return false;
  const drop = Math.abs(points[0].y - points[points.length - 1].y);
  return streamFrozen(climate, level / points.length, drop / run);
}

/** Cut one traced river into the pieces every consumer actually queries:
 * a short polyline with its own bounding box. Consecutive pieces overlap
 * by a point, so the water is continuous across the seam. `climate` is the
 * cold each piece is asked against (R48); omitted, nothing is frozen —
 * which is what a summer and every tool that only wants the water want. */
export function sliceRiver(river: River, climate?: Climate): Stream[] {
  const out: Stream[] = [];
  const points = river.points;
  for (let i = 0; i + 1 < points.length; i += RIVER_CHUNK - 1) {
    const slice = points.slice(i, i + RIVER_CHUNK);
    if (slice.length < 2) break;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let halfWidth = 0;
    let bestAnchor = river.anchors[0];
    let bestD = Infinity;
    for (const p of slice) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.halfWidth > halfWidth) halfWidth = p.halfWidth;
      for (const anchor of river.anchors) {
        const d = Math.hypot(anchor.x - p.x, anchor.z - p.z);
        if (d < bestD) {
          bestD = d;
          bestAnchor = anchor;
        }
      }
    }
    const pad = halfWidth + BANK_MAX;
    let bedMin = Infinity;
    for (const p of slice) if (p.y - river.depth < bedMin) bedMin = p.y - river.depth;
    out.push({
      points: slice.map((p) => ({ x: p.x, z: p.z, y: p.y, w: p.halfWidth })),
      halfWidth,
      depth: river.depth,
      bridged: river.bridged,
      centerS: bestAnchor.s,
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      bedMin,
      frozen: false,
    });
    const piece = out[out.length - 1];
    piece.frozen = freezeReach(piece.points, bestAnchor, bestD, climate);
  }
  return out;
}

/** R12 — the valley floor under a crossing: the lowest ground the
 * crossing's POOL touches. A ford is a pool the road wades, and a pool has
 * one level: the water on the road and the water beside it are the same
 * water. Laid at the road's own ground on a hillside, the sheet on the
 * road stood a metre over the river running off it on the downhill side —
 * a step in a water surface, which is the one thing water never does.
 *
 * Read at the places the pool actually lies: the road's centerline; the
 * river's BANKS there, which run ALONG the road (`water.bankReach` either
 * way, the higher of the two — a crossing on a rise along the road would
 * lay its water over both), and the ground the water leaves the crossing
 * over, a step and two steps out across the road on the lower side,
 * where the course holds the crossing's level before it falls
 * (`river.ts`'s `POOL_REACH`). Not the higher side: the water comes DOWN
 * into the pool from there, in its own gully, and reading it would dig
 * every hillside crossing to the level of the ground below it. */
export function valleyUnder(
  at: { x: number; z: number; heading: number },
  landAt: (x: number, z: number) => number,
): number {
  const ax = Math.sin(at.heading);
  const az = Math.cos(at.heading);
  const lx = Math.cos(at.heading);
  const lz = -Math.sin(at.heading);
  const reach = R.water.bankReach;
  const banks = Math.max(
    landAt(at.x + ax * reach, at.z + az * reach),
    landAt(at.x - ax * reach, at.z - az * reach),
  );
  const right = landAt(at.x + lx * POOL_STEP * 2, at.z + lz * POOL_STEP * 2);
  const left = landAt(at.x - lx * POOL_STEP * 2, at.z - lz * POOL_STEP * 2);
  const side = right < left ? 1 : -1;
  const near = landAt(at.x + lx * POOL_STEP * side, at.z + lz * POOL_STEP * side);
  return Math.min(landAt(at.x, at.z), banks, Math.min(right, left), near);
}

/** How far the river walks in one step, m — `river.ts`'s stride, read
 * here so the crossing's valley is read where the course will stand. */
export const POOL_STEP = 14;

/** Collect the road's water crossings in `samples[fromIndex..)` as river
 * anchors (R18): where the road meets water, at what level, how wide, and
 * whether it wades or spans. The WATER itself is then traced through them
 * — the road says where it crosses, the landscape says where the river
 * runs. */
export function collectAnchors(
  track: Track,
  fromIndex: number,
  /** The bare land's height at a point, m — where the water under a DECK
   * is laid (R13). A ford's water is the road's own dip and needs nothing;
   * a bridge's is the stream the deck spans, and a stream lies in its
   * valley whatever the road was doing: a road crossing the valley on an
   * embankment stands that much higher over it, the way a viaduct does.
   * Held at the deck's own clearance instead, a bridge on fill anchored
   * its river fifteen metres over the country and R18 drew it floating
   * above both banks. Optional, for tooling that only wants the crossings;
   * without it the water sits at the clearance. */
  valleyAt?: (x: number, z: number) => number,
): RiverAnchor[] {
  const samples = track.samples;
  const anchors: RiverAnchor[] = [];
  const wet = (s: TrackSample): boolean => s.surface === "water" || s.deck !== null;
  let i = Math.max(0, fromIndex);
  // Never split a run: back up to its start if we landed inside one.
  while (i > 0 && wet(samples[i - 1])) i--;
  for (; i < samples.length; i++) {
    if (!wet(samples[i])) continue;
    let j = i;
    while (j < samples.length && wet(samples[j])) j++;
    const mid = samples[Math.floor((i + j - 1) / 2)];
    const runLength = samples[j - 1].s - samples[i].s + track.step;
    const deck = mid.deck;
    anchors.push({
      x: mid.x,
      z: mid.z,
      // A ford's water lies at the road; a deck stands AT LEAST its
      // clearance above it — more where the road crosses the valley on
      // fill — and the channel below is cut deep enough to drown a car.
      waterY: deck
        ? Math.min(
            mid.elevation - R.bridge.clearance[deck],
            valleyAt ? valleyUnder(mid, valleyAt) - BED_DEPTH : Infinity,
          )
        : mid.elevation,
      heading: mid.heading,
      // A ford's water is as wide as the ford is long, and a little more
      // (`fordOutside`): the course leaves the crossing ACROSS the road
      // (R18's `acrossRoad`), so the sheet the anchor draws lies along
      // the road for its half-width — and the aprons start climbing where
      // the flat ends. Sized to the road's own width instead, the sheet
      // stood two metres deep on the apron of every ford.
      halfWidth: deck
        ? Math.max(6, runLength / 2 - 1.5)
        : Math.max(3.5, runLength / 2 + R.water.fordOutside),
      depth: deck ? R.bridge.depth : BED_DEPTH,
      bridged: deck !== null,
      edge: mid.width / 2 + R.water.fordOutside,
      s: mid.s,
    });
    i = j;
  }
  // R12 — and the culverts: the road stands on its fill and the stream
  // goes under it. Not a run of samples — the surface is road the whole
  // way over one — so the compiler wrote each down (`track.culverts`), at
  // the valley's own level. Each is a crossing like any other to the water:
  // the course arrives at it, passes under the road, and leaves across it.
  const fromS = fromIndex < samples.length ? samples[Math.max(0, fromIndex)].s : Infinity;
  for (const culvert of track.culverts) {
    if (culvert.s < fromS) continue;
    anchors.push({
      x: culvert.x,
      z: culvert.z,
      waterY: culvert.waterY,
      halfWidth: culvert.halfWidth,
      depth: BED_DEPTH,
      bridged: false,
      culvert: true,
      edge: culvert.edge,
      s: culvert.s,
      heading: culvert.heading,
    });
  }
  anchors.sort((a, b) => a.s - b.s);
  return anchors;
}

/** Trace the watercourses a batch of crossings implies and cut them into
 * queryable pieces. The field itself keeps the traced courses as well as
 * the pieces, so it does the two steps separately; this is the one-call
 * version for tooling that only wants water it can query. */
export function computeStreams(
  seed: number,
  anchors: RiverAnchor[],
  farHeight: (x: number, z: number) => number,
  standingAt: StandingWater,
  roadClear?: RoadClear,
  /** R48 — the cold the reaches are asked against; omitted, none is
   * frozen. */
  climate?: Climate,
): Stream[] {
  return traceRivers(seed, anchors, farHeight, standingAt, roadClear).flatMap((river) =>
    sliceRiver(river, climate),
  );
}

/** Distance from a point to the water's centerline, plus the surface
 * height and the half-width THERE — a river narrows and widens along its
 * length, so every query has to answer with the local size. */
export function nearestOnStream(
  s: Stream,
  x: number,
  z: number,
): { d: number; waterY: number; width: number } {
  let bestD2 = Infinity;
  let waterY = 0;
  let width = s.halfWidth;
  for (let i = 0; i < s.points.length - 1; i++) {
    const a = s.points[i];
    const b = s.points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)),
    );
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      waterY = a.y + (b.y - a.y) * t;
      width = a.w + (b.w - a.w) * t;
    }
  }
  return { d: Math.sqrt(bestD2), waterY, width };
}

/** Carve the stream valley into a landscape height: inside the water line
 * the ground drops to the bed; across the bank it blends back to `base`.
 * Only ever lowers — a stream never builds a levee. */
export function carveGround(streams: Stream[], x: number, z: number, base: number): number {
  let ground = base;
  for (const s of streams) {
    // The widest bank this piece could owe a point at this height, and the
    // box shrunk to it: the walk down the piece's points is the whole cost
    // of the carve, and over flat country almost every piece in the box is
    // thrown away here on its nine-metre bank.
    const widest = Math.min(BANK_MAX, Math.max(BANK, (base - s.bedMin) * BANK_RUN));
    const slack = BANK_MAX - widest;
    if (x < s.minX + slack || x > s.maxX - slack || z < s.minZ + slack || z > s.maxZ - slack) {
      continue;
    }
    const { d, waterY, width } = nearestOnStream(s, x, z);
    if (d > width + widest) continue;
    const bed = waterY - s.depth;
    const drop = Math.max(0, base - bed);
    const bank = Math.min(BANK_MAX, Math.max(BANK, drop * BANK_RUN));
    if (d > width + bank) continue;
    const target = bed + smooth(clamp01((d - width) / bank)) * drop;
    if (target < ground) ground = target;
  }
  return ground;
}

/** True when a point stands in a stream's bed or on its banks — nothing
 * should grow there. */
export function inStream(streams: Stream[], x: number, z: number, margin: number): boolean {
  for (const s of streams) {
    if (x < s.minX - margin || x > s.maxX + margin || z < s.minZ - margin || z > s.maxZ + margin) {
      continue;
    }
    const near = nearestOnStream(s, x, z);
    if (near.d < near.width + BANK + margin) return true;
  }
  return false;
}

/** Water surface height of a stream at a point, or null when the point is
 * not over stream water. R48 — `frozen` picks WHICH water is asked for: the
 * reaches the cold has closed, or the ones still running. The two are asked
 * separately because they are different things underfoot — one is a floor
 * and the other is a drowning — and a point is only ever over one of them. */
export function streamWaterAt(
  streams: Stream[],
  x: number,
  z: number,
  frozen: boolean,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of streams) {
    if (s.frozen !== frozen) continue;
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY, width } = nearestOnStream(s, x, z);
    // The NEAREST water wins, not the first found: two reaches of the same
    // course (or two courses) can both cover a point, and answering with
    // whichever happened to be indexed first puts the surface at the wrong
    // height — under a bridge, that is metres of clearance out.
    if (d < width && d < bestD) {
      bestD = d;
      best = waterY;
    }
  }
  return best;
}
