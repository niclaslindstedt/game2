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
import { createStageStream, generateStage } from "./generate.ts";
import { createRng } from "../lib/prng.ts";
import { createLandField } from "./land.ts";
import { junctionFlat, junctionPlatformY, ROAD_CROSS } from "./road.ts";
import { buildSpur, type Spur } from "./spurs.ts";

export type Surface = "gravel" | "asphalt" | "water";

/** What carries a bridge over its water — everything except wading it. */
export type BridgeDeck = Exclude<Crossing, "ford">;

/** R17 — where the route meets the road it borrows. A junction is a PLACE,
 * not a seam. It sits ON the route's centerline, at a corner: the sealed
 * road — the MAIN road — runs straight through it, made of the route's own
 * collinear arm on one side and the abandoned branch on the other, and the
 * gravel road the route turns onto (or off) is the MINOR one, which simply
 * stops at the main road's edge. Everything inside the platform is one
 * graded plane, one surface, and no borders. */
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
  /** ...and the radius inside which that flattening applies, m. */
  radius: number;
  /** R17 — the GORE NOSE: the pavement carried into the wedge between the
   * two carriageways where they have just parted, as flat quads on the
   * platform's plane. Two roads that leave a junction together part over
   * a couple of dozen meters and leave a wedge of country between them;
   * where that wedge is narrower than a car it is not an island but a
   * seam, and a junction whose grass runs to a knife point is the tell
   * that nobody planned it. Built from the road's OWN samples rather than
   * from the corner's nominal arc — a stage corner is a run of segments,
   * and after the first one it is no longer the circle it started as. */
  gore: [number, number][][];
  /** Arc position on the stage (association / pruning). */
  s: number;
  /** True where the route JOINS the sealed road, false where it leaves. */
  joining: boolean;
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
  /** R17 — the branches the route abandons at every asphalt junction: real
   * road, taped off, there to be explored by anyone who ignores the tape. */
  spurs: Spur[];
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

/** R12 — the dip a ford sits in. Water lies FLAT at `bedDepth` below the
 * lowest rolling grade around it (so it reads as collected, never perched),
 * and the road eases down to it and back out over the aprons. Fords sit on
 * straights, where the rolling profile advances 1:1 with arc, so the whole
 * dip can be shaped from local arc position alone. Returns the elevation
 * override for local position `u`, or null outside the dip. */
function fordDip(
  plan: SegmentPlan,
  u: number,
  rollS0: number,
  rolling: (s: number) => number,
): number | null {
  if (plan.feature !== "water" || plan.featureStart === undefined || plan.featureEnd === undefined)
    return null;
  if (isBridge(plan)) return null;
  const from = plan.featureStart - R.water.apron;
  const to = plan.featureEnd + R.water.apron;
  if (u < from || u > to) return null;
  let low = Infinity;
  for (let v = from; v <= to; v += 2) low = Math.min(low, rolling(rollS0 + v));
  const water = low - R.water.bedDepth;
  if (u >= plan.featureStart && u <= plan.featureEnd) return water;
  const t = u < plan.featureStart ? (u - from) / R.water.apron : (to - u) / R.water.apron;
  const base = rolling(rollS0 + u);
  return base + (water - base) * smoothstep(t);
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
  rollS0: number,
  rolling: (s: number) => number,
): number | null {
  if (!isBridge(plan) || plan.featureStart === undefined || plan.featureEnd === undefined) {
    return null;
  }
  const from = plan.featureStart - R.bridge.margin;
  const to = plan.featureEnd + R.bridge.margin;
  if (u < from || u > to) return null;
  let high = -Infinity;
  for (let v = from; v <= to; v += 2) high = Math.max(high, rolling(rollS0 + v));
  if (u >= plan.featureStart && u <= plan.featureEnd) return high;
  const t = u < plan.featureStart ? (u - from) / R.bridge.margin : (to - u) / R.bridge.margin;
  const base = rolling(rollS0 + u);
  return base + (high - base) * smoothstep(t);
}

type Cursor = { x: number; z: number; heading: number; s: number; rollS: number };

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

/** Arc either side of a junction where the route IS the branch's own road,
 * m: inside it the two carriageways are one, so the branch is not measured
 * against them. Wide enough to cover the corner the junction sits on and
 * the run out of it. */
const SPUR_JUNCTION_WINDOW = 240;

/** The incremental heart: walks plans into samples, bounds, and pacenotes,
 * carrying the cursor (and the open pacenote, so a turn combination split
 * across two endless sections still merges into one call). */
