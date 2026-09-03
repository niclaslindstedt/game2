// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R43 — THE ENERGY. A stage in a modern country runs past the two things
// a hillside has on it now. The WIND FARMS: a string of turbines along a
// rise off the road, each two hundred metres to the blade tip, the biggest
// things on any stage by an order of magnitude — seen from a kilometre
// before the road gets near them, turning in the same wind that leans the
// rain. And the SOLAR FARMS: panels en masse on level ground beside the
// stage, fenced, every table facing the same way, from a paddock's worth
// on a small one to a field of them on a big one.
//
// The engine places both, for the homesteads' reason (R37): a tower is a
// thing a car stops against, its crane pad is a disc the terrain flattens
// and the forest keeps off, a solar farm's fence and tables are solids and
// its ground is a clearing. The renderer only DRAWS what is decided here —
// and the one thing it decides for itself is where the blades are this
// frame, because that is the wind's business, not the stage's.
//
// A wind farm is placed against the BARE country: the first tower on the
// highest dry ground a lateral probe from the stage can find, the rest
// along a string that keeps the road's own bearing (so every tower stays in
// the band the road sees it from) and walks each tower onto the highest
// ground near its slot. A solar farm is a rectangle in a WORLD-FIXED frame
// — its rows face the sun's azimuth, whichever way the road runs — pushed
// out from the road by exactly its own support in that direction.

