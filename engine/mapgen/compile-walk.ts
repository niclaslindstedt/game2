// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CURSOR AND WHAT IT CARRIES. One compile is a walk down the segment
// plan, and this is the state that walk owns: where it stands, the bare
// country under it (R34's follow, at the road's own grade and lag), the
// public network it may meet, the road's pristine heights and widths
// before any junction warped them, and the ledgers of what it has met so
// far. Everything else about compiling a stage is a question asked of
// this.

import { STAGE_RULES as R, followGradeOf, followLagOf, landOf } from "./rules.ts";
import { buildableAt, createLandField } from "./land.ts";
import { biomeRules } from "./biomes.ts";
import { snowlineOf } from "../game/climate.ts";
import { ROAD_CROSS } from "./road.ts";
import { type Spur } from "./spurs.ts";
import { createHighwayNetwork, type Highway } from "./highway.ts";
import { type RailCrossing } from "./railway.ts";
import type { Cursor } from "./compile-road.ts";
import type { Track } from "./track-shape.ts";

export type Walk = ReturnType<typeof createWalk>;

export function createWalk(track: Track, rolling: (s: number) => number, followsLand: boolean) {
  const cursor: Cursor = { x: 0, z: 0, heading: 0, s: 0, rollS: 0, baseY: 0, baseSlope: 0 };
  /** The bare country the stage is laid across — the branches steer by it
   * so none of them drives out into a lake (R17), and (R34) the road's own
   * height follows it. */
  const land = createLandField(track.seed, track.knobs, track.climate);
  // R40 — what an unsealed sample of this country is made of, and whether
  // anybody lives in it.
  const biome = biomeRules(track.knobs.biome);
  const loose = biome.loose;
  /** R17 — and the tarmac laid across it, indexed. Read off the track
   * because that is where it lives: the search laid it, the analysis
   * measures against it, and here it is what a borrowed junction's arm is
   * cut out of. */
  const highways = createHighwayNetwork(track.highways);

  /** R34 — one step of the road builder's eye: move the road's base toward
   * the ground under it, but no faster than the eye smooths and no steeper
   * than anything will drive. What comes out is a road that runs along the
   * country and cuts or fills where the country will not have it.
   *
   * Exponential rather than linear so the response length means the same
   * thing whatever the step is, and clamped after rather than before, so
   * the clamp is a property of the ROAD and the lag a property of the eye
   * — two rules, not one number doing both jobs badly.
   *
   * R40 — and BOTH are the country's (`followLagOf`, `followGradeOf`),
   * because the eye is a different man in a different country: a surveyor
   * running a graded line across the taiga, a bulldozer following the sand
   * across the desert. They move together, and `BiomeLand.lag` says why. */
  const F = R.elevation.follow;
  /** R40/R47 — the steepest the road runs in this country, and how far
   * behind the country it may run: the pair that decides whether it rides
   * the landscape or is planed through it. */
  const grade = followGradeOf(track.knobs);
  const lag = followLagOf(track.knobs);
  /** R47 — the country's zones, for the snowline the road goes under —
   * and the line itself, which the climate may bring down (climate.ts). */
  const zones = landOf(track.knobs).zones;
  const snowline = snowlineOf(track.climate, zones);
  const buildable = (x: number, z: number, roll: number): number => buildableAt(land, x, z, roll);
  if (followsLand) cursor.baseY = buildable(0, 0, rolling(0));

  const followLand = (
    base: number,
    slope: number,
    x: number,
    z: number,
    step: number,
    roll: number,
    /** R47 — inside a bore: the road follows nothing but its own line,
     * and eases to level at the crest rule's rate. */
    bored = false,
  ): { base: number; slope: number } => {
    if (!followsLand) return { base, slope: 0 };
    const ground = bored ? base : buildable(x, z, roll);
    const cap = bored ? R.tunnel.level : grade;
    const want = base + (ground - base) * (1 - Math.exp(-step / lag));
    // The gradient the road would like to be on here, then the two clamps:
    // how steep it may be, and how fast that may CHANGE. The second is what
    // rounds a hilltop off into a crest instead of leaving the brow the
    // first one on its own builds.
    let next = (want - base) / step;
    const swing = F.crest * step;
    if (next > slope + swing) next = slope + swing;
    else if (next < slope - swing) next = slope - swing;
    if (next > cap) next = cap;
    else if (next < -cap) next = -cap;
    return { base: base + next * step, slope: next };
  };

  /** The road's PRISTINE heights and widths, before any junction warped or
   * flared them (R17) — kept alongside the samples so a shaping pass that
   * overlaps an earlier one lands in exactly the same place instead of
   * compounding. */
  const rawY: number[] = [];
  const rawWidth: number[] = [];
  /** ...and the width and cross-fall as the WALK laid them, before either
   * runoff smoothed them. The runoffs are re-run over the tail of the
   * previous chunk when an endless stage extends (the window there was
   * cut off at the frontier), and a pass that reads its own output back
   * smooths that tail twice — so the road came out a different width
   * depending on how the renderer chunked its extends. Smoothing from the
   * bare values makes the pass idempotent: the same input, the same road. */
  const bareWidth: number[] = [];
  const bareBank: number[] = [];

  /** Junctions found in this pass, waiting for their branches. The branch
   * has to run until it is clear of the stage's country (R17), and how big
   * that country is is only known once the road it belongs to is
   * compiled — so the junction is noted here and the road built below. */
  type Junction = {
    /** Where the two roads MEET: a point on the route's own centerline,
     * at the tangent end of the corner it turns off (or onto) the main
     * road at. */
    x: number;
    z: number;
    elevation: number;
    slope: number;
    /** Heading of the road the branch continues along — the OTHER arm of
     * the road the route turns onto or off. */
    heading: number;
    /** True where the route joins the sealed road, false where it leaves. */
    joining: boolean;
    /** Arc position of the junction on the stage (pruning, association). */
    s: number;
    /** R36 — a crossing rather than a junction: it earns TWO arms, one each
     * way along the public road, and both of them are shut. */
    crossing?: boolean;
    /** ...and which point of which road it sits on, so the arms are cut
     * from the line the tarmac was actually laid on. */
    road?: { road: Highway; index: number };
  };
  const junctions: Junction[] = [];
  /** R41 — the railway crossings noted in this pass, waiting for their arms
   * the way the junctions wait for their branches. */
  const railMeets: { crossing: RailCrossing; road: Highway; slope: number }[] = [];

  /** R17 — can the arm this junction would abandon get OUT of the country
   * the stage occupies? A branch runs until it is clear of the map and then
   * stops out of sight; one that cannot get clear stops in a field instead,
   * and a tarmac road ending in a field is the loudest mistake the
   * generator can make — it is visible from a kilometre up and it is the
   * one thing that says nobody built this.
   *
   * The only honest test of whether a branch can leave is to DRIVE it, so
   * that is the test: the same `buildSpur` the junction would really get,
   * run against the country the plan already describes, and the corner is
   * taken only if the branch it would earn actually reaches the edge. A ray
   * out of the box cannot answer it — what stops a branch is the lake it
   * has to steer round and the stage it may not cross (R23), and neither is
   * on the ray.
   *
   * Where the corner is rejected nothing is repaired: the paving field
   * simply waits, and the surface changes at the next corner that can carry
   * a junction.
   *
   * Always true on an endless stage, which has no box — there a branch is
   * only asked to leave its own junction's neighbourhood, which any of them
   * manages. */
  /** The arms of the junctions already taken, as the trial built them. A
   * branch is boxed in by the OTHER branches as much as by the stage (R23),
   * and a trial that does not know about them accepts a junction whose real
   * arm is then stopped after fifty metres by the last one — which leaves a
   * public road lying alongside the stage inside its own junction window,
   * where nothing measures it. */
  const trialArms: Spur[] = [];
  /** R31's bench, read the way the analysis reads it between two roads:
   * the route's own corridor, or the verge's, whichever is wider. */
  const trialBench = Math.max(track.width / 2 + ROAD_CROSS.reach, R.verge.bench);
  return {
    cursor,
    land,
    biome,
    loose,
    highways,
    F,
    grade,
    lag,
    zones,
    snowline,
    buildable,
    followLand,
    rawY,
    rawWidth,
    bareWidth,
    bareBank,
    junctions,
    railMeets,
    trialArms,
    trialBench,
  };
}

export type Junction = Walk["junctions"][number];
