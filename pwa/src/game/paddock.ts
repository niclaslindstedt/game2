// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PADDOCK AND THE FIELD (R37), drawn. The engine decided the rectangles
// and every fence post (`engine/mapgen/farms.ts`); this module builds what
// stands on them: the fence as a run of instanced poles with two rails
// strung between neighbours and a five-bar gate hung in the gap, the field
// as a ground-hugging sheet coloured for its crop — turned soil in furrows,
// cut stubble, or standing hay — and the meadow's own grass planted across
// the paddock through the flora, since the engine keeps the forest and the
// scatter off both.
//
// Nothing here is solid: the posts are solids the terrain stands up from
// the same record (a car goes through them and they break), the field's
// surface is the terrain's, and the animals are `livestock.ts`.

import * as THREE from "three";
import { createRng, type CropField, type Paddock, type Season } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { buildFlora, type FloraPlacement } from "./flora.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

/** The roundpole fence: a young spruce pole every few metres, two rails
 * between, a hand over head height at the posts. */
const FENCE = { post: { r: 0.065, h: 1.45 }, rails: [0.5, 1.02], railR: 0.045 };

/** The gate: two heavier posts and five bars, swung part open. */
const GATE = { post: { r: 0.09, h: 1.6 }, bars: 5, h: 1.25, open: 0.55 };

const TINT = {
  pole: new THREE.Color(0x8b7355),
  poleDark: new THREE.Color(0x6a5640),
  gate: new THREE.Color(0x9a8a6a),
  plough: new THREE.Color(0x4a3524),
  ploughLight: new THREE.Color(0x5e4530),
  stubble: new THREE.Color(0xb7a25c),
  stubbleDark: new THREE.Color(0x8f7d45),
  hay: new THREE.Color(0x9fb04e),
  hayDark: new THREE.Color(0x7f9540),
};

const fenceMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);
const postMaterial = shareOne(() => new THREE.MeshLambertMaterial({ color: TINT.pole }));
const fieldMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** The fence round a paddock, footed on the ground the terrain made. */
export function buildFence(
  paddock: Paddock,
  heightAt: (x: number, z: number) => number,
  rand: () => number,
): THREE.Group {
  const group = new THREE.Group();
  const { posts, gate } = paddock;
  // The poles, instanced: one geometry, one call.
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(FENCE.post.r * 0.85, FENCE.post.r, FENCE.post.h, 6),
    postMaterial(),
    posts.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const feet: number[] = [];
  posts.forEach((p, i) => {
    const y = heightAt(p.x, p.z);
    feet.push(y);
    pos.set(p.x, y + FENCE.post.h / 2 - 0.1, p.z);
    q.setFromAxisAngle(up, rand() * Math.PI);
    m.compose(pos, q, one);
    poles.setMatrixAt(i, m);
  });
  poles.instanceMatrix.needsUpdate = true;
  group.add(poles);

  // The rails: between each post and the next round the ring, except
  // across the gate's gap, which is wider than any pitch.
  const b = new GeoBuilder(rand);
  const pitch = posts.length > 1 ? Math.hypot(posts[1].x - posts[0].x, posts[1].z - posts[0].z) : 3;
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
    for (const h of FENCE.rails) {
      const rail = new THREE.CylinderGeometry(FENCE.railR, FENCE.railR, run, 5);
      rail.rotateX(Math.PI / 2);
      // Tilted to follow the ground between the two posts.
      rail.rotateX(-Math.atan2(yc - ya, run));
      rail.rotateY(heading);
      rail.translate((a.x + c.x) / 2, (ya + yc) / 2 + h, (a.z + c.z) / 2);
      b.add(rail, i % 3 === 0 ? TINT.poleDark : TINT.pole);
    }
  }
  // The gate: hung on the near post of the gap, swung part open into the
  // paddock, five bars and a diagonal brace between its two stiles.
  const gy = heightAt(gate.x, gate.z);
  const along = { x: Math.sin(gate.heading), z: Math.cos(gate.heading) };
  const gap = pitch * 1.4;
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(GATE.post.r, GATE.post.r, GATE.post.h, 6);
    post.translate(
      gate.x + along.x * side * (gap / 2),
      gy + GATE.post.h / 2 - 0.1,
      gate.z + along.z * side * (gap / 2),
    );
    b.add(post, TINT.poleDark);
  }
  const hinge = { x: gate.x - along.x * (gap / 2), z: gate.z - along.z * (gap / 2) };
  const swung = gate.heading + GATE.open;
  const leaf = { x: Math.sin(swung), z: Math.cos(swung) };
  const width = gap - 0.3;
  for (let k = 0; k < GATE.bars; k++) {
    const h = 0.25 + (GATE.h - 0.25) * (k / (GATE.bars - 1));
    const bar = new THREE.BoxGeometry(0.06, 0.08, width);
    bar.rotateY(swung);
    bar.translate(hinge.x + leaf.x * (width / 2), gy + h, hinge.z + leaf.z * (width / 2));
    b.add(bar, TINT.gate);
  }
  for (const t of [0.08, 0.92]) {
    const stile = new THREE.BoxGeometry(0.08, GATE.h, 0.08);
    stile.translate(
      hinge.x + leaf.x * width * t,
      gy + GATE.h / 2 + 0.2,
      hinge.z + leaf.z * width * t,
    );
    b.add(stile, TINT.gate);
  }
  const brace = new THREE.BoxGeometry(0.05, 0.07, Math.hypot(width, GATE.h));
  brace.rotateX(Math.atan2(GATE.h, width));
  brace.rotateY(swung);
  brace.translate(
    hinge.x + leaf.x * (width / 2),
    gy + GATE.h / 2 + 0.2,
    hinge.z + leaf.z * (width / 2),
  );
  b.add(brace, TINT.gate);
  group.add(new THREE.Mesh(b.build(), fenceMaterial()));
  return group;
}

