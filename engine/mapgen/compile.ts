// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags — plus the
// pacenote list the HUD calls from. One compilation is the single geometric
// truth for a stage — the car's ground height, the road mesh, and the bot's
// racing line all read these samples. The compiler is incremental: an
// endless stage keeps appending to the same track as its stream produces
// new sections.

import type { SegmentPlan, StageKnobs, StageLength, StageShape } from "./rules.ts";
import { SAMPLE_STEP, STAGE_RULES as R, knobScale, resolveKnobs } from "./rules.ts";
import { generateStage, layStageHighways } from "./generate.ts";
import { createStageStream, type StageStream } from "./endless.ts";
import { boredAt, straightPart, type Bore } from "./search.ts";
import { createLandField } from "./land.ts";
import { biomeRules } from "./biomes.ts";
import {
  resolveClimate,
  roadSnow,
  snowBite,
  temperatureAt,
  type ClimateChoice,
} from "../game/climate.ts";
import { buildRolling, straightness } from "./rolling.ts";
import { valleyUnder } from "./terrain.ts";
import { createWalk } from "./compile-walk.ts";
import { createJunctionNoting } from "./compile-junctions.ts";
import { createShelving } from "./compile-shelf.ts";
import { createPlaces } from "./compile-places.ts";
import type { Compiler, Paving, WidthAt } from "./compile-road.ts";
import {
  bridgeDeck,
  buildBumps,
  buildPaving,
  buildWidth,
  fordDip,
  inCrossing,
  isBridge,
  meetLine,
  segmentElevation,
  SEVERITY_RANK,
} from "./compile-road.ts";
import { closeCircuitHeight, emptyTrack, planCountry, type Country } from "./compile-country.ts";
import type { BridgeDeck, Pacenote, Surface, Track, TrackSample } from "./track-shape.ts";

export * from "./track-shape.ts";

/** The incremental heart: walks plans into samples, bounds, and pacenotes,
 * carrying the cursor (and the open pacenote, so a turn combination split
 * across two endless sections still merges into one call). */
