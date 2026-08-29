// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R32 — THE GROUND, IN LAYERS. A landscape is not a height: it is rock
// with things lying on top of it, and almost everything a stage looks like
// follows from which layer is showing where.
//
// The layers, laid in the order the country was made:
//
//   1. BEDROCK. The rock the whole map is cut from — broad swell, hills,
//      mountain chains along their ridges, and the fault steps between
//      them. Everything else is deposited on it or dissolved out of it.
//
//      Bedrock has a SMOOTHNESS, and it is the single number that decides
//      what country the stage is in. Sweden and Norway are made of the same
//      rock; what separates them is that the ice sat on one and ran off the
//      other. A smooth country is planed: broad whaleback summits, filled
//      valleys, escarpments worn back into slopes, and none of the fine
//      grain left — the ice took it. A rough one keeps its sharp crests,
//      its cliffs and its texture.
//
//   2. GROUNDWATER. The water table is a smoothed copy of the land, sitting
//      a few metres under it: it follows the topography without following
//      its detail, so it runs shallow under flats and hollows and deep
//      under anything steep, because steep ground drains. Where the table
//      comes up through the surface the ground is WET — a bog, a mire, a
//      spring line. Where a basin's floor is under the lake table, it is a
//      lake.
//
//   3. SOIL. Till and washed sediment lying on the rock. It collects in
//      hollows and on flats and is stripped off anything steep, so the
//      mountain flanks and the escarpment faces are bare rock and the
//      valley floors are deep. Trees need it; big rocks only surface where
//      it is thin; bedrock carries moss, grass and flowers and nothing with
//      a root.
//
// Everything here is analytic, deterministic in the seed, and — this is the
// constraint that shapes the whole module — CHEAP. The generator runs in
// the game every time a stage starts, and `surfaceAt` is read for every
// ground lattice corner, every prop, every road sample and every water
// query. So the layers are computed together in one pass over the shared
// noise rather than as four independent fields, and nothing here takes a
// gradient: the steepness terms are read off the shaping functions that
// were already evaluated (a smoothstep's own `t(1-t)` peaks exactly on its
// face), which is a derivative for free.

import { smooth, valueNoise } from "../lib/noise.ts";
import { createRng } from "../lib/prng.ts";
import { STAGE_RULES as R, knobScale, type StageKnobs } from "./rules.ts";

/** The water table: ground below this stands under open water — the lakes
 * and the sea. It is where the groundwater surfaces at the map's own base
 * level, so it is the floor under every other water level here, m. */
export const LAKE_Y = -11;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One point's worth of ground, every layer at once. Read together because
 * they are computed together: asking for the soil after the rock costs a
 * second pass over the same six noise lookups. */
export type GroundSample = {
  /** Top of the rock, m. */
  bedrock: number;
  /** Soil lying on it, m — 0 is bare rock at the surface. */
  soil: number;
  /** The ground you stand on: bedrock + soil, m. */
  surface: number;
  /** Groundwater level here, m. At or above the surface, the ground is
   * waterlogged; below `LAKE_Y` it is the lake table. */
  table: number;
};

export type GeologyField = {
  /** Every layer at a point. */
  groundAt: (x: number, z: number) => GroundSample;
  /** The ground surface alone — the hot path, so it skips what it can. */
  surfaceAt: (x: number, z: number) => number;
  /** Soil depth alone, m. */
  soilAt: (x: number, z: number) => number;
  /** How far the groundwater stands ABOVE the surface, m: 0 on dry ground,
   * positive in a mire. What decides where the bogs are. */
  wetAt: (x: number, z: number) => number;
  /** How glacially planed this country is, 0 (alpine, sharp) to 1 (shield,
   * rounded) — drawn from the seed, so every stage is somewhere. */
  smoothness: number;
};

/** Build the layers for a seed at its dial positions. Deterministic in
 * both and in nothing else: the same country every time. */
