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
        // ...and it is a real road while it lasts: sealed, then degrading
        // to gravel as it leaves the world.
        expect(spur.samples[0].surface).toBe("asphalt");
        expect(end.surface).toBe("gravel");
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
    const track = compileStage(3, "medium", { asphalt: 0.5 });
    const spur = track.spurs[0];
    // A branch is sealed for its first stretch and graded past that, so one
    // of them carries both surfaces — and both must reach `state.surface`.
    // Sampled well out along it: the head of a branch sits INSIDE its
    // junction, which is still the stage road.
    for (const surface of ["asphalt", "gravel"] as const) {
      const on = spur.samples.find(
        (sample) => sample.surface === surface && sample.s > junctionReach(track),
      );
      expect(on, `branch carries no ${surface} clear of its junction`).toBeDefined();
      const state = createGame({ seed: 3, carId: "compact", track, skipCountdown: true });
      state.car.x = on!.x;
      state.car.z = on!.z;
      // ON the branch, not dropped onto it from the start line's height:
      // both `offRoad` and `surface` are frozen while the car is airborne.
      state.car.y = state.terrain.groundAt(on!.x, on!.z);
      state.car.heading = on!.heading;
      for (let i = 0; i < 30; i++) step(state, NEUTRAL_INPUT);
      expect(state.car.airborne).toBe(false);
      expect(state.offRoad).toBe(true);
      expect(state.surface).toBe(surface);
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
