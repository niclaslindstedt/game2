// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEPENDENCY DIRECTION, walked — enforced by a test rather than by
// discipline, because discipline is what degrades under a deadline. The
// arrows AGENTS.md states are read off the REAL import graph here: every
// `import`/`export … from` in engine/, pwa/src/, scripts/ and tests/,
// resolved to the role it lands in, and held to the four rules:
//
//   1. the core (engine/) imports nothing from any shell or any tool — and
//      from packages ONLY the shared framework's engine-safe subpaths
//      (`@niclaslindstedt/oss-game-framework/core/*` and `/racing/*`, see
//      ENGINE_PACKAGES): it is framework-free, so a `three` or a `preact` or
//      a `node:` under it — or the framework's own audio, shots or DOM
//      plumbing — is the browser bundle or the headless sim losing a host;
//   2. a shell (pwa/) imports the core through its ONE entry surface,
//      `@engine`, never a deep path, and never another shell or a tool;
//   3. tooling (scripts/) may import anything; nothing in the game imports
//      it, and the suite holds only the two import-free modules in
//      TOOL_SEAM below;
//   4. the suite reaches the engine the way a host does — `@engine` — so a
//      test cannot pin an internal a host could never see.
//
// Beside the graph, the hygiene the same walk can check for free: no wall
// clock, no global random source and no console in the engine's code. The
// clock seam and the output module are the framework's now
// (`core/clock`, `core/output` — held to the same rules in that repository),
// so NO file under engine/ may read a clock or print: a clock is handed in
// as a `Clock`, and a line goes out through `core/output`. `tests/determinism_test.ts` proves a run replays; this
// file is why it keeps doing so after the next merge.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

type Role = "engine" | "pwa" | "scripts" | "tests" | "shell" | "other";

/** Which role a repo-relative path belongs to. */
function roleOf(rel: string): Role {
  const top = rel.split("/")[0];
  if (top === "engine") return "engine";
  if (top === "pwa") return "pwa";
  if (top === "scripts") return "scripts";
  if (top === "tests") return "tests";
  if (top === "tauri" || top === "native") return "shell";
  return "other";
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
}

/** Source with the comments stripped, so prose may name what code may not. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

/** Every module specifier a file names: static imports and re-exports,
 * side-effect imports, and dynamic imports of a literal string.
 *
 * A specifier never contains a NEWLINE, and saying so is what keeps this
 * from reading prose as an import: an `export function` whose body holds a
 * string ending in the word "from" otherwise opens a match that runs to
 * whatever quote comes next, and the file is reported as importing a
 * package made of the two statements in between. */
function specifiers(text: string): string[] {
  const src = code(text);
  const out: string[] = [];
  const spec = `["']([^"'\\n]+)["']`;
  for (const m of src.matchAll(
    new RegExp(`(?:^|\\n)\\s*(?:import|export)\\s[^;]*?\\sfrom\\s*${spec}`, "g"),
  )) {
    out.push(m[1]);
  }
  for (const m of src.matchAll(new RegExp(`(?:^|\\n)\\s*import\\s*${spec}`, "g"))) out.push(m[1]);
  for (const m of src.matchAll(new RegExp(`import\\(\\s*${spec}\\s*\\)`, "g"))) out.push(m[1]);
  return out;
}

/** Whether `spec` is imported for its types only, and so erased at build. */
function typeOnly(text: string, spec: string): boolean {
  const quoted = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`import\\s+type\\s[^;]*?from\\s*["']${quoted}["']`).test(code(text));
}

type Edge = { from: string; spec: string; to: string | null; bare: boolean };

/** The ONE package the engine may import, and only these subpaths of it:
 * the framework's engine-safe pool (the seeded PRNG, the math, the noise,
 * the clock seam, the output module) and its racing primitives. Everything
 * else it ships — the synth, the screenshot store, the DOM plumbing — is for
 * the app. A bare module (`…/core`) is not on the list: a file names the
 * file it needs, so this line can be read off the specifier alone. */
const ENGINE_PACKAGES = /^@niclaslindstedt\/oss-game-framework\/(?:core|racing)\/[a-z-]+$/;

/** Where a specifier lands: a repo-relative path for a relative import or
 * the `@engine` alias, `null` (and `bare`) for a package. */
function edgesOf(file: string): Edge[] {
  const from = relative(ROOT, file).split(sep).join("/");
  return specifiers(readFileSync(file, "utf8")).map((spec) => {
    if (spec === "@engine") return { from, spec, to: "engine/index.ts", bare: false };
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const abs = spec.startsWith("/") ? spec : resolve(dirname(file), spec);
      return { from, spec, to: relative(ROOT, abs).split(sep).join("/"), bare: false };
    }
    return { from, spec, to: null, bare: true };
  });
}

function filesUnder(...dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) walk(join(ROOT, dir), out);
  return out;
}

