// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD OWES THE GROUND AND ITS NEIGHBOURS once the line is walked:
// the distance field a branch steers by (R23/R24), the height band a road
// beside the stage may stand in (R31), the arms cut at every junction and
// the railway's, the lift the tarmac stands proud at, and the three
// smoothing passes that make a junction read as one road — the bank's
// runoff, the width's, and the mouth's own shaping.

import { SAMPLE_STEP, STAGE_RULES as R } from "./rules.ts";
import { type StageStream } from "./endless.ts";
import { cellKey } from "../lib/math.ts";
import { junctionFlat, junctionOverlap, junctionPlatformY, ROAD_CROSS } from "./road.ts";
import { buildSpur, cutSpur } from "./spur-build.ts";
import { placeBlock, PLATFORM_HOLD, type ShelfBand, type Spur } from "./spurs.ts";
import { joinRailLine } from "./railway.ts";
import { branchClearance, ROAD_DISTANCE_REACH, STREAMED_ESCAPE } from "./compile-road.ts";
import { BUILT_PARTING, STAGE_DISTANCE_SLACK } from "./compile-country.ts";
import type { Track, TrackSample } from "./track-shape.ts";

import type { Walk } from "./compile-walk.ts";
import type { createJunctionNoting } from "./compile-junctions.ts";