function createCompiler(
  track: Track,
  rolling: (s: number) => number,
  paving: Paving,
  bumps: (s: number, surface: Surface, shaped: boolean) => number,
  widthAt: WidthAt,
  /** R17 — the country the finished stage will occupy, known before it is
   * walked (see `planBounds`). A junction is only worth building where the
   * arm it abandons can LEAVE, and which way is out is a question about the
   * whole map that the cursor cannot answer halfway down it. Absent on an
   * endless stage, which has no box and whose branches only have to get out
   * of their own junction's neighbourhood. */
  country?: Country,
  /** R34 — whether the road is laid ALONG the country (every generated
   * stage) or at a height of its own (a synthetic rig). A rig is a
   * measuring device: flat, smooth and repeatable, so a physics test
   * measures the car and not the hillside it happens to have been built
   * on. Handing it `rolling = () => 0` used to be enough to say so; with
   * the road following the ground it is not, and a rig that quietly
   * acquired a landscape is a suite of tests measuring the wrong thing. */
  followsLand = true,
  /** R17 — is this stage's tarmac BORROWED or PAINTED?
   *
   * Borrowed is the sprint search: the tarmac was laid on the bare country
   * first (`highway.ts`) and the route went and found a piece of it
   * (`borrow.ts`), so the plan already says which segments are a public
   * road and every junction's abandoned arm is the rest of that road. There
   * is nothing to decide here and nothing to refuse.
   *
   * Painted is the circuit search and the endless stream, neither of which
   * is routed onto the tarmac yet: there the paving field asks for a
   * surface change, the change waits for a corner that could be a junction,
   * and the arm has to be invented and driven off the map before the corner
   * may carry one.
   *
   * Passed in rather than sniffed off the plan, because the two answers
   * differ most exactly where sniffing fails: a borrowed stage whose
   * country carried no public road has no paved segment in its plan, and
   * that must come out ALL GRAVEL rather than quietly falling back to
   * painting stripes on the racing line. */
  borrowed = false,
  /** R43 — the endless stream behind this track, when there is one: the
   * road it has planned past the frontier, and the discs the compiled road
   * may claim from its future. A finite stage has its whole route in its
   * samples and needs neither. */
  stream?: Pick<StageStream, "ahead" | "keepOff">,
): Compiler {
  const walk = createWalk(track, rolling, followsLand);
  const junctionNoting = createJunctionNoting(track, walk, rolling, country);
  const {
    cursor,
    land,
    biome,
    loose,
    zones,
    snowline,
    followLand,
    rawY,
    rawWidth,
    bareWidth,
    bareBank,
    junctions,
  } = walk;
  let openNote: Pacenote | null = null;
  /** R28 — where the last board actually STANDS, meters (the gap the rule
   * is quoted in is board to board, not corner to corner), and the arc
   * position the next one is waiting to be written at (-1 when none is
   * owed). The start line is the zeroth board: a stage measures its first
   * gap from the grid. */
  let checkpointS = 0;
  let checkpointDue = -1;
  /** Whether the road is sealed right now, and whether the paving field
   * has asked for that to change. The change does not happen where the
   * field asks: it waits for a CORNER to happen at (R17), because that is
   * where one road can meet another instead of merging into it. */
  // A stage that is sealed from end to end has no junction to arrive
  // through: it simply starts on the tarmac. Every other stage starts on
  // gravel and meets its first junction where the field asks for one — and
  // a BORROWED stage always starts on gravel, because the route has to go
  // and find a road before it can be driving on one.
  /** R47 — a mountain road is sealed BY HEIGHT: the pass is tarmac from
   * the valley up to a line the `asphalt` dial raises, and the rally's own
   * gravel above it. Null in every other country, where the paving field
   * (or the search's borrows) says what is sealed. */
  const sealBelow =
    biome.land.massif !== null && track.knobs.asphalt >= R.paving.floor
      ? knobScale(track.knobs.asphalt, {
          min: zones.rock.from,
          max: (zones.snow ?? zones.rock.to) + R.paving.sealAbove,
        })
      : null;
  /** Whether the road WANTS to be sealed at an arc position, standing at a
   * crown height — the paving field's word, or the mountain's line. */
  const wantsSeal = (s: number, crown: number): boolean =>
    sealBelow !== null ? crown < sealBelow : paving.pavedAt(s);
  let pavedNow = borrowed ? false : wantsSeal(0, cursor.baseY + rolling(0));
  /** R20 — is there gravel on this stage at all? At the top of the
   * `asphalt` dial the whole route is a public road, which is a different
   * kind of event and not a borrow, so the rule that keeps hairpins off
   * borrowed tarmac has nothing to say about it. Nor does it in a mountain
   * country (R47): a pass road is the rally's own, hairpins and all. */
  const mixedSurface = track.knobs.asphalt <= 1 - R.paving.floor && sealBelow === null;
  let flipWanted = false;
  const {
    isJunctionTurn,
    onMainRun,
    noteJunction,
    noteCrossing,
    noteRailCrossing,
    onCrossingSeal,
  } = junctionNoting;
  const shelving = createShelving(
    track,
    walk,
    rolling,
    junctionNoting,
    stream,
    followsLand,
    borrowed,
  );
  const { buildForks, paveLift, bankRate, bankRunoff, widthRunoff, shapeJunctions } = shelving;
  const { buildPublic, buildTowns, buildHomesteads, buildEnergy, buildPowerLines } = createPlaces(
    track,
    walk,
    rolling,
    shelving,
    stream,
    followsLand,
  );
  const append = (plans: SegmentPlan[]): void => {
    const b = track.bounds;
    const firstNew = track.samples.length;
    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index];
      // R17 — WHERE THE TARMAC IS. Two ways of knowing, and which one is in
      // force is decided by the plan rather than by a mode flag.
      //
      // BORROWED (`borrowed`, the sprint search): the plan already says
      // which segments are a public road, because the search went and found
      // one and solved its way onto it (`highway.ts`, `borrow.ts`). The
      // junction is simply where the flag changes — there is nothing to
      // decide here and nothing to refuse, because the arm this junction
      // abandons is the rest of a road that already crosses the map.
      //
      // PAINTED (the paving field): a circuit or an endless stream, neither
      // of which is routed onto the tarmac yet. There the field asks for a
      // surface change, the change WAITS for a corner it can be a junction
      // at (R17), and the arm has to be invented and driven to the map's
      // edge before the corner is allowed to carry one.
      const nextPaved = plans[index + 1]?.paved === true;
      let flipAt = -1;
      let joinAtEnd: SegmentPlan | null = null;
      if (borrowed) {
        // The change falls at the JUNCTION's own edge — where the route's
        // line actually reaches or leaves the main road's mat — rather than
        // at the segment boundary, which is what makes the seam the through
        // road's kerb instead of a band ruled across the minor road.
        if (!pavedNow && nextPaved && plan.kind === "turn") {
          flipAt = plan.length - Math.min(plan.length, onMainRun(plan.radius ?? 1));
          joinAtEnd = plan;
        } else if (pavedNow && !plan.paved && plan.kind === "turn") {
          noteJunction(plan, cursor, false);
          flipAt = Math.min(plan.length, onMainRun(plan.radius ?? 1));
        }
      } else {
        if (wantsSeal(cursor.s, cursor.baseY + rolling(cursor.rollS)) !== pavedNow) {
          flipWanted = true;
        }
        if (flipWanted && isJunctionTurn(plan, cursor, !pavedNow)) {
          flipWanted = false;
          const onMain = Math.min(plan.length, onMainRun(plan.radius ?? 1));
          if (pavedNow) {
            // Turning OFF the sealed road: the junction is the corner's
            // start, and the tarmac carries the route until its own line is
            // clear of the main road's mat.
            noteJunction(plan, cursor, false);
            flipAt = onMain;
          } else {
            // Turning ONTO it: the route is on the tarmac from where its
            // line first reaches the mat, and the junction is at the
            // corner's end, which the cursor only knows once the corner is
            // walked.
            flipAt = plan.length - onMain;
            joinAtEnd = plan;
          }
        }
      }
      // R20 — WHERE THE SURFACING RUNS OUT. A sealed section is a public
      // road the rally borrowed, laid out by a highway authority for
      // traffic that is not racing: it sweeps. A hairpin on one reads as a
      // race track painted grey, and the tight corners are what the rally
      // has its own gravel for — so the tarmac ends at the corner's start
      // and the road is gravel through it.
      //
      // This is the ONE surface change that is not a junction (R17), and
      // the exception is deliberate rather than a gap. A borrow can only be
      // refused where it STARTS, and where a seal ends is decided by
      // whether the arm it would abandon can leave the map — a question
      // about country the join has no cheap way to ask, and one that has to
      // be answered by walking geometry that is not walked yet. Both of the
      // places the rule could have gone instead were tried and measured:
      // capping the corner in the SEARCH straightens the route enough to
      // run it alongside its own valleys (R18's `water.road` findings went
      // from 37 to 134 over seeds 1-24, for no tight tarmac removed), and
      // refusing the JOIN over a window long enough to cover the overrun
      // throws away two fifths of the stage's tarmac, which is R15's dial
      // quietly stopping meaning what it says.
      //
      // So what is left is to end the surfacing, and a length of tarmac
      // that simply stops is a smaller lie than a main road doubling back:
      // it is what every rural road in the world does when the money ran
      // out, and the mat ramps down through the joint (`paveLift`) exactly
      // as it ramps up. `analysis/roads.ts`'s `sweeps` check measures what
      // is left — 6.1% of the sealed road at worst without this, nothing
      // outside the junction crossings with it.
      //
      // Not where the WHOLE stage is sealed: at the top of the `asphalt`
      // dial there is no gravel for the tarmac to become and no junction to
      // get it back at, and a tarmac rally's corners are its own.
      //
      // And not on a BORROWED stage at all, which is the whole reason to
      // borrow. There the sealed stretch is a piece of a real road, laid at
      // `HIGHWAY.minRadius` and cut into segments that track its bend
      // (`borrow.ts`) — there is no hairpin in it to end the surfacing at,
      // so the one surface change that was not a junction is gone.
      if (
        pavedNow &&
        flipAt < 0 &&
        !borrowed &&
        mixedSurface &&
        plan.kind === "turn" &&
        (plan.radius ?? Infinity) < R.paving.minRadius
      ) {
        pavedNow = false;
        flipWanted = wantsSeal(cursor.s, cursor.baseY + rolling(cursor.rollS));
      }
      // R20 — a tarmac section is a public road the rally borrows, and
      // nobody builds a launch ramp into one. A lip that would have landed
      // on sealed road is simply not built, and the segment says so.
      // R41 — except the ramp over the railway, which IS built, whatever the
      // paving field was saying here: without it the car meets the train.
      const sealedJump = plan.feature === "jump" && pavedNow && flipAt < 0 && !plan.overRoad;
      let built: SegmentPlan = sealedJump
        ? { ...plan, feature: "none", featureStart: undefined, featureEnd: undefined }
        : plan;
      // R41 — the ramp over a railway stands its lip `rail.gap` short of
      // the RAILS, and the rails are where this straight actually meets the
      // line: metres from where the plan solved it, because the plan solves
      // on ideal arcs and the compiled walk diverges from those by that
      // much. Read the meeting point off the straight's own geometry and
      // move the ramp with it, or the lip lands two metres short of the
      // line and the car on it.
      if (
        built.overRoad &&
        built.feature === "jump" &&
        built.featureStart !== undefined &&
        built.featureEnd !== undefined
      ) {
        const road = track.highways[built.overRoad.road];
        const on = road?.points[built.overRoad.index];
        if (road?.kind === "rail" && on) {
          const meet =
            meetLine(cursor, road.points[built.overRoad.index - 1] ?? on, on) ??
            meetLine(cursor, on, road.points[built.overRoad.index + 1] ?? on);
          const shift = meet === null ? 0 : meet - R.rail.gap - built.featureEnd;
          if (meet !== null && meet > 0 && meet < built.length && Math.abs(shift) > 0.01) {
            built = {
              ...built,
              featureStart: built.featureStart + shift,
              featureEnd: built.featureEnd + shift,
            };
          }
        }
      }
      track.segments.push(built);
      // R25 — the gate stands where the last segment has its run-out left
      // to give. Recorded here rather than derived from `track.length`,
      // which by the end has the run-out in it.
      if (built.runOut !== undefined) track.finishS = cursor.s + built.length - built.runOut;
      const steps = Math.max(1, Math.round(built.length / SAMPLE_STEP));
      const step = built.length / steps;
      const curvature = built.kind === "turn" && built.radius ? (built.dir ?? 1) / built.radius : 0;
      const lipAt = built.feature === "jump" ? (built.featureEnd ?? -1) : -1;
      const rollS0 = cursor.rollS;

      // R28 — the checkpoint a corner earns. Asked HERE, at the top of the
      // segment that follows it, because only the next segment says whether
      // the corner is actually over: a turn carrying straight on in the
      // same direction is one corner still happening, and a board in the
      // middle of a combination marks nothing. `openNote` is that corner —
      // it holds the whole combination and its hardest severity — and its
      // `endS` is the exit the cursor is standing on.
      // ...and where the road has gone too long without one, a board goes
      // down here whatever the road is doing. See `checkpoint.forced`.
      if (
        checkpointDue < 0 &&
        cursor.s - checkpointS >= R.checkpoint.spacing * R.checkpoint.pace * R.checkpoint.forced
      ) {
        checkpointDue = cursor.s;
      }
      if (openNote !== null && checkpointDue < 0) {
        const linked = built.kind === "turn" && openNote.dir === built.dir;
        const C = R.checkpoint;
        const gap = C.spacing * C.pace;
        const since = openNote.endS - checkpointS;
        // The bar drops the longer the road goes without a board, so a
        // hairpin is taken over the soft bend 200 m later and the split
        // still lands roughly on the clock.
        const bar = since >= gap * C.late ? 0 : since >= gap ? 1 : 2;
        if (!linked && since >= gap * C.early && SEVERITY_RANK[openNote.severity] >= bar) {
          // WHERE in this segment the board stands. The run-out is what
          // makes a board read as the corner's reward rather than as part
          // of the corner — but it is also road a car that CUT the corner
          // rejoins on, and a board it rejoins before is a board the cut
          // books for free. So a corner tight enough to be worth cutting
          // gets none of it: its board stands the instant the curve
          // finishes, and a car that did not drive the curve is past the
          // line before it is back on the road. The run-out is capped by
          // the road that carries it either way, so the board always falls
          // inside this segment: a corner followed by another corner takes
          // its board on the exit itself.
          const runOut =
            openNote.angle >= C.tight || built.kind === "turn"
              ? 0
              : Math.min(C.runOut, built.length * 0.6);
          checkpointDue = cursor.s + runOut;
        }
      }

      // The co-driver's book: a turn opens a call (or deepens the open one
      // when it continues in the same direction with no straight between);
      // a straight closes it. Straight by R38's own test: a borrowed road's
      // gentle bend is walked as a turn of the road's radius (`borrow.ts`)
      // and is straight run to the rule, so it is no call either.
      if (built.kind === "turn" && built.dir && built.radius && straightPart(built) === 0) {
        const angle = built.length / built.radius;
        const severity = built.severity ?? "soft";
        if (openNote && openNote.dir === built.dir) {
          openNote.endS = cursor.s + built.length;
          openNote.angle += angle;
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[openNote.severity]) {
            openNote.severity = severity;
          }
        } else {
          openNote = {
            s: cursor.s,
            endS: cursor.s + built.length,
            dir: built.dir,
            severity,
            angle,
          };
          track.pacenotes.push(openNote);
        }
      } else {
        openNote = null;
      }

      // R34 — the segment's own path, WALKED BEFORE ANY OF IT IS BUILT.
      //
      // It is one walk, not two. The road's base height follows the ground
      // under it, so the profile cannot be a function of arc position that
      // anything may evaluate at will: it has to be walked, in order, from
      // where the last segment left the cursor. And a ford looks AHEAD —
      // it needs the lowest grade across the whole crossing before it can
      // decide where the water lies — so the walk has to be finished before
      // the first sample of the segment is emitted.
      //
      // Which leaves exactly one safe shape: walk once into this array, and
      // emit from the array. Walking it a second time to look ahead is the
      // trap — a probe that integrates the same heading in a slightly
      // different order diverges from the compiler by metres over a stage,
      // and then the water is at one height and the road that wades it at
      // another.
      const path: {
        x: number;
        z: number;
        heading: number;
        s: number;
        base: number;
        slope: number;
      }[] = [];
      // R47 — the bore the search found on this straight, walked as the
      // search walked it: from the plan's own portal to its own portal.
      const bore: Bore | null =
        built.feature === "tunnel" &&
        built.featureStart !== undefined &&
        built.featureEnd !== undefined
          ? {
              from: cursor.s + built.featureStart,
              to: cursor.s + built.featureEnd,
              land: land.heightAt,
            }
          : null;
      {
        let h = cursor.heading;
        let px = cursor.x;
        let pz = cursor.z;
        let ps = cursor.s;
        let pr = cursor.rollS;
        let baseY = cursor.baseY;
        let baseSlope = cursor.baseSlope;
        for (let i = 0; i < steps; i++) {
          if (curvature !== 0) h += curvature * step;
          px += Math.sin(h) * step;
          pz += Math.cos(h) * step;
          ps += step;
          pr += step * straightness(curvature);
          const bored = bore !== null && boredAt(bore, ps, px, pz, baseY);
          const next = followLand(baseY, baseSlope, px, pz, step, rolling(pr), bored);
          baseY = next.base;
          baseSlope = next.slope;
          path.push({ x: px, z: pz, heading: h, s: ps, base: baseY, slope: baseSlope });
        }
      }
      /** The two halves of the road's height at a local position in this
       * segment — the country it follows, and its own roll on top. The
       * crossings read both, and read them differently (see `fordDip`); the
       * samples simply add them. `u` is clamped to the segment, which is
       * what the aprons either side of a crossing want anyway. */
      const baseAt = (u: number): number =>
        path[Math.max(0, Math.min(steps - 1, Math.round(u / step) - 1))].base;
      const rollAt = (u: number): number => rolling(rollS0 + u);
      /** R12 — the valley a ford's water lies in: the bare land at the
       * crossing's middle, read across the road too (`valleyUnder`), or a
       * lake's own surface where the land is under one. */
      const valleyAt = (): number => {
        const mid =
          (built.featureStart ?? 0) + ((built.featureEnd ?? 0) - (built.featureStart ?? 0)) / 2;
        const at = path[Math.max(0, Math.min(steps - 1, Math.round(mid / step) - 1))];
        return valleyUnder(at, land.surfaceAt);
      };

      // R36 — the public road this straight goes over. Noted from the walk,
      // before any sample of it is emitted, so `shapeJunctions` finds the
      // platform waiting when it warps the road onto it. R41 — or the
      // railway, which gets no platform and a record of its own.
      if (built.overRoad) {
        if (track.highways[built.overRoad.road]?.kind === "rail") {
          noteRailCrossing(built.overRoad, path, rollAt, step, cursor.s + lipAt);
        } else {
          noteCrossing(built.overRoad, path, rollAt, step);
        }
      }

      // R17 — a surface change that falls ON the segment's first sample.
      // The walk below flips between two samples, which cannot express a
      // flip at zero: seed 3's join corner was a 15 m turn whose whole
      // length is inside the main road's mat, so the crossing was at the
      // corner's very start and the stage came out with a junction on it
      // and not one metre of tarmac.
      if (flipAt === 0) pavedNow = !pavedNow;
      for (let i = 0; i < steps; i++) {
        const uPrev = i * step;
        const u = uPrev + step;
        const at = path[i];
        if (flipAt > 0 && uPrev < flipAt && u >= flipAt) pavedNow = !pavedNow;
        cursor.heading = at.heading;
        cursor.x = at.x;
        cursor.z = at.z;
        cursor.s = at.s;
        cursor.rollS += step * straightness(curvature);
        cursor.baseY = at.base;
        cursor.baseSlope = at.slope;
        // The lip flag lands on the last ramp sample: the one the car
        // leaves. That sample sits at full lip height; past it the road is
        // back at grade, which is the drop that throws the car.
        const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
        const dip = fordDip(built, u, baseAt, rollAt, valleyAt);
        const deckY = bridgeDeck(built, u, baseAt, rollAt);
        // A crossing is a ford OR a deck OR a culvert, never two: the
        // wheels go through the water, ride over it on a deck, or ride
        // over it on the road's own fill with the water in a pipe under
        // them (R12, R13).
        const crossed = inCrossing(built, u);
        const bridge = crossed && isBridge(built);
        const culvert = built.crossing === "culvert";
        const ford = crossed && !bridge && !culvert;
        // R12 — the culvert is written down as the walk passes its middle:
        // the stream's level is the valley's, the pipe runs square across
        // the road, and the road over it is ordinary road.
        if (culvert && built.featureStart !== undefined && built.featureEnd !== undefined) {
          const midU = (built.featureStart + built.featureEnd) / 2;
          if (uPrev < midU && u >= midU) {
            track.culverts.push({
              x: cursor.x,
              z: cursor.z,
              s: cursor.s,
              heading: cursor.heading,
              waterY: valleyAt() - R.water.bedDepth,
              halfWidth: R.water.culvert.stream,
              edge: track.width / 2 + R.water.fordOutside,
            });
          }
        }
        // R36 — and the road width the route spends on a public road it is
        // crossing is sealed, because it is on one.
        const paved = !ford && (pavedNow || onCrossingSeal(cursor.x, cursor.z));
        // R47 — inside the bore the sample is a tunnel's, as long as the
        // country stands a brow's depth over the road there: the search
        // found the portals on a coarser profile, and where the compiled
        // road comes out from under the shoulder a few metres before that
        // profile said, the mouth moves back to the rock.
        const tunnel =
          bore !== null &&
          built.featureStart !== undefined &&
          built.featureEnd !== undefined &&
          u >= built.featureStart &&
          u <= built.featureEnd &&
          land.heightAt(cursor.x, cursor.z) - at.base >= R.tunnel.brow;
        const crown =
          dip ??
          deckY ??
          at.base +
            rolling(cursor.rollS) +
            (jump ? (built.lipHeight ?? 2) : segmentElevation(built, u));
        // R47 — ABOVE THE SNOWLINE THE ROAD IS SNOW, whatever it was laid
        // as: a packed snow road, loose to everything about its shape and
        // a surface of its own to the physics. Not in a bore, and not on
        // the water or a deck over it. The line is the country's own or
        // the climate's frost line, whichever stands lower (climate.ts):
        // a winter brings the whole stage under it, and the snow is as
        // hard as the air at THIS height makes it.
        const snowy = !tunnel && !ford && !bridge && followsLand && crown > snowline;
        // R48 — ...AND WHERE THE ROAD IS ON A FROZEN LAKE IT IS ICE, which
        // outranks the snow: the sheet is swept by the wind and by whoever
        // opened the crossing, and it is bare. Asked of the same land field
        // the route was planned against, so the samples that come out ice
        // are exactly the ones the search was allowed to draw over water.
        const iceLevel =
          !tunnel && !ford && !bridge && followsLand ? land.iceAt(cursor.x, cursor.z) : null;
        // ...ON the sheet, and not merely over it: a road standing metres
        // off a frozen body is an embankment across it, and an embankment
        // is made of whatever the rest of the road is made of (R48's
        // `lift`, which the search refuses a line over).
        const onIce = iceLevel !== null && Math.abs(crown - iceLevel) <= R.ice.onSheet;
        const surface: Surface = onIce
          ? "ice"
          : ford
            ? "water"
            : snowy
              ? "snow"
              : paved
                ? "asphalt"
                : loose;
        const bite = surface === "snow" ? snowBite(temperatureAt(track.climate, crown)) : 1;
        // R47 — ...and how much of the winter is still LYING on it. A road
        // is bladed and driven, so it carries a fraction of the blanket
        // standing in the field beside it (`roadSnow`) — and that fraction
        // is thinned again across the width by whatever wore the tracks
        // into it (road.ts, `crossOffset`). Read at the crown's own height,
        // like the bite, because both are facts about the air up here.
        const snow = surface === "snow" ? roadSnow(temperatureAt(track.climate, crown)) : 0;
        const sample: TrackSample = {
          x: cursor.x,
          z: cursor.z,
          heading: cursor.heading,
          elevation:
            crown +
            // R33 — the grain, last: a ford's flat water and a bridge's deck
            // get none (the builder returns 0 for both), so the only thing
            // it ever roughens is road.
            // R33 — and the bumps keep off anything a CROSSING shaped. Not
            // just the water and the deck: the ford's APRON is graded down
            // to flat water over tens of metres (R12), and a road that dips
            // a few centimetres below the water it is easing into is water
            // standing on a rise.
            // R47 — a bore is driven smooth: no grain inside it.
            bumps(cursor.s, surface, bridge || dip !== null || deckY !== null || tunnel),
          surface,
          bite,
          snow,
          deck: bridge ? ((built.crossing ?? "timber") as BridgeDeck) : null,
          tunnel,
          lift: 0,
          jump,
          s: cursor.s,
          curvature,
          bank: 0,
          flat: 0,
          width:
            track.width *
            widthAt(cursor.s, surface, bridge || dip !== null || deckY !== null, curvature),
        };
        sample.bank = bankRate(curvature, sample);
        track.samples.push(sample);
        rawY.push(sample.elevation);
        rawWidth.push(sample.width);
        bareWidth.push(sample.width);
        bareBank.push(sample.bank);
        // R47 — a board stands beside the road, and in a bore there is no
        // beside: a split due inside one waits for the far portal.
        if (checkpointDue >= 0 && cursor.s >= checkpointDue && !tunnel) {
          track.checkpoints.push({ s: cursor.s, index: track.samples.length - 1 });
          checkpointS = cursor.s;
          checkpointDue = -1;
        }

        if (cursor.x < b.minX) b.minX = cursor.x;
        if (cursor.x > b.maxX) b.maxX = cursor.x;
        if (cursor.z < b.minZ) b.minZ = cursor.z;
        if (cursor.z > b.maxZ) b.maxZ = cursor.z;
      }
      if (joinAtEnd) noteJunction(joinAtEnd, cursor, true);
    }
    track.length = cursor.s;
    // R28 — a board too close to the finish gate says nothing the line is
    // not about to say properly. The gate is only known once the segment
    // carrying the run-out has been walked, so the trim happens here rather
    // than at placement. An endless stage has no gate and never trims.
    // A circuit and a synthetic rig have no run-out: their line is the last
    // sample they own (`finishAt`), which on a circuit is the start line the
    // lap comes back to.
    const gate = track.endless ? null : (track.finishS ?? cursor.s);
    if (gate !== null) {
      const clear = gate - R.checkpoint.finishClear;
      while (
        track.checkpoints.length > 0 &&
        track.checkpoints[track.checkpoints.length - 1].s > clear
      ) {
        track.checkpoints.pop();
      }
    }
    paveLift(firstNew);
    bankRunoff(firstNew);
    widthRunoff(firstNew);
    shapeJunctions(firstNew);
    // R22 — and the lap is CLOSED IN HEIGHT here, after the last pass that
    // writes the route's own profile and before the first thing is hung off
    // it. Everything below anchors to the road it leaves: an arm starts at
    // its junction's height, a drive at the stage's bench, and every one of
    // them is held inside the verge cone (R31), which is read off these
    // samples. Close the lap after they are built and the ramp moves the
    // road out from under all of it — half a lap along, that is a metre or
    // more of tarmac hanging over the country beside it, with the arm's own
    // walk back down to the land turning into the cliff it never had room
    // to be.
    if (track.circuit && !track.endless) closeCircuitHeight(track, junctions);
    // The mouth is measured from the flared road, so it waits for the pass
    // that flares it — and for the minor arm on BOTH sides of the meeting
    // point to have been walked.
    buildForks();
    // R17 — the public roads the route never met, built along their own
    // lines before anything is placed beside a road: a town, a homestead
    // and a turbine all keep off every road there is, and this is one.
    buildPublic();
    // R39 — the towns, once the forks are built: a town stands on the
    // borrowed tarmac or on an abandoned arm, and keeps off every other
    // road there is.
    buildTowns();
    // R37 — and the homesteads last of all, because a drive keeps off every
    // road there is and off the towns, and the branches are only all there
    // once the forks are built.
    buildHomesteads();
    // R43 — and the energy after the settled places, because a turbine and
    // a fence both keep off a yard, and never the other way round.
    buildEnergy();
    // R45 — and the grid last of everything the compiler places: a tower
    // keeps off all of it, and nothing keeps off a tower. The car parks
    // come later still, in the terrain field, and they keep off it through
    // the footprint each tower leaves behind.
    buildPowerLines();
  };

  return { append };
}

