// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE JUNCTIONS, judged as PLACES rather than as seams.
//
// A junction is the one spot on a stage where two roads have to agree with
// each other, and it is where a generated landscape gives itself away.
// Everything here is a defect somebody reported by pointing at a picture:
//
//   Grass between the two roads. Two ribbons laid over the same corner do
//   not meet — they overlap for a while and then peel apart, leaving a
//   wedge of country tapering to a knife point between them, or a stranded
//   island of it in the middle of the paving. A real junction has neither:
//   the mouth is one piece of ground, and what is not road is field, with
//   nothing in between.
//
//   A through road that stops being one. The sealed road runs STRAIGHT
//   THROUGH a junction — that is what makes it the main road and the other
//   one the minor road. Its centre line does not stop for fifty meters at
//   every crossing, and only the kerb the dirt road actually opens gives
//   way.
//
//   A junction nobody shut. The arm the stage does not take is a public
//   road going somewhere else, and the one thing standing between a driver
//   and it is a line of tape. Where that is missing the stage has two
//   equally plausible ways on at racing speed.
//
//   A shrub in the middle of the crossing. A junction's paving is wider
//   than the road that flares into it, and everything that decides where
//   the world's furniture stands measures against the road's NOMINAL width.
//   So the mouth is the one place on a stage where a tree can be planted on
//   the tarmac.
//
// The measurements are all of the RESULT — the road that got built, rasterized
// and swept — rather than of the generator's intention. A check that asks the
// junction whether it thinks it is a junction passes every seed.

import { SPUR } from "../mapgen/spurs.ts";
import type { RoadJunction, Track, TrackSample } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import {
  metricScore,
  rate,
  under,
  within,
  type Check,
  type Finding,
  type MetricReport,
} from "./types.ts";

/** A piece of road on the raster: where its centerline is and how wide the
 * mat is there. Both the route and the branches reduce to this, because the
 * question "is this ground road" does not care which road. */
type Mat = { x: number; z: number; half: number };

/** Everything paved within reach of a junction, at the resolution the
 * splinter sweep needs. Sampled finer than the road's own 2 m spacing would
 * give across its width — a mat is drawn as a disc per sample, so
 * consecutive discs have to overlap or the raster grows scallops along
 * every edge and reports them as bare ground. */
function matsNear(track: Track, junction: RoadJunction, reach: number): Mat[] {
  const out: Mat[] = [];
  const near = (x: number, z: number): boolean =>
    Math.abs(x - junction.x) <= reach && Math.abs(z - junction.z) <= reach;
  const push = (a: { x: number; z: number }, half: number): void => {
    if (near(a.x, a.z)) out.push({ x: a.x, z: a.z, half });
  };
  for (const sample of track.samples) push(sample, sample.width / 2);
  for (const spur of track.spurs) {
    for (const sample of spur.samples) push(sample, spur.width / 2);
  }
  return out;
}

/** How wide the bare ground is, in cells, through every bare cell of a
 * raster: a chamfer distance transform (the 3-4 kernel, so a diagonal costs
 * what a diagonal costs) over the cells that are not road. What comes back
 * is each bare cell's distance to the nearest paving — and the PEAK of that
 * over a connected patch of bare ground is half the patch's own thickness,
 * which is the number that separates a field from a splinter. */
function bareDepth(road: boolean[], w: number, h: number): number[] {
  const BIG = 1e6;
  const d = new Array<number>(w * h);
  for (let i = 0; i < d.length; i++) d[i] = road[i] ? 0 : BIG;
  const step = (i: number, from: number, cost: number): void => {
    const v = d[from] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x > 0) step(i, i - 1, 3);
      if (y > 0) step(i, i - w, 3);
      if (x > 0 && y > 0) step(i, i - w - 1, 4);
      if (x + 1 < w && y > 0) step(i, i - w + 1, 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x + 1 < w) step(i, i + 1, 3);
      if (y + 1 < h) step(i, i + w, 3);
      if (x + 1 < w && y + 1 < h) step(i, i + w + 1, 4);
      if (x > 0 && y + 1 < h) step(i, i + w - 1, 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** One patch of bare ground beside a junction: how many cells it covers,
 * how thick it gets, and where its middle is. */
type Patch = { cells: number; peak: number; x: number; z: number };

/** Every connected patch of bare ground on the raster, flood-filled
 * eight-ways so a diagonal thread of grass counts as one thing rather than
 * as a row of islands. */
function barePatches(
  road: boolean[],
  depth: number[],
  w: number,
  h: number,
  originX: number,
  originZ: number,
  cell: number,
): Patch[] {
  const seen = new Uint8Array(w * h);
  const patches: Patch[] = [];
  const queue: number[] = [];
  for (let start = 0; start < road.length; start++) {
    if (road[start] || seen[start]) continue;
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    let cells = 0;
    let peak = 0;
    let sumX = 0;
    let sumZ = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % w;
      const y = (i / w) | 0;
      cells++;
      sumX += x;
      sumZ += y;
      if (depth[i] > peak) peak = depth[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (seen[k] || road[k]) continue;
          seen[k] = 1;
          queue.push(k);
        }
      }
    }
    patches.push({
      cells,
      peak: peak * cell,
      x: originX + (sumX / cells + 0.5) * cell,
      z: originZ + (sumZ / cells + 0.5) * cell,
    });
  }
  return patches;
}

