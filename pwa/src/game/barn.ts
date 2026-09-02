// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BARN (R37) — a Swedish ladugård, built from its plan. The biggest
// thing standing on any stage, and it has to read as one from a car doing
// a hundred: longer than the house is by half again, a storey taller, and
// a roof that is most of its height.
//
// The vocabulary is the real one. The BYRE is the ground floor — stone or
// rendered, grey, with a row of small square windows for the cattle — and
// the LOFT above it is boards in falu red with white corner boards, under a
// roof steeper and taller than any house's: a GAMBREL more often than not,
// the broken pitch that gives the loft its room, sheet metal or tile on a
// plain gable the rest of the time. The front, the long wall that faces the
// yard, has the big sliding door the tractor drives through and the
// people's door beside it; one gable has the loft door up an earth RAMP
// (the loftbro — a hay wagon was driven up it into the loft), and the ridge
// carries a ventilator or three. Half of them have a lean-to along the back,
// the machinery shed.
//
// Everything is one merged, vertex-coloured geometry through the house's
// own primitives and the flora's `GeoBuilder`, so a barn is one draw call.
// Local frame as the house's: y = 0 on the yard, +z the FRONT, +x its right
// as seen from the yard.

import * as THREE from "three";
import { BARN_STOREY, type HousePlan } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box, gableRoof, HOUSE, houseMaterial, PAINT, ROOF, windowOn } from "./house.ts";

const TINT = {
  /** The byre: rendered lime, grey with age, or the granite it was built
   * of; which is the plan's `detail`. */
  render: new THREE.Color(0xb9b6ac),
  stone: new THREE.Color(0x7e7d78),
  stoneDark: new THREE.Color(0x66655f),
  /** Black-tarred boards: the barn that was never painted red. */
  tar: new THREE.Color(0x2e2a26),
  door: new THREE.Color(0x5a3a2e),
  doorRail: new THREE.Color(0x3a3a3c),
  ramp: new THREE.Color(0x6b5a44),
  rampGrass: new THREE.Color(0x5b7a34),
  ventilator: new THREE.Color(0xe9e4d6),
  ventilatorCap: new THREE.Color(0x2b2d30),
  gambrel: new THREE.Color(0x2b2d30),
  gambrelRidge: new THREE.Color(0x1f2124),
  byreWindow: new THREE.Color(0x1e2328),
};

/** The barn's own proportions, m. */
export const BARN = {
  storey: BARN_STOREY,
  /** The big sliding door: wide enough for a tractor and a trailer. */
  door: { w: 3.6, h: 3.0 },
  /** The byre's windows: small squares in a row, high in the wall. */
  window: { w: 0.7, h: 0.6, sill: 1.9, pitch: 2.4 },
  /** The gambrel: the lower slope's pitch and the upper's, and where the
   * break sits as a share of the roof's half-depth. */
  gambrel: { lower: 1.05, upper: 0.42, break: 0.5 },
  /** The plain roof's pitch — steeper than a house's. */
  pitch: 0.7,
  /** The ridge ventilators: a little louvered tower with its own cap. */
  ventilator: { w: 0.9, h: 1.3 },
  /** The loft ramp: how far it runs out from the gable, and how wide. */
  ramp: { run: 7, w: 3.4 },
  lean: { storey: 2.6 },
} as const;

/** A gambrel roof over a block: two slopes a side, the lower steep and
 * the upper shallow, ridge along X. Returns the ridge height. */