function createCompiler(track: Track, rolling: (s: number) => number, paving: Paving): Compiler {
  const cursor: Cursor = { x: 0, z: 0, heading: 0, s: 0, rollS: 0 };
  /** The bare country the stage is laid across — the branches steer by it
   * so none of them drives out into a lake (R17). */
  const land = createLandField(track.seed, track.knobs);
  let openNote: Pacenote | null = null;
  /** Whether the road is sealed right now, and whether the paving field
   * has asked for that to change. The change does not happen where the
   * field asks: it waits for a CORNER to happen at (R17), because that is
   * where one road can meet another instead of merging into it. */
  // A stage that is sealed from end to end has no junction to arrive
  // through: it simply starts on the tarmac. Every other stage starts on
  // gravel and meets its first junction where the field asks for one.
  let pavedNow = paving.pavedAt(0);
  let flipWanted = false;

  /** The road's PRISTINE heights, before any junction platform warped it
   * (R17) — kept alongside the samples so a warp pass that overlaps an
   * earlier one lands in exactly the same place instead of compounding. */
  const rawY: number[] = [];

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
  };
  const junctions: Junction[] = [];

  /** R17 — is this corner one a junction could sit at? A junction is where
   * a road MEETS another; that needs a real turn, neither a kink nor a
   * hairpin, and one tight enough that the two carriageways actually PART
   * rather than peel away from each other over fifty meters of tangent. */
  const isJunctionTurn = (plan: SegmentPlan): boolean => {
    if (plan.kind !== "turn" || !plan.radius || plan.feature !== "none") return false;
    const angle = plan.length / plan.radius;
    if (angle < R.paving.junctionAngle.min || angle > R.paving.junctionAngle.max) return false;
    return partedAt(plan.radius) <= R.paving.junctionParts * track.width;
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
    const y = rolling(at.rollS);
    const slope = (rolling(at.rollS + 2) - rolling(at.rollS - 2)) / 4;
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
      radius: reach,
      gore: [],
      s: at.s,
      joining,
    });
  };

  /** R17 — cut the gore nose for a junction, from the road that actually
   * got built. Walks the MINOR road away from the meeting point, tracks
   * its near edge against the main road's edge line, and paves the wedge
   * between them from where they touch out to where the gap is wide
   * enough to be an island. `step` is +1 where the minor road runs on from
   * the junction and -1 where it runs back into it. */
  const cutGore = (junction: RoadJunction, at: number, step: 1 | -1): void => {
    const all = track.samples;
    const turn = Math.sign(junction.curve);
    const half = junction.width / 2;
    const bx = Math.sin(junction.heading);
    const bz = Math.cos(junction.heading);
    const nx = Math.cos(junction.heading);
    const nz = -Math.sin(junction.heading);
    const edge = (i: number): { along: number; across: number } | null => {
      const sample = all[i];
      if (!sample) return null;
      // The minor road's edge on the side the gore opens.
      const rx = Math.cos(sample.heading);
      const rz = -Math.sin(sample.heading);
      const dx = sample.x - rx * half * turn - junction.x;
      const dz = sample.z - rz * half * turn - junction.z;
      return { along: dx * bx + dz * bz, across: (dx * nx + dz * nz) * turn };
    };
    const point = (along: number, across: number): [number, number] => [
      junction.x + bx * along + nx * across * turn,
      junction.z + bz * along + nz * across * turn,
    ];
    let prev: { along: number; across: number } | null = null;
    const quads: [number, number][][] = [];
    for (let k = 0; k < Math.ceil(R.junction.reach.max / SAMPLE_STEP); k++) {
      const here = edge(at + k * step);
      if (!here) break;
      if (prev && prev.across < half && here.across >= half) {
        // The touching point, interpolated — the gore has to start where
        // the two edges actually cross, not at the next sample along.
        const t = (half - prev.across) / (here.across - prev.across);
        prev = {
          along: prev.along + (here.along - prev.along) * t,
          across: half,
        };
      }
      if (prev && prev.across >= half) {
        if (here.across - half > R.junction.goreNose) {
          const t = (R.junction.goreNose + half - prev.across) / (here.across - prev.across);
          const along = prev.along + (here.along - prev.along) * t;
          quads.push([
            point(prev.along, half),
            point(prev.along, prev.across),
            point(along, R.junction.goreNose + half),
            point(along, half),
          ]);
          break;
        }
        quads.push([
          point(prev.along, half),
          point(prev.along, prev.across),
          point(here.along, here.across),
          point(here.along, half),
        ]);
      }
      prev = here;
    }
    junction.gore = quads;
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
    // Numeric cell keys: a branch asks this tens of thousands of times, and
    // a template string per probe is a string allocated per probe. Cell
    // indices are bounded by the world (a few dozen either way), so packing
    // two of them into one integer cannot collide.
    const key = (ix: number, iz: number): number => ix * 8192 + iz;
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
    const slack = (STRIDE * SAMPLE_STEP) / 2;
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
    /** Distance to the apron running back from `sample` against its heading
     * (the start's run-up) or forward along it (the finish's run-off). */
    const apronDistance = (sample: TrackSample, sign: 1 | -1, x: number, z: number): number => {
      const along =
        ((x - sample.x) * Math.sin(sample.heading) + (z - sample.z) * Math.cos(sample.heading)) *
        sign;
      const lateral =
        (x - sample.x) * Math.cos(sample.heading) - (z - sample.z) * Math.sin(sample.heading);
      return Math.hypot(lateral, along <= 0 ? -along : Math.max(0, along - R.startZone.apron));
    };
    const first = track.samples[0];
    const last = track.samples[track.samples.length - 1];
    return (ignoreFrom: number, ignoreTo: number) =>
      (x: number, z: number): number => {
        let best = apronDistance(first, -1, x, z);
        if (!track.endless) best = Math.min(best, apronDistance(last, 1, x, z));
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
            const edge = Math.abs(dx) === ring;
            for (let dz = -ring; dz <= ring; dz++) {
              if (!edge && Math.abs(dz) !== ring) continue;
              for (const sample of grid.get(key(cx + dx, cz + dz)) ?? []) {
                if (sample.s > ignoreFrom && sample.s < ignoreTo) continue;
                const d = Math.hypot(sample.x - x, sample.z - z);
                if (d < best) best = d;
              }
            }
          }
        }
        return Math.min(Math.max(0, best - slack), ROAD_DISTANCE_REACH);
      };
  };

  /** Build the branch every noted junction earns, now that the road they
   * hang off is compiled. A finite stage hands each branch the stage's own
   * bounding box to escape; a streamed one has no box, so the branch just
   * has to get out of the junction's neighbourhood. */
  const buildForks = (): void => {
    if (junctions.length === 0) return;
    const roadDistance = roadDistanceField();
    for (const junction of junctions) {
      const box = track.endless
        ? {
            minX: junction.x - STREAMED_ESCAPE,
            maxX: junction.x + STREAMED_ESCAPE,
            minZ: junction.z - STREAMED_ESCAPE,
            maxZ: junction.z + STREAMED_ESCAPE,
          }
        : track.bounds;
      track.spurs.push(
        buildSpur(
          track.seed,
          {
            x: junction.x,
            z: junction.z,
            heading: junction.heading,
            elevation: junction.elevation,
            slope: junction.slope,
          },
          junction.s,
          junction.joining ? "entry" : "exit",
          box,
          land,
          track.width,
          roadDistance(junction.s - SPUR_JUNCTION_WINDOW, junction.s + SPUR_JUNCTION_WINDOW),
        ),
      );
    }
    junctions.length = 0;
    // R17 — and the first stretch of every branch lies on its junction's
    // platform, exactly like the road it leaves: same plane, no crown, no
    // border, so the two carriageways are one piece of ground.
    for (const spur of track.spurs) {
      const platform = track.junctions.find(
        (j) => j.s === spur.atS && j.joining === (spur.end === "entry"),
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
    const tightness = Math.abs(curvature) * R.bank.pivotRadius;
    if (tightness <= 0) return 0;
    const ceiling = R.bank.max[sample.surface === "asphalt" ? "asphalt" : "gravel"];
    return Math.sign(curvature) * ceiling * (tightness / (1 + tightness));
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
    const raw = all.slice(start).map((sample) => sample.bank);
    for (let i = start; i < all.length; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k++) {
        const at = i + k - start;
        if (at < 0 || at >= raw.length) continue;
        const w = 1 - Math.abs(k) / (reach + 1);
        sum += raw[at] * w;
        weight += w;
      }
      all[i].bank = weight > 0 ? sum / weight : 0;
    }
  };

  /** R17 — warp the road onto its junctions' platforms. Inside a junction
   * the two carriageways are one graded plane: the crown, the camber and
   * the wheel tracks come out (`flat`) and the centerline eases onto the
   * plane the main road's grade defines. Run off the PRISTINE heights, so
   * a pass that overlaps an earlier one lands in the same place. */
  const platformWarp = (from: number): void => {
    if (track.junctions.length === 0) return;
    const all = track.samples;
    const reach = Math.ceil(R.junction.reach.max / SAMPLE_STEP) + 1;
    const start = Math.max(0, from - reach);
    for (let i = start; i < all.length; i++) {
      const sample = all[i];
      let flat = 0;
      let plane = 0;
      for (const junction of track.junctions) {
        if (Math.abs(junction.s - sample.s) > R.junction.reach.max * 2) continue;
        const w = junctionFlat(junction, sample.x, sample.z);
        if (w <= flat) continue;
        flat = w;
        plane = junctionPlatformY(junction, sample.x, sample.z);
      }
      sample.flat = flat;
      sample.elevation = rawY[i] * (1 - flat) + plane * flat;
    }
  };

  const append = (plans: SegmentPlan[]): void => {
    const b = track.bounds;
    const firstNew = track.samples.length;
    for (const plan of plans) {
      // R15/R17 — the paving field asks for a surface change; the change
      // waits here for a corner to happen at (R17), and then falls at the
      // JUNCTION's own edge — where the route's line actually leaves the
      // main road's mat — rather than at the segment boundary.
      if (paving.pavedAt(cursor.s) !== pavedNow) flipWanted = true;
      let flipAt = -1;
      let joinAtEnd: SegmentPlan | null = null;
      if (flipWanted && isJunctionTurn(plan)) {
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
          // line first reaches the mat, and the junction is at the corner's
          // end, which the cursor only knows once the corner is walked.
          flipAt = plan.length - onMain;
          joinAtEnd = plan;
        }
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

      for (let i = 0; i < steps; i++) {
        const uPrev = i * step;
        const u = uPrev + step;
        if (flipAt >= 0 && uPrev < flipAt && u >= flipAt) pavedNow = !pavedNow;
        if (curvature !== 0) cursor.heading += curvature * step;
        cursor.x += Math.sin(cursor.heading) * step;
        cursor.z += Math.cos(cursor.heading) * step;
        cursor.s += step;
        cursor.rollS += step * straightness(curvature);
        // The lip flag lands on the last ramp sample: the one the car
        // leaves. That sample sits at full lip height; past it the road is
        // back at grade, which is the drop that throws the car.
        const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
        const dip = fordDip(built, u, rollS0, rolling);
        const deckY = bridgeDeck(built, u, rollS0, rolling);
        // A crossing is a ford OR a deck, never both: the wheels go through
        // the water or ride over it (R13).
        const crossed = inCrossing(built, u);
        const bridge = crossed && isBridge(built);
        const ford = crossed && !bridge;
        const paved = !ford && pavedNow;
        const sample: TrackSample = {
          x: cursor.x,
          z: cursor.z,
          heading: cursor.heading,
          elevation:
            dip ??
            deckY ??
            rolling(cursor.rollS) + (jump ? (built.lipHeight ?? 2) : segmentElevation(built, u)),
          surface: ford ? "water" : paved ? "asphalt" : "gravel",
          deck: bridge ? ((built.crossing ?? "timber") as BridgeDeck) : null,
          lift: 0,
          jump,
          s: cursor.s,
          curvature,
          bank: 0,
          flat: 0,
        };
        sample.bank = bankRate(curvature, sample);
        track.samples.push(sample);
        rawY.push(sample.elevation);
        if (cursor.x < b.minX) b.minX = cursor.x;
        if (cursor.x > b.maxX) b.maxX = cursor.x;
        if (cursor.z < b.minZ) b.minZ = cursor.z;
        if (cursor.z > b.maxZ) b.maxZ = cursor.z;
      }
      if (joinAtEnd) noteJunction(joinAtEnd, cursor, true);
    }
    track.length = cursor.s;
    paveLift(firstNew);
    bankRunoff(firstNew);
    platformWarp(firstNew);
    // The gore is cut from the road on BOTH sides of the meeting point, so
    // it waits until the corner it belongs to has actually been walked.
    const fromS = firstNew * SAMPLE_STEP - R.junction.reach.max;
    for (const junction of track.junctions) {
      if (junction.s < fromS) continue;
      const at = Math.round(junction.s / SAMPLE_STEP) - 1;
      if (at < 1 || at >= track.samples.length - 1) continue;
      cutGore(junction, at, junction.joining ? -1 : 1);
    }
    buildForks();
  };

  return { append };
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
    endless,
    circuit,
    finishS: null,
    knobs,
    spurs: [],
    junctions: [],
  };
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
  if (length !== "endless") {
    const circuit = shape === "circuit";
    const track = emptyTrack(seed, false, dials, circuit);
    createCompiler(track, rolling, paving).append(generateStage(seed, length, dials, shape));
    return track;
  }
  const track = emptyTrack(seed, true, dials);
  const compiler = createCompiler(track, rolling, paving);
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
  createCompiler(track, () => 0, buildPaving(seed, dials.asphalt)).append(segments);
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
