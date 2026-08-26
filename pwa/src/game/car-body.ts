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
  /** The glass house. roofPaint "accent" gives the rally two-tone roof. */
  cabin: {
    cowlZ: number;
    roofFrontZ: number;
    roofRearZ: number;
    baseRearZ: number;
    roofY: number;
    roofHalf: number;
    roofPaint?: "paint" | "accent";
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
  /** [FL, FR, RL, RR] — rotate .y for steering. */
  wheelGroups: THREE.Group[];
  /** Same order — rotate .x to spin with road speed. */
  wheelSpin: THREE.Object3D[];
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

function buildGreenhouse(b: MeshBuilder, spec: CarBodySpec): void {
  const { cowlZ, roofFrontZ, roofRearZ, baseRearZ, roofY, roofHalf } = spec.cabin;
  const glass = spec.colors.glass ?? 0x1b2430;
  const roofColor = spec.cabin.roofPaint === "accent" ? spec.colors.accent : spec.colors.paint;

  const cowl = sampleProfile(spec.profile, cowlZ);
  const tail = sampleProfile(spec.profile, baseRearZ);
  // The glass sits just inside the body's top edge so the shoulder reads
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

  b.quad(CL, CR, FR, FL, glass); // windshield
  b.quad(FL, FR, RR, RL, roofColor); // roof
  b.quad(RL, RR, TR, TL, glass); // rear window
  b.quad(TR, RR, FR, CR, glass); // right side glass
  b.quad(CL, FL, RL, TL, glass); // left side glass
}

function buildDetails(b: MeshBuilder, spec: CarBodySpec, axles: number[]): void {
  const c = spec.colors;
  const trim = c.trim ?? 0x14181f;
  const bumper = c.bumper ?? 0x23272e;
  const nose = spec.profile[0];
  const tail = spec.profile[spec.profile.length - 1];

  // Bumpers: slabs a shade wider than the body, wrapped past the caps.
  const bumperY = spec.floorY + 0.06;
  b.box(0, bumperY, nose.z - 0.04, nose.half * 2 + 0.12, 0.17, 0.34, bumper);
  b.box(0, bumperY, tail.z + 0.04, tail.half * 2 + 0.12, 0.17, 0.34, bumper);

  // Headlights and grille ride proud of the nose cap.
  const lightY = spec.beltY + (nose.topY - spec.beltY) * 0.45;
  const lightW = nose.half * 0.52;
  b.box(-nose.half * 0.52, lightY, nose.z, lightW, 0.13, 0.07, 0xf6f1d8);
  b.box(nose.half * 0.52, lightY, nose.z, lightW, 0.13, 0.07, 0xf6f1d8);
  b.box(0, lightY - 0.13, nose.z, nose.half * 1.05, 0.09, 0.06, trim);

  // Taillights: one red bar each side of the tail cap.
  const tailY = tail.topY - 0.14;
  b.box(-tail.half * 0.55, tailY, tail.z, tail.half * 0.6, 0.13, 0.07, 0xc4231b);
  b.box(tail.half * 0.55, tailY, tail.z, tail.half * 0.6, 0.13, 0.07, 0xc4231b);

  if (spec.mirrors !== false) {
    const cowl = sampleProfile(spec.profile, spec.cabin.cowlZ);
    for (const side of [-1, 1]) {
      b.box(
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

  if (spec.mudflaps !== false) {
    for (const axle of axles) {
      for (const side of [-1, 1]) {
        b.box(
          side * spec.trackHalf,
          (spec.floorY + 0.06) / 2,
          axle - spec.wheelRadius - 0.03,
          spec.wheelWidth + 0.02,
          spec.floorY - 0.04,
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
    b.box(-sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    b.box(sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    b.box(0, sp.y, sp.z, sp.span, 0.05, sp.chord, c.accent);
    b.box(-sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, c.accent);
    b.box(sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, c.accent);
  } else if (sp && sp.kind === "lip") {
    b.box(0, sp.y, sp.z, sp.span, 0.06, 0.16, c.accent);
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

/** One wheel: chunky 12-gon tire with a wider, lighter 8-gon hub poking
 * through both faces. Axle along x; origin at the wheel center. */
function buildWheel(
  spec: CarBodySpec,
  material: THREE.Material,
): { spin: THREE.Group; geos: THREE.BufferGeometry[] } {
  const tireGeo = bakeShading(
    new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 12).rotateZ(
      Math.PI / 2,
    ),
    0x181c22,
  );
  const hubGeo = bakeShading(
    new THREE.CylinderGeometry(
      spec.wheelRadius * 0.56,
      spec.wheelRadius * 0.56,
      spec.wheelWidth + 0.05,
      8,
    ).rotateZ(Math.PI / 2),
    spec.colors.hub ?? 0xe6e3da,
  );
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(tireGeo, material), new THREE.Mesh(hubGeo, material));
  return { spin, geos: [tireGeo, hubGeo] };
}

export function buildCarBody(spec: CarBodySpec): CarBodyParts {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];

  const b = new MeshBuilder();
  const stations = buildStations(spec, axles);
  buildShell(b, spec, stations);
  buildGreenhouse(b, spec);
  buildDetails(b, spec, axles);
  const bodyGeo = b.geometry();
  group.add(new THREE.Mesh(bodyGeo, material));

  const wheelGroups: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  const wheelGeos: THREE.BufferGeometry[] = [];
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * spec.trackHalf, spec.wheelRadius, axle);
      const { spin, geos } = buildWheel(spec, material);
      wheel.add(spin);
      group.add(wheel);
      wheelGroups.push(wheel);
      wheelSpin.push(spin);
      wheelGeos.push(...geos);
    }
  }

  const dispose = (): void => {
    bodyGeo.dispose();
    for (const g of wheelGeos) g.dispose();
    material.dispose();
  };
  return { group, wheelGroups, wheelSpin, dispose };
}
