// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GENERATOR'S VERSIONS, and the two things about them that are only
// true because something refuses to let them stop being true.
//
// The scheme (engine/mapgen/versions.ts): a campaign level names the
// version of the generator its road was curated under, that version keeps
// building it, and everything else in the game takes the current rules. Two
// halves of it fail SILENTLY without a case here:
//
//   * A LEVEL POINTING AT NOTHING. A version pruned while a level still
//     named it does not throw — `resolveKnobs` falls back to the current
//     rules — so the level quietly becomes a different road, which is the
//     exact failure the whole scheme exists to prevent.
//   * A MUSEUM. A legacy version nobody names any more costs nothing to
//     leave in, so it gets left in, and the branch it keeps alive is read
//     and worked around by every session after this one. Backward
//     compatibility is owed to the committed roads and to nothing else.

import { describe, expect, it } from "vitest";

import {
  CURRENT_GENERATOR_VERSION,
  DEFAULT_KNOBS,
  GENERATOR_VERSIONS,
  GENERATOR_VERSION_IDS,
  NUMERIC_KNOBS,
  generatorTraits,
  isGeneratorVersion,
  resolveKnobs,
} from "@engine";

import { LOCATIONS, campaignKnobs } from "../pwa/src/game/campaign.ts";

const LEVELS = LOCATIONS.flatMap((location) => location.levels);

/** Every version the committed campaign actually stands on. */
const pinned = new Set(LEVELS.map((level) => level.version));

describe("the generator's version registry", () => {
  it("counts up, with no version stated twice", () => {
    expect(GENERATOR_VERSION_IDS.length).toBeGreaterThan(0);
    expect(new Set(GENERATOR_VERSION_IDS).size).toBe(GENERATOR_VERSION_IDS.length);
    for (const row of GENERATOR_VERSIONS) {
      expect(Number.isInteger(row.version), `v${row.version} is not a whole number`).toBe(true);
      expect(row.note.length, `v${row.version} has no note saying what it is`).toBeGreaterThan(0);
    }
    const sorted = [...GENERATOR_VERSION_IDS].sort((a, b) => a - b);
    expect(GENERATOR_VERSION_IDS, "the rows are not oldest-first").toEqual(sorted);
  });

  it("names the LAST row as the current one", () => {
    // Everything that is not a campaign level builds here, so the newest
    // rules have to be what the newest row describes.
    expect(CURRENT_GENERATOR_VERSION).toBe(GENERATOR_VERSION_IDS[GENERATOR_VERSION_IDS.length - 1]);
    expect(Math.max(...GENERATOR_VERSION_IDS)).toBe(CURRENT_GENERATOR_VERSION);
  });

  it("hands an unknown version the current rules rather than throwing", () => {
    expect(isGeneratorVersion(CURRENT_GENERATOR_VERSION)).toBe(true);
    for (const bogus of [0, -1, 1_000_000, 1.5, "1", null, undefined]) {
      expect(isGeneratorVersion(bogus), String(bogus)).toBe(false);
    }
    expect(generatorTraits(1_000_000).version).toBe(CURRENT_GENERATOR_VERSION);
  });
});

describe("what the campaign pins", () => {
  it("gives every level a version this build can still build", () => {
    for (const level of LEVELS) {
      expect(
        isGeneratorVersion(level.version),
        `${level.id} names generator v${level.version}, which this build no longer carries — ` +
          "either restore the row in engine/mapgen/versions.ts or move the level onto a " +
          "version that exists (a curation: re-rate, re-time, re-preview, re-blurb)",
      ).toBe(true);
    }
  });

  it("keeps no legacy version the campaign has stopped naming", () => {
    // THE PRUNING RULE, and the reason it is a test rather than a sentence
    // in a skill. A stale row is free to leave in and expensive to live
    // with: every trait branch it keeps alive is a second way the generator
    // can behave, forever, for a road nobody drives.
    const stale = GENERATOR_VERSION_IDS.filter(
      (version) => version !== CURRENT_GENERATOR_VERSION && !pinned.has(version),
    );
    expect(
      stale,
      `no campaign level names generator v${stale.join(", v")} any more — delete the row from ` +
        "engine/mapgen/versions.ts and every trait branch that only existed for it",
    ).toEqual([]);
  });

  it("builds each level on the version it names", () => {
    for (const level of LEVELS) {
      expect(campaignKnobs(level).version, level.id).toBe(level.version);
    }
  });
});

describe("the version rides with the dials", () => {
  it("is not one of them", () => {
    // It is on `StageKnobs` because that is the one object every module in
    // `mapgen/` is handed — not because a player turns it. Anything that
    // walks the dials (the menus, the URL, the repro line, the land field's
    // memo key) must not find it there and read it as a band position.
    expect(NUMERIC_KNOBS).not.toContain("version");
  });

  it("defaults to the current rules", () => {
    expect(DEFAULT_KNOBS.version).toBe(CURRENT_GENERATOR_VERSION);
    expect(resolveKnobs().version).toBe(CURRENT_GENERATOR_VERSION);
    expect(resolveKnobs({ elevation: 0.2 }).version).toBe(CURRENT_GENERATOR_VERSION);
  });

  it("survives a round trip, and clamps what it cannot build", () => {
    for (const version of GENERATOR_VERSION_IDS) {
      expect(resolveKnobs({ version }).version).toBe(version);
    }
    expect(resolveKnobs({ version: 1_000_000 }).version).toBe(CURRENT_GENERATOR_VERSION);
    expect(resolveKnobs({ version: Number.NaN }).version).toBe(CURRENT_GENERATOR_VERSION);
  });
});
