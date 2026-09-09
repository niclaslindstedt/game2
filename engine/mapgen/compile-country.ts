// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COUNTRY A STAGE IS COMPILED INTO, before and after the walk. Before:
// the box the route will occupy and every road, railway, homestead, town,
// farm and power line the seed put on it — surveyed once, so the walk can
// ask whether an arm it is about to leave behind can get OUT of the map
// (`planCountry`), and so a conductor's sag is measured over the ground a
// road's shelf will really stand at (`roadTopField`). After: the empty
// `Track` a compile starts from, and the height closure a circuit's last
// sample owes its first.

import type { SegmentPlan, StageKnobs } from "./rules.ts";
import { SAMPLE_STEP, STAGE_RULES as R, followGradeOf, followLagOf, roadWidthOf } from "./rules.ts";
import { boredAt, type Bore } from "./search.ts";
import { cellKey } from "../lib/math.ts";
import { buildableAt, createLandField } from "./land.ts";
import { type Climate } from "../game/climate.ts";
import { straightness } from "./rolling.ts";
import { ROAD_CROSS } from "./road.ts";
import { SPUR, type ShelfBand } from "./spurs.ts";
import type { Track } from "./track-shape.ts";
import { ROAD_DISTANCE_REACH } from "./compile-road.ts";

/** R45 — what a WIRE has to clear at a point, and by how much: the bare
 * country, or a ROAD standing over it — the route, an abandoned branch, a
 * homestead's drive, a public road the rally never met — with the road's
 * own clearance owed wherever one is under it.
 *
 * Not `land.heightAt`, and the difference is a defect rather than a
 * refinement. A road is laid ALONG the country but not ON it: it rides
 * embankments and shelves, and the terrain blends the country up onto them
 * over its corridor range. A span planned against the bare land came out
 * clearing the BUILT road by seven metres where it had promised twelve, and
 * another was drawn through a branch's embankment seventy metres up.
 *
 * The shelf is modelled the way the terrain builds one: the road's own
 * level on its centerline, easing back to the country over `REACH`. It has
 * to EASE rather than hold — held flat across its whole reach it demanded a
 * road's clearance over the highest road within a hundred and fifty metres,
 * which refused a third of the lines that had been fitting and bought
 * nothing, since no wire is measured against a road that far to one side.
 *
 * A cell grid over every road's samples, so away from all of them the
 * answer is the country and one failed set lookup. */
export function roadTopField(
  track: Track,
  land: { heightAt: (x: number, z: number) => number },
): (x: number, z: number) => { ground: number; need: number } {
  const CELL = 48;
  /** How far a road's shelf reaches into the country, m — the terrain's own
   * `CORRIDOR_RANGE`, restated here because the terrain does not exist yet
   * when a line is surveyed. Over-reaching costs a longer span; under it
   * buries a conductor in an embankment. */
  const REACH = 150;
  /** ...and how near one has to be before the wire owes it a road's own
   * clearance rather than a field's, m: the widest corridor and its verge. */
  const OVER = 30;
  const STRIDE = 6;
  type Top = { x: number; z: number; y: number };
  const grid = new Map<number, Top[]>();
  const add = (point: Top): void => {
    const at = cellKey(Math.floor(point.x / CELL), Math.floor(point.z / CELL));
    const bucket = grid.get(at);
    if (bucket) bucket.push(point);
    else grid.set(at, [point]);
  };
  for (let i = 0; i < track.samples.length; i += STRIDE) {
    const s = track.samples[i];
    add({ x: s.x, z: s.z, y: s.elevation });
  }
  for (const road of [...track.spurs, ...track.publicRoads]) {
    for (let i = 0; i < road.samples.length; i += STRIDE) {
      const s = road.samples[i];
      add({ x: s.x, z: s.z, y: s.elevation });
    }
  }
  const rings = Math.ceil(REACH / CELL);
  return (x, z) => {
    const country = land.heightAt(x, z);
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    let top = -Infinity;
    let nearest = REACH;
    for (let dx = -rings; dx <= rings; dx++) {
      for (let dz = -rings; dz <= rings; dz++) {
        const bucket = grid.get(cellKey(ix + dx, iz + dz));
        if (!bucket) continue;
        for (const p of bucket) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d > REACH) continue;
          if (p.y > top) top = p.y;
          if (d < nearest) nearest = d;
        }
      }
    }
    if (top === -Infinity) return { ground: country, need: R.powerline.clearance.ground };
    return {
      ground: Math.max(country, country + (top - country) * (1 - nearest / REACH)),
      need: nearest < OVER ? R.powerline.clearance.road : R.powerline.clearance.ground,
    };
  };
}

