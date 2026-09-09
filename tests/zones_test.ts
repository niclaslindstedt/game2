// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — THE ELEVATION ZONES. Each country states where its meadow goes to
// rock and where its rock goes under snow (`BiomeLand.zones`), and three
// sides of the app read the same row: the terrain's paint, what a wheel
// throws off the ground it is standing on, and what is planted where. The
// taiga's zones are the numbers those readers were written against, so the
// taiga must answer exactly as it always did; the alpine is the country the
// zones exist for, so above its snowline the ground has to read as snow and
// grow nothing.
//
// The renderer modules under test are DOM-free — three.js colour is
// arithmetic — which is what lets this suite read them.
import { describe, expect, it } from "vitest";

import { BIOMES, LAKE_Y, biomeRules, resolveKnobs, type StageKnobs } from "@engine";

import { BIOMES as LOOKS } from "../pwa/src/game/biome.ts";
import {
  loosePaint,
  looseShades,
  plantZone,
  rockAt,
  SNOW,
  snowAt,
} from "../pwa/src/game/ground-rules.ts";

/** The dials the readers now take: R47's ALTITUDE moves the bands, so what
 * they are asked is a whole set of knobs rather than a country's name. Every
 * case here is at the dial's default, which is the country each biome row
 * describes — the alpine's own zones, untouched. */
const dials = (biome?: string) =>
  // `resolveKnobs` takes an unknown country at runtime — a stale URL, a save
  // from a build that had one this does not — and hands back the taiga; the
  // cast is what lets a test name one ("nowhere") and check that it does.
  resolveKnobs(biome === undefined ? {} : ({ biome } as Partial<StageKnobs>));

/** A flat ground standing at `y` — no slope, so only the height decides. */
const flat = (y: number) => (): number => y;
/** ...and a face: ground climbing `grade` metres per metre of x. */
const face =
  (y: number, grade: number) =>
  (x: number): number =>
    y + x * grade;

describe("the zones are the country's, read against the country's own ground", () => {
  it("states the taiga's rock line at 55..100 m with no snow, and an alpine snowline above its rock", () => {
    // A BAND IS A PERCENTILE OF ITS OWN COUNTRY. These were 46 and 26..52,
    // which are the desert's numbers and right for the desert — its ground
    // reaches 26 m at p88. The taiga's stands about twice as tall, so the
    // same band started at p65 and an eighth of everything a player drove
    // past was solid bedrock with no soil under it. Re-read at the desert's
    // own percentiles of the taiga's distribution (biomes.ts).
    expect(BIOMES.taiga.land.zones).toEqual({
      treeline: 92,
      rock: { from: 55, to: 100 },
      snow: null,
    });
    const alpine = BIOMES.alpine.land.zones;
    expect(alpine.snow).not.toBeNull();
    expect(alpine.rock.from).toBeGreaterThan(alpine.treeline);
    expect(alpine.snow as number).toBeGreaterThan(alpine.rock.to);
  });

  it("paints the taiga's rock over its band: nothing at 55 m, half way at 77.5 m, all rock from 100 m", () => {
    // The unnamed country is the taiga, as it is everywhere else in the app.
    expect(rockAt(flat(10), 0, 0)).toBe(0);
    expect(rockAt(flat(55), 0, 0)).toBe(0);
    expect(rockAt(flat(77.5), 0, 0)).toBeCloseTo(0.5, 6);
    expect(rockAt(flat(100), 0, 0)).toBe(1);
    expect(rockAt(flat(130), 0, 0)).toBe(1);
    for (const y of [10, 55, 77.5, 100, 130]) {
      expect(rockAt(flat(y), 0, 0, dials("taiga"))).toBe(rockAt(flat(y), 0, 0));
      expect(snowAt(flat(y), 0, 0, dials("taiga"))).toBe(0);
    }
    // ...and a flank steeper than 45° is rock whatever its height.
    expect(rockAt(face(5, 1.2), 0, 0)).toBe(1);
  });

  it("holds the alpine's meadow green where the taiga's would already be stone", () => {
    const zones = BIOMES.alpine.land.zones;
    expect(rockAt(flat(80), 0, 0, dials("alpine"))).toBe(0);
    expect(rockAt(flat(zones.rock.from), 0, 0, dials("alpine"))).toBe(0);
    expect(rockAt(flat(zones.rock.to), 0, 0, dials("alpine"))).toBe(1);
  });
});

