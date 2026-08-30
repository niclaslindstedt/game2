// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GROUND — R32's layers, swept over the country the stage is set in and
// asked whether they came out as a place.
//
// The layered model (bedrock, then the groundwater in it, then the soil on
// top) is only worth having if the layers actually SHOW. So this sweeps a
// grid over the map and measures the shares: how much of it is under water,
// how much is closed forest, how much is bare rock, how much of it a car
// could not climb, and how much relief there is between the low ground and
// the high.
//
// Two of the checks are about the layering being obeyed rather than about
// the shares being pretty, and they are the ones worth having:
//
//   SOIL DOES NOT STAND ON A CLIFF. Till is deposited by water and ice
//   slowing down. Deep soil on steep ground means the soil field was
//   painted on rather than derived, and the moment a tree grows out of a
//   rock face everybody can see it.
//
//   WHAT GROWS, GROWS ON SOIL. Trees need a rooting depth. A forest
//   standing on bare bedrock is the same mistake seen from the other side.
//
// ...and two are about the country the road actually runs THROUGH, which is
// a different country from the one the stage is set in and has to be
// measured separately (R31, R34):
//
//   THE ROAD RUNS THROUGH SOMETHING. R31 cuts the landscape back to a cone
//   beside every road, so a stage can score full marks for relief with all
//   of that relief pushed over the horizon and a lawn either side of the
//   car. The corridor check reads the terrain field — the ground that is
//   drawn and driven — rather than the bare geology, and it is the only
//   thing here that can tell a valley from a table.
//
//   WHERE IT CANNOT GO ROUND, IT GOES THROUGH. A road that meets rock is
//   cut through it, and a stage with no cuttings anywhere is one whose
//   roads went round everything — which is what a country with no rock in
//   it looks like from the driver's seat.

import { LAKE_Y } from "../mapgen/land.ts";
import { GROVES } from "../mapgen/props.ts";
import type { Track } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, within, type Check, type Finding, type MetricReport } from "./types.ts";