export function createShelving(
  track: Track,
  walk: Walk,
  rolling: (s: number) => number,
  junctionNoting: ReturnType<typeof createJunctionNoting>,
  stream: Pick<StageStream, "ahead" | "keepOff"> | undefined,
  followsLand: boolean,
  borrowed: boolean,
) {
  const { land, loose, highways } = walk;
  const { rawY, rawWidth, bareWidth, bareBank, junctions, railMeets } = walk;
  const { crossingRamp, mouthFlare, mouthRun, throats, MOUTH_SLEW } = junctionNoting;
  /** R23/R24 — the ground a branch has to keep off, as a distance query:
   * the stage's own centerline and the aprons its start and finish stand
   * on. The road around the branch's OWN junction is excluded — the two
   * carriageways are one road there, which is the whole point of a
   * junction — so the exclusion is an arc window either side of it.
   *
   * Sampled through a spatial hash: a branch asks this a few thousand times
   * while it walks, and a scan of an xlong stage's samples per ask is
   * seconds of work per stage. */
  const roadDistanceField = () => {
    const CELL = 48;
    const key = cellKey;
    const grid = new Map<number, TrackSample[]>();
    const rings = Math.ceil(ROAD_DISTANCE_REACH / CELL);
    // ...and the same cells DILATED by the query's reach: a cell in here is
    // one from which road might be visible at all. Most of a branch's walk
    // happens outside every one of them, and out there the whole query is a
    // single set lookup instead of a hundred-cell probe.
    const inReach = new Set<number>();
    // One sample in eight is enough resolution for a question whose answer
    // is compared against a clearance in the tens of meters — and an eighth
    // of the points to walk. The slack it introduces is half the coarsened
    // spacing, subtracted off the answer so this can only ever under-report
    // the distance, never claim room the branch does not have.
    const STRIDE = 8;
    const slack = STAGE_DISTANCE_SLACK;
    for (let i = 0; i < track.samples.length; i += STRIDE) {
      const sample = track.samples[i];
      const ix = Math.floor(sample.x / CELL);
      const iz = Math.floor(sample.z / CELL);
      const at = key(ix, iz);
      const bucket = grid.get(at);
      if (bucket) {
        bucket.push(sample);
        continue;
      }
      grid.set(at, [sample]);
      for (let dx = -rings - 1; dx <= rings + 1; dx++) {
        for (let dz = -rings - 1; dz <= rings + 1; dz++) inReach.add(key(ix + dx, iz + dz));
      }
    }
    /** Distance to the apron running back from an END sample against its
     * heading (the start's run-up) or forward along it (the finish's
     * run-off). The two ends never move, so each arrives with its heading's
     * sine and cosine already taken — a query is asked tens of thousands of
     * times per branch and has no business re-deriving a constant. */
    const apronDistance = (end: StageEnd, x: number, z: number): number => {
      const dx = x - end.x;
      const dz = z - end.z;
      const along = (dx * end.sin + dz * end.cos) * end.sign;
      const lateral = dx * end.cos - dz * end.sin;
      return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - end.reach));
    };
    // The two ends are not the same length: the run-up carries whatever grid
    // is standing on it (`track.startApron`), the run-off is the rule book's.
    type StageEnd = {
      x: number;
      z: number;
      sin: number;
      cos: number;
      sign: 1 | -1;
      reach: number;
    };
    const endOf = (sample: TrackSample, sign: 1 | -1, reach: number): StageEnd => ({
      x: sample.x,
      z: sample.z,
      sin: Math.sin(sample.heading),
      cos: Math.cos(sample.heading),
      sign,
      reach,
    });
    const first = endOf(track.samples[0], -1, track.startApron);
    const last = endOf(track.samples[track.samples.length - 1], 1, R.startZone.apron);
    const parting2 = BUILT_PARTING * BUILT_PARTING;
    return (meet: { x: number; z: number }) =>
      (
        x: number,
        z: number,
        ignoring = true,
        /** R39 — a stretch of the route to leave out of the answer: the
         * street a town stands on, which the lots are beside on purpose. */
        except?: { fromS: number; toS: number },
      ): number => {
        let best = apronDistance(first, x, z);
        if (!track.endless) best = Math.min(best, apronDistance(last, x, z));
        const cx = Math.floor(x / CELL);
        const cz = Math.floor(z / CELL);
        if (!inReach.has(key(cx, cz))) return Math.min(best, ROAD_DISTANCE_REACH);

        // Ring by ring out from the query, so the first road found bounds
        // the search: nothing in a cell `n` rings out can be nearer than
        // (n − 1) cells, so once that beats `best` there is nothing left to
        // find and the outer rings are never walked at all.
        for (let ring = 0; ring <= rings; ring++) {
          if ((ring - 1) * CELL >= best) break;
          for (let dx = -ring; dx <= ring; dx++) {
            // On the ring's two end columns every row is on the ring;
            // between them only the top and the bottom are, so the walk
            // strides straight from one to the other. Same cells, same
            // order as testing all (2·ring+1)² of them and skipping the
            // interior one at a time — just without the skipping.
            const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
            for (let dz = -ring; dz <= ring; dz += stride) {
              // Most cells hold no road at all; `?? []` used to allocate an
              // empty array for every one of those probes.
              const bucket = grid.get(key(cx + dx, cz + dz));
              if (bucket === undefined) continue;
              for (const sample of bucket) {
                const ddx = sample.x - x;
                const ddz = sample.z - z;
                // Squared first: most of the road in reach is further off
                // than the nearest found so far and cannot win, and the
                // root is the expensive half. The margin keeps the reject
                // strictly conservative — a sample it lets through is
                // measured exactly as before.
                const d2 = ddx * ddx + ddz * ddz;
                if (d2 > best * best * (1 + 1e-9)) continue;
                // R23's junction exemption, and only for road that is
                // actually AT the junction: the ground the two carriageways
                // share is the crossing itself, not every metre of route
                // whose arc happens to fall near the junction's.
                if (ignoring) {
                  const mx = sample.x - meet.x;
                  const mz = sample.z - meet.z;
                  if (mx * mx + mz * mz < parting2) continue;
                }
                if (except && sample.s >= except.fromS && sample.s <= except.toS) continue;
                const d = Math.hypot(ddx, ddz);
                if (d < best) best = d;
              }
            }
          }
        }
        return Math.min(Math.max(0, best - slack), ROAD_DISTANCE_REACH);
      };
  };

  /** R23 + R31 — is the ground still there for a road standing at this
   * point and height? The STAGE'S OWN VERGE CONE takes it away where it
   * would be a wall. Two roads far enough apart on
   * the map can still be tens of metres apart in HEIGHT, and the hillside
   * that used to carry one up to the other is exactly the wall R31 cuts
   * away — which leaves the branch on top of it hanging in the air, forty
   * metres over a road the player is driving. So the room a branch needs
   * from the stage is not its width alone: it is also its height above it,
   * at the grade the verge is allowed to climb.
   *
   * BOTH WAYS. The cone used to bind only upward, and a branch BELOW the
   * stage builds precisely the same wall seen from the other side: the
   * terrain holds the ground flat out to the route's corridor lip and then
   * hands it to the branch's own shelf, so a branch running low beside the
   * route drops the difference between them over the few metres between
   * two lips. Seed 38's arm ran 140 m at twelve metres from the route and
   * ten below it, and the country between them came out as a sheer earth
   * face a car falls off — which is the same defect as a branch on stilts
   * and was let through because the sign was never checked.
   *
   * Strided over the stage the same way the keep-out field is; the branch
   * asks it in the same pass that cuts it against the horizontal
   * clearance, so the junction's own exemption covers both. */
  const shelfHolds = (x: number, z: number, y: number): boolean => {
    const STRIDE = 8;
    const bench = Math.max(track.width / 2 + ROAD_CROSS.reach, R.verge.bench);
    const all = track.samples;
    for (let k = 0; k < all.length; k += STRIDE) {
      const road = all[k];
      const apart = Math.abs(y - road.elevation);
      if (apart <= 0) continue;
      // The cone is flat out to the bench and opens at `climb` past it, so
      // the room this much height needs is the height itself at that grade
      // — plus half the stride's own spacing, since a sample eight steps
      // from the one measured could be that much nearer.
      const need = bench + apart / R.verge.climb + STRIDE * SAMPLE_STEP * 0.5;
      const dx = road.x - x;
      const dz = road.z - z;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  };

  /** R23 + R31 — the same rule read as a HEIGHT rather than as a verdict:
   * the band a branch may stand in here without its shelf becoming a wall
   * beside the stage. `shelfHolds` is the test a finished branch passes or
   * fails; this is what a branch under construction has to be held to, and
   * the two are the same cone.
   *
   * Unbounded where no part of the stage is close enough to have an
   * opinion, which is most of a branch — so past the corridor it follows
   * the country exactly as it always did. Where the stage passes twice at
   * two heights the band can come out EMPTY (`floor` over `ceiling`), and
   * that is an honest answer: no road can stand there, and the cut pass
   * below reads it off `shelfHolds` and ends the branch. */
  const shelfBand = (x: number, z: number): ShelfBand => {
    const STRIDE = 8;
    const bench = Math.max(track.width / 2 + ROAD_CROSS.reach, R.verge.bench);
    const slack = STRIDE * SAMPLE_STEP * 0.5;
    const all = track.samples;
    let ceiling = Infinity;
    let floor = -Infinity;
    for (let k = 0; k < all.length; k += STRIDE) {
      const road = all[k];
      const dx = road.x - x;
      const dz = road.z - z;
      const d2 = dx * dx + dz * dz;
      // Out past the point where even ground at this road's own height
      // would clear the cone, the sample has nothing to say — measured on
      // whichever half of the band is currently the wider, since either can
      // still be tightened by a sample the other has already ruled out.
      const room = Math.max(
        ceiling < Infinity ? ceiling - road.elevation : Infinity,
        floor > -Infinity ? road.elevation - floor : Infinity,
      );
      const reach = bench + slack + Math.max(0, room) / R.verge.climb;
      if (room < Infinity && d2 > reach * reach) continue;
      const swing = Math.max(0, Math.sqrt(d2) - bench - slack) * R.verge.climb;
      if (road.elevation + swing < ceiling) ceiling = road.elevation + swing;
      if (road.elevation - swing > floor) floor = road.elevation - swing;
    }
    return { floor, ceiling };
  };

  /** R41 — cut the two arms of the railway at every crossing noted in this
   * pass, from the crossing point out to the edge of the map each way, and
   * join them into the line the train runs. Cut, never driven, exactly as
   * a road crossing's arms are: the railway is already laid edge to edge.
   * Neither arm is shut — nobody drives a railway — and neither is warped
   * onto a platform, because there is none: the rails meet the road at its
   * own grade and the crossing point is where the two heights agree. */
  const buildRailArms = (): Spur[] => {
    const out: Spur[] = [];
    if (railMeets.length === 0) return out;
    for (const { crossing, road } of railMeets) {
      const arms: Spur[] = [];
      for (const [end, turn] of [
        ["entry", 0],
        ["exit", Math.PI],
      ] as const) {
        const arm = cutSpur(
          {
            x: crossing.x,
            z: crossing.z,
            heading: crossing.heading + turn,
            elevation: crossing.y,
          },
          crossing.s,
          end,
          road,
          crossing.index,
          land,
          track.width,
          shelfBand,
          loose,
        );
        arm.crossing = true;
        arm.rail = true;
        track.spurs.push(arm);
        arms.push(arm);
        out.push(arm);
      }
      crossing.line = joinRailLine(arms[0], arms[1]);
    }
    railMeets.length = 0;
    return out;
  };

  /** Build the branch every noted junction earns, now that the road they
   * hang off is compiled. A finite stage hands each branch the stage's own
   * bounding box to escape; a streamed one has no box, so the branch just
   * has to get out of the junction's neighbourhood. */
  const buildForks = (): void => {
    // R41 — the railway's arms first, so every branch built below keeps
    // off them as it would off any other road (R23).
    const railArms = buildRailArms();
    if (junctions.length === 0) return;
    const roadDistance = roadDistanceField();
    /** R23 — the branches already standing. A branch measures itself against
     * the stage and (since it wanders) against its own line, but two
     * branches off two different junctions are two roads like any other
     * pair, and nothing was asking them to keep apart: they cross in open
     * country a kilometre from anything, which is a junction nobody built.
     *
     * Strided to match the stage's own coarsening, and the slack is taken
     * off the answer so this can only ever under-report the room a branch
     * has, never invent some.
     */
    const standing: Spur[] = [...railArms];
    const clearOfBranches = branchClearance(standing);
    for (const junction of junctions) {
      const box = track.endless
        ? {
            minX: junction.x - STREAMED_ESCAPE,
            maxX: junction.x + STREAMED_ESCAPE,
            minZ: junction.z - STREAMED_ESCAPE,
            maxZ: junction.z + STREAMED_ESCAPE,
          }
        : track.bounds;
      // R36 — a CROSSING abandons the public road entirely, so it earns an
      // arm in EACH direction: the road runs on out of the crossing both
      // ways, and both ways are shut. Cut, never driven — a crossing is only
      // ever made on a road that already exists, so `road` is always there
      // and there is no country to steer a branch through.
      //
      // The two are labelled `entry` and `exit` because a `Spur` has to be
      // one or the other, and which arm is which does not matter: the label
      // is what makes the pair distinguishable to the block's own dice, so
      // the two barriers facing each other across the stage are not always
      // the same barrier twice.
      if (junction.crossing && junction.road) {
        for (const [end, turn] of [
          ["entry", 0],
          ["exit", Math.PI],
        ] as const) {
          const arm = cutSpur(
            { ...junction, heading: junction.heading + turn },
            junction.s,
            end,
            junction.road.road,
            junction.road.index,
            land,
            track.width,
            shelfBand,
          );
          arm.crossing = true;
          track.spurs.push(arm);
          standing.push(arm);
        }
        continue;
      }
      const end = junction.joining ? "entry" : "exit";
      // R17 — a BORROWED junction's arm is the rest of the road, so it is
      // cut off the line the tarmac was laid on rather than driven out of
      // the country. `nearest` finds where on that line the meeting point
      // is: the route arrived there by solving onto the road's own tangent,
      // so it is a metre or so away, not a search.
      //
      // Which is exactly why it is BOUNDED. `borrowed` is the stage's flag,
      // not the junction's, and a stage that borrowed somewhere can still
      // put a junction nowhere near tarmac. Asked without a bound, the
      // query answers with the nearest road however far away it is: seed 1
      // at 0.4 asphalt cut an arm from a highway 950 m off, and what got
      // built was a branch that set out from the junction, made for that
      // road, and crossed its own stage 600 m later at 0.8 m — R23's whole
      // subject, drawn by the code meant to honour it. A junction that is
      // not on a public road has no road to be the rest of, and gets a
      // branch driven out of the country like any other.
      const hit = borrowed
        ? highways.nearest(junction.x, junction.z, undefined, track.width)
        : null;
      const spur = hit
        ? cutSpur(junction, junction.s, end, hit.road, hit.index, land, track.width, shelfBand)
        : buildSpur(
            track.seed,
            {
              x: junction.x,
              z: junction.z,
              heading: junction.heading,
              elevation: junction.elevation,
              slope: junction.slope,
            },
            junction.s,
            end,
            box,
            land,
            track.width,
            (() => {
              const stage = roadDistance(junction);
              return (x: number, z: number, ignoringJunction?: boolean) =>
                Math.min(stage(x, z, ignoringJunction), clearOfBranches(x, z));
            })(),
            shelfHolds,
            shelfBand,
          );
      track.spurs.push(spur);
      standing.push(spur);
    }
    junctions.length = 0;
    // R17 — and the first stretch of every branch lies on its junction's
    // platform, exactly like the road it leaves: same plane, no crown, no
    // border, so the two carriageways are one piece of ground.
    for (const spur of track.spurs) {
      // A crossing's two arms share one meeting point, so `joining` cannot
      // tell them apart and does not have to: they warp onto the same
      // platform (R36).
      const platform = track.junctions.find((j) =>
        spur.crossing
          ? j.crossing === true && j.s === spur.atS
          : j.s === spur.atS && j.joining === (spur.end === "entry"),
      );
      if (!platform) continue;
      for (const sample of spur.samples) {
        if (sample.s > PLATFORM_HOLD) break;
        const flat = junctionFlat(platform, sample.x, sample.z);
        if (flat <= 0) continue;
        sample.flat = flat;
        sample.elevation =
          sample.elevation * (1 - flat) + junctionPlatformY(platform, sample.x, sample.z) * flat;
      }
    }
    // R17 — and then the barrier that shuts each branch, standing where the
    // whole line of it is clear of the ROUTE. Last, because it reads the
    // platform warp above (a barrier on the junction's own plane is a
    // barrier inside the crossing) and because it is measured against the
    // WHOLE route, junction exemption and all: the branch is allowed to
    // leave along the road it is leaving, and a driver on that road is not
    // allowed to meet a stack of tyres doing it. Only this call's branches:
    // an endless stream re-walks the list every append, and a block that
    // moves under a chunk the renderer has already drawn is a barrier in
    // two places.
    const everywhere = roadDistance({ x: 0, z: 0 });
    const wholeRoute = (x: number, z: number) => everywhere(x, z, false);
    for (const spur of standing) {
      // R41 — a railway is not shut: nobody drives one.
      if (spur.rail) continue;
      spur.block = placeBlock(
        spur,
        wholeRoute,
        track.width / 2,
        track.seed,
        spur.end === "entry" ? 1 : 0,
      );
    }
  };

  /** The mat's joints. A sealed section starts and ends with a lip of new
   * surfacing rather than a step in the ground, so the road's lift ramps in
   * over the first meters of the run and out over the last — which is a
   * pass over FINISHED samples, because how far a sample sits from the end
   * of its own run is not knowable while walking it. */
  const paveLift = (from: number): void => {
    const s = track.samples;
    const reach = Math.ceil(ROAD_CROSS.liftRamp / SAMPLE_STEP) + 1;
    const start = Math.max(0, from - reach);
    const sealed = (i: number): boolean => s[i].surface === "asphalt" && s[i].deck === null;
    // How far into its run each sample is, from the front...
    let run = 0;
    for (let i = Math.max(0, start - reach); i < start; i++)
      run = sealed(i) ? run + SAMPLE_STEP : 0;
    for (let i = start; i < s.length; i++) {
      run = sealed(i) ? run + SAMPLE_STEP : 0;
      s[i].lift = run;
    }
    // ...and from the back, which is the one that decides the joint.
    let ahead = 0;
    for (let i = s.length - 1; i >= start; i--) {
      ahead = sealed(i) ? ahead + SAMPLE_STEP : 0;
      if (!sealed(i)) {
        s[i].lift = 0;
        continue;
      }
      const t = Math.min(1, Math.min(s[i].lift, ahead) / ROAD_CROSS.liftRamp);
      s[i].lift = ROAD_CROSS.asphaltLift * t * t * (3 - 2 * t);
    }
  };

  /** R19 — the cross-fall a corner of this radius is built with, before
   * the runoff smooths it. Zero on anything that is not a graded road: a
   * bridge deck is level and a ford is standing water. */
  const bankRate = (curvature: number, sample: TrackSample): number => {
    if (sample.deck != null || sample.surface === "water") return 0;
    const kind = sample.surface === "asphalt" ? "asphalt" : "gravel";
    const tightness = Math.abs(curvature) * R.bank.pivotRadius[kind];
    if (tightness <= 0) return 0;
    return Math.sign(curvature) * R.bank.max[kind] * (tightness / (1 + tightness));
  };

  /** R19 — roll the cross-fall in and out. A road does not change its
   * cross-section in a step: the blade walks the bank up over a runoff and
   * back down again, which is also what stops a short corner getting the
   * full tilt it never had room to build. A triangular filter over the
   * runoff is exactly that walk, and it costs one pass. */
  const bankRunoff = (from: number): void => {
    const all = track.samples;
    const reach = Math.max(1, Math.round(R.bank.runoff / 2 / SAMPLE_STEP));
    const start = Math.max(0, from - reach);
    // Indexed into the whole bare array, not a slice from `start`: the
    // samples the re-run exists for are the ones whose window ran off the
    // last frontier, and a slice cut at `start` took their left-hand
    // neighbours away instead.
    for (let i = start; i < all.length; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k++) {
        const at = i + k;
        if (at < 0 || at >= bareBank.length) continue;
        const w = 1 - Math.abs(k) / (reach + 1);
        sum += bareBank[at] * w;
        weight += w;
      }
      all[i].bank = weight > 0 ? sum / weight : 0;
    }
  };

  /** R33 — and roll the WIDTH in and out the same way, for the same
   * reason. The corner term is read off a sample's curvature, and curvature
   * steps at a segment boundary: a straight running into a hairpin gains a
   * metre and a half of mat inside one 2 m sample, which is a notch cut in
   * the side of the road rather than a road opening out for a bend. The
   * blade that widened the corner drove into it and out of it.
   *
   * `rawWidth` is smoothed with the samples, because it is the pristine
   * width the junction pass reads back before it measures a mouth's flare
   * — leave it unsmoothed and every junction re-lays the notch. */
  const widthRunoff = (from: number): void => {
    const all = track.samples;
    const reach = Math.max(1, Math.round(R.roughness.width.runoff / 2 / SAMPLE_STEP));
    const start = Math.max(0, from - reach);
    for (let i = start; i < all.length; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k++) {
        const at = i + k;
        if (at < 0 || at >= bareWidth.length) continue;
        const w = 1 - Math.abs(k) / (reach + 1);
        sum += bareWidth[at] * w;
        weight += w;
      }
      if (weight <= 0) continue;
      all[i].width = sum / weight;
      rawWidth[i] = all[i].width;
    }
  };

  /** R17 — SHAPE THE JUNCTIONS, over the road that has now been walked.
   * Two things happen to a sample near a crossing, and both are run off the
   * PRISTINE height and width so a pass that overlaps an earlier one lands
   * in exactly the same place instead of compounding:
   *
   * - It is warped onto the platform. Inside a junction the two carriageways
   *   are one graded plane: the crown, the camber and the wheel tracks come
   *   out (`flat`) and the centerline eases onto the plane the main road's
   *   grade defines.
   * - If it is the MINOR road, its mat FLARES. The dirt road opens out into
   *   its mouth over the last stretch, until it meets the main road's edge
   *   with no wedge of country left between them — which is the difference
   *   between two roads that meet and two ribbons that collided. */
  const shapeJunctions = (from: number): void => {
    if (track.junctions.length === 0) return;
    // A parting junction's minor arm is the road AFTER it, so its throat
    // moves as more of that road is walked — an endless stream would
    // otherwise flare every later chunk against the first chunk's answer.
    throats.clear();
    const all = track.samples;
    const reach = Math.ceil(Math.max(R.junction.reach.max, mouthRun) / SAMPLE_STEP) + 1;
    const start = Math.max(0, from - reach);
    // R17 — the mouth's own widening, measured first and then SLEW-LIMITED.
    // A kerb fillet is a quarter ellipse, so its width runs away vertically
    // at the throat: laid straight onto the samples that is metres of extra
    // mat inside one two-metre step, and the ground beside a road cannot
    // turn that corner — the terrain hands over inside the ribbon and what
    // is left is a face down the outside of the mouth. Limiting how fast
    // the mat may open keeps the fillet's shape everywhere it is gentle and
    // only trims the tail, which is the part no ground could follow anyway.
    // The limit binds only between two samples that are both the MINOR
    // road. Where the neighbour is the main road the step is the junction
    // itself — the mouth is meant to be at its widest there and then simply
    // stop, and the ground under it is the platform, which is one flat
    // plane already. Slewing that step would taper the mouth shut again at
    // exactly the place it exists to open.
    const flares: number[] = [];
    const outers: (1 | -1)[] = [];
    for (let i = start; i < all.length; i++) {
      const mouth = mouthFlare(all[i]);
      flares[i] = mouth.extra;
      outers[i] = mouth.outer;
    }
    const raw = flares.slice();
    const slew = MOUTH_SLEW * SAMPLE_STEP;
    for (let i = start + 1; i < all.length; i++) {
      if (raw[i - 1] > 0 && flares[i] > flares[i - 1] + slew) flares[i] = flares[i - 1] + slew;
    }
    for (let i = all.length - 2; i >= start; i--) {
      if (raw[i + 1] > 0 && flares[i] > flares[i + 1] + slew) flares[i] = flares[i + 1] + slew;
    }
    for (let i = start; i < all.length; i++) {
      const sample = all[i];
      let flat = 0;
      let plane = 0;
      // R36 — the height blend is NOT the paving blend, and a crossing is
      // why. `flat` says how much of the sample's CROSS-SECTION is warped
      // out (the crown, the camber, the wheel tracks) — a fact about paving,
      // which reaches exactly as far as the graded platform does. `lift`
      // says how much of its HEIGHT comes from the platform's plane, and at
      // a crossing that reaches further: the road climbs a ramp of ordinary
      // gravel onto the formation, and gravel that has been warped flat is a
      // ramp somebody paved. At a junction the two are the same number, and
      // they stay the same number.
      let lift = 0;
      for (const junction of track.junctions) {
        if (Math.abs(junction.s - sample.s) > R.junction.reach.max * 2) continue;
        // R17 — and past the ellipse, for as long as the route's mat is
        // still lying on the branch's: the branch holds the plane out
        // there, so the route has to as well, or the two are at two heights
        // on one piece of ground. A crossing's arms are its own ramp's
        // business (R36), and nobody turns onto them.
        const w = Math.max(
          junctionFlat(junction, sample.x, sample.z),
          junction.crossing ? 0 : junctionOverlap(junction, sample.x, sample.z, PLATFORM_HOLD),
        );
        if (w <= flat) continue;
        flat = w;
        if (w > lift) {
          lift = w;
          plane = junctionPlatformY(junction, sample.x, sample.z);
        }
      }
      for (const junction of track.junctions) {
        if (!junction.crossing) continue;
        const w = crossingRamp(junction, sample.s);
        if (w <= lift) continue;
        lift = w;
        plane = junctionPlatformY(junction, sample.x, sample.z);
      }
      sample.flat = flat;
      sample.elevation = rawY[i] * (1 - lift) + plane * lift;
      // Back to the pristine width BEFORE the mouth is measured — the flare
      // reads the mat's own reach across the main road, so a pass that ran
      // over this sample already would otherwise flare a flare.
      sample.width = rawWidth[i];
      sample.shift = 0;
      const flare = flares[i] ?? 0;
      if (flare > 0) {
        // R17 — the mouth opens on ONE side. The route is turning through
        // the junction, so the inside of that corner already meets the main
        // road at an angle and needs nothing built out; what a car swinging
        // off the main road actually uses is the OUTSIDE. Widening both
        // sides to get that costs twice the ground for half the effect, and
        // reads as a road that briefly got fatter rather than as a mouth.
        //
        // The outside of a turn is the side away from where it bends, and a
        // junction corner always bends — `isJunctionTurn` only takes a
        // corner inside R17's angle band, so there is no straight case to
        // fall back on — and which side that is belongs to the JUNCTION
        // (`outerOf`), not to this sample: a corner unwinds over its last
        // few metres, so a side read per sample flips halfway through one
        // mouth and the mat's wide half jumps edges.
        sample.width = rawWidth[i] + flare;
        sample.shift = (outers[i] * flare) / 2;
      }
    }
  };

  return {
    roadDistanceField,
    shelfHolds,
    shelfBand,
    buildRailArms,
    buildForks,
    paveLift,
    bankRate,
    bankRunoff,
    widthRunoff,
    shapeJunctions,
  };
}
