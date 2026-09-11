// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE SNOW THAT REMEMBERS. Everything about the deformable snow:
// the compaction arithmetic (climate.ts), the cover the road arrives
// already wearing (road.ts, compile.ts), the field the run works down as
// it drives (snowpack.ts), and what a rut then does to the car driving in
// it (car.ts, TUNING.snow).
//
// The claim the whole file is built around is one sentence: a trail is
// FASTER and LOOSER than the snow beside it. Every test here is half of
// that, and the two halves are why a winter stage is a stage about lines.

import { describe, expect, it } from "vitest";

import {
  CLIMATE,
  NEUTRAL_INPUT,
  ROAD_CROSS,
  TUNING,
  blanketDepth,
  createGame,
  createSnowpack,
  crossOffset,
  packedBy,
  packedDepth,
  roadSnow,
  rutAt,
  snowGrip,
  snowRide,
  snowSinkAt,
  snowUnder,
  snowWade,
  step,
  wearAt,
  type GameState,
  type RoadShape,
  type SnowUnder,
  type Track,
} from "@engine";

import { stageTerrain, stageTrack } from "./support/stages.ts";

const SEED = 41;

/** A taiga winter mild enough to leave every body of water open, so the
 * road under test is snow rather than ice — the same climate
 * `winter_test.ts` uses, and for the same reason. */
const MILD = { season: "winter" as const, temperature: -6 };

const winter = (): Track => stageTrack(SEED, "short", { biome: "taiga" }, "sprint", MILD);

/** A point beside the road, `out` metres to the driver's right of a sample
 * that has snow lying on it, on dry ground clear of everything else. */
function field(track: Track, out: number): { x: number; z: number; i: number } {
  const terrain = stageTerrain(track);
  for (let i = 40; i < track.samples.length - 40; i += 3) {
    const s = track.samples[i];
    const x = s.x + Math.cos(s.heading) * out;
    const z = s.z - Math.sin(s.heading) * out;
    if (terrain.blanketAt(x, z) < CLIMATE.blanket.shallow - 1e-6) continue;
    if (terrain.waterAt(x, z) !== null || terrain.iceAt(x, z) !== null) continue;
    if (terrain.spurClearance(x, z) < CLIMATE.blanket.verge + 2) continue;
    return { x, z, i };
  }
  throw new Error("no untouched blanket beside the road");
}

describe("how snow packs", () => {
  it("stands lower every pass, by less every time, and never past its floor", () => {
    const rest = blanketDepth(-10);
    let pack = 0;
    let before = packedDepth(rest, pack);
    // Untouched snow is exactly the snow it always was: the wheels stand
    // `blanket.ride` of the way down into the whole depth, which is the
    // reading every stage in the game had before there was a pack at all.
    expect(before).toBeCloseTo(rest, 12);
    expect(snowRide(rest, 0)).toBeCloseTo(rest * CLIMATE.blanket.ride, 12);
    let fell = Infinity;
    for (let pass = 0; pass < 6; pass++) {
      pack = packedBy(pack, 1);
      const now = packedDepth(rest, pack);
      expect(now).toBeLessThan(before);
      // Diminishing returns — the multipass compaction curve.
      expect(before - now).toBeLessThan(fell);
      fell = before - now;
      before = now;
      expect(now).toBeGreaterThanOrEqual(rest * CLIMATE.pack.floor - 1e-9);
    }
    expect(packedDepth(rest, 1)).toBeCloseTo(rest * CLIMATE.pack.floor, 12);
  });

  it("leaves a rut with a wall: the floor drops and the snow beside it does not", () => {
    const rest = blanketDepth(-10);
    const worked = packedBy(packedBy(0, 1), 1);
    // The wheels end up lower than they started...
    expect(snowRide(rest, worked)).toBeLessThan(snowRide(rest, 0));
    // ...and the untouched snow either side still stands where it did, so
    // the difference between the two IS the wall the car has to climb.
    expect(packedDepth(rest, 0) - snowRide(rest, worked)).toBeGreaterThan(0.1);
  });

  it("empties out what the car has to plough, which is what makes a trail worth following", () => {
    const rest = blanketDepth(-10);
    const fresh = snowWade(rest, 0);
    const once = snowWade(rest, packedBy(0, 1));
    const thrice = snowWade(rest, packedBy(packedBy(packedBy(0, 1), 1), 1));
    expect(fresh).toBeGreaterThan(once);
    expect(once).toBeGreaterThan(thrice);
    // One pass takes more than half of it — a car turning round in its own
    // trail is on a different surface from the one it arrived over.
    expect(once).toBeLessThan(fresh / 2);
    expect(snowWade(rest, 1)).toBeCloseTo(0, 12);
  });

  it("and costs grip for it: a polished track holds worse than the powder beside it", () => {
    expect(snowGrip(0)).toBeGreaterThan(snowGrip(CLIMATE.pack.worn));
    expect(snowGrip(CLIMATE.pack.worn)).toBeGreaterThan(snowGrip(1));
    // The row the surfaces table was tuned at is the line a car actually
    // drives — the swept crown between the tracks — so a winter stage's
    // racing line holds exactly what it always held.
    expect(snowGrip(CLIMATE.pack.worn)).toBe(1);
    expect(CLIMATE.pack.worn).toBe(ROAD_CROSS.rut.centre);
    expect(snowGrip(1)).toBeLessThan(1);
    expect(snowGrip(1)).toBeGreaterThan(0.5);
  });
});

