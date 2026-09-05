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

import { TUNING } from "../game/defs/tuning.ts";
import { LAKE_Y } from "../mapgen/land.ts";
import { biomeRules } from "../mapgen/biomes.ts";
import type { Track } from "../mapgen/compile.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import { GROUND_CELL, type TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import {
  metricScore,
  rate,
  under,
  within,
  type Check,
  type Finding,
  type MetricReport,
} from "./types.ts";

/** The p-th percentile of a sample set, p in 0..1. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/** What the fold sweep found: how many lattice edges the country has past
 * the road's bench, how many of them fold past `crease.fold`, the worst
 * such fold in degrees, how many triangles stand as walls — and, R31's
 * own count, how many triangles the sweep saw at all and how many of them
 * stand steeper than the car can climb on ground nothing declared rock,
 * with the worst of those. */
type Creases = {
  edges: number;
  creased: number;
  worst: number;
  walls: number;
  triangles: number;
  steep: number;
  steepest: number;
};

/** R32 — THE COUNTRY IS CURVES: every fold on the ground lattice, sorted
 * into the road's, the rock's deliberate ones and the country's own.
 *
 * Read off the same 14 m corners the tiles are built from and folded
 * across the same diagonal, so the angle measured is the one drawn — the
 * analytic field is a curve by construction and says nothing about what a
 * lattice makes of it. A fold is BUILT if a road shaped any corner of the
 * two triangles it lies between (the ground there is not the bare land):
 * a cutting's brow, an embankment's toe, the cone's edge, and a cutting
 * has an edge. It is SHARP where R32 says the rock is deliberately so. Only
 * the rest is the country, and only the country is held to a curve. A
 * WALL — a triangle steeper than rock is ever held at — is reported
 * wherever it stands, because nothing builds one on purpose.
 *
 * Walked whole rather than sampled: a crease is a line, and a line is what
 * a sparse grid steps over. The corners are one height query each; the
 * bare land and the rock's own word are asked only for the few cells whose
 * fold is worth classifying. */
