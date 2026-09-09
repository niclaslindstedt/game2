// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): HOW THE LINE
// IS DRAWN — the length bands and the world each is searched inside, the
// opening and closing straights, the turn vocabulary and the runs between
// turns, how wide the road is, and the clearances the search validates a
// candidate against. Spread into `STAGE_RULES` by `rules-book.ts`.

import type { TurnSeverity } from "./rules-knobs.ts";

export const ROUTE_RULES = {
  /** R11 — the length bands, meters, and the world half-extent (R9) each is
   * searched inside. Bands are sized from the sim's measured bot pace
   * (~95–105 km/h on the current vocabulary) so the menu's minutes come out
   * roughly true: 1 / 3 / 5 / 7 minutes of driving. Bigger stages get a
   * bigger world so the search folds the line instead of fighting the
   * boundary. */
  stageLengths: {
    short: { minutes: 1, band: { min: 1450, max: 1800 }, worldBound: 900 },
    medium: { minutes: 3, band: { min: 4400, max: 5200 }, worldBound: 1500 },
    long: { minutes: 5, band: { min: 7400, max: 8400 }, worldBound: 2000 },
    xlong: { minutes: 7, band: { min: 10400, max: 11800 }, worldBound: 2500 },
  },

  /** The endless stage: sections stream ahead of the car forever. `horizon`
   * is how much compiled road is kept ahead of the car; `tailWindow` is how
   * far back the self-distance guarantee (R10) reaches — road behind that is
   * out of sight and out of the search's memory, which is what lets the
   * stream run in a bounded working set. */
  endless: {
    horizon: 700,
    tailWindow: 1200,
    /** How much road the very first compile materializes, meters — enough
     * that the grid never sees the world being built. */
    initial: 1100,
    /** The stream is point-to-point: it follows a course bearing that
     * random-walks by up to `courseDrift` radians per segment, and the
     * road's heading stays within `maxCourseError` of it (turns that would
     * stray further are steered back). That forward pull is what keeps an
     * unbounded walk from curling into its own tail — and what makes an
     * endless run read as a journey rather than a scribble. The error
     * budget still clears a 150° hairpin. */
    courseDrift: 0.12,
    maxCourseError: 2.6,
    /** How far the search runs ahead of the road it hands out. Only plans
     * this far behind the generation frontier are final; inside the lag the
     * stream may still backtrack out of a pocket, exactly like the finite
     * search — the one escape hatch an infinite road cannot live without. */
    commitLag: 900,
    /** R35 — how many failed placements in a row the stream tries before
     * giving the water another rung of its setback. The finite search gets
     * to throw a whole attempt away and start again; a stream has to get
     * past whatever is in front of it, so it squeezes instead. Small
     * enough that a genuine bottleneck is through in a few backtracks,
     * large enough that ordinary boxing-in is solved by backtracking
     * rather than by walking to the water's edge. */
    wetPatience: 12,
  },

  /** R22 — the circuit. A lap is the stage length's band divided by the
   * laps a circuit is raced over, so "medium" means the same three minutes
   * of driving whichever shape it is built in — with a floor, because a
   * ring shorter than that is a roundabout and not a race track.
   *
   * The search steers the line around a ring by a bearing that turns once
   * through a full circle over `target` meters (radius `target / 2π`), then
   * CLOSES it: from `closeFrom` of the way round, every iteration tries to
   * solve a turn-straight-turn back onto the grid's own pose. The solve is
   * exact — it lands on the start line to the millimeter — so the only
   * question is whether the corners it asks for are ones this generator
   * would have drawn anyway, which is what `closeRadii` and R3's own angle
   * bands decide. */
  circuit: {
    /** Laps a circuit is raced over, and the divisor the lap band uses. */
    laps: 3,
    /** Shortest lap worth building, m. */
    minLap: 1150,
    /** How far round the ring before the line stops following the ring
     * bearing and starts being steered at the grid itself. The CLOSURE is
     * not gated on this — it is tried wherever one could land inside the
     * band — but a line that never turns for home rarely gives it the
     * chance. */
    homeFrom: 0.7,
    /** How many radii per severity the closure is solved at. The radii
     * themselves come out of `turn` — a closing corner is drawn from the
     * same vocabulary as every other corner (R3), and the solve's job is
     * to find a place on the lap where one of them fits. */
    closeRadii: 3,
    /** The straight between the closure's two arcs. The ceiling decides how
     * far from the grid a closure can be solved at all, so it is also the
     * one number that says how often a lap manages to shut.
     *
     * It is R38's cap (`straightRun.max`), and no longer than that. A lap
     * does want a main straight — somewhere to pull top gear down before
     * the line — but the closure is not where it comes from: a straight
     * that long is a runway bolted onto the end of the lap, and it is the
     * one the driver meets on every single lap. What a circuit gets
     * instead is the closing straight and the grid's own opening run at
     * the line, which are R1's and R2's and are a start-finish straight by
     * design. */
    closeStraight: { min: 25, max: 135 },
  },

  /** R1/R2 — opening and closing straights, meters. */
  openingStraight: 110,
  closingStraight: 80,

  /** R1 — and what the opening straight has to be long enough FOR. A rally
   * start is one car and needs nothing; a HEADS-UP start is the whole field
   * stood on the apron behind the gate, and the back row is `startZone.apron`
   * metres further from the first corner than pole is. So the road off the
   * line has to hold the grid's own depth plus a run for it to string out
   * on, and the first corner may not be a slow one — sixteen cars arriving
   * at a hairpin still stacked is a pile-up, not a start.
   *
   * `launch` is the run measured from the GATE (the apron is behind it and
   * is added on top); the opening straight is drawn at least this long.
   * `firstTurn` is the tightest severity the corner at the end of it may be
   * drawn from. */
  launch: { run: 150, firstTurn: "soft" as TurnSeverity },

  /** R25 — the RUN-OUT: road built past a sprint's finish gate, meters. The clock
   * stops at the line and the car keeps going, so there has to be
   * somewhere for it to go. Long enough to shed rally pace without using
   * the brakes as a wall — a car crossing at 50 m/s coasts to walking pace
   * in well under this — and long enough that the road still reaches the
   * horizon in the shot the finish is watched from, which is what stops
   * the gate reading as the end of the world. It is NOT part of the raced
   * stage: R11's length band measures the road up to the line. */
  runOut: 220,

  /** Straight vocabulary, meters. Short breathers between corners are the
   * norm; the long bucket is where the top gears live, drawn less often so
   * the stage reads as corners connected by straights rather than the other
   * way around. The long bucket's ceiling is R38's cap — the longest
   * straight the vocabulary may draw is the longest run the route may
   * make. */
  straightShort: { min: 30, max: 70 },
  straightLong: { min: 100, max: 135 },
  longStraightChance: 0.4,

  /** R38 — THE STRAIGHT RUN: the most road the route may cover without a
   * corner in it.
   *
   * `max` is stated in METRES because that is what the search can count,
   * but the number behind it is a TIME: five seconds, which is as long as
   * anyone wants to sit holding a wheel that is doing nothing. Metres come
   * out of seconds through the speed the road is met at, and the binding
   * case is not the fast one — it is a straight taken OUT OF A SLOW CORNER,
   * where the car spends the first half of it accelerating. So the cap is
   * set by the slow case and the fast case comes in well under it.
   *
   * MEASURED, on the analyzer's reference profile over seeds 1-24 at
   * medium: at 145 m the slowest exits ran to 5.0-5.1 s and seven runs on
   * six seeds sat over the line; at 135 the worst anywhere is 4.9 and
   * nothing is over. It is the ceiling of the long straight bucket too —
   * the longest straight the vocabulary may draw is the longest run the
   * route may make — and it clears everything a straight has to be long
   * enough to CARRY: a jump with its run-up and landing (`jump.minStraight`
   * is 107), a crest, a bridge, and R36's passage over a public road.
   *
   * It is a RUN and not a segment. Two straights drawn back to back are one
   * straight to the person driving them, and stringing four of them
   * together is how a stage came out with four hundred metres of nothing in
   * the middle of it — every one of them legal on its own.
   *
   * `borrowed` is the same five seconds on TARMAC (R17), and it is longer
   * because the road under it is faster: a sealed stretch is entered off a
   * junction the car takes at speed and held at speed, where a gravel
   * straight is most often taken out of a corner the car has had to stop
   * for. One rule, one budget in seconds, two proxies for it in metres,
   * each measured against the speed its own road is driven at — and the
   * check in `analysis/drive.ts` reads the clock on both, so neither proxy
   * can drift away from the rule it stands in for.
   *
   * It is also what makes R17 possible at all. A public road is not a
   * rally stage: it is laid to get somewhere, and it runs straight for two
   * or three hundred metres at a time between its bends whatever the
   * generator does. At 135 m the rally could borrow almost nothing —
   * measured over seeds 1-8 at long, 95% of every stretch the search
   * looked at was refused and the `asphalt` dial stopped buying tarmac.
   *
   * `bend` is how wide a corner may be and still count as one, m. Under it
   * the road breaks the run; over it the run carries straight on through
   * the bend. The rally's own vocabulary never draws anything near this
   * wide (a soft turn tops out at 100 m), so the number is there for the
   * borrowed road: one of those bends at 220 m at its tightest and runs
   * arrow-straight for kilometres at its loosest, and only the second of
   * those is a straight. `ANALYSIS.drive.straightRadius` measures the
   * built stage against the same radius, for the same reason. */
  straightRun: { max: 135, borrowed: 220, bend: 700 },

  /** R3 — turn vocabulary: radius in meters, angle in radians. Soft turns
   * are taken flat-out or near it; mediums are real corners that ask for a
   * lift and a line; hards are the drift moments — down to proper hairpins
   * (the angle ceiling is ~150°). */
  turn: {
    soft: {
      radius: { min: 55, max: 100 },
      angle: { min: Math.PI / 6, max: Math.PI / 2.4 },
    },
    medium: {
      radius: { min: 32, max: 55 },
      angle: { min: Math.PI / 4.5, max: Math.PI / 1.6 },
    },
    hard: {
      radius: { min: 13, max: 30 },
      angle: { min: Math.PI / 3.2, max: Math.PI * 0.85 },
    },
  },

  /** Severity mix for a drawn turn. Hard needs the braking zone a preceding
   * straight provides (R4); when the previous segment is a turn, the hard
   * share re-rolls as medium so the corner density survives without an
   * unbrakeable ambush. The remainder is soft. */
  severityChance: { hard: 0.45, medium: 0.32 },

  /** R5 — cap on same-direction turns in a row, and on how much heading a
   * same-direction run may accumulate. The angle cap kills near-loops
   * before the self-distance probe has to: two tight turns summing much
   * past a half circle curl the line back onto itself, which R10 would
   * reject anyway after the geometry is built and probed. */
  maxSameDirectionTurns: 2,
  maxSameDirectionAngle: Math.PI * 1.15,

  /** R21 — road width, meters (full width; centerline to edge is half).
   * The `width` dial reads this band: the low end is a real country lane,
   * where the road is the only line and a corner is a commitment; the high
   * end is an arcade boulevard with room to place the car sideways and
   * still land on tarmac. The default position (0.55) is the width the
   * turn vocabulary and the drift tuning were measured against, so moving
   * the dial changes the stage's character and not its rules. */
  roadWidth: { min: 9, max: 22 },

  /** R8 — crest placement. A blind brow is a long, gentle rise that hides
   * what is past it, not a ramp: the height/length ratio here keeps its
   * steepest grade around 13%, in the same band as the rolling ground it
   * sits on. */
  crest: {
    minStraight: 70,
    height: { min: 1.2, max: 2.6 },
    length: { min: 60, max: 100 },
  },

  /** R9 — soft margin inside the world bound where turn-back kicks in: at
   * least `min` meters, growing with the world (`frac` of the bound) so a
   * long stage starts circulating well before it can drive itself into a
   * corner it then has to backtrack out of. (The bound itself is per stage
   * length, `stageLengths[*].worldBound`.) */
  boundMargin: { min: 240, frac: 0.18 },

  /** R10 — floor under the distance between non-adjacent centerline points,
   * m. The distance actually enforced is R23's `roadClear`, which grows with
   * the road: this is only the least it may ever be. */
  minSelfDistance: 30,

  /** R23 — the room a road keeps to itself. `margin` is the bare country
   * left between two corridors' outer LIPS, m; what the rule enforces is
   * that plus both corridors' full reach, so it widens with the `width`
   * dial instead of letting a boulevard-wide stage lay its mats over each
   * other. The margin is the most room that can be asked for without
   * costing the stage vocabulary its tightest folds: the hairpin's two arms
   * are a road's width apart by definition, and pushing this further starts
   * rejecting hard corner combinations instead of crossings (the sim's
   * severity mix is the measurement that says where the line is). */
  roadClear: { margin: 13 },

  /** R24 — the start zone. `apron` is the dirt extrapolated straight past
   * each stage end, m: the run-up before the gate and the run-off past the
   * flying finish. Road is drawn on it, the terrain lays its shelf under it
   * and the physics rides it, so it is stage and it is kept clear like
   * stage. `fromArc` is how far the route has to have travelled before it
   * counts as coming BACK to the start — inside it the road is simply
   * leaving, which is not a violation of anything. */
  startZone: {
    /** Meters of dirt extrapolated straight off each stage end. Its length
     * is set by the HEADS-UP GRID, because that is the only thing that
     * needs it long: a mass start stands the whole field on it behind the
     * gate, one car per row (`sim/grid.ts`), so the apron is
     * `(field - 1) * TUNING.massStart.rowGap` plus a car's own length. At
     * 3.5 m a row and a sixteen-car field that is 55 m, rounded up — and
     * the apron is what `GRID_MAX` is derived FROM, so lengthening it here
     * is how a deeper grid gets built. A rally start uses the same road as
     * a run-up and does not care how much of it there is.
     *
     * It is the FLOOR under the run-up rather than its length. Every stage
     * gets exactly this much, and a stage compiled for a grid too deep for
     * it gets what that grid needs instead (`apronForGrid`, carried as
     * `Track.startApron`) — the drawn dirt, the terrain shelf and the room
     * the branches keep off it all read the track rather than this. What
     * this number still decides on its own is the START ZONE the search
     * keeps the route out of, which is why it stays a rule: the road a seed
     * draws must not depend on how many cars turned up. */
    apron: 56,
    /** How far the route has to have travelled before it counts as coming
     * BACK to the start (R24) — inside it the road is simply leaving. */
    fromArc: 160,
  },

  /** Feature probabilities per eligible straight. The water entry is the
   * chance of ANY crossing; the `water` knob scales it and splits it into
   * fords and bridges. */
  featureChance: { jump: 0.4, water: 0.35, crest: 0.3 },

  /** Chance the next segment is a turn rather than a straight. */
  turnChance: 0.72,
} as const;
