// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R35 — THE WATER, POURED. Where the water on a landscape ENDS UP, worked
// out by letting it run downhill until it cannot.
//
// The old answer was one number: a table at `SEA`, and every hollow in the
// world that happened to dip under it was wet. That is a sea, and it is
// the only body of water such a rule can make. It cannot put a tarn on a
// shoulder four hundred metres up, because a tarn's surface is nowhere
// near the sea's; and it has no opinion at all about the country between
// them, so a road could be — and routinely was — laid straight across the
// middle of a lake on an embankment sixty metres tall, because nothing in
// the pipeline had ever been asked where the water was.
//
// So the water is poured instead, and where it settles is decided by the
// two things that actually decide it on real ground.
//
//   THE SPILL. A hollow cannot hold water above the lowest point on its
//   own rim. Found with the standard priority-flood (Barnes, Lehman &
//   Mulla 2014): walk the country inward from its edge, always from the
//   lowest ground reached so far, and each cell's sill is the highest one
//   the walk had to climb to arrive. One pass, no iteration, and exact —
//   which matters, because a fill that is nearly right leaves a lake with
//   a notch in its rim a river should have drained through.
//
//   THE WATER TABLE. A lake is not a bucket somebody filled: it is the
//   groundwater surfacing. A hollow whose floor is above the table around
//   it holds nothing at all — the rain drains straight through it, which
//   is why deserts have dry basins hundreds of metres deep — and one cut
//   below the table is wet to the table whether it rained this year or
//   not. `geology.ts` already carries that table, because it is the same
//   number that decides where the mires are.
//
// So a body's surface is the LOWER of the two: filled to its rim if the
// groundwater would push it higher, and standing at the groundwater if the
// rim is higher still. Take the spill alone and every enclosed dip in the
// noise brims to its rim — a country forty per cent under water, with
// ninety-metre lakes perched on hillsides. Take the table alone and water
// runs over sills it should have poured through. It needs both.
//
// Two properties are what the rest of the generator gets out of it:
//
//   EVERY BODY HAS ITS OWN LEVEL. A tarn sits at its rim, the sea sits at
//   the table, and a chain of ponds down a valley steps down it. The
//   surface is FLAT over each body, which is the thing you actually see —
//   water that is not flat is the most obviously wrong thing a landscape
//   can contain.
//
//   THE SHORELINE IS THE GROUND'S OWN CONTOUR. The grid decides the LEVEL
//   and nothing else; whether a given point is wet is settled by comparing
//   the analytic ground there against it. So the level is coarse and cheap
//   and the waterline is exact and free — a lake's edge follows every
//   headland the rock makes, at whatever resolution the asker is drawing.
//
// It is computed on world-aligned BLOCKS, each flooded over a domain that
// reaches a good kilometre past its own edges, and cached. That keeps it a
// pure function of the seed, the dials and the block index — the same
// water whichever direction a stage is driven, and an endless stage can
// stream it — while keeping any one flood small enough to be free.

/** The sea: the level the map's own base water table stands at, m. Ground
 * below it is sea or coastal lake, and it is the FLOOR under every body
 * the pour finds — a hollow can fill higher than the sea, never lower. */
export const SEA = -11;

/** The two layers the pour reads, together — the ground it settles on and
 * the groundwater standing in it. One call for both because the geology
 * computes them in one pass, and asking twice doubles the cost of a pour
 * for nothing. */
export type GroundSampler = (x: number, z: number) => { surface: number; table: number };

/** One body of standing water the pour found. */
export type WaterBody = {
  /** Its flat surface, m. */
  level: number;
  /** How much ground it covers, m². */
  area: number;
  /** Its deepest point, m. */
  deepest: number;
  /** True when it runs off the edge of the flooded domain — the sea, or a
   * lake too big for one block to see the whole of. Its level is the
   * table's rather than a rim the walk actually found. */
  open: boolean;
};

