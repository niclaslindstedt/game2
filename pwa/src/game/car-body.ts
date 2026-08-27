// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parametric car builder: turns a CarBodySpec — a JSON-friendly bundle of
// dimensions, silhouette stations, and colors — into low-poly meshes for
// every part of a rally car: the lofted body shell (bumper to bumper, with
// hood, roof deck and fender flares), the glass greenhouse, bumpers,
// lights, wheels, mirrors, mud flaps, and the spoiler.
//
// The whole game is fullbright (MeshBasicMaterial), so shape definition is
// BAKED: every face's vertex colors are the part color scaled by a fixed
// fake sun (lambert, ambient + diffuse). That keeps the arcade look — no
// runtime lights, no shading pops — while hoods, sides, and sills read as
// distinct planes. The specs themselves live in car-styles.ts.

import * as THREE from "three";
import type { DamagePart } from "@engine";

type V3 = readonly [number, number, number];

/** One silhouette station: where the top surface (hood/roof-deck/trunk)
 * sits and how wide the belt line is at that point along the car. Stations
 * run nose (+z) → tail (−z); the loft interpolates linearly between them,
 * which is exactly the faceted look the art direction wants. */
export type ProfilePoint = {
  /** Position along the car, m — +z is the nose, −z the tail. */
  z: number;
  /** Height of the body's top surface at this station, m. */
  topY: number;
  /** Half-width at the belt line here, m. */
  half: number;
};

export type Spoiler =
  | { kind: "none" }
  /** A subtle lip riding the tail/hatch edge. */
  | { kind: "lip"; z: number; y: number; span: number }
  /** The full rally wing: posts, blade, endplates. */
  | { kind: "wing"; z: number; y: number; span: number; chord: number };

export type CarBodySpec = {
  /** Belt-line silhouette, nose → tail. First/last stations are the caps. */
  profile: ProfilePoint[];
  /** Underside height, m — the body floor; wheels hang below it. */
  floorY: number;
  /** Belt line (widest point of the body side), m. */
  beltY: number;
  wheelbase: number;
  /** Shifts both axles toward the nose (+) or tail (−), m. */
  axleShift?: number;
  /** Lateral distance from centerline to each wheel's center, m. */
  trackHalf: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Alloy spokes per wheel face. 0 leaves a plain steel-wheel disc. */
  wheelSpokes?: number;
  /** The glass house. roofPaint "accent" gives the rally two-tone roof. */
  cabin: {
    cowlZ: number;
    roofFrontZ: number;
    roofRearZ: number;
    baseRearZ: number;
    roofY: number;
    roofHalf: number;
    roofPaint?: "paint" | "accent";
    /** Body-colored frame left around the glass, m. The cabin is built as
     * a solid shell and the glass is cut into it, so these widths ARE the
     * pillars: a/b/c are the windscreen, door and rear posts. */
    pillars?: {
      a?: number;
      b?: number;
      c?: number;
      /** Metal under the side windows (the door top) and over them. */
      sill?: number;
      header?: number;
      /** B-pillar position along the cabin, 0 at the cowl, 1 at the tail. */
      split?: number;
      /** Extra sill under the rear quarter window — the rally kick-up. */
      quarterRise?: number;
    };
    pillarPaint?: "paint" | "accent";
  };
  /** Fender flares: extra belt half-width peaking over each axle, m. */
  flare?: { extra: number; length: number };
  spoiler?: Spoiler;
  /** Accent stripes laid on the hood/deck, offsets are x centers, m. */
  stripes?: { offsets: number[]; width: number; zFrom: number; zTo: number };
  mudflaps?: boolean;
  mirrors?: boolean;
  /** Dark panels behind the wheels that read as wheel-well cutouts. */
  archCut?: boolean;
  colors: {
    paint: number;
    accent: number;
    glass?: number;
    trim?: number;
    hub?: number;
    bumper?: number;
  };
};

