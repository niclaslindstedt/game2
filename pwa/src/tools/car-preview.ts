// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car preview harness — the page scripts/car-preview.mjs drives. Reads
// /variants.json ({ cars: [{ id, spec }] }), builds each car with the real
// in-game builder, and renders a contact sheet: one row per car, one
// column per view — the chase-cam gaming angle first (straight and mid-
// drift), then turntable angles for judging the shape. Sets window.__done
// so the screenshot tool knows the sheet is on screen.

import * as THREE from "three";

import type { CarDamage, GameState } from "@engine";

import { buildCarBody, crewSeats, type CarBodySpec } from "../game/car-body.ts";
import type { CrewLook } from "../game/car-crew.ts";
import { createCarDamage } from "../game/car-damage.ts";
import { createDirtPainter, wheelSpray, type DirtCoat } from "../game/car-dirt.ts";
import { gravelTexture } from "../game/textures.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

type Variant = {
  id: string;
  spec: CarBodySpec;
  crew?: CrewLook;
  /** THE WRECK LAB (`--wrecks`): a damage ledger written by hand, in the
   * engine's own metres, for the real damage visual to bend this body from
   * — the row is that accident, and nothing about it is simulated. */
  damage?: CarDamage;
};

type View = {
  name: string;
  fov: number;
  /** Chase-cam replica: fixed behind-the-car position; yaw turns the CAR
   * so the drift angle shows exactly as it does in game. */
  game?: { carYaw: number };
  /** Turntable: azimuth from the nose, elevation, distance in car lengths. */
  orbit?: { az: number; el: number; dist: number };
  /** A true ELEVATION: an orthographic camera level with the car at this
   * azimuth, with `span` metres across the cell — so a pixel is a known
   * fraction of a metre and the picture can be laid over a reference
   * photograph and measured against it, which a perspective cell cannot. */
  elevation?: { az: number; span: number };
  /** Aimed at a SEAT rather than at the car, with the distance in metres:
   * the crew sheet is a portrait of two people 400 mm apart, and a frame
   * measured in car lengths cannot get near enough to judge one. */
  cabin?: { seat: "driver" | "coDriver" | "pair"; az: number; el: number; dist: number };
  /** Take the glass off first. A helmet seen through a tinted pane is the
   * honest read and the useless one to iterate against — this is the column
   * that shows what was actually built. */
  bare?: boolean;
  /** Bake this much grime onto the car before rendering. Dirt only ever
   * accumulates, so a dirty view has to come after every clean one. */
  dirt?: DirtCoat;
};

/** Never on the default sheet; asked for by name (`--views "elevation
 * side"`) when a body is being measured rather than judged. The cell is
 * 4.6 m across and centred 0.7 m up, whatever its size, so the scale is
 * cell width / 4.6 pixels a metre and the ground is a known line. */
const ELEVATION_VIEWS: View[] = [
  { name: "elevation side", fov: 0, elevation: { az: Math.PI / 2, span: 4.6 } },
  { name: "elevation front", fov: 0, elevation: { az: 0, span: 4.6 } },
  { name: "elevation rear", fov: 0, elevation: { az: Math.PI, span: 4.6 } },
];

const VIEWS: View[] = [
  { name: "game", fov: 64, game: { carYaw: 0 } },
  { name: "game drift", fov: 64, game: { carYaw: 0.55 } },
  { name: "front 3/4", fov: 35, orbit: { az: 0.62, el: 0.26, dist: 1.55 } },
  { name: "side", fov: 35, orbit: { az: Math.PI / 2, el: 0.1, dist: 1.45 } },
  { name: "rear 3/4", fov: 35, orbit: { az: Math.PI - 0.62, el: 0.28, dist: 1.55 } },
  { name: "top", fov: 35, orbit: { az: 0.4, el: 1.15, dist: 1.5 } },
  // A stage's worth of grime, in the view that has to survive it.
  {
    name: "dirty",
    fov: 35,
    orbit: { az: 0.62, el: 0.26, dist: 1.55 },
    dirt: { dust: 0.85, mud: 0.6 },
  },
  // Dead astern and clean: the tail is the panel the chase camera holds for
  // a whole stage, so it is the one that has to survive being looked at
  // square on — lamps, tailgate, valance and the wing's own line, none of
  // which a three-quarter view tells the truth about.
  { name: "rear", fov: 35, orbit: { az: Math.PI, el: 0.16, dist: 1.3 } },
  // Dead astern, because the back window is the one panel of the car the
  // player looks at for a whole stage — and because the fan a single wiper
  // cuts out of a caked screen is a SHAPE, which is only a shape from
  // square on. Every other cell here can be judged at three quarters; this
  // one cannot.
  {
    name: "dirty rear",
    fov: 35,
    orbit: { az: Math.PI, el: 0.16, dist: 1.15 },
    dirt: { dust: 0.9, mud: 0.35 },
  },
];

