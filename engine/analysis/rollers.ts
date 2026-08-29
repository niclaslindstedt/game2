// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLLERS — a rank of balls the size of a wheel, rolled down the stage
// side by side, each one writing down the surface it touches and anything
// it hits on the way.
//
// The idea is older than any of this: you find out whether a road is a road
// by putting something round on it. A rule check can only ask whether the
// plan was legal; a roller asks what the ground actually DOES under a
// wheel, which is the only question the car ever asks. The rank runs from
// the far verge on one side to the far verge on the other, because a rally
// car spends half a stage off the mat and R31 promises the ground beside
// the road is rideable — so the verge is analyzed exactly like the road,
// at a looser tolerance.
//
// Three things come out of the field of contact points, and each is a
// different kind of wrong:
//
//   ALONG a lane — the grade. A stride that climbs or drops harder than a
//   road does is a step, not a slope: the ford ramp that got too steep, the
//   shelf that failed to blend, the hillside the verge cone did not cut.
//
//   ACROSS the rank — the residual. The camber, the wheel tracks and the
//   bank are all KNOWN (road.ts draws them), so they are subtracted, and
//   what is left between two adjacent balls is a wall or a trench that
//   nothing put there on purpose.
//
//   The BALL BRIDGES. A defect narrower than the contact patch is one the
//   wheel rolls straight over and the driver never feels, so it is reported
//   as a note and scored as nothing. This is the whole reason the probe is
//   a ball and not a point: without it, every analytic field's own noise
//   reads as a road full of holes.

import { corridorOffset, ROAD_CROSS } from "../mapgen/road.ts";
import type { Track, TrackSample } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { createKerbField, KERB_MARKER, markersBetween } from "../mapgen/kerbs.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, within, type Check, type Finding, type MetricReport } from "./types.ts";

/** A piece of stage FURNITURE, as the rank sees it: a segment on the ground
 * with a thickness. A marker post is a segment of zero length; a barrier
 * across a branch is a segment as wide as the road it shuts. Both are the
 * same question — how near does this thing come to a ball on the mat — and
 * a point-and-radius cannot ask it of a line without either missing the
 * ends or inventing a circle the size of the road. */
type Furniture = {
  kind: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** How far the thing sticks out from that line, m. */
  radius: number;
};

/** Everything standing on the stage that the terrain field does not place:
 * the barriers shutting the abandoned branches (R17) and the marker posts
 * down the verge (R26). The anti-cut BLOCKS are left out on purpose — R26
 * lays them at an apex to be felt by a car cutting it, so a block inside
 * the mat is the design and not a defect. */
function roadFurniture(track: Track): Furniture[] {
  const out: Furniture[] = [];
  for (const spur of track.spurs) {
    const block = spur.block;
    if (!block) continue;
    const rx = Math.cos(block.heading) * (block.width / 2);
    const rz = -Math.sin(block.heading) * (block.width / 2);
    out.push({
      kind: `${block.kind} barrier`,
      ax: block.x - rx,
      az: block.z - rz,
      bx: block.x + rx,
      bz: block.z + rz,
      radius: ANALYSIS.rollers.blockDepth,
    });
  }
  const kerbs = createKerbField(track);
  for (const marker of markersBetween(kerbs, 0, Infinity)) {
    if (marker.kind !== "post") continue;
    out.push({
      kind: "marker post",
      ax: marker.x,
      az: marker.z,
      bx: marker.x,
      bz: marker.z,
      radius: KERB_MARKER.post.width / 2,
    });
  }
  return out;
}

/** The nearest point of a piece of furniture to a probe, and how far off it
 * is. */
function nearestOn(thing: Furniture, x: number, z: number): { x: number; z: number; d: number } {
  const dx = thing.bx - thing.ax;
  const dz = thing.bz - thing.az;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((x - thing.ax) * dx + (z - thing.az) * dz) / len2)) : 0;
  const px = thing.ax + dx * t;
  const pz = thing.az + dz * t;
  return { x: px, z: pz, d: Math.hypot(px - x, pz - z) };
}

