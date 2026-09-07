// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT CLOUDS ARE OVER A STAGE — the genera at the heights the chart puts
// them, dressed by the weather, the country, the season and the seed; and
// the noise they are drawn from, which lives twice (GLSL for the dome, TS
// for the light) and has to agree with itself.

import { describe, expect, it } from "vitest";

import type { RaceEnv } from "@engine";

import {
  CLOUD_DENSITY_GLSL,
  MAX_LAYERS,
  cloudDensity,
  cloudFbm,
  cloudField,
  cloudHash,
  cloudNoise,
  cloudNoiseGlsl,
  cloudUv,
  dressSky,
  fieldArms,
  skySeed,
  sunOcclusion,
  type CloudLayer,
} from "../pwa/src/game/cloud-field.ts";

function conditions(over: Partial<RaceEnv>): RaceEnv {
  return {
    hour: 12,
    weather: "clear",
    season: "summer",
    temperature: 18,
    windDir: 0.7,
    windSpeed: 2,
    gustPhase: 1.3,
    ...over,
  };
}

/** The chart's bands, m over the sea. */
const BAND: Record<string, [number, number]> = {
  cumulus: [0, 3000],
  stratocumulus: [0, 2000],
  stratus: [0, 2000],
  nimbostratus: [0, 2000],
  cumulonimbus: [0, 2000],
  altocumulus: [2000, 7000],
  altostratus: [2000, 7000],
  cirrus: [5000, 13000],
  cirrostratus: [5000, 13000],
  scud: [0, 2000],
  dust: [0, 2000],
};

describe("the noise", () => {
  it("stays in range and centres on a half", () => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 120; i++) {
      for (let j = 0; j < 120; j++) {
        const v = cloudFbm(i * 0.37 + 100, j * 0.41 - 50, 5);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
        n++;
        const h = cloudHash(i, j);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });

  it("is smooth: neighbours a hundredth apart differ by almost nothing", () => {
    for (let k = 0; k < 50; k++) {
      const x = k * 1.37;
      const y = k * 0.73;
      expect(Math.abs(cloudNoise(x + 0.01, y) - cloudNoise(x, y))).toBeLessThan(0.03);
    }
  });

  it("is the same arithmetic the shader runs", () => {
    // The constants the two copies share: the hash's, the lattice's turn,
    // and the density's threshold. A change to one that is not a change to
    // the other is the sun dimming under a cloud the player cannot see.
    const glsl = cloudNoiseGlsl([6]);
    const shared = ["0.1031", "33.33", "1.6", "1.2", "17.3", "9.1", "0.76", "2.6", "7.1"];
    // …and the fibres' pitch and weight, which the cirrus over the sun is
    // read through too.
    for (const literal of [...shared, "1.7", "9.0", "3.7", "11.9", "0.5 + 1.0"]) {
      expect(glsl).toContain(literal);
    }
    for (const literal of ["0.5 - coverage", "0.04 + 0.3"]) {
      expect(CLOUD_DENSITY_GLSL).toContain(literal);
    }
  });

  it("emits a field at each depth asked for, over both its arms and nothing else", () => {
    // The depths are compiled in rather than passed as a uniform, so the
    // emitter is what decides the shader agrees with `cloudField` above —
    // an arm left out is a link error at the first frame of a stage, and an
    // arm emitted at the wrong depth is a sky that does not match the light.
    const glsl = cloudNoiseGlsl([3, 6], [4]);
    for (const octaves of [3, 6]) {
      expect(glsl).toContain(`float cloudField${octaves}( vec2 uv )`);
      const [mass, detail] = fieldArms(octaves);
      expect(glsl).toContain(`0.76 * cloudFbm${mass}( uv )`);
      expect(glsl).toContain(`0.24 * cloudFbm${detail}( uv * 2.6`);
    }
    // Every fbm called is declared, exactly once, with a literal trip count
    // — a bound the compiler can see is the whole point of emitting these.
    for (const arm of [1, 2, 4]) {
      expect(glsl.split(`float cloudFbm${arm}( vec2 p )`)).toHaveLength(2);
      expect(glsl).toContain(`i < ${arm}; i ++`);
    }
    // ...and nothing is compiled that nobody reads.
    expect(glsl).not.toContain("cloudFbm3(");
    expect(glsl).not.toContain("cloudField4(");
  });

  it("covers about what it is asked to", () => {
    const covered = (coverage: number): number => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 120; i++) {
        for (let j = 0; j < 120; j++) {
          sum += cloudDensity({ coverage, sharpness: 0.75 }, cloudField(i * 0.37, j * 0.41, 5));
          n++;
        }
      }
      return sum / n;
    };
    expect(covered(0)).toBeLessThan(0.03);
    expect(covered(1)).toBeGreaterThan(0.97);
    let was = 0;
    for (const c of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const now = covered(c);
      expect(now).toBeGreaterThan(was);
      expect(Math.abs(now - c)).toBeLessThan(0.15);
      was = now;
    }
  });

  it("reads the field along the wind and across it", () => {
    const layer = { scale: 100, streak: 2, seed: 0 };
    // Along the wind the cells are twice as long.
    const [u0] = cloudUv(layer, 0, 0, 0, 0, 1, 0);
    const [u1] = cloudUv(layer, 200, 0, 0, 0, 1, 0);
    expect(u1 - u0).toBeCloseTo(1, 9);
    const [, v0] = cloudUv(layer, 0, 0, 0, 0, 1, 0);
    const [, v1] = cloudUv(layer, 0, 100, 0, 0, 1, 0);
    expect(v1 - v0).toBeCloseTo(1, 9);
  });
});