/** The crew sheet's own columns (`--crew`): both seats close up with the
 * glass off, the driver through it as the player will actually see them, the
 * pair from behind — which is where a chased car is read from — and the game
 * view, the reminder of how little of any of this survives. */
const CREW_VIEWS: View[] = [
  {
    name: "driver",
    fov: 30,
    cabin: { seat: "driver", az: -0.9, el: 0.12, dist: 1.25 },
    bare: true,
  },
  {
    name: "map reader",
    fov: 30,
    cabin: { seat: "coDriver", az: 0.9, el: 0.12, dist: 1.25 },
    bare: true,
  },
  {
    name: "driver, ahead",
    fov: 30,
    cabin: { seat: "driver", az: -0.2, el: 0.16, dist: 1.4 },
    bare: true,
  },
  { name: "through the glass", fov: 30, cabin: { seat: "driver", az: -0.9, el: 0.12, dist: 1.35 } },
  { name: "the pair", fov: 34, cabin: { seat: "pair", az: 0.12, el: 0.24, dist: 2.2 } },
  { name: "game", fov: 64, game: { carYaw: 0.35 } },
];

/** The wreck sheet's columns: the chase camera first, because that is the
 * only view of the damage a player ever holds — then the turntable, at the
 * angles that show a nose, a flank, a tail and a roof. */
const WRECK_VIEWS: View[] = [
  { name: "game", fov: 64, game: { carYaw: 0 } },
  { name: "front 3/4", fov: 35, orbit: { az: 0.62, el: 0.26, dist: 1.55 } },
  { name: "side", fov: 35, orbit: { az: Math.PI / 2, el: 0.1, dist: 1.45 } },
  { name: "rear 3/4", fov: 35, orbit: { az: Math.PI - 0.62, el: 0.28, dist: 1.55 } },
  { name: "top", fov: 35, orbit: { az: 0.4, el: 1.15, dist: 2.1 } },
];

/** How long a staged wreck's torn-off pieces are given to land, s, at the
 * frame rate they are stepped at: they are thrown from the car on the first
 * update and have to be lying on the ground by the time the shutter goes. */
const DEBRIS_SETTLE = 4;
const DEBRIS_HZ = 60;

const DEFAULT_CELL = { w: 440, h: 310 };

function byName(views: View[], name: string): View {
  const view = views.find((v) => v.name === name);
  if (!view) throw new Error(`unknown view: ${name} (have ${views.map((v) => v.name).join(", ")})`);
  return view;
}

/** Bend a freshly built body to a hand-written ledger, the way the game
 * bends the player's car to the engine's: the damage visual reads the
 * ledger whole on its first update (every fold, and every part it says is
 * off), and the pieces it throws are then stepped until they lie still on
 * the studio floor. The body is left sitting as crooked as its wheels
 * leave it, which in the game is car-mesh.ts's job. */
function stageWreck(
  car: ReturnType<typeof buildCarBody>,
  damage: CarDamage,
  scene: THREE.Scene,
): void {
  const state = {
    car: { damage, heading: 0, u: 0, w: 0 },
    terrain: { groundAt: () => 0 },
  } as unknown as GameState;
  const visual = createCarDamage(car);
  scene.add(visual.debris);
  for (let n = 0; n < DEBRIS_SETTLE * DEBRIS_HZ; n++) visual.update(state, 1 / DEBRIS_HZ);
  car.chassis.position.y += visual.pose.drop;
  car.chassis.rotation.x = -visual.pose.pitch;
  car.chassis.rotation.z = visual.pose.roll;
}

