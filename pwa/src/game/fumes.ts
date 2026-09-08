// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Exhaust fumes: a pooled puff cloud off the tailpipe. Puffs inherit a
// little of the car's wake, then the WIND owns them — idling fumes drift
// downwind, a storm rips them sideways. Same recycled-in-place Points
// architecture as dust.ts, and the same shader graft (`graftDust`), so a
// puff off a pipe gets its own size, its own turn and its own opacity.
// Presentation only.
//
// WHAT a pipe is putting out at any moment is not here — it is exhaust.ts,
// DOM-free beside this, because it is arithmetic about water and soot and
// nothing about drawing. This module is what that arithmetic LOOKS like: a
// warm pipe off the throttle is a wisp the air swallows, and the same pipe
// at ten below is a white plume rolling off the back of the car.
//
// TWO CLOUDS COME OUT OF HERE and they are pooled differently. The player's
// car has one to itself (car-fx.ts), sized for the hardest one pipe ever
// works. The FIELD shares a second between every crew on the road
// (field-cars.ts) — a grid of eight cars blipping is eight pipes at once,
// and eight private pools would be eight draw calls for a cloud that reads
// as one. `pipeWork` is what keeps them telling the same story: how hard a
// pipe is working is a function of the engine and the weather, not of whose
// car it is bolted to.

import * as THREE from "three";

import { graftDust } from "./dust.ts";
import { EXHAUST, type PipeLook } from "./exhaust.ts";
import { billowTexture } from "./textures.ts";

/** Big enough to hold the hardest the pipe ever works — a winter grid on
 * the limiter, whose puffs are also the longest-lived the cloud makes —
 * without recycling a puff that is still on screen, which would show up as
 * the cloud tearing holes in itself at exactly the moment it is thickest.
 * That worst case is `EXHAUST.every.worked` against `EXHAUST.look.life`: a
 * third of a second's bursts of four, each hanging for two seconds, is
 * about 260 alive — and this carries a burst-capped late frame on top of
 * it with room to spare. */
const POOL = 640;

