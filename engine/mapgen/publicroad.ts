// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE PUBLIC ROAD, BUILT. The tarmac a country carries is laid before
// the rally is routed across it (`highway.ts`): whole roads, edge of the map
// to edge of the map, steering round the lakes. Where the route MEETS one it
// gets built — the borrowed run the rally drives, and the arms the tape shuts
// either side of the junction (`cutSpur`). Where the route never meets one,
// nothing was built at all: the line stayed a plan, and the country came out
// with no sealed road anywhere on it.
//
// That was fine while nothing else needed a road. R42 does. A rally crowd
// drives to the stage, parks, and walks in — so a car park has to hang off a
// road the cars could plausibly have arrived on, and on most seeds the route
// meets no tarmac at all. Measured over seeds 1-12 at medium, four of the
// twelve public roads were borrowed or crossed and the other eight were
// never built, which left five car parks in seventy-two standing on a road
// that led to a public road and the rest on a gravel lane driven out to the
// edge of the map because there was nothing else to leave from.
//
// So this module builds the rest of them: the stretch of a highway line the
// country actually carries, at the country's own height, as an ordinary road
// off the stage. It is a `SpurLine` like an abandoned arm or a homestead's
// drive, which is what makes it nearly free — the terrain already shelves
// one, the forest already keeps off one, the renderer already draws one, and
// the analysis already rolls one.
//
// Two things make it honest rather than a ribbon painted on a field:
//
//   IT LEAVES THE MAP AT BOTH ENDS. The line was laid rim to rim, so the
//   piece that is built has to reach past the fog on both sides or it is not
//   built at all. A public road that stops in a field is the loudest mistake
//   on the map, and refusing the road is always cheaper than drawing one.
//
//   IT IS REFUSED, NEVER REPAIRED. The height follows the country at a minor
//   road's grade inside the stage's own verge cone (R31), and where the cone
//   will not have it — the stage passing twice at two heights, a clamp that
//   would be a step — there is no public road on this seed. The route was
//   planned to keep R23's clearance off every one of these lines, so the
//   cone is the only thing that can refuse one, and it refuses few.