export type WaterField = {
  /** The surface of the standing water covering this point, m, or null on
   * dry ground. Exact: the level comes off the grid, the waterline comes
   * off the analytic ground. */
  levelAt: (x: number, z: number) => number | null;
  /** How deep the water is here, m — 0 on dry ground. */
  depthAt: (x: number, z: number) => number;
  /** The surface of the nearest standing water within a stone's throw of
   * this point, m, or null where there is none. What anything keeping a
   * FREEBOARD off the water has to clear: a road on the shore is not in
   * the lake, but it is still the lake's level it must stand above. */
  shoreLevelAt: (x: number, z: number) => number | null;
  /** The body covering this point, or null on dry ground. */
  bodyAt: (x: number, z: number) => WaterBody | null;
  /** The nearest standing water to a point within `within` metres, or null
   * where there is none in reach.
   *
   * This is what pouring the water FIRST buys that nothing else does: a
   * watercourse leaving a hillside has somewhere to be. Groping downhill
   * step by step, a course meanders round the contours of its own noise
   * and runs out of length a couple of hundred metres from a lake it was
   * never actually aimed at; given the lake, it runs to it. */
  nearestAt: (
    x: number,
    z: number,
    within: number,
  ) => { x: number; z: number; level: number } | null;
  /** The sea's own table, m. */
  table: number;
};

/** Grid spacing the pour is worked out on, m. The LEVEL is what this
 * resolves and the level alone — a body's waterline is settled against the
 * analytic ground, so nothing about the shape of a shore rides on it. It
 * only has to be fine enough to find the rim a hollow spills over, and the
 * tightest hollow the geology cuts (`pits.pool`) is a hundred metres
 * across. */
const CELL = 32;
/** How much country one cached flood covers, m — world-aligned, so which
 * block a point falls in never depends on where the stage started. */
const BLOCK = 1536;
/** ...and how far past its own edges that flood reaches. The domain's rim
 * is where water is allowed to leave, so a hollow inside the block only
 * gets an honest spill level if its whole catchment is inside the margin.
 * A kilometre covers every hollow the geology draws — `bedrock.basin` is
 * the broadest at 1600 m of wavelength, and a basin is a shape that fills
 * from its middle, not a wave. */
const MARGIN = 768;
/** Water shallower than this is not a body of water, it is wet ground, m.
 * A pour on noisy country puddles in every dimple; this is the line under
 * which a dimple drains, soaks away, or simply never reads as water. */
const MIN_DEPTH = 0.35;
/** ...and how much ground a body has to cover to be one, m². Below this it
 * is a puddle: too small to see, too small to drive round, and too small
 * to be worth a draw call. */
const MIN_AREA = 4 * CELL * CELL;
/** How far out `shoreLevelAt` looks for water, in cells. One ring: a
 * freeboard is a few metres of clearance at the water's edge, not a
 * setback measured in hundreds. */
const SHORE_REACH = 1;
/** How many flooded blocks are kept. A stage crosses a handful; a menu
 * roaming the map crosses more, and dropping the oldest costs one reflood
 * rather than unbounded memory. */
const CACHE = 24;

/** A binary min-heap over cell indices, keyed by height. Typed arrays and
 * no allocation per push: the flood pushes every cell in the domain
 * exactly once, and at 160×160 that is a hot enough loop to notice. */
class Heap {
  private key: Float64Array;
  private val: Int32Array;
  private n = 0;

  constructor(capacity: number) {
    this.key = new Float64Array(capacity);
    this.val = new Int32Array(capacity);
  }