export type Fumes = {
  points: THREE.Points;
  /** One puff at the pipe. `vx`/`vz` seed the base velocity (wake + wind);
   * `look` is what the pipe is making of it this instant — the whole of
   * what separates a winter plume from a summer wisp. */
  spawn: (x: number, y: number, z: number, vx: number, vz: number, look: PipeLook) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

/** How close to the eye a puff is gone entirely, m — coming back to full
 * over the next couple of metres. Without it the winter plume is a grey wash
 * over the whole frame the moment the car slows down: it leaves the pipe
 * pointing BACKWARDS, which on a stationary car is straight at the chase
 * camera.
 *
 * Much tighter than the towed cloud's (`GROUND_CLOUD.nearFade`), and that is
 * the whole difference between the two effects rather than a number that
 * wants raising. A plume is left behind on the road and the camera drives
 * INTO it, so it has to be gone well before the glass; an exhaust is the car
 * you are sitting behind, and the gap between its bumper and the lens is the
 * only place it is ever seen from the seat. Faded out over that gap there is
 * no exhaust in the game at all. */
const NEAR_FADE = 1.1;

/** The base point size, world metres — what a puff with no water in it is
 * born a fraction of and a full winter one a little over. Past 0.6 a sprite
 * needs the chunkier mask (`billowTexture`) rather than the small one, for
 * the reason dust.ts picks between them: at this size the puff's own
 * silhouette is what the eye reads. */
const PUFF_SIZE = 0.62;

/** A cloud. `pool` is how many puffs it may have alive at once — the default
 * is one pipe's worth; a cloud several cars are feeding needs its own
 * number, because the puffs come out of one ring and a pool spent faster
 * than it ages recycles a puff that is still on screen. */
export function createFumes(pool: number = POOL): Fumes {
  const positions = new Float32Array(pool * 3);
  const colors = new Float32Array(pool * 3);
  const velocities = new Float32Array(pool * 3);
  const life = new Float32Array(pool);
  /** Parallel to `life`: how long each puff was given (so its age can be
   * read as a fraction), the size it was born at, how far it swells, how
   * opaque it ever gets, how fast it turns — and the three the shader
   * actually reads. */
  const span = new Float32Array(pool);
  const birth = new Float32Array(pool);
  const swell = new Float32Array(pool);
  const peak = new Float32Array(pool);
  const spins = new Float32Array(pool);
  const scales = new Float32Array(pool);
  const fades = new Float32Array(pool);
  const angles = new Float32Array(pool);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geo.setAttribute("aFade", new THREE.BufferAttribute(fades, 1));
  geo.setAttribute("aSpin", new THREE.BufferAttribute(angles, 1));
  const mat = new THREE.PointsMaterial({
    size: PUFF_SIZE,
    map: billowTexture(),
    vertexColors: true,
    transparent: true,
    // Thin, because the density is meant to come from the OVERLAP: a plume
    // you can pick single puffs out of is a plume made of sprites, and one
    // you cannot see the road through has stopped being an effect — and a
    // winter idle is exactly where that second failure lives, since the car
    // is stationary and the chase camera is parked in its own cloud.
    opacity: 0.34,
    depthWrite: false,
  });
  graftDust(mat, true, NEAR_FADE, 0);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  /** The three anchors the colour is mixed from: a warm pipe's own light
   * grey, the near-white of condensing water, and soot. The pale end is
   * deliberately high — clean exhaust is barely darker than the air, and
   * what makes it readable is the water in it and the pedal, not a grey
   * that was drawn dark to be seen at all. */
  const pale = new THREE.Color(0xb9c0c6);
  const steam = new THREE.Color(0xe8edf0);
  const soot = new THREE.Color(0x3a3e44);
  const tint = new THREE.Color();

  const spawn = (x: number, y: number, z: number, vx: number, vz: number, look: PipeLook): void => {
    const L = EXHAUST.look;
    const bloom = look.bloom;
    const i = cursor;
    cursor = (cursor + 1) % pool;
    positions[i * 3] = x + (Math.random() - 0.5) * 0.2;
    positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.15;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
    // A wide scatter, so a burst of puffs made in the same millisecond at
    // the same pipe FANS rather than travelling out as one rope.
    velocities[i * 3] = vx + (Math.random() - 0.5) * 0.9;
    velocities[i * 3 + 1] = L.rise.base + L.rise.wet * bloom + Math.random() * L.rise.vary; // warm smoke rises
    velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * 0.9;
    // Pale → white with the water in it, then down toward soot with the
    // carbon. In that order: the water is what the carbon is suspended IN,
    // so a cold sooty plume comes out mid grey rather than black.
    tint.copy(pale).lerp(steam, bloom).lerp(soot, look.shade);
    const v = 0.85 + Math.random() * 0.3;
    colors[i * 3] = tint.r * v;
    colors[i * 3 + 1] = tint.g * v;
    colors[i * 3 + 2] = tint.b * v;
    span[i] = (L.life.dry + (L.life.wet - L.life.dry) * bloom) * (1 - L.life.vary * Math.random());
    life[i] = span[i] as number;
    // Born somewhere inside its own size band, at a random angle, turning
    // either way — three draws that cost nothing and are the whole reason a
    // hundred copies of one mask do not read as one mask.
    birth[i] = (L.dry.size + (L.wet.size - L.dry.size) * bloom) * (0.75 + Math.random() * 0.25);
    swell[i] = L.dry.grow + (L.wet.grow - L.dry.grow) * bloom;
    peak[i] = look.body;
    spins[i] = (Math.random() * 2 - 1) * 0.7;
    angles[i] = Math.random() * Math.PI * 2;
    scales[i] = birth[i] as number;
    fades[i] = 0;
  };

  const update = (dt: number): void => {
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      // No gravity — smoke hangs, slows its rise, and rides whatever wind
      // was baked into its spawn velocity.
      velocities[i * 3 + 1] = Math.max(0.15, velocities[i * 3 + 1] - 0.5 * dt);
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      // Age as a fraction of what this puff was given. The SWELL is eased
      // out — a puff does most of its growing in the first moment and then
      // hangs there widening slowly. The thinning is the other way round:
      // it holds most of its opacity through the middle of its life and
      // gives the rest up at the end, so a plume dissolves instead of
      // dimming from the moment it leaves the pipe.
      const t = span[i] > 0 ? Math.min(1, 1 - (life[i] as number) / (span[i] as number)) : 1;
      const eased = 1 - (1 - t) * (1 - t);
      scales[i] = (birth[i] as number) * (1 + ((swell[i] as number) - 1) * eased);
      angles[i] = (angles[i] as number) + (spins[i] as number) * dt;
      fades[i] = life[i] > 0 ? Math.min(1, t / 0.1) * (1 - t * t) * (peak[i] as number) : 0;
      if (life[i] <= 0) positions[i * 3 + 1] = -50;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.aScale.needsUpdate = true;
    geo.attributes.aFade.needsUpdate = true;
    geo.attributes.aSpin.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  for (let i = 0; i < pool; i++) positions[i * 3 + 1] = -50;
  return { points, spawn, update, dispose };
}
