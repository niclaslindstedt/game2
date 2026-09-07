// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The low-level drawing surface every car part is built on: a triangle
// accumulator carrying flat albedo, a face normal and a gloss weight, plus
// the bilinear-patch helpers the cabin panels need.
//
// THE CAR IS LIT BY THE SCENE. Its colour attribute is the ALBEDO — the
// paint as it would be under a white light, with no shading folded into it —
// and the shading arrives at draw time from the same sun, sky and lamps the
// rest of the world is lit by (car-mesh.ts hangs it on `MeshPhongMaterial`).
// Every triangle is wound flat, and the normal written here is the FACE's
// own, so hoods, flanks and sills stay distinct planes rather than smoothing
// into each other: a low-poly body lit per face reads as panels, and the
// same body lit per averaged vertex reads as a bar of soap.
//
// The third attribute is GLOSS (`aShine`), a per-vertex weight on the
// specular term, and it is what makes one material enough for a whole car.
// Panels, wheels, trim and glass are one mesh and one draw call, and a
// lacquered wing and a rubber tyre want completely different highlights —
// so the weight rides the geometry rather than the material, and a part
// sets `builder.shine` before it draws instead of asking for a material of
// its own.
//
// A builder can carry ALPHA as well, which is what the glass and the grime
// film on it are built with: three.js reads a four-component color attribute
// as colour-with-alpha and multiplies the material's own opacity by it, so a
// pane can fade from a nearly solid reflection at its header to a clear one
// at its sill without a shader or a second material.

import * as THREE from "three";

export type V3 = readonly [number, number, number];

/** The gloss weights a car is built from, 0..1 — a multiplier on the
 * specular term, not a shininess exponent (that is the material's, one for
 * the whole car). PAINT is the default every builder starts at, because
 * most of a car is painted.
 *
 * The spread matters more than the absolute values: what says "this is
 * lacquer and that is rubber" is that one of them holds a highlight and the
 * other does not. A tyre at zero reads as a hole, so RUBBER keeps the
 * faintest sheen — a tyre wall is not matte, it is dark. */
export const SHINE = {
  paint: 0.55,
  /** Glass and polished metal: the two things on a car that flare. */
  glass: 1,
  chrome: 0.9,
  /** Rubber, and the cloth and plastic of a cabin nobody polishes. */
  rubber: 0.05,
  trim: 0.1,
} as const;

/** Accumulates flat triangles: albedo, face normal and gloss weight.
 * `alpha` opens the fourth colour channel; a builder without it writes three
 * floats a vertex and the `alpha` argument on every method is ignored. */