/** The p-th percentile of a sample set, p in 0..1. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

export function analyzeGround(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const G = ANALYSIS.ground;
  const cells = ANALYSIS.sampling.groundGrid;
  const margin = ANALYSIS.sampling.groundMargin;
  const b = track.bounds;
  const minX = b.minX - margin;
  const minZ = b.minZ - margin;
  const spanX = b.maxX - b.minX + margin * 2;
  const spanZ = b.maxZ - b.minZ + margin * 2;
  const step = Math.max(spanX, spanZ) / cells;
  const geology = terrain.geology;

  const heights: number[] = [];
  let total = 0;
  let flooded = 0;
  let forest = 0;
  let rock = 0;
  let cliffs = 0;
  let wet = 0;
  let soilOnCliffs = 0;
  let steepCells = 0;
  let treesOnRock = 0;
  let bareCells = 0;
  let swamp = 0;
  let lake = 0;
  let swampDepth = 0;
  let soilSum = 0;
  let worstSoilOnCliff = 0;

  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = minX + (i + 0.5) * (spanX / cells);
      const z = minZ + (j + 0.5) * (spanZ / cells);
      const ground = geology.groundAt(x, z);
      total++;
      heights.push(ground.surface);
      soilSum += ground.soil;
      if (ground.surface < LAKE_Y) {
        flooded++;
        // R32 — WHAT KIND of water. Depth is the whole difference between a
        // lake and a swamp, and it is worth measuring separately because
        // they are not interchangeable: a country of nothing but open water
        // has no reeds in it, and one of nothing but swamp has no horizon.
        const depth = LAKE_Y - ground.surface;
        if (depth < ANALYSIS.ground.swamp.deep) {
          swamp++;
          swampDepth += depth;
        } else {
          lake++;
        }
        continue;
      }
      if (ground.table > ground.surface) wet++;
      if (ground.soil < G.bare) rock++;

      // Steepness, measured rather than inferred — this is the analyzer, it
      // is allowed to pay for a gradient the generator cannot.
      const dx = (geology.surfaceAt(x + step, z) - geology.surfaceAt(x - step, z)) / (2 * step);
      const dz = (geology.surfaceAt(x, z + step) - geology.surfaceAt(x, z - step)) / (2 * step);
      const slope = Math.hypot(dx, dz);
      if (slope > G.soil.steep) {
        steepCells++;
        if (ground.soil > G.soil.deep) {
          soilOnCliffs++;
          if (ground.soil > worstSoilOnCliff) {
            worstSoilOnCliff = ground.soil;
            findings.push({
              code: "ground.soil",
              severity: "warn",
              message: `${ground.soil.toFixed(
                1,
              )} m of soil lying on ground falling at ${(slope * 100).toFixed(0)}%`,
              at: { x, z },
              value: ground.soil,
            });
          }
        }
      }
      if (slope > 1) cliffs++;

      // Forest, from the quilt: what this ground is MEANT to be.
      const grove = GROVES[terrain.groveAt(x, z)];
      if (grove && grove.density >= G.closed) forest++;
      // ...and rooting, from the TRUNKS that actually stand there. The
      // quilt is the intention and the trunks are the result, and R32 is a
      // claim about the result: asking the quilt whether a spruce wood has
      // soil under it measures the wrong thing entirely, because the quilt
      // never looked.
      if (ground.soil < G.rootDepth) {
        bareCells++;
        if (terrain.treesNear(x, z, G.rootReach).length > 0) treesOnRock++;
      }
    }
  }

  // ── The corridor, and the cuttings in it (R31, R34) ──────────────────
  // Walked along the road rather than swept over the map, because the
  // question is about the ground BESIDE THE ROAD and nothing else: how much
  // of the country survives the verge cone, and how much of what survives
  // is a face the road was cut through. Both are read off `heightAt` — the
  // terrain field, which is what the game draws and the car rides — where
  // every other check in this metric reads the bare geology underneath it.
  const C = G.corridor;
  const CUT = G.cut;
  const flanks: number[] = [];
  let cutSides = 0;
  let sides = 0;
  let walledRun = 0;
  let walledWorst = 0;
  let walled = 0;
  let deepest = 0;
  // Every tenth sample: 20 m of road, which is finer than the shortest
  // hillside the 14 m ground lattice can hold in the first place.
  const stride = 10;
  for (let i = 0; i < track.samples.length; i += stride) {
    const s = track.samples[i];
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    let bothWalled = true;
    for (const side of [-1, 1]) {
      let rise = 0;
      let cut = 0;
      for (let d = C.probe.from; d <= C.probe.to; d += C.probe.step) {
        const x = s.x + side * d * cos;
        const z = s.z - side * d * sin;
        rise = Math.max(rise, terrain.heightAt(x, z) - s.elevation);
        cut = Math.max(cut, terrain.cutAt(x, z));
      }
      flanks.push(rise);
      sides++;
      if (cut >= CUT.face) cutSides++;
      else bothWalled = false;
      if (cut >= CUT.face && rise > deepest) {
        deepest = rise;
        findings.push({
          code: "ground.cut",
          severity: "note",
          message: `the road runs through a ${rise.toFixed(0)} m cutting @${s.s.toFixed(0)} m`,
          at: { x: s.x, z: s.z },
          value: rise,
        });
      }
    }
    // ...and a run with a face up BOTH sides at once is not a cutting any
    // more, it is a corridor with nowhere to go. Measured as a run rather
    // than as a share, because a hundred scattered metres of it is a stage
    // with rock on it and three hundred consecutive is a tunnel.
    if (bothWalled) {
      walledRun += stride * track.step;
      if (walledRun > walledWorst) walledWorst = walledRun;
      if (walledRun > CUT.walled) walled += stride * track.step;
    } else walledRun = 0;
  }
  flanks.sort((a, c) => a - c);
  const corridorRise = percentile(flanks, 0.75);
  const cutShare = sides > 0 ? cutSides / sides : 0;
  const walledShare = track.length > 0 ? walled / track.length : 0;
  if (corridorRise < C.rise.min) {
    findings.push({
      code: "ground.corridor",
      severity: "warn",
      message: `the ground beside the road stands only ${corridorRise.toFixed(
        1,
      )} m over it — the stage is a ribbon on a table, whatever the country behind it is doing`,
      value: C.rise.min - corridorRise,
    });
  }
  if (walledShare > CUT.walledShare) {
    findings.push({
      code: "ground.walled",
      severity: "warn",
      message: `${(walledShare * 100).toFixed(0)}% of the stage runs walled in on both sides (worst run ${walledWorst.toFixed(
        0,
      )} m) — a cutting is a place, not a stage`,
      value: walledShare,
    });
  }

  heights.sort((a, c) => a - c);
  const relief = percentile(heights, 0.95) - percentile(heights, 0.05);
  const waterShare = flooded / Math.max(1, total);
  const forestShare = forest / Math.max(1, total);
  const rockShare = rock / Math.max(1, total);
  const cliffShare = cliffs / Math.max(1, total);
  const wetShare = wet / Math.max(1, total);
  const swampShare = swamp / Math.max(1, total);
  const lakeShare = lake / Math.max(1, total);
  const meanSwampDepth = swamp > 0 ? swampDepth / swamp : 0;
  const meanSoil = soilSum / Math.max(1, total);

  if (waterShare > G.water.max) {
    // Past the DROWNED ceiling this is not a wet stage, it is a seascape
    // with a causeway drawn on it — the road stands up out of the water on
    // its own verge cone and everything else has gone. That is an error, not
    // a matter of taste, and it is the one ground finding that can be true
    // of a stage every other metric likes.
    const drowned = waterShare > G.drowned;
    findings.push({
      code: "ground.drowned",
      severity: drowned ? "error" : "warn",
      message: drowned
        ? `${(waterShare * 100).toFixed(
            0,
          )}% of the country is under water — the stage is a causeway across a sea`
        : `${(waterShare * 100).toFixed(0)}% of the country is under water`,
      value: waterShare,
    });
  }
  if (relief < G.relief.min) {
    findings.push({
      code: "ground.flat",
      severity: "warn",
      message: `${relief.toFixed(0)} m of relief across the whole map — the country is a table`,
      value: G.relief.min - relief,
    });
  }
  if (swampShare < G.swamp.share.min) {
    findings.push({
      code: "ground.swamp",
      severity: "note",
      message: `only ${(swampShare * 100).toFixed(
        1,
      )}% of the country is shallow standing water — a landscape with lakes but no swamps has no reed beds in it`,
      value: G.swamp.share.min - swampShare,
    });
  }
  if (treesOnRock > 0) {
    findings.push({
      code: "ground.rooting",
      severity: "warn",
      message: `${((treesOnRock / Math.max(1, bareCells)) * 100).toFixed(
        0,
      )}% of the bare-rock ground has trunks standing on it (under ${G.rootDepth} m of soil)`,
      value: treesOnRock / Math.max(1, bareCells),
    });
  }

  const checks: Check[] = [
    {
      // The heaviest check here by some way. How much of a landscape is
      // under water is the first thing anybody sees about it, and it is the
      // property a single dial can destroy from end to end — a map that is
      // four fifths lake still has plausible soil, forest and relief on the
      // fifth that is left, so every other check in this metric goes on
      // reporting a healthy country.
      id: "water",
      label: "some of the country is water, and not most of it",
      score: within(waterShare, G.water, G.slack),
      weight: 3,
      value: waterShare,
    },
    {
      id: "forest",
      label: "the country is forested",
      score: within(forestShare, G.forest, G.slack),
      weight: 1,
      value: forestShare,
    },
    {
      id: "rock",
      label: "the bedrock shows where the soil is thin",
      score: within(rockShare, G.rock, G.slack),
      weight: 1,
      value: rockShare,
    },
    {
      id: "relief",
      label: "the country has shape to it",
      score: within(relief, G.relief, G.reliefSlack),
      weight: 1.5,
      value: relief,
    },
    {
      id: "cliffs",
      label: "the country is mostly ground a car could cross",
      score: within(cliffShare, { min: 0, max: G.cliff.max }, G.slack),
      weight: 1,
      value: cliffShare,
    },
    {
      // R32 — the SWAMPS. Their own check rather than a share of the water,
      // because a swamp is a different place from a lake and the generator
      // can produce one without the other: pits that are all deep make
      // tarns and no mires, and pits that are all shallow make a marsh with
      // nothing to drive past. The band wants both on the map.
      id: "swamp",
      label: "the country has shallow water as well as deep (R32)",
      score: within(swampShare, G.swamp.share, G.slack * 0.3),
      weight: 1,
      value: swampShare,
    },
    {
      id: "soil",
      label: "soil lies in the hollows, not on the cliffs (R32)",
      score: rate(soilOnCliffs, Math.max(1, steepCells), G.soil.share),
      weight: 2,
      value: worstSoilOnCliff,
      budget: G.soil.deep,
    },
    {
      id: "rooting",
      label: "what grows, grows on soil (R32)",
      score: rate(treesOnRock, Math.max(1, bareCells)),
      weight: 1.5,
      value: treesOnRock / Math.max(1, bareCells),
    },
    {
      // Weighted like `relief`, because it is the same claim asked where it
      // matters. A stage is looked at from the road, and this is the only
      // check in the metric standing there.
      id: "corridor",
      label: "the road runs THROUGH the country, not across it (R31)",
      score: within(corridorRise, C.rise, C.slack),
      weight: 1.5,
      value: corridorRise,
    },
    {
      id: "cut",
      label: "where the road cannot go round rock it goes through it (R34)",
      score:
        within(cutShare, CUT.share, CUT.slack) *
        // ...and a stage walled in on both sides for a quarter of its
        // length has cut too much, however good the share looks.
        (1 - Math.min(1, Math.max(0, walledShare - CUT.walledShare) / CUT.walledShare)),
      weight: 1,
      value: cutShare,
    },
  ];

  return {
    id: "ground",
    label: "the ground",
    score: metricScore(checks),
    weight: ANALYSIS.weights.ground,
    checks,
    findings,
    stats: {
      cells: total,
      smoothness: geology.smoothness,
      relief,
      waterShare,
      forestShare,
      rockShare,
      cliffShare,
      wetShare,
      swampShare,
      lakeShare,
      meanSwampDepth,
      meanSoil,
      soilOnCliffs,
      bareCells,
      treesOnRock,
      corridorRise,
      cutShare,
      walledShare,
      deepestCut: deepest,
    },
    ms: Date.now() - started,
  };
}
