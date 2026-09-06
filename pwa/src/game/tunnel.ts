// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE TUNNEL, drawn: the lining of a bore and the portal at each end
// of it. The engine decided where the road goes through the shoulder
// (`TrackSample.tunnel`) and stood the walls the car stops against
// (`tunnelWalls`, `TUNNEL_WALL_OUT` past the road's edge); this builds
// what the driver sees there — a horseshoe vault of concrete following the
// road's own heading, grade and bank, dark, with a light fitting every so
// often so the inside is not black — and, where the bore begins and ends,
// the PORTAL: a concrete gallery standing out of the hillside with its face
// and its wing walls, which is what covers the seam where the ground
// lattice closes over the road.
//
// The lining is one merged, vertex-coloured geometry per road chunk, built
// from that chunk's tunnel samples the way the culverts and the bridges
// are, so it is culled and disposed with the road it lines. The portals go
// into the chunk that owns the mouth sample, and so does the LID — the
// mountain drawn back over the trench the lattice cuts along a bore
// (tunnel-lid.ts), given the ground to lay it on. Nothing here reaches the
// physics: the walls the car meets are the engine's.
//
// The profile is a pure function of the road's half width (`vaultProfile`)
// so the tests can hold the vault to the rule book's clearance without a
// renderer.

import * as THREE from "three";
import { STAGE_RULES, TUNNEL_WALL_OUT, corridorOffset, createRng, type Track } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { buildTunnelLid, type LidGround } from "./tunnel-lid.ts";
import { shareOne } from "../lib/shared-gpu.ts";

/** The vault, m. The walls rise plumb to the SPRING line and the arch
 * springs from there — a segmental arch rather than a semicircle, because
 * a semicircle over a fifteen-metre span is a cathedral. The spring sits
 * under the rule book's clearance by `springUnder`, and the arch's rise is
 * set per span so that OVER THE WHOLE MAT the ceiling still clears
 * `clearance`: the crown is higher, the edges are not lower. */
export const VAULT = {
  springUnder: 0.9,
  riseMin: 1.6,
  /** A little over the rule so a lorry-height clearance is never a hair
   * under it at the edge. */
  riseMargin: 0.15,
  /** How many facets the arch is drawn in, each side of the crown. */
  arcSegments: 6,
  /** How far under the verge the wall's foot is sunk, m, so no daylight
   * shows between the lining and the ground it stands in. */
  footSink: 0.35,
} as const;

/** How the lining is LIT: a fitting every `lightPitch` m from `lightFirst`
 * inside each mouth, drawn as a bright quad under the crown, with the
 * concrete around it brightened over `lightPool` m either way so the light
 * reads as light rather than as a sticker. */
export const TUNNEL_LIGHTS = { lightFirst: 12, lightPitch: 25, lightPool: 7, lift: 0.4 } as const;

/** The portal gallery, m: how far it stands OUT of the hillside past the
 * mouth sample, how far it runs IN past it — long enough that wherever the
 * 14 m ground lattice closes over the road, it closes inside concrete —
 * how thick its walls are round the vault, how far its parapet stands over
 * the crown, and the wing walls splayed off its face. */
export const PORTAL = {
  out: 6,
  in: 16,
  wall: 1.6,
  parapet: 1.4,
  /** How far under the road the gallery's sill is buried. */
  sill: 1.0,
  /** The hole through the gallery stands this much proud of the vault, so
   * the lining inside it never fights it for the same pixels. */
  slack: 0.12,
  /** The parapet's beam and the coping over it, m tall. */
  beam: 0.7,
  coping: 0.14,
  wing: { length: 5.5, splay: 0.6, thick: 0.7 },
} as const;

const CONCRETE = {
  wall: new THREE.Color(0x8e8b83),
  crown: new THREE.Color(0x504e49),
  portal: new THREE.Color(0x9c998f),
  portalDark: new THREE.Color(0x7d7a72),
  light: 0xfff1c8,
};

const liningMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
);
const portalMaterial = shareOne(() => new THREE.MeshLambertMaterial({ vertexColors: true }));
/** Unlit on purpose: a fitting is the one thing in the bore that is its
 * own light source, and a Lambert quad under a ceiling reads as grey. */
