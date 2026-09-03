// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The campaign menu's previews: the stage routes it strokes, and the biome
// banners it hangs behind a location row.
//
// Both are GENERATED and COMMITTED — `make previews` builds them from the
// generator, because deriving one at runtime costs between 60 ms and ten
// seconds a stage. That is the whole reason this file exists: committed
// output of a generator goes stale the moment the generator's rules move,
// silently, and a stale route is a picture of a road nobody drives any
// more. The staleness case below recompiles the two CHEAPEST campaign
// stages and holds the committed data to them.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_KNOBS, compileStage } from "@engine";
import { describe, expect, it } from "vitest";

// The very encoder the tool writes the committed routes with — a second
// implementation here would test the copy rather than the shipped data.
import { routeOf } from "../scripts/lib/stage-route.mjs";
import { LOCATIONS } from "../pwa/src/game/campaign.ts";
import { STAGE_ROUTES } from "../pwa/src/game/stage-routes.ts";
import { ROUTE_STROKE, biomeShot, routeShape } from "../pwa/src/game/stage-preview.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** What to run when this file fails, since the fix is never an edit here. */
const REGENERATE = "run `make previews` (the generator's rules have moved)";

describe("stage routes", () => {
  it("ships one for every campaign stage", () => {
    const missing = LOCATIONS.flatMap((location) => location.levels)
      .map((level) => level.id)
      .filter((id) => STAGE_ROUTES[id] === undefined);
    expect(missing, `no route for ${missing.join(", ")} — ${REGENERATE}`).toEqual([]);
  });

  it("carries no route for a stage the campaign no longer has", () => {
    const known = new Set(LOCATIONS.flatMap((l) => l.levels).map((level) => level.id));
    const orphans = Object.keys(STAGE_ROUTES).filter((id) => !known.has(id));
    expect(orphans, `stale route for ${orphans.join(", ")} — ${REGENERATE}`).toEqual([]);
  });

  it("decodes to a path inside the box it declares", () => {
    for (const level of LOCATIONS.flatMap((l) => l.levels)) {
      const shape = routeShape(level.id);
      expect(shape, level.id).not.toBeNull();
      if (!shape) continue;
      // Every coordinate in the `d`, against the viewBox it is drawn in.
      // A path that leaves its own box is a stage drawn with a corner cut
      // off, which is exactly the kind of thing that looks deliberate.
      const numbers = shape.d.match(/-?\d+(\.\d+)?/g) ?? [];
      expect(numbers.length, `${level.id} has no points`).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(Number(numbers[i]), `${level.id} x`).toBeGreaterThanOrEqual(0);
        expect(Number(numbers[i]), `${level.id} x`).toBeLessThanOrEqual(shape.width);
        expect(Number(numbers[i + 1]), `${level.id} y`).toBeGreaterThanOrEqual(0);
        expect(Number(numbers[i + 1]), `${level.id} y`).toBeLessThanOrEqual(shape.height);
      }
      // The road keeps its proportions, so one side is the full grid and
      // the other is shorter — never both stretched to a square.
      const longest = Math.max(shape.width, shape.height) - ROUTE_STROKE;
      expect(longest, `${level.id} is not fitted to its box`).toBeGreaterThan(200);
    }
  });

  it("still matches what the generator builds", () => {
    // The two cheapest stages in the campaign — both short sprints, a few
    // hundred milliseconds together. Any change to the generator re-rolls
    // EVERY route, so checking two catches it as surely as checking twelve
    // and does not put ten seconds of `compileStage` (seed 5 at xlong) on
    // the suite's path.
    //
    // Compared as the ENCODED BYTES, through the very function the tool
    // writes them with. An earlier version of this case compared only the
    // bounding box's aspect, which is a road's proportions rather than its
    // shape: a stage can be re-routed corner for corner and keep the box it
    // fits in, so the check passed on data that no longer described the
    // road. The bytes cannot be stale and equal.
    for (const location of LOCATIONS) {
      const level = location.levels[0];
      const track = compileStage(
        level.seed,
        level.length,
        { ...DEFAULT_KNOBS, biome: location.biome },
        level.shape ?? "sprint",
      );
      const stored = STAGE_ROUTES[level.id];
      expect(stored, level.id).toBeDefined();
      const fresh = routeOf(track);
      expect(stored.d, `${level.id} route is stale — ${REGENERATE}`).toBe(fresh.d);
      expect(stored.aspect, `${level.id} aspect is stale — ${REGENERATE}`).toBe(fresh.aspect);
    }
  });
});

describe("biome banners", () => {
  it("ships one for every country the campaign visits", () => {
    for (const location of LOCATIONS) {
      const file = join(root, `pwa/public/previews/biome-${location.biome}.jpg`);
      expect(existsSync(file), `no banner for ${location.biome} — run \`make biomes\``).toBe(true);
      // Small enough to sit in the app's precache without being noticed,
      // and big enough that the shutter did not open on an empty frame.
      const bytes = readFileSync(file).length;
      expect(bytes, `${location.biome} banner is suspiciously small`).toBeGreaterThan(4_000);
      expect(bytes, `${location.biome} banner is too heavy for a menu row`).toBeLessThan(120_000);
    }
  });

  it("is named under whichever base the site is deployed on", () => {
    // The preview and branch slots are nested deploys, and the desktop and
    // store shells serve the site off a scheme of their own. A banner
    // addressed from the root would 404 on all four.
    for (const base of ["/", "/preview/", "/branch/"]) {
      expect(biomeShot("taiga", base)).toBe(`${base}previews/biome-taiga.jpg`);
    }
  });

  it("names a file that is actually there", () => {
    for (const location of LOCATIONS) {
      const url = biomeShot(location.biome, "/");
      expect(existsSync(join(root, "pwa/public", url)), url).toBe(true);
    }
  });
});
