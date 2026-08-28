// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pooled particle system for the ground-contact juice: gravel thrown off
// the wheels, a blue sheet of spray through fords, a brown puff on
// landings — and, on the stage's asphalt sections, tire smoke, which is a
// different thing entirely and has to LOOK like one. One THREE.Points
// cloud per style, positions and lifetimes recycled in place.

import * as THREE from "three";

import { puffTexture } from "./textures.ts";

const POOL = 768;

/** What a cloud is MADE of. The two styles are opposites on purpose: a
 * grain of gravel is small, hard, and thrown — dozens of them, arcing and
 * falling; smoke is big, soft, and boiled off the tire — a few of them,
 * hanging and drifting. Same code, different matter. */
export type DustStyle = {
  /** Point size, world meters. */
  size: number;
  opacity: number;
  /** Upward speed a particle is born with, m/s. */
  rise: number;
  /** Downward acceleration, m/s² — grit falls, smoke barely does. */
  gravity: number;
  /** Lifetime band, seconds. */
  life: { min: number; max: number };
  /** A cloud made of PUFFS rather than grains: its points wear a blob mask
   * instead of the sprite's bare square, which is the only way a particle
   * gets to be big enough to read as smoke. */
  puffy?: boolean;
  /** Air resistance, 1/s, on all three axes. Grit is dense and keeps
   * whatever it was thrown with; anything LIGHT — a scrap of paper, a cloud
   * of smoke — gives that speed up almost at once, and the difference
   * between the two is the whole difference between a spray and a burst.
   *
   * It has to act VERTICALLY too, or a burst fired upward keeps every bit
   * of its muzzle speed against nothing but gravity and leaves the frame:
   * a cannon charge at 17 m/s and paper's gravity would climb seventy
   * metres. With drag the same charge arcs a few metres up, which is what a
   * cannon full of paper actually does. */
  drag?: number;
  /** How far a particle wanders sideways as it falls, m/s at its widest.
   * This is what makes confetti confetti: a flat scrap does not fall, it
   * flutters, and a burst of colour that drops in straight lines reads as
   * sparks. Each grain wanders on its own phase, so a cloud of them never
   * sways in unison. */
  flutter?: number;
};

/** How fast a fluttering particle wanders, Hz. Slow enough to read as
 * paper turning over rather than a vibration. */
const FLUTTER_HZ = 1.15;

/** Gravel: fine grit, and a lot of it. The grains are deliberately SMALL —
 * near the lowered chase cam a big point sprite reads as a glitchy square,
 * where a swarm of small ones reads as spray. */
export const GRAVEL_DUST: DustStyle = {
  size: 0.075,
  opacity: 0.85,
  rise: 1.5,
  gravity: 6,
  life: { min: 0.5, max: 0.9 },
};

/** Tire smoke: what a sealed road gives you instead. Big soft puffs that
 * hang where they were made and drift off with the car's wake, so a drift
 * on tarmac leaves a wall behind it rather than a rooster tail. Big is only
 * available to it because it is `puffy`: the chase cam sits a couple of
 * metres behind the tires that make these, and at that range a bare sprite
 * this size is a grey rectangle stuck to the lens. */
export const TIRE_SMOKE: DustStyle = {
  size: 0.55,
  opacity: 0.26,
  rise: 0.7,
  gravity: 0.4,
  life: { min: 1, max: 1.9 },
  puffy: true,
};

/** WATER THROWN, as opposed to water sprayed off a rolling wheel. What a
 * car displaces going INTO a body of water is a column, not a sheet: heavy
 * droplets launched hard, arcing high and coming straight back down, and a
 * lot of them — the count is what makes it read as a mass of water rather
 * than a puff of blue. Small and fast for the same reason gravel is (a big
 * sprite this close to the chase cam is a rectangle), and heavier than
 * gravel because water falls out of the air faster than it goes up. */
export const SPLASH_WATER: DustStyle = {
  size: 0.085,
  opacity: 0.9,
  rise: 4.5,
  gravity: 13,
  life: { min: 0.6, max: 1.2 },
};

/** ...and the froth left on the surface once the column has come down: the
 * white water over a hull that is still displacing, and the bubbles a
 * sinking car lets go of. Puffy, near-weightless, drifting UP a little
 * (negative gravity) so it breaks and spreads on the surface instead of
 * raining back into it. */
