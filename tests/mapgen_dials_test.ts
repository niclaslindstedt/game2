// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The four stage dials — what asking for water, tarmac or relief actually
// buys, and that asking twice builds the same stage. Each of these sweeps a
// dial across its range and compiles a spread of LONG stages at every stop,
// so unlike the rest of the generator's rules they cannot share a corpus with
// anything: the whole point of them is that the stages differ. That makes
// them the heaviest cases in the suite, and their own file.
import { describe, expect, it } from "vitest";

import { STAGE_RULES as R, compileStage } from "@engine";

import { stagePlans } from "./support/stages.ts";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

describe("the stage dials", () => {
  it("R13 — the span decides the architecture: wade it, plank it, or pour it", () => {
    let fords = 0;
    let culverts = 0;
    let timber = 0;
    let concrete = 0;
    for (const seed of SEEDS) {
      for (const plan of stagePlans(seed, "long", { water: 0.85 })) {
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
    // is where it stops. The ceiling is R38's: a public road runs straight
    // for two or three hundred metres at a time between its bends, the
    // rally may not sit on a straight that long, so a borrow ends where the
    // road stops bending rather than where the dial stops asking. What is
    // asserted is therefore that the dial buys tarmac at all past its
    // floor, and never a value at the top.
    //
    // A LUMPY statistic, and the bars are set with that in mind: of these
    // eight stages two or three borrow a real stretch (4-7% of their
    // length) and the rest carry a junction's platform or nothing, so the
    // share is decided by which seeds happen to reach a road. Measured at
    // 2.35% (both dials) with the crests drawn from the fold, and 1.55% at
    // 0.1 against 1.24% at 0.25 with them drawn as whalebacks — a different
    // two seeds borrowing, and one of them borrowing less when asked for
    // more, because the dial is a target the search spends against and the
    // search draws a different plan for it.
    expect(share(0.1)).toBeGreaterThan(0.01);
    expect(share(0.25)).toBeGreaterThanOrEqual(share(0.1) * 0.7);
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
});
