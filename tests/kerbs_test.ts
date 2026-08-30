// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — where the marking goes, what it becomes, and what one piece of it
// COSTS. The placement rule exists to stop a stage being edged in stripes
// from end to end, so the assertions that matter are as much about where
// kerbing is ABSENT as about where it is: that a sweeper gets nothing, that
// an apex is marked on the inside and an exit on the outside, and that most
// of a stage's road carries no marking at all.
//
// Then the objects a zone becomes, and the one of them that is SOLID. An
// anti-cut block is the only piece of scenery in the game the car is
// allowed to hit without anything breaking, and both halves of that are
// worth holding: cutting an apex over one has to cost real speed, and it
// must never fold a panel — a corner that ends a run for a tidy line is a
// corner nobody takes twice.
import { describe, expect, it } from "vitest";

import {
  KERB_MARKER,
  STAGE_RULES as R,
  TUNING,
  buildKerbs,
  clipKerbs,
  compileStage,
  createGame,
  createKerbField,
  markersBetween,
  type GameEvent,
  type GameState,
  type KerbMarker,
  type KerbZone,
} from "@engine";

const SEEDS = [1, 7, 19, 38, 91, 4711];

function zonesFor(seed: number): { zones: KerbZone[]; track: ReturnType<typeof compileStage> } {
  const track = compileStage(seed, "medium");
  return { zones: buildKerbs(track), track };
}

describe("R26 — kerb placement", () => {
  it("marks the corners that earn it and leaves the sweepers bare", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const marked = new Set(zones.filter((z) => z.role === "apex").map((z) => z.side));
      expect(marked.size).toBeGreaterThan(0);
      // Every apex zone belongs to a note over the threshold, and every
      // note over it has one — the rule is a rule, not a tendency.
      const worthy = track.pacenotes.filter((n) => n.angle >= R.kerb.minAngle);
      const apexes = zones.filter((z) => z.role === "apex");
      expect(apexes).toHaveLength(worthy.length);
      // ...and the soft ones are left alone.
      const soft = track.pacenotes.filter((n) => n.angle < R.kerb.minAngle);
      expect(soft.length).toBeGreaterThan(0);
      for (const note of soft) {
        const mid = (note.s + note.endS) / 2;
        const covering = apexes.filter((z) => z.fromS <= mid && z.toS >= mid);
        expect(covering).toHaveLength(0);
      }
    }
  });

  it("puts the apex INSIDE the bend and the exit OUTSIDE it", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      for (const note of track.pacenotes) {
        if (note.angle < R.kerb.minAngle) continue;
        const mid = (note.s + note.endS) / 2;
        const apex = zones.find((z) => z.role === "apex" && z.fromS <= mid && z.toS >= mid);
        expect(apex?.side).toBe(note.dir);
        // The exit ENDS where the corner stops bending, on the far side —
        // it marks the unwind, not the straight past it.
        const exit = zones.find(
          (z) => z.role === "exit" && Math.abs(z.toS - note.endS) < 1e-6 && z.side === -note.dir,
        );
        expect(exit).toBeDefined();
      }
    }
  });

  it("only puts a turn-in board on a corner that needs braking", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const entries = zones.filter((z) => z.role === "entry");
      const hard = track.pacenotes.filter((n) => n.angle >= R.kerb.entryAngle);
      expect(entries).toHaveLength(hard.length);
      for (const entry of entries) {
        // It stands at the corner's own turn-in, on its outside.
        const note = hard.find((n) => Math.abs(n.s - entry.fromS) < 1e-6);
        expect(note).toBeDefined();
        expect(entry.toS).toBeLessThanOrEqual((note as (typeof hard)[number]).endS + 1e-6);
      }
    }
  });

  it("marks corners and NOTHING ELSE — no post stands on a straight", () => {
    // The rule the whole module exists for, stated where it can be broken:
    // a run of markers down an empty straight is the end-to-end stripe with
    // gaps in it, and it tells a driver a corner is coming where there is
    // none. Only a hazard — a bridge, a jump lip — reaches past a bend,
    // because what it is wrapped around is not one.
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const corners = track.pacenotes.filter((n) => n.angle >= R.kerb.minAngle);
      for (const zone of zones) {
        if (zone.role === "hazard") continue;
        const inside = corners.some((n) => zone.fromS >= n.s - 1e-6 && zone.toS <= n.endS + 1e-6);
        expect(inside).toBe(true);
      }
      // ...and the markers that come out of them stand on corner road too.
      const field = createKerbField(track);
      for (const marker of field.markers) {
        const onCorner = corners.some((n) => marker.s >= n.s && marker.s <= n.endS);
        const onHazard = zones.some(
          (z) => z.role === "hazard" && marker.s >= z.fromS && marker.s <= z.toS,
        );
        expect(onCorner || onHazard).toBe(true);
      }
    }
  });

  it("leaves most of the stage unmarked", () => {
    // The number this rule exists for. Before it, every meter of gravel on
    // every stage wore a red-and-white band down both edges.
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      for (const side of [-1, 1] as const) {
        const covered = zones
          .filter((z) => z.side === side)
          .reduce((sum, z) => sum + (z.toS - z.fromS), 0);
        expect(covered / track.length).toBeLessThan(0.5);
      }
    }
  });

  it("wraps a hazard on both sides, and only a real one", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const hazards = zones.filter((z) => z.role === "hazard");
      // Hazards come in pairs — a hazard is marked all the way round.
      expect(hazards.filter((z) => z.side === -1)).toHaveLength(
        hazards.filter((z) => z.side === 1).length,
      );
      for (const zone of hazards) {
        const inside = track.samples.filter((s) => s.s >= zone.fromS && s.s <= zone.toS);
        expect(inside.some((s) => s.jump || s.deck != null)).toBe(true);
      }
    }
  });

  it("answers a span with the zones that reach into it", () => {
    // The renderer builds one chunk at a time, so a zone straddling a chunk
    // boundary has to come back from both — otherwise a corner's kerbing
    // stops dead at an invisible seam.
    const track = compileStage(19, "medium");
    const whole = buildKerbs(track);
    const mid = track.length / 2;
    const near = buildKerbs(track, mid - 200, mid + 200);
    for (const zone of whole) {
      if (zone.toS < mid - 100 || zone.fromS > mid + 100) continue;
      expect(
        near.some(
          (z) => z.role === zone.role && z.side === zone.side && Math.abs(z.fromS - zone.fromS) < 1,
        ),
      ).toBe(true);
    }
  });
});