describe("the snow", () => {
  const zones = BIOMES.alpine.land.zones;
  const snowline = zones.snow as number;

  it("lies on gentle ground about the alpine snowline, fading in over thirty metres from just under it", () => {
    expect(snowAt(flat(snowline - 15), 0, 0, dials("alpine"))).toBe(0);
    // At the line itself — where the road turns to snow — the verge is
    // already a third white.
    const atLine = snowAt(flat(snowline), 0, 0, dials("alpine"));
    expect(atLine).toBeGreaterThan(0.2);
    expect(atLine).toBeLessThan(0.5);
    const most = snowAt(flat(snowline + 15), 0, 0, dials("alpine"));
    expect(most).toBeGreaterThan(atLine);
    expect(most).toBeLessThan(1);
    expect(snowAt(flat(snowline + 40), 0, 0, dials("alpine"))).toBe(1);
    expect(snowAt(flat(snowline + 200), 0, 0, dials("alpine"))).toBe(1);
  });

  it("leaves a steep face as rock about the line", () => {
    // A 60° face at the edge of the cover: nothing holds on it.
    expect(snowAt(face(snowline + 20, 1.7), 0, 0, dials("alpine"))).toBe(0);
    expect(rockAt(face(snowline + 20, 1.7), 0, 0, dials("alpine"))).toBe(1);
    // A moderate slope's own snowline stands higher than the flat's.
    const gentle = snowAt(flat(snowline + 20), 0, 0, dials("alpine"));
    const sloped = snowAt(face(snowline + 20, 0.45), 0, 0, dials("alpine"));
    expect(sloped).toBeLessThan(gentle);
  });

  it("R47 — but covers the faces too once the ground is DEEP in the cover", () => {
    // The same 60° face, a winter's depth over the line rather than a
    // margin above it: the wind-scoured edge of the permanent snow is one
    // picture and a country under a winter is another, and the second one
    // has no brown hillsides in it.
    const deep = snowline + SNOW.deep;
    expect(snowAt(face(deep, 1.7), 0, 0, dials("alpine"))).toBe(1);
    // A moderate slope has stopped being distinguishable from the flat.
    expect(snowAt(face(deep, 0.45), 0, 0, dials("alpine"))).toBe(1);
    // ...and rock too steep for anything to sit on is still bare, which is
    // the angle snow stops sitting at rather than a slope of any kind: a
    // 72° face keeps most of its stone, and a cliff keeps all of it.
    const steep = snowAt(face(deep, 3), 0, 0, dials("alpine"));
    expect(steep).toBeGreaterThan(0);
    expect(steep).toBeLessThan(0.4);
    expect(snowAt(face(deep, 12), 0, 0, dials("alpine"))).toBe(0);
  });

  it("never falls in a country with no snowline", () => {
    for (const biome of ["taiga", "desert"] as const) {
      expect(biomeRules(biome).land.zones.snow).toBeNull();
      expect(snowAt(flat(500), 0, 0, dials(biome))).toBe(0);
    }
  });
});