import { hash2 } from "../lib/noise.ts";
import { createRng, type Rng } from "../lib/prng.ts";
import { rectDistance, type FarmRect } from "./farms.ts";
import type { HomesteadSample } from "./homesteads.ts";
import type { LandField } from "./land.ts";
import { ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { standSolid, WALL_BAY, WALL_RADIUS, WALL_STOREY, type WildObstacle } from "./solids.ts";
import { SPUR, type ShelfBand } from "./spurs.ts";

const W = R.energy.wind;
const S = R.energy.solar;

/** A probe's hook for tallying why a slot placed nothing (`note` is null in
 * the game). A placer that comes out sparse is rejecting, not rolling low,
 * and this is how the rejections are counted without instrumenting the
 * module by hand. */
export const energyTally: { note: ((why: string) => void) | null } = { note: null };
const note = (why: string): void => energyTally.note?.(why);

/** How fat a tower stands at its foot, m — the drawn radius. The solids
 * ring stands a little inside it, for the wall bays' own reason. */
export const TOWER_BASE = 2.7;

/** One turbine: where its tower's foot stands. `y` is the crane pad's
 * level, which the terrain flattens the ground to inside `pad.radius`. */
export type WindTurbine = { x: number; z: number; y: number };

export type WindFarm = {
  /** Arc position on the stage the string was placed from. */
  atS: number;
  /** Which side of the road it stands: +1 right of travel. */
  side: -1 | 1;
  /** Hub height and rotor diameter, m — one make of machine per string. */
  hub: number;
  rotor: number;
  /** The towers, in string order. */
  turbines: WindTurbine[];
};

export type SolarFarm = {
  atS: number;
  side: -1 | 1;
  /** The fence: a rect whose `heading` is `facing + π/2`, so its width runs
   * ALONG the rows and its depth across them, toward and away from the sun. */
  rect: FarmRect;
  /** The bare country's height at the fence's middle, m — the tables are
   * footed on the ground as the terrain makes it; this is the fallback. */
  y: number;
  /** How many rows of tables stand across the rect, and how many tables
   * each row holds along it — `solarTables` turns the two into places. */
  rows: number;
  perRow: number;
  /** Every fence post round the rect, with the gate's gap left out. */
  posts: { x: number; z: number }[];
  /** The gate: where it hangs, and the direction ALONG the fence there. */
  gate: { x: number; z: number; heading: number };
  /** The inverter cabin, just inside the fence beside the gate — or none,
   * on a fence whose gate side is too short to hold both. */
  cabin: FarmRect | null;
};

/** Everything the placers have to ask about the country. Functions rather
 * than the compiler's own state so the module can be driven from a test
 * with a flat rig as easily as from a compiled stage. */
export type EnergyContext = {
  seed: number;
  /** The stage's nominal full width, m. */
  width: number;
  samples: readonly HomesteadSample[];
  /** Half-open range of sample indices whose slots may be placed on this
   * call (the homesteads' window, for the same reason). */
  from: number;
  to: number;
  finishS: number | null;
  land: LandField;
  /** Distance to the nearest piece of ROUTE, m — the whole route, no
   * junction exemption: nothing here ever stands near a junction. */
  routeDistance: (x: number, z: number) => number;
  branchDistance: (x: number, z: number) => number;
  highwayDistance: (x: number, z: number) => number;
  /** R31 — the band a pad may be graded in without becoming a wall. */
  shelfBand: (x: number, z: number) => ShelfBand;
  /** R37/R39 — distance to the nearest town lot's or homestead's pad rim. */
  settledDistance: (x: number, z: number) => number;
  /** What already stands: this stage's own, from every earlier call. */
  wind: readonly WindFarm[];
  solar: readonly SolarFarm[];
};

/** The world point of a rect-local (u across the depth, v along the width). */
function rectPoint(rect: FarmRect, u: number, v: number): { x: number; z: number } {
  const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
  return { x: rect.x + right.x * u + fwd.x * v, z: rect.z + right.z * u + fwd.z * v };
}

/** The first sample of the slot's window, advancing `index` to it. */
function slotWindow(
  ctx: EnergyContext,
  s: number,
  index: { at: number },
): { first: number; last: number } {
  const { samples } = ctx;
  while (index.at + 1 < samples.length && samples[index.at + 1].s <= s) index.at++;
  return { first: index.at, last: Math.min(ctx.to, samples.length) - 1 };
}

// ── The wind farms ────────────────────────────────────────────────────────

/** Place every wind farm whose slot falls in `[from, to)`. Deterministic in
 * the seed and the route: a slot is decided by its own arc position and by
 * what stands before it, never by how the road was chunked. */
export function placeWindFarms(ctx: EnergyContext): WindFarm[] {
  const { samples } = ctx;
  if (ctx.to <= ctx.from || samples.length === 0) return [];
  const out: WindFarm[] = [];
  const gate = (ctx.seed ^ 0x51e3a9d7) >>> 0;
  let lastAtS = ctx.wind.length > 0 ? ctx.wind[ctx.wind.length - 1].atS : -Infinity;
  const all: WindFarm[] = [...ctx.wind];
  const firstSlot = Math.ceil(samples[ctx.from].s / W.slot);
  const endS = samples[Math.min(ctx.to, samples.length) - 1].s;
  const index = { at: ctx.from };
  for (let slot = firstSlot; slot * W.slot < endS; slot++) {
    const s = slot * W.slot;
    if (hash2(slot, 0, gate) >= W.slot / W.spacing.mean) continue;
    if (s - lastAtS < W.spacing.min) {
      note("wind: spacing");
      continue;
    }
    if (s < W.keepOff.start) continue;
    if (ctx.finishS !== null && s > ctx.finishS - W.keepOff.finish) continue;
    const { first } = slotWindow(ctx, s, index);
    const at = samples[first];
    const rng = createRng((ctx.seed ^ 0x7a1c3e55 ^ Math.imul(slot, 2654435761)) >>> 0);
    const side: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    const farm =
      tryWindFarm(ctx, at, side, rng, all) ?? tryWindFarm(ctx, at, -side as 1 | -1, rng, all);
    if (!farm) continue;
    out.push(farm);
    all.push(farm);
    lastAtS = farm.atS;
  }
  return out;
}

/** May a tower's foot stand here: off every road by more than a rotor,
 * dry, off the settled places, and off every other farm. */
function towerClear(
  ctx: EnergyContext,
  standing: readonly WindFarm[],
  x: number,
  z: number,
): boolean {
  if (ctx.routeDistance(x, z) < W.clear.route) return fail("wind: route");
  if (ctx.branchDistance(x, z) < W.clear.road) return fail("wind: branch");
  if (ctx.highwayDistance(x, z) < W.clear.road) return fail("wind: highway");
  if (ctx.land.flooded(x, z, SPUR.shoreFreeboard)) return fail("wind: water");
  if (ctx.settledDistance(x, z) < W.clear.settled) return fail("wind: settled");
  for (const farm of ctx.solar) {
    if (rectDistance(farm.rect, x, z) < W.clear.solar) return fail("wind: solar");
  }
  for (const farm of standing) {
    for (const t of farm.turbines) {
      if (Math.hypot(t.x - x, t.z - z) < W.apart) return fail("wind: apart");
    }
  }
  return true;
}

/** Note a reject and refuse. */
function fail(why: string): false {
  note(why);
  return false;
}

/** Note a reject and place nothing. */
function nothing(why: string): null {
  note(why);
  return null;
}

/** The crane pad under a tower: the country's own mean level across it,
 * with the bare ground everywhere on it near enough to that level, and the
 * level inside R31's cone. Null where the ground says no. */
function padAt(ctx: EnergyContext, x: number, z: number): number | null {
  const probes: { x: number; z: number; h: number }[] = [{ x, z, h: ctx.land.heightAt(x, z) }];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const r of [W.pad.radius * 0.55, W.pad.radius]) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      probes.push({ x: px, z: pz, h: ctx.land.heightAt(px, pz) });
    }
  }
  const mean = probes.reduce((sum, p) => sum + p.h, 0) / probes.length;
  for (const p of probes) {
    if (Math.abs(p.h - mean) > W.pad.level) return nothing("wind: pad level");
    if (ctx.land.flooded(p.x, p.z, SPUR.shoreFreeboard)) return nothing("wind: pad water");
    const band = ctx.shelfBand(p.x, p.z);
    if (mean > band.ceiling || mean < band.floor) return nothing("wind: pad cone");
  }
  return mean;
}