import type { Highway } from "./highway.ts";
import type { LandField } from "./land.ts";
import { LAKE_Y } from "./land.ts";
import { ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { followStep, SPUR, type ShelfBand, type SpurLine, type SpurSample } from "./spurs.ts";

/** The built piece of a public road that the rally never touches. */
export type PublicRoad = SpurLine & {
  /** The box it occupies — the cheap first question every clearance field
   * asks of a road off the stage. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

/** The shortest run of a line worth building, m. A branch's own floor: past
 * it the thing on the map is a lay-by, not a road. */
const LEAST = SPUR.length.min;

/** One point of the polyline being walked. */
type Point = { x: number; z: number; heading: number };

/** Walk `step` metres along the polyline from `at`, over as many of its own
 * points as that takes. Returns null where the line runs out first. */
function advance(
  line: readonly Point[],
  at: { x: number; z: number; heading: number; i: number },
  step: number,
): { x: number; z: number; heading: number; i: number } | null {
  let { x, z, heading, i } = at;
  let left = step;
  while (left > 1e-6) {
    const next = line[i + 1];
    if (!next) return null;
    const gap = Math.hypot(next.x - x, next.z - z);
    if (gap <= left + 1e-6) {
      left -= gap;
      x = next.x;
      z = next.z;
      heading = next.heading;
      i += 1;
      continue;
    }
    x += ((next.x - x) / gap) * left;
    z += ((next.z - z) / gap) * left;
    heading = next.heading;
    left = 0;
  }
  return { x, z, heading, i };
}

/** Everything the builder has to ask about the world it is laying a road
 * across. Functions rather than the compiler's own state, so the module can
 * be driven from a test. */
export type PublicRoadContext = {
  land: LandField;
  /** The country the stage occupies — a road has to leave it at both ends. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** R23 — distance from a point to the nearest piece of ROUTE, its aprons
   * included. */
  routeDistance: (x: number, z: number) => number;
  /** R23 — the room a road of the route's width keeps to itself, m. */
  routeClear: number;
  /** R23 + R31 — the band a road may stand in at a point without its own
   * shelf becoming a wall beside the stage. */
  shelfBand: (x: number, z: number) => ShelfBand;
  /** The route's arc position nearest a point, m — what orders the roads
   * off the stage and what an endless run would prune them by. */
  routeS: (x: number, z: number) => number;
};

/** Build every public road the route left as a plan. The ones it MET are
 * already built — a borrowed run and its two arms — and are skipped here by
 * the one test that says so: a line the route comes inside R23's clearance
 * of is a line the route is on. */
export function buildPublicRoads(
  highways: readonly Highway[],
  ctx: PublicRoadContext,
): PublicRoad[] {
  const built: PublicRoad[] = [];
  for (const line of highways) {
    const road = buildOne(line, ctx, built);
    if (road) built.push(road);
  }
  return built;
}

/** Is a point past the fog — clear of the country the stage occupies by more
 * than anything can be seen from inside it? */
function escaped(ctx: PublicRoadContext, p: { x: number; z: number }): boolean {
  const b = ctx.bounds;
  return (
    p.x < b.minX - SPUR.escape ||
    p.x > b.maxX + SPUR.escape ||
    p.z < b.minZ - SPUR.escape ||
    p.z > b.maxZ + SPUR.escape
  );
}

function buildOne(
  line: Highway,
  ctx: PublicRoadContext,
  /** The public roads already built on this stage, which this one keeps off
   * — the candidates come from several draws and two of them can be laid
   * over the same country. */
  standing: readonly PublicRoad[],
): PublicRoad | null {
  // R41 — a railway is not a road, and its own crossing already builds the
  // two arms the train runs down.
  if (line.kind !== "road") return null;
  // R23 — and off every road already built here.
  const clearOfBuilt = (p: { x: number; z: number }): boolean => {
    for (const other of standing) {
      const b = other.bounds;
      if (
        p.x < b.minX - ctx.routeClear ||
        p.x > b.maxX + ctx.routeClear ||
        p.z < b.minZ - ctx.routeClear ||
        p.z > b.maxZ + ctx.routeClear
      ) {
        continue;
      }
      for (let i = 0; i < other.samples.length; i += 2) {
        const s = other.samples[i];
        if (Math.hypot(p.x - s.x, p.z - s.z) < ctx.routeClear) return false;
      }
    }
    return true;
  };
  // The piece of the line the country carries: out of the water and off the
  // shore, clear of the route (R23 — where the route comes inside that, the
  // route is ON the line, and the road there is already built as the run
  // the rally drives and the two arms the tape shuts) and clear of the
  // roads already built here. The RIM points are the ones that usually
  // fail: `layOne` only vetoes a line for water inside the radius it can be
  // seen from, so a line's last few hundred metres can run into a sea basin
  // the far side of the world.
  const laid = line.points.map(
    (p) =>
      !ctx.land.flooded(p.x, p.z, 0) &&
      !ctx.land.nearWater(p.x, p.z, R.water.routeClear) &&
      ctx.routeDistance(p.x, p.z) >= ctx.routeClear &&
      clearOfBuilt(p),
  );
  // ...and the longest unbroken run of it, which is what gets built.
  let from = 0;
  let to = 0;
  let start = 0;
  for (let i = 0; i <= laid.length; i++) {
    if (i === laid.length || !laid[i]) {
      if (i - start > to - from) {
        from = start;
        to = i;
      }
      start = i + 1;
    }
  }
  const kept = line.points.slice(from, to);
  if (kept.length < 3) return null;
  if (kept[kept.length - 1].s - kept[0].s < LEAST) return null;
  // It leaves the map at BOTH ends, or it is a road that stops in a field.
  if (!escaped(ctx, kept[0]) || !escaped(ctx, kept[kept.length - 1])) return null;

  // R34 — the height: the country's own at the first point, then following
  // the country at the route's lag inside a minor road's grade, and never
  // outside the stage's verge cone (R31).
  const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
  const samples: SpurSample[] = [];
  const box = { minX: kept[0].x, maxX: kept[0].x, minZ: kept[0].z, maxZ: kept[0].z };
  let cursor = { x: kept[0].x, z: kept[0].z, heading: kept[0].heading, i: 0 };
  let y = Math.max(ctx.land.heightAt(cursor.x, cursor.z), LAKE_Y + SPUR.shoreFreeboard);
  let slope = 0;
  let s = 0;
  for (;;) {
    samples.push({
      x: cursor.x,
      z: cursor.z,
      heading: cursor.heading,
      elevation: y,
      s,
      surface: "asphalt",
      lift: 0,
      flat: 0,
    });
    if (cursor.x < box.minX) box.minX = cursor.x;
    if (cursor.x > box.maxX) box.maxX = cursor.x;
    if (cursor.z < box.minZ) box.minZ = cursor.z;
    if (cursor.z > box.maxZ) box.maxZ = cursor.z;
    const next = advance(kept, cursor, SPUR.step);
    if (!next) break;
    cursor = next;
    s += SPUR.step;
    const band = ctx.shelfBand(cursor.x, cursor.z);
    // An EMPTY band — the stage passing twice at two heights either side of
    // the line — is the country saying no road stands here, and half a
    // public road is not the answer to it.
    if (band.floor > band.ceiling) return null;
    const want =
      y +
      (Math.max(ctx.land.heightAt(cursor.x, cursor.z), LAKE_Y + SPUR.shoreFreeboard) - y) * follow;
    ({ y, slope } = followStep(
      y,
      slope,
      Math.min(band.ceiling, Math.max(band.floor, want)),
      SPUR.maxGrade,
    ));
    const bent = y;
    if (y > band.ceiling) y = band.ceiling;
    if (y < band.floor) y = band.floor;
    // A clamp that moves the road further than a step of it may climb IS a
    // step, and a step in a public road is a wall across it.
    if (Math.abs(y - bent) > SPUR.maxGrade * SPUR.step * 1.5) return null;
  }
  if (samples.length < 3) return null;
  // R17 — the mat stands proud of the country it is laid on, and it does it
  // over a joint at each end rather than in one step. Both ends are past the
  // fog, so nobody sees the joint; the terrain shelf under it is what the
  // ramp is for.
  const end = samples[samples.length - 1].s;
  for (const sample of samples) {
    const into = Math.min(sample.s, end - sample.s) / ROAD_CROSS.liftRamp;
    const t = Math.min(1, Math.max(0, into));
    sample.lift = ROAD_CROSS.asphaltLift * t * t * (3 - 2 * t);
  }
  const mid = samples[Math.floor(samples.length / 2)];
  return { atS: ctx.routeS(mid.x, mid.z), samples, width: line.width, bounds: box };
}
