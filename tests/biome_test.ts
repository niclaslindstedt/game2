// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — THE COUNTRY. A stage is built in a biome, and the desert is the
// one that is not the taiga: no water anywhere (no lake, no river, no ford,
// no bridge), no dead wood, a sand road with its own physics, and a quilt
// of its own that the renderer's tables have to match row for row.
//
// The two halves are tested against each other on purpose. The engine
// places every solid thing from `engine/mapgen/biomes.ts`; the app dresses
// it from `pwa/src/game/biome-*.ts`. A community named on one side and not
// the other, or a species a mix names that no roster builds, fails the
// first stage that rolls it — which is the one seed nobody rendered.
import { describe, expect, it } from "vitest";

import {
  BIOMES,
  BIOME_IDS,
  DEFAULT_KNOBS,
  LAKE_Y,
  TUNING,
  biomeRules,
  compileStage,
  createTerrain,
  isLoose,
  resolveKnobs,
  type BiomeId,
  type Track,
  type WildObstacle,
} from "@engine";

import { BIOMES as LOOKS } from "../pwa/src/game/biome.ts";
import { VARIANTS } from "../pwa/src/game/flora-species.ts";

const SEEDS = [1, 2, 3];

const built = new Map<string, { track: Track; terrain: ReturnType<typeof createTerrain> }>();

function stage(
  seed: number,
  biome: BiomeId,
): { track: Track; terrain: ReturnType<typeof createTerrain> } {
  const key = `${biome}:${seed}`;
  const kept = built.get(key);
  if (kept) return kept;
  const track = compileStage(seed, "medium", { biome }, "sprint");
  const terrain = createTerrain(track);
  terrain.sync(track.length);
  const out = { track, terrain };
  built.set(key, out);
  return out;
}

/** Every solid within reach of the road, once. */
function propsAlong(
  track: Track,
  near: (x: number, z: number, r: number) => WildObstacle[],
): WildObstacle[] {
  const seen = new Map<string, WildObstacle>();
  for (let i = 0; i < track.samples.length; i += 20) {
    const s = track.samples[i];
    for (const ob of near(s.x, s.z, 80)) seen.set(`${ob.x},${ob.z}`, ob);
  }
  return [...seen.values()];
}

describe("R40 — the country is a dial", () => {
  it("defaults to the taiga, and falls back to it for a country this build does not know", () => {
    expect(DEFAULT_KNOBS.biome).toBe("taiga");
    expect(resolveKnobs().biome).toBe("taiga");
    expect(resolveKnobs({ biome: "desert" }).biome).toBe("desert");
    expect(resolveKnobs({ biome: "tundra" as BiomeId }).biome).toBe("taiga");
    expect(biomeRules("nowhere").id).toBe("taiga");
  });

  it("carries the country on the track, and the taiga's rules are the ones every other rule was written against", () => {
    expect(compileStage(1, "short").knobs.biome).toBe("taiga");
    const taiga = BIOMES.taiga;
    expect(taiga.land.relief).toBe(1);
    expect(taiga.land.mountains).toBe(1);
    expect(taiga.land.dunes).toBeNull();
    expect(taiga.water).toBe(true);
    expect(taiga.loose).toBe("gravel");
  });
});

