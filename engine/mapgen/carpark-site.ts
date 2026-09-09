// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FINDING A CAR PARK SOMEWHERE TO STAND. Every question here is asked of
// the country rather than of the car park: where the public roads within
// reach are and which of them may be left from, which points on the ground
// a pad could sit on, whether one of them actually fits (level enough, off
// the route, off everything already built), and how a lane's profile eases
// off the road it leaves and onto the plane it arrives at. `carparks.ts`
// asks them in order and commits the first answer that holds.

import { smooth } from "../lib/noise.ts";
import { type Rng } from "../lib/prng.ts";
import { type ParkedCar } from "./buildings.ts";
import type { Track } from "./compile.ts";
import { CELL, createCountryMap, type CountryMap } from "./carpark-map.ts";
import { standBack, type TrailProbe } from "./carpark-trail.ts";
import { corridorOffset, ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { SPUR, followStep, type SpurLine, type SpurSample } from "./spurs.ts";
import { type Stand } from "./stands.ts";
import {
  clamp01,
  JOIN_STRIDE,
  LANE_REACH,
  P,
  padHeight,
  parkBays,
  STREAMED_BOX,
  type Access,
  type CarPark,
  type CarParkAccess,
  type CarParkContext,
  type CarParkPad,
} from "./carpark-plan.ts";

/** Everything a siting question needs to know about the stage it is being
 * asked on. Settled once per field; `built` is live — it answers over the
 * car parks committed so far, which is what keeps two of them apart. */
export type SitingDeps = {
  track: Track;
  corridor: number;
  nearRoute: (x: number, z: number) => boolean;
  carParks: CarPark[];
};

export function createSiting(deps: SitingDeps) {
  const { track, corridor, nearRoute, carParks } = deps;
  /** The country map round a place. A finite stage's box is the stage's
   * own; an endless one has no box, so the map is the neighbourhood and a
   * road that leaves it has left. Rebuilt for every car park, because the
   * built things it keeps a road off change as each one is committed. */
  const countryMap = (ctx: CarParkContext, near: { x: number; z: number }): CountryMap => {
    const bounds = track.endless
      ? {
          minX: near.x - STREAMED_BOX,
          maxX: near.x + STREAMED_BOX,
          minZ: near.z - STREAMED_BOX,
          maxZ: near.z + STREAMED_BOX,
        }
      : track.bounds;
    // ...and how far past that box the LATTICE has to look. The tarmac a
    // lane wants to reach is laid across the whole world (R17), and the box
    // a rally folds itself into is a corner of it: measured over seeds 1-12
    // at medium, the public road on a stage comes between 175 m and 970 m
    // of the route, and a lattice that stopped at the escape covered none
    // of it on ten of the twelve. Extended to whichever roads stand within
    // `LANE_REACH` of the box, and no further — a lane is a lane, not a
    // second stage's worth of road.
    let nearest = Infinity;
    for (const road of [...track.publicRoads, ...track.spurs]) {
      for (let i = 0; i < road.samples.length; i += 8) {
        const s = road.samples[i];
        const out = Math.max(
          bounds.minX - s.x,
          s.x - bounds.maxX,
          bounds.minZ - s.z,
          s.z - bounds.maxZ,
          0,
        );
        if (out < nearest) nearest = out;
      }
    }
    const reach = nearest <= LANE_REACH ? nearest : 0;
    return createCountryMap(
      bounds,
      {
        routeDistance: ctx.routeDistance,
        builtClearance: ctx.builtClearance,
        blocked: ctx.blocked,
        flooded: ctx.land.flooded,
        corridor,
      },
      reach > 0 ? reach + 2 * CELL : undefined,
    );
  };

  /** Every road a car park's lane may leave from, and the stretch of each
   * that is open to it. Three kinds, and the walk over them is the same
   * walk — what differs is only where a road STARTS being open:
   *
   *   an ARM, past its barrier and off the junction's platform, because a
   *   car arrives from the outside world and never through the tape;
   *   a PUBLIC ROAD the route never met, open along the whole of it —
   *   nothing is shut on a road nobody closed;
   *   and an earlier car park's own LANE, short of its pad, because a lane
   *   that joins another at its far end is a lane that joins a car park.
   *
   * `each` is called with every open point; the two readers below want the
   * nearest per road and the coarse picture respectively. */
  const openRoads = (
    each: (line: SpurLine, kind: CarParkAccess, sample: SpurSample) => void,
  ): void => {
    const walk = (line: SpurLine, kind: CarParkAccess, fromS: number, toS: number): void => {
      for (let i = 0; i < line.samples.length; i += 2) {
        const sample = line.samples[i];
        if (sample.s < fromS || sample.s > toS) continue;
        each(line, kind, sample);
      }
    };
    for (const spur of track.spurs) {
      if (spur.rail) continue;
      walk(
        spur,
        "arm",
        Math.max(R.junction.parting, (spur.block?.s ?? SPUR.block.from) + 30),
        Infinity,
      );
    }
    for (const road of track.publicRoads) walk(road, "road", 0, Infinity);
    for (const park of carParks) {
      const end = park.road.samples[park.road.samples.length - 1].s;
      walk(park.road, "park", 30, end - park.pad.radius - 40);
    }
  };

  /** The nearest open point of each road within `P.reach` of a place, the
   * closest road first. */
  const accessPoints = (from: { x: number; z: number }): Access[] => {
    const best = new Map<SpurLine, Access>();
    openRoads((line, kind, sample) => {
      const d = Math.hypot(sample.x - from.x, sample.z - from.z);
      if (d >= P.reach) return;
      const had = best.get(line);
      if (!had || d < had.d) best.set(line, { line, sample, kind, d });
    });
    return [...best.values()].sort((a, b) => a.d - b.d);
  };

  /** The nearest point on a road a lane may RUN INTO — an arm past its
   * barrier, or an earlier car park's own road out — within `within`
   * metres, or null. Strided: the answer is compared against a clearance
   * in the tens of metres. */
  const nearestJoin = (x: number, z: number, within: number): Access | null => {
    let best: Access | null = null;
    openRoads((line, kind, sample) => {
      const d = Math.hypot(sample.x - x, sample.z - z);
      if (d < within && (!best || d < best.d)) best = { line, sample, kind, d };
    });
    return best;
  };

  /** The roads a lane may run into, as a flat list of points every few
   * samples — the coarse picture a search steers by. */
  const joinPoints = (): number[] => {
    const out: number[] = [];
    let n = 0;
    openRoads((_line, _kind, sample) => {
      if (n++ % (JOIN_STRIDE / 2) === 0) out.push(sample.x, sample.z);
    });
    return out;
  };

  /** The points a pad is judged at: its centre and two rings. Sixteen a
   * ring, because a stream is a few metres wide and eight would let one
   * through between two probes. */
  const padProbes = (x: number, z: number, radius: number): { x: number; z: number }[] => {
    const out: { x: number; z: number }[] = [{ x, z }];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [radius * 0.35, radius * 0.7, radius]) {
        out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
      }
    }
    return out;
  };

  /** Is this a place a pad could be graded: clear of the route by the pad's
   * margin, clear of every other built thing, dry, off the streams and the
   * mounds, and no more than `level` off one plane anywhere across it —
   * and not standing where the crowd already does. Returns the pad the
   * place would take, or null. */
  const padFits = (
    ctx: CarParkContext,
    x: number,
    z: number,
    radius: number,
    stands: readonly Stand[],
    /** The road the pad hangs off, exempt from the built-clearance test
     * where the road's own mouth runs onto the pad. */
    exempt: { x: number; z: number; heading: number } | null,
  ): CarParkPad | null => {
    const probes = padProbes(x, z, radius);
    const refuse = (why: string): null => {
      ctx.note?.(`pad:${why}`);
      return null;
    };
    // A field off the course, not a lay-by beside it: the pad stands clear
    // of the route by the walk in, and the crowd covers the rest on foot.
    if (nearRoute(x, z)) return refuse("standoff");
    const heights: number[] = [];
    for (const p of probes) {
      if (ctx.routeDistance(p.x, p.z) < corridor + P.pad.clear) return refuse("route");
      if (ctx.blocked(p.x, p.z)) return refuse("blocked");
      if (ctx.land.flooded(p.x, p.z, SPUR.shoreFreeboard)) return refuse("flooded");
      // The road the pad is reached by runs through its rim: the probes
      // on that road's own line are not standing on somebody else's.
      let onRoad = false;
      if (exempt) {
        const rx = Math.cos(exempt.heading);
        const rz = -Math.sin(exempt.heading);
        const lateral = Math.abs((p.x - exempt.x) * rx + (p.z - exempt.z) * rz);
        onRoad = lateral < P.road.width / 2 + ROAD_CROSS.reach + 1;
      }
      if (!onRoad && ctx.builtClearance(p.x, p.z) < 6) return refuse("built");
      // The ground as the terrain has already SHAPED it, not the bare
      // country: beside the road R31 has cut the hillside back to its cone,
      // and a pad fitted to the hill that was there before the cut is a pad
      // standing over the cone at its near rim, on every stage with any
      // relief in it.
      heights.push(ctx.heightAt(p.x, p.z));
    }
    // The plane the pad is graded to: the least-squares fit through the
    // probes, which on two symmetric rings round the centre is the mean
    // height and the moment of the heights about each axis. Held to a
    // grade a car park can be parked on; steeper country than that is a
    // hillside, and the residual says so.
    let sum = 0;
    let mx = 0;
    let mz = 0;
    let spread = 0;
    probes.forEach((p, i) => {
      sum += heights[i];
      mx += heights[i] * (p.x - x);
      mz += heights[i] * (p.z - z);
      spread += (p.x - x) * (p.x - x);
    });
    const y = sum / probes.length;
    const grade = { x: mx / spread, z: mz / spread };
    const steep = Math.hypot(grade.x, grade.z);
    if (steep > P.pad.maxGrade) {
      grade.x *= P.pad.maxGrade / steep;
      grade.z *= P.pad.maxGrade / steep;
    }
    const pad: CarParkPad = { x, z, y, radius, grade };
    // R31 — and nowhere above the terrain's OWN cone: a pad is the floor
    // on the cone (terrain.ts), so a plane standing over it is the wall
    // beside the road the cone exists to take down. The terrain's cone and
    // not a restatement of it at the verge's climb — the cut is made at
    // the grade R34 gives the road, and a gentler copy refused half the
    // country beside every road with relief in it.
    let wall = false;
    probes.forEach((p, i) => {
      const level = padHeight(pad, p.x, p.z);
      if (Math.abs(level - heights[i]) > P.pad.level) heights[i] = NaN;
      if (level > ctx.ceilingAt(p.x, p.z)) wall = true;
    });
    if (heights.some((h) => Number.isNaN(h))) return refuse("level");
    if (wall) return refuse("band");
    // Never under the crowd: a pad's blend would regrade the ground a stand
    // is standing on.
    for (const stand of stands) {
      const back = standBack(stand);
      for (const q of [stand, back]) {
        if (Math.hypot(q.x - x, q.z - z) < radius + 4) return refuse("stand");
      }
    }
    for (const other of carParks) {
      if (Math.hypot(other.pad.x - x, other.pad.z - z) < P.pad.apart) return refuse("apart");
    }
    return pad;
  };

  /** One step of a lane's height: the minor road's rule (`followStep`), at
   * a car park lane's own grade. */
  const profileStep = (y: number, slope: number, target: number): { y: number; slope: number } =>
    followStep(y, slope, target, P.road.maxGrade);

  /** The pad's plane's own slope along a heading, m per m — what a lane
   * that leaves the pad along it is already climbing. */
  const planeSlope = (pad: CarParkPad, heading: number): number =>
    pad.grade.x * Math.sin(heading) + pad.grade.z * Math.cos(heading);

  /** Is the lane, as it stands, a road end to end — no step in it steeper
   * than a lane or a pad is built to? The last word on a lane, asked
   * after the pad's blend: everything above lays the profile to arrive on
   * the plane, and where the country gave it too short a run to, the blend
   * turns what is left into a ramp. A lane that fails this is not built,
   * and the search tries another way in (R42: reject, never repair). */
  const gradesHold = (samples: SpurSample[]): boolean => {
    const most = Math.max(P.road.maxGrade, P.pad.maxGrade) + 0.02;
    for (let i = 1; i < samples.length; i++) {
      const run = samples[i].s - samples[i - 1].s;
      if (run <= 1e-6) return false;
      if (Math.abs(samples[i].elevation - samples[i - 1].elevation) > most * run) return false;
    }
    return true;
  };

  /** Ease a lane's FIRST stretch off the road it leaves, so a car turning
   * in rides that road's cross-section instead of dropping off it.
   *
   * A lane that is searched out over the country (`layRoadOut`) arrives at
   * the road it joins on that road's CROWN — which on tarmac stands
   * `asphaltLift` proud of the country and cambers away either side — and
   * then carries on at its own height. The terrain lays the joined road's
   * mat out to `ROAD_CROSS.reach` past its edge, so the lane's first few
   * metres run across ground that is the road's, not theirs: a quarter of a
   * metre of step at the mouth of every join, which the lane roller finds
   * one metre in. `tryAccess` never had it because a lane leaving a road
   * square is laid ON the cross-section from the start; this is the same
   * thing for a lane that arrives at an angle, blended out over the mat so
   * the lane's own profile takes over where the road's stops. */
  const easeOffJoin = (
    samples: SpurSample[],
    join: { sample: SpurSample; line: SpurLine },
  ): void => {
    const at = join.sample;
    const half = join.line.width / 2;
    const lip = half + ROAD_CROSS.reach;
    const shape = { surface: at.surface, lift: at.lift, flat: at.flat };
    const rx = Math.cos(at.heading);
    const rz = -Math.sin(at.heading);
    for (const sample of samples) {
      if (sample.s > lip) break;
      const lateral = (sample.x - at.x) * rx + (sample.z - at.z) * rz;
      const on =
        at.elevation +
        corridorOffset(shape, Math.max(-lip, Math.min(lip, lateral)), join.line.width);
      // The road's own surface while the lane is on its mat, then handed
      // back to the lane over the verge — the same hand-over R16 gives the
      // ground beside any road.
      const t = smooth(clamp01((Math.abs(lateral) - half) / ROAD_CROSS.reach));
      sample.elevation = on * (1 - t) + sample.elevation * t;
    }
  };

  /** Ease a road's last stretch onto the pad it runs onto, so the two are
   * one piece of ground rather than a ramp meeting a table. The lanes are
   * laid to arrive on the plane already (`profileStep` toward it on the
   * way in, `PLANE_RUN` of it on the way out), so what is blended here is
   * a residual, not a step. */
  const easeOntoPad = (samples: SpurSample[], pad: CarParkPad): void => {
    for (const sample of samples) {
      const d = Math.hypot(sample.x - pad.x, sample.z - pad.z);
      const level = padHeight(pad, sample.x, sample.z);
      if (d <= pad.radius) sample.elevation = level;
      else if (d < pad.radius + P.pad.blend) {
        const t = smooth(clamp01((d - pad.radius) / P.pad.blend));
        sample.elevation = level * (1 - t) + sample.elevation * t;
      }
    }
  };

  /** The world as a WALK sees it (`carpark-trail.ts`), which is the placer's
   * own context minus everything only a road asks about. */
  const trailProbe = (ctx: CarParkContext): TrailProbe => ({
    routeDistance: ctx.routeDistance,
    builtClearance: ctx.builtClearance,
    blocked: ctx.blocked,
    flooded: ctx.land.flooded,
    heightAt: ctx.heightAt,
    corridor,
    note: ctx.note,
  });

  /** The cars, nosed into the bays. `park.cars` many of them, which is the
   * crowd's own number (`carsFor`) — the spaces the blade left over stand
   * empty, and which ones do is a roll. */
  const fillBays = (
    rng: Rng,
    park: { pad: CarParkPad; heading: number; bays: number; count: number },
  ): ParkedCar[] => {
    const bays = parkBays(park);
    const empty = new Set<number>();
    while (empty.size < bays.length - park.count) empty.add(rng.int(0, bays.length - 1));
    const cars: ParkedCar[] = [];
    bays.forEach((bay, i) => {
      if (empty.has(i)) return;
      const fx = Math.sin(bay.heading);
      const fz = Math.cos(bay.heading);
      const rx = Math.cos(bay.heading);
      const rz = -Math.sin(bay.heading);
      const back = rng.range(-0.25, 0.25);
      const side = rng.range(-0.2, 0.2);
      const cx = bay.x + fx * back + rx * side;
      const cz = bay.z + fz * back + rz * side;
      cars.push({
        x: cx,
        z: cz,
        y: padHeight(park.pad, cx, cz),
        heading: bay.heading + rng.range(-0.08, 0.08),
        roll: rng.next(),
      });
    });
    return cars;
  };

  return {
    countryMap,
    accessPoints,
    nearestJoin,
    joinPoints,
    padFits,
    profileStep,
    planeSlope,
    gradesHold,
    easeOffJoin,
    easeOntoPad,
    trailProbe,
    fillBays,
  };
}
