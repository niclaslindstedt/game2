// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD ACROSS AND ALONG, as functions of arc position rather than of
// the stage: the elevation profile inside one segment (the jump's ramp,
// the crest's brow, the ford's dip), the seeded fields the compiler lays
// over the whole stage — where the tarmac is (`buildPaving`), how the
// width wanders (`buildWidth`), how the bladed surface bumps
// (`buildBumps`) — and the two crossings that need real geometry, a ford's
// apron and a bridge's deck.
//
// Everything here is a pure function of the seed and a position: nothing
// knows a cursor is walking, which is what lets the search ask the same
// questions the compiler will answer.

import type { SegmentPlan, TurnSeverity } from "./rules.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { createRng } from "../lib/prng.ts";
import { hash2 } from "../lib/noise.ts";
import { NOISE_LATTICE, valueNoise1d as valueNoise } from "./rolling.ts";
import { ROAD_CROSS } from "./road.ts";
import { type Spur } from "./spurs.ts";
import { type PublicRoad } from "./publicroad.ts";
import { isLoose, type Surface } from "./track-shape.ts";
import { BRANCH_DISTANCE_SLACK } from "./compile-country.ts";

export const SEVERITY_RANK: Record<TurnSeverity, number> = { soft: 0, medium: 1, hard: 2 };