/** The highest clear ground within `seek` of a point, or null. */
function highestNear(
  ctx: EnergyContext,
  standing: readonly WindFarm[],
  x: number,
  z: number,
): { x: number; z: number; h: number } | null {
  let best: { x: number; z: number; h: number } | null = null;
  for (let k = -1; k < 8; k++) {
    const px = k < 0 ? x : x + Math.cos((k / 8) * Math.PI * 2) * W.seek;
    const pz = k < 0 ? z : z + Math.sin((k / 8) * Math.PI * 2) * W.seek;
    if (!towerClear(ctx, standing, px, pz)) continue;
    const h = ctx.land.heightAt(px, pz);
    if (!best || h > best.h) best = { x: px, z: pz, h };
  }
  return best;
}

/** Probe out from the road on one side for the rise, and string the towers
 * along it. Null where the country has no high ground to offer. */
function tryWindFarm(
  ctx: EnergyContext,
  at: HomesteadSample,
  side: 1 | -1,
  rng: Rng,
  standing: readonly WindFarm[],
): WindFarm | null {
  // The lateral fan: the highest dry, clear ground in the band, on any of
  // a handful of bearings out from the road, is the anchor — and it has to
  // be a RISE over the road, or there is no wind farm here.
  let anchor: { x: number; z: number; h: number } | null = null;
  for (const swing of [0, -0.3, 0.3, -0.6, 0.6]) {
    const a = at.heading + (side * Math.PI) / 2 + swing;
    const ray = { x: Math.sin(a), z: Math.cos(a) };
    for (let d = W.offset.min; d <= W.offset.max; d += W.probe) {
      const px = at.x + ray.x * d;
      const pz = at.z + ray.z * d;
      if (!towerClear(ctx, standing, px, pz)) continue;
      const h = ctx.land.heightAt(px, pz);
      if (!anchor || h > anchor.h) anchor = { x: px, z: pz, h };
    }
  }
  if (!anchor) return nothing("wind: no anchor");
  if (anchor.h - at.elevation < W.rise) return nothing("wind: no rise");
  // ...and a rise over the road NEAREST the top tower, not only over the
  // one it was probed out from. The route can come back past the same
  // ground on another stretch, higher — a string that stands over the road
  // it was found from and twenty metres under the road on its other side
  // is not on the high ground, whatever the probe said.
  let nearest = at;
  let nearestD2 = Infinity;
  for (const s of ctx.samples) {
    const dx = s.x - anchor.x;
    const dz = s.z - anchor.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = s;
    }
  }
  if (anchor.h - nearest.elevation < W.rise) return nothing("wind: no rise");
  const top = anchor;
  const hub = rng.range(W.hub.min, W.hub.max);
  const rotor = rng.range(W.rotor.min, W.rotor.max);
  const count = rng.int(W.count.min, W.count.max);
  const pitch = rng.range(W.pitch.min, W.pitch.max);
  const bearing = at.heading + rng.range(-W.swing, W.swing);
  const along = { x: Math.sin(bearing), z: Math.cos(bearing) };
  let dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const turbines: WindTurbine[] = [];
  const stand = (x: number, z: number): boolean => {
    const y = padAt(ctx, x, z);
    if (y === null) return false;
    if (y < top.h - W.drop) return fail("wind: off the rise");
    // A tower on this string keeps a pitch from the others — the walk onto
    // the high ground must not bring two together.
    for (const t of turbines) if (Math.hypot(t.x - x, t.z - z) < pitch * 0.7) return false;
    turbines.push({ x, z, y });
    return true;
  };
  if (!stand(anchor.x, anchor.z)) return null;
  // The rest, from the anchor out along the string — one way, and then the
  // other from the anchor again when the country runs out that way. The
  // slots are measured from the anchor rather than from the tower before,
  // so a string that walks onto the ridge does not drift off its bearing.
  let k = 1;
  let flipped = false;
  while (turbines.length < count) {
    const sx = anchor.x + along.x * dir * k * pitch;
    const sz = anchor.z + along.z * dir * k * pitch;
    const spot = highestNear(ctx, standing, sx, sz);
    if (spot && stand(spot.x, spot.z)) {
      k++;
      continue;
    }
    if (flipped) break;
    flipped = true;
    dir = -dir as 1 | -1;
    k = 1;
  }
  if (turbines.length < W.count.min) return nothing("wind: short string");
  // In string order along the bearing, so a walk down the list is a walk
  // along the ridge.
  turbines.sort(
    (a, b) =>
      (a.x - anchor.x) * along.x +
      (a.z - anchor.z) * along.z -
      ((b.x - anchor.x) * along.x + (b.z - anchor.z) * along.z),
  );
  return { atS: at.s, side, hub, rotor, turbines };
}

