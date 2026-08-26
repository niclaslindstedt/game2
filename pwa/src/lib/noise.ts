// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Deterministic 2D value noise — generic math with no game knowledge.
// Everything spatial that must agree across modules (terrain shaping and
// coloring, grove placement) draws from these, keyed by an integer seed.

/** Deterministic lattice hash in [0, 1). */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hermite fade for interpolation, 0–1 → 0–1. */
export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise over a lattice of `hash2` values, period `scale` m. */
export function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gz = z / scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