function gambrelRoof(
  b: GeoBuilder,
  wall: THREE.Color,
  cx: number,
  cz: number,
  w: number,
  d: number,
  eaveY: number,
): number {
  const G = BARN.gambrel;
  const half = d / 2;
  const breakU = half * (1 - G.break);
  const breakY = eaveY + (half - breakU) * Math.tan(G.lower);
  const ridgeY = breakY + breakU * Math.tan(G.upper);
  const place = { x: cx, z: cz };
  // The attic: the profile of both slopes, extruded along the ridge in
  // the wall's own colour, so the gables are closed.
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(breakU, breakY - eaveY);
  shape.lineTo(0, ridgeY - eaveY);
  shape.lineTo(-breakU, breakY - eaveY);
  shape.closePath();
  const attic = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  attic.rotateY(-Math.PI / 2);
  attic.translate(w / 2, eaveY, 0);
  attic.computeVertexNormals();
  b.add(attic, wall, place);
  const length = w + HOUSE.gable * 2;
  const face = TINT.gambrel;
  /** A slab laid along one segment of the roof's profile, (z, y) to (z, y)
   * across the ridge, a little proud of the attic. A box along +z turned
   * about X by minus the segment's own angle points down it. */
  const slab = (z0: number, y0: number, z1: number, y1: number): void => {
    const run = Math.hypot(z1 - z0, y1 - y0);
    const angle = Math.atan2(y1 - y0, z1 - z0);
    const geo = new THREE.BoxGeometry(length, HOUSE.roofThick, run + 0.1);
    geo.rotateX(-angle);
    geo.translate(0, (y0 + y1) / 2 + HOUSE.roofThick * 0.8, (z0 + z1) / 2);
    b.add(geo, face, place);
  };
  for (const side of [-1, 1]) {
    // The lower slope from the eave (out past the wall) up to the break,
    // and the upper from the break to the ridge.
    const eaveZ = side * (half + HOUSE.eave);
    const eaveDrop = eaveY - HOUSE.eave * Math.tan(G.lower);
    slab(eaveZ, eaveDrop, side * breakU, breakY);
    slab(side * breakU, breakY, 0, ridgeY);
  }
  const cap = new THREE.BoxGeometry(length, 0.18, 0.4);
  cap.translate(0, ridgeY + 0.08, 0);
  b.add(cap, TINT.gambrelRidge, place);
  return ridgeY;
}

