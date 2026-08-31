// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ROAD itself, as opposed to the route it takes: the cross-section
// every ribbon is built from (R16), and the junctions where the stage
// meets the sealed road it borrows (R17). These are the rules that decide
// whether a stage reads as country somebody laid roads across, or as a
// stripe painted on a heightfield.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KNOBS,
  NEUTRAL_INPUT,
  ROAD_CROSS,
  SPUR,
  STAGE_RULES as R,
  TUNING,
  compileStage,
  corridorOffset,
  createLandField,
  createTerrain,
  crossOffset,
  handoverAt,
  junctionFlat,
  createGame,
  junctionMainEdge,
  roadClearance,
  knobScale,
  locate,
  rutAt,
  step,
  vergeOffset,
  wearAt,
} from "@engine";

const WIDTH = knobScale(DEFAULT_KNOBS.width, R.roadWidth);
const HALF = WIDTH / 2;
const W = R.roughness.width;
const gravel = { surface: "gravel", lift: 0 } as const;
const asphalt = { surface: "asphalt", lift: 0 } as const;

/** True where a point stands on a junction's graded platform — asked of the
 * same function the terrain shapes the ground with, so the test and the
 * world agree on where a junction is. */
function inJunction(track: ReturnType<typeof compileStage>, at: { x: number; z: number }): boolean {
  return track.junctions.some((j) => junctionFlat(j, at.x, at.z) > 0);
}

