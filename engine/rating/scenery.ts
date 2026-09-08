// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCENERY — the country the road runs through, which on a generated stage
// is as much of the level as the road is.
//
// This is the facet a rally judge would never need and this game cannot do
// without. A real stage is a road somebody found in a landscape that was
// already there; every stage here is a landscape the same seed invented, so
// "is the road any good" and "is there anywhere worth driving it" are two
// separate questions and only one of them is about the road.
//
// The trait that carries the facet is `enclosureSwing`, and it is the one
// worth understanding before moving anything in here. A stage that is
// closed forest end to end and a stage that is open heath end to end score
// the same on `enclosure` at opposite ends of it, and BOTH are one place
// repeated. What makes a stage read as a journey is coming out of the trees
// onto open ground and going back into them — the light changes, the
// horizon arrives, the sound changes, and the same road feels faster. So
// the swing is measured over `sampling.window` stretches: how much the
// stage's places differ from each other, rather than how much any metre
// differs from the one before it, which is noise.
//
// The last trait in the facet is about the country making SENSE rather than
// about it being pretty, and it is the one that catches a fault a picture
// makes obvious and no other measurement here can see. R17 lays the public
// roads across the country before the rally is routed, whole, running off
// one edge of the map and out the other — and a road drawn like that with
// nothing on it is a road that goes from nowhere to nowhere. Every bend on a
// real road goes around something and every road runs BETWEEN two things: a
// village, a farm, a landing on a lake, a place to leave a car. So
// `roadsGo` walks each sealed road and asks whether there is something at
// each end of it. A road that has a town at one end and empty country at
// the other is half a road; one with nothing anywhere is scenery pretending
// to be infrastructure.
//
// Everything here is read off the TERRAIN FIELD rather than off the bare
// geology, for `analysis/ground.ts`'s reason: R31 cuts the landscape back
// to a cone beside every road, so a stage can be set in magnificent country
// with all of it pushed over the horizon and a lawn either side of the car.
// What is measured is what is seen from the seat.

