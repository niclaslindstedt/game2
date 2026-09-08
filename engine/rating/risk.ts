// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RISK — what a mistake costs.
//
// Two stages can be identical in every corner and be different stages
// because of what is beside them. A hairpin in a field is a corner you
// carry too much speed into and rejoin from; the same hairpin with a
// hundred metres of nothing off its outside is the corner the whole run is
// about. Nothing in `flow`, `pace` or `relief` can see the difference —
// they are all measurements of the road — so this facet is what makes a
// stage FRIGHTENING, and it is the one a curator reaches for when a level
// is technically correct and nobody remembers it.
//
// It is also the facet most easily overdone, which is why every trait is a
// band and `exposure` and `furniture` both have real ceilings. A road with
// a drop on both sides for five kilometres is not five kilometres of
// tension: after the first minute it is the normal condition, and the only
// thing left is the arbitrary end of the run. Danger reads as danger by
// contrast, exactly as speed does (`pace.swing`).

import type { TerrainField } from "../mapgen/terrain.ts";
import { RATING } from "./scales.ts";
import type { Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

export function rateRisk(walk: Walk, terrain: TerrainField): Facet {
  const started = Date.now();
  const K = RATING.risk;
  const samples = walk.track.samples;

  let exposed = 0;
  let pinched = 0;
  let worstDrop = 0;
  let worstDropAt = 0;
  // Solids are counted by IDENTITY rather than per probe: the query radius
  // is wider than the probe spacing on purpose (a tree three metres off the
  // road matters wherever the walk happened to land), so the same trunk
  // comes back from several stations and a running total would count the
  // dense stretches twice.
  const solids = new Set<unknown>();

  for (const i of walk.probes) {
    const sample = samples[i];
    const px = Math.sin(sample.heading);
    const pz = Math.cos(sample.heading);
    const shoulder = sample.width * 0.5 + 4;

    // Measured at three reaches, and the steepest of them taken. R31 grades a
    // cone of ground beside every road, so the metres immediately off the
    // shoulder are a bench by construction — read there alone, the whole
    // sweep reports zero exposure and the trait measures the rule rather
    // than the country. What a driver sees is what happens PAST the bench.
    let drop = 0;
    for (const side of [-1, 1]) {
      for (const reach of [shoulder + 14, shoulder + 36, shoulder + 70]) {
        const x = sample.x + px * reach * side;
        const z = sample.z + pz * reach * side;
        const fall = (sample.elevation - terrain.heightAt(x, z)) / reach;
        if (fall > drop) drop = fall;
      }
    }
    if (drop >= K.dropGrade) exposed++;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstDropAt = sample.s;
    }

    // How many seconds of road width there are at the speed it is met: a
    // narrow lane at 60 km/h and a boulevard at 160 are the same amount of
    // room, and this is the number that says so.
    if (sample.width / Math.max(1, walk.speed[i]) < K.pinchSeconds) pinched++;

    const radius = sample.width;
    for (const solid of terrain.obstaclesNear(sample.x, sample.z, radius)) solids.add(solid);
    for (const trunk of terrain.treesNear(sample.x, sample.z, radius)) solids.add(trunk);
  }

  const probes = Math.max(1, walk.probes.length);
  const hard = walk.corners.filter((c) => c.severity === "hard");
  const guarded = hard.filter((corner) =>
    terrain.guards.some((guard) => guard.s >= corner.s - 40 && guard.s <= corner.endS + 40),
  ).length;

  const traits: Trait[] = [
    trait(
      "risk.exposure",
      "share of it with the ground falling away beside the road",
      "share",
      exposed / probes,
      K.exposure,
      1.15,
    ),
    trait(
      "risk.furniture",
      "solid things within a road-width of the edge, a kilometre",
      "/km",
      solids.size / walk.km,
      K.furniture,
      1.0,
    ),
    trait(
      "risk.pinch",
      "share of it where the road is tight for the speed",
      "share",
      pinched / probes,
      K.pinch,
      1.0,
    ),
    trait(
      "risk.guards",
      "share of the hard corners whose inside costs more than the corner",
      "share",
      hard.length > 0 ? guarded / hard.length : 1,
      K.guards,
      0.8,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayRisk);
  if (worstDrop > K.dropGrade) {
    notes.push({
      code: "risk.drop",
      sense: "note",
      message: `steepest fall beside the road is ${(worstDrop * 100).toFixed(0)}%`,
      s: worstDropAt,
      value: worstDrop,
    });
  }

  return {
    id: "risk",
    label: "risk",
    score: facetScore(traits),
    weight: RATING.weights.risk,
    traits,
    notes,
    stats: {
      exposure: Math.round((exposed / probes) * 1000) / 1000,
      solids: solids.size,
      pinch: Math.round((pinched / probes) * 1000) / 1000,
      hardCorners: hard.length,
      guarded,
      worstDrop: Math.round(worstDrop * 100) / 100,
    },
    ms: Date.now() - started,
  };
}

function sayRisk(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "risk.exposure":
      return short
        ? `nothing to fall off anywhere — a mistake costs nothing`
        : `${(t.value * 100).toFixed(0)}% of it has a drop beside it — exposure stops being exposure`;
    case "risk.furniture":
      return short
        ? `${t.value.toFixed(0)} solids a km — there is nothing to hit`
        : `${t.value.toFixed(0)} solids a km — a slalom`;
    case "risk.pinch":
      return short
        ? `room everywhere — the road is never tight for the speed`
        : `${(t.value * 100).toFixed(0)}% of it is tight for the speed — no line anywhere`;
    default:
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of the hard corners are guarded — the insides can be cut`
        : `every hard corner is walled in`;
  }
}
