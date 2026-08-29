// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ITEM CATALOG — every single thing in the world the preview sheet can
// stand on a turntable and photograph, built by the REAL module that draws
// it in the game. Nothing here models anything: each entry is a few lines
// that call the same builder the road, the wild or the car calls, so a
// picture off this sheet is a picture of what is actually shipped.
//
// The sheet that renders these is item-preview.ts; the tool that drives it
// is scripts/item-preview.mjs. Adding an item is one entry — an id, the
// group it files under and a build function that returns an object standing
// at the origin with its feet on y = 0.

import * as THREE from "three";
import {
  compileTrack,
  standSolid,
  type Season,
  type SolidKind,
  type Stand,
  type WildObstacle,
} from "@engine";

import { biomeFor } from "../game/biome.ts";
import { buildCarBody, type CarBodySpec } from "../game/car-body.ts";
import { buildInterior } from "../game/car/interior.ts";
import { buildWheel } from "../game/car/wheels.ts";
import { createConeField } from "../game/cones.ts";
import { buildCrowd } from "../game/crowd.ts";
import { buildFinishGate, buildStartGate } from "../game/finish-gate.ts";
import { FLORA_IDS, buildFlora } from "../game/flora.ts";
import { markerShape } from "../game/kerbs.ts";
import { stoneGeometry, stoneMatrix } from "../game/wild.ts";

/** Where a camera stands for one column of the sheet. */
export type ItemView = {
  name: string;
  /** A turntable seat: azimuth from the item's front and elevation, both in
   * radians. The DISTANCE is fitted to the item's own bounding sphere, which
   * is what lets a moss cushion and a sixteen-metre spruce share a sheet. */
  orbit?: { az: number; el: number; fov?: number; fill?: number };
  /** ...or a camera placed in the item's own metres, for a view no orbit
   * reaches — sitting in the driver's seat, say. */
  eye?: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number };
};

export type ItemBuild = {
  /** The thing, standing on y = 0 (or wherever its own builder puts it —
   * the sheet frames whatever comes back). */
  object: THREE.Object3D;
  /** Views this item is shot from instead of the sheet's turntable. */
  views?: ItemView[];
  dispose?: () => void;
};

export type ItemContext = {
  season: Season;
  /** The body every car item is built from — `--car` on the tool. */
  car: CarBodySpec;
  /** Seeded, so a given sheet is the same sheet every time. */
  rng: () => number;
};

export type ItemDef = {
  id: string;
  /** What kind of thing it is — `--group` selects a whole one. */
  group: string;
  /** One line under the label: what to LOOK at in this row. */
  note?: string;
  build: (ctx: ItemContext) => ItemBuild;
};

// ── Flora ─────────────────────────────────────────────────────────────────

/** One plant, planted alone. `buildFlora` sinks a base a touch below grade
 * exactly as it does on a stage, so a trunk here sits at the depth the
 * forest's do. */
function floraItem(id: string): ItemDef {
  return {
    id,
    group: "flora",
    build: ({ season, rng }) => {
      const flora = buildFlora([{ id, x: 0, y: 0, z: 0, scale: 1, spin: 0 }], rng, season);
      return { object: flora.group };
    },
  };
}

// ── Stone ─────────────────────────────────────────────────────────────────

/** A wild stone at the size and seat the engine gave it, drawn from the
 * wild's own lump and seated by the wild's own matrix — so what is
 * photographed is what the car hits. `spin` is what varies the grey between
 * two stones on a hillside, so it is the sheet's dial too. */
function stoneItem(kind: SolidKind, mossy: boolean, size: number, spin: number): ItemDef {
  const ground = biomeFor().ground;
  return {
    id: mossy ? `${kind}-mossy` : kind,
    group: "stone",
    note: mossy ? "fifty years in the shade" : "bare rock",
    build: () => {
      const ob: WildObstacle = standSolid({ x: 0, y: 0, z: 0, kind, size, spin });
      const geometry = stoneGeometry(ground.bedrock, mossy);
      const tint = new THREE.Color();
      if (mossy) {
        tint.setScalar(0.75 + (spin % 1) * 0.35);
      } else {
        tint.set(ground.bedrock).multiplyScalar(0.75 + (spin % 1) * 0.35);
        // An outcrop is the bedrock itself showing through, not a stone that
        // rolled here: it takes the darker face.
        if (kind === "slab") tint.lerp(new THREE.Color(ground.bedrockDark), 0.6);
      }
      const material = new THREE.MeshLambertMaterial({ color: tint, vertexColors: mossy });
      const mesh = new THREE.Mesh(geometry, material);
      stoneMatrix(
        ob,
        mesh.matrix,
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin),
        new THREE.Vector3(),
        new THREE.Vector3(),
      );
      mesh.matrixAutoUpdate = false;
      return { object: mesh, dispose: () => material.dispose() };
    },
  };
}