  push(key: number, val: number): void {
    let i = this.n++;
    this.key[i] = key;
    this.val[i] = val;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.key[parent] <= this.key[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Pops the lowest cell into `out` and returns false when empty. */
  pop(out: { key: number; val: number }): boolean {
    if (this.n === 0) return false;
    out.key = this.key[0];
    out.val = this.val[0];
    this.n--;
    if (this.n > 0) {
      this.key[0] = this.key[this.n];
      this.val[0] = this.val[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let low = i;
        if (l < this.n && this.key[l] < this.key[low]) low = l;
        if (r < this.n && this.key[r] < this.key[low]) low = r;
        if (low === i) break;
        this.swap(i, low);
        i = low;
      }
    }
    return true;
  }

  private swap(a: number, b: number): void {
    const k = this.key[a];
    this.key[a] = this.key[b];
    this.key[b] = k;
    const v = this.val[a];
    this.val[a] = this.val[b];
    this.val[b] = v;
  }
}

/** One block's worth of poured water: the surface standing over each cell,
 * and which body it belongs to. */
type Block = {
  originX: number;
  originZ: number;
  /** Cells across the flooded domain (the block plus both margins). */
  n: number;
  /** Water surface per cell, m — the sea table where a cell is dry, so it
   * is never a hole in the array. */
  level: Float32Array;
  /** Index into `bodies`, or -1 where the cell is dry. */
  body: Int32Array;
  bodies: WaterBody[];
};

/** Pour water over one block's country and let it settle.
 *
 * Four passes, and each is doing one clean thing:
 *
 *   FILL. The priority flood: the sill of every cell, which is the ground
 *   itself out on an open slope and the spill level inside a hollow.
 *   Started from the domain's whole rim, because that rim is where the
 *   world continues and therefore where water is free to leave.
 *
 *   LABEL. Flood-fill the cells that came out under their own sill into
 *   connected BODIES, so each one can be measured whole. A body is what
 *   has a level, an area and a shore; a cell on its own has no way of
 *   knowing whether it is a lake or a wet dimple.
 *
 *   SETTLE. Drop each body to the groundwater under it where the rim
 *   stands higher — a hollow holds what the table gives it, not what its
 *   rim would allow. One level for the whole body, because a water surface
 *   that is not flat is the most obviously wrong thing a landscape can
 *   contain: the table is read as the MEAN across the body rather than
 *   per cell, so the sheet stays level and the basin's own broad setting
 *   is what decides where it sits.
 *
 *   SIFT. Throw away what is left that is not water — too shallow to see,
 *   too small to matter. Country this fine-grained puddles everywhere, and
 *   every one of those puddles would otherwise cost a shoreline. */
function floodBlock(bx: number, bz: number, sampleAt: GroundSampler): Block {
  const originX = bx * BLOCK - MARGIN;
  const originZ = bz * BLOCK - MARGIN;
  const n = Math.ceil((BLOCK + 2 * MARGIN) / CELL);
  const count = n * n;
  const ground = new Float32Array(count);
  const table = new Float32Array(count);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = originX + i * CELL;
      const z = originZ + j * CELL;
      // One evaluation for both layers: the geology computes the ground
      // and the table it holds in the same pass, and asking twice doubles
      // the cost of the whole pour for nothing.
      const sample = sampleAt(x, z);
      ground[j * n + i] = sample.surface;
      table[j * n + i] = sample.table;
    }
  }

  // FILL. `level` doubles as the closed set while the walk runs: NaN is a
  // cell the flood has not reached yet.
  const level = new Float32Array(count).fill(NaN);
  const heap = new Heap(count);
  for (let i = 0; i < n; i++) {
    for (const idx of [i, (n - 1) * n + i, i * n, i * n + (n - 1)]) {
      if (Number.isNaN(level[idx])) {
        // The sea is the floor everywhere, the rim included: a domain edge
        // out in a sea basin leaves at the table, not at its own bed.
        level[idx] = Math.max(ground[idx], SEA);
        heap.push(level[idx], idx);
      }
    }
  }
  const out = { key: 0, val: 0 };
  while (heap.pop(out)) {
    const idx = out.val;
    const here = level[idx];
    const i = idx % n;
    const j = (idx - i) / n;
    for (let d = 0; d < 4; d++) {
      const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
      const nIdx = nj * n + ni;
      if (!Number.isNaN(level[nIdx])) continue;
      // The whole model, in one line: a cell's water surface is its own
      // ground, or the sill the walk had to climb to reach it — whichever
      // is higher. Everything else in this module is bookkeeping.
      level[nIdx] = Math.max(ground[nIdx], here);
      heap.push(level[nIdx], nIdx);
    }
  }