describe("the road's cross-section (R16)", () => {
  it("crowns the road: the middle is the highest line across it", () => {
    const crown = crossOffset(gravel, 0, WIDTH);
    for (const lateral of [2, 4, 6, HALF]) {
      expect(crossOffset(gravel, lateral, WIDTH)).toBeLessThan(crown);
      expect(crossOffset(gravel, -lateral, WIDTH)).toBeLessThan(crown);
    }
  });

  it("wears two tracks into the gravel where every car has driven", () => {
    const rut = rutAt(WIDTH);
    // The wheel track is lower than the road a meter either side of it...
    expect(crossOffset(gravel, rut, WIDTH)).toBeLessThan(crossOffset(gravel, 0, WIDTH));
    expect(crossOffset(gravel, rut, WIDTH)).toBeLessThan(crossOffset(gravel, rut + 1.6, WIDTH));
    // ...and it is the most worn part of the surface.
    expect(wearAt(rut, WIDTH)).toBeGreaterThan(wearAt(HALF, WIDTH));
    expect(wearAt(rut, WIDTH)).toBeCloseTo(1, 1);
    // Both sides, because a car has two wheels on an axle.
    expect(crossOffset(gravel, -rut, WIDTH)).toBeCloseTo(crossOffset(gravel, rut, WIDTH), 6);
    // A wheel track is a real-world distance, so it sits where a car's
    // wheels go rather than scaling out to the edge of a wide road.
    expect(rut).toBeLessThan(HALF * 0.5);
  });

  it("runs FIVE lines down a dirt road, not one flat band (R16)", () => {
    const rut = rutAt(WIDTH);
    // Across the road: a loose edge, a worn track, the crown between the
    // tracks, the other track, the other edge. What makes them read is that
    // each is a different amount of worn from the one beside it.
    const edge = wearAt(HALF - 0.4, WIDTH);
    const track = wearAt(rut, WIDTH);
    const crown = wearAt(0, WIDTH);
    expect(track).toBeGreaterThan(crown);
    expect(crown).toBeGreaterThan(edge);
    // ...and the edge is still ROAD, so it can hand over to the verge
    // instead of stopping at it.
    expect(edge).toBeGreaterThan(0);
    // The road is CURVED across its width: the crown stands proud of both
    // tracks by more than a token amount.
    const dish = crossOffset(gravel, 0, WIDTH) - crossOffset(gravel, rut, WIDTH);
    expect(dish).toBeGreaterThan(0.08);
  });

  it("polishes asphalt rather than rutting it, and lays it flatter", () => {
    const rut = rutAt(WIDTH);
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
    // No crown left to make the inside edge a gutter: the inside edge is
    // the lowest line on the road, and outside the wheel tracks — which are
    // troughs wherever the road goes, and not what R19 is about — the fall
    // runs one way all the way to it.
    const inner = crossOffset(banked, HALF, WIDTH);
    for (let l = -HALF; l < HALF; l += 0.25) {
      expect(crossOffset(banked, l, WIDTH)).toBeGreaterThan(inner);
    }
    let previous = Infinity;
    for (let l = rutAt(WIDTH) + 2 * ROAD_CROSS.rut.width; l <= HALF; l += 0.25) {
      const here = crossOffset(banked, l, WIDTH);
      expect(here).toBeLessThanOrEqual(previous + 1e-6);
      previous = here;
    }
    // The whole width falls the same way: nothing on the outside half sits
    // below its opposite number on the inside one.
    for (let l = 0.25; l <= HALF; l += 0.25) {
      expect(crossOffset(banked, -l, WIDTH)).toBeGreaterThan(crossOffset(banked, l, WIDTH));
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

  // R16 — THE HAND-OVER. The road does not END, it RUNS OUT, and the whole
  // of that promise is this one curve: the ribbon owns its own height out to
  // the bare shoulder, and the ground beside it owns everything by the
  // corridor's lip. Three consumers read it — the physics, the road mesh
  // and the analysis — so a change to it moves all three together, which is
  // the point of it being one function.
  it("hands the road's surface over to the ground beside it, from the shoulder to the lip", () => {
    // The mat and the bare shoulder are the ROAD's, entirely.
    expect(handoverAt(0)).toBe(1);
    expect(handoverAt(ROAD_CROSS.verge.bareTo)).toBe(1);
    // ...and by the corridor's own lip the ground has it, entirely. This is
    // the assertion the whole thing exists for: anything less than zero
    // here is a step between two meshes, which is the vertical face down
    // the side of every road that this replaced.
    expect(handoverAt(ROAD_CROSS.reach)).toBe(0);
    expect(handoverAt(ROAD_CROSS.reach + 5)).toBe(0);
    // Monotonic in between, and smooth at both ends rather than a straight
    // ramp with a crease at each: a hand-over that creases at the shoulder
    // is a smaller version of the edge it is meant to remove.
    const band = ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo;
    let last = 1;
    for (let k = 1; k <= 20; k++) {
      const here = handoverAt(ROAD_CROSS.verge.bareTo + (band * k) / 20);
      expect(here).toBeLessThanOrEqual(last);
      last = here;
    }
    const step = band / 40;
    const atShoulder = 1 - handoverAt(ROAD_CROSS.verge.bareTo + step);
    const atMiddle =
      handoverAt(ROAD_CROSS.verge.bareTo + band / 2 - step / 2) -
      handoverAt(ROAD_CROSS.verge.bareTo + band / 2 + step / 2);
    expect(atShoulder).toBeLessThan(atMiddle * 0.5);
  });

  it("meets the ground the tiles are drawn on at the corridor's lip", () => {
    // The measurement the check above only promises in the abstract, taken
    // on a real stage: at the outer lip the surface the car rides IS the
    // drawn ground lattice, so the road mesh's outermost vertices and the
    // tile mesh's nearest ones agree and there is nothing to hide.
    for (const seed of [1, 4, 7]) {
      const track = compileStage(seed, "medium");
      const terrain = createTerrain(track);
      const gaps: number[] = [];
      for (let i = 0; i < track.samples.length; i += 13) {
        const s = track.samples[i];
        if (s.deck != null) continue;
        const rx = Math.cos(s.heading);
        const rz = -Math.sin(s.heading);
        for (const side of [-1, 1]) {
          const lip = (s.width / 2 + ROAD_CROSS.reach) * side;
          const x = s.x + rx * lip;
          const z = s.z + rz * lip;
          gaps.push(Math.abs(terrain.groundAt(x, z) - terrain.latticeAt(x, z)));
        }
        // ...while the mat itself is still entirely the ribbon's — to
        // within the road's own grain between two samples (R33), which is
        // what a query landing between them reads.
        //
        // Off a JUNCTION PLATFORM, where the cross-section is exactly what
        // R17 planes away: inside one there is no crown, no camber and no
        // bank, because the two carriageways are warped onto one graded
        // plane. Seed 7 puts a sample 27 m inside a 37 m platform, and the
        // 0.11 m it reads is its crown — the ribbon there agreeing with the
        // ground, not disagreeing with it.
        if (inJunction(track, s)) continue;
        const mid = terrain.groundAt(s.x, s.z);
        expect(Math.abs(mid - (s.elevation + corridorOffset(s, 0, s.width)))).toBeLessThan(0.1);
      }
      expect(gaps.length).toBeGreaterThan(150);
      gaps.sort((a, b) => a - b);
      // Typically nothing at all: the two surfaces are the same surface out
      // here. The corridor is found by the nearest 2 m SAMPLE, so a corner
      // and a junction rim each leave a few centimetres — hence a ceiling
      // rather than an equality, and the ceiling is the assertion that
      // matters. This gap used to run to thirteen metres, and every
      // centimetre of it was drawn as a vertical face down the road's side.
      expect(gaps[Math.floor(gaps.length * 0.9)]).toBeLessThan(0.02);
      // The tail sits at a JUNCTION RIM and nowhere else. Measured on these
      // three seeds, every worst-case gap is 25-40 m from a junction, none
      // is on a cut face (R34), and the p90 above — the assertion that
      // matters — is untouched at under two centimetres. The rim is the one
      // place the ribbon is warped onto a plane the 14 m tile lattice has to
      // interpolate ACROSS, so the error there scales with how steep that
      // plane is; R34 gave the platform the road's terrain-following grade,
      // which is the first time it has had one worth speaking of.
      //
      // The ceiling therefore moves whenever the junctions do. With the
      // tarmac laid before the route (R17) they sit where the public roads
      // are rather than where a paving field asked: measured on these three
      // seeds the tail went 0.13 → 0.42, 0.12 → 0.00 and 0.57 → 0.72, and
      // seed 7's worst point is still a junction rim (33 m from the meeting
      // point, 3 m from the branch) rather than a new kind of place. The
      // p90 above — the assertion that matters — is untouched at under two
      // centimetres on all three.
      expect(gaps[gaps.length - 1], `worst lip gap on seed ${seed}`).toBeLessThan(0.8);
    }
  });
});

describe("junctions (R17)", () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21];

  /** The first of these seeds whose stage actually has a branch on it.
   *
   * R17 — a stage has tarmac on it only where its COUNTRY carries a public
   * road the route could reach. The roads are laid on the bare land before
   * the rally is routed over it (`highway.ts`), so a seed whose land will
   * not carry one — or whose route never comes within reach of the one it
   * has — is all gravel, and that is the right answer rather than a
   * failure. A test that names a seed and expects a junction on it is
   * testing the country, not the junction. */
  function firstBranch(asphalt: number): {
    seed: number;
    track: ReturnType<typeof compileStage>;
    spur: NonNullable<ReturnType<typeof compileStage>["spurs"][number]>;
  } {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt });
      if (track.spurs.length > 0) return { seed, track, spur: track.spurs[0] };
    }
    throw new Error("no seed in the sweep carried a public road");
  }

  it("changes surface only at a corner, and puts a junction there", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      let changes = 0;
      let runOuts = 0;
      for (let i = 1; i < track.samples.length; i++) {
        const before = track.samples[i - 1];
        const after = track.samples[i];
        if (before.surface === after.surface) continue;
        if (before.surface === "water" || after.surface === "water") continue;
        // Every surface change happens at the edge of a junction's own
        // platform — the two roads MEET there, and the seal stops where
        // the main road's mat does, not at a segment boundary.
        const near = track.junctions.some(
          (j) => Math.hypot(j.x - after.x, j.z - after.z) < j.reach + WIDTH,
        );
        if (near) {
          changes += 1;
          continue;
        }
        // R20 — with ONE exception: where a seal reaches a corner no public
        // road would have been laid with, the SURFACING RUNS OUT there. So
        // a change with no junction at it is legal exactly when it is
        // tarmac becoming gravel at the start of a corner tighter than
        // `paving.minRadius`, and never the other way round.
        runOuts += 1;
        expect(before.surface, `seed ${seed}: surface change with no junction`).toBe("asphalt");
        expect(after.surface).toBe("gravel");
        expect(Math.abs(after.curvature)).toBeGreaterThan(1 / R.paving.minRadius);
      }
      // ...and every junction has the branch the route did not take.
      expect(track.spurs.length).toBe(track.junctions.length);
      expect(track.junctions.length).toBe(changes);
      // The exception stays an exception: a stage whose tarmac mostly ends
      // in run-outs is a stage whose junctions have stopped working.
      expect(runOuts, `seed ${seed}: run-outs vs junctions`).toBeLessThanOrEqual(
        track.junctions.length,
      );
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

  it("runs every branch off the map, or to whatever stopped it", () => {
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
        // A branch leads somewhere: off the edge of the world, to the shore
        // of the lake that stopped it, or up to the ground the stage had
        // already taken (R23). Never into open country for no reason, and
        // never out ACROSS the water on an embankment.
        expect(out || spur.endsAt === "water" || spur.endsAt === "stage").toBe(true);
        // ...and wherever it stops, it stops on dry ground: a road ending
        // in mid-air over open water is the one thing worse than a road
        // ending in a field. The one exception is a junction laid on a
        // shore, where the water is inside the first `keep` meters — the
        // stretch that is never trimmed, because a junction whose other
        // arm is simply missing reads as the main road stopping dead.
        expect(land.flooded(end.x, end.z) && end.s > SPUR.keep).toBe(false);
        // ...and it is TARMAC the whole way. A branch is the sealed road
        // the route borrowed, carried on past the junction; a tarmac road
        // that turns to gravel in an empty field is a road that goes
        // nowhere, and it is the loudest thing on the map from above.
        for (const sample of spur.samples) expect(sample.surface).toBe("asphalt");
      }
    }
  });

  it("R23 — keeps every branch off the stage it left, and off its start", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      const keepOut = roadClearance(track.width);
      const first = track.samples[0];
      /** Distance from a point to the apron the start stands on (R24). */
      const toStart = (x: number, z: number): number => {
        const along = -(
          (x - first.x) * Math.sin(first.heading) +
          (z - first.z) * Math.cos(first.heading)
        );
        const lateral =
          (x - first.x) * Math.cos(first.heading) - (z - first.z) * Math.sin(first.heading);
        return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - R.startZone.apron));
      };
      // The route, bucketed at the clearance, so a branch's whole walk is
      // checked against a 3x3 probe instead of the stage's every sample.
      const cells = new Map<string, (typeof track.samples)[number][]>();
      for (const road of track.samples) {
        const at = `${Math.floor(road.x / keepOut)},${Math.floor(road.z / keepOut)}`;
        const bucket = cells.get(at);
        if (bucket) bucket.push(road);
        else cells.set(at, [road]);
      }
      for (const spur of track.spurs) {
        for (const sample of spur.samples) {
          // The first stretch is exempt: there the branch IS the road the
          // route turned off, running beside it out of their shared
          // junction. Past that it is a road of its own and keeps its
          // distance — from the stage and from the start alike, because
          // the terrain can only lay its shelf under one of them.
          if (sample.s <= 60) continue;
          expect(toStart(sample.x, sample.z)).toBeGreaterThanOrEqual(keepOut - 1);
          const cx = Math.floor(sample.x / keepOut);
          const cz = Math.floor(sample.z / keepOut);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (const road of cells.get(`${cx + dx},${cz + dz}`) ?? []) {
                // ...except around its own junction, where the two are one
                // road by construction.
                if (Math.abs(road.s - spur.atS) < 240) continue;
                const d = Math.hypot(road.x - sample.x, road.z - sample.z);
                // The generator measures against a coarsened copy of the
                // route, so it keeps a little MORE room than the rule asks
                // for, never less; the slack here is that coarsening.
                expect(d).toBeGreaterThanOrEqual(keepOut - 9);
              }
            }
          }
        }
      }
    }
  });

  it("R23/R31 — a branch keeps clear of the stage in HEIGHT as well as on the map", () => {
    // Two things the junction's exemption is not. It is not a standing
    // licence: the stage either side of a meeting point is the branch's own
    // road while the two are still parting, and a branch that wandered a
    // kilometre and folded back over the road beside its own junction took
    // it as one — and stood forty metres above a road being driven. And it
    // is not only about the map: two roads far enough apart to be separate
    // can still be tens of metres apart in HEIGHT, and the hillside that
    // carried one up to the other is exactly the wall R31 cuts away.
    //
    // Strided over the route the same way the generator's own keep-out
    // field is, with the same slack: a check that keeps MORE room than the
    // rule asks for, never less.
    const STRIDE = 8;
    const SLACK = 9;
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      const keepOut = roadClearance(track.width);
      const bench = Math.max(track.width / 2 + ROAD_CROSS.reach, R.verge.bench);
      const route = track.samples.filter((_, i) => i % STRIDE === 0);
      for (const spur of track.spurs) {
        let departed = false;
        for (const sample of spur.samples) {
          let nearest = Infinity;
          let shortfall = 0;
          for (const road of route) {
            const d = Math.hypot(road.x - sample.x, road.z - sample.z);
            if (d < nearest) nearest = d;
            if (sample.s <= SPUR.keep) continue;
            // Inside the junction's own window the two roads share the
            // junction's plane; the departure latch is what holds the
            // branch there.
            if (Math.abs(road.s - spur.atS) < 240) continue;
            const over = sample.elevation - road.elevation;
            if (over <= 0) continue;
            const short = bench + over / R.verge.climb - d;
            if (short > shortfall) shortfall = short;
          }
          expect(shortfall).toBeLessThan(SLACK);
          if (nearest >= keepOut) departed = true;
          else if (departed && sample.s > SPUR.keep) {
            expect(nearest).toBeGreaterThanOrEqual(keepOut - SLACK);
          }
        }
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
    const { track } = firstBranch(0.5);
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

  it("opens the dirt road into a mouth that is widest at the tarmac", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.5 });
      for (const junction of track.junctions) {
        const nx = Math.cos(junction.heading);
        const nz = -Math.sin(junction.heading);
        const half = junction.width / 2;
        // The minor arm, walked from the meeting point outward: how wide
        // the mat is, and how far its centerline still stands past the main
        // road's own mat.
        const arm = track.samples
          .filter((sample) => sample.surface === "gravel")
          .map((sample) => ({
            d: junction.joining ? junction.s - sample.s : sample.s - junction.s,
            out: Math.abs((sample.x - junction.x) * nx + (sample.z - junction.z) * nz) - half,
            width: sample.width,
          }))
          .filter((p) => p.d >= 0 && p.d <= R.junction.mouth.run * track.width && p.out >= 0)
          .sort((a, b) => a.d - b.d);
        if (arm.length < 3) continue;

        // Widest where it meets the tarmac. A mouth that peaks short of the
        // seal and closes again is a bulge in a lane, not a junction.
        expect(arm[0].width).toBe(Math.max(...arm.map((p) => p.width)));
        // ...and open by a real amount against the lane BEHIND it. Measured
        // against the arm's own far end rather than the nominal, because
        // the road out there is wandering either side of nominal anyway
        // (R33) and what this is asserting is the OPENING.
        expect(arm[0].width).toBeGreaterThan(arm[arm.length - 1].width * 1.1);

        // ...and it only ever widens on the way IN: walked outward the mat
        // never grows again, so the flare reads as one opening rather than
        // as a road that wobbles. Allowed R33's own width wander on top,
        // which is the road breathing under the mouth rather than the mouth
        // reopening.
        const wander = track.width * R.roughness.width.vary * 2;
        for (let i = 1; i < arm.length; i++) {
          expect(arm[i].width).toBeLessThanOrEqual(arm[i - 1].width + wander);
        }
        // ...and CLOSED again past the taper: a mouth is a place, not a
        // road that got wider and stayed that way. Asked beyond the taper's
        // own length, where no flare is left to explain a wide sample.
        const shut = arm.filter((p) => p.d - arm[0].d > R.junction.mouth.taper * track.width);
        for (const p of shut) {
          expect(p.width).toBeLessThanOrEqual(
            track.width * (W.narrow + W.vary + W.corner.gain) + 1e-6,
          );
        }
      }
    }
  });

  it("stops the dirt road AT the tarmac instead of running it underneath", () => {
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.5 });
      for (const junction of track.junctions) {
        // Everything on the through road's side of the meeting point is
        // sealed, and so is the arm that carries it on: a band of gravel
        // crossing a tarmac road is the surface change painted across the
        // minor road instead of along the main road's edge.
        //
        // ...up to the NEXT junction, and no further. A borrow can be as
        // short as the crossing itself: where the route joins the tarmac
        // and leaves it again at the same corner — a rally road crossing a
        // public one — two junctions sit at one arc position, and the
        // gravel past the second is inside the first one's window. What
        // this test is about is the road BETWEEN a crossing and whatever
        // ends the run, so the window stops where the run does.
        const ends = track.junctions
          .filter((other) => other !== junction)
          .map((other) => (junction.joining ? other.s - junction.s : junction.s - other.s))
          .filter((d) => d >= 0)
          .reduce((nearest, d) => Math.min(nearest, d), R.junction.reach.max);
        const through = track.samples.filter((sample) => {
          const d = junction.joining ? sample.s - junction.s : junction.s - sample.s;
          return d > track.step && d < ends;
        });
        for (const sample of through) {
          if (sample.deck !== null) continue;
          expect(sample.surface).toBe("asphalt");
        }
        const arm = track.spurs.find((spur) => spur.atS === junction.s);
        for (const sample of arm?.samples ?? []) {
          expect(sample.surface).toBe("asphalt");
        }
      }
    }
  });

  it("gives an exploring car tarmac grip on a branch", () => {
    const { track, spur } = firstBranch(0.5);
    const terrain = createTerrain(track);
    const on = spur.samples[Math.floor(spur.samples.length / 3)];
    expect(terrain.spurSurfaceAt(on.x, on.z)).toBe(on.surface);
    // Well off it, the wild is the wild again.
    const r = { x: Math.cos(on.heading), z: -Math.sin(on.heading) };
    expect(terrain.spurSurfaceAt(on.x + r.x * 40, on.z + r.z * 40)).toBeNull();
  });

  // A branch is a real road whatever it is PAVED with, and the run state is
  // where that has to show up: `state.surface` is what the grip, the drag,
  // the speed cap and the renderer's thrown dust all read. A graded branch
  // reported as `nature` gives a car on a drawn gravel road a field's
  // physics and a rooster tail of torn grass.
  /** How far out along a branch the stage road stops claiming the ground:
   * the widest junction's reach plus the road's own half-width and verge. */
  function junctionReach(track: ReturnType<typeof compileStage>): number {
    const widest = Math.max(...track.junctions.map((j) => j.reach + j.width));
    return widest + track.width / 2 + TUNING.offTrack.verge;
  }

  it("a car out on a branch drives on the surface that branch is made of", () => {
    const { seed, track, spur } = firstBranch(0.5);
    // A branch is TARMAC end to end (R17) — the sealed road the route
    // borrowed, carried on past the junction — so a car that leaves the
    // route and explores one has to find tarmac grip under it, not the
    // open country's. Sampled well out along it: the head of a branch sits
    // INSIDE its junction, which is still the stage road.
    const on = spur.samples.find((sample) => sample.s > junctionReach(track));
    expect(on, "branch carries no road clear of its junction").toBeDefined();
    const state = createGame({ seed, carId: "compact", track, skipCountdown: true });
    state.car.x = on!.x;
    state.car.z = on!.z;
    // ON the branch, not dropped onto it from the start line's height:
    // both `offRoad` and `surface` are frozen while the car is airborne.
    state.car.y = state.terrain.groundAt(on!.x, on!.z);
    state.car.heading = on!.heading;
    for (let i = 0; i < 30; i++) step(state, NEUTRAL_INPUT);
    expect(state.car.airborne).toBe(false);
    expect(state.offRoad).toBe(true);
    expect(state.surface).toBe("asphalt");
  });

  // R17 — THE BLOCK. The barrier shutting an abandoned branch is a thing
  // standing in front of a driver at speed, so where it stands is a
  // generator decision and not a drawing one. It used to be neither: the
  // renderer put it at the branch's first sample off the junction platform,
  // which on a third of a sweep of seeds was square across the road the
  // stage actually takes.
  it("stands every branch's barrier clear of the road the stage takes", () => {
    let placed = 0;
    let branches = 0;
    for (const seed of seeds) {
      const track = compileStage(seed, "medium", { asphalt: 0.4 });
      const half = track.width / 2;
      for (const spur of track.spurs) {
        branches += 1;
        const block = spur.block;
        if (!block) continue;
        placed += 1;
        expect(block.width).toBeCloseTo(spur.width, 6);
        expect(block.s).toBeGreaterThanOrEqual(SPUR.block.from);
        expect(block.s).toBeLessThanOrEqual(SPUR.block.to);
        // Every point along the LINE, not its midpoint: the end nearer the
        // route is the one a driver hits.
        const rx = Math.cos(block.heading);
        const rz = -Math.sin(block.heading);
        for (const k of [-1, -0.5, 0, 0.5, 1]) {
          const x = block.x + rx * k * (block.width / 2);
          const z = block.z + rz * k * (block.width / 2);
          let nearest = Infinity;
          for (const sample of track.samples) {
            const d = Math.hypot(sample.x - x, sample.z - z);
            if (d < nearest) nearest = d;
          }
          expect(nearest, `${block.kind} barrier at s=${block.s} on seed ${seed}`).toBeGreaterThan(
            half + SPUR.block.least - 0.01,
          );
        }
      }
    }
    // A sweep where nothing is placed proves nothing about placement. The
    // bar is the branches the sweep actually built, not the seeds it
    // walked: R17 gives a stage a branch only where its country carries a
    // public road for the route to leave, so some seeds have none.
    expect(branches).toBeGreaterThan(0);
    expect(placed).toBeGreaterThan(branches / 2);
  });

  it("builds the same barrier, of the same kind, every time it compiles a seed", () => {
    for (const seed of seeds) {
      const a = compileStage(seed, "medium", { asphalt: 0.4 });
      const b = compileStage(seed, "medium", { asphalt: 0.4 });
      expect(a.spurs.map((s) => s.block)).toEqual(b.spurs.map((s) => s.block));
    }
  });
});

