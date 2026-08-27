// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — WHERE THE RED AND WHITE GOES.
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
// red-and-white marker posts at `kerb.postSpacing`. The renderer reads the
// zone and builds the right one.
//
// Zones are computed from the compiled track's OWN pacenotes and samples
// rather than from the segment plan: a corner on a stage is a run of
// segments and the note is already the combination, which is exactly the
// thing a driver treats as one corner and a marshal marks as one.

import type { Track } from "./compile.ts";
import { STAGE_RULES as R } from "./rules.ts";

/** Why a piece of road is marked — see the four sentences above. */
export type KerbRole = "apex" | "exit" | "entry" | "hazard";

/** One run of red and white along one edge of the road. */
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
