// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — where the red and white goes. The rule exists to stop a stage being
// edged in stripes from end to end, so the assertions that matter are as
// much about where kerbing is ABSENT as about where it is: that a sweeper
// gets nothing, that an apex is marked on the inside and an exit on the
// outside, and that most of a stage's road carries no marking at all.
import { describe, expect, it } from "vitest";

import { STAGE_RULES as R, buildKerbs, compileStage, type KerbZone } from "@engine";

const SEEDS = [1, 7, 19, 38, 91, 4711];

function zonesFor(seed: number): { zones: KerbZone[]; track: ReturnType<typeof compileStage> } {
  const track = compileStage(seed, "medium");
  return { zones: buildKerbs(track), track };
}

describe("R26 — kerb placement", () => {
  it("marks the corners that earn it and leaves the sweepers bare", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const marked = new Set(zones.filter((z) => z.role === "apex").map((z) => z.side));
      expect(marked.size).toBeGreaterThan(0);
      // Every apex zone belongs to a note over the threshold, and every
      // note over it has one — the rule is a rule, not a tendency.
      const worthy = track.pacenotes.filter((n) => n.angle >= R.kerb.minAngle);
      const apexes = zones.filter((z) => z.role === "apex");
      expect(apexes).toHaveLength(worthy.length);
      // ...and the soft ones are left alone.
      const soft = track.pacenotes.filter((n) => n.angle < R.kerb.minAngle);
      expect(soft.length).toBeGreaterThan(0);
      for (const note of soft) {
        const mid = (note.s + note.endS) / 2;
        const covering = apexes.filter((z) => z.fromS <= mid && z.toS >= mid);
        expect(covering).toHaveLength(0);
      }
    }
  });

  it("puts the apex INSIDE the bend and the exit OUTSIDE it", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      for (const note of track.pacenotes) {
        if (note.angle < R.kerb.minAngle) continue;
        const mid = (note.s + note.endS) / 2;
        const apex = zones.find((z) => z.role === "apex" && z.fromS <= mid && z.toS >= mid);
        expect(apex?.side).toBe(note.dir);
        // The exit starts where the corner stops bending, on the far side.
        const exit = zones.find(
          (z) => z.role === "exit" && Math.abs(z.fromS - note.endS) < 1e-6 && z.side === -note.dir,
        );
        expect(exit).toBeDefined();
      }
    }
  });

  it("only puts a braking marker in front of a corner that needs braking", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const entries = zones.filter((z) => z.role === "entry");
      const hard = track.pacenotes.filter((n) => n.angle >= R.kerb.entryAngle);
      expect(entries).toHaveLength(hard.length);
      for (const entry of entries) {
        // It sits BEFORE the corner, which is the whole point of a marker.
        const note = hard.find((n) => Math.abs(n.s - R.kerb.entryLead - entry.fromS) < 1e-6);
        expect(note).toBeDefined();
        expect(entry.toS).toBeLessThan((note as (typeof hard)[number]).s);
      }
    }
  });

  it("leaves most of the stage unmarked", () => {
    // The number this rule exists for. Before it, every meter of gravel on
    // every stage wore a red-and-white band down both edges.
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      for (const side of [-1, 1] as const) {
        const covered = zones
          .filter((z) => z.side === side)
          .reduce((sum, z) => sum + (z.toS - z.fromS), 0);
        expect(covered / track.length).toBeLessThan(0.5);
      }
    }
  });

  it("wraps a hazard on both sides, and only a real one", () => {
    for (const seed of SEEDS) {
      const { zones, track } = zonesFor(seed);
      const hazards = zones.filter((z) => z.role === "hazard");
      // Hazards come in pairs — a hazard is marked all the way round.
      expect(hazards.filter((z) => z.side === -1)).toHaveLength(
        hazards.filter((z) => z.side === 1).length,
      );
      for (const zone of hazards) {
        const inside = track.samples.filter((s) => s.s >= zone.fromS && s.s <= zone.toS);
        expect(inside.some((s) => s.jump || s.deck != null)).toBe(true);
      }
    }
  });

  it("answers a span with the zones that reach into it", () => {
    // The renderer builds one chunk at a time, so a zone straddling a chunk
    // boundary has to come back from both — otherwise a corner's kerbing
    // stops dead at an invisible seam.
    const track = compileStage(19, "medium");
    const whole = buildKerbs(track);
    const mid = track.length / 2;
    const near = buildKerbs(track, mid - 200, mid + 200);
    for (const zone of whole) {
      if (zone.toS < mid - 100 || zone.fromS > mid + 100) continue;
      expect(
        near.some(
          (z) => z.role === zone.role && z.side === zone.side && Math.abs(z.fromS - zone.fromS) < 1,
        ),
      ).toBe(true);
    }
  });
});
