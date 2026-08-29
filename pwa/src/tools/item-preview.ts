// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Item preview harness — the page scripts/item-preview.mjs drives. Reads
// /items.json, stands each requested item up on its own turntable and
// renders a contact sheet: one ROW per item, one COLUMN per view.
//
// It exists because most of what this world is made of is never legible in
// a screenshot of a run. A stone is six pixels at the speed you pass it, a
// spectator is a smudge, and the cabin behind the glass — the most detailed
// thing on any car — is seen through a tinted pane from six metres back.
// This is where those get LOOKED at: rotated, measured, and compared with
// the thing beside them.
//
// Every item is built by the real module that draws it in the game
// (item-catalog.ts); this file only decides where the camera stands. Each
// row is FITTED to its own item, so a cushion of moss and a sixteen-metre
// spruce fill their cells equally — which is why every cell carries a metre
// grid and every row its measurements, because otherwise a sheet of things
// framed alike says nothing about how big any of them is.
//
// The sheet is assembled ON A 2D CANVAS, one cell at a time, from a WebGL
// context that is only ever one cell big — and it hands the finished PNG
// back as bytes. Both are for SPEED, which is the whole product here: this
// is a tool somebody runs twenty times in an afternoon. A GL drawing buffer
// the size of the whole sheet is tens of megabytes of software-rasterized
// framebuffer, and letting the tool photograph the page instead means
// resizing the window to the sheet and compositing all of it — together
// they cost more than every render on it.

import * as THREE from "three";
import type { Season } from "@engine";

import { CAR_BODIES } from "../game/car-styles.ts";
import {
  DEFAULT_ITEMS,
  itemCatalog,
  type ItemBuild,
  type ItemDef,
  type ItemView,
} from "./item-catalog.ts";

declare global {
  interface Window {
    __done?: boolean;
    /** What `--list` reads back out of the page. */
    __catalog?: { id: string; group: string; note?: string }[];
    /** ...and what the sheet ended up with, for the tool's own report. */
    __rendered?: string[];
    /** The finished sheet, base64 PNG — the tool writes these bytes out
     * rather than photographing the page. */
    __png?: string;
  }
}

type Config = {
  /** What to photograph: explicit ids, a whole group, or everything. The
   * selection is resolved HERE rather than in the driving script, because
   * the catalog only exists in the page. */
  select: { ids: string[] | null; group: string | null; all: boolean };
  /** Evenly spaced turntable azimuths, or null for the named default seats. */
  turntable: number | null;
  /** How high the turntable sits, radians. */
  elev: number;
  season: Season;
  car: string;
  cell: { w: number; h: number };
  list?: boolean;
};

/** The default columns: enough of a walk round a thing to judge its
 * silhouette from the two angles a player ever sees it at (coming up to it,
 * and passing it), plus the plan view that shows what it is made of. */
const DEFAULT_VIEWS: ItemView[] = [
  { name: "front", orbit: { az: 0, el: 0.18 } },
  { name: "front 3/4", orbit: { az: 0.7, el: 0.24 } },
  { name: "side", orbit: { az: Math.PI / 2, el: 0.18 } },
  { name: "rear 3/4", orbit: { az: Math.PI - 0.7, el: 0.24 } },
  { name: "top", orbit: { az: 0.35, el: 1.2 } },
];

/** Camera fields of view, degrees: the turntable's, and how much of the
 * frame the item's own bounding sphere is asked to fill. A long lens keeps
 * a tree from splaying at the edges; the fill is set where a full-height
 * item still clears the label. */
const FOV = 35;
const FILL = 0.78;

/** The world's own sky behind every item, and the ground the sheet shows
 * where a row has fewer views than the widest one. */
const SKY = "#3fa9f5";
const BACKDROP = "#2b3038";

/** The light the world is lit by (environment.ts). The car's body ignores
 * it — that material is fullbright with its shading baked into the vertices
 * — which is exactly the difference this sheet should show. */
function lightScene(scene: THREE.Scene): void {
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a894, 0.95);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sun.position.set(-0.6, 1, 0.55);
  scene.add(hemi, sun, sun.target);
}

/** The ground under an item, and the metre grid that says how big it is.
 * The grid's cell drops to 10 cm for anything smaller than a wheelbarrow,
 * because a 1 m grid under a fern is one square. */
function buildFloor(box: THREE.Box3, radius: number): { group: THREE.Group; step: number } {
  const group = new THREE.Group();
  const center = box.getCenter(new THREE.Vector3());
  const y = Math.min(0, box.min.y);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x9a8f7d }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, y - 0.002, center.z);
  group.add(ground);

  const step = radius > 1.2 ? 1 : 0.1;
  const span = Math.max(step * 4, Math.ceil((radius * 2.4) / step) * step);
  const grid = new THREE.GridHelper(span, Math.round(span / step), 0x20303a, 0x4a5a63);
  grid.position.set(center.x, y, center.z);
  group.add(grid);
  return { group, step };
}

/** Where the camera stands for one view of one item. A turntable seat is
 * FITTED — the distance comes off the item's own bounding sphere and the
 * narrower of the two field-of-view angles, so nothing is ever cropped and
 * nothing is ever a speck. A placed eye is taken as authored. */
