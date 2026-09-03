// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE ANALYSIS — the generator's scoreboard, tested as an instrument.
//
// These are not tests of whether the stages are good; `make analyze` is the
// place that question gets asked, and the answer moves every time the rules
// do. What is pinned here is that the INSTRUMENT is sound, because an
// analyzer nobody can trust is worse than none: it sends the next session
// chasing findings that are not there, or reassures it about defects that
// are.
//
// So: the report has the shape it claims, the scores are in range, the
// checks measure what their ids say, the whole thing is deterministic in the
// seed, and the pass/fail gates at the two ends of a stage actually fail
// when the thing they gate on is missing.

import { describe, expect, it } from "vitest";

import {
  ANALYSIS,
  APRON_HOLDS,
  LAKE_Y,
  STAGE_RULES,
  analyzeSeed,
  compileStage,
  createTerrain,
  analyzeTrack,
  type StageReport,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8];

/** One report, built the way the tooling builds one — and then KEPT. Perf is
 * off: it times a cold rebuild, which doubles the suite and measures the
 * machine rather than the generator.
 *
 * The cache is what makes this file affordable. A dozen tests below ask about
 * the same handful of seeds, and without it every one of them regenerates
 * every stage from nothing — the same work, over and over, for an instrument
 * that is a pure function of its seed. Which is not an assumption here: it is
 * the claim `freshReport` exists to check. Nothing below mutates a report.
 *
 * The tests that sweep seeds carry an explicit 20 s timeout for the same
 * reason `circuit_test` does. Building a stage and rolling a rank of balls
 * down it is a second of real work on a quiet machine and rather more on a
 * shared runner, so vitest's 5 s default is not a timeout on this file — it is
 * a coin toss, and it came up tails on CI. */
const kept = new Map<string, StageReport>();

function freshReport(seed: number, knobs?: Record<string, number>): StageReport {
  return analyzeSeed(seed, { length: "medium", knobs, perf: false });
}

function report(seed: number, knobs?: Record<string, number>): StageReport {
  const key = `${seed}:${JSON.stringify(knobs ?? null)}`;
  let held = kept.get(key);
  if (!held) {
    held = freshReport(seed, knobs);
    kept.set(key, held);
  }
  return held;
}