describe("dressing the sky", () => {
  it("is the same sky for the same stage", () => {
    const env = conditions({});
    expect(dressSky(env, "taiga", 0, null)).toEqual(dressSky(env, "taiga", 0, null));
    expect(skySeed({ ...env, hour: 3 } as RaceEnv)).toBe(skySeed(env));
    // …and another wind is another sky.
    const other = dressSky(conditions({ gustPhase: 2.9, windDir: 1.1 }), "taiga", 0, null);
    expect(other).not.toEqual(dressSky(env, "taiga", 0, null));
  });

  it("puts every genus in its band on the chart, lowest first", () => {
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      for (const season of ["spring", "summer", "autumn", "winter"] as const) {
        for (let seed = 0; seed < 12; seed++) {
          const env = conditions({ season, gustPhase: seed * 0.37, windDir: seed * 0.11 });
          const { layers } = dressSky(env, biome, 0, null);
          // A bare blue day is a legal sky — see the cloudless roll below.
          expect(layers.length).toBeLessThanOrEqual(MAX_LAYERS);
          for (let i = 1; i < layers.length; i++) {
            expect(layers[i].altitude).toBeGreaterThan(layers[i - 1].altitude);
          }
          for (const layer of layers) {
            const [lo, hi] = BAND[layer.genus];
            expect(layer.altitude, `${layer.genus} over the ${biome}`).toBeGreaterThanOrEqual(lo);
            expect(layer.altitude).toBeLessThanOrEqual(hi);
            expect(layer.coverage).toBeGreaterThan(0);
            expect(layer.coverage).toBeLessThanOrEqual(1);
            expect(layer.deck).toBe(false);
          }
        }
      }
    }
  });

  it("builds its cumulus higher over dry ground", () => {
    const base = (biome: "taiga" | "desert" | "alpine"): number[] => {
      const out: number[] = [];
      for (let seed = 0; seed < 20; seed++) {
        const env = conditions({ gustPhase: seed * 0.31, windDir: seed * 0.17 });
        const heap = dressSky(env, biome, 0, null).layers.find((l) => l.genus === "cumulus");
        if (heap) out.push(heap.altitude);
      }
      return out;
    };
    const taiga = base("taiga");
    const desert = base("desert");
    expect(taiga.length).toBeGreaterThan(0);
    expect(desert.length).toBeGreaterThan(0);
    expect(Math.min(...desert)).toBeGreaterThan(Math.max(...taiga));
  });

  it("puts a deck on a wet sky with scud tearing under it", () => {
    const { layers } = dressSky(conditions({ weather: "storm", windSpeed: 11 }), "taiga", 1, 240);
    const deck = layers.find((l) => l.deck) as CloudLayer;
    const scud = layers.find((l) => l.genus === "scud") as CloudLayer;
    expect(deck).toBeDefined();
    expect(scud).toBeDefined();
    expect(deck.altitude).toBe(240);
    expect(deck.coverage).toBe(1);
    expect(deck.genus).toBe("cumulonimbus");
    expect(scud.altitude).toBeLessThan(deck.altitude);
    expect(scud.drift).toBeGreaterThan(2);
    // Rain's deck is the stratus kind.
    const rain = dressSky(conditions({ weather: "rain", windSpeed: 4 }), "taiga", 0.3, 300);
    expect(rain.layers.find((l) => l.deck)?.genus).toBe("nimbostratus");
  });

  it("blows sand for the desert's storm, and rains in its wet season", () => {
    const summer = dressSky(conditions({ weather: "storm", windSpeed: 11 }), "desert", 1, 150);
    expect(summer.layers.find((l) => l.deck)?.genus).toBe("dust");
    const winter = dressSky(
      conditions({ weather: "rain", windSpeed: 4, season: "winter" }),
      "desert",
      0.5,
      300,
    );
    expect(winter.layers.find((l) => l.deck)?.genus).toBe("nimbostratus");
  });

  it("ranks the sheet the stage is driven under first, whatever its altitude", () => {
    // The cap the SKY lever applies keeps the lowest ranks (sky-shader.ts),
    // so rank 0 has to be the sheet the sky reads as. Under weather that is
    // the DECK with the scud BELOW it, which is the case altitude order
    // gets backwards — keep the lowest sheet there and a storm loses its
    // ceiling and keeps the rags.
    const storm = dressSky(conditions({ weather: "storm" }), "taiga", 0.5, 900).layers;
    const primary = storm.reduce((a, b) => (a.rank <= b.rank ? a : b));
    expect(primary.deck).toBe(true);
    expect(primary.genus).toBe("cumulonimbus");
    // …and the scud it keeps company is the one a thinner sky gives up,
    // even though it hangs lower.
    const scud = storm.find((l) => l.genus === "scud");
    expect(scud).toBeDefined();
    expect(scud!.rank).toBeGreaterThan(primary.rank);
    expect(scud!.altitude).toBeLessThan(primary.altitude);
  });

  it("ranks a clear sky from the base up, and never leaves a cap with nothing", () => {
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      for (let i = 0; i < 60; i++) {
        const env = conditions({ windDir: i * 0.13, gustPhase: i * 0.29 });
        const { layers } = dressSky(env, biome, 0.4, null);
        if (layers.length === 0) continue;
        // A cap of one always leaves exactly one sheet standing — the
        // ranks need not be dense (a desert can roll cirrus alone), so the
        // cap sorts by rank rather than testing against it.
        const kept = [...layers].sort((a, b) => a.rank - b.rank).slice(0, 1);
        expect(kept).toHaveLength(1);
        // The lowest sheet is the primary on a clear day: heaps or a
        // sheet at the condensation level, never the cirrus over it.
        const lowest = layers.reduce((a, b) => (a.altitude <= b.altitude ? a : b));
        expect(lowest.rank).toBe(Math.min(...layers.map((l) => l.rank)));
      }
    }
  });

  it("hands the dome its sheets in altitude order", () => {
    // The dome walks the stack from the far side of the sky
    // (`uLayers - 1 - k` going up), which is only far-to-near if the list
    // climbs. The chart pushes in the order it thinks in, and a desert's
    // winter altostratus is rolled AFTER the cirrus five kilometres over
    // it.
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      for (const weather of ["clear", "rain", "storm"] as const) {
        for (const season of ["summer", "winter"] as const) {
          for (let i = 0; i < 30; i++) {
            const env = conditions({ weather, season, windDir: i * 0.17, gustPhase: i * 0.41 });
            const { layers } = dressSky(env, biome, 0.5, weather === "clear" ? null : 900);
            const climbs = layers.every((l, k) => k === 0 || layers[k - 1].altitude <= l.altitude);
            expect(climbs).toBe(true);
          }
        }
      }
    }
  });

  it("some days puts nothing over the stage at all, most often over the desert", () => {
    const bare = (biome: "taiga" | "desert" | "alpine"): number => {
      let empty = 0;
      for (let seed = 0; seed < 200; seed++) {
        const env = conditions({ gustPhase: seed * 0.31, windDir: seed * 0.07 });
        if (dressSky(env, biome, 0, null).layers.length === 0) empty++;
      }
      return empty / 200;
    };
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      expect(bare(biome), `bare skies over the ${biome}`).toBeGreaterThan(0);
    }
    // The dry country's air is the emptiest, and the forest's the least.
    expect(bare("desert")).toBeGreaterThan(bare("alpine"));
    expect(bare("alpine")).toBeGreaterThan(bare("taiga"));
    // …and a sky under weather always has its deck, however dry the country.
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      for (let seed = 0; seed < 40; seed++) {
        const env = conditions({ weather: "rain", gustPhase: seed * 0.31, windDir: seed * 0.07 });
        expect(dressSky(env, biome, 0.5, 700).layers.length).toBeGreaterThan(0);
      }
    }
  });

  it("drops a sheet too thin to draw rather than spending a layer on it", () => {
    for (const biome of ["taiga", "desert", "alpine"] as const) {
      for (const season of ["spring", "summer", "autumn", "winter"] as const) {
        for (let seed = 0; seed < 60; seed++) {
          const env = conditions({ season, gustPhase: seed * 0.19, windDir: seed * 0.23 });
          for (const layer of dressSky(env, biome, 0, null).layers) {
            expect(layer.coverage, `${layer.genus} over the ${biome}`).toBeGreaterThanOrEqual(0.05);
          }
        }
      }
    }
  });

  it("sits the winter forest under a sheet and the summer one under heaps", () => {
    const winter = dressSky(conditions({ season: "winter" }), "taiga", 0, null).layers;
    const summer = dressSky(conditions({ season: "summer" }), "taiga", 0, null).layers;
    expect(winter[0].genus).toBe("stratocumulus");
    expect(summer[0].genus).toBe("cumulus");
  });
});

