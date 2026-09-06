// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUILDINGS' STYLE (R40) — which kind of house a country builds. The
// plan is the engine's and the look is the renderer's, and the one field
// joining them is `style`: a taiga yard gets the Nordic timber house, an
// alpine yard the chalet, and a country that draws a plan without saying
// which gets the Nordic one.
import { describe, expect, it } from "vitest";

import {
  BIOMES,
  biomeRules,
  compileStage,
  createRng,
  drawBarnPlan,
  drawHousePlan,
  drawTownPlan,
  type BuildingKind,
  type HousePlan,
  type Track,
} from "@engine";

const KINDS: BuildingKind[] = [
  "house",
  "villa",
  "apartments",
  "grocery",
  "post",
  "workshop",
  "barn",
];

/** Every plan standing on a stage: the yards' houses and barns, the
 * streets' buildings. */
function plansOn(track: Track): HousePlan[] {
  const out: HousePlan[] = [];
  for (const h of track.homesteads) {
    out.push(h.house.plan);
    if (h.farm) out.push(h.farm.barn.plan);
  }
  for (const t of track.towns) for (const lot of t.lots) out.push(lot.building.plan);
  return out;
}

/** The first stage in a country with anything built on it — searched for,
 * never named, so a re-rolled generator still finds one. */
function settledStage(biome: "taiga" | "alpine"): Track {
  for (let seed = 1; seed <= 40; seed++) {
    const track = compileStage(seed, "medium", { biome, asphalt: 0.3 });
    if (plansOn(track).length > 0) return track;
  }
  throw new Error(`no ${biome} stage in forty seeds has a building on it`);
}

describe("the house style a country builds (R40)", () => {
  it("every country names one, and the alpine's is the chalet", () => {
    for (const rules of Object.values(BIOMES)) {
      expect(["nordic", "chalet"]).toContain(rules.houses);
    }
    expect(biomeRules("taiga").houses).toBe("nordic");
    expect(biomeRules("desert").houses).toBe("nordic");
    expect(biomeRules("alpine").houses).toBe("chalet");
  });

  it("the draws carry the style they are given, and default to the Nordic house", () => {
    const rng = createRng(7);
    expect(drawHousePlan(rng).style).toBe("nordic");
    expect(drawHousePlan(rng, "chalet").style).toBe("chalet");
    expect(drawBarnPlan(rng).style).toBe("nordic");
    expect(drawBarnPlan(rng, "chalet").style).toBe("chalet");
    for (const kind of KINDS) {
      expect(drawTownPlan(rng, kind).style).toBe("nordic");
      expect(drawTownPlan(rng, kind, "chalet").style).toBe("chalet");
      expect(drawTownPlan(rng, kind, "chalet").kind).toBe(kind);
    }
  });

  it("the style changes nothing else about a plan", () => {
    const a = drawHousePlan(createRng(11), "nordic");
    const b = drawHousePlan(createRng(11), "chalet");
    expect({ ...a, style: "x" }).toEqual({ ...b, style: "x" });
  });

  it("alpine stages stand chalets and taiga stages stand Nordic houses", () => {
    const alpine = plansOn(settledStage("alpine"));
    expect(alpine.length).toBeGreaterThan(0);
    for (const plan of alpine) expect(plan.style).toBe("chalet");
    const taiga = plansOn(settledStage("taiga"));
    expect(taiga.length).toBeGreaterThan(0);
    for (const plan of taiga) expect(plan.style).toBe("nordic");
  });
});