describe("the stage report", () => {
  it("scores every metric in range and rolls them into one number", () => {
    for (const seed of SEEDS) {
      const r = report(seed);
      expect(r.seed, `seed ${seed}`).toBe(seed);
      expect(r.metrics.length, `seed ${seed}`).toBeGreaterThan(4);
      for (const metric of r.metrics) {
        expect(metric.score, `${seed} ${metric.id}`).toBeGreaterThanOrEqual(0);
        expect(metric.score, `${seed} ${metric.id}`).toBeLessThanOrEqual(1);
        expect(metric.checks.length, `${seed} ${metric.id}`).toBeGreaterThan(0);
        for (const check of metric.checks) {
          expect(check.score, `${seed} ${metric.id}.${check.id}`).toBeGreaterThanOrEqual(0);
          expect(check.score, `${seed} ${metric.id}.${check.id}`).toBeLessThanOrEqual(1);
          expect(check.weight, `${seed} ${metric.id}.${check.id}`).toBeGreaterThan(0);
        }
      }
      expect(r.score, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(r.score, `seed ${seed}`).toBeLessThanOrEqual(100);
    }
  }, 20_000);

  it("counts its own findings, worst first", () => {
    for (const seed of SEEDS) {
      const r = report(seed);
      const fromMetrics = r.metrics.flatMap((m) => m.findings);
      expect(r.findings.length, `seed ${seed}`).toBe(fromMetrics.length);
      expect(r.errors, `seed ${seed}`).toBe(
        r.findings.filter((f) => f.severity === "error").length,
      );
      expect(r.warns, `seed ${seed}`).toBe(r.findings.filter((f) => f.severity === "warn").length);
      // Ranked: no warning may sit above an error.
      let seenWarn = false;
      for (const finding of r.findings) {
        if (finding.severity !== "error") seenWarn = true;
        else expect(seenWarn, `seed ${seed} ${finding.code}`).toBe(false);
      }
      // Every finding names the check that raised it.
      for (const finding of r.findings) {
        expect(finding.code, `seed ${seed}`).toMatch(/^[a-z]+\.[a-z]+$/);
        expect(finding.message.length, `seed ${seed} ${finding.code}`).toBeGreaterThan(0);
      }
    }
  }, 20_000);

  it("is deterministic: the same seed scores the same twice", () => {
    // The one test that must not take the cache — handing back the same
    // object twice would prove nothing except that a Map works.
    for (const seed of [1, 7]) {
      const a = freshReport(seed);
      const b = freshReport(seed);
      expect(a.score, `seed ${seed}`).toBe(b.score);
      expect(a.findings.map((f) => f.code).join(), `seed ${seed}`).toBe(
        b.findings.map((f) => f.code).join(),
      );
    }
  }, 20_000);

  it("reads the dials: a wet stage measures as wetter than a dry one", () => {
    const dry = report(4, { water: 0 });
    const wet = report(4, { water: 1 });
    const share = (r: StageReport): number =>
      (r.metrics.find((m) => m.id === "ground")?.stats.waterShare ?? 0) as number;
    expect(share(wet)).toBeGreaterThan(share(dry));
  }, 20_000);
});

describe("the two ends (pass or fail)", () => {
  it("passes the start only when the apron holds a heads-up field", () => {
    // The apron is the generator's half of the promise, and it is the same
    // on every seed — so this is a rule assertion wearing a report's
    // clothes, and that is exactly why it is worth having: the number is
    // derived from `STAGE_RULES.startZone.apron`, and anyone shortening
    // that would otherwise only find out in a race.
    expect(APRON_HOLDS).toBeGreaterThanOrEqual(ANALYSIS.ends.grid);
    for (const seed of SEEDS) {
      const grid = report(seed)
        .metrics.find((m) => m.id === "ends")
        ?.checks.find((c) => c.id === "grid");
      expect(grid?.score, `seed ${seed}`).toBe(1);
    }
  }, 20_000);

  it("passes the finish only when there is run-out past the line (R25)", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      const terrain = createTerrain(track);
      terrain.sync(0);
      const ends = analyzeTrack(track, terrain, { perf: false }).metrics.find(
        (m) => m.id === "ends",
      );
      const runOut = ends?.checks.find((c) => c.id === "runout");
      expect(runOut?.score, `seed ${seed}`).toBe(1);
      expect(track.length - (track.finishS ?? 0), `seed ${seed}`).toBeGreaterThanOrEqual(
        STAGE_RULES.runOut * ANALYSIS.ends.runOutShare,
      );
    }
  }, 20_000);

  it("fails a stage whose finish gate has no road past it", () => {
    // Cut the run-out off and the check has to notice. A gate the analyzer
    // passes on a stage that ends AT the line is a gate that would pass on
    // anything.
    const track = compileStage(3, "medium");
    const cutAt = track.finishS ?? track.length;
    const truncated = {
      ...track,
      samples: track.samples.filter((s) => s.s <= cutAt),
      length: cutAt,
    };
    const terrain = createTerrain(truncated);
    terrain.sync(0);
    const ends = analyzeTrack(truncated, terrain, { perf: false }).metrics.find(
      (m) => m.id === "ends",
    );
    expect(ends?.checks.find((c) => c.id === "runout")?.score).toBe(0);
  });
});