/** How far behind an endless stage's frontier the road is settled enough
 * to put a homestead on, m — the guards' and the crowd's own margin. */
export const STREAMED_HOLD = 250;

/** How far a homestead or a town looks for a public road, m. Past this the
 * answer is "none near", which is all either placer ever asks: the widest
 * clearance they hold is `homestead.drive.clear` plus a road width, well
 * inside it. Under the index's `NEAR`, so a probe out in the country is one
 * set lookup rather than a walk of every ring. */
export const HIGHWAY_LOOK = 96;

/** R17 — THE COUNTRY, walked off the plan before anything is built.
 *
 * A junction is only worth building where the arm it abandons can leave the
 * map, and the only honest way to know that is to drive the branch — which
 * needs the stage's box and the ground it may not take, both of which are
 * questions about the WHOLE stage that the compiler's cursor cannot answer
 * halfway down it. So the plan is walked once, coarsely, into a box and a
 * bucketed point field, and the junction test drives its trial branch
 * against that.
 *
 * Coarser than the compiled stage — a segment is stepped every few meters
 * rather than every two — because what it feeds are clearances measured in
 * tens of meters, and the slack is subtracted off every answer so the field
 * can only ever under-report the room a branch has, never invent some. */
export type Country = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** R23 — the keep-out field, with the ground around the junction under
   * test excluded (a branch leaves a junction ON the road it is leaving). */
  roadDistance: (meet: {
    x: number;
    z: number;
  }) => (x: number, z: number, ignoring?: boolean) => number;
  /** R31 — whether the ground is still there for a road at this height. */
  shelfHolds: (x: number, z: number, y: number) => boolean;
  /** R31 — and the heights themselves: the band a road may stand in here
   * without its shelf standing as a wall beside the stage. */
  shelfBand: (x: number, z: number) => ShelfBand;
};

export const PLAN_STEP = 6;

/** How much each road-distance field UNDER-reports by, m: half its own
 * coarsened spacing, subtracted off every answer so a field can only ever
 * claim a branch has less room than it really has, never more.
 *
 * Named rather than inlined so the three fields cannot drift apart: they
 * are the same idea measured at three different strides, and a reader
 * comparing one against another needs to see that. */
export const BRANCH_DISTANCE_SLACK = (8 * SPUR.step) / 2;
export const STAGE_DISTANCE_SLACK = (8 * SAMPLE_STEP) / 2;
export const PLAN_DISTANCE_SLACK = PLAN_STEP / 2;

/** How near a junction's meeting point the route IS the branch's own road,
 * m: inside it the two carriageways are one, so the branch is not measured
 * against them while it is still LEAVING. A PLACE and not a stretch of arc
 * — see `STAGE_RULES.junction.parting`, which is where the rule lives
 * because the analysis has to exempt exactly the same neighbourhood.
 *
 * The two fields that read it apply it at two different radii, and the
 * difference is load-bearing: THE TRIAL MUST NEVER BE MORE OPTIMISTIC THAN
 * THE BUILD. `armCanLeave` decides whether a junction may exist at all by
 * driving a trial branch against the PLAN walk, and the real branch is then
 * built against the compiled samples — two walks of one plan that diverge
 * by metres, sampled at two strides. Right at the exemption's rim those
 * metres decide whether a piece of route is the branch's own road or a road
 * it may not touch, and where the trial says yes and the build says no what
 * is left on the map is a tarmac stub in a field. So the trial exempts a
 * little LESS than the build, by the slack the two fields already carry:
 * every junction the trial accepts is one the build had at least as much
 * room for. Seed 38's short sprint is the case that named it — the two
 * fields put one piece of route either side of an 80 m rim. */
