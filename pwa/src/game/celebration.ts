// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FINISH SALUTE — what comes out of the cannons beside the finish gate
// when the car crosses the line, and how much of it a result earns.
//
// Two clouds, because a finish is two different materials going off at once
// and neither one on its own reads as a celebration:
//
//   CONFETTI — hundreds of small bright scraps. Light, so they lose their
//   muzzle speed almost immediately (`drag`) and then FLUTTER down rather
//   than falling; that flutter is the whole tell, because paper that drops
//   in straight lines is sparks. Coloured off a wide palette so the burst
//   is polychrome — one colour of confetti is a spill.
//
//   SMOKE — a few dozen big soft puffs of coloured smoke, which is what a
//   real finish-line cannon actually throws and what gives the shot a body
//   behind the glitter. It hangs, it drifts, and it is what still reads at
//   forty metres once the confetti has become a shimmer.
//
// THE PODIUM DECIDES HOW MUCH. A win empties every barrel; second and third
// get progressively less of it; fourth and worse get nothing at all, and
// the silence is the point — a salute that fires for everybody is not a
// salute, it is a screen transition. That is the whole reason this takes a
// placing rather than a boolean.

import * as THREE from "three";

import { createDust, type DustStyle } from "./dust.ts";
import type { Muzzle } from "./finish-gate.ts";

/** Confetti: small, bright, and light. High drag kills the muzzle speed in
 * about a third of a second, and a long life plus almost no gravity leaves
 * it hanging in the air over the road for the whole roll-out. */
const CONFETTI: DustStyle = {
  size: 0.17,
  opacity: 0.95,
  rise: 0.4,
  // Gravity against `drag` sets the terminal fall: ~1.4 m/s, which is paper
  // rather than gravel, and slow enough that a burst is still coming down
  // when the car has gone.
  gravity: 2.5,
  life: { min: 3.4, max: 6.2 },
  drag: 1.8,
  flutter: 1.3,
};

/** Cannon smoke: fat, soft, slow. Puffy, so a sprite this size reads as a
 * cloud instead of a coloured rectangle. */
const CANNON_SMOKE: DustStyle = {
  size: 1.5,
  opacity: 0.34,
  rise: 0.5,
  gravity: 0.25,
  life: { min: 2.2, max: 4.4 },
  drag: 1.2,
  puffy: true,
};

/** The confetti palette. Deliberately wide and deliberately saturated: this
 * is the one moment in a forest stage where the screen is allowed to be
 * loud, and a burst mixed from six colours reads as celebration where a
 * burst mixed from two reads as debris. */
const COLORS = [0xffd23f, 0xef476f, 0x06d6a0, 0x4cc9f0, 0xffffff, 0xf78c6b, 0xb388eb];

/** ...and the smoke's, which is the same idea one step calmer — coloured
 * smoke is pastel by the time it has expanded. */
const SMOKE_COLORS = [0xffd88a, 0xff9db1, 0x8ee9c8, 0x9dd4f5, 0xf2f0ea];

/**
 * WHAT A PLACING IS WORTH. Descending, and hard-stopping after third.
 *
 * The counts are per BARREL, and a finish has four of them, so first place
 * throws the better part of a thousand scraps of paper across the road. The
 * step down is steep on purpose: second has to look like less rather than
 * like the same thing slightly quieter, or the podium stops meaning
 * anything.
 */
const PODIUM = [
  { confetti: 150, smoke: 16, speed: 18, spread: 4.5 },
  { confetti: 84, smoke: 10, speed: 16, spread: 4 },
  { confetti: 42, smoke: 6, speed: 14, spread: 3.5 },
];

/** How many barrels a placing gets to fire. Third place gets one each side
 * rather than two, so even the shape of the salute steps down. */
const BARRELS = [4, 4, 2];

/** Seconds between one barrel going off and the next. A volley fired in one
 * frame is a single flat pop; strung out over a beat it reads as a row of
 * cannons rather than an effect. */
const STAGGER = 0.11;

export type Celebration = {
  /** Both clouds, to be added to the scene. */
  clouds: THREE.Points[];
  /**
   * Fire the salute. `place` is the classification — 1 is a win — and
   * anything past third is silently nothing. Firing again while a salute is
   * still going re-arms it, which is what a restart wants.
   */
  fire: (place: number, muzzles: Muzzle[]) => void;
  update: (dt: number) => void;
  /** True while barrels are still waiting to go off. */
  firing: () => boolean;
  dispose: () => void;
};

export function createCelebration(): Celebration {
  const confetti = createDust(CONFETTI);
  const smoke = createDust(CANNON_SMOKE);
  /** Barrels queued to go off, and when. */
  let queue: { at: number; muzzle: Muzzle; rung: (typeof PODIUM)[number] }[] = [];
  let clock = 0;

  /** One barrel: a cone of paper and a cough of smoke, both thrown along the
   * barrel's own aim so the plume goes where the gun is pointing. */
  const boom = (muzzle: Muzzle, rung: (typeof PODIUM)[number]): void => {
    const vx = muzzle.dx * rung.speed;
    const vy = muzzle.dy * rung.speed;
    const vz = muzzle.dz * rung.speed;
    const paper = rung.confetti;
    // Colour is picked per SPAWN rather than per particle, so a barrel
    // throws bands of colour instead of an even average of all of them —
    // which is what a real charge, packed in layers, actually does.
    const bands = Math.min(COLORS.length, 5);
    for (let b = 0; b < bands; b++) {
      confetti.spawn(
        muzzle.x,
        muzzle.y,
        muzzle.z,
        COLORS[(b * 3 + Math.floor(clock * 7)) % COLORS.length],
        Math.ceil(paper / bands),
        rung.spread,
        vx,
        vz,
        vy,
      );
    }
    smoke.spawn(
      muzzle.x,
      muzzle.y,
      muzzle.z,
      SMOKE_COLORS[Math.floor(clock * 11) % SMOKE_COLORS.length],
      rung.smoke,
      rung.spread * 0.5,
      vx * 0.45,
      vz * 0.45,
      vy * 0.45,
    );
  };

  const fire = (place: number, muzzles: Muzzle[]): void => {
    queue = [];
    if (place < 1 || place > PODIUM.length || muzzles.length === 0) return;
    const rung = PODIUM[place - 1];
    const barrels = Math.min(muzzles.length, BARRELS[place - 1]);
    for (let k = 0; k < barrels; k++) {
      queue.push({ at: clock + k * STAGGER, muzzle: muzzles[k % muzzles.length], rung });
    }
  };

  const update = (dt: number): void => {
    clock += dt;
    if (queue.length > 0) {
      const due = queue.filter((shot) => shot.at <= clock);
      if (due.length > 0) {
        queue = queue.filter((shot) => shot.at > clock);
        for (const shot of due) boom(shot.muzzle, shot.rung);
      }
    }
    confetti.update(dt);
    smoke.update(dt);
  };

  return {
    clouds: [smoke.points, confetti.points],
    fire,
    update,
    firing: () => queue.length > 0,
    dispose: () => {
      confetti.dispose();
      smoke.dispose();
    },
  };
}

/** The one place that says how many rungs the podium has, for anything that
 * needs to ask whether a result earns a salute at all. */
export const PODIUM_PLACES = PODIUM.length;