describe("the rollers", () => {
  it("roll a rank wider than the road, and report what they touched", () => {
    const r = report(2);
    const rollers = r.metrics.find((m) => m.id === "rollers");
    expect(rollers).toBeDefined();
    const lanes = rollers?.stats.lanes ?? 0;
    // Wide enough to cover the mat and the verge either side of it, at the
    // rank's own spacing.
    const track = compileStage(2, "medium");
    const want = Math.ceil((track.width / 2 + ANALYSIS.rollers.verge) / ANALYSIS.rollers.spacing);
    expect(lanes).toBe(want * 2 + 1);
    expect(rollers?.stats.probes ?? 0).toBeGreaterThan(lanes);
  });

  // R17 — the check that would have caught the barriers laid across the
  // road the stage takes, tested the only way a "nothing is wrong" check can
  // be: by putting something wrong there. A clean sweep proves the
  // generator; only a sabotaged stage proves the instrument.
  it("sees a barrier standing in the road, solid or not", () => {
    // R17 — the seed is SEARCHED for rather than named: a stage has a
    // branch only where its country carries a public road for the route to
    // leave, and which seeds those are is the land's decision.
    let track = compileStage(26, "medium", { asphalt: 0.4 });
    for (const seed of [26, 41, 46, 3, 1, 2, 5, 8, 13, 21]) {
      track = compileStage(seed, "medium", { asphalt: 0.4 });
      if (track.spurs.some((s) => s.block)) break;
    }
    const terrain = createTerrain(track);
    const clean = analyzeTrack(track, terrain, { perf: false });
    expect(clean.findings.filter((f) => f.code === "rollers.clear")).toHaveLength(0);

    // Drag one branch's barrier onto the route's centerline and across it —
    // exactly where the renderer used to put a third of them.
    const spur = track.spurs.find((s) => s.block);
    expect(spur, "no seed in the sweep had a branch with a barrier on it").toBeDefined();
    const onRoad = track.samples.find((s) => s.s > (spur?.atS ?? 0));
    const block = spur?.block;
    if (!block || !onRoad) throw new Error("unreachable");
    block.x = onRoad.x;
    block.z = onRoad.z;
    block.heading = onRoad.heading + Math.PI / 2;
    const hit = analyzeTrack(track, terrain, { perf: false }).findings.filter(
      (f) => f.code === "rollers.clear",
    );
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].severity).toBe("error");
    expect(hit[0].message).toContain("barrier");
  }, 20_000);

  // R16 — the road's EDGE, as its own scored property. What it measures is
  // the grade the ground takes across the corridor's outer band, and the
  // reason it is separate from the cross-section check is that it is the
  // one with a photograph attached.
  it("scores the road's edge, and calls a wall a wall", () => {
    for (const seed of SEEDS) {
      const edge = report(seed)
        .metrics.find((m) => m.id === "rollers")
        ?.checks.find((c) => c.id === "edge");
      expect(edge, `seed ${seed}`).toBeDefined();
      expect(edge?.budget).toBe(ANALYSIS.rollers.edge.grade);
      // A road whose edges are all walls scores zero; one that runs out into
      // the country scores near one. Neither end is asserted exactly — the
      // stage a seed happens to build is not this test's business — but a
      // check that never leaves the floor is measuring nothing.
      expect(edge?.score, `seed ${seed}`).toBeGreaterThan(0.9);
    }
  }, 20_000);

  // R16 — and the SEAM, which is the other half of the same promise and a
  // different measurement: the edge check asks how steeply the ground falls
  // away, this one asks whether it does it in one piece. A stage may
  // legitimately do the first (a road along a hillside) and may never do the
  // second, so the assertion here is absolute where the edge's is a band.
  it("finds no step in the seam where the road hands over to the country", () => {
    for (const seed of SEEDS) {
      const r = report(seed);
      const seam = r.metrics.find((m) => m.id === "rollers")?.checks.find((c) => c.id === "seam");
      expect(seam, `seed ${seed}`).toBeDefined();
      expect(seam?.budget).toBe(ANALYSIS.rollers.seam.kink);
      // The worst kink anywhere on the stage stays well inside the budget —
      // this is a tripwire on the hand-over, and a healthy stage measures
      // millimetres. If this ever fails, something has put a face back at
      // the road's edge and every screenshot of one will show it.
      expect(seam?.value ?? 0, `seed ${seed}`).toBeLessThan(ANALYSIS.rollers.seam.kink);
      expect(seam?.score, `seed ${seed}`).toBe(1);
      expect(
        r.findings.filter((f) => f.code === "rollers.seam"),
        `seed ${seed}`,
      ).toHaveLength(0);
    }
  }, 20_000);
});

