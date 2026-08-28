// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through, as the ENGINE places it: the forest's
// clumping, the dead wood a gale leaves lying down the slope, and the rocky
// outcrops that break surface in company. All three are things the renderer
// only draws — where they stand is the prop field's (engine/mapgen/props.ts),
// because every one of them is solid and the car collides with what it sees.

import { describe, expect, it } from "vitest";

import { compileTrack, createTerrain, type WildObstacle } from "@engine";

/** A wide patch of country, well clear of the start, to gather props over. */
const PATCH = 600;

function propsOver(
  terrain: ReturnType<typeof createTerrain>,
  x: number,
  z: number,
  near: (px: number, pz: number, r: number) => WildObstacle[],
): WildObstacle[] {
  const found = new Map<string, WildObstacle>();
  for (let dx = -PATCH; dx <= PATCH; dx += 120) {
    for (let dz = -PATCH; dz <= PATCH; dz += 120) {
      for (const ob of near(x + dx, z + dz, 90)) found.set(`${ob.x},${ob.z}`, ob);
    }
  }
  return [...found.values()];
}

describe("the forest", () => {
  it("stands in clumps rather than one trunk per cell", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    const s = track.samples[Math.floor(track.samples.length / 2)];
    const trees = propsOver(terrain, s.x, s.z, terrain.treesNear);
    expect(trees.length).toBeGreaterThan(200);

    // The tell of a cell grid is that no two trunks are ever closer than the
    // cell is wide. A clumped forest has knots in it: most trunks stand
    // within a few metres of another one, and some pairs are close enough to
    // read as one thicket.
    let withCompany = 0;
    for (const a of trees) {
      const close = trees.some(
        (b) =>
          b !== a && Math.hypot(b.x - a.x, b.z - a.z) < 5 && Math.hypot(b.x - a.x, b.z - a.z) > 0,
      );
      if (close) withCompany++;
    }
    expect(withCompany / trees.length).toBeGreaterThan(0.35);

    // ...and the forest is still a forest a car can drive into: the clumping
    // moves trunks around, it does not grow more of them.
    const area = 2 * PATCH * (2 * PATCH);
    const perTrunk = area / trees.length;
    expect(perTrunk).toBeGreaterThan(150);
    expect(perTrunk).toBeLessThan(2000);
  });
});

describe("the dead wood", () => {
  it("lays its fallen trunks down the fall line", () => {
    const track = compileTrack(7);
    const terrain = createTerrain(track);
    const s = track.samples[Math.floor(track.samples.length / 2)];
    const logs = propsOver(terrain, s.x, s.z, terrain.obstaclesNear).filter(
      (ob) => ob.kind === "log" || ob.kind === "rootlog",
    );
    expect(logs.length).toBeGreaterThan(3);

    // A lying trunk's `spin` is the compass bearing it lies along (the
    // renderer turns that into the yaw its own geometry needs). On any slope
    // worth the name it points downhill — give or take the wobble that keeps
    // a blowdown from looking combed, and give or take the trunks a gale laid
    // out sideways from the one the fall line was read at.
    const off: number[] = [];
    for (const log of logs) {
      // The RIDDEN ground, over the span the field itself reads.
      const gx = terrain.groundAt(log.x + 5, log.z) - terrain.groundAt(log.x - 5, log.z);
      const gz = terrain.groundAt(log.x, log.z + 5) - terrain.groundAt(log.x, log.z - 5);
      const run = Math.hypot(gx, gz);
      if (run / 10 < 0.1) continue;
      const downhill = Math.atan2(-gz / run, -gx / run);
      const d = log.spin - downhill;
      off.push(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
    }
    off.sort((a, b) => a - b);
    expect(off.length).toBeGreaterThan(10);
    // Bearings drawn out of a hat would average a quarter turn off.
    expect(off[Math.floor(off.length / 2)]).toBeLessThan(0.35);
    expect(off[Math.floor(off.length * 0.9)]).toBeLessThan(0.7);
  });
});

describe("rocky outcrops", () => {
  it("break surface in company, bedded into the hill", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    const s = track.samples[Math.floor(track.samples.length / 2)];
    const stone = propsOver(terrain, s.x, s.z, terrain.obstaclesNear).filter(
      (ob) => ob.kind === "rock" || ob.kind === "boulder",
    );
    // A stone whose foot is below the ground it stands on was bedded into the
    // hill by the outcrop field — a lone rock sits exactly on the surface.
    const bedded = stone.filter((ob) => ob.y < terrain.groundAt(ob.x, ob.z) - 0.05);
    expect(bedded.length).toBeGreaterThan(10);

    // ...and hardly ever alone: a bedded stone stands in a knot of its own
    // kind, which is the whole point of the field. A few lose most of their
    // company to a road or a stream running through the cluster, so this is
    // the share rather than every one of them.
    const inCompany = bedded.filter(
      (ob) => bedded.filter((o) => Math.hypot(o.x - ob.x, o.z - ob.z) < 24).length >= 4,
    );
    expect(inCompany.length / bedded.length).toBeGreaterThan(0.75);

    // Bedded or not, what stands over the ground is still tall enough to be
    // something the car can hit rather than litter the wheels ride over.
    for (const ob of bedded) {
      expect(ob.y + ob.height - terrain.groundAt(ob.x, ob.z)).toBeGreaterThanOrEqual(0.45);
    }
  });
});
