// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags — plus the
// pacenote list the HUD calls from. One compilation is the single geometric
// truth for a stage — the car's ground height, the road mesh, and the bot's
// racing line all read these samples. The compiler is incremental: an
// endless stage keeps appending to the same track as its stream produces
// new sections.

import type { Crossing, SegmentPlan, StageKnobs, StageLength, TurnSeverity } from "./rules.ts";
import { STAGE_RULES as R, knobScale, resolveKnobs } from "./rules.ts";
import { createStageStream, generateStage } from "./generate.ts";
import { createRng } from "../lib/prng.ts";
import { ROAD_CROSS } from "./road.ts";
import { buildSpur, SPUR_WIDTH, type Spur } from "./spurs.ts";

export type Surface = "gravel" | "asphalt" | "water";

/** What carries a bridge over its water — everything except wading it. */
export type BridgeDeck = Exclude<Crossing, "ford">;

/** R17 — where the route meets the road it borrows. A junction is a PLACE,
 * not a seam: the two carriageways run into one paved apron, which is what
 * a junction looks like anywhere one has ever been built. */
export type RoadJunction = {
  /** The point the two roads' lines cross. */
  x: number;
  z: number;
  /** Road grade there, m. */
  y: number;
  /** Heading of the branch leaving the junction, radians — the arm the
   * route does not take. */
  heading: number;
  /** Inside this distance of the junction, neither road has a verge, a
   * ditch or an edge line: a junction is a hole cut in both roads' borders
   * and paved over, which is what makes the two of them one surface. */
  radius: number;
  /** Half-width of the throat where it opens onto the main road, m — the
   * flare a side road's mouth always has... */
  mouth: number;
  /** ...and how far along the branch it runs before it is just the branch
   * again, m. */
  reach: number;
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

/** Sample spacing along the centerline, meters. */
export const SAMPLE_STEP = 2;

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

/** The incremental heart: walks plans into samples, bounds, and pacenotes,
 * carrying the cursor (and the open pacenote, so a turn combination split
 * across two endless sections still merges into one call). */
function createCompiler(track: Track, rolling: (s: number) => number, paving: Paving): Compiler {
  const cursor: Cursor = { x: 0, z: 0, heading: 0, s: 0, rollS: 0 };
  let openNote: Pacenote | null = null;
  /** Whether the road is sealed right now, and whether the paving field
   * has asked for that to change. The change does not happen where the
   * field asks: it waits for a CORNER to happen at (R17), because that is
   * where one road can meet another instead of merging into it. */
  let pavedNow = false;
  let flipWanted = false;

  /** Junctions found in this pass, waiting for their branches. The branch
   * has to run until it is clear of the stage's country (R17), and how big
   * that country is is only known once the road it belongs to is
   * compiled — so the junction is noted here and the road built below. */
  type Junction = {
    /** Where the two roads actually MEET: the point the corner's entry and
     * exit tangents cross, which is the junction a surveyor would have
     * drawn before either road was built. */
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
   * hairpin. */
  const isJunctionTurn = (plan: SegmentPlan): boolean => {
    if (plan.kind !== "turn" || !plan.radius || plan.feature !== "none") return false;
    const angle = plan.length / plan.radius;
    return angle >= R.paving.junctionAngle.min && angle <= R.paving.junctionAngle.max;
  };

  /** Note the junction a surface change happens at. The route arrives on
   * one road and turns onto the other; the arm it does NOT take carries
   * straight on through the crossing, and that is what the branch is: the
   * sealed road's own line, continued. Joining the tarmac, that line runs
   * BACK from the junction (the road the tarmac came from); leaving it,
   * it runs ON (the road the route abandons). */
  const noteJunction = (plan: SegmentPlan, at: Cursor, joining: boolean): void => {
    const radius = plan.radius ?? 1;
    const angle = plan.length / radius;
    // Tangents of a circular arc meet this far from either end of it.
    const offset = Math.min(R.paving.maxJunctionOffset, radius * Math.tan(angle / 2));
    const headingOut = at.heading + (plan.dir ?? 1) * angle;
    const x = at.x + Math.sin(at.heading) * offset;
    const z = at.z + Math.cos(at.heading) * offset;
    const y = rolling(at.rollS);
    junctions.push({
      x,
      z,
      elevation: y,
      slope: 0,
      heading: joining ? headingOut + Math.PI : at.heading,
      joining,
      s: at.s,
    });
    // The junction proper: the two roads' borders are cut away around the
    // crossing and the gap between their mats is paved, so what meets is
    // one piece of road with a flared mouth — not two ribbons that happen
    // to touch, each still wearing its own kerb.
    const reach = track.width / 2 + 6;
    track.junctions.push({
      x,
      z,
      y,
      heading: joining ? headingOut + Math.PI : at.heading,
      radius: reach + 5,
      mouth: SPUR_WIDTH / 2 + 7,
      reach,
      s: at.s,
      joining,
    });
  };

  /** Build the branch every noted junction earns, now that the road they
   * hang off is compiled. A finite stage hands each branch the stage's own
   * bounding box to escape; a streamed one has no box, so the branch just
   * has to get out of the junction's neighbourhood. */
  const buildForks = (): void => {
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
        ),
      );
    }
    junctions.length = 0;
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

  const append = (plans: SegmentPlan[]): void => {
    const b = track.bounds;
    const firstNew = track.samples.length;
    for (const plan of plans) {
      track.segments.push(plan);
      const steps = Math.max(1, Math.round(plan.length / SAMPLE_STEP));
      const step = plan.length / steps;
      const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
      // R15/R17 — the paving field asks for a surface change; the change
      // waits here for a corner to happen at.
      if (paving.pavedAt(cursor.s) !== pavedNow) flipWanted = true;
      if (flipWanted && isJunctionTurn(plan)) {
        pavedNow = !pavedNow;
        flipWanted = false;
        noteJunction(plan, cursor, pavedNow);
      }
      const lipAt = plan.feature === "jump" ? (plan.featureEnd ?? -1) : -1;
      const rollS0 = cursor.rollS;

      // The co-driver's book: a turn opens a call (or deepens the open one
      // when it continues in the same direction with no straight between);
      // a straight closes it.
      if (plan.kind === "turn" && plan.dir && plan.radius) {
        const angle = plan.length / plan.radius;
        const severity = plan.severity ?? "soft";
        if (openNote && openNote.dir === plan.dir) {
          openNote.endS = cursor.s + plan.length;
          openNote.angle += angle;
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[openNote.severity]) {
            openNote.severity = severity;
          }
        } else {
          openNote = { s: cursor.s, endS: cursor.s + plan.length, dir: plan.dir, severity, angle };
          track.pacenotes.push(openNote);
        }
      } else {
        openNote = null;
      }

      for (let i = 0; i < steps; i++) {
        const uPrev = i * step;
        const u = uPrev + step;
        if (curvature !== 0) cursor.heading += curvature * step;
        cursor.x += Math.sin(cursor.heading) * step;
        cursor.z += Math.cos(cursor.heading) * step;
        cursor.s += step;
        cursor.rollS += step * straightness(curvature);
        // The lip flag lands on the last ramp sample: the one the car
        // leaves. That sample sits at full lip height; past it the road is
        // back at grade, which is the drop that throws the car.
        const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
        const dip = fordDip(plan, u, rollS0, rolling);
        const deckY = bridgeDeck(plan, u, rollS0, rolling);
        // A crossing is a ford OR a deck, never both: the wheels go through
        // the water or ride over it (R13).
        const crossed = inCrossing(plan, u);
        const bridge = crossed && isBridge(plan);
        const ford = crossed && !bridge;
        const paved = !ford && pavedNow;
        track.samples.push({
          x: cursor.x,
          z: cursor.z,
          heading: cursor.heading,
          elevation:
            dip ??
            deckY ??
            rolling(cursor.rollS) + (jump ? (plan.lipHeight ?? 2) : segmentElevation(plan, u)),
          surface: ford ? "water" : paved ? "asphalt" : "gravel",
          deck: bridge ? ((plan.crossing ?? "timber") as BridgeDeck) : null,
          lift: 0,
          jump,
          s: cursor.s,
          curvature,
        });
        if (cursor.x < b.minX) b.minX = cursor.x;
        if (cursor.x > b.maxX) b.maxX = cursor.x;
        if (cursor.z < b.minZ) b.minZ = cursor.z;
        if (cursor.z > b.maxZ) b.maxZ = cursor.z;
      }
    }
    track.length = cursor.s;
    paveLift(firstNew);
    buildForks();
  };

  return { append };
}

