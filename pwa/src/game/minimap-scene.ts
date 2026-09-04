// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MINIMAP'S SCHEMATIC — the country around the car, drawn from above.
//
// The map does not show the stage. It shows a fixed square of WORLD, `SPAN`
// metres across, with the car in the middle of it, and it travels with the
// car wherever the car goes — down the road, through a field, up a branch
// nobody taped off. That is the whole reason it exists: a seven-kilometre
// stage squeezed into a seven-rem box is a squiggle with a dot on it, and
// the one question a driver actually asks the map — what is coming, and
// which way is the road from here — is the one question that framing
// cannot answer.
//
// What it draws is a CARTOON of the game: the road as a fat ribbon with its
// sealed runs picked out, every other road beside it, the water, the woods
// as a tint, and the buildings as blocks. Nothing here is to scale except
// the ground itself — a nine-metre road at this framing is three pixels
// wide, so every road is drawn several times its width and the widths are
// held apart by KIND rather than by metres. The exaggeration is the map.
//
// SIGN BOUNDARY (the same one-flip rule input.ts states for steering): the
// rendered world mirrors the engine's map view, so the map draws in SCREEN
// space — `mx = -x`, `my = -z` — which puts a heading-growing turn on the
// LEFT of the picture, exactly as the player sees it.
//
// THE ANCHOR is what keeps this affordable. The paths are built around a
// world point that only moves when the car has travelled `REBUILD` metres
// from it, and the whole schematic is then TRANSLATED by the offset between
// that anchor and the car. So the map scrolls smoothly every snapshot while
// the geometry behind it is rebuilt a couple of times a second.

import {
  biomeRules,
  type Building,
  type GameState,
  type SpurSample,
  type TerrainField,
  type Track,
  type TrackSample,
} from "@engine";

/** The map's own square user space; everything below is in these units. */
export const VIEW = 100;

/** How much country the box holds, edge to edge, m — one of two framings,
 * because the map has two jobs and only one of them is on every run.
 *
 * Alone on the road it is drawing the ROAD, and three hundred metres is
 * about ten seconds of it at rally pace: far enough that the next corner is
 * on the map before it is committed to, close enough that the road is a
 * ribbon with two sides rather than a line.
 *
 * Running a heads-up race it is also drawing the FIELD, and a grid of
 * fifteen cars is spread over a few hundred metres of stage — so a window
 * that holds the road ahead holds none of the crews the driver is racing.
 * The wider framing gives up some of the corner's shape to put the car
 * closing on you, and the one you are closing on, inside the frame. */
export const SPAN = {
  solo: 300,
  race: 460,
} as const;

/** ...and how far it OPENS UP with speed. What the map owes the driver is a
 * fixed amount of WARNING, and warning is time rather than distance: at
 * fifty metres a second the same three hundred metres is half the notice it
 * was at twenty-five. So the window is stretched with the speedo — gently,
 * because the picture also has to stay the same picture. `at` is the speed
 * the stretch is full at (km/h) and `lift` is how much wider it is by then. */
const ZOOM = { at: 180, lift: 0.5 };

/** The window this frame: the run's own framing, opened by the speedo. */
export function spanFor(base: number, speedKmh: number): number {
  const t = Math.min(1, Math.max(0, speedKmh / ZOOM.at));
  return base * (1 + ZOOM.lift * t);
}

/** The span the geometry is actually CUT at, m — the shown span rounded up
 * to a step. The cut is the expensive half and the zoom moves every frame,
 * so the two are separated: the paths are cut at a span that changes a few
 * times a stage, and the difference between that and the span being shown
 * is carried as a SCALE on the group.
 *
 * Rounding UP is what makes it safe: the cut always covers at least the box
 * being shown, so the scale only ever magnifies country that was drawn.
 * And because the scale compensates the cut exactly, crossing a step is
 * invisible — the same picture, cut at a different size. */
const CUT_STEP = 40;

/** How far the car may travel from the anchor before the schematic is cut
 * again, m. Under a second of driving, so the geometry never lags the
 * window by more than the margin below. */
const REBUILD = 20;

/** How far past the box the schematic is built, view units. It covers the
 * anchor's slack (`REBUILD` metres of it) plus the half-width of the widest
 * stroke, so nothing pops into existence at the frame's edge. */
const MARGIN = 16;

/** The ground grid's cell, m. It is the resolution of the shoreline and of
 * the wood's edge, and it is coarse on purpose: this is a schematic of
 * where the water and the trees ARE, and a lake with a jagged rim reads as
 * a lake at seven rem across. */
