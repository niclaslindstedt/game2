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
//
// A builder can carry ALPHA as well, which is what the glass and the grime
// film on it are built with: three.js reads a four-component color attribute
// as colour-with-alpha and multiplies the material's own opacity by it, so a
// pane can fade from a nearly solid reflection at its header to a clear one
// at its sill without a shader or a second material.

import * as THREE from "three";

export type V3 = readonly [number, number, number];

// The baked sun: high, a touch to the front-right, so hoods and roofs are
// brightest, flanks mid, undersides in ambient. Tuned so no face goes
// darker than ~0.6x its part color — the arcade look hates black holes.
const LIGHT = new THREE.Vector3(0.35, 1, 0.45).normalize();
const AMBIENT = 0.62;
const DIFFUSE = 0.38;

/** Accumulates flat-shaded triangles with baked lambert vertex colors.
 * `alpha` opens the fourth colour channel; a builder without it writes three
 * floats a vertex and the `alpha` argument on every method is ignored. */
export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly alpha: boolean;

  // A parameter property would say this in one line and cost the repo's Node
  // tooling the file: `--experimental-strip-types` refuses to parse them.
  constructor(alpha = false) {
    this.alpha = alpha;
  }

  /** Degenerate triangles are dropped rather than shaded: the shell's ring
   * collapses several of its points onto each other away from the wheel
   * arches, and a zero-area face has no normal to light it with. */
  tri(a: V3, b: V3, c: V3, color: number, alpha = 1): void {
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
      if (this.alpha) this.col.push(alpha);
    }
  }

  /** Corners counter-clockwise seen from outside the surface. */
  quad(a: V3, b: V3, c: V3, d: V3, color: number, alpha = 1): void {
    this.tri(a, b, c, color, alpha);
    this.tri(a, c, d, color, alpha);
  }

  /** A quad that FADES: the a→b edge carries one colour and alpha, the c→d
   * edge another, and the shader interpolates between them. The one place a
   * face here is not a single flat tone, and it exists for the glass — a
   * window's reflection has to run from its header to its sill continuously.
   * Cut into bands instead, it reads as three panes of different glass, and
   * no number of bands hides the steps at the angle a car is actually seen
   * at. Both ends take the same lambert term, because it is one flat face. */
  quadFade(
    a: V3,
    b: V3,
    c: V3,
    d: V3,
    colorAB: number,
    colorCD: number,
    alphaAB: number,
    alphaCD: number,
  ): void {
    this.triFade(a, b, c, [colorAB, colorAB, colorCD], [alphaAB, alphaAB, alphaCD]);
    this.triFade(a, c, d, [colorAB, colorCD, colorCD], [alphaAB, alphaCD, alphaCD]);
  }

  private triFade(a: V3, b: V3, c: V3, colors: number[], alphas: number[]): void {
    this.ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.n.crossVectors(this.ab, this.ac);
    if (this.n.lengthSq() < 1e-12) return;
    this.n.normalize();
    const k = AMBIENT + DIFFUSE * Math.max(0, this.n.dot(LIGHT));
    const p = [a, b, c];
    for (let i = 0; i < 3; i++) {
      this.c.set(colors[i]).multiplyScalar(k);
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      if (this.alpha) this.col.push(alphas[i]);
    }
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

  /** Pour an already-baked geometry's triangles into this builder, so a
   * part assembled from THREE primitives lands in the same buffer as the
   * hand-wound faces around it. Only position and color come across: the
   * whole game is fullbright, so a normal or a uv on the source is vertex
   * data the shader will never read. The source is spent — it is disposed
   * here rather than left for a caller that has no further use for it. */
  absorb(source: THREE.BufferGeometry, alpha = 1): void {
    const pos = source.getAttribute("position");
    const col = source.getAttribute("color");
    for (let i = 0; i < pos.count; i++) {
      this.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.col.push(col.getX(i), col.getY(i), col.getZ(i));
      if (this.alpha) this.col.push(alpha);
    }
    source.dispose();
  }

  /** Whether anything has been drawn into this builder — a car with no
   * glass, or none of the parts a level of detail skips, must not be handed
   * an empty mesh to draw. */
  get empty(): boolean {
    return this.pos.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, this.alpha ? 4 : 3));
    return geo;
  }
}

/** Two hex colours mixed, as a hex colour — the authored way to strike a
 * tone between two named ones without carrying THREE.Color into data. */
export function mixHex(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const lerp = (shift: number): number => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * k) << shift;
  };
  return lerp(16) | lerp(8) | lerp(0);
}

/** The lambert term this file bakes into a face with the given normal.
 * Anything that has to MATCH a baked colour from outside the builder — the
 * grime film laid over glass the greenhouse painted — multiplies its own
 * part colour by this instead of guessing at the shading. */
