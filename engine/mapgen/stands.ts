// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R27 — THE CROWD. A rally stage with nobody watching it is a road.
//
// Spectators do not line a stage evenly; they walk in from wherever they
// could park and they stand where something happens. So do these: at the
// finish, where the biggest bank of them is guaranteed, and at the corners
// worth the walk — the hairpins and the tight thirds, not every kink R26
// bothers to mark.
//
// And they stand on the INSIDE of the bend, back off the road. That is the
// safety rule every rally in the world briefs its spectators on, and it is
// a rule about where a car GOES when it lets go: it goes wide. A car that
// loses the back end at the apex, aquaplanes, or simply arrives too fast
// leaves at a tangent and finishes up on the OUTSIDE of the corner, which
// is why marshals tape the outside off and stand the crowd opposite. The
// inside is also where the corner can be seen from — a spectator on the
// inside watches the car come at them and go away again, rather than
// watching the back of it disappear.
//
// A stand is only worth placing at all where the crowd could have GOT
// there: R42 walks in from a car park, the car park hangs off a public
// road, and a corner with no such country behind it gets nobody. The
// refusal is the car park field's (it hands back the stands it could not
// serve) and the removal is `drop`'s.
//
// This module decides WHERE a stand is, HOW BIG it is, HOW MANY PEOPLE are
// standing in it (`standHeads` — the car park is sized from that number, so
// it cannot be the renderer's private business), and which way it faces. It
// does not decide what a person looks like — the renderer owns that. Like
// the corner guards (R14) it is placed against the world rather than
// against the plan, so it lives on the terrain field and takes the same
// road-distance and blocked probes: a crowd standing in a lake is worse
// than a corner with nobody at it.

import { hash2 } from "../lib/noise.ts";
import type { Track } from "./compile.ts";
import { finishAt } from "./compile.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";

/** One bank of spectators beside the road. */
export type Stand = {
  /** Centre of the front row, world meters. */
  x: number;
  z: number;
  /** Which way the crowd is looking — across the road, radians in the
   * heading convention. */
  facing: number;
  /** How wide the stand is along the road, m, and how many rows deep it is
   * standing. The renderer fills the rectangle; how many people that is, is
   * its business and not this module's. */
  width: number;
  rows: number;
  /** How big this crowd reads, 0..1 — a knot at a corner up to the bank at
   * the finish. The cheer's loudness comes off it. */
  size: number;
  /** Arc position along the stage, meters: what puts the stands in order,
   * and what a car passing one is measured against. */
  s: number;
  /** True for the stands banked either side of the finish gate. */
  finish: boolean;
};

/** R27 — how many people are standing in a stand: the front row at the
 * crowd's own density, as many rows deep as it is. One function, two
 * readers — the car park that has to hold their cars (R42) and the renderer
 * that draws them — because a crowd of eighteen served by a car park sized
 * for twenty-four is what two private answers to one question look like. */
export function standHeads(stand: Pick<Stand, "width" | "rows">): number {
  return Math.max(2, Math.round(stand.width * R.crowd.density)) * stand.rows;
}

export type StandField = {
  stands: Stand[];
  /** Place stands for every corner the road has committed up to `upToS`,
   * and — once the road reaches it — the bank at the finish. */
  extend: (
    upToS: number,
    roadDistance: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
  ) => void;
  /** R42 — take out the stands the crowd could never have reached. Called
   * with the ones the car park field refused, once it has decided them. */
  drop: (stands: readonly Stand[]) => void;
  /** How many times the list has CHANGED — a stand added or one dropped.
   * The renderer rebuilds its people off this rather than off the length,
   * which a sync that places two stands and drops two leaves unmoved. */
  revision: number;
  /** Endless: forget the crowds the run has left far behind. */
  pruneBefore: (s: number) => void;
};

/** How far back past its front row a stand's footprint reaches, m per row —
 * the rows plus standing room. A consequence of `rows`, not a dial. */
const ROW_DEPTH = 1.1;

/** Clearance a stand keeps from the road EDGE at its nearest corner, m. */
const ROAD_CLEAR = 2;