// ── The car, and what is behind its glass ─────────────────────────────────

/** Where a driver's eyes are, measured off the one thing in the cabin whose
 * place is handed out: the steering wheel. The view the interior was
 * authored for is the one through the screen, and no turntable seat reaches
 * it.
 *
 * The offsets are small and they matter: a head sits about 0.4 m behind the
 * rim, so an eye further back than this is INSIDE the driver's helmet and
 * the whole frame is one white facet. Just behind the rim and a little over
 * it clears the helmet and still keeps the wheel's top in shot. */
const EYE_BACK = 0.16;
const EYE_UP = 0.26;

function driversEye(steering: THREE.Object3D | null): ItemView | null {
  if (!steering) return null;
  const w = steering.getWorldPosition(new THREE.Vector3());
  return {
    name: "driver's eye",
    eye: {
      pos: new THREE.Vector3(w.x, w.y + EYE_UP, w.z - EYE_BACK),
      look: new THREE.Vector3(w.x * 0.4, w.y - 0.02, w.z + 12),
      fov: 72,
    },
  };
}

/** The turntable a car-sized thing is worth seeing on — the same seats
 * `make cars` uses for its shape columns, plus the seat over the roof. */
const CAR_ORBITS: ItemView[] = [
  { name: "front 3/4", orbit: { az: 0.62, el: 0.26 } },
  { name: "side", orbit: { az: Math.PI / 2, el: 0.1 } },
  { name: "rear 3/4", orbit: { az: Math.PI - 0.62, el: 0.28 } },
  { name: "top", orbit: { az: 0.4, el: 1.15 } },
];

const CAR_ITEMS: ItemDef[] = [
  {
    id: "car",
    group: "car",
    note: "the whole car — and the cabin through its own glass",
    build: ({ car }) => {
      const parts = buildCarBody(car, { interior: "high" });
      parts.group.updateMatrixWorld(true);
      const eye = driversEye(parts.steering);
      return {
        object: parts.group,
        views: eye ? [...CAR_ORBITS, eye] : CAR_ORBITS,
        dispose: parts.dispose,
      };
    },
  },
  {
    id: "engine-bay",
    group: "car",
    note: "under the bonnet — the panel gone, the way an impact leaves it",
    build: ({ car }) => {
      const parts = buildCarBody(car, { interior: "high" });
      // Exactly what car-damage.ts does on a `partBreak`, minus the tumble:
      // the bonnet is a mesh of its own, and taking it off the chassis is
      // the only way to see what is under it.
      const hood = parts.breakables.hood;
      hood?.removeFromParent();
      parts.group.updateMatrixWorld(true);
      // The bay is a hole in the front of a car, so a turntable that aims
      // at the car's CENTRE never looks into it. These stand where somebody
      // opening the bonnet stands.
      const nose = car.profile[0].z;
      const deck = car.profile[0].topY;
      const bay = new THREE.Vector3(0, deck - 0.15, (nose + car.cabin.cowlZ) / 2);
      return {
        object: parts.group,
        views: [
          {
            name: "over the wing",
            eye: { pos: new THREE.Vector3(1.3, deck + 1.0, nose + 1.1), look: bay, fov: 46 },
          },
          {
            name: "straight down",
            eye: { pos: new THREE.Vector3(0.02, deck + 1.5, bay.z + 0.02), look: bay, fov: 46 },
          },
          {
            name: "over the cowl",
            eye: {
              pos: new THREE.Vector3(-0.2, deck + 0.75, car.cabin.cowlZ - 0.5),
              look: bay,
              fov: 52,
            },
          },
          { name: "front 3/4", orbit: { az: 0.62, el: 0.5 } },
        ],
        dispose: parts.dispose,
      };
    },
  },
  {
    id: "interior",
    group: "car",
    note: "the cabin with the shell taken off it",
    build: ({ car }) => {
      // The body's own material: baked vertex shading on a basic material,
      // so the cabin here is lit exactly as it is behind the glass.
      const material = new THREE.MeshBasicMaterial({ vertexColors: true });
      const interior = buildInterior(car, "high", material);
      const group = interior.group ?? new THREE.Group();
      group.updateMatrixWorld(true);
      const eye = driversEye(interior.steering);
      const views: ItemView[] = [
        { name: "from the door", orbit: { az: Math.PI / 2, el: 0.32 } },
        { name: "over the shoulder", orbit: { az: Math.PI - 0.7, el: 0.5 } },
        { name: "through the screen", orbit: { az: 0.35, el: 0.3 } },
        { name: "plan", orbit: { az: 0.2, el: 1.25 } },
      ];
      if (eye) views.push(eye);
      return {
        object: group,
        views,
        dispose: () => {
          interior.dispose();
          material.dispose();
        },
      };
    },
  },
  {
    id: "wheel",
    group: "car",
    note: "one corner's rim, tyre and face",
    build: ({ car }) => {
      const geometry = buildWheel(car);
      const material = new THREE.MeshBasicMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geometry, material);
      return {
        object: mesh,
        dispose: () => {
          geometry.dispose();
          material.dispose();
        },
      };
    },
  },
];