/** R45 — the highest surface a WIRE has to clear at a point: the bare
 * country, or a ROAD standing over it — the route, an abandoned branch, a
 * homestead's drive, a public road the rally never met.
 *
 * Not `land.heightAt`, and the difference is a defect rather than a
 * refinement. A road is laid ALONG the country but not ON it: it rides
 * embankments and shelves, and the terrain blends the country up onto them
 * over its corridor range. A span planned against the bare land came out
 * clearing the BUILT road by seven metres where it had promised twelve,
 * and another was drawn through a branch's embankment seventy metres up.
 * The road is exactly where this matters, because it is the one place
 * anybody is standing under the wire.
 *
 * The shelf is modelled the way the terrain builds one: the road's own
 * level on its centerline, easing back to the country over `REACH`. It has
 * to EASE rather than hold — held flat across its whole reach it demanded
 * twelve metres of air over the highest road within a hundred and fifty
 * metres, which refused a third of the lines that had been fitting and
 * bought nothing, since no wire is ever measured against a road that far to
 * one side. A cell grid over every road's samples, so away from all of them
 * the answer is the country and one failed set lookup. */

/** Compile the GENERATED stage for a seed at a menu length. Finite lengths
 * build the whole stage; `endless` builds the opening stretch and hands
 * back a track that extends itself (track.extend) as the run progresses.
 * `knobs` are the generator's dials (rules.ts) — omitted, a stage comes out
 * at the default positions. `shape` (R22) picks between a sprint and a
 * circuit; an endless stage has no shape to pick — it never closes.
 * `climate` is the season and the cold the stage is driven in (climate.ts)
 * — omitted, a summer at the country's own temperature; it changes what the
 * road is MADE OF where the ground is frozen, never where the road goes.
 * `startApron` (R24) is how much run-up to lay behind the start gate, for a
 * MASS START too deep for the rule book's own — omitted, the rule book's. It
 * moves nothing about the route: the seed draws the same road whatever field
 * is standing on it, and what grows is the dirt behind the line, the shelf
 * under it and the room everything else is kept out of. */