const lightMaterial = shareOne(
  () => new THREE.MeshBasicMaterial({ color: CONCRETE.light, side: THREE.DoubleSide }),
);

/** How far out from the centerline the vault's walls stand, m — where the
 * engine's own walls are. */
export function vaultSpan(half: number): number {
  return half + TUNNEL_WALL_OUT;
}

/** The arch's rise over the spring line for a road of this half width: the
 * least that keeps the ceiling at `clearance` out to the mat's edge. */
export function vaultRise(half: number): number {
  const span = vaultSpan(half);
  const edge = Math.sqrt(Math.max(1e-6, 1 - (half / span) ** 2));
  return Math.max(VAULT.riseMin, VAULT.springUnder / edge + VAULT.riseMargin);
}

/** The ceiling's height over the crown at lateral `u`, m: the spring line
 * plus the segmental arch, which is an ellipse's upper half over the span. */
export function vaultCeilingAt(half: number, u: number): number {
  const span = vaultSpan(half);
  const spring = STAGE_RULES.tunnel.clearance - VAULT.springUnder;
  const t = Math.min(1, Math.abs(u) / span);
  return spring + vaultRise(half) * Math.sqrt(1 - t * t);
}

/** The vault's cross-section, from the left wall's foot up over the arch to
 * the right wall's foot, as (u: lateral, v: height over the crown). The
 * feet are at v = 0; the profile is what a ring of the lining is built on
 * and what the portal's opening is cut to. */
export function vaultProfile(half: number): { u: number; v: number }[] {
  const span = vaultSpan(half);
  const spring = STAGE_RULES.tunnel.clearance - VAULT.springUnder;
  const n = VAULT.arcSegments;
  const pts: { u: number; v: number }[] = [{ u: -span, v: 0 }];
  for (let k = 0; k <= 2 * n; k++) {
    // Even steps in angle rather than in lateral, so the facets stay a
    // similar length round the shoulder where the arch turns fastest.
    const a = Math.PI - (Math.PI * k) / (2 * n);
    const u = span * Math.cos(a);
    pts.push({ u, v: k === 0 || k === 2 * n ? spring : vaultCeilingAt(half, u) });
  }
  pts.push({ u: span, v: 0 });
  return pts;
}

type Mouth = { index: number; inward: 1 | -1 };

/** The lining and the portals for the road in `samples[from..to)`: null
 * where nothing on this stretch is bored. Given `ground`, the lid goes in
 * too — the mountain over the bore, at the ground's own height and in its
 * own paint. */
