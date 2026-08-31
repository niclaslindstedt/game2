// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WATER, ridden. R18 states the rules of nature in prose and the
// tracer tries to obey them; this walks the result from source to mouth
// and checks that it did.
//
// Water is the fastest thing in a generated landscape to give the whole
// world away. Nobody measures a hillside, but everybody knows which way a
// river runs — so a course that climbs, thins as it gathers, floats over a
// slope, or simply stops in a field reads as fake instantly, while the
// same landscape with the water right reads as a place.
//
// So the walk asks, in order, the questions a person standing on the bank
// would ask:
//
//   Does it run DOWNHILL, the whole way? Water has never once climbed.
//   Does it GATHER? A river collects what falls on the ground either side
//     of it, so it is wider at every point than it was upstream.
//   Did it START anywhere? A watercourse is born high — on the ice, on the
//     bare rock, in the bog at the head of the valley — not at the first
//     place a road happened to want to cross it.
//   Does it END in anything? A river ends in bigger water or it leaves the
//     map. A river that stops has been drawn, not routed.
//   Is it IN the ground? Water sits in a channel cut into the land. A
//     surface drawn over a hillside is the most visible bug there is.
//   And does it stay OFF the road except where it crosses it? There are no
//     culverts here: water under a road it does not cross digs the ground
//     out from under the ribbon.

import { roadClearance } from "../mapgen/road.ts";
import type { Track } from "../mapgen/compile.ts";
import { BANK, type River } from "../mapgen/river.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { LAKE_Y } from "../mapgen/land.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, type Check, type Finding, type MetricReport } from "./types.ts";

/** How far a point on a course is from the nearest crossing it was
 * anchored on, m. Inside the crossing window the water is ON the road
 * because that is what a ford is. */
function toNearestAnchor(river: River, x: number, z: number): number {
  let best = Infinity;
  for (const anchor of river.anchors) {
    const d = Math.hypot(anchor.x - x, anchor.z - z);
    if (d < best) best = d;
  }
  return best;
}

/** True where a point has left the country the stage occupies — the one
 * honest way for a river to end without arriving anywhere. */
function offMap(track: Track, x: number, z: number, margin: number): boolean {
  const b = track.bounds;
  return x < b.minX - margin || x > b.maxX + margin || z < b.minZ - margin || z > b.maxZ + margin;
}