export function compileStage(
  seed: number,
  length: StageLength = "medium",
  knobs?: Partial<StageKnobs>,
  shape: StageShape = "sprint",
  climate?: ClimateChoice,
  startApron?: number,
): Track {
  const dials = resolveKnobs(knobs);
  const weather = resolveClimate(climate, dials);
  const rolling = buildRolling(seed, dials);
  const paving = buildPaving(seed, dials.asphalt);
  const bumps = buildBumps(seed);
  const widthAt = buildWidth(seed);
  if (length !== "endless") {
    const circuit = shape === "circuit";
    const track = emptyTrack(seed, false, dials, weather, circuit, startApron);
    const plans = generateStage(seed, length, dials, shape, weather);
    // R17 — THE TARMAC, laid on the bare country from the seed alone and
    // rebuilt here identically to the copy the search planned against. It
    // is not handed over: both sides derive it, which is what keeps a track
    // a pure function of its seed however it was built.
    track.highways = layStageHighways(seed, dials, createLandField(seed, dials, weather), length);
    // R17 — the country the stage will occupy, walked before it is
    // compiled. A junction may only be built where the arm it abandons can
    // leave the map, and which way is out is a question about the whole box
    // that the cursor cannot answer halfway down it.
    createCompiler(
      track,
      rolling,
      paving,
      bumps,
      widthAt,
      planCountry(
        plans,
        track.width,
        rolling,
        dials,
        createLandField(seed, dials, weather),
        track.startApron,
      ),
      true,
      // R17 — a sprint is routed onto the tarmac; a circuit is not, yet —
      // and neither is a mountain stage (R47), whose seal is a height.
      !circuit && biomeRules(dials.biome).land.massif === null,
    ).append(plans);
    return track;
  }
  const track = emptyTrack(seed, true, dials, weather, false, startApron);
  const stream = createStageStream(seed, dials, weather);
  const compiler = createCompiler(
    track,
    rolling,
    paving,
    bumps,
    widthAt,
    undefined,
    true,
    false,
    stream,
  );
  track.extend = (upToS: number): boolean => {
    if (track.length >= upToS) return false;
    const plans = stream.extendTo(upToS);
    compiler.append(plans);
    return plans.length > 0;
  };
  track.extend(R.endless.initial);
  return track;
}

