// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW THE MIRROR IS SET — the largest view a lens stood on the cockpit's
// mirror can take before the CAR gets into it, and where in the back window
// that view is aimed.
//
// The mirror looks back THROUGH the car, so the backlight is an aperture a
// couple of metres in front of the lens and everything outside it is
// header, C-pillar lining and parcel shelf. A field wider than that
// aperture spends the strip on the inside of a car the player is already
// sitting in; a field that fits inside it spends the whole strip on the
// road, which is the only thing a mirror is asked about. So the field is
// DERIVED from the body's own rear pane rather than authored: a hatchback
// with a tall backlight and a coupe with a letterbox are two different
// answers, and one number for both would frame one of them wrong.
//
// AND THEN IT IS TILTED UP, as far as the aperture allows, because that is
// what a driver does to a mirror. From a mirror hung on the header the back
// window looks mostly DOWNWARD — its top edge is barely above level and its
// bottom edge is the parcel shelf a metre and a half away — so a view
// centred in it is a view of the ground immediately behind the car, which
// is the one place nothing can be coming from. Pushed to the top of the
// aperture instead, the strip opens on the horizon and gives the rest to
// the road between there and here, which is where a car behind actually is.
//
// Plain arithmetic over the same glass rect the greenhouse cuts — no
// three.js and no DOM, so tests read it.

import { patchAt, rectAt, type Patch, type UVRect } from "./builder.ts";

/** The aperture, as the greenhouse states one: the panel it is cut in and
 * the glass rect cut out of it (`ScreenPane` in car/greenhouse.ts). */
export type Aperture = { patch: Patch; rect: UVRect };

export type Point3 = { x: number; y: number; z: number };

/** How the mirror ends up set: the HORIZONTAL field it may open to, deg,
 * and the point it ends up aimed at — the one handed in, tilted up by as
 * much as the window allows and kept the same distance away. */
export type MirrorFit = { fov: number; look: Point3 };

/** The band the field is held inside, deg of horizontal field.
 *
 * The floor is a mirror that has become a telephoto: past this the glass
 * shows one car filling the strip and nothing either side of it, which is
 * not what the player is asking the mirror. The ceiling is where the
 * aperture stops being the binding constraint at all — a body with a
 * backlight this open would have the lining back in shot before the frame
 * ran out, so the cap decides instead. Neither is reached by any body in
 * the catalog; they are there so a new one cannot produce a nonsense lens.
 */
const FOV_MIN = 18;
const FOV_MAX = 46;

/** How much of the aperture is given up at its edge, as a fraction of the
 * fitted half-field. The fit is exact, and exact means the lining is
 * EXACTLY at the corner of the frame — one pixel of glass jitter, one
 * millimetre of body flex between the lens and the pane, and it is in shot.
 * A couple of per cent of margin is a hand's width of glass at the edge of
 * the strip and costs nothing anybody can see. */
const MARGIN = 0.04;

/** How finely the aperture's outline is walked, per side, and how many
 * tilts are tried. The backlight is a bilinear patch with a leaning rect
 * cut in it, so its outline is a curve rather than four lines and a coarse
 * walk can step straight over the corner that binds. */
const OUTLINE_STEPS = 40;
const TILT_STEPS = 64;

type Flat = { x: number; y: number };

function contains(poly: readonly Flat[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Does the segment a→b touch the box `|x| <= hx`, `|y| <= hy`? Liang and
 * Barsky's clip: walk the four slabs, narrowing the stretch of the segment
 * that could still be inside, and answer whether any of it survives. */
function crossesBox(a: Flat, b: Flat, hx: number, hy: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let lo = 0;
  let hi = 1;
  const slab = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > hi) return false;
      if (r > lo) lo = r;
    } else {
      if (r < lo) return false;
      if (r < hi) hi = r;
    }
    return true;
  };
  return slab(-dx, a.x + hx) && slab(dx, hx - a.x) && slab(-dy, a.y + hy) && slab(dy, hy - a.y);
}

/**
 * Set the mirror against `pane`, for a lens at `at` pointed at `look` and a
 * glass `aspect` times wider than it is tall.
 *
 * Worked in the plane the camera's frustum is a RECTANGLE in — a point's
 * offsets across and up, each over its distance ahead — rather than in
 * angles, where the frame's edges are curves and the fit would be wrong at
 * the corners by exactly the amount that lets the lining in.
 *
 * The tilt is a rotation of that whole plane rather than an offset within
 * it, and the difference is not a nicety: the renderer rebuilds the lens's
 * basis about wherever the mirror ends up pointed, so a frame solved as an
 * offset in the UNTILTED plane is not the frame that gets drawn, and the
 * corners it was fitted by are the first thing to slide off the glass.
 */
