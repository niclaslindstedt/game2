// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FEATURE FLAGS, HELD TO WHAT THEY PROMISE.
//
// A flag is the one kind of app-side rule whose failure is invisible in the
// place it is written: a rule that is wrong ships a mode to a storefront, or
// hides one from the desktop app, and looks perfectly correct in the source
// either way. Nothing else in the tree reads the rules, and no build this
// suite runs in is any of the six places they are about — so the table below
// is the only thing that can say a rule changed.
//
// `featureOn` is the pure half of features.ts, which is why it is separate
// from `here()`: this file asks every feature about every place, and no
// browser, no shell and no deploy slot is involved.

import { describe, expect, it } from "vitest";

import { featureOn, type Feature, type FeatureHost, type Where } from "../pwa/src/features.ts";

const HOSTS: FeatureHost[] = ["web", "tauri", "native"];

const at = (host: FeatureHost, preview: boolean): Where => ({ host, preview });

/** Every place a build can be, and what each feature is there. The columns
 * are the flags; the rows are the six places. Written out rather than
 * derived, because a table derived from the rules it is testing tests
 * nothing. */
const TABLE: { where: Where; on: Feature[] }[] = [
  { where: at("web", true), on: ["music", "training", "roam"] },
  { where: at("web", false), on: [] },
  { where: at("tauri", true), on: ["music", "training", "roam"] },
  { where: at("tauri", false), on: ["roam"] },
  { where: at("native", true), on: ["music", "training"] },
  { where: at("native", false), on: [] },
];

const FEATURES: Feature[] = ["music", "training", "roam"];

describe("feature flags", () => {
  for (const row of TABLE) {
    const place = `${row.where.host}${row.where.preview ? " preview" : " release"}`;
    it(`ships exactly ${row.on.join(", ") || "nothing"} on ${place}`, () => {
      const on = FEATURES.filter((name) => featureOn(name, row.where));
      expect(on).toEqual(FEATURES.filter((name) => row.on.includes(name)));
    });
  }

  // The promise the request was made as, stated as its own case: whatever
  // else moves, a RELEASED WEB BUILD — the site at `/`, which is the game as
  // a player finds it — offers none of the three.
  it("offers no flagged feature on the released site", () => {
    for (const name of FEATURES) expect(featureOn(name, at("web", false))).toBe(false);
  });

  // ...and the two halves of Roam's own rule, which is the only one that is
  // not simply "preview": the desktop app has it whether or not the build is
  // a preview, and the store app never does.
  it("gives Roam to the desktop app in every build", () => {
    expect(featureOn("roam", at("tauri", false))).toBe(true);
    expect(featureOn("roam", at("tauri", true))).toBe(true);
  });

  it("never gives Roam to the store app", () => {
    for (const preview of [true, false]) {
      expect(featureOn("roam", at("native", preview))).toBe(false);
    }
  });

  // The scores are the one flagged feature with a real download behind them,
  // so the rule that keeps them out is the one worth stating twice: nothing
  // but a preview may play music.
  it("plays music only in a preview build", () => {
    for (const host of HOSTS) {
      expect(featureOn("music", at(host, true))).toBe(true);
      expect(featureOn("music", at(host, false))).toBe(false);
    }
  });
});
