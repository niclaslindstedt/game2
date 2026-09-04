// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wheels: a chunky faceted tire wearing one of three rim faces, plus
// tread lugs embedded around the rolling surface. The rim breaks the
// face's rotational symmetry and the lugs break the tread's — together the
// spin rate is legible at a glance from any angle, which is most of what
// sells speed on a car this small on screen.
//
// The rim is BUILT, not painted. A flat disc of radial geometry on the
// tire's sidewall is what a wheel looks like from exactly one angle — dead
// side on — and from every other one it is a sticker: no lip standing proud
// of the rubber, no dish behind it, no thickness to a spoke. So the rim
// here is a lip ring proud of the sidewall, a barrel sunk in behind it, a
// recessed hub, and spokes that are boxes bridging the two with sides you
// can see. It costs geometry and it is the geometry worth spending: a wheel
// is the one part of a car that is never still.
//
// Round parts come from THREE primitives through bakeShading, because
// hand-winding circular geometry fails silently (faces are culled, not
// flagged).

import * as THREE from "three";

import { MeshBuilder, bakeShading } from "./builder.ts";
import type { CarBodySpec, WheelStyle } from "./spec.ts";

/** The rim, as fractions of the tire radius. */
/** Outer edge of the rim flange — just inside the tire's own radius. */
const RIM_OUTER = 0.86;
/** Inner edge of that flange, and the radius of the barrel behind it. */
const RIM_BARREL = 0.74;
const RIM_FACETS = 18;
/** The tire carries more, because its outline is a circle nothing ever
 * covers up and a coarse one reads as a polygon at any speed. */
const TIRE_FACETS = 26;
/** How far the flange stands proud of the sidewall, and how deep the dish
 * behind it runs, m. The step between them is the whole read of a rim. */
const LIP_PROUD = 0.014;
const DISH = 0.075;
const TIRE = 0x181c22;

/** Per-style rim geometry: how many spokes, how broad, how deep the dish,
 * and whether the studs show. `steel` is a plain rim under a big cap;
 * `split` the wide four-spoke classic; `alloy` the multi-spoke. */
const STYLES: Record<
  WheelStyle,
  { spokes: number; width: number; hub: number; dish: number; bolts: boolean }
> = {
  alloy: { spokes: 5, width: 0.24, hub: 0.26, dish: 1, bolts: true },
  steel: { spokes: 0, width: 0, hub: 0.42, dish: 0.4, bolts: true },
  split: { spokes: 4, width: 0.34, hub: 0.28, dish: 1.15, bolts: false },
};

/** A tube on the wheel's axis, in tire radii. THREE builds it in its own
 * axis and this turns it onto the axle, so nothing here is hand-wound and
 * nothing can come back inside out. */
function tube(b: MeshBuilder, r: number, x0: number, x1: number, color: number): void {
  b.absorb(
    bakeShading(
      new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), RIM_FACETS, 1, true)
        .rotateZ(Math.PI / 2)
        .translate((x0 + x1) / 2, 0, 0),
      color,
    ),
  );
}

/** A flat ring facing along the axle. */
function annulus(
  b: MeshBuilder,
  inner: number,
  outer: number,
  x: number,
  outward: number,
  color: number,
): void {
  b.absorb(
    bakeShading(
      new THREE.RingGeometry(inner, outer, RIM_FACETS)
        .rotateY((outward * Math.PI) / 2)
        .translate(x, 0, 0),
      color,
    ),
  );
}

/** A box laid radially and spun round the axle — a spoke, or a stud. */
function radial(
  b: MeshBuilder,
  thick: number,
  length: number,
  width: number,
  at: number,
  x: number,
  angle: number,
  color: number,
): void {
  b.absorb(
    bakeShading(
      new THREE.BoxGeometry(thick, length, width)
        .translate(0, at, 0)
        .rotateX(angle)
        .translate(x, 0, 0),
      color,
    ),
  );
}

/** A hex colour scaled — the barrel and the dish floor are the same metal
 * as the face, seen at an angle that never catches the light. */