export function shadeFactor(n: V3): number {
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const d = (n[0] * LIGHT.x + n[1] * LIGHT.y + n[2] * LIGHT.z) / len;
  return AMBIENT + DIFFUSE * Math.max(0, d);
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

/** Normal from the diagonals — stable on the warped side panels. It points
 * OUTWARD only for a patch wound counter-clockwise from outside; a patch
 * mirrored across x is wound the other way and gets the inward one, which
 * is why `patchQuad` flips it for those. */
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
 * proud of the metal it is cut into.
 *
 * `mirrored` says the patch is the x-mirror of one built on the car's right,
 * which reverses BOTH the winding and the normal: the cross product of two
 * mirrored vectors is the mirror negated, so the diagonals hand back a
 * normal pointing into the cabin. Left unflipped it buries every window on
 * that flank inside its own panel — the glass is drawn, and the metal is in
 * front of it. */
export function patchQuad(
  b: MeshBuilder,
  q: Patch,
  rect: { u0: number; u1: number; v0: number; v1: number },
  color: number,
  lift = 0,
  mirrored = false,
  alpha = 1,
): void {
  if (rect.u1 - rect.u0 < 1e-3 || rect.v1 - rect.v0 < 1e-3) return;
  const n = patchNormal(q);
  const out = mirrored ? -lift : lift;
  const p = (u: number, v: number): V3 => {
    const q0 = patchAt(q, u, v);
    return [q0[0] + n[0] * out, q0[1] + n[1] * out, q0[2] + n[2] * out];
  };
  const c = [p(rect.u0, rect.v0), p(rect.u1, rect.v0), p(rect.u1, rect.v1), p(rect.u0, rect.v1)];
  if (mirrored) b.quad(c[3], c[2], c[1], c[0], color, alpha);
  else b.quad(c[0], c[1], c[2], c[3], color, alpha);
}

/** The same rectangle, fading from what its v0 edge carries to what its v1
 * edge carries. Mirroring reverses the corner order, so the pair of colours
 * has to travel with it or every window on the left flank fades the wrong
 * way up. */
export function patchFade(
  b: MeshBuilder,
  q: Patch,
  rect: { u0: number; u1: number; v0: number; v1: number },
  color0: number,
  color1: number,
  alpha0: number,
  alpha1: number,
  lift = 0,
  mirrored = false,
): void {
  if (rect.u1 - rect.u0 < 1e-3 || rect.v1 - rect.v0 < 1e-3) return;
  const n = patchNormal(q);
  const out = mirrored ? -lift : lift;
  const p = (u: number, v: number): V3 => {
    const q0 = patchAt(q, u, v);
    return [q0[0] + n[0] * out, q0[1] + n[1] * out, q0[2] + n[2] * out];
  };
  const c = [p(rect.u0, rect.v0), p(rect.u1, rect.v0), p(rect.u1, rect.v1), p(rect.u0, rect.v1)];
  if (mirrored) b.quadFade(c[3], c[2], c[1], c[0], color1, color0, alpha1, alpha0);
  else b.quadFade(c[0], c[1], c[2], c[3], color0, color1, alpha0, alpha1);
}

/** A three.js primitive, shaded the way the hand-wound faces around it are
 * and poured into the same buffer. Anything round or tilted comes through
 * here — hand-winding either fails silently, faces culled rather than
 * flagged. The geometry is spent. */
export function solid(b: MeshBuilder, geo: THREE.BufferGeometry, color: number): void {
  b.absorb(bakeShading(geo, color));
}

/** A box that is allowed to lean: a seat back, a visor, a harness strap, a
 * shoulder. Sizes and position are the box's own; `tilt` is about x and
 * `yaw` about y, applied in that order about the box's centre. */
export function slab(b: MeshBuilder, size: V3, at: V3, color: number, tilt = 0, yaw = 0): void {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (tilt !== 0) geo.rotateX(tilt);
  if (yaw !== 0) geo.rotateY(yaw);
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}

/** One length of tube, end to end — a cage bar, a forearm, a neck. */
export function tube(
  b: MeshBuilder,
  from: V3,
  to: V3,
  radius: number,
  color: number,
  sides = 7,
): void {
  const a = new THREE.Vector3(...from);
  const span = new THREE.Vector3(...to).sub(a);
  const len = span.length();
  if (len < 1e-4) return;
  const geo = new THREE.CylinderGeometry(radius, radius, len, sides, 1, true);
  // CylinderGeometry stands on +y about its own middle; swing that axis onto
  // the span, then carry it to the span's midpoint.
  const turn = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    span.clone().divideScalar(len),
  );
  geo.applyQuaternion(turn);
  geo.translate(a.x + span.x / 2, a.y + span.y / 2, a.z + span.z / 2);
  solid(b, geo, color);
}

/** A blob: a sphere allowed to be squashed on any axis, which is what turns
 * one primitive into a head, a shoulder, a belly and a bouffant. `segments`
 * is the horizontal count; the vertical is kept to about half it, the way a
 * sphere reads best at the triangle counts a cabin can afford. */
export function blob(
  b: MeshBuilder,
  at: V3,
  radius: number,
  scale: V3,
  color: number,
  segments = 7,
): void {
  const geo = new THREE.SphereGeometry(radius, segments, Math.max(3, Math.round(segments / 2)));
  geo.scale(scale[0], scale[1], scale[2]);
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}