function emptyTrack(seed: number, endless: boolean, knobs: StageKnobs): Track {
  return {
    seed,
    segments: [],
    samples: [],
    step: SAMPLE_STEP,
    length: 0,
    width: R.roadWidth,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    pacenotes: [],
    endless,
    knobs,
    spurs: [],
    junctions: [],
  };
}

/** Compile the GENERATED stage for a seed at a menu length. Finite lengths
 * build the whole stage; `endless` builds the opening stretch and hands
 * back a track that extends itself (track.extend) as the run progresses.
 * `knobs` are the generator's dials (rules.ts) — omitted, a stage comes out
 * at the default positions. */
export function compileStage(
  seed: number,
  length: StageLength = "medium",
  knobs?: Partial<StageKnobs>,
): Track {
  const dials = resolveKnobs(knobs);
  const rolling = buildRolling(seed, dials);
  const paving = buildPaving(seed, dials.asphalt);
  if (length !== "endless") {
    const track = emptyTrack(seed, false, dials);
    createCompiler(track, rolling, paving).append(generateStage(seed, length, dials));
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

/** Ground elevation of the road at arc position `s` (clamped). */
export function elevationAt(track: Track, s: number): number {
  const i = Math.min(track.samples.length - 1, Math.max(0, Math.floor(s / track.step)));
  return track.samples[i].elevation;
}
