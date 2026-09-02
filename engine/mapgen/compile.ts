// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags — plus the
// pacenote list the HUD calls from. One compilation is the single geometric
// truth for a stage — the car's ground height, the road mesh, and the bot's
// racing line all read these samples. The compiler is incremental: an
// endless stage keeps appending to the same track as its stream produces
// new sections.

import type {
  Crossing,
  SegmentPlan,
  StageKnobs,
  StageLength,
  StageShape,
  TurnSeverity,
} from "./rules.ts";
import { SAMPLE_STEP, STAGE_RULES as R, knobScale, resolveKnobs } from "./rules.ts";
import { generateStage, layStageHighways } from "./generate.ts";
import { createStageStream } from "./endless.ts";
import { createRng } from "../lib/prng.ts";
import { cellKey } from "../lib/math.ts";
import { hash2 } from "../lib/noise.ts";
import { createLandField } from "./land.ts";
import { junctionFlat, junctionMainEdge, junctionPlatformY, ROAD_CROSS } from "./road.ts";
import { buildSpur, cutSpur, placeBlock, SPUR, type ShelfBand, type Spur } from "./spurs.ts";
import { placeHomesteads, type Homestead } from "./homesteads.ts";
import { placeTowns, type Town } from "./towns.ts";
import { createHighwayNetwork, type Highway } from "./highway.ts";

export type Surface = "gravel" | "asphalt" | "water";

/** What carries a bridge over its water — everything except wading it. */
export type BridgeDeck = Exclude<Crossing, "ford">;

/** R17 — where the route meets the road it borrows. A junction is a PLACE,
 * not a seam. It sits ON the route's centerline, at a corner: the sealed
 * road — the MAIN road — runs straight through it, made of the route's own
 * collinear arm on one side and the abandoned branch on the other, and the
 * gravel road the route turns onto (or off) is the MINOR one, which arrives
 * at an angle and opens out into a MOUTH where it meets the seal.
 *
 * The main road is the one that does not notice: same width, same surface,
 * its centre line running straight past the crossing. All the giving way is
 * the minor road's — it is the one that flares, loses its border and stops
 * at the main road's edge. Everything inside the platform is one graded
 * plane. */
export type RoadJunction = {
  /** The point on the route's centerline where the two roads meet — the
   * tangent point of the corner, which is where a surveyor would have put
   * the junction and where the branch leaves from. */
  x: number;
  z: number;
  /** The platform's grade there, m, and the plane it lies on: the main
   * road's own slope, carried across the whole junction so both roads and
   * the ground between them agree to the millimeter. */
  y: number;
  grade: { x: number; z: number };
  /** Heading of the MAIN road through the junction, radians — the branch
   * leaves along it and the route's collinear arm runs back down it. */
  heading: number;
  /** Signed curvature of the MINOR road as it leaves the meeting point on
   * that same tangent, 1/m. Positive turns toward the main road's right;
   * the gore between the two opens on that side. */
  curve: number;
  /** Full width of both carriageways here, m. */
  width: number;
  /** How far along the main road the platform reaches, m. Inside it
   * neither road has a verge, a camber, an edge line or a wheel track: a
   * junction is a hole cut in both roads' borders, graded flat and paved
   * over, which is what makes the two of them one surface. */
  reach: number;
  /** ...and how far ACROSS the main road that graded area runs, m — wide
   * enough to carry the whole mouth the dirt road opens, mat and verge. */
  spread: number;
  /** How much of `reach` survives on the side the minor road does NOT open
   * toward, as a share (`JunctionPlatform.behind`). Left unset on a
   * junction, which is lopsided; 1 on a crossing, which is not. */
  behind?: number;
  /** How much of a junction's gravel drag-out this place gets, as a share
   * (`JunctionPlatform.drag`). Unset on a junction, which gets all of it;
   * `crossing.drag` on a crossing, where nobody turns. */
  drag?: number;
  /** Arc position on the stage (association / pruning). */
  s: number;
  /** True where the route JOINS the sealed road, false where it leaves.
   * Meaningless on a crossing, where the route does neither. */
  joining: boolean;
  /** R36 — true where this is a CROSSING rather than a junction: the route
   * goes square over the public road and out the far side, so the minor
   * road has two collinear arms instead of one, the sealed road has TWO
   * abandoned arms instead of one, and the whole platform stands `stand`
   * proud of the country the rally crossed it on. */
  crossing?: boolean;
};

export type TrackSample = {
  x: number;
  z: number;
  /** Direction of travel at this sample, radians. */
  heading: number;
  /** Ground height of the road at this sample, meters — the height of the
   * CROWN, which is the highest line across the road (road.ts shapes the
   * rest of the width around it). */
  elevation: number;
  surface: Surface;
  /** Set where the road is a bridge DECK: the surface is road, but there is
   * a channel of water under it instead of ground, and the kind says what
   * carries it — trunks and planks, or concrete piers (R13). */
  deck: BridgeDeck | null;
  /** How proud of the surrounding ground the road mat stands here, m —
   * zero on gravel, up to `ROAD_CROSS.asphaltLift` on a paved run, ramped
   * through the joint between the two. The verge beside the road, and the
   * terrain shelf under it, both hang off this. */
  lift: number;
  /** True on the takeoff lip — the sample where the ramp ends in a drop. */
  jump: boolean;
  /** Arc length from the stage start, meters. */
  s: number;
  /** Signed curvature (1/radius) of the plan the sample sits on, for the
   * bot and the pacenotes; positive means the heading is growing. */
  curvature: number;
  /** R19 — the corner's cross-fall here, m per m: the road tilts by
   * `-bank * lateral`, so a right-hand turn (curvature > 0) banks positive
   * and stands its left, outer edge proud. Rolled in and out over
   * `bank.runoff` so the car settles onto it. */
  bank: number;
  /** R17 — how much this sample is warped flat onto a junction platform,
   * 0 (open road) to 1 (in the junction). */
  flat: number;
  /** R33 — the road's FULL WIDTH here, m. `track.width` is the nominal the
   * stage was built at; a gravel road wanders either side of it, because a
   * blade cuts wider on one pass than the next and the verges creep in
   * where nothing has run wide for a season. Sealed road, a bridge deck and
   * a junction platform hold the nominal exactly — all three are laid or
   * built rather than bladed.
   *
   * Everything that asks how wide the road is HERE reads this; `track.width`
   * remains the right answer to how wide the road IS, which is what the
   * placement heuristics and the search's clearances want. */
  width: number;
  /** R17 — how far the MAT sits off the centerline here, m, positive to the
   * right of travel. Zero everywhere but a junction's mouth, which opens on
   * one side only (see `RoadShape.shift`). The mat therefore spans
   * `shift ± width / 2`, and anything that asks whether a point is ON the
   * road has to say so. */
  shift?: number;
};

/** One co-driver call: a turn (or a run of same-direction turns) with its
 * severity and total angle. `dir` is in ENGINE map-space — positive grows
 * the heading, which the chase cam reads as a LEFT turn (the rendered world
 * mirrors the engine's map view; the app flips once, like steering). */
export type Pacenote = {
  /** Arc position where the turn begins, meters. */
  s: number;
  /** Arc position where it ends, meters. */
  endS: number;
  dir: 1 | -1;
  severity: TurnSeverity;
  /** Total heading change through the note, radians — the LONG modifier. */
  angle: number;
};

/** R28 — a CHECKPOINT: a place on the stage the run is timed through, and
 * the place a car that drowned, wedged itself or gave up is put back on the
 * road. Only the sample it stands on is recorded — the pose is read off
 * `track.samples[index]`, whose grade the compiler's later passes (paving
 * lift, bank runoff, junction platforms) are still free to rewrite. */
export type Checkpoint = {
  /** Arc position along the stage, meters — `samples[index].s`, which no
   * later pass moves. */
  s: number;
  index: number;
};

export type Track = {
  seed: number;
  segments: SegmentPlan[];
  samples: TrackSample[];
  /** Sample spacing, meters. */
  step: number;
  /** Total stage length, meters. */
  length: number;
  /** Full road width, meters. */
  width: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Co-driver calls, in stage order. On an endless stage the tail note can
   * still grow while its turn combination is at the streaming frontier. */
  pacenotes: Pacenote[];
  /** R28 — the split boards, in stage order. Every one stands just past a
   * corner's exit, roughly `checkpoint.spacing` seconds of driving apart. */
  checkpoints: Checkpoint[];
  /** True when the stage streams forever instead of finishing. */
  endless: boolean;
  /** R22 — true when the stage is a CIRCUIT: the last sample lands back on
   * the first, on the same heading, so the start line is also the finish
   * line and the run can be raced over laps. */
  circuit: boolean;
  /** R25 — where a SPRINT's finish gate stands, meters along the stage. The
   * samples do not stop there: `STAGE_RULES.runOut` meters of road carry on
   * past it for the car to coast down, so `length` is the longer number.
   * Null where there is no run-out to coast down: a circuit (whose finish is
   * its own start line, with a whole lap already the other side of it), an
   * endless stage, and the synthetic rigs `compileTrack` builds from a
   * segment list — all of which finish at their last sample. */
  finishS: number | null;
  /** The dials this stage was generated with — carried on the track so the
   * terrain field, the renderer and the tooling all shape themselves from
   * the same set without being handed it separately. */
  knobs: StageKnobs;
  /** R17 — THE TARMAC this country carries, laid before the rally was
   * routed across it (`highway.ts`): whole public roads, edge of the map to
   * edge of the map, that the route may meet at a junction and borrow but
   * may never cross.
   *
   * On the track rather than thrown away with the search because three
   * different readers need the same answer to "where are the roads": the
   * compiler cuts the arms of every borrowed junction out of these lines,
   * the analysis measures the gravel against them, and anything later that
   * wants to know where a place would BE — a farm, a hamlet, a signpost —
   * wants a road to put it on. Empty on a synthetic rig, and on any stage
   * whose country would not carry a road (a seed that is mostly water). */
  highways: Highway[];
  /** R17 — the branches the route abandons at every asphalt junction: real
   * road, taped off, there to be explored by anyone who ignores the tape. */
  spurs: Spur[];
  /** R37 — the homesteads off the stage: each a house on its yard, the
   * cars outside it, the lane down to the road and the barrier across the
   * lane's mouth. Their own list, not among the branches: a drive is a road
   * that ends at a house, which is everything a branch is not allowed to
   * be. */
  homesteads: Homestead[];
  /** R39 — the towns: each a village of lots along a piece of sealed road
   * — the borrowed run the rally drives through, or the arm the tape shuts
   * at a junction — with a building on every lot and the cars outside it.
   * The street itself is road already on the track; this is what stands
   * beside it. */
  towns: Town[];
  /** R17 — the junctions themselves: where two roads MEET, and the paved
   * apron that makes them one surface there instead of two ribbons that
   * happen to touch. The terrain flattens it and the renderer paves it. */
  junctions: RoadJunction[];
  /** Endless only: materialize road until `length >= upToS`. Deterministic
   * in the seed — when it is called makes no difference to what it builds.
   * Returns true when new samples were appended. */
  extend?: (upToS: number) => boolean;
};

