// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A SNOW CRYSTAL LOOKS LIKE — the eight habits of `SNOW_HABITS`
// (engine/game/climate.ts) drawn once into a texture atlas, one cell each,
// for the falling sheet to stamp (snowfall.ts).
//
// SIX-FOLD SYMMETRY IS THE WHOLE READ. A crystal grows on a hexagonal
// lattice, so whatever happens to one arm happens to all six — that
// repetition is what the eye recognises as a snowflake, and it is the one
// thing a hand-drawn blob can never fake. So nothing here draws a whole
// crystal: it draws ONE ARM and stamps it six times, sixty degrees apart,
// which makes the symmetry exact by construction rather than by care.
//
// The four families under the eight are what a windscreen actually tells
// apart — a flat six-sided PLATE, a six-armed STAR, a ROD, and a rod with
// a plate on each end — and the differences inside each family are the
// ones a driver has a chance of seeing at a metre: how far the arms run,
// whether they carry branches, and whether the branches carry branches.
//
// WHICH of them falls is not this module's business and not a matter of
// taste: it is the temperature, through Nakaya's morphology diagram, which
// `snowHabits` states engine-side. This only draws them.

import * as THREE from "three";
import { SNOW_HABITS, type SnowHabit } from "@engine";

/** One cell of the atlas, px. Big enough that a fern's sub-branches are
 * more than a line of aliasing, and small enough that the whole sheet is
 * one 512 x 256 texture. */
const CELL = 128;
/** How many cells across. Eight habits, so four by two. */
const COLS = 4;
const ROWS = Math.ceil(SNOW_HABITS.length / COLS);
/** How far a crystal is allowed to reach from its cell's middle, px. The
 * margin left over is not slack: a rotated sprite samples past its own
 * corners, and mipping a packed atlas bleeds each cell into its neighbour.
 * A transparent rim is what keeps a dendrite from growing a stranger's
 * arm. */
const REACH = CELL * 0.4;

/** HOW BIG EACH HABIT IS DRAWN, against the sheet's own flake size — the
 * one part of a crystal's proportions that is about the crystal rather
 * than about the picture. The spread is real and it is wide: a fernlike
 * dendrite runs to about 5 mm across, and the "diamond dust" a bitter
 * night falls as is a plate no wider than a hair. Drawing them all at one
 * size is what makes a sheet of sprites read as a sheet of sprites. */
const HABIT_SIZE: Record<SnowHabit, number> = {
  plate: 0.62,
  sectored: 0.82,
  stellar: 1,
  dendrite: 1.24,
  fern: 1.5,
  needle: 0.95,
  column: 0.7,
  capped: 0.86,
};

/** The size multiplier for each habit, in `SNOW_HABITS` order — the shape
 * the shader wants it in. */
export const HABIT_SCALE: readonly number[] = SNOW_HABITS.map((h) => HABIT_SIZE[h]);

export const CRYSTAL_ATLAS = { cols: COLS, rows: ROWS, cell: CELL } as const;

type Ink = CanvasRenderingContext2D;

/** A hexagon, point up, on the current origin. */
function hex(ink: Ink, r: number): void {
  ink.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ink.moveTo(x, y);
    else ink.lineTo(x, y);
  }
  ink.closePath();
}

/** Stamp `arm` six times, sixty degrees apart — drawn pointing UP, so an
 * arm is written once as if it were the only one. */
function sixfold(ink: Ink, arm: (ink: Ink) => void): void {
  for (let i = 0; i < 6; i++) {
    ink.save();
    ink.rotate((i * Math.PI) / 3);
    arm(ink);
    ink.restore();
  }
}

/** A straight limb from the origin, `len` long, `wide` across, at `lean`
 * radians off straight up. */
function limb(ink: Ink, len: number, wide: number, lean = 0): void {
  ink.save();
  ink.rotate(lean);
  ink.lineWidth = wide;
  ink.beginPath();
  ink.moveTo(0, 0);
  ink.lineTo(0, -len);
  ink.stroke();
  ink.restore();
}

