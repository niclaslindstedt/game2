#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RALLY RATING CLI — is this stage any good, and do these six make a
// campaign?
//
// `make analyze` asks whether a stage is BROKEN and is happy with one that
// is merely correct. This asks the question that starts where that one
// stops. It has four modes and they are four different jobs:
//
//   ONE STAGE      `make rate SEEDS=38 ARGS=--traits`
//     Every trait, its measurement, its band and what it would say about
//     it. What you read when you are deciding whether a seed is worth a
//     level slot.
//
//   A SWEEP        `make rate COUNT=64`
//     A table, one row a seed. Sort by score to shortlist; read the
//     CHARACTER columns to shortlist for a LADDER, which is a different
//     shortlist and usually a better one.
//
//   THE POPULATION `make rate COUNT=120 ARGS=--stats`
//     What the GENERATOR builds, not what one seed came out as: per trait,
//     the distribution across the sweep and the share of seeds inside the
//     band. Two jobs at once — it is how a band is calibrated (a trait
//     every seed passes is measuring nothing, and one no seed passes is a
//     wish), and it is how a change to `mapgen/` is judged, because a rules
//     change moves a distribution and one seed cannot show you that.
//
//   THE CAMPAIGN   `make rate CAMPAIGN=1`
//     The committed ladder, audited as a set: does it climb, are its stages
//     unlike each other, does every rung lead on something, does it use the
//     weather and the calendar and all three cars.
//
// ...and `--pick`, which proposes a ladder out of a sweep. It is a
// SHORTLIST, not an answer: confirm every candidate with `make sim` (does
// the bot agree it climbs), `make level` (what is actually on the road) and
// `make track` (what it looks like) before moving a level.
//
//   npm run rate                          # seeds 1..8, medium sprints
//   npm run rate -- --seeds 38,19,21      # specific seeds
//   npm run rate -- --count 64 --stats    # the population
//   npm run rate -- --length long --shape circuit
//   npm run rate -- --biome desert --count 40
//   npm run rate -- --season winter        # the road the cold builds (R48)
//   npm run rate -- --campaign            # the committed ladder
//   npm run rate -- --count 200 --pick 4  # propose a ladder
//   npm run rate -- --json out.json
//
// Exits non-zero when a seed scores under --floor, so it can gate a change.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { aliasEngine } from "./lib/engine-alias.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
aliasEngine(root);
const engine = await import(join(root, "engine/index.ts"));
const { rateSeed, rateLadder, rateCampaign, CHARACTER_AXES, NUMERIC_KNOBS, STAGE_RULES } = engine;

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}

const length = flag("length") ?? "medium";
const shape = flag("shape") ?? "sprint";
const floor = Number(flag("floor") ?? 0);
const maxNotes = Number(flag("notes") ?? 6);
const pick = flag("pick") ? Number(flag("pick")) : 0;
const season = flag("season");
const knobs = {};
for (const dial of NUMERIC_KNOBS) {
  const value = flag(dial);
  if (value !== undefined) knobs[dial] = Number(value);
}
if (flag("biome") !== undefined) knobs.biome = flag("biome");

if (!has("campaign") && !(length in STAGE_RULES.stageLengths)) {
  console.error(`unknown length "${length}" (${Object.keys(STAGE_RULES.stageLengths).join(", ")})`);
  process.exit(2);
}
if (shape !== "sprint" && shape !== "circuit") {
  console.error(`unknown shape "${shape}" (sprint, circuit)`);
  process.exit(2);
}

const pad = (v, n) => String(v).padStart(n);
const padEnd = (v, n) => String(v).padEnd(n);
const bar = (score) => " ▁▂▃▄▅▆▇█"[Math.min(8, Math.max(0, Math.round(score * 8)))];
const mark = { thin: "▽", much: "▲", in: " ", note: " " };

const FACETS = ["flow", "pace", "relief", "features", "scenery", "risk"];

// ── the campaign audit ────────────────────────────────────────────────────