/** Compile a stage. Omitting `segments` compiles the seed's GENERATED stage
 * at the default (medium) length, rolling hills included; passing segments
 * builds a flat synthetic rig for tests and tooling — scripted physics
 * scenarios stay exactly scripted, on plain gravel unless the caller dials
 * asphalt in. */
export function compileTrack(
  seed: number,
  segments?: SegmentPlan[],
  knobs?: Partial<StageKnobs>,
  climate?: ClimateChoice,
): Track {
  if (segments === undefined) return compileStage(seed, "medium", knobs, "sprint", climate);
  const dials = resolveKnobs({ asphalt: 0, ...knobs });
  const track = emptyTrack(seed, false, dials, resolveClimate(climate, dials));
  // A synthetic rig is a measuring device: flat, smooth, straight-edged and
  // repeatable, so a physics test measures the car rather than the road
  // under it.
  createCompiler(
    track,
    () => 0,
    buildPaving(seed, dials.asphalt),
    () => 0,
    () => 1,
    // No country: a rig has no box for a junction's abandoned arm to leave,
    // and it does not follow the land either.
    undefined,
    false,
  ).append(segments);
  return track;
}

/** R25 — the arc position the CLOCK stops at: the finish gate where the
 * stage has one, the last sample where it has none (the synthetic rigs
 * `compileTrack` builds from a segment list), and null on an endless stage,
 * which never stops at all. */
