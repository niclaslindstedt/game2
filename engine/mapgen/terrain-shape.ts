// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROADS DID TO THE GROUND HERE. One question, asked under every
// height the field ever returns: at this point, how high has the nearest
// road's earthworks raised or cut the country, and what ceiling does R31's
// cone hold it under. The answer is the whole of the corridor — the
// ribbon's own cross-section, the shelf run out past its edge, the fill's
// slope and the cut's, the branch roads and the public ones, the aprons
// past both stage ends, the guards, the stands, the pads and the town
// bands — reduced to the scratch record `cone.shape`, rewritten per query
// rather than allocated.
//
// It reads the cone (`terrain-cone.ts`) for the shape and the index
// (`terrain-index.ts`) for which road is nearest; what it hands back is
// what `terrain-ground.ts` turns into ground.

import { smooth } from "../lib/noise.ts";
import type { Track } from "./compile.ts";
import type { GuardField } from "./guards.ts";
import { TILE_SINK } from "./lattice.ts";
import { corridorOffset, junctionFlat, junctionPlatformY } from "./road.ts";

import type { SpurIndex } from "./spur-index.ts";
import { clamp01 } from "./terrain-streams.ts";
import type { Cone } from "./terrain-cone.ts";
import type { SampleIndex, RibbonSample } from "./terrain-index.ts";
import type { PadField } from "./terrain-pads.ts";

export type Shaping = ReturnType<typeof createShaping>;

