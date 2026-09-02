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
import { isLoose, type Track, type TrackSample } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { createKerbField, KERB_MARKER, markersBetween } from "../mapgen/kerbs.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
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
  /** R33 — whether this contact is on the DRIVEN ribbon, decided against
   * the road's width HERE. The lane grid is laid once on the stage's
   * nominal width, but a gravel road is not that width: it is cut tighter
   * and opens out at the corners, so one lane is mat down a bend and verge
   * down the straight either side of it. Deciding per lane instead scores
   * the verge at the mat's tolerance for a third of the stage. */
  mat: boolean;
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

/** R36 — strides on a LEVEL CROSSING's ramps: the road climbing onto the
 * public road's formation and dropping off the far side.
 *
 * Its own mask, and NOT folded into `jumpMask`, because the two questions a
 * roller asks about this ground want opposite answers. How rough is the
 * SURFACE (R33) must not read it: a ramp is a shape somebody graded, and
 * measured as grain it is a bump forty times the floor on every crossing on
 * every seed — the instrument reporting the design. How the ground BESIDE
 * the road behaves (R31's seam and edge) must still read it: a crossing
 * stands on an embankment, an embankment has a rim, and whether that rim is
 * a hillside or a face is exactly what the rank is for. Skip it there and
 * the one shape on a stage most likely to be a wall is the one shape
 * nothing measures. */
