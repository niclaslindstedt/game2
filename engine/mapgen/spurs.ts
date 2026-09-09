// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — the JUNCTIONS. Asphalt on a rally stage is not a stripe painted on
// the route: it is a public road the stage borrows. The gravel arrives at
// a junction, joins the tarmac, runs it for a kilometer, and turns off it
// again — and at both junctions the branch the route does NOT take is
// still there, running away into the country, shut off with a barrier and a
// chevron board so nobody in the field is in any doubt which way the stage
// goes. WHERE that barrier stands is this module's too, and it is not a
// detail: it has to clear the road the stage actually takes, at both ends
// of its line, or the sign telling a driver which way to go is the thing
// they hit going that way.
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

import { hash2 } from "../lib/noise.ts";
import type { Surface } from "./compile.ts";
import { ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";

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

/** What a branch is shut with. Four kinds because one kind, repeated at
 * every junction of every stage, stops being a signal and becomes wallpaper
 * — and because a marshal shuts a road with whatever the organisers had on
 * the lorry that morning. None of them is a wall: the tape is a statement,
 * and a player who wants to see where the branch goes drives through it and
 * scatters it. */
export type BlockKind =
  /** A line of plastic cones, taped between two posts. */
  | "cones"
  /** Stacks of scrap tyres — the loudest thing a rally can put on a road,
   * and the one nobody mistakes for scenery. */
  | "tyres"
  /** Round bales off the field next to the junction. */
  | "bales"
  /** Empty oil drums, laid down in a row. */
  | "drums";

/** R23 + R31 — the heights a road may stand at beside the stage without its
 * own shelf becoming a face in the stage's shoulder: the stage's verge cone
 * read as two numbers. Unbounded (`-Infinity`/`Infinity`) out past the
 * cone's reach, and EMPTY — floor over ceiling — where the stage passes
 * near enough twice at two heights for no road to fit between them. */
export type ShelfBand = { floor: number; ceiling: number };

/** R17 — the BLOCK across an abandoned branch: where the barrier stands,
 * how wide the line is, and what it is built of. Placed by the generator
 * rather than by the renderer, for the one reason that matters — the thing
 * standing in front of a driver is part of the stage, so it has to be
 * placed where both the analysis and the drawing can see it. Left to the
 * renderer alone, half the blocks on a sweep of seeds stand across the
 * road the stage actually takes, and nothing measures it because nothing
 * but the renderer knows where they are. */
export type RoadBlock = {
  /** Centre of the barrier line, on the branch's own centerline. */
  x: number;
  z: number;
  /** Road height there, m. */
  y: number;
  /** The branch's heading through it — the barrier stands ACROSS this. */
  heading: number;
  /** How wide the line is, m: the branch's full width. */
  width: number;
  /** How far up the branch it stands, m. */
  s: number;
  kind: BlockKind;
};

/** What every road that hangs off the stage has in common — an abandoned
 * branch (R17) or a homestead's drive (R37): where on the stage it leaves,
 * the samples it is made of, and how wide it is. The terrain's shelf, the
 * forest's keep-off, the barrier placer and the renderer's ribbon read this
 * and nothing more, so a drive is laid, flattened, kept clear and drawn by
 * the same code as a branch without having to pretend it is one. */
export type SpurLine = {
  /** Arc position on the stage it leaves from. */
  atS: number;
  samples: SpurSample[];
  /** Full road width, m. */
  width: number;
};

export type Spur = SpurLine & {
  /** Arc position of its junction on the stage. */
  atS: number;
  /** Which junction it hangs off: the one where the route JOINS the
   * tarmac, or the one where it LEAVES it. On a CROSSING, where the route
   * does neither, it is only which of the two arms this is. */
  end: "entry" | "exit";
  /** R36 — set on both arms of a level crossing. A junction abandons one
   * arm and the rally drives up the other; a crossing abandons the road, so
   * these come in pairs, pointing opposite ways out of one meeting point,
   * and both of them are shut. */
  crossing?: boolean;
  /** R41 — set on both arms of a RAILWAY crossing: this is not a road but
   * the line the train runs, cut from the railway to the edge of the map.
   * The terrain shelves it and the forest keeps off it like any branch; the
   * renderer lays ballast and rails on it instead of a mat, and nothing
   * shuts it. */
  rail?: boolean;
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
  /** R17 — where the branch is shut. Null on a branch so short, or so
   * closely folded against the route, that no barrier fits across it
   * without standing in the road the stage takes: nothing is better there
   * than something in the way. */
  block: RoadBlock | null;
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
   * second stage's worth of road.
   *
   * The ceiling is generous because LEAVING is the point. A junction sits
   * wherever the paving field put it, which is usually in the middle of the
   * country the stage occupies — and from there a branch that has to steer
   * round a lake and keep off the stage covers a lot of ground to get to an
   * edge. A ceiling that binds turns a public road into a road that stops
   * in a field, which is the loudest mistake on the map. */
  length: { min: 260, max: 3200 },
  step: 4,
  /** Radius the branch's own wandering never turns tighter than, m. */
  minRadius: 55,
  /** R23 against itself — how far apart along the branch two samples have
   * to be before being near each other counts as a FOLD rather than as a
   * corner, m. A hairpin's two arms are a road's width apart by definition;
   * a kilometre of branch coming back over its own line is a second
   * carriageway. Generous, because a branch's tightest corner is
   * `minRadius` and half a turn of that is under 180 m of road. */
  selfWindow: 220,
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

  /** R17 — where the barrier across the branch may stand. `from` keeps it
   * off the junction's own platform, where it would be buried under the
   * crossing; `to` keeps it in sight of a driver arriving at the junction,
   * because a block nobody sees until they are past the turn is not a
   * sign. `clear` is the bare country the whole barrier LINE — both ends of
   * it, not its middle — has to leave between itself and the route's outer
   * lip: a driver on the correct road must never have to steer around the
   * thing telling them which road is correct. `least` is the fallback bar
   * for a branch that runs alongside the route the whole window: room past
   * the route's MAT rather than past its whole corridor, which still leaves
   * the road a car is driving on untouched. */
  block: { from: 18, to: 200, clear: 4, least: 2.5 },
} as const;

/** R17 — stand the barrier that shuts a branch.
 *
 * The place is not "a little way up the branch": it is the first point at
 * which the WHOLE LINE clears the route. A branch leaves its junction along
 * the main road's own tangent and the route turns off it, so for the first
 * stretch the two carriageways are still one piece of ground — put the
 * barrier there and it stands square across the road the stage takes, which
 * is what a third of them did.
 *
 * `routeClear` is the same road-distance field the branch was steered by:
 * distance from a point to the nearest piece of the route (capped out in the
 * country the branch has to itself). Every point along the line is tested,
 * because a line is not its midpoint — the end nearer the route is the one
 * a driver hits.
 *
 * Two bars, not one. The first asks for the whole corridor plus a margin,
 * and the EARLIEST point that clears it wins, because a barrier is a sign
 * and a sign belongs where it is read. Where a branch runs alongside the
 * route far enough that no point in the window clears that, the fallback is
 * the ROOMIEST point in the window — accepted only if it still leaves the
 * mat itself untouched, and otherwise not placed at all. An open fork reads
 * as a choice; a barrier in the road reads as a bug, and of the two the
 * choice is the cheaper mistake.
 */
export function placeBlock(
  spur: SpurLine,
  routeClear: (x: number, z: number) => number,
  /** Half the ROUTE's width, m — what the barrier has to clear. */
  routeHalf: number,
  seed: number,
  /** Tells two lines off the SAME arc position apart for the dice — a
   * junction's two arms, say. Zero for anything that stands alone. */
  salt = 0,
): RoadBlock | null {
  const want = routeHalf + ROAD_CROSS.reach + SPUR.block.clear;
  const least = routeHalf + SPUR.block.least;
  const half = spur.width / 2;
  /** The least room the whole barrier line leaves the route, m. */
  const room = (sample: SpurSample): number => {
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    let worst = Infinity;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const d = routeClear(sample.x + rx * half * k, sample.z + rz * half * k);
      if (d < worst) worst = d;
    }
    return worst;
  };

  let best: SpurSample | null = null;
  let bestRoom = -Infinity;
  for (const sample of spur.samples) {
    if (sample.s < SPUR.block.from) continue;
    if (sample.s > SPUR.block.to) break;
    // Off the junction's own plane first: a barrier warped onto the
    // platform is a barrier inside the crossing.
    if (sample.flat > 0) continue;
    const here = room(sample);
    if (here >= want) {
      best = sample;
      bestRoom = here;
      break;
    }
    if (here > bestRoom) {
      best = sample;
      bestRoom = here;
    }
  }
  if (!best || bestRoom < least) return null;
  // Deterministic per branch, and stable under an endless stream's repeated
  // appends: the junction's arc position and which arm it is.
  const roll = hash2(Math.round(spur.atS), salt, (seed ^ 0x7f4a) >>> 0);
  const kinds: BlockKind[] = ["cones", "tyres", "bales", "drums"];
  return {
    x: best.x,
    z: best.z,
    y: best.elevation,
    heading: best.heading,
    width: spur.width,
    s: best.s,
    kind: kinds[Math.min(kinds.length - 1, Math.floor(roll * kinds.length))],
  };
}