export type CarBodyParts = {
  /** The whole car, origin at ground level under the body center. */
  group: THREE.Group;
  /** The SPRUNG mass — every panel, and nothing that touches the ground.
   * The wheels hang off `group` instead, so the suspension can squat and
   * rebound the body without pushing the tires through the gravel. */
  chassis: THREE.Group;
  /** [FL, FR, RL, RR] — rotate .y for steering. */
  wheelGroups: THREE.Group[];
  /** Same order — rotate .x to spin with road speed. */
  wheelSpin: THREE.Object3D[];
  /** The bendable shell — the mesh the damage visual crumples. */
  body: THREE.Mesh;
  /** The pieces an impact can tear off, each its own mesh so the damage
   * visual can detach one and send it flying (the engine names which). */
  breakables: Partial<Record<DamagePart, THREE.Mesh>>;
  dispose: () => void;
};

// The baked sun: high, a touch to the front-right, so hoods and roofs are
// brightest, flanks mid, undersides in ambient. Tuned so no face goes
// darker than ~0.6× its part color — the arcade look hates black holes.
const LIGHT = new THREE.Vector3(0.35, 1, 0.45).normalize();
const AMBIENT = 0.62;
const DIFFUSE = 0.38;

/** Accumulates flat-shaded triangles with baked lambert vertex colors. */
class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly c = new THREE.Color();

  tri(a: V3, b: V3, c: V3, color: number): void {
    this.ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.n.crossVectors(this.ab, this.ac).normalize();
    const k = AMBIENT + DIFFUSE * Math.max(0, this.n.dot(LIGHT));
    this.c.set(color).multiplyScalar(k);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
  }

  /** Corners counter-clockwise seen from outside the surface. */
  quad(a: V3, b: V3, c: V3, d: V3, color: number): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number): void {
    const x = sx / 2;
    const y = sy / 2;
    const z = sz / 2;
    const p = (dx: number, dy: number, dz: number): V3 => [cx + dx * x, cy + dy * y, cz + dz * z];
    // Six faces, each wound outward.
    this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), color); // front +z
    this.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), color); // rear −z
    this.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), color); // right +x
    this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), color); // left −x
    this.quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1), color); // top +y
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), color); // bottom −y
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return geo;
  }
}

// The body side is three planes: rocker (tucked under), belt (widest), and
// shoulder (tumblehome toward the deck). These ratios shape the tuck.
const ROCKER = 0.9;
const SHOULDER = 0.8;

type Station = { z: number; topY: number; half: number; flare: number };

function sampleProfile(profile: ProfilePoint[], z: number): { topY: number; half: number } {
  const zc = Math.min(profile[0].z, Math.max(profile[profile.length - 1].z, z));
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (zc <= a.z && zc >= b.z) {
      const t = a.z === b.z ? 0 : (a.z - zc) / (a.z - b.z);
      return { topY: a.topY + (b.topY - a.topY) * t, half: a.half + (b.half - a.half) * t };
    }
  }
  const last = profile[profile.length - 1];
  return { topY: last.topY, half: last.half };
}

/** Merge the authored silhouette with the flare stations over each axle —
 * a triangular bulge (0 → extra → 0) makes chunky faceted fenders. */
function buildStations(spec: CarBodySpec, axles: number[]): Station[] {
  const stations: Station[] = spec.profile.map((p) => ({ ...p, flare: 0 }));
  const flare = spec.flare;
  if (flare) {
    const zNose = spec.profile[0].z;
    const zTail = spec.profile[spec.profile.length - 1].z;
    for (const axle of axles) {
      for (const [dz, amount] of [
        [flare.length / 2, 0],
        [0, flare.extra],
        [-flare.length / 2, 0],
      ]) {
        const z = axle + dz;
        if (z >= zNose || z <= zTail) continue;
        const s = sampleProfile(spec.profile, z);
        stations.push({ z, topY: s.topY, half: s.half, flare: amount });
      }
    }
  }
  stations.sort((a, b) => b.z - a.z);
  // Two stations at one z would loft a zero-length ring; keep the wider.
  return stations.filter((s, i) => i === 0 || Math.abs(s.z - stations[i - 1].z) > 1e-4);
}

/** Ring cross-section at a station: counter-clockwise seen from the nose,
 * bottom center → up the right side → top center → down the left side. */