/** One ball's contact at one stride. */
type Contact = {
  s: number;
  /** Which track sample the stride was taken at. Carried rather than
   * recovered from `s`: sample spacing is only approximately `track.step`,
   * so dividing back lands several samples out by the end of a long stage
   * — and a ford is only a few samples wide. */
  index: number;
  x: number;
  z: number;
  /** Surface height the ball rests on, m. */
  y: number;
  /** What the road's own cross-section says should be there, m — null off
   * the ribbon, where there is no road shape to compare against. */
  want: number | null;
};

/** Where the rank's lanes sit, in signed meters from the centerline. */
function laneOffsets(half: number): number[] {
  const reach = half + ANALYSIS.rollers.verge;
  const spacing = ANALYSIS.rollers.spacing;
  const perSide = Math.ceil(reach / spacing);
  const lanes: number[] = [];
  for (let i = -perSide; i <= perSide; i++) lanes.push(i * spacing);
  return lanes;
}

/** True where a lane is on the DRIVEN ribbon — the mat and the shoulder
 * the road mesh draws — rather than out on the landscape. The tolerances
 * either side of this line are different by a factor of three, because so
 * are the two surfaces' jobs. */
function onRibbon(lateral: number, half: number): boolean {
  return Math.abs(lateral) <= half + ROAD_CROSS.reach;
}

/** Strides where the surface is a FEATURE rather than a road: the jump lip
 * itself and the ground it throws the car over. R6 owns whether a jump is
 * placed legally; the roller has nothing useful to say about a drop that
 * is the entire point. */
function jumpMask(track: Track): boolean[] {
  const mask = new Array<boolean>(track.samples.length).fill(false);
  const span = Math.ceil(ANALYSIS.rollers.jumpSkip / track.step);
  for (let i = 0; i < track.samples.length; i++) {
    if (!track.samples[i].jump) continue;
    for (let k = Math.max(0, i - 2); k <= Math.min(mask.length - 1, i + span); k++) {
      mask[k] = true;
    }
  }
  return mask;
}