export const WATER_FOAM: DustStyle = {
  size: 0.26,
  opacity: 0.34,
  rise: 0.4,
  gravity: -0.15,
  life: { min: 0.6, max: 1.3 },
  puffy: true,
};

/** WHEN a sealed road smokes — the policy that goes with the style above.
 * Tarmac has nothing lying on it to throw, so unlike gravel it gives up
 * nothing at all for ordinary driving, however hard it is being driven.
 * Smoke is what a tire gives when it is genuinely overwhelmed, and there
 * are only three moments that qualify: spinning up on the line, a committed
 * drift, and a real stop from real speed. Each of them leaves a little. */
export const TARMAC_SMOKE = {
  /** Seconds between puffs — a quarter of the loose surface's rate, so a
   * drift leaves a haze hanging in the corner rather than a bank of fog. */
  every: 0.12,
  /** Pulling away: forward acceleration in m/s² under `speed` m/s that
   * reads as the driven wheels spinning up before they hook up. */
  launch: { accel: 4.5, speed: 7, puffs: 3 },
  /** A committed drift: `puffs` per outside wheel, plus a little for how
   * deep the slide has gone. */
  drift: { puffs: 2 },
  /** Braking: `puffs` off ONE wheel, and only from a speed worth losing
   * (m/s) — a dab into a corner does not lock anything up. */
  brake: { speed: 24, puffs: 2 },
  /** Smoke boils off the tire rather than being thrown by it, so it spreads
   * gently instead of arcing away, m/s. */
  spread: 1.2,
};

/** How big a thrown cloud is at a given PACE, 0..1. A wheel at walking
 * speed disturbs the ground; a wheel at rally pace excavates it, and a
 * cloud that ignores the difference buries a car crawling out of a ditch
 * in the same plume it earns at 120 km/h. Both the grain COUNT and the
 * SPREAD ride on it, so a slow cloud is fewer grains and a tighter one —
 * scaling only the count would keep the same wide skirt with holes in it.
 * Smoke is exempt: an overwhelmed tire is overwhelmed at any speed. */
export const PACE = {
  /** At or below this the cloud sits at its floor, m/s. */
  from: 7,
  /** At or above this it is full size, m/s. */
  to: 28,
  /** What is left of it at a crawl, 0..1. */
  floor: 0.12,
};

export function paceScale(u: number): number {
  const t = Math.min(1, Math.max(0, (u - PACE.from) / (PACE.to - PACE.from)));
  return PACE.floor + (1 - PACE.floor) * t;
}

/** OFF THE LINE — the one exception to `PACE` above, and the reason it is
 * an exception rather than a hole in it. A wheel pulling away from a stop
 * is SPINNING, not rolling: it is moving far more ground than its road
 * speed suggests, so the cloud has to come from the slip under the tire
 * instead of from the speedometer, or the most dramatic moment of the run
 * is the one where the car throws almost nothing. It fades out as the
 * wheels hook up and hands the plume straight over to the rolling kickup
 * that owns it from there. */
export const LAUNCH = {
  /** Forward acceleration that reads as wheelspin rather than as a car
   * merely gathering speed, m/s²... */
  from: 2.5,
  /** ...and where the wheels are lit up properly, m/s². */
  to: 6,
  /** Road speed the tires have found the ground by, m/s — 50 km/h, which
   * is also where the rolling kickup comes in, so the two meet rather than
   * leaving a gap with no cloud in it. */
  settle: 13.9,
  /** How hard a lit-up wheel throws what it digs out, m/s backward. A
   * standing car has no wake to hand its grains to — without a kick of
   * their own they drop where they were made and the launch reads as a
   * puff under the car instead of a rooster tail behind it. */
  push: 6,
};

/** How hard the driven wheels are digging off the line, 0..1: full at a
 * standstill under wheelspin, nothing once the car is up and running. The
 * road-speed term falls off as a SQUARE rather than a straight line — a
 * tire loses its slip late and then all at once, and a linear ramp spends
 * the launch's whole budget in the first tenth of a second, where the car
 * is still under the start gantry and the player is watching the lights. */
export function launchThrow(u: number, accel: number): number {
  const spin = Math.min(1, Math.max(0, (accel - LAUNCH.from) / (LAUNCH.to - LAUNCH.from)));
  const hooked = Math.min(1, Math.max(0, u / LAUNCH.settle));
  return spin * (1 - hooked * hooked);
}

