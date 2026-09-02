// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHANGELOG FRAGMENTS — every one of them has to be readable by the
// release, and this is the only thing that reads them before release day.
//
// A fragment is hand-written prose with three lines of front-matter on top,
// dropped by whoever opened the PR, and nothing about writing one is checked
// by a compiler. The PR gate asks whether a fragment EXISTS; the release is
// what actually PARSES one, months of fragments later, on the one day it must
// not fail. Three landed carrying a type outside the vocabulary — `fix`,
// `patch`, `changed`, against a case-sensitive Added/Changed/Fixed/Removed/
// Security/Deprecated — and every one of them was green until the release
// script exited 1 on the whole directory.
//
// So the vocabulary is asserted here, where `make test` is the gate, rather
// than only in CI: the failure names the file and the bad word, and it names
// them before the branch is pushed.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The release's own vocabulary (`scripts/release/fragments.mjs`), restated
 * here rather than imported: that module `process.exit`s on a bad fragment,
 * which inside a test runner takes the whole run down with it and reports
 * nothing about which file was wrong. */
const TYPES = ["Added", "Changed", "Fixed", "Removed", "Security", "Deprecated"];

const DIR = ".changes/unreleased";
const FRONT = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

function fragments(): { name: string; text: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));
}

describe("the changelog fragments", () => {
  it("has some to check", () => {
    // A directory the release collates from and a glob that quietly matches
    // nothing are the same green tick, which is the one way this file could
    // pass while saying nothing at all.
    expect(fragments().length).toBeGreaterThan(0);
  });

  it("gives every fragment front-matter, a known type and a body", () => {
    for (const { name, text } of fragments()) {
      const m = FRONT.exec(text);
      expect(m, `${name} has no --- front-matter block`).not.toBeNull();
      if (!m) continue;
      const front: Record<string, string> = {};
      for (const line of m[1].split("\n")) {
        if (line.trim() === "") continue;
        const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
        expect(kv, `${name} has a malformed front-matter line "${line}"`).not.toBeNull();
        if (kv) front[kv[1].trim()] = kv[2].trim();
      }
      expect(TYPES, `${name} has type "${front.type}"`).toContain(front.type);
      expect(m[2].trim().length, `${name} has an empty body`).toBeGreaterThan(0);
    }
  });

  it("names every fragment <unix-ts>-<slug>.md", () => {
    // The timestamp is what orders the release notes — the collator sorts the
    // filenames lexically and nothing else says which change came first.
    for (const { name } of fragments()) {
      expect(name, `${name} is not <unix-ts>-<slug>.md`).toMatch(/^\d{10}-[a-z0-9-]+\.md$/);
    }
  });
});