/** Elevation profile within one segment at local arc position `u`. */
export function segmentElevation(plan: SegmentPlan, u: number): number {
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
export function inCrossing(plan: SegmentPlan, u: number): boolean {
  return (
    plan.feature === "water" &&
    plan.featureStart !== undefined &&
    plan.featureEnd !== undefined &&
    u >= plan.featureStart &&
    u <= plan.featureEnd
  );
}

/** Where a straight leaving `from` along its heading meets the line from
 * `a` to `b`: the distance along the straight, or null where the two do
 * not cross inside that segment. */
export function meetLine(
  from: { x: number; z: number; heading: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number | null {
  const dx = Math.sin(from.heading);
  const dz = Math.cos(from.heading);
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return null;
  const fx = a.x - from.x;
  const fz = a.z - from.z;
  const t = (fx * dz - fz * dx) / den;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return (fx * ez - fz * ex) / den;
}

export function isBridge(plan: SegmentPlan): boolean {
  return plan.feature === "water" && (plan.crossing === "timber" || plan.crossing === "concrete");
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
export type Paving = {
  pavedAt: (s: number) => boolean;
  liftAt: (s: number) => number;
};

export function buildPaving(seed: number, asphalt: number): Paving {
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

/** R33 — how wide the gravel is at an arc position, as a multiple of the
 * stage's nominal width. The road is cut TIGHT and then given three things
 * back: two slow waves that open it out and pinch it in along the stage,
 * and the corners, which are wider because everything that ever swung round
 * one widened it. Nothing short: a width that changes inside a car's length
 * is a ragged edge, not a road that opens out. */
export type WidthAt = (s: number, surface: Surface, shaped: boolean, curvature: number) => number;

export function buildWidth(seed: number): WidthAt {
  const rng = createRng((seed ^ 0x2f1e8c3d) >>> 0);
  const W = R.roughness.width;
  const long = Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1));
  const short = Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1));
  const longOff = rng.range(0, 1e4);
  const shortOff = rng.range(0, 1e4);
  return (s: number, surface: Surface, shaped: boolean, curvature: number): number => {
    // Laid, not bladed: a paving machine and a bridge deck hold their width.
    if (shaped || !isLoose(surface)) return 1;
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
export function buildBumps(seed: number): (s: number, surface: Surface, shaped: boolean) => number {
  const B = R.roughness;
  const salt = (seed ^ 0x51ed270b) >>> 0;
  return (s: number, surface: Surface, shaped: boolean): number => {
    // Tarmac is laid flat, a deck is planks or concrete, and a ford's water
    // and its graded apron are shaped by the crossing (R12).
    if (shaped || !isLoose(surface)) return 0;
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

export function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
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
export function fordDip(
  plan: SegmentPlan,
  u: number,
  base: (u: number) => number,
  roll: (u: number) => number,
  /** The bare land's own level at the crossing's middle, m — the valley
   * the water lies in (R12), read through `buildableAt` so a ford beside a
   * lake keeps the lake's freeboard. */
  valley: () => number,
): number | null {
  if (plan.feature !== "water" || plan.featureStart === undefined || plan.featureEnd === undefined)
    return null;
  // A deck holds the road level and a culvert leaves it on its line:
  // neither dips.
  if (isBridge(plan) || plan.crossing === "culvert") return null;
  // R12 — the aprons are the search's, each sized to the drop its mouth
  // has to make (`crossingSits`); the rule book's is the least either is.
  const apronIn = plan.apronIn ?? R.water.apron;
  const apronOut = plan.apronOut ?? R.water.apron;
  const from = plan.featureStart - apronIn;
  const to = plan.featureEnd + apronOut;
  if (u < from || u > to) return null;
  const line = (v: number): number => base(v) + roll(v);
  let low = Infinity;
  const inner = R.water.apron;
  for (let v = plan.featureStart - inner; v <= plan.featureEnd + inner; v += 2) {
    low = Math.min(low, roll(v));
  }
  // The level the crossing WANTS: the roll's lowest against the landscape
  // at the crossing's middle, so the water reads as collected rather than
  // perched on a local rise, and a road descending through the window does
  // not have to lose the whole window's fall over one apron — and never
  // above the LAND there. A ford's water is the stream's, and the stream
  // lies in the valley floor: a road crossing it on an embankment dips down
  // to it, it does not lift the water up to the road. Laid against the road
  // instead, a ford on fill anchored its river metres over the country and
  // R18 drew the reach floating above both its banks.
  const wanted =
    Math.min(base((plan.featureStart + plan.featureEnd) / 2) + low, valley()) - R.water.bedDepth;
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
  const t = u < plan.featureStart ? (u - from) / apronIn : (to - u) / apronOut;
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
export function bridgeDeck(
  plan: SegmentPlan,
  u: number,
  base: (u: number) => number,
  roll: (u: number) => number,
): number | null {
  if (!isBridge(plan) || plan.featureStart === undefined || plan.featureEnd === undefined) {
    return null;
  }
  // R13 — the margins are the search's, each sized to what its mouth has
  // to climb onto the deck (`crossingSits`); the rule book's is the least
  // either is.
  const marginIn = plan.apronIn ?? R.bridge.margin;
  const marginOut = plan.apronOut ?? R.bridge.margin;
  const from = plan.featureStart - marginIn;
  const to = plan.featureEnd + marginOut;
  if (u < from || u > to) return null;
  // R34 — the roll is searched, the landscape is read at the middle. Same
  // split, and for the same reason, as the ford above: a deck pinned to the
  // highest point of a road that is climbing through the crossing has to be
  // ramped down from at the far end, and the ramp is a wall. The roll is
  // searched over the rule book's own margin, the same window the search
  // read it over, whatever the margins came out at.
  let high = -Infinity;
  for (
    let v = plan.featureStart - R.bridge.margin;
    v <= plan.featureEnd + R.bridge.margin;
    v += 2
  ) {
    high = Math.max(high, roll(v));
  }
  const deck = base((plan.featureStart + plan.featureEnd) / 2) + high;
  if (u >= plan.featureStart && u <= plan.featureEnd) return deck;
  const t = u < plan.featureStart ? (u - from) / marginIn : (to - u) / marginOut;
  const here = base(u) + roll(u);
  return here + (deck - here) * smoothstep(t);
}

export type Cursor = {
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

export type Compiler = {
  append: (plans: SegmentPlan[]) => void;
};

/** How far around a junction an ENDLESS stage's branch has to get before it
 * may end, m — the finite stages hand the branch the whole stage's box to
 * escape, but a stage with no end has no box, so the branch simply has to
 * leave the neighbourhood (well past the fog ceiling). */
export const STREAMED_ESCAPE = 460;

/** How far a branch's keep-out query resolves, m; past this it answers
 * exactly "this far and no nearer". It has to cover the branch's own
 * look-ahead plus the widest clearance a road can earn (R23), because the
 * branch treats the answer as a PROMISE about the next few steps and a
 * capped distance it walked past would be a promise the query never made. */
export const ROAD_DISTANCE_REACH = 220;

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
export function branchClearance(
  /** Every road off the stage: the abandoned branches, and the public roads
   * the route never met (R17) — a lot, a yard and a fence keep off both, and
   * nothing about the rule cares which kind of road it is measuring. */
  list: readonly (Spur | PublicRoad)[],
): (x: number, z: number, except?: Spur) => number {
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

/** R23 + R31 — does a trial arm keep its distance from the other arms IN
 * HEIGHT? Two branches down one hillside are two roads like any other pair,
 * and the ground between them is whatever joins their two shelves: where
 * the higher one stands more over the lower than the country may climb
 * across the gap (`verge.climb` past the bench), that ground is a face. The
 * route is held off its own stacked legs by exactly this rule
 * (`search.ts`'s `armSeparation`); the branches forked off two of those
 * legs were not, and ran down the same face 36 m apart in height and 75 m
 * on the map (alpine seed 6 at the campaign dials). Nothing downstream can
 * mend it — a branch is pinned to its junction's platform, so folding the
 * other arms into its band clamps a step into the arm and moves the face
 * nowhere — so the second fork is refused HERE, and the search draws
 * another corner.
 *
 * Nobody is exempt: two arms share no meeting point. And it is stricter
 * than the analysis's `roads.step`, which forgives `stepFloor` of excess:
 * this forgives none, and takes the branch's own stride slack off the
 * distance, because the real arm is built from the compiled samples and
 * lands metres from where this trial walked. The distance half of R23 is
 * `branchClearance`'s; at no height difference this asks for less than it
 * and adds nothing. */
export function armsKeepHeight(arm: Spur, others: readonly Spur[], bench: number): boolean {
  const STRIDE = 8;
  const climb = R.verge.climb;
  const slack = BRANCH_DISTANCE_SLACK;
  for (const other of others) {
    const b = other.bounds;
    if (
      arm.bounds.maxX < b.minX - ROAD_DISTANCE_REACH ||
      arm.bounds.minX > b.maxX + ROAD_DISTANCE_REACH ||
      arm.bounds.maxZ < b.minZ - ROAD_DISTANCE_REACH ||
      arm.bounds.minZ > b.maxZ + ROAD_DISTANCE_REACH
    ) {
      continue;
    }
    for (let i = 0; i < arm.samples.length; i += STRIDE) {
      const a = arm.samples[i];
      for (let k = 0; k < other.samples.length; k += STRIDE) {
        const o = other.samples[k];
        const need = bench + Math.abs(a.elevation - o.elevation) / climb + slack;
        const dx = a.x - o.x;
        const dz = a.z - o.z;
        if (dx * dx + dz * dz < need * need) return false;
      }
    }
  }
  return true;
}