// ── The roadside ──────────────────────────────────────────────────────────

const ROADSIDE_ITEMS: ItemDef[] = [
  {
    id: "cone",
    group: "roadside",
    note: "the plastic beside a jump lip",
    build: () => {
      const field = createConeField();
      field.plant(0, 0, 0, 0);
      return { object: field.group, dispose: field.dispose };
    },
  },
  ...(["post", "block"] as const).map((kind): ItemDef => ({
    id: `kerb-${kind}`,
    group: "roadside",
    note: kind === "post" ? "orange sides, white top" : "white body, orange ends",
    build: () => {
      const { geometry, materials, lift } = markerShape(kind);
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.position.y = lift;
      return { object: mesh };
    },
  })),
];

// ── What the stage is dressed with ────────────────────────────────────────

/** A dead-straight rig for the things that are built AGAINST a road — the
 * gates stand on a sample, so they need one to stand on. */
function straightTrack(): ReturnType<typeof compileTrack> {
  return compileTrack(7, [{ kind: "straight", length: 200, feature: "none" }]);
}

const STAGE_ITEMS: ItemDef[] = [
  {
    id: "start-gate",
    group: "stage",
    build: () => ({ object: buildStartGate(straightTrack(), 8) }),
  },
  {
    id: "finish-gate",
    group: "stage",
    note: "the gate, its banner and the guns beside it",
    build: () => ({ object: buildFinishGate(straightTrack()).group }),
  },
  {
    id: "spectators",
    group: "stage",
    note: "one knot of a crowd, two rows deep",
    build: () => {
      const stand: Stand = {
        x: 0,
        z: 0,
        facing: 0,
        width: 7,
        rows: 2,
        size: 0.7,
        s: 0,
        finish: false,
      };
      const crowd = buildCrowd([stand], () => 0, 1);
      return { object: crowd.group, dispose: crowd.dispose };
    },
  },
];

/** Every item the sheet knows how to stand up, in the order it lists them. */
export function itemCatalog(): ItemDef[] {
  return [
    ...CAR_ITEMS,
    ...ROADSIDE_ITEMS,
    ...STAGE_ITEMS,
    stoneItem("boulder", false, 1.3, 0.37),
    stoneItem("boulder", true, 1.3, 0.37),
    stoneItem("rock", false, 1.1, 0.62),
    stoneItem("rock", true, 1.1, 0.62),
    stoneItem("slab", false, 1.8, 0.21),
    ...FLORA_IDS.map(floraItem),
  ];
}

/** What a bare `make items` photographs: a spread wide enough to see the
 * whole world's vocabulary on one sheet, without the forty-odd flora rows
 * that `--group flora` is for. */
export const DEFAULT_ITEMS: readonly string[] = [
  "car",
  "interior",
  "wheel",
  "cone",
  "kerb-post",
  "kerb-block",
  "spectators",
  "boulder-mossy",
  "rock",
  "slab",
  "spruceTall",
  "birch",
  "fern",
];