const GROUND_CELL = 8;

/** Grove density under which a cell is drawn as OPEN — the quilt's own
 * scale, where a meadow is 0.06, a clearing 0.14, a logging block 0.22 and
 * the closed stands are 1 and over.
 *
 * The layer marks the OPENINGS rather than the trees, and that way round is
 * the whole of why it is worth drawing. A boreal stage is forest nearly
 * everywhere, so a tint on the woods is a wash over the whole map that says
 * nothing; a tint on the clearings, the bogs and the felled blocks is the
 * short answer to the only question a driver in the country actually has,
 * which is where they could get through. */
const OPEN_DENSITY = 0.35;

/** How many ground cells are remembered. The window holds about 1500 of
 * them, so this is a couple of minutes of driving before the oldest country
 * is dropped and re-sampled — and it is a cap rather than an eviction queue
 * because a map that has to forget something can forget all of it: the next
 * cut pays for one window, which is what it pays anyway on the first frame
 * of every run. */
const GROUND_MEMORY = 24_000;

/** Stride through the stage's samples, in samples. The road is sampled
 * every 2 m and a 6 m step is two view units at this framing — finer than
 * the corner it is drawing can show. */
const ROAD_STRIDE = 3;

/** How much road, in metres of arc either side of the car, is walked
 * looking for something inside the window. Comfortably more than the
 * window's own diagonal so a hairpin that leaves the box and comes back
 * into it is drawn as two legs rather than one. */
const ROAD_ARC = 600;

/** Stride along another road's samples, m. Branches, public roads and
 * drives are laid at their own spacings, so this is a distance rather than
 * a count. */
const LANE_STEP = 8;

/** The smallest a building may be drawn, view units — a shed at true scale
 * is a dot, and a dot is not a landmark. */
const MIN_WALL = 2.4;

/** The schematic for one frame: paths in the `VIEW`-square user space,
 * drawn as one group translated by `offset`. */
export type MinimapScene = {
  /** Where the group stands this frame — the anchor's own position in the
   * window, in view units, relative to where it was cut. */
  offset: { x: number; y: number };
  /** WHICH CUT this is. It changes only when the paths were rebuilt, and
   * the frame it changes on is the one frame the group's transform must not
   * be tweened: the offset and the zoom both jump there, and the new paths
   * jump with them, so the picture is continuous ONLY if the transform
   * lands immediately. Tweened, the country slides half a box sideways
   * twice a second at speed. */
  cut: number;
  /** What the group is scaled by, about the middle of the box: the cut's
   * span over the span being shown, so it is never under 1. Strokes are
   * held off it (`vector-effect`), because a road drawn thinner at speed is
   * a road that reads as further away rather than as more of it. */
  zoom: number;
  /** The openings in the country — clearings, bogs, meadows, felled blocks
   * — as filled cells. */
  open: string;
  /** Standing water, as filled cells. */
  water: string;
  /** The streams: too narrow for the ground grid to catch, so they are
   * stroked off the terrain's own centrelines. */
  streams: string;
  /** Every road that is not the stage: taped-off branches, public roads
   * the rally never met, and the drives down to the houses. */
  lanes: string;
  /** R41 — the railway, which is not a road and must not read as one. */
  rails: string;
  /** The stage itself. */
  road: string;
  /** ...and the runs of it that are sealed, over the top. */
  sealed: string;
  /** Buildings, as footprints. */
  walls: string;
};

type Pt = [number, number];

/** ONE CUT of the schematic: the world point it is drawn around, the scale
 * it is drawn at, and how far past the box it reaches. Threaded through
 * every builder below rather than read off module constants, because the
 * scale belongs to the RUN — a heads-up race is framed wider than a stage
 * driven alone (`SPAN`). */
type Cut = {
  /** The anchor, in world space. */
  x: number;
  z: number;
  /** View units per metre. */
  k: number;
  /** How far from the anchor the schematic is built, m. */
  reach: number;
  /** A world point in this cut's own view space. */
  at: (x: number, z: number) => Pt;
};

function cutAround(x: number, z: number, span: number): Cut {
  const k = VIEW / span;
  const at = (px: number, pz: number): Pt => [VIEW / 2 + (x - px) * k, VIEW / 2 + (z - pz) * k];
  return { x, z, k, reach: span / 2 + MARGIN / k, at };
}