export const TRIAL_PARTING = R.junction.parting - PLAN_DISTANCE_SLACK;
export const BUILT_PARTING = R.junction.parting + STAGE_DISTANCE_SLACK;

export function planCountry(
  plans: SegmentPlan[],
  width: number,
  rolling: (s: number) => number,
  /** R47 — the dials, for the grade this country's roads follow at. */
  knobs: StageKnobs,
  /** R34 — the ground the road will be laid ALONG. Without it the trial
   * walks a road at its roll alone, which on any stage with relief in it is
   * tens of metres from where the real one ends up: `shelfHolds` then
   * compares a branch's height against a route that is not there, and the
   * junction test stops meaning anything. */
  land: ReturnType<typeof createLandField>,
  /** R24 — the run-up behind the start gate this stage is being built with
   * (`Track.startApron`): a deeper grid stands on more of it, and a branch
   * may no more cross the extra metres than the original ones. */
  apron: number,
): Country {
  const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const pts: { x: number; z: number; y: number; s: number }[] = [];
  const CELL = 48;
  const grid = new Map<number, typeof pts>();
  let x = 0;
  let z = 0;
  let heading = 0;
  let s = 0;
  let rollS = 0;
  // The road builder's eye, at the plan's own resolution: the same lag,
  // grade and crest clamps the compiler walks with, so the trial's heights
  // track the real road's rather than the bare hillside's.
  const F = R.elevation.follow;
  const grade = followGradeOf(knobs);
  const lag = followLagOf(knobs);
  let base = buildableAt(land, 0, 0, rolling(0));
  let slope = 0;
  for (const plan of plans) {
    const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
    const steps = Math.max(1, Math.ceil(plan.length / PLAN_STEP));
    const step = plan.length / steps;
    // R47 — a bored straight is walked level through its bore here too.
    const bore: Bore | null =
      plan.feature === "tunnel" && plan.featureStart !== undefined && plan.featureEnd !== undefined
        ? { from: s + plan.featureStart, to: s + plan.featureEnd, land: land.heightAt }
        : null;
    for (let i = 0; i < steps; i++) {
      heading += curvature * step;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      s += step;
      rollS += step * straightness(curvature);
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (z < box.minZ) box.minZ = z;
      if (z > box.maxZ) box.maxZ = z;
      const roll = rolling(rollS);
      const bored = bore !== null && boredAt(bore, s, x, z, base);
      const ground = bored ? base : buildableAt(land, x, z, roll);
      const cap = bored ? R.tunnel.level : grade;
      const want = base + (ground - base) * (1 - Math.exp(-step / lag));
      let next = (want - base) / step;
      const swing = F.crest * step;
      if (next > slope + swing) next = slope + swing;
      else if (next < slope - swing) next = slope - swing;
      if (next > cap) next = cap;
      else if (next < -cap) next = -cap;
      base += next * step;
      slope = next;
      const point = { x, z, y: base + roll, s };
      pts.push(point);
      const key = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
      const bucket = grid.get(key);
      if (bucket) bucket.push(point);
      else grid.set(key, [point]);
    }
  }
  const slack = PLAN_DISTANCE_SLACK;
  const rings = Math.ceil(ROAD_DISTANCE_REACH / CELL);
  // R24 — the aprons the stage's two ends stand on: plain road extrapolated
  // straight past the start gate and the finish line, which a branch may no
  // more cross than it may cross the stage. Modelled here as well as in the
  // real field, because this one's whole job is to answer the same question
  // the real one will — a trial that does not know about them accepts a
  // junction whose branch is then cut short by one, which is a tarmac road
  // stopping in a field and the exact thing the trial exists to prevent.
  const apronOf = (
    at: { x: number; z: number },
    /** The point the road came FROM, so the heading is `behind → at`. */
    behind: { x: number; z: number },
    sign: 1 | -1,
    /** How far the apron off this end reaches, m — the run-up carries the
     * grid and is as long as that grid is deep; the run-off is fixed. */
    reach: number,
  ): ((x: number, z: number) => number) => {
    const heading = Math.atan2(at.x - behind.x, at.z - behind.z);
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return (x: number, z: number): number => {
      const dx = x - at.x;
      const dz = z - at.z;
      const along = (dx * sin + dz * cos) * sign;
      const lateral = dx * cos - dz * sin;
      return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - reach));
    };
  };
  const n = pts.length;
  const first = apronOf(
    pts[0],
    { x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z },
    -1,
    apron,
  );
  const last = apronOf(pts[n - 1], pts[n - 2] ?? pts[n - 1], 1, R.startZone.apron);
  const parting2 = TRIAL_PARTING * TRIAL_PARTING;
  const roadDistance =
    (meet: { x: number; z: number }) =>
    (px: number, pz: number, ignoring = true): number => {
      let best = Math.min(ROAD_DISTANCE_REACH, first(px, pz), last(px, pz));
      const cx = Math.floor(px / CELL);
      const cz = Math.floor(pz / CELL);
      for (let ring = 0; ring <= rings; ring++) {
        if ((ring - 1) * CELL >= best) break;
        for (let dx = -ring; dx <= ring; dx++) {
          const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
          for (let dz = -ring; dz <= ring; dz += stride) {
            const bucket = grid.get(cellKey(cx + dx, cz + dz));
            if (bucket === undefined) continue;
            for (const p of bucket) {
              const d = Math.hypot(p.x - px, p.z - pz);
              if (d >= best) continue;
              if (ignoring) {
                const mx = p.x - meet.x;
                const mz = p.z - meet.z;
                if (mx * mx + mz * mz < parting2) continue;
              }
              best = d;
            }
          }
        }
      }
      return Math.max(0, best - slack);
    };
  const bench = Math.max(width / 2 + ROAD_CROSS.reach, R.verge.bench);
  /** How far apart in height the stage gets from end to end. The cone opens
   * with distance from the road and never closes, so no point further out
   * than this spread allows can tighten a band already found — which is
   * what bounds the ring walk below to a handful of cells instead of the
   * whole stage. */
  let lowest = Infinity;
  let highest = -Infinity;
  for (const p of pts) {
    if (p.y < lowest) lowest = p.y;
    if (p.y > highest) highest = p.y;
  }
  /** R23 + R31 — the band a ROAD may stand in at a point without its shelf
   * becoming a wall beside the stage: the stage's own verge cone, read as
   * two heights instead of as a yes/no.
   *
   * `shelfHolds` answers whether a given height is legal; this answers what
   * the legal heights ARE, which is what a branch needs while it is being
   * BUILT rather than after. Asked once per branch step, so it walks the
   * same grid `roadDistance` does and stops at the first ring that cannot
   * tighten the answer — the cone only ever opens with distance, so a ring
   * whose nearest possible point is already outside the band is a ring with
   * nothing to say. */
  const shelfBand = (px: number, pz: number): ShelfBand => {
    let ceiling = Infinity;
    let floor = -Infinity;
    const cx = Math.floor(px / CELL);
    const cz = Math.floor(pz / CELL);
    for (let ring = 0; ring <= rings; ring++) {
      // The most height either half of the band still has to give, and
      // therefore the furthest ring that could take any of it away.
      const room = Math.max(
        ceiling < Infinity ? ceiling - lowest : Infinity,
        floor > -Infinity ? highest - floor : Infinity,
      );
      if (room < Infinity && (ring - 1) * CELL > bench + slack + room / R.verge.climb) break;
      for (let dx = -ring; dx <= ring; dx++) {
        const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
        for (let dz = -ring; dz <= ring; dz += stride) {
          const bucket = grid.get(cellKey(cx + dx, cz + dz));
          if (bucket === undefined) continue;
          for (const p of bucket) {
            const d = Math.hypot(p.x - px, p.z - pz);
            const swing = Math.max(0, d - bench - slack) * R.verge.climb;
            if (p.y + swing < ceiling) ceiling = p.y + swing;
            if (p.y - swing > floor) floor = p.y - swing;
          }
        }
      }
    }
    return { floor, ceiling };
  };
  const shelfHolds = (px: number, pz: number, y: number): boolean => {
    for (const p of pts) {
      const apart = Math.abs(y - p.y);
      if (apart <= 0) continue;
      const need = bench + apart / R.verge.climb + slack;
      const dx = p.x - px;
      const dz = p.z - pz;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  };
  return { bounds: box, roadDistance, shelfHolds, shelfBand };
}

