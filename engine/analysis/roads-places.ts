// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The half of the road-network analysis that is about WHAT THE ROADS LEAD
// TO rather than the roads themselves: where the route's own surface
// changes hands (R17), whether the tarmac leads to a town and whether that
// town's lots stand on the ground it was graded to (R39), whether the
// crowd could actually drive to the stands it is watching from (R42), and
// whether the country's wind and solar farms stand where a country would
// put them (R43).
//
// Split out of `roads.ts` because it is a different question asked of the
// same strands: that file asks whether the network is sound, this one
// whether it is INHABITED.

import { ROAD_CROSS } from "../mapgen/road.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import { type Track } from "../mapgen/compile.ts";
import { padHeight } from "../mapgen/carparks.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { footingOff } from "./roads-strands.ts";
import { type Finding } from "./types.ts";

export function analyzePlaces(track: Track, terrain: TerrainField) {
  const findings: Finding[] = [];
  const R = ANALYSIS.roads;
  // ── R17 — WHERE THE ROUTE'S OWN SURFACE CHANGES. The branches are held
  // to this above (`roads.degrade`); the road the player actually drives
  // was not held to it at all, and it is the one they are looking at.
  //
  // A surface change is a PLACE: the route arrives on one road, turns onto
  // the other, and the road it turned off carries on past the crossing. One
  // in the middle of a straight is a tarmac road that becomes a gravel road
  // for no reason — the loudest of the two classic mistakes in this file's
  // header, and the reason it is worth measuring on the route is that R20
  // makes exactly that trade deliberately: where a borrowed road runs into
  // a corner too tight for a public road, the surfacing simply ends. That
  // is a real, argued exception (see `compile.ts`) and it is still a thing
  // a player sees, so it is COUNTED rather than hidden — the budget says
  // how much of it a stage may carry, and a change that removes some of it
  // shows up here as fewer metres of orphaned surfacing.
  //
  // A ford is not a surface change of this kind: the water is the crossing,
  // and R13 owns it.
  let orphanFlips = 0;
  for (let i = 1; i < track.samples.length; i++) {
    const before = track.samples[i - 1];
    const after = track.samples[i];
    if (before.surface === after.surface) continue;
    if (before.surface === "water" || after.surface === "water") continue;
    // R47 — nor is the SNOWLINE: the road under the snow is the same road,
    // laid by nobody at that height, and it comes out again lower down.
    if (before.surface === "snow" || after.surface === "snow") continue;
    if (before.deck != null || after.deck != null) continue;
    if (track.junctions.some((j) => Math.abs(j.s - after.s) <= R.sweepClear)) continue;
    orphanFlips++;
    findings.push({
      code: "roads.orphan",
      severity: "warn",
      message: `the route stops being ${before.surface} ${after.s.toFixed(
        0,
      )} m in, at no junction — a surface change is a place two roads meet (R17)`,
      at: { x: after.x, z: after.z },
      s: after.s,
      value: 1,
    });
  }

  // ── R39 — DOES THE TARMAC LEAD ANYWHERE? ──────────────────────────────
  //
  // A public road was laid to reach somewhere. Where the stage borrows
  // enough of one to hold a village, a village stands on it; and wherever
  // a town stands, every lot fronts the sealed street from behind its
  // verge — never on the road, never out in the field behind it.
  let longestRun = 0;
  let runStart = -1;
  for (let i = 0; i <= track.samples.length; i++) {
    const paved = i < track.samples.length && track.samples[i].surface === "asphalt";
    if (paved && runStart < 0) runStart = i;
    if (!paved && runStart >= 0) {
      longestRun = Math.max(longestRun, track.samples[i - 1].s - track.samples[runStart].s);
      runStart = -1;
    }
  }
  let townless = 0;
  if (longestRun >= R.townRun && track.towns.length === 0) {
    townless = 1;
    findings.push({
      code: "roads.town",
      severity: "warn",
      message: `${longestRun.toFixed(0)} m of borrowed tarmac with no town on it`,
      value: longestRun,
    });
  }
  let lots = 0;
  let badLots = 0;
  /** R39 — how far the worst building on the stage stands off the ground
   * under it, m. */
  let footing = 0;
  const T = STAGE_RULES.town;
  for (const town of track.towns) {
    const street =
      town.street.kind === "route"
        ? { samples: track.samples, width: track.width }
        : (() => {
            const spur = track.spurs.find((s) => s.atS === town.atS && s.end === town.street.end);
            return spur ? { samples: spur.samples, width: spur.width } : null;
          })();
    if (town.lots.length < T.size.min || town.lots.length > T.size.max) {
      findings.push({
        code: "roads.town",
        severity: "error",
        message: `a town of ${town.lots.length} buildings @${town.atS.toFixed(0)} m`,
        s: town.atS,
        value: town.lots.length,
      });
    }
    const lip = (street?.width ?? track.width) / 2 + ROAD_CROSS.reach;
    for (const lot of town.lots) {
      lots++;
      const b = lot.building;
      let d = Infinity;
      let surface = "gravel";
      for (const s of street?.samples ?? []) {
        const here = Math.hypot(s.x - b.x, s.z - b.z);
        if (here < d) {
          d = here;
          surface = s.surface;
        }
      }
      const front = d - b.plan.depth / 2 - lip;
      const wrong =
        street === null
          ? "stands on a street the track does not have"
          : surface !== "asphalt"
            ? "stands on gravel"
            : front < T.lot.front.min - 0.5
              ? `stands ${front.toFixed(1)} m past the verge, in the road's own margin`
              : front > R.townFront
                ? `stands ${front.toFixed(1)} m back from the street`
                : null;
      // ...and STANDS ON the ground the town was graded onto. Read on
      // `groundAt`, the surface the world draws and the car rides: the
      // analytic field agrees with a lot's own pad by construction, and a
      // pad narrower than the ground lattice never reaches the drawn
      // ground at all (`lattice.ts`) — which is how a street of houses
      // came to be hanging over the country while every number about it
      // read clean.
      const off = footingOff(b, terrain);
      if (off > footing) footing = off;
      if (off > R.townFooting) {
        findings.push({
          code: "roads.footing",
          severity: "error",
          message:
            `a ${b.plan.kind} stands ${off.toFixed(2)} m off the ground under it ` +
            `@${town.atS.toFixed(0)} m — the village's ground is not under its houses`,
          at: { x: b.x, z: b.z },
          s: town.atS,
          value: off,
        });
      }
      if (!wrong) continue;
      badLots++;
      findings.push({
        code: "roads.lots",
        severity: "error",
        message: `a ${b.plan.kind} ${wrong} @${town.atS.toFixed(0)} m`,
        at: { x: b.x, z: b.z },
        s: town.atS,
        value: front,
      });
    }
  }

  // ── R42 — DID THE CROWD DRIVE HERE? ────────────────────────────────────
  //
  // Every stand is reached from a car park a walk away, and every car park
  // holds its cars, stands off the route, and is reached by a road that
  // goes somewhere: into a public road already there, or out to the edge of
  // the map. The trails between never touch the route's mat.
  const stands = terrain.stands;
  const parks = terrain.carParks;
  /** Trails per stand arc position — the two finish banks share one. */
  const trailsAt = new Map<number, number>();
  for (const park of parks) {
    for (const trail of park.trails)
      trailsAt.set(trail.standS, (trailsAt.get(trail.standS) ?? 0) + 1);
  }
  let unserved = 0;
  for (const stand of stands) {
    const left = trailsAt.get(stand.s) ?? 0;
    if (left > 0) {
      trailsAt.set(stand.s, left - 1);
      continue;
    }
    // R42 — the finish's own banks are the one crowd that does not have to
    // have found its own way in: the organisers' road and the service area
    // are there by construction, so a finish the country will not grade a
    // pad behind keeps its crowd rather than losing it.
    if (stand.finish) continue;
    unserved++;
    findings.push({
      code: "roads.served",
      severity: "warn",
      message: `a stand @${stand.s.toFixed(0)} m has no car park within a walk (R42)`,
      at: { x: stand.x, z: stand.z },
      s: stand.s,
      value: 1,
    });
  }
  let badParks = 0;
  const half = track.width / 2;
  const C = STAGE_RULES.carPark;
  for (const park of parks) {
    const wrong: string[] = [];
    // R42 — the two halves of the crowd-and-cars rule. Every car could have
    // been driven by somebody standing at the corner, and every spectator
    // could have got here in one of the cars.
    const cars = park.cars.length;
    if (cars > park.heads) wrong.push(`${cars} cars for a crowd of ${park.heads}`);
    if (cars * C.occupancy.max < park.heads) {
      wrong.push(`${cars} cars could not have carried ${park.heads} people`);
    }
    const road = park.road.samples;
    const first = road[0];
    const last = road[road.length - 1];
    if (Math.hypot(last.x - park.pad.x, last.z - park.pad.z) > 1) {
      wrong.push("its lane does not reach the pad");
    }
    // R42 — and it goes somewhere: onto a road that is THERE (an arm, a
    // public road the route never met, or another car park's lane, which
    // leaves one of those itself), or off the map past the fog.
    if (park.access === "map") {
      const b = track.bounds;
      const out = Math.max(b.minX - first.x, first.x - b.maxX, b.minZ - first.z, first.z - b.maxZ);
      if (out < R.escape) wrong.push(`its lane stops ${out.toFixed(0)} m past the box, in a field`);
    } else {
      const lines = [
        ...track.spurs.filter((s) => !s.rail).map((s) => s.samples),
        ...track.publicRoads.map((r) => r.samples),
        ...parks.filter((p) => p !== park).map((p) => p.road.samples),
      ];
      const joined = lines.some((line) =>
        line.some((s) => Math.hypot(s.x - first.x, s.z - first.z) < 1),
      );
      if (!joined) wrong.push("its lane leaves no road the track has");
    }
    // R42 — a field off the course, not a lay-by beside it. Measured over
    // the samples themselves rather than through the terrain's road field,
    // which stops answering three grid cells out — 144 m, which is inside
    // the number being checked.
    let off = Infinity;
    for (const sample of track.samples) {
      const d = Math.hypot(sample.x - park.pad.x, sample.z - park.pad.z);
      if (d < off) off = d;
    }
    if (off < C.standOff) wrong.push(`its pad stands ${off.toFixed(0)} m off the route`);
    if (
      terrain.roadDistanceAt(park.pad.x, park.pad.z) <
      park.pad.radius + half + ROAD_CROSS.reach
    ) {
      wrong.push("its pad stands in the route's corridor");
    }
    // R23 — the lane is a road, and the route is the one road it may never
    // share ground with: not even where it leaves the arm at a junction,
    // because it leaves the arm past the barrier, well clear of the route.
    if (
      road.some(
        (s) => terrain.roadDistanceAt(s.x, s.z) < half + ROAD_CROSS.reach + C.road.width / 2,
      )
    ) {
      wrong.push("its lane runs onto the route");
    }
    if (Math.hypot(park.pad.grade.x, park.pad.grade.z) > C.pad.maxGrade + 1e-6) {
      wrong.push("its pad is graded steeper than a car park can be");
    }
    for (const trail of park.trails) {
      const length = trail.samples[trail.samples.length - 1].s;
      if (length > R.parkWalk) {
        wrong.push(`a trail of ${length.toFixed(0)} m`);
        break;
      }
      if (trail.samples.some((p) => terrain.roadDistanceAt(p.x, p.z) < half)) {
        wrong.push("a trail crosses the road");
        break;
      }
    }
    // The cars stand on the pad's own plane — a car floating over a hillside
    // is the pad the terrain graded and the pad the cars were placed on
    // disagreeing.
    if (park.cars.some((car) => Math.abs(car.y - padHeight(park.pad, car.x, car.z)) > 0.05)) {
      wrong.push("a car stands off the pad's plane");
    }
    if (wrong.length === 0) continue;
    badParks++;
    findings.push({
      code: "roads.parking",
      severity: "error",
      message: `the car park @${park.atS.toFixed(0)} m ${wrong.join(", ")} (R42)`,
      at: { x: park.pad.x, z: park.pad.z },
      s: park.atS,
      value: wrong.length,
    });
  }

  /** The route's elevation at an arc position: the road a farm was placed
   * FROM, which is the road the rule's rise is measured over — a stage that
   * folds back can bring a higher piece of road nearer the string later,
   * and that one has no claim on it. */
  const routeElevationAt = (t: Track, atS: number): number => {
    let sample = t.samples[0];
    for (const s of t.samples) {
      sample = s;
      if (s.s >= atS) break;
    }
    return sample.elevation;
  };

  // ── R43 — DOES THE COUNTRY MAKE POWER WHERE IT SHOULD? ─────────────────
  //
  // Every wind farm stands OVER the road it is seen from, every tower off
  // the route by more than a rotor and off every other road; every solar
  // farm is fenced on ground level enough for its rows, off the route's
  // corridor and out of the water at every corner.
  const E = STAGE_RULES.energy;
  let badPlants = 0;
  const plants = track.windFarms.length + track.solarFarms.length;
  for (const farm of track.windFarms) {
    const wrong: string[] = [];
    let top = -Infinity;
    const roadUnder = routeElevationAt(track, farm.atS);
    for (const t of farm.turbines) {
      const d = terrain.roadDistanceAt(t.x, t.z);
      if (d < farm.rotor / 2 + half + ROAD_CROSS.reach) {
        wrong.push(`a tower ${d.toFixed(0)} m off the route, inside its rotor's sweep`);
        break;
      }
      if (terrain.waterAt(t.x, t.z) !== null) {
        wrong.push("a tower standing in water");
        break;
      }
      if (t.y > top) top = t.y;
    }
    if (farm.turbines.length < E.wind.count.min) wrong.push("a string too short to be a farm");
    if (top - roadUnder < E.wind.rise - E.wind.pad.level) {
      wrong.push(`its top pad ${(top - roadUnder).toFixed(0)} m over the road — no rise`);
    }
    if (wrong.length === 0) continue;
    badPlants++;
    findings.push({
      code: "roads.energy",
      severity: "error",
      message: `the wind farm @${farm.atS.toFixed(0)} m has ${wrong.join(", ")} (R43)`,
      at: { x: farm.turbines[0].x, z: farm.turbines[0].z },
      s: farm.atS,
      value: wrong.length,
    });
  }
  for (const farm of track.solarFarms) {
    const wrong: string[] = [];
    const { rect } = farm;
    const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
    const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
    let lo = Infinity;
    let hi = -Infinity;
    for (const u of [-0.5, 0, 0.5]) {
      for (const v of [-0.5, 0, 0.5]) {
        const x = rect.x + right.x * u * rect.depth + fwd.x * v * rect.width;
        const z = rect.z + right.z * u * rect.depth + fwd.z * v * rect.width;
        if (terrain.roadDistanceAt(x, z) < half + ROAD_CROSS.reach) {
          wrong.push("its fence in the route's corridor");
        }
        if (terrain.waterAt(x, z) !== null) wrong.push("a corner in the water");
        const y = terrain.groundAt(x, z);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (farm.rows < 1 || farm.perRow < 1) wrong.push("no tables");
    // A farm laid at the top of a road's cutting shows more fall on the
    // SHAPED ground than the placer read off the bare country: the tables
    // follow the ground table by table, so it is a blemish — a farm on a
    // hillside — and not a defect, which is why it is a warning on its own.
    const diagonal = Math.hypot(rect.width, rect.depth);
    const steep = hi - lo > E.solar.slope * diagonal * R.energySlopeSlack;
    if (wrong.length === 0 && !steep) continue;
    badPlants++;
    findings.push({
      code: "roads.energy",
      severity: wrong.length > 0 ? "error" : "warn",
      message:
        wrong.length > 0
          ? `the solar farm @${farm.atS.toFixed(0)} m has ${[...new Set(wrong)].join(", ")} (R43)`
          : `the solar farm @${farm.atS.toFixed(0)} m stands on ${(hi - lo).toFixed(1)} m of fall (R43)`,
      at: { x: rect.x, z: rect.z },
      s: farm.atS,
      value: Math.max(wrong.length, 1),
    });
  }

  return {
    orphanFlips,
    lots,
    badLots,
    longestRun,
    unserved,
    badParks,
    badPlants,
    townless,
    footing,
    plants,
    stands,
    parks,
    findings,
  };
}