export { SAMPLE_STEP };

const SEVERITY_RANK: Record<TurnSeverity, number> = { soft: 0, medium: 1, hard: 2 };

/** Elevation profile within one segment at local arc position `u`. */
function segmentElevation(plan: SegmentPlan, u: number): number {
  if (plan.feature === "jump" && plan.featureStart !== undefined && plan.featureEnd !== undefined) {
    // Ramp rises to the lip, then the ground drops back to grade — the drop
    // is what throws the car. Past the lip the road is flat landing zone.
    // The rise EASES IN (steepest right at the lip): a ramp that flattens
    // as it reaches the top — a smoothstep — leaves the car with no upward
    // speed at the one moment it matters, and a jump that does not jump.
    if (u >= plan.featureStart && u < plan.featureEnd) {
      const t = (u - plan.featureStart) / (plan.featureEnd - plan.featureStart);
      return (plan.lipHeight ?? 2) * t * t;
    }
    return 0;
  }
  if (
    plan.feature === "crest" &&
    plan.featureStart !== undefined &&
    plan.featureEnd !== undefined
  ) {
    if (u >= plan.featureStart && u <= plan.featureEnd) {
      const t = (u - plan.featureStart) / (plan.featureEnd - plan.featureStart);
      return (plan.crestHeight ?? 2) * Math.sin(t * Math.PI) ** 2;
    }
    return 0;
  }
  return 0;
}

/** True inside a segment's water span — the ford the wheels go through, or
 * the gap a deck spans (R13); `crossing` tells the two apart. */
function inCrossing(plan: SegmentPlan, u: number): boolean {
  return (
    plan.feature === "water" &&
    plan.featureStart !== undefined &&
    plan.featureEnd !== undefined &&
    u >= plan.featureStart &&
    u <= plan.featureEnd
  );
}

function isBridge(plan: SegmentPlan): boolean {
  return plan.feature === "water" && plan.crossing !== undefined && plan.crossing !== "ford";
}

/** R15 — the paving field. Asphalt is laid in RUNS: the stage is cut into
 * sections a few hundred meters long and each is sealed with probability
 * `asphalt`, which makes the dial the expected share of the stage that
 * comes out paved. The mat also has to START somewhere — `liftAt` ramps
 * the road's height up through the joint, so a paved section begins with a
 * lip of new surfacing rather than a step in the ground.
 *
 * Sections are drawn lazily and cached, so an endless stage pays only for
 * the road it has actually built, and what a seed lays down never depends
 * on how the calls were chunked. */
type Paving = {
  pavedAt: (s: number) => boolean;
  liftAt: (s: number) => number;
};

function buildPaving(seed: number, asphalt: number): Paving {
  const rng = createRng((seed ^ 0x2f9a3c17) >>> 0);
  const blocks: { from: number; to: number; paved: boolean }[] = [];
  let end = 0;
  const sealed = asphalt >= R.paving.floor;
  const allSealed = asphalt > 1 - R.paving.floor;
  // The stage opens on gravel, part-way through a gravel run — every seed
  // meets its first junction somewhere else.
  let paved = false;
  let first = true;
  const extend = (toS: number): void => {
    while (end <= toS + R.paving.run.max) {
      if (!sealed || allSealed) {
        blocks.push({ from: end, to: end + 1e6, paved: allSealed });
        end += 1e6;
        continue;
      }
      const run = rng.range(R.paving.run.min, R.paving.run.max);
      // The gravel between two sealed sections is however long it has to
      // be for the dial to come true — that is what makes `asphalt` the
      // SHARE of the stage rather than a coin flip per section.
      const gap = Math.max(
        R.paving.gap.min,
        Math.min(R.paving.gap.max, (run * (1 - asphalt)) / asphalt),
      );
      const length = paved ? run : gap * (first ? rng.range(0.25, 1) : 1);
      blocks.push({ from: end, to: end + length, paved });
      end += length;
      paved = !paved;
      first = false;
    }
  };
  const blockAt = (s: number): { from: number; to: number; paved: boolean } => {
    extend(s);
    const at = Math.max(0, s);
    let lo = 0;
    let hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].to <= at) lo = mid + 1;
      else hi = mid;
    }
    return blocks[lo];
  };
  return {
    pavedAt: (s) => blockAt(s).paved,
    liftAt: (s) => {
      const block = blockAt(s);
      if (!block.paved) return 0;
      // Ramp in from both ends of the run — half a ramp at the very start
      // of a stage that opens paved is fine, the apron carries it.
      const into = Math.min(s - block.from, block.to - s);
      const t = Math.min(1, Math.max(0, into / ROAD_CROSS.liftRamp));
      return ROAD_CROSS.asphaltLift * t * t * (3 - 2 * t);
    },
  };
}

/** Lattice size for the elevation noise. The shortest octave's lattice is
 * tens of meters apart, so even a long stage never gets far enough along
 * the profile to notice the wrap. */
const NOISE_LATTICE = 256;

/** Seeded 1-D value noise: random heights every `spacing` meters, joined by
 * smootherstep so the road has no kinks (a kink is a grade discontinuity,
 * which the car feels as a step). */
function valueNoise(values: number[], s: number, spacing: number): number {
  const t = s / spacing;
  const i = Math.floor(t);
  const f = t - i;
  const a = values[((i % values.length) + values.length) % values.length];
  const b = values[(((i + 1) % values.length) + values.length) % values.length];
  return a + (b - a) * (f * f * f * (f * (f * 6 - 15) + 10));
}

/** The rolling ground under a generated stage: octaves of seeded value noise
 * (R.elevation) summed along arc length. Long waves put the horizon above or
 * below the hood and shorter ones load and unload the car through a
 * straight — but every wave is a different shape, because a road built from
 * sines announces itself as a machine on the first two hills. */
function buildRolling(seed: number, knobs: StageKnobs): (s: number) => number {
  const rng = createRng((seed ^ 0x7e11a7d1) >>> 0);
  const relief = knobScale(knobs.elevation, R.elevation.knob);
  const amplitude = rng.range(R.elevation.amplitude.min, R.elevation.amplitude.max) * relief;
  const wavelength = rng.range(R.elevation.wavelength.min, R.elevation.wavelength.max);
  const roughness = rng.range(R.elevation.roughness.min, R.elevation.roughness.max);
  const octaves = Array.from({ length: R.elevation.octaves }, (_, o) => ({
    values: Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1)),
    spacing: wavelength / 2 ** o,
    amplitude: amplitude * roughness ** o,
    // Each octave reads its own lattice from a different place, so they
    // never line up into a shape that looks deliberate.
    offset: rng.range(0, 1e4),
  }));
  return (s: number): number => {
    let y = 0;
    for (const o of octaves) y += o.amplitude * valueNoise(o.values, s + o.offset, o.spacing);
    return y;
  };
}

/** R33 — how wide the gravel is at an arc position, as a multiple of the
 * stage's nominal width. The road is cut TIGHT and then given three things
 * back: two slow waves that open it out and pinch it in along the stage,
 * and the corners, which are wider because everything that ever swung round
 * one widened it. Nothing short: a width that changes inside a car's length
 * is a ragged edge, not a road that opens out. */
type WidthAt = (s: number, surface: Surface, shaped: boolean, curvature: number) => number;

function buildWidth(seed: number): WidthAt {
  const rng = createRng((seed ^ 0x2f1e8c3d) >>> 0);
  const W = R.roughness.width;
  const long = Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1));
  const short = Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1));
  const longOff = rng.range(0, 1e4);
  const shortOff = rng.range(0, 1e4);
  return (s: number, surface: Surface, shaped: boolean, curvature: number): number => {
    // Laid, not bladed: a paving machine and a bridge deck hold their width.
    if (shaped || surface !== "gravel") return 1;
    const swing =
      (1 - W.shortShare) * valueNoise(long, s + longOff, W.wave.long) +
      W.shortShare * valueNoise(short, s + shortOff, W.wave.short);
    const tightness = Math.abs(curvature) * W.corner.pivotRadius;
    const opened = W.corner.gain * (tightness / (1 + tightness));
    return W.narrow + W.vary * swing + opened;
  };
}

/** R33 — the road's BUMPS: how far out of true the surface is at an arc
 * position, m. Sparse impulses rather than a continuous field, and gravel
 * only — see `STAGE_RULES.roughness` for why both of those are the point
 * rather than a simplification.
 *
 * Applied to the driven sample only, never to `rolling` itself: the ford
 * dips, the bridge decks and the grade the banking is solved from all read
 * that, and a bump inside the number a slope is differenced from is a grade
 * that jumps rather than a road that has a bump in it.
 *
 * Three cells are summed at every query, not one. A bump lands at a random
 * offset inside its cell and reaches `halfWidth` either side of that, so it
 * routinely crosses a cell boundary — evaluating only the cell the query
 * falls in would cut those bumps in half at the seam, which is a step, which
 * is the one thing this must not produce.
 */
