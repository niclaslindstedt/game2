// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R42 — THE TRAILS: the trodden path from a car park's rim to the back of
// each stand it serves, and the arrow boards along it.
//
// The half of a car park that is WALKED rather than driven. It is separate
// from the placer (`carparks.ts`) because it asks the world different
// questions and answers to a different rule: a path may hug the route's
// verge where a road may not, it crosses no ground a road needs, and where
// a lane is refused for a step in it a path is refused for having to double
// back. It is threaded along the same country map the pad was found on —
// the cells say roughly where, and every step then reads the real ground
// and steers round what it finds.
//
// The renderer lays a strip of trodden earth on it and stands the boards
// beside it; the forest and the scatter keep off it (`trailClearance`).

import { CELL, walkFrom, type CountryMap } from "./carpark-map.ts";
import { STAGE_RULES as R } from "./rules.ts";
import type { Stand } from "./stands.ts";

const P = R.carPark;

/** One point of a trail, world metres, `s` from the pad's rim. */
export type TrailSample = { x: number; z: number; y: number; s: number; heading: number };

/** An arrow board on a trail: where it stands and the way it points. */
export type TrailSign = { x: number; z: number; y: number; heading: number; s: number };

/** The trodden path from a car park to one stand. */
export type Trail = {
  /** The stand it leads to, by its arc position on the stage — a stand has
   * no id of its own, and its `s` is what the run measures it by too — and
   * by its facing, because the two finish banks share an arc position. */
  standS: number;
  standFacing: number;
  samples: TrailSample[];
  signs: TrailSign[];
};

/** Everything a trail has to ask about the world it is walked across. The
 * placer's own context, narrowed to the questions a WALK asks. */
export type TrailProbe = {
  routeDistance: (x: number, z: number) => number;
  builtClearance: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  flooded: (x: number, z: number, margin?: number) => boolean;
  heightAt: (x: number, z: number) => number;
  /** The route's corridor — mat, shoulder and verge. */
  corridor: number;
  note?: (why: string) => void;
};

/** How far back past its front row a stand's footprint reaches, m per row
 * — the crowd's own `ROW_DEPTH`, restated because a trail ends behind the
 * back row and the stand does not carry the number. */
const ROW_DEPTH = 1.1;

/** Where a trail ends: behind the stand's back row, on its centreline. */
export function standBack(stand: Stand): { x: number; z: number } {
  const back = stand.rows * ROW_DEPTH + 1.5;
  return {
    x: stand.x - Math.sin(stand.facing) * back,
    z: stand.z - Math.cos(stand.facing) * back,
  };
}

