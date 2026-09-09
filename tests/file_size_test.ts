// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// OSS_GAME_SPEC §20.5 — no non-test source file may exceed 1000 physical
// lines. The rule is a SIZE SMELL rather than a complexity metric: physical
// lines are trivial to measure, predictable for a contributor, and immune to
// how a language writes its comments. A file past the cap is nearly always
// doing more than one thing, and the cap is what makes somebody split it
// before the second thing calcifies into the first.
//
// The cap survives on nothing but this test: `make lint` does not measure
// files, and a rule that is only written down in AGENTS.md is a rule that
// comes back the first time a feature is in a hurry.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** §20.5 — the cap, in physical (newline-delimited) lines. */
const LIMIT = 1000;

/** The languages the repo writes source in. Everything else a checkout
 * carries — Markdown, JSON, SVG, the lockfile — is content or data, and a
 * long one of those is not the smell this rule is about. */
const SOURCE = /\.(ts|tsx|mjs|js|rs)$/;

/** §20.2 — a test file's stem. Test files are exempt: how big one is, is
 * whatever the subject it covers requires. */
const TEST_STEM = /_?[Tt]ests?$/;

/** §20.5.1 — a file may declare itself exempt with a marker in a comment
 * inside its first 20 lines, and the reason must be non-empty. The reason is
 * what a reviewer reads: "generated", "a lookup table that only grows with
 * real-world coverage", "a state machine whose arms cannot be split without
 * obscuring the design". A marker with nothing after it exempts nothing. */
const MARKER = /game-spec:allow-large-file:[ \t]*(\S.*)?$/;

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((path) => SOURCE.test(path))
    .filter(
      (path) =>
        !TEST_STEM.test(
          path
            .replace(/\.[^./]+$/, "")
            .split("/")
            .pop() ?? "",
        ),
    );
}

function exemptReason(text: string): string | null {
  for (const line of text.split("\n", 20)) {
    const found = MARKER.exec(line);
    if (found) return found[1]?.trim() ?? "";
  }
  return null;
}

describe("§20.5 source file size", () => {
  it("keeps every non-test source file under the cap", () => {
    const files = tracked();
    // A walk that finds nothing passes for the wrong reason.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((path) => path.endsWith("_test.ts"))).toBe(false);
    expect(files).toContain("engine/game/car.ts");
    const over: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      if (lines <= LIMIT) continue;
      const reason = exemptReason(text);
      if (reason) continue;
      over.push(`${path} — ${lines} lines`);
    }
    expect(over, `split these by concern, or declare the marker §20.5.1 provides`).toEqual([]);
  });

  it("refuses an allow-large-file marker with no reason", () => {
    expect(exemptReason("// game-spec:allow-large-file: generated")).toBe("generated");
    expect(exemptReason("// game-spec:allow-large-file:   ")).toBe("");
    expect(exemptReason("// nothing to declare")).toBe(null);
    // Past the twentieth line the marker is not read: it is a declaration a
    // reviewer meets at the top of the file, not a note buried in it.
    expect(exemptReason(`${"//\n".repeat(25)}// game-spec:allow-large-file: late`)).toBe(null);
  });
});