function buildBumps(seed: number): (s: number, surface: Surface, shaped: boolean) => number {
  const B = R.roughness;
  const salt = (seed ^ 0x51ed270b) >>> 0;
  return (s: number, surface: Surface, shaped: boolean): number => {
    // Tarmac is laid flat, a deck is planks or concrete, and a ford's water
    // and its graded apron are shaped by the crossing (R12).
    if (shaped || surface !== "gravel") return 0;
    const cell = Math.floor(s / B.cell);
    let y = 0;
    for (let c = cell - 1; c <= cell + 1; c++) {
      if (hash2(c, 0, salt) > B.chance) continue;
      const at = (c + hash2(c, 1, salt)) * B.cell;
      const halfWidth = B.halfWidth.min + (B.halfWidth.max - B.halfWidth.min) * hash2(c, 2, salt);
      const d = (s - at) / halfWidth;
      if (d <= -1 || d >= 1) continue;
      const height = B.height.min + (B.height.max - B.height.min) * hash2(c, 3, salt);
      // A raised cosine: it meets the road at zero height AND zero slope at
      // both ends, so a bump joins the surface instead of stepping onto it.
      const shape = Math.cos((d * Math.PI) / 2) ** 2;
      y += (hash2(c, 4, salt) < 0.5 ? -height : height) * shape;
    }
    return y;
  };
}

/** How fast the rolling layers advance through a sample, 0–1. Grades live
 * on the straights and flatten through corners — partly stage-design taste
 * (Sega Rally climbs between turns, not through them), but load-bearing
 * too: a car cutting inside a turn sweeps whole samples of arc per physics
 * step, and any real grade across that sweep reads as the ground falling
 * away — a phantom launch. */