export function finishAt(track: Track): number | null {
  if (track.endless) return null;
  if (track.finishS !== null) return track.finishS;
  // No run-out at all — a synthetic rig built from a segment list. Its gate
  // stands on the second-to-last sample rather than the last, so even there
  // a flying finish has a couple of metres of road to land on.
  return track.samples[Math.max(0, track.samples.length - 2)]?.s ?? track.length;
}

/** ...and the sample the gate itself stands on.
 *
 * Found by SEARCHING the samples rather than by dividing by `step`. Sample
 * spacing is only approximately `SAMPLE_STEP` — each segment divides its own
 * length into a whole number of steps — and the slack accumulates, so on a
 * long stage `s / step` misses by several meters. The gate is a thing the
 * player drives under at the exact moment the clock stops; it has to stand
 * on the line and not near it. */
export function finishIndex(track: Track): number {
  const at = finishAt(track);
  const samples = track.samples;
  if (at === null || samples.length === 0) return samples.length - 1;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < at) lo = mid + 1;
    else hi = mid;
  }
  // Whichever of the two straddling samples is actually nearest the line.
  if (lo > 0 && at - samples[lo - 1].s < samples[lo].s - at) return lo - 1;
  return lo;
}

/** Ground elevation of the road at arc position `s` (clamped). */
export function elevationAt(track: Track, s: number): number {
  const i = Math.min(track.samples.length - 1, Math.max(0, Math.floor(s / track.step)));
  return track.samples[i].elevation;
}