/** Build a barn from its plan. `rand` is the facet jitter's only. */
export function barnGeometry(plan: HousePlan, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const w = plan.width;
  const d = plan.depth;
  const S = BARN.storey;
  const loft = plan.walls === "grey" ? TINT.tar : PAINT[plan.walls];
  const trim = plan.walls === "white" ? PAINT.trimOnWhite : PAINT.trim;
  const stoneByre = plan.detail < 0.45;
  const byre = stoneByre ? TINT.stone : TINT.render;

  // The plinth, the byre and the loft: three boxes, the byre a hand
  // narrower so the boards overhang it.
  box(b, PAINT.plinth, 0, HOUSE.plinth / 2, 0, w + 0.16, HOUSE.plinth, d + 0.16);
  box(b, byre, 0, HOUSE.plinth + S / 2, 0, w, S, d);
  if (stoneByre) {
    // Courses of darker stone across the byre, a hint of masonry.
    for (let y = HOUSE.plinth + 0.7; y < HOUSE.plinth + S - 0.3; y += 0.85) {
      box(b, TINT.stoneDark, 0, y, 0, w + 0.02, 0.08, d + 0.02);
    }
  }
  const loftY = HOUSE.plinth + S;
  box(b, loft, 0, loftY + S / 2, 0, w + 0.12, S, d + 0.12);
  // A sill board where the boards meet the byre.
  box(b, trim, 0, loftY + 0.06, 0, w + 0.2, 0.12, d + 0.2);
  const c = HOUSE.cornerBoard;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(b, trim, sx * (w / 2 + 0.06), loftY + S / 2, sz * (d / 2 + 0.06), c, S, c);
    }
  }
  const eave = loftY + S;
  const ridge =
    plan.roof === "gambrel"
      ? gambrelRoof(b, loft, 0, 0, w, d, eave)
      : gableRoof(b, plan.roof === "tile" ? "tile" : "metal", loft, 0, 0, w, d, eave);

  // THE BIG DOOR on the front: a sliding leaf on its rail, set off centre,
  // and the people's door beside it.
  const D = BARN.door;
  const doorU = (plan.detail < 0.5 ? -1 : 1) * w * 0.18;
  box(b, TINT.door, doorU, HOUSE.plinth + D.h / 2, d / 2 + 0.06, D.w, D.h, 0.1);
  box(b, TINT.doorRail, doorU, HOUSE.plinth + D.h + 0.15, d / 2 + 0.1, D.w * 2 + 0.4, 0.12, 0.12);
  for (const k of [-1, 0, 1]) {
    box(
      b,
      TINT.doorRail,
      doorU + (k * D.w) / 3,
      HOUSE.plinth + D.h / 2,
      d / 2 + 0.12,
      0.08,
      D.h,
      0.04,
    );
  }
  const sideU = doorU - Math.sign(doorU) * (D.w / 2 + 2.2);
  box(
    b,
    PAINT.frame,
    sideU,
    HOUSE.plinth + HOUSE.door.h / 2,
    d / 2 + 0.03,
    HOUSE.door.w + 0.16,
    HOUSE.door.h + 0.1,
    0.06,
  );
  box(
    b,
    TINT.door,
    sideU,
    HOUSE.plinth + HOUSE.door.h / 2,
    d / 2 + 0.07,
    HOUSE.door.w,
    HOUSE.door.h,
    0.06,
  );

  // The byre's windows: a row of small squares down both long walls, the
  // ones the doors take left out.
  const W = BARN.window;
  const cols = Math.max(3, Math.floor(w / W.pitch));
  const pitch = w / cols;
  for (let k = 0; k < cols; k++) {
    const u = -w / 2 + pitch * (k + 0.5);
    if (Math.abs(u - doorU) > D.w / 2 + 0.6 && Math.abs(u - sideU) > 1.0) {
      windowOn(b, { axis: "z", sign: 1 }, d / 2, u, HOUSE.plinth + W.sill, W.w, W.h);
    }
    windowOn(b, { axis: "z", sign: -1 }, -d / 2, u, HOUSE.plinth + W.sill, W.w, W.h);
  }
  // A loft hatch high in each long wall, and boards' worth of shutter.
  for (const sign of [1, -1] as const) {
    box(b, TINT.door, -doorU * 0.6, loftY + S * 0.55, sign * (d / 2 + 0.08), 1.6, 1.8, 0.06);
  }

  // THE LOFT DOOR AND ITS RAMP in one gable: which one is the plan's.
  const rampSide: 1 | -1 = plan.detail < 0.5 ? -1 : 1;
  const gx = rampSide * (w / 2 + 0.06);
  box(b, TINT.door, gx + rampSide * 0.05, loftY + 1.4, 0, 0.08, 2.6, 2.8);
  box(b, trim, gx + rampSide * 0.02, loftY + 1.4, 0, 0.06, 2.8, 3.0);
  {
    // An earth ramp: a wedge from the ground up to the loft floor, grass on
    // its top and its sides.
    const R = BARN.ramp;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(R.run, 0);
    shape.lineTo(0.2, loftY - 0.05);
    shape.lineTo(0, loftY - 0.05);
    shape.closePath();
    const wedge = new THREE.ExtrudeGeometry(shape, { depth: R.w, bevelEnabled: false });
    // Drawn in x-y with its foot along +x; turned to run out along the
    // gable's normal, centred across the door.
    wedge.translate(0, 0, -R.w / 2);
    if (rampSide < 0) wedge.rotateY(Math.PI);
    wedge.translate(rampSide * (w / 2 + 0.1), 0, 0);
    wedge.computeVertexNormals();
    b.add(wedge, TINT.ramp);
    const top = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    top.dispose();
    box(
      b,
      TINT.rampGrass,
      rampSide * (w / 2 + 0.1 + R.run * 0.5),
      loftY * 0.5 + 0.02,
      0,
      R.run * 0.98,
      0.04,
      R.w + 0.02,
    );
  }
  // A small window in each gable over the loft door's line.
  for (const side of [-1, 1] as const) {
    windowOn(
      b,
      { axis: "x", sign: side },
      side * (w / 2 + 0.06),
      0,
      eave + (ridge - eave) * 0.35,
      0.6,
      0.6,
    );
  }

  // THE VENTILATORS on the ridge: one every eight metres or so.
  const V = BARN.ventilator;
  const vents = Math.max(1, Math.round(w / 8.5));
  for (let k = 0; k < vents; k++) {
    const u = -w / 2 + (w * (k + 0.5)) / vents;
    box(b, TINT.ventilator, u, ridge + V.h / 2 - 0.1, 0, V.w, V.h, V.w);
    const cap = new THREE.ConeGeometry(V.w * 0.85, 0.5, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(u, ridge + V.h + 0.12, 0);
    b.add(cap, TINT.ventilatorCap);
  }

  // THE LEAN-TO along the back: the machinery shed under a single pitch,
  // open along its front on posts.
  if (plan.wing) {
    const g = plan.wing;
    const L = BARN.lean;
    const cx = g.side * (w / 2 - g.width / 2);
    const cz = -d / 2 - g.depth / 2;
    const top = HOUSE.plinth + L.storey;
    // Its back wall and gable end are boards; the front is posts.
    box(b, loft, cx, HOUSE.plinth + L.storey / 2, cz - g.depth / 2 + 0.1, g.width, L.storey, 0.2);
    box(
      b,
      loft,
      cx + g.side * (g.width / 2 - 0.1),
      HOUSE.plinth + L.storey / 2,
      cz,
      0.2,
      L.storey,
      g.depth,
    );
    for (let k = 0; k <= 2; k++) {
      const u = cx - g.width / 2 + 0.2 + (g.width - 0.4) * (k / 2);
      box(
        b,
        trim,
        u,
        HOUSE.plinth + L.storey / 2,
        cz - g.depth / 2 + 0.1 - 0.02,
        0.16,
        L.storey,
        0.16,
      );
    }
    const slope = new THREE.BoxGeometry(g.width + 0.4, HOUSE.roofThick, g.depth + 0.5);
    slope.rotateX(0.32);
    slope.translate(cx, top + Math.sin(0.32) * (g.depth / 2) + 0.05, cz + 0.05);
    b.add(slope, TINT.gambrel);
  }
  return b.build();
}