describe("the water", () => {
  it("finds no watercourse that climbs", () => {
    // The one rule of nature that is never a matter of degree. Asserted
    // through the analyzer rather than over the points directly, so a
    // change that breaks the CHECK fails here too.
    for (const seed of SEEDS) {
      const water = report(seed, { water: 0.9 }).metrics.find((m) => m.id === "water");
      expect(water?.stats.climbs, `seed ${seed}`).toBe(0);
    }
  }, 20_000);

  it("finds every crossing with water under it", () => {
    for (const seed of SEEDS) {
      const water = report(seed, { water: 0.9 }).metrics.find((m) => m.id === "water");
      expect(water?.stats.dryCrossings, `seed ${seed}`).toBe(0);
    }
  }, 20_000);
});

describe("the ground's water (R32)", () => {
  it("makes both lakes and swamps, and the swamps are the shallow ones", () => {
    for (const seed of SEEDS) {
      const ground = report(seed, { water: 0.6 }).metrics.find((m) => m.id === "ground");
      const swampShare = (ground?.stats.swampShare ?? 0) as number;
      const lakeShare = (ground?.stats.lakeShare ?? 0) as number;
      // A country with lakes and no shallow water has no reed beds in it.
      expect(swampShare, `seed ${seed}`).toBeGreaterThan(0);
      expect(lakeShare, `seed ${seed}`).toBeGreaterThan(0);
      // ...and a swamp is shallow BY DEFINITION, which is the whole basis
      // of the classification: it is the same water, sorted by depth.
      const mean = (ground?.stats.meanSwampDepth ?? 0) as number;
      expect(mean, `seed ${seed}`).toBeGreaterThan(0);
      expect(mean, `seed ${seed}`).toBeLessThan(ANALYSIS.ground.swamp.deep);
    }
  }, 20_000);

  it("does not drown the country at the top of the water dial", () => {
    // The dial has to stay a dial. A position that turns the map into a sea
    // with a causeway across it is not a wet stage, and no dial position
    // should be able to reach one.
    for (const seed of [1, 4]) {
      const ground = report(seed, { water: 1 }).metrics.find((m) => m.id === "ground");
      expect(ground?.stats.waterShare, `seed ${seed}`).toBeLessThan(ANALYSIS.ground.drowned);
    }
  }, 20_000);
});