function creases(track: Track, terrain: TerrainField, findings: Finding[]): Creases {
  const B = ANALYSIS.ground.crease;
  const margin = ANALYSIS.sampling.groundMargin;
  const cell = GROUND_CELL;
  const b = track.bounds;
  const i0 = Math.floor((b.minX - margin) / cell);
  const j0 = Math.floor((b.minZ - margin) / cell);
  const w = Math.ceil((b.maxX + margin) / cell) - i0 + 1;
  const h = Math.ceil((b.maxZ + margin) / cell) - j0 + 1;
  const H = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) H[j * w + i] = terrain.heightAt((i0 + i) * cell, (j0 + j) * cell);
  }
  /** Whether a road shaped the corner at lattice index `k`, memoized:
   * unknown, no, yes. */
  const shaped = new Int8Array(w * h).fill(-1);
  const isShaped = (k: number): boolean => {
    if (shaped[k] < 0) {
      const i = k % w;
      const j = (k - i) / w;
      const far = terrain.farHeightAt((i0 + i) * cell, (j0 + j) * cell);
      shaped[k] = Math.abs(H[k] - far) > 0.02 ? 1 : 0;
    }
    return shaped[k] === 1;
  };
  // Face normals of a cell's two triangles, split along the same diagonal
  // the renderer indexes — (i+1, j) to (i, j+1). Written into scratch
  // vectors: this runs for every cell of the map.
  const lo = [0, 0, 0];
  const up = [0, 0, 0];
  const next = [0, 0, 0];
  const lower = (k: number, out: number[]): void => {
    const h00 = H[k];
    const dx = (H[k + 1] - h00) / cell;
    const dz = (H[k + w] - h00) / cell;
    const inv = 1 / Math.hypot(dx, 1, dz);
    out[0] = -dx * inv;
    out[1] = inv;
    out[2] = -dz * inv;
  };
  const upper = (k: number, out: number[]): void => {
    const h11 = H[k + w + 1];
    const dx = (h11 - H[k + w]) / cell;
    const dz = (h11 - H[k + 1]) / cell;
    const inv = 1 / Math.hypot(dx, 1, dz);
    out[0] = -dx * inv;
    out[1] = inv;
    out[2] = -dz * inv;
  };
  /** The dihedral angle between two face normals, degrees. */
  const fold = (a: number[], c: number[]): number =>
    (Math.acos(Math.max(-1, Math.min(1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2]))) * 180) / Math.PI;
  /** A triangle's slope, m per m, off its normal. */
  const slope = (n: number[]): number => Math.hypot(n[0], n[2]) / n[1];
  // The road's own strip is the rollers' to judge; the country starts past
  // the bench, a cell out, where R31 promises a hill worth going round.
  const clear = STAGE_RULES.verge.bench + cell;
  const out: Creases = {
    edges: 0,
    creased: 0,
    worst: 0,
    walls: 0,
    triangles: 0,
    steep: 0,
    steepest: 0,
  };
  const worstAt = { x: 0, z: 0 };
  let worstWall = 0;
  // R31 — the grade past which the car is no longer climbing the ground
  // but being refused by it, read off the physics rather than restated: a
  // triangle this steep is a thing the car stops against, wherever it is
  // and whatever built it, unless it is rock and says so.
  const L = ANALYSIS.ground.climb;
  const limit = TUNING.collision.climbLimit;
  const steepAt = { x: 0, z: 0, built: false };
  /** Whether the BARE country here is a rock flank: a hillside steeper
   * than the runoff a road batters beside itself (`verge.climb`), with the
   * soil scoured off it (R32) — which is what the geology strips a flank
   * to, what the renderer paints as bedrock, and what nothing roots on.
   * A road's embankment standing on such a flank has nowhere gentler to
   * come down to than the flank itself. Read off the bare land, so a fill
   * or a cut on gentle, soil-covered country never hides behind it. */
  const far = terrain.farHeightAt;
  const rockFlank = (x: number, z: number): boolean => {
    if (terrain.geology.soilAt(x, z) >= ANALYSIS.ground.bare) return false;
    const h = cell / 2;
    const dx = (far(x + h, z) - far(x - h, z)) / cell;
    const dz = (far(x, z + h) - far(x, z - h)) / cell;
    return Math.hypot(dx, dz) > STAGE_RULES.verge.climb;
  };
  for (let j = 0; j < h - 2; j++) {
    for (let i = 0; i < w - 2; i++) {
      const x = (i0 + i + 0.5) * cell;
      const z = (j0 + j + 0.5) * cell;
      if (terrain.roadDistanceAt(x, z) < clear) continue;
      const k = j * w + i;
      lower(k, lo);
      upper(k, up);
      // The three edges this cell owns: its own diagonal, and the two its
      // upper triangle shares with the lower triangles of the cells to its
      // right and below.
      let widest = fold(lo, up);
      lower(k + 1, next);
      widest = Math.max(widest, fold(up, next));
      lower(k + w, next);
      widest = Math.max(widest, fold(up, next));
      out.edges += 3;
      out.triangles += 2;
      const steepest = Math.max(slope(lo), slope(up));
      if (widest <= B.fold && steepest <= limit) continue;
      // Worth classifying. Built ground first — it is the common case
      // beside a road and costs a land query per corner; the rock's own
      // word is a geology pass and is asked last.
      const built =
        isShaped(k) ||
        isShaped(k + 1) ||
        isShaped(k + w) ||
        isShaped(k + w + 1) ||
        isShaped(k + 2) ||
        isShaped(k + 2 * w);
      const sharp = terrain.geology.sharpAt(x, z) >= B.explicit;
      // R31 — steeper than the car can climb, and neither a face a road
      // was cut through (R34, or a cone letting go of a mountain — the
      // field's own word, `cutAt`) nor the rock's deliberate edge, nor the
      // country's own rock: bare land that stands steeper than a road may
      // build, with the soil scoured off it, is a mountain flank, and a
      // flank is rock the driver can see whatever a road did on it.
      // Counted per triangle, because a car meets one triangle at a time.
      if (
        steepest > limit &&
        !sharp &&
        terrain.cutAt(x, z) < ANALYSIS.ground.cut.face &&
        !rockFlank(x, z)
      ) {
        out.steep += slope(lo) > limit && slope(up) > limit ? 2 : 1;
        if (steepest > out.steepest) {
          out.steepest = steepest;
          steepAt.x = x;
          steepAt.z = z;
          steepAt.built = built;
        }
      }
      if (steepest > B.wall.slope && !sharp) {
        out.walls++;
        if (steepest > worstWall) {
          worstWall = steepest;
          findings.push({
            code: "ground.wall",
            severity: "error",
            message: `a wall stands at ${(Math.atan(steepest) * (180 / Math.PI)).toFixed(
              0,
            )}° ${built ? "at the side of a road's shelf" : "in open country"} — no rule stands ground that steep`,
            at: { x, z },
            value: steepest,
          });
        }
      }
      if (widest <= B.fold || built || sharp) continue;
      out.creased++;
      if (widest > out.worst) {
        out.worst = widest;
        worstAt.x = x;
        worstAt.z = z;
      }
    }
  }
  // One finding, after the sweep, and only for a defect: a country of
  // forty thousand edges has a handful just over the bar wherever two
  // layers happen to run steep together, and listing each of them is
  // noise a session learns to skip. What is worth standing in front of
  // is a SHARE past the tolerance, or a single fold twice the bar — a
  // knife-edge, wherever it is.
  const steepShare = out.steep / Math.max(1, out.triangles);
  if (out.steep > 0) {
    const where = steepAt.built ? "on ground a road shaped" : "in open country";
    findings.push({
      code: "ground.climb",
      severity: steepShare > L.tolerated ? "error" : "note",
      message: `${(steepShare * 100).toFixed(2)}% of the drawn ground stands steeper than the car can climb and is not rock (worst ${(
        Math.atan(out.steepest) *
        (180 / Math.PI)
      ).toFixed(0)}° ${where})`,
      at: { x: steepAt.x, z: steepAt.z },
      value: steepShare,
    });
  }
  const share = out.creased / Math.max(1, out.edges);
  if (share > B.share.tolerated) {
    findings.push({
      code: "ground.crease",
      severity: "warn",
      message: `${(share * 100).toFixed(2)}% of the country's lattice edges fold past ${
        B.fold
      }° on ground nothing made sharp (worst ${out.worst.toFixed(0)}°)`,
      at: { x: worstAt.x, z: worstAt.z },
      value: share,
    });
  } else if (out.worst > B.fold * 2) {
    findings.push({
      code: "ground.crease",
      severity: "warn",
      message: `the country folds ${out.worst.toFixed(
        0,
      )}° across one lattice edge — a crease, on ground nothing made sharp`,
      at: { x: worstAt.x, z: worstAt.z },
      value: out.worst,
    });
  }
  return out;
}