/** The barn as a mesh, standing on local y = 0 facing +z. */
export function buildBarn(plan: HousePlan, rand: () => number): THREE.Mesh {
  const mesh = new THREE.Mesh(barnGeometry(plan, rand), houseMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

/** A tower silo: a tall grey cylinder with a domed cap and the ladder up
 * one side, standing on local y = 0. */
export function buildSilo(radius: number, height: number, rand: () => number): THREE.Mesh {
  const b = new GeoBuilder(rand);
  const body = new THREE.CylinderGeometry(radius, radius, height, 14);
  body.translate(0, height / 2, 0);
  b.add(body, new THREE.Color(0x9ea3a6));
  for (let y = 2; y < height; y += 2.4) {
    const band = new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.12, 14);
    band.translate(0, y, 0);
    b.add(band, new THREE.Color(0x6c7175));
  }
  const dome = new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.55, 1);
  dome.translate(0, height, 0);
  b.add(dome, new THREE.Color(0x7d8286));
  box(b, ROOF.metal.face, radius + 0.25, height / 2, 0, 0.08, height, 0.5);
  for (let y = 0.5; y < height; y += 0.45) {
    box(b, ROOF.metal.face, radius + 0.25, y, 0, 0.5, 0.04, 0.04);
  }
  const mesh = new THREE.Mesh(b.build(), houseMaterial());
  mesh.frustumCulled = true;
  return mesh;
}
