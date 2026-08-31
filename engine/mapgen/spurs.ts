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

import { createRng } from "../lib/prng.ts";
import { hash2 } from "../lib/noise.ts";
import { blockOffsets, cellKey } from "../lib/math.ts";
import type { Surface } from "./compile.ts";
import { LAKE_Y, type LandField } from "./land.ts";
import { ROAD_CROSS, roadClearance } from "./road.ts";
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
 * placed where both the analysis and the drawing can see it. Half the
 * blocks on a sweep of seeds used to stand across the road the stage
 * actually takes, and nothing was measuring it because nothing but the
 * renderer knew where they were. */
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

export type Spur = {
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
  roadDistance: (x: number, z: number, ignoringJunction?: boolean) => number,
  /** R23 + R31 — whether the ground is still there for a road standing at
   * a point and height, once the stage's own verge cone has cut away
   * whatever would have been a wall beside it. */
  shelfHolds: (x: number, z: number, y: number) => boolean,
  /** R23 + R31 — the band this branch may stand in at a point without its
   * own shelf becoming a wall beside the stage. Unbounded out where the
   * stage's cone does not reach. */
  shelfBand: (x: number, z: number) => ShelfBand,
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
  // R34 — the branch leaves on the road's own grade and then follows the
  // country, at the same lag the route does, inside a grade a minor road
  // would actually be built on. `follow` is that lag as a per-step share:
  // the branch walks in `SPUR.step` metres, not the compiler's, so the
  // response length is converted here rather than restated as a number of
  // its own that would then drift from the route's.
  const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
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
    // R34 — and the branch FOLLOWS THE COUNTRY, by the same lag and grade
    // clamp the route does (`elevation.follow`), off the junction's own
    // height. It used to random-walk its grade, which put a branch at a
    // height of its own invention: fifty metres from the road it left, and
    // twenty above or below the ground either of them was crossing. That is
    // invisible while the route is at an invented height too — both are
    // wrong in the same way — and the moment the route is laid on the
    // country it becomes a wall down the side of every junction.
    //
    // Its own `maxGrade` and not the route's: a branch is a minor road, and
    // it is allowed to be gentler about what it will climb.
    const want = y + (Math.max(land.heightAt(x, z), LAKE_Y + SPUR.shoreFreeboard) - y) * follow;
    const cap = SPUR.maxGrade * SPUR.step;
    y = Math.max(y - cap, Math.min(y + cap, want));
    // R23 + R31 — and it may not climb out of the STAGE's verge cone while
    // it is still inside it.
    //
    // Following the country is right in open ground and wrong beside the
    // road it just left: the two part company in height long before they
    // part on the map, and a branch three metres from the stage and seven
    // above it leaves the terrain an impossible job. Holding the ground up
    // under the branch — which it must, or the branch hangs in the air —
    // builds exactly the wall on the stage's shoulder that R31 exists to
    // forbid. Neither rule can give way there, so the branch gives way
    // here, and the two roads run at one height until they have genuinely
    // separated. Past the cone's reach the band is unbounded and the branch
    // follows the country as it always did.
    //
    // The FLOOR matters as much as the ceiling: a branch that drops away
    // beside the route leaves the terrain the same impossible job, and the
    // face it builds between the two lips is a cliff rather than a wall
    // only because of which side you are standing on. Where the two halves
    // cross — the stage passing twice at two heights — there is no height a
    // road can stand at, and the cut below reads that off `shelfHolds`.
    const band = shelfBand(x, z);
    if (y > band.ceiling) y = band.ceiling;
    if (y < band.floor) y = Math.min(band.floor, band.ceiling);
  }
  // R23 — and then the guarantee the steering only tries for: the branch is
  // CUT at the first step that stands inside the clearance. Not backed up
  // to it — cut. A branch that dips into the stage's ground halfway along
  // and comes out the far side is over at the dip, because everything past
  // it was reached by crossing ground that was never this road's to cross.
  //
  // And the junction's own exemption LAPSES here. The stage either side of
  // a junction is this branch's own road while the branch is still leaving
  // it — that is what a junction IS — but once the branch has got properly
  // clear of the whole stage, coming back to any part of it, its own
  // junction's arms included, is just a second carriageway. Without the
  // lapse a branch could wander a kilometre and fold back over the road
  // beside the junction it started at, which one did: forty metres above it.
  let departed = false;
  for (let i = 0; i < samples.length; i++) {
    const at = samples[i];
    // Measured against the WHOLE stage, junction window and all: this is
    // the question of whether the branch is still leaving.
    const clear = roadDistance(at.x, at.z, false);
    if (clear >= keepOut) departed = true;
    // R31 — the HEIGHT rule binds the whole way, the junction window
    // included, and that is the half of R23 this used to let through.
    //
    // At the mouth the two roads are one graded plane, so the two heights
    // agree and this passes by construction; what it catches is the branch
    // that has started to PART IN HEIGHT while still inside the stage's
    // verge cone. Exempting the first `keep` metres from it, and never
    // asking it at all while the branch was still leaving, let a branch
    // stand seven metres over the stage three metres from its edge — and
    // the terrain then has an impossible job, because holding the ground up
    // under the branch (which it must, or the branch hangs in the air)
    // builds a wall on the stage's shoulder that R31 says cannot be there.
    // Neither rule can give way in the terrain; the branch is what has to.
    if (at.s <= SPUR.keep) continue;
    // Still leaving: the ground AT the junction is this branch's own road,
    // and what is under both there is the junction's one plane. Only at it
    // — the exemption is `junction.parting` metres of ground around the
    // meeting point, not every piece of route whose arc happens to be near
    // the junction's, which is how a branch came to lie on the route a
    // hundred metres away with a cliff between them.
    if (!departed) {
      if (roadDistance(at.x, at.z, true) >= keepOut) continue;
    } else if (clear >= keepOut && shelfHolds(at.x, at.z, at.elevation)) continue;
    samples.length = i;
    endsAt = "stage";
    break;
  }
  // ...and R23 against ITSELF. The wander is a random walk with a minimum
  // radius and a pull toward the edge of the map, and neither of those
  // stops it folding back over ground it has already used — which is the
  // same defect as two roads sharing ground, with the two roads being one
  // road. Cut at the first sample that comes back, for the same reason as
  // above: everything past it was reached across ground this branch had
  // already spent.
  //
  // The window is what makes it a FOLD rather than a curve: samples a few
  // dozen metres apart along the branch are near each other because that is
  // what a road is.
  for (let i = 0; i < samples.length; i++) {
    const at = samples[i];
    let folded = false;
    for (let k = 0; k < i && !folded; k++) {
      if (at.s - samples[k].s < SPUR.selfWindow) break;
      const dx = at.x - samples[k].x;
      const dz = at.z - samples[k].z;
      folded = dx * dx + dz * dz < keepOut * keepOut;
    }
    if (!folded) continue;
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
  // A branch can now be trimmed away entirely: the height rule above binds
  // from the mouth, so an arm that climbs out of the stage's verge cone in
  // its first few metres has nothing left that is allowed to exist. That is
  // an honest answer — this corner cannot carry a junction — and the
  // caller's `armCanLeave` reads it off an empty arm and refuses the
  // junction. It must not crash on the way there.
  length = samples.length > 0 ? samples[samples.length - 1].s : 0;

  // R17 — the branch is the MAIN road continued, so it is sealed for its
  // whole length: a tarmac road that turns to gravel in an empty field is a
  // road that goes nowhere, and it is the loudest thing on the map from
  // above. The mat only has to come UP out of the junction it starts in —
  // a branch that begins at full lift stands 20 cm proud of the road it is
  // joined to, right where the two are supposed to be one surface.
  for (const sample of samples) {
    sample.surface = "asphalt";
    sample.lift = ROAD_CROSS.asphaltLift * Math.min(1, sample.s / ROAD_CROSS.liftRamp);
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
  return { atS, end, samples, width, endsAt, bounds: box, block: null };
}

/** R17 — the arm of a BORROWED road: not built, CUT.
 *
 * `buildSpur` above invents a road, because when the tarmac was a stripe
 * painted down the racing line there was nothing at a junction for the
 * route not to take. With the tarmac laid first (`highway.ts`) there is:
 * the arm the route abandons is simply the rest of the public road, which
 * already crosses the map and already leaves it at both ends. So nothing
 * here steers, wanders or gives up. It walks the road.
 *
 * That removes three whole failure modes at a stroke — an arm that stops in
 * a field, an arm that lies on the route, and an arm that turns to gravel
 * part way along — because the route was planned to keep R23's clearance
 * from this line everywhere except at the two meeting points.
 *
 * What it still has to decide is HEIGHT, for the reason `highway.ts`'s
 * header gives: a stage's elevation is a profile along the route's arc, not
 * a heightfield, so the tarmac's height is only settled once it is known
 * which piece of it the route drives. It is settled the way a branch's
 * always was — off the junction's own grade, following the country at the
 * route's lag inside a minor road's grade, and never outside the stage's
 * verge cone (R31). */
export function cutSpur(
  junction: { x: number; z: number; heading: number; elevation: number },
  atS: number,
  end: "entry" | "exit",
  road: { points: { x: number; z: number; heading: number; s: number }[]; width: number },
  /** Index on the road of the meeting point — the arm runs away from it. */
  index: number,
  land: LandField,
  width: number,
  shelfBand: (x: number, z: number) => ShelfBand,
): Spur {
  // Which way along the road the route did NOT go. The junction carries the
  // heading of the arm it abandons (`compile.ts`'s `noteJunction`), so the
  // arm is whichever direction along the line agrees with it.
  const at = road.points[index];
  const along = Math.cos(at.heading - junction.heading) >= 0 ? 1 : -1;
  const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
  const samples: SpurSample[] = [];
  const box = { minX: junction.x, maxX: junction.x, minZ: junction.z, maxZ: junction.z };
  let y = junction.elevation;
  const endsAt: Spur["endsAt"] = "map";
  // Resampled at the BRANCH's own spacing rather than the road's, which is
  // coarser (`HIGHWAY.step`): a `Spur` is read by the terrain, the renderer,
  // the barrier placer and the analysis, and every one of them takes the
  // samples to be `SPUR.step` apart. A branch that came out at the road's
  // spacing would be a road of a different resolution wearing the same
  // type.
  //
  // It STARTS AT THE MEETING POINT, not at the nearest point of the line it
  // is cut from. The route solved its way onto the road's own tangent, so
  // the two are a metre or so apart — and that metre is the difference
  // between a branch leaving a junction and a branch beginning beside one.
  let px = junction.x;
  let pz = junction.z;
  let heading = junction.heading;
  /** How far along the road's own points the walk has reached, and how much
   * of the current gap is left to spend. */
  let i = index;
  let s = 0;
  for (;;) {
    samples.push({
      x: px,
      z: pz,
      heading,
      elevation: y,
      s,
      surface: "asphalt",
      lift: ROAD_CROSS.asphaltLift * Math.min(1, s / ROAD_CROSS.liftRamp),
      flat: 0,
    });
    if (px < box.minX) box.minX = px;
    if (px > box.maxX) box.maxX = px;
    if (pz < box.minZ) box.minZ = pz;
    if (pz > box.maxZ) box.maxZ = pz;
    // It runs to THE END OF THE ROAD, not to the edge of the stage's own
    // bounding box. A built branch stops as soon as it is clear of the
    // country the rally occupies, because every further metre of it is a
    // metre of road invented for nobody; a cut one has no such cost —
    // the road is already there, it is already laid edge to edge of the
    // map (`highway.ts` walks it from `worldBound + overrun` to the same
    // again on the far side), and stopping it early is what leaves a public
    // road ending on a hillside inside the frame. The stage's box is a
    // fraction of the world, so `SPUR.escape` past it is still well inside
    // the land a player can see.
    //
    // `length.max` is what bounds the cost, and it is generous enough that
    // an arm reaches the rim from anywhere a junction can be.
    if (s >= SPUR.length.max) break;
    // One step of `SPUR.step` along the polyline, over as many of the
    // road's own points as that takes.
    let left: number = SPUR.step;
    while (left > 1e-6) {
      const next = road.points[i + along];
      if (!next) break;
      const gap = Math.hypot(next.x - px, next.z - pz);
      if (gap <= left + 1e-6) {
        left -= gap;
        px = next.x;
        pz = next.z;
        heading = along === 1 ? next.heading : next.heading + Math.PI;
        i += along;
        continue;
      }
      px += ((next.x - px) / gap) * left;
      pz += ((next.z - pz) / gap) * left;
      heading = along === 1 ? next.heading : next.heading + Math.PI;
      left = 0;
    }
    if (left > 1e-6) break;
    s += SPUR.step;
    // R34 — and it FOLLOWS THE COUNTRY, at the route's own lag, inside a
    // minor road's grade, and never outside the stage's verge cone (R31).
    const want = y + (Math.max(land.heightAt(px, pz), LAKE_Y + SPUR.shoreFreeboard) - y) * follow;
    const cap = SPUR.maxGrade * SPUR.step;
    y = Math.max(y - cap, Math.min(y + cap, want));
    const band = shelfBand(px, pz);
    if (y > band.ceiling) y = band.ceiling;
    if (y < band.floor) y = Math.min(band.floor, band.ceiling);
  }
  return { atS, end, samples, width, endsAt, bounds: box, block: null };
}

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
  spur: Spur,
  routeClear: (x: number, z: number) => number,
  /** Half the ROUTE's width, m — what the barrier has to clear. */
  routeHalf: number,
  seed: number,
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
  const roll = hash2(Math.round(spur.atS), spur.end === "entry" ? 1 : 0, (seed ^ 0x7f4a) >>> 0);
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

/** One cell of the branch index: the samples in it, and the box they
 * occupy. A branch crosses a cell as a ribbon, so its box is a fraction of
 * the 24 m square — which is what makes it worth testing before the
 * samples. Splicing a spent branch out only ever shrinks what the box
 * holds, so a box left as it was stays a superset and costs work rather
 * than correctness. */
type SpurCell = {
  entries: { spur: Spur; sample: SpurSample }[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Three rings out — 72 m, comfortably past the corridor AND the shelf blend
 * beyond it. Cutting the search off inside the blend is what leaves fans of
 * shading radiating from a branch: the ground stops being flattened at the
 * cell boundary instead of at the blend's end. */
const NEAR_BLOCK = blockOffsets(3);

export function createSpurIndex(): SpurIndex {
  const spurs: Spur[] = [];
  const grid = new Map<number, SpurCell>();
  const key = (x: number, z: number): number =>
    cellKey(Math.floor(x / INDEX_CELL), Math.floor(z / INDEX_CELL));

  /** The block the last query looked at, held for the next one. Every height
   * query asks this index, and they arrive in clusters a few metres apart —
   * the lattice corners under a wheel, the probes around a ground reading —
   * so the forty-nine map lookups are paid once per cell rather than once
   * per query. Dropped whenever the grid changes shape. */
  let nearCx = NaN;
  let nearCz = NaN;
  const nearCells: SpurCell[] = [];

  const add = (spur: Spur): void => {
    spurs.push(spur);
    for (const sample of spur.samples) {
      const k = key(sample.x, sample.z);
      let cell = grid.get(k);
      if (!cell) {
        grid.set(
          k,
          (cell = {
            entries: [],
            minX: Infinity,
            maxX: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity,
          }),
        );
      }
      cell.entries.push({ spur, sample });
      if (sample.x < cell.minX) cell.minX = sample.x;
      if (sample.x > cell.maxX) cell.maxX = sample.x;
      if (sample.z < cell.minZ) cell.minZ = sample.z;
      if (sample.z > cell.maxZ) cell.maxZ = sample.z;
    }
    nearCx = NaN;
  };

  const nearest = (x: number, z: number): SpurHit | null => {
    if (spurs.length === 0) return null;
    const cx = Math.floor(x / INDEX_CELL);
    const cz = Math.floor(z / INDEX_CELL);
    if (cx !== nearCx || cz !== nearCz) {
      nearCx = cx;
      nearCz = cz;
      nearCells.length = 0;
      for (let i = 0; i < NEAR_BLOCK.length; i += 2) {
        const cell = grid.get(cellKey(cx + NEAR_BLOCK[i], cz + NEAR_BLOCK[i + 1]));
        if (cell) nearCells.push(cell);
      }
    }
    let bestSpur: Spur | null = null;
    let bestSample: SpurSample | null = null;
    let bestD2 = Infinity;
    // Squared throughout, and the winner built once at the end: this runs
    // under every height query the terrain answers, and a root per candidate
    // and an object per improvement are both pure waste there.
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      // The block reaches 72 m and the branch the point is beside is
      // normally in the middle cell, so most of these boxes are already
      // further off than the answer in hand — see `blockOffsets` for why
      // the ring order is what makes that true this early.
      const bx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
      const bz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
      if (bx * bx + bz * bz >= bestD2) continue;
      const entries = cell.entries;
      for (let i = 0; i < entries.length; i++) {
        const sample = entries[i].sample;
        const dx = sample.x - x;
        const dz = sample.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestD2) continue;
        bestD2 = d2;
        bestSpur = entries[i].spur;
        bestSample = sample;
      }
    }
    if (!bestSpur || !bestSample) return null;
    return { spur: bestSpur, sample: bestSample, d: Math.sqrt(bestD2) };
  };

  const pruneBefore = (atS: number): void => {
    let cut = 0;
    while (cut < spurs.length && spurs[cut].atS < atS) cut++;
    if (cut === 0) return;
    for (let i = 0; i < cut; i++) {
      for (const sample of spurs[i].samples) {
        const cell = grid.get(key(sample.x, sample.z));
        if (!cell) continue;
        const at = cell.entries.findIndex((e) => e.sample === sample);
        if (at >= 0) cell.entries.splice(at, 1);
      }
    }
    spurs.splice(0, cut);
    nearCx = NaN;
  };

  return { spurs, add, nearest, pruneBefore };
}
