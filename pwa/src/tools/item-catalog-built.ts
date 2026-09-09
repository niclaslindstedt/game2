// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The half of the item catalog that is BUILT: the house and town plans
// every building placer draws from, the homesteads and their barns, and
// the farm gear standing in the yards. Everything here is a plan handed to
// the same builders the game uses, so a turntable of one is the thing the
// player drives past.

import * as THREE from "three";
import { TRAFFIC_MODELS, type FarmGear, type Paddock, type TrainCar } from "@engine";
import { buildBarn, buildSilo } from "../game/barn.ts";
import { buildBale, buildFarmGear } from "../game/farm-gear.ts";
import { createLivestock } from "../game/livestock.ts";
import { buildFence } from "../game/paddock.ts";
import { cabinGeometry, tableGeometry } from "../game/solar-farm.ts";
import { buildTrainCar } from "../game/train.ts";
import { buildTrafficVehicle, trafficPaint } from "../game/traffic-fleet.ts";
import { speedSignTexture } from "../game/textures.ts";
import { buildPylon } from "../game/powerline.ts";
import { buildTurbine } from "../game/wind-farm.ts";

import { buildBuilding } from "../game/building.ts";
import { buildDwelling } from "../game/chalet.ts";
import { type HousePlan } from "../game/house.ts";
import { buildParkedCar, parkedCarSpec, PARKED_BODIES } from "../game/parked-car.ts";
import { CAR_ORBITS, type ItemDef } from "./item-catalog.ts";

/** Three houses that between them show every choice the plan carries: the
 * paints, the roofs, one and two storeys, a porch and a wing. The plans are
 * written out rather than rolled so the sheet photographs the same houses
 * every time — the engine's dice are tested elsewhere. */
export const HOUSE_PLANS: { id: string; note: string; plan: HousePlan }[] = [
  {
    id: "house-red",
    note: "falu red, clay tile, a storey and a porch",
    plan: {
      kind: "house",
      style: "nordic",
      width: 10.5,
      depth: 7,
      storeys: 1,
      roof: "tile",
      walls: "red",
      porch: true,
      wing: null,
      detail: 0.3,
    },
  },
  {
    id: "house-yellow",
    note: "ochre, black sheet metal, two storeys and a wing",
    plan: {
      kind: "house",
      style: "nordic",
      width: 11.5,
      depth: 8,
      storeys: 2,
      roof: "metal",
      walls: "yellow",
      porch: false,
      wing: { side: 1, width: 5.5, depth: 4.5 },
      detail: 0.72,
    },
  },
  {
    id: "house-white",
    note: "white boards under slate, a wing and a porch",
    plan: {
      kind: "house",
      style: "nordic",
      width: 8.5,
      depth: 6.5,
      storeys: 1,
      roof: "slate",
      walls: "white",
      porch: true,
      wing: { side: -1, width: 4.5, depth: 4 },
      detail: 0.55,
    },
  },
  {
    id: "chalet-slab",
    note: "the alpine chalet: stone below, dark larch above, stone slabs on a low roof, a wing",
    plan: {
      kind: "house",
      style: "chalet",
      width: 10.5,
      depth: 8,
      storeys: 2,
      roof: "slate",
      walls: "red",
      porch: true,
      wing: { side: 1, width: 5, depth: 4.5 },
      detail: 0.35,
    },
  },
  {
    id: "chalet-shingle",
    note: "a small one: a rendered sockel, one timber storey and the gable balcony under shingles",
    plan: {
      kind: "house",
      style: "chalet",
      width: 8.5,
      depth: 7,
      storeys: 1,
      roof: "tile",
      walls: "white",
      porch: false,
      wing: null,
      detail: 0.7,
    },
  },
];

// ── The town (R39) ────────────────────────────────────────────────────────

/** One of each building a village has that a farm has not, written out so
 * the sheet photographs the same ones every time. */
export const TOWN_PLANS: { id: string; note: string; plan: HousePlan }[] = [
  {
    id: "villa",
    note: "the village's best plot: two storeys, a wing, a porch",
    plan: {
      kind: "villa",
      style: "nordic",
      width: 12.5,
      depth: 9,
      storeys: 2,
      roof: "tile",
      walls: "white",
      porch: true,
      wing: { side: 1, width: 6, depth: 5 },
      detail: 0.4,
    },
  },
  {
    id: "apartments",
    note: "three storeys of flats, balconies chequered down the front",
    plan: {
      kind: "apartments",
      style: "nordic",
      width: 20,
      depth: 11,
      storeys: 3,
      roof: "flat",
      walls: "grey",
      porch: false,
      wing: null,
      detail: 0.35,
    },
  },
  {
    id: "grocery",
    note: "one tall storey, glass the whole front, the sign over it",
    plan: {
      kind: "grocery",
      style: "nordic",
      width: 17,
      depth: 12,
      storeys: 1,
      roof: "flat",
      walls: "white",
      porch: false,
      wing: null,
      detail: 0.2,
    },
  },
  {
    id: "post",
    note: "the post office: postal yellow, a canopy, the postbox by the step",
    plan: {
      kind: "post",
      style: "nordic",
      width: 11.5,
      depth: 9,
      storeys: 2,
      roof: "metal",
      walls: "yellow",
      porch: false,
      wing: null,
      detail: 0.1,
    },
  },
  {
    id: "workshop",
    note: "the workshop: a shed with the roller doors in the gable",
    plan: {
      kind: "workshop",
      style: "nordic",
      width: 15,
      depth: 11,
      storeys: 1,
      roof: "metal",
      walls: "green",
      porch: false,
      wing: null,
      detail: 0.6,
    },
  },
];

