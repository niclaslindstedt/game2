// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — the JUNCTIONS. Asphalt on a rally stage is not a stripe painted on
// the route: it is a public road the stage borrows. The gravel arrives at
// a junction, joins the tarmac, runs it for a kilometer, and turns off it
// again — and at both junctions the branch the route does NOT take is
// still there, running away into the country, taped off with cones and a
// chevron board so nobody in the field is in any doubt which way the stage
// goes.
//
// This module builds those abandoned branches: a SPUR is a short road that
// leaves a junction on the tarmac's own line, curves away over a few
// hundred meters, and degrades to gravel as it leaves the world. It is
// real road — the terrain flattens a shelf under it, the physics gives it
// asphalt grip, and the forest keeps off it — so a player who ignores the
// tape can drive up it and see where it goes. Which is the point of a
// world you are allowed to leave the route in.
//
// And because the terrain flattens a shelf under it, R23 binds it: the
// shelf can only be laid under ONE road, so a branch that wanders back over
// the stage leaves one of the two ribbons hanging in the air over the
// country — a wall of road with nothing under it, which is exactly what the
// player sees. So the stage, and the ground its start stands on, are as
// solid an obstacle to a branch as the lake is: it turns away from them,
// and where it cannot, it stops.

import { createRng } from "../lib/prng.ts";
import { cellKey } from "../lib/math.ts";
import type { Surface } from "./compile.ts";
import { LAKE_Y, type LandField } from "./land.ts";
import { ROAD_CROSS, roadClearance } from "./road.ts";

/** One sample of a spur's centerline — the same shape as a track sample,
 * minus everything only the stage proper needs (progress, pacenotes). */
export type SpurSample = {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  /** Arc length from the junction, meters. */
  s: number;
  surface: Surface;
  lift: number;
  /** R17 — how much of this sample is warped flat onto the junction's
   * platform, 0..1. The branch leaves a junction the way it arrives at
   * one: on the junction's own plane, with no cross-section of its own. */
  flat: number;
};

