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

export type SolidKind =
  | "boulder"
  | "log"
  /** A trunk blown over rather than rotted off: it still holds its root
   * plate up on end at the butt, which is a metre and a half of solid wood
   * standing over a thing you could otherwise drive across. */
  | "rootlog"
  | "tree"
  | "rock"
  | "slab"
  | "stump"
  /** Cut timber stacked at the roadside for the lorry. */
  | "timber"
  /** R13 — a bay of a concrete bridge's PARAPET. The one solid on a stage
   * that is there on purpose: a wall between the deck and a drop, and the
   * only thing that makes a bridge a place you have to be accurate. */
  | "parapet";

/** A prop standing this tall over its foot is SOLID — the car hits it.
 * The catalog's bonnets sit about 0.87 m over the ground, so this is the
 * MIDDLE OF THE HOOD: a rock reaching above it meets the body and stops
 * the car, one below it is litter the wheels ride over and the renderer
 * scatters for itself. Everything the terrain field places clears this bar;
 * nothing the renderer plants on its own may. */
export const SOLID_PROP_HEIGHT = 0.45;

/** R13 — one bay of a parapet: its collision circle in the ground plane and
 * how high the wall stands over the deck. Declared beside SOLID_PROP_HEIGHT
 * because the height has to clear it — a parapet the car rides over is not
 * a parapet. */
const PARAPET_RADIUS = 0.6;
const PARAPET_HEIGHT = 0.9;

/** R13 — the concrete parapet, as geometry: how long one BAY of it is, m
 * (and so how far apart the run of solids that makes it stands), how thick
 * the wall is, and how far outside the mat's edge its INNER FACE stands.
 * The engine collides with the run and the renderer draws the same bays in
 * the same places — one statement, both sides.
 *
 * The collision circle is deliberately fatter than the wall, because a run
 * of circles with a gap in it is worse than no wall at all: a nose finds
 * the gap, and behind this one is the river. So the two are lined up on
 * the wall's INNER face rather than on their centres — `PARAPET_INSET` is
 * how far in from a bay's centre the drawn wall's centre sits, and it is
 * what makes the car stop exactly where the concrete looks like it is. */
export const PARAPET_BAY = 1;
export const PARAPET_THICK = 0.5;
export const PARAPET_GAP = 0.2;
/** Lateral distance from a bay's centre to the road, m: the solid's own
 * radius past the wall's inner face. */
export const PARAPET_OUT = PARAPET_GAP + PARAPET_RADIUS;
export const PARAPET_INSET = PARAPET_RADIUS - PARAPET_THICK / 2;

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
  // A root plate is still half in the ground it came out of.
  rootlog: { of: "wood", rooted: 0.2 },
  // Several tonnes of timber, bedded on its bearers but not rooted at all.
  timber: { of: "wood", rooted: 0.35 },
  rock: { of: "stone", rooted: 0.3 },
  boulder: { of: "stone", rooted: 0.55 },
  slab: { of: "stone", rooted: 1 },
  // Cast onto the deck it stands on: as immovable as the bridge is.
  parapet: { of: "stone", rooted: 1 },
};

/** Is this thing made of WOOD? What breaks off it, what colour the
 * splinters are and what it sounds like all follow from the material, and
 * the material is already stated once in the table above — so nothing else
 * in the tree gets to keep its own list of which kinds are trees. */