if (has("campaign")) {
  const { LOCATIONS, campaignKnobs } = await import(join(root, "pwa/src/game/campaign.ts"));
  const ladders = [];
  for (const location of LOCATIONS) {
    const steps = location.levels.map((level) => ({
      id: level.id,
      name: level.name,
      rating: rateSeed(level.seed, {
        length: level.length,
        shape: level.shape ?? "sprint",
        knobs: campaignKnobs(level),
        // R48 — a winter level is a different road from the same seed, so
        // the audit has to build the one the player actually drives.
        climate: { season: level.season },
      }),
      conditions: {
        hour: level.hour,
        weather: level.weather,
        season: level.season,
        biome: location.biome,
      },
    }));
    ladders.push(rateLadder(location.id, location.name, steps));
  }
  const report = rateCampaign(ladders);

  for (const ladder of report.ladders) {
    console.log(`\n${ladder.label.toUpperCase()}  ${ladder.score.toFixed(1)}`);
    console.log(
      [
        padEnd("level", 18),
        pad("km", 6),
        pad("score", 6),
        pad("hard", 6),
        pad("car", 6),
        padEnd("conditions", 22),
        "character",
      ].join(" "),
    );
    for (let i = 0; i < ladder.steps.length; i++) {
      const step = ladder.steps[i];
      const conditions = `${step.conditions.season} ${step.conditions.weather} ${String(step.conditions.hour).padStart(4)}h`;
      console.log(
        [
          padEnd(step.name, 18),
          pad((step.rating.distance / 1000).toFixed(2), 6),
          pad(step.rating.score.toFixed(1), 6),
          pad(step.rating.difficulty.toFixed(3), 6),
          pad(topCar(ladder.demands[i]), 6),
          padEnd(conditions, 22),
          CHARACTER_AXES.map((axis) => bar(step.rating.character[axis])).join(""),
        ].join(" "),
      );
    }
    printTraits(ladder.traits, "    ");
    for (const note of ladder.notes.slice(0, maxNotes)) {
      console.log(`    ${mark[note.sense]} ${note.message}`);
    }
  }

  console.log(`\nCAMPAIGN  ${report.score.toFixed(1)}`);
  printTraits(report.traits, "    ");
  for (const note of report.notes.slice(0, maxNotes)) {
    console.log(`    ${mark[note.sense]} ${note.message}`);
  }
  console.log(`    axes: ${CHARACTER_AXES.join(" ")}`);
  if (flag("json")) writeFileSync(flag("json"), JSON.stringify(report, null, 2));
  process.exit(report.score < floor ? 1 : 0);
}

// ── the sweep ─────────────────────────────────────────────────────────────

const seeds = flag("seeds")
  ? flag("seeds").split(",").map(Number)
  : Array.from({ length: Number(flag("count") ?? 8) }, (_, i) => i + 1);

const ratings = [];
console.log(
  [
    padEnd("seed", 6),
    pad("score", 6),
    pad("km", 6),
    pad("hard", 6),
    ...FACETS.map((f) => pad(f.slice(0, 7), 8)),
    pad("car", 6),
    padEnd(" character", 11),
    pad("ms", 5),
  ].join(" "),
);

for (const seed of seeds) {
  const rating = rateSeed(seed, { length, shape, knobs, climate: season ? { season } : undefined });
  ratings.push(rating);
  const byId = new Map(rating.facets.map((f) => [f.id, f]));
  console.log(
    [
      padEnd(seed, 6),
      pad(rating.score.toFixed(1), 6),
      pad((rating.distance / 1000).toFixed(2), 6),
      pad(rating.difficulty.toFixed(3), 6),
      ...FACETS.map((id) => {
        const facet = byId.get(id);
        return pad(`${bar(facet.score)} ${(facet.score * 100).toFixed(0)}`, 8);
      }),
      pad(topCar(rating.demand), 6),
      ` ${CHARACTER_AXES.map((axis) => bar(rating.character[axis])).join("")}`,
      pad(rating.ms, 5),
    ].join(" "),
  );

  if (has("traits")) {
    for (const facet of rating.facets) {
      console.log(`    ${padEnd(facet.label, 12)} ${(facet.score * 100).toFixed(0)}%`);
      for (const t of facet.traits) {
        console.log(
          `      ${bar(t.score)}${mark[t.verdict]} ${padEnd(t.id, 22)} ` +
            `${pad(t.value.toFixed(2), 8)} ${padEnd(t.unit, 7)} ` +
            `band ${t.band.min}–${t.band.max}  ${t.label}`,
        );
      }
    }
  }
  if (seeds.length <= 8 || has("traits")) {
    for (const note of rating.notes.slice(0, maxNotes)) {
      console.log(
        `    ${mark[note.sense]} ${note.message}${note.s ? ` @ ${note.s.toFixed(0)} m` : ""}`,
      );
    }
  }
}

if (seeds.length > 1) {
  console.log(`\naxes: ${CHARACTER_AXES.join(" ")}`);
}

// ── the population ────────────────────────────────────────────────────────

