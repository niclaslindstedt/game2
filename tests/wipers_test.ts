// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLADES' OWN CLOCK — when each screen's arm starts, and how long its
// stroke takes.
//
// The film itself is looked at rather than asserted (`make cars` has a
// dead-astern "dirty rear" cell for exactly that), but WHEN the arms run is
// arithmetic over two rates: what the road lays on a pane by the metre
// (`SOIL`) against the coat that pane thinks is worth a stroke (`GRIME`).
// Both screens carry the same arm and the same film and want opposite
// answers out of them — the windscreen waits, the backlight goes at once —
// and the pair is easy to collapse into one behaviour by moving either
// number, with nothing failing to say so.
//
// It reaches into pwa/ the way screen_rain_test.ts does: three.js objects
// are built, but nothing is rendered, so there is no DOM and no GL.

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { buildWipers } from "../pwa/src/game/car/wipers.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const SPEED = 25;
const DT = 1 / 60;

/** A built car's two arms, windscreen first: the mounts are the only Groups
 * hung on the wipers, and they come in film order. */
function arms(built: ReturnType<typeof buildWipers>) {
  const mounts = built.group.children.filter((c) => c.type === "Group");
  return { front: mounts[0] as THREE.Object3D, rear: mounts[1] as THREE.Object3D };
}

function angle(mount: THREE.Object3D): number {
  return (mount.children[0] as THREE.Object3D).rotation.z;
}

/** Drive a dry gravel stage and watch both arms, a frame at a time.
 * `spray` at one is the calibration surface — loose and dry (`glassSpray`).
 */
function drive(seconds: number, spray = 1) {
  const built = buildWipers(
    CAR_BODIES.compact,
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
    "fine",
  );
  const mount = arms(built);
  const was = { front: angle(mount.front), rear: angle(mount.rear) };
  const strokes = { front: [] as number[], rear: [] as number[] };
  const first = { front: 0, rear: 0 };
  const moving = { front: false, rear: false };
  const started = { front: 0, rear: 0 };
  let travelled = 0;
  for (let n = 0; n < seconds / DT; n++) {
    built.update(0, spray, SPEED * DT, DT);
    travelled += SPEED * DT;
    for (const side of ["front", "rear"] as const) {
      const now = angle(mount[side]);
      const swinging = Math.abs(now - was[side]) > 1e-6;
      was[side] = now;
      if (swinging && !moving[side]) {
        started[side] = n * DT;
        if (first[side] === 0) first[side] = travelled;
      }
      if (!swinging && moving[side]) strokes[side].push(n * DT - started[side]);
      moving[side] = swinging;
    }
  }
  built.dispose();
  return { strokes, first };
}

describe("when the blades run", () => {
  it("goes at the backlight while it is still glass, and leaves the windscreen alone", () => {
    const { first } = drive(60);
    // The player watches the back window all stage, so the arm chases the
    // film rather than the cake: a stroke inside the first thirty metres of
    // gravel. The windscreen is the pane being looked THROUGH, and an arm
    // swinging across the view on a haze is worse than the haze — it waits
    // until the screen has properly gone off, which takes most of a hundred
    // and fifty metres at the same rates.
    expect(first.rear).toBeGreaterThan(0);
    expect(first.rear).toBeLessThan(30);
    expect(first.front).toBeGreaterThan(150);
  });

  it("throws the backlight's short arm across quicker than the windscreen's", () => {
    const { strokes } = drive(60);
    const rear = strokes.rear[0] as number;
    const front = strokes.front[0] as number;
    // A hatch's back wiper is a short blade on a small pane, and it is the
    // pane that soils fastest on the car: an arm that ambles over it is
    // behind the dirt before the stroke is finished.
    expect(rear).toBeLessThan(front);
    expect(rear).toBeLessThan(1);
    // …and it comes back, over and over, for as long as the road keeps
    // laying film — where the windscreen gets a handful of strokes in the
    // same minute.
    expect(strokes.rear.length).toBeGreaterThan(strokes.front.length * 3);
  });

  it("never starts on a surface that is throwing nothing", () => {
    // Tarmac, grass, a car standing still: the screens soil by the METRE
    // driven on something loose and dry, so there is nothing to clear and
    // no reason for an arm to move.
    const { strokes } = drive(60, 0);
    expect(strokes.rear).toHaveLength(0);
    expect(strokes.front).toHaveLength(0);
  });
});
