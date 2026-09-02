// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SOLAR FARM, drawn (R43). The engine decided the fence, how many rows
// of tables stand inside it and how many tables each row holds, where the
// gate is and where the inverter cabin stands (`engine/mapgen/energy.ts`);
// this module builds what it was told. The tables are ONE instanced mesh
// per farm — a big farm is five hundred of them, and five hundred of
// anything is a draw call, not five hundred — every one footed on the
// ground the terrain made and tilted toward the sun's azimuth, so a field
// of them reads as one dark plane cut into stripes, which is what a solar
// farm is from the road. The fence is steel posts and wire, not the
// paddock's roundpoles: nobody fences a power station with spruce.
//
// Everything here is as solid as it looks: the terrain field stands the
// posts, the tables and the cabin's walls up from the same record.

import * as THREE from "three";
import { createRng, solarTables, STAGE_RULES, type SolarFarm, type Track } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box } from "./house.ts";
import type { GroundBeside } from "./road-mesh.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

const S = STAGE_RULES.energy.solar;

const TINT = {
  panel: new THREE.Color(0x101c34),
  panelEdge: new THREE.Color(0x1c2d4f),
  frame: new THREE.Color(0xb8bcc2),
  leg: new THREE.Color(0x8d9298),
  post: new THREE.Color(0x7d8288),
  wire: new THREE.Color(0x5c6166),
  cabin: new THREE.Color(0xcfd2d4),
  cabinRoof: new THREE.Color(0x8a8e92),
  cabinDoor: new THREE.Color(0x3f444a),
};

/** A table: how high its low edge and its high edge stand off the ground
 * (the tilt is the engine's), how thick the panel is, and the legs. */
const TABLE = { low: 0.8, thick: 0.1, leg: 0.12 };
/** The fence: post height and the wires strung between the posts. */
const FENCE = { post: { w: 0.08, h: 2.1 }, wires: [0.5, 1.1, 1.7, 2.0] };
/** The cabin: its height and the door in its long side. */
const CABIN = { h: 2.8, door: { w: 0.9, h: 2.1 } };

const farmMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** One table, in its own frame: the row runs along z, the low edge toward
 * -x (the sun's side), standing on y = 0 at its middle. */
export function tableGeometry(rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const depth = S.row.depth;
  const length = S.row.table;
  const rise = Math.sin(S.tilt) * depth;
  const run = Math.cos(S.tilt) * depth;
  // The panel: a slab tilted about the row's axis, its top the dark glass
  // and its underside the frame's grey.
  const slab = new THREE.BoxGeometry(depth, TABLE.thick, length);
  slab.rotateZ(S.tilt);
  slab.translate(0, TABLE.low + rise / 2, 0);
  b.add(slab, [TINT.panelEdge, TINT.panel]);
  // A lighter rim round the glass, so the tables read as tables and not
  // as one continuous stripe.
  for (const side of [-1, 1]) {
    const rim = new THREE.BoxGeometry(depth + 0.06, TABLE.thick + 0.04, 0.06);
    rim.rotateZ(S.tilt);
    rim.translate(0, TABLE.low + rise / 2, side * (length / 2));
    b.add(rim, TINT.frame);
  }
  // Two legs under the high edge and two under the low, on a beam.
  for (const z of [-length * 0.32, length * 0.32]) {
    b.cyl(TINT.leg, TABLE.leg, TABLE.leg, TABLE.low + rise - 0.1, 0, { x: run / 2 - 0.2, z }, 5);
    b.cyl(TINT.leg, TABLE.leg, TABLE.leg, TABLE.low - 0.05, 0, { x: -run / 2 + 0.2, z }, 5);
  }
  const beam = new THREE.BoxGeometry(run - 0.4, 0.08, 0.08);
  for (const z of [-length * 0.32, length * 0.32]) {
    const bar = beam.clone();
    bar.translate(0, TABLE.low - 0.02, z);
    b.add(bar, TINT.leg);
  }
  beam.dispose();
  return b.build();
}

/** The inverter cabin: a grey box with a door, standing on y = 0. */
export function cabinGeometry(rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const { width, depth } = S.cabin;
  box(b, TINT.cabin, 0, CABIN.h / 2, 0, depth, CABIN.h, width);
  box(b, TINT.cabinRoof, 0, CABIN.h + 0.08, 0, depth + 0.3, 0.16, width + 0.3);
  box(
    b,
    TINT.cabinDoor,
    -depth / 2 - 0.01,
    CABIN.door.h / 2,
    width * 0.25,
    0.04,
    CABIN.door.h,
    CABIN.door.w,
  );
  return b.build();
}

/** Build a solar farm the engine placed, footed on the ground the terrain made. */
export function buildSolarFarm(track: Track, farm: SolarFarm, beside: GroundBeside): THREE.Group {
  const rng = createRng((track.seed ^ 0x3c7d9e21 ^ Math.round(farm.atS)) >>> 0);
  const rand = (): number => rng.next();
  const group = new THREE.Group();

  // The tables, instanced: each turned to its row and footed at its own
  // middle, so a field on a gentle slope steps down it table by table.
  const tables = solarTables(farm);
  const mesh = new THREE.InstancedMesh(tableGeometry(rand), farmMaterial(), tables.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  tables.forEach((t, i) => {
    pos.set(t.x, beside.heightAt(t.x, t.z), t.z);
    q.setFromAxisAngle(up, t.heading);
    m.compose(pos, q, one);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  // The fence: posts and wires between neighbours round the ring, except
  // across the gate's gap; and the cabin inside it.
  const b = new GeoBuilder(rand);
  const { posts } = farm;
  const feet = posts.map((p) => beside.heightAt(p.x, p.z));
  const pitch = S.fence.postPitch;
  posts.forEach((p, i) => {
    box(
      b,
      TINT.post,
      p.x,
      feet[i] + FENCE.post.h / 2 - 0.1,
      p.z,
      FENCE.post.w,
      FENCE.post.h,
      FENCE.post.w,
    );
  });
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i];
    const c = posts[(i + 1) % posts.length];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const run = Math.hypot(dx, dz);
    if (run > pitch * 1.6) continue;
    const heading = Math.atan2(dx, dz);
    const ya = feet[i];
    const yc = feet[(i + 1) % posts.length];
    for (const h of FENCE.wires) {
      const wire = new THREE.BoxGeometry(0.03, 0.03, run);
      wire.rotateX(-Math.atan2(yc - ya, run));
      wire.rotateY(heading);
      wire.translate((a.x + c.x) / 2, (ya + yc) / 2 + h, (a.z + c.z) / 2);
      b.add(wire, TINT.wire);
    }
  }
  if (farm.cabin) {
    const cabin = cabinGeometry(rand);
    cabin.rotateY(farm.cabin.heading);
    cabin.translate(farm.cabin.x, beside.heightAt(farm.cabin.x, farm.cabin.z), farm.cabin.z);
    b.add(cabin, TINT.cabin);
  }
  group.add(new THREE.Mesh(b.build(), farmMaterial()));
  return group;
}