/** The field: a sheet laid on the ground and coloured for the crop. A
 * ploughed field is furrowed across its width — stripes of turned soil a
 * furrow's pitch apart, dark and lit — stubble is pale rows on straw, hay
 * is standing green going over. Vertex-coloured so the whole field is one
 * mesh in one call. */
export function buildField(
  field: CropField,
  heightAt: (x: number, z: number) => number,
  rand: () => number,
): THREE.Mesh {
  const { rect, crop } = field;
  const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
  // Fine across (the furrows), coarse along.
  const acrossStep = crop === "hay" ? 2.5 : 0.9;
  const alongStep = 4;
  const nu = Math.max(2, Math.ceil(rect.depth / acrossStep));
  const nv = Math.max(2, Math.ceil(rect.width / alongStep));
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const [light, dark] =
    crop === "plough"
      ? [TINT.ploughLight, TINT.plough]
      : crop === "stubble"
        ? [TINT.stubble, TINT.stubbleDark]
        : [TINT.hay, TINT.hayDark];
  const tint = new THREE.Color();
  for (let i = 0; i <= nu; i++) {
    const u = -rect.depth / 2 + (rect.depth * i) / nu;
    // Every other row is the furrow's shaded side; hay has none.
    const shade = crop === "hay" ? 0.5 + 0.5 * rand() : i % 2 === 0 ? 1 : 0;
    for (let j = 0; j <= nv; j++) {
      const v = -rect.width / 2 + (rect.width * j) / nv;
      const x = rect.x + right.x * u + fwd.x * v;
      const z = rect.z + right.z * u + fwd.z * v;
      // A hair above the ground so it wins the depth test, and a little
      // more on the crests of the furrows.
      const y = heightAt(x, z) + 0.05 + (crop === "plough" ? shade * 0.12 : 0);
      positions.push(x, y, z);
      tint
        .copy(dark)
        .lerp(light, shade)
        .multiplyScalar(0.92 + rand() * 0.16);
      colors.push(tint.r, tint.g, tint.b);
      uvs.push(x / 2, z / 2);
      if (i < nu && j < nv) {
        const a = i * (nv + 1) + j;
        const b2 = a + nv + 1;
        indices.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, fieldMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

/** The meadow: the paddock's own grass, planted through the flora so it
 * sways with the rest of the country, thin enough that the animals read
 * and thick enough that the ground does not read as a lawn. */
export function buildMeadow(
  paddock: Paddock,
  heightAt: (x: number, z: number) => number,
  seed: number,
  season: Season,
): THREE.Group | null {
  const { rect } = paddock;
  const rng = createRng((seed ^ 0x7e3a1c9b ^ Math.round(rect.x * 3 + rect.z)) >>> 0);
  const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
  const count = Math.round((rect.width * rect.depth) / 14);
  const placements: FloraPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const u = rng.range(-rect.depth / 2 + 1, rect.depth / 2 - 1);
    const v = rng.range(-rect.width / 2 + 1, rect.width / 2 - 1);
    const x = rect.x + right.x * u + fwd.x * v;
    const z = rect.z + right.z * u + fwd.z * v;
    placements.push({
      id: rng.chance(0.85) ? "tallGrass" : "heathShrub",
      x,
      y: heightAt(x, z),
      z,
      scale: rng.range(0.55, 0.9),
      spin: rng.range(0, Math.PI * 2),
    });
  }
  if (placements.length === 0) return null;
  return buildFlora(placements, () => rng.next(), season).group;
}