export function analyzeWater(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const rivers = terrain.rivers;
  const W = ANALYSIS.water;
  const keep = roadClearance(track.width) * W.roadKeep;

  let points = 0;
  let climbs = 0;
  let worstClimb = 0;
  let narrowings = 0;
  let worstNarrow = 0;
  let floats = 0;
  let worstFloat = 0;
  let intrusions = 0;
  let worstIntrusion = 0;
  let shortFalls = 0;
  let strandedMouths = 0;
  let sourceless = 0;
  let gathered = 0;
  let retraces = 0;
  let worstRetrace = 0;

  for (const river of rivers) {
    const course = river.points;
    // A course with one point is not a watercourse — it is the crossing the
    // road asked for, with no water routed through it. Nothing downstream
    // can be measured on it, so it is reported here and skipped.
    if (course.length < 2) {
      sourceless++;
      findings.push({
        code: "water.source",
        severity: "error",
        message: "a watercourse has no course: the trace produced a single point",
        at: course.length > 0 ? { x: course[0].x, z: course[0].z } : undefined,
        value: river.anchors.length,
      });
      continue;
    }
    const source = course[0];
    const mouth = course[course.length - 1];
    points += course.length;

    for (let i = 1; i < course.length; i++) {
      const rise = course[i].y - course[i - 1].y;
      if (rise > W.climb) {
        climbs++;
        if (rise > worstClimb) {
          worstClimb = rise;
          findings.push({
            code: "water.uphill",
            severity: "error",
            message: `a watercourse climbs ${rise.toFixed(2)} m`,
            at: { x: course[i].x, z: course[i].z },
            value: rise,
          });
        }
      }
      const thinning = course[i - 1].halfWidth - course[i].halfWidth;
      if (thinning > W.narrow) {
        narrowings++;
        if (thinning > worstNarrow) {
          worstNarrow = thinning;
          findings.push({
            code: "water.gather",
            severity: "warn",
            message: `a watercourse narrows by ${thinning.toFixed(2)} m as it runs downstream`,
            at: { x: course[i].x, z: course[i].z },
            value: thinning,
          });
        }
      }
    }

    // ...and it never runs back over itself. A tracer's walk steers by the
    // downhill it can feel and the road pushing it away, and where those
    // two disagree across a cell boundary it can settle into swapping
    // between the pair — a limit cycle, with the surface pinned at the
    // floor of the hollow they share and nothing left that could end the
    // walk. What gets drawn is not a river: it is four hundred points and
    // a full-width sheet of standing water on one spot, over whatever the
    // road was doing underneath. Cheap to see from the outside and almost
    // invisible from the inside, which is exactly what a check is for.
    //
    // Measured as a course coming back close to ground it covered a long
    // way upstream — both halves, because the drawn points carry the
    // MEANDER's sway on top of the walk and a sway swings them past each
    // other. What separates a sway from a cycle is how far the water
    // travelled in between: over seeds 1-24 at medium the longest a
    // healthy course runs before returning within `retrace` of itself is
    // 85 m, one sway's worth, and seed 2's pre-fix cycle ran 3624 m.
    const arc: number[] = [0];
    for (let i = 1; i < course.length; i++) {
      arc.push(
        arc[i - 1] + Math.hypot(course[i].x - course[i - 1].x, course[i].z - course[i - 1].z),
      );
    }
    for (let i = 0; i < course.length; i++) {
      for (let j = 0; j < i; j++) {
        const run = arc[i] - arc[j];
        if (run <= W.retraceRun) break;
        const d = Math.hypot(course[i].x - course[j].x, course[i].z - course[j].z);
        if (d >= W.retrace) continue;
        retraces++;
        if (run > worstRetrace) {
          worstRetrace = run;
          findings.push({
            code: "water.retrace",
            severity: "error",
            message: `a watercourse runs back over itself after ${run.toFixed(0)} m, ${d.toFixed(1)} m away`,
            at: { x: course[i].x, z: course[i].z },
            value: run,
          });
        }
        break;
      }
    }

    // In the ground, not over it. Asking the ground UNDER the water proves
    // nothing — the channel carves it away, so the bed is below the
    // surface by construction. The question is whether the water stands
    // above its own BANKS: sample the un-carved ground out past the bank
    // blend on both sides, and if the surface is over both of them the
    // course is a sheet of water laid along the top of a ridge.
    for (let i = 0; i < course.length; i++) {
      const point = course[i];
      const next = course[Math.min(course.length - 1, i + 1)];
      const prev = course[Math.max(0, i - 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const out = point.halfWidth + BANK + 6;
      const nx = (-dz / len) * out;
      const nz = (dx / len) * out;
      // The HIGHER bank, not the lower one. A watercourse running along a
      // slope has ground below it on the downhill side by definition —
      // that is what a hillside is. Floating means the surface stands over
      // BOTH banks, which is water laid along the top of a ridge.
      //
      // Measured on the BARE LAND, not on the finished terrain. The
      // finished ground has the channel's own carve in it (which would make
      // every river look like it was floating over the hole it dug) and the
      // road's verge cone (which cuts the bank away wherever the two run
      // near each other). Neither is the question. The question is whether
      // the water is above the country it was traced against.
      const land = terrain.geology.surfaceAt;
      const ground = Math.max(land(point.x + nx, point.z + nz), land(point.x - nx, point.z - nz));
      const over = point.y - ground;
      if (over > W.float) {
        floats++;
        if (over > worstFloat) {
          worstFloat = over;
          findings.push({
            code: "water.float",
            severity: "error",
            message: `water drawn ${over.toFixed(2)} m above the ground it lies in`,
            at: { x: point.x, z: point.z },
            value: over,
          });
        }
      }
      // ...and off the road, except where it is crossing it.
      if (toNearestAnchor(river, point.x, point.z) < W.crossWindow) continue;
      const road = terrain.roadDistanceAt(point.x, point.z);
      const need = keep + point.halfWidth;
      if (road < need) {
        intrusions++;
        const into = need - road;
        if (into > worstIntrusion) {
          worstIntrusion = into;
          findings.push({
            code: "water.road",
            severity: "error",
            message: `a watercourse runs ${road.toFixed(0)} m from the road away from any crossing`,
            at: { x: point.x, z: point.z },
            value: into,
          });
        }
      }
    }

    const fall = source.y - mouth.y;
    if (fall < W.fall) {
      shortFalls++;
      findings.push({
        code: "water.fall",
        severity: "warn",
        message: `a watercourse falls only ${fall.toFixed(1)} m from source to mouth`,
        at: { x: source.x, z: source.z },
        value: W.fall - fall,
      });
    }

    // A mouth has ended somewhere when the tracer says so — and the tracer
    // is checked rather than trusted: `water` has to actually be standing
    // water, `map` has to actually be off the map. A course that says it
    // pooled is taken at its word, because a pool is water it made itself
    // and there is nothing else to compare it against.
    const mouthGround = terrain.farHeightAt(mouth.x, mouth.z);
    const inStandingWater = mouthGround < LAKE_Y + 1;
    const escaped = offMap(track, mouth.x, mouth.z, W.mouth);
    const ended =
      river.endsAt === "pool" ||
      (river.endsAt === "water" && inStandingWater) ||
      (river.endsAt === "map" && escaped);
    if (!ended) {
      strandedMouths++;
      findings.push({
        code: "water.mouth",
        severity: "error",
        message: `a watercourse claims to end in ${river.endsAt} and stops in open country ${(
          mouthGround - LAKE_Y
        ).toFixed(0)} m above the lake table`,
        at: { x: mouth.x, z: mouth.z },
        value: mouthGround - LAKE_Y,
      });
    }

    // A source is a trickle and a mouth is a river. The ratio is the whole
    // claim "it gathers as it goes" reduced to one number.
    if (mouth.halfWidth > source.halfWidth * 1.15) gathered++;
    if (source.halfWidth > mouth.halfWidth) {
      findings.push({
        code: "water.source",
        severity: "warn",
        message: `a watercourse is born wider (${source.halfWidth.toFixed(
          1,
        )} m) than it dies (${mouth.halfWidth.toFixed(1)} m)`,
        at: { x: source.x, z: source.z },
        value: source.halfWidth - mouth.halfWidth,
      });
    }
  }

  // Every crossing the road makes has to be ON water. A ford with no river
  // through it is a puddle the road dips into for no reason.
  let dryCrossings = 0;
  let crossings = 0;
  for (let i = 0; i < track.samples.length; i++) {
    const sample = track.samples[i];
    if (sample.surface !== "water" && sample.deck === null) continue;
    // One crossing, not one sample of one: skip to the end of the run.
    crossings++;
    let anchored = false;
    for (const river of rivers) {
      if (toNearestAnchor(river, sample.x, sample.z) < W.crossWindow) {
        anchored = true;
        break;
      }
    }
    if (!anchored) {
      dryCrossings++;
      findings.push({
        code: "water.dry",
        severity: "error",
        message: "the road crosses water that no watercourse runs through",
        at: { x: sample.x, z: sample.z },
        s: sample.s,
      });
    }
    while (
      i + 1 < track.samples.length &&
      (track.samples[i + 1].surface === "water" || track.samples[i + 1].deck !== null)
    ) {
      i++;
    }
  }

  const courses = Math.max(1, rivers.length);
  const checks: Check[] = [
    {
      id: "downhill",
      label: "water never climbs",
      score: rate(climbs, Math.max(1, points)),
      weight: 3,
      value: worstClimb,
      budget: W.climb,
    },
    {
      id: "gather",
      label: "a course widens as it collects",
      score: rate(narrowings, Math.max(1, points)) * rate(courses - gathered, courses),
      weight: 1.5,
      value: worstNarrow,
      budget: W.narrow,
    },
    {
      id: "float",
      label: "water lies in the ground, not over it",
      score: rate(floats, Math.max(1, points)),
      weight: 2.5,
      value: worstFloat,
      budget: W.float,
    },
    {
      id: "retrace",
      label: "a course never runs back over itself",
      score: rate(retraces, Math.max(1, points)),
      weight: 2.5,
      value: worstRetrace,
    },
    {
      id: "mouth",
      label: "a course ends in bigger water or leaves the map",
      // A course that never got traced at all counts against this too: it
      // has no mouth, which is the strongest possible way of not having one
      // in the right place.
      score: rate(strandedMouths + sourceless, courses),
      weight: 2,
      value: strandedMouths + sourceless,
    },
    {
      id: "fall",
      label: "a course falls far enough to be a river",
      score: rate(shortFalls, courses),
      weight: 1,
      value: shortFalls,
    },
    {
      id: "road",
      label: "water keeps off the road except where it crosses",
      score: rate(intrusions, Math.max(1, points)),
      weight: 2,
      value: worstIntrusion,
    },
    {
      id: "crossings",
      label: "every crossing has water under it",
      score: rate(dryCrossings, Math.max(1, crossings)),
      weight: 2,
      value: dryCrossings,
    },
  ];

  return {
    id: "water",
    label: "water",
    score: metricScore(checks),
    weight: ANALYSIS.weights.water,
    checks,
    findings,
    stats: {
      rivers: rivers.length,
      points,
      crossings,
      climbs,
      narrowings,
      floats,
      intrusions,
      strandedMouths,
      sourceless,
      dryCrossings,
    },
    ms: Date.now() - started,
  };
}