function straightness(curvature: number): number {
  const c = Math.abs(curvature);
  return Math.max(0.06, Math.min(1, 1 / (1 + c * 120)));
}

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** The height the road is willing to follow the country to at a point: the
 * ground, or the local water's own freeboard where the ground is under it.
 * A road goes OVER a lake on an embankment, never along the bed of one.
 *
 * R35 — the water it clears is the water that is actually HERE, at its own
 * level. Against one table for the whole world a road crossing a tarn two
 * hundred metres up reads the sea's level, decides it is comfortably
 * clear, and drives straight through the lake.
 *
 * `roll` is the road's own undulation at this point, and it is subtracted
 * because the freeboard is owed by the SURFACE a car drives on, not by the
 * base underneath it. The roll swings several metres either way; a
 * freeboard measured against the base alone lets the trough of it put the
 * road back under the water it was lifted out of.
 *
 * Stated ONCE, because two walks read it: the compiler's, which builds the
 * road, and the trial walk that sizes the country around it. A country
 * measured against a different rule than the road was built to is a
 * landscape that does not fit its own stage.
 *
 * It is what keeps a road out of water it was routed into — not what keeps
 * it from being routed there. The search does that (R35's `keepsDry`), and
 * this is the backstop under it: the START in particular is a point no
 * search chooses at all. */
function buildableAt(
  land: ReturnType<typeof createLandField>,
  x: number,
  z: number,
  roll: number,
): number {
  const ground = land.heightAt(x, z);
  const water = land.water.shoreLevelAt(x, z);
  return water === null ? ground : Math.max(ground, water + R.elevation.follow.freeboard - roll);
}

/** R12 — the dip a ford sits in. Water lies FLAT at `bedDepth` below the
 * lowest grade around it (so it reads as collected, never perched), and the
 * road eases down to it and back out over the aprons. Fords sit on
 * straights, where the rolling profile advances 1:1 with arc, so the whole
 * dip can be shaped from local arc position alone. Returns the elevation
 * override for local position `u`, or null outside the dip.
 *
 * The road's height at a local position comes in two halves and they are
 * used differently (R34). `roll` is the road's own undulation, and the
 * water is set under the LOWEST of it across the crossing so it reads as
 * collected rather than perched on a local rise. `base` is the landscape
 * the road is following, and the water is set against it at the crossing's
 * MIDDLE — because a road descending through a crossing would otherwise
 * put its water at the bottom of the whole window, and the apron would have
 * to drop the road the crossing's entire fall in twenty metres. The
 * landscape's trend belongs to the road; only the roll is searched.
 *
 * Both are asked AHEAD of the sample being emitted, which is why the
 * segment's profile is walked before any of its samples are built. */
function fordDip(
  plan: SegmentPlan,
  u: number,
  base: (u: number) => number,
  roll: (u: number) => number,
): number | null {
  if (plan.feature !== "water" || plan.featureStart === undefined || plan.featureEnd === undefined)
    return null;
  if (isBridge(plan)) return null;
  const from = plan.featureStart - R.water.apron;
  const to = plan.featureEnd + R.water.apron;
  if (u < from || u > to) return null;
  const line = (v: number): number => base(v) + roll(v);
  let low = Infinity;
  for (let v = from; v <= to; v += 2) low = Math.min(low, roll(v));
  // The level the crossing WANTS: the roll's lowest against the landscape
  // at the crossing's middle, so the water reads as collected rather than
  // perched on a local rise, and a road descending through the window does
  // not have to lose the whole window's fall over one apron.
  const wanted = base((plan.featureStart + plan.featureEnd) / 2) + low - R.water.bedDepth;
  // ...and never ABOVE the road's own line where an apron has to MEET it.
  // Where the ground rises into the crossing, `wanted` came out over the
  // road approaching it; the clamp below then held the whole apron flat at
  // the water and the road stepped up to it in one 2 m sample. Seed 2 at
  // medium put a 2.39 m step at 1287 m — a 120% ramp the car left the
  // ground on at 127 km/h, flew ninety metres and nineteen up, and came
  // down in an 18 m hairpin it could not then take; 10 of 24 seeds carried
  // a step like it, worst 121%. Held under both apron mouths instead, so
  // each ramp starts from the road's own height and there is nothing to
  // step over. It only ever LOWERS the water, and only on the crossings
  // that were building a wall: everywhere else the level is the one above.
  const water = Math.min(wanted, line(from) - R.water.bedDepth, line(to) - R.water.bedDepth);
  if (u >= plan.featureStart && u <= plan.featureEnd) return water;
  const t = u < plan.featureStart ? (u - from) / R.water.apron : (to - u) / R.water.apron;
  const here = line(u);
  // ...and never BELOW the water, whatever the road was doing. On a road
  // that is descending through the crossing the far apron's own grade can
  // duck under the level the water was set at, and a road under its own
  // ford is water standing on tarmac. Held at the water instead, which
  // simply means the flat water reaches a little further — which is what a
  // ford on a slope looks like.
  return Math.max(water, here + (water - here) * smoothstep(t));
}

/** R13 — the deck a bridge carries the road across on. Where a ford dips
 * DOWN to the water, a deck holds the road dead LEVEL over it: the span
 * sits at the highest grade around the crossing (a bridge is built to
 * clear the water, and a deck sagging below its own banks would just be a
 * dip with a river in it), and the road eases up onto it over the margin
 * each side. The channel below is the terrain field's business — it carves
 * the ravine and fills it, reading the deck's clearance off the plan. */
function bridgeDeck(
  plan: SegmentPlan,
  u: number,
  base: (u: number) => number,
  roll: (u: number) => number,
): number | null {
  if (!isBridge(plan) || plan.featureStart === undefined || plan.featureEnd === undefined) {
    return null;
  }
  const from = plan.featureStart - R.bridge.margin;
  const to = plan.featureEnd + R.bridge.margin;
  if (u < from || u > to) return null;
  // R34 — the roll is searched, the landscape is read at the middle. Same
  // split, and for the same reason, as the ford above: a deck pinned to the
  // highest point of a road that is climbing through the crossing has to be
  // ramped down from at the far end, and the ramp is a wall.
  let high = -Infinity;
  for (let v = from; v <= to; v += 2) high = Math.max(high, roll(v));
  const deck = base((plan.featureStart + plan.featureEnd) / 2) + high;
  if (u >= plan.featureStart && u <= plan.featureEnd) return deck;
  const t = u < plan.featureStart ? (u - from) / R.bridge.margin : (to - u) / R.bridge.margin;
  const here = base(u) + roll(u);
  return here + (deck - here) * smoothstep(t);
}

type Cursor = {
  x: number;
  z: number;
  heading: number;
  s: number;
  rollS: number;
  /** R34 — the LANDSCAPE the road is laid along, at the cursor: the bare
   * country's height, lagged and grade-clamped into something drivable
   * (`R.elevation.follow`). The road's own rolling noise rides on this
   * rather than being the whole of its height, which is what puts a stage
   * down the valleys instead of at an arbitrary altitude the terrain then
   * has to plane the country away to reach.
   *
   * Carried on the cursor because the filter is CAUSAL: it is the road
   * builder walking forward, and it has to survive both a segment boundary
   * and an endless stage's streaming. */
  baseY: number;
  /** ...and how fast it is climbing, m per m. R17's junction platform is a
   * PLANE, and the plane has to lie on the road's whole grade: give it the
   * roll's slope alone and a road following a hillside steps off the edge
   * of its own junction. */
  baseSlope: number;
};

type Compiler = {
  append: (plans: SegmentPlan[]) => void;
};

/** How far around a junction an ENDLESS stage's branch has to get before it
 * may end, m — the finite stages hand the branch the whole stage's box to
 * escape, but a stage with no end has no box, so the branch simply has to
 * leave the neighbourhood (well past the fog ceiling). */
const STREAMED_ESCAPE = 460;

/** How far a branch's keep-out query resolves, m; past this it answers
 * exactly "this far and no nearer". It has to cover the branch's own
 * look-ahead plus the widest clearance a road can earn (R23), because the
 * branch treats the answer as a PROMISE about the next few steps and a
 * capped distance it walked past would be a promise the query never made. */
const ROAD_DISTANCE_REACH = 220;

/** R23 — how much room a point leaves the branches in `list`, m, reading
 * the list LIVE so a branch added after this was built is measured too.
 *
 * Two branches off two different junctions are two roads like any other
 * pair, and nothing else asks them to keep apart: they cross in open
 * country a kilometre from anything, which is a junction nobody built.
 *
 * Strided to match the stage's own coarsening, and the slack is taken off
 * the answer so this can only ever under-report the room a branch has,
 * never invent some. */
function branchClearance(list: Spur[]): (x: number, z: number, except?: Spur) => number {
  const STRIDE = 8;
  const slack = BRANCH_DISTANCE_SLACK;
  return (x: number, z: number, except?: Spur): number => {
    let best = Infinity;
    for (const other of list) {
      if (other === except) continue;
      const b = other.bounds;
      if (
        x < b.minX - ROAD_DISTANCE_REACH ||
        x > b.maxX + ROAD_DISTANCE_REACH ||
        z < b.minZ - ROAD_DISTANCE_REACH ||
        z > b.maxZ + ROAD_DISTANCE_REACH
      ) {
        continue;
      }
      for (let i = 0; i < other.samples.length; i += STRIDE) {
        const dx = other.samples[i].x - x;
        const dz = other.samples[i].z - z;
        const d = Math.hypot(dx, dz);
        if (d < best) best = d;
      }
    }
    return best === Infinity ? Infinity : Math.max(0, best - slack);
  };
}

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
): Compiler {
  const cursor: Cursor = { x: 0, z: 0, heading: 0, s: 0, rollS: 0, baseY: 0, baseSlope: 0 };
  /** The bare country the stage is laid across — the branches steer by it
   * so none of them drives out into a lake (R17), and (R34) the road's own
   * height follows it. */
  const land = createLandField(track.seed, track.knobs);
  /** R17 — and the tarmac laid across it, indexed. Read off the track
   * because that is where it lives: the search laid it, the analysis
   * measures against it, and here it is what a borrowed junction's arm is
   * cut out of. */
  const highways = createHighwayNetwork(track.highways);

  /** R34 — one step of the road builder's eye: move the road's base toward
   * the ground under it, but no faster than the eye smooths and no steeper
   * than anything will drive. What comes out is a road that runs along the
   * country and cuts or fills where the country will not have it.
   *
   * Exponential rather than linear so the response length means the same
   * thing whatever the step is, and clamped after rather than before, so
   * the clamp is a property of the ROAD and the lag a property of the
   * builder — two rules, not one number doing both jobs badly. */
  const F = R.elevation.follow;
  const buildable = (x: number, z: number, roll: number): number => buildableAt(land, x, z, roll);
  if (followsLand) cursor.baseY = buildable(0, 0, rolling(0));

  const followLand = (
    base: number,
    slope: number,
    x: number,
    z: number,
    step: number,
    roll: number,
  ): { base: number; slope: number } => {
    if (!followsLand) return { base, slope: 0 };
    const ground = buildable(x, z, roll);
    const want = base + (ground - base) * (1 - Math.exp(-step / F.lag));
    // The gradient the road would like to be on here, then the two clamps:
    // how steep it may be, and how fast that may CHANGE. The second is what
    // rounds a hilltop off into a crest instead of leaving the brow the
    // first one on its own builds.
    let next = (want - base) / step;
    const swing = F.crest * step;
    if (next > slope + swing) next = slope + swing;
    else if (next < slope - swing) next = slope - swing;
    if (next > F.grade) next = F.grade;
    else if (next < -F.grade) next = -F.grade;
    return { base: base + next * step, slope: next };
  };
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
  let pavedNow = borrowed ? false : paving.pavedAt(0);
  /** R20 — is there gravel on this stage at all? At the top of the
   * `asphalt` dial the whole route is a public road, which is a different
   * kind of event and not a borrow, so the rule that keeps hairpins off
   * borrowed tarmac has nothing to say about it. */
  const mixedSurface = track.knobs.asphalt <= 1 - R.paving.floor;
  let flipWanted = false;

  /** The road's PRISTINE heights and widths, before any junction warped or
   * flared them (R17) — kept alongside the samples so a shaping pass that
   * overlaps an earlier one lands in exactly the same place instead of
   * compounding. */
  const rawY: number[] = [];
  const rawWidth: number[] = [];
  /** ...and the width and cross-fall as the WALK laid them, before either
   * runoff smoothed them. The runoffs are re-run over the tail of the
   * previous chunk when an endless stage extends (the window there was
   * cut off at the frontier), and a pass that reads its own output back
   * smooths that tail twice — so the road came out a different width
   * depending on how the renderer chunked its extends. Smoothing from the
   * bare values makes the pass idempotent: the same input, the same road. */
  const bareWidth: number[] = [];
  const bareBank: number[] = [];

  /** Junctions found in this pass, waiting for their branches. The branch
   * has to run until it is clear of the stage's country (R17), and how big
   * that country is is only known once the road it belongs to is
   * compiled — so the junction is noted here and the road built below. */
  type Junction = {
    /** Where the two roads MEET: a point on the route's own centerline,
     * at the tangent end of the corner it turns off (or onto) the main
     * road at. */
    x: number;
    z: number;
    elevation: number;
    slope: number;
    /** Heading of the road the branch continues along — the OTHER arm of
     * the road the route turns onto or off. */
    heading: number;
    /** True where the route joins the sealed road, false where it leaves. */
    joining: boolean;
    /** Arc position of the junction on the stage (pruning, association). */
    s: number;
    /** R36 — a crossing rather than a junction: it earns TWO arms, one each
     * way along the public road, and both of them are shut. */
    crossing?: boolean;
    /** ...and which point of which road it sits on, so the arms are cut
     * from the line the tarmac was actually laid on. */
    road?: { road: Highway; index: number };
  };
  const junctions: Junction[] = [];

  /** R17 — can the arm this junction would abandon get OUT of the country
   * the stage occupies? A branch runs until it is clear of the map and then
   * stops out of sight; one that cannot get clear stops in a field instead,
   * and a tarmac road ending in a field is the loudest mistake the
   * generator can make — it is visible from a kilometre up and it is the
   * one thing that says nobody built this.
   *
   * The only honest test of whether a branch can leave is to DRIVE it, so
   * that is the test: the same `buildSpur` the junction would really get,
   * run against the country the plan already describes, and the corner is
   * taken only if the branch it would earn actually reaches the edge. A ray
   * out of the box cannot answer it — what stops a branch is the lake it
   * has to steer round and the stage it may not cross (R23), and neither is
   * on the ray.
   *
   * Where the corner is rejected nothing is repaired: the paving field
   * simply waits, and the surface changes at the next corner that can carry
   * a junction.
   *
   * Always true on an endless stage, which has no box — there a branch is
   * only asked to leave its own junction's neighbourhood, which any of them
   * manages. */
  /** The arms of the junctions already taken, as the trial built them. A
   * branch is boxed in by the OTHER branches as much as by the stage (R23),
   * and a trial that does not know about them accepts a junction whose real
   * arm is then stopped after fifty metres by the last one — which leaves a
   * public road lying alongside the stage inside its own junction window,
   * where nothing measures it. */
  const trialArms: Spur[] = [];
  const armCanLeave = (
    pose: { x: number; z: number; heading: number; elevation: number; slope: number },
    atS: number,
    end: "entry" | "exit",
  ): boolean => {
    if (!country) return true;
    const stage = country.roadDistance(pose);
    const others = branchClearance(trialArms);
    const trial = buildSpur(
      track.seed,
      pose,
      atS,
      end,
      country.bounds,
      land,
      track.width,
      (x: number, z: number, ignoringJunction?: boolean) =>
        Math.min(stage(x, z, ignoringJunction), others(x, z)),
      country.shelfHolds,
      country.shelfBand,
    );
    const last = trial.samples[trial.samples.length - 1];
    if (!last) return false;
    const b = country.bounds;
    const out = Math.max(b.minX - last.x, last.x - b.maxX, b.minZ - last.z, last.z - b.maxZ);
    if (out < R.junction.armReach * SPUR.escape) return false;
    // A true answer here is always taken — the caller flips the surface on
    // it — so this arm is part of the country the next trial is measured
    // against.
    trialArms.push(trial);
    return true;
  };

  /** R17 — is this corner one a junction could sit at? A junction is where
   * a road MEETS another; that needs a real turn, neither a kink nor a
   * hairpin, and one tight enough that the two carriageways actually PART
   * rather than peel away from each other over fifty meters of tangent —
   * and an abandoned arm with somewhere to go. */
  const isJunctionTurn = (plan: SegmentPlan, at: Cursor, joining: boolean): boolean => {
    if (plan.kind !== "turn" || !plan.radius || plan.feature !== "none") return false;
    const angle = plan.length / plan.radius;
    if (angle < R.paving.junctionAngle.min || angle > R.paving.junctionAngle.max) return false;
    if (plan.radius < R.paving.junctionRadius * track.width) return false;
    if (partedAt(plan.radius) > R.paving.junctionParts * track.width) return false;
    // Where the route JOINS the tarmac the meeting point is the corner's
    // far end, so the arm leaves from where the cursor will be once the
    // corner is walked — projected here, since the decision is made before
    // it is. The arc's centre is a road's width to the inside of the
    // tangent; the far tangent point is the same distance back from it.
    const dir = plan.dir ?? 1;
    const radius = plan.radius;
    const exit = joining ? at.heading + dir * angle : at.heading;
    const cx = at.x + Math.cos(at.heading) * radius * dir;
    const cz = at.z - Math.sin(at.heading) * radius * dir;
    const x = joining ? cx - Math.cos(exit) * radius * dir : at.x;
    const z = joining ? cz + Math.sin(exit) * radius * dir : at.z;
    const rollS = at.rollS + (joining ? plan.length * straightness(dir / radius) : 0);
    // R34 — the height the road is at, not the height its roll is at: the
    // base the builder's eye has followed the country to, carried forward
    // on its current grade where the corner has yet to be walked. A trial
    // branch started tens of metres under the road it leaves is one the
    // shelf refuses for a reason that has nothing to do with the junction.
    const base = at.baseY + (joining ? at.baseSlope * plan.length : 0);
    const slope = at.baseSlope + (rolling(rollS + 2) - rolling(rollS - 2)) / 4;
    return armCanLeave(
      {
        x,
        z,
        heading: (joining ? exit + Math.PI : at.heading) % (Math.PI * 2),
        elevation: base + rolling(rollS),
        slope: joining ? -slope : slope,
      },
      at.s + (joining ? plan.length : 0),
      joining ? "entry" : "exit",
    );
  };

  /** How far along the main road the two carriageways still overlap: the
   * arc the corner has to run before it has carried the route clear of the
   * main road's mat. It is the length of the junction, and it is what says
   * whether a corner is one at all. */
  const partedAt = (radius: number): number => {
    const cos = Math.max(-1, Math.min(1, 1 - track.width / radius));
    return radius * Math.acos(cos);
  };

  /** ...and the platform built over it, clamped so a junction stays a
   * junction and not a car park. */
  const platformReach = (radius: number): number =>
    Math.max(
      R.junction.reach.min,
      Math.min(R.junction.reach.max, partedAt(radius) * R.junction.platform),
    );

  /** How far into the corner the route's own centerline is still on the
   * MAIN road's mat — which is where the surface changes, because that is
   * where the car actually leaves the tarmac. */
  const onMainRun = (radius: number): number => {
    const half = track.width / 2;
    const cos = Math.max(-1, Math.min(1, 1 - half / radius));
    return radius * Math.acos(cos);
  };

  /** Note the junction a surface change happens at. The route arrives on
   * one road and turns onto the other; the arm it does NOT take carries
   * straight on through the crossing, and that is what the branch is: the
   * MAIN road's own line, continued. The meeting point is the corner's
   * tangent point — the START of the turn where the route leaves the
   * sealed road, its END where the route joins one — so the junction sits
   * ON the road rather than out at the intersection of two tangents, which
   * on a sweeping corner is a hundred meters away in a field. */
  const noteJunction = (plan: SegmentPlan, at: Cursor, joining: boolean): void => {
    const radius = plan.radius ?? 1;
    const dir = plan.dir ?? 1;
    // The main road's line: the tangent the route shares with the branch.
    // Joining, that is the tangent at the END of the corner and it points
    // BACK the way the tarmac came; leaving, the tangent at its start.
    const heading = joining ? at.heading + Math.PI : at.heading;
    // R34 — the country the road is following here, plus its roll. The
    // branch and its platform are built on the SAME height the route is at,
    // so a junction is one plane whatever the ground under it was doing.
    const y = at.baseY + rolling(at.rollS);
    const slope = at.baseSlope + (rolling(at.rollS + 2) - rolling(at.rollS - 2)) / 4;
    // The minor road leaves the meeting point on that same tangent and
    // curves away. Traced from the junction OUTWARD, a corner the route
    // drove backwards through bends the other way.
    const curve = (joining ? -dir : dir) / radius;
    const reach = platformReach(radius);
    junctions.push({
      x: at.x,
      z: at.z,
      elevation: y,
      slope: joining ? -slope : slope,
      heading,
      joining,
      s: at.s,
    });
    track.junctions.push({
      x: at.x,
      z: at.z,
      y,
      // The platform lies on the MAIN road's grade, so both carriageways
      // and the ground between them are one plane.
      grade: {
        x: Math.sin(heading) * slope * (joining ? -1 : 1),
        z: Math.cos(heading) * slope * (joining ? -1 : 1),
      },
      heading,
      curve,
      width: track.width,
      reach,
      spread: track.width * 0.85,
      s: at.s,
      joining,
    });
  };

  /** R36 — note the CROSSING a `overRoad` straight makes. Everything about
   * it is stated the other way round from a junction, and each difference is
   * the same difference: nobody turns.
   *
   * - The meeting point is the middle of the passage, not a corner's tangent
   *   point, so it is found by asking which point of the WALKED road is
   *   nearest the piece of tarmac the search aimed at. The search's 6 m
   *   probe and this 2 m walk diverge by a metre or two over a stage, and a
   *   crossing placed at the search's answer is a crossing a metre off the
   *   road it crosses — which is a platform with a strip of unlevelled
   *   ground down one edge of it.
   * - The platform is LEVEL and it stands `crossing.stand` above the route's
   *   own line. That is the whole feature (R36): the public road is built up
   *   on a formation, the rally is scraped along the field, and the car goes
   *   over the step. A junction takes the main road's grade because the
   *   route is about to drive down it; nothing drives down this one.
   * - It is elongated ACROSS the tarmac (`spread` is the ramp, `reach` the
   *   footprint on the public road) and it is SYMMETRIC (`behind: 1`),
   *   because the gravel opens on both sides of it.
   * - And `curve` is zero: the minor road is one straight line through the
   *   middle, which is what makes the two dirt arms opposite each other. */
  const noteCrossing = (
    over: NonNullable<SegmentPlan["overRoad"]>,
    path: { x: number; z: number; heading: number; s: number; base: number; slope: number }[],
    rollAt: (u: number) => number,
    step: number,
  ): void => {
    const road = track.highways[over.road];
    if (!road) return;
    const on = road.points[over.index];
    if (!on) return;
    let best = 0;
    let nearest = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = Math.hypot(path[i].x - on.x, path[i].z - on.z);
      if (d >= nearest) continue;
      nearest = d;
      best = i;
    }
    const at = path[best];
    // R36 — the step. The route's OWN height here plus the stand: the
    // formation the public road is built on, which the gravel has to climb.
    const y = at.base + rollAt((best + 1) * step) + R.crossing.stand;

    // ...and the plane that formation lies on. LEVEL ALONG THE PUBLIC ROAD,
    // which is the direction anybody looks down it, and tilted at the
    // ROUTE's own grade across it.
    //
    // Both halves of that are load-bearing and the second one was learned
    // the hard way. A dead level platform is what a formation actually is,
    // and on flat country it is right — but the moment the rally crosses on
    // a slope the two edges of it are at two different heights above the
    // route's own line, and where the country falls faster than `stand` the
    // far edge is BELOW it. That is not a jump, it is a hole with a road in
    // it: measured over seeds 1-24 the level plane gave steps of 2.0 to 2.9
    // m and ramps at 27-33%, none of it the number `stand` says. Tilted at
    // the route's grade the step is exactly `stand` on both sides of every
    // crossing on every seed, which is what makes this a feature that can be
    // tuned rather than a lottery the country runs.
    //
    // What it costs is cross-fall on the sealed mat — the route's grade over
    // `reach`, so a few per cent over a road width. A public road laid
    // across a hillside does that.
    //
    // The grade is the road's WHOLE slope, not the country's: the base the
    // builder's eye has followed the land to, plus the rate its own roll
    // (R34) is climbing at. Reading only the base left the roll to diverge
    // across the ramp — a wave a metre deep over twenty is another five per
    // cent on top of a thirteen, and it is the difference between the seeds
    // that measured 13% and the ones that measured 25%.
    const u = (best + 1) * step;
    const slope = at.slope + (rollAt(u + 2) - rollAt(u - 2)) / 4;
    const grade = {
      x: Math.sin(at.heading) * slope,
      z: Math.cos(at.heading) * slope,
    };
    junctions.push({
      x: at.x,
      z: at.z,
      elevation: y,
      slope: 0,
      heading: on.heading,
      joining: false,
      s: at.s,
      crossing: true,
      road: { road, index: over.index },
    });
    track.junctions.push({
      x: at.x,
      z: at.z,
      y,
      grade,
      heading: on.heading,
      curve: 0,
      width: track.width,
      reach: R.crossing.reach * track.width,
      // The graded area is a JUNCTION's, not the ramp's: this is the paving
      // and the levelling, and a crossing's footprint on the ground is the
      // same size as any other place two roads meet. The ramps are longer
      // and they are not this (see `crossing.ramp`).
      spread: track.width * 0.85,
      behind: 1,
      drag: R.crossing.drag,
      s: at.s,
      joining: false,
      crossing: true,
    });
  };

  /** R36 — is this point ON the public road's mat at a crossing?
   *
   * For the road width it spends up there the rally is not on a rally road:
   * it is on the tarmac, briefly, the way anybody crossing a main road is.
   * So that stretch is SEALED — which sets the grip under the wheels, takes
   * R33's grain and width wander out of it (a paving machine lays one
   * width), and hands the renderer a surface that agrees with the mat it
   * paints across the crossing from the same edge function.
   *
   * The seam is the main road's own EDGE, cut square, exactly as it is at a
   * junction. It is the one place a stage changes surface without a
   * junction and without R20's run-out, and it needs no ceremony because
   * nothing about it is a decision: the car is on the tarmac because the
   * tarmac is there. */
  const onCrossingSeal = (x: number, z: number): boolean => {
    for (const junction of track.junctions) {
      if (!junction.crossing) continue;
      const past = junctionMainEdge(junction, x, z);
      if (past !== null && past <= 0) return true;
    }
    return false;
  };

  /** R36 — how much of the CROSSING's own plane a sample of the rally road
   * takes at this arc position, 1 up on the formation to 0 back down on the
   * country. The ramp: the road climbs onto the public road's formation and
   * drops off the far side, and the drop is the jump.
   *
   * Measured along the route's ARC and not across the ground, because that
   * is the direction the rally climbs and the only one the ramp has. The
   * platform's ellipse is the other measurement and it stays what it is —
   * a shape on the ground, describing the graded area. This holds the plane
   * for as far as that ellipse does (`0.72 * spread`, where its own falloff
   * begins) so the two hand over with no seam, then eases off over
   * `crossing.ramp` metres of gravel.
   *
   * A smoothstep, so the road leaves the formation and rejoins the country
   * with no kink at either end — a linear ramp puts a crease at the toe that
   * reads as a step in the road and measures as one. */
  const crossingRamp = (junction: RoadJunction, s: number): number => {
    if (!junction.crossing) return 0;
    const hold = 0.72 * junction.spread;
    const d = Math.abs(s - junction.s);
    if (d <= hold) return 1;
    const t = (d - hold) / R.crossing.ramp;
    if (t >= 1) return 0;
    return 1 - t * t * (3 - 2 * t);
  };

  /** R17 — how far back down the MINOR road a mouth may reach, m. A
   * proportion of the road's own width: the mouth of a lane and the mouth
   * of a boulevard are the same place at two scales. */
  const mouthRun = R.junction.mouth.run * track.width;

  /** R17 — the fastest a mouth may open, m of mat per m of road. What sets
   * it is the GROUND: the terrain shapes its shelf around the nearest
   * centerline point, so a mat that widens faster than the samples are
   * spaced leaves a probe at a wide sample's lip nearest to a narrow one
   * alongside, the ground hands over inside the ribbon, and the seam is a
   * face down the outside of the mouth. Measured on the rollers' seam
   * check: past this the step at the mouth's rim goes over what a wheel
   * rides. */
  const MOUTH_SLEW = 0.42;

  /** R17 — the MOUTH's two sizes, m: how much wider the mat is where it
   * meets the tarmac, and the length of lane it opens over.
   *
   * The widening is CAPPED at the corridor's own reach (R16), and that cap
   * is the thing standing between this mouth and the one a real junction
   * has. The ground lattice is shaped out to the corridor's lip and hands
   * over to the country past it, so a mat that flares further is a mat over
   * ground nothing shelved — a vertical face along the outside of the
   * mouth. Enlarging the PLATFORM to cover a wider mouth does not buy it
   * either: measured on seed 1, spreading the graded ellipse by the mouth's
   * own width left the seam where it was (0.46 m) and opened a 1.5 m gap
   * between the ribbon and the tiles, because the ground under the road
   * moved with it. What a wider mouth needs first is a corridor that owns a
   * point by which MAT is nearest rather than by which centerline is. */
  const mouthWide = Math.min(R.junction.mouth.wide * track.width, ROAD_CROSS.reach);
  const mouthTaper = R.junction.mouth.taper * track.width;

  /** R17 — where each junction's THROAT is: how far back down the minor
   * road, in meters of its own arc, the centerline crosses the main road's
   * edge. That crossing is the mouth's mouth — the line the dirt road stops
   * at and the tarmac starts — and the fillet is measured back from it.
   *
   * Measured off the built road rather than from the corner's nominal
   * radius, and remembered per junction because the flare asks for it once
   * per sample. */
  const throatOf = (junction: RoadJunction): number => {
    const nx = Math.cos(junction.heading);
    const nz = -Math.sin(junction.heading);
    // The NEAREST crossing to the meeting point, not the first one the walk
    // meets: a joining junction's minor arm runs backwards through the
    // sample list, so the first sample in `s` order that stands off the mat
    // is the far end of the mouth rather than its throat.
    let throat = Infinity;
    for (const sample of track.samples) {
      const d = junction.joining ? junction.s - sample.s : sample.s - junction.s;
      if (d < 0 || d > mouthRun || d >= throat) continue;
      const across = (sample.x - junction.x) * nx + (sample.z - junction.z) * nz;
      if (Math.abs(across) >= junction.width / 2) throat = d;
    }
    // Infinity where the minor arm never leaves the main road's mat inside
    // the window: there is no throat, so there is no mouth. Falling back to
    // zero instead opens one at the meeting point itself — on the SEALED
    // side, where the road is laid to a constant width (R33) and the flare
    // is three times the road across a piece of tarmac.
    return throat;
  };
  const throats = new Map<RoadJunction, number>();

  /** R17 — how much wider the MOUTH makes a sample of the minor road, m of
   * extra half-width per side.
   *
   * A quarter ellipse: `mouthWide` of extra half-width at the THROAT,
   * closing to nothing over `mouthTaper` of lane. It leaves the road's own
   * edge with no kink and arrives at the tarmac at its widest, which is
   * where a car turning out of the lane needs the room — the whole reason
   * a mouth is wider than the road behind it.
   *
   * `out` is meters of the minor road's OWN length back from the throat,
   * not distance across the main road: a mouth is a length of lane, so it
   * reaches the same way back down it whether the lane arrives square or at
   * a slant. Measured across instead, an oblique junction gets its whole
   * mouth compressed into the few meters its centerline takes to cross the
   * edge, and opens like a trapdoor.
   *
   * At the throat it is over. A sample past it is standing on the through
   * road, which is already paved right across — carrying the flare on
   * puts a mushroom of dirt into the field on the far side of a road that
   * never needed covering.
   *
   * Returns 0 for a sample that is not the minor road of any junction. The
   * minor arm is the unsealed one, so which side of the meeting point it
   * lies on follows from `joining` alone: the stage ARRIVES at a joining
   * junction on the dirt and LEAVES a parting one on it. */
  /** R17 — which side each junction's mouth opens on, in the ROUTE's own
   * lateral frame: the outside of the corner the route turns through, read
   * off the sample at the meeting point and then held for the whole mouth.
   *
   * Read per sample instead, it flips halfway: a junction's corner unwinds
   * over the last few metres, its curvature crosses zero, and the mat's
   * wide side jumps from one edge to the other inside one mouth. Which side
   * is the outside is a fact about the JUNCTION, so it is decided once. */
  const mouthSides = new Map<RoadJunction, 1 | -1>();
  const outerOf = (junction: RoadJunction): 1 | -1 => {
    let side = mouthSides.get(junction);
    if (side !== undefined) return side;
    let best = Infinity;
    let curvature = 0;
    for (const sample of track.samples) {
      const d = Math.abs(sample.s - junction.s);
      if (d >= best) continue;
      best = d;
      curvature = sample.curvature;
    }
    side = curvature >= 0 ? -1 : 1;
    mouthSides.set(junction, side);
    return side;
  };

  const mouthFlare = (sample: TrackSample): { extra: number; outer: 1 | -1 } => {
    // The mouth belongs to the DIRT road. Said here rather than left to the
    // throat arithmetic, because the surface flip and the throat are two
    // measurements of the same crossing taken different ways, and a sample
    // between the two answers would otherwise get the full mouth laid on a
    // piece of tarmac — which a paving machine does not do (R33).
    if (sample.surface !== "gravel") return { extra: 0, outer: 1 };
    let widest = 0;
    let outer: 1 | -1 = 1;
    for (const junction of track.junctions) {
      // R36 — A CROSSING HAS NO MOUTH, and that is what squareness buys.
      // A mouth exists because a junction is a CORNER: the dirt road meets
      // the tarmac at an angle, which leaves a wedge of country tapering to
      // a knife point between the two mats, and the flare is what traffic
      // wears away to close it. Crossed at right angles there is no wedge —
      // a rectangle meeting a rectangle square meets it along a straight
      // edge — so a flare here would be a lane that briefly got fatter for
      // no reason, and a lopsided one at that (`outerOf` reads the corner's
      // curvature, and a crossing has none).
      if (junction.crossing) continue;
      const d = junction.joining ? junction.s - sample.s : sample.s - junction.s;
      if (d < 0 || d > mouthRun) continue;
      let throat = throats.get(junction);
      if (throat === undefined) throats.set(junction, (throat = throatOf(junction)));
      const out = d - throat;
      if (out >= mouthTaper) continue;
      // Past the throat the mouth is at its WIDEST and stays there. The
      // surface flip and the throat are two measurements of the same
      // crossing taken different ways, so a sample can be gravel and
      // already inside the sealed road's edge — and dropping the flare
      // there took the mouth from twenty-nine metres to sixteen in one
      // two-metre step, at exactly the place the two roads have to meet.
      // What that leaves is a wedge of field between the dirt road's edge
      // and the tarmac's, which is the whole defect the mouth exists to
      // close. The `surface` guard above is what keeps this off the main
      // road: the tarmac's own samples never take a flare (R33).
      const t = out <= 0 ? 1 : 1 - out / mouthTaper;
      const extra = mouthWide * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      if (extra > widest) {
        widest = extra;
        outer = outerOf(junction);
      }
    }
    return { extra: widest, outer };
  };

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
      return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - R.startZone.apron));
    };
    type StageEnd = { x: number; z: number; sin: number; cos: number; sign: 1 | -1 };
    const endOf = (sample: TrackSample, sign: 1 | -1): StageEnd => ({
      x: sample.x,
      z: sample.z,
      sin: Math.sin(sample.heading),
      cos: Math.cos(sample.heading),
      sign,
    });
    const first = endOf(track.samples[0], -1);
    const last = endOf(track.samples[track.samples.length - 1], 1);
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

  /** Build the branch every noted junction earns, now that the road they
   * hang off is compiled. A finite stage hands each branch the stage's own
   * bounding box to escape; a streamed one has no box, so the branch just
   * has to get out of the junction's neighbourhood. */
  const buildForks = (): void => {
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
    const standing: Spur[] = [];
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
        if (sample.s > R.junction.reach.max * 1.5) break;
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
        const w = junctionFlat(junction, sample.x, sample.z);
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
        if (paving.pavedAt(cursor.s) !== pavedNow) flipWanted = true;
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
        flipWanted = paving.pavedAt(cursor.s);
      }
      // R20 — a tarmac section is a public road the rally borrows, and
      // nobody builds a launch ramp into one. A lip that would have landed
      // on sealed road is simply not built, and the segment says so.
      const sealedJump = plan.feature === "jump" && pavedNow && flipAt < 0;
      const built: SegmentPlan = sealedJump
        ? { ...plan, feature: "none", featureStart: undefined, featureEnd: undefined }
        : plan;
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
          // The run-out is capped by the road that carries it, so the board
          // always falls inside this segment: a corner followed by another
          // corner takes its board on the exit itself.
          checkpointDue =
            cursor.s + (built.kind === "turn" ? 0 : Math.min(C.runOut, built.length * 0.6));
        }
      }

      // The co-driver's book: a turn opens a call (or deepens the open one
      // when it continues in the same direction with no straight between);
      // a straight closes it.
      if (built.kind === "turn" && built.dir && built.radius) {
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
          const next = followLand(baseY, baseSlope, px, pz, step, rolling(pr));
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

      // R36 — the public road this straight goes over. Noted from the walk,
      // before any sample of it is emitted, so `shapeJunctions` finds the
      // platform waiting when it warps the road onto it.
      if (built.overRoad) noteCrossing(built.overRoad, path, rollAt, step);

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
        const dip = fordDip(built, u, baseAt, rollAt);
        const deckY = bridgeDeck(built, u, baseAt, rollAt);
        // A crossing is a ford OR a deck, never both: the wheels go through
        // the water or ride over it (R13).
        const crossed = inCrossing(built, u);
        const bridge = crossed && isBridge(built);
        const ford = crossed && !bridge;
        // R36 — and the road width the route spends on a public road it is
        // crossing is sealed, because it is on one.
        const paved = !ford && (pavedNow || onCrossingSeal(cursor.x, cursor.z));
        const sample: TrackSample = {
          x: cursor.x,
          z: cursor.z,
          heading: cursor.heading,
          elevation:
            (dip ??
              deckY ??
              at.base +
                rolling(cursor.rollS) +
                (jump ? (built.lipHeight ?? 2) : segmentElevation(built, u))) +
            // R33 — the grain, last: a ford's flat water and a bridge's deck
            // get none (the builder returns 0 for both), so the only thing
            // it ever roughens is road.
            // R33 — and the bumps keep off anything a CROSSING shaped. Not
            // just the water and the deck: the ford's APRON is graded down
            // to flat water over tens of metres (R12), and a road that dips
            // a few centimetres below the water it is easing into is water
            // standing on a rise.
            bumps(
              cursor.s,
              ford ? "water" : paved ? "asphalt" : "gravel",
              bridge || dip !== null || deckY !== null,
            ),
          surface: ford ? "water" : paved ? "asphalt" : "gravel",
          deck: bridge ? ((built.crossing ?? "timber") as BridgeDeck) : null,
          lift: 0,
          jump,
          s: cursor.s,
          curvature,
          bank: 0,
          flat: 0,
          width:
            track.width *
            widthAt(
              cursor.s,
              ford ? "water" : paved ? "asphalt" : "gravel",
              bridge || dip !== null || deckY !== null,
              curvature,
            ),
        };
        sample.bank = bankRate(curvature, sample);
        track.samples.push(sample);
        rawY.push(sample.elevation);
        rawWidth.push(sample.width);
        bareWidth.push(sample.width);
        bareBank.push(sample.bank);
        if (checkpointDue >= 0 && cursor.s >= checkpointDue) {
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
    // The mouth is measured from the flared road, so it waits for the pass
    // that flares it — and for the minor arm on BOTH sides of the meeting
    // point to have been walked.
    buildForks();
    // R39 — the towns, once the forks are built: a town stands on the
    // borrowed tarmac or on an abandoned arm, and keeps off every other
    // road there is.
    buildTowns();
    // R37 — and the homesteads last of all, because a drive keeps off every
    // road there is and off the towns, and the branches are only all there
    // once the forks are built.
    buildHomesteads();
  };

  /** R39 — the towns whose streets are settled on road committed since the
   * last call: the whole stage on a finite one, everything behind the
   * streaming frontier on an endless one, for the homesteads' reason. */
  let townFrom = 0;
  const buildTowns = (): void => {
    if (!followsLand) return;
    let to = track.samples.length;
    if (track.endless) {
      const horizon = track.samples[to - 1].s - STREAMED_HOLD;
      while (to > townFrom && track.samples[to - 1].s > horizon) to--;
    }
    if (to <= townFrom) return;
    const whole = roadDistanceField()({ x: 0, z: 0 });
    const branches = branchClearance(track.spurs);
    const placed = placeTowns({
      seed: track.seed,
      width: track.width,
      samples: track.samples,
      from: townFrom,
      to,
      finishS: track.finishS,
      endless: track.endless,
      land,
      spurs: track.spurs,
      junctions: track.junctions,
      routeDistance: (x, z, except) => whole(x, z, false, except),
      branchDistance: branches,
      highwayAt: (x, z) => highways.nearest(x, z, undefined, 40)?.road ?? null,
      // BOUNDED, because the answer is only ever compared against the
      // corridor: an unbounded query with no road near walks every ring of
      // the index, and a town asks it a couple of thousand times a stage.
      highwayDistance: (x, z, except) =>
        highways.nearest(x, z, except, HIGHWAY_LOOK)?.d ?? Infinity,
      shelfBand,
      homesteadDistance: (x, z) => {
        let best = Infinity;
        for (const h of track.homesteads) {
          const d = Math.hypot(h.yard.x - x, h.yard.z - z) - h.yard.radius;
          if (d < best) best = d;
        }
        return best;
      },
      placed: track.towns,
    });
    track.towns.push(...placed.towns);
    townFrom = placed.scanned;
  };

  /** R37 — the homesteads whose slots fall on road committed since the last
   * call. On a finite stage that is the whole stage, once; on an endless one
   * it is everything behind the streaming frontier, because a slot decided
   * against road that is still being shaped would move under a chunk the
   * renderer has already drawn. */
  let homesteadFrom = 0;
  const buildHomesteads = (): void => {
    // A synthetic rig is a measuring device, and a house beside a drift
    // test's straight is a wall the car under test slides into. No country,
    // no homesteads — the same line every other piece of the landscape
    // draws on a rig.
    if (!followsLand) return;
    let to = track.samples.length;
    if (track.endless) {
      const horizon = track.samples[to - 1].s - STREAMED_HOLD;
      while (to > homesteadFrom && track.samples[to - 1].s > horizon) to--;
    }
    if (to <= homesteadFrom) return;
    const placed = placeHomesteads({
      seed: track.seed,
      width: track.width,
      samples: track.samples,
      from: homesteadFrom,
      to,
      finishS: track.finishS,
      land,
      routeDistance: roadDistanceField(),
      branchDistance: branchClearance(track.spurs),
      highwayDistance: (x, z) => highways.nearest(x, z, undefined, HIGHWAY_LOOK)?.d ?? Infinity,
      shelfBand,
      townDistance: (x, z) => {
        let best = Infinity;
        for (const town of track.towns) {
          for (const lot of town.lots) {
            const d = Math.hypot(lot.pad.x - x, lot.pad.z - z) - lot.pad.radius;
            if (d < best) best = d;
          }
        }
        return best;
      },
      placed: track.homesteads,
    });
    track.homesteads.push(...placed);
    homesteadFrom = to;
  };

  return { append };
}