describe("the snow lying on a road", () => {
  it("is a fraction of the blanket beside it, and only on a snow road", () => {
    const track = winter();
    let snowy = 0;
    for (const s of track.samples) {
      if (s.surface === "snow") {
        expect(s.snow).toBeGreaterThan(0);
        expect(s.snow).toBeLessThan(blanketDepth(-40));
        snowy++;
      } else {
        expect(s.snow).toBe(0);
      }
    }
    expect(snowy).toBeGreaterThan(track.samples.length / 2);
    expect(roadSnow(-6)).toBeCloseTo(CLIMATE.pack.road * blanketDepth(-6), 12);
  });

  it("stands deepest at the edge, lower over the crown, lowest in the wheel tracks", () => {
    const width = 6;
    const shape: RoadShape = { surface: "snow", lift: 0, snow: roadSnow(-6) };
    const bare: RoadShape = { ...shape, snow: 0 };
    const rut = rutAt(width);
    const lying = (lat: number): number =>
      crossOffset(shape, lat, width) - crossOffset(bare, lat, width);
    const edge = lying(width / 2 - 0.2);
    const crown = lying(0);
    const track = lying(rut);
    expect(edge).toBeGreaterThan(crown);
    expect(crown).toBeGreaterThan(track);
    expect(track).toBeCloseTo(shape.snow! * CLIMATE.pack.floor, 6);
    // ...and the car rides INSIDE it everywhere but the tracks, which are
    // already a floor and have nothing left to give.
    expect(snowSinkAt(shape, 0, width)).toBeGreaterThan(snowSinkAt(shape, rut, width));
    expect(snowSinkAt(shape, rut, width)).toBeCloseTo(0, 6);
    expect(snowSinkAt(bare, 0, width)).toBe(0);
  });

  it("hands the road's own wear to the pack as the traffic that came before", () => {
    const track = winter();
    const terrain = stageTerrain(track);
    const under: SnowUnder = { rest: 0, base: 0 };
    const i = track.samples.findIndex((s) => s.surface === "snow" && s.width > 4);
    const s = track.samples[i];
    const at = (lat: number): SnowUnder => {
      snowUnder(
        track,
        terrain,
        i,
        s.x + Math.cos(s.heading) * lat,
        s.z - Math.sin(s.heading) * lat,
        under,
      );
      return { ...under };
    };
    const rut = at(rutAt(s.width));
    const crown = at(0);
    expect(rut.base).toBeGreaterThan(crown.base);
    expect(crown.base).toBeCloseTo(wearAt(0, s.width), 6);
    expect(rut.rest).toBeCloseTo(s.snow, 6);
  });
});