/** How far off parallel two headings are, radians, folded into 0..π/2:
 * which way either road is pointing along its own line does not change the
 * angle the two of them cross at. */
function crossAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

export function analyzeJunctions(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const J = ANALYSIS.junctions;

  let standing = 0;
  let splinters = 0;
  let worstSplinter = 0;
  let detached = 0;
  let shut = 0;
  let offAngle = 0;
  let tightestAngle = Math.PI / 2;
  let brokenThrough = 0;
  let worstBreak = 0;

  for (let n = 0; n < track.junctions.length; n++) {
    const junction = track.junctions[n];
    const half = junction.width / 2;

    // ── Does the ground between the two roads make sense? ───────────────
    // The mouth, plus room around it for the open country to be recognized
    // as open country: a box that stops at the paving would report the
    // field beside the junction as one more sliver of grass.
    const reach = junction.reach + junction.width + J.margin;
    const cell = J.cell;
    const side = Math.ceil((2 * reach) / cell);
    const originX = junction.x - reach;
    const originZ = junction.z - reach;
    const mats = matsNear(track, junction, reach + junction.width);
    const road = new Array<boolean>(side * side).fill(false);
    for (const mat of mats) {
      const r = mat.half;
      const loX = Math.max(0, Math.floor((mat.x - r - originX) / cell));
      const hiX = Math.min(side - 1, Math.ceil((mat.x + r - originX) / cell));
      const loZ = Math.max(0, Math.floor((mat.z - r - originZ) / cell));
      const hiZ = Math.min(side - 1, Math.ceil((mat.z + r - originZ) / cell));
      for (let iz = loZ; iz <= hiZ; iz++) {
        const z = originZ + (iz + 0.5) * cell;
        for (let ix = loX; ix <= hiX; ix++) {
          const x = originX + (ix + 0.5) * cell;
          const dx = x - mat.x;
          const dz = z - mat.z;
          if (dx * dx + dz * dz <= r * r) road[iz * side + ix] = true;
        }
      }
    }
    const depth = bareDepth(road, side, side);
    const patches = barePatches(road, depth, side, side, originX, originZ, cell);
    // The mouth itself — past it the two roads have genuinely parted and
    // the country between them is country, which is not this check's
    // business.
    const mouthReach = junction.reach + junction.width;
    for (const patch of patches) {
      if (patch.peak * 2 >= J.splinterThick) continue;
      if (Math.hypot(patch.x - junction.x, patch.z - junction.z) > mouthReach) continue;
      const area = patch.cells * cell * cell;
      if (area < J.splinterArea) continue;
      splinters++;
      if (area > worstSplinter) worstSplinter = area;
      findings.push({
        code: "junctions.splinter",
        severity: "error",
        message: `${area.toFixed(0)} m² of grass ${(patch.peak * 2).toFixed(
          1,
        )} m across is stranded in junction ${n + 1} — two roads that met would have paved it`,
        at: { x: patch.x, z: patch.z },
        s: junction.s,
        value: area,
      });
    }

    // ── Is anything STANDING on the paving? ─────────────────────────────
    // Straight off the raster, which is the only description of a junction's
    // paved area that exists: everything that decides where a tree or a
    // boulder goes measures against the road's nominal width, and the mouth
    // is wider than that.
    const paved = (x: number, z: number): boolean => {
      const ix = Math.floor((x - originX) / cell);
      const iz = Math.floor((z - originZ) / cell);
      if (ix < 0 || iz < 0 || ix >= side || iz >= side) return false;
      return road[iz * side + ix];
    };
    for (const thing of [
      ...terrain.obstaclesNear(junction.x, junction.z, reach),
      ...terrain.treesNear(junction.x, junction.z, reach),
    ]) {
      if (!paved(thing.x, thing.z)) continue;
      standing++;
      findings.push({
        code: "junctions.clear",
        severity: "error",
        message: `something is standing on the paving of junction ${n + 1}, ${Math.hypot(
          thing.x - junction.x,
          thing.z - junction.z,
        ).toFixed(0)} m from the meeting point`,
        at: { x: thing.x, z: thing.z },
        s: junction.s,
        value: thing.radius,
      });
    }

    // ── Do the two roads actually TOUCH at the meeting point? ───────────
    const ix = Math.floor((junction.x - originX) / cell);
    const iz = Math.floor((junction.z - originZ) / cell);
    if (!road[iz * side + ix]) {
      detached++;
      findings.push({
        code: "junctions.detached",
        severity: "error",
        message: `junction ${n + 1} has no road standing on its own meeting point`,
        at: { x: junction.x, z: junction.z },
        s: junction.s,
      });
    }

    // ── At what angle does the dirt road arrive? ────────────────────────
    // Taken where the minor road's centerline crosses the main road's EDGE,
    // which is the place a driver turns in at. Two roads that share a
    // tangent there have not met: they have merged, and a merge with a
    // barrier across one arm is a slip road with a mistake on it.
    const nx = Math.cos(junction.heading);
    const nz = -Math.sin(junction.heading);
    // R36 — a CROSSING has the dirt road on BOTH sides, and both of them
    // have to arrive square. Measured on one side only, an arm that had
    // drifted off the square would be reported half the time and, on the
    // seeds where it drifted on the unmeasured side, never — and squareness
    // is the whole of what makes a crossing legal under R23.
    const sides: (1 | -1)[] = junction.crossing ? [1, -1] : [junction.joining ? -1 : 1];
    for (const side of sides) {
      let arrival: TrackSample | null = null;
      let nearest = Infinity;
      for (const sample of track.samples) {
        const d = (sample.s - junction.s) * side;
        if (d < 0 || d > J.approach || d >= nearest) continue;
        const across = Math.abs((sample.x - junction.x) * nx + (sample.z - junction.z) * nz);
        if (across < half) continue;
        nearest = d;
        arrival = sample;
      }
      if (!arrival) continue;
      const angle = crossAngle(arrival.heading, junction.heading);
      if (angle < tightestAngle) tightestAngle = angle;
      if (angle < J.angle.min) {
        offAngle++;
        findings.push({
          code: "junctions.angle",
          severity: "warn",
          message: `the dirt road ${junction.crossing ? "crosses" : "leaves"} ${
            junction.crossing ? "crossing" : "junction"
          } ${n + 1} at ${((angle * 180) / Math.PI).toFixed(0)}° to the tarmac — under ${(
            (J.angle.min * 180) /
            Math.PI
          ).toFixed(0)}° the two roads merge instead of meeting`,
          at: { x: arrival.x, z: arrival.z },
          s: junction.s,
          value: J.angle.min - angle,
        });
      }
    }

    // ── Does the sealed road run THROUGH, as sealed road? ───────────────
    // Both of its arms: the route's own collinear one, and the branch that
    // carries it on past the crossing. They are one road, and a junction is
    // a place the dirt road STOPS at — it must not run on underneath the
    // tarmac and come out the far side, which is what a surface change
    // painted across the minor road instead of along the main road's edge
    // does. Walked as a RUN out from the meeting point, so a band of gravel
    // that straddles it is measured as the one interruption a driver sees
    // rather than as two short ones.
    // R36 — AT A CROSSING THE THROUGH ROAD IS BOTH ARMS, and none of it is
    // the route. A junction's sealed road is half the rally's own line and
    // half a branch; a crossing's is entirely branch, because the rally
    // crosses it and keeps none of it. Walked from the meeting point
    // outward along each arm in turn, which is the same question asked of
    // the same road — and asked the junction's way instead it reports the
    // gravel the rally is on either side of the seal as a hundred metres of
    // unsealed main road, which is the one thing a crossing gets right by
    // construction.
    const throughRoad: { surface: string; step: number }[] = [];
    const arms = track.spurs.filter((spur) => spur.atS === junction.s);
    if (junction.crossing) {
      for (const arm of arms) {
        for (const sample of arm.samples) {
          if (sample.s > J.approach) break;
          throughRoad.push({ surface: sample.surface, step: SPUR.step });
        }
        // Each arm is its own run out of the crossing: a gap at the end of
        // one and a gap at the start of the next are two interruptions, not
        // one long one straddling the middle.
        throughRoad.push({ surface: "asphalt", step: 0 });
      }
    } else {
      for (const sample of track.samples) {
        if (Math.abs(sample.s - junction.s) > J.approach) continue;
        if (junction.joining ? sample.s < junction.s : sample.s > junction.s) continue;
        throughRoad.push({
          surface: sample.deck != null ? "asphalt" : sample.surface,
          step: track.step,
        });
      }
      // A joining junction's main arm runs away from it with rising `s` and
      // a parting one's with falling `s`, so only one of the two needs
      // turning round to be walked outward.
      if (junction.joining) throughRoad.reverse();
      const arm = arms[0];
      if (arm) {
        for (const sample of arm.samples) {
          if (sample.s > J.approach) break;
          throughRoad.push({ surface: sample.surface, step: SPUR.step });
        }
      }
    }
    let run = 0;
    let longest = 0;
    for (const sample of throughRoad) {
      run = sample.surface === "asphalt" ? 0 : run + sample.step;
      if (run > longest) longest = run;
    }
    if (longest > J.throughGap) {
      brokenThrough++;
      if (longest > worstBreak) worstBreak = longest;
      findings.push({
        code: "junctions.through",
        severity: "error",
        message: `${longest.toFixed(0)} m of the sealed road through junction ${
          n + 1
        } is not sealed — the dirt road stops at the tarmac, it does not run under it`,
        at: { x: junction.x, z: junction.z },
        s: junction.s,
        value: longest - J.throughGap,
      });
    }
  }

  // ── Is every arm the stage does not take shut? ─────────────────────────
  for (let i = 0; i < track.spurs.length; i++) {
    const spur = track.spurs[i];
    const block = spur.block;
    // R41 — a railway's arms are not shut, and are not roads to be shut:
    // nobody drives one, and the crossing is signed instead.
    if (spur.rail) continue;
    if (block && block.s <= SPUR.block.to) {
      shut++;
      continue;
    }
    findings.push({
      code: "junctions.open",
      severity: "error",
      message: block
        ? `branch ${i + 1} is not shut until ${block.s.toFixed(0)} m up it — out of sight of the junction`
        : `branch ${i + 1} is a public road left open at racing speed`,
      at: { x: spur.samples[0].x, z: spur.samples[0].z },
      s: spur.atS,
      value: block ? block.s - SPUR.block.to : SPUR.block.to,
    });
  }

  const count = Math.max(1, track.junctions.length);
  const checks: Check[] = [
    {
      id: "meet",
      label: "no grass stranded where two roads meet",
      score: rate(splinters, count),
      weight: 3,
      value: worstSplinter,
      budget: J.splinterArea,
    },
    {
      id: "detached",
      label: "the two roads touch at the meeting point",
      score: rate(detached, count),
      weight: 3,
      value: detached,
    },
    {
      id: "clear",
      label: "nothing stands on a junction's paving",
      score: rate(standing, Math.max(count, standing)),
      weight: 2.5,
      value: standing,
    },
    {
      id: "shut",
      label: "every abandoned arm is taped shut",
      score: rate(track.spurs.length - shut, Math.max(1, track.spurs.length)),
      weight: 2,
      value: track.spurs.length - shut,
    },
    {
      id: "angle",
      label: "the dirt road MEETS the tarmac instead of merging with it",
      score: within(tightestAngle, { min: J.angle.min, max: Math.PI / 2 }, J.angle.slack),
      weight: 1.5,
      value: (tightestAngle * 180) / Math.PI,
      budget: (J.angle.min * 180) / Math.PI,
    },
    {
      id: "through",
      label: "the sealed road runs through the crossing sealed",
      score: under(worstBreak, J.throughGap, J.throughGap * 4),
      weight: 1.5,
      value: worstBreak,
      budget: J.throughGap,
    },
  ];

  return {
    id: "junctions",
    label: "junctions",
    score: metricScore(checks),
    weight: ANALYSIS.weights.junctions,
    checks,
    findings,
    stats: {
      junctions: track.junctions.length,
      standing,
      splinters,
      detached,
      open: track.spurs.filter((s) => !s.rail).length - shut,
      tightestAngle: (tightestAngle * 180) / Math.PI,
      worstMarkGap: worstBreak,
      offAngle,
      brokenThrough,
    },
    ms: Date.now() - started,
  };
}