export const TOWN_ITEMS: ItemDef[] = TOWN_PLANS.map(({ id, note, plan }): ItemDef => ({
  id,
  group: "town",
  note,
  build: ({ rng }) => ({ object: buildBuilding(plan, rng) }),
}));

export const HOMESTEAD_ITEMS: ItemDef[] = [
  ...HOUSE_PLANS.map(({ id, note, plan }): ItemDef => ({
    id,
    group: "homestead",
    note,
    build: ({ rng }) => ({ object: buildDwelling(plan, rng) }),
  })),
  ...PARKED_BODIES.map((body, index): ItemDef => {
    // Walk the roll until it lands on this body, so each row is one kind.
    let roll = index / PARKED_BODIES.length;
    for (let tries = 0; tries < 400 && parkedCarSpec(roll).body !== body; tries++) {
      roll = (roll + 0.0137) % 1;
    }
    return {
      id: `parked-${body}`,
      group: "homestead",
      note: "a car left in the yard",
      build: ({ rng }) => ({ object: buildParkedCar(parkedCarSpec(roll), rng), views: CAR_ORBITS }),
    };
  }),
];

// ── The farms (R37) ───────────────────────────────────────────────────────

/** Three barns that between them show the roofs and the paints, the loft
 * ramp on either gable, a lean-to and a stone byre. */
export const BARN_PLANS: { id: string; note: string; plan: HousePlan }[] = [
  {
    id: "barn-gambrel",
    note: "falu red over a stone byre, gambrel roof, ramp on the right gable, lean-to",
    plan: {
      kind: "barn",
      style: "nordic",
      width: 24,
      depth: 10.5,
      storeys: 2,
      roof: "gambrel",
      walls: "red",
      porch: false,
      wing: { side: -1, width: 7.5, depth: 5 },
      detail: 0.72,
    },
  },
  {
    id: "barn-metal",
    note: "red boards over render, sheet-metal gable, ramp on the left",
    plan: {
      kind: "barn",
      style: "nordic",
      width: 19,
      depth: 9.5,
      storeys: 2,
      roof: "metal",
      walls: "red",
      porch: false,
      wing: null,
      detail: 0.3,
    },
  },
  {
    id: "barn-tarred",
    note: "the black-tarred one, tile roof, the long one",
    plan: {
      kind: "barn",
      style: "nordic",
      width: 27,
      depth: 11,
      storeys: 2,
      roof: "tile",
      walls: "grey",
      porch: false,
      wing: { side: 1, width: 8, depth: 4.5 },
      detail: 0.55,
    },
  },
];

export const GEAR_KINDS: FarmGear["kind"][] = ["tractor", "trailer", "plough", "harrow", "baler"];

/** A paddock on the origin for the fence and the animals to stand in. */
export const ITEM_PADDOCK: Paddock = {
  rect: { x: 0, z: 0, heading: 0, width: 18, depth: 12 },
  stock: "cows",
  head: 5,
  posts: [],
  gate: { x: -6, z: 0, heading: 0 },
  roll: 0.3,
};
for (let k = 0; k < 4; k++) {
  const corners = [
    [-6, -9],
    [6, -9],
    [6, 9],
    [-6, 9],
  ];
  const a = corners[k];
  const b = corners[(k + 1) % 4];
  const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    if (k === 3 && Math.abs(z) < 2.3 && i > 0) continue;
    ITEM_PADDOCK.posts.push({ x, z });
  }
}

