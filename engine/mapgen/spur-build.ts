// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How an abandoned branch is DRAWN. Two ways onto the country, and they are
// not the same job: a branch off a junction the rally invented is BUILT —
// steered away from the route and the water over a few hundred metres until
// it is out of the world — while an arm of a road the route BORROWED is
// CUT, because that road was laid across the seed before the route existed
// and the line is already there. What both must decide is height, and both
// answer it the same way: off the junction's own grade, following the
// country at the route's lag, never outside the stage's verge cone (R31).
//
// The vocabulary they draw from, and the index everything downstream reads
// them through, are `spurs.ts` and `spur-index.ts`.

import { createRng } from "../lib/prng.ts";
import { LAKE_Y, type LandField } from "./land.ts";
import { ROAD_CROSS, roadClearance } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import {
  followStep,
  PLATFORM_HOLD,
  SPUR,
  type ShelfBand,
  type Spur,
  type SpurSample,
} from "./spurs.ts";

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
  // The branch leaves on the MAIN road's own grade — it is that road,
  // continued — and bends off it at the crest rule (`followStep`). Left at
  // level it parts from the junction's graded platform in height before it
  // has parted from it on the map, and the platform warp has a metre to
  // make up over the rim.
  let slope = junction.slope;
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
   * swing that follows it — three grid probes the swing would otherwise
   * take all over again before its first comparison. */
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
    // R34 — and the branch FOLLOWS THE COUNTRY, by the same lag the route
    // does (`elevation.follow`), off the junction's own height, at a minor
    // road's grade and crest (`followStep`). The two have to follow the
    // same ground: a branch at a height of its own invention is a wall down
    // the side of the junction the moment the route is laid on the country.
    //
    // Its own `maxGrade` and not the route's: a branch is a minor road, and
    // it is allowed to be gentler about what it will climb.
    const want = y + (Math.max(land.heightAt(x, z), LAKE_Y + SPUR.shoreFreeboard) - y) * follow;
    // Through the junction's own platform the branch IS the main road's
    // plane (R17 warps it onto that plane anyway), and the band is not
    // asked: inside the stage's bench the cone has no swing, so the band is
    // degenerate — floor over ceiling — and clamping to it snaps the branch
    // two metres down at its first step, from where it creeps back up to
    // meet the platform's rim as a brow.
    //
    // Past the platform the band is AIMED AT, not only clamped to: a floor
    // met as a hard clamp is a step the height of the difference, and
    // beside a route on ten metres of fill the cone's floor stands a metre
    // over the country the branch is following. Aimed at through
    // `followStep`, the branch climbs to it at a road's grade; the clamp
    // after is the last resort for a band the grade could not keep up with.
    const band = shelfBand(x, z);
    if (s + SPUR.step <= PLATFORM_HOLD) {
      y = junction.elevation + junction.slope * (s + SPUR.step);
      slope = junction.slope;
      continue;
    }
    ({ y, slope } = followStep(
      y,
      slope,
      Math.min(band.ceiling, Math.max(band.floor, want)),
      SPUR.maxGrade,
    ));
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
    // included: that is the half of R23 a distance rule alone lets through.
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
  /** `slope` is the main road's own grade through the meeting point, which
   * the arm leaves on; a crossing carries none, and its arms leave level. */
  junction: { x: number; z: number; heading: number; elevation: number; slope?: number },
  atS: number,
  end: "entry" | "exit",
  road: { points: { x: number; z: number; heading: number; s: number }[]; width: number },
  /** Index on the road of the meeting point — the arm runs away from it. */
  index: number,
  land: LandField,
  width: number,
  shelfBand: (x: number, z: number) => ShelfBand,
  /** R41 — what the arm is made of. Tarmac, unless it is a railway's
   * ballast, which the physics reads as the loose surface it is. */
  surface: "asphalt" | "gravel" | "sand" = "asphalt",
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
  const slope0 = junction.slope ?? 0;
  let slope = slope0;
  let endsAt: Spur["endsAt"] = "map";
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
      surface,
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
    // minor road's grade and the crest rule, and never outside the stage's
    // verge cone (R31).
    const want = y + (Math.max(land.heightAt(px, pz), LAKE_Y + SPUR.shoreFreeboard) - y) * follow;
    // On the junction's plane through its platform, then aimed at the band
    // and clamped to it as a last resort — see `buildSpur`: the band is
    // degenerate beside the junction, and a floor met as a clamp is a step.
    if (s <= PLATFORM_HOLD) {
      y = junction.elevation + slope0 * s;
      slope = slope0;
      continue;
    }
    const band = shelfBand(px, pz);
    ({ y, slope } = followStep(
      y,
      slope,
      Math.min(band.ceiling, Math.max(band.floor, want)),
      SPUR.maxGrade,
    ));
    if (y > band.ceiling) y = band.ceiling;
    if (y < band.floor) y = Math.min(band.floor, band.ceiling);
  }
  // Wherever the road runs to, the arm stops on DRY ground, as a built
  // branch does: a public road is laid across the bare land and can run
  // into a lake at the map's edge, and the arm cut from it may not end
  // metres under the water. Backed up out of the shallows, with `keep`
  // as the floor, and the box re-read from what survived.
  while (
    samples.length > 1 &&
    samples[samples.length - 1].s > SPUR.keep &&
    land.flooded(samples[samples.length - 1].x, samples[samples.length - 1].z, SPUR.shoreFreeboard)
  ) {
    samples.pop();
    endsAt = "water";
  }
  if (endsAt === "water") {
    box.minX = box.maxX = junction.x;
    box.minZ = box.maxZ = junction.z;
    for (const sample of samples) {
      if (sample.x < box.minX) box.minX = sample.x;
      if (sample.x > box.maxX) box.maxX = sample.x;
      if (sample.z < box.minZ) box.minZ = sample.z;
      if (sample.z > box.maxZ) box.maxZ = sample.z;
    }
  }
  return { atS, end, samples, width, endsAt, bounds: box, block: null };
}
