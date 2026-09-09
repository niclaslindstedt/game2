// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The STRANDS a stage's road network is read as, and the two measurements
// every part of the analysis takes off them. A strand is one continuous
// run of road — the route itself, each public road, each abandoned arm,
// each car park lane — resampled at a fixed spacing so a distance between
// two roads is a distance between two point sets rather than between two
// different kinds of description.

import { SPUR } from "../mapgen/spurs.ts";
import { type Track } from "../mapgen/compile.ts";
import type { Building } from "../mapgen/buildings.ts";
import type { TerrainField } from "../mapgen/terrain.ts";

/** A piece of road reduced to what a network question needs: where it goes
 * and which way it is pointing there. */
export type Strand = {
  id: string;
  points: { x: number; z: number; heading: number; s: number; y: number }[];
  /** Branches only: the MEETING POINT this one hangs off. Inside R23's own
   * exemption around it (`junction.parting`) the two carriageways ARE one
   * road, which is what a junction is — so the sweep has to skip exactly
   * the ground the branch builder was allowed to ignore, or every junction
   * on the map reports as two roads sharing it.
   *
   * A PLACE, not a stretch of arc, for the same reason the rule is one: an
   * arc window exempts whatever the route happens to be doing hundreds of
   * metres away, which on seeds 1-12 hid every branch that actually lay on
   * it. */
  meet: { x: number; z: number } | null;
  /** ...and where on the STAGE that crossing is, m of route arc. */
  atS: number;
  /** R36 — set on both arms of a LEVEL CROSSING. The pair are not two
   * roads: they are the two halves of one public road, cut where the rally
   * went over it, and they leave one point in opposite directions along one
   * line. So they meet at nought metres apart by construction — which is
   * what R23 is about everywhere else and is the definition of a crossing
   * here. `sameCrossing` below is the exemption, and it is as tight as it
   * can be made: the two only overlap at all within a road width of the
   * middle, because from there they diverge at two metres per metre. */
  crossing: boolean;
};

/** Everything on the map that is a road, on one common spacing so a
 * proximity sweep between two of them is comparing like with like. */
export function strands(track: Track, spacing: number): Strand[] {
  const out: Strand[] = [];
  const routeStride = Math.max(1, Math.round(spacing / track.step));
  const route: Strand = { id: "route", points: [], meet: null, atS: 0, crossing: false };
  for (let i = 0; i < track.samples.length; i += routeStride) {
    const s = track.samples[i];
    route.points.push({ x: s.x, z: s.z, heading: s.heading, s: s.s, y: s.elevation });
  }
  out.push(route);
  track.spurs.forEach((spur, index) => {
    const stride = Math.max(1, Math.round(spacing / SPUR.step));
    const points: Strand["points"] = [];
    for (let i = 0; i < spur.samples.length; i += stride) {
      const p = spur.samples[i];
      points.push({ x: p.x, z: p.z, heading: p.heading, s: i * SPUR.step, y: p.elevation });
    }
    const first = spur.samples[0];
    out.push({
      id: `branch ${index + 1}`,
      points,
      meet: first ? { x: first.x, z: first.z } : null,
      atS: spur.atS,
      crossing: spur.crossing === true,
    });
  });
  return out;
}

/** R39 — how far a building stands from the DRAWN ground under it, m: the
 * worst of the whole footprint, its wing included, over a metre grid.
 *
 * Unsigned on purpose. Hanging in the air and buried to the windows are the
 * same defect with the same cause — the ground the village was graded onto
 * is not the ground the world drew — and a check that measured only the
 * gap under a house would call a street of half-sunk ones clean. */
export function footingOff(building: Building, terrain: TerrainField): number {
  const { plan } = building;
  const fwd = { x: Math.sin(building.heading), z: Math.cos(building.heading) };
  const right = { x: Math.cos(building.heading), z: -Math.sin(building.heading) };
  const half = plan.width / 2;
  /** Every block of the building, in its own local frame: `u` across the
   * front, `v` back from it. The wing hangs off the BACK wall, flush with
   * one end (`buildings.ts` builds its solids from the same rectangle). */
  const blocks = [{ u0: -half, u1: half, v0: -plan.depth / 2, v1: plan.depth / 2 }];
  if (plan.wing) {
    const u1 = plan.wing.side > 0 ? half : -half + plan.wing.width;
    blocks.push({
      u0: u1 - plan.wing.width,
      u1,
      v0: -plan.depth / 2 - plan.wing.depth,
      v1: -plan.depth / 2,
    });
  }
  let worst = 0;
  for (const block of blocks) {
    const nu = Math.max(2, Math.ceil(block.u1 - block.u0));
    const nv = Math.max(2, Math.ceil(block.v1 - block.v0));
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = block.u0 + ((block.u1 - block.u0) * i) / nu;
        const v = block.v0 + ((block.v1 - block.v0) * j) / nv;
        const off = Math.abs(
          building.y -
            terrain.groundAt(
              building.x + right.x * u + fwd.x * v,
              building.z + right.z * u + fwd.z * v,
            ),
        );
        if (off > worst) worst = off;
      }
    }
  }
  return worst;
}

/** How far off parallel two headings are, radians, folded so opposite
 * directions count as parallel — two roads pointing at each other's tails
 * are as much side by side as two pointing the same way. */
export function offParallel(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > Math.PI / 2 ? Math.PI - d : d;
}