function placeCamera(
  camera: THREE.PerspectiveCamera,
  view: ItemView,
  center: THREE.Vector3,
  radius: number,
): void {
  if (view.eye) {
    camera.fov = view.eye.fov ?? 60;
    camera.updateProjectionMatrix();
    camera.position.copy(view.eye.pos);
    camera.lookAt(view.eye.look);
    return;
  }
  const orbit = view.orbit ?? { az: 0, el: 0.2 };
  camera.fov = orbit.fov ?? FOV;
  camera.updateProjectionMatrix();
  const vertical = (camera.fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const half = Math.min(vertical, horizontal) / 2;
  const dist = radius / (Math.sin(half) * (orbit.fill ?? FILL));
  const { az, el } = orbit;
  camera.position.set(
    center.x + Math.sin(az) * Math.cos(el) * dist,
    center.y + Math.sin(el) * dist,
    center.z + Math.cos(az) * Math.cos(el) * dist,
  );
  camera.lookAt(center);
}

/** Resolve the row list. An explicit id list keeps the order it was asked
 * in — a sheet is a comparison, and which two things sit next to each other
 * is the whole point of one. */
function select(catalog: ItemDef[], sel: Config["select"]): ItemDef[] {
  if (sel.ids) {
    const byId = new Map(catalog.map((item) => [item.id, item]));
    return sel.ids.map((id) => {
      const item = byId.get(id);
      if (!item) throw new Error(`unknown item: ${id}`);
      return item;
    });
  }
  if (sel.group) {
    const rows = catalog.filter((item) => item.group === sel.group);
    if (rows.length === 0) {
      const groups = [...new Set(catalog.map((item) => item.group))].join(", ");
      throw new Error(`unknown group: ${sel.group} (have ${groups})`);
    }
    return rows;
  }
  if (sel.all) return catalog;
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return DEFAULT_ITEMS.map((id) => byId.get(id)!);
}

async function main(): Promise<void> {
  const config = (await (await fetch("/items.json")).json()) as Config;
  const catalog = itemCatalog();

  if (config.list) {
    window.__catalog = catalog.map(({ id, group, note }) => ({ id, group, note }));
    window.__done = true;
    return;
  }

  const items = select(catalog, config.select);
  window.__rendered = items.map((item) => item.id);

  const views =
    config.turntable === null
      ? DEFAULT_VIEWS
      : Array.from({ length: config.turntable }, (_, i) => {
          const az = (i / config.turntable!) * Math.PI * 2;
          return { name: `${Math.round((az * 180) / Math.PI)}°`, orbit: { az, el: config.elev } };
        });

  const car = CAR_BODIES[config.car];
  if (!car) throw new Error(`unknown car id: ${config.car} (have ${Object.keys(CAR_BODIES)})`);

  const built = items.map((item) => ({
    item,
    // Seeded per item rather than per sheet, so adding a row above one never
    // changes the shape of the plant below it.
    build: item.build({ season: config.season, car, rng: seededRng(item.id) }),
  }));
  // An explicit `--turntable` is a request to WALK ROUND the thing, so it
  // replaces an item's own orbit seats — but never its placed eyes, which
  // are not seats on a circle and are usually the reason the item is on the
  // sheet at all.
  const viewsFor = (build: ItemBuild): ItemView[] =>
    config.turntable === null
      ? (build.views ?? views)
      : [...views, ...(build.views ?? []).filter((view) => view.eye)];
  const columns = built.reduce((n, b) => Math.max(n, viewsFor(b.build).length), 1);

  const { w: CELL_W, h: CELL_H } = config.cell;
  const sheet = document.getElementById("stage") as HTMLCanvasElement;
  sheet.width = CELL_W * columns;
  sheet.height = CELL_H * built.length;
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  // One cell's worth of WebGL, blitted into the sheet after every render.
  // `preserveDrawingBuffer` is what makes the blit legal — without it the
  // buffer may already be gone by the time drawImage reads it.
  const cell = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas: cell,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(CELL_W, CELL_H, false);

  const camera = new THREE.PerspectiveCamera(FOV, CELL_W / CELL_H, 0.02, 2000);

  built.forEach(({ item, build }, row) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    lightScene(scene);
    scene.add(build.object);
    build.object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(build.object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = box.getSize(new THREE.Vector3());
    const floor = buildFloor(box, sphere.radius);
    scene.add(floor.group);

    const rowViews = viewsFor(build);
    rowViews.forEach((view, col) => {
      placeCamera(camera, view, sphere.center, sphere.radius);
      renderer.render(scene, camera);
      ctx.drawImage(cell, col * CELL_W, row * CELL_H);
      write(ctx, view.name, col * CELL_W + 8, row * CELL_H + 16, "#cbd6e2");
    });
    build.dispose?.();

    const metres = `${size.x.toFixed(2)} w × ${size.y.toFixed(2)} h × ${size.z.toFixed(2)} d m`;
    const grid = `grid ${floor.step < 1 ? `${floor.step * 100} cm` : "1 m"}`;
    const lines = [`${item.id}  [${item.group}]`, `${metres} · ${grid}`];
    if (item.note) lines.push(item.note);
    lines.forEach((line, i) => {
      write(ctx, line, 8, (row + 1) * CELL_H - 10 - (lines.length - 1 - i) * 15);
    });
  });

  renderer.dispose();
  window.__png = sheet.toDataURL("image/png").slice("data:image/png;base64,".length);
  window.__done = true;
}

/** A line of the sheet's own labelling, over whatever was rendered under
 * it — dark first for a shadow, so white text survives a white car. */
function write(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = "#ffffff",
): void {
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A tiny seeded generator for the one place a build wants randomness — a
 * plant's shape pick. Deterministic per item id, so a row is the same row
 * on every run of the tool. */
function seededRng(key: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

void main();