export function fitMirror(pane: Aperture, at: Point3, look: Point3, aspect: number): MirrorFit {
  // The lens's own basis: ahead down the aim, across it to the right, up
  // from those two.
  const ahead = norm(look.x - at.x, look.y - at.y, look.z - at.z);
  const across = norm(...cross(ahead, [0, 1, 0]));
  const up = cross(across, ahead);

  /** One point of the glass, in the frustum's own plane. */
  const on = (s: number, t: number): Flat => {
    const [u, v] = rectAt(pane.rect, s, t);
    const p = patchAt(pane.patch, u, v);
    const d: [number, number, number] = [p[0] - at.x, p[1] - at.y, p[2] - at.z];
    const depth = dot(d, ahead);
    // Behind the lens there is no picture to fit into; a pane that folded
    // round the lens like that is a body with no cabin, and the floor of
    // the band is the honest answer.
    if (depth <= 1e-4) return { x: 0, y: 0 };
    return { x: dot(d, across) / depth, y: dot(d, up) / depth };
  };

  const outline: Flat[] = [];
  const n = OUTLINE_STEPS;
  for (let i = 0; i < n; i++) outline.push(on(i / n, 0));
  for (let i = 0; i < n; i++) outline.push(on(1, i / n));
  for (let i = 0; i < n; i++) outline.push(on(1 - i / n, 1));
  for (let i = 0; i < n; i++) outline.push(on(0, 1 - i / n));
  let lowest = Infinity;
  let highest = -Infinity;
  for (const p of outline) {
    lowest = Math.min(lowest, p.y);
    highest = Math.max(highest, p.y);
  }

  /** The same outline seen from a lens tilted `theta` up — the basis turned
   * about `across`, which in this plane is one divide per point. */
  const tilted: Flat[] = outline.map(() => ({ x: 0, y: 0 }));
  const turn = (theta: number): boolean => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < outline.length; i++) {
      const depth = c + outline[i].y * s;
      if (depth <= 1e-4) return false;
      tilted[i].x = outline[i].x / depth;
      tilted[i].y = (outline[i].y * c - s) / depth;
    }
    return true;
  };

  /** Does a frame `t` wide sit inside the tilted outline? A rectangle is
   * inside a closed curve exactly when its middle is inside and no piece of
   * the curve crosses it — which is one clip per outline segment, rather
   * than a walk round the frame's own edge dense enough not to step over
   * the place the curve cuts in. */
  const fits = (t: number, theta: number): boolean => {
    if (!turn(theta)) return false;
    const v = t / aspect;
    if (!contains(tilted, 0, 0)) return false;
    for (let i = 0, j = tilted.length - 1; i < tilted.length; j = i++) {
      if (crossesBox(tilted[j], tilted[i], t, v)) return false;
    }
    return true;
  };

  /** The highest the lens can be tilted with a frame `t` wide still on
   * glass, or null if there is nowhere it fits. Scanned from the top down:
   * the answer wanted is the topmost one, and a backlight is not convex
   * enough for a bisection to be honest about where the band starts. */
  const highestTilt = (t: number): number | null => {
    const top = Math.atan(highest);
    const bottom = Math.atan(lowest);
    for (let i = 0; i <= TILT_STEPS; i++) {
      const theta = top - ((top - bottom) * i) / TILT_STEPS;
      if (fits(t, theta)) return theta;
    }
    return null;
  };

  // Bisect between a frame that certainly fits and one that certainly does
  // not. Twenty halvings of the band is a hundredth of a degree, which is
  // finer than the geometry it is measuring.
  const floor = Math.tan((FOV_MIN * Math.PI) / 360);
  const ceiling = Math.tan((FOV_MAX * Math.PI) / 360);
  let lo = floor;
  let hi = ceiling;
  if (highestTilt(floor) === null) return { fov: FOV_MIN, look: aimedAt(0) };
  if (highestTilt(ceiling) !== null) lo = ceiling;
  else
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (highestTilt(mid) !== null) lo = mid;
      else hi = mid;
    }
  const t = lo * (1 - MARGIN);
  // A frame the margin has already shrunk fits wherever the unshrunk one
  // did, so the tilt this comes back with can only be a safe one.
  return { fov: (Math.atan(t) * 360) / Math.PI, look: aimedAt(highestTilt(t) ?? 0) };

  /** Where a lens tilted `theta` up is pointed: down the aim, turned about
   * `across`, at the distance the aim came in at. */
  function aimedAt(theta: number): Point3 {
    const reach = Math.hypot(look.x - at.x, look.y - at.y, look.z - at.z);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return {
      x: at.x + (ahead[0] * c + up[0] * s) * reach,
      y: at.y + (ahead[1] * c + up[1] * s) * reach,
      z: at.z + (ahead[2] * c + up[2] * s) * reach,
    };
  }
}

type V3 = [number, number, number];

function norm(x: number, y: number, z: number): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function cross(a: V3 | readonly number[], b: V3 | readonly number[]): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: V3 | readonly number[], b: V3 | readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