describe("what is planted where", () => {
  // `mixAt` (planting.ts) is this rule turned into the biome's mixes — the
  // snow zone is the empty mix — and it cannot be imported here: it names
  // the flora's placement type, and the flora module paints canvases.
  it("plants nothing above the alpine snowline, and the highland from where the paint goes to rock", () => {
    const zones = BIOMES.alpine.land.zones;
    const at = (y: number) => plantZone(dials("alpine"), y, false);
    expect(at((zones.snow as number) + 1)).toBe("snow");
    expect(at((zones.snow as number) + 300)).toBe("snow");
    expect(at(zones.rock.from + 1)).toBe("highland");
    expect(at(zones.rock.from - 1)).toBe("community");
    // ...and the snow wins over a stream bank, where the taiga's bank wins
    // over its highland.
    expect(plantZone(dials("alpine"), (zones.snow as number) + 1, true)).toBe("snow");
  });

  it("puts the taiga's highland at its rock line: above 55 m, and never under snow", () => {
    // The highland mix — squat spruce, juniper, snags — follows `rock.from`,
    // so it moved with the band above. It had been dressing most of every
    // high stage in stunted trees on the strength of a 26 m line.
    expect(plantZone(dials("taiga"), 56, false)).toBe("highland");
    expect(plantZone(dials("taiga"), 54, false)).toBe("community");
    expect(plantZone(dials("taiga"), 40, true)).toBe("riparian");
    expect(plantZone(dials("taiga"), 800, false)).toBe("highland");
    expect(plantZone(dials("taiga"), LAKE_Y + 1, false)).toBe("shore");
    // The unnamed country is the taiga here too.
    expect(plantZone(dials("nowhere"), 56, false)).toBe("highland");
    // A dry country has no shore however low its pans lie.
    expect(plantZone(dials("desert"), LAKE_Y + 1, false)).toBe("community");
  });
});

describe("the loose road is built from the country's grit", () => {
  it("gives each country its own grit, and the taiga's is the gravel it always was", () => {
    expect(LOOKS.taiga.grit).toBe(0xb29268);
    expect(LOOKS.desert.grit).not.toBe(LOOKS.taiga.grit);
    expect(LOOKS.alpine.grit).not.toBe(LOOKS.taiga.grit);
  });

  it("speckles the taiga's gravel in the shades it was authored in, and a grey grit in greys", () => {
    const rgb = (css: string): number[] => css.match(/\d+/g)!.map(Number);
    const gravel = looseShades(LOOKS.taiga.grit);
    expect(rgb(gravel.ground)).toEqual([0xb2, 0x92, 0x68]);
    // Two darks and two pales, each within a few counts of the shades the
    // gravel map carried before it was derived (#a08258 #c4a67a #8a6f4d #d8c096).
    const authored = [
      [0xa0, 0x82, 0x58],
      [0xc4, 0xa6, 0x7a],
      [0x8a, 0x6f, 0x4d],
      [0xd8, 0xc0, 0x96],
    ];
    gravel.flecks.forEach((fleck, i) => {
      rgb(fleck).forEach((v, ch) => expect(Math.abs(v - authored[i][ch])).toBeLessThanOrEqual(12));
    });
    const grey = looseShades(LOOKS.alpine.grit);
    for (const shade of [grey.ground, ...grey.flecks]) {
      const [r, g, b] = rgb(shade);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    }
    // A pale grit is bleached toward the sand it reads as.
    const sand = rgb(looseShades(LOOKS.desert.grit).ground);
    expect(sand[0]).toBeGreaterThan((LOOKS.desert.grit >> 16) & 255);
  });

  it("paints the taiga's gravel mat and tracks as the authored row, and a grey grit as a grey road", () => {
    const hex = (c: { getHexString: () => string }): string => c.getHexString();
    const near = (a: string, b: string, tol: number): void => {
      for (let i = 0; i < 3; i++) {
        const av = parseInt(a.slice(i * 2, i * 2 + 2), 16);
        const bv = parseInt(b.slice(i * 2, i * 2 + 2), 16);
        expect(Math.abs(av - bv)).toBeLessThanOrEqual(tol);
      }
    };
    const taiga = loosePaint(LOOKS.taiga.grit);
    near(hex(taiga.loose), "d2b489", 6);
    near(hex(taiga.worn), "8a7046", 6);
    const alpine = loosePaint(LOOKS.alpine.grit);
    for (const c of [alpine.loose, alpine.worn]) {
      const s = hex(c);
      const ch = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
      expect(Math.max(...ch) - Math.min(...ch)).toBeLessThanOrEqual(10);
    }
    expect(alpine.loose.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      alpine.worn.getHSL({ h: 0, s: 0, l: 0 }).l,
    );
  });
});
