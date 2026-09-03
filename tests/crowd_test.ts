// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R27 — THE CROWD: where a rally's spectators stand, and how many of them
// there are.
//
// Two rules with a safety brief behind them, and one with a car park behind
// it. They stand IN the corners, because a corner is what is worth walking
// in to watch; they stand on the INSIDE of them, because a car that lets go
// leaves at a tangent and finishes on the outside, which is the side a
// marshal tapes off; and the number of them is the ENGINE's, because R42
// sizes the field of cars behind the corner from it.

import { describe, expect, it } from "vitest";
import { STAGE_RULES as R, compileStage, createTerrain, standHeads } from "@engine";

const SEEDS = Array.from({ length: 10 }, (_, i) => i * 13 + 1);

const stages = SEEDS.map((seed) => {
  const track = compileStage(seed, "medium");
  const terrain = createTerrain(track);
  terrain.sync(0);
  return { seed, track, terrain };
});

/** The corner call a stand was planted at, if it was planted at one. */
function noteAt(track: (typeof stages)[number]["track"], s: number) {
  return track.pacenotes.find((note) => note.s <= s && s <= note.endS) ?? null;
}

describe("the crowd (R27)", () => {
  it("stands on the INSIDE of every bend it watches", () => {
    let checked = 0;
    for (const { track, terrain } of stages) {
      for (const stand of terrain.stands) {
        if (stand.finish) continue;
        const note = noteAt(track, stand.s);
        if (!note) continue;
        // The stand's facing looks across the road from the side it is on,
        // so the side is the facing turned back a quarter turn against the
        // road's own heading. `note.dir` is the inside of the bend.
        const sample = track.samples[Math.round(stand.s / track.step)];
        const rx = Math.cos(sample.heading);
        const rz = -Math.sin(sample.heading);
        const side = Math.sign((stand.x - sample.x) * rx + (stand.z - sample.z) * rz);
        expect(side).toBe(note.dir);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("stands only at corners worth the walk, and never two in one crowd's spacing", () => {
    for (const { track, terrain } of stages) {
      const corners = terrain.stands.filter((s) => !s.finish);
      for (const stand of corners) {
        const note = noteAt(track, stand.s);
        expect(note).not.toBeNull();
        expect(note?.angle ?? 0).toBeGreaterThanOrEqual(R.crowd.minAngle);
      }
      for (let i = 1; i < corners.length; i++) {
        expect(corners[i].s - corners[i - 1].s).toBeGreaterThanOrEqual(R.crowd.spacing);
      }
    }
  });

  it("counts its own heads, and the number is a crowd rather than a queue", () => {
    for (const { terrain } of stages) {
      for (const stand of terrain.stands) {
        const heads = standHeads(stand);
        expect(heads).toBe(Math.max(2, Math.round(stand.width * R.crowd.density)) * stand.rows);
        expect(heads).toBeGreaterThanOrEqual(2 * R.crowd.rows.min);
      }
    }
  });
});