async function main(): Promise<void> {
  const res = await fetch("/variants.json");
  const {
    cars,
    mode,
    views: only,
    cell,
  } = (await res.json()) as {
    cars: Variant[];
    mode?: "crew" | "wrecks";
    views?: string[];
    cell?: { w: number; h: number };
  };
  const CELL_W = cell?.w ?? DEFAULT_CELL.w;
  const CELL_H = cell?.h ?? DEFAULT_CELL.h;
  const all = mode === "crew" ? CREW_VIEWS : mode === "wrecks" ? WRECK_VIEWS : VIEWS;
  // A narrowed sheet is not a nicety: eight columns of a whole catalog come
  // back scaled to fit whatever is reading them, and a cell judged at a
  // third of its size is a cell nobody judged. Naming the columns a change
  // is about is what keeps them full size.
  const views = only?.length ? only.map((n) => byName([...all, ...ELEVATION_VIEWS], n)) : all;

  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const width = CELL_W * views.length;
  const height = CELL_H * cars.length;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height, true);
  renderer.setScissorTest(true);

  const labels = document.getElementById("labels") as HTMLDivElement;
  const addLabel = (text: string, col: number, row: number, dy = 0): void => {
    const div = document.createElement("div");
    div.className = "label";
    div.textContent = text;
    div.style.left = `${col * CELL_W}px`;
    div.style.top = `${row * CELL_H + dy}px`;
    labels.appendChild(div);
  };

  const camera = new THREE.PerspectiveCamera(60, CELL_W / CELL_H, 0.1, 300);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);

  cars.forEach((variant, row) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#3fa9f5");
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshBasicMaterial({ map: gravelTexture() }),
    );
    (ground.material.map as THREE.Texture).repeat.set(48, 48);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const car = buildCarBody(variant.spec, { crew: variant.crew });
    // The pane itself, so a crew view can take it off. It is found rather
    // than handed out: the glass is one mesh in the cabin group carrying the
    // one material car-body.ts names, and the builder owes a preview tool no
    // API of its own.
    let glassMesh: THREE.Object3D | null = null;
    car.cabin.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material === car.glass) glassMesh = obj;
    });
    scene.add(car.group);
    const dirty = createDirtPainter(car.group, wheelSpray(variant.spec));
    if (variant.damage) stageWreck(car, variant.damage, scene);

    const zs = variant.spec.profile.map((p) => p.z);
    const length = Math.max(...zs) - Math.min(...zs);

    // Where the crew views are aimed: a head, at the height a head sits.
    const seats = crewSeats(variant.spec);
    const aim = (seat: "driver" | "coDriver" | "pair"): THREE.Vector3 => {
      const s = seat === "coDriver" ? seats.coDriver : seats.driver;
      return new THREE.Vector3(seat === "pair" ? 0 : s.x, s.sillY + 0.13, s.z + 0.02);
    };

    views.forEach((view, col) => {
      if (view.dirt) {
        dirty(view.dirt);
        // The screens soil on their own clock (car/wipers.ts), so a dirty
        // car with showroom glass is a lie the sheet would tell every time.
        // Half a kilometre of gravel in one step — the screens soil by the
        // METRE, so a step with no distance in it puts nothing on them —
        // and then TEN SECONDS parked, a frame at a time, wiping what that
        // drive left. The blades run on demand and wait between
        // strokes on a dry screen (car/wipers.ts's `REST.dry`), so a handful
        // of frames catches them parked in the middle of that wait and the
        // sheet photographs a screen nobody has wiped. Ten seconds is longer
        // than the wait, so every cell lands on or just after a stroke —
        // which is the state worth looking at, because the swept fan is the
        // whole look of a rally car's glass.
        // Gravel under the wheels for that half kilometre (`glassSpray`'s
        // calibration point), scaled by how filthy this cell's car is meant
        // to be, and then a still car on a surface throwing nothing while
        // the blades do their work.
        const spray = Math.max(view.dirt.dust, view.dirt.mud);
        car.wipers.update(0, spray, 500, 20);
        for (let n = 0; n < 500; n++) car.wipers.update(0, 0, 0, 0.02);
      }
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      let eye: THREE.Camera = camera;
      if (glassMesh) (glassMesh as THREE.Object3D).visible = !view.bare;
      if (view.cabin) {
        car.group.rotation.y = 0;
        const { seat, az, el, dist } = view.cabin;
        const target = aim(seat);
        camera.position.set(
          target.x + Math.sin(az) * Math.cos(el) * dist,
          target.y + Math.sin(el) * dist,
          target.z + Math.cos(az) * Math.cos(el) * dist,
        );
        camera.lookAt(target);
      } else if (view.game) {
        car.group.rotation.y = view.game.carYaw;
        camera.position.set(0, 2.5, -7.2);
        camera.lookAt(0, 1.05, 6);
      } else if (view.orbit) {
        car.group.rotation.y = 0;
        const { az, el, dist } = view.orbit;
        const d = dist * length;
        const target = new THREE.Vector3(0, 0.62, 0);
        camera.position.set(
          target.x + Math.sin(az) * Math.cos(el) * d,
          target.y + Math.sin(el) * d,
          target.z + Math.cos(az) * Math.cos(el) * d,
        );
        camera.lookAt(target);
      } else if (view.elevation) {
        car.group.rotation.y = 0;
        const { az, span } = view.elevation;
        const half = span / 2;
        const centreY = 0.7;
        ortho.left = -half;
        ortho.right = half;
        ortho.top = half * (CELL_H / CELL_W);
        ortho.bottom = -half * (CELL_H / CELL_W);
        ortho.updateProjectionMatrix();
        ortho.position.set(Math.sin(az) * 20, centreY, Math.cos(az) * 20);
        ortho.lookAt(0, centreY, 0);
        eye = ortho;
      }
      const y = height - (row + 1) * CELL_H;
      renderer.setViewport(col * CELL_W, y, CELL_W, CELL_H);
      renderer.setScissor(col * CELL_W, y, CELL_W, CELL_H);
      renderer.render(scene, eye);
      if (row === 0) addLabel(view.name, col, 0);
    });
    addLabel(variant.id, 0, row, 20);
  });

  window.__done = true;
}

void main();