// ── The solar farms ───────────────────────────────────────────────────────

export function placeSolarFarms(ctx: EnergyContext): SolarFarm[] {
  const { samples } = ctx;
  if (ctx.to <= ctx.from || samples.length === 0) return [];
  const out: SolarFarm[] = [];
  const gate = (ctx.seed ^ 0x2f8b6c19) >>> 0;
  let lastAtS = ctx.solar.length > 0 ? ctx.solar[ctx.solar.length - 1].atS : -Infinity;
  const all: SolarFarm[] = [...ctx.solar];
  const firstSlot = Math.ceil(samples[ctx.from].s / S.slot);
  const endS = samples[Math.min(ctx.to, samples.length) - 1].s;
  const index = { at: ctx.from };
  for (let slot = firstSlot; slot * S.slot < endS; slot++) {
    const s = slot * S.slot;
    if (hash2(slot, 0, gate) >= S.slot / S.spacing.mean) continue;
    if (s - lastAtS < S.spacing.min) {
      note("solar: spacing");
      continue;
    }
    if (s < S.keepOff.start) continue;
    if (ctx.finishS !== null && s > ctx.finishS - S.keepOff.finish) continue;
    const { first, last } = slotWindow(ctx, s, index);
    // Beside a straight, or near enough: the fence is read against the road
    // it runs beside, and a fence beside a hairpin is beside two roads.
    let at: HomesteadSample | null = null;
    const finishLimit = ctx.finishS === null ? Infinity : ctx.finishS - S.keepOff.finish;
    for (let i = first; i <= last && samples[i].s < s + S.slot; i++) {
      const here = samples[i];
      if (here.s > finishLimit) break;
      if (Math.abs(here.curvature) > 1 / S.straight) continue;
      if (here.flat > 0 || here.jump) continue;
      if (nearCrossing(samples, i)) continue;
      if (!at || Math.abs(here.curvature) < Math.abs(at.curvature)) at = here;
    }
    if (!at) {
      note("solar: no straight");
      continue;
    }
    const rng = createRng((ctx.seed ^ 0x19c4d2a7 ^ Math.imul(slot, 2654435761)) >>> 0);
    // The size class, off the slot's own dice: a big farm is rare, and a
    // rolled size is what the country is asked to take, shrunk if it must.
    let roll = hash2(slot, 1, gate);
    let size: (typeof S.sizes)[number] = S.sizes[0];
    for (const candidate of S.sizes) {
      size = candidate;
      if (roll < candidate.chance) break;
      roll -= candidate.chance;
    }
    const width = rng.range(size.width.min, size.width.max);
    const depth = rng.range(size.depth.min, size.depth.max);
    const gap = rng.range(S.gap.min, S.gap.max);
    const first_: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    let farm: SolarFarm | null = null;
    // Both sides, the dice's first; three gaps from the road; and smaller
    // and smaller: a hillside that will not take a field of panels often
    // takes a paddock's worth.
    for (const scale of S.shrink) {
      for (const side of [first_, -first_ as 1 | -1]) {
        for (const g of [gap, S.gap.min, S.gap.max]) {
          farm = trySolarFarm(ctx, at, side, width * scale, depth * scale, g, all);
          if (farm) break;
        }
        if (farm) break;
      }
      if (farm) break;
    }
    if (!farm) continue;
    out.push(farm);
    all.push(farm);
    lastAtS = farm.atS;
  }
  return out;
}