describe("a car on a snowfield", () => {
  /** Put a run's car out in the untouched blanket, pointed down the stage,
   * at `speed`. */
  const inField = (track: Track, speed: number): { state: GameState; x: number; z: number } => {
    const { x, z, i } = field(track, track.width / 2 + 26);
    const state = createGame({ seed: SEED, track, skipCountdown: true });
    state.car.x = x;
    state.car.z = z;
    state.car.heading = track.samples[i].heading;
    state.car.u = speed;
    state.car.y = state.terrain.groundAt(x, z);
    state.nearIndex = i;
    return { state, x, z };
  };

  it("works the snow down where its wheels went, and nowhere else", () => {
    const track = winter();
    const { state, x, z } = inField(track, 16);
    const heading = state.car.heading;
    // The driver's right axis in world space is (cos h, -sin h).
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const at = (out: number): { x: number; z: number } => ({ x: x + rx * out, z: z + rz * out });
    expect(state.snow.white).toBe(true);
    expect(state.snow.worked).toBe(0);
    for (let i = 0; i < 90; i++) step(state, NEUTRAL_INPUT);
    expect(Math.hypot(state.car.x - x, state.car.z - z)).toBeGreaterThan(4);
    expect(state.snow.worked).toBeGreaterThan(0);
    // THE WHEEL LINES are a hole in the ground the world was drawn at.
    const rut = at(TUNING.snow.wheelAt);
    expect(state.snow.cutAt(rut.x, rut.z)).toBeGreaterThan(0.01);
    // ...THE CROWN BETWEEN THEM is not: the car straddled it, and a trail
    // in snow is two furrows with a ridge standing between them rather
    // than one flat scrape the width of the car.
    const crown = at(0);
    expect(state.snow.cutAt(crown.x, crown.z)).toBeLessThan(state.snow.cutAt(rut.x, rut.z) / 2);
    // ...and the untouched field a few metres to the side never heard of
    // any of it.
    const away = at(8);
    expect(state.snow.cutAt(away.x, away.z)).toBe(0);
    expect(state.snow.workAt(away.x, away.z, 0)).toBe(0);
  });

  it("drops the SNOW'S TOP by the whole of what the packing took, not the wheels' share", () => {
    // The two numbers a pass leaves behind are different, and confusing them
    // is a car that flattens a third of a metre of snow and draws a trough a
    // few centimetres deep. Packing a column both shortens it and firms it:
    // the wheels sink by the loose share of the loss, the SURFACE loses the
    // whole of it — so `sunkAt` is always the larger, and it is the one
    // anything drawing the snow reads (`snow-mantle.ts`).
    const track = winter();
    const { state, x, z } = inField(track, 16);
    const heading = state.car.heading;
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    for (let i = 0; i < 90; i++) step(state, NEUTRAL_INPUT);
    const rut = { x: x + rx * TUNING.snow.wheelAt, z: z + rz * TUNING.snow.wheelAt };
    const sunk = state.snow.sunkAt(rut.x, rut.z);
    const cut = state.snow.cutAt(rut.x, rut.z);
    expect(cut).toBeGreaterThan(0);
    expect(sunk).toBeGreaterThan(cut);
    // Neither may take more than the column has: the surface can lose down
    // to the floor a fully worked one stands at, and no further.
    const under: SnowUnder = { rest: 0, base: 0 };
    snowUnder(track, state.terrain, state.nearIndex, rut.x, rut.z, under);
    expect(sunk).toBeLessThanOrEqual(under.rest * (1 - CLIMATE.pack.floor) + 1e-9);
    // ...and untouched ground has lost nothing either way.
    const away = { x: x + rx * 8, z: z + rz * 8 };
    expect(state.snow.sunkAt(away.x, away.z)).toBe(0);
  });

  it("finds its own trail easier the second time down it", () => {
    const track = winter();
    const { state, x, z } = inField(track, 26);
    const heading = state.car.heading;
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const under: SnowUnder = { rest: 0, base: 0 };
    /** What a car standing at a point would be ploughing there, m. */
    const wade = (px: number, pz: number): number => {
      snowUnder(track, state.terrain, state.nearIndex, px, pz, under);
      return snowWade(under.rest, state.snow.workAt(px, pz, under.base));
    };
    const rut = { x: x + rx * TUNING.snow.wheelAt, z: z + rz * TUNING.snow.wheelAt };
    const fresh = wade(rut.x, rut.z);
    expect(fresh).toBeGreaterThan(0.1);
    for (let i = 0; i < 90; i++) step(state, NEUTRAL_INPUT);
    // The same patch of ground, now that a wheel has been over it: less
    // than half the snow left to push, where the field a few metres away
    // still has all of it.
    const worked = wade(rut.x, rut.z);
    expect(worked).toBeLessThan(fresh / 2);
    expect(wade(x + rx * 8, z + rz * 8)).toBeCloseTo(fresh, 2);
  });

  it("is slowed by the DEPTH of it, not by the fact of it", () => {
    const track = winter();
    // Two runs of the same car over the same ground: one on the untouched
    // blanket, one on snow already worked to a floor.
    const roll = (pack: number): number => {
      const { state } = inField(track, 20);
      if (pack > 0) {
        const under: SnowUnder = { rest: 0, base: 0 };
        // Drive the patch flat first, then put the car back on it.
        const x = state.car.x;
        const z = state.car.z;
        for (let lz = -6; lz <= 6; lz += 0.2) {
          for (const lx of [-TUNING.snow.wheelAt, 0, TUNING.snow.wheelAt]) {
            const px = x + Math.sin(state.car.heading) * lz + Math.cos(state.car.heading) * lx;
            const pz = z + Math.cos(state.car.heading) * lz - Math.sin(state.car.heading) * lx;
            snowUnder(track, state.terrain, state.nearIndex, px, pz, under);
            for (let n = 0; n < 8; n++) state.snow.carve(px, pz, under, 1);
          }
        }
      }
      const was = state.car.u;
      for (let i = 0; i < 30; i++) step(state, NEUTRAL_INPUT);
      return was - state.car.u;
    };
    const deep = roll(0);
    const worn = roll(1);
    expect(deep).toBeGreaterThan(worn);
  });

  it("leaves the same snow behind on two runs of the same seed", () => {
    const track = winter();
    const drive = (): number[] => {
      const { state, x, z } = inField(track, 26);
      for (let i = 0; i < 80; i++) step(state, NEUTRAL_INPUT);
      const out: number[] = [state.snow.worked];
      for (let d = 0; d < 20; d++) out.push(state.snow.cutAt(x + d * 0.5, z + d * 0.5));
      return out;
    };
    expect(drive()).toEqual(drive());
  });
});

