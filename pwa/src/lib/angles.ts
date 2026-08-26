// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Angle helpers for the camera — wrap-safe interpolation.

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

const TAU = Math.PI * 2;

export function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return a + d * t;
}
