// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's merge (`pwa/src/game/cloud-save.ts`): two devices that both
// drove while offline, reconciled without a judgement call.
//
// Every rule here is mechanical on purpose — a better time, a further rung, a
// longer odometer — so the cases are as much about ORDER NOT MATTERING and
// running twice changing nothing as they are about picking the right row.
import { describe, expect, it } from "vitest";

import {
  mergeBoard,
  mergeCampaign,
  mergeOdometers,
  mergeSplits,
  parseSave,
} from "../pwa/src/game/cloud-save.ts";
import type { ScoreEntry } from "../pwa/src/game/scores.ts";
import type { CampaignProgress } from "../pwa/src/game/campaign.ts";

const row = (who: string, time: number, at = 1): ScoreEntry => ({
  who,
  time,
  carId: "nord",
  gearbox: "manual",
  difficulty: "medium",
  at,
});

describe("a board from two devices", () => {
  it("keeps the fastest rows across both, in the board's own order", () => {
    const merged = mergeBoard([row("ABC", 62)], [row("XYZ", 58), row("QQQ", 71)]);
    expect(merged.map((r) => r.who)).toEqual(["XYZ", "ABC", "QQQ"]);
  });

  it("breaks a tie in favour of the run that got there first", () => {
    const merged = mergeBoard([row("ABC", 60, 500)], [row("XYZ", 60, 100)]);
    expect(merged.map((r) => r.who)).toEqual(["XYZ", "ABC"]);
  });

  it("does not duplicate a row both devices already had", () => {
    const shared = row("ABC", 62, 900);
    expect(mergeBoard([shared], [{ ...shared }])).toHaveLength(1);
  });

  it("cuts to the board's own length", () => {
    const many = Array.from({ length: 14 }, (_, i) => row("AAA", 50 + i, i));
    expect(mergeBoard(many, many)).toHaveLength(10);
  });

  it("does not care which device is which, or how often it runs", () => {
    const mine = [row("ABC", 62), row("DEF", 70)];
    const theirs = [row("XYZ", 58)];
    const once = mergeBoard(mine, theirs);
    expect(mergeBoard(theirs, mine)).toEqual(once);
    expect(mergeBoard(once, theirs)).toEqual(once);
  });
});

describe("splits", () => {
  it("takes the faster sector from each device", () => {
    expect(mergeSplits([12.5, 30.1], [13.0, 29.4])).toEqual([12.5, 29.4]);
  });

  it("keeps a sector only one device ever reached", () => {
    expect(mergeSplits([12.5, null], [null, 29.4])).toEqual([12.5, 29.4]);
    expect(mergeSplits([12.5], [12.9, 31.0])).toEqual([12.5, 31.0]);
  });
});

describe("furthest progress", () => {
  const progress = (over: Partial<CampaignProgress>): CampaignProgress => ({
    finished: [],
    points: {},
    best: {},
    places: {},
    ...over,
  });

  it("unions the stages either device finished", () => {
    const merged = mergeCampaign(
      progress({ finished: ["taiga-1"] }),
      progress({ finished: ["taiga-2"] }),
    );
    expect(merged.finished.sort()).toEqual(["taiga-1", "taiga-2"]);
  });

  it("keeps the better stage time", () => {
    const merged = mergeCampaign(
      progress({ best: { "taiga-1": 95 } }),
      progress({ best: { "taiga-1": 91.5 } }),
    );
    expect(merged.best["taiga-1"]).toBe(91.5);
  });

  it("keeps the better place PER DIFFICULTY, not across them", () => {
    // Third on easy is not third on hard. A merge that flattened these would
    // hand the driver a result against a field that never raced them.
    const merged = mergeCampaign(
      progress({ places: { "taiga-1": { easy: 3, hard: 8 } } }),
      progress({ places: { "taiga-1": { hard: 4 } } }),
    );
    expect(merged.places["taiga-1"]).toEqual({ easy: 3, hard: 4 });
  });

  it("takes the points table from whichever run paid the driver more", () => {
    const merged = mergeCampaign(
      progress({ points: { "taiga-1": { you: 6, r1: 15 } } }),
      progress({ points: { "taiga-1": { you: 15, r1: 6 } } }),
    );
    // Whole table or nothing: blending two would be a season no afternoon
    // produced.
    expect(merged.points["taiga-1"]).toEqual({ you: 15, r1: 6 });
  });

  it("does not care which device is which", () => {
    const mine = progress({ finished: ["a"], best: { a: 90 }, places: { a: { easy: 2 } } });
    const theirs = progress({ finished: ["b"], best: { a: 88 }, places: { a: { hard: 5 } } });
    expect(mergeCampaign(mine, theirs)).toEqual(mergeCampaign(theirs, mine));
  });
});

describe("odometers", () => {
  it("keeps the larger figure per car — distance never comes back down", () => {
    expect(mergeOdometers({ nord: 41000 }, { nord: 12000, kite: 800 })).toEqual({
      nord: 41000,
      kite: 800,
    });
  });

  it("ignores a figure that is not a distance", () => {
    expect(mergeOdometers({ nord: 41000 }, { nord: -5 })).toEqual({ nord: 41000 });
  });
});

describe("what comes off the wire", () => {
  it("reads nothing out of nothing rather than throwing", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave("{oh no")).toBeNull();
  });

  it("drops a split that is not a time", () => {
    const save = parseSave(JSON.stringify({ splits: { "stage-1": [12.5, 0, -3, "x"] } }));
    expect(save?.splits["stage-1"]).toEqual([12.5, null, null, null]);
  });
});