describe("R26 — the objects a zone becomes", () => {
  it("posts the marked edges and blocks only the apexes", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      const field = createKerbField(track);
      const kinds = new Set(field.markers.map((m) => m.kind));
      expect(kinds.has("post")).toBe(true);
      expect(kinds.has("block")).toBe(true);
      const zones = buildKerbs(track);
      for (const marker of field.markers) {
        const covering = zones.filter(
          (z) => z.side === marker.side && z.fromS <= marker.s && z.toS >= marker.s,
        );
        expect(covering.length, "a marker outside every zone").toBeGreaterThan(0);
        // A block is the apex answer and nothing else's: it is laid where
        // cutting is the temptation, and a braking marker made of concrete
        // on the outside of a corner would be a wall.
        if (marker.kind === "block") expect(covering[0].role).toBe("apex");
      }
    }
  });

  it("stands every marker clear of the road the car is meant to use", () => {
    // The blocks sit closest, and they have to: a block the car cannot
    // reach without leaving the road entirely marks nothing. What must not
    // happen is one standing ON the racing line.
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      const half = track.width / 2;
      for (const marker of createKerbField(track).markers) {
        const shape = KERB_MARKER[marker.kind];
        const inner = ("depth" in shape ? shape.out - shape.width / 2 : shape.out) + half;
        expect(inner, `${marker.kind} reaching onto the road`).toBeGreaterThan(half - 0.4);
      }
    }
  });

  it("hands every marker to exactly one chunk of road", () => {
    // The renderer draws the field a chunk at a time, off `markersBetween`.
    // Both ways of getting this wrong are invisible in a diff and obvious
    // on screen: a closed window at both ends draws the marker on a shared
    // sample twice (z-fighting, and a post that falls beside itself), and a
    // window that never opens draws no marking at all.
    const track = compileStage(42, "medium");
    const field = createKerbField(track);
    const seen = new Map<KerbMarker, number>();
    for (let from = 0; from < track.samples.length; from += 240) {
      const to = Math.min(from + 240, track.samples.length);
      const window = markersBetween(
        field,
        track.samples[from].s,
        to < track.samples.length ? track.samples[to].s : Infinity,
      );
      for (const marker of window) seen.set(marker, (seen.get(marker) ?? 0) + 1);
    }
    expect(seen.size, "markers the chunks never drew").toBe(field.markers.length);
    for (const [, times] of seen) expect(times).toBe(1);
  });

  it("finds a block by where it stands", () => {
    const track = compileStage(19, "medium");
    const field = createKerbField(track);
    const block = field.markers.find((m) => m.kind === "block") as KerbMarker;
    expect(field.blocksNear(block.x, block.z, 1)).toContain(block);
    expect(field.blocksNear(block.x + 500, block.z + 500, 1)).toHaveLength(0);
    // A post is never offered to the contact model: it stops nothing, and a
    // physics that had to consider one would be paying for scenery.
    for (const found of field.blocksNear(block.x, block.z, 40)) {
      expect(found.kind).toBe("block");
    }
  });
});