const ENGINE = filesUnder("engine");
const PWA = filesUnder("pwa/src");
const TESTS = filesUnder("tests");
const SCRIPTS = filesUnder("scripts");

/**
 * THE SEAM THE SUITE IS ALLOWED TO HOLD — the only files in a shell a root
 * test may import, and the exception to "nothing reaches into a shell".
 *
 * A shell states things the page also states and cannot import: the word on
 * the shell global, the name of a DOM event, the shape of a message. Those
 * pairs are load-bearing and silent when they drift — a renamed event is a
 * phone that simply stops buzzing — so the suite holds them from both ends
 * (`tests/shell_test.ts`, `tests/rumble_test.ts`).
 *
 * It stays safe because every file named here IMPORTS NOTHING AT ALL, which
 * the case below proves: the root suite never installs `native/`'s
 * dependency tree, and a seam module that grew an `expo-haptics` import
 * would take the whole suite down with it rather than fail one case.
 */
const SHELL_SEAM = new Set([
  "native/src/injected.ts",
  "native/src/navigation.ts",
  "native/src/rumble.ts",
  // The store listing's RULES — categories, the age-rating answers, the field
  // limits. It lives under `native/` because that is the shell it describes,
  // and `tests/store_listing_test.ts` checks it from the root suite for the
  // same reason the pairs above are checked from both ends: an answer that
  // drifts from the build is silent until a reviewer finds it. It qualifies
  // for the seam on the same terms — types and one literal, importing nothing.
  "native/store/listing.mts",
  // The committed SKELETON of the listing's words. The real copy.mts is
  // gitignored, so this is what a fresh clone compiles and what the suite
  // reads to check Apple's field limits are respected by the shape.
  "native/store/copy.example.mts",
]);

/**
 * THE TOOL MODULES THE SUITE MAY HOLD — the exception to "nothing imports
 * tooling", on the SHELL_SEAM's terms: data and pure functions that import
 * nothing. The store screenshot recipes carry the rasters Apple and Valve
 * accept (`tests/store_listing_test.ts` checks `css × scale` against each),
 * and the stage-route codec is what the campaign menu's routes were encoded
 * with (`tests/stage_preview_test.ts` decodes them).
 */
const TOOL_SEAM = new Set(["scripts/store-shots/recipes.mjs", "scripts/lib/stage-route.mjs"]);