/** WHERE THE CAR IS, in the map's screen space. Everything projected for a
 * given frame is measured from here, so the car sits at the middle of the
 * box however far the schematic behind it has drifted from its anchor. */
export function project(state: GameState, x: number, z: number, span: number): Pt {
  const k = VIEW / span;
  return [VIEW / 2 + (state.car.x - x) * k, VIEW / 2 + (state.car.z - z) * k];
}

/** True where a point is inside the box the marks are drawn in. */
export function inView(p: Pt): boolean {
  return p[0] >= 0 && p[0] <= VIEW && p[1] >= 0 && p[1] <= VIEW;
}

/** The last schematic cut: the world point it was cut around, and enough of
 * the track it was cut from to know when it has stopped describing one.
 *
 * The TRACK ITSELF is the identity, not its seed: a seed is a number two
 * different tracks can share (a synthetic rig and a generated stage), and a
 * cache that answered for the wrong one would draw the other country's
 * roads. Its sample and stream counts are carried beside it because an
 * endless stage grows both under a track that never changes. */
let cache: {
  track: Track;
  span: number;
  cut: Cut;
  scene: MinimapScene;
  samples: number;
  streams: number;
} | null = null;

/** How many cuts have been made, ever — the id the component watches to
 * know which frame it must not tween (`MinimapScene.cut`). */
let cuts = 0;

/** Ground cells already sampled, keyed by their world lattice index — and
 * the track whose country they describe. */
let ground = new Map<number, 0 | 1 | 2>();
let groundOf: Track | null = null;

function built(p: Pt): boolean {
  return p[0] >= -MARGIN && p[0] <= VIEW + MARGIN && p[1] >= -MARGIN && p[1] <= VIEW + MARGIN;
}

function n(v: number): string {
  return v.toFixed(1);
}

/** Stroke a polyline, keeping only the runs that reach the built box. A
 * point is kept when it or a neighbour is inside, so a line that crosses
 * the window is drawn out to the frame rather than stopping at the last
 * point that happened to be visible. */
function stroke(points: readonly Pt[]): string {
  let out = "";
  let open = false;
  for (let i = 0; i < points.length; i++) {
    const keep =
      built(points[i]) ||
      (i > 0 && built(points[i - 1])) ||
      (i + 1 < points.length && built(points[i + 1]));
    if (!keep) {
      open = false;
      continue;
    }
    out += `${open ? "L" : "M"} ${n(points[i][0])} ${n(points[i][1])} `;
    open = true;
  }
  return out;
}

/** A closed polygon, or nothing when it falls outside the built box. */
function fill(points: readonly Pt[]): string {
  if (!points.some(built)) return "";
  let out = "";
  for (let i = 0; i < points.length; i++) {
    out += `${i === 0 ? "M" : "L"} ${n(points[i][0])} ${n(points[i][1])} `;
  }
  return `${out}Z `;
}

/** What the ground under one cell is: closed country, an opening, or water.
 * Cached
 * per world cell, because the window re-cut every twenty metres re-asks for
 * all but one row of the country it asked about last time. */
function groundAt(
  terrain: TerrainField,
  quilt: ReturnType<typeof biomeRules>,
  i: number,
  j: number,
): 0 | 1 | 2 {
  // Hashed rather than a string key: this runs about fifteen hundred times
  // per cut and a template literal per cell is the cut's biggest cost.
  const key = i * 73_856_093 + j * 19_349_663;
  const seen = ground.get(key);
  if (seen !== undefined) return seen;
  const x = (i + 0.5) * GROUND_CELL;
  const z = (j + 0.5) * GROUND_CELL;
  let kind: 0 | 1 | 2 = 0;
  if (terrain.waterAt(x, z) !== null) kind = 2;
  else {
    const density =
      quilt.groves[terrain.groveAt(x, z)].density * quilt.regions[terrain.regionAt(x, z)].forest;
    if (density < OPEN_DENSITY) kind = 1;
  }
  if (ground.size >= GROUND_MEMORY) ground.clear();
  ground.set(key, kind);
  return kind;
}

/** The ground layers: one walk of a WORLD-ALIGNED lattice, emitting each
 * row's runs as rectangles. World-aligned so a cell belongs to a piece of
 * country rather than to the window — without it the whole tint crawls
 * sideways every time the map is re-cut. */