describe("the road's surface (R33)", () => {
  it("puts bumps in the gravel here and there, and not everywhere", () => {
    // The floor of this band is the point of it. A generated road comes out
    // of the compiler as a plane unless something roughens it, and a plane
    // is the loudest tell there is — so the check that would catch that is
    // worth pinning against the road actually shipping.
    for (const seed of SEEDS) {
      const bumpy = report(seed)
        .metrics.find((m) => m.id === "rollers")
        ?.checks.find((c) => c.id === "bumpy");
      expect(bumpy?.value, `seed ${seed}`).toBeGreaterThan(ANALYSIS.rollers.bumpy.min);
      expect(bumpy?.value, `seed ${seed}`).toBeLessThan(ANALYSIS.rollers.bumpy.max);
    }
  }, 20_000);

  it("cuts the gravel narrow, wanders it, and holds the tarmac's width exactly", () => {
    // R33 — a blade cuts a dirt road as tight as its traffic can live with,
    // wider on one pass than the next, and wider again round a bend; a
    // paving machine lays one width and keeps it. So the two surfaces make
    // opposite claims and both are worth pinning.
    const track = compileStage(2, "long", { asphalt: 0.6 });
    const W = STAGE_RULES.roughness.width;
    // ...outside a junction's MOUTH, which is the one place the dirt road
    // is deliberately opened out well past its band (R17) and is a place
    // rather than a wander.
    const mouthRun = STAGE_RULES.junction.mouth.run * track.width;
    const inMouth = (s: (typeof track.samples)[number]): boolean =>
      track.junctions.some((j) => {
        const d = j.joining ? j.s - s.s : s.s - j.s;
        return d >= 0 && d <= mouthRun;
      });
    /** How far a sample is from the nearest road of the other surface, in
     * samples — the width rolls in and out over `W.runoff` at a paving
     * boundary exactly as it does at a bend, because a mat that changed
     * width in one 2 m step would be a notch cut in the side of the road. */
    const runoff = Math.ceil(W.runoff / track.step);
    const nearGravel = (i: number): boolean => {
      for (
        let k = Math.max(0, i - runoff);
        k <= Math.min(track.samples.length - 1, i + runoff);
        k++
      )
        if (track.samples[k].surface === "gravel" && track.samples[k].deck === null) return true;
      return false;
    };
    let lo = Infinity;
    let hi = 0;
    const bends: number[] = [];
    const runs: number[] = [];
    for (let i = 0; i < track.samples.length; i++) {
      const s = track.samples[i];
      if (s.deck !== null) continue;
      if (inMouth(s)) continue;
      if (s.surface === "asphalt") {
        // Laid, not bladed: exactly the nominal, to the millimetre — once
        // clear of the joint with the dirt road either side of it.
        if (!nearGravel(i)) expect(s.width).toBeCloseTo(track.width, 6);
        continue;
      }
      if (s.surface !== "gravel") continue;
      lo = Math.min(lo, s.width);
      hi = Math.max(hi, s.width);
      if (Math.abs(s.curvature) > 1 / 90) bends.push(s.width);
      else if (Math.abs(s.curvature) < 1e-6) runs.push(s.width);
    }
    // Inside the authored band: narrow, wandering either side of that, and
    // opening out at the bends.
    expect(lo).toBeGreaterThanOrEqual(track.width * (W.narrow - W.vary) - 1e-6);
    expect(hi).toBeLessThanOrEqual(track.width * (W.narrow + W.vary + W.corner.gain) + 1e-6);
    // ...and actually using it. A width that never leaves the middle of its
    // band is a constant width with extra arithmetic.
    expect(hi - lo).toBeGreaterThan(track.width * W.vary);
    // TIGHTER than the nominal for most of its length: that is the whole
    // point of `narrow`, and a road that averaged the nominal would not be
    // a dirt road however much it wandered.
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    expect(mean(runs)).toBeLessThan(track.width * (W.narrow + W.vary / 2));
    // ...and WIDER round a bend than down the straight either side of it,
    // which is the room a drift is given.
    expect(mean(bends)).toBeGreaterThan(mean(runs));
  });
});

describe("the corners' cross-fall (R19)", () => {
  it("lies the gravel corners over, and reports how far", () => {
    for (const seed of SEEDS) {
      const drive = report(seed).metrics.find((m) => m.id === "drive");
      const tilt = drive?.stats.cornerTilt ?? 0;
      // The claim R19 makes and nothing measured before: not merely that a
      // corner is banked the right WAY, but that it is banked at all. A
      // stage whose corners all sit at one percent passes `camber` with
      // full marks and reads as flat ground with a road painted on it.
      expect(tilt, `seed ${seed}`).toBeGreaterThanOrEqual(ANALYSIS.drive.tilt.min);
      expect(tilt, `seed ${seed}`).toBeLessThanOrEqual(ANALYSIS.drive.tilt.max);
    }
  });

  it("banks the gravel harder than the tarmac, because the two have different causes", () => {
    // A sealed road's cross-fall is DESIGNED and reserved for the geometry
    // that needs it; a gravel road's is WORN, by every car that has pushed
    // loose stone from the inside of the bend to the outside — which
    // happens on any corner at all. So gravel gets both the higher ceiling
    // and the longer pivot.
    expect(STAGE_RULES.bank.max.gravel).toBeGreaterThan(STAGE_RULES.bank.max.asphalt);
    expect(STAGE_RULES.bank.pivotRadius.gravel).toBeGreaterThan(
      STAGE_RULES.bank.pivotRadius.asphalt,
    );
    const track = compileStage(2, "long", { asphalt: 0.6 });
    const tilt = (surface: string): number => {
      const banks = track.samples
        .filter((s) => s.surface === surface && s.deck === null && Math.abs(s.curvature) > 1 / 120)
        .map((s) => Math.abs(s.bank))
        .sort((a, b) => a - b);
      return banks.length > 0 ? banks[Math.floor(banks.length / 2)] : 0;
    };
    expect(tilt("gravel")).toBeGreaterThan(tilt("asphalt"));
  });
});

