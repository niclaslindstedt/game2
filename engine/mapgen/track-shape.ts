// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A COMPILED STAGE IS. The single geometric truth the physics, the
// renderer, the bots and every tool read: the evenly spaced samples along
// the centerline, the pacenotes called off them, the junctions onto the
// public roads and the crossings over them, the checkpoints and the
// culverts, and the `Track` they all hang off — the road plus everything
// the country around it turned out to hold.
//
// It is only the SHAPE. How one is built is `compile.ts`'s.

import type { Crossing, SegmentPlan, StageKnobs, TurnSeverity } from "./rules.ts";
import { SAMPLE_STEP } from "./rules.ts";
import type { ArenaPlan } from "./arena.ts";
import { type Climate } from "../game/climate.ts";
import { type Spur } from "./spurs.ts";
import { type PublicRoad } from "./publicroad.ts";
import { type Homestead } from "./homesteads.ts";
import { type Town } from "./towns.ts";
import { type SolarFarm, type WindFarm } from "./energy.ts";
import { type PowerLine } from "./powerline.ts";
import { type Highway } from "./highway.ts";
import { type RailCrossing } from "./railway.ts";

/** What the road is made of under the car. Two of these are LOOSE — the
 * taiga's graded gravel and the desert's sand (R40) — and everything about
 * a road that is bladed rather than laid (the wander, the bumps, the berm,
 * the mouth at a junction, the marker posts) asks `isLoose` rather than
 * naming one of them. Which loose surface a country's roads are is the
 * biome's (`BiomeRules.loose`); the physics tells them apart in
 * `TUNING.surfaces`. */
export type Surface = "gravel" | "sand" | "asphalt" | "water" | "snow" | "ice";
/** What a car can be STANDING ON, which is more than what a road can be
 * made of: the road's own surfaces, the open country (`nature`), and the
 * open country under a winter's blanket (`snowfield`, climate.ts) — deep
 * snow the car ploughs rather than a road it drives. */
export type Underfoot = Surface | "nature" | "snowfield";

/** A road that was BLADED rather than laid: graded stone or graded sand —
 * or the packed snow lying over either above the snowline (R47) — as
 * against tarmac, a deck or a ford. */
export function isLoose(surface: Surface): boolean {
  return surface === "gravel" || surface === "sand" || surface === "snow";
}

/** What carries a bridge over its water — everything except wading it. */
export type BridgeDeck = Exclude<Crossing, "ford" | "culvert">;

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
  /** How hard THIS sample's surface holds against its own table row
   * (`TUNING.surfaces.grip`), as a multiplier: 1 everywhere but on snow,
   * where the temperature at the road's own height decides whether it is
   * glazed, slush or cold and sharp (`snowBite`, climate.ts). The physics
   * and the bot's plan both read it, so the corner on the pass is braked
   * for as the corner it is. */
  bite: number;
  /** R47 — how deep the snow lying on this piece of road stands where
   * nothing has driven on it, m; 0 on every surface but snow. Its shape
   * across the width — a cover over the crown, worn away in the tracks —
   * is `crossOffset`'s (road.ts), and how a car works it down further is
   * `snowpack.ts`. */
  snow: number;
  /** Set where the road is a bridge DECK: the surface is road, but there is
   * a channel of water under it instead of ground, and the kind says what
   * carries it — trunks and planks, or concrete piers (R13). */
  deck: BridgeDeck | null;
  /** R47 — true where the road is BORED: the country stands over it
   * untouched, the terrain shapes nothing off this sample, its walls are
   * solid and the renderer lines it. Never together with a deck. */
  tunnel: boolean;
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

/** R12 — a CULVERT: where a stream passes under the road in a pipe. The
 * road's own sample there is ordinary road; this is the water's half. */