// The ground the physics rides and the ground the renderer draws are one
// surface or they are nothing: every disagreement between them is a car
// hovering over its own verge, or sunk into it. Both are read from the same
// corridor profile above, so these assert that neither reader has lost the
// SIGN of where it is standing — the corridor is not symmetric, and a bank
// is the asymmetry that gives it away.
describe("one ground under the car and the picture of it", () => {
  /** The most banked piece of open road on a stage, and which way it tilts.
   * The index comes back with it: `locate` searches a window around a hint,
   * so a sample deep in the stage is invisible to a hint of 0. */
  function bankedSample(track: ReturnType<typeof compileStage>) {
    let at = 0;
    track.samples.forEach((s, i) => {
      if (s.deck != null || (s.flat ?? 0) > 0) return;
      if (Math.abs(s.bank ?? 0) > Math.abs(track.samples[at].bank ?? 0)) at = i;
    });
    return { sample: track.samples[at], index: at };
  }

  it("banks the ground beside a corner the way it banks the road", () => {
    const track = compileStage(3, "medium");
    const terrain = createTerrain(track);
    const { sample: s } = bankedSample(track);
    expect(Math.abs(s.bank ?? 0)).toBeGreaterThan(0.02);
    // A point the same distance out on each side of the road. The bank
    // raises one and lowers the other, by `bank * lateral` apiece — read
    // them as an unsigned DISTANCE and both verges tilt the same way, which
    // puts one of them a metre from where the road mesh drew it.
    const out = track.width / 2 + 2;
    const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    const at = (side: number): number =>
      terrain.groundAt(s.x + right.x * out * side, s.z + right.z * out * side);
    const tilt = at(-1) - at(1);
    // Positive bank raises the LEFT edge (road.ts), so the left verge is the
    // high one, and the gap between them is the cross-fall across 2*out.
    expect(Math.sign(tilt)).toBe(Math.sign(s.bank ?? 0));
    expect(Math.abs(tilt)).toBeGreaterThan(Math.abs((s.bank ?? 0) * out));
  });

  it("hands the car the drawn ribbon on both sides of a banked corner", () => {
    const track = compileStage(3, "medium");
    const terrain = createTerrain(track);
    const { sample: s } = bankedSample(track);
    const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    for (const lateral of [-track.width / 2 - 2, track.width / 2 + 2]) {
      const drawn = s.elevation + corridorOffset(s, lateral, track.width);
      const ridden = terrain.groundAt(s.x + right.x * lateral, s.z + right.z * lateral);
      expect(Math.abs(ridden - drawn)).toBeLessThan(0.4);
    }
  });

  it("carries the road's own ground out to the verge, with no step off the mat", () => {
    const track = compileStage(3, "medium");
    const terrain = createTerrain(track);
    const { sample: s, index } = bankedSample(track);
    const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    const half = track.width / 2;
    // Either side of the line where the car stops counting as on the road:
    // the fix answers on one side, the terrain on the other, and a car
    // crossing it must not drop through the ground it was just standing on.
    for (const side of [1, -1]) {
      const inside = side * (half + TUNING.offTrack.verge - 0.1);
      const outside = side * (half + TUNING.offTrack.verge + 0.1);
      const on = locate(track, s.x + right.x * inside, s.z + right.z * inside, index);
      expect(on.offRoad).toBe(false);
      const off = terrain.groundAt(s.x + right.x * outside, s.z + right.z * outside);
      expect(Math.abs(on.elevation - off)).toBeLessThan(0.25);
    }
  });
});