function shadeHex(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/** One end of the rim: the flange proud of the sidewall, the barrel sunk
 * behind it, and — on the FACE end only — the dish floor, the hub, the
 * spokes bridging them and the studs. The other end gets the flange and a
 * plain wall, which is what the back of a wheel is, and saves drawing spokes
 * nothing can ever see. Which end is which is the caller's to say: it is the
 * side of the CAR the wheel is bolted to, not a sign fixed in the geometry.
 */
function rimFace(
  b: MeshBuilder,
  sidewall: number,
  outward: number,
  faced: boolean,
  style: WheelStyle,
  hubColor: number,
  spokes: number,
  spokeWidth: number | undefined,
): void {
  const s = { ...STYLES[style], spokes, width: spokeWidth ?? STYLES[style].width };
  const barrel = shadeHex(hubColor, 0.6);
  const x = (d: number): number => sidewall + outward * d;

  // The rubber sidewall, from the flange out to the tread. The tire itself
  // is an OPEN tube — it has to be, or its end cap seals the wheel shut and
  // every recessed thing behind this point is drawn inside a solid drum —
  // so this ring is what closes the gap between rim and tread.
  annulus(b, RIM_OUTER, 1, x(0), outward, TIRE);

  // The flange: a ring standing proud of the rubber with its face turned
  // out. This edge is what says "rim" from every angle but dead side on.
  tube(b, RIM_OUTER, x(0), x(LIP_PROUD), hubColor);
  annulus(b, RIM_BARREL, RIM_OUTER, x(LIP_PROUD), outward, hubColor);

  const floor = x(-DISH * s.dish);
  tube(b, RIM_BARREL, x(LIP_PROUD), floor, barrel);

  if (!faced) {
    annulus(b, 0, RIM_BARREL, floor, outward, barrel);
    return;
  }

  // The floor of the dish. Without it the dish is a hole with the far
  // sidewall showing through, which is what makes a rim read as a cut-out.
  annulus(b, s.hub, RIM_BARREL, floor, outward, shadeHex(barrel, 0.75));

  // Spokes: boxes from the hub out under the flange, standing off that
  // floor so their SIDES show. A spoke with no side is a painted line.
  const mid = (s.hub + RIM_BARREL) / 2;
  const face = x(-DISH * s.dish + 0.042);
  for (let i = 0; i < s.spokes; i++) {
    radial(
      b,
      0.05,
      RIM_BARREL - s.hub + 0.05,
      s.width,
      mid,
      face,
      (i / s.spokes) * Math.PI * 2,
      hubColor,
    );
  }

  // The hub, over the spoke roots, and the studs on it.
  tube(b, s.hub, floor, x(-DISH * s.dish + 0.062), hubColor);
  annulus(b, 0, s.hub, x(-DISH * s.dish + 0.062), outward, hubColor);
  if (s.bolts) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      radial(b, 0.02, 0.05, 0.05, s.hub * 0.55, x(-DISH * s.dish + 0.072), angle, 0x2b3037);
    }
  }
}

/** One wheel as a SINGLE geometry — tire, both rim ends and every tread lug
 * in one buffer. Axle along x; origin at the wheel center.
 *
 * `outboard` is the x direction that points AWAY from the car, and it is the
 * end that gets the rim's face. A wheel is not symmetric — the back of one
 * is a plain wall — so the two sides of a car need one geometry each; built
 * with a single sign, whichever side of the car it is wrong for shows a bare
 * drum where its rim should be.
 *
 * The parts are welded rather than kept apart because nothing ever moves
 * one relative to another: a wheel spins as a unit. Split, a car spends ten
 * draw calls per corner and forty on its wheels alone — the cost that
 * decides how many cars can be on a stage at once. */
export function buildWheel(spec: CarBodySpec, outboard: 1 | -1 = 1): THREE.BufferGeometry {
  const r = spec.wheelRadius;
  const hub = spec.colors.hub ?? 0xe6e3da;
  const style = spec.wheelStyle ?? "alloy";
  const spokes = spec.wheelSpokes ?? STYLES[style].spokes;

  // The rim is built in unit radius and scaled to the tire after, so the
  // radii above stay readable as fractions. Only the RADIAL axes scale —
  // the axial one must not, or the dish deepens with the tire.
  const rim = new MeshBuilder();
  for (const side of [1, -1] as const) {
    rimFace(
      rim,
      side * (spec.wheelWidth / 2 - 0.012),
      side,
      side === outboard,
      style,
      hub,
      spokes,
      spec.wheelSpokeWidth,
    );
  }
  const rimGeo = rim.geometry();
  rimGeo.scale(1, r, r);

  const b = new MeshBuilder();
  // Open-ended: the rim's dish is sunk INSIDE the tire's width, so a capped
  // cylinder would draw a lid straight over the spokes. rimFace lays the
  // sidewall ring back in.
  b.absorb(
    bakeShading(
      new THREE.CylinderGeometry(r, r, spec.wheelWidth, TIRE_FACETS, 1, true).rotateZ(Math.PI / 2),
      TIRE,
    ),
  );
  b.absorb(rimGeo);

  // The TREAD. Eight blocks spaced round the carcass cover about a third of
  // it, and a third of a tire is not a tire — it reads as lumps of rubber
  // stuck on a black wheel. A real block pattern nearly closes: the blocks
  // take most of each pitch and the grooves between them are the gaps. Two
  // rows, staggered half a pitch, so there is a pattern to see turning
  // rather than a ring of identical teeth.
  // The blocks are GROOVED INTO the carcass, not stood on top of it: their
  // faces clear it by four millimetres, so the silhouette stays the circle
  // the carcass already draws and the pattern reads as tread. Stood proud
  // by any real amount they scallop the outline instead, and a tire with
  // notches cut round its edge is a cog.
  const blocks = 20;
  const pitch = (Math.PI * 2) / blocks;
  const rowW = spec.wheelWidth * 0.46;
  const rowX = spec.wheelWidth * 0.25;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < blocks; i++) {
      const angle = i * pitch + (row ? pitch / 2 : 0);
      b.absorb(
        bakeShading(
          new THREE.BoxGeometry(rowW, 0.035, r * pitch * 0.88)
            .translate(0, r - 0.0135, 0)
            .rotateX(angle)
            .translate(row ? rowX : -rowX, 0, 0),
          0x333a44,
        ),
      );
    }
  }
  return b.geometry();
}