  // LABEL, then SETTLE. The components are gathered against the SILL, so
  // a hollow is found whole before anything decides how much of it is
  // actually wet; then the table it sits in says where its surface really
  // lands, and the body is measured again at that level.
  const body = new Int32Array(count).fill(-1);
  const bodies: WaterBody[] = [];
  const cells: number[][] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < count; seed++) {
    if (body[seed] !== -1 || level[seed] - ground[seed] <= 0) continue;
    const id = bodies.length;
    const sill = level[seed];
    const mine: number[] = [];
    let tableSum = 0;
    let open = false;
    body[seed] = id;
    stack.push(seed);
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      mine.push(idx);
      tableSum += table[idx];
      const i = idx % n;
      const j = (idx - i) / n;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) open = true;
      for (let d = 0; d < 4; d++) {
        const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
        const nIdx = nj * n + ni;
        if (body[nIdx] !== -1) continue;
        // Same body only where the sill agrees: two hollows that touch at
        // a corner of the grid but spill different ways are two lakes at
        // two heights, and joining them would tilt one of them.
        if (Math.abs(level[nIdx] - sill) > 1e-3) continue;
        if (level[nIdx] - ground[nIdx] <= 0) continue;
        body[nIdx] = id;
        stack.push(nIdx);
      }
    }
    // The lower of the rim and the groundwater — and never under the sea,
    // which is the table the whole map floats on.
    const surface = Math.max(SEA, Math.min(sill, tableSum / mine.length));
    let area = 0;
    let deepest = 0;
    for (const idx of mine) {
      const depth = surface - ground[idx];
      if (depth <= 0) continue;
      area++;
      if (depth > deepest) deepest = depth;
    }
    bodies.push({ level: surface, area: area * CELL * CELL, deepest, open });
    cells.push(mine);
  }

  // SIFT. A body that is not water goes back to being ground — and its
  // cells go back to a level of the bare surface, so nothing downstream
  // ever sees a puddle's rim as a shoreline. Cells the settled level left
  // standing above the water go back too, which is what stops a lake's
  // level being reported on the dry shoulder its sill used to cover.
  for (let id = 0; id < bodies.length; id++) {
    for (const idx of cells[id]) {
      if (bodies[id].level - ground[idx] > 0) level[idx] = bodies[id].level;
      else body[idx] = -1;
    }
  }
  const keep = bodies.map(
    (b) => b.area > 0 && (b.open || (b.deepest >= MIN_DEPTH && b.area >= MIN_AREA)),
  );
  const remap = new Int32Array(bodies.length).fill(-1);
  const kept: WaterBody[] = [];
  for (let i = 0; i < bodies.length; i++) {
    if (!keep[i]) continue;
    remap[i] = kept.length;
    kept.push(bodies[i]);
  }
  for (let idx = 0; idx < count; idx++) {
    const id = body[idx];
    if (id === -1) {
      level[idx] = ground[idx];
      continue;
    }
    if (remap[id] === -1) {
      body[idx] = -1;
      level[idx] = ground[idx];
      continue;
    }
    body[idx] = remap[id];
  }

  return { originX, originZ, n, level, body, bodies: kept };
}

/** The standing water on a country.
 *
 * It takes the ground and nothing else, which is the whole of its contract:
 * the seed and the dials reach it only through the landscape they shaped,
 * so the same country always holds the same water however it was arrived
 * at. `surfaceAt` is the BARE ground — the landscape before anybody laid a
 * road across it. That is deliberate and it is the whole point of the
 * module's position in the pipeline: the water is worked out from the
 * country alone, so it is already there, at its own levels, by the time
 * anything asks where to put a road. A water table computed from a
 * landscape that has already been shaped around a road is a table that
 * agrees with the road by construction, which is how a stage ends up with
 * a lake lapping at a sixty-metre causeway nobody would ever have built.
 *
 * `sampleAt` reads the layers together for the pour's own grid, and
 * `surfaceAt` is the ground alone for the waterline — which is asked far
 * more often, and only ever needs the one number. */
