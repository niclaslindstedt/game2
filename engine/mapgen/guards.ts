// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R14 — the CORNER GUARD. A sharp corner with open grass on the inside is
// not a corner: the fast line is straight across it, and no amount of
// tuning the turn's radius changes that. So the generator fills the inside
// of every corner worth cutting — the ground between a turn's entry and
// its exit — with something that costs more than the corner does:
//
//   a MOUND where there is room for one: a steep, rounded hill the car
//   climbs into, loses its speed on, and quite possibly lands badly off;
//   a GROVE where there is not: a knot of solid trunks, close enough that
//   threading them at pace is a worse bet than driving around.
//
// Neither is a wall. Both can be taken — that is the point. A barrier says
// "you may not"; a guard says "you may, and it will cost you".
//
// The patches are pure geometry: this module decides WHERE they sit and
// how big they are, the terrain field turns them into ground height and
// standing trunks, and the renderer draws whatever the field reports. One
// placement, three consumers — the hill the car climbs is the hill the
// player sees.

import { hash2 } from "../lib/noise.ts";
import { cellKey } from "../lib/math.ts";
import type { Track } from "./compile.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";

/** One patch of guarded ground on the inside of a corner. */
export type CornerGuard = {
  x: number;
  z: number;
  /** Ground-plane radius, m — the rise reaches zero at exactly this far. */
  radius: number;
  kind: "mound" | "grove";
  /** Mound only: crown height above the surrounding ground, m. */
  height: number;
  /** Grove only: where its trunks stand (the terrain field plants them on
   * the ridden ground and makes them solid). */
  saplings: { x: number; z: number; size: number; spin: number; roll: number }[];
  /** Arc position of the corner it guards — how an endless run prunes the
   * ones it has long since driven past. */
  s: number;
};

/** Cell edge for the guard lookup grid, m — comfortably over the widest
 * patch, so a query reads one 3×3 neighbourhood. */
const CELL = 40;

export type GuardField = {
  guards: CornerGuard[];
  /** Height the guards add at a point, m — the tallest patch covering it
   * wins rather than the sum, so two overlapping mounds make one hill
   * instead of a tower. */
  riseAt: (x: number, z: number) => number;
  /** The patches within `r` of a point — what the trunk placement and the
   * renderer walk. */
  near: (x: number, z: number, r: number) => CornerGuard[];
  /** Place guards for every corner the road has fully committed up to
   * `upToS`. Returns true when it added any. */
  extend: (
    upToS: number,
    roadDistance: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
  ) => boolean;
  /** Endless: forget the corners the run has left far behind. */
  pruneBefore: (s: number) => void;
};

