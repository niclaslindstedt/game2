// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT CLOUDS ARE OVER A STAGE — the genera at the heights the chart puts
// them, dressed by the weather, the country, the season and the seed; and
// the noise they are drawn from, which lives twice (GLSL for the dome, TS
// for the light) and has to agree with itself.

import { describe, expect, it } from "vitest";

import type { RaceEnv } from "@engine";

import {
  CLOUD_DENSITY_GLSL,
  CLOUD_NOISE_GLSL,
  MAX_LAYERS,
  cloudDensity,
  cloudFbm,
  cloudField,
  cloudHash,
  cloudNoise,
  cloudUv,
  dressSky,
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
    for (const literal of ["0.1031", "33.33", "1.6", "1.2", "17.3", "9.1", "0.76", "2.6", "7.1"]) {
      expect(CLOUD_NOISE_GLSL).toContain(literal);
    }
    for (const literal of ["0.5 - coverage", "0.04 + 0.3"]) {
      expect(CLOUD_DENSITY_GLSL).toContain(literal);
    }
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
          expect(layers.length).toBeGreaterThan(0);
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
    seed: 11,
    deck: false,
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