if (has("stats")) {
  console.log(`\nPOPULATION over ${ratings.length} seeds — what the GENERATOR builds`);
  console.log(
    [
      padEnd("trait", 24),
      pad("min", 8),
      pad("p25", 8),
      pad("med", 8),
      pad("p75", 8),
      pad("max", 8),
      pad("band", 15),
      pad("in", 6),
    ].join(" "),
  );
  const traitIds = ratings[0].facets.flatMap((facet) => facet.traits.map((t) => t.id));
  for (const id of traitIds) {
    const values = ratings
      .flatMap((r) => r.facets.flatMap((f) => f.traits))
      .filter((t) => t.id === id)
      .map((t) => t.value)
      .sort((a, b) => a - b);
    const band = ratings[0].facets.flatMap((f) => f.traits).find((t) => t.id === id).band;
    const inBand = values.filter((v) => v >= band.min && v <= band.max).length / values.length;
    console.log(
      [
        padEnd(id, 24),
        pad(values[0].toFixed(2), 8),
        pad(percentile(values, 0.25).toFixed(2), 8),
        pad(percentile(values, 0.5).toFixed(2), 8),
        pad(percentile(values, 0.75).toFixed(2), 8),
        pad(values[values.length - 1].toFixed(2), 8),
        pad(`${band.min}–${band.max}`, 15),
        pad(`${(inBand * 100).toFixed(0)}%`, 6),
      ].join(" "),
    );
  }
  const scores = ratings.map((r) => r.score).sort((a, b) => a - b);
  console.log(
    `\nscore  min ${scores[0].toFixed(1)}  med ${percentile(scores, 0.5).toFixed(1)}  ` +
      `max ${scores[scores.length - 1].toFixed(1)}  mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`,
  );
  console.log(
    "a trait every seed clears is measuring nothing; one no seed clears is a wish. Aim for a third to two thirds in band.",
  );
}

// ── the shortlist ─────────────────────────────────────────────────────────

if (pick > 0) {
  const chosen = proposeLadder(ratings, pick);
  console.log(`\nPROPOSED LADDER of ${pick} — shortlist only; confirm with sim, level and track`);
  for (const rating of chosen) {
    console.log(
      [
        padEnd(`seed ${rating.seed}`, 12),
        pad(rating.score.toFixed(1), 6),
        pad(rating.difficulty.toFixed(3), 6),
        pad(topCar(rating.demand), 6),
        CHARACTER_AXES.map((axis) => bar(rating.character[axis])).join(""),
      ].join(" "),
    );
  }
}

if (flag("json")) {
  writeFileSync(flag("json"), JSON.stringify(ratings, null, 2));
  console.log(`\n${flag("json")} — ${ratings.length} ratings`);
}

const worst = Math.min(...ratings.map((r) => r.score));
process.exit(worst < floor ? 1 : 0);

// ── helpers ───────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
}

function topCar(demand) {
  const best = Object.entries(demand).sort((a, b) => b[1] - a[1])[0];
  return `${best[0].slice(0, 4)}${(best[1] * 100).toFixed(0)}`;
}

/** GREEDILY BUILD A LADDER out of a sweep: take the best-scoring seed as
 * the opener, then add whichever remaining seed is furthest in CHARACTER
 * from everything already chosen while still scoring well — and finally put
 * the result in difficulty order, which is the order it would be played.
 *
 * Furthest-first rather than best-first is the whole point. The six
 * best-scoring seeds in any sweep are six versions of the same road; this
 * trades a little score for stages that are not each other, which is the
 * trade a campaign wants. */
function proposeLadder(pool, count) {
  const usable = pool.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  if (usable.length === 0) return [];
  const chosen = [usable[0]];
  while (chosen.length < count && chosen.length < usable.length) {
    let best = null;
    let bestValue = -Infinity;
    for (const candidate of usable) {
      if (chosen.includes(candidate)) continue;
      let nearest = Infinity;
      for (const taken of chosen) {
        nearest = Math.min(nearest, engine.characterDistance(candidate.character, taken.character));
      }
      // Distance carries it, with the stage's own rating as the tiebreak —
      // an unlike stage that is bad is still a bad level.
      const value = nearest + candidate.score / 400;
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen.sort((a, b) => a.difficulty - b.difficulty);
}

function printTraits(traits, indent) {
  for (const t of traits) {
    console.log(
      `${indent}${bar(t.score)}${mark[t.verdict]} ${padEnd(t.id, 22)} ` +
        `${pad(t.value.toFixed(2), 8)} ${padEnd(t.unit, 10)} band ${t.band.min}–${t.band.max}`,
    );
  }
}