describe("the road's own travel (R34)", () => {
  it("measures the metres of climb and descent per km, and they are not a plane", () => {
    for (const seed of SEEDS) {
      const drive = report(seed).metrics.find((m) => m.id === "drive");
      const perKm = drive?.stats.travelPerKm ?? 0;
      // The simplest honest statement of "this road is not a table", and
      // the one number that moves when the road is laid closer along the
      // country it crosses (`elevation.follow.lag`).
      expect(perKm, `seed ${seed}`).toBeGreaterThan(0);
      expect(perKm, `seed ${seed}`).toBeLessThan(ANALYSIS.drive.rolling.max);
    }
  });

  it("reads the road rather than its jumps", () => {
    // A lip is a metre of climb inside twenty, and a stage with three of
    // them would otherwise read as rolling country for having ramps on it.
    // So the measurement has to be blind to them, and the way to prove that
    // is a stage that HAS them: the travel it reports stays inside the band
    // a jumpless one does.
    const seed = SEEDS.find((s) => {
      const jumps = report(s).metrics.find((m) => m.id === "jumps");
      return ((jumps?.stats.jumps as number | undefined) ?? 0) > 0;
    });
    expect(seed, "no seed in the set has a jump on it").toBeDefined();
    const drive = report(seed as number).metrics.find((m) => m.id === "drive");
    expect(drive?.stats.travelPerKm).toBeLessThan(ANALYSIS.drive.rolling.max);
  });
});

describe("what an apex cut costs (R26)", () => {
  it("drives the reference car over a row of blocks and prices the cut", () => {
    for (const seed of SEEDS) {
      const drive = report(seed).metrics.find((m) => m.id === "drive");
      const tariff = drive?.stats.apexTariff ?? 0;
      // A band, and both ends are defects. A block that costs nothing is no
      // deterrent and the corner can be straightened for free; a block that
      // costs everything is a wall somebody left in the road, which is what
      // an apex lined with them used to be — the car came out of the row at
      // a fifteenth of the speed it went in at.
      expect(tariff, `seed ${seed}`).toBeGreaterThanOrEqual(ANALYSIS.drive.kerb.min);
      expect(tariff, `seed ${seed}`).toBeLessThanOrEqual(ANALYSIS.drive.kerb.max);
    }
  });
});

describe("the borrowed road's corners (R20)", () => {
  it("puts no hairpin on the tarmac, away from the crossings", () => {
    for (const seed of SEEDS) {
      const sweeps = report(seed)
        .metrics.find((m) => m.id === "roads")
        ?.checks.find((c) => c.id === "sweeps");
      expect(sweeps?.value, `seed ${seed}`).toBeLessThanOrEqual(ANALYSIS.roads.sweeps);
    }
  });

  it("states the ceiling as R3's own bucket boundary", () => {
    // The vocabulary already divides corners into the ones a public road
    // has and the ones it does not: R3's `hard` bucket IS the drift
    // moments. Stating the rule as that boundary rather than as a number of
    // its own is what keeps the two from drifting apart.
    expect(STAGE_RULES.paving.minRadius).toBe(STAGE_RULES.turn.medium.radius.min);
    expect(STAGE_RULES.turn.hard.radius.max).toBeLessThan(STAGE_RULES.paving.minRadius);
  });
});

