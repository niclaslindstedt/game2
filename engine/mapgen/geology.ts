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
import { biomeRules } from "./biomes.ts";
import { STAGE_RULES as R, knobScale, type StageKnobs } from "./rules.ts";

/** The water table: ground below this stands under open water — the lakes
 * and the sea. It is where the groundwater surfaces at the map's own base
 * level, so it is the floor under every other water level here, m. */
export const LAKE_Y = -11;

/** R40 — how far under the lake table a dry country's groundwater sits,
 * m. Deep enough that no hollow the relief can cut reaches it: the
 * desert's floor keeps the surface above the table by construction, and
 * this keeps the table out of every "is it wet" answer besides. */
const ARID_TABLE = 40;

/** R40 — the knee a dry country's pans are flattened over, m: how far
 * above the floor the hillside starts easing onto it. */
const PAN_KNEE = 8;

/** R40 — the share of the dune mask under which there is no sand, and the
 * span it fades in over. Value noise sits mostly between 0.3 and 0.7, so
 * this puts full-height dunes over roughly a third of the country, fading
 * ones over another third, and pan and scrub over the rest. */
const DUNE_FIELD_FROM = 0.3;
const DUNE_FIELD_SPAN = 0.25;

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

/** Standing water at a point. `depth` is how far the surface lies under the
 * lake table, m — 0 on dry ground. */
