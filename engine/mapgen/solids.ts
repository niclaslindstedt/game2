// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A SOLID IS MADE OF. Every standing thing in the wild is a circle to
// the contact model, but a circle is not enough to say what happens when a
// tonne of rally car arrives at it: a loose stone the size of a football
// goes over the roof and the car barely notices, the same stone at ten
// times the volume ends the run, and a tree does neither — it stands until
// the trunk gives, and then it takes a great deal of speed with it.
//
// So every prop carries three numbers beyond its shape, and they are all
// the contact model needs to tell those apart:
//
//   `mass`   — kilograms, from the volume the renderer actually draws and
//              the material it is drawn as. The car's own mass is weighed
//              against it, so what happens is a momentum exchange rather
//              than a rule per kind.
//   `rooted` — 0..1, how much of the thing is HELD BY THE GROUND rather
//              than merely resting on it. A fallen trunk is lying loose, a
//              boulder is bedded near half in, an outcrop IS the bedrock.
//   `snap`   — the impulse its own structure survives, N·s. Wood breaks;
//              stone, at these sizes, does not.
//
// The car-side numbers that read all this — the restitution, the crush,
// the roll a low solid trips into the body — live in TUNING.collision, as
// every other number the contact model spends does. What lives HERE is the
// world's own material properties, beside the sizes they are computed from.

/** A solid thing standing in the wild: the physics collides with it and the
 * renderer draws it — the SAME seeded placement on both sides. */
export type WildObstacle = {
  x: number;
  z: number;
  /** Ground height under it (terrain.heightAt at its foot). */
  y: number;
  kind: SolidKind;
  /** Visual scale factor — how big this prop is drawn, in the units its
   * own kind is authored in (~0.4–2.1 for a rock, ~0.8–1.8 for a boulder
   * or a fallen trunk, ~1.6 up for an outcrop). */
  size: number;
  spin: number;
  /** Collision radius in the ground plane, m — for a tree, the trunk. */
  radius: number;
  /** Height above its foot — a car flying higher clears it. */
  height: number;
  /** What it weighs, kg — from the volume drawn and the material. */
  mass: number;
  /** How firmly the ground holds it, 0..1: 0 is lying loose on the
   * surface, 1 is rooted or bedded in for good. */
  rooted: number;
  /** The impulse its structure takes before it breaks, N·s. Infinite for
   * stone — a boulder is moved, never snapped. */
  snap: number;
  /** Trees only: species roll (0–1) and grove index (into GROVES) — the
   * renderer picks WHAT to draw from these; the engine only owns WHERE the
   * trunk stands and how thick it is. */
  roll?: number;
  grove?: number;
};

export type SolidKind = "boulder" | "log" | "tree" | "rock" | "slab" | "stump";

/** A prop standing this tall over its foot is SOLID — the car hits it.
 * The catalog's bonnets sit about 0.87 m over the ground, so this is the
 * MIDDLE OF THE HOOD: a rock reaching above it meets the body and stops
 * the car, one below it is litter the wheels ride over and the renderer
 * scatters for itself. Everything the terrain field places clears this bar;
 * nothing the renderer plants on its own may. */
export const SOLID_PROP_HEIGHT = 0.45;

/** Bulk densities, kg/m³. Both are honest for the material and deliberately
 * shy of the textbook figure for the SHAPE: a wild boulder is fissured and
 * a trunk is not a solid cylinder of heartwood, and the volumes below are
 * measured off the drawn silhouette, which is generous to both. */
const DENSITY = { stone: 1500, wood: 500 };

/** The impulse a material's structure survives per kilogram of itself,
 * N·s/kg. Wood at 30 puts the smallest trunk on a stage inside a rally
 * car's momentum at about 40 km/h and the biggest at about 120, which is
 * the whole point of the number: a sapling goes down under an ordinary
 * excursion, an old spruce is a wall until you are properly committed —
 * and going through one costs very nearly everything you arrived with. */
const SNAP_PER_MASS = { stone: Infinity, wood: 30 };

/** How much of a tree's collision circle is actually WOOD — the rest of it
 * is the lowest boughs, which stop nothing and weigh little — and what the
 * crown over the bole adds back on top of the trunk it grows out of. */
const TRUNK_OF_CANOPY = 0.45;
const CROWN = 1.6;