describe("the other roads", () => {
  it("rolls every branch, drive and car park lane, and finds them rideable", () => {
    for (const seed of SEEDS) {
      const lanes = report(seed).metrics.find((m) => m.id === "lanes");
      expect(lanes, `seed ${seed}`).toBeDefined();
      expect(lanes?.checks.map((c) => c.id)).toEqual(["step", "bump", "grade", "crest", "agree"]);
      if ((lanes?.stats.lanes ?? 0) === 0) continue;
      expect(lanes?.stats.strides, `seed ${seed}`).toBeGreaterThan(0);
      // The staircase this metric was written for read as a 0.3 m tread
      // every four metres under every branch; nothing a car can be asked
      // to drive steps that hard, and the ground under a road is the road.
      expect(lanes?.stats.worstStep, `seed ${seed}`).toBeLessThan(ANALYSIS.lanes.step.fail);
      expect(lanes?.stats.worstOff, `seed ${seed}`).toBeLessThan(ANALYSIS.lanes.agree.fail);
    }
  }, 20_000);
});

describe("the jumps", () => {
  it("measures every lip's flight, and lands them all on the road", () => {
    for (const seed of SEEDS) {
      const jumps = report(seed).metrics.find((m) => m.id === "jumps");
      expect(jumps?.stats.landedOff, `seed ${seed}`).toBe(0);
      if ((jumps?.stats.jumps ?? 0) === 0) continue;
      // A measured jump has a length and some air under it — a flight of
      // zero is the ballistics failing to run, not a flat lip.
      expect(jumps?.stats.maxLength, `seed ${seed}`).toBeGreaterThan(0);
      expect(jumps?.stats.maxHeight, `seed ${seed}`).toBeGreaterThan(0);
    }
  }, 20_000);
});

describe("the country is curves (R32)", () => {
  it("folds the country like a curve and stands no wall, at the default dials", () => {
    // Every fold on the drawn lattice past the road's bench, on ground no
    // road shaped and no rule made sharp, inside the tolerated share — and
    // not one triangle standing steeper than rock is ever held at. The
    // second is the one that catches a cone stopping at its query range.
    for (const seed of SEEDS) {
      const ground = report(seed).metrics.find((m) => m.id === "ground");
      const share = (ground?.stats.creasedShare ?? 1) as number;
      expect(share, `seed ${seed}`).toBeLessThanOrEqual(ANALYSIS.ground.crease.share.tolerated);
      expect(ground?.stats.walls, `seed ${seed}`).toBe(0);
    }
  }, 30_000);

  it("opens a sharp edge only past the steepness dial's midpoint", () => {
    // The rock's own word on where it is deliberately sharp, sampled over
    // the map on ground well above the water table — a kettle hole's bank
    // is sharp at any dial, and only forms within a few metres of it.
    const sharpest = (seed: number, steepness: number): number => {
      const track = compileStage(seed, "medium", { steepness });
      const terrain = createTerrain(track);
      terrain.sync(0);
      const b = track.bounds;
      let worst = 0;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = b.minX + ((i + 0.5) / 40) * (b.maxX - b.minX);
          const z = b.minZ + ((j + 0.5) / 40) * (b.maxZ - b.minZ);
          if (terrain.geology.surfaceAt(x, z) < LAKE_Y + 20) continue;
          worst = Math.max(worst, terrain.geology.sharpAt(x, z));
        }
      }
      return worst;
    };
    let opened = 0;
    for (const seed of [1, 2, 3, 4]) {
      expect(sharpest(seed, 0), `seed ${seed} at the worn end`).toBeLessThan(
        ANALYSIS.ground.crease.explicit,
      );
      if (sharpest(seed, 1) >= ANALYSIS.ground.crease.explicit) opened++;
    }
    expect(opened, "no seed grew a crest or a cliff at the top of the dial").toBeGreaterThan(0);
  }, 40_000);
});
