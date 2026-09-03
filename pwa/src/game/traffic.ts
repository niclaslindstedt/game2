// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAFFIC (R44), drawn. The engine owns everything that matters about
// it — the routes, the signs, where every vehicle is this step and what
// hitting one costs (`engine/game/traffic.ts`). This module dresses that:
// one merged mesh per vehicle, keyed by the vehicle's id and posed every
// frame from the state, and the speed limit signs the engine stood, built
// once per plan. Its own manager outside the road chunks, because a lorry
// two kilometres up a public road is nowhere near any chunk, and because
// it moves.

import * as THREE from "three";
import { TRAFFIC_MODELS, type GameState, type SpeedSign } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture, speedSignTexture } from "./textures.ts";
import { trafficPaint, trafficVehicleGeometry } from "./traffic-fleet.ts";

/** How far from the car a vehicle is still drawn, m — past the fog, so
 * one is never seen to appear. */
const DRAW_RANGE = 900;

/** A sign: the post and the disc on it, m — a rural road's, big enough to
 * be read from the far side of a bend. */
const SIGN = { post: { w: 0.09, h: 2.6 }, disc: 0.9 };

const TINT = { post: new THREE.Color(0x8a8d90) };

const postMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

export type Traffic = {
  group: THREE.Group;
  /** Pose every vehicle off the state, and stand the signs the first time
   * a plan is seen. */
  update: (state: GameState) => void;
  dispose: () => void;
};

/** `rand` is the facet jitter's, seeded off the stage so the same lorry is
 * the same lorry every run; `heightAt` foots the signs on the ground. */
export function createTraffic(
  rand: () => number,
  heightAt: (x: number, z: number) => number,
): Traffic {
  const group = new THREE.Group();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const meshes = new Map<number, THREE.Mesh>();
  const signs = new THREE.Group();
  group.add(signs);
  let signedVersion = -1;
  const seen = new Set<number>();

  const geometryFor = (model: number, paint: number): THREE.BufferGeometry => {
    const key = `${model}:${paint}`;
    const had = geometries.get(key);
    if (had) return had;
    const made = trafficVehicleGeometry(TRAFFIC_MODELS[model], paint, rand);
    geometries.set(key, made);
    return made;
  };

  const standSigns = (list: readonly SpeedSign[]): void => {
    for (const child of [...signs.children]) {
      signs.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (!(child.material as THREE.Material).userData.shared) {
          (child.material as THREE.Material).dispose();
        }
      }
    }
    if (list.length === 0) return;
    // Every post in one mesh; the discs in one mesh per limit posted, so a
    // road with three limits on it is four draw calls however long it is.
    const posts = new GeoBuilder(rand);
    const discs = new Map<number, THREE.BufferGeometry[]>();
    const m = new THREE.Matrix4();
    for (const sign of list) {
      const foot = Math.min(sign.y + 0.5, Math.max(sign.y - 1, heightAt(sign.x, sign.z)));
      const post = new THREE.BoxGeometry(SIGN.post.w, SIGN.post.h, SIGN.post.w);
      post.translate(sign.x, foot + SIGN.post.h / 2, sign.z);
      posts.add(post, TINT.post);
      // The plate is grey from behind — a sign seen from the wrong side is
      // a grey disc, never a mirrored number — and its face looks back
      // down the direction of travel it serves, a little in front of it.
      const discY = foot + SIGN.post.h - SIGN.disc / 2 - 0.05;
      const back = new THREE.CylinderGeometry(SIGN.disc / 2, SIGN.disc / 2, 0.02, 20);
      back.rotateX(Math.PI / 2);
      back.rotateY(sign.heading);
      back.translate(
        sign.x - Math.sin(sign.heading) * (SIGN.post.w / 2 + 0.01),
        discY,
        sign.z - Math.cos(sign.heading) * (SIGN.post.w / 2 + 0.01),
      );
      posts.add(back, TINT.post);
      const disc = new THREE.CircleGeometry(SIGN.disc / 2, 20);
      m.makeRotationY(sign.heading + Math.PI);
      disc.applyMatrix4(m);
      disc.translate(
        sign.x - Math.sin(sign.heading) * (SIGN.post.w / 2 + 0.025),
        discY,
        sign.z - Math.cos(sign.heading) * (SIGN.post.w / 2 + 0.025),
      );
      const into = discs.get(sign.limit) ?? [];
      into.push(disc);
      discs.set(sign.limit, into);
    }
    signs.add(new THREE.Mesh(posts.build(), postMaterial()));
    for (const [limit, parts] of discs) {
      const merged = mergeGeometries(parts);
      const material = new THREE.MeshLambertMaterial({
        map: speedSignTexture(limit),
        transparent: true,
        alphaTest: 0.5,
      });
      signs.add(new THREE.Mesh(merged, material));
    }
  };

  const update = (state: GameState): void => {
    const fleet = state.traffic;
    if (fleet.version !== signedVersion) {
      signedVersion = fleet.version;
      standSigns(fleet.signs);
    }
    seen.clear();
    const car = state.car;
    for (const v of fleet.vehicles) {
      seen.add(v.id);
      let mesh = meshes.get(v.id);
      if (!mesh) {
        const model = TRAFFIC_MODELS[v.model];
        mesh = new THREE.Mesh(geometryFor(v.model, trafficPaint(model, v.id)), postMaterial());
        meshes.set(v.id, mesh);
        group.add(mesh);
      }
      const body = v.car;
      mesh.visible = Math.hypot(body.x - car.x, body.z - car.z) < DRAW_RANGE;
      if (!mesh.visible) continue;
      mesh.position.set(body.x, body.y, body.z);
      mesh.rotation.y = body.heading;
    }
    for (const [id, mesh] of meshes) {
      if (seen.has(id)) continue;
      group.remove(mesh);
      meshes.delete(id);
    }
  };

  const dispose = (): void => {
    for (const mesh of meshes.values()) group.remove(mesh);
    meshes.clear();
    for (const geometry of geometries.values()) geometry.dispose();
    geometries.clear();
    standSigns([]);
  };

  return { group, update, dispose };
}

/** Merge position/normal/uv geometries into one. */
function mergeGeometries(sources: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const size = sources[0].getAttribute(name).itemSize;
    let count = 0;
    for (const geo of sources) count += geo.getAttribute(name).count;
    const merged = new Float32Array(count * size);
    let at = 0;
    for (const geo of sources) {
      const attr = geo.getAttribute(name);
      merged.set(attr.array as ArrayLike<number>, at);
      at += attr.count * size;
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(merged, size));
  }
  // Indexed sources: rebuild one index over the merged vertices.
  const indices: number[] = [];
  let base = 0;
  for (const geo of sources) {
    const index = geo.getIndex();
    const count = geo.getAttribute("position").count;
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + base);
    else for (let i = 0; i < count; i++) indices.push(i + base);
    base += count;
  }
  out.setIndex(indices);
  for (const geo of sources) geo.dispose();
  return out;
}