/** How far behind an endless stage's frontier the road is settled enough
 * to put a homestead on, m — the guards' and the crowd's own margin. */
const STREAMED_HOLD = 250;

/** How far a homestead or a town looks for a public road, m. Past this the
 * answer is "none near", which is all either placer ever asks: the widest
 * clearance they hold is `homestead.drive.clear` plus a road width, well
 * inside it. Under the index's `NEAR`, so a probe out in the country is one
 * set lookup rather than a walk of every ring. */
const HIGHWAY_LOOK = 96;

/** R17 — THE COUNTRY, walked off the plan before anything is built.
 *
 * A junction is only worth building where the arm it abandons can leave the
 * map, and the only honest way to know that is to drive the branch — which
 * needs the stage's box and the ground it may not take, both of which are
 * questions about the WHOLE stage that the compiler's cursor cannot answer
 * halfway down it. So the plan is walked once, coarsely, into a box and a
 * bucketed point field, and the junction test drives its trial branch
 * against that.
 *
 * Coarser than the compiled stage — a segment is stepped every few meters
 * rather than every two — because what it feeds are clearances measured in
 * tens of meters, and the slack is subtracted off every answer so the field
 * can only ever under-report the room a branch has, never invent some. */
type Country = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** R23 — the keep-out field, with the ground around the junction under
   * test excluded (a branch leaves a junction ON the road it is leaving). */
  roadDistance: (meet: {
    x: number;
    z: number;
  }) => (x: number, z: number, ignoring?: boolean) => number;
  /** R31 — whether the ground is still there for a road at this height. */
  shelfHolds: (x: number, z: number, y: number) => boolean;
  /** R31 — and the heights themselves: the band a road may stand in here
   * without its shelf standing as a wall beside the stage. */
  shelfBand: (x: number, z: number) => ShelfBand;
};

