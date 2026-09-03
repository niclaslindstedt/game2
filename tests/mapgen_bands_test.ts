// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How big a stage is, and what it is allowed to reach: the world bounds each
// length band is drawn inside (R9), the band its raced distance has to land
// in (R11), and the start zone nothing may come back into (R24). These are
// the three rules that are asserted across ALL FOUR length bands rather than
// on the default medium one, which is what makes them the dearest rules in
// the generator to check — thirty-two stages compiled between them, eight of
// them on the longest band. They share one corpus (`support/stages.ts`) and
// they are their own file so that corpus is the only thing a runner building
// it is waiting on.
import { describe, expect, it } from "vitest";

import { STAGE_RULES as R, roadClearance, type FiniteStageLength } from "@engine";

import { stageTrack } from "./support/stages.ts";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

describe("the world a stage is drawn in", () => {
  it("R9 — the centerline stays inside each length's world bounds", () => {
    for (const length of ["short", "medium", "long"] as FiniteStageLength[]) {
      const bound = R.stageLengths[length].worldBound;
      for (const seed of SEEDS.slice(0, 6)) {
        const track = stageTrack(seed, length);
        expect(track.bounds.minX).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxX).toBeLessThanOrEqual(bound);
        expect(track.bounds.minZ).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxZ).toBeLessThanOrEqual(bound);
      }
    }
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
        const track = stageTrack(seed, length);
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
        const track = stageTrack(seed, length);
        // R11 measures the RACED stage: the road up to the finish gate.
        // R22's run-out past it is not part of the band.
        const raced = track.finishS ?? track.length;
        expect(raced).toBeGreaterThanOrEqual(band.min - R.closingStraight);
        expect(raced).toBeLessThanOrEqual(band.max + R.closingStraight);
        expect(track.length).toBeCloseTo(raced + R.runOut, 3);
      }
    }
  }, 60000);
});
