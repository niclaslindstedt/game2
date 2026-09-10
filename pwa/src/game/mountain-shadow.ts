// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHADOW THE COUNTRY THROWS — where a low sun does not reach because
// a mountain is in the way.
//
// The stage is lit by one directional light, and a slope facing away from
// it is already dark; what the light cannot do on its own is stop at a
// ridge. At sunset in the Alps that is most of the picture: the valley is
// in the mountain's shadow while the peaks across it are still lit, and
// the cloud sea in the valley is grey under a sky that is orange. This
// module marches the stage's own heightfield toward the sun and writes down,
// for every cell of a grid around the camera, the HEIGHT BELOW WHICH THE
// CELL IS IN SHADOW — the ceiling of the shadow. One number a cell answers
// every question the frame asks: the ground is shadowed where its own height
// is under it, the mist where its top is, a point in the air where it is.
//
// The march reads a grid of heights sampled once per window rather than
// the field itself, because a march is a few hundred thousand reads and the
// field's own `heightAt` is a stack of noise octaves; sampled, the whole
// map is a couple of milliseconds and can be redone every few seconds as
// the sun moves. The grid is a square window around the camera that is
// re-sampled when the camera has walked a quarter of the way across it, so
// an endless stage is covered as it streams.
//
// A FEW SECONDS IS A LONG TIME FOR A SHADOW. The sun climbs ten degrees a
// minute of racing through a spring sunrise, and half a degree of it slides
// a ridge's shadow eight metres down the valley wall — twice the softness
// the shader gives its edge, so a map that simply jumped to the new answer
// jumped, and the whole valley (and the mist filling it) changed brightness
// in one frame every few seconds. So the map holds the shadow at TWO
// moments of the sun, one either side of the one being drawn, and the frame
// reads BETWEEN them: two bytes a cell rather than one, and the terminator
// sweeps down the wall at the pace the sun actually moves.
//
// DOM-free and three-free: the environment wraps the bytes in a texture
// (height-fog.ts reads it on the GPU) and `tests/mountain_shadow_test.ts`
// reads them here.

export type ShadowMarch = {
  /** Cells per side, and metres per side. */
  size: number;
  span: number;
  /** The shadow ceiling per cell at the two moments of the sun the pair
   * brackets, TWO BYTES A CELL — the near half first, the far half second
   * — each encoded 0..255 over `lo`..`hi` (m over the sea): a cell's
   * ground is in shadow where its height is under the ceiling, and 255 is
   * a cell in shadow at any height (the sun is down). What the frame draws
   * is the mix of the two the sun's own clock stands at. */
  data: Uint8Array;
  /** The window's south-west corner, world m. */
  originX: number;
  originZ: number;
  /** The height range the bytes span. */
  lo: number;
  hi: number;
  /** Re-centre the window on a point if it has drifted far enough, and
   * re-sample the heights. Returns whether it did — both halves are
   * marched again for the pair of suns they already stood at. */
  focus: (x: number, z: number) => boolean;
  /** Recompute BOTH halves: the ceiling for a sun in this direction (unit,
   * pointing AT the sun), and the one it will have when the sun reaches
   * `then` — the same sun, and a pair with nothing between them, when
   * `then` is left out. Below the horizon everything is in shadow. */
  march: (sun: Dir, then?: Dir) => void;
  /** …and the step between two of those, at half the work: what was the
   * FAR half becomes the near one, and only the new far half is marched. */
  advance: (then: Dir) => void;
  /** The ceiling at a world point, m — the nearest cell's, on the NEAR
   * half, which is where the shadow stood when the pair was last laid. */
  ceilingAt: (x: number, z: number) => number;
  /** Whether `(x, y, z)` is in the shadow of the country. */
  shadowed: (x: number, y: number, z: number) => boolean;
};

/** A direction to the sun — a unit vector, pointing at it. */
type Dir = { x: number; y: number; z: number };

/** How far the march follows a ray toward the sun, in cells. Past this a
 * mountain would have to be higher than any this generator builds to
 * still shade the cell. */
const REACH = 72;

/** How far the window's centre may drift from the camera before the
 * heights are re-sampled, as a fraction of the span. */
const RECENTRE = 0.25;