export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private nrm: number[] = [];
  private shn: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly alpha: boolean;

  /** The gloss every face drawn from now on carries (`SHINE`). Set between
   * parts rather than passed per call: a part is one material in life, and
   * threading a weight through every `quad` on the car would be a parameter
   * nobody reads on the hundreds of faces that just want paint. */
  shine: number = SHINE.paint;

  // A parameter property would say this in one line and cost the repo's Node
  // tooling the file: `--experimental-strip-types` refuses to parse them.
  constructor(alpha = false) {
    this.alpha = alpha;
  }

  /** Vertices poured in so far — what a caller reads before and after a
   * piece to know which slice of the finished buffer is that piece's. */
  get count(): number {
    return this.pos.length / 3;
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
    this.c.set(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      if (this.alpha) this.col.push(alpha);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.shn.push(this.shine);
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
    const p = [a, b, c];
    for (let i = 0; i < 3; i++) {
      this.c.set(colors[i]);
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      if (this.alpha) this.col.push(alphas[i]);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.shn.push(this.shine);
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

  /** Pour an already-flattened geometry's triangles into this builder, so a
   * part assembled from THREE primitives lands in the same buffer as the
   * hand-wound faces around it. Position, colour, normal and gloss come
   * across — a source that has been through `flatten` carries all four, and
   * one that has not is given this builder's current gloss and a normal
   * recomputed from its own winding, because a face in a lit scene with no
   * normal is a face that draws black. The source is spent: it is disposed
   * here rather than left for a caller that has no further use for it. */
  absorb(source: THREE.BufferGeometry, alpha = 1): void {
    const pos = source.getAttribute("position");
    const col = source.getAttribute("color");
    const nrm = source.getAttribute("normal") ?? faceNormals(pos);
    const shn = source.getAttribute("aShine");
    for (let i = 0; i < pos.count; i++) {
      this.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.col.push(col.getX(i), col.getY(i), col.getZ(i));
      if (this.alpha) this.col.push(alpha);
      this.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      this.shn.push(shn ? shn.getX(i) : this.shine);
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
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute("aShine", new THREE.Float32BufferAttribute(this.shn, 1));
    return geo;
  }
}

/** Several finished geometries as ONE, for the case where the pieces are
 * built apart because something might one day move one of them, and drawn
 * together because until that day none of them does. The sources are left
 * standing — that is the whole point: they are what the merged copy is
 * swapped back for.
 *
 * The same four attributes `absorb` carries, and every source must carry the
 * same colour width (three components on the body's builders, four on the
 * ones with alpha) or the copies would interleave into nonsense. */
export function mergeGeometries(sources: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const width = sources[0].getAttribute("color").itemSize;
  let vertices = 0;
  for (const source of sources) vertices += source.getAttribute("position").count;
  const pos = new Float32Array(vertices * 3);
  const col = new Float32Array(vertices * width);
  const nrm = new Float32Array(vertices * 3);
  const shn = new Float32Array(vertices);
  let at = 0;
  for (const source of sources) {
    const count = source.getAttribute("position").count;
    pos.set(source.getAttribute("position").array as ArrayLike<number>, at * 3);
    col.set(source.getAttribute("color").array as ArrayLike<number>, at * width);
    nrm.set(source.getAttribute("normal").array as ArrayLike<number>, at * 3);
    shn.set(source.getAttribute("aShine").array as ArrayLike<number>, at);
    at += count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, width));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("aShine", new THREE.Float32BufferAttribute(shn, 1));
  return geo;
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

/**
 * THE FACE NORMAL OF EVERY TRIANGLE in a non-indexed position buffer, as an
 * attribute — one normal repeated across the three vertices that share the
 * face, which is what keeps a low-poly panel flat instead of smoothing into
 * the one beside it. `computeVertexNormals` is the wrong tool here for
 * exactly that reason: it averages, and an averaged car is a soap bar.
 *
 * A face the fold has flattened to nothing (car-damage.ts bends these at
 * runtime) has no plane to take a normal from, and keeps pointing up: a
 * degenerate triangle covers no pixels, so what it points at never shows —
 * but a zero normal would light every pixel of its NEIGHBOURS wrongly the
 * moment a shader normalizes it.
 */
export function faceNormals(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const out = new Float32Array(pos.count * 3);
  writeFaceNormals(pos.array as ArrayLike<number>, out, pos.count);
  return new THREE.Float32BufferAttribute(out, 3);
}

/** ONE triangle's face normal, straight into a caller's buffer — the form
 * the crumple needs, which rewrites the normal of every face it bends on
 * every frame and cannot afford an allocation to do it. `i` is the index of
 * the triangle's first vertex. */
export function writeFaceNormal(pos: ArrayLike<number>, out: Float32Array, i: number): void {
  {
    const ax = pos[i * 3];
    const ay = pos[i * 3 + 1];
    const az = pos[i * 3 + 2];
    const bx = pos[i * 3 + 3] - ax;
    const by = pos[i * 3 + 4] - ay;
    const bz = pos[i * 3 + 5] - az;
    const cx = pos[i * 3 + 6] - ax;
    const cy = pos[i * 3 + 7] - ay;
    const cz = pos[i * 3 + 8] - az;
    let nx = by * cz - bz * cy;
    let ny = bz * cx - bx * cz;
    let nz = bx * cy - by * cx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) {
      nx = 0;
      ny = 1;
      nz = 0;
    } else {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    for (let v = i; v < i + 3; v++) {
      out[v * 3] = nx;
      out[v * 3 + 1] = ny;
      out[v * 3 + 2] = nz;
    }
  }
}

/** Every triangle's, over a whole buffer. */
export function writeFaceNormals(pos: ArrayLike<number>, out: Float32Array, count: number): void {
  for (let i = 0; i + 2 < count; i += 3) writeFaceNormal(pos, out, i);
}

/** Flattens any geometry into the form the car is built from: de-indexed so
 * every face stands alone, painted a flat part colour, and carrying its own
 * face normal and gloss weight. Round parts come from THREE primitives and
 * pass through here, because hand-winding circular geometry fails silently
 * (faces are culled, not flagged). */
export function flatten(
  source: THREE.BufferGeometry,
  color: number,
  shine?: number,
): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  if (geo !== source) source.dispose();
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("normal", faceNormals(pos));
  // Gloss is left OFF unless a caller names one, so a primitive poured into
  // a builder takes that builder's current `shine` like every hand-wound
  // face beside it (`absorb`). A round part is a part of whatever it is
  // bolted to, not a material of its own.
  if (shine !== undefined) {
    geo.setAttribute(
      "aShine",
      new THREE.Float32BufferAttribute(new Float32Array(pos.count).fill(shine), 1),
    );
  }
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

/** A sub-rectangle of a patch, in patch (u, v) — and, optionally, a
 * SHEARED one. `lean0` and `lean1` are how far each u edge has moved by the
 * time v reaches 1, so an edge runs from `u0` at v = 0 to `u0 + lean0` at
 * v = 1 — a parallelogram rather than a rectangle. Against absolute v, not
 * the rect's own v0..v1, so a strip cut from v = 0..1 and the opening cut
 * from v0..v1 inside it share one edge line by construction.
 *
 * It exists for one reason: a cabin flank is a WARPED patch whose top edge
 * is the raked roof and whose bottom edge is the longer sill, so a line of
 * constant u leans with the rake — and a real B-pillar does not lean. */
export type UVRect = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  lean0?: number;
  lean1?: number;
};

/** Where a rect's u edge (`0` for u0, `1` for u1) sits at this v. */
export function rectU(rect: UVRect, edge: 0 | 1, v: number): number {
  return edge === 0 ? rect.u0 + (rect.lean0 ?? 0) * v : rect.u1 + (rect.lean1 ?? 0) * v;
}

/** The rect's corners in (u, v), wound v0 → v1 along u0, then back. */
export function rectCorners(rect: UVRect): [number, number][] {
  return [
    [rectU(rect, 0, rect.v0), rect.v0],
    [rectU(rect, 1, rect.v0), rect.v0],
    [rectU(rect, 1, rect.v1), rect.v1],
    [rectU(rect, 0, rect.v1), rect.v1],
  ];
}

/** A point inside the rect by its own fractions: `s` across (u0 → u1) and
 * `t` up (v0 → v1), with the lean applied — what anything that samples a
 * pane on a grid has to go through, or its film lands beside a leaning
 * edge instead of on it. */
export function rectAt(rect: UVRect, s: number, t: number): [number, number] {
  const v = rect.v0 + (rect.v1 - rect.v0) * t;
  const a = rectU(rect, 0, v);
  return [a + (rectU(rect, 1, v) - a) * s, v];
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
  rect: UVRect,
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
  const c = rectCorners(rect).map(([u, v]) => p(u, v));
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
  rect: UVRect,
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
  const c = rectCorners(rect).map(([u, v]) => p(u, v));
  if (mirrored) b.quadFade(c[3], c[2], c[1], c[0], color1, color0, alpha1, alpha0);
  else b.quadFade(c[0], c[1], c[2], c[3], color0, color1, alpha0, alpha1);
}

/** A three.js primitive flattened the way the hand-wound faces around it
 * are and poured into the same buffer — taking that builder's current gloss
 * with them. Anything round or tilted comes through here: hand-winding
 * either fails silently, faces culled rather than flagged. The geometry is
 * spent. */
export function solid(b: MeshBuilder, geo: THREE.BufferGeometry, color: number): void {
  b.absorb(flatten(geo, color));
}

/** A box that is allowed to lean: a seat back, a visor, a harness strap, a
 * shoulder, a dash face. Sizes and position are the box's own; `tilt` is
 * about x and `yaw` about y, applied in that order about the box's centre. */
export function slab(b: MeshBuilder, size: V3, at: V3, color: number, tilt = 0, yaw = 0): void {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (tilt !== 0) geo.rotateX(tilt);
  if (yaw !== 0) geo.rotateY(yaw);
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}

/** One length of tube, end to end — a cage bar, a forearm, a neck, a
 * steering column. */
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

/** A horizontal panel — a cabin floor, a headliner, a parcel shelf. `up`
 * says which way it is seen from: a floor is looked down on, a headliner up
 * at, and a single-sided face drawn the wrong way round is not there. */
export function plate(
  b: MeshBuilder,
  half: number,
  y: number,
  zFront: number,
  zRear: number,
  color: number,
  up: boolean,
): void {
  const c: V3[] = [
    [-half, y, zFront],
    [half, y, zFront],
    [half, y, zRear],
    [-half, y, zRear],
  ];
  if (up) b.quad(c[0], c[1], c[2], c[3], color);
  else b.quad(c[3], c[2], c[1], c[0], color);
}