/** Half the width a spur's corridor occupies, m — the mat plus the verge
 * the ribbon draws beside it. */
export function spurReach(spur: SpurLine): number {
  return spur.width / 2 + ROAD_CROSS.reach;
}

/** R17 — how far out of a junction the branch is the MAIN ROAD'S PLANE,
 * m of its own arc: the platform's longest reach and a half, which is also
 * as far as the compiler's warp onto that plane looks. Inside it the
 * branch holds the junction's height and grade instead of following the
 * country, and does not ask the stage's shelf band, which is degenerate
 * beside the junction (`buildSpur` says why). */
export const PLATFORM_HOLD = R.junction.reach.max * 1.5;

/** R34 — ONE STEP OF A MINOR ROAD'S HEIGHT, stated once for every road
 * that hangs off the stage: a branch, a drive, a car park's lane. The road
 * wants `target` — the country it is following, the road it is closing on,
 * the pad it is running onto — and gets as much of it as a road is built
 * to: no steeper than `maxGrade`, and bending toward it no faster than a
 * minor road's crest rule (`elevation.follow.minorCrest`). The second clamp
 * is the one a first-order follower with a grade cap has not got, and without
 * it a profile is a chain of ramps with a brow at every change of mind: a
 * grade that flips from climbing to falling between two samples is a crest
 * the car flies. Returns the new height and the slope it was reached on,
 * which is the state the next step bends from. */
export function followStep(
  y: number,
  slope: number,
  target: number,
  maxGrade: number,
): { y: number; slope: number } {
  let next = (target - y) / SPUR.step;
  const swing = R.elevation.follow.minorCrest * SPUR.step;
  if (next > slope + swing) next = slope + swing;
  else if (next < slope - swing) next = slope - swing;
  if (next > maxGrade) next = maxGrade;
  else if (next < -maxGrade) next = -maxGrade;
  return { y: y + next * SPUR.step, slope: next };
}
