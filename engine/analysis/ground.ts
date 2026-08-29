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

  heights.sort((a, c) => a - c);
  const relief = percentile(heights, 0.95) - percentile(heights, 0.05);
  const waterShare = flooded / Math.max(1, total);
  const forestShare = forest / Math.max(1, total);
  const rockShare = rock / Math.max(1, total);
  const cliffShare = cliffs / Math.max(1, total);
  const wetShare = wet / Math.max(1, total);
  const meanSoil = soilSum / Math.max(1, total);

  if (waterShare > G.water.max) {
    findings.push({
      code: "ground.drowned",
      severity: "warn",
      message: `${(waterShare * 100).toFixed(0)}% of the country is under water`,
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
      id: "water",
      label: "some of the country is water, and not most of it",
      score: within(waterShare, G.water, G.slack),
      weight: 1.5,
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
      meanSoil,
      soilOnCliffs,
      bareCells,
      treesOnRock,
    },
    ms: Date.now() - started,
  };
}
