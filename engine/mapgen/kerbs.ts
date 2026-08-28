// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — WHERE THE MARKING GOES.
//
// A rally road edged in stripes from one end to the other is not a road: it
// is a bobsleigh run with trees behind it. Real kerbing is placed, and it is
// placed for a reason — every stripe painted is a sentence said to a driver
// who is reading the road at 160 km/h and has about a second to read it.
// There are only four such sentences:
//
//   APEX   — inside the bend, around its tightest point. "Aim here." It is
//            the target that defines the line, and the thing that stops the
//            line being cut into whatever is on the inside.
//   EXIT   — outside the road where the corner unwinds onto the straight.
//            "The road ends here." Centrifugal force is taking the car
//            outward under power, and this is the edge of what it may use.
//   ENTRY  — outside the road on the approach to a hard corner. "Brake." A
//            braking marker, which is why it only ever appears in front of
//            a corner that needs braking for.
//   HAZARD — wrapped around something that will genuinely hurt: a bridge
//            parapet, the shoulders of a jump's lip.
//
// This module decides WHERE. It does not decide what is built there, because
// that depends on the surface and the two are not the same object: a sealed
// road wears a continuous low kerb through the apex and the exit, and a
// gravel road — where a poured concrete kerb would be a lie — wears a run of
// striped marker posts at `kerb.postSpacing`. The renderer reads the zone
// and builds the right one.
//
// Zones are computed from the compiled track's OWN pacenotes and samples
// rather than from the segment plan: a corner on a stage is a run of
// segments and the note is already the combination, which is exactly the
// thing a driver treats as one corner and a marshal marks as one.

import { cellKey } from "../lib/math.ts";
import type { Track } from "./compile.ts";
import { corridorOffset } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";

/** Why a piece of road is marked — see the four sentences above. */
export type KerbRole = "apex" | "exit" | "entry" | "hazard";

/** One run of marking along one edge of the road. */
export type KerbZone = {
  /** Arc span it covers, meters. */
  fromS: number;
  toS: number;
  /** Which edge it sits on: -1 is the left of the direction of travel, +1
   * the right. (A hazard takes one zone per side.) */
  side: -1 | 1;
  role: KerbRole;
};

/** How wide a window either side of a jump lip counts as its shoulders. */
const LIP_PAD = 8;

function clampSpan(value: number, band: { min: number; max: number }): number {
  return Math.min(band.max, Math.max(band.min, value));
}

/**
 * The zones overlapping an arc span, in arc order.
 *
 * A span rather than a whole stage because that is how the road is drawn —
 * one chunk at a time — and because an endless stage has no whole to ask
 * for. `fromS`/`toS` default to the whole compiled track.
 *
 * The corner rules read the pacenotes, so a chicane's two halves are marked
 * as the two corners a driver takes them as, and a long fourth-gear sweeper
 * built out of five segments is marked once. The hazard rule reads the
 * samples, because a bridge and a jump lip are sample-level facts.
 *
 * Note the SIDE convention. A pacenote's `dir` is the engine's map-space
 * sense: positive grows the heading, which is a turn toward the car's right
 * in map space. So the inside of the bend — where the apex kerb goes — is
 * the `dir` side, and the outside, which the entry and exit kerbs mark, is
 * the other one.
 */
export function buildKerbs(track: Track, fromS = 0, toS = Infinity): KerbZone[] {
  const zones: KerbZone[] = [];
  const K = R.kerb;
  // A corner reaches outside itself: its braking marker sits `entryLead`
  // before it and its exit kerb runs past its end, so the notes that can
  // touch this span start before it and finish after it.
  const noteFrom = fromS - K.exitRun.max;
  const noteTo = toS + K.entryLead;

  for (const note of track.pacenotes) {
    if (note.endS < noteFrom || note.s > noteTo) continue;
    if (note.angle < K.minAngle) continue;
    const inside = note.dir as -1 | 1;
    const outside = -inside as -1 | 1;
    const arc = note.endS - note.s;
    const mid = (note.s + note.endS) / 2;

    // The apex: a band centred on the middle of the bend. Held between a
    // floor and a ceiling so a hairpin is not marked by a stub and a long
    // sweeper is not marked from end to end.
    const apex = Math.min(arc, clampSpan(arc * K.apexSpan.frac, K.apexSpan));
    zones.push({ fromS: mid - apex / 2, toS: mid + apex / 2, side: inside, role: "apex" });

    // The exit: from where the corner stops bending, out along the straight
    // that follows it. Longer out of a bigger corner, which is where the car
    // is being pushed hardest toward the edge.
    const exit = clampSpan(arc * 0.5, K.exitRun);
    zones.push({ fromS: note.endS, toS: note.endS + exit, side: outside, role: "exit" });

    // The braking marker, on the corners that actually need braking for.
    if (note.angle >= K.entryAngle) {
      zones.push({
        fromS: note.s - K.entryLead,
        toS: note.s - K.entryLead + K.entryRun,
        side: outside,
        role: "entry",
      });
    }
  }

  // Hazards: both sides, because a hazard is marked all the way round.
  for (const [from, to] of hazardSpans(track, fromS - K.hazardPad, toS + K.hazardPad)) {
    for (const side of [-1, 1] as const) {
      zones.push({ fromS: from - K.hazardPad, toS: to + K.hazardPad, side, role: "hazard" });
    }
  }

  return zones.sort((a, b) => a.fromS - b.fromS);
}

