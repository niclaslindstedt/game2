// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator invariants: every R-rule from engine/mapgen/rules.ts is asserted
// here across a spread of seeds — determinism, bounds, braking zones,
// same-direction caps, feature placement, self-intersection, the length
// bands, the pacenote book, the ford dips, and the endless stream.
import { describe, expect, it } from "vitest";

import {
  STAGE_RULES as R,
  builtTerrain,
  compileStage,
  compileTrack,
  createTerrain,
  generateStage,
  roadClearance,
  type FiniteStageLength,
  type Track,
  type TurnSeverity,
} from "@engine";

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
      const plans = generateStage(seed);
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
      for (const plan of generateStage(seed)) {
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
        const plans = generateStage(seed, "medium", {}, shape);
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
      const plans = generateStage(seed);
      for (let i = 0; i < plans.length; i++) {
        if (plans[i].kind === "turn" && plans[i].severity === "hard") {
          expect(i).toBeGreaterThan(0);
          expect(plans[i - 1].kind).toBe("straight");
        }
      }
    }
  });

  it("R5 — same-direction runs stay under the count and angle caps", () => {
    for (const seed of SEEDS) {
      let dir = 0;
      let run = 0;
      let angle = 0;
      for (const plan of generateStage(seed)) {
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
      for (const plan of generateStage(seed)) {
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
      for (const plan of generateStage(seed)) {
        if (plan.feature !== "water") continue;
        expect(plan.kind).toBe("straight");
        // A ford needs its dip's aprons; a deck needs its level run-on.
        const margin = plan.crossing === "ford" ? R.water.apron : R.bridge.margin;
        expect(plan.featureStart ?? 0).toBeGreaterThanOrEqual(margin);
        expect(plan.length - (plan.featureEnd ?? 0)).toBeGreaterThanOrEqual(margin);
      }
    }
  });

  it("R13 — the span decides the architecture: wade it, plank it, or pour it", () => {
    let fords = 0;
    let culverts = 0;
    let timber = 0;
    let concrete = 0;
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed, "long", { water: 0.85 })) {
        if (plan.feature !== "water") continue;
        const span = (plan.featureEnd ?? 0) - (plan.featureStart ?? 0);
        if (plan.crossing === "ford") {
          fords += 1;
          expect(span).toBeLessThanOrEqual(R.water.fordMax);
        } else if (plan.crossing === "culvert") {
          // R12 — a stream the road could not dip to goes under it; the
          // crossing occupies the pipe's own span of road.
          culverts += 1;
          expect(span).toBeCloseTo(R.water.culvert.span, 5);
        } else if (plan.crossing === "timber") {
          timber += 1;
          expect(span).toBeGreaterThan(R.water.fordMax);
          expect(span).toBeLessThanOrEqual(R.bridge.timberMax);
        } else {
          concrete += 1;
          expect(span).toBeGreaterThan(R.bridge.timberMax);
        }
      }
    }
    // A wet stage band has to actually produce all four, or the rule is
    // only theory.
    expect(fords).toBeGreaterThan(0);
    expect(culverts).toBeGreaterThan(0);
    expect(timber).toBeGreaterThan(0);
    expect(concrete).toBeGreaterThan(0);
    // Twenty-four LONG stages at the wet end of the dial, which is a good
    // way over the file's own 30 s: it passed on an idle machine and timed
    // out beside the rest of the file, which is a coin toss and not a test.
  }, 90_000);

  // Twenty-four LONG stages, sixteen of them with the public roads laid
  // across the country first (R17) and a borrow solved against them. This is
  // the heaviest test in the file by a distance — 50 s against the file-wide
  // 30 s allowance in `vitest.config.ts` — and it is the ONE case here with a
  // timeout of its own. It WIDENS the allowance and never narrows it: a case
  // that narrows it has decided how busy a CI runner is allowed to be, which
  // is the thing the file-wide number exists to stop. Everything else in this
  // file still runs on the shared 30 s, so the cost of this one case is not
  // paid by the rest.
  //
  // It is measuring a statistical claim, so it needs the seeds: eight is
  // what makes "the dial buys some, and more buys no less" a fact about the
  // generator rather than about seed 1.
  //
  // R15/R17 — the asphalt dial asks for tarmac; the COUNTRY decides how
  // much of it the rally can actually have.
  //
  // It used to be a promise: the paving field sealed stretches of the
  // racing line with probability `asphalt`, so the share came out on the
  // dial to a couple of points. What made that cheap is what made it wrong
  // — the tarmac was a stripe painted on the rally's own road, so there was
  // always exactly as much of it as was asked for.
  //
  // Now the sealed stretches are pieces of real public roads laid on the
  // bare land before the route is drawn (`highway.ts`), and the only way to
  // spend a metre of the dial is to be driving on one. So the dial is a
  // TARGET the search spends against, and three things bound it: whether
  // the land carries a road at all, whether the route comes within reach of
  // one, and how far it can run along it before R9 puts it out of the world
  // — a bounded map cannot hold four kilometres of straight public road.
  // What is left to assert is the shape of the response, not its value.
  it("R15 — the asphalt dial buys tarmac, and the country bounds how much", () => {
    const share = (asphalt: number): number => {
      let paved = 0;
      let total = 0;
      for (const seed of SEEDS.slice(0, 8)) {
        const track = compileStage(seed, "long", { asphalt });
        paved += track.samples.filter((s) => s.surface === "asphalt").length;
        total += track.samples.length;
      }
      return paved / total;
    };
    // Under the floor the country carries no public road, so the rally has
    // nothing to borrow and the stage is gravel end to end. This half of
    // the contract is exact, and it is the half that matters: a stage with
    // no tarmac asked for has none.
    expect(share(0)).toBe(0);
    // Past it the dial buys some, up to the ceiling the country sets, which
    // is where it stops. Measured over these eight long stages: 0% at 0 and
    // 3.5% everywhere above it.
    //
    // That ceiling is now R38's, and it is lower and flatter than it was —
    // 10.3% at 0.25 before the rule, against 3.5% now. A public road runs
    // straight for two or three hundred metres at a time between its bends,
    // the rally may not sit on a straight that long, so a borrow ends where
    // the road stops bending rather than where the dial stops asking. What
    // is asserted is therefore that the dial buys tarmac at all past its
    // floor, and never a value at the top.
    expect(share(0.1)).toBeGreaterThan(0.02);
    expect(share(0.25)).toBeGreaterThanOrEqual(share(0.1) * 0.9);
    // ...and longer again since R23's height clause: a hilly seed's search
    // backtracks several times as often for the fold-backs it refuses.
  }, 150_000);

  it("the dials are deterministic, and different dials build different stages", () => {
    const dials = { elevation: 0.8, water: 0.2, trees: 0.9, asphalt: 0.4 };
    expect(compileStage(7, "medium", dials).samples).toEqual(
      compileStage(7, "medium", dials).samples,
    );
    expect(compileStage(7, "medium", dials).samples).not.toEqual(
      compileStage(7, "medium", { ...dials, elevation: 0.1 }).samples,
    );
  });

  it("the elevation dial is the road's own relief", () => {
    const swing = (elevation: number): number => {
      const ys = compileStage(4, "medium", { elevation }).samples.map((s) => s.elevation);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(swing(0)).toBeLessThan(swing(0.5));
    expect(swing(0.5)).toBeLessThan(swing(1));
  });

  it("R9 — the centerline stays inside each length's world bounds", () => {
    for (const length of ["short", "medium", "long"] as FiniteStageLength[]) {
      const bound = R.stageLengths[length].worldBound;
      for (const seed of SEEDS.slice(0, 6)) {
        const track = compileStage(seed, length);
        expect(track.bounds.minX).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxX).toBeLessThanOrEqual(bound);
        expect(track.bounds.minZ).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxZ).toBeLessThanOrEqual(bound);
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
      const track = compileTrack(seed);
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

  // Two minutes because R17 lays the country's tarmac before the route and
  // the search then has to plan around it, and R23's height clause refuses
  // every fold-back the terrain could not build — a hilly seed's search
  // backtracks several times as often for it — and this walks thirty-two
  // stages, eight of them on the longest band.
  it("R24 — nothing comes back into the start, on any length", () => {
    const violations: string[] = [];
    for (const length of ["short", "medium", "long", "xlong"] as FiniteStageLength[]) {
      for (const seed of SEEDS.slice(0, 8)) {
        const track = compileStage(seed, length);
        const clear = roadClearance(track.width) - 7;
        const first = track.samples[0];
        const last = track.samples[track.samples.length - 1];
        // The zone is the grid, the apron of dirt behind it, and the road's
        // clearance around both. Measured from the start's own axis, since
        // that is the line the apron is laid along.
        const toStart = (x: number, z: number): number => {
          const along = -(
            (x - first.x) * Math.sin(first.heading) +
            (z - first.z) * Math.cos(first.heading)
          );
          const lateral =
            (x - first.x) * Math.cos(first.heading) - (z - first.z) * Math.sin(first.heading);
          return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - R.startZone.apron));
        };
        for (const sample of track.samples) {
          if (sample.s < R.startZone.fromArc) continue;
          if (toStart(sample.x, sample.z) < clear) {
            violations.push(
              `${length} seed ${seed}: s=${sample.s.toFixed(0)} is ` +
                `${toStart(sample.x, sample.z).toFixed(1)} m from the start`,
            );
          }
        }
        // ...and the finish's run-off is held to it too: the apron past the
        // flying finish is drawn road with a shelf under it, so a stage
        // that closes across its own start leaves that road in the air.
        for (let past = 0; past <= R.startZone.apron; past += 6) {
          const x = last.x + Math.sin(last.heading) * past;
          const z = last.z + Math.cos(last.heading) * past;
          if (toStart(x, z) < clear) {
            violations.push(`${length} seed ${seed}: the run-off lands in the start zone`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  }, 120000);

  it("R11 — every finite length lands in its band", () => {
    for (const length of ["short", "medium", "long", "xlong"] as FiniteStageLength[]) {
      const band = R.stageLengths[length].band;
      for (const seed of SEEDS.slice(0, 4)) {
        const track = compileStage(seed, length);
        // R11 measures the RACED stage: the road up to the finish gate.
        // R22's run-out past it is not part of the band.
        const raced = track.finishS ?? track.length;
        expect(raced).toBeGreaterThanOrEqual(band.min - R.closingStraight);
        expect(raced).toBeLessThanOrEqual(band.max + R.closingStraight);
        expect(track.length).toBeCloseTo(raced + R.runOut, 3);
      }
    }
  }, 60000);

  it("compiles continuous, finite samples with a jump lip per jump segment", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const track = compileTrack(seed);
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
      const track = compileTrack(seed);
      let s = 0;
      for (const plan of track.segments) {
        if (plan.kind === "turn") {
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
      const track = compileTrack(seed);
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
    const track = compileTrack(SEEDS[0]);
    for (const note of track.pacenotes) {
      expect(note.angle).toBeGreaterThan(0);
      expect(note.endS).toBeGreaterThan(note.s);
    }
  });
});

describe("ford dips (R12)", () => {
  it("water lies flat, below every approach within the apron", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const track = compileTrack(seed);
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
