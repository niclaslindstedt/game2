// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ROAD itself, as opposed to the route it takes: the cross-section
// every ribbon is built from (R16), and the junctions where the stage
// meets the sealed road it borrows (R17). These are the rules that decide
// whether a stage reads as country somebody laid roads across, or as a
// stripe painted on a heightfield.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KNOBS,
  ROAD_CROSS,
  STAGE_RULES as R,
  compileStage,
  createLandField,
  createTerrain,
  crossOffset,
  junctionFlat,
  junctionMainEdge,
  knobScale,
  vergeOffset,
  wearAt,
} from "@engine";

const WIDTH = knobScale(DEFAULT_KNOBS.width, R.roadWidth);
const HALF = WIDTH / 2;
const gravel = { surface: "gravel", lift: 0 } as const;
const asphalt = { surface: "asphalt", lift: 0 } as const;

describe("the road's cross-section (R16)", () => {
  it("crowns the road: the middle is the highest line across it", () => {
    const crown = crossOffset(gravel, 0, WIDTH);
    for (const lateral of [2, 4, 6, HALF]) {
      expect(crossOffset(gravel, lateral, WIDTH)).toBeLessThan(crown);
      expect(crossOffset(gravel, -lateral, WIDTH)).toBeLessThan(crown);
    }
  });

  it("wears two tracks into the gravel where every car has driven", () => {
    const rut = ROAD_CROSS.rut.at * HALF;
    // The wheel track is lower than the road a meter either side of it...
    expect(crossOffset(gravel, rut, WIDTH)).toBeLessThan(crossOffset(gravel, rut - 1.6, WIDTH));
    // ...and it is the most worn part of the surface.
    expect(wearAt(rut, WIDTH)).toBeGreaterThan(wearAt(HALF, WIDTH));
    expect(wearAt(rut, WIDTH)).toBeCloseTo(1, 1);
    // Both sides, because a car has two wheels on an axle.
    expect(crossOffset(gravel, -rut, WIDTH)).toBeCloseTo(crossOffset(gravel, rut, WIDTH), 6);
  });

  it("polishes asphalt rather than rutting it, and lays it flatter", () => {
    const rut = ROAD_CROSS.rut.at * HALF;
    const sealedRut = crossOffset(asphalt, 0, WIDTH) - crossOffset(asphalt, rut, WIDTH);
    const looseRut = crossOffset(gravel, 0, WIDTH) - crossOffset(gravel, rut, WIDTH);
    expect(sealedRut).toBeLessThan(looseRut);
    expect(ROAD_CROSS.crown.asphalt).toBeLessThan(ROAD_CROSS.crown.gravel);
  });

  it("leans the verge away without ever digging a ditch beside the road", () => {
    // R16 — past the shoulder the ground falls, and keeps falling: there
    // is no low point anywhere out there for a car to drop into.
    let previous = vergeOffset(ROAD_CROSS.chamfer, 0, 0);
    for (let out = ROAD_CROSS.chamfer; out <= ROAD_CROSS.reach; out += 0.1) {
      const here = vergeOffset(out, 0, 0);
      expect(here).toBeLessThanOrEqual(previous + 1e-9);
      previous = here;
    }
    // ...and the whole fall is a step a car can drive back up, not a
    // trench that swallows it.
    expect(vergeOffset(ROAD_CROSS.reach, 0, 0)).toBeGreaterThan(-0.6);
  });

  it("banks a turn into itself, and takes the crown out when it does (R19)", () => {
    const banked = { ...gravel, bank: R.bank.max.gravel };
    // Positive bank stands the LEFT edge proud — the outside of a
    // right-hand turn, which is what positive curvature is.
    expect(crossOffset(banked, -HALF, WIDTH)).toBeGreaterThan(crossOffset(banked, HALF, WIDTH));
    // The fall runs one way across the whole width: no crown left to make
    // the inside edge a gutter.
    let previous = crossOffset(banked, -HALF, WIDTH);
    for (let l = -HALF; l <= HALF; l += 0.5) {
      const here = crossOffset(banked, l, WIDTH);
      expect(here).toBeLessThanOrEqual(previous + 1e-6);
      previous = here;
    }
    // And it is a road, not a speedway: the cross-fall stays inside the
    // rate a car can be parked on.
    const drop = crossOffset(banked, -HALF, WIDTH) - crossOffset(banked, HALF, WIDTH);
    expect(drop / WIDTH).toBeLessThanOrEqual(R.bank.max.gravel + 1e-6);
    expect(R.bank.max.asphalt).toBeLessThan(R.bank.max.gravel);
  });

  it("warps the cross-section flat inside a junction (R17)", () => {
    const shaped = { ...gravel, bank: 0.06 };
    const flat = { ...shaped, flat: 1 };
    for (const l of [-HALF, -3, 0, 3, HALF]) {
      expect(crossOffset(flat, l, WIDTH)).toBeCloseTo(0, 6);
    }
    expect(crossOffset(shaped, HALF, WIDTH)).not.toBeCloseTo(0, 3);
  });

  it("stands an asphalt mat proud of the ground beside it", () => {
    const lift = ROAD_CROSS.asphaltLift;
    const edge = crossOffset(asphalt, HALF, WIDTH);
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
        // Every surface change happens at the edge of a junction's own
        // platform — the two roads MEET there, and the seal stops where
        // the main road's mat does, not at a segment boundary.
        const near = track.junctions.some(
          (j) => Math.hypot(j.x - after.x, j.z - after.z) < j.reach + WIDTH,
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

  it("runs every branch off the map, or to the water that stopped it", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      const land = createLandField(seed, track.knobs);
      for (const spur of track.spurs) {
        const end = spur.samples[spur.samples.length - 1];
        const out =
          end.x < track.bounds.minX ||
          end.x > track.bounds.maxX ||
          end.z < track.bounds.minZ ||
          end.z > track.bounds.maxZ;
        // A branch leads somewhere: off the edge of the world, or to the
        // shore of the lake that stopped it. Never into open country, and
        // never out ACROSS the water on an embankment.
        expect(out || spur.endsAt === "water").toBe(true);
        // ...and wherever it stops, it stops on dry ground: a road ending
        // in mid-air over open water is the one thing worse than a road
        // ending in a field.
        expect(land.flooded(end.x, end.z)).toBe(false);
        // ...and it is a real road while it lasts: sealed, then degrading
        // to gravel as it leaves the world.
        expect(spur.samples[0].surface).toBe("asphalt");
        expect(end.surface).toBe("gravel");
      }
    }
  });

  it("puts the junction ON the road, at a corner tight enough to be one", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      for (const junction of track.junctions) {
        // The meeting point sits on the route's own centerline — not out
        // at the intersection of two tangents, which on a sweeping corner
        // is a hundred meters away in a field.
        const onRoute = track.samples.some(
          (sample) => Math.hypot(sample.x - junction.x, sample.z - junction.z) < 0.01,
        );
        expect(onRoute).toBe(true);
        // ...and the corner it sits at turns hard enough that the two
        // carriageways actually PART instead of peeling slowly apart over
        // a slip road's worth of tangent.
        const radius = 1 / Math.abs(junction.curve);
        const parted = radius * Math.acos(Math.max(-1, 1 - track.width / radius));
        expect(parted).toBeLessThanOrEqual(R.paving.junctionParts * track.width + 1e-6);
      }
    }
  });

  it("warps both carriageways onto one plane and cuts their borders away", () => {
    const track = compileStage(3, "medium", { asphalt: 0.5 });
    expect(track.junctions.length).toBeGreaterThan(0);
    for (const junction of track.junctions) {
      expect(junctionFlat(junction, junction.x, junction.z)).toBeCloseTo(1, 6);
      // The main road's mat is the line the minor road stops at.
      expect(junctionMainEdge(junction, junction.x, junction.z)).toBeCloseTo(
        -junction.width / 2,
        6,
      );
      // Both roads are flattened where they overlap...
      const at = track.samples.find((sample) => sample.s === junction.s);
      expect(at?.flat).toBeCloseTo(1, 2);
      const spur = track.spurs.find((s) => s.atS === junction.s);
      expect(spur?.samples[0].flat).toBeCloseTo(1, 2);
      // ...and the branch is the main road CONTINUED, so it is exactly as
      // wide as the carriageway the route was on.
      expect(spur?.width).toBe(track.width);
    }
  });

  it("paves the gore so the grass between two parting roads is an island", () => {
    const track = compileStage(3, "medium", { asphalt: 0.5 });
    for (const junction of track.junctions) {
      expect(junction.gore.length).toBeGreaterThan(0);
      for (const quad of junction.gore) {
        for (const [x, z] of quad) {
          // Every scrap of it is inside the junction it belongs to.
          expect(Math.hypot(x - junction.x, z - junction.z)).toBeLessThan(
            junction.reach + R.junction.goreNose + junction.width,
          );
        }
      }
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