/** Is there a ford or a bridge within `keepOff.water` of this sample along
 * the stage? Its channel runs tens of metres either side of the road (R18),
 * and a fence laid beside it is a fence in a river. */
function nearCrossing(samples: readonly HomesteadSample[], index: number): boolean {
  const s = samples[index].s;
  for (let i = index; i < samples.length && samples[i].s - s <= S.keepOff.water; i++) {
    if (samples[i].surface === "water" || samples[i].deck !== null) return true;
  }
  for (let i = index; i >= 0 && s - samples[i].s <= S.keepOff.water; i--) {
    if (samples[i].surface === "water" || samples[i].deck !== null) return true;
  }
  return false;
}

/** May a piece of solar farm stand here. */
function solarClear(
  ctx: EnergyContext,
  standing: readonly SolarFarm[],
  x: number,
  z: number,
): boolean {
  if (ctx.routeDistance(x, z) < ctx.width / 2 + ROAD_CROSS.reach + S.gap.min / 3) {
    return fail("solar: route");
  }
  if (ctx.branchDistance(x, z) < S.clear.road) return fail("solar: branch");
  if (ctx.highwayDistance(x, z) < S.clear.road) return fail("solar: highway");
  if (ctx.land.flooded(x, z, SPUR.shoreFreeboard)) return fail("solar: water");
  if (ctx.settledDistance(x, z) < S.clear.settled) return fail("solar: settled");
  for (const farm of ctx.wind) {
    for (const t of farm.turbines) {
      if (Math.hypot(t.x - x, t.z - z) < S.clear.wind) return fail("solar: wind");
    }
  }
  for (const farm of standing) {
    if (rectDistance(farm.rect, x, z) < S.apart) return fail("solar: apart");
  }
  return true;
}

/** Lay the fence out from the road on one side and see whether the country
 * takes it: clear and dry at a lattice of probes across it, and not so far
 * out of level that the rows would be a staircase. */
