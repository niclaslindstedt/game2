// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — BORROWING THE TARMAC: how the route gets onto a road that was laid
// before it (`highway.ts`), runs it for a while, and turns off again.
//
// This is the half of the junction that used to be missing. When the sealed
// stretches were painted onto the racing line, the "other road" at every
// crossing had to be invented afterwards — a stub that left the junction on
// the route's own tangent, wandered, and stopped wherever the country ran
// out. Nothing about it went anywhere, because there was nothing for it to
// go to.
//
// With the tarmac laid first the direction of that dependency flips. The
// route SEEKS a road, meets it at a real angle, and runs ON it — so the arm
// it does not take is not invented at all: it is the rest of the road,
// which already crosses the map. The junction is where the two meet, and it
// is a place because both roads were there before it.
//
// Everything here is geometry over the segment vocabulary the rest of the
// search speaks, so the borrowed stretch is validated against R9 and R10
// exactly like any other candidate: a borrow that would take the route out
// of the world or back across its own line is rejected whole, and the
// search carries on down the country on gravel.

import type { Highway, HighwayNetwork } from "./highway.ts";
import { STAGE_RULES as R, type SegmentPlan } from "./rules.ts";
import type { Cursor } from "./search.ts";

/** How far apart the followed road is cut into segments, m. Short enough
 * that a public road's bend is tracked rather than chorded across, long
 * enough that a borrowed kilometre is a dozen segments and not a hundred. */
const FOLLOW_STEP = 70;