const PLAN_STEP = 6;

/** How much each road-distance field UNDER-reports by, m: half its own
 * coarsened spacing, subtracted off every answer so a field can only ever
 * claim a branch has less room than it really has, never more.
 *
 * Named rather than inlined so the three fields cannot drift apart: they
 * are the same idea measured at three different strides, and a reader
 * comparing one against another needs to see that. */
const BRANCH_DISTANCE_SLACK = (8 * SPUR.step) / 2;
const STAGE_DISTANCE_SLACK = (8 * SAMPLE_STEP) / 2;
const PLAN_DISTANCE_SLACK = PLAN_STEP / 2;

/** How near a junction's meeting point the route IS the branch's own road,
 * m: inside it the two carriageways are one, so the branch is not measured
 * against them while it is still LEAVING. A PLACE and not a stretch of arc
 * — see `STAGE_RULES.junction.parting`, which is where the rule lives
 * because the analysis has to exempt exactly the same neighbourhood.
 *
 * The two fields that read it apply it at two different radii, and the
 * difference is load-bearing: THE TRIAL MUST NEVER BE MORE OPTIMISTIC THAN
 * THE BUILD. `armCanLeave` decides whether a junction may exist at all by
 * driving a trial branch against the PLAN walk, and the real branch is then
 * built against the compiled samples — two walks of one plan that diverge
 * by metres, sampled at two strides. Right at the exemption's rim those
 * metres decide whether a piece of route is the branch's own road or a road
 * it may not touch, and where the trial says yes and the build says no what
 * is left on the map is a tarmac stub in a field. So the trial exempts a
 * little LESS than the build, by the slack the two fields already carry:
 * every junction the trial accepts is one the build had at least as much
 * room for. Seed 38's short sprint is the case that named it — the two
 * fields put one piece of route either side of an 80 m rim. */