// `locate` searches a window of sixty-odd samples around its hint, twice on
// every one of a run's 120 steps a second, and skips whole groups of eight
// of them whenever a bounding circle proves none can be nearer than what it
// already has. That is an optimization with a proof behind it, and a proof
// is worth exactly as much as the test that checks it: everything the run
// stands on — which sample the car is at, how far off line, whether that is
// off the road at all — comes out of that search.
describe("locating the car against the centerline", () => {
  /** The window `locate` searches, walked without any of the skipping. */
  function brute(track: ReturnType<typeof compileStage>, x: number, z: number, hint: number) {
    const lo = Math.max(0, hint - 15);
    const hi = Math.min(track.samples.length - 1, hint + 45);
    let best = lo;
    let bestD2 = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = x - track.samples[i].x;
      const dz = z - track.samples[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  it("finds the same sample the unskipped search would, everywhere", () => {
    let checked = 0;
    for (const seed of [1, 4, 17, 42]) {
      for (const shape of ["sprint", "circuit"] as const) {
        const track = compileStage(seed, "medium", {}, shape);
        const n = track.samples.length;
        // Probes on the road, out on the verge, far into the country, and
        // behind the car — a hint is only a hint, and the window reaches
        // thirty meters back and ninety forward for the steps where the two
        // have come apart.
        for (let i = 0; i < n; i += 7) {
          const s = track.samples[i];
          const rx = Math.cos(s.heading);
          const rz = -Math.sin(s.heading);
          for (const [out, ahead] of [
            [0, 0],
            [track.width / 2 - 0.2, 0],
            [-track.width, 6],
            [40, -12],
            [-120, 30],
          ]) {
            const x = s.x + rx * out;
            const z = s.z + rz * out;
            const hint = Math.max(0, Math.min(n - 1, i + ahead));
            expect(locate(track, x, z, hint).index).toBe(brute(track, x, z, hint));
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});