export function createShaping(
  track: Track,
  cone: Cone,
  index: SampleIndex,
  padField: PadField,
  world: {
    spurs: SpurIndex;
    guards: GuardField;
  },
) {
  const samples = track.samples;
  const { spurs, guards } = world;
  const { nearestSample } = index;
  const { padAt, platformAt } = padField;
  const { pads, platforms, bandHold } = padField;
  const { BENCH, CLIMBABLE, CORRIDOR_RANGE, FLARE_LIP, SPUR_BLEND, SPUR_CONE_REACH } = cone;
  const { TRENCH, VERGE_CLIMB, shelfEnd, sideGrade, spurEdge, farField, shape } = cone;
  const { ceilingOf, coneRise, fadeCeiling, fadeGrade, fadeWeight, holdOf, letGo, lipAt } = cone;
  const { fillDrop, fillGrade, landingGrade } = cone;
  const ribbonY = (s: RibbonSample, lateral: number, width: number): number =>
    s.elevation + corridorOffset(s, lateral, width);

  /** Which side of a road a point is on, never 0 — `Math.sign` would
   * collapse a dead-centre point's offset to zero along with its sign. */
  const sideOf = (lateral: number): number => (lateral < 0 ? -1 : 1);

  /** R17 — the junction platforms, as ground: inside one the corridor is a
   * single graded plane on the MAIN road's own slope, whichever road's
   * verge would otherwise have run through it. Returns the plane's height
   * there and how much of it applies (1 in the middle, fading over the
   * platform's rim), or null. Both carriageways were warped onto this same
   * plane when they were compiled, so nothing has to be reconciled here —
   * the ground simply agrees with the roads standing on it. */
  const apronAt = (x: number, z: number): { y: number; weight: number } | null => {
    let best: { y: number; weight: number } | null = null;
    for (const junction of track.junctions) {
      const weight = junctionFlat(junction, x, z);
      if (weight <= 0) continue;
      if (best && best.weight >= weight) continue;
      best = { y: junctionPlatformY(junction, x, z), weight };
    }
    return best;
  };

  /** The corridor's cross-section BEYOND ITS LIP, for the sample at `index`
   * seen from `d` metres off on the side `lateral` says: the embankment or
   * the cutting the road imposes, bounded by the country and eased back
   * onto it.
   *
   * `sideGrade` is a shape the road imposes — a cutting on the uphill
   * side, an embankment on the downhill one, drawn from noise rather than
   * measured off the land. Run out unbounded it is a hillside the road
   * invents — at seventy metres a third of a grade is twenty metres of
   * ground that is not there, and because it is keyed to whichever sample
   * happens to be NEAREST, two arms of a stage passing each other hand
   * adjacent lattice corners two different inventions: seed 19's junction
   * had 38.6 m of it beside 11.1 m, a twenty-eight metre cliff between two
   * corners fourteen metres apart, on ground whose real height was
   * seventeen. That is a wall the car falls off.
   *
   * A real cutting's face climbs until it reaches the natural ground and
   * then it is the natural ground; a real embankment's side falls until it
   * lands on it. So the bench is bounded BY the country on whichever side
   * it is working (R34): it can cut into it or stand out from it, but it
   * cannot carry on past it and keep going. */
  const shelfBeyond = (index: number, d: number, lateral: number, lip: number, far: number) => {
    const s = samples[index];
    let grade = sideGrade(s.s, lateral >= 0 ? 1 : -1);
    // R34 — a cut is only a cut where there is country to cut INTO. On a
    // side where the land stands BELOW the road there is nothing above it
    // to climb, and a rising grade drawn there is bounded by the far field
    // — fifty metres down on a high fill, the whole drop taken over the
    // blend below: a face along the outside of every embankment the noise
    // happened to draw as a cutting. Such a side is a fill's side whatever
    // the dice said, and falls at the fill's own slope until it lands on
    // the country — at LEAST that slope, not only where the dice drew a
    // rise: a side the noise drew level stands the bench out over a forty
    // metre drop for as long as the blend below lets it, and where the
    // noise crosses zero the line drops eighteen metres between two
    // samples.
    // ...and the other way round on the side the country stands OVER the
    // road: a side the noise drew as falling is no embankment there — a
    // fall bounded by the far field is the country itself from the lip,
    // and beside the next sample the noise draws a rise, so the ground
    // alternated between the cone and the cutting's bench, fifteen metres
    // apart, as the dice changed sign along the road. The land says which
    // side is the cut; the dice only say how steep.
    if (far < s.elevation) {
      // The fill: its side leaves the lip through the crest (`fillDrop`)
      // and falls at its own grade (`fillGrade`) until it lands, and the
      // toe is the crease where it does — let go only at the reach's end
      // (`letGo`), never eased toward the country from the lip.
      const fall = Math.max(-grade, fillGrade(index, d, lip, far));
      const embankment = s.elevation - fillDrop(d - lip, fall);
      return letGo(Math.max(embankment, far), far, d, CORRIDOR_RANGE);
    }
    // The cut: its bench climbs at the dice's grade until it meets the
    // country, and is eased up onto it from there. The cone is the ceiling
    // over all of this (R31/R34), so the ease's own grade is the cone's
    // business, and a face the cone binds on is a declared cutting.
    grade = Math.max(grade, 0);
    const embankment = s.elevation + (d - lip) * grade;
    const bounded = Math.min(embankment, far);
    const toFar = smooth(clamp01((d - lip) / 110));
    return bounded * (1 - toFar) + far * toFar;
  };

  /** The FILL the sample at `index` stands out over the country by, seen
   * from `d` metres off, eased back onto it the way `shelfBeyond` eases an
   * embankment — and `far` where the road stands at or under the country.
   * The one grade a fill has, whichever side it is read from: this is
   * asked of the OTHER arm, whose nearest sample can jump from one leg of
   * a bend to the other as the point moves, and a side read off that
   * sample (`sideGrade`) jumps with it, from a cutting's rise to an
   * embankment's fall — thirty metres of ground between two lattice
   * corners. */
  const fillBeyond = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    if (far >= s.elevation) return far;
    const grade = fillGrade(index, d, lip, far);
    const embankment = Math.max(far, s.elevation - fillDrop(d - lip, grade));
    return letGo(embankment, far, d, CORRIDOR_RANGE);
  };

  /** The CUT the sample at `index` takes out of the country, seen from `d`
   * metres off — its bench, level at the road, eased back up onto the
   * country the way `shelfBeyond` eases a cutting's side — and `far`
   * where the road stands at or over the country. Level rather than at the
   * other arm's own dice for the reason `fillBeyond` has one grade: the
   * arm's nearest sample, and the side it is read from, jump as the point
   * moves. */
  const cutBeyond = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    if (far <= s.elevation) return far;
    const toFar = smooth(clamp01((d - lip) / 110));
    return s.elevation * (1 - toFar) + far * toFar;
  };

  /** The landscape before any stream is cut through it, in its two halves
   * — the ground as everything above the cone shaped it, and the cone —
   * into `shape`. The min of the two is the height; the analysis wants
   * them apart, because a fold where the cone binds is a cutting's edge
   * and a fold where it does not is the country's own. */
  const shapeAt = (x: number, z: number): void => {
    const far = farField(x, z);
    const near = nearestSample(x, z);
    let base: number;
    /** The route's own shelf under this point, where the point is inside a
     * FLARED lip — the floor no cone may cut below there. `near.own` is the
     * corridor's OUTER VERGE, and at a junction's mouth the mat flares a
     * road's width past the verge line it was measured at, so the verge is
     * a metre under the mat the car is riding; an arm's cone reaching in
     * under the flare was cutting the shelf down to it. Only under a flare:
     * the mouth lies on the platform's one plane, where the ribbon sunk by
     * the tile clearance is a plane too. Under an ordinary mat the ribbon
     * is crowned, banked and twisting through the corner, and a lattice
     * held a tile's sink under THAT pokes through it between the corners —
     * there the verge's own level, carried on the bank's plane, is the
     * shelf, as it always was. */
    let ownShelf = -Infinity;
    /** Whether the point is under the route's own mat — inside its lip —
     * where the route owns the ground outright and no branch may raise it. */
    let onMat = false;
    // Past CORRIDOR_RANGE the road has no say. It is set to where the
    // sample grid's own search actually reaches: a range beyond the search
    // does not extend the road's influence, it just moves the point where
    // the influence stops being found — and a blend that has not finished
    // by then leaves a seam ruled along the search grid, which a shaded
    // relief render shows up as a hairline running across the country.
    if (!near || near.d > CORRIDOR_RANGE) {
      base = far;
    } else if (samples[near.index].tunnel) {
      // R47 — under a bore the lattice is a TRENCH: the corridor shelf at
      // road level out to the lip, held level for a bench past it
      // (`tunnelTrench` — so the ramp the straddling cell draws up to the
      // mountain starts outside the vault's walls, not through them), and
      // the bare mountain beyond, with no run-out between. The first cut
      // left the country over the bore untouched, and the lattice cell
      // that straddled a mouth then had one corner on the cutting and the
      // next on the mountain — a steep tile drawn ACROSS the road, which
      // read as a snow bank the car drove into. A shelf carried the whole
      // length of the bore keeps every tile along the road flat; the
      // mountain is drawn back over the trench by the lining as a lid
      // (tunnel.ts), and the whole trench is rock (`cutAt`).
      const s = samples[near.index];
      const lip = lipAt(near.index);
      if (near.d < lip + TRENCH) {
        base = ribbonY(s, sideOf(near.lateral) * Math.min(near.d, lip), s.width) - TILE_SINK;
        onMat = near.d < lip;
      } else {
        base = far;
      }
    } else {
      const s = samples[near.index];
      // R16 — the ribbon's own outer edge HERE, not the stage's nominal
      // one. A junction's mouth flares the mat well past nominal (R17) and
      // gravel wanders either side of it down the whole stage (R33); pin
      // the shelf at the nominal and the ground hands over while the ribbon
      // is still going, which is a vertical face along the outside of every
      // mouth on the map.
      const lip = lipAt(near.index);
      const corridorY =
        ribbonY(s, sideOf(near.lateral) * Math.min(near.d, lip), s.width) - TILE_SINK;
      if (near.d < lip) {
        base = corridorY;
        onMat = true;
        // A mouth's flare is a road's width; R33's gravel wander is under
        // a fifth of one, and is not a flare.
        if (lip > shelfEnd + FLARE_LIP) ownShelf = corridorY;
      } else {
        // The corridor's edge is the ribbon's — crowned, banked, sunk by
        // the tile — and the run-out starts from the sample's own level, so
        // the ease over the first few metres carries only the DIFFERENCE
        // between the two. Easing the whole level held the corridor's
        // height out over a line already falling at the verge grade and
        // then released it on top: the second of the three grades that
        // added up to seed 9's 48° (`letGo`).
        const shaped = shelfBeyond(near.index, near.d, near.lateral, lip, far);
        const off = smooth(clamp01((near.d - lip) / 26));
        base = shaped + (corridorY - s.elevation) * (1 - off);
      }
      // THE OTHER ARM'S FILL. The ground between two arms of the stage at
      // two heights is the nearer arm's out to the line where the other
      // becomes nearer — and there the higher arm's embankment, still a
      // dozen metres over the country, was simply dropped for the lower
      // arm's own cross-section: a step along that line, beside every
      // place the stage passes itself. So an embankment is carried until
      // it has come down to the ground, whichever arm is nearer: only its
      // FILL — what stands over the country — because a cut is the cone's
      // business and the cone is already a min over every arm in reach.
      if ((near.other >= 0 || near.deep >= 0) && near.d >= lip) {
        // The other arm's FILL and CUT, folded in as EARTHWORKS rather than
        // picked: what stands over the country is the larger of the two
        // arms' fills, what is taken out of it the deeper of their cuts,
        // and a fill built across a cutting stands on the cut ground. So
        // a road cut thirty metres into a hillside keeps its bench across
        // the line where a higher arm becomes nearer, instead of the
        // ground stepping up fifteen metres onto that arm's bench there,
        // and a higher arm's embankment is carried until it has come
        // down. Bounded by THIS road's own run-out — its verge falling
        // away at the grade a car could come back up (R31 the other way
        // round), which at the lip IS the corridor — so nothing reaches
        // in under the ground this road stands on, and the mat's edge is
        // never a step.
        const fillOther =
          near.other >= 0 ? fillBeyond(near.other, near.otherD, lipAt(near.other), far) - far : 0;
        const cutOther =
          near.deep >= 0 ? far - cutBeyond(near.deep, near.deepD, lipAt(near.deep), far) : 0;
        if (fillOther > 0 || cutOther > 0) {
          const fill = Math.max(base - far, fillOther, 0);
          const cut = Math.max(far - base, cutOther, 0);
          const runout =
            corridorY - fillDrop(near.d - lip, fillGrade(near.index, near.d, lip, far));
          base = Math.max(far + fill - cut, Math.min(runout, base));
        }
      }
    }
    // A branch is a road, and roads are built, not draped: its mat and the
    // bench climbing back onto the country past it are the CONE's business
    // below (R31 — the branch's own cone cuts the ground down to its shelf
    // and lets go toward the country at a declared grade), and what it
    // stands OVER the country on is the fill carried here. The nearest
    // branch used to cut the ground here as well, out to the midline with
    // the next road and then handed over in twelve metres: a route's bench
    // still twenty metres up dropped onto the branch's line across those
    // twelve metres (seed 3), and a branch cut deep into a hillside stood
    // a wall where its bench was let go before it had climbed back (seed
    // 22). The cone is a min over every branch in reach and declares the
    // face it cannot take up at a climbable grade (`cutAt`), which the
    // hand-over never did.
    //
    // THE TALLEST BRANCH'S FILL, carried whichever road is nearer — the
    // same earthworks the route's other arm gets above. The nearest branch
    // shapes the ground out to the midline with the next road and there
    // hands over, and where it stands on a fill the fill was simply
    // dropped: a branch twenty metres over a basin met a lower branch's
    // run-out at their midline as a twenty metre step (seed 10), and met
    // the route's ground the same way where the route was nearer. So what
    // stands over the country here is the highest fill of every branch in
    // reach, each run out from its own edge at a fill's grade (the verge
    // grade, or what it takes to land on a hillside falling away under it
    // — `fillGrade`'s rule, read off the country under the branch) — never
    // under the route's own mat, which owns its corridor outright, and let
    // go only at the reach's end. The cone is the ceiling over it, as over
    // everything.
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    if (spur && !onMat) {
      const tall = spurs.highest(x, z, VERGE_CLIMB, spurEdge);
      if (tall) {
        const edge = spurEdge(tall.spur);
        const past = tall.d - edge;
        const shelf = ribbonY(tall.sample, Math.min(tall.d, edge), tall.spur.width) - TILE_SINK;
        if (shelf > base && past < SPUR_BLEND) {
          const g0 = farField(tall.sample.x, tall.sample.z);
          const hill = Math.max(0, (g0 - far) / Math.max(tall.d, BENCH));
          const grade = Math.max(
            VERGE_CLIMB,
            Math.min(hill + CLIMBABLE, landingGrade(shelf - g0 + hill * SPUR_BLEND, SPUR_BLEND)),
          );
          const fill = letGo(shelf - fillDrop(past, grade), far, past, SPUR_BLEND);
          if (fill > base) base = fill;
        }
      }
    }
    // R39 — and a whole VILLAGE is graded level with its street, from under
    // the street's own mat out past the back gardens. Ahead of the lots'
    // own pads because it is the ground they are painted on: the band
    // decides the level, and a pad graded to the same street only agrees
    // with it.
    const platform = platforms.length > 0 ? platformAt(x, z, base) : null;
    /** The band's level here, weighted — a floor on the cone below, for the
     * reason a pad's is. */
    let platformFlat = -Infinity;
    let platformWeight = 0;
    if (platform) {
      platformFlat = platform.y;
      platformWeight = platform.weight * bandHold(platform.band, near, spur);
      base = platformFlat * platformWeight + base * (1 - platformWeight);
    }
    // R37 — a yard is graded flat, and the drive that runs onto it was
    // already eased onto its level, so the two agree where they overlap.
    const pad = pads.length > 0 ? padAt(x, z, base) : null;
    /** The pad's own level here, weighted — a floor on the cone below. */
    let padFlat = -Infinity;
    let padWeight = 0;
    if (pad) {
      padFlat = pad.y;
      padWeight = pad.weight;
      base = padFlat * pad.weight + base * (1 - pad.weight);
    }
    const apron = apronAt(x, z);
    if (apron) {
      const flat = apron.y - TILE_SINK;
      base = flat * apron.weight + base * (1 - apron.weight);
    }
    // R31 — and then the whole lot is CUT to the verge cone. Last, and
    // over the corner guards too, because it binds on everything above it:
    // the far field's mountains, the embankment's own grade, the blend
    // between them, a branch's shelf where the branch owns this ground, and
    // R14's mounds — a mound the car simply stops against is not a corner
    // that costs something to cut, it is a wall in the one place a car is
    // most likely to arrive sideways. Cut to the cone it is still a hill
    // worth going round. The cone is a min of continuous functions of
    // position, so this can only ever take ground AWAY: a valley, a ford's
    // dip and the ravine under a bridge are all still exactly as deep as
    // the landscape made them.
    // ...but a cone may not cut the ground out from under a road's OWN
    // CORRIDOR. The ceiling is a min over every corridor in reach, which is
    // right for the country between two arms of a stage — the lower one says
    // how high the ground between them may stand — and wrong for the ground
    // one of them is standing on. Where an abandoned branch ran sixty metres
    // away and twenty below, its cone reached in under the route and took
    // fourteen metres of hillside out from beneath it, leaving the ribbon in
    // the air with a skirt hanging off its edge: the dark face down the side
    // of the road in every screenshot of one.
    //
    // So inside a corridor the road standing there is the floor on the
    // ceiling, fading out over the same three metres the drawn corridor
    // fades over. Past its own lip the ground is free to fall away — that is
    // what an embankment is — and the min over every cone is right again.
    // Inside the corridor the nearest road IS this road: two roads keep
    // `roadClear` apart (R23), which is more than two corridors' width, so
    // nothing else can be nearer to a point on this one's shelf.
    let ceiling = near ? near.ceiling : Infinity;
    /** ...and the level it is held at: the road's own underside, FALLING
     * away past its lip at the grade the verge is allowed to climb. Falling,
     * not rising with the cone, because past its own edge a road stands on
     * an embankment and an embankment has a side — this only says the side
     * is a slope a car could come back up, which is R31 read the other way
     * round. `own` carries the cone's rise past the bench, so that is taken
     * back off — at the grade it was actually opened at (R34), not at the
     * verge's, or a cutting leaves the difference standing as a lip along
     * its own corridor. */
    const floorOf = (level: number, d: number, edge: number, climb: number): number =>
      level - coneRise(d, climb) - Math.max(0, d - edge) * VERGE_CLIMB;
    // It only ever RAISES the ceiling, so this takes no ground away and
    // fills nothing in: `raised` still bounds the result from above, and a
    // valley, a ford's dip and the ravine under a bridge are all exactly as
    // deep as the landscape made them.
    //
    // R31 — the ground every cone RISES TOWARD as it lets go is the ground
    // the roads have shaped here, mounds and shelves included, so a cone at
    // the end of its reach stands on whatever is there and clips nothing:
    // let go toward the bare country instead and every branch's embankment
    // crossing the route's reach gets a step cut across it along the
    // circle where the route stops being found.
    const raised = base + guards.riseAt(x, z);
    shape.fadeGrade = 0;
    if (near) ceiling = fadeCeiling(ceiling, raised);
    // A branch is never banked and the index carries no signed lateral, so
    // its cone is the plain one: its own underside, opening upward past the
    // bench. Nor is a branch ever CUT (R34): it is the road the stage did
    // not take, abandoned to the country, and nobody blasts a cutting for a
    // road nobody is going to drive. Every cone is in before any floor is
    // put on the result, or a floor a later cone undercuts was no floor.
    /** The branch's cone as opened — what its own floor below is undone
     * against — before it lets go toward the shaped ground the way the
     * route's does, inside the reach its index finds it within. */
    // ...and the branch it is asked of is the one whose cone holds the
    // country LOWEST here, not the nearest: the cone is a min over every
    // road in reach, and asked of the nearest alone it stopped at the
    // midline where a branch cut deep into a hillside handed over to a
    // higher one — a twenty metre step ruled along that line (seed 22).
    const low = spur ? spurs.lowest(x, z, VERGE_CLIMB, BENCH) : null;
    const branch = low ? ceilingOf(low.sample) + coneRise(low.d, VERGE_CLIMB) : Infinity;
    if (low) {
      const over = raised - branch;
      let gone = branch;
      let grade = 0;
      if (over > 0) {
        const w = fadeWeight(low.d, SPUR_CONE_REACH);
        gone += w * over;
        grade = fadeGrade(w, SPUR_CONE_REACH, VERGE_CLIMB, over);
      }
      if (gone < ceiling) {
        ceiling = gone;
        shape.fadeGrade = grade;
      }
    }
    if (near) {
      const hold = holdOf(near.d, shelfEnd);
      const floor = Math.max(ownShelf, floorOf(near.own, near.d, shelfEnd, near.ownClimb));
      if (hold > 0 && floor > ceiling) ceiling += (floor - ceiling) * hold;
    }
    if (spur) {
      // ...and where the point is on the BRANCH's ground, the branch's own
      // shelf is a floor on the ceiling too. BOTH roads' floors hold, each
      // by its own hand, never whichever is nearer: at a junction's mouth
      // the arm's mat lies across the stage's shoulder, and an arm that
      // leaves the mouth downhill has a lower cone than the stage's — pick
      // the arm's floor because the point is a hair nearer to it and the
      // stage's own shelf is cut down to the arm's cone, three quarters of
      // a metre under the mat the car is riding, which is the step at the
      // verge line across every mouth on the map.
      // Its OWN cone, undone under its own corridor — the lowest branch's
      // is another road's, and another road's cone is what the floor is
      // there to keep off this one's shelf.
      const edge = spurEdge(spur.spur);
      const own = ceilingOf(spur.sample) + coneRise(spur.d, VERGE_CLIMB);
      const hold = holdOf(spur.d, edge);
      const floor = floorOf(own, spur.d, edge, VERGE_CLIMB);
      if (hold > 0 && floor > ceiling) ceiling += (floor - ceiling) * hold;
    }
    // R37 — nor may a cone cut a PAD. A yard is graded level with the drive
    // that runs onto it, so it is never the wall beside a road that R31
    // exists to take down — but the drive's own cone, read from its
    // underside, sits under the pad's level along the drive and above it
    // out at the rim, and a farm's yard is wide enough for the difference
    // to show: cut along the drive and flat at the rim is a yard with a
    // trough down the middle. The pad's level is the floor on the ceiling,
    // by the pad's own weight — and R39's band is a floor on it the same
    // way, over the whole village at once.
    if (platformWeight > 0 && platformFlat > ceiling) {
      ceiling += (platformFlat - ceiling) * platformWeight;
    }
    if (padWeight > 0 && padFlat > ceiling) ceiling += (padFlat - ceiling) * padWeight;
    shape.raised = raised;
    shape.ceiling = ceiling;
    shape.cone = near ? near.ceiling : Infinity;
    shape.ownClimb = near ? near.ownClimb : VERGE_CLIMB;
  };
  return {
    ribbonY,
    sideOf,
    apronAt,
    shelfBeyond,
    fillBeyond,
    cutBeyond,
    shapeAt,
  };
}