describe("the dependency direction", () => {
  it("has a graph to walk", () => {
    expect(ENGINE.length).toBeGreaterThan(20);
    expect(PWA.length).toBeGreaterThan(0);
    expect(TESTS.length).toBeGreaterThan(10);
    expect(SCRIPTS.length).toBeGreaterThan(5);
  });

  it("the core imports nothing from a shell, a tool, the suite, or any package but the framework's core", () => {
    for (const file of ENGINE) {
      for (const e of edgesOf(file)) {
        if (e.bare) {
          expect(
            e.spec,
            `${e.from} imports the package "${e.spec}" — the engine may import only the framework's core/* and racing/*`,
          ).toMatch(ENGINE_PACKAGES);
          continue;
        }
        const role = roleOf(e.to ?? "");
        expect(role, `${e.from} imports ${e.spec}, which is ${role}`).toBe("engine");
      }
    }
  });

  it("the shell reaches the core only through @engine, and never a tool or another shell", () => {
    for (const file of PWA) {
      for (const e of edgesOf(file)) {
        if (e.bare) {
          expect(
            e.spec,
            `${e.from} imports "${e.spec}" — a browser bundle has no Node`,
          ).not.toMatch(/^node:|^(fs|path|url|os|child_process)$/);
          continue;
        }
        const role = roleOf(e.to ?? "");
        expect(role, `${e.from} imports ${e.spec}, which is ${role}`).not.toBe("scripts");
        expect(role, `${e.from} imports ${e.spec}, which is ${role}`).not.toBe("tests");
        expect(role, `${e.from} imports ${e.spec}, which is a shell`).not.toBe("shell");
        if (role === "engine") {
          expect(e.spec, `${e.from} reaches into the engine at ${e.spec}; use @engine`).toBe(
            "@engine",
          );
        }
      }
    }
  });

  it("nothing imports tooling", () => {
    for (const file of [...ENGINE, ...PWA, ...TESTS]) {
      for (const e of edgesOf(file)) {
        if (roleOf(e.from) === "tests" && TOOL_SEAM.has(e.to ?? "")) continue;
        expect(roleOf(e.to ?? ""), `${e.from} imports ${e.spec} from scripts/`).not.toBe("scripts");
      }
    }
  });

  it("every tool module the suite may hold imports nothing", () => {
    for (const rel of TOOL_SEAM) {
      const carried = edgesOf(join(ROOT, ...rel.split("/")));
      expect(
        carried.map((e) => e.spec),
        `${rel} is in TOOL_SEAM, so it must stay import-free`,
      ).toEqual([]);
    }
  });

  it("the suite reaches the engine the way a host does — through @engine", () => {
    for (const file of TESTS) {
      for (const e of edgesOf(file)) {
        if (roleOf(e.to ?? "") === "engine") {
          expect(e.spec, `${e.from} reaches into the engine at ${e.spec}; use @engine`).toBe(
            "@engine",
          );
        }
        if (roleOf(e.to ?? "") === "shell") {
          expect(
            SHELL_SEAM.has(e.to ?? ""),
            `${e.from} imports ${e.spec} — a shell module the suite may not hold; see SHELL_SEAM`,
          ).toBe(true);
        }
      }
    }
  });

  it("every shell module the suite may hold pulls in nothing at runtime", () => {
    for (const rel of SHELL_SEAM) {
      const file = join(ROOT, ...rel.split("/"));
      // A `import type` is erased before anything runs, so it cannot drag a
      // shell's dependency tree into the suite — which is the whole point of
      // this case. What it can still do is tie one seam module to another, so
      // the target has to be in the seam too.
      const carried = edgesOf(file).filter((e) => {
        if (!typeOnly(readFileSync(file, "utf8"), e.spec)) return true;
        return !SHELL_SEAM.has(e.to ?? "");
      });
      expect(
        carried.map((e) => e.spec),
        `${rel} is in SHELL_SEAM, so the root suite imports it without installing that tree`,
      ).toEqual([]);
    }
  });

  it("engine/index.ts is the one surface, and it re-exports only its own modules and the framework's core", () => {
    const edges = edgesOf(join(ROOT, "engine", "index.ts"));
    expect(edges.length).toBeGreaterThan(10);
    for (const e of edges) {
      if (e.bare) expect(e.spec).toMatch(ENGINE_PACKAGES);
      else expect(e.to, e.spec).toMatch(/^engine\//);
    }
  });
});

describe("the engine's hygiene", () => {
  for (const file of ENGINE) {
    const rel = relative(ROOT, file).split(sep).join("/");
    const src = code(readFileSync(file, "utf8"));
    it(`${rel} draws no global randomness, reads no clock, prints nothing`, () => {
      expect(src, "Math.random").not.toMatch(/Math\.random/);
      // The clock seam every self-timing report is HANDED a clock from, and
      // the output module every line goes out through, are both the
      // framework's; nothing left in the engine may read one or print.
      expect(src, "a wall clock").not.toMatch(/Date\.now|new Date\(\)|performance\.now|hrtime/);
      expect(src, "console").not.toMatch(/\bconsole\./);
      // Member access on the DOM's globals, not the bare words: `window` is
      // the rating's name for a stretch of road, so only the browser's own
      // members of it count.
      expect(src, "a DOM global").not.toMatch(
        /(?<![\w.$])(?:window|globalThis)\.(?:location|document|navigator|addEventListener|localStorage|sessionStorage|innerWidth|innerHeight|devicePixelRatio|matchMedia)\b|(?<![\w.$])(?:document|navigator|localStorage|sessionStorage)\.|\brequestAnimationFrame\(/,
      );
    });
  }
});

describe("the framework's engine-safe pool, as the engine reaches it", () => {
  /** The framework ships its `src/` beside `dist/`, so the file an engine
   * specifier lands on can be read as text and held to the engine's own
   * hygiene — the determinism contract does not stop at the package line. */
  const FRAMEWORK_SRC = join(ROOT, "node_modules", "@niclaslindstedt", "oss-game-framework", "src");

  const reached = new Set<string>();
  for (const file of ENGINE) {
    for (const e of edgesOf(file)) {
      if (e.bare && ENGINE_PACKAGES.test(e.spec)) {
        reached.add(e.spec.replace(/^@niclaslindstedt\/oss-game-framework\//, ""));
      }
    }
  }

  it("the engine reaches the clock seam and the output module there", () => {
    expect(reached).toContain("core/clock");
    expect(reached).toContain("core/output");
  });

  for (const sub of reached) {
    it(`${sub} stays engine-safe`, () => {
      const src = code(readFileSync(join(FRAMEWORK_SRC, `${sub}.ts`), "utf8"));
      // Only its own pool: core imports core, racing imports core or racing.
      for (const spec of specifiers(src)) {
        expect(spec, `${sub} imports ${spec}`).toMatch(/^\.\.?\/(?:core\/)?[a-z-]+$/);
      }
      expect(src, "Math.random").not.toMatch(/Math\.random/);
      if (sub !== "core/clock") {
        expect(src, "a wall clock").not.toMatch(/Date\.now|new Date\(\)|performance\.now|hrtime/);
      }
      expect(src, "console").not.toMatch(/\bconsole\./);
      expect(src, "a DOM global").not.toMatch(
        /(?<![\w.$])(?:window|document|navigator|localStorage|sessionStorage)\.|\brequestAnimationFrame\(/,
      );
    });
  }
});