describe("the cloud over the sun", () => {
  const layer: CloudLayer = {
    genus: "cumulus",
    altitude: 1200,
    thickness: 800,
    coverage: 0.6,
    scale: 900,
    sharpness: 0.75,
    streak: 1.15,
    body: 1,
    drift: 1,
    fibre: 0,
    seed: 11,
    deck: false,
    rank: 0,
  };

  it("shades nothing when the sun is down or the sheet is below", () => {
    expect(sunOcclusion(layer, 0, 0, 0, { x: 0.3, y: -0.2, z: 0.9 }, 0, 0, 1, 0, 4)).toBe(0);
    expect(sunOcclusion(layer, 0, 1500, 0, { x: 0, y: 1, z: 0 }, 0, 0, 1, 0, 4)).toBe(0);
  });

  it("answers between nothing and everything, and somewhere finds a cloud", () => {
    let most = 0;
    let least = 1;
    for (let i = 0; i < 400; i++) {
      const v = sunOcclusion(
        layer,
        i * 37,
        20,
        i * 53,
        { x: 0.3, y: 0.7, z: 0.648 },
        0,
        0,
        1,
        0,
        4,
      );
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      most = Math.max(most, v);
      least = Math.min(least, v);
    }
    expect(most).toBeGreaterThan(0.8);
    expect(least).toBeLessThan(0.2);
  });
});