function groundLayers(
  terrain: TerrainField,
  track: Track,
  cut: Cut,
): { open: string; water: string } {
  const quilt = biomeRules(track.knobs.biome);
  const i0 = Math.floor((cut.x - cut.reach) / GROUND_CELL);
  const i1 = Math.ceil((cut.x + cut.reach) / GROUND_CELL);
  const j0 = Math.floor((cut.z - cut.reach) / GROUND_CELL);
  const j1 = Math.ceil((cut.z + cut.reach) / GROUND_CELL);
  let clearings = "";
  let water = "";
  for (let j = j0; j <= j1; j++) {
    // The row's own two view-space edges, computed once: the lattice is
    // axis-aligned in world space and the projection is a flip and a scale,
    // so every cell in a row shares them.
    const [, ya] = cut.at(0, j * GROUND_CELL);
    const [, yb] = cut.at(0, (j + 1) * GROUND_CELL);
    const top = Math.min(ya, yb);
    const bottom = Math.max(ya, yb);
    let run = 0 as 0 | 1 | 2;
    let from = i0;
    const flush = (to: number): void => {
      if (run === 0) return;
      const [xa] = cut.at(from * GROUND_CELL, 0);
      const [xb] = cut.at(to * GROUND_CELL, 0);
      const left = Math.min(xa, xb);
      const right = Math.max(xa, xb);
      const rect = `M ${n(left)} ${n(top)} H ${n(right)} V ${n(bottom)} H ${n(left)} Z `;
      if (run === 1) clearings += rect;
      else water += rect;
    };
    for (let i = i0; i <= i1; i++) {
      const kind = groundAt(terrain, quilt, i, j);
      if (kind === run) continue;
      flush(i);
      run = kind;
      from = i;
    }
    flush(i1 + 1);
  }
  return { open: clearings, water };
}

/** The stage, walked outward from the sample the car is nearest. Two paths
 * come back: the whole road, and the sealed runs of it that are drawn over
 * the top so a driver can see the tarmac coming. */
function stageRoad(track: Track, nearIndex: number, cut: Cut): { road: string; sealed: string } {
  const samples = track.samples;
  const reach = Math.round(ROAD_ARC / track.step);
  const from = Math.max(0, nearIndex - reach);
  const to = Math.min(samples.length - 1, nearIndex + reach);
  const line: Pt[] = [];
  const paved: Pt[][] = [];
  let run: Pt[] | null = null;
  const walk = (s: TrackSample): void => {
    const p = cut.at(s.x, s.z);
    line.push(p);
    if (s.surface === "asphalt") {
      if (run === null) {
        // A sealed run starts at the joint, not at the sample after it, or
        // every stretch of tarmac is drawn a stride short of its own lip.
        run = line.length > 1 ? [line[line.length - 2], p] : [p];
        paved.push(run);
      } else run.push(p);
    } else run = null;
  };
  for (let i = from; i <= to; i += ROAD_STRIDE) walk(samples[i]);
  if ((to - from) % ROAD_STRIDE !== 0) walk(samples[to]);
  return { road: stroke(line), sealed: paved.map(stroke).join("") };
}

/** One road that is not the stage, sampled at `LANE_STEP` and stroked. */
function lane(samples: readonly SpurSample[], cut: Cut): string {
  if (samples.length < 2) return "";
  const stride = Math.max(1, Math.round(LANE_STEP / Math.max(1, samples[1].s - samples[0].s)));
  const line: Pt[] = [];
  for (let i = 0; i < samples.length; i += stride) line.push(cut.at(samples[i].x, samples[i].z));
  const last = samples[samples.length - 1];
  line.push(cut.at(last.x, last.z));
  return stroke(line);
}

/** Cheap rejection for anything that carries a box. */
function boxNear(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  cut: Cut,
): boolean {
  return (
    bounds.maxX >= cut.x - cut.reach &&
    bounds.minX <= cut.x + cut.reach &&
    bounds.maxZ >= cut.z - cut.reach &&
    bounds.minZ <= cut.z + cut.reach
  );
}

/** Every road beside the stage, and the railway kept apart from them. */
function otherRoads(track: Track, cut: Cut): { lanes: string; rails: string } {
  let lanes = "";
  let rails = "";
  for (const spur of track.spurs) {
    if (!boxNear(spur.bounds, cut)) continue;
    const path = lane(spur.samples, cut);
    if (spur.rail === true) rails += path;
    else lanes += path;
  }
  for (const road of track.publicRoads) {
    if (!boxNear(road.bounds, cut)) continue;
    lanes += lane(road.samples, cut);
  }
  for (const home of track.homesteads) {
    if (Math.abs(home.yard.x - cut.x) > cut.reach || Math.abs(home.yard.z - cut.z) > cut.reach) {
      continue;
    }
    lanes += lane(home.drive.samples, cut);
  }
  return { lanes, rails };
}

