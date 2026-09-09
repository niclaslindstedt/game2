// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R31 — THE CONE OVER THE ROAD, and the earthworks that hang off it. A
// rally car spends half a stage off the road and the one thing it must
// always be able to do is come back, so the landscape does not get the
// last word next to a road: the ground is CUT to a cone opening upward off
// the road's own underside, flat inside the bench and climbing no faster
// than the wheels can take outside it, and let go again once the country
// has been reached.
//
// Everything about the SHAPE of that — the per-side bench grade (R34), the
// jump lips the corridor has to reach past, the fill's run-out and the
// cut's, the fade that hands the last of it back to the country, and the
// ceiling any one road sample imposes — is settled here, once per stage,
// before anything asks the field for a height. `terrain.ts` puts the
// answers to work; `terrain-index.ts` carries the cone into the nearest-
// sample search, because settling it twice is what a query this hot cannot
// afford.

import { createRng } from "../lib/prng.ts";
import { smooth, valueNoise } from "../lib/noise.ts";
import type { Track } from "./compile.ts";
import { biomeRules } from "./biomes.ts";
import { createLandField } from "./land.ts";
import { GROUND_CELL, TILE_SINK } from "./lattice.ts";
import { ROAD_CROSS, vergeOffset } from "./road.ts";
import { knobScale, STAGE_RULES as R } from "./rules.ts";
import { SPUR_INDEX_REACH } from "./spur-index.ts";
import { type SpurLine } from "./spurs.ts";
import { tunnelTrench } from "./solids.ts";
import { clamp01 } from "./terrain-streams.ts";
import type { RibbonSample } from "./terrain-index.ts";

export type Cone = ReturnType<typeof createCone>;

/** Settle the cone for one stage. Deterministic in the track seed — and
 * the first two draws off it are taken here, so everything downstream
 * keeps the stream position it has always had. */
