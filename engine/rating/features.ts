// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FEATURES — the set pieces, and how many KINDS of them there are.
//
// This is the facet that decides whether a stage can be described in a
// sentence. "The one with the crest before the ford" is a stage; "seed 24"
// is not, and the difference between them is entirely in here.
//
// `kinds` is therefore weighted above the counts. Six jumps and nothing
// else is one idea six times; a jump, a ford, a bore and a level crossing
// is four things to remember, and a player who has driven the stage twice
// can tell you the order they come in. The counts exist to stop the search
// from answering that by putting one of everything into three hundred
// metres.

import type { Surface, Track } from "../mapgen/compile.ts";
import { RATING } from "./scales.ts";
import { effectiveKinds, segmentSpans, type Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

export function rateFeatures(walk: Walk): Facet {
  const started = Date.now();
  const F = RATING.features;
  const track = walk.track;
  const samples = track.samples;

  const spans = segmentSpans(track);
  let jumps = 0;
  let fords = 0;
  let bridges = 0;
  for (let i = 0; i < track.segments.length; i++) {
    if (spans[i].from >= walk.distance) continue;
    const segment = track.segments[i];
    if (segment.feature === "jump") jumps++;
    if (segment.feature !== "water") continue;
    if (segment.crossing === "ford") fords++;
    else if (segment.crossing !== "culvert") bridges++;
  }
  const culverts = track.culverts.filter((c) => c.s < walk.distance).length;
  const crossings = fords + bridges + culverts;

  // THE ROAD'S OWN TYPICAL WIDTH, not the nominal it was built at. R33's
  // wander is not symmetric — a blade cuts wider on one pass than the next
  // and the verges creep in — so a gravel road sits some way under
  // `track.width` almost everywhere, and measuring the pinches against the
  // nominal reports two thirds of every stage in the game as narrow. What
  // is worth knowing is where the road pinches in RELATIVE TO ITSELF.
  const widths = samples.slice(0, walk.end + 1).map((sample) => sample.width);
  widths.sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)] ?? track.width;

  const metres = new Map<Surface, number>();
  let sealed = 0;
  let narrow = 0;
  let tunnel = 0;
  let counted = 0;
  for (let i = 1; i <= walk.end; i++) {
    const step = samples[i].s - samples[i - 1].s;
    metres.set(samples[i].surface, (metres.get(samples[i].surface) ?? 0) + step);
    if (samples[i].surface === "asphalt") sealed += step;
    if (samples[i].width < typical * F.narrowOf) narrow += step;
    if (samples[i].tunnel) tunnel += step;
    counted += step;
  }
  const run = Math.max(1e-3, counted);

  const junctions = track.junctions.filter((j) => j.s < walk.distance && !j.crossing).length;
  const rails = track.rails.filter((r) => r.s < walk.distance).length;

  // WHAT THE STAGE HAS AT ALL — one point per kind, however many of it
  // there are. A stage with nine fords has one kind of water in it.
  const kinds = [
    jumps > 0,
    fords > 0,
    bridges > 0,
    culverts > 0,
    crestCount(walk) > 0,
    tunnel > 0,
    rails > 0,
    junctions > 0,
    sealed > 0,
    narrow / run > 0.05,
  ].filter(Boolean).length;

  const traits: Trait[] = [
    trait("features.jumps", "jumps a kilometre", "/km", jumps / walk.km, F.jumps, 1.0),
    trait(
      "features.crossings",
      "water crossings a kilometre",
      "/km",
      crossings / walk.km,
      F.crossings,
      0.85,
    ),
    trait(
      "features.surfaceMix",
      "how many surfaces it really runs on",
      "kinds",
      effectiveKinds([...metres.values()]),
      F.surfaceMix,
      0.9,
    ),
    trait(
      "features.sealedShare",
      "share of the stage on a borrowed sealed road",
      "share",
      sealed / run,
      F.sealedShare,
      0.85,
    ),
    trait("features.kinds", "how many kinds of thing happen at all", "kinds", kinds, F.kinds, 1.3),
    trait(
      "features.narrowShare",
      "share of it where the road pinches in",
      "share",
      narrow / run,
      F.narrowShare,
      0.7,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayFeatures);
  notes.push({
    code: "features.list",
    sense: "note",
    message: describe(jumps, fords, bridges, culverts, crestCount(walk), tunnel, rails, junctions),
    value: kinds,
  });

  return {
    id: "features",
    label: "features",
    score: facetScore(traits),
    weight: RATING.weights.features,
    traits,
    notes,
    stats: {
      jumps,
      fords,
      bridges,
      culverts,
      crests: crestCount(walk),
      tunnelMetres: Math.round(tunnel),
      railCrossings: rails,
      junctions,
      sealedShare: Math.round((sealed / run) * 1000) / 1000,
      narrowShare: Math.round((narrow / run) * 1000) / 1000,
      typicalWidth: Math.round(typical * 10) / 10,
      kinds,
    },
    ms: Date.now() - started,
  };
}

function crestCount(walk: Walk): number {
  const spans = segmentSpans(walk.track);
  return walk.track.segments.filter(
    (segment, i) => segment.feature === "crest" && spans[i].from < walk.distance,
  ).length;
}

function describe(
  jumps: number,
  fords: number,
  bridges: number,
  culverts: number,
  crests: number,
  tunnelMetres: number,
  rails: number,
  junctions: number,
): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many = `${one}s`) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(jumps, "jump");
  add(crests, "crest");
  add(fords, "ford");
  add(bridges, "bridge");
  add(culverts, "culvert");
  if (tunnelMetres > 0) parts.push(`${tunnelMetres.toFixed(0)} m of bore`);
  add(rails, "level crossing");
  add(junctions, "junction");
  return parts.length > 0 ? parts.join(", ") : "nothing but road";
}

function sayFeatures(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "features.jumps":
      return short
        ? `${t.value.toFixed(2)} jumps a km — the car stays on the ground`
        : `${t.value.toFixed(2)} jumps a km — a stunt show`;
    case "features.crossings":
      return short
        ? `${t.value.toFixed(2)} water crossings a km — a dry country`
        : `${t.value.toFixed(2)} water crossings a km — the road is in the river`;
    case "features.surfaceMix":
      return `${t.value.toFixed(1)} surfaces the whole way — nothing changes underfoot`;
    case "features.sealedShare":
      return short
        ? `${(t.value * 100).toFixed(0)}% sealed — no gravel-into-tarmac moment`
        : `${(t.value * 100).toFixed(0)}% sealed — a road race with a rally on the end`;
    case "features.kinds":
      return short
        ? `only ${t.value.toFixed(0)} kinds of thing happen — hard to describe in a sentence`
        : `${t.value.toFixed(0)} kinds of thing happen — a catalogue rather than a stage`;
    default:
      return short
        ? `the road is the same width throughout`
        : `${(t.value * 100).toFixed(0)}% of it is pinched in — no room anywhere`;
  }
}

/** Feature counts without the facet around them — what `character.ts` reads
 * to place a stage on the `airborne` axis, and what the CLI prints beside
 * the seed. Kept here so `features.rateFeatures` and the fingerprint can
 * never disagree about how many jumps a stage has. */
export function featureTally(track: Track, distance: number): { jumps: number; lip: number } {
  const spans = segmentSpans(track);
  let jumps = 0;
  let lip = 0;
  for (let i = 0; i < track.segments.length; i++) {
    if (spans[i].from >= distance) continue;
    if (track.segments[i].feature !== "jump") continue;
    jumps++;
    lip += track.segments[i].lipHeight ?? 0;
  }
  return { jumps, lip };
}
