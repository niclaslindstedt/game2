// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND, LAID OVER THE COUNTRY.
//
// `arena.ts` says what shape the training ground is. This puts it on the
// map: it takes the field the seed built — hills, water, forest, the lot —
// and hands back one that answers the arena's own numbers inside the pad,
// the country's outside the berm, and a blend of the two across the bank
// between them. Nothing downstream learns that it happened. The physics
// asks a height field for a height, the renderer asks the same field for
// the same height, and both get an arena.
//
// The blend is the berm's own weight (`ArenaPlan.weightAt`), which is why
// the berm exists at all: without a band where the arena is letting go of
// the ground, laying a flat pad on a landscape is a cliff round all four
// sides of it.

import { arenaGroundAt, type ArenaPlan } from "./arena.ts";
import type { Surface } from "./compile.ts";
import type { TerrainField } from "./terrain.ts";
import type { WildObstacle } from "./solids.ts";

/** Wrap `base` so the arena owns its own ground. */
export function arenaTerrain(base: TerrainField, plan: ArenaPlan): TerrainField {
  const arenaGround = arenaGroundAt(plan);
  const weightAt = plan.weightAt;

  /** The arena's shape and the country's, mixed by how much of the ground
   * the arena still has an opinion about. Used for the analytic field and
   * the ridden lattice alike — they differ only in which pair is mixed. */
  const mix = (x: number, z: number, arena: number, country: number): number => {
    const w = weightAt(x, z);
    if (w >= 1) return arena;
    if (w <= 0) return country;
    return arena * w + country * (1 - w);
  };

  const heightAt = (x: number, z: number): number =>
    mix(x, z, plan.heightAt(x, z), base.heightAt(x, z));

  // The RIDDEN surface: the arena's own lattice where the arena is, the
  // country's where it is not. Both sides are the surface their own half of
  // the world is drawn on, so the car rides exactly what it can see whether
  // it is on the pad, on the berm, or out in the trees past it.
  const groundAt = (x: number, z: number): number =>
    mix(x, z, arenaGround(x, z), base.groundAt(x, z));

  // Nothing is drawn OVER the arena the way a road ribbon is drawn over the
  // country's tiles, so the tiles and the ridden ground are the same
  // surface here — which is what `latticeAt` is asked for.
  const latticeAt = (x: number, z: number): number =>
    mix(x, z, arenaGround(x, z), base.latticeAt(x, z));

  /** Is this point ON the training ground — the graded pad itself, as
   * against the berm around it or the country past that? The pad is where
   * the arena's own answers are the only ones: no country water under it,
   * no forest planted on it, and a surface that came out of the layout
   * rather than off a spur. */
  const onPad = (x: number, z: number): boolean => plan.surfaceAt(x, z) !== null;

  const spurSurfaceAt = (x: number, z: number): Surface | null =>
    plan.surfaceAt(x, z) ?? base.spurSurfaceAt(x, z);

  // A training ground is graded, drained and dry. Suppressing the country's
  // water here is not a nicety: the pour reads the DRAWN lattice, and a pad
  // dropped into a shallow seed's basin would otherwise come up flooded.
  const waterAt = (x: number, z: number): number | null =>
    onPad(x, z) ? null : base.waterAt(x, z);

  // The arena's furniture, and the country's props with everything standing
  // on the pad taken out of them — the prop field planted its forest from
  // the country's own ground, which is a metre of hillside the pad has
  // since replaced with tarmac.
  let furniture = plan.solids;
  const obstaclesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const out = base.obstaclesNear(x, z, r).filter((ob) => !onPad(ob.x, ob.z));
    for (const ob of furniture) {
      if (Math.hypot(ob.x - x, ob.z - z) <= r + ob.radius) out.push(ob);
    }
    return out;
  };
  const treesNear = (x: number, z: number, r: number): WildObstacle[] =>
    base.treesNear(x, z, r).filter((ob) => !onPad(ob.x, ob.z));

  const fell = (ob: WildObstacle): void => {
    const before = furniture.length;
    furniture = furniture.filter((f) => f !== ob);
    if (furniture.length === before) base.fell(ob);
  };

  return {
    ...base,
    // Nobody came to watch, and nobody parked. R26's stands and R42's car
    // parks are placed against a stage, and the arena's ribbon is a
    // hundred-metre approach road: a grandstand on it would be a crowd
    // turned out to watch somebody practise. Constant empty lists rather
    // than filtered ones — `sync` grows the base field's own arrays, and
    // these are not them.
    stands: [],
    standRevision: 0,
    carParks: [],
    heightAt,
    groundAt,
    latticeAt,
    spurSurfaceAt,
    waterAt,
    obstaclesNear,
    treesNear,
    fell,
  };
}