export type Culvert = {
  x: number;
  z: number;
  /** Arc position on the stage, m. */
  s: number;
  /** The road's heading there, rad — the pipe runs square across it. */
  heading: number;
  /** The stream's surface through the pipe, m — the valley's own level,
   * `water.culvert.cover` or more under the road. */
  waterY: number;
  /** Half-width of the water through the pipe, m. */
  halfWidth: number;
  /** How far across the road its mat reaches from the centerline, m —
   * where the pipe's mouths and the open water begin. */
  edge: number;
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
  /** THE TRAINING GROUND, on the tracks that are one (`arena.ts`) — and
   * null on every generated stage, which is all of them.
   *
   * It rides on the track rather than beside it for the reason the highways
   * do: `createTerrain` takes a track and nothing else, and the engine, the
   * renderer, the tests and the tooling each build their own field from the
   * same one. A training ground that were passed in separately would be a
   * training ground half the readers could not see. */
  arena: ArenaPlan | null;
  /** R24 — THE RUN-UP behind the start gate, m: how much dirt `endApron`
   * extrapolates off the first sample, how far the terrain holds its shelf
   * flat past it, and how far back a car is still ON the stage
   * (`pastApron`). `STAGE_RULES.startZone.apron` on every stage that starts
   * one car at a time, and longer only where a MASS START asks for it — a
   * grid is one row per car and the back row has to be inside this
   * (`apronForGrid` in sim/grid.ts). The route never moves for it: what
   * grows is the ground behind the line and the room the branches, the props
   * and the country are kept out of. */
  startApron: number;
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
  /** The season and the cold the stage is driven in (`climate.ts`) — on
   * the track rather than only on the run, because they reach the ROAD:
   * which samples are snow and how deep the country beside them lies
   * under it are compiled from this, and the terrain, the renderer and
   * every rival's game read the same answer off the same track. It never
   * moves a plan: the same seed builds the same road in every season, and
   * only what the road is made of changes. */
  climate: Climate;
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
  /** R17 — the public roads the route never met, BUILT (`publicroad.ts`):
   * the stretch of each `highways` line the country carries, rim to rim,
   * on nobody's junction and with nothing taped across it. What the crowd
   * (R42) drove in on where the rally never crossed a road. Empty on an
   * endless stage, which carries no tarmac at all, and on a synthetic rig. */
  publicRoads: PublicRoad[];
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
  /** R43 — the wind farms: each a string of turbines on the high ground
   * off the stage, the towers solid and their crane pads flattened. */
  windFarms: WindFarm[];
  /** R43 — the solar farms: each a fenced rectangle of panel tables on
   * level ground beside the stage, a clearing the forest keeps off. */
  solarFarms: SolarFarm[];
  /** R45 — THE GRID: the transmission line the country carries, laid rim
   * to rim across the map and passing over the stage wherever it happens
   * to. At most one, and none on a little under half the seeds. Empty on
   * an endless stage, which carries no grid for the tarmac's reason, and
   * on a synthetic rig. */
  powerLines: PowerLine[];
  /** R17 — the junctions themselves: where two roads MEET, and the paved
   * apron that makes them one surface there instead of two ribbons that
   * happen to touch. The terrain flattens it and the renderer paves it. */
  junctions: RoadJunction[];
  /** R41 — where the rally crosses the RAILWAY: the ramp's lip, the line
   * the train runs (its two arms are among `spurs`, flagged `rail`), and
   * the timetable. Its own list, not among the junctions: nothing about a
   * railway crossing is a place two roads share a platform, and every
   * reader of `junctions` asks which road turns. */
  rails: RailCrossing[];
  /** R12 — the culverts: every place the road carries a stream UNDER
   * itself in a pipe. Not a run of samples, because the surface is road
   * the whole way over one; the compiler writes each down so the terrain
   * can anchor the river to it and the renderer can stand the pipe's
   * mouths in the embankment. */
  culverts: Culvert[];
  /** Endless only: materialize road until `length >= upToS`. Deterministic
   * in the seed — when it is called makes no difference to what it builds.
   * Returns true when new samples were appended. */
  extend?: (upToS: number) => boolean;
};

export { SAMPLE_STEP };