function ring(spec: CarBodySpec, st: Station): V3[] {
  const belt = st.half + st.flare;
  const floor = st.half * ROCKER + st.flare * 0.7;
  const top = st.half * SHOULDER + st.flare * 0.25;
  return [
    [0, spec.floorY, st.z],
    [floor, spec.floorY, st.z],
    [belt, spec.beltY, st.z],
    [top, st.topY, st.z],
    [0, st.topY, st.z],
    [-top, st.topY, st.z],
    [-belt, spec.beltY, st.z],
    [-floor, spec.floorY, st.z],
  ];
}

function buildShell(b: MeshBuilder, spec: CarBodySpec, stations: Station[]): void {
  const paint = spec.colors.paint;
  const trim = spec.colors.trim ?? 0x14181f;
  const segColor = (k: number): number => (k === 0 || k === 7 ? trim : paint);

  for (let i = 0; i < stations.length - 1; i++) {
    const a = ring(spec, stations[i]);
    const c = ring(spec, stations[i + 1]);
    for (let k = 0; k < a.length; k++) {
      const k2 = (k + 1) % a.length;
      b.quad(a[k2], a[k], c[k], c[k2], segColor(k));
    }
  }

  // Caps: nose faces +z, tail −z, fanned from the ring centroid.
  const cap = (st: Station, forward: boolean): void => {
    const pts = ring(spec, st);
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
    }
    const center: V3 = [cx / pts.length, cy / pts.length, st.z];
    for (let k = 0; k < pts.length; k++) {
      const k2 = (k + 1) % pts.length;
      if (forward) b.tri(center, pts[k], pts[k2], paint);
      else b.tri(center, pts[k2], pts[k], paint);
    }
  };
  cap(stations[0], true);
  cap(stations[stations.length - 1], false);
}

/** A cabin panel as a bilinear patch. Corners counter-clockwise seen from
 * OUTSIDE, in the order [p00, p10, p11, p01]: u runs p00→p10, v runs
 * p00→p01. The greenhouse's side panels are warped quads (the cowl is
 * narrower than the roof), so glass openings sample the patch instead of
 * assuming a plane. */
type Patch = readonly [V3, V3, V3, V3];