export function analyzeGround(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const G = ANALYSIS.ground;
  // R40 — the country the shares are judged against, and its quilt.
  const biome = biomeRules(track.knobs.biome);
  const country = G.country[biome.id];
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
      if (slope > country.soilSteep) {
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
      const grove = biome.groves[terrain.groveAt(x, z)];
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

  // ── The folds (R32) ─────────────────────────────────────────────────
  const folds = creases(track, terrain, findings);
  const creasedShare = folds.creased / Math.max(1, folds.edges);
  const steepShare = folds.steep / Math.max(1, folds.triangles);
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

  if (waterShare > country.water.max) {
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
  if (relief < country.relief.min) {
    findings.push({
      code: "ground.flat",
      severity: "warn",
      message: `${relief.toFixed(0)} m of relief across the whole map — the country is a table`,
      value: country.relief.min - relief,
    });
  }
  if (country.swamps && swampShare < G.swamp.share.min) {
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
      label:
        country.water.max > 0
          ? "some of the country is water, and not most of it"
          : "the country is dry (R40)",
      score: within(waterShare, country.water, G.slack),
      weight: 3,
      value: waterShare,
    },
    {
      id: "forest",
      label: country.forest.min > 0 ? "the country is forested" : "the country is open (R40)",
      score: within(forestShare, country.forest, G.slack),
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
      score: within(relief, country.relief, G.reliefSlack),
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
      label: country.swamps
        ? "the country has shallow water as well as deep (R32)"
        : "no water stands in the pans (R40)",
      // A dry country is held to no swamp at all: the band is the wet
      // one's, and here it is a point.
      score: within(swampShare, country.swamps ? G.swamp.share : { min: 0, max: 0 }, G.slack * 0.3),
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
    {
      // Weighted like `relief`: the same country, asked whether it is drawn
      // as curves. The walls take their share off it too — a stage whose
      // country is smooth everywhere but one vertical seam has the one
      // thing a player photographs.
      id: "crease",
      label: "the country is curves, and a sharp edge is one that was asked for (R32)",
      score:
        under(creasedShare, G.crease.share.tolerated, G.crease.share.fail) *
        under(folds.walls, 0, G.crease.wall.fail),
      weight: 1.5,
      value: creasedShare,
      budget: G.crease.share.tolerated,
    },
    {
      // The rule about nature and the car, measured where the car meets
      // it: on the drawn lattice, every triangle steeper than the physics'
      // own climb limit that is neither a declared rock face nor the rock's
      // deliberate edge. Weighted like the walls, because a hillside the
      // car stops against is a wall to the driver whatever angle it is.
      id: "climb",
      label: "nothing stops the car but rock, and rock says so (R31)",
      score: under(steepShare, G.climb.tolerated, G.climb.fail),
      weight: 1.5,
      value: steepShare,
      budget: G.climb.tolerated,
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
      creasedShare,
      worstCrease: folds.worst,
      walls: folds.walls,
      steepShare,
      steepest: folds.steepest,
    },
    ms: Date.now() - started,
  };
}