/** Which material each kind is, and how much of it the ground holds. A
 * fallen trunk is lying where it fell; a loose rock sits a third of itself
 * in the dirt; a boulder is bedded near half; a stump is nothing BUT root,
 * and an outcrop is the bedrock showing through and moves when the
 * mountain does. */
const MATERIAL: Record<SolidKind, { of: keyof typeof DENSITY; rooted: number }> = {
  tree: { of: "wood", rooted: 1 },
  stump: { of: "wood", rooted: 1 },
  log: { of: "wood", rooted: 0.08 },
  rock: { of: "stone", rooted: 0.3 },
  boulder: { of: "stone", rooted: 0.55 },
  slab: { of: "stone", rooted: 1 },
};

/** HOW BIG EACH KIND STANDS at a given `size`: the collision circle in the
 * ground plane and the height over its foot. One table for the whole world,
 * because every one of these numbers is read three times — by the field
 * that plants the prop and checks it clears the road, by the contact model
 * that weighs it, and by the renderer that draws it exactly there. */
export function solidShape(kind: SolidKind, size: number): { radius: number; height: number } {
  switch (kind) {
    case "tree":
      // The trunk plus its lowest boughs — fat enough to punish a
      // straight-through line, thin enough that gaps stay drivable; tall
      // enough that no jump clears one, so only a cliff flight sails over
      // the forest.
      return { radius: 0.3 + 0.25 * size, height: 6 * size };
    case "stump":
      // A cut bole plus the saw cut on top.
      return { radius: 0.55 * size, height: 0.98 * size };
    case "log":
      // A trunk lying down: the circle is the length it covers.
      return { radius: 2.6 * size, height: 0.75 * size };
    case "rock":
      // Loose stone: a squashed lump a third of itself in the ground.
      return { radius: 0.85 * size, height: 1.05 * size };
    case "boulder":
      // A deep-wild boulder — it takes real air to clear one.
      return { radius: 1.9 * size, height: 2.1 * size };
    default:
      // An outcrop: sunk near half its depth and stretched tall, a face of
      // rock nothing but a cliff flight gets over.
      return { radius: 0.85 * size, height: 1.8 * size };
  }
}

/** The volume of what is DRAWN, m³ — each formula matched to the shape the
 * renderer builds for that kind (wild.ts stoneMatrix, the flora trunks), so
 * a prop weighs what it looks like it weighs. The stone kinds are lumps:
 * a unit dodecahedron holds ~2.785 m³, scaled by the three axes each kind
 * is stretched along. The wooden ones are cylinders of their own trunk. */
function solidVolume(ob: {
  kind: SolidKind;
  size: number;
  radius: number;
  height: number;
}): number {
  const LUMP = 2.785;
  const { kind, size, radius, height } = ob;
  switch (kind) {
    case "rock":
      // A squashed lump, a third of it under the dirt.
      return LUMP * size * size * (size * 0.7);
    case "boulder":
      return LUMP * (radius * 0.95) * (radius * 0.8) * (height * 0.85);
    case "slab":
      return LUMP * size * (size * 0.8) * (size * 1.3);
    case "log":
      // A trunk lying down: its collision circle is the length it covers,
      // its height the thickness of the bole.
      return Math.PI * (height / 2) * (height / 2) * (radius * 2);
    case "stump":
      // What is left of a felled trunk IS its bole: the collision circle
      // is the wood.
      return Math.PI * radius * radius * height;
    default: {
      // A standing tree. Its collision circle is the trunk plus the lowest
      // boughs, so the WOOD inside it is a fraction of that — and the
      // crown standing over the bole adds its share back.
      const bole = radius * TRUNK_OF_CANOPY;
      return Math.PI * bole * bole * height * CROWN;
    }
  }
}

/** Stand a solid up: everything the placement decided, plus what the
 * material says it weighs and how hard it is to move or break. The one
 * factory every solid in the world comes out of — the fields in terrain.ts
 * and the staged obstacles in the tests alike — so nothing can be planted
 * without the contact model knowing what it is made of. */
export function standSolid(
  ob: Omit<WildObstacle, "mass" | "rooted" | "snap" | "radius" | "height">,
): WildObstacle {
  const material = MATERIAL[ob.kind];
  const shape = solidShape(ob.kind, ob.size);
  const mass = solidVolume({ ...ob, ...shape }) * DENSITY[material.of];
  return {
    ...ob,
    ...shape,
    mass,
    rooted: material.rooted,
    snap: mass * SNAP_PER_MASS[material.of],
  };
}