describe("a stage with no winter on it", () => {
  it("has no pack at all, and pays nothing for one", () => {
    const track = stageTrack(SEED, "short", { biome: "taiga" });
    const state = createGame({ seed: SEED, track, skipCountdown: true });
    expect(state.snow.white).toBe(false);
    for (const s of track.samples) expect(s.snow).toBe(0);
    for (let i = 0; i < 120; i++) step(state, NEUTRAL_INPUT);
    expect(state.snow.worked).toBe(0);
    expect(state.snow.cutAt(state.car.x, state.car.z)).toBe(0);
  });
});

describe("the pack itself", () => {
  it("remembers nothing until something drives on it, and then only that", () => {
    const pack = createSnowpack(true);
    expect(pack.worked).toBe(0);
    expect(pack.cutAt(10, 10)).toBe(0);
    // An untouched point answers with the ground's own packing rather than
    // with nothing, so the edge of a trail fades into the road it is on.
    expect(pack.workAt(10, 10, 0.4)).toBe(0.4);
    pack.carve(10, 10, { rest: 0.8, base: 0 }, 1);
    expect(pack.worked).toBeGreaterThan(0);
    expect(pack.cutAt(10, 10)).toBeGreaterThan(0);
    expect(pack.workAt(10, 10, 0)).toBeGreaterThan(0);
    // ...and a cell a long way off is still untouched.
    expect(pack.cutAt(400, 400)).toBe(0);
  });

  it("cannot be cut where the traffic before it already wore the snow to a floor", () => {
    const pack = createSnowpack(true);
    pack.carve(0, 0, { rest: 0.2, base: 1 }, 1);
    expect(pack.worked).toBe(0);
    expect(pack.cutAt(0, 0)).toBe(0);
  });

  it("is a constant on a green stage", () => {
    const pack = createSnowpack(false);
    pack.carve(0, 0, { rest: 1, base: 0 }, 1);
    expect(pack.worked).toBe(0);
    expect(pack.cutAt(0, 0)).toBe(0);
  });

  it("keeps a whole stage's trail inside its cap", () => {
    const pack = createSnowpack(true);
    const under: SnowUnder = { rest: 0.7, base: 0 };
    // Six kilometres of four wheel lines, at the grain the pack is kept
    // at — a long stage driven end to end and never off the road.
    for (let s = 0; s < 6000; s += CLIMATE.pack.cell) {
      for (const lx of [-1.5, -0.74, 0.74, 1.5]) pack.carve(lx, s, under, 1);
    }
    expect(pack.worked).toBeGreaterThan(10000);
    expect(pack.cutAt(0.74, 3000)).toBeGreaterThan(0);
  });
});
