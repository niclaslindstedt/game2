// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHADOW THE COUNTRY THROWS — the march off a heightfield toward the
// sun (mountain-shadow.ts) that says, for every cell round the camera,
// below what height the ground is in a mountain's shadow. The GPU reads
// the bytes; this reads the same bytes here — TWO a cell, the shadow at
// either end of the interval the frame is drawing inside, which is what
// stops a terminator that moves eight metres between marches from getting
// there in one frame.

import { describe, expect, it } from "vitest";

import { createShadowMarch } from "../pwa/src/game/mountain-shadow.ts";

/** A ridge running north–south at x = 0, three hundred metres high, over
 * a flat plain. */
function ridge(x: number): number {
  return 300 * Math.max(0, 1 - Math.abs(x) / 150);
}

/** A sun `elevation` degrees up, standing in the +x direction. */
function sunFromEast(elevation: number): { x: number; y: number; z: number } {
  const el = (elevation * Math.PI) / 180;
  return { x: Math.cos(el), y: Math.sin(el), z: 0 };
}

describe("the country's shadow", () => {
  it("falls on the far side of a ridge from a low sun, and nowhere from a high one", () => {
    const march = createShadowMarch(ridge, 64, 2400);
    expect(march.focus(0, 0)).toBe(true);
    march.march(sunFromEast(10));
    // West of the ridge (away from the sun) the plain is in shadow; east
    // of it, toward the sun, it is not.
    expect(march.shadowed(-400, 0, 0)).toBe(true);
    expect(march.shadowed(400, 0, 0)).toBe(false);
    // The shadow has a ceiling: high enough over the plain and the point
    // is back in the sun.
    expect(march.shadowed(-400, 400, 0)).toBe(false);
    // The ceiling falls away from the ridge at the sun's own slope.
    expect(march.ceilingAt(-400, 0)).toBeGreaterThan(march.ceilingAt(-900, 0));
    // A noon sun clears it all.
    march.march(sunFromEast(60));
    expect(march.shadowed(-400, 0, 0)).toBe(false);
  });

  it("puts everything in shadow once the sun is down", () => {
    const march = createShadowMarch(ridge, 32, 1200);
    march.focus(0, 0);
    march.march(sunFromEast(-2));
    expect(march.shadowed(400, 0, 0)).toBe(true);
    expect(march.shadowed(-400, 1000, 0)).toBe(true);
    for (const byte of march.data) expect(byte).toBe(255);
  });

  it("encodes the ceiling over the window's own height range", () => {
    const march = createShadowMarch(ridge, 32, 1200);
    march.focus(0, 0);
    march.march(sunFromEast(15));
    expect(march.lo).toBeCloseTo(0, 0);
    expect(march.hi).toBeGreaterThan(200);
    for (let j = 0; j < march.size; j++) {
      for (let i = 0; i < march.size; i++) {
        const x = march.originX + ((i + 0.5) * march.span) / march.size;
        const z = march.originZ + ((j + 0.5) * march.span) / march.size;
        const ceiling = march.ceilingAt(x, z);
        const byte = march.data[2 * (j * march.size + i)];
        const decoded = march.lo + (byte / 255) * (march.hi - march.lo);
        // The bytes span the window's own heights: a ceiling under the
        // lowest ground is as good as none, and one over the highest as
        // good as everything.
        const held = Math.max(march.lo, Math.min(march.hi, ceiling));
        expect(Math.abs(decoded - held)).toBeLessThan(2);
      }
    }
  });

  it("brackets the sun with two marches, and crosses between them in a sweep", () => {
    const march = createShadowMarch(ridge, 64, 2400);
    march.focus(0, 0);
    // The pair a frame reads inside: where the shadow stands now, and
    // where it will stand half a degree of sun later.
    march.march(sunFromEast(3), sunFromEast(3.5));
    const cell = (x: number, z: number): number =>
      2 *
      (Math.floor((z - march.originZ) / (march.span / march.size)) * march.size +
        Math.floor((x - march.originX) / (march.span / march.size)));
    // Half a degree moves this ceiling further than the shader's own
    // penumbra is deep — which is the whole reason for the pair.
    const at = cell(-700, 0);
    const height = (byte: number): number => march.lo + (byte / 255) * (march.hi - march.lo);
    const from = height(march.data[at]);
    const to = height(march.data[at + 1]);
    expect(Math.abs(from - to)).toBeGreaterThan(4);
    // Read between them, sixty times a second over the seconds of racing
    // that half a degree of a sunrise takes, no step is anywhere near it.
    const STEPS = 180;
    let worst = 0;
    for (let k = 1; k <= STEPS; k++) {
      const was = from + ((to - from) * (k - 1)) / STEPS;
      const now = from + ((to - from) * k) / STEPS;
      worst = Math.max(worst, Math.abs(now - was));
    }
    expect(worst).toBeLessThan(0.5);
    // And the step off the end of one pair onto the next is not a step at
    // all: the far half becomes the near one, unchanged.
    march.advance(sunFromEast(4));
    expect(height(march.data[at])).toBeCloseTo(to, 6);
  });

  it("re-centres only once the camera has walked far enough", () => {
    const march = createShadowMarch(ridge, 32, 1200);
    expect(march.focus(0, 0)).toBe(true);
    expect(march.focus(100, 100)).toBe(false);
    expect(march.focus(500, 0)).toBe(true);
    expect(march.originX).toBeCloseTo(500 - 600, 6);
    // Outside the window nothing is claimed to be in shadow.
    march.march(sunFromEast(10));
    expect(march.shadowed(-5000, 0, 0)).toBe(false);
  });
});
