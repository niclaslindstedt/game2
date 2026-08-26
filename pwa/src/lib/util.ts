// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Small app-side helpers shared by the renderer and the HUD.

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Format seconds as m:ss.t for the stage timer. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