function rampMask(track: Track): boolean[] {
  const mask = new Array<boolean>(track.samples.length).fill(false);
  for (const junction of track.junctions) {
    if (!junction.crossing) continue;
    const reach = 0.72 * junction.spread + STAGE_RULES.crossing.ramp;
    for (let i = 0; i < track.samples.length; i++) {
      if (Math.abs(track.samples[i].s - junction.s) <= reach) mask[i] = true;
    }
  }
  return mask;
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
  const ramps = rampMask(track);

  // The rank's whole field of contacts: lane-major, so a lane's profile is
  // contiguous and the along-lane walk reads it in order.
  const rank: Contact[][] = lanes.map(() => []);
  for (let i = 0; i < track.samples.length; i += stride) {
    if (skip[i]) continue;
    const sample: TrackSample = track.samples[i];
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    // R33 — the road AS IT IS HERE, which is the width the terrain field
    // laid its shelf at. Measuring the modelled cross-section against the
    // stage's nominal instead reports the difference between the two as a
    // wall down the side of every stretch the blade cut narrow.
    const hereHalf = sample.width / 2;
    for (let k = 0; k < lanes.length; k++) {
      const lateral = lanes[k];
      const x = sample.x + rx * lateral;
      const z = sample.z + rz * lateral;
      const mat = onRibbon(lateral, hereHalf);
      rank[k].push({
        s: sample.s,
        index: i,
        x,
        z,
        y: terrain.groundAt(x, z),
        want: mat ? sample.elevation + corridorOffset(sample, lateral, sample.width) : null,
        mat,
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
    const lane = rank[k];
    for (let i = 1; i < lane.length; i++) {
      const run = Math.abs(lane[i].s - lane[i - 1].s);
      if (run < 1e-3) continue;
      strides++;
      // The stricter tolerance applies where the car is meant to be, and
      // that is a question about the road HERE (R33) rather than about the
      // lane this contact happens to sit in.
      const mat = lane[i].mat;
      const limit = mat ? ANALYSIS.rollers.grade.mat : ANALYSIS.rollers.grade.verge;
      const broken = mat ? ANALYSIS.rollers.gradeFail.mat : ANALYSIS.rollers.gradeFail.verge;
      const bumpLimit = mat ? ANALYSIS.rollers.bump.mat : ANALYSIS.rollers.bump.verge;
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
    const a = rank[k - 1];
    const b = rank[k];
    for (let i = 0; i < a.length && i < b.length; i++) {
      pairs++;
      const mat = a[i].mat && b[i].mat;
      // A step is an ERROR only where the car is meant to be — on the mat
      // itself. Out on the shoulder and past it the ribbon is handing over
      // to the ground lattice, and the seam between two surfaces sampled
      // 14 m apart is a place to keep an eye on, not a hole in the road.
      const localHalf = track.samples[b[i].index].width / 2;
      const driven = Math.abs(lanes[k]) <= localHalf && Math.abs(lanes[k - 1]) <= localHalf;
      const limit = mat ? ANALYSIS.rollers.cross.mat : ANALYSIS.rollers.cross.verge;
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
    // The rank's lanes are laid on the NOMINAL half-width, which is the
    // one width the road mostly is not: R33 wanders it either side down
    // the whole stage and a junction's mouth flares it. So whether a lane
    // is on the mat is asked per sample, against the road as it is THERE.
    //
    // It matters because a kerb marker is planted off the local edge
    // (kerbs.ts places it that way, deliberately and for the same reason).
    // Judged against the nominal edge instead, a post standing properly
    // out in the verge reads as standing in the road wherever the road has
    // pinched in under its nominal — which is a finding about the ruler,
    // not about the stage.
    if (Math.abs(lanes[k]) > half + ROAD_CROSS.reach) continue;
    for (const contact of rank[k]) {
      const localHalf = (track.samples[contact.index].width ?? track.width) / 2;
      if (Math.abs(lanes[k]) > localHalf) continue;
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
  //
  // ── ...AND THE SEAM IN IT. A STEP IS NOT A SLOPE, and the grade above
  // cannot tell them apart: it is one measurement across the whole band, so
  // a road falling four metres down a hillside and a road with a knee-high
  // face at its lip read the same number, and only one of them is a defect.
  //
  // What draws a LINE beside a road is the second kind — a kink, where one
  // stride across the band departs from what the strides either side of it
  // are doing. So the band is walked in short strides and what is scored is
  // the worst SECOND DIFFERENCE: a fall of any steepness reads zero as long
  // as it is straight, and a face reads its own height.
  //
  // On a healthy stage this measures a few millimetres (a hundred of them
  // at the very worst), and that is the point — it is a TRIPWIRE, not a
  // survey. Everything that meets at this seam is authored somewhere else:
  // the hand-over curve, the verge profile, how far under the ribbon the
  // ground tiles are pinned, the streams carved through it, the guards
  // raised beside it. Any one of them moving can leave a step here, and a
  // step here is a dirt-coloured stripe running the length of every stage.
  let edgesChecked = 0;
  let edgeFaces = 0;
  let worstEdge = 0;
  let seams = 0;
  let worstSeam = 0;
  {
    const band = ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo;
    const strides = Math.max(2, Math.round(band / ANALYSIS.rollers.seam.stride));
    const profile: number[] = [];
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
        const lip = (hereHalf + ROAD_CROSS.reach) * side;
        profile.length = 0;
        for (let k = 0; k <= strides; k++) {
          const out = ROAD_CROSS.verge.bareTo + (band * k) / strides;
          const lat = (hereHalf + out) * side;
          profile.push(terrain.groundAt(sample.x + rx * lat, sample.z + rz * lat));
        }
        const grade = (profile[0] - profile[strides]) / band;
        let kink = 0;
        for (let k = 1; k < strides; k++) {
          const bend = Math.abs(profile[k] - (profile[k - 1] + profile[k + 1]) / 2);
          if (bend > kink) kink = bend;
        }
        if (kink > ANALYSIS.rollers.seam.kink) {
          seams++;
          if (kink > worstSeam) {
            worstSeam = kink;
            findings.push({
              code: "rollers.seam",
              severity: kink >= ANALYSIS.rollers.seam.fail ? "error" : "warn",
              message: `a ${kink.toFixed(2)} m step in the road's edge where it should run out smoothly`,
              at: { x: sample.x + rx * lip, z: sample.z + rz * lip },
              s: sample.s,
              value: kink,
            });
          }
        }
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
  /** Arc position the last over-floor sample was at, m — how a bump is
   * separated from the NEXT bump rather than from its own middle. */
  let bumpEnd = -Infinity;
  let worstBump2 = 0;
  const gravelD2: number[] = [];
  const sealedD2: number[] = [];
  for (let i = 1; i + 1 < track.samples.length; i++) {
    const here = track.samples[i];
    // R36 — and a crossing's ramps, which are a graded shape rather than a
    // rough surface (`rampMask`). Only here: the seam and edge checks above
    // keep reading them, because the embankment's rim is theirs to judge.
    if (skip[i] || ramps[i] || here.deck !== null || here.surface === "water") {
      bumpEnd = -Infinity;
      continue;
    }
    const d2 = Math.abs(
      track.samples[i - 1].elevation - 2 * here.elevation + track.samples[i + 1].elevation,
    );
    const run = Math.abs(track.samples[i + 1].s - track.samples[i - 1].s) / 2;
    if (here.surface === "asphalt") {
      sealedD2.push(d2);
      bumpEnd = -Infinity;
      continue;
    }
    gravelRun += run;
    gravelD2.push(d2);
    if (d2 > worstBump2) worstBump2 = d2;
    if (d2 <= T.bumpFloor) continue;
    // One BUMP is one DEFECT, not one run of samples over the threshold,
    // and the difference bit as soon as R33's bumps grew long enough to
    // matter. A second difference reads the CURVATURE of the profile, and
    // a broad heave curves one way over its crown and the other way down
    // each flank — so it passes through zero twice on its way over, and a
    // run-based count reported the single frost heave a driver feels as
    // three bumps. A defect is therefore closed by CLEAN ROAD after it,
    // not by its own inflection: nothing inside `bumpGap` of the last
    // rough sample starts a new one.
    if (here.s - bumpEnd > T.bumpGap) bumpCount++;
    bumpEnd = here.s;
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
        const limit = a.mat && b.mat ? ANALYSIS.rollers.cross.mat : ANALYSIS.rollers.cross.verge;
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

  // ── R33 — THE MAT'S OWN WIDTH, on the gravel, as two questions.
  //
  // The corridor above is what the WORLD leaves the car: the forest and the
  // water crowding in and standing back. This is the ROAD — how wide the
  // blade actually cut it — and the two are different facts. A stage can
  // have a corridor that breathes and a mat ruled to one width from the
  // line to the flag, and that mat is the tell that nobody built this: a
  // dirt road is as tight as its traffic can live with and opens out where
  // something needed the room.
  //
  // Gravel only, because a paving machine lays a constant width and a
  // bridge deck is what it is. Measured as a share of the stage's NOMINAL
  // width, so the numbers mean the same thing at both ends of the `width`
  // dial. Junction mouths are left out: a mouth's flare is R17's and would
  // otherwise be counted here as the road opening out, which it is not.
  const cut: number[] = [];
  const bends: number[] = [];
  const runs: number[] = [];
  for (const sample of track.samples) {
    if (!isLoose(sample.surface) || sample.deck != null) continue;
    if ((sample.flat ?? 0) > 0.01 || (sample.shift ?? 0) !== 0) continue;
    const share = sample.width / track.width;
    cut.push(share);
    if (Math.abs(sample.curvature) > ANALYSIS.rollers.cornerAt) bends.push(share);
    else runs.push(share);
  }
  const mean = (xs: number[]): number =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const cutMean = mean(cut);
  // The standard deviation of the cut width, as a share of its own mean —
  // a road that swings a metre either side of eleven is doing something a
  // road that swings a metre either side of twenty is not.
  const cutSpread =
    cut.length > 1
      ? Math.sqrt(mean(cut.map((w) => (w - cutMean) * (w - cutMean)))) / Math.max(1e-6, cutMean)
      : 0;
  // How much wider a bend is cut than the straights either side of it, as a
  // share of the straights — the room a drift is given.
  const opening = runs.length > 0 && bends.length > 0 ? mean(bends) / mean(runs) - 1 : 0;
  if (cut.length > 0 && cutSpread < ANALYSIS.rollers.breathes.min) {
    findings.push({
      code: "rollers.breathes",
      severity: "note",
      message: `the gravel is cut to ${(cutMean * track.width).toFixed(1)} m the whole way (±${(
        cutSpread * 100
      ).toFixed(1)}%) — a road nobody bladed twice`,
      value: ANALYSIS.rollers.breathes.min - cutSpread,
    });
  }
  if (bends.length > 0 && opening < ANALYSIS.rollers.opens.min) {
    findings.push({
      code: "rollers.opens",
      severity: "note",
      message: `bends are only ${(opening * 100).toFixed(1)}% wider than the straights — nowhere to put a car sideways`,
      value: ANALYSIS.rollers.opens.min - opening,
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
      // R16 — and the seam itself: no STEP where the road hands over,
      // however steeply the country beside it happens to fall.
      id: "seam",
      label: "the road hands over to the country without a step in the seam",
      score: rate(seams, Math.max(1, edgesChecked), ANALYSIS.rollers.tolerated),
      weight: 1.5,
      value: worstSeam,
      budget: ANALYSIS.rollers.seam.kink,
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
      // R33 — and the MAT does too, which is a different claim: that one is
      // the world crowding the road, this one is the road itself.
      id: "breathes",
      label: "the gravel is cut wider in places and tighter in others",
      score: cut.length > 0 ? within(cutSpread, T.breathes, T.breathesSlack) : 1,
      weight: 1,
      value: cutSpread,
    },
    {
      // R33 — a BAND at both ends. A bend no wider than the straight is a
      // corner with nowhere to put the car; a bend twice as wide is a
      // lay-by with a curve in it.
      id: "opens",
      label: "the bends are cut wider than the straights, for the car to go sideways in",
      score: bends.length > 0 && runs.length > 0 ? within(opening, T.opens, T.opensSlack) : 1,
      weight: 1,
      value: opening,
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
      gravelWidth: cutMean * track.width,
      gravelVaries: cutSpread,
      bendOpening: opening,
    },
    ms: Date.now() - started,
  };
}