/** Is arc position `s` inside one of the zones on `side`? Returns the role
 * that put it there, or null — the one question both the marker placement
 * below and the renderer's continuous asphalt kerb ask of a zone list. */
export function roleAt(zones: KerbZone[], s: number, side: -1 | 1): KerbRole | null {
  for (const zone of zones) {
    if (zone.side !== side) continue;
    if (s < zone.fromS) continue;
    if (s > zone.toS) continue;
    return zone.role;
  }
  return null;
}

/** The stage's hazard spans: every bridge deck (a parapet with a drop the
 * other side of it) and every jump lip (the shoulders of the ramp, where a
 * car that arrives crooked leaves the road at the worst possible moment). A
 * ford is not one — driving into water at speed is a soaking, not a wreck,
 * and the water marks itself. */
function hazardSpans(track: Track, fromS: number, toS: number): [number, number][] {
  const spans: [number, number][] = [];
  const samples = track.samples;
  const lo = Math.max(0, Math.floor(fromS / track.step));
  const hi = Math.min(samples.length, Math.ceil(toS / track.step) + 1);
  for (let i = lo; i < hi; i++) {
    if (samples[i].jump) {
      spans.push([samples[i].s - LIP_PAD, samples[i].s + LIP_PAD]);
      continue;
    }
    if (samples[i].deck == null) continue;
    // A hazard is marked whole or not at all, so a deck the window opened
    // in the middle of is walked out to BOTH its ends rather than to the
    // window's — otherwise a bridge straddling a chunk boundary is kerbed
    // from halfway across it.
    let start = i;
    while (start > 0 && samples[start - 1].deck != null) start--;
    while (i < samples.length && samples[i].deck != null) i++;
    spans.push([samples[start].s, samples[i - 1].s]);
  }
  return spans;
}

// ── The objects that realize a zone ───────────────────────────────────────
//
// A zone says "mark this edge of road, for this reason". On gravel that is
// realized as DISCRETE things standing in the verge, and where they stand
// is decided here rather than app-side — because one of them is solid. The
// renderer draws exactly this list and the contact model collides exactly
// this list, so a block the car is thrown by is a block the player can see.

/** How big a marker stands. Read three times — by the placement below, by
 * the contact model that weighs a block, and by the renderer that draws
 * both — so a post drawn one size and knocked over at another is not a
 * shape this tree can take. */
export const KERB_MARKER = {
  /** A marker post: a slim square stake in the verge. Real ones are plastic
   * or timber about a metre out of the ground — tall enough to read over a
   * crest, light enough that hitting one costs nothing but the post.
   * `out` is how far past the road EDGE its centre stands, m. */
  post: { width: 0.16, height: 1.05, out: 0.75 },
  /** An anti-cut block: a low slab of concrete laid on the inside of a
   * corner, `width` across the road and `depth` along it. Unlike a post it
   * is meant to be FELT — the car that cuts the apex is thrown, which is
   * the entire point of putting one there. */
  block: { width: 1.5, height: 0.28, depth: 0.6, out: 0.55 },
} as const;

/** One thing standing in the verge. `y` is its FOOT — the ground it is
 * planted in, which is the corridor's own profile out there and not the
 * road's crown, so a marker on a banked corner is banked with it. */
export type KerbMarker = {
  kind: "post" | "block";
  x: number;
  y: number;
  z: number;
  /** Heading of the road it stands beside, radians. */
  spin: number;
  /** Arc position along the stage, m — what the endless prune reads. */
  s: number;
  side: -1 | 1;
};

/** The markers a stage is wearing, kept in step with the road.
 *
 * One field per stage, built the same way on both sides of the wall: the
 * spacing cursors run CONTINUOUSLY along each edge, so nothing about where
 * a post lands depends on which chunk of road was built first. */
export type KerbField = {
  /** Every marker placed so far, in the order they were placed. */
  markers: KerbMarker[];
  /** Place markers for road indexed up to `upTo` (exclusive). A finite
   * stage is fully marked the moment its field is built; an endless one
   * catches up as the road streams. */
  extend: (upTo: number) => void;
  /** Forget everything the run has left behind — endless stages only. */
  pruneBefore: (s: number) => void;
  /** The anti-cut blocks within `r` of a point: what the contact model
   * asks, and the only markers it ever hears about. A post stops nothing. */
  blocksNear: (x: number, z: number, r: number) => KerbMarker[];
};