/** A building's footprint: the plan's own rectangle, stood where it stands
 * and turned the way it faces, never smaller than `MIN_WALL` on a side. */
function footprint(building: Building, cut: Cut): string {
  const half = Math.max(MIN_WALL / cut.k, building.plan.width) / 2;
  const deep = Math.max(MIN_WALL / cut.k, building.plan.depth) / 2;
  const right = { x: Math.cos(building.heading), z: -Math.sin(building.heading) };
  const fwd = { x: Math.sin(building.heading), z: Math.cos(building.heading) };
  const corner = (u: number, v: number): Pt =>
    cut.at(
      building.x + right.x * u * half + fwd.x * v * deep,
      building.z + right.z * u * half + fwd.z * v * deep,
    );
  return fill([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
}

/** Every building standing near the window: the houses and barns off the
 * stage, and a town's whole street. */
function buildings(track: Track, cut: Cut): string {
  let walls = "";
  const near = (x: number, z: number): boolean =>
    Math.abs(x - cut.x) <= cut.reach && Math.abs(z - cut.z) <= cut.reach;
  for (const home of track.homesteads) {
    if (!near(home.yard.x, home.yard.z)) continue;
    walls += footprint(home.house, cut);
    if (home.farm !== null) walls += footprint(home.farm.barn, cut);
  }
  // A town is tested lot by lot rather than as a whole: its platform is a
  // spine down a street, which can be longer than the window is wide, so
  // there is no one point that stands for the place.
  for (const town of track.towns) {
    for (const lot of town.lots) {
      if (!near(lot.building.x, lot.building.z)) continue;
      walls += footprint(lot.building, cut);
    }
  }
  return walls;
}

/** R18 — the watercourses, stroked off the terrain's own sliced pieces. A
 * stream is a few metres wide and the ground grid is eight, so the grid
 * catches one only by luck; this is what puts the river on the map. */
function streams(terrain: TerrainField, cut: Cut): string {
  let out = "";
  for (const piece of terrain.streams) {
    if (!boxNear(piece, cut)) continue;
    out += stroke(piece.points.map((p) => cut.at(p.x, p.z)));
  }
  return out;
}

/** The schematic for this frame — the cached cut, translated to where the
 * car now stands, or a fresh cut when the car has outrun it. */
export function minimapScene(state: GameState, span: number = SPAN.solo): MinimapScene {
  const { track, terrain, car } = state;
  const cutSpan = Math.ceil(span / CUT_STEP) * CUT_STEP;
  const stale =
    cache === null ||
    cache.track !== track ||
    cache.span !== cutSpan ||
    cache.samples !== track.samples.length ||
    cache.streams !== terrain.streams.length ||
    Math.abs(cache.cut.x - car.x) > REBUILD ||
    Math.abs(cache.cut.z - car.z) > REBUILD;
  if (stale) {
    // The ground cells describe one country; keeping them across a change of
    // stage would paint the last one's lakes on this one. The span does not
    // touch them: a cell is a piece of ground, not a piece of the picture.
    if (groundOf !== track) {
      ground = new Map();
      groundOf = track;
    }
    const cut = cutAround(car.x, car.z, cutSpan);
    const layers = groundLayers(terrain, track, cut);
    const roads = otherRoads(track, cut);
    const stage = stageRoad(track, state.nearIndex, cut);
    cache = {
      track,
      span: cutSpan,
      cut,
      samples: track.samples.length,
      streams: terrain.streams.length,
      scene: {
        offset: { x: 0, y: 0 },
        cut: ++cuts,
        zoom: 1,
        open: layers.open,
        water: layers.water,
        streams: streams(terrain, cut),
        lanes: roads.lanes,
        rails: roads.rails,
        road: stage.road,
        sealed: stage.sealed,
        walls: buildings(track, cut),
      },
    };
  }
  const last = cache as NonNullable<typeof cache>;
  // The offset is in the SHOWN scale, not the cut's: it is applied after the
  // zoom, so it has to be the drift the driver sees rather than the drift
  // the paths were built at.
  const k = VIEW / span;
  return {
    ...last.scene,
    offset: { x: (car.x - last.cut.x) * k, y: (car.z - last.cut.z) * k },
    zoom: last.span / span,
  };
}