export function createShadowMarch(
  heightAt: (x: number, z: number) => number,
  size = 96,
  span = 3600,
): ShadowMarch {
  const cell = span / size;
  const heights = new Float32Array(size * size);
  /** The two halves of the pair, as heights: where the shadow's ceiling
   * stands at the near end of the bracket and at the far end. */
  const near = new Float32Array(size * size);
  const far = new Float32Array(size * size);
  const data = new Uint8Array(size * size * 2);
  const map: ShadowMarch = {
    size,
    span,
    data,
    originX: 0,
    originZ: 0,
    lo: 0,
    hi: 1,
    focus: () => false,
    march: () => {},
    advance: () => {},
    ceilingAt: () => 0,
    shadowed: () => false,
  };
  let centred = false;
  let centreX = 0;
  let centreZ = 0;
  const DOWN = { x: 0, y: -1, z: 0 };
  let atNear: Dir = DOWN;
  let atFar: Dir = DOWN;

  const sample = (): void => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const h = heightAt(map.originX + (i + 0.5) * cell, map.originZ + (j + 0.5) * cell);
        heights[j * size + i] = h;
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    map.lo = lo;
    map.hi = Math.max(hi, lo + 1);
  };

  /** Both halves into the bytes, interleaved — the pair is read with one
   * fetch on the GPU, so the two ceilings of a cell lie side by side. */
  const encode = (): void => {
    const range = map.hi - map.lo;
    for (let k = 0; k < size * size; k++) {
      const a = ((near[k] - map.lo) / range) * 255;
      const b = ((far[k] - map.lo) / range) * 255;
      data[2 * k] = a <= 0 ? 0 : a >= 255 ? 255 : Math.round(a);
      data[2 * k + 1] = b <= 0 ? 0 : b >= 255 ? 255 : Math.round(b);
    }
  };

  /** One half's worth of march: every cell's ceiling for a sun in this
   * direction, into `out`. */
  const walk = (out: Float32Array, sun: Dir): void => {
    if (sun.y <= 0.002) {
      out.fill(Infinity);
      return;
    }
    // Along the ground toward the sun, one cell at a time, the ray
    // climbing at the sun's own slope: the ceiling is the highest point
    // any terrain along it reaches back over this cell.
    const horizontal = Math.max(1e-6, Math.hypot(sun.x, sun.z));
    const dx = (sun.x / horizontal) * cell;
    const dz = (sun.z / horizontal) * cell;
    const climb = (sun.y / horizontal) * cell;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        let top = -Infinity;
        let x = i + 0.5;
        let z = j + 0.5;
        let drop = 0;
        for (let s = 1; s <= REACH; s++) {
          x += dx / cell;
          z += dz / cell;
          drop += climb;
          const ci = x | 0;
          const cj = z | 0;
          if (ci < 0 || cj < 0 || ci >= size || cj >= size) break;
          const h = heights[cj * size + ci] - drop;
          if (h > top) top = h;
        }
        out[j * size + i] = top;
      }
    }
  };

  map.focus = (x, z) => {
    if (
      centred &&
      Math.abs(x - centreX) < span * RECENTRE &&
      Math.abs(z - centreZ) < span * RECENTRE
    ) {
      return false;
    }
    centred = true;
    centreX = x;
    centreZ = z;
    map.originX = x - span / 2;
    map.originZ = z - span / 2;
    sample();
    // The window moved, not the sun: the pair stands where it stood, and
    // both halves are marched again over the new heights so the frame
    // carries on reading between the same two moments.
    map.march(atNear, atFar);
    return true;
  };

  map.march = (sun, then) => {
    // COPIED, not held: the caller's vector is a scratch it moves the sun
    // about in every frame, and a window that re-centres later has to be
    // able to march the pair it was actually standing at.
    atNear = { x: sun.x, y: sun.y, z: sun.z };
    atFar = then ? { x: then.x, y: then.y, z: then.z } : atNear;
    if (!centred) return;
    walk(near, sun);
    if (then) walk(far, then);
    else far.set(near);
    encode();
  };

  map.advance = (then) => {
    atNear = atFar;
    atFar = { x: then.x, y: then.y, z: then.z };
    if (!centred) return;
    near.set(far);
    walk(far, then);
    encode();
  };

  map.ceilingAt = (x, z) => {
    if (!centred) return -Infinity;
    const i = Math.floor((x - map.originX) / cell);
    const j = Math.floor((z - map.originZ) / cell);
    if (i < 0 || j < 0 || i >= size || j >= size) return -Infinity;
    return near[j * size + i];
  };

  map.shadowed = (x, y, z) => y < map.ceilingAt(x, z);

  return map;
}
