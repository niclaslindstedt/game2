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
// DOM-free and three-free: the environment wraps the bytes in a texture
// (height-fog.ts reads it on the GPU) and `tests/mountain_shadow_test.ts`
// reads them here.

export type ShadowMarch = {
  /** Cells per side, and metres per side. */
  size: number;
  span: number;
  /** The shadow ceiling per cell, encoded 0..255 over `lo`..`hi` (m over
   * the sea): a cell's ground is in shadow where its height is under the
   * ceiling; 255 is a cell in shadow at any height (the sun is down). */
  data: Uint8Array;
  /** The window's south-west corner, world m. */
  originX: number;
  originZ: number;
  /** The height range the bytes span. */
  lo: number;
  hi: number;
  /** Re-centre the window on a point if it has drifted far enough, and
   * re-sample the heights. Returns whether it did. */
  focus: (x: number, z: number) => boolean;
  /** Recompute every cell's ceiling for a sun in this direction (unit,
   * pointing AT the sun). Below the horizon everything is in shadow. */
  march: (sun: { x: number; y: number; z: number }) => void;
  /** The ceiling at a world point, m — the nearest cell's. */
  ceilingAt: (x: number, z: number) => number;
  /** Whether `(x, y, z)` is in the shadow of the country. */
  shadowed: (x: number, y: number, z: number) => boolean;
};

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
  const ceiling = new Float32Array(size * size);
  const data = new Uint8Array(size * size);
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
    ceilingAt: () => 0,
    shadowed: () => false,
  };
  let centred = false;
  let centreX = 0;
  let centreZ = 0;
  let lastSun = { x: 0, y: -1, z: 0 };

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

  const encode = (): void => {
    const range = map.hi - map.lo;
    for (let k = 0; k < size * size; k++) {
      const v = ((ceiling[k] - map.lo) / range) * 255;
      data[k] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
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
    map.march(lastSun);
    return true;
  };

  map.march = (sun) => {
    lastSun = sun;
    if (!centred) return;
    if (sun.y <= 0.002) {
      ceiling.fill(Infinity);
      data.fill(255);
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
        ceiling[j * size + i] = top;
      }
    }
    encode();
  };

  map.ceilingAt = (x, z) => {
    if (!centred) return -Infinity;
    const i = Math.floor((x - map.originX) / cell);
    const j = Math.floor((z - map.originZ) / cell);
    if (i < 0 || j < 0 || i >= size || j >= size) return -Infinity;
    return ceiling[j * size + i];
  };

  map.shadowed = (x, y, z) => y < map.ceilingAt(x, z);

  return map;
}