export type Spur = {
  /** Arc position of its junction on the stage. */
  atS: number;
  /** Which junction it hangs off: the one where the route JOINS the
   * tarmac, or the one where it LEAVES it. */
  end: "entry" | "exit";
  samples: SpurSample[];
  /** Full road width, meters — the MAIN road's, continued: a branch is the
   * far arm of the road the route turned onto, not a road of its own. */
  width: number;
  /** Where it got to: off the edge of the world, the water that stopped it,
   * or the stage it was not allowed to cross. A branch heads for the map's
   * edge and usually reaches it; a branch that ran onto a headland ends on
   * the shore, because the one thing it must never do is carry on across
   * the lake on an embankment — or over the road it left (R23). */
  endsAt: "map" | "water" | "stage";
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

/** Spur geometry, meters. A branch is not a stub: it runs until it is OUT
 * of the country the stage occupies, because a road that stops in the
 * middle of a field is not a road — it is a mistake the player can see
 * from a kilometer away. Where it goes after that is nobody's business,
 * which is exactly what makes it worth following. */
export const SPUR = {
  /** How far past the stage's own bounding box a branch has to get before
   * it may end, m — past the fog ceiling, so it is never seen ending. */
  escape: 140,
  /** ...and the run it is allowed to take doing it. The floor keeps a
   * junction near the edge of the map from being a stub anyway; the
   * ceiling keeps a junction in the middle of a big stage from building a
   * second stage's worth of road. */
  length: { min: 260, max: 1500 },
  step: 4,
  /** Radius the branch's own wandering never turns tighter than, m. */
  minRadius: 55,
  /** How often the wander redraws its curvature, m. */
  bend: 55,
  /** ...and how far it holds the main road's line first, m. A junction
   * reads as a junction because one road goes STRAIGHT through it; a
   * branch that starts bending at the give-way line turns the whole thing
   * back into two ribbons peeling apart. */
  straight: 70,
  /** Steepest grade the branch climbs or drops, m per m. */
  maxGrade: 0.055,
  /** How far ahead the branch looks for the stage it must keep off (R23),
   * m — a longer look than the water's, because a road is a line the branch
   * can only get past by turning early, not a shore it can follow. */
  stageLook: 130,
  /** How far ahead the branch looks for water, m, and how far above the
   * water table the ground has to stand before it will happily drive on
   * it. A road does not strike out across a lake on an embankment, and one
   * that ENDS in mid-air over open water is a mistake anybody can see from
   * a kilometer up — so a branch that finds water ahead turns to follow
   * the shore, and wherever it finally stops, it stops on dry ground. */
  shoreLook: 90,
  shoreFreeboard: 1.5,
  /** ...and the stretch of branch that is never trimmed away, m, however
   * wet the ground is. A junction whose other arm simply is not there
   * reads as the main road stopping dead at the crossing, which is worse
   * than a short causeway: the road has to be seen to go somewhere even
   * when the country will not let it go far. */
  keep: 60,
  /** Fraction of the branch that is still sealed — past it the tarmac has
   * run out and the road carries on as gravel. */
  sealed: 0.68,
} as const;

/** Build the branch a junction leaves behind. `junction` is the point on
 * the route's centerline where the two roads meet, with the MAIN road's
 * heading and grade through it — the branch is that road, continued.
 * Deterministic in the seed and the junction's position. */
export function buildSpur(
  seed: number,
  junction: { x: number; z: number; heading: number; elevation: number; slope: number },
  atS: number,
  end: "entry" | "exit",
  /** The country the stage occupies — the branch runs until it is clear of
   * this box (plus `SPUR.escape`), so it always leaves the map rather than
   * stopping somewhere. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  /** The bare country it is being laid across — what tells it where the
   * lakes are. */
  land: LandField,
  /** Full width of the road, m. A branch is not a road of its own: it is
   * the MAIN road continued past the junction, so it is exactly as wide as
   * the carriageway the route was on. Anything else puts a step in the
   * middle of a junction that no amount of paving hides. */
  width: number,
  /** R23 — distance from a point to the nearest piece of ground that is
   * already road: the stage outside this junction's own neighbourhood, and
   * the aprons its start and finish stand on. Infinity where the country is
   * the branch's to take. */
  roadDistance: (x: number, z: number) => number,
): Spur {
  const rng = createRng(
    (seed ^ (Math.round(atS) * 2654435761) ^ (end === "entry" ? 0x9e37 : 0x85eb)) >>> 0,
  );
  // The branch leaves along the line the JUNCTION was planned on — it is
  // the other arm of the road the route just turned onto (or off), so its
  // direction is that road's, not a fork angle of its own. A branch that
  // picked its own heading is what makes two roads look like they merged
  // by accident instead of meeting where somebody put a junction.
  let heading = junction.heading;
  const escaped = (x: number, z: number): boolean =>
    x < bounds.minX - SPUR.escape ||
    x > bounds.maxX + SPUR.escape ||
    z < bounds.minZ - SPUR.escape ||
    z > bounds.maxZ + SPUR.escape;
  // The branch starts on the road's own grade and then makes up its own
  // mind, inside a grade a road would actually be built on.
  let grade = junction.slope;
  let curvature = 0;
  let x = junction.x;
  let z = junction.z;
  let y = junction.elevation;
  const samples: SpurSample[] = [];
  const box = { minX: x, maxX: x, minZ: z, maxZ: z };
  // The tarmac runs out before the road does; how much of it is sealed is
  // known only once the run's length is, so the surfaces are painted on in
  // a second pass below.
  let length: number = SPUR.length.max;
  let endsAt: Spur["endsAt"] = "map";
  /** The bearing out of the country: toward whichever edge of the box is
   * nearest. Once the branch has had its wander, this is what it follows —
   * a road heading out of the map has decided where it is going. */
  const exitBearing = (px: number, pz: number): number => {
    const west = px - bounds.minX;
    const east = bounds.maxX - px;
    const south = pz - bounds.minZ;
    const north = bounds.maxZ - pz;
    const least = Math.min(west, east, south, north);
    if (least === west) return -Math.PI / 2;
    if (least === east) return Math.PI / 2;
    if (least === south) return Math.PI;
    return 0;
  };

  /** How much dry ground this bearing offers: the lowest the bare country
   * gets above the water table anywhere inside the look-ahead, m. Negative
   * is a lake in the way. */
  const clearance = (px: number, pz: number, bearing: number): number => {
    const sin = Math.sin(bearing);
    const cos = Math.cos(bearing);
    let worst = Infinity;
    for (const ahead of [SPUR.step, SPUR.shoreLook * 0.22, SPUR.shoreLook * 0.5, SPUR.shoreLook]) {
      const h = land.heightAt(px + sin * ahead, pz + cos * ahead) - LAKE_Y;
      if (h < worst) worst = h;
    }
    return worst;
  };
  const wet = (px: number, pz: number, bearing: number): boolean =>
    clearance(px, pz, bearing) < SPUR.shoreFreeboard;

  /** R23 — how much room this bearing leaves between the branch and the
   * stage: the least distance to road anywhere inside the look-ahead. The
   * branch's own position is not in it — the caller has that already, and
   * it is the same for every bearing. */
  const room = (px: number, pz: number, bearing: number): number => {
    const sin = Math.sin(bearing);
    const cos = Math.cos(bearing);
    let worst = Infinity;
    for (const ahead of [SPUR.stageLook * 0.35, SPUR.stageLook * 0.7, SPUR.stageLook]) {
      const d = roadDistance(px + sin * ahead, pz + cos * ahead);
      if (d < worst) worst = d;
    }
    return worst;
  };
  const keepOut = roadClearance(width);
  /** Steps still covered by the last keep-out query's promise — see the
   * walk below. */
  let stageSkip = 0;
  /** The room straight ahead, measured once per step and then read by the
   * swing that follows it — three grid probes, and the swing used to take
   * them all over again before its first comparison. */
  let straightRoom = Infinity;

  for (let s = 0; s <= length; s += SPUR.step) {
    // A branch may only stop where a road could: past the edge of the
    // world, and on ground that is out of the water.
    if (s >= SPUR.length.min && escaped(x, z) && !land.flooded(x, z)) {
      length = s;
      break;
    }
    // The shore: rather than strike out across a lake on an embankment,
    // the branch turns to follow the water. Boxed in — a headland, a bay
    // it has driven into — it gives up on the map's edge and simply ends,
    // but only once it is standing on dry ground.
    const straightClear = s > 0 ? clearance(x, z, heading) : Infinity;
    if (straightClear < SPUR.shoreFreeboard) {
      let best = 0;
      let bestClear = straightClear;
      for (const swing of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const clear = clearance(x, z, heading + swing);
        if (clear <= bestClear) continue;
        bestClear = clear;
        best = swing;
        if (clear >= SPUR.shoreFreeboard) break;
      }
      if (best !== 0) {
        const turn = Math.sign(best);
        curvature = turn / SPUR.minRadius;
        heading += turn * Math.min(Math.abs(best), SPUR.step / SPUR.minRadius);
        if (bestClear < SPUR.shoreFreeboard) endsAt = "water";
      }
    }
    // R23 — and the stage itself, by the same move: swing to whichever
    // bearing leaves the most room between this branch and the road it
    // left. A branch that has already been pushed inside the clearance and
    // can find no way out simply stops there, because the alternative is a
    // second carriageway laid over ground the terrain has already given to
    // the first.
    //
    // The distance to the road is also a PROMISE about the next few steps:
    // nothing can come inside the look-ahead until the branch has covered
    // the slack, so a branch out in open country walks on without asking
    // again. Most of a branch is open country and the query is a grid
    // probe — without the skip it is most of the cost of compiling a stage.
    if (s > 0 && stageSkip > 0) stageSkip -= 1;
    else if (s > 0) {
      const here = roadDistance(x, z);
      const slack = here - keepOut - SPUR.stageLook;
      if (slack > 0) stageSkip = Math.floor(slack / SPUR.step);
      else if ((straightRoom = room(x, z, heading)) < keepOut) {
        let best = 0;
        let bestRoom = straightRoom;
        for (const swing of [0.4, -0.4, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
          const open = room(x, z, heading + swing);
          if (open <= bestRoom) continue;
          bestRoom = open;
          best = swing;
          if (open >= keepOut) break;
        }
        if (best !== 0) {
          const turn = Math.sign(best);
          curvature = turn / SPUR.minRadius;
          heading += turn * Math.min(Math.abs(best), SPUR.step / SPUR.minRadius);
        }
        // ...but never inside `keep`: a junction whose other arm is a stub
        // is the main road stopping dead at the crossing, which is a worse
        // thing to look at than a branch that runs a little close for a few
        // meters.
        if (s >= SPUR.keep && bestRoom < keepOut && here < keepOut) {
          endsAt = "stage";
          length = s;
          break;
        }
      }
    }
    samples.push({ x, z, heading, elevation: y, s, surface: "asphalt", lift: 0, flat: 0 });
    if (s >= SPUR.straight && s % SPUR.bend < SPUR.step) {
      curvature = rng.range(-1 / SPUR.minRadius, 1 / SPUR.minRadius);
      grade = Math.max(-SPUR.maxGrade, Math.min(SPUR.maxGrade, grade + rng.range(-0.03, 0.03)));
    }
    // Out in the open the branch wanders; past its first stretch it is
    // leaving, and a road that is leaving holds a line for the edge of the
    // map instead of circling back into the stage it just left.
    if (s > Math.max(SPUR.straight, SPUR.length.min * 0.5) && !wet(x, z, heading)) {
      const target = exitBearing(x, z);
      let err = target - heading;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err <= -Math.PI) err += 2 * Math.PI;
      const pull = Math.max(-1 / SPUR.minRadius, Math.min(1 / SPUR.minRadius, err * 0.02));
      curvature = curvature * 0.3 + pull * 0.7;
    }
    heading += curvature * SPUR.step;
    x += Math.sin(heading) * SPUR.step;
    z += Math.cos(heading) * SPUR.step;
    y += grade * SPUR.step;
  }
  // R23 — and then the guarantee the steering only tries for: the branch is
  // CUT at the first step that stands inside the clearance. Not backed up
  // to it — cut. A branch that dips into the stage's ground halfway along
  // and comes out the far side is over at the dip, because everything past
  // it was reached by crossing ground that was never this road's to cross.
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].s <= SPUR.keep) continue;
    if (roadDistance(samples[i].x, samples[i].z) >= keepOut) continue;
    samples.length = i;
    endsAt = "stage";
    break;
  }
  // Wherever it got to, it stops on DRY ground: a branch backed up out of
  // whatever shallows the last stretch walked into, because a road ending
  // in mid-air over open water is the one thing worse than a road ending
  // in a field.
  while (
    samples.length > 1 &&
    samples[samples.length - 1].s > SPUR.keep &&
    land.flooded(samples[samples.length - 1].x, samples[samples.length - 1].z, SPUR.shoreFreeboard)
  ) {
    samples.pop();
    endsAt = "water";
  }
  length = samples[samples.length - 1].s;

  // The tarmac runs out before the branch does: past `sealed` the mat is
  // gone and what is left is a gravel lane heading out of the world. The
  // mat also has to come UP out of the junction it starts in: a branch
  // that begins at full lift stands 20 cm proud of the road it is joined
  // to, right where the two are supposed to be one surface.
  const sealedTo = length * SPUR.sealed;
  for (const sample of samples) {
    const sealed = sample.s < sealedTo;
    sample.surface = sealed ? "asphalt" : "gravel";
    const out = Math.min(1, Math.max(0, (sealedTo - sample.s) / ROAD_CROSS.liftRamp));
    const up = Math.min(1, Math.max(0, sample.s / ROAD_CROSS.liftRamp));
    sample.lift = sealed ? ROAD_CROSS.asphaltLift * Math.min(out, up) : 0;
  }
  // The box is the branch that SURVIVED the trims, not the walk that built
  // it: a cut branch reporting the country it never reached is a lie the
  // next reader has no way to spot.
  for (const sample of samples) {
    if (sample.x < box.minX) box.minX = sample.x;
    if (sample.x > box.maxX) box.maxX = sample.x;
    if (sample.z < box.minZ) box.minZ = sample.z;
    if (sample.z > box.maxZ) box.maxZ = sample.z;
  }
  return { atS, end, samples, width, endsAt, bounds: box };
}