function mix3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function dist3(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function patchAt(q: Patch, u: number, v: number): V3 {
  return mix3(mix3(q[0], q[1], u), mix3(q[3], q[2], u), v);
}

/** Outward normal from the diagonals — stable on the warped side panels,
 * and on a mirrored patch it comes out mirrored too, i.e. still outward. */
function patchNormal(q: Patch): V3 {
  const d1: V3 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
  const d2: V3 = [q[3][0] - q[1][0], q[3][1] - q[1][1], q[3][2] - q[1][2]];
  const n: V3 = [
    d1[1] * d2[2] - d1[2] * d2[1],
    d1[2] * d2[0] - d1[0] * d2[2],
    d1[0] * d2[1] - d1[1] * d2[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** Sizes of a patch in metres, averaged across its opposite edges — the
 * conversion from pillar widths in metres to patch (u, v) fractions. */
function patchSpan(q: Patch): { u: number; v: number } {
  return {
    u: (dist3(q[0], q[1]) + dist3(q[3], q[2])) / 2,
    v: (dist3(q[0], q[3]) + dist3(q[1], q[2])) / 2,
  };
}

/** One sub-rectangle of a patch, lifted along its normal so glass sits
 * proud of the metal it is cut into. `mirrored` patches are wound the
 * other way round; their normal is already correct. */
function patchQuad(
  b: MeshBuilder,
  q: Patch,
  rect: { u0: number; u1: number; v0: number; v1: number },
  color: number,
  lift = 0,
  mirrored = false,
): void {
  if (rect.u1 - rect.u0 < 1e-3 || rect.v1 - rect.v0 < 1e-3) return;
  const n = patchNormal(q);
  const p = (u: number, v: number): V3 => {
    const q0 = patchAt(q, u, v);
    return [q0[0] + n[0] * lift, q0[1] + n[1] * lift, q0[2] + n[2] * lift];
  };
  const c = [p(rect.u0, rect.v0), p(rect.u1, rect.v0), p(rect.u1, rect.v1), p(rect.u0, rect.v1)];
  if (mirrored) b.quad(c[3], c[2], c[1], c[0], color);
  else b.quad(c[0], c[1], c[2], c[3], color);
}

const PILLARS = {
  a: 0.1,
  b: 0.09,
  c: 0.16,
  sill: 0.055,
  header: 0.045,
  split: 0.5,
  quarterRise: 0,
};

/** Glass sits this far proud of the cabin metal — enough to beat depth
 * fighting, small enough to read as flush at any camera distance. */
const GLASS_PROUD = 0.006;

/** The cabin: a solid body-colored shell with the windows cut into it, so
 * every window is framed by metal — A-pillar, B-pillar, C-pillar, sill and
 * roof header. Without them a car reads as a glass canopy on a tub. */
function buildGreenhouse(b: MeshBuilder, spec: CarBodySpec): void {
  const { cowlZ, roofFrontZ, roofRearZ, baseRearZ, roofY, roofHalf } = spec.cabin;
  const glass = spec.colors.glass ?? 0x1b2430;
  const roofColor = spec.cabin.roofPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const pillar = spec.cabin.pillarPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const p = { ...PILLARS, ...spec.cabin.pillars };

  const cowl = sampleProfile(spec.profile, cowlZ);
  const tail = sampleProfile(spec.profile, baseRearZ);
  // The cabin sits just inside the body's top edge so the shoulder reads
  // as a sill under the windows.
  const xc = cowl.half * SHOULDER * 0.94;
  const xt = tail.half * SHOULDER * 0.94;

  const CL: V3 = [-xc, cowl.topY, cowlZ];
  const CR: V3 = [xc, cowl.topY, cowlZ];
  const FL: V3 = [-roofHalf, roofY, roofFrontZ];
  const FR: V3 = [roofHalf, roofY, roofFrontZ];
  const RL: V3 = [-roofHalf, roofY, roofRearZ];
  const RR: V3 = [roofHalf, roofY, roofRearZ];
  const TL: V3 = [-xt, tail.topY, baseRearZ];
  const TR: V3 = [xt, tail.topY, baseRearZ];

  const full = { u0: 0, u1: 1, v0: 0, v1: 1 };

  // Windscreen: u across the car, v cowl → roof.
  const screen: Patch = [CL, CR, FR, FL];
  const sSpan = patchSpan(screen);
  patchQuad(b, screen, full, pillar);
  patchQuad(
    b,
    screen,
    {
      u0: p.a / sSpan.u,
      u1: 1 - p.a / sSpan.u,
      v0: p.sill / sSpan.v,
      v1: 1 - p.header / sSpan.v,
    },
    glass,
    GLASS_PROUD,
  );

  // Backlight: u across the car, v roof → deck.
  const back: Patch = [RL, RR, TR, TL];
  const bSpan = patchSpan(back);
  patchQuad(b, back, full, pillar);
  patchQuad(
    b,
    back,
    {
      u0: p.c / bSpan.u,
      u1: 1 - p.c / bSpan.u,
      v0: p.header / bSpan.v,
      v1: 1 - p.sill / bSpan.v,
    },
    glass,
    GLASS_PROUD,
  );

  patchQuad(b, [FL, FR, RR, RL], full, roofColor);

  // Sides: u cowl → tail, v sill → roof. The door glass and the rear
  // quarter glass are two openings with the B-pillar of metal between.
  for (const side of [1, -1]) {
    const m = (q: V3): V3 => [q[0] * side, q[1], q[2]];
    const flank: Patch = [m(CR), m(TR), m(RR), m(FR)];
    const span = patchSpan(flank);
    const mirrored = side < 0;
    patchQuad(b, flank, full, pillar, 0, mirrored);

    const v0 = p.sill / span.v;
    const v1 = 1 - p.header / span.v;
    const half = p.b / 2 / span.u;
    const split = p.split;
    patchQuad(
      b,
      flank,
      { u0: p.a / span.u, u1: split - half, v0, v1 },
      glass,
      GLASS_PROUD,
      mirrored,
    );
    patchQuad(
      b,
      flank,
      {
        u0: split + half,
        u1: 1 - p.c / span.u,
        v0: v0 + p.quarterRise / span.v,
        v1,
      },
      glass,
      GLASS_PROUD,
      mirrored,
    );
  }
}

/** The fixed details plus the breakable ones — bumpers, mirrors and the
 * spoiler go through `part` so each ends up its own detachable mesh. */
function buildDetails(
  b: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  const c = spec.colors;
  const trim = c.trim ?? 0x14181f;
  const bumper = c.bumper ?? 0x23272e;
  const nose = spec.profile[0];
  const tail = spec.profile[spec.profile.length - 1];

  // Bumpers: slabs a shade wider than the body, wrapped past the caps.
  const bumperY = spec.floorY + 0.06;
  part("bumperF").box(0, bumperY, nose.z - 0.04, nose.half * 2 + 0.12, 0.17, 0.34, bumper);
  part("bumperR").box(0, bumperY, tail.z + 0.04, tail.half * 2 + 0.12, 0.17, 0.34, bumper);

  // Headlights and grille ride proud of the nose cap.
  for (const lamp of headLamps(spec)) {
    b.box(lamp.x, lamp.y, lamp.z, lamp.width, lamp.height, 0.07, 0xf6f1d8);
  }
  const grilleY = spec.beltY + (nose.topY - spec.beltY) * 0.45 - 0.13;
  b.box(0, grilleY, nose.z, nose.half * 1.05, 0.09, 0.06, trim);

  // Taillights: one red bar each side of the tail cap.
  for (const lamp of tailLamps(spec)) {
    b.box(lamp.x, lamp.y, lamp.z, lamp.width, lamp.height, 0.07, 0xc4231b);
  }

  if (spec.mirrors !== false) {
    const cowl = sampleProfile(spec.profile, spec.cabin.cowlZ);
    for (const side of [-1, 1]) {
      // Local +x is the car's right — the engine's mirrorR lives there.
      part(side > 0 ? "mirrorR" : "mirrorL").box(
        side * (cowl.half * SHOULDER + 0.05),
        cowl.topY + 0.02,
        spec.cabin.cowlZ + 0.08,
        0.12,
        0.08,
        0.05,
        c.paint,
      );
    }
  }

  // Mud flaps hang off the arch lip behind each wheel. Their top is buried
  // in the bodywork so they read as bolted on, not floating alongside it.
  if (spec.mudflaps !== false) {
    const top = spec.floorY + 0.13;
    const bottom = 0.07;
    for (const axle of axles) {
      for (const side of [-1, 1]) {
        b.box(
          side * (spec.trackHalf - 0.015),
          (top + bottom) / 2,
          axle - spec.wheelRadius - 0.02,
          spec.wheelWidth * 0.92,
          top - bottom,
          0.03,
          trim,
        );
      }
    }
  }

  // Wheel-well cutouts: dark squares just proud of the rocker, behind the
  // wheels — the round tire in front turns them into arches.
  if (spec.archCut !== false) {
    const r = spec.wheelRadius;
    for (const axle of axles) {
      const wide = sampleProfile(spec.profile, axle).half * ROCKER + (spec.flare?.extra ?? 0) * 0.7;
      const x = wide + 0.012;
      const y0 = spec.floorY;
      const y1 = Math.min(spec.beltY - 0.04, r * 2 - 0.04);
      const z0 = axle + r + 0.02;
      const z1 = axle - r - 0.02;
      b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], trim);
      b.quad([-x, y0, z1], [-x, y0, z0], [-x, y1, z0], [-x, y1, z1], trim);
    }
  }

  const sp = spec.spoiler;
  if (sp && sp.kind === "wing") {
    const wing = part("spoiler");
    wing.box(-sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    wing.box(sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    wing.box(0, sp.y, sp.z, sp.span, 0.05, sp.chord, c.accent);
    wing.box(-sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, c.accent);
    wing.box(sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, c.accent);
  } else if (sp && sp.kind === "lip") {
    part("spoiler").box(0, sp.y, sp.z, sp.span, 0.06, 0.16, c.accent);
  }

  // Livery stripes hug the hood/deck by sampling the silhouette.
  const st = spec.stripes;
  if (st) {
    const steps = 8;
    for (const off of st.offsets) {
      for (let i = 0; i < steps; i++) {
        const za = st.zFrom + ((st.zTo - st.zFrom) * i) / steps;
        const zb = st.zFrom + ((st.zTo - st.zFrom) * (i + 1)) / steps;
        const a = sampleProfile(spec.profile, za);
        const bb = sampleProfile(spec.profile, zb);
        const w = st.width / 2;
        b.quad(
          [off - w, a.topY + 0.008, za],
          [off + w, a.topY + 0.008, za],
          [off + w, bb.topY + 0.008, zb],
          [off - w, bb.topY + 0.008, zb],
          c.accent,
        );
      }
    }
  }
}

/** Bakes the fake sun into any geometry the same way MeshBuilder does:
 * de-index so every face is flat, then lambert-shade the part color. */
function bakeShading(source: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  if (geo !== source) source.dispose();
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    ab.fromBufferAttribute(pos, i + 1).sub(a);
    ac.fromBufferAttribute(pos, i + 2).sub(a);
    ab.cross(ac).normalize();
    const k = AMBIENT + DIFFUSE * Math.max(0, ab.dot(LIGHT));
    c.set(color).multiplyScalar(k);
    for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (i + v) * 3);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

// The alloy, as fractions of the tire radius: the rim lip is a ring near
// the tire's shoulder, the spokes bridge it to the centre cap, and the
// dark tire face left showing between them reads as the voids.
const RIM_OUTER = 0.75;
const RIM_INNER = 0.57;
const RIM_HUB = 0.2;
const RIM_SPOKE_WIDTH = 0.12;
const RIM_FACETS = 12;

/** A flat ring/disc part of the wheel face, drawn in the wheel's y-z plane
 * at ±x. Angles run y = cos, z = sin, which is counter-clockwise seen from
 * +x — the winding an outward-facing +x surface needs. */
function rimFace(b: MeshBuilder, x: number, outward: number, spokes: number, hub: number): void {
  const pt = (r: number, a: number): V3 => [x, r * Math.cos(a), r * Math.sin(a)];
  const quad = (r0: number, a0: number, r1: number, a1: number, ao0: number, ao1: number): void => {
    const c = [pt(r0, a0), pt(r1, ao0), pt(r1, ao1), pt(r0, a1)];
    if (outward > 0) b.quad(c[0], c[1], c[2], c[3], hub);
    else b.quad(c[3], c[2], c[1], c[0], hub);
  };

  for (let i = 0; i < RIM_FACETS; i++) {
    const a0 = (i / RIM_FACETS) * Math.PI * 2;
    const a1 = ((i + 1) / RIM_FACETS) * Math.PI * 2;
    quad(RIM_INNER, a0, RIM_OUTER, a1, a0, a1);
    // Centre cap, fanned from the axle.
    const c = [pt(RIM_HUB, a0), pt(RIM_HUB, a1)];
    if (outward > 0) b.tri([x, 0, 0], c[0], c[1], hub);
    else b.tri([x, 0, 0], c[1], c[0], hub);
  }

  // Straight-sided spokes: constant width, so the half-angle shrinks with
  // radius. They stop at the lip, leaving the tire face as the void.
  const w = RIM_SPOKE_WIDTH / 2;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const ai = w / RIM_HUB;
    const ao = w / RIM_INNER;
    quad(RIM_HUB, a - ai, RIM_INNER, a + ai, a - ao, a + ao);
  }
}

/** One wheel: chunky 12-gon tire wearing a spoked alloy on each face, plus
 * tread lugs embedded around the rim. The alloy breaks the face's
 * rotational symmetry, the lugs break the tread's — together the spin rate
 * is legible at a glance from any angle. Axle along x; origin at the wheel
 * center. */
function buildWheel(spec: CarBodySpec): THREE.BufferGeometry[] {
  const r = spec.wheelRadius;
  const tireGeo = bakeShading(
    new THREE.CylinderGeometry(r, r, spec.wheelWidth, RIM_FACETS).rotateZ(Math.PI / 2),
    0x181c22,
  );
  const b = new MeshBuilder();
  const hub = spec.colors.hub ?? 0xe6e3da;
  const spokes = spec.wheelSpokes ?? 6;
  for (const side of [1, -1]) {
    rimFace(b, side * (spec.wheelWidth / 2 + 0.005), side, spokes, hub);
  }
  const rimGeo = b.geometry();
  rimGeo.scale(1, r, r);

  // Tread lugs: blocks a shade lighter than the tire, riding the rolling
  // surface so the tire itself visibly turns even seen dead from the side.
  const geos = [tireGeo, rimGeo];
  const lugs = 6;
  for (let i = 0; i < lugs; i++) {
    const angle = (i / lugs) * Math.PI * 2;
    geos.push(
      bakeShading(
        new THREE.BoxGeometry(spec.wheelWidth + 0.015, 0.06, 0.11)
          .translate(0, r - 0.01, 0)
          .rotateX(angle),
        0x333a44,
      ),
    );
  }
  return geos;
}

/** One lamp's place on the car, in car space. */
export type Lamp = { x: number; y: number; z: number; width: number; height: number };

/** Where a car's lamps sit, one per side. The lens boxes, the glow laid over
 * the tail pair (car-mesh.ts) and the beams they throw (environment.ts) all
 * read the SAME anchors, so restyling a nose or a tail moves the lamp and its
 * light together instead of leaving a bloom floating off the corner. */
export function headLamps(spec: CarBodySpec): Lamp[] {
  const nose = spec.profile[0];
  const width = nose.half * 0.52;
  return [-1, 1].map((side) => ({
    x: side * nose.half * 0.52,
    y: spec.beltY + (nose.topY - spec.beltY) * 0.45,
    z: nose.z,
    width,
    height: 0.13,
  }));
}

/** ...and the pair at the other end. */
export function tailLamps(spec: CarBodySpec): Lamp[] {
  const tail = spec.profile[spec.profile.length - 1];
  return [-1, 1].map((side) => ({
    x: side * tail.half * 0.55,
    y: tail.topY - 0.14,
    z: tail.z,
    width: tail.half * 0.6,
    height: 0.13,
  }));
}

export function buildCarBody(spec: CarBodySpec): CarBodyParts {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];

  const b = new MeshBuilder();
  const partBuilders = new Map<DamagePart, MeshBuilder>();
  const part = (name: DamagePart): MeshBuilder => {
    let builder = partBuilders.get(name);
    if (!builder) partBuilders.set(name, (builder = new MeshBuilder()));
    return builder;
  };
  const stations = buildStations(spec, axles);
  buildShell(b, spec, stations);
  buildGreenhouse(b, spec);
  buildDetails(b, spec, axles, part);
  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyGeo = b.geometry();
  const body = new THREE.Mesh(bodyGeo, material);
  chassis.add(body);

  const breakables: Partial<Record<DamagePart, THREE.Mesh>> = {};
  const partGeos: THREE.BufferGeometry[] = [];
  for (const [name, builder] of partBuilders) {
    const geo = builder.geometry();
    const mesh = new THREE.Mesh(geo, material);
    chassis.add(mesh);
    breakables[name] = mesh;
    partGeos.push(geo);
  }

  const wheelGroups: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  // All four wheels share one tire and one alloy — only their transforms
  // differ, so the geometry is built once and disposed once.
  const wheelGeos = buildWheel(spec);
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * spec.trackHalf, spec.wheelRadius, axle);
      const spin = new THREE.Group();
      for (const geo of wheelGeos) spin.add(new THREE.Mesh(geo, material));
      wheel.add(spin);
      group.add(wheel);
      wheelGroups.push(wheel);
      wheelSpin.push(spin);
    }
  }

  const dispose = (): void => {
    bodyGeo.dispose();
    for (const g of partGeos) g.dispose();
    for (const g of wheelGeos) g.dispose();
    material.dispose();
  };
  return { group, chassis, wheelGroups, wheelSpin, body, breakables, dispose };
}