export function buildTunnelLining(
  track: Track,
  from: number,
  to: number,
  ground?: LidGround,
): THREE.Group | null {
  const samples = track.samples;
  const first = Math.max(0, from - 1);
  const last = Math.min(to, samples.length);
  let bored = false;
  for (let i = first; i < last && !bored; i++) bored = samples[i].tunnel;
  if (!bored) return null;
  const group = new THREE.Group();
  const half = track.width / 2;
  const width = track.width;
  const profile = vaultProfile(half);
  const rng = createRng((track.seed ^ 0x7e11a5c3 ^ Math.imul(from, 40503)) >>> 0);
  const rand = (): number => rng.next();

  // ── The rings ──────────────────────────────────────────────────────────
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const lights: number[] = [];
  const mouths: Mouth[] = [];
  const ring = (i: number): THREE.Vector3[] => {
    const s = samples[i];
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    return profile.map((p, k) => {
      const foot = k === 0 || k === profile.length - 1;
      const y = foot
        ? s.elevation + corridorOffset(s, p.u, width) - VAULT.footSink
        : s.elevation + p.v - s.bank * p.u;
      return new THREE.Vector3(s.x + rx * p.u, y, s.z + rz * p.u);
    });
  };
  /** How far along the run this sample is, for the light fittings. */
  const runStart = (i: number): number => {
    let k = i;
    while (k > 0 && samples[k - 1].tunnel) k--;
    return samples[k].s;
  };
  const lightNear = (s: number, start: number): number => {
    const L = TUNNEL_LIGHTS;
    const at = s - start - L.lightFirst;
    const k = Math.round(at / L.lightPitch);
    return Math.abs(at - k * L.lightPitch);
  };
  const c = new THREE.Color();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, tint: THREE.Color[]): void => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    n.normalize();
    const jitter = 0.92 + rand() * 0.16;
    [a, b, d].forEach((p, k) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      c.copy(tint[k]).multiplyScalar(jitter);
      colors.push(c.r, c.g, c.b);
    });
  };
  const vmax = Math.max(...profile.map((p) => p.v));
  const shade = (k: number, pool: number, out: THREE.Color): THREE.Color => {
    out.copy(CONCRETE.wall).lerp(CONCRETE.crown, profile[k].v / vmax);
    return out.multiplyScalar(1 + 0.55 * pool);
  };
  const pool = (s: number, start: number): number => {
    const d = lightNear(s, start) / TUNNEL_LIGHTS.lightPool;
    return Math.exp(-d * d);
  };
  let prev: THREE.Vector3[] | null = null;
  let prevIndex = -1;
  for (let i = first; i < last; i++) {
    const s = samples[i];
    if (!s.tunnel) {
      prev = null;
      continue;
    }
    if (i >= from) {
      if (i === 0 || !samples[i - 1].tunnel) mouths.push({ index: i, inward: 1 });
      const ends = i === samples.length - 1 ? !track.endless : !samples[i + 1].tunnel;
      if (ends) mouths.push({ index: i, inward: -1 });
    }
    const cur = ring(i);
    if (prev !== null) {
      const start = runStart(i);
      const pa = pool(samples[prevIndex].s, start);
      const pb = pool(s.s, start);
      const ca: THREE.Color[] = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
      for (let k = 0; k + 1 < profile.length; k++) {
        // Wound so the INSIDE is the front face: seen from the road, each
        // quad's corners run counter-clockwise.
        tri(prev[k], prev[k + 1], cur[k], [
          shade(k, pa, ca[0]),
          shade(k + 1, pa, ca[1]),
          shade(k, pb, ca[2]),
        ]);
        tri(prev[k + 1], cur[k + 1], cur[k], [
          shade(k + 1, pa, ca[0]),
          shade(k + 1, pb, ca[1]),
          shade(k, pb, ca[2]),
        ]);
      }
      // A fitting under the crown wherever one falls between these rings.
      const L = TUNNEL_LIGHTS;
      const a0 = samples[prevIndex].s - start - L.lightFirst;
      const a1 = s.s - start - L.lightFirst;
      const k0 = Math.ceil(a0 / L.lightPitch);
      if (k0 >= 0 && k0 * L.lightPitch < a1) {
        const t = (k0 * L.lightPitch - a0) / Math.max(1e-6, a1 - a0);
        const crown = Math.floor(profile.length / 2);
        const hub = new THREE.Vector3().lerpVectors(prev[crown], cur[crown], t);
        hub.y -= L.lift;
        const along = new THREE.Vector3().subVectors(cur[crown], prev[crown]).normalize();
        const across = new THREE.Vector3(along.z, 0, -along.x);
        const hw = 0.5;
        const hl = 0.16;
        const corner = (da: number, dc: number): THREE.Vector3 =>
          hub.clone().addScaledVector(along, da).addScaledVector(across, dc);
        const p00 = corner(-hl, -hw);
        const p01 = corner(-hl, hw);
        const p10 = corner(hl, -hw);
        const p11 = corner(hl, hw);
        for (const p of [p00, p01, p10, p01, p11, p10]) lights.push(p.x, p.y, p.z);
      }
    }
    prev = cur;
    prevIndex = i;
  }
  if (positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.Mesh(geo, liningMaterial()));
  }
  if (lights.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lights, 3));
    group.add(new THREE.Mesh(geo, lightMaterial()));
  }

  // ── The portals ────────────────────────────────────────────────────────
  for (const mouth of mouths) group.add(buildPortal(track, profile, half, mouth, rand));

  // ── The lid ────────────────────────────────────────────────────────────
  // Held clear of the vault's outside along the bore and of the gallery's
  // roof at the mouths, so neither stands up through the rock.
  if (ground) {
    const lid = buildTunnelLid(track, from, to, ground, {
      outer: vaultSpan(half) + PORTAL.wall,
      roof: vaultCeilingAt(half, 0) + PORTAL.parapet,
      faceOut: PORTAL.out,
      topAt: (u) => vaultCeilingAt(half, u) + PORTAL.wall,
    });
    if (lid) group.add(lid);
  }
  return group;
}