export function isWooden(kind: SolidKind): boolean {
  return MATERIAL[kind].of === "wood";
}

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
    case "rootlog":
      // The same trunk, but the plate at its butt stands well over it.
      return { radius: 2.6 * size, height: 1.9 * size };
    case "timber":
      // A stack of five-metre logs: the circle covers their length, and
      // four courses stand about waist-high on the car.
      return { radius: 2.6 * size, height: 1.9 * size };
    case "rock":
      // Loose stone: a squashed lump a third of itself in the ground.
      return { radius: 0.85 * size, height: 1.05 * size };
    case "boulder":
      // A deep-wild boulder — it takes real air to clear one.
      return { radius: 1.9 * size, height: 2.1 * size };
    case "parapet":
      // One bay of a wall — see PARAPET_BAY for why the circle is fatter
      // than the concrete is thick.
      return { radius: PARAPET_RADIUS * size, height: PARAPET_HEIGHT * size };
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
    case "parapet":
      // The bay the renderer draws: a metre of wall, half a metre thick,
      // standing to the top of a door handle.
      return PARAPET_BAY * PARAPET_THICK * height;
    case "log":
      // A trunk lying down: its collision circle is the length it covers,
      // its height the thickness of the bole.
      return Math.PI * (height / 2) * (height / 2) * (radius * 2);
    case "rootlog": {
      // Its height is the PLATE standing on end, not the bole, so the
      // trunk is measured from its own drawn radius instead — plus the
      // disc of roots at the butt.
      const bole = 0.32 * size;
      const plate = 1 * size;
      return Math.PI * bole * bole * (radius * 2) + Math.PI * plate * plate * (0.34 * size);
    }
    case "timber":
      // Fourteen logs of a quarter-metre radius over the stack's length —
      // the courses the renderer actually builds.
      return 14 * Math.PI * 0.25 * 0.25 * (radius * 2) * size * size;
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

/** The road samples this needs to build a parapet — a structural shape, so
 * a stage sample satisfies it without solids.ts having to know what a track
 * is. `deck` is only ever tested for being set. */
type DeckSample = {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  s: number;
  deck: unknown;
};

/** R13 — the PARAPET a concrete deck carries, as solids: one bay every
 * `PARAPET_BAY` metres down both edges of every concrete deck in
 * `samples[from..to)`.
 *
 * This is the one wall on a stage that is there on purpose. Everywhere else
 * R31 cuts the ground back to something a car can climb; here the whole
 * point is that it cannot — over the side is a drowning (R13), so the
 * bridge is a place you have to be accurate, and the wall has to be as
 * solid as it looks. Cast onto the deck and immovable: a car that arrives
 * at one sideways stops there.
 *
 * The bays are walked by ARC LENGTH rather than per sample, because the
 * sample spacing is only approximately `SAMPLE_STEP` and a run of solids
 * with a gap in it is worse than no run at all — a nose finds the gap, and
 * behind it is the river. One function, read by the engine's contact model
 * and by the renderer that draws the same bays in the same places.
 *
 * A TIMBER deck's rail is not this: it is posts and a rail, and a car goes
 * through it. */
export function bridgeParapets(
  samples: DeckSample[],
  width: number,
  from = 0,
  to = samples.length,
): WildObstacle[] {
  const out: WildObstacle[] = [];
  const lat = width / 2 + PARAPET_OUT;
  let i = Math.max(0, from);
  while (i < to) {
    if (samples[i].deck !== "concrete") {
      i++;
      continue;
    }
    let j = i;
    while (j < samples.length && samples[j].deck === "concrete") j++;
    const startS = samples[i].s;
    const endS = samples[j - 1].s;
    let k = i;
    for (let s = startS; s <= endS; s += PARAPET_BAY) {
      while (k + 1 < j && samples[k + 1].s <= s) k++;
      const a = samples[k];
      const b = samples[Math.min(k + 1, j - 1)];
      const run = b.s - a.s;
      const t = run > 1e-6 ? (s - a.s) / run : 0;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.elevation + (b.elevation - a.elevation) * t;
      const right = { x: Math.cos(a.heading), z: -Math.sin(a.heading) };
      for (const side of [-1, 1]) {
        out.push(
          standSolid({
            x: x + right.x * lat * side,
            z: z + right.z * lat * side,
            y,
            kind: "parapet",
            size: 1,
            // The bay's own heading, turned about-face on the LEFT side of
            // the road. A box does not care which way round it is, but the
            // sign does: it makes `rightOf(spin)` point OUT of the road for
            // every bay, so the wall's inner face is one subtraction away
            // wherever it stands (PARAPET_INSET) and nothing downstream has
            // to remember which order the pairs came out in.
            spin: side < 0 ? a.heading + Math.PI : a.heading,
          }),
        );
      }
    }
    i = j;
  }
  return out;
}