describe("R40 — the desert", () => {
  it("has no water: no crossing on the route, no course, no lake, and a table that never surfaces", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed, "desert");
      expect(track.samples.some((s) => s.surface === "water" || s.deck !== null)).toBe(false);
      expect(track.segments.some((p) => p.feature === "water")).toBe(false);
      expect(terrain.rivers).toHaveLength(0);
      expect(terrain.streams).toHaveLength(0);
      const b = track.bounds;
      for (let x = b.minX - 100; x <= b.maxX + 100; x += 60) {
        for (let z = b.minZ - 100; z <= b.maxZ + 100; z += 60) {
          expect(terrain.waterAt(x, z)).toBeNull();
          expect(terrain.geology.wetAt(x, z)).toBe(0);
          expect(terrain.geology.surfaceAt(x, z)).toBeGreaterThan(LAKE_Y);
        }
      }
    }
  });

  it("blades its road out of sand, and nothing else is loose", () => {
    for (const seed of SEEDS) {
      const { track } = stage(seed, "desert");
      const unsealed = track.samples.filter((s) => s.surface !== "asphalt");
      expect(unsealed.length).toBeGreaterThan(0);
      expect(unsealed.every((s) => s.surface === "sand")).toBe(true);
      expect(track.samples.some((s) => s.surface === "gravel")).toBe(false);
      // ...and a bladed road is a bladed road whichever country it is in:
      // the wander, the bumps and the berm all ask the same question.
      expect(isLoose("sand")).toBe(true);
      expect(isLoose("gravel")).toBe(true);
      expect(isLoose("asphalt")).toBe(false);
    }
    const taiga = stage(1, "taiga").track;
    expect(taiga.samples.some((s) => s.surface === "sand")).toBe(false);
  });

  it("sheds no timber — the stone stays, the fallen trunks and the stumps go", () => {
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed, "desert");
      const props = propsAlong(track, terrain.obstaclesNear);
      expect(props.length).toBeGreaterThan(20);
      expect(props.some((ob) => ["log", "rootlog", "stump", "timber"].includes(ob.kind))).toBe(
        false,
      );
      expect(props.some((ob) => ob.kind === "boulder" || ob.kind === "rock")).toBe(true);
      // Still a country with things standing in it: the saguaros and the
      // Joshua trees are trunks the engine places.
      expect(propsAlong(track, terrain.treesNear).length).toBeGreaterThan(20);
    }
  });

  it("is worn lower than the taiga, with the sand piled on top of it", () => {
    const desert = BIOMES.desert;
    expect(desert.land.relief).toBeLessThan(1);
    expect(desert.land.mountains).toBeLessThan(1);
    expect(desert.land.dunes).not.toBeNull();
    expect(desert.land.floor).not.toBeNull();
    // The dunes are SOIL: somewhere in the desert the cover is deeper than
    // the taiga's till ever gets. SEARCHED across the seeds rather than
    // pinned to one — a stage that happens to run across the pans between
    // the dune fields has none, and which seed does is a fact about where
    // that stage wanders, not about the dunes.
    let deepest = 0;
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed, "desert");
      const b = track.bounds;
      for (let x = b.minX; x <= b.maxX; x += 50) {
        for (let z = b.minZ; z <= b.maxZ; z += 50) {
          deepest = Math.max(deepest, terrain.geology.soilAt(x, z));
        }
      }
    }
    expect(deepest).toBeGreaterThan(3);
  });

  it("has a dry sky, and a sand that holds less and lets go later than gravel", () => {
    expect(BIOMES.desert.weathers).not.toContain("rain");
    expect(BIOMES.desert.rain).toBe(false);
    expect(BIOMES.taiga.rain).toBe(true);
    const S = TUNING.surfaces;
    expect(S.grip.sand).toBeLessThan(S.grip.gravel);
    expect(S.breakaway.sand).toBeGreaterThan(S.breakaway.gravel);
    expect(S.drag.sand).toBeGreaterThan(S.drag.gravel);
    expect(S.power.sand).toBeLessThanOrEqual(S.power.gravel);
  });
});

describe("R40 — the two halves agree", () => {
  it("dresses every grove and region the engine quilts, in every country, and names only species a roster builds", () => {
    for (const id of BIOME_IDS) {
      const rules = BIOMES[id];
      const look = LOOKS[id];
      expect(look.id).toBe(id);
      for (const grove of rules.groves) {
        expect(
          look.communities.map((c) => c.id),
          `${id} grove ${grove.id}`,
        ).toContain(grove.id);
      }
      for (const region of rules.regions) {
        expect(look.regions[region.id], `${id} region ${region.id}`).toBeDefined();
      }
      const mixes = [
        look.lakeshoreTrees,
        look.shoreCover,
        look.riparianTrees,
        look.highlandTrees,
        look.undergrowth,
        look.vergeCover,
        ...look.communities.flatMap((c) => [c.trees, c.undergrowth ?? {}]),
      ];
      for (const mix of mixes) {
        for (const species of Object.keys(mix)) {
          expect(
            VARIANTS[species],
            `${id} plants "${species}", which no roster builds`,
          ).toBeDefined();
        }
      }
    }
  });

  it("grows a different roster in each country", () => {
    const grows = (id: BiomeId): Set<string> =>
      new Set(LOOKS[id].communities.flatMap((c) => Object.keys(c.trees)));
    const taiga = grows("taiga");
    const desert = grows("desert");
    expect(desert.has("saguaro")).toBe(true);
    expect(taiga.has("saguaro")).toBe(false);
    expect(taiga.has("spruceTall")).toBe(true);
    expect(desert.has("spruceTall")).toBe(false);
  });
});