/** The portal at one mouth: the gallery — a block of concrete with the vault
 * cut through it, standing `PORTAL.out` metres out of the hillside and
 * running `PORTAL.in` metres back into it — with the parapet along the top
 * of its face and a wing wall splayed off each side. Built in the mouth
 * sample's own frame (+z inward along the bore) and placed on it. */
function buildPortal(
  track: Track,
  profile: { u: number; v: number }[],
  half: number,
  mouth: Mouth,
  rand: () => number,
): THREE.Mesh {
  const s = track.samples[mouth.index];
  const b = new GeoBuilder(rand);
  const span = vaultSpan(half);
  const outer = span + PORTAL.wall;
  const top = vaultCeilingAt(half, 0) + PORTAL.parapet;
  const length = PORTAL.out + PORTAL.in;
  // The heading the gallery is laid along: the bore's, or its reverse at
  // the far mouth, so the face is always at local z = -out.
  const heading = mouth.inward > 0 ? s.heading : s.heading + Math.PI;
  const place = { x: s.x, y: s.elevation, z: s.z, ry: heading };

  const shape = new THREE.Shape();
  shape.moveTo(-outer, -PORTAL.sill);
  shape.lineTo(outer, -PORTAL.sill);
  shape.lineTo(outer, top);
  shape.lineTo(-outer, top);
  shape.closePath();
  const hole = new THREE.Path();
  const k = PORTAL.slack;
  hole.moveTo(-span - k, -PORTAL.sill + 0.2);
  for (const p of profile) {
    const foot = p.v === 0;
    hole.lineTo(p.u + Math.sign(p.u) * k, foot ? -PORTAL.sill + 0.2 : p.v + k);
  }
  hole.closePath();
  shape.holes.push(hole);
  const gallery = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  // The extrusion runs along +z from its face; the face stands `out`
  // before the mouth, and a lean of the road across the mouth is followed
  // by tilting the whole gallery with the bank.
  gallery.translate(0, 0, -PORTAL.out);
  b.add(gallery, [CONCRETE.portalDark, CONCRETE.portal], { ...place, tiltZ: -s.bank });

  // The parapet: a beam along the top of the face, a little wider than
  // the gallery, and a coping over it.
  const beam = new THREE.BoxGeometry(outer * 2 + 0.6, PORTAL.beam, 1.4);
  beam.translate(0, top + PORTAL.beam / 2, -PORTAL.out + 0.4);
  b.add(beam, CONCRETE.portal, place);
  const coping = new THREE.BoxGeometry(outer * 2 + 0.8, PORTAL.coping, 1.6);
  coping.translate(0, top + PORTAL.beam + PORTAL.coping / 2, -PORTAL.out + 0.4);
  b.add(coping, CONCRETE.portalDark, place);

  // The wing walls: off each corner of the face, splayed out and running
  // back toward the hillside, stepping down as they go.
  const W = PORTAL.wing;
  for (const side of [-1, 1]) {
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const len = W.length / steps;
      const h = top * (1 - (i + 0.5) / (steps + 0.6));
      const wing = new THREE.BoxGeometry(W.thick, h + PORTAL.sill, len + 0.1);
      wing.translate(0, (h - PORTAL.sill) / 2, len / 2 + i * len);
      // Splayed AWAY from the road: a positive turn about y carries +z
      // toward +x, so the wall on the +x side turns +x. Turned the other
      // way, both wings ran into the vault and stood at the road's edges
      // as a pair of pale wedges just inside every mouth.
      wing.rotateY(side * W.splay);
      const cx = side * (outer - W.thick / 2);
      wing.translate(cx, 0, -PORTAL.out);
      b.add(wing, CONCRETE.portal, place);
    }
  }
  const mesh = new THREE.Mesh(b.build(), portalMaterial());
  mesh.frustumCulled = true;
  return mesh;
}