import { LAKE_Y } from "../mapgen/land.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { RATING } from "./scales.ts";
import { effectiveKinds, spread, type Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

/** How many trunks have to stand inside the near ring before the road
 * counts as closed in on that side. A handful of birches is a verge; this
 * many is a wall the light does not get through. */
const TREES_CLOSED = 5;

/** ...and how far the ground has to stand above the road inside the near
 * ring for the same, m — a cutting, a bank, a shoulder that became a wall. */
const RISE_CLOSED = 3.2;

/** How much of a cutting counts (R34's `cutAt`): blasted rock over the
 * verge closes a road in exactly as a spruce stand does. */
const CUT_CLOSED = 0.35;

/** HOW MUCH SOMETHING THIS FAR FROM THE STAGE COUNTS, 1 down to 0.
 *
 * The generator builds a whole map; a rally is a road through part of it. A
 * village four kilometres off the route is not on this stage — nobody
 * driving it will ever know the village is there — and counting it credits
 * a seed for scenery the player never sees. Full weight inside `close`,
 * where a thing is simply beside the road and its exact distance stops
 * mattering, then falling away to nothing at `notice`. */
function notice(distance: number): number {
  const S = RATING.sampling;
  if (distance <= S.close) return 1;
  if (distance >= S.notice) return 0;
  return 1 - (distance - S.close) / (S.notice - S.close);
}

/** Distance from a point to the nearest metre of the TIMED stage, m.
 *
 * `terrain.roadDistanceAt` answers a related question and the wrong one: it
 * measures to the nearest road of any kind and gives up past the corridor's
 * own range, which is a fifth of the distance anything here cares about. */
function stageDistance(walk: Walk, x: number, z: number): number {
  const samples = walk.track.samples;
  // Every fifth probe: the probes are 6 m apart and the answer is wanted to
  // the nearest tens of metres, so a 30 m walk is far finer than the fade.
  let best = Infinity;
  for (let p = 0; p < walk.probes.length; p += 5) {
    const sample = samples[walk.probes[p]];
    const dx = sample.x - x;
    const dz = sample.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function rateScenery(walk: Walk, terrain: TerrainField): Facet {
  const started = Date.now();
  const S = RATING.scenery;
  const track = walk.track;
  const samples = track.samples;
  const near = RATING.sampling.near;
  const far = RATING.sampling.far;

  const closed: number[] = [];
  let watery = 0;
  let skylineSum = 0;
  const ground = { soil: 0, rock: 0, sand: 0, snow: 0, ice: 0, water: 0 };

  for (const i of walk.probes) {
    const sample = samples[i];
    const nx = Math.cos(sample.heading);
    const nz = -Math.sin(sample.heading);
    // Perpendicular to travel, in the same convention `shift` uses.
    const px = -nz;
    const pz = nx;

    let sideClosed = false;
    const trees = terrain.treesNear(sample.x, sample.z, near).length;
    if (trees >= TREES_CLOSED) sideClosed = true;
    for (const side of [-1, 1]) {
      const x = sample.x + px * near * side;
      const z = sample.z + pz * near * side;
      if (terrain.heightAt(x, z) - sample.elevation > RISE_CLOSED) sideClosed = true;
      if (terrain.cutAt(x, z) > CUT_CLOSED) sideClosed = true;
    }
    closed.push(sideClosed ? 1 : 0);

    let sawWater = false;
    let high = -Infinity;
    let low = Infinity;
    for (let spoke = 0; spoke < RATING.sampling.spokes; spoke++) {
      const angle = (spoke / RATING.sampling.spokes) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      for (const reach of [near * 2.4, far * 0.45]) {
        const x = sample.x + dx * reach;
        const z = sample.z + dz * reach;
        if (terrain.waterAt(x, z) !== null || terrain.iceAt(x, z) !== null) sawWater = true;
        tallyGround(terrain, x, z, ground);
      }
      const y = terrain.farHeightAt(sample.x + dx * far, sample.z + dz * far);
      if (y > high) high = y;
      if (y < low) low = y;
    }
    if (sawWater) watery++;
    if (Number.isFinite(high) && Number.isFinite(low)) skylineSum += high - low;
  }

  const probes = Math.max(1, walk.probes.length);
  const enclosure = closed.reduce((a, b) => a + b, 0) / probes;
  const swing = windowSwing(walk, closed);
  const landmarks = countLandmarks(walk, terrain);
  const roads = roadsGoSomewhere(walk, terrain);

  const traits: Trait[] = [
    trait(
      "scenery.enclosure",
      "share of it the country closes in on",
      "share",
      enclosure,
      S.enclosure,
      1.0,
    ),
    trait(
      "scenery.enclosureSwing",
      "how much the country CHANGES along the stage",
      "spread",
      swing,
      S.enclosureSwing,
      1.3,
    ),
    trait(
      "scenery.landmarks",
      "things people built, passed a kilometre",
      "/km",
      landmarks.total / walk.km,
      S.landmarks,
      0.95,
    ),
    trait(
      "scenery.water",
      "share of it with water in sight",
      "share",
      watery / probes,
      S.water,
      0.85,
    ),
    trait(
      "scenery.skyline",
      "how much country the eye reaches over",
      "m",
      skylineSum / probes,
      S.skyline,
      0.9,
    ),
    trait(
      "scenery.roadsGo",
      "share of the sealed roads with something at both ends",
      "share",
      roads.share,
      S.roadsGo,
      1.0,
    ),
    trait(
      "scenery.groundMix",
      "how many kinds of ground the road actually runs past",
      "kinds",
      effectiveKinds([
        ground.soil,
        ground.rock,
        ground.sand,
        ground.snow,
        ground.ice,
        ground.water,
      ]),
      S.groundMix,
      0.8,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayScenery);
  notes.push({
    code: "scenery.passes",
    sense: "note",
    message: landmarks.message,
    value: landmarks.total,
  });
  if (roads.nowhere > 0) {
    notes.push({
      code: "scenery.roadsGo",
      sense: "thin",
      message: `${roads.nowhere} of ${roads.total} sealed roads run from nowhere to nowhere`,
      value: roads.nowhere,
    });
  }

  return {
    id: "scenery",
    label: "scenery",
    score: facetScore(traits),
    weight: RATING.weights.scenery,
    traits,
    notes,
    stats: {
      enclosure: Math.round(enclosure * 1000) / 1000,
      enclosureSwing: Math.round(swing * 1000) / 1000,
      landmarks: Math.round(landmarks.total * 100) / 100,
      towns: Math.round(landmarks.towns * 100) / 100,
      homesteads: Math.round(landmarks.homesteads * 100) / 100,
      farms: Math.round(landmarks.farms * 100) / 100,
      waterInView: Math.round((watery / probes) * 1000) / 1000,
      skyline: Math.round(skylineSum / probes),
      sealedRoads: roads.total,
      roadsToNowhere: roads.nowhere,
    },
    ms: Date.now() - started,
  };
}

/** What the ground at a point IS, for the mix. Asked in the order the
 * layers physically sit: something frozen or flooded over it wins over
 * whatever is under it, then the winter's blanket, then whether there is
 * enough soil on the rock to grow anything. */
function tallyGround(
  terrain: TerrainField,
  x: number,
  z: number,
  into: Record<string, number>,
): void {
  if (terrain.iceAt(x, z) !== null) into.ice++;
  else if (terrain.waterAt(x, z) !== null) into.water++;
  else if (terrain.blanketAt(x, z) > 0.05) into.snow++;
  else {
    const soil = terrain.geology.soilAt(x, z);
    // A shallow skin over the bedrock IS bedrock from the seat: nothing
    // roots in it and it is painted as rock. The desert's own loose cover
    // is separated by the country rather than by the depth — sand is deep
    // and still nothing grows.
    if (soil < 0.25) into.rock++;
    else if (terrain.geology.wetAt(x, z) <= 0 && isSand(terrain, x, z)) into.sand++;
    else into.soil++;
  }
}

function isSand(terrain: TerrainField, x: number, z: number): boolean {
  // The desert's own ground: dry, deep and standing well above the water
  // table. Read off the layers rather than off the biome id, so a stage
  // that runs out of the dunes onto stony ground is measured as both.
  return terrain.geology.soilAt(x, z) > 1.2 && terrain.heightAt(x, z) > LAKE_Y;
}

/** How much the closed-in share DIFFERS from one stretch of the stage to
 * the next — the journey trait. The standard deviation of the per-window
 * means: zero on a stage that is the same place end to end, whichever place
 * that is, and biggest on one that goes in and out of the trees. */
function windowSwing(walk: Walk, closed: number[]): number {
  const byWindow: number[] = [];
  for (const window of walk.windows) {
    let sum = 0;
    let counted = 0;
    for (let p = 0; p < walk.probes.length; p++) {
      const i = walk.probes[p];
      if (i < window.from || i > window.to) continue;
      sum += closed[p];
      counted++;
    }
    if (counted > 0) byWindow.push(sum / counted);
  }
  return byWindow.length > 1 ? spread(byWindow).sd : 0;
}

function countLandmarks(
  walk: Walk,
  terrain: TerrainField,
): {
  total: number;
  towns: number;
  homesteads: number;
  farms: number;
  message: string;
} {
  const track = walk.track;
  const onStage = (atS: number) => atS < walk.distance;
  // Counted by WEIGHT rather than by head: a homestead beside the road is a
  // thing the player drives past, and the same homestead eight hundred
  // metres out is a roof on the horizon. Everything past `notice` is not on
  // this stage at all.
  const weigh = (things: { x: number; z: number }[]): number => {
    let sum = 0;
    for (const thing of things) sum += notice(stageDistance(walk, thing.x, thing.z));
    return sum;
  };

  const towns = weigh(
    track.towns.filter((town) => onStage(town.atS)).map((town) => town.platform.spine[0]),
  );
  const homesteads = weigh(track.homesteads.filter((h) => onStage(h.atS)).map((h) => h.yard));
  const farms =
    weigh(track.windFarms.filter((f) => onStage(f.atS)).flatMap((f) => f.turbines.slice(0, 1))) +
    weigh(track.solarFarms.filter((f) => onStage(f.atS)).map((f) => f.rect));
  const rails = track.rails.filter((r) => onStage(r.s)).length;
  const parks = weigh(terrain.carParks.filter((p) => onStage(p.atS)).map((p) => p.pad));
  // A power line is a hundred spans; what counts is whether one comes near
  // the stage at all, weighted by its nearest tower.
  let lines = 0;
  for (const line of track.powerLines) {
    let best = Infinity;
    for (const pylon of line.pylons) {
      best = Math.min(best, stageDistance(walk, pylon.x, pylon.z));
    }
    lines += notice(best);
  }
  const total = towns + homesteads + farms + rails + parks + lines;

  const parts: string[] = [];
  const add = (n: number, one: string, many = `${one}s`) => {
    const whole = Math.round(n);
    if (whole > 0) parts.push(`${whole} ${whole === 1 ? one : many}`);
  };
  add(towns, "town");
  add(homesteads, "homestead");
  add(farms, "farm");
  add(rails, "railway");
  add(lines, "power line");
  add(parks, "car park");
  return {
    total,
    towns,
    homesteads,
    farms,
    message: parts.length > 0 ? `goes past ${parts.join(", ")}` : "goes past nothing at all",
  };
}

function sayScenery(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "scenery.enclosure":
      return short
        ? `open country the whole way — nothing beside the road`
        : `closed in for ${(t.value * 100).toFixed(0)}% of it — a corridor with no view out`;
    case "scenery.enclosureSwing":
      return short
        ? `the same country end to end (swing ${t.value.toFixed(2)}) — no sense of going anywhere`
        : `the country never holds still (swing ${t.value.toFixed(2)})`;
    case "scenery.landmarks":
      return short
        ? `${t.value.toFixed(1)} built things a km — nobody lives here`
        : `${t.value.toFixed(1)} built things a km — a suburb`;
    case "scenery.roadsGo":
      return short
        ? `the sealed roads run from nowhere to nowhere — a road goes BETWEEN two places`
        : `every sealed road is lined with things`;
    case "scenery.water":
      return short
        ? `no water in sight anywhere`
        : `water in sight for ${(t.value * 100).toFixed(0)}% of it`;
    case "scenery.skyline":
      return short
        ? `the horizon never moves (${t.value.toFixed(0)} m of relief) — a stage in a bowl`
        : `${t.value.toFixed(0)} m of relief on the skyline — the road is lost in it`;
    default:
      return short
        ? `${t.value.toFixed(1)} kinds of ground the whole way — one country, seen once`
        : `the ground beside the road never settles on anything`;
  }
}

/** How far from a sealed road something has to stand to be what that road
 * goes TO, m. A village fronts its street from behind the verge and a
 * homestead's yard sits at the end of a drive, so this is a couple of
 * hundred metres rather than a couple of dozen — the question is whether
 * the road SERVES the thing, not whether it touches it. */
const ANCHOR_REACH = 190;

/** ...and how far it looks for open water, m: a road down to a landing is a
 * road that goes somewhere, and a lake reads from further off than a house. */
const WATER_REACH = 260;

/** WHETHER THE SEALED ROADS GO ANYWHERE.
 *
 * Each public road is walked end to end and everything that could be a
 * destination is placed along it — a town's buildings, a homestead's yard,
 * the crowd's car park, a wind or solar farm, a level crossing, the junction
 * the rally itself meets it at, and open water beside it. The road is then
 * cut in half, and it goes somewhere only if there is something in EACH
 * half: a road with a village at one end and eight kilometres of nothing
 * after it is a road that stops mattering halfway along.
 *
 * A stage with no sealed road on it scores 1 rather than 0 — there is
 * nothing here to be wrong. Whether a stage should HAVE tarmac is
 * `features.sealedShare`'s question and it is asked there. */
function roadsGoSomewhere(
  walk: Walk,
  terrain: TerrainField,
): { share: number; total: number; nowhere: number } {
  const track = walk.track;
  const roads = track.highways.filter((highway) => highway.kind === "road");
  if (roads.length === 0) return { share: 1, total: 0, nowhere: 0 };

  const anchors: { x: number; z: number }[] = [];
  for (const town of track.towns) for (const lot of town.lots) anchors.push(lot.building);
  for (const homestead of track.homesteads) anchors.push(homestead.yard);
  for (const park of terrain.carParks) anchors.push(park.pad);
  for (const farm of track.windFarms) anchors.push(...farm.turbines);
  for (const farm of track.solarFarms) anchors.push(farm.rect);
  for (const rail of track.rails) anchors.push(rail);
  for (const junction of track.junctions) anchors.push(junction);

  let served = 0;
  let counted = 0;
  for (const road of roads) {
    // Only the stretch of the road that is ON this stage's country. A public
    // road is laid edge to edge of the map and most of it can be nowhere
    // near the route; what is being asked is whether the tarmac the RALLY
    // meets goes anywhere, not whether the map's whole network does.
    const points = road.points.filter(
      (point) => stageDistance(walk, point.x, point.z) <= RATING.sampling.notice,
    );
    if (points.length < 2) continue;
    counted++;
    const middle = (points[0].s + points[points.length - 1].s) / 2;
    let near = false;
    let far = false;
    for (const point of points) {
      const half = point.s < middle;
      if (half ? near : far) continue;
      const reached =
        anchors.some((a) => Math.hypot(a.x - point.x, a.z - point.z) <= ANCHOR_REACH) ||
        waterBeside(terrain, point.x, point.z);
      if (!reached) continue;
      if (half) near = true;
      else far = true;
    }
    if (near && far) served++;
  }
  if (counted === 0) return { share: 1, total: 0, nowhere: 0 };
  return { share: served / counted, total: counted, nowhere: counted - served };
}

function waterBeside(terrain: TerrainField, x: number, z: number): boolean {
  for (let spoke = 0; spoke < 4; spoke++) {
    const angle = (spoke / 4) * Math.PI * 2;
    const wx = x + Math.cos(angle) * WATER_REACH;
    const wz = z + Math.sin(angle) * WATER_REACH;
    if (terrain.waterAt(wx, wz) !== null || terrain.iceAt(wx, wz) !== null) return true;
  }
  return false;
}