export const FARM_ITEMS: ItemDef[] = [
  ...BARN_PLANS.map(({ id, note, plan }): ItemDef => ({
    id,
    group: "farm",
    note,
    build: ({ rng }) => ({ object: buildBarn(plan, rng) }),
  })),
  {
    id: "silo",
    group: "farm",
    note: "a tower silo, the ladder up one side",
    build: ({ rng }) => ({ object: buildSilo(2.6, 12, rng) }),
  },
  ...GEAR_KINDS.map((kind): ItemDef => ({
    id: kind,
    group: "farm",
    note:
      kind === "tractor"
        ? "the yard's tractor — big lugged rear wheels, a tall cab, the stack up the bonnet"
        : kind === "trailer"
          ? "the tipping trailer it pulls"
          : kind === "plough"
            ? "a four-furrow plough, unhitched"
            : kind === "harrow"
              ? "a disc harrow — under the ride-over bar, the car goes over it"
              : "the round baler",
    build: ({ rng }) => ({
      object: buildFarmGear({ kind, x: 0, z: 0, y: 0, heading: 0, roll: 0.37 }, rng),
      views: CAR_ORBITS,
    }),
  })),
  {
    id: "bale",
    group: "farm",
    note: "a round bale, and the wrapped kind beside it",
    build: ({ rng }) => {
      const group = new THREE.Group();
      const straw = buildBale(false, rng);
      straw.position.x = -0.9;
      const wrapped = buildBale(true, rng);
      wrapped.position.x = 0.9;
      group.add(straw, wrapped);
      return { object: group };
    },
  },
  {
    id: "fence",
    group: "farm",
    note: "the paddock's roundpole fence and its gate, part open",
    build: ({ rng }) => ({ object: buildFence(ITEM_PADDOCK, () => 0, rng) }),
  },
  ...(["cows", "sheep"] as const).map((stock): ItemDef => ({
    id: stock,
    group: "farm",
    note:
      stock === "cows"
        ? "a herd: the red-and-white and the black-and-white, grazing and looking about"
        : "a flock of sheep",
    build: () => {
      const livestock = createLivestock();
      livestock.add({ ...ITEM_PADDOCK, stock, head: stock === "cows" ? 6 : 9 }, () => 0, 7);
      livestock.update(0, 0, 0);
      return { object: livestock.group, dispose: livestock.dispose };
    },
  })),
];

// ── The railway (R41) ─────────────────────────────────────────────────────

const TRAIN_CARS: TrainCar[] = [
  { kind: "railbus", length: 24.5 },
  { kind: "loco", length: 15.5 },
  { kind: "timber", length: 19 },
  { kind: "box", length: 15 },
  { kind: "tank", length: 13 },
];

export const RAIL_ITEMS: ItemDef[] = TRAIN_CARS.map((car): ItemDef => ({
  id: `train-${car.kind}`,
  group: "rail",
  note:
    car.kind === "railbus"
      ? "the railbus — cream over red, the Inland Line's own"
      : car.kind === "loco"
        ? "the diesel: a long hood, an orange cab, the road-switcher shape"
        : `a ${car.kind} wagon`,
  build: ({ rng }) => ({ object: buildTrainCar(car, rng), views: CAR_ORBITS }),
}));

/** R44 — the traffic: the twenty vehicles on the public roads, each in
 * its first paint, and the sign that tells them how fast. `vehicles`
 * rather than `traffic`, since `make traffic` already photographs the
 * aircraft. */
export const VEHICLE_ITEMS: ItemDef[] = [
  ...TRAFFIC_MODELS.map((model, index): ItemDef => ({
    id: `traffic-${model.id}`,
    group: "vehicles",
    note: `${model.name.toLowerCase()} — ${model.length} m, ${model.mass} kg`,
    build: ({ rng }) => ({
      object: buildTrafficVehicle(model, trafficPaint(model, index + 1), rng),
      views: CAR_ORBITS,
    }),
  })),
  {
    id: "speed-sign",
    group: "vehicles",
    note: "a speed limit sign, the 70 an open road posts",
    build: () => {
      const group = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 2.6, 0.09),
        new THREE.MeshLambertMaterial({ color: 0x8a8d90 }),
      );
      post.position.y = 1.3;
      group.add(post);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 20),
        new THREE.MeshLambertMaterial({
          map: speedSignTexture(70),
          transparent: true,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      disc.position.set(0, 2.6 - 0.45 - 0.05, 0.05);
      group.add(disc);
      return { object: group };
    },
  },
];

/** R43 — the energy: the machine on the ridge and the tables in the field.
 * Both use the lit material every other built thing does, so the sheet
 * shows them in the world's own light. */
export const ENERGY_ITEMS: ItemDef[] = [
  {
    id: "turbine",
    group: "energy",
    note: "a wind turbine at the band's middle — two hundred metres to the tip, the beacon on the nacelle",
    build: ({ rng }) => ({ object: buildTurbine(rng) }),
  },
  {
    id: "pylon",
    group: "energy",
    note: "R45 — a transmission tower at the band's middle: the Nordic portal, two lattice legs under one crossarm, on its concrete footings",
    build: ({ rng }) => ({ object: buildPylon(rng) }),
  },
  {
    id: "pylon-angle",
    group: "energy",
    note: "the same tower where the line TURNS: the insulator strings pulled out along the line either way instead of hanging, because the wire is anchored into it",
    build: ({ rng }) => ({ object: buildPylon(rng, "angle") }),
  },
  {
    id: "solar-table",
    group: "energy",
    note: "one table of a solar farm: the glass tilted to the sun, the legs and the beam under it",
    build: ({ rng }) => ({
      object: new THREE.Mesh(
        tableGeometry(rng),
        new THREE.MeshLambertMaterial({ vertexColors: true }),
      ),
      views: CAR_ORBITS,
    }),
  },
  {
    id: "solar-cabin",
    group: "energy",
    note: "the inverter cabin inside the fence",
    build: ({ rng }) => ({
      object: new THREE.Mesh(
        cabinGeometry(rng),
        new THREE.MeshLambertMaterial({ vertexColors: true }),
      ),
    }),
  },
];
