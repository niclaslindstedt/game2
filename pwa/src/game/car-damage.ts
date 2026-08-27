// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The damage made visible: the engine's crush ledger (state.car.damage)
// bent into the body's actual polygons, and its partBreak events turned
// into pieces tumbling off down the road. The body mesh keeps a pristine
// copy of its vertices; whenever the ledger's version moves, every vertex
// is re-derived from that copy — pulled inward by the crush of the zone it
// faces, wrinkled by a deterministic per-vertex crumple, sagged by the
// underside's belly crush, and scuffed darker where the metal folded. The
// engine owns every number here; this module only draws what it says.

import * as THREE from "three";
import { DAMAGE_ZONES, type DamagePart, type GameEvent, type GameState } from "@engine";

import type { CarBodyParts } from "./car-body.ts";

/** Crumple hash — any cheap deterministic per-vertex jitter works; the
 * shape only has to look torn, not be reproducible across sessions. */
function jitter(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** How far in from the rim a vertex still crumples (fraction of its radial
 * distance kept as reach) — the centerline never moves, so the cabin keeps
 * its volume however hard the panels fold. */
const REACH_START = 0.35;
/** Scuffed metal darkens toward this fraction of its paint. */
const SCUFF = 0.55;
/** The body sits this much lower per meter of belly crush (shot springs). */
const BELLY_SAG = 0.6;

const GRAVITY = 15.7;
const DEBRIS_LIFE = 4;

type Debris = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  floorY: number;
  life: number;
};

export type CarDamageVisual = {
  /** World-anchored group the torn-off pieces tumble in — the renderer
   * adds it to the scene beside the car. */
  debris: THREE.Group;
  update: (state: GameState, dt: number) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  dispose: () => void;
};

export function createCarDamage(body: CarBodyParts): CarDamageVisual {
  const geo = body.body.geometry;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = geo.getAttribute("color") as THREE.BufferAttribute;
  const restPos = new Float32Array(pos.array as Float32Array);
  const restCol = new Float32Array(col.array as Float32Array);

  const debris = new THREE.Group();
  const flying: Debris[] = [];
  const detached = new Set<DamagePart>();
  let bentVersion = 0;

  /** Re-derive every body vertex from its pristine copy and the ledger. */
  const bend = (state: GameState): void => {
    const damage = state.car.damage;
    const zones = damage.zones;
    const span = (Math.PI * 2) / DAMAGE_ZONES;
    for (let i = 0; i < pos.count; i++) {
      const x0 = restPos[i * 3];
      const y0 = restPos[i * 3 + 1];
      const z0 = restPos[i * 3 + 2];
      // Ring crush at this vertex's bearing, blended between the two
      // nearest zones so the folds wrap the corners instead of stepping.
      const a = Math.atan2(x0, z0);
      const t = a / span;
      const lo = Math.floor(t);
      const frac = t - lo;
      const zoneA = ((lo % DAMAGE_ZONES) + DAMAGE_ZONES) % DAMAGE_ZONES;
      const zoneB = (zoneA + 1) % DAMAGE_ZONES;
      const crush = zones[zoneA] * (1 - frac) + zones[zoneB] * frac;

      const r = Math.hypot(x0, z0);
      const reach = Math.min(1, Math.max(0, (r - REACH_START) / 1.0));
      const crumple = 0.65 + 0.7 * jitter(i);
      const inward = Math.min(crush * reach * crumple, r * 0.8);
      const scale = r > 1e-6 ? 1 - inward / r : 1;

      // Belly: the whole body settles on its shot springs, and the low
      // panels wrinkle — a beaten floorpan reads in the rocker line.
      const low = Math.max(0, 1 - y0 / 1.1);
      const sag = damage.belly * BELLY_SAG * low;
      const wrinkle = damage.belly * low * (jitter(i * 7 + 3) - 0.5) * 0.5;

      pos.setXYZ(i, x0 * scale + wrinkle, Math.max(0.05, y0 - sag), z0 * scale + wrinkle);

      // Scuff: folded metal loses its paint toward primer-dark.
      const mark = Math.min(1, (crush + damage.belly * low) / 0.3);
      const keep = 1 - (1 - SCUFF) * mark;
      col.setXYZ(i, restCol[i * 3] * keep, restCol[i * 3 + 1] * keep, restCol[i * 3 + 2] * keep);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    bentVersion = damage.version;
  };

  /** Tear a part off the body and hand it to the world to tumble. */
  const breakOff = (part: DamagePart, state: GameState): void => {
    const mesh = body.breakables[part];
    if (!mesh || detached.has(part)) return;
    detached.add(part);
    // attach() keeps the world transform while re-parenting into the
    // world-anchored debris group — the piece separates mid-motion.
    debris.attach(mesh);
    const c = state.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    flying.push({
      mesh,
      vel: new THREE.Vector3(
        (sinH * c.u + cosH * c.w) * 0.8 + (Math.random() - 0.5) * 3,
        2.5 + Math.random() * 3,
        (cosH * c.u - sinH * c.w) * 0.8 + (Math.random() - 0.5) * 3,
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 14,
      ),
      floorY: c.y,
      life: DEBRIS_LIFE,
    });
  };

  const onEvents = (state: GameState, events: GameEvent[]): void => {
    for (const ev of events) {
      if (ev.type === "partBreak") breakOff(ev.part, state);
    }
  };

  const update = (state: GameState, dt: number): void => {
    if (state.car.damage.version !== bentVersion) bend(state);
    // Events can only be missed across a rebuild; the ledger cannot —
    // anything it says is broken and still bolted on comes off now.
    for (const part of state.car.damage.broken) breakOff(part, state);

    for (let i = flying.length - 1; i >= 0; i--) {
      const d = flying[i];
      d.life -= dt;
      if (d.life <= 0) {
        debris.remove(d.mesh); // geometry stays owned by the car body
        flying.splice(i, 1);
        continue;
      }
      d.vel.y -= GRAVITY * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.y < d.floorY + 0.06 && d.vel.y < 0) {
        d.mesh.position.y = d.floorY + 0.06;
        d.vel.y *= -0.3; // one dull bounce, then it skids out
        d.vel.x *= 0.55;
        d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.5);
      }
    }
  };

  const dispose = (): void => {
    for (const d of flying) debris.remove(d.mesh);
    flying.length = 0;
  };

  return { debris, update, onEvents, dispose };
}