export function createCone(track: Track) {
  const samples = track.samples;
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  // The bare landscape draws the first of these for itself (land.ts); it
  // is still taken from the stream here so everything after it keeps the
  // seed it has always had.
  rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // The bare landscape the road was laid across (land.ts) — the same
  // country the branch builder steered by, so nothing here can disagree
  // with where the water is.
  const land = createLandField(track.seed, track.knobs, track.climate);
  const farField = land.heightAt;
  // R40 — the country: its quilt, its loose surface, what its woods shed.
  const biome = biomeRules(track.knobs.biome);

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  //
  // R34 — the two sides are ONE number read twice, with opposite signs, and
  // that is the whole rule. A road laid across a slope is BENCHED into it:
  // cut on the uphill side, filled on the downhill, because that is the
  // cheapest way to get a level road onto a hillside and it is what every
  // mountain road on earth looks like. Drawing the two sides independently
  // — which is what this did — puts them both uphill about half the time,
  // and at the top of the steepness dial half a stage came out walled in on
  // both sides for four hundred metres at a stretch. That is not a cutting,
  // it is a tunnel with the lid off.
  //
  // A THROUGH-CUT, rock standing up both sides at once, is still built: it
  // is what `tilt` is for, and it happens where the hillside is levelling
  // off and the country either side of the road is high anyway. It comes
  // out short, which is exactly what a through-cut is — you pass through
  // one, you do not drive down it.
  //
  // `steepness` scales the RISING half and only that half: how steep the
  // hillside the road is cut into stands is what the dial was asked about;
  // how far a car that goes over the other edge falls is not.
  const sideLean = knobScale(track.knobs.steepness, R.geology.steep.bank);
  const sideGrade = (s: number, side: number): number => {
    const lean = (valueNoise(s, 0, 210, sideSeed) - 0.5) * 2;
    const tilt = -0.28 + valueNoise(s, 37.1, 330, sideSeed + 3) * 0.55;
    const raw = tilt + side * lean * 0.62;
    // R31, read the other way round: the FALLING side is a fill's own
    // slope, and a road's edge may fall away no harder than a car could
    // drive back up it. Drawn from the noise alone it reached 0.9 m per m,
    // and on a road standing thirty metres over a hollow the lattice
    // corners just past the lip fell metres below it — a face along the
    // outside of the embankment on every high fill of a dozen seeds.
    return raw > 0 ? raw * sideLean : Math.max(raw, -VERGE_CLIMB);
  };

  const half = track.width / 2;
  const shelfEnd = half + ROAD_CROSS.reach; // the ribbon's own outer edge
  const SHELF_END2 = shelfEnd * shelfEnd;
  /** How far past the nominal edge a lip has to stand to be a junction
   * mouth's FLARE (R17) rather than R33's gravel wander, m — a quarter of
   * the road: the wander is under a fifth, the flare a whole one. */
  const FLARE_LIP = track.width * 0.25;
  /** How far out the corridor shapes the ground beside the sample at
   * `index`, m: the widest the mat gets within a few samples of it, plus
   * the verge.
   *
   * An ENVELOPE rather than the sample's own width, because the corridor is
   * found by the nearest CENTERLINE point while the lip is a question about
   * the mat: at a junction's mouth the road opens by half its width in one
   * two-metre step (R17), so a probe standing at a wide sample's lip is
   * often nearest to a narrow one alongside — and the ground then hands
   * over inside the ribbon, which is a face along the outside of the mouth.
   * Taking the widest can only ever level a little more ground than the mat
   * needs, and a little more flat ground beside a junction is what a
   * junction has. */
  const LIP_ENVELOPE = 4;
  const lipAt = (index: number): number => {
    let widest = 0;
    const lo = Math.max(0, index - LIP_ENVELOPE);
    const hi = Math.min(samples.length - 1, index + LIP_ENVELOPE);
    for (let i = lo; i <= hi; i++) {
      // R17 — how far the mat REACHES, not how wide it is: a mouth opens on
      // one side, so its far edge stands `shift + width / 2` out and the
      // shelf has to be under all of it.
      const reach = 2 * Math.abs(samples[i].shift ?? 0) + samples[i].width;
      if (reach > widest) widest = reach;
    }
    // Never NARROWER than the nominal corridor. A gravel road wanders
    // either side of nominal all the way down a stage (R33), and letting
    // the shelf breathe in and out with it would move the ground beside
    // every metre of every road to buy nothing — the wander is centimetres
    // and the verge already absorbs it. What this exists for is the mouth,
    // which is metres, so it only ever reaches further OUT.
    return Math.max(shelfEnd, widest / 2 + ROAD_CROSS.reach);
  };
  /** How far from the road the corridor still shapes the ground, m — see
   * rawHeight; inside the sample grid's own search reach on purpose. */
  const CORRIDOR_RANGE = 140;

  /** How far past a branch's own corridor its shelf is still the branch's,
   * m — the whole of the branch index's search reach less the widest
   * corridor a branch has and a cell of slack, because a shelf still
   * standing where the index stops finding the branch ends at a cell
   * boundary instead of where it means to. As long as it can be, so a
   * fill's run-out has landed on the country long before it is let go. */
  const SPUR_BLEND = SPUR_INDEX_REACH - R.roadWidth.max / 2 - ROAD_CROSS.reach - GROUND_CELL / 2;
  /** Where a fill's side has LANDED on the country by, m off the route's
   * centerline: the road's reach, so nothing is left for `letGo` to bring
   * down. */
  const LAND_BY = CORRIDOR_RANGE;
  /** The country under the route's centerline at each sample, m — read
   * once per sample and kept, because a fill's side is sized off it under
   * every height beside the road (`fillGrade`). Grown as the samples are
   * (endless), so a plain array rather than a typed one. */
  const groundUnder: number[] = [];
  const groundUnderAt = (index: number): number => {
    let g = groundUnder[index];
    if (g === undefined) {
      const s = samples[index];
      g = farField(s.x, s.z);
      groundUnder[index] = g;
    }
    return g;
  };
  /** THE GRADE A FILL'S SIDE FALLS AT, m per m, for the sample at `index`
   * seen from `d` metres off where the country stands at `far`: the verge
   * grade (R31 the other way round — a car could drive back up it), and
   * steeper only where the country itself falls away from under the road
   * so fast that a side at the verge grade would never land on it.
   *
   * An embankment's side has to MEET the ground: seed 10's road stood
   * twenty-two metres over a hillside falling at half a metre per metre,
   * and a side falling at the verge's 0.45 ran parallel to that hillside
   * for as far as the road could be found, then dropped the whole twenty
   * metres at the seam where it could not — the analysis's 55° wall. So
   * the side is sized to land by `LAND_BY`: the country's own fall from the
   * road to here (`hill`, read off the ground under the centerline and the
   * ground at this point) plus what it takes to close the fill's height
   * over that run. On level country that is the verge grade for any fill
   * under forty metres; on a hillside it is the hillside's grade and a
   * little, which is what a fill laid on a hillside stands at. */
  const fillGrade = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    const g0 = groundUnderAt(index);
    const hill = Math.max(0, (g0 - far) / Math.max(d, R.verge.bench));
    const land = landingGrade(s.elevation - g0 + hill * LAND_BY, LAND_BY - lip);
    // ...and no steeper than a car can climb over and above the hillside's
    // own fall: a fill too tall to land by the reach at that is landed by
    // `letGo`'s bound, which is the same grade, rather than by a face.
    return Math.max(VERGE_CLIMB, Math.min(hill + CLIMBABLE, land));
  };
  /** THE CREST: how far a fill's side has fallen `past` metres off the lip
   * on its way to falling at `grade`. Level at the lip and steepening evenly
   * over `verge.crest` metres until it has reached the grade, straight at
   * the grade from there — the kink the lattice cannot draw, rounded
   * (rules.ts). The one shape every fill has, whichever road's it is and
   * whichever side it is read from. */
  const CREST: number = R.verge.crest;
  const fillDrop = (past: number, grade: number): number => {
    if (past <= 0) return 0;
    return past < CREST ? (grade * past * past) / (2 * CREST) : grade * (past - CREST / 2);
  };
  /** ...and the grade a fill has to fall at to have dropped `drop` metres
   * by `run` metres off the lip THROUGH that crest — `fillDrop` solved for
   * the grade. The crest spends its run getting up to speed, so the grade
   * is steeper than `drop / run` by the half of it. */
  const landingGrade = (drop: number, run: number): number =>
    run > CREST ? drop / (run - CREST / 2) : (2 * drop * CREST) / (run * run);
  /** A branch's own corridor edge, m off its centerline — the ribbon and
   * the verge. A branch is never banked, so its cross-section is symmetric
   * and the unsigned distance is the whole story. */
  const spurEdge = (spur: SpurLine): number => spur.width / 2 + ROAD_CROSS.reach;
  /** THE END OF A ROAD'S REACH, where the road stops being found and its
   * earthworks stop with it: whatever still stands over or under the
   * country there is brought back onto it at `verge.climbable`, the
   * steepest a road may build. `room` is how far off the country the
   * earthworks may still stand this far short of the reach — nothing at
   * the reach itself, so there is no seam to find — and inside it the
   * run-out is the run-out, untouched.
   *
   * A fill lands on the country at its own grade and a cut climbs back onto
   * it at its own: the line is the run-out, and it needs no easing. Eased
   * toward the country from the lip, as every run-out here once was, the
   * easing ADDED its grade to the line's: a smoothstep over a hundred and
   * ten metres releases up to one and a half per cent of the height it is
   * still holding per metre, which on a thirty-metre fill is another 0.4 on
   * top of the verge grade — and with the corridor's own ease onto the
   * line on top of that, seed 9's embankment fell at 48° for twenty metres.
   * Every one of the three was a climbable grade on its own. A smoothstep
   * over the LAST forty metres only was the next answer, and it did the
   * same to whatever had not landed by then — a branch on a sixty metre
   * fill over a basin (seed 9 again). A bound has no grade of its own. */
  const letGo = (shaped: number, far: number, d: number, reach: number): number => {
    const room = Math.max(0, reach - d) * CLIMBABLE;
    return Math.min(far + room, Math.max(far - room, shaped));
  };

  // ── R31: the rideable verge ───────────────────────────────────────────
  // A rally car spends half a stage off the road, and the one thing it must
  // always be able to do is come back. So the landscape does not get the
  // last word next to a road: whatever the country was doing there, the
  // ground is CUT to a cone opening upward off the road's own underside.
  // Inside the BENCH the cone is flat, which is what pins the ground
  // lattice under the tarmac; outside it the ground may climb, but only at
  // a grade the wheels can take.
  /** Radius of the flat bench, m, measured from a road's centerline. */
  const BENCH = Math.max(shelfEnd, R.verge.bench);
  /** R47 — how far past the lip the trench under a bore stays level. */
  const TRENCH = tunnelTrench(track.width);
  const BENCH2 = BENCH * BENCH;
  const VERGE_CLIMB: number = R.verge.climb;
  const CLIMBABLE: number = R.verge.climbable;
  /** R34 — how far out a CUT FACE may begin, m from the centerline. The
   * bench is one lattice cell diagonal, sized so every corner of a cell the
   * road crosses is pinned under it; the face has to start a whole cell
   * OUTSIDE that, because a corner just past the bench is still a corner
   * the bilinear ground under the corridor's own lip is interpolated from.
   * Start the face at the bench itself and a fourteen-metre rock wall lifts
   * the outermost vertex of the road mesh with it — R16's hand-over opens
   * back up into the vertical face down the side of the road it exists to
   * close. What it buys, besides being correct, is a car's worth of runoff
   * between the tarmac and the rock. */
  const CUT_FROM = BENCH + GROUND_CELL;

  /** How far a cone opens above its road's own underside at distance `d`,
   * m — R31's runoff out to `CUT_FROM`, then R34's face beyond it. Zero
   * inside the bench. One function, four callers (the ceiling walk, the
   * two `own` walks and the floor that takes the rise back off), because
   * a cone measured one way and undone another is a lip along the road. */
  const coneRise = (d: number, climb: number): number =>
    d <= BENCH
      ? 0
      : (Math.min(d, CUT_FROM) - BENCH) * VERGE_CLIMB + Math.max(0, d - CUT_FROM) * climb;
  /** R31 — where a cone LETS GO: how much of the ground it was cutting it
   * has given back at distance `d`, 0 at the start of the last `verge.fade`
   * metres of its reach and 1 at the reach. A cone is a min, and a min that
   * is simply not asked past its reach ends in a WALL — the country
   * standing however high it stands one query cell further out, ruled
   * dead straight along the lattice. Beside a mountain that was fifty
   * metres of vertical rock, two hundred metres from any road, on ground
   * no rule had touched. So over the fade the cone RISES TO MEET the
   * ground it is cutting, by this much of the excess that ground stands
   * over it: at the reach it stands exactly on the ground and there is no
   * seam to find, however high the mountain. A shoulder a few metres over
   * the cone is given back as a shoulder; a mountain is given back as a
   * face — and `cutAt` reads that face's grade off `fadeGrade` and calls it
   * rock where it is steeper than a car can climb (`verge.climbable`), so
   * the one thing this never builds is a grass hillside the car stops
   * against. A smoothstep, so the cone's own grade is C1 into the fade and
   * the fade's steepest point is one and a half times its mean. */
  const FADE = R.verge.fade;
  const fadeFrom = (reach: number): number => Math.max(BENCH, reach - FADE);
  const fadeWeight = (d: number, reach: number): number => {
    const from = fadeFrom(reach);
    return d <= from ? 0 : smooth(clamp01((d - from) / (reach - from)));
  };
  /** The grade a cone letting go stands the ground at, m per m, for an
   * excess of `over` metres at distance `d`: what is left of its own climb,
   * plus the fade's STEEPEST point — its mean over the fade, times the
   * smoothstep's peak — rather than the slope at this one point. The
   * point's own slope is exact for the analytic field and wrong for the
   * ground: a lattice cell spans a seventh of the fade, and a triangle
   * whose middle reads a gentle start has a corner on the steep part. The
   * peak is the face the whole band is, and the band is what gets called
   * rock. */
  const fadeGrade = (w: number, reach: number, climb: number, over: number): number =>
    (1 - w) * climb + (1.5 * over) / (reach - fadeFrom(reach));
  /** How far out the cone is still worth asking about, m. By here it stands
   * tens of metres over the road and binds on nothing but a cliff — and
   * where it does not bind, dropping it costs the query nothing. */
  const CONE_REACH2 = CORRIDOR_RANGE * CORRIDOR_RANGE;
  const FADE_FROM2 = fadeFrom(CORRIDOR_RANGE) ** 2;
  /** ...and how far a BRANCH's cone reaches, m: the distance its index is
   * guaranteed to find it within, so the cone has let go before the branch
   * can stop being found. */
  const SPUR_CONE_REACH = SPUR_INDEX_REACH;
  /** The route's cones caught LETTING GO on the last walk: each one's
   * height without the fade, how far it has let go (`fadeWeight`), and the
   * sample's own grade. The fade rises toward the ground the roads have
   * SHAPED at this point — a branch's shelf, a guard's mound — and that
   * ground is not known until `shapeAt` has built it, after the walk; so
   * the walk keeps the cones it cannot yet resolve and `fadeCeiling`
   * finishes them. Scratch, rewritten per query, and kept as a PARETO
   * FRONT: a cone standing no lower than another that has let go no
   * further can never end up under it, whatever the ground turns out to
   * be, so it is dropped on arrival. A road passing a hundred metres off
   * puts a couple of hundred samples in the fade, and the walk meets the
   * near ones first, so what survives is a handful — the lowest road at
   * each distance. */
  const fadeCone: number[] = [];
  const fadeW: number[] = [];
  const fadeClimb: number[] = [];
  let fadeCount = 0;
  const keepFade = (cone: number, w: number, climb: number): void => {
    let n = 0;
    for (let i = 0; i < fadeCount; i++) {
      if (fadeCone[i] <= cone && fadeW[i] <= w) return;
      if (fadeCone[i] >= cone && fadeW[i] >= w) continue;
      fadeCone[n] = fadeCone[i];
      fadeW[n] = fadeW[i];
      fadeClimb[n] = fadeClimb[i];
      n++;
    }
    fadeCone[n] = cone;
    fadeW[n] = w;
    fadeClimb[n] = climb;
    fadeCount = n + 1;
  };
  /** What `shapeAt` answered last: the country as the roads shaped it, the
   * ceiling R31 holds it under, and what the cone was doing where it binds
   * — the grade the road it is beside was cut at (R34), and the grade a
   * cone letting go stands the ground at (`fadeGrade`, zero where none
   * binds) — which is what `cutAt` reads rock off. One record rewritten
   * per query rather than one allocated, because this is under every
   * height the field answers. */
  const shape = { raised: 0, ceiling: 0, cone: Infinity, ownClimb: 0, fadeGrade: 0 };
  /** How much of a point is a ROAD's ground rather than the country's: 1
   * inside a corridor, spent one ground cell past its lip. That reach is
   * the same argument R31's bench is built on — a lattice triangle spans a
   * cell, so a corner within a cell of the corridor is one a triangle can
   * carry straight across the road, and a corner the far cone hollowed out
   * takes the road's own edge down with it. */
  const holdOf = (d: number, edge: number): number => 1 - smooth(clamp01((d - edge) / GROUND_CELL));
  /** R31 — the fade resolved: the lowest the route's cones stand once each
   * has risen toward `ground` by its own fade. `ceiling` is the min over
   * the cones NOT in the fade (already final). Writes the grade the winning
   * fade stands the ground at into `shape.fadeGrade` — zero when a cone
   * outside the fade wins, or when nothing stands over the fade. */
  const fadeCeiling = (ceiling: number, ground: number): number => {
    let grade = 0;
    for (let i = 0; i < fadeCount; i++) {
      const cone = fadeCone[i];
      const over = ground - cone;
      const w = fadeW[i];
      const here = over > 0 ? cone + w * over : cone;
      if (here < ceiling) {
        ceiling = here;
        grade = over > 0 ? fadeGrade(w, CORRIDOR_RANGE, fadeClimb[i], over) : 0;
      }
    }
    shape.fadeGrade = grade;
    return ceiling;
  };
  /** How much further than the nearest road a corridor may be and still
   * count as the road this point is BESIDE, m — see `Near.own`. Comfortably
   * over the sample spacing, so a corner's whole neighbourhood is in; well
   * under R23's `roadClear`, so a second road never is. */
  const LOCAL_CONE = 8;

  /** The underside of a road's corridor at one sample: where the OUTER
   * VERGE sits — the lowest line anything drawn there stands on — sunk by
   * the tile clearance. Measured level, because the bank that tilts it is
   * carried by the plane the cone is evaluated on; taking the low side's
   * height as a flat ceiling instead would cut a metre of trench along the
   * high side of every banked corner. A bridge DECK stands over a ravine on
   * purpose and pins nothing. */
  // R47 — a bored sample cuts nothing: the country stands over it.
  const ceilingOf = (shape: RibbonSample): number =>
    shape.deck != null || shape.tunnel
      ? Infinity
      : shape.elevation + vergeOffset(ROAD_CROSS.reach, shape.lift, 0) - TILE_SINK;
  return {
    rng,
    sideSeed,
    land,
    farField,
    biome,
    sideGrade,
    half,
    shelfEnd,
    SHELF_END2,
    FLARE_LIP,
    lipAt,
    CORRIDOR_RANGE,
    SPUR_BLEND,
    LAND_BY,
    groundUnderAt,
    fillGrade,
    CREST,
    fillDrop,
    landingGrade,
    spurEdge,
    letGo,
    BENCH,
    TRENCH,
    BENCH2,
    VERGE_CLIMB,
    CLIMBABLE,
    CUT_FROM,
    coneRise,
    FADE,
    fadeFrom,
    fadeWeight,
    fadeGrade,
    CONE_REACH2,
    FADE_FROM2,
    SPUR_CONE_REACH,
    fadeCeiling,
    keepFade,
    LOCAL_CONE,
    ceilingOf,
    holdOf,
    shape,
    resetFade: (): void => {
      fadeCount = 0;
    },
  };
}
