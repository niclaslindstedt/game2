// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TREE LAB's page (driven by `scripts/trees-preview.mjs`): every kind of
// tree and every one of its variants, side by side, as one labelled contact
// sheet — a row a kind, a column a variant — through the very geometry and
// the very material the flora draws (`flora.ts`), under the world's light.
//
// IT EXISTS BECAUSE A WOOD HIDES ITS TREES. On a stage a tree is one of a
// thousand, half behind the next, at whatever range the car passed it;
// whether a model reads as its species — and reads as well as the code's
// own — is the one thing a frame of the game cannot answer. Each cell is
// fitted to its own tree and SEEN FROM A CAR: a lens at a driver's eye
// (1.3 m) looking up the tree from as far off as frames it.
//
// `?models=1` draws the MODELLED trees (`tree-models.ts`, the glTFs the lab
// copied beside the page), `?models=compare` each kind's code-built row with
// its modelled row under it, the triangles under every cell; `?sketch=1`
// the models' far sketches (the wild's); `?kinds=pine,birch` a subset;
// `?season=autumn` the year's colours.
//
// Sets `window.__done` (and `window.__png`, the sheet) when it is drawn.

import * as THREE from "three";
import type { Season } from "@engine";

import { codeShape, floraMaterial } from "../game/flora.ts";
import { treeRowsOf } from "../game/flora-tree-rows.ts";
import { TREE_KINDS, type TreeKind } from "../game/flora-trees.ts";
import { loadTreeModels, treeModel } from "../game/tree-models.ts";

/** One cell, px. */
const CELL_W = 200;
const CELL_H = 280;
/** A driver's eye over the ground, m, and the lens's vertical field. */
const EYE = 1.3;
const FOV = 48;
const SKY = "#8fb7da";
const BACKDROP = "#2b3038";

declare global {
  interface Window {
    __done?: boolean;
    __png?: string;
  }
}

const query = new URLSearchParams(location.search);
const sketch = query.get("sketch") === "1";
const models = query.get("models");
const want = query.get("kinds");
const season = (query.get("season") ?? "summer") as Season;
const kinds: readonly TreeKind[] = want
  ? TREE_KINDS.filter((k) => want.split(",").includes(k))
  : TREE_KINDS;

/** Each row: a kind, and whether it is drawn off its models. */
const rows: readonly { kind: TreeKind; model: boolean }[] = kinds.flatMap((kind) =>
  models === "compare"
    ? [
        { kind, model: false },
        { kind, model: true },
      ]
    : [{ kind, model: models === "1" }],
);

function lightScene(scene: THREE.Scene): void {
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a894, 0.95);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sun.position.set(-0.6, 1, 0.55);
  scene.add(hemi, sun, sun.target);
}

function write(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

async function main(): Promise<void> {
  if (models) await loadTreeModels("./");
  const cols = Math.max(...kinds.map((k) => treeRowsOf(k).length));
  const sheet = document.getElementById("stage") as HTMLCanvasElement;
  sheet.width = CELL_W * cols;
  sheet.height = CELL_H * rows.length;
  const ctx = sheet.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const cell = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas: cell,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(CELL_W, CELL_H, false);
  const camera = new THREE.PerspectiveCamera(FOV, CELL_W / CELL_H, 0.05, 4000);
  const material = floraMaterial();
  const ground = new THREE.MeshLambertMaterial({ color: 0x7d8a4e });

  rows.forEach(({ kind, model }, row) => {
    treeRowsOf(kind).forEach((v, col) => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(SKY);
      lightScene(scene);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), ground);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      const modelled = model ? treeModel(v.id, season, sketch) : null;
      const geometry = modelled ?? codeShape(v.id, 0, season);
      const tree = new THREE.InstancedMesh(geometry, material, 1);
      tree.setMatrixAt(0, new THREE.Matrix4().makeRotationY(0.6));
      tree.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(tree);
      geometry.computeBoundingBox();
      const box = (geometry.boundingBox as THREE.Box3).clone();
      const h = Math.max(1, box.max.y);
      const half = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      // Far enough back that the whole tree, and its spread, fits the frame.
      const tall = h / (2 * Math.tan((FOV * Math.PI) / 360)) / 0.82;
      const wide = half / (2 * Math.tan((FOV * Math.PI) / 360) * (CELL_W / CELL_H)) / 0.45;
      const stand = Math.max(tall, wide, 4) + half;
      camera.position.set(0, EYE, stand);
      camera.lookAt(0, h * 0.48, 0);
      renderer.render(scene, camera);
      ctx.drawImage(cell, col * CELL_W, row * CELL_H);
      const tag = model ? (modelled ? (sketch ? " · sketch" : " · model") : " · NO MODEL") : "";
      write(ctx, `${v.id}${tag}`, col * CELL_W + 6, row * CELL_H + 16);
      const tris = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      write(
        ctx,
        `${v.name} · ${h.toFixed(1)} m · ${tris} tris`,
        col * CELL_W + 6,
        (row + 1) * CELL_H - 10,
      );
      if (!modelled) geometry.dispose();
      tree.dispose();
    });
  });
  renderer.dispose();
  window.__png = sheet.toDataURL("image/png").slice("data:image/png;base64,".length);
  window.__done = true;
}

void main();
