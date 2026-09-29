// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A KIND OF PROP IS HANDED (`make blender KIND=prop`, `scripts/blender.mjs`):
// every id's SKELETON — the parts the code's own factory lays for it,
// caught through `GeoBuilder.onMake` (the factory makes its own builder,
// so the driver's trace is hung on every builder made during the call:
// every box, cylinder, cone and blob with its whole frame,
// `TracedPart.m`), painted in ROLES: a key of the module's own tint table,
// `paint` for the part a vehicle is painted in, or a colour's own value
// where the factory tinted a one-off — and, for the stills alone, what
// colour each role is, in linear light. `scripts/blender/prop.py` models
// each part where the code has it and never states a number of its own.
//
// All in the code geometry's own frame and metres: y up, the nose along
// +z, as each factory stands its thing.

/** One kind's data. Call `aliasEngine` first: the game's modules spell the
 * engine `@engine`. */
export async function propModelData(kind) {
  const THREE = await import("three");
  const { createRng, TRAFFIC_MODELS } = await import("../../engine/index.ts");
  const { GeoBuilder } = await import("../../pwa/src/game/flora-build.ts");
  const { PROP_KINDS } = await import("../../pwa/src/game/prop-models.ts");
  const ids = PROP_KINDS[kind];
  if (!ids) throw new Error(`no kind of prop "${kind}"`);
  const rng = createRng(0x9e3779b9);
  const rand = () => rng.next();

  /** Each kind: its roles (colour → name), and a factory an id's geometry
   * comes out of — with, for a painted thing, the paint's colour object,
   * so its faces are named `paint`. */
  const KINDS = {
    traffic: async () => {
      const f = await import("../../pwa/src/game/traffic-fleet.ts");
      return {
        tints: f.TRAFFIC_TINT,
        build: (id) => {
          const m = TRAFFIC_MODELS.find((x) => x.id === id);
          const paint = f.trafficPaintColor(m, 0);
          return {
            geometry: f.trafficVehicleGeometry(m, 0, rand),
            paint,
            extras: { body: m.body },
          };
        },
      };
    },
    train: async () => {
      const f = await import("../../pwa/src/game/train.ts");
      const { STAGE_RULES } = await import("../../engine/index.ts");
      const length = STAGE_RULES.rail.train.length;
      return {
        tints: f.TRAIN_PAINT,
        build: (id) => ({ geometry: f.trainCarGeometry({ kind: id, length: length[id] }, rand) }),
      };
    },
    farm: async () => {
      const f = await import("../../pwa/src/game/farm-gear.ts");
      return {
        tints: f.FARM_TINT,
        build: (id) => {
          if (id === "bale" || id === "baleWrapped") {
            return { geometry: f.baleGeometry(id === "baleWrapped", rand) };
          }
          const gear = { kind: id, x: 0, y: 0, z: 0, heading: 0, roll: 0.3 };
          const paint = f.tractorPaint(gear.roll);
          return { geometry: f.farmGearGeometry(gear, rand, paint), paint };
        },
      };
    },
    livestock: async () => {
      const f = await import("../../pwa/src/game/livestock.ts");
      return {
        tints: f.STOCK_TINT,
        build: (id) => {
          const breed = id.replace(/(Graze|Stand)$/, "");
          const pose = id.endsWith("Graze") ? "graze" : "stand";
          const r = createRng(0x5a1d7e33);
          return {
            geometry: breed === "sheep" ? f.sheepGeometry(pose, r) : f.cowGeometry(breed, pose, r),
            extras: { breed, pose },
          };
        },
      };
    },
    energy: async () => {
      const w = await import("../../pwa/src/game/wind-farm.ts");
      const s = await import("../../pwa/src/game/solar-farm.ts");
      return {
        tints: { ...w.WIND_TINT, ...s.SOLAR_TINT },
        build: (id) => ({
          geometry:
            id === "nacelle"
              ? w.nacelleGeometry(rand)
              : id === "rotor"
                ? w.rotorGeometry(w.MODEL_ROTOR, rand)
                : id === "solarTable"
                  ? s.tableGeometry(rand)
                  : s.cabinGeometry(rand),
        }),
      };
    },
    stone: async () => {
      const w = await import("../../pwa/src/game/wild.ts");
      return {
        tints: {},
        build: () => {
          const b = new GeoBuilder(rand);
          b.add(w.stoneGeometry(0x888888, false), new THREE.Color(0x888888));
          return {
            geometry: b.build(),
            extras: { note: "a unit lump: the wild seats and scales it" },
          };
        },
      };
    },
    crowd: async () => {
      const c = await import("../../pwa/src/game/crowd.ts");
      return {
        tints: {},
        build: (id) => {
          const b = new GeoBuilder(rand);
          b.add(c.figurePart(id), new THREE.Color(0xffffff));
          return { geometry: b.build() };
        },
      };
    },
    roadside: async () => {
      const k = await import("../../pwa/src/game/kerbs.ts");
      const c = await import("../../pwa/src/game/cones.ts");
      return {
        tints: { ...k.MARKER_TINT, ...c.CONE_TINT },
        build: (id) => ({
          geometry:
            id === "cone" || id === "tallCone"
              ? c.coneGeometry(id === "tallCone")
              : k.markerGeometry(id),
        }),
      };
    },
  };
  const make = KINDS[kind];
  if (!make) throw new Error(`no data for the prop kind "${kind}"`);
  const { tints, build } = await make();
  const names = new Map(Object.entries(tints).map(([n, c]) => [c, n]));
  const WHITE = new THREE.Color(0xffffff);

  const variants = ids.map((id) => {
    const parts = [];
    const roles = new Map(names);
    GeoBuilder.onMake = (b) => {
      b.trace = { parts, names: roles };
    };
    let made;
    try {
      // The paint is named before the factory draws with it.
      const probe = { paint: null };
      made = build(id, probe);
      if (made.paint) roles.set(made.paint, "paint");
    } finally {
      GeoBuilder.onMake = null;
    }
    // A factory that took its paint before the trace could name it: name it
    // now, over the parts already traced.
    if (made.paint) {
      const hex = `#${made.paint.getHexString()}`;
      for (const p of parts) {
        if (p.paint === hex) p.paint = "paint";
        else if (Array.isArray(p.paint)) p.paint = p.paint.map((n) => (n === hex ? "paint" : n));
      }
    }
    const g = made.geometry;
    g.computeBoundingBox();
    const box = g.boundingBox;
    const tris = g.getAttribute("position").count / 3;
    g.dispose();
    return {
      id,
      parts,
      tris,
      bounds: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] },
      ...(made.extras ?? {}),
    };
  });
  // Every role the builder may paint: the module's whole tint table (a
  // builder adds a role the skeleton did not carry — a cone's band, a
  // stake's white cap), the paint, and every one-off the parts were tinted.
  const used = new Set([
    ...Object.keys(tints),
    ...variants.flatMap((v) =>
      v.parts.flatMap((p) => (typeof p.paint === "string" ? [p.paint] : [...p.paint])),
    ),
  ]);
  const rgb = (c) => [c.r, c.g, c.b];
  const paint = Object.fromEntries(
    [...used].map((n) => [
      n,
      {
        rgb: rgb(
          n === "paint"
            ? new THREE.Color(0xd8352a)
            : n.startsWith("#")
              ? new THREE.Color(n)
              : (tints[n] ?? WHITE),
        ),
      },
    ]),
  );
  return { kind, variants, paint };
}
