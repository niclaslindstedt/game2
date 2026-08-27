// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wheels: a chunky faceted tire wearing one of three rim faces, plus
// tread lugs embedded around the rolling surface. The rim breaks the
// face's rotational symmetry and the lugs break the tread's — together the
// spin rate is legible at a glance from any angle, which is most of what
// sells speed on a car this small on screen.
//
// Round parts come from THREE primitives through bakeShading, because
// hand-winding circular geometry fails silently (faces are culled, not
// flagged). The rim FACE is the exception: it is flat radial geometry in
// the wheel's known y-z plane, so its winding is derived once here.

import * as THREE from "three";

import { MeshBuilder, bakeShading, type V3 } from "./builder.ts";
import type { CarBodySpec, WheelStyle } from "./spec.ts";

/** The rim, as fractions of the tire radius. */
const RIM_OUTER = 0.75;
const RIM_INNER = 0.57;
const RIM_HUB = 0.2;
const RIM_FACETS = 16;

/** Per-style rim geometry: how wide the spokes are, how many, and how far
 * the polished lip reaches. `steel` is a painted rim under a small hubcap
 * with a ring of bolt-head dimples; `split` is the wide four-spoke classic;
 * `alloy` is the multi-spoke the catalog started with. */
const STYLES: Record<WheelStyle, { spokes: number; width: number; cap: number; bolts: boolean }> = {
  alloy: { spokes: 6, width: 0.12, cap: RIM_HUB, bolts: false },
  steel: { spokes: 0, width: 0, cap: 0.42, bolts: true },
  split: { spokes: 4, width: 0.3, cap: 0.26, bolts: false },
};

/** One flat radial face of the rim, drawn in the wheel's y-z plane at ±x.
 * Angles run y = cos a, z = sin a; stepping OUTWARD in radius then FORWARD
 * in angle gives a +x normal, so `outward` −1 reverses the cycle. */
function rimFace(
  b: MeshBuilder,
  x: number,
  outward: number,
  style: WheelStyle,
  hub: number,
  spokes: number,
): void {
  const s = { ...STYLES[style], spokes };
  const pt = (r: number, a: number): V3 => [x, r * Math.cos(a), r * Math.sin(a)];
  const quad = (
    r0: number,
    a0: number,
    r1: number,
    a1: number,
    ao0: number,
    ao1: number,
    color: number,
  ): void => {
    const c = [pt(r0, a0), pt(r1, ao0), pt(r1, ao1), pt(r0, a1)];
    if (outward > 0) b.quad(c[0], c[1], c[2], c[3], color);
    else b.quad(c[3], c[2], c[1], c[0], color);
  };
  // The lip: a bright ring at the tire's shoulder on every style.
  for (let i = 0; i < RIM_FACETS; i++) {
    const a0 = (i / RIM_FACETS) * Math.PI * 2;
    const a1 = ((i + 1) / RIM_FACETS) * Math.PI * 2;
    quad(RIM_INNER, a0, RIM_OUTER, a1, a0, a1, hub);
    // Centre cap, fanned from the axle.
    const c = [pt(s.cap, a0), pt(s.cap, a1)];
    if (outward > 0) b.tri([x, 0, 0], c[0], c[1], hub);
    else b.tri([x, 0, 0], c[1], c[0], hub);
  }

  // Straight-sided spokes: constant width, so the half-angle shrinks with
  // radius. They stop at the lip, leaving the tire face as the void.
  const w = s.width / 2;
  for (let i = 0; i < s.spokes; i++) {
    const a = (i / s.spokes) * Math.PI * 2;
    const ai = w / Math.max(s.cap, RIM_HUB);
    const ao = w / RIM_INNER;
    quad(Math.max(s.cap, RIM_HUB), a - ai, RIM_INNER, a + ai, a - ao, a + ao, hub);
  }

  // A steel wheel has no spokes to catch the eye, so its bolt circle is
  // what makes the rotation readable.
  if (s.bolts) {
    const bolts = 4;
    const r = s.cap * 0.62;
    const dark = 0x2b3037;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2 + Math.PI / 4;
      const half = 0.035 / r;
      quad(r * 0.72, a - half, r * 1.25, a + half, a - half * 0.6, a + half * 0.6, dark);
    }
    // The gap between cap and lip is painted rim, not a void.
    for (let i = 0; i < RIM_FACETS; i++) {
      const a0 = (i / RIM_FACETS) * Math.PI * 2;
      const a1 = ((i + 1) / RIM_FACETS) * Math.PI * 2;
      quad(s.cap, a0, RIM_INNER, a1, a0, a1, 0x3a4048);
    }
  }
}

/** One wheel's geometries — tire, rim faces, tread lugs. Axle along x;
 * origin at the wheel center. */
export function buildWheel(spec: CarBodySpec): THREE.BufferGeometry[] {
  const r = spec.wheelRadius;
  const tireGeo = bakeShading(
    new THREE.CylinderGeometry(r, r, spec.wheelWidth, RIM_FACETS).rotateZ(Math.PI / 2),
    0x181c22,
  );
  const b = new MeshBuilder();
  const hub = spec.colors.hub ?? 0xe6e3da;
  const style = spec.wheelStyle ?? "alloy";
  const spokes = spec.wheelSpokes ?? STYLES[style].spokes;
  for (const side of [1, -1]) {
    rimFace(b, side * (spec.wheelWidth / 2 + 0.005), side, style, hub, spokes);
  }
  const rimGeo = b.geometry();
  rimGeo.scale(1, r, r);

  // Tread lugs: blocks a shade lighter than the tire, riding the rolling
  // surface so the tire itself visibly turns even seen dead from the side.
  const geos = [tireGeo, rimGeo];
  const lugs = 8;
  for (let i = 0; i < lugs; i++) {
    const angle = (i / lugs) * Math.PI * 2;
    geos.push(
      bakeShading(
        new THREE.BoxGeometry(spec.wheelWidth + 0.015, 0.05, 0.09)
          .translate(0, r - 0.008, 0)
          .rotateX(angle),
        0x333a44,
      ),
    );
  }
  return geos;
}