/** Half the width a spur's corridor occupies, m — the mat plus the verge
 * the ribbon draws beside it. */
export function spurReach(spur: Spur): number {
  return spur.width / 2 + ROAD_CROSS.reach;
}

/** Where the branches run, as a lookup: the terrain field asks it for the
 * nearest branch under every height query, so it has to answer in a fixed
 * few cell probes rather than a walk down every spur it has ever built. */
export type SpurHit = { spur: Spur; sample: SpurSample; d: number };

export type SpurIndex = {
  spurs: Spur[];
  add: (spur: Spur) => void;
  nearest: (x: number, z: number) => SpurHit | null;
  /** Endless: forget the branches the run has left far behind. */
  pruneBefore: (atS: number) => void;
};

/** Cell edge of the branch lookup, m — a couple of samples per cell. */
const INDEX_CELL = 24;

export function createSpurIndex(): SpurIndex {
  const spurs: Spur[] = [];
  const grid = new Map<number, { spur: Spur; sample: SpurSample }[]>();
  const key = (x: number, z: number): number =>
    cellKey(Math.floor(x / INDEX_CELL), Math.floor(z / INDEX_CELL));

  const add = (spur: Spur): void => {
    spurs.push(spur);
    for (const sample of spur.samples) {
      const k = key(sample.x, sample.z);
      const bucket = grid.get(k);
      if (bucket) bucket.push({ spur, sample });
      else grid.set(k, [{ spur, sample }]);
    }
  };

  const nearest = (x: number, z: number): SpurHit | null => {
    let best: SpurHit | null = null;
    const cx = Math.floor(x / INDEX_CELL);
    const cz = Math.floor(z / INDEX_CELL);
    // Three rings out — 72 m, comfortably past the corridor AND the shelf
    // blend beyond it. Cutting the search off inside the blend is what
    // leaves fans of shading radiating from a branch: the ground stops
    // being flattened at the cell boundary instead of at the blend's end.
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const bucket = grid.get(cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const entry of bucket) {
          const dx = entry.sample.x - x;
          const dz = entry.sample.z - z;
          // Squared first — see the road-distance field in compile.ts:
          // three rings of branch is a lot of road to take a root of, and
          // almost none of it is nearer than what the search already holds.
          const d2 = dx * dx + dz * dz;
          if (best && d2 > best.d * best.d * (1 + 1e-9)) continue;
          const d = Math.hypot(dx, dz);
          if (!best || d < best.d) best = { spur: entry.spur, sample: entry.sample, d };
        }
      }
    }
    return best;
  };

  const pruneBefore = (atS: number): void => {
    let cut = 0;
    while (cut < spurs.length && spurs[cut].atS < atS) cut++;
    if (cut === 0) return;
    for (let i = 0; i < cut; i++) {
      for (const sample of spurs[i].samples) {
        const bucket = grid.get(key(sample.x, sample.z));
        if (!bucket) continue;
        const at = bucket.findIndex((e) => e.sample === sample);
        if (at >= 0) bucket.splice(at, 1);
      }
    }
    spurs.splice(0, cut);
  };

  return { spurs, add, nearest, pruneBefore };
}