export function createGeology(seed: number, knobs: StageKnobs): GeologyField {
  const rng = createRng((seed ^ 0x1b873593) >>> 0);
  const noiseSeed = rng.int(1, 1 << 30);
  const G = R.geology;
  // How hard the country's own relief is turned up, and how much of it
  // stands under water — the `elevation` and `water` dials reach the world
  // beside the road here, exactly as they reach the road itself.
  const relief = knobScale(knobs.elevation, R.elevation.knob);
  const ponds = knobScale(knobs.water, R.wet.ponds);
  // The one number that says which country this is. Drawn from the seed,
  // not from a dial: a stage is set SOMEWHERE, and where is not a slider a
  // player was asked about.
  const smoothness = rng.range(G.smoothness.min, G.smoothness.max);
  // The ice took the fine grain with it, worked the sharp crests into
  // whalebacks, and wore the fault steps back into slopes.
  const grainAmp = G.bedrock.grain.amp * (1 - G.grain.planed * smoothness);
  const peak = G.bedrock.mountain.height * (G.mountain.tall - G.mountain.planed * smoothness);
  const escSpan =
    G.bedrock.escarpment.span.min +
    (G.bedrock.escarpment.span.max - G.bedrock.escarpment.span.min) * smoothness;

  /** Everything both the rock and the water table are made of, evaluated
   * once. `broad` is the country without its detail — the shape the water
   * table follows — and `face` is how steep the point is, read straight off
   * the shaping functions rather than measured with a gradient. */
  const layers = (
    x: number,
    z: number,
  ): { rock: number; broad: number; face: number; sunk: number } => {
    const swell = (valueNoise(x, z, G.bedrock.swell.scale, noiseSeed) - 0.5) * G.bedrock.swell.amp;
    const hills =
      (valueNoise(x, z, G.bedrock.hills.scale, noiseSeed + 7) - 0.5) * G.bedrock.hills.amp;
    const grain = (valueNoise(x, z, G.bedrock.grain.scale, noiseSeed + 13) - 0.5) * grainAmp;

    // The mountain chains: a slow mask says where one stands, a ridged
    // field says where its crest runs, and the smoothness says whether the
    // crest is a peak or a whaleback. Both shapes top out at 1, so the
    // height band is the whole of the difference in scale between them.
    const mask = smooth(
      clamp01(
        (valueNoise(x, z, G.bedrock.mountain.scale, noiseSeed + 17) - G.bedrock.mountain.from) /
          (1 - G.bedrock.mountain.from),
      ),
    );
    const ridge = 1 - Math.abs(2 * valueNoise(x, z, G.bedrock.ridge.scale, noiseSeed + 19) - 1);
    const alpine = ridge * ridge * ridge;
    const rounded = smooth(ridge);
    const crest = alpine + (rounded - alpine) * smoothness;
    const mountain = mask * crest * peak;

    // The escarpments: a wandering fault line where the ground steps down.
    // A cliff where the country is sharp, a hillside where the ice has been
    // over it. `esc * (1 - esc)` peaks exactly on the face of the step —
    // the smoothstep's own slope, without differencing anything.
    const esc = smooth(
      clamp01(
        (valueNoise(x, z, G.bedrock.escarpment.scale, noiseSeed + 29) - G.bedrock.escarpment.from) /
          escSpan,
      ),
    );

    // The basins: the sea, and the ponds a wetter dial sinks into the
    // country. They are cut into the ROCK — the ice gouged them — and they
    // fill because their floors are under the lake table.
    const b = G.bedrock.basin;
    const seaMask = smooth(
      clamp01((valueNoise(x, z, b.scale, noiseSeed + 23) - (b.from - ponds * b.wetter)) / b.span),
    );
    const p = G.bedrock.pond;
    const pond =
      ponds > 0
        ? smooth(
            clamp01(
              (valueNoise(x, z, p.scale, noiseSeed + 31) - (p.from - ponds * p.wetter)) / p.span,
            ),
          )
        : 0;
    const sunk = seaMask * (b.depth + ponds * b.deeper) + pond * (p.depth + ponds * p.deeper);

    const rock =
      (swell + hills + grain + mountain + esc * G.bedrock.escarpment.rise) * relief -
      sunk +
      G.bedrock.datum;
    // The water table follows the land without its detail: the swell and
    // the mountains, and nothing finer. That is what puts a mire in a
    // hollow the broad shape does not know about.
    const broad = (swell + mountain) * relief - sunk + G.bedrock.datum;
    // How steep it is here, 0..1 — the flank of a mountain and the face of
    // an escarpment, which is everywhere the ice and the rain strip the
    // ground bare.
    const flank = mask * 4 * crest * (1 - crest);
    const step = 4 * esc * (1 - esc);
    const face = clamp01(Math.max(flank, step));
    return { rock, broad, face, sunk };
  };

  /** Soil depth over the rock, m. Till collects where water slows down and
   * is stripped where it does not: deep in the hollows and on the flats,
   * gone on the flanks and the faces, patchy everywhere in between, and
   * thinning out on the high ground the ice scoured hardest. */
  const soilOf = (x: number, z: number, rock: number, broad: number, face: number): number => {
    const S = G.soil;
    const patch = S.patch.min + (1 - S.patch.min) * valueNoise(x, z, S.patch.scale, noiseSeed + 37);
    // Below the broad shape of the country is downhill of everywhere near
    // it, which is where everything washed off the tops ends up.
    const hollow = clamp01(0.5 + (broad - rock) / S.hollow);
    const bare = 1 - face;
    const alpine = 1 - clamp01((rock - S.alpine.from) / S.alpine.over);
    // A glaciated country has MORE in its hollows and LESS on its highs:
    // the ice is what moved it from one to the other.
    const carried = 1 + S.glacial * smoothness * (hollow - 0.5) * 2;
    return Math.max(0, S.max * patch * bare * bare * (0.35 + 0.65 * hollow) * alpine * carried);
  };

  const groundAt = (x: number, z: number): GroundSample => {
    const { rock, broad, face } = layers(x, z);
    const soil = soilOf(x, z, rock, broad, face);
    const W = G.groundwater;
    // Steep ground drains: the table drops away under a flank far faster
    // than it does under a flat.
    const table = Math.max(LAKE_Y, broad - (W.depth + W.drain * face));
    return { bedrock: rock, soil, surface: rock + soil - G.soil.datum, table };
  };

  const surfaceAt = (x: number, z: number): number => {
    const { rock, broad, face } = layers(x, z);
    return rock + soilOf(x, z, rock, broad, face) - G.soil.datum;
  };

  return {
    groundAt,
    surfaceAt,
    soilAt: (x, z) => {
      const { rock, broad, face } = layers(x, z);
      return soilOf(x, z, rock, broad, face);
    },
    wetAt: (x, z) => {
      const g = groundAt(x, z);
      return Math.max(0, g.table - g.surface);
    },
    smoothness,
  };
}