/** The angle a side branch leaves a dendrite's arm at. Not a free choice:
 * a branch grows on the same lattice as the arm it leaves, so it leaves at
 * sixty degrees, and every one of them is parallel to two of the six main
 * arms. Get this wrong and the crystal reads as a fir tree. */
const BRANCH = Math.PI / 3;

const DRAW: Record<SnowHabit, (ink: Ink, r: number) => void> = {
  // A plain hexagonal plate: a facet, a rim, and the ghost of an inner
  // facet where the plate thickened as it grew.
  plate: (ink, r) => {
    ink.globalAlpha = 0.5;
    hex(ink, r * 0.62);
    ink.fill();
    ink.globalAlpha = 1;
    ink.lineWidth = r * 0.075;
    hex(ink, r * 0.62);
    ink.stroke();
    ink.globalAlpha = 0.6;
    ink.lineWidth = r * 0.05;
    hex(ink, r * 0.36);
    ink.stroke();
  },

  // The same plate with six ridges run out to its corners — the growth
  // lines, which is the only thing separating this from the plate above.
  sectored: (ink, r) => {
    ink.globalAlpha = 0.3;
    hex(ink, r * 0.8);
    ink.fill();
    ink.globalAlpha = 1;
    ink.lineWidth = r * 0.07;
    hex(ink, r * 0.8);
    ink.stroke();
    ink.globalAlpha = 0.85;
    sixfold(ink, (arm) => limb(arm, r * 0.8, r * 0.055));
    ink.globalAlpha = 0.7;
    ink.lineWidth = r * 0.05;
    hex(ink, r * 0.3);
    ink.stroke();
  },

  // Six broad blunt arms off a central plate, each ending in a plate of
  // its own: a star before it starts branching.
  stellar: (ink, r) => {
    ink.globalAlpha = 0.9;
    sixfold(ink, (arm) => {
      arm.beginPath();
      arm.moveTo(-r * 0.14, 0);
      arm.lineTo(-r * 0.08, -r * 0.68);
      arm.lineTo(r * 0.08, -r * 0.68);
      arm.lineTo(r * 0.14, 0);
      arm.closePath();
      arm.fill();
      arm.translate(0, -r * 0.76);
      hex(arm, r * 0.2);
      arm.fill();
    });
    ink.globalAlpha = 1;
    hex(ink, r * 0.2);
    ink.fill();
  },

  // The snowflake of the word: six arms, each carrying pairs of side
  // branches that shorten toward the tip.
  dendrite: (ink, r) => {
    const long = r * 0.92;
    ink.lineCap = "round";
    sixfold(ink, (arm) => {
      arm.globalAlpha = 1;
      limb(arm, long, r * 0.075);
      for (const [along, out] of [
        [0.3, 0.34],
        [0.5, 0.27],
        [0.68, 0.19],
        [0.84, 0.12],
      ]) {
        arm.save();
        arm.translate(0, -long * along);
        arm.globalAlpha = 0.95;
        limb(arm, r * out, r * 0.05, BRANCH);
        limb(arm, r * out, r * 0.05, -BRANCH);
        arm.restore();
      }
      arm.save();
      arm.translate(0, -long);
      arm.globalAlpha = 1;
      hex(arm, r * 0.1);
      arm.fill();
      arm.restore();
    });
    ink.globalAlpha = 1;
    hex(ink, r * 0.15);
    ink.fill();
  },

  // ...and the same crystal grown as far as it goes: more side branches,
  // finer, and each one carrying branches of its own. The largest thing
  // that falls, and the one that reads as lace rather than as a star.
  fern: (ink, r) => {
    const long = r;
    ink.lineCap = "round";
    sixfold(ink, (arm) => {
      arm.globalAlpha = 1;
      limb(arm, long, r * 0.05);
      for (let i = 0; i < 7; i++) {
        const along = 0.16 + i * 0.12;
        const out = r * (0.3 - i * 0.032);
        arm.save();
        arm.translate(0, -long * along);
        arm.globalAlpha = 0.9;
        for (const lean of [BRANCH, -BRANCH]) {
          limb(arm, out, r * 0.032, lean);
          // The fern's own signature: the side branches branch too.
          arm.save();
          arm.rotate(lean);
          arm.translate(0, -out * 0.55);
          arm.globalAlpha = 0.7;
          limb(arm, out * 0.36, r * 0.024, BRANCH);
          limb(arm, out * 0.36, r * 0.024, -BRANCH);
          arm.restore();
        }
        arm.restore();
      }
    });
    ink.globalAlpha = 1;
    hex(ink, r * 0.12);
    ink.fill();
  },

  // A rod. Needles fall in bundles rather than singly, so the cell carries
  // a pair — one long, one short and offset, which is what stops it
  // reading as a scratch on the lens.
  needle: (ink, r) => {
    ink.lineCap = "round";
    ink.globalAlpha = 1;
    ink.lineWidth = r * 0.11;
    ink.beginPath();
    ink.moveTo(-r * 0.06, -r * 0.92);
    ink.lineTo(r * 0.02, r * 0.9);
    ink.stroke();
    ink.globalAlpha = 0.75;
    ink.lineWidth = r * 0.08;
    ink.beginPath();
    ink.moveTo(r * 0.16, -r * 0.5);
    ink.lineTo(r * 0.24, r * 0.62);
    ink.stroke();
  },

  // A short hollow prism — the barrel proportions a column actually has,
  // with the conical hollows that run in from both ends.
  column: (ink, r) => {
    const half = r * 0.72;
    const wide = r * 0.34;
    ink.globalAlpha = 0.45;
    ink.fillRect(-wide, -half, wide * 2, half * 2);
    ink.globalAlpha = 1;
    ink.lineWidth = r * 0.08;
    ink.strokeRect(-wide, -half, wide * 2, half * 2);
    // The hollow: a facet inside the facet, open at neither end.
    ink.globalAlpha = 0.55;
    ink.lineWidth = r * 0.045;
    ink.beginPath();
    ink.moveTo(-wide * 0.45, -half);
    ink.lineTo(0, -half * 0.45);
    ink.lineTo(wide * 0.45, -half);
    ink.moveTo(-wide * 0.45, half);
    ink.lineTo(0, half * 0.45);
    ink.lineTo(wide * 0.45, half);
    ink.stroke();
  },

  // Two wheels on an axle: a column that fell through the plate band and
  // grew a plate on each end.
  capped: (ink, r) => {
    const half = r * 0.44;
    const wide = r * 0.16;
    ink.globalAlpha = 0.7;
    ink.fillRect(-wide, -half, wide * 2, half * 2);
    ink.globalAlpha = 1;
    ink.lineWidth = r * 0.06;
    ink.strokeRect(-wide, -half, wide * 2, half * 2);
    // The caps, seen nearly edge-on — a hexagon squashed onto the axle.
    for (const end of [-1, 1]) {
      ink.save();
      ink.translate(0, end * half);
      ink.scale(1, 0.34);
      ink.globalAlpha = 0.55;
      hex(ink, r * 0.66);
      ink.fill();
      ink.globalAlpha = 1;
      ink.lineWidth = (r * 0.06) / 0.34;
      hex(ink, r * 0.66);
      ink.stroke();
      ink.restore();
    }
  },
};

/**
 * THE ATLAS: every habit drawn once, in `SNOW_HABITS` order, left to right
 * and top to bottom.
 *
 * White throughout — the structure is carried entirely by the ALPHA, so a
 * flake takes its colour from the sky and the lamps on it (snowfall.ts)
 * rather than from anything painted here. `flipY` is off so that the top
 * of a cell is the top of the sprite and `gl_PointCoord` can be used as it
 * comes, without the flip three's own particle chunk applies.
 */
export function crystalAtlas(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ink = canvas.getContext("2d");
  if (ink) {
    ink.fillStyle = "#fff";
    ink.strokeStyle = "#fff";
    ink.lineJoin = "round";
    SNOW_HABITS.forEach((habit, i) => {
      ink.save();
      ink.translate(((i % COLS) + 0.5) * CELL, (Math.floor(i / COLS) + 0.5) * CELL);
      DRAW[habit](ink, REACH);
      ink.restore();
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  return tex;
}