export function emptyTrack(
  seed: number,
  endless: boolean,
  knobs: StageKnobs,
  climate: Climate,
  circuit = false,
  startApron: number = R.startZone.apron,
): Track {
  return {
    seed,
    segments: [],
    samples: [],
    step: SAMPLE_STEP,
    length: 0,
    width: roadWidthOf(knobs),
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    pacenotes: [],
    checkpoints: [],
    arena: null,
    startApron: Math.max(R.startZone.apron, startApron),
    endless,
    circuit,
    finishS: null,
    knobs,
    climate,
    highways: [],
    spurs: [],
    publicRoads: [],
    homesteads: [],
    towns: [],
    windFarms: [],
    solarFarms: [],
    powerLines: [],
    junctions: [],
    rails: [],
    culverts: [],
  };
}

/** R22 — a circuit has to close IN HEIGHT as well as on the map.
 *
 * Its last sample lands on its first (that is what makes laps possible),
 * but the road's height is walked forward along the country and there is
 * nothing in that walk to make the last step arrive back where the first
 * one started. What is left is a step at the start line: a car crossing it
 * on lap two drops or climbs it in one sample, which is a wall.
 *
 * The correction is a RAMP, spread over the whole lap. Over kilometres it
 * is a fraction of a percent of grade — under the road's own roll, under
 * anything the physics or the analysis can see — where the same metres
 * taken out at the line are a cliff. It is applied after every warp the
 * compiler does (R17's platforms included) so nothing lands back on top of
 * it, and the junction heights ride the same ramp so a platform still
 * agrees with the road standing on it.
 *
 * Fords and decks ride it too, and have to: the water in a ford is at the
 * road's own height by construction, so moving one without the other is
 * how a crossing ends up perched.
 *
 * WHEN it runs is the other half of the rule, and the reason it is called
 * from inside the compiler rather than after it: BEFORE anything is hung
 * off the road. The samples and the junctions are the only things a ramp
 * can move by arithmetic — every other road on the map is anchored to this
 * one at one end and to the COUNTRY at the other, and there is no offset
 * that is right for both ends of it. What those have instead is their own
 * walk, which starts at the junction's height and follows the land back
 * down at a road's grade; run that walk against a road this has not moved
 * yet and it starts from the wrong height, ending in a step the walk had
 * no room to spend. So the ramp goes in first and the branches are laid
 * against the closed profile, which is also the profile the verge cone
 * (R31) is read off.
 *
 * A junction is written down TWICE and both copies ride — `track.junctions`,
 * which the compiler warps the two mats onto, and the pending note the
 * branch is actually WALKED from. Moving one without the other is worse
 * than moving neither: the mat comes up onto the closed road and the walk
 * under it does not, so the branch is pulled onto the platform over the
 * warp's own falloff and dropped off its rim as a brow a few metres later. */
export function closeCircuitHeight(
  track: Track,
  pending: { elevation: number; s: number }[],
): void {
  const samples = track.samples;
  if (samples.length < 2 || track.length <= 0) return;
  const step = samples[samples.length - 1].elevation - samples[0].elevation;
  if (Math.abs(step) < 1e-6) return;
  for (const s of samples) s.elevation -= step * (s.s / track.length);
  for (const j of track.junctions) j.y -= step * (j.s / track.length);
  for (const j of pending) j.elevation -= step * (j.s / track.length);
  // R41 — a level crossing's rails are laid FLUSH with the road across
  // them, so its height is the route's and rides with it; the arms cut off
  // it (`buildRailArms`) leave from that same height. A culvert's water is
  // not: that is the valley's own level, and the country does not move.
  for (const rail of track.rails) rail.y -= step * (rail.s / track.length);
}