export function createWaterField(
  sampleAt: GroundSampler,
  surfaceAt: (x: number, z: number) => number,
): WaterField {
  const blocks = new Map<string, Block>();
  const order: string[] = [];

  // The last block answered, kept aside. Every consumer of this field
  // walks the world — a lattice, a road, a river — so run after run of
  // queries lands in the same block, and this turns the common case into
  // two integer compares instead of building a map key per call.
  let lastBx = 1;
  let lastBz = 1;
  let last: Block | null = null;

  const blockFor = (x: number, z: number): Block => {
    const bx = Math.floor(x / BLOCK);
    const bz = Math.floor(z / BLOCK);
    if (last !== null && bx === lastBx && bz === lastBz) return last;
    const key = `${bx},${bz}`;
    const had = blocks.get(key);
    if (had) {
      lastBx = bx;
      lastBz = bz;
      last = had;
      return had;
    }
    const built = floodBlock(bx, bz, sampleAt);
    blocks.set(key, built);
    order.push(key);
    if (order.length > CACHE) {
      const evicted = order.shift();
      if (evicted !== undefined) blocks.delete(evicted);
    }
    lastBx = bx;
    lastBz = bz;
    last = built;
    return built;
  };

  /** The cell a point falls in — nearest, never interpolated. A body's
   * level is FLAT across it, so interpolating between two cells of the
   * same lake returns the level it already had, and interpolating across
   * its shore returns a level that belongs to neither side: a lake whose
   * surface sags towards the beach. Nearest keeps every body's surface
   * exactly as flat as the pour made it. */
  const cellOf = (block: Block, x: number, z: number): number => {
    const i = Math.min(block.n - 1, Math.max(0, Math.round((x - block.originX) / CELL)));
    const j = Math.min(block.n - 1, Math.max(0, Math.round((z - block.originZ) / CELL)));
    return j * block.n + i;
  };

  const levelAt = (x: number, z: number): number | null => {
    const block = blockFor(x, z);
    const idx = cellOf(block, x, z);
    if (block.body[idx] === -1) return null;
    const level = block.level[idx];
    // The waterline, settled against the ground the world actually draws
    // rather than against the cell the level was worked out on. This is
    // what makes the shore exact at any resolution somebody asks at.
    return surfaceAt(x, z) < level ? level : null;
  };

  const depthAt = (x: number, z: number): number => {
    const level = levelAt(x, z);
    return level === null ? 0 : level - surfaceAt(x, z);
  };

  const shoreLevelAt = (x: number, z: number): number | null => {
    const block = blockFor(x, z);
    const i0 = Math.min(block.n - 1, Math.max(0, Math.round((x - block.originX) / CELL)));
    const j0 = Math.min(block.n - 1, Math.max(0, Math.round((z - block.originZ) / CELL)));
    let best: number | null = null;
    for (let dj = -SHORE_REACH; dj <= SHORE_REACH; dj++) {
      for (let di = -SHORE_REACH; di <= SHORE_REACH; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= block.n || j >= block.n) continue;
        const idx = j * block.n + i;
        if (block.body[idx] === -1) continue;
        // The HIGHEST water near the point: a road on a shelf between a
        // tarn and the sea below it has to stand clear of the tarn.
        const level = block.level[idx];
        if (best === null || level > best) best = level;
      }
    }
    return best;
  };

  /** Rings of cells outward from the point, nearest first, over the block
   * the point sits in. Bounded by `within` and by the block's own domain —
   * water further away than the pour can see is water this has no business
   * claiming to have found. */
  const nearestAt = (
    x: number,
    z: number,
    within: number,
  ): { x: number; z: number; level: number } | null => {
    const block = blockFor(x, z);
    const i0 = Math.round((x - block.originX) / CELL);
    const j0 = Math.round((z - block.originZ) / CELL);
    const reach = Math.min(Math.ceil(within / CELL), block.n);
    for (let ring = 0; ring <= reach; ring++) {
      let best: { x: number; z: number; level: number } | null = null;
      let bestD = Infinity;
      // The ring's perimeter, not its area: every cell at Chebyshev
      // distance `ring`, then the true nearest of those by real distance,
      // so the answer does not depend on which way round the ring is
      // walked.
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= block.n || j >= block.n) continue;
          const idx = j * block.n + i;
          if (block.body[idx] === -1) continue;
          const cx = block.originX + i * CELL;
          const cz = block.originZ + j * CELL;
          const d = Math.hypot(cx - x, cz - z);
          if (d < bestD && d <= within) {
            bestD = d;
            best = { x: cx, z: cz, level: block.level[idx] };
          }
        }
      }
      if (best) return best;
    }
    return null;
  };

  return {
    levelAt,
    depthAt,
    shoreLevelAt,
    nearestAt,
    bodyAt: (x, z) => {
      const block = blockFor(x, z);
      const idx = cellOf(block, x, z);
      const id = block.body[idx];
      if (id === -1) return null;
      return surfaceAt(x, z) < block.level[idx] ? block.bodies[id] : null;
    },
    table: SEA,
  };
}

/** How far the pour reaches past a block, m — what a caller has to keep
 * inside for the levels it reads to be the ones the whole catchment
 * implies. Exported so the analysis can say where it is entitled to
 * judge. */
export const WATER_MARGIN = MARGIN;
