// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEAM BETWEEN THE PROP THAT STOOD THERE AND THE PIECE THAT COMES OFF IT.
//
// When the engine snaps a solid it hands the renderer a `WildObstacle` and a
// velocity, and breakage.ts stands a stand-in where the thing was. The
// stand-in is allowed to be cruder than the prop it replaces — nobody counts
// the needles on a spruce cartwheeling past the window — but it is NOT
// allowed to be a different size, because the eye has the real one to
// compare it against for the whole frame before the break and the piece is
// still lying on that hillside afterwards.
//
// Nothing else checks that, because the two halves live in different layers:
// the solid's shape is the engine's (`solidShape`), the prop's is the app's
// (flora-species.ts), and the only thing joining them is the arithmetic in
// breakage.ts. So this test reaches across into both — it can, because the
// flora builder and the breakage module are pure geometry: three.js meshes,
// no renderer, no DOM.
//
// The trap it exists for: a collision circle is not a trunk. A fallen log's
// circle is the LENGTH it covers, so a piece cut to `solid.radius` is a
// barrel five metres across, and a standing tree's circle is the trunk plus
// the boughs around it and never comes below 0.3 m — so a piece cut to that
// drops a mature trunk out of a sapling.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createRng, standSolid, type SolidKind, type WildObstacle } from "@engine";

import { createBreakage } from "../pwa/src/game/breakage.ts";
import { GeoBuilder, TRUNK_COLOR } from "../pwa/src/game/flora-build.ts";
import { VARIANTS } from "../pwa/src/game/flora-species.ts";

/** One solid, stood where the tests can find it again. */
function solidOf(kind: SolidKind, size: number, spin = 0): WildObstacle {
  return standSolid({ x: 12, z: -30, y: 4, kind, size, spin, roll: 0.4, grove: 0 });
}

/** The geometry flora.ts builds for a variant. Its rng only jitters colours
 * — no vertex moves for it — so any seed measures the same shape. */
function drawn(id: string): THREE.BufferGeometry {
  const rng = createRng(0x51ded00d);
  const b = new GeoBuilder(() => rng.next());
  VARIANTS[id].build(b);
  return b.build();
}

/** The piece the car breaks off a solid, as the renderer builds it. */
function pieceOf(solid: WildObstacle): THREE.Mesh {
  const fx = createBreakage(TRUNK_COLOR, 0x7a7a70);
  fx.spawn(solid, 0, 0, 0);
  return fx.group.children[0] as THREE.Mesh;
}

type Keep = (x: number, y: number, z: number) => boolean;

function walk(geo: THREE.BufferGeometry, at: (x: number, y: number, z: number) => void): void {
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) at(pos.getX(i), pos.getY(i), pos.getZ(i));
}

/** How fat the wood is about the model's own up axis, over the slice `keep`
 * admits — the measurement for anything built STANDING. */
function girthAboutUp(geo: THREE.BufferGeometry, keep: Keep): number {
  let r = 0;
  walk(geo, (x, y, z) => {
    if (keep(x, y, z)) r = Math.max(r, Math.hypot(x, z));
  });
  return r;
}

/** ...and for anything built LYING along its own x: half the width across
 * it, which no amount of moss or root plate at the ends can inflate. */
function girthAcross(geo: THREE.BufferGeometry, keep: Keep): number {
  let r = 0;
  walk(geo, (x, y, z) => {
    if (keep(x, y, z)) r = Math.max(r, Math.abs(z));
  });
  return r;
}

function extent(geo: THREE.BufferGeometry, axis: "x" | "y"): { min: number; max: number } {
  geo.computeBoundingBox();
  const box = geo.boundingBox as THREE.Box3;
  return { min: box.min[axis], max: box.max[axis] };
}

/** The stand-in's trunk. A low-poly cylinder has vertices only at its two
 * ends, so the fat end of the bole is exactly what a slice at the foot
 * finds — clear of the splintered break at the top and of the two bough
 * stubs above the waist. */
function pieceWood(mesh: THREE.Mesh): { thick: number; long: number } {
  const geo = mesh.geometry;
  const { min, max } = extent(geo, "y");
  return {
    thick: girthAboutUp(geo, (_x, y) => y < min + (max - min) * 0.02),
    long: max - min,
  };
}