describe("R26 — riding over an anti-cut block", () => {
  /** A run parked beside the first block on the stage, sliding INTO it at
   * `speed` m/s — the geometry of a cut apex, without having to drive one.
   * The car is placed off the block along the line the contact will use, so
   * what is measured is the block and not the approach. */
  function ontoABlock(speed: number): { state: GameState; block: KerbMarker } {
    const state = createGame({ seed: 19, length: "medium", skipCountdown: true });
    const block = state.kerbs.markers.find((m) => m.kind === "block") as KerbMarker;
    const car = state.car;
    // Pointed along the road, with the block just off the right flank and
    // the car sliding onto it.
    car.heading = block.spin;
    car.x = block.x - Math.cos(block.spin) * (TUNING.collision.halfWidth + 0.4);
    car.z = block.z + Math.sin(block.spin) * (TUNING.collision.halfWidth + 0.4);
    car.y = block.y;
    car.u = 24;
    car.w = speed;
    return { state, block };
  }

  function bite(state: GameState, block: KerbMarker): GameEvent[] {
    const events: GameEvent[] = [];
    clipKerbs(state.spec, state.car, state.t, [block], events);
    return events;
  }

  it("costs speed and upsets the car without folding a panel", () => {
    const { state, block } = ontoABlock(6);
    const car = state.car;
    const before = Math.hypot(car.u, car.w);
    const events = bite(state, block);

    expect(events.map((e) => e.type)).toEqual(["kerbHit"]);
    // It cost real speed...
    expect(Math.hypot(car.u, car.w)).toBeLessThan(before * 0.98);
    // ...it threw the body about, which is what the player feels...
    expect(Math.abs(car.rollRate)).toBeGreaterThan(0.05);
    expect(car.rideRate).toBeLessThan(0);
    // ...and it shoved the car back OUT of the inside of the corner, which
    // is the entire job of the thing.
    expect(car.w).toBeLessThan(6);
    // ...and nothing on the car broke. A block is not a crash.
    expect(car.damage.wear).toBe(0);
    expect(car.damage.zones.some((z) => z > 0)).toBe(false);
    expect(car.damage.broken).toHaveLength(0);
    expect(state.stats.impacts).toBe(0);
  });

  it("bites once per block rather than once per step", () => {
    // A block is 0.6 m of road and the car is inside one for several steps
    // at any speed. Charged every step it would cost a whole apex.
    const { state, block } = ontoABlock(6);
    expect(bite(state, block)).toHaveLength(1);
    expect(bite(state, block)).toHaveLength(0);
    state.t += TUNING.collision.kerb.again + 0.01;
    expect(bite(state, block)).toHaveLength(1);
  });

  it("stays out of the way of a car that is merely driving past one", () => {
    // Running down the row parallel to the road brushes a block at no
    // closing speed at all, and that is not a hit: a stage whose apexes
    // thump every time you take them properly is a stage with no apexes.
    const { state, block } = ontoABlock(0);
    expect(bite(state, block)).toHaveLength(0);
  });

  it("never puts the car in the air, however hard it is taken", () => {
    // A kerb that can launch a car is a ramp, and an apex lined with ramps
    // is a corner nobody may go near.
    const { state, block } = ontoABlock(30);
    bite(state, block);
    expect(state.car.airborne).toBe(false);
    expect(Math.abs(state.car.rollRate)).toBeLessThan(TUNING.collision.solids.tripLaunch);
  });

  it("is out of reach on the road and unavoidable off the inside of it", () => {
    // The two halves of the whole rule, walked over every sample of a real
    // stage: a car using the road it was given never touches a block, and a
    // car putting two wheels over the inside edge always does.
    const state = createGame({ seed: 19, length: "medium", skipCountdown: true });
    const car = state.car;
    const half = state.track.width / 2;
    /** Drive the whole stage at `lateral` metres off the centreline, and
     * count what the kerbing had to say about it. */
    const along = (lateral: number): number => {
      let hits = 0;
      for (const sample of state.track.samples) {
        const right = { x: Math.cos(sample.heading), z: -Math.sin(sample.heading) };
        car.heading = sample.heading;
        car.y = sample.elevation;
        car.u = 26;
        for (const side of [-1, 1] as const) {
          car.x = sample.x + right.x * lateral * side;
          car.z = sample.z + right.z * lateral * side;
          // A slice of sideways speed, so a block in reach is a block that
          // actually closes rather than one the car is running parallel to.
          car.w = side * 5;
          car.kerbFrom = 0;
          const events: GameEvent[] = [];
          clipKerbs(state.spec, car, state.t, state.kerbs.blocksNear(car.x, car.z, 2.5), events);
          hits += events.length;
        }
      }
      return hits;
    };
    expect(along(0), "a car on the centreline is thumping kerbs").toBe(0);
    // Two wheels over the inside edge — which is exactly the line the
    // blocks are laid to answer.
    expect(along(half - 0.9), "an apex cut over the blocks is free").toBeGreaterThan(0);
  });
});