export function createGuardField(track: Track): GuardField {
  const guards: CornerGuard[] = [];
  const grid = new Map<number, CornerGuard[]>();
  const seed = (track.seed ^ 0x27d4eb2f) >>> 0;
  const half = track.width / 2;
  /** How many pacenotes have been considered — a note is looked at once. */
  let considered = 0;

  const key = (x: number, z: number): number => cellKey(Math.floor(x / CELL), Math.floor(z / CELL));

  const add = (guard: CornerGuard): void => {
    guards.push(guard);
    const k = key(guard.x, guard.z);
    const bucket = grid.get(k);
    if (bucket) bucket.push(guard);
    else grid.set(k, [guard]);
  };

  const near = (x: number, z: number, r: number): CornerGuard[] => {
    const found: CornerGuard[] = [];
    const reach = Math.ceil((r + R.guard.maxRadius) / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const bucket = grid.get(cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const guard of bucket) {
          const ddx = guard.x - x;
          const ddz = guard.z - z;
          const reachSq = (r + guard.radius) * (r + guard.radius);
          if (ddx * ddx + ddz * ddz <= reachSq) found.push(guard);
        }
      }
    }
    return found;
  };

  const riseAt = (x: number, z: number): number => {
    let rise = 0;
    for (const guard of near(x, z, 0)) {
      if (guard.kind !== "mound") continue;
      const d = Math.hypot(guard.x - x, guard.z - z);
      if (d >= guard.radius) continue;
      // A raised cosine: flat-topped at the crown, tangent to the ground
      // at the rim. A cone would put a crease where the car hits it and a
      // spike where it does not.
      rise = Math.max(rise, guard.height * 0.5 * (1 + Math.cos((Math.PI * d) / guard.radius)));
    }
    return rise;
  };

  const sampleAt = (s: number): Track["samples"][number] => {
    const i = Math.min(track.samples.length - 1, Math.max(0, Math.round(s / track.step)));
    return track.samples[i];
  };

  const moundBias = knobScale(track.knobs.elevation, { min: 0.3, max: 0.9 });

  /** Fill one corner's inside: walk the shortcut its entry and exit invite
   * — the straight line a cheating car would take — and drop a patch every
   * `spacing` meters of it, as big as the room between that point and the
   * road allows. */
  const guardCorner = (
    noteIndex: number,
    fromS: number,
    toS: number,
    roadDistance: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
  ): void => {
    const a = sampleAt(fromS);
    const b = sampleAt(toS);
    const chord = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.floor(chord / R.guard.spacing);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (blocked(x, z)) continue;
      const d = Math.min(roadDistance(x, z), half + R.guard.maxRadius + R.guard.moundClear);
      const moundRadius = Math.min(R.guard.maxRadius, d - half - R.guard.moundClear);
      const groveRadius = Math.min(R.guard.maxRadius, d - half - R.guard.groveClear);
      if (groveRadius < R.guard.minRadius) continue;
      // Do not stack patches: one that already covers this spot is enough.
      if (near(x, z, 0).some((g) => Math.hypot(g.x - x, g.z - z) < g.radius * 0.7)) continue;
      const roll = hash2(noteIndex * 31 + k, noteIndex, seed);
      if (moundRadius >= R.guard.minMoundRadius && roll < moundBias) {
        add({
          x,
          z,
          radius: moundRadius,
          kind: "mound",
          height: Math.min(R.guard.maxHeight, moundRadius * R.guard.rise),
          saplings: [],
          s: fromS,
        });
        continue;
      }
      // A grove: trunks on a jittered lattice through the patch, dense
      // enough to have no clean line through and open enough to be a
      // gamble rather than a fence.
      const saplings: CornerGuard["saplings"] = [];
      const count = Math.max(3, Math.round((groveRadius * groveRadius * Math.PI) / 40));
      for (let n = 0; n < count; n++) {
        const angle = hash2(n, noteIndex * 17 + k, seed + 3) * Math.PI * 2;
        const reach = Math.sqrt(hash2(n, noteIndex * 19 + k, seed + 5)) * groveRadius;
        const tx = x + Math.cos(angle) * reach;
        const tz = z + Math.sin(angle) * reach;
        if (roadDistance(tx, tz) < half + R.guard.groveClear) continue;
        // Each trunk asks for itself, not only the patch's middle: a grove
        // is up to `maxRadius` across, and a trunk on its far side can stand
        // on a homestead's yard whose rim the middle cleared.
        if (blocked(tx, tz)) continue;
        saplings.push({
          x: tx,
          z: tz,
          size: 0.85 + hash2(n, noteIndex * 23 + k, seed + 7) * 0.6,
          spin: hash2(n, noteIndex * 29 + k, seed + 11) * Math.PI * 2,
          roll: hash2(n, noteIndex * 37 + k, seed + 13),
        });
      }
      if (saplings.length === 0) continue;
      add({ x, z, radius: groveRadius, kind: "grove", height: 0, saplings, s: fromS });
    }
  };

  const extend = (
    upToS: number,
    roadDistance: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
  ): boolean => {
    const before = guards.length;
    while (considered < track.pacenotes.length) {
      const note = track.pacenotes[considered];
      // A note at the streaming frontier can still grow — guard it only
      // once the road past it is committed.
      if (note.endS > upToS) break;
      considered += 1;
      if (note.angle < R.guard.angle) continue;
      guardCorner(considered, note.s, note.endS, roadDistance, blocked);
    }
    return guards.length > before;
  };

  const pruneBefore = (s: number): void => {
    let cut = 0;
    while (cut < guards.length && guards[cut].s < s) cut++;
    if (cut === 0) return;
    for (let i = 0; i < cut; i++) {
      const guard = guards[i];
      const bucket = grid.get(key(guard.x, guard.z));
      if (!bucket) continue;
      const at = bucket.indexOf(guard);
      if (at >= 0) bucket.splice(at, 1);
    }
    guards.splice(0, cut);
  };

  return { guards, riseAt, near, extend, pruneBefore };
}
