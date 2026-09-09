// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): THE GEOLOGY —
// the layered ground the stages are laid on, read by `geology.ts`. Spread
// into `STAGE_RULES` by `rules-book.ts`.

export const GEOLOGY_RULES = {
  /** R32 — THE GROUND, IN LAYERS. What the country beside the road is made
   * of, laid in the order it was made: rock, then the water in it, then the
   * soil on top. `geology.ts` builds the field; these are its numbers, and
   * every one of them is in meters unless it says otherwise.
   *
   * The single most important number here is `smoothness`. It is drawn per
   * seed rather than read off a dial, because it says which COUNTRY a stage
   * is in — how long the ice sat on it — and that is not a slider anybody
   * was asked about. At the low end the rock stands its mountains high and
   * keeps its fine grain; at the high end it is planed into filled valleys
   * with the grain gone. Whichever end, the rock is CURVES — a crest is a
   * whaleback and a fault step a worn slope — until the `steepness` dial
   * is turned past `steep.crease`, which is the one thing that opens a
   * knife-edge or a cliff. */
  geology: {
    /** How glacially planed a country may be, 0 (alpine) to 1 (shield).
     * Neither end is reached: a stage with no texture at all reads as a
     * heightmap, and one with nothing worn is a set of teeth.
     *
     * The band is what `steepness` moves (see `steep` below); the position
     * INSIDE it is still drawn from the seed, because a stage is set
     * somewhere and the dial only says which countries the seed may land
     * in. This pair is the worn end, held for `steepness` 0. */
    smoothness: { min: 0.5, max: 0.95 },

    /** R34 — where the `steepness` dial reaches into the rock.
     *
     * `sharp` is the smoothness band at the top of the dial: the ice barely
     * touched this country, so it keeps its crests, its fine grain and its
     * fault steps as cliffs. Reading between the two bands rather than
     * replacing one number with a dial is what keeps `smoothness` a
     * per-seed property — every dial position still builds a range of
     * countries, it just builds a different range.
     *
     * `rise` is the same dial on the SIZE of the relief, because sharp
     * country does not only hold its slopes steeper, it stands them
     * higher: the same escarpment the ice would have worn into a hillside
     * is a hundred-foot step where it did not. */
    steep: {
      sharp: { min: 0.08, max: 0.5 },
      rise: { min: 0.85, max: 1.45 },
      /** ...and the dial position past which the rock may be SHARP at all.
       * Everything the rock does is a curve — a whaleback crest, a fault
       * step worn back into a hillside — with two exceptions: the alpine
       * crest, the fold of the ridge noise cubed, which is a knife-edge on
       * the 14 m ground lattice; and the escarpment drawn at the narrow
       * end of its span, which is a cliff. They are the sharp things the
       * country has, and they are opened by this dial and nothing else:
       * below `crease` no seed draws either, and above it both grow with
       * the dial AND with how far down the sharp band the seed's
       * smoothness fell, so the top of the dial draws a knife-edge along
       * every crest and a cliff along every fault on the seeds that came
       * out sharpest. Keyed to the dial rather than to the smoothness
       * alone because the midpoint of the dial reads into the sharp band,
       * and a sharp edge is a thing somebody has to have asked for. The
       * analysis's `ground.crease` holds the rest of the country to a
       * curve, and exempts only what this opened. */
      crease: 0.5,
      /** ...and how much steeper the ground BESIDE THE ROAD is allowed to
       * lean at the top of the dial — the per-side embankment grade in
       * `terrain.ts`, which is what actually stands a hillside up next to
       * the car. A multiplier on the rising half of the band only: the
       * falling half is a drop off the road's shoulder, and how far a car
       * that goes over the edge falls is not what this dial is about. */
      bank: { min: 0.8, max: 1.9 },
    },

    /** How much of the finest octave the ice planes off at full
     * smoothness — the grain that separates a weathered hillside from a
     * scoured one. */
    grain: { planed: 0.72 },

    /** The mountain's height band across the smoothness range: sharp
     * country stands its crests higher than the shield does, and the two
     * crest SHAPES (the fold cubed, against a parabola over the raw noise)
     * do the rest once `steep.crease` lets the first one in. */
    mountain: { tall: 1.3, planed: 0.5 },

    bedrock: {
      /** The broad swell of the country — the wave a stage crosses two or
       * three of. `amp` is peak to trough. */
      swell: { scale: 430, amp: 54 },
      /** Hills riding on it. This is the layer a DRIVER reads: the swell is
       * slower than a stage is long, and the grain is finer than a corner,
       * so a hill you crest and a hollow you drop into is this one and
       * nothing else. It is deliberately short and tall enough to hold a
       * real grade — a country whose only shape is its swell is the country
       * you can see clean across, which is a rare view even on a plain. */
      hills: {
        scale: 130,
        amp: 21,
        /** The step the hills' own GRADIENT is differenced over, m, and the
         * grade at which the ground it describes counts as fully scoured.
         *
         * This is the only derivative `geology.ts` pays for, and it is not
         * optional. Every other steepness term in the module comes free off
         * a smoothstep — a mountain flank, an escarpment face, a pit's rim
         * — but value noise hands back nothing, and the hills are the layer
         * that carries the grade a driver actually reads. Without it the
         * soil model cannot see the slopes it is supposed to strip, and the
         * analysis quite correctly reports two metres of till lying down
         * the side of every hill on the map. */
        grade: 26,
        steep: 0.55,
      },
      /** ...and the fine grain the ice takes away. */
      grain: { scale: 46, amp: 4.5 },
      /** Where a mountain chain stands (`from` is the share of the mask
       * below which there is none) and how high its crest gets. */
      mountain: { scale: 1150, from: 0.57, height: 72 },
      /** ...and where its crest RUNS. */
      ridge: { scale: 300 },
      /** The fault steps: a wandering line the ground drops over. `span`
       * is how much of the noise the step is spread across — narrow is a
       * cliff, wide is a hillside, and the `steepness` dial reads between
       * them (`steep.crease`): the worn end everywhere the dial has not
       * opened, because a cliff is a sharp edge somebody has to ask for. */
      escarpment: { scale: 520, from: 0.52, span: { min: 0.042, max: 0.22 }, rise: 15 },
      /** The sea basins: broad hollows sunk under the lake table. `wetter`
       * and `deeper` are what the `water` dial adds to each. */
      /** `wetter` and `deeper` are what the `water` dial adds. Both are
       * modest: `from` is a THRESHOLD ON AN AREA, so a tenth off it is a
       * large share of the map turning to sea, and at the top of the dial
       * the land has to still be land. */
      basin: { scale: 1600, from: 0.86, span: 0.34, depth: 30, wetter: 0.18, deeper: 20 },
      /** ...and the ponds, on a tighter scale — the tarns and lakes the
       * road runs past rather than over. Their rim is a SHORE the ground
       * lattice can curve: forty-five metres across, three cells. At half
       * that span the bank turned over inside two cells and folded 27° at
       * its top. Widened INWARD, like the tarn's — `from` holds, so no more
       * of the map is pond — with `depth` raised to keep what the noise
       * reaches of the band as deep as it was. */
      pond: { scale: 340, from: 0.9, span: 0.2, depth: 22, wetter: 0.05, deeper: 8 },
      /** Where sea level sits relative to the rock's own zero. */
      datum: -6,
    },

    /** The groundwater. The table is the broad shape of the land dropped by
     * `depth`, plus `drain` times how steep the ground is — steep ground
     * sheds its water and stands dry, flats and hollows hold theirs and go
     * to bog. Where the table comes up through the surface the ground is
     * WET, which is what a mire is. */
    groundwater: { depth: 4.5, drain: 42 },

    /** THE PITS — the hollows that hold standing water, and the whole
     * reason a landscape has lakes in it rather than only rivers.
     *
     * They come in three sizes because the water bodies they make are three
     * different things, and the difference is not scale but the SHAPE of
     * the hollow. A pit's floor is cut toward the water table, so how far
     * BELOW that floor lands is what decides what fills it:
     *
     *   `mere`  broad and barely under the table — a wide sheet of shallow
     *           water, which is a SWAMP. Reeds and sedge stand in it, you
     *           can see the bottom, and a car can wade it. The shallowest
     *           of the three and by far the widest.
     *   `tarn`  a few hundred metres across and properly deep — a lake.
     *   `pool`  small and deep: a kettle hole, a flooded quarry, the pond
     *           at the bottom of a field.
     *
     * `from` is the share of the noise below which no pit forms (so it sets
     * how much of the country is pitted), `span` how sharp the rim is, and
     * `depth` how far under the table a fully-formed floor sits.
     *
     * A pit only forms where the water table is ALREADY near the surface:
     * flat lowland. A hollow gouged into a mountainside drains, and one cut
     * on a summit is a crater. `flat` is how steep the ground may be before
     * it stops holding water, and `lowland` how far above the table the
     * ground may stand before pits fade out entirely, m. */
    pits: {
      mere: { scale: 620, from: 0.76, span: 0.22, depth: 0.55 },
      /** A tarn's rim is a SHORE, not a bank: forty metres across, which
       * is three ground cells and a curve the lattice can draw. At half
       * that span the shore turned over inside two cells and folded 27° at
       * its top on every tarn in the country. The span is widened INWARD —
       * `from` holds, so the footprint of water on the map is unchanged —
       * which puts the floor past where the noise reaches; `depth` is
       * raised to keep the middle of a tarn a lake. */
      tarn: { scale: 300, from: 0.8, span: 0.2, depth: 10 },
      pool: { scale: 110, from: 0.86, span: 0.09, depth: 4.5 },
      flat: 0.3,
      /** How far above the lake table the ground may stand before pits stop
       * forming, m. It is a SMALL number on purpose: the country's own datum
       * sits only a few metres over the table, so a generous reach makes
       * almost every flat hectare on the map eligible and a wet dial then
       * drowns the lot. Pits belong in the genuinely low ground. */
      lowland: 13,
      /** How much the `water` dial opens the thresholds. Small, because the
       * thresholds are the share of the map that is pitted and the dial is
       * multiplying an area: a tenth here is already the difference between
       * a stage with a tarn on it and a stage in an archipelago. */
      wetter: 0.06,
      /** Depth below the water table under which standing water is a SWAMP
       * rather than a lake, m: shallow enough to see the bottom of, to
       * grow reeds in, and to drive through. */
      swamp: 1.2,
      /** A rim narrower than this, m — its span across the noise times the
       * noise's own scale, over the smoothstep's peak slope — is a CUT
       * edge rather than a curve: a kettle hole's bank, which a 14 m ground
       * lattice can only ever draw as a fold. Such a pit says so
       * (`sharpAt`), and the analysis lets its bank fold. A pool's rim is
       * seven metres; a tarn's twenty-four; a mere's ninety. */
      sharpRim: 20,
    },

    /** R35 — SITING. Where in the country the stage's own origin lands.
     *
     * A stage starts at (0, 0) and no search chooses that point: the route
     * is drawn outward from it. So where the seed's country happens to put
     * a sea basin there, the start line is in a lake and every metre of
     * road leaving it is an embankment — which is what a stage looked like
     * on nearly half of all seeds before the country was allowed to move
     * under the stage instead.
     *
     * It is a SEARCH over the country, not a nudge: the origin walks out
     * along a spiral until it finds ground standing clear of the water
     * across the whole footprint a start needs, and the country is read
     * from there. Deterministic and rng-free, so a seed's landscape is the
     * same landscape it always was — sampled from a spot a stage can start
     * on. */
    siting: {
      /** How much dry ground the start needs around it, m — the apron, the
       * grid, and the run down to the first corner. */
      reach: 210,
      /** How far clear of the water that ground has to stand, m: the
       * road's own freeboard, plus enough that a shoreline is a view from
       * the grid rather than something the front row is parked in. */
      freeboard: 6,
      /** How far the origin may walk to find such a place, m, and in what
       * steps. A basin is a kilometre or two across, so the walk has to be
       * able to leave one; past `far` the country has no dry ground worth
       * the search and the driest spot found is taken. */
      step: 120,
      far: 2600,
      /** How many points the footprint is judged on: `rings` rings of
       * `ring` points out to `reach`. Enough to catch a shore cutting
       * across the apron, cheap enough to run a few hundred times. */
      ring: 8,
      rings: 3,
    },

    /** The soil lying on the rock. Till and washed sediment: it collects
     * where water slows down and is stripped where it does not, so the
     * flanks and the escarpment faces come out bare and the valley floors
     * come out deep. Trees need it, big rocks only surface where it is
     * thin, and bare rock carries moss and grass and nothing with a root. */
    soil: {
      /** Deepest the cover ever gets, m. */
      max: 3.2,
      /** How far below the country's broad shape counts as a full hollow,
       * m — the depth over which the till gets from thin to deep. */
      hollow: 14,
      /** The patchiness of the cover: its noise scale, and the least of it
       * a patch may keep, so nowhere is scoured to nothing by chance
       * alone. */
      patch: { scale: 210, min: 0.3 },
      /** The band over which the ground thins to bare rock above the
       * country's treeline (`BiomeLand.zones.treeline`, the height the ice
       * or the cold scoured it bare at), m. */
      alpine: { over: 40 },
      /** How much a glaciated country moves off its highs and into its
       * hollows, over and above what slope alone does. */
      glacial: 0.5,
      /** Subtracted from the surface so that adding a soil layer does not
       * raise the whole country by its own mean depth — the water table
       * and every number tuned against the old ground stay where they
       * were. Half of `max`, which is roughly what the cover averages. */
      datum: 1.6,
    },
  },
} as const;
