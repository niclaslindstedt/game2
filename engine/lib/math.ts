// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Small math helpers shared across the engine. The world lives in the x/z
// plane (y is up); a heading of 0 points down +z and grows clockwise when
// seen from above, so `sin(heading), cos(heading)` is the forward vector.

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Signed shortest angular difference `b - a`, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Exponential decay of `v` toward zero with rate `k` (per second). */
export function decay(v: number, k: number, dt: number): number {
  return v * Math.exp(-k * dt);
}

/** Move `v` toward `target` by at most `maxDelta`. */
export function approach(v: number, target: number, maxDelta: number): number {
  const d = target - v;
  if (Math.abs(d) <= maxDelta) return target;
  return v + Math.sign(d) * maxDelta;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Pack a pair of spatial-hash cell indices into one integer key.
 *
 * Every spatial index in the engine — the corridor grid, the branch index,
 * the guard field, the route's point field — is probed tens of thousands of
 * times per stage, most of them from inside a ring scan that touches dozens
 * of cells per query. A `${ix},${iz}` template key allocates a string on
 * every one of those probes and then hashes it; an integer key allocates
 * nothing and compares in one instruction.
 *
 * Injective while |iz| < 4096, which at the engine's cell sizes (24–48 m)
 * is a world tens of kilometres across — orders of magnitude past anything
 * the generator builds. */
export function cellKey(ix: number, iz: number): number {
  return ix * 8192 + iz;
}