export function createStandField(track: Track): StandField {
  const C = R.crowd;
  const stands: Stand[] = [];
  const seed = (track.seed ^ 0x5bd1e995) >>> 0;
  const half = track.width / 2;
  /** How many pacenotes have been considered — a note is looked at once. */
  let considered = 0;
  let finishDone = false;
  let lastS = -Infinity;
  let placed = 0;

  const sampleAt = (s: number): Track["samples"][number] => {
    const i = Math.min(track.samples.length - 1, Math.max(0, Math.round(s / track.step)));
    return track.samples[i];
  };

  /** Try to plant a stand beside the road at arc `s`, on `side` (-1 to the
   * left of the direction of travel, +1 to its right). */
  const plant = (
    s: number,
    side: -1 | 1,
    size: number,
    finish: boolean,
    roadDistance: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
  ): boolean => {
    const sample = sampleAt(s);
    const roll = (k: number): number => hash2(placed * 7 + k, Math.round(s), seed);
    const out = half + knobScale(roll(1), C.setback);
    const width = knobScale(roll(2), C.width);
    const rows = Math.round(knobScale(roll(3), C.rows));
    // The road's right axis in world space, and the direction of travel.
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    const fx = Math.sin(sample.heading);
    const fz = Math.cos(sample.heading);
    const x = sample.x + rx * out * side;
    const z = sample.z + rz * out * side;
    // The whole footprint has to be clear, not just its middle: a stand is
    // metres of ground, and one corner of it in a stream is a row of people
    // standing in a stream. Four probes — both ends of the front row, its
    // middle, and the back row.
    const back = out + rows * ROW_DEPTH;
    const probes: [number, number][] = [
      [x - fx * (width / 2), z - fz * (width / 2)],
      [x, z],
      [x + fx * (width / 2), z + fz * (width / 2)],
      [sample.x + rx * back * side, sample.z + rz * back * side],
    ];
    for (const [px, pz] of probes) {
      if (blocked(px, pz)) return false;
      if (roadDistance(px, pz) < half + ROAD_CLEAR) return false;
    }
    placed += 1;
    field.revision++;
    stands.push({
      x,
      z,
      // Looking across the road, from the side they are standing on.
      facing: sample.heading - (Math.PI / 2) * side,
      width,
      rows,
      size,
      s: sample.s,
      finish,
    });
    return true;
  };

  const extend: StandField["extend"] = (upToS, roadDistance, blocked) => {
    // The finish, first and biggest: a bank down each side of the road on
    // the approach to the gate, which is where a rally's crowd actually
    // stands — they came to watch cars arrive, not to watch them coast.
    const line = finishAt(track);
    if (!finishDone && line !== null && upToS >= line) {
      finishDone = true;
      // Two banks a side: one on the APPROACH, where they watch cars arrive,
      // and one PAST the line on R25's run-out, where they watch them come
      // through. The second one is not decoration — the finish is watched
      // from a camera planted at the gate looking down the run-out, and a
      // crowd only ever behind that camera is a crowd nobody sees.
      for (const side of [-1, 1] as const) {
        plant(Math.max(0, line - C.finishReach * 0.5), side, 1, true, roadDistance, blocked);
        plant(
          Math.min(track.length, line + C.finishReach * 0.4),
          side,
          1,
          true,
          roadDistance,
          blocked,
        );
      }
    }
    // ...and the corners. One note, one stand, on the outside of the bend,
    // spaced out so a run of corners does not become a grandstand.
    while (considered < track.pacenotes.length) {
      const note = track.pacenotes[considered];
      // A note at the streaming frontier can still grow — stand at it only
      // once the road past it is committed.
      if (note.endS > upToS) break;
      considered += 1;
      if (note.angle < C.minAngle) continue;
      const at = (note.s + note.endS) / 2;
      if (at - lastS < C.spacing) continue;
      // The finish has its own crowd; a corner inside its reach would put a
      // second stand in the middle of it.
      if (line !== null && at > line - C.finishReach) continue;
      // The note's `dir` IS the inside of the bend, and the inside is where
      // the crowd stands: a car that lets go leaves at a tangent and
      // finishes on the outside, which is the side a marshal tapes off.
      const inside = note.dir;
      // How big a crowd a corner draws is how much of a corner it is.
      const size = Math.min(1, 0.35 + (note.angle - C.minAngle) * 0.5);
      if (plant(at, inside, size, false, roadDistance, blocked)) lastS = at;
    }
    stands.sort((a, b) => a.s - b.s);
  };

  const drop: StandField["drop"] = (refused) => {
    if (refused.length === 0) return;
    const gone = new Set(refused);
    for (let i = stands.length - 1; i >= 0; i--) {
      if (!gone.has(stands[i])) continue;
      stands.splice(i, 1);
      field.revision++;
    }
  };

  const pruneBefore = (s: number): void => {
    let cut = 0;
    while (cut < stands.length && stands[cut].s < s) cut++;
    if (cut > 0) {
      stands.splice(0, cut);
      field.revision++;
    }
  };

  const field: StandField = { stands, extend, drop, revision: 0, pruneBefore };
  return field;
}