/** Fold an angle into -PI..PI. */
function wrap(a: number): number {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** R17 — the TURN ONTO the tarmac, solved rather than drawn.
 *
 * A car joining a road does not arrive at it and then start turning: it
 * turns so that it ARRIVES already on the road, which is one arc, and which
 * arc it is follows from the geometry rather than from the vocabulary. Take
 * the cursor's turning centre for a radius `r` — a road's width to the left
 * or right of where it is pointing — and the arc becomes tangent to the
 * road exactly when that centre sits `r` from the road's own line. That is
 * linear in `r`, so there is one radius that joins, and this solves for it.
 *
 * Returns null where the answer is not a corner a road would be built with:
 * the wrong side, a radius tighter than a hairpin, or one so open the two
 * roads merge over a hundred meters instead of meeting.
 */
export function solveJoin(
  cursor: Cursor,
  /** A point ON the road's centerline, and the direction of travel along it
   * that the route is joining INTO. */
  at: { x: number; z: number },
  along: number,
  radii: { min: number; max: number },
): { dir: 1 | -1; radius: number; angle: number } | null {
  // The road's own normal, and how far off its line the cursor stands.
  const mx = Math.cos(along);
  const mz = -Math.sin(along);
  const off = (cursor.x - at.x) * mx + (cursor.z - at.z) * mz;
  const turn = wrap(along - cursor.heading);
  if (turn === 0) return null;
  const dir: 1 | -1 = turn > 0 ? 1 : -1;
  // The centre sits `r` to the turning side of the cursor: its offset from
  // the road's line is `off + r · (n̂ · m̂)`, and the arc is tangent when the
  // magnitude of that is `r`.
  const nx = Math.cos(cursor.heading) * dir;
  const nz = -Math.sin(cursor.heading) * dir;
  const dot = nx * mx + nz * mz;
  // The centre stands `off + r·dot` from the road's line, and the arc is
  // tangent when the magnitude of that is `r`. The centre is on the same
  // side of the road as the cursor — it is turning toward the road, not
  // away past it — so the sign follows `off`, and
  //
  //     sign·(off + r·dot) = r   ->   r = |off| / (1 − sign·dot)
  //
  // A root that comes out negative is the arc curving away from the road:
  // no corner there, and the caller tries again further along.
  const side = off >= 0 ? 1 : -1;
  const denom = 1 - side * dot;
  if (Math.abs(denom) < 1e-6) return null;
  const radius = Math.abs(off) / denom;
  if (!(radius > 0) || radius < radii.min || radius > radii.max) return null;
  const angle = Math.abs(turn);
  return { dir, radius, angle };
}

export type Borrow = {
  /** The corner that turns onto the tarmac (unpaved — it is the dirt
   * road's own mouth), then the run along it, then the corner off. */
  plans: SegmentPlan[];
  /** Which road was borrowed, and the span of its points the route ran. */
  road: number;
  from: number;
  to: number;
};

/** R17 — build the whole borrow as one candidate: turn on, run the road,
 * turn off. Returns null where the geometry will not make a junction — the
 * caller then carries on down the country and tries again further on.
 *
 * It is one candidate on purpose. A borrow committed a segment at a time
 * could be half-placed when the run along the road turns out to cross the
 * stage's own line, and there is no honest way back from that: the route
 * would be left on a tarmac road it never leaves. Built whole, it is
 * validated whole and dropped whole. */
export function planBorrow(
  cursor: Cursor,
  network: HighwayNetwork,
  runOn: number,
  radii: { min: number; max: number },
): Borrow | null {
  const hit = network.nearest(cursor.x, cursor.z);
  if (!hit || hit.d > R.paving.borrow.joinReach) return null;
  const road = hit.road;
  const at = road.points[hit.index];
  // Which way along the road the route is going: whichever needs less
  // turning. A road runs both ways and the rally takes the one it is
  // already pointing down.
  const ahead = Math.abs(wrap(at.heading - cursor.heading));
  const back = Math.abs(wrap(at.heading + Math.PI - cursor.heading));
  const forward = ahead <= back;
  const along = forward ? at.heading : at.heading + Math.PI;
  if (Math.min(ahead, back) > R.paving.borrow.joinAngle) return null;

  const join = solveJoin(cursor, at, along, radii);
  if (!join) return null;
  const plans: SegmentPlan[] = [
    {
      kind: "turn",
      length: join.radius * join.angle,
      dir: join.dir,
      radius: join.radius,
      severity: "medium",
      feature: "none",
    },
  ];

  // ...then the road itself, cut into segments that track its bend. A
  // public road's curvature is gentle by construction, so most of these
  // come out straight — which is what a road across open country is.
  const step = forward ? 1 : -1;
  const perPoint = road.points[1].s - road.points[0].s;
  const chunk = Math.max(2, Math.round(FOLLOW_STEP / perPoint));
  let i = hit.index;
  let ran = 0;
  while (ran < runOn) {
    const next = i + step * chunk;
    if (next < 0 || next >= road.points.length) return null;
    const a = road.points[i];
    const b = road.points[next];
    const length = Math.abs(b.s - a.s);
    const turn = wrap((forward ? b.heading - a.heading : a.heading - b.heading) * 1);
    const bend = Math.abs(turn) > 1e-4 ? length / Math.abs(turn) : Infinity;
    plans.push(
      bend > radii.max
        ? { kind: "straight", length, feature: "none", paved: true }
        : {
            kind: "turn",
            length,
            dir: turn > 0 ? 1 : -1,
            radius: bend,
            severity: "soft",
            feature: "none",
            paved: true,
          },
    );
    ran += length;
    i = next;
  }

  // ...and the corner off it, back onto the dirt. Drawn rather than solved:
  // where the route goes after a junction is the stage's business, and the
  // only thing this has to be is a corner a road is built with.
  const off = Math.min(radii.max, Math.max(radii.min, (radii.min + radii.max) / 2));
  plans.push({
    kind: "turn",
    length: off * (Math.PI / 2.4),
    dir: join.dir === 1 ? -1 : 1,
    radius: off,
    severity: "medium",
    feature: "none",
  });
  return { plans, road: network.roads.indexOf(road), from: hit.index, to: i };
}

/** How the route should be steered to ARRIVE at the tarmac rather than
 * merely to reach it, as a heading error: positive turns the heading
 * toward the answer.
 *
 * Aiming straight at the nearest point on the road is what a search does
 * when it wants to touch one; it is not what a road builder does. A route
 * pointed at the tarmac meets it broadside, at an angle no junction is
 * built with, and the join is refused — so it wanders past and tries again
 * from the other side, forever. What this steers by instead is the road's
 * own LINE: close the cross-track error, and turn onto the road's heading
 * as the error goes to nothing, which is how anything follows a line and is
 * what puts the route alongside the tarmac pointing down it.
 *
 * Null where there is no tarmac on the map at all. */
export function steerToTarmac(cursor: Cursor, network: HighwayNetwork): number | null {
  const hit = network.nearest(cursor.x, cursor.z);
  if (!hit) return null;
  const at = hit.road.points[hit.index];
  // Down the road the way the route is already pointing: a rally joins the
  // carriageway it is going along, not the one coming the other way.
  const ahead = Math.abs(wrap(at.heading - cursor.heading));
  const along = ahead <= Math.PI / 2 ? at.heading : at.heading + Math.PI;
  const mx = Math.cos(along);
  const mz = -Math.sin(along);
  const off = (cursor.x - at.x) * mx + (cursor.z - at.z) * mz;
  // Cross toward the road at a HELD angle, and keep holding it right up to
  // the kerb. Easing onto the road's own heading as the offset closes — the
  // way anything follows a line — is what makes this fail: a corner that
  // joins a road covers `radius · (1 − cos turn)` of sideways ground, so an
  // approach that arrives parallel needs an infinite radius, and every join
  // is refused however close the route gets. What the solver wants is to be
  // met a few dozen metres out at a real angle, which is also what a
  // junction looks like.
  const want = along - Math.sign(off || 1) * APPROACH;
  return wrap(want - cursor.heading);
}

/** The angle an approach crosses the road at, radians. Inside the join's own
 * ceiling with room to spare, and steep enough that the corner onto the
 * tarmac lands in the turn vocabulary rather than needing a radius no road
 * is built with. */
const APPROACH = Math.PI / 3.6;

/** The slice of a road either side of a borrowed stretch: the arms the
 * route does NOT take at its two junctions. Not built — CUT, from a road
 * that already crosses the map, which is the whole reason a borrowed
 * junction has somewhere to go. */
export function armsOf(
  road: Highway,
  from: number,
  to: number,
): { entry: number[]; exit: number[] } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const before: number[] = [];
  for (let i = lo; i >= 0; i--) before.push(i);
  const after: number[] = [];
  for (let i = hi; i < road.points.length; i++) after.push(i);
  // The route joined at `from`, so the arm it abandoned there is whichever
  // end of the road lies behind it.
  return from <= to ? { entry: before, exit: after } : { entry: after, exit: before };
}