export type Wetland = {
  kind: "dry" | "swamp" | "lake";
  depth: number;
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
  /** What is standing on this ground, and how deep it is. The difference
   * between the two wet kinds is depth and nothing else, which is exactly
   * what it is in the world: a SWAMP is water shallow enough to see the
   * bottom of, grow reeds out of and drive through; a LAKE is water that is
   * not. Everything that plants at a waterline reads this. */
  wetlandAt: (x: number, z: number) => Wetland;
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
  // R40 — the country the dials are read against: how flat the ice, or
  // the sun, has worn it, whether its hollows hold water, and whether the
  // wind has piled sand across it.
  const B = biomeRules(knobs.biome);
  const L = B.land;
  // How hard the country's own relief is turned up, and how much of it
  // stands under water — the `elevation` and `water` dials reach the world
  // beside the road here, exactly as they reach the road itself. A dry
  // country has no ponds to dial: its water knob still reaches the route
  // (R35's setbacks) and nothing else.
  const relief = knobScale(knobs.elevation, R.elevation.knob) * L.relief;
  const ponds = B.water ? knobScale(knobs.water, R.wet.ponds) : 0;
  // R34 — the one number that says which country this is, drawn from the
  // seed inside the band the `steepness` dial opens. The dial moves the
  // BAND and the seed picks the position in it, so a stage is still set
  // somewhere: what the dial says is which countries a seed may land in,
  // not which country this one is.
  const smoothness = rng.range(
    knobScale(knobs.steepness, { min: G.smoothness.min, max: G.steep.sharp.min }),
    knobScale(knobs.steepness, { min: G.smoothness.max, max: G.steep.sharp.max }),
  );
  // ...and how big the relief that country holds is. Sharp country stands
  // its steps and its crests higher as well as steeper — the same fault the
  // ice would have worn into a hillside is a cliff where it did not.
  const rise = knobScale(knobs.steepness, G.steep.rise);
  // The ice took the fine grain with it, worked the sharp crests into
  // whalebacks, and wore the fault steps back into slopes.
  const grainAmp = G.bedrock.grain.amp * (1 - G.grain.planed * smoothness);
  const peak =
    G.bedrock.mountain.height *
    rise *
    L.mountains *
    (G.mountain.tall - G.mountain.planed * smoothness);
  const escRise = G.bedrock.escarpment.rise * rise;
  const escSpan =
    G.bedrock.escarpment.span.min +
    (G.bedrock.escarpment.span.max - G.bedrock.escarpment.span.min) * smoothness;

  /** R40 — THE DUNES, where the country has them: wind-blown sand lying on
   * the rock as a ridged field. One bearing for the whole stage — one
   * prevailing wind piled all of it — and the ridges run ALONG it, several
   * times longer than they are wide, so a road crossing the wind meets
   * them as a washboard of brows and a road running with it rides a crest
   * for hundreds of metres. A slow mask says where the sand sea is at all;
   * between its fields the country is bare pan.
   *
   * Drawn AFTER the taiga's own draws, and only in a country with dunes, so
   * the rng sequence every existing seed was built on is untouched. */
  const D = L.dunes;
  const duneBearing = D ? rng.range(0, Math.PI * 2) : 0;
  const duneCos = Math.cos(duneBearing);
  const duneSin = Math.sin(duneBearing);
  const duneAt = (x: number, z: number): number => {
    if (!D) return 0;
    const mask = smooth(
      clamp01((valueNoise(x, z, D.field, noiseSeed + 61) - DUNE_FIELD_FROM) / DUNE_FIELD_SPAN),
    );
    if (mask <= 0) return 0;
    const along = x * duneCos + z * duneSin;
    const across = -x * duneSin + z * duneCos;
    const n = valueNoise(along / D.stretch, across, D.scale, noiseSeed + 67);
    // Ridged: the fold of the noise is the crest, and the smoothstep rounds
    // the slip face off into something a car can take at speed.
    return mask * D.amp * smooth(1 - Math.abs(2 * n - 1));
  };

  /** R40 — THE PANS. A country with no water has hollows that never fill;
   * they silt up flat instead, and this flattens the rock into them. A
   * soft knee rather than a clamp, for the same reason the pits are
   * blended rather than clamped: a `Math.max` creases where the two
   * surfaces cross, and the crease is a step in the ground nothing else
   * knows about. Quadratic across the knee, so the slope runs continuously
   * from the hillside down onto the flat. */
  const panFloor = L.floor === null ? null : LAKE_Y + L.floor;
  const onPan = (rock: number): number => {
    if (panFloor === null) return rock;
    const over = rock - panFloor;
    if (over >= PAN_KNEE) return rock;
    if (over <= -PAN_KNEE) return panFloor;
    return panFloor + ((over + PAN_KNEE) * (over + PAN_KNEE)) / (4 * PAN_KNEE);
  };

  /** Everything both the rock and the water table are made of, evaluated
   * once. `broad` is the country without its detail — the shape the water
   * table follows — and `face` is how steep the point is, read straight off
   * the shaping functions rather than measured with a gradient. */
  const layers = (
    x: number,
    z: number,
  ): { rock: number; broad: number; face: number; sheer: number; sunk: number } => {
    const swell = (valueNoise(x, z, G.bedrock.swell.scale, noiseSeed) - 0.5) * G.bedrock.swell.amp;
    const H = G.bedrock.hills;
    const hillRaw = valueNoise(x, z, H.scale, noiseSeed + 7);
    const hills = (hillRaw - 0.5) * H.amp;
    // ...and how steep the hills are HERE, differenced rather than read off
    // a shaping function, because value noise has none to read. See
    // `hills.grade`: this is the only gradient the module pays for and the
    // soil model does not work without it.
    const hx = (valueNoise(x + H.grade, z, H.scale, noiseSeed + 7) - hillRaw) / H.grade;
    const hz = (valueNoise(x, z + H.grade, H.scale, noiseSeed + 7) - hillRaw) / H.grade;
    const roll = clamp01((Math.hypot(hx, hz) * H.amp * relief) / H.steep);
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
    // fill because their floors are under the lake table. A dry country
    // has none: nothing was ever gouged, because nothing was ever going to
    // fill it.
    const b = G.bedrock.basin;
    const seaMask = B.water
      ? smooth(
          clamp01(
            (valueNoise(x, z, b.scale, noiseSeed + 23) - (b.from - ponds * b.wetter)) / b.span,
          ),
        )
      : 0;
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

    const rock = onPan(
      (swell + hills + grain + mountain + esc * escRise) * relief - sunk + G.bedrock.datum,
    );
    // The water table follows the land without its detail: the swell and
    // the mountains, and nothing finer. That is what puts a mire in a
    // hollow the broad shape does not know about.
    const broad = onPan((swell + mountain) * relief - sunk + G.bedrock.datum);
    // How steep it is here, 0..1, and it comes in TWO strengths because two
    // rules ask it and they are not asking the same question.
    //
    // `face` is all of the slope there is — a mountain's flank, an
    // escarpment's step and the side of an ordinary hill. That is what
    // strips SOIL: till is deposited by water slowing down, and water does
    // not slow down on a hillside either.
    //
    // `sheer` leaves the hills out. It is what says the ground is too steep
    // to HOLD WATER, and a hill is not: a hollow on a broad rise still
    // gathers a mire in it, and the pond at the bottom of a sloping field
    // is the most ordinary water there is. Handing the pits the full face
    // shuts them off over most of a hilly country, and what is left is the
    // deep sea basins — a map whose every shoreline drops away too steeply
    // for a car to drive back out of.
    //
    // The max and not the sum, in both: a hillside on a mountain flank is
    // scoured once.
    const flank = mask * 4 * crest * (1 - crest);
    const step = 4 * esc * (1 - esc);
    const sheer = clamp01(Math.max(flank, step));
    const face = clamp01(Math.max(sheer, roll));
    return { rock, broad, face, sheer, sunk };
  };

  /** THE PITS — how far the ground is cut BELOW THE WATER TABLE here, m, and
   * therefore how deep the water standing in it is. Zero on dry ground.
   *
   * A pit is cut toward the table rather than by a fixed depth from the
   * surface, because that is what a hollow holding water actually is: the
   * ground goes down, the groundwater does not, and the difference fills.
   * It is what makes a wide, barely-cut pit a SWAMP and a narrow, deeply cut
   * one a tarn, out of the same mechanism.
   *
   * Two gates keep the pits where water could be. Steep ground DRAINS — a
   * hollow on a mountainside empties out of its own downhill side — and high
   * ground is above the table entirely, so a pit gouged into it is a dry
   * crater. Both fade rather than switch, so a shoreline is a gradient of
   * shallowing water and not a drawn line. */
  const pitAt = (
    x: number,
    z: number,
    rock: number,
    face: number,
  ): { t: number; full: number; rim: number } => {
    const P = G.pits;
    const none = { t: 0, full: 0, rim: 0 };
    // R40 — no groundwater, no pit: a hollow in a dry country is a pan.
    if (!B.water) return none;
    // Flat, and low. Above `lowland` metres over the lake table there is no
    // groundwater to fill anything. Gated on the ROCK rather than on the
    // finished surface, which would need the soil, which needs the pit's own
    // rim — the soil is at most a few metres and the gate fades over tens,
    // so nothing is lost by asking the layer underneath.
    const flat = 1 - clamp01(face / P.flat);
    if (flat <= 0) return none;
    const lowland = 1 - clamp01((rock - LAKE_Y) / P.lowland);
    const holds = flat * lowland;
    if (holds <= 0) return none;
    const open = ponds * P.wetter;
    let strength = 0;
    let full = 0;
    let rim = 0;
    const cut = (
      pit: { scale: number; from: number; span: number; depth: number },
      salt: number,
    ): void => {
      const t = smooth(
        clamp01((valueNoise(x, z, pit.scale, noiseSeed + salt) - (pit.from - open)) / pit.span),
      );
      if (t <= 0) return;
      // The three take the DEEPEST rather than the sum: a tarn inside a mere
      // is a tarn, not a tarn plus half a metre. Summing them also makes
      // every overlap deeper than any pit was authored to be, which is how a
      // landscape ends up with one enormous hole in it.
      if (t * pit.depth > strength * full) {
        strength = t;
        full = pit.depth;
      }
      // ...and the RIM, which is where the ground tips into the hollow.
      // `t(1-t)` peaks exactly on the shoulder of the smoothstep, which is
      // the same free-derivative trick the mountain flanks use.
      rim = Math.max(rim, 4 * t * (1 - t));
    };
    cut(P.mere, 41);
    cut(P.tarn, 43);
    cut(P.pool, 47);
    return { t: strength * holds, full, rim: rim * holds };
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

  /** The finished ground at a point: the layers, then the pit cut into
   * them. Everything reads this, because the order is the whole of the
   * model — the pit's RIM is a slope, and a slope is scoured, so the soil
   * has to be computed knowing where the rims are or the analysis quite
   * correctly reports two metres of till lying down the side of every tarn
   * on the map. */
  const finish = (
    x: number,
    z: number,
  ): { rock: number; soil: number; surface: number; broad: number; face: number } => {
    const { rock, broad, face, sheer } = layers(x, z);
    // `sheer` and not `face`: what stops a hollow holding water is a
    // mountainside, not a hill (see `layers`).
    const pit = pitAt(x, z, rock, sheer);
    const steep = Math.max(face, pit.rim);
    // R40 — the sand is SOIL: it lies on the rock like till does, it is
    // what a cactus roots in, and it buries the stone under it exactly as
    // a metre of till buries a boulder field.
    const soil = soilOf(x, z, rock, broad, steep) + duneAt(x, z);
    const dry = rock + soil - G.soil.datum;
    // The pit is BLENDED in, not clamped. `Math.min(dry, floor)` looks like
    // the same thing and is not: a min of two surfaces creases where they
    // cross, and the crease is a cliff whose position has nothing to do with
    // the pit's own rim — so the soil model cannot know to strip the soil
    // off it, and the analysis quite rightly reports till lying down the
    // side of every tarn on the map. Sinking the ground by the pit's own
    // smoothstep instead keeps the derivative bounded and puts the steepest
    // ground exactly where `rim` says it is.
    const floor = LAKE_Y - pit.full;
    const surface = pit.t > 0 ? dry - Math.max(0, dry - floor) * pit.t : dry;
    return { rock, soil, surface, broad, face: steep };
  };

  /** Everything above works in COUNTRY space — the seed's landscape, at
   * the coordinates its own noise is written in. The stage is then sited
   * somewhere in it (below), and the public field reads through that
   * offset, so the world the game sees has its origin on ground a stage
   * can start from. */
  const rawGround = (x: number, z: number): GroundSample => {
    const { rock, soil, surface, broad, face } = finish(x, z);
    const W = G.groundwater;
    // Steep ground drains: the table drops away under a flank far faster
    // than it does under a flat. In a dry country it is tens of metres
    // down everywhere and never surfaces at all.
    const table = B.water
      ? Math.max(LAKE_Y, broad - (W.depth + W.drain * face))
      : LAKE_Y - ARID_TABLE;
    return { bedrock: rock, soil, surface, table };
  };

  /** R35 — where in the country this stage stands.
   *
   * The stage's origin is not chosen by anything: the route search draws
   * outward from (0, 0), and the start apron is laid on it before any rule
   * gets a say. So it is the COUNTRY that moves. The origin walks a spiral
   * until the whole footprint a start needs stands clear of the water, and
   * every query below is answered from there.
   *
   * The dryness test is the ground against its own local groundwater
   * table, which is the same number the pour in `water.ts` settles a lake
   * to — so a site that passes here is a site the pour will leave dry,
   * without this having to run a pour of its own to find out.
   *
   * No rng: a seed's landscape is exactly the landscape it always was, and
   * only the window onto it moves. */
  const site = ((): { x: number; z: number } => {
    const S = G.siting;
    /** How far the WORST point of the footprint stands clear of the water
     * under it, m. Negative anywhere wet; the biggest value wins, so a
     * country with nowhere dry still gets its driest spot rather than
     * failing. */
    const buildable = (ox: number, oz: number): number => {
      let worst = Infinity;
      for (let r = 0; r <= S.rings; r++) {
        const radius = (S.reach * r) / S.rings;
        const points = r === 0 ? 1 : S.ring;
        for (let a = 0; a < points; a++) {
          const angle = (a / points) * Math.PI * 2;
          const g = rawGround(ox + radius * Math.cos(angle), oz + radius * Math.sin(angle));
          const clear = g.surface - Math.max(LAKE_Y, g.table) - S.freeboard;
          if (clear < worst) worst = clear;
        }
      }
      return worst;
    };
    let best = { x: 0, z: 0 };
    let bestClear = buildable(0, 0);
    if (bestClear >= 0) return best;
    // A spiral of whole steps: rings of increasing radius, each walked in
    // the same fixed order, so the first site that passes is a property of
    // the country alone.
    for (let radius = S.step; radius <= S.far; radius += S.step) {
      const points = Math.max(6, Math.round((2 * Math.PI * radius) / S.step));
      for (let a = 0; a < points; a++) {
        const angle = (a / points) * Math.PI * 2;
        const ox = radius * Math.cos(angle);
        const oz = radius * Math.sin(angle);
        const clear = buildable(ox, oz);
        if (clear >= 0) return { x: ox, z: oz };
        if (clear > bestClear) {
          bestClear = clear;
          best = { x: ox, z: oz };
        }
      }
    }
    return best;
  })();

  const groundAt = (x: number, z: number): GroundSample => rawGround(x + site.x, z + site.z);
  const surfaceAt = (x: number, z: number): number => finish(x + site.x, z + site.z).surface;

  return {
    groundAt,
    surfaceAt,
    soilAt: (x, z) => finish(x + site.x, z + site.z).soil,
    wetAt: (x, z) => {
      const g = groundAt(x, z);
      return Math.max(0, g.table - g.surface);
    },
    wetlandAt: (x, z) => {
      const depth = LAKE_Y - surfaceAt(x, z);
      if (depth <= 0) return { kind: "dry", depth: 0 };
      return { kind: depth < G.pits.swamp ? "swamp" : "lake", depth };
    },
    smoothness,
  };
}