const TRIAL_PARTING = R.junction.parting - PLAN_DISTANCE_SLACK;
const BUILT_PARTING = R.junction.parting + STAGE_DISTANCE_SLACK;

function planCountry(
  plans: SegmentPlan[],
  width: number,
  rolling: (s: number) => number,
  /** R34 — the ground the road will be laid ALONG. Without it the trial
   * walks a road at its roll alone, which on any stage with relief in it is
   * tens of metres from where the real one ends up: `shelfHolds` then
   * compares a branch's height against a route that is not there, and the
   * junction test stops meaning anything. */
  land: ReturnType<typeof createLandField>,
): Country {
  const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const pts: { x: number; z: number; y: number; s: number }[] = [];
  const CELL = 48;
  const grid = new Map<number, typeof pts>();
  let x = 0;
  let z = 0;
  let heading = 0;
  let s = 0;
  let rollS = 0;
  // The road builder's eye, at the plan's own resolution: the same lag,
  // grade and crest clamps the compiler walks with, so the trial's heights
  // track the real road's rather than the bare hillside's.
  const F = R.elevation.follow;
  let base = buildableAt(land, 0, 0, rolling(0));
  let slope = 0;
  for (const plan of plans) {
    const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
    const steps = Math.max(1, Math.ceil(plan.length / PLAN_STEP));
    const step = plan.length / steps;
    for (let i = 0; i < steps; i++) {
      heading += curvature * step;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      s += step;
      rollS += step * straightness(curvature);
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (z < box.minZ) box.minZ = z;
      if (z > box.maxZ) box.maxZ = z;
      const roll = rolling(rollS);
      const ground = buildableAt(land, x, z, roll);
      const want = base + (ground - base) * (1 - Math.exp(-step / F.lag));
      let next = (want - base) / step;
      const swing = F.crest * step;
      if (next > slope + swing) next = slope + swing;
      else if (next < slope - swing) next = slope - swing;
      if (next > F.grade) next = F.grade;
      else if (next < -F.grade) next = -F.grade;
      base += next * step;
      slope = next;
      const point = { x, z, y: base + roll, s };
      pts.push(point);
      const key = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
      const bucket = grid.get(key);
      if (bucket) bucket.push(point);
      else grid.set(key, [point]);
    }
  }
  const slack = PLAN_DISTANCE_SLACK;
  const rings = Math.ceil(ROAD_DISTANCE_REACH / CELL);
  // R24 — the aprons the stage's two ends stand on: plain road extrapolated
  // straight past the start gate and the finish line, which a branch may no
  // more cross than it may cross the stage. Modelled here as well as in the
  // real field, because this one's whole job is to answer the same question
  // the real one will — a trial that does not know about them accepts a
  // junction whose branch is then cut short by one, which is a tarmac road
  // stopping in a field and the exact thing the trial exists to prevent.
  const apronOf = (
    at: { x: number; z: number },
    /** The point the road came FROM, so the heading is `behind → at`. */
    behind: { x: number; z: number },
    sign: 1 | -1,
  ): ((x: number, z: number) => number) => {
    const heading = Math.atan2(at.x - behind.x, at.z - behind.z);
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return (x: number, z: number): number => {
      const dx = x - at.x;
      const dz = z - at.z;
      const along = (dx * sin + dz * cos) * sign;
      const lateral = dx * cos - dz * sin;
      return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - R.startZone.apron));
    };
  };
  const n = pts.length;
  const first = apronOf(pts[0], { x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z }, -1);
  const last = apronOf(pts[n - 1], pts[n - 2] ?? pts[n - 1], 1);
  const parting2 = TRIAL_PARTING * TRIAL_PARTING;
  const roadDistance =
    (meet: { x: number; z: number }) =>
    (px: number, pz: number, ignoring = true): number => {
      let best = Math.min(ROAD_DISTANCE_REACH, first(px, pz), last(px, pz));
      const cx = Math.floor(px / CELL);
      const cz = Math.floor(pz / CELL);
      for (let ring = 0; ring <= rings; ring++) {
        if ((ring - 1) * CELL >= best) break;
        for (let dx = -ring; dx <= ring; dx++) {
          const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
          for (let dz = -ring; dz <= ring; dz += stride) {
            const bucket = grid.get(cellKey(cx + dx, cz + dz));
            if (bucket === undefined) continue;
            for (const p of bucket) {
              const d = Math.hypot(p.x - px, p.z - pz);
              if (d >= best) continue;
              if (ignoring) {
                const mx = p.x - meet.x;
                const mz = p.z - meet.z;
                if (mx * mx + mz * mz < parting2) continue;
              }
              best = d;
            }
          }
        }
      }
      return Math.max(0, best - slack);
    };
  const bench = Math.max(width / 2 + ROAD_CROSS.reach, R.verge.bench);
  /** How far apart in height the stage gets from end to end. The cone opens
   * with distance from the road and never closes, so no point further out
   * than this spread allows can tighten a band already found — which is
   * what bounds the ring walk below to a handful of cells instead of the
   * whole stage. */
  let lowest = Infinity;
  let highest = -Infinity;
  for (const p of pts) {
    if (p.y < lowest) lowest = p.y;
    if (p.y > highest) highest = p.y;
  }
  /** R23 + R31 — the band a ROAD may stand in at a point without its shelf
   * becoming a wall beside the stage: the stage's own verge cone, read as
   * two heights instead of as a yes/no.
   *
   * `shelfHolds` answers whether a given height is legal; this answers what
   * the legal heights ARE, which is what a branch needs while it is being
   * BUILT rather than after. Asked once per branch step, so it walks the
   * same grid `roadDistance` does and stops at the first ring that cannot
   * tighten the answer — the cone only ever opens with distance, so a ring
   * whose nearest possible point is already outside the band is a ring with
   * nothing to say. */
  const shelfBand = (px: number, pz: number): ShelfBand => {
    let ceiling = Infinity;
    let floor = -Infinity;
    const cx = Math.floor(px / CELL);
    const cz = Math.floor(pz / CELL);
    for (let ring = 0; ring <= rings; ring++) {
      // The most height either half of the band still has to give, and
      // therefore the furthest ring that could take any of it away.
      const room = Math.max(
        ceiling < Infinity ? ceiling - lowest : Infinity,
        floor > -Infinity ? highest - floor : Infinity,
      );
      if (room < Infinity && (ring - 1) * CELL > bench + slack + room / R.verge.climb) break;
      for (let dx = -ring; dx <= ring; dx++) {
        const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
        for (let dz = -ring; dz <= ring; dz += stride) {
          const bucket = grid.get(cellKey(cx + dx, cz + dz));
          if (bucket === undefined) continue;
          for (const p of bucket) {
            const d = Math.hypot(p.x - px, p.z - pz);
            const swing = Math.max(0, d - bench - slack) * R.verge.climb;
            if (p.y + swing < ceiling) ceiling = p.y + swing;
            if (p.y - swing > floor) floor = p.y - swing;
          }
        }
      }
    }
    return { floor, ceiling };
  };
  const shelfHolds = (px: number, pz: number, y: number): boolean => {
    for (const p of pts) {
      const apart = Math.abs(y - p.y);
      if (apart <= 0) continue;
      const need = bench + apart / R.verge.climb + slack;
      const dx = p.x - px;
      const dz = p.z - pz;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  };
  return { bounds: box, roadDistance, shelfHolds, shelfBand };
}

