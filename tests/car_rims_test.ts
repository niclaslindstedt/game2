// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH WAY ROUND A WHEEL IS BOLTED ON.
//
// A wheel is not symmetric. Its rim — the flange, the dish, the spokes, the
// hub and the studs — is built on the OUTBOARD end only, because the inboard
// end is a plain wall up inside the arch that nothing can ever see, and
// spokes drawn there are spokes drawn four times per car for nobody. That
// saving is the whole reason wheels.ts takes an `outboard` side at all.
//
// The trap it buys is the one this file exists for: a single wheel geometry
// shared by every corner puts the plain wall OUTWARD on one side of the car,
// and those two wheels read as bare black drums with no rims at all. It is
// invisible from the front 3/4 and the side — the two angles a contact sheet
// leads with — because both of those look at the car's other flank, so it
// survives every glance that is not deliberately aimed at the far side.
//
// Nothing else checks it: the geometry is the app's and the assembly is the
// app's, and both are correct in isolation. This test reaches across into
// pwa/ the way tests/car_geometry_test.ts does — it can, because a car body
// is three.js meshes and arithmetic, with no renderer and no DOM behind it.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildCarBody, type CarBodySpec } from "../pwa/src/game/car-body.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import { buildWheel, rimRadii } from "../pwa/src/game/car/wheels.ts";

const bodies = Object.entries(CAR_BODIES);

/** How much rim detail sits at each end of a wheel, counted INSIDE the
 * barrel — the radius the dish is sunk to. Out beyond it lie the tire, the
 * tread and the flange, which both ends carry alike and which would drown
 * the difference this measures. */
function dishDetail(geo: THREE.BufferGeometry, spec: CarBodySpec): { plus: number; minus: number } {
  const pos = geo.getAttribute("position");
  // The barrel, in metres: wheels.ts states it as a fraction of the tire.
  const barrel = spec.wheelRadius * rimRadii(spec).barrel;
  let plus = 0;
  let minus = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (Math.hypot(pos.getY(i), pos.getZ(i)) > barrel) continue;
    // The sidewall plane is a few centimetres out; nothing real sits on the
    // wheel's centreline, so this only skips the tire's own seam.
    if (x > 0.005) plus++;
    else if (x < -0.005) minus++;
  }
  return { plus, minus };
}

/** The side of the axle the rim's FACE is on: +1 or -1. */
function faceSide(geo: THREE.BufferGeometry, spec: CarBodySpec): number {
  const { plus, minus } = dishDetail(geo, spec);
  return plus > minus ? 1 : -1;
}

describe("a wheel has a front and a back", () => {
  it.each(bodies)("%s carries its rim face on the side it was asked for", (_id, spec) => {
    for (const outboard of [1, -1] as const) {
      const geo = buildWheel(spec, outboard);
      expect(faceSide(geo, spec)).toBe(outboard);
      geo.dispose();
    }
  });

  it.each(bodies)("%s is asymmetric enough that one geometry cannot serve both", (_id, spec) => {
    const geo = buildWheel(spec, 1);
    const { plus, minus } = dishDetail(geo, spec);
    // If these ever came out level the saving above would have been undone
    // and the bug this file guards would be unreachable — but so would the
    // reason for building two geometries, and that is worth being told.
    expect(plus).toBeGreaterThan(minus * 1.5);
    geo.dispose();
  });

  it.each(bodies)("%s mirrors the pair rather than building two wheels", (_id, spec) => {
    const right = buildWheel(spec, 1);
    const left = buildWheel(spec, -1);
    expect(left.getAttribute("position").count).toBe(right.getAttribute("position").count);
    const a = dishDetail(right, spec);
    const b = dishDetail(left, spec);
    expect(b.plus).toBe(a.minus);
    expect(b.minus).toBe(a.plus);
    right.dispose();
    left.dispose();
  });
});

describe("the wheels a car is assembled with", () => {
  it.each(bodies)("%s shows a rim at all four corners", (_id, spec) => {
    const body = buildCarBody(spec, {});
    expect(body.wheelSpin).toHaveLength(4);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      const spin = body.wheelSpin[i] as THREE.Mesh;
      const x = body.wheelGroups[i].position.x;
      expect(x).not.toBe(0);
      expect(faceSide(spin.geometry as THREE.BufferGeometry, spec)).toBe(Math.sign(x));
    }
    body.dispose();
  });
});
