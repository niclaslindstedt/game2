// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ROAD itself, as opposed to the route it takes: the cross-section
// every ribbon is built from (R16), and the junctions where the stage
// meets the sealed road it borrows (R17). These are the rules that decide
// whether a stage reads as country somebody laid roads across, or as a
// stripe painted on a heightfield.
import { describe, expect, it } from "vitest";

import {
  ROAD_CROSS,
  STAGE_RULES as R,
  compileStage,
  createTerrain,
  crossOffset,
  junctionThroat,
  vergeOffset,
  wearAt,
} from "@engine";

const WIDTH = R.roadWidth;
const HALF = WIDTH / 2;

describe("the road's cross-section (R16)", () => {
  it("crowns the road: the middle is the highest line across it", () => {
    const crown = crossOffset("gravel", false, 0, WIDTH);
    for (const lateral of [2, 4, 6, HALF]) {
      expect(crossOffset("gravel", false, lateral, WIDTH)).toBeLessThan(crown);
      expect(crossOffset("gravel", false, -lateral, WIDTH)).toBeLessThan(crown);
    }
  });

  it("wears two tracks into the gravel where every car has driven", () => {
    const rut = ROAD_CROSS.rut.at * HALF;
    // The wheel track is lower than the road a meter either side of it...
    expect(crossOffset("gravel", false, rut, WIDTH)).toBeLessThan(
      crossOffset("gravel", false, rut - 1.6, WIDTH),
    );
    // ...and it is the most worn part of the surface.
    expect(wearAt(rut, WIDTH)).toBeGreaterThan(wearAt(HALF, WIDTH));
    expect(wearAt(rut, WIDTH)).toBeCloseTo(1, 1);
    // Both sides, because a car has two wheels on an axle.
    expect(crossOffset("gravel", false, -rut, WIDTH)).toBeCloseTo(
      crossOffset("gravel", false, rut, WIDTH),
      6,
    );
  });

  it("polishes asphalt rather than rutting it, and lays it flatter", () => {
    const rut = ROAD_CROSS.rut.at * HALF;
    const sealedRut =
      crossOffset("asphalt", false, 0, WIDTH) - crossOffset("asphalt", false, rut, WIDTH);
    const looseRut =
      crossOffset("gravel", false, 0, WIDTH) - crossOffset("gravel", false, rut, WIDTH);
    expect(sealedRut).toBeLessThan(looseRut);
    expect(ROAD_CROSS.crown.asphalt).toBeLessThan(ROAD_CROSS.crown.gravel);
  });

  it("digs a ditch beside the road, and climbs back out of it", () => {
    const shoulder = vergeOffset(ROAD_CROSS.verge.shoulder, 0, 0);
    const bottom = vergeOffset(ROAD_CROSS.verge.ditchAt, 0, 0);
    const lip = vergeOffset(ROAD_CROSS.reach, 0, 0);
    expect(bottom).toBeLessThan(shoulder - 0.5);
    expect(lip).toBeGreaterThan(bottom);
  });

  it("stands an asphalt mat proud of the ground beside it", () => {
    const lift = ROAD_CROSS.asphaltLift;
    const edge = crossOffset("asphalt", false, HALF, WIDTH);
    // Off the mat's edge the ground drops by the lift plus the shoulder.
    expect(vergeOffset(ROAD_CROSS.chamfer + 0.1, lift, edge)).toBeLessThan(edge - lift * 0.8);
    // Unsealed road has no such step.
    expect(vergeOffset(ROAD_CROSS.chamfer + 0.1, 0, edge)).toBeGreaterThan(
      vergeOffset(ROAD_CROSS.chamfer + 0.1, lift, edge),
    );
  });
});

describe("junctions (R17)", () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21];

  it("changes surface only at a corner, and puts a junction there", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      let changes = 0;
      for (let i = 1; i < track.samples.length; i++) {
        const before = track.samples[i - 1];
        const after = track.samples[i];
        if (before.surface === after.surface) continue;
        if (before.surface === "water" || after.surface === "water") continue;
        changes += 1;
        // Every surface change has a junction within a corner's reach of
        // it — the two roads MEET there, at a place a surveyor picked.
        const near = track.junctions.some(
          (j) => Math.hypot(j.x - after.x, j.z - after.z) < R.paving.maxJunctionOffset + 20,
        );
        expect(near).toBe(true);
      }
      // ...and every junction has the branch the route did not take.
      expect(track.spurs.length).toBe(track.junctions.length);
      expect(track.junctions.length).toBe(changes);
    }
  });

  it("sends the branch off along the road the route turned onto, not a fork of its own", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      for (let i = 0; i < track.spurs.length; i++) {
        const spur = track.spurs[i];
        const junction = track.junctions[i];
        const head = spur.samples[0];
        expect(Math.hypot(head.x - junction.x, head.z - junction.z)).toBeLessThan(0.01);
        const off = Math.abs(
          Math.atan2(
            Math.sin(head.heading - junction.heading),
            Math.cos(head.heading - junction.heading),
          ),
        );
        expect(off).toBeLessThan(0.05);
      }
    }
  });

  it("runs every branch off the map instead of ending it in a field", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      for (const spur of track.spurs) {
        const end = spur.samples[spur.samples.length - 1];
        const out =
          end.x < track.bounds.minX ||
          end.x > track.bounds.maxX ||
          end.z < track.bounds.minZ ||
          end.z > track.bounds.maxZ;
        expect(out).toBe(true);
        // ...and it is a real road while it lasts: sealed, then degrading
        // to gravel as it leaves the world.
        expect(spur.samples[0].surface).toBe("asphalt");
        expect(end.surface).toBe("gravel");
      }
    }
  });

  it("paves the throat so the two mats are one surface", () => {
    const track = compileStage(3, "medium", { asphalt: 0.5 });
    expect(track.junctions.length).toBeGreaterThan(0);
    for (const junction of track.junctions) {
      const quads = junctionThroat(junction);
      expect(quads.length).toBeGreaterThan(0);
      // The throat starts INSIDE the main road's mat (so there is no seam)
      // and opens wider at that end than where it becomes the branch.
      const first = quads[0];
      const last = quads[quads.length - 1];
      const widthOf = (q: [number, number][]): number =>
        Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]);
      expect(widthOf(first)).toBeGreaterThan(widthOf(last));
      const back = Math.hypot(first[0][0] - junction.x, first[0][1] - junction.z);
      expect(back).toBeLessThan(junction.radius);
    }
  });

  it("gives an exploring car tarmac grip on a branch", () => {
    const track = compileStage(3, "medium", { asphalt: 0.5 });
    const terrain = createTerrain(track);
    const spur = track.spurs[0];
    const on = spur.samples[Math.floor(spur.samples.length / 3)];
    expect(terrain.spurSurfaceAt(on.x, on.z)).toBe(on.surface);
    // Well off it, the wild is the wild again.
    const r = { x: Math.cos(on.heading), z: -Math.sin(on.heading) };
    expect(terrain.spurSurfaceAt(on.x + r.x * 40, on.z + r.z * 40)).toBeNull();
  });
});
