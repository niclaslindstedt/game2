// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chassis: the lofted body shell, and the geometry queries every other
// car part asks of it.
//
// The loft runs a fixed 12-point ring along the car's stations. Three of
// those points only separate over a wheel arch — away from the axles they
// collapse onto each other and their quads drop out — which is what lets
// one ring carry both a plain rocker and a cut-open arch with a wheel well
// behind it. That opening is most of what makes the car read as a car:
// without it the flanks run straight to the ground and the wheels look
// bolted to a slab.

import type { CarBodySpec, ProfilePoint } from "./spec.ts";
import type { MeshBuilder, V3 } from "./builder.ts";

// The body side is three planes: rocker (tucked under), belt (widest), and
// shoulder (tumblehome toward the deck). These fractions of the belt
// half-width shape the tuck; a spec overrides them through `side`.
const ROCKER = 0.9;
const SHOULDER = 0.8;

/** A color scaled toward black by `k` — the panel-gap and engine-bay tone
 * derived from the paint, so it works on a white car and a red one. */
export function shade(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

export function sideRatios(spec: CarBodySpec): { rocker: number; shoulder: number } {
  return { rocker: spec.side?.rocker ?? ROCKER, shoulder: spec.side?.shoulder ?? SHOULDER };
}

/** A shut line is a V-groove in the loft: two stations pulled in by this
 * much with a chamfer station either side. Cutting it into the ring rather
 * than laying a dark decal over the paint means the gap survives the
 * damage model's crumple with the panel it belongs to. */
const SEAM_INSET = 0.013;
/** Half-width of the groove floor and of the chamfer either side, m. */
const SEAM_FLOOR = 0.008;
const SEAM_WALL = 0.017;
/** How far the paint drops inside a shut line, 0..1. A gap painted in the
 * wheel-well's near-black reads as a stripe on a light car; a darkened
 * version of the paint itself reads as a shadow in a gap. */
const SEAM_SHADE = 0.5;

export type Station = {
  z: number;
  topY: number;
  half: number;
  flare: number;
  /** Bottom of the FLANK here, m — the wheel arch pushes it up over each
   * axle; everywhere else it sits on the floor. */
  sillY: number;
  /** Half-width of the flat underbody here, m. Narrows inside an arch so
   * the wheel well has somewhere to be. */
  wellHalf: number;
  /** Panel gap: "floor" stations are pulled into the groove, "wall" ones
   * are the chamfer either side of it. Any band touching either is painted
   * in shadow, which is what draws the line. */
  seam?: "floor" | "wall";
};

export function sampleProfile(profile: ProfilePoint[], z: number): { topY: number; half: number } {
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

/** Extra belt half-width from the flares over each axle, m — a triangular
 * bulge (0 → extra → 0) that makes chunky faceted fenders. */
export function flareAt(spec: CarBodySpec, axles: number[], z: number): number {
  const flare = spec.flare;
  if (!flare) return 0;
  let most = 0;
  for (const axle of axles) {
    const t = 1 - Math.abs(z - axle) / (flare.length / 2);
    if (t <= 0) continue;
    // A box flare holds full width and steps off over the last tenth of
    // its length — a chamfer rather than a true step, so the loft has
    // something to interpolate and the end reads as a folded edge.
    const swell = flare.kind === "box" ? Math.min(1, t / 0.1) : t;
    most = Math.max(most, flare.extra * swell);
  }
  return most;
}

/** Top of the wheel opening at z, m — the arch curve struck about the axle
 * center. Returns floorY where no arch reaches, so the flank simply sits
 * on the floor there. */
export function archAt(spec: CarBodySpec, axles: number[], z: number): number {
  const arch = spec.arches;
  if (!arch) return spec.floorY;
  const cy = spec.wheelRadius + (arch.lift ?? 0);
  let y = spec.floorY;
  for (const axle of axles) {
    const dz = z - axle;
    const r2 = arch.radius * arch.radius - dz * dz;
    if (r2 <= 0) continue;
    // Clamped under the belt: an arch that eats the belt line leaves the
    // flank with no side left to draw.
    y = Math.max(y, Math.min(spec.beltY - 0.05, cy + Math.sqrt(r2)));
  }
  return y;
}

function stationAt(spec: CarBodySpec, axles: number[], z: number): Station {
  const s = sampleProfile(spec.profile, z);
  const sillY = archAt(spec, axles, z);
  const open = sillY > spec.floorY + 1e-4;
  // Inside an arch the underbody has to clear the tire's inner face, or
  // the wheel spins inside solid bodywork.
  const rocker = sideRatios(spec).rocker;
  const wellHalf = open
    ? Math.min(s.half * rocker, spec.trackHalf - spec.wheelWidth / 2 - 0.03)
    : s.half * rocker + flareAt(spec, axles, z) * 0.7;
  return { z, topY: s.topY, half: s.half, flare: flareAt(spec, axles, z), sillY, wellHalf };
}

/** The station list: the authored silhouette, plus the samples the flares
 * and the arch curves need to resolve, plus a pair either side of every
 * door seam. */
export function buildStations(spec: CarBodySpec, axles: number[]): Station[] {
  const zNose = spec.profile[0].z;
  const zTail = spec.profile[spec.profile.length - 1].z;
  const zs = spec.profile.map((p) => p.z);

  const flare = spec.flare;
  if (flare) {
    const h = flare.length / 2;
    for (const axle of axles) {
      // The chamfer stations are what give a box flare its folded ends;
      // on a smooth flare they simply land on the taper.
      zs.push(axle + h, axle + h * 0.9, axle, axle - h * 0.9, axle - h);
    }
  }
  // The arch curve is the roundest thing on the car; it needs enough
  // stations that its facets read as a curve rather than a chamfer.
  const arch = spec.arches;
  if (arch) {
    const steps = 9;
    for (const axle of axles) {
      for (let i = 0; i <= steps; i++) {
        zs.push(axle - arch.radius + (2 * arch.radius * i) / steps);
      }
    }
  }
  const seams = new Map<number, "floor" | "wall">();
  for (const z of spec.doorSeams ?? []) {
    for (const [dz, kind] of [
      [SEAM_WALL, "wall"],
      [SEAM_FLOOR, "floor"],
      [-SEAM_FLOOR, "floor"],
      [-SEAM_WALL, "wall"],
    ] as const) {
      zs.push(z + dz);
      seams.set(z + dz, kind);
    }
  }

  const stations = zs
    .filter((z) => z <= zNose && z >= zTail)
    .sort((a, b) => b - a)
    .map((z) => {
      const st = stationAt(spec, axles, z);
      const kind = seams.get(z);
      if (kind) st.seam = kind;
      return st;
    });
  // Two stations at one z would loft a zero-length ring; keep the first.
  return stations.filter((s, i) => i === 0 || Math.abs(s.z - stations[i - 1].z) > 1e-4);
}

/** Ring cross-section at a station, counter-clockwise seen from the nose:
 * bottom center → out along the floor → up the wheel well → out to the
 * arch lip → up the flank → over the deck → and back down the far side.
 * Points 1–3 coincide wherever no arch is cut, so those quads vanish.
 *
 * The flank carries a midpoint in each of its two runs. They sit exactly
 * on the straight line between their neighbours, so they change no shape
 * whatever — they exist to halve the FACE size, because the dirt coat is
 * decided per face and a flank made of full-height strips takes its
 * spatter in vertical bands instead of specks. */
export function ring(spec: CarBodySpec, st: Station): V3[] {
  const inset = st.seam === "floor" ? SEAM_INSET : 0;
  const r = sideRatios(spec);
  const belt = st.half + st.flare - inset;
  const rocker = st.half * r.rocker + st.flare * 0.7 - inset;
  const top = st.half * r.shoulder + st.flare * 0.25 - inset;
  const well = Math.min(st.wellHalf, rocker);
  const lower = (rocker + belt) / 2;
  const lowerY = (st.sillY + spec.beltY) / 2;
  const upper = (belt + top) / 2;
  const upperY = (spec.beltY + st.topY) / 2;
  return [
    [0, spec.floorY, st.z],
    [well, spec.floorY, st.z],
    [well, st.sillY, st.z],
    [rocker, st.sillY, st.z],
    [lower, lowerY, st.z],
    [belt, spec.beltY, st.z],
    [upper, upperY, st.z],
    [top, st.topY, st.z],
    [0, st.topY, st.z],
    [-top, st.topY, st.z],
    [-upper, upperY, st.z],
    [-belt, spec.beltY, st.z],
    [-lower, lowerY, st.z],
    [-rocker, st.sillY, st.z],
    [-well, st.sillY, st.z],
    [-well, spec.floorY, st.z],
  ];
}

/** Which color each ring segment is painted. Segment k spans ring point k
 * to k+1, so this is the map from "where on the cross-section" to "what
 * kind of surface". */
function segmentColor(k: number, paint: number, under: number, well: number): number {
  if (k === 0 || k === 15) return under; // the flat underbody
  if (k === 1 || k === 14) return well; // wheel-well inner wall
  if (k === 2 || k === 13) return well; // the arch lip, seen from below
  return paint;
}

export function buildShell(b: MeshBuilder, spec: CarBodySpec, stations: Station[]): void {
  const paint = spec.colors.paint;
  const under = spec.colors.trim ?? 0x14181f;
  const well = spec.colors.shadow ?? 0x191d24;
  const seamColor = shade(paint, SEAM_SHADE);

  for (let i = 0; i < stations.length - 1; i++) {
    const sa = stations[i];
    const sc = stations[i + 1];
    // A band inside the shut line — groove floor or chamfer wall, both
    // painted in shadow. It has to be NARROW as well as seam-ended: the
    // two stations bracketing a whole door are both seam stations too, and
    // without the width test the entire door panel goes dark.
    const gap = sa.seam !== undefined && sc.seam !== undefined && sa.z - sc.z < SEAM_WALL * 2.2;
    const a = ring(spec, sa);
    const c = ring(spec, sc);
    for (let k = 0; k < a.length; k++) {
      const k2 = (k + 1) % a.length;
      const base = segmentColor(k, paint, under, well);
      // Only the visible flank and deck carry the line; the underbody is
      // already shadow-colored.
      const color = gap && base === paint ? seamColor : base;
      b.quad(a[k2], a[k], c[k], c[k2], color);
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

/** Where the flank is at (z, y): the x the body side reaches at that
 * height, so a decal, a stripe or a rubbing strip can be laid ON it rather
 * than floating beside it. Above the shoulder it clamps to the deck edge. */
export function flankX(spec: CarBodySpec, axles: number[], z: number, y: number): number {
  const s = sampleProfile(spec.profile, z);
  const flare = flareAt(spec, axles, z);
  const sillY = archAt(spec, axles, z);
  const r = sideRatios(spec);
  const rocker = s.half * r.rocker + flare * 0.7;
  const belt = s.half + flare;
  const top = s.half * r.shoulder + flare * 0.25;
  if (y <= sillY) return rocker;
  if (y <= spec.beltY) {
    const t = (y - sillY) / Math.max(1e-4, spec.beltY - sillY);
    return rocker + (belt - rocker) * t;
  }
  const t = Math.min(1, (y - spec.beltY) / Math.max(1e-4, s.topY - spec.beltY));
  return belt + (top - belt) * t;
}

/** Where a band laid between two z stations has to be sampled: a uniform
 * ladder, plus each fold in the flank (the flare's ends and peak, and the
 * profile's own stations) that falls inside the span. Sorted nose → tail
 * or tail → nose, matching the band's own direction. */
function bandSamples(spec: CarBodySpec, axles: number[], zFrom: number, zTo: number): number[] {
  const lo = Math.min(zFrom, zTo);
  const hi = Math.max(zFrom, zTo);
  const zs = new Set<number>([zFrom, zTo]);
  const uniform = 16;
  for (let i = 1; i < uniform; i++) zs.add(lo + ((hi - lo) * i) / uniform);
  const folds: number[] = spec.profile.map((p) => p.z);
  const flare = spec.flare;
  if (flare) {
    const h = flare.length / 2;
    for (const axle of axles) folds.push(axle + h, axle + h * 0.9, axle, axle - h * 0.9, axle - h);
  }
  for (const z of folds) if (z > lo && z < hi) zs.add(z);
  const out = [...zs].sort((a, b) => a - b);
  return zFrom > zTo ? out.reverse() : out;
}

/** A flat band laid on the flank, both sides, sampled along z so it hugs
 * the fenders. `rise` lifts the front end of the band above the rear. */
export function sideBand(
  b: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  band: {
    zFrom: number;
    zTo: number;
    yFrom: number;
    yTo: number;
    rise?: number;
    proud?: number;
    overArch?: "clip" | "ride";
  },
  color: number,
): void {
  const proud = band.proud ?? 0.006;
  const rise = band.rise ?? 0;
  const height = band.yTo - band.yFrom;
  // The band's own samples PLUS every z where the flank itself changes
  // direction. A uniform sampling cuts a straight chord across a box
  // flare's step and the bodywork bursts through the paint; landing a
  // sample on each fold is the only thing that stops it.
  const zs = bandSamples(spec, axles, band.zFrom, band.zTo);
  const steps = zs.length - 1;
  // A band never hangs in a wheel opening. `clip` lets the arch eat into
  // it (a panel that stops where the metal stops); `ride` keeps its full
  // height and arcs over the opening, which is what a rocker stripe does.
  // Either way it is capped just above the belt: a band that climbs onto
  // the shoulder balloons into a dome instead of following the car.
  const ceiling = spec.beltY + 0.04;
  const at = (i: number): { z: number; y0: number; y1: number } => {
    const z = zs[i];
    // t = 0 is the front end of the band, so the rake decays going back.
    const t = (z - band.zFrom) / (band.zTo - band.zFrom || 1);
    const lift = rise * (1 - t);
    const floor = archAt(spec, axles, z) + 0.012;
    const y0 = Math.max(band.yFrom + lift, floor);
    const wanted =
      band.overArch === "ride" ? Math.max(band.yTo + lift, y0 + height) : band.yTo + lift;
    // Never inverted: a band whose top has been pushed below its bottom
    // draws back to front and bleeds ragged streaks into the paint.
    return { z, y0, y1: Math.max(y0, Math.min(wanted, ceiling)) };
  };
  for (let i = 0; i < steps; i++) {
    const a = at(i);
    const c = at(i + 1);
    // Where the arch has eaten the whole band there is nothing to draw.
    if (a.y1 - a.y0 < 0.008 && c.y1 - c.y0 < 0.008) continue;
    for (const side of [1, -1]) {
      const p = (s: { z: number; y0: number; y1: number }, y: number): V3 => [
        side * (flankX(spec, axles, s.z, y) + proud),
        y,
        s.z,
      ];
      const q = [p(a, a.y0), p(c, c.y0), p(c, c.y1), p(a, a.y1)];
      if (side > 0) b.quad(q[0], q[1], q[2], q[3], color);
      else b.quad(q[3], q[2], q[1], q[0], color);
    }
  }
}

/** Half-width of the widest thing a spec draws, m — bodywork, arch trim,
 * or the tires standing proud of both. */
export function bodyHalfWidth(spec: CarBodySpec, axles: number[]): number {
  let widest = spec.trackHalf + spec.wheelWidth / 2;
  const trimWidth = spec.arches?.trim?.width ?? 0;
  const r = sideRatios(spec);
  const nose = spec.profile[0].z;
  const tail = spec.profile[spec.profile.length - 1].z;
  for (let i = 0; i <= 40; i++) {
    const z = nose + ((tail - nose) * i) / 40;
    const s = sampleProfile(spec.profile, z);
    const flare = flareAt(spec, axles, z);
    widest = Math.max(widest, s.half + flare, s.half * r.rocker + flare * 0.7 + trimWidth);
    widest = Math.max(widest, s.half * r.shoulder + flare * 0.25);
  }
  return widest;
}

/** Half-length of a spec, m, measured to the furthest point it actually
 * DRAWS rather than to the profile's end stations: the bumpers stand proud
 * of both caps, and they are what a tree meets first. */
export function bodyHalfLength(spec: CarBodySpec): number {
  const nose = spec.profile[0].z;
  const tail = spec.profile[spec.profile.length - 1].z;
  // buildBumper centers the bar at zEnd ± (depth/2 − 0.02), so its outer
  // face lands depth − 0.02 past the cap.
  const front = spec.front?.bumper ? spec.front.bumper.depth - 0.02 : 0;
  const rear = spec.rear?.bumper ? spec.rear.bumper.depth - 0.02 : 0;
  return Math.max(nose + front, -tail + rear);
}