/** Cell size for the block lookup, m — comfortably over the biggest block
 * plus the reach any query asks with, so a hit is never more than the four
 * cells around the point. */
const BLOCK_CELL = 8;

export function createKerbField(track: Track): KerbField {
  const markers: KerbMarker[] = [];
  const grid = new Map<number, KerbMarker[]>();
  /** How far the road has been marked, in sample indices. */
  let indexed = 0;
  /** Where the last marker went down on each edge, m of arc — so posts
   * space themselves along the ROAD rather than landing on every sample.
   * Keyed by side, `[left, right]`. */
  const lastPost = [-Infinity, -Infinity];
  const lastBlock = [-Infinity, -Infinity];

  const cellOf = (block: KerbMarker): number =>
    cellKey(Math.floor(block.x / BLOCK_CELL), Math.floor(block.z / BLOCK_CELL));

  const file = (block: KerbMarker): void => {
    const cell = grid.get(cellOf(block));
    if (cell) cell.push(block);
    else grid.set(cellOf(block), [block]);
  };

  const extend = (upTo: number): void => {
    const to = Math.min(upTo, track.samples.length);
    if (to <= indexed) return;
    const K = R.kerb;
    const half = track.width / 2;
    // The zones only have to cover the new road, but a corner reaches
    // outside itself and `buildKerbs` already widens the window it reads
    // notes over — so the span asked for is exactly the span placed.
    const zones = buildKerbs(track, track.samples[indexed].s, track.samples[to - 1].s);
    for (let i = indexed; i < to; i++) {
      const sample = track.samples[i];
      // A ford and a bridge deck carry no marking of their own: the water
      // and the parapet are the markers there. A sealed road wears a
      // continuous kerb instead, which is a surface and not an object.
      if (sample.surface !== "gravel") continue;
      if (sample.deck != null) continue;
      for (const side of [-1, 1] as const) {
        const role = roleAt(zones, sample.s, side);
        if (role === null) continue;
        // Anti-cut blocks are laid at an APEX, where cutting is the whole
        // temptation; every other sentence is said with posts.
        const apex = role === "apex";
        const seen = apex ? lastBlock : lastPost;
        const at = (side + 1) / 2;
        const spacing = apex ? K.blockSpacing : K.postSpacing;
        if (sample.s - seen[at] < spacing) continue;
        seen[at] = sample.s;
        const shape = apex ? KERB_MARKER.block : KERB_MARKER.post;
        const out = (half + shape.out) * side;
        const r = { x: Math.cos(sample.heading), z: -Math.sin(sample.heading) };
        const marker: KerbMarker = {
          kind: apex ? "block" : "post",
          x: sample.x + r.x * out,
          y: sample.elevation + corridorOffset(sample, out, track.width),
          z: sample.z + r.z * out,
          spin: sample.heading,
          s: sample.s,
          side,
        };
        markers.push(marker);
        if (apex) file(marker);
      }
    }
    indexed = to;
  };

  const pruneBefore = (s: number): void => {
    // The list is in arc order, so what has to go is a prefix of it — and
    // finding an empty prefix costs one comparison, which is what makes
    // this safe to call from the step every frame.
    let cut = 0;
    while (cut < markers.length && markers[cut].s < s) cut++;
    if (cut === 0) return;
    for (const marker of markers.slice(0, cut)) {
      if (marker.kind !== "block") continue;
      const cell = grid.get(cellOf(marker));
      if (cell === undefined) continue;
      const at = cell.indexOf(marker);
      if (at >= 0) cell.splice(at, 1);
    }
    markers.splice(0, cut);
  };

  const blocksNear = (x: number, z: number, r: number): KerbMarker[] => {
    const found: KerbMarker[] = [];
    const reach = r + KERB_MARKER.block.width;
    for (
      let cx = Math.floor((x - reach) / BLOCK_CELL);
      cx <= Math.floor((x + reach) / BLOCK_CELL);
      cx++
    ) {
      for (
        let cz = Math.floor((z - reach) / BLOCK_CELL);
        cz <= Math.floor((z + reach) / BLOCK_CELL);
        cz++
      ) {
        const cell = grid.get(cellKey(cx, cz));
        if (cell === undefined) continue;
        for (const block of cell) {
          if (Math.abs(block.x - x) <= reach && Math.abs(block.z - z) <= reach) found.push(block);
        }
      }
    }
    return found;
  };

  extend(track.samples.length);
  return { markers, extend, pruneBefore, blocksNear };
}

/** The markers standing in an arc span — the window a renderer building one
 * chunk of road at a time needs.
 *
 * HALF-OPEN at the top, because that is what makes it exactly-once: chunks
 * abut on a shared sample, and a marker standing on it belongs to the chunk
 * that starts there and not also to the one that ended. Pass `Infinity` for
 * the last chunk, which has no next sample to stop at.
 */
export function markersBetween(field: KerbField, fromS: number, toS: number): KerbMarker[] {
  return field.markers.filter((marker) => marker.s >= fromS && marker.s < toS);
}