function wrap(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Walk a trail from the pad's rim to a stand's back, threaded along the
 * cells the country map found a way through. The cells say roughly
 * where; every step still reads the real ground, and steers round what
 * it finds. Null where the walk cannot get there inside `walk` metres. */
export function walkTrail(
  probe: TrailProbe,
  map: CountryMap,
  pad: { x: number; z: number; radius: number },
  stand: Stand,
): Trail | null {
  const target = standBack(stand);
  const to = map.at(target.x, target.z);
  const from = map.at(pad.x, pad.z);
  if (to < 0 || from < 0) return null;
  const { dist, via } = walkFrom(map, to, P.walk + pad.radius);
  if (dist[from] === Infinity) {
    probe.note?.("trail:no-way");
    return null;
  }
  // The waypoints, pad to stand — the cells' centres, with the two ends
  // replaced by the real ones.
  const waypoints: { x: number; z: number }[] = [];
  for (let c = via[from]; c >= 0 && c !== to; c = via[c]) waypoints.push(map.centre(c));
  waypoints.push(target);
  const clear = (x: number, z: number): boolean =>
    probe.routeDistance(x, z) >= probe.corridor + P.trail.clear &&
    probe.builtClearance(x, z) >= P.trail.clear &&
    !probe.blocked(x, z) &&
    !probe.flooded(x, z, 0.4);
  let next = 0;
  let heading = Math.atan2(waypoints[0].x - pad.x, waypoints[0].z - pad.z);
  let x = pad.x + Math.sin(heading) * (pad.radius - 1);
  let z = pad.z + Math.cos(heading) * (pad.radius - 1);
  const samples: TrailSample[] = [];
  const step = P.trail.step;
  let s = 0;
  while (s <= P.walk) {
    samples.push({ x, z, y: probe.heightAt(x, z), s, heading });
    // On to the next waypoint once this one is near; the stand's back is
    // the one that has to be reached exactly.
    while (next < waypoints.length - 1) {
      const w = waypoints[next];
      if (Math.hypot(w.x - x, w.z - z) > CELL * 0.6) break;
      next++;
    }
    const aim = waypoints[next];
    const dx = aim.x - x;
    const dz = aim.z - z;
    const left = Math.hypot(dx, dz);
    if (next === waypoints.length - 1 && left <= step * 1.5) {
      samples.push({ x: aim.x, z: aim.z, y: probe.heightAt(aim.x, aim.z), s: s + left, heading });
      return { standS: stand.s, standFacing: stand.facing, samples, signs: [] };
    }
    const direct = Math.atan2(dx, dz);
    let chosen: number | null = null;
    // The straightest way first, then either side of it: a path that
    // has to double back is a path round something the crowd would not
    // have walked round.
    for (const swing of [0, 0.35, -0.35, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9]) {
      const bearing = direct + swing;
      let ok = true;
      for (const ahead of [step, step * 3]) {
        const px = x + Math.sin(bearing) * ahead;
        const pz = z + Math.cos(bearing) * ahead;
        if (!clear(px, pz)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        chosen = bearing;
        break;
      }
    }
    if (chosen === null) {
      probe.note?.("trail:stuck");
      return null;
    }
    // A path turns, it does not snap: the heading eases toward the
    // chosen bearing, which is what makes the line read as walked — and
    // the step it then takes is a step onto ground it has looked at.
    heading += wrap(chosen - heading) * 0.6;
    const nx = x + Math.sin(heading) * step;
    const nz = z + Math.cos(heading) * step;
    if (!clear(nx, nz)) {
      probe.note?.("trail:stuck");
      return null;
    }
    x = nx;
    z = nz;
    s += step;
  }
  probe.note?.("trail:long");
  return null;
}

/** The arrow boards along a trail: the first just up from the pad, then
 * one every `pitch` metres, and never within twenty of the stand. */
export function signTrail(probe: TrailProbe, trail: Trail): void {
  const end = trail.samples[trail.samples.length - 1].s;
  for (let s = P.sign.first; s < end - 20; s += P.sign.pitch) {
    let i = 0;
    while (i + 1 < trail.samples.length && trail.samples[i + 1].s <= s) i++;
    const at = trail.samples[i];
    const next = trail.samples[Math.min(i + 1, trail.samples.length - 1)];
    const heading = Math.atan2(next.x - at.x, next.z - at.z);
    // Beside the path, not on it: a board in the middle of a footpath is
    // a board people walk round.
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const off = P.trail.width / 2 + 0.6;
    const x = at.x + rx * off;
    const z = at.z + rz * off;
    trail.signs.push({ x, z, y: probe.heightAt(x, z), heading, s });
  }
}

/** Distance from a point to the nearest trail's edge, m — Infinity when
 * none is near. The forest and the scatter keep off a trodden path. */
export function trailClearance(trails: readonly Trail[], x: number, z: number): number {
  let best = Infinity;
  for (const trail of trails) {
    // A trail is a few hundred metres at most: a box round the whole of it
    // is the cheap first question.
    const first = trail.samples[0];
    const reach = trail.samples[trail.samples.length - 1].s + 4;
    if (Math.abs(x - first.x) > reach || Math.abs(z - first.z) > reach) continue;
    for (const sample of trail.samples) {
      const d = Math.hypot(sample.x - x, sample.z - z) - P.trail.width / 2;
      if (d < best) best = d;
    }
  }
  return best;
}