describe("the piece a broken solid leaves behind", () => {
  it("is cut to the wood, not to the collision circle it was planted with", () => {
    // A fallen trunk is the case that goes worst wrong: its circle is the
    // LENGTH of the log, so a piece taken from `radius` is as thick as the
    // log is long.
    const log = solidOf("log", 1);
    const logWood = pieceWood(pieceOf(log));
    const drawnLog = drawn("fallenLog");
    // Clear of the moss cushion at its middle, so what is measured is bole.
    const drawnThick = girthAcross(drawnLog, (x) => Math.abs(x) > 0.6);
    expect(logWood.thick).toBeGreaterThan(drawnThick * 0.6);
    expect(logWood.thick).toBeLessThan(drawnThick * 1.6);
    expect(logWood.long).toBeGreaterThan(extent(drawnLog, "x").max - extent(drawnLog, "x").min);
    expect(logWood.long).toBeLessThan(log.radius * 2 * 1.3);

    // The same trunk with its root plate still up on end. Here the engine's
    // HEIGHT is the plate rather than the bole, so a piece taken from it is
    // wrong the other way round.
    const root = solidOf("rootlog", 1);
    const rootWood = pieceWood(pieceOf(root));
    // Clear of the plate, which stands at the butt end of the trunk.
    const drawnRoot = girthAcross(drawn("rootLog"), (x) => x < 2);
    expect(rootWood.thick).toBeGreaterThan(drawnRoot * 0.6);
    expect(rootWood.thick).toBeLessThan(drawnRoot * 1.6);

    // A cut stump is nothing but wood, and its circle IS the bole — the one
    // kind the collision radius was already the right answer for.
    const stumpWood = pieceWood(pieceOf(solidOf("stump", 1)));
    const drawnStump = girthAboutUp(drawn("stump"), (_x, y) => y < 0.05);
    expect(stumpWood.thick).toBeGreaterThan(drawnStump * 0.5);
    expect(stumpWood.thick).toBeLessThan(drawnStump * 1.6);
  });

  it("comes off a fallen trunk lying down, on the line the trunk lay on", () => {
    const spin = 0.9;
    const log = solidOf("log", 1.2, spin);
    const mesh = pieceOf(log);

    // Off the ground by the thickness of the log and no more: a piece that
    // leaves from half its own LENGTH up starts two metres in the air.
    const { thick } = pieceWood(mesh);
    expect(mesh.position.y - log.y).toBeGreaterThan(0);
    expect(mesh.position.y - log.y).toBeLessThan(thick * 1.6);

    // ...and pointing where the log pointed. A fallen trunk's `spin` is the
    // compass BEARING it lies along rather than a free yaw — it puts a
    // blown-over tree down the fall line — and planting.ts turns that
    // bearing into the yaw the model it draws is authored for (its
    // LAID_ALONG_X; this test cannot import that module, which reaches the
    // DOM through the renderer's terrain). What the two have to agree on is
    // the world line, and a bearing of θ is the line through (cos θ, sin θ).
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
    expect(Math.abs(along.y)).toBeLessThan(0.02);
    const bearing = new THREE.Vector3(Math.cos(spin), 0, Math.sin(spin));
    expect(Math.abs(along.dot(bearing))).toBeCloseTo(1, 2);

    // ...and it is a bole and nothing else. A log that has lain there long
    // enough to grow moss has no branches left on it, and a pair of them
    // thrown out sideways is most of what made a piece read as ten times
    // the log it came off.
    const across = extent(mesh.geometry, "x");
    expect(across.max - across.min).toBeLessThan(thick * 2.6);
  });

  it("scales with the tree, so a small one drops a small trunk", () => {
    // The forest plants trunks from about 0.47 to 1.35 (props.ts), and the
    // species drawn over one is picked by its own roll rather than by its
    // size — so the piece has to follow the SIZE, in both dimensions. Taken
    // from the collision circle it barely moves at all: that circle is
    // 0.3 + 0.25 × size, so a tree a third the size drops a trunk two thirds
    // as thick, on a stage where the tree beside it is a sapling.
    const small = pieceWood(pieceOf(solidOf("tree", 0.5)));
    const big = pieceWood(pieceOf(solidOf("tree", 1.35)));
    expect(big.thick / small.thick).toBeCloseTo(2.7, 1);
    expect(big.long / small.long).toBeCloseTo(2.7, 1);

    // ...and it is a TRUNK at both ends of that range: as slim as the wood a
    // spruce of the same size is drawn with, never the pole a fixed
    // thickness on a scaled length turns into.
    const spruce = girthAboutUp(drawn("spruceTall"), (_x, y) => y < 0.05);
    for (const size of [0.5, 1, 1.35]) {
      const wood = pieceWood(pieceOf(solidOf("tree", size)));
      expect(wood.thick).toBeGreaterThan(spruce * size * 0.5);
      expect(wood.thick).toBeLessThan(spruce * size * 1.8);
    }
  });
});

describe("the fallen trunks the forest drops", () => {
  // R-invariant: the renderer draws colliders where the engine put them —
  // never a drawn solid without a collider. Both fallen trunks are authored
  // lying along their own x, and the engine plants them as a circle whose
  // radius is the length they cover, centred on the placement point. A model
  // hung off one end puts half its wood outside its own collider (a log the
  // car drives straight through) and the other half of the circle over bare
  // grass — and the piece that breaks off it jumps a trunk's length sideways
  // the moment it comes loose.
  it.each([
    ["fallenLog", "log"],
    ["rootLog", "rootlog"],
  ])("draws %s over the circle the engine planted it with", (id, kind) => {
    const { min, max } = extent(drawn(id), "x");
    const { radius } = solidOf(kind as SolidKind, 1);
    // Both ends of the circle carry wood, and the model's middle is the
    // point the engine planted it at (the root plate and its stubs stand
    // proud of the bole's own butt, so this is not a tight fit either way).
    expect(min).toBeLessThan(-radius * 0.85);
    expect(max).toBeGreaterThan(radius * 0.85);
    expect(Math.abs((min + max) / 2)).toBeLessThan(radius * 0.5);
  });
});
