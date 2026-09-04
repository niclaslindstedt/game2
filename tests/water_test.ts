// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WATER, and the rules of nature it obeys (R18) — plus the crossings
// the road makes over it (R13). The point of these is that water in a
// generated world is the thing players read as "real" or "fake" fastest: a
// river that runs uphill, or three parallel rivers where a valley would
// hold one, gives the whole landscape away.
import { describe, expect, it } from "vitest";

import {
  LAKE_Y,
  NEUTRAL_INPUT,
  PARAPET_BAY,
  PARAPET_GAP,
  PARAPET_OUT,
  PARAPET_THICK,
  SOLID_PROP_HEIGHT,
  STAGE_RULES as R,
  TUNING,
  collectAnchors,
  compileStage,
  createLandField,
  createGame,
  createTerrain,
  resolveKnobs,
  step,
  traceRivers,
  type GameEvent,
  type StandingWater,
} from "@engine";

import { stageTerrain, stageTrack } from "./support/stages.ts";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

describe("crossings (R13)", () => {
  it("wades the narrow ones and decks the wide ones", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.8 });
      for (const s of track.samples) {
        if (s.deck !== null) {
          // A deck is ROAD, not water: the wheels stay dry and the surface
          // keeps its grip.
          expect(s.surface).not.toBe("water");
        }
      }
      // A deck holds the road LEVEL across the gap — that is what makes it
      // a bridge instead of a dip with a river in it.
      let i = 0;
      while (i < track.samples.length) {
        if (track.samples[i].deck === null) {
          i++;
          continue;
        }
        let j = i;
        while (j < track.samples.length && track.samples[j].deck !== null) j++;
        const heights = track.samples.slice(i, j).map((s) => s.elevation);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
        i = j;
      }
    }
  });

  it("runs the water far enough under a deck to drown a car that goes over the side", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.9 });
      const anchors = collectAnchors(track, 0);
      for (const anchor of anchors.filter((a) => a.bridged)) {
        const deck = track.samples.find((s) => Math.abs(s.s - anchor.s) < 2);
        expect(deck).toBeDefined();
        const clearance = (deck?.elevation ?? 0) - anchor.waterY;
        expect(clearance).toBeGreaterThanOrEqual(R.bridge.clearance.timber - 0.01);
        expect(anchor.depth).toBeGreaterThan(0.9); // TUNING.crash.deepWater
      }
    }
  });

  it("R13 — walls a concrete deck with a parapet, unbroken and SOLID", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.8 });
      const terrain = stageTerrain(track);
      const lat = track.width / 2 + PARAPET_OUT;
      for (const s of track.samples) {
        if (s.deck !== "concrete") continue;
        const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
        for (const side of [-1, 1]) {
          const x = s.x + right.x * lat * side;
          const z = s.z + right.z * lat * side;
          // A bay stands within one bay's length of every point down both
          // edges — no gap a nose could find, because behind this one is
          // the river.
          const bays = terrain.fixturesNear(x, z, PARAPET_BAY / 2);
          expect(bays.length).toBeGreaterThan(0);
          // And it is a wall, not scenery: bedded into the deck it is cast
          // onto, nothing a car carries breaks it, and it stands well over
          // the bar that separates a solid from litter.
          expect(bays[0].rooted).toBe(1);
          expect(bays[0].snap).toBe(Infinity);
          expect(bays[0].height).toBeGreaterThan(SOLID_PROP_HEIGHT);
        }
      }
      // ...and nothing stands along a road that is not a deck.
      const open = track.samples.find((s) => s.deck === null);
      if (open) expect(terrain.fixturesNear(open.x, open.z, 10)).toHaveLength(0);
    }
  });

  it("R13 — a car sliding wide on a bridge stops AT the wall, not through it", () => {
    // The one wall on a stage that is there on purpose. Everywhere else R31
    // cuts the ground back to something the car can climb; here it must not
    // be climbable, because over the side is a drowning. And it is checked
    // on the deck rather than off the road: by the time a car this far
    // sideways counts as off-road it would already be in the river.
    // WHICH seed puts a concrete deck on a medium stage moves whenever the
    // routing does, so the scenario finds one rather than naming one — the
    // test is about the parapet, not about seed 5.
    let seed = 0;
    let track = compileStage(5, "medium", { water: 0.9 });
    let deck = -1;
    for (const candidate of [5, ...SEEDS, 9, 11, 19, 23, 30, 37, 41, 47, 53]) {
      track = compileStage(candidate, "medium", { water: 0.9 });
      deck = track.samples.findIndex((sample) => sample.deck === "concrete");
      if (deck > 0 && deck + 6 < track.samples.length) {
        seed = candidate;
        break;
      }
    }
    expect(deck, "no seed put a concrete deck on a medium stage").toBeGreaterThan(0);
    const s = track.samples[deck + 6];
    const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    const state = createGame({ seed, skipCountdown: true, track });
    // Halfway to the edge, thrown at the parapet at 25 m/s of pure slide.
    state.car.x = s.x + right.x * 5;
    state.car.z = s.z + right.z * 5;
    state.car.y = s.elevation;
    state.car.heading = s.heading;
    state.car.u = 2;
    state.car.w = 25;
    const events: GameEvent[] = [];
    let flank = -Infinity;
    for (let i = 0; i < TUNING.physicsHz; i++) {
      events.push(...step(state, NEUTRAL_INPUT));
      const out = (state.car.x - s.x) * right.x + (state.car.z - s.z) * right.z;
      flank = Math.max(flank, out + TUNING.collision.halfWidth);
    }
    // Never past the MIDDLE of the concrete. The overlap either side of the
    // inner face is the contact model resolving its impulse, and this
    // scenario spends more of it than most: 25 m/s of PURE slide is
    // eighty-five degrees off the nose, which is a car well past
    // `drift.spinAt` — its tires have let go completely, so it carries more
    // of its momentum into the wall before the parapet takes it.
    //
    // Measured against the WALL rather than against a round number, because
    // which bridge on which seed this scenario finds moves whenever the
    // routing does, and how deep the overlap runs moves with the approach:
    // it was 0.00 m on seed 5's deck and is 0.066 m on seed 8's. Half the
    // wall's own thickness is bodywork buried in concrete with 0.25 m of it
    // still to go — a car the wall stopped, which is what this asserts. The
    // assertions below are what say it stopped there rather than in the
    // river.
    expect(flank).toBeLessThanOrEqual(track.width / 2 + PARAPET_GAP + PARAPET_THICK / 2);
    // ...and it cost something: this is a wall, not a kerb.
    expect(state.stats.impacts).toBeGreaterThan(0);
    expect(state.car.damage.wear).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "impact")).toBe(true);
    // Still on the bridge rather than in the water under it.
    expect(state.stats.crashes).toBe(0);
  });
});

