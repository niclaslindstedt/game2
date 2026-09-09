// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GATE STANDS ON THE GROUND — every piece of it that is not the arch.
//
// A start/finish gate is set out from the ROAD'S CENTRELINE: the posts at the
// ends of the timing line, the bale walls out past them, the guns further out
// again. By the time it reaches any of them the mat has cambered away, the
// shoulder has stepped down and the verge has leaned off toward the country
// (R16), so the ground under a gate's furniture is most of a metre below the
// elevation the sample it was measured from carries. Foot it on that elevation
// and the whole dressing hangs in the air beside the road — which is what it
// did, and what a player photographed at the start line of seed 11.
//
// So: everything named a foot rests on `TerrainField.groundAt`, the surface
// every other thing in the world stands on, and the arch over the road still
// spans it level with its legs reaching down to whatever they landed on.
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { finishIndex, gateHalfWidth, type TerrainField, type Track } from "@engine";

import {
  ARCH_TOP,
  FOOTED,
  buildGateFurniture,
  buildGateGuns,
} from "../pwa/src/game/gate-furniture.ts";
import { rightOf } from "../pwa/src/game/ribbon.ts";
import { stageTerrain, stageTrack } from "./support/stages.ts";

const SEEDS = [11, 3, 38, 91];

/** The lowest point of a mesh in world space, m — where it actually rests. */
function baseOf(mesh: THREE.Mesh): number {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox as THREE.Box3;
  return mesh.position.y + box.min.y * mesh.scale.y;
}

/** Every piece of a gate that claims to be standing on the ground, with how
 * far above (or below) that ground it actually sits, m. */
function clearances(group: THREE.Group, terrain: TerrainField): number[] {
  const out: number[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== FOOTED) return;
    out.push(baseOf(mesh) - terrain.groundAt(mesh.position.x, mesh.position.z));
  });
  return out;
}

function stage(seed: number): { track: Track; terrain: TerrainField } {
  const track = stageTrack(seed);
  return { track, terrain: stageTerrain(track) };
}

/** A gate's furniture standing on the stage's own ground, guns and all. */
function gateAt(track: Track, index: number, terrain: TerrainField, guns: boolean): THREE.Group {
  const group = new THREE.Group();
  buildGateFurniture(track, index, group, terrain.groundAt);
  if (guns) buildGateGuns(track, index, group, terrain.groundAt);
  return group;
}

describe("the gate stands on the ground beside the road", () => {
  it("foots every piece of a finish gate's dressing on the drawn ground", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed);
      const gaps = clearances(gateAt(track, finishIndex(track), terrain, true), terrain);
      // Two bale walls of three, two posts and four gun plates.
      expect(gaps.length).toBe(12);
      for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(0.05);
    }
  });

  it("foots a start gate's dressing the same way", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed);
      const gaps = clearances(gateAt(track, 2, terrain, false), terrain);
      // A start gate wears the same furniture without the guns.
      expect(gaps.length).toBe(8);
      for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(0.05);
    }
  });

  // The assertions above are only worth having where the two heights actually
  // differ — on a road with no camber, no shoulder and no verge they would
  // pass over the bug that put this file here. They do differ, everywhere: a
  // gate post stands past the mat's edge by the verge's whole width.
  it("is a live check — the ground beside the line is well below the centreline", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed);
      const s = track.samples[finishIndex(track)];
      const half = gateHalfWidth(track);
      const r = rightOf(s.heading);
      const drop = [-1, 1].map(
        (side) => s.elevation - terrain.groundAt(s.x + r.x * half * side, s.z + r.z * half * side),
      );
      expect(Math.max(...drop)).toBeGreaterThan(0.2);
    }
  });

  // A leg that is footed on the ground and still counts off five fixed bands
  // stops short of the banner by however far the ground fell away, and the
  // arch reads as floating instead. The bands divide the leg; the leg reaches
  // the arch.
  it("keeps the arch level over the road, with the legs reaching it", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed);
      const arch = track.samples[finishIndex(track)].elevation + ARCH_TOP;
      const tops: number[] = [];
      gateAt(track, finishIndex(track), terrain, true).traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name === "post") {
          tops.push(mesh.position.y + 0.5 * mesh.scale.y);
        }
      });
      expect(tops.length).toBeGreaterThan(0);
      expect(Math.abs(Math.max(...tops) - arch)).toBeLessThan(0.01);
    }
  });
});
