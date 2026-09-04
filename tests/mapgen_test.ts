// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator invariants: the R-rules from engine/mapgen/rules.ts that govern
// the ROUTE a stage draws, asserted across a spread of seeds — determinism,
// braking zones, same-direction caps, feature placement, self-intersection,
// the pacenote book, the ford dips, and the endless stream.
//
// Two groups of rules are files of their own, because they are the only ones
// that cannot answer from this file's corpus and are most of what the suite
// spends: the length bands and the world bounds (`mapgen_bands_test.ts`) and
// the stage dials (`mapgen_dials_test.ts`).
import { describe, expect, it } from "vitest";

import {
  STAGE_RULES as R,
  builtTerrain,
  compileStage,
  createTerrain,
  generateStage,
  roadClearance,
  straightPart,
  type Track,
  type TurnSeverity,
} from "@engine";

import { stagePlans, stageTrack } from "./support/stages.ts";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);
const SEVERITY_RANK: Record<TurnSeverity, number> = { soft: 0, medium: 1, hard: 2 };

describe("stage generator", () => {
  it("is deterministic per seed", () => {
    for (const seed of [1, 99, 4711]) {
      const a = generateStage(seed);
      const b = generateStage(seed);
      expect(a).toEqual(b);
    }
  });

  it("produces different stages for different seeds", () => {
    expect(generateStage(1)).not.toEqual(generateStage(2));
  });

  it("R1/R2 — opens and closes with a featureless straight", () => {
    for (const seed of SEEDS) {
      const plans = stagePlans(seed);
      const first = plans[0];
      const last = plans[plans.length - 1];
      expect(first.kind).toBe("straight");
      expect(first.feature).toBe("none");
      expect(first.length).toBeGreaterThanOrEqual(R.openingStraight);
      expect(last.kind).toBe("straight");
      expect(last.feature).toBe("none");
      expect(last.length).toBeGreaterThanOrEqual(R.closingStraight);
    }
  });

  it("R3 — turns stay inside their severity vocabulary", () => {
    for (const seed of SEEDS) {
      for (const plan of stagePlans(seed)) {
        if (plan.kind !== "turn") continue;
        // R3 governs the corners the rally DRAWS. A borrowed public road's
        // bends are the road's own (R17) — tracked, not drawn, and as wide
        // as R38 lets a road be and still count as bending at all.
        if (plan.paved) continue;
        const vocab = R.turn[plan.severity ?? "soft"];
        expect(plan.radius).toBeGreaterThanOrEqual(vocab.radius.min);
        expect(plan.radius).toBeLessThanOrEqual(vocab.radius.max);
        const angle = plan.length / (plan.radius ?? 1);
        expect(angle).toBeGreaterThanOrEqual(vocab.angle.min - 1e-9);
        expect(angle).toBeLessThanOrEqual(vocab.angle.max + 1e-9);
      }
    }
  });

  it("R38 — the route never runs far without a corner in it", () => {
    for (const seed of SEEDS) {
      // Both shapes, but the circuit only on a slice of the seeds: it draws
      // from the same vocabulary through the same tracker, and a closure is
      // the dearest thing the generator does.
      for (const shape of ["sprint", "circuit"] as const) {
        if (shape === "circuit" && seed % 3 !== 1) continue;
        const plans = stagePlans(seed, "medium", {}, shape);
        let run = 0;
        let worst = 0;
        for (const plan of plans) {
          // The run breaks at a corner and carries on through anything too
          // wide to be one — a straight, or a borrowed road's own lean.
          const part =
            plan.kind === "straight"
              ? plan.length
              : (plan.radius ?? 0) > R.straightRun.bend
                ? plan.length
                : 0;
          run = part === 0 ? 0 : run + part;
          // The closing straight carries R25's run-out on its back, and the
          // run-out is road the clock never sees (R11) — so what is measured
          // here is the raced part of it, exactly as the analysis measures
          // the raced stage.
          if (plan.runOut) run -= plan.runOut;
          worst = Math.max(worst, run);
        }
        const cap = Math.max(R.straightRun.max, R.straightRun.borrowed);
        expect({ seed, shape, worst }).toEqual({ seed, shape, worst: Math.min(worst, cap) });
      }
    }
  });

  it("R4 — every hard turn follows a straight", () => {
    for (const seed of SEEDS) {
      const plans = stagePlans(seed);
      for (let i = 0; i < plans.length; i++) {
        if (plans[i].kind === "turn" && plans[i].severity === "hard") {
          expect(i).toBeGreaterThan(0);
          // Straight by R38's measure: a borrowed road's gentle bend is a
          // turn of the road's own radius and a braking zone all the same.
          expect(straightPart(plans[i - 1]), `seed ${seed} plan ${i}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("R5 — same-direction runs stay under the count and angle caps", () => {
    for (const seed of SEEDS) {
      let dir = 0;
      let run = 0;
      let angle = 0;
      for (const plan of stagePlans(seed)) {
        // R5/R17 — a BORROWED segment resets the run, exactly as
        // `search.ts`'s `trackRun` treats it. The cap is on how many
        // corners in a row the RALLY may turn the same way; the pieces of a
        // public road the route is running along are a line being tracked,
        // and a gentle bend cut into seventy-metre chunks comes out as
        // several same-direction turns that in the country are one sweep.
        if (plan.kind !== "turn" || plan.paved) {
          dir = 0;
          run = 0;
          angle = 0;
          continue;
        }
        if (plan.dir === dir) {
          run += 1;
          angle += plan.length / (plan.radius ?? 1);
        } else {
          dir = plan.dir ?? 0;
          run = 1;
          angle = plan.length / (plan.radius ?? 1);
        }
        expect(run).toBeLessThanOrEqual(R.maxSameDirectionTurns);
        expect(angle).toBeLessThanOrEqual(R.maxSameDirectionAngle + 1e-9);
      }
    }
  });

  it("R6 — jumps sit on long straights with run-up and landing room", () => {
    for (const seed of SEEDS) {
      for (const plan of stagePlans(seed)) {
        if (plan.feature !== "jump") continue;
        expect(plan.kind).toBe("straight");
        expect(plan.length).toBeGreaterThanOrEqual(R.jump.minStraight);
        expect(plan.featureStart ?? 0).toBeGreaterThanOrEqual(R.jump.runUp);
        expect(plan.length - (plan.featureEnd ?? 0)).toBeGreaterThanOrEqual(R.jump.landing);
      }
    }
  });

  it("R7/R13 — crossings sit on straights, clear of the ends by their own margin", () => {
    for (const seed of SEEDS) {
      for (const plan of stagePlans(seed)) {
        if (plan.feature !== "water") continue;
        expect(plan.kind).toBe("straight");
        // A ford needs its dip's aprons; a deck needs its level run-on.
        const margin = plan.crossing === "ford" ? R.water.apron : R.bridge.margin;
        expect(plan.featureStart ?? 0).toBeGreaterThanOrEqual(margin);
        expect(plan.length - (plan.featureEnd ?? 0)).toBeGreaterThanOrEqual(margin);
      }
    }
  });

  it("R10/R23 — the centerline keeps a road's clearance from itself", () => {
    // Compare coarsely (every 3rd sample) for test speed; ignore route
    // neighbours within 100 m of arc length — the generator's guarantee
    // starts at its 80 m ignore window plus probe coarseness. The
    // guarantee itself is the road's own clearance at 6 m probe spacing, so
    // the continuous line can dip up to ~one probe step closer. Violations
    // are collected in plain code (an expect() per pair would time the test
    // out) and asserted once.
    const violations: string[] = [];
    for (const seed of SEEDS) {
      const track = stageTrack(seed);
      const min2 = (roadClearance(track.width) - 7) ** 2;
      const pts = track.samples;
      for (let i = 0; i < pts.length; i += 3) {
        for (let j = i + 3; j < pts.length; j += 3) {
          if (pts[j].s - pts[i].s < 100) continue;
          const dx = pts[i].x - pts[j].x;
          const dz = pts[i].z - pts[j].z;
          if (dx * dx + dz * dz < min2) {
            violations.push(
              `seed ${seed}: s=${pts[i].s.toFixed(0)} vs s=${pts[j].s.toFixed(0)} at ` +
                `${Math.sqrt(dx * dx + dz * dz).toFixed(1)} m`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("compiles continuous, finite samples with a jump lip per jump segment", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const track = stageTrack(seed);
      let prev = track.samples[0];
      for (const sample of track.samples) {
        expect(Number.isFinite(sample.x)).toBe(true);
        expect(Number.isFinite(sample.z)).toBe(true);
        expect(Number.isFinite(sample.elevation)).toBe(true);
        const dx = sample.x - prev.x;
        const dz = sample.z - prev.z;
        expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThanOrEqual(track.step * 1.5 + 1e-6);
        prev = sample;
      }
      const jumpSegments = track.segments.filter((p) => p.feature === "jump").length;
      const lips = track.samples.filter((s) => s.jump).length;
      expect(lips).toBe(jumpSegments);
    }
  });
});

describe("pacenotes", () => {
  it("covers every turn segment with a matching call", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const track = stageTrack(seed);
      let s = 0;
      for (const plan of track.segments) {
        // A bend R38 counts as straight run (a borrowed road's, gentler than
        // `straightRun.bend`) is no call: the co-driver reads the same test.
        if (plan.kind === "turn" && straightPart(plan) === 0) {
          const mid = s + plan.length / 2;
          const note = track.pacenotes.find((n) => n.s <= mid && n.endS >= mid);
          expect(note).toBeDefined();
          expect(note?.dir).toBe(plan.dir);
          // A note's severity is the tightest of the turns it merged.
          expect(SEVERITY_RANK[note?.severity ?? "soft"]).toBeGreaterThanOrEqual(
            SEVERITY_RANK[plan.severity ?? "soft"],
          );
        }
        s += plan.length;
      }
    }
  });

  it("merges contiguous same-direction turns into one call", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const track = stageTrack(seed);
      for (let i = 1; i < track.pacenotes.length; i++) {
        const prev = track.pacenotes[i - 1];
        const next = track.pacenotes[i];
        expect(next.s).toBeGreaterThanOrEqual(prev.endS - 1e-6);
        // Back-to-back notes only exist across a direction change; a
        // same-direction continuation would have merged.
        if (next.s - prev.endS < 1e-6) expect(next.dir).not.toBe(prev.dir);
      }
    }
  });

  it("notes carry the summed turn angle", () => {
    const track = stageTrack(SEEDS[0]);
    for (const note of track.pacenotes) {
      expect(note.angle).toBeGreaterThan(0);
      expect(note.endS).toBeGreaterThan(note.s);
    }
  });
});

describe("ford dips (R12)", () => {
  it("water lies flat, below every approach within the apron", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const track = stageTrack(seed);
      const samples = track.samples;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].surface !== "water") continue;
        // Flat across the run…
        let j = i;
        while (j < samples.length && samples[j].surface === "water") j++;
        for (let k = i; k < j; k++) {
          expect(Math.abs(samples[k].elevation - samples[i].elevation)).toBeLessThan(1e-6);
        }
        // …and a local low: nothing within an apron of either end dips
        // below the water line.
        const reach = Math.round(R.water.apron / track.step);
        for (let k = Math.max(0, i - reach); k < Math.min(samples.length, j + reach); k++) {
          expect(samples[k].elevation).toBeGreaterThanOrEqual(samples[i].elevation - 1e-6);
        }
        i = j;
      }
    }
  });
});

describe("endless stages", () => {
  it("streams deterministically regardless of how extends are chunked", () => {
    const a = compileStage(7, "endless");
    a.extend?.(6000);
    const b = compileStage(7, "endless");
    for (let s = 1500; s <= 6000; s += 331) b.extend?.(s);
    b.extend?.(6000);
    expect(a.samples.length).toBe(b.samples.length);
    for (let i = 0; i < a.samples.length; i += 7) {
      expect(a.samples[i].x).toBeCloseTo(b.samples[i].x, 9);
      expect(a.samples[i].elevation).toBeCloseTo(b.samples[i].elevation, 9);
      expect(a.samples[i].surface).toBe(b.samples[i].surface);
    }
    expect(a.pacenotes).toEqual(b.pacenotes);
  });

  it("keeps the R10 guarantee inside the tail window", () => {
    for (const seed of [3, 11, 42]) {
      const track = compileStage(seed, "endless");
      track.extend?.(8000);
      const pts = track.samples;
      const min2 = (roadClearance(track.width) - 7) ** 2;
      const violations: string[] = [];
      for (let i = 0; i < pts.length; i += 3) {
        for (let j = i + 3; j < pts.length; j += 3) {
          const gap = pts[j].s - pts[i].s;
          if (gap < 100 || gap > R.endless.tailWindow) continue;
          const dx = pts[i].x - pts[j].x;
          const dz = pts[i].z - pts[j].z;
          if (dx * dx + dz * dz < min2) {
            violations.push(`seed ${seed}: s=${pts[i].s.toFixed(0)} vs ${pts[j].s.toFixed(0)}`);
          }
        }
      }
      expect(violations).toEqual([]);
    }
  });

  it("marks the terrains it built, and never a stub spread over one", () => {
    // What lets a reader cache an answer against the TRACK instead of the
    // field that was asked (`exposureAt` in the bot): two genuine terrains
    // off one track are one country, so they may share the work — while a
    // test's own `waterAt` must never be handed the real country's answers.
    // A spread is exactly the thing that would defeat a flag or a property,
    // so this asserts a spread does NOT inherit the mark.
    const track = compileStage(11, "short");
    const real = createTerrain(track);
    expect(builtTerrain(real)).toBe(true);
    // Two fields off ONE track are separately built and both genuine.
    expect(builtTerrain(createTerrain(track))).toBe(true);
    expect(builtTerrain({ ...real, waterAt: () => null })).toBe(false);
  });

  it("always keeps road materialized past what was asked for", () => {
    const track: Track = compileStage(5, "endless");
    expect(track.endless).toBe(true);
    expect(track.length).toBeGreaterThanOrEqual(R.endless.initial);
    track.extend?.(4000);
    expect(track.length).toBeGreaterThanOrEqual(4000);
    // Asking for less than what exists is a no-op.
    const before = track.samples.length;
    expect(track.extend?.(1000)).toBe(false);
    expect(track.samples.length).toBe(before);
  });
});