/** What the WILD throws, as a fraction of what the road throws. Turf holds
 * together where loose grit does not: a wheel off the road tears out clods
 * and blades, it does not lift a screen of dust the way a graded surface
 * with nothing binding it does. The road is the loud surface here, and the
 * grass beside it is the quiet one.
 *
 * It is deliberately a MILD cut, and `PACE` above is the deep one. They
 * answer different questions — how loud is turf, and how loud is a walking
 * pace — and compounding both into this one number would take the wild's
 * cloud out entirely at the speeds where it is most on screen. At pace the
 * car's own wake carries the grains behind the chase camera within a
 * fraction of a second, so this number is judged at the speeds a player
 * actually looks at the ground: crawling out of a field, and sliding
 * across one. */
export const WILD_THROW = 0.45;

/** A cloud made of TWO things. Ground thrown off a wheel is never one
 * color: the wild's verge is grass torn up with the earth under it, and
 * what sells it is that the grains are individually one or the other —
 * mostly green with dark clods through it — rather than every grain being
 * the average of the two, which is just a duller green. */
export type DustTint = {
  /** The tone most of the grains take. */
  base: number;
  /** The minority tone mixed in grain by grain. */
  fleck: number;
  /** What fraction of the grains take the fleck, 0..1. */
  fleckMix: number;
};

export type Dust = {
  points: THREE.Points;
  /** `vx`/`vy`/`vz` seed every particle with a base world velocity on top
   * of the random spread — the car's wake for a thrown cloud, the barrel's
   * own aim for anything fired out of one. `vy` ADDS to the style's rise
   * rather than replacing it. */
  spawn: (
    x: number,
    y: number,
    z: number,
    color: number | DustTint,
    count: number,
    spread: number,
    vx?: number,
    vz?: number,
    vy?: number,
  ) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function createDust(style: DustStyle = GRAVEL_DUST): Dust {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const velocities = new Float32Array(POOL * 3);
  const life = new Float32Array(POOL);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const map = style.puffy ? puffTexture() : null;
  const mat = new THREE.PointsMaterial({
    size: style.size,
    map,
    vertexColors: true,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const tint = new THREE.Color();

  const spawn = (
    x: number,
    y: number,
    z: number,
    color: number | DustTint,
    count: number,
    spread: number,
    vx = 0,
    vz = 0,
    vy = 0,
  ): void => {
    const mix = typeof color === "number" ? null : color;
    if (!mix) tint.set(color as number);
    for (let n = 0; n < count; n++) {
      if (mix) tint.set(Math.random() < mix.fleckMix ? mix.fleck : mix.base);
      const i = cursor;
      cursor = (cursor + 1) % POOL;
      positions[i * 3] = x + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = y + Math.random() * 0.3;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      velocities[i * 3] = vx + (Math.random() - 0.5) * spread;
      velocities[i * 3 + 1] = vy + style.rise + Math.random() * spread;
      velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      colors[i * 3] = tint.r * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 1] = tint.g * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 2] = tint.b * (0.85 + Math.random() * 0.3);
      life[i] = style.life.min + Math.random() * (style.life.max - style.life.min);
    }
  };

  let clock = 0;
  const drag = style.drag ?? 0;
  const flutter = style.flutter ?? 0;
  const update = (dt: number): void => {
    clock += dt;
    // A drag of `k` over `dt` leaves this share of the horizontal speed.
    const keep = drag > 0 ? Math.max(0, 1 - drag * dt) : 1;
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      velocities[i * 3 + 1] -= style.gravity * dt;
      if (keep !== 1) {
        velocities[i * 3] *= keep;
        velocities[i * 3 + 1] *= keep;
        velocities[i * 3 + 2] *= keep;
      }
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (flutter > 0) {
        // The phase comes off the slot index, which is free and never
        // repeats inside a burst — no per-particle state to carry.
        const phase = i * 0.618;
        positions[i * 3] += Math.cos(clock * FLUTTER_HZ * 6.283 + phase) * flutter * dt;
        positions[i * 3 + 2] += Math.sin(clock * FLUTTER_HZ * 4.71 + phase) * flutter * dt;
      }
      if (life[i] <= 0) positions[i * 3 + 1] = -50; // park expired below ground
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
    map?.dispose();
  };

  // Park the whole pool out of sight until first use.
  for (let i = 0; i < POOL; i++) positions[i * 3 + 1] = -50;

  return { points, spawn, update, dispose };
}