function emptyTrack(seed: number, endless: boolean, knobs: StageKnobs, circuit = false): Track {
  return {
    seed,
    segments: [],
    samples: [],
    step: SAMPLE_STEP,
    length: 0,
    width: knobScale(knobs.width, R.roadWidth),
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    pacenotes: [],
    checkpoints: [],
    endless,
    circuit,
    finishS: null,
    knobs,
    highways: [],
    spurs: [],
    homesteads: [],
    towns: [],
    junctions: [],
  };
}

/** R22 — a circuit has to close IN HEIGHT as well as on the map.
 *
 * Its last sample lands on its first (that is what makes laps possible),
 * but the road's height is walked forward along the country and there is
 * nothing in that walk to make the last step arrive back where the first
 * one started. What is left is a step at the start line: a car crossing it
 * on lap two drops or climbs it in one sample, which is a wall.
 *
 * The correction is a RAMP, spread over the whole lap. Over kilometres it
 * is a fraction of a percent of grade — under the road's own roll, under
 * anything the physics or the analysis can see — where the same metres
 * taken out at the line are a cliff. It is applied after every warp the
 * compiler does (R17's platforms included) so nothing lands back on top of
 * it, and the junction heights ride the same ramp so a platform still
 * agrees with the road standing on it.
 *
 * Fords and decks ride it too, and have to: the water in a ford is at the
 * road's own height by construction, so moving one without the other is
 * how a crossing ends up perched. */
function closeCircuitHeight(track: Track): void {
  const samples = track.samples;
  if (samples.length < 2 || track.length <= 0) return;
  const step = samples[samples.length - 1].elevation - samples[0].elevation;
  if (Math.abs(step) < 1e-6) return;
  for (const s of samples) s.elevation -= step * (s.s / track.length);
  for (const j of track.junctions) j.y -= step * (j.s / track.length);
}

/** Compile the GENERATED stage for a seed at a menu length. Finite lengths
 * build the whole stage; `endless` builds the opening stretch and hands
 * back a track that extends itself (track.extend) as the run progresses.
 * `knobs` are the generator's dials (rules.ts) — omitted, a stage comes out
 * at the default positions. `shape` (R22) picks between a sprint and a
 * circuit; an endless stage has no shape to pick — it never closes. */
export function compileStage(
  seed: number,
  length: StageLength = "medium",
  knobs?: Partial<StageKnobs>,
  shape: StageShape = "sprint",
): Track {
  const dials = resolveKnobs(knobs);
  const rolling = buildRolling(seed, dials);
  const paving = buildPaving(seed, dials.asphalt);
  const bumps = buildBumps(seed);
  const widthAt = buildWidth(seed);
  if (length !== "endless") {
    const circuit = shape === "circuit";
    const track = emptyTrack(seed, false, dials, circuit);
    const plans = generateStage(seed, length, dials, shape);
    // R17 — THE TARMAC, laid on the bare country from the seed alone and
    // rebuilt here identically to the copy the search planned against. It
    // is not handed over: both sides derive it, which is what keeps a track
    // a pure function of its seed however it was built.
    track.highways = layStageHighways(seed, dials, createLandField(seed, dials), length);
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
      planCountry(plans, track.width, rolling, createLandField(seed, dials)),
      true,
      // R17 — a sprint is routed onto the tarmac; a circuit is not, yet.
      !circuit,
    ).append(plans);
    if (circuit) closeCircuitHeight(track);
    return track;
  }
  const track = emptyTrack(seed, true, dials);
  const compiler = createCompiler(track, rolling, paving, bumps, widthAt);
  const stream = createStageStream(seed, dials);
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
): Track {
  if (segments === undefined) return compileStage(seed, "medium", knobs);
  const dials = resolveKnobs({ asphalt: 0, ...knobs });
  const track = emptyTrack(seed, false, dials);
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