function trySolarFarm(
  ctx: EnergyContext,
  at: HomesteadSample,
  side: 1 | -1,
  width: number,
  depth: number,
  gap: number,
  standing: readonly SolarFarm[],
): SolarFarm | null {
  const heading = S.facing + Math.PI / 2;
  const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
  const right = { x: Math.cos(heading), z: -Math.sin(heading) };
  const lateral = { x: Math.cos(at.heading) * side, z: -Math.sin(at.heading) * side };
  // The rect's support in the lateral direction: how far its nearest edge
  // reaches back toward the road from its centre, whichever way the
  // world-fixed frame happens to lie against this piece of road.
  const support =
    Math.abs(right.x * lateral.x + right.z * lateral.z) * (depth / 2) +
    Math.abs(fwd.x * lateral.x + fwd.z * lateral.z) * (width / 2);
  const corridor = Math.max(at.width, ctx.width) / 2 + ROAD_CROSS.reach;
  const out = corridor + gap + support;
  const rect: FarmRect = {
    x: at.x + lateral.x * out,
    z: at.z + lateral.z * out,
    heading,
    width,
    depth,
  };
  const nu = Math.max(3, Math.ceil(depth / 25) + 1);
  const nv = Math.max(3, Math.ceil(width / 25) + 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p = rectPoint(rect, (i / (nu - 1) - 0.5) * depth, (j / (nv - 1) - 0.5) * width);
      if (!solarClear(ctx, standing, p.x, p.z)) return null;
      const h = ctx.land.heightAt(p.x, p.z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (hi - lo > S.slope * Math.hypot(width, depth)) return nothing("solar: slope");
  const rows = Math.floor((depth - 2 * S.margin) / S.row.pitch);
  const perRow = Math.floor((width - 2 * S.end + S.row.gap) / (S.row.table + S.row.gap));
  if (rows < 1 || perRow < 1) return nothing("solar: no rows");

  // The fence, with the gate in the side nearest the road.
  const hw = width / 2;
  const hd = depth / 2;
  const corners: [number, number][] = [
    [-hd, -hw],
    [hd, -hw],
    [hd, hw],
    [-hd, hw],
  ];
  let gateSide = 0;
  let nearest = Infinity;
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const mid = rectPoint(rect, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const d = Math.hypot(mid.x - at.x, mid.z - at.z);
    if (d < nearest) {
      nearest = d;
      gateSide = k;
    }
  }
  const posts: { x: number; z: number }[] = [];
  let gate: SolarFarm["gate"] = { x: rect.x, z: rect.z, heading };
  let cabin: FarmRect | null = null;
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / S.fence.postPitch));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if (k === gateSide && Math.abs(t * len - len / 2) < S.fence.gate / 2 && i > 0) continue;
      posts.push(rectPoint(rect, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
    if (k === gateSide) {
      const mid = rectPoint(rect, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const wa = rectPoint(rect, a[0], a[1]);
      const wb = rectPoint(rect, b[0], b[1]);
      const alongFence = Math.atan2(wb.x - wa.x, wb.z - wa.z);
      gate = { x: mid.x, z: mid.z, heading: alongFence };
      // The cabin: in the margin strip inside this side, along the fence
      // from the gate toward the corner — where the side is long enough
      // to hold the gate, the cabin and a step between them and the corner.
      const inU = (a[0] + b[0]) / 2;
      const inV = (a[1] + b[1]) / 2;
      const inward = { u: -Math.sign(inU) || 0, v: -Math.sign(inV) || 0 };
      const setIn = S.cabin.depth / 2 + 0.7;
      const shift = S.fence.gate / 2 + S.cabin.width / 2 + 1.5;
      if (shift + S.cabin.width / 2 + 1 <= len / 2) {
        const alongU = (b[0] - a[0]) / len;
        const alongV = (b[1] - a[1]) / len;
        const c = rectPoint(
          rect,
          inU + inward.u * setIn + alongU * shift,
          inV + inward.v * setIn + alongV * shift,
        );
        cabin = { x: c.x, z: c.z, heading: alongFence, width: S.cabin.width, depth: S.cabin.depth };
      }
    }
  }
  const y = ctx.land.heightAt(rect.x, rect.z);
  return { atS: at.s, side, rect, y, rows, perRow, posts, gate, cabin };
}

/** Where every table stands on a solar farm: its centre, and the heading
 * ALONG its row (the rect's own). The tilt is toward `facing`, which in the
 * rect's frame is always its -u side. */
export function solarTables(farm: SolarFarm): { x: number; z: number; heading: number }[] {
  const { rect, rows, perRow } = farm;
  const out: { x: number; z: number; heading: number }[] = [];
  const span = rect.width - 2 * S.end;
  const used = perRow * (S.row.table + S.row.gap) - S.row.gap;
  const v0 = -span / 2 + (span - used) / 2 + S.row.table / 2;
  const u0 = -rect.depth / 2 + S.margin + S.row.pitch / 2;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < perRow; j++) {
      const p = rectPoint(rect, u0 + i * S.row.pitch, v0 + j * (S.row.table + S.row.gap));
      out.push({ x: p.x, z: p.z, heading: rect.heading });
    }
  }
  return out;
}