/** R35 — what a course can sense of the water already standing on the
 * country, as the terrain field reports it. The tracer takes this rather
 * than one sea level, because a river ends in whatever body it reaches. */
function sensed(terrain: ReturnType<typeof createTerrain>): StandingWater {
  return { levelAt: terrain.water.shoreLevelAt, nearestAt: terrain.water.nearestAt };
}

describe("the river (R18)", () => {
  it("never runs uphill", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.8 });
      const terrain = stageTerrain(track);
      const rivers = traceRivers(
        track.seed,
        collectAnchors(track, 0),
        terrain.heightAt,
        sensed(terrain),
      );
      for (const river of rivers) {
        for (let i = 1; i < river.points.length; i++) {
          expect(river.points[i].y).toBeLessThanOrEqual(river.points[i - 1].y + 1e-9);
        }
      }
    }
  });

  it("gathers as it goes: a river is wider at its mouth than at its spring", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.8 });
      const terrain = stageTerrain(track);
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, 0),
        terrain.heightAt,
        sensed(terrain),
      )) {
        const spring = river.points[0];
        const mouth = river.points[river.points.length - 1];
        expect(mouth.halfWidth).toBeGreaterThan(spring.halfWidth);
      }
    }
  });

  it("crosses the road at the level the road was built for", () => {
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "medium", { water: 0.8 });
      const terrain = stageTerrain(track);
      terrain.sync(0);
      // The anchors as the field traced them — a deck's water lies in its
      // valley, which the field read and a bare `collectAnchors` did not.
      // A culvert's water is under the road on purpose (R12), and the
      // culvert test asks about it beside the road instead.
      for (const anchor of terrain.rivers.flatMap((r) => r.anchors)) {
        if (anchor.culvert) continue;
        const water = terrain.waterAt(anchor.x, anchor.z);
        expect(water).not.toBeNull();
        // ...unless the crossing stands in country already under the water
        // table, where the lake IS the water the road crosses.
        const level = water ?? 0;
        expect(Math.abs(level - anchor.waterY) < 1.2 || level === LAKE_Y).toBe(true);
      }
    }
  });

  it("keeps a ford's channel visible beyond both road edges", () => {
    // Its own seeds, not the file's. On seeds 3, 5 and 8 a SECOND
    // watercourse runs within centimetres of the ford at its own, lower
    // level — 2.4 m under it on seed 5 — and `waterAt` answers with the
    // nearest water, which is that one and which is below the ground here.
    // The channel then reads as dry outside the road edges.
    //
    // That is R18's defect and not this check's: one valley carries one
    // course, and two of them sharing ground at different heights is what
    // `water.float` counts (23 of them on the 24-seed sweep). Asserting the
    // ford property on top of it would be asserting two rules at once and
    // reporting the wrong one.
    for (const seed of [1, 2, 21, 34, 4, 6, 7, 9]) {
      const track = stageTrack(seed, "long", { water: 0.8 });
      const terrain = stageTerrain(track);
      for (const anchor of collectAnchors(track, 0).filter((a) => !a.bridged && !a.culvert)) {
        const sample = track.samples.find((s) => Math.abs(s.s - anchor.s) < 2);
        expect(sample).toBeDefined();
        if (!sample) continue;
        const right = { x: Math.cos(sample.heading), z: -Math.sin(sample.heading) };
        const offset = track.width / 2 + R.water.fordOutside / 2;
        for (const side of [-1, 1]) {
          expect(
            terrain.waterAt(anchor.x + right.x * offset * side, anchor.z + right.z * offset * side),
          ).not.toBeNull();
        }
      }
    }
  });

  it("meets each crossing ONCE: the road's water is one course, not a fan of them", () => {
    // Every crossing belongs to exactly one traced watercourse, and a
    // stage's crossings collapse into far fewer courses than crossings —
    // which is the difference between a river a road meets three times and
    // three rivers that happen to be parallel.
    let crossings = 0;
    let courses = 0;
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.9 });
      const terrain = stageTerrain(track);
      const anchors = collectAnchors(track, 0);
      const rivers = traceRivers(track.seed, anchors, terrain.heightAt, sensed(terrain));
      const claimed = rivers.flatMap((r) => r.anchors);
      expect(claimed.length).toBe(anchors.length);
      crossings += anchors.length;
      courses += rivers.length;
    }
    expect(crossings).toBeGreaterThan(courses);
  });

  it("crosses a road where the road crosses it, and nowhere else", () => {
    // A watercourse routed under the corridor between two crossings carves
    // the ground out from under the ribbon and draws a sheet of water
    // through it — the road standing on a bank of nothing, which is what
    // "the water is below the road" looks like from the driver's seat.
    let flooded = 0;
    let dry = 0;
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.9 });
      const terrain = stageTerrain(track);
      const anchors = collectAnchors(track, 0);
      for (const s of track.samples) {
        // The crossings themselves are water at the road ON PURPOSE, and
        // so is the last of the road that eases down into a ford.
        if (s.surface === "water" || s.deck !== null) continue;
        const toCrossing = Math.min(
          ...anchors.map((a) => Math.hypot(a.x - s.x, a.z - s.z)),
          Infinity,
        );
        // The crossing's OWN water reaches a good deal further than the
        // crossing point, and the exemption has to cover all of it or the
        // ford's own sheet reads as a course running at the road. The
        // tracer lets a course run at the road for its `CROSS_WINDOW`
        // (40 m of travel) either side of an anchor; the sheet it draws is
        // up to `MAX_WIDTH` (20 m) of half-width; and where the course ends
        // in a POOL that widens again by `POOL_SPREAD`. Those three added
        // are what a crossing's water can legitimately occupy.
        if (toCrossing <= 40 + 20 * 2.6) continue;
        if (terrain.waterAt(s.x, s.z) !== null) flooded += 1;
        else dry += 1;
      }
    }
    expect(dry).toBeGreaterThan(1000);
    expect(flooded).toBe(0);
  });

  it("carries a stream under a road that stands over it, in a culvert (R12)", () => {
    // Where the road's line is too far over the valley to dip to the water
    // the crossing is a CULVERT: the road stays on its fill, the water is
    // the same water at the same level on both sides of it, and there is
    // none on the road. The sweep is searched for stages that carry one —
    // which seeds do depends on every rule upstream, so none is pinned.
    let culverts = 0;
    for (const seed of [...SEEDS, 4, 6, 7, 9]) {
      const track = stageTrack(seed, "long", { water: 0.9 });
      if (track.culverts.length === 0) continue;
      const terrain = stageTerrain(track);
      terrain.sync(0);
      const anchors = collectAnchors(track, 0, terrain.geology.surfaceAt);
      for (const culvert of track.culverts) {
        culverts++;
        const sample = track.samples.find((s) => Math.abs(s.s - culvert.s) < 2);
        expect(sample).toBeDefined();
        if (!sample) continue;
        // Ordinary road over it, standing the pipe's cover over the water,
        // and dry.
        expect(sample.surface).not.toBe("water");
        expect(sample.deck).toBeNull();
        expect(sample.elevation - culvert.waterY).toBeGreaterThanOrEqual(
          R.water.culvert.cover - 0.01,
        );
        expect(terrain.waterAt(culvert.x, culvert.z)).toBeNull();
        // The river is anchored to it...
        expect(anchors.some((a) => a.culvert && Math.abs(a.s - culvert.s) < 1)).toBe(true);
        expect(
          terrain.rivers.some((r) => r.anchors.some((a) => Math.abs(a.s - culvert.s) < 1)),
        ).toBe(true);
        // ...and the course stands at ONE level either side of the road:
        // the pool the crossing is, held through the pipe. Read off the
        // traced course rather than `waterAt`, which answers off the ground
        // lattice and cannot see a channel narrower than a cell.
        const river = terrain.rivers.find((r) =>
          r.anchors.some((a) => Math.abs(a.s - culvert.s) < 1),
        );
        expect(river).toBeDefined();
        if (!river) continue;
        const right = { x: Math.cos(culvert.heading), z: -Math.sin(culvert.heading) };
        for (const side of [-1, 1]) {
          // The nearest point of the course past the mat on this side: the
          // water as it comes out of the pipe.
          let nearest: { y: number } | null = null;
          let best = Infinity;
          for (const p of river.points) {
            const lateral = (p.x - culvert.x) * right.x + (p.z - culvert.z) * right.z;
            const d = Math.hypot(p.x - culvert.x, p.z - culvert.z);
            if (lateral * side > 8 && d < best) {
              best = d;
              nearest = p;
            }
          }
          expect(nearest).not.toBeNull();
          expect(best).toBeLessThan(30);
          expect(Math.abs((nearest?.y ?? 0) - culvert.waterY)).toBeLessThan(0.05);
        }
      }
    }
    expect(culverts).toBeGreaterThan(0);
  }, 120_000);

  it("keeps the water under the ground the car rides, never over it", () => {
    // The physics and the renderer both ask the field what is water. A
    // channel too narrow for the ground lattice to hold runs UNDER a
    // hillside the tiles never dip into: answering "water" up there drowns
    // a car driving over a mountain, and draws a slab of water on it.
    for (const seed of SEEDS) {
      const track = stageTrack(seed, "long", { water: 0.9 });
      const terrain = stageTerrain(track);
      const b = track.bounds;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = b.minX + ((b.maxX - b.minX) * i) / 39;
          const z = b.minZ + ((b.maxZ - b.minZ) * j) / 39;
          const water = terrain.waterAt(x, z);
          if (water === null) continue;
          // Out in the country, where the ground the car rides IS the
          // ground: over a road the surface under the wheels is the
          // ribbon, and a bridge deck stands metres over the river it
          // spans on purpose (R13).
          if (terrain.roadDistanceAt(x, z) < track.width / 2 + 12) continue;
          expect(terrain.groundAt(x, z)).toBeLessThan(water + 0.25);
        }
      }
    }
  });

  it("answers the water dial, from dry country to lakeland", () => {
    // Measured on the BARE LANDSCAPE over a fixed box, which is what the
    // claim is about. Sampling `terrain.heightAt` inside `track.bounds`
    // instead asks a different question: the bounds move with the dial —
    // a wetter seed generates a differently shaped stage — so the window
    // slides over different country at every dial position and the trend
    // it reports is partly the stage moving rather than the water rising.
    const wetness = (water: number): number => {
      let wet = 0;
      let n = 0;
      for (const seed of [1, 3, 5]) {
        const land = createLandField(seed, resolveKnobs({ water }));
        for (let i = 0; i < 40; i++) {
          for (let j = 0; j < 40; j++) {
            const x = -1500 + (3000 * i) / 39;
            const z = -1500 + (3000 * j) / 39;
            n += 1;
            if (land.heightAt(x, z) < LAKE_Y) wet += 1;
          }
        }
      }
      return wet / n;
    };
    const dry = wetness(0);
    const middling = wetness(0.5);
    const lakeland = wetness(1);
    expect(dry).toBeLessThan(middling);
    expect(middling).toBeLessThan(lakeland);
  });
});
