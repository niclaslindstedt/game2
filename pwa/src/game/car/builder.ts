// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The low-level drawing surface every car part is built on: a triangle
// accumulator that bakes a fixed fake sun into vertex colors, and the
// bilinear-patch helpers the cabin panels need.
//
// The whole game is fullbright (MeshBasicMaterial), so shape definition is
// BAKED: every face's vertex colors are the part color scaled by a lambert
// term against one constant light direction. That keeps the arcade look —
// no runtime lights, no shading pops — while hoods, flanks and sills still
// read as distinct planes.

import * as THREE from "three";

export type V3 = readonly [number, number, number];

// The baked sun: high, a touch to the front-right, so hoods and roofs are
// brightest, flanks mid, undersides in ambient. Tuned so no face goes
// darker than ~0.6x its part color — the arcade look hates black holes.
const LIGHT = new THREE.Vector3(0.35, 1, 0.45).normalize();
const AMBIENT = 0.62;
const DIFFUSE = 0.38;

/** Accumulates flat-shaded triangles with baked lambert vertex colors. */
export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly c = new THREE.Color();

  /** Degenerate triangles are dropped rather than shaded: the shell's ring
   * collapses several of its points onto each other away from the wheel
   * arches, and a zero-area face has no normal to light it with. */
  tri(a: V3, b: V3, c: V3, color: number): void {
    this.ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.n.crossVectors(this.ab, this.ac);
    if (this.n.lengthSq() < 1e-12) return;
    this.n.normalize();
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

  /** A box whose front face (+z) is narrower than its back — the shape a
   * bumper end, a light pod or a valance needs so it sits INTO the body
   * instead of hovering as a slab. */
  taperBox(
    cx: number,
    cy: number,
    cz: number,
    sxFront: number,
    sxBack: number,
    sy: number,
    sz: number,
    color: number,
  ): void {
    const f = sxFront / 2;
    const r = sxBack / 2;
    const y = sy / 2;
    const z = sz / 2;
    const p = (dx: number, dy: number, dz: number): V3 => [
      cx + dx * (dz > 0 ? f : r),
      cy + dy * y,
      cz + dz * z,
    ];
    this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), color);
    this.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), color);
    this.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), color);
    this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), color);
    this.quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1), color);
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), color);
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return geo;
  }
}

/** Bakes the fake sun into any geometry the same way MeshBuilder does:
 * de-index so every face is flat, then lambert-shade the part color. Round
 * parts come from THREE primitives and pass through here, because
 * hand-winding circular geometry fails silently (faces are culled, not
 * flagged). */
export function bakeShading(source: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
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

/** A cabin panel as a bilinear patch. Corners counter-clockwise seen from
 * OUTSIDE, in the order [p00, p10, p11, p01]: u runs p00→p10, v runs
 * p00→p01. The greenhouse's side panels are warped quads (the cowl is
 * narrower than the roof), so glass openings sample the patch instead of
 * assuming a plane. */
export type Patch = readonly [V3, V3, V3, V3];

export function mix3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function dist3(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function patchAt(q: Patch, u: number, v: number): V3 {
  return mix3(mix3(q[0], q[1], u), mix3(q[3], q[2], u), v);
}

/** Outward normal from the diagonals — stable on the warped side panels,
 * and on a mirrored patch it comes out mirrored too, i.e. still outward. */
export function patchNormal(q: Patch): V3 {
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
export function patchSpan(q: Patch): { u: number; v: number } {
  return {
    u: (dist3(q[0], q[1]) + dist3(q[3], q[2])) / 2,
    v: (dist3(q[0], q[3]) + dist3(q[1], q[2])) / 2,
  };
}

/** One sub-rectangle of a patch, lifted along its normal so glass sits
 * proud of the metal it is cut into. `mirrored` patches are wound the
 * other way round; their normal is already correct. */
export function patchQuad(
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