// ── What the car can hit, and what the forest keeps off ───────────────────

/** R43 — every tower as a ring of wall bays round its foot, `hub` metres
 * tall to the physics — a car does not get over one. */
export function windFarmSolids(
  farm: WindFarm,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  const r = TOWER_BASE - 0.3;
  const n = Math.max(6, Math.round((2 * Math.PI * r) / WALL_BAY));
  for (const t of farm.turbines) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = t.x + Math.cos(a) * r;
      const z = t.z + Math.sin(a) * r;
      const y = groundAt(x, z);
      out.push(
        standSolid({
          x,
          z,
          y: Number.isNaN(y) ? t.y : y,
          kind: "wall",
          size: farm.hub / WALL_STOREY,
          spin: a,
        }),
      );
    }
  }
  return out;
}

/** The crane pads: a disc the terrain flattens under every tower. */
export function windFarmPads(
  farm: WindFarm,
): { x: number; z: number; y: number; radius: number }[] {
  return farm.turbines.map((t) => ({ x: t.x, z: t.z, y: t.y, radius: W.pad.radius }));
}

/** R43 — a solar farm to the car: every fence post as the pole it is, every
 * table as a run of wall bays a storey tall along it (steel on legs at
 * bonnet height — a car stops against it), and the cabin's walls. */
export function solarFarmSolids(
  farm: SolarFarm,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  const foot = (x: number, z: number): number => {
    const y = groundAt(x, z);
    return Number.isNaN(y) ? farm.y : y;
  };
  for (const p of farm.posts) {
    out.push(standSolid({ x: p.x, z: p.z, y: foot(p.x, p.z), kind: "post", size: 1, spin: 0 }));
  }
  const bay = 2;
  for (const t of solarTables(farm)) {
    const fwd = { x: Math.sin(t.heading), z: Math.cos(t.heading) };
    for (let v = -S.row.table / 2 + bay / 2; v < S.row.table / 2; v += bay) {
      const x = t.x + fwd.x * v;
      const z = t.z + fwd.z * v;
      out.push(standSolid({ x, z, y: foot(x, z), kind: "wall", size: 1, spin: t.heading }));
    }
  }
  const c = farm.cabin;
  if (!c) return out;
  const hw = c.width / 2 - WALL_RADIUS * 0.5;
  const hd = c.depth / 2 - WALL_RADIUS * 0.5;
  const corners: [number, number][] = [
    [-hd, -hw],
    [hd, -hw],
    [hd, hw],
    [-hd, hw],
  ];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / WALL_BAY));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = rectPoint(c, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      out.push(
        standSolid({ x: p.x, z: p.z, y: foot(p.x, p.z), kind: "wall", size: 1, spin: c.heading }),
      );
    }
  }
  return out;
}

/** The ground a solar farm keeps the forest off: its fence, and nothing
 * else — the country's own grass under the tables. */
export function solarFarmClearings(farm: SolarFarm): { rect: FarmRect; surface: null }[] {
  return [{ rect: farm.rect, surface: null }];
}