/** Roll the rank down the stage and score what it finds. */
export function analyzeRollers(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const half = track.width / 2;
  const lanes = laneOffsets(half);
  const stride = Math.max(1, ANALYSIS.sampling.stride);
  const skip = jumpMask(track);

  // The rank's whole field of contacts: lane-major, so a lane's profile is
  // contiguous and the along-lane walk reads it in order.
  const rank: Contact[][] = lanes.map(() => []);
  for (let i = 0; i < track.samples.length; i += stride) {
    if (skip[i]) continue;
    const sample: TrackSample = track.samples[i];
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    for (let k = 0; k < lanes.length; k++) {
      const lateral = lanes[k];
      const x = sample.x + rx * lateral;
      const z = sample.z + rz * lateral;
      rank[k].push({
        s: sample.s,
        index: i,
        x,
        z,
        y: terrain.groundAt(x, z),
        want: onRibbon(lateral, half)
          ? sample.elevation + corridorOffset(sample, lateral, track.width)
          : null,
      });
    }
  }

  const probes = rank.reduce((sum, lane) => sum + lane.length, 0);

  // ── ALONG each lane: grade, and the bumps a grade check cannot see ────
  let steps = 0;
  let breaks = 0;
  let bumps = 0;
  let worstGrade = 0;
  let worstBump = 0;
  let strides = 0;
  for (let k = 0; k < lanes.length; k++) {
    const mat = onRibbon(lanes[k], half);
    const limit = mat ? ANALYSIS.rollers.grade.mat : ANALYSIS.rollers.grade.verge;
    const broken = mat ? ANALYSIS.rollers.gradeFail.mat : ANALYSIS.rollers.gradeFail.verge;
    const bumpLimit = mat ? ANALYSIS.rollers.bump.mat : ANALYSIS.rollers.bump.verge;
    const lane = rank[k];
    for (let i = 1; i < lane.length; i++) {
      const run = Math.abs(lane[i].s - lane[i - 1].s);
      if (run < 1e-3) continue;
      strides++;
      const grade = Math.abs(lane[i].y - lane[i - 1].y) / run;
      if (grade > limit) {
        steps++;
        if (grade > broken) breaks++;
        if (grade > worstGrade) {
          worstGrade = grade;
          findings.push({
            code: "rollers.grade",
            severity: grade > broken ? "error" : "warn",
            message: `a ${(grade * run).toFixed(2)} m step over ${run.toFixed(0)} m ${
              mat ? "on the road" : "on the verge"
            } (${lanes[k].toFixed(1)} m off the centerline)`,
            at: { x: lane[i].x, z: lane[i].z },
            s: lane[i].s,
            value: grade,
          });
        }
      }
      if (i + 1 >= lane.length) continue;
      // A hollow or a pimple: the middle contact off the line its two
      // neighbours draw. Both its slopes can be legal and the wheel still
      // leaves the ground over it.
      const bump = Math.abs(lane[i - 1].y - 2 * lane[i].y + lane[i + 1].y);
      if (bump > bumpLimit) {
        bumps++;
        if (bump > worstBump) {
          worstBump = bump;
          findings.push({
            code: "rollers.bump",
            severity: "warn",
            message: `a ${bump.toFixed(2)} m bump ${mat ? "on the road" : "on the verge"} (${lanes[
              k
            ].toFixed(1)} m off the centerline)`,
            at: { x: lane[i].x, z: lane[i].z },
            s: lane[i].s,
            value: bump,
          });
        }
      }
    }
  }

  // ── ACROSS the rank: what is left when the road's own shape is taken
  // out. Balls whose gap is narrower than a contact patch are bridged, so
  // only a step that survives two lanes counts.
  let walls = 0;
  let pairs = 0;
  let worstCross = 0;
  const diameter = ANALYSIS.rollers.radius * 2;
  const bridged = ANALYSIS.rollers.spacing < diameter;
  for (let k = 1; k < lanes.length; k++) {
    const mat = onRibbon(lanes[k], half) && onRibbon(lanes[k - 1], half);
    // A step is an ERROR only where the car is meant to be — on the mat
    // itself. Out on the shoulder and past it the ribbon is handing over to
    // the ground lattice, and the seam between two surfaces sampled 14 m
    // apart is a place to keep an eye on, not a hole in the road.
    const driven = Math.abs(lanes[k]) <= half && Math.abs(lanes[k - 1]) <= half;
    const limit = mat ? ANALYSIS.rollers.cross.mat : ANALYSIS.rollers.cross.verge;
    const a = rank[k - 1];
    const b = rank[k];
    for (let i = 0; i < a.length && i < b.length; i++) {
      pairs++;
      // Subtract the cross-section the road is SUPPOSED to have there, so
      // the camber, the wheel tracks and the bank all cancel and the
      // residual is only what nobody asked for.
      const modelled =
        a[i].want !== null && b[i].want !== null
          ? (b[i].want as number) - (a[i].want as number)
          : 0;
      const step = Math.abs(b[i].y - a[i].y - modelled);
      if (step <= limit) continue;
      // The ball bridges: a step this narrow is one the wheel rolls over.
      const wide =
        !bridged ||
        (k + 1 < lanes.length && Math.abs(rank[k + 1][i].y - b[i].y) < limit) ||
        (k >= 2 && Math.abs(a[i].y - rank[k - 2][i].y) < limit);
      if (!wide) continue;
      walls++;
      if (step > worstCross) {
        worstCross = step;
        findings.push({
          code: "rollers.cross",
          severity: driven ? "error" : "warn",
          message: `a ${step.toFixed(2)} m step across the rank ${
            driven ? "on the road" : "beside it"
          }, ${lanes[k].toFixed(1)} m off the centerline`,
          at: { x: b[i].x, z: b[i].z },
          s: b[i].s,
          value: step,
        });
      }
    }
  }

  // ── What the rank HITS. On the mat nothing stands at all — SOLID OR NOT.
  //
  // The "or not" is the half that was missing, and it cost a third of every
  // stage's junctions. A thing the car passes through still tells the
  // driver something, and a barrier laid across the road the stage takes
  // says the exact opposite of what it was put there to say. So the
  // population is everything that stands ON a stage rather than everything
  // the contact model knows about: the wild's solids and trunks, the
  // barriers shutting the abandoned branches (R17), and the marker posts
  // down the verge (R26).
  //
  // Two exemptions, both deliberate furniture rather than accidents: a
  // parapet is the one wall on a stage that is there on purpose (R13), and
  // an anti-cut block is laid at an apex precisely to be felt by a car
  // cutting it (R26) — flagging either would be the analyzer reporting the
  // design.
  let blocked = 0;
  let checkedMat = 0;
  let worstBlock = 0;
  const standing = roadFurniture(track);
  for (let k = 0; k < lanes.length; k++) {
    if (!onRibbon(lanes[k], half)) continue;
    const inMat = Math.abs(lanes[k]) <= half;
    if (!inMat) continue;
    for (const contact of rank[k]) {
      checkedMat++;
      const hits: { kind: string; x: number; z: number; gap: number }[] = [];
      for (const solid of [
        ...terrain.obstaclesNear(contact.x, contact.z, ANALYSIS.rollers.radius),
        ...terrain.treesNear(contact.x, contact.z, ANALYSIS.rollers.radius),
      ]) {
        hits.push({
          kind: solid.kind,
          x: solid.x,
          z: solid.z,
          gap:
            Math.hypot(solid.x - contact.x, solid.z - contact.z) -
            solid.radius -
            ANALYSIS.rollers.radius,
        });
      }
      for (const thing of standing) {
        const near = nearestOn(thing, contact.x, contact.z);
        hits.push({
          kind: thing.kind,
          x: near.x,
          z: near.z,
          gap: near.d - thing.radius - ANALYSIS.rollers.radius,
        });
      }
      for (const hit of hits) {
        if (hit.gap >= 0) continue;
        blocked++;
        if (-hit.gap > worstBlock) {
          worstBlock = -hit.gap;
          findings.push({
            code: "rollers.clear",
            severity: "error",
            message: `a ${hit.kind} stands ${(-hit.gap).toFixed(2)} m into the road`,
            at: { x: hit.x, z: hit.z },
            s: contact.s,
            value: -hit.gap,
          });
        }
      }
    }
  }

  // ── ...and what it drives INTO. Standing water over the driving surface
  // is a ford or a drowned road, and only one of those was designed.
  let drowned = 0;
  let worstDepth = 0;
  for (let k = 0; k < lanes.length; k++) {
    if (Math.abs(lanes[k]) > half) continue;
    for (const contact of rank[k]) {
      const water = terrain.waterAt(contact.x, contact.z);
      if (water === null) continue;
      const sample = track.samples[contact.index];
      if (sample.surface === "water" || sample.deck !== null) continue;
      const depth = water - contact.y;
      if (depth <= 0.15) continue;
      drowned++;
      if (depth > worstDepth) {
        worstDepth = depth;
        findings.push({
          code: "rollers.dry",
          severity: "error",
          message: `${depth.toFixed(2)} m of water standing on road that is not a crossing`,
          at: { x: contact.x, z: contact.z },
          s: contact.s,
          value: depth,
        });
      }
    }
  }

  // ── THE ROAD'S EDGE. R16 — a gravel road does not END, it RUNS OUT, and
  // the one thing it may never do is stop at a wall.
  //
  // This is its own check rather than a corner of the cross-section one
  // because it is its own property, and because it is the property with a
  // photograph attached: every screenshot of the road taken from beside it
  // showed a dark vertical face running the length of the stage, and the
  // instrument that should have found it was scoring the whole verge
  // together and reporting a warning nobody could act on.
  //
  // What is measured is the GRADE the ground takes across the corridor's
  // outer band — from the bare shoulder to the lip where the ribbon and the
  // ground lattice meet — on both sides of every sample. A road's edge falls
  // away; that is what an edge is. What it may not do is fall away faster
  // than a car could drive back up it, which is exactly the bar R31 already
  // sets for the ground rising beside a road (`verge.climb`), read the other
  // way round. Signed, and the sign is kept in the message: a road standing
  // on a wall and a road cut into one look nothing alike and are two
  // different things to go and fix.
  let edgesChecked = 0;
  let edgeFaces = 0;
  let worstEdge = 0;
  {
    const band = ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo;
    for (let i = 0; i < track.samples.length; i += stride) {
      if (skip[i]) continue;
      const sample = track.samples[i];
      // A deck has no edge to run out at: it is a road over a ravine, and
      // the drop off the side of it is a parapet's problem (R13).
      if (sample.deck != null) continue;
      const rx = Math.cos(sample.heading);
      const rz = -Math.sin(sample.heading);
      const hereHalf = sample.width / 2;
      for (const side of [-1, 1]) {
        edgesChecked++;
        const hem = (hereHalf + ROAD_CROSS.verge.bareTo) * side;
        const lip = (hereHalf + ROAD_CROSS.reach) * side;
        const inner = terrain.groundAt(sample.x + rx * hem, sample.z + rz * hem);
        const outer = terrain.groundAt(sample.x + rx * lip, sample.z + rz * lip);
        const grade = (inner - outer) / band;
        if (Math.abs(grade) <= ANALYSIS.rollers.edge.grade) continue;
        edgeFaces++;
        if (Math.abs(grade) <= Math.abs(worstEdge)) continue;
        worstEdge = grade;
        findings.push({
          code: "rollers.edge",
          severity: Math.abs(grade) >= ANALYSIS.rollers.edge.fail ? "error" : "warn",
          message: `the road's edge ${grade > 0 ? "drops away from" : "is walled in beside"} the mat at ${Math.abs(grade).toFixed(2)} m/m over its outer band`,
          at: { x: sample.x + rx * lip, z: sample.z + rz * lip },
          s: sample.s,
          value: Math.abs(grade),
        });
      }
    }
  }

  // ── HOW ROUGH, AND HOW WIDE. Both bands rather than ceilings, because
  // both have a right amount: a road with no texture and a corridor of
  // unvarying width are not clean results, they are the tells that nobody
  // built this. See `ANALYSIS.rollers.texture`.
  //
  // ── R33 — THE BUMPS, and the tarmac's lack of them.
  //
  // Two different questions, because the two surfaces are built differently.
  // Gravel is bladed and then worn, so it should have defects HERE AND
  // THERE: what is measured is how OFTEN, not how much on average — an
  // average is exactly the wrong statistic for something sparse, because a
  // road with one pothole and a road with a continuous ripple of the same
  // energy average the same and are nothing alike. Tarmac is laid, so what
  // is measured there is simply whether anything is on it at all.
  //
  // Measured on the samples rather than on the rank: the rank strides every
  // `stride` samples, which at the default is 4 m, and a bump is 3–8 m long
  // — coarse enough to skip one entirely or to clip its shoulder and call
  // it a step. Anything measuring a surface has to sample it at the
  // surface's own resolution. Along a lane the ribbon is the sample
  // elevation plus a cross-section offset that does not vary with arc
  // position, and a second difference cancels that offset outright, so the
  // elevation profile IS the surface profile and no probes are needed.
  //
  // A second difference is also a high-pass filter: it cancels any constant
  // slope and any constant curvature, so hills, ramps, crests and banked
  // corners all vanish and what is left is the surface.
  const T = ANALYSIS.rollers;
  let gravelRun = 0;
  let bumpCount = 0;
  let inBump = false;
  let worstBump2 = 0;
  const gravelD2: number[] = [];
  const sealedD2: number[] = [];
  for (let i = 1; i + 1 < track.samples.length; i++) {
    const here = track.samples[i];
    if (skip[i] || here.deck !== null || here.surface === "water") {
      inBump = false;
      continue;
    }
    const d2 = Math.abs(
      track.samples[i - 1].elevation - 2 * here.elevation + track.samples[i + 1].elevation,
    );
    const run = Math.abs(track.samples[i + 1].s - track.samples[i - 1].s) / 2;
    if (here.surface === "asphalt") {
      sealedD2.push(d2);
      inBump = false;
      continue;
    }
    gravelRun += run;
    gravelD2.push(d2);
    if (d2 > worstBump2) worstBump2 = d2;
    // One BUMP is one run of samples over the threshold, not one sample:
    // a bump is several metres long and spans several of them.
    if (d2 > T.bumpFloor) {
      if (!inBump) bumpCount++;
      inBump = true;
    } else {
      inBump = false;
    }
  }
  const perKm = gravelRun > 0 ? bumpCount / (gravelRun / 1000) : 0;

  /** The MEDIAN, not the worst. Both surfaces carry the rolling profile's
   * own curvature — the hills the road is laid over — and a single crest
   * dominates a maximum, so a worst-case comparison measures the terrain
   * rather than the surface. The median is what the road is USUALLY doing,
   * and the bumps only move the gravel's. */
  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const gravelTypical = median(gravelD2);
  const sealedTypical = median(sealedD2);
  // Reported, NOT scored. The obvious check here — "the sealed road is
  // smoother than the gravel" — cannot be measured this way: both surfaces
  // sit on the same rolling hills, and which of them happens to have been
  // laid over the hillier ground is a property of the seed rather than of
  // either surface. On one seed in three the tarmac comes out the rougher
  // of the two for exactly that reason, and a check that fires on a third
  // of all stages for something neither surface did wrong is worse than no
  // check at all.
  //
  // The claim it was reaching for — that R33 adds nothing to sealed road or
  // to a bridge deck — is true BY CONSTRUCTION and pinned where a
  // by-construction claim belongs: `tests/analysis_test.ts` asserts that
  // nothing the size of an authored bump appears on either.
  const sealedRatio = gravelTypical > 0 ? sealedTypical / gravelTypical : 0;

  if (gravelRun > 0 && perKm < T.bumpy.min) {
    findings.push({
      code: "rollers.bumpy",
      severity: "warn",
      message: `${perKm.toFixed(
        1,
      )} bumps per km of gravel — a bladed road that has never been driven on`,
      value: T.bumpy.min - perKm,
    });
  } else if (perKm > T.bumpy.max) {
    findings.push({
      code: "rollers.bumpy",
      severity: "warn",
      message: `${perKm.toFixed(1)} bumps per km of gravel — that is a washboard, not a road`,
      value: perKm - T.bumpy.max,
    });
  }

  // The RIDEABLE corridor: at each stride, how far either side of the
  // centre the rank keeps finding ground a car could be on. A lane stops
  // counting at the first one that is a wall, a hole, under water or has
  // something solid standing in it — which is what "how much road is there"
  // actually means to a driver.
  const widths: number[] = [];
  const centre = (lanes.length - 1) / 2;
  const strideCount = rank[0]?.length ?? 0;
  for (let i = 0; i < strideCount; i++) {
    const rideable = (step: number): number => {
      let out = 0;
      for (let k = Math.round(centre) + step; k >= 0 && k < lanes.length; k += step) {
        const a = rank[k][i];
        const b = rank[k - step][i];
        if (!a || !b) break;
        const mat = Math.abs(lanes[k]) <= half && Math.abs(lanes[k - step]) <= half;
        const limit = mat ? ANALYSIS.rollers.cross.mat : ANALYSIS.rollers.cross.verge;
        const modelled =
          a.want !== null && b.want !== null ? (b.want as number) - (a.want as number) : 0;
        if (Math.abs(a.y - b.y - modelled) > limit) break;
        const water = terrain.waterAt(a.x, a.z);
        if (water !== null && water - a.y > 0.15) break;
        if (terrain.obstaclesNear(a.x, a.z, ANALYSIS.rollers.radius).length > 0) break;
        out += ANALYSIS.rollers.spacing;
      }
      return out;
    };
    widths.push(rideable(1) + rideable(-1));
  }
  const corridor = widths.length > 0 ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
  const spread =
    widths.length > 1
      ? Math.sqrt(
          widths.reduce((sum, w) => sum + (w - corridor) * (w - corridor), 0) / widths.length,
        )
      : 0;

  if (spread < ANALYSIS.rollers.varies.min) {
    findings.push({
      code: "rollers.varies",
      severity: "note",
      message: `the rideable corridor is ${corridor.toFixed(1)} m wide from end to end (±${spread.toFixed(
        1,
      )} m) — a road that never pinches or opens out`,
      value: ANALYSIS.rollers.varies.min - spread,
    });
  }

  const tolerated = ANALYSIS.rollers.tolerated;
  const checks: Check[] = [
    {
      id: "grade",
      label: "no step the wheel meets as an edge",
      score: rate(steps + breaks * 4, Math.max(1, strides), tolerated),
      weight: 2,
      value: worstGrade,
      budget: ANALYSIS.rollers.grade.mat,
    },
    {
      id: "cross",
      label: "no wall or trench across the corridor",
      score: rate(walls, Math.max(1, pairs), tolerated),
      weight: 2,
      value: worstCross,
      budget: ANALYSIS.rollers.cross.mat,
    },
    {
      id: "bump",
      label: "no hollow the road did not ask for",
      score: rate(bumps, Math.max(1, strides), tolerated),
      weight: 1,
      value: worstBump,
      budget: ANALYSIS.rollers.bump.mat,
    },
    {
      id: "clear",
      label: "nothing standing in the road the stage takes, solid or not",
      score: rate(blocked, Math.max(1, checkedMat)),
      weight: 2,
      value: worstBlock,
    },
    {
      id: "edge",
      label: "the road's edge runs out into the ground rather than stopping at a wall",
      score: rate(edgeFaces, Math.max(1, edgesChecked), ANALYSIS.rollers.tolerated),
      weight: 1.5,
      value: Math.abs(worstEdge),
      budget: ANALYSIS.rollers.edge.grade,
    },
    {
      // R33 — a BAND, not a ceiling. A gravel road with NO bumps is a
      // ribbon nobody drove on, and perfect is a defect.
      id: "bumpy",
      label: "the gravel has bumps here and there, and is not a washboard",
      score: gravelRun > 0 ? within(perKm, T.bumpy, T.bumpySlack) : 1,
      weight: 1.5,
      value: perKm,
    },
    {
      // R21 — the road's own width, banded at both ends: a lane with no
      // room to place the car and a boulevard where nothing is a
      // commitment are both wrong, in opposite directions.
      id: "width",
      label: "the road is wide enough to drive and narrow enough to matter",
      score: within(track.width, ANALYSIS.rollers.width, ANALYSIS.rollers.widthSlack),
      weight: 1,
      value: track.width,
    },
    {
      id: "varies",
      label: "the corridor pinches and opens out along the stage",
      score: within(spread, ANALYSIS.rollers.varies, ANALYSIS.rollers.variesSlack),
      weight: 1,
      value: spread,
    },
    {
      id: "dry",
      label: "no water on road that is not a crossing",
      score: rate(drowned, Math.max(1, checkedMat)),
      weight: 1.5,
      value: worstDepth,
    },
  ];

  return {
    id: "rollers",
    label: "road surface",
    score: metricScore(checks),
    weight: ANALYSIS.weights.rollers,
    checks,
    findings,
    stats: {
      lanes: lanes.length,
      probes,
      steps,
      breaks,
      bumps,
      walls,
      blocked,
      drowned,
      edgeFaces,
      worstEdge,
      worstGrade,
      worstCross,
      bumpsPerKm: perKm,
      worstBump: worstBump2,
      sealedRatio,
      gravelTypical,
      sealedTypical,
      gravelRun,
      corridor,
      corridorVaries: spread,
    },
    ms: Date.now() - started,
  };
}
