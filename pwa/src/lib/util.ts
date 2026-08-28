// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Small app-side helpers shared by the renderer and the HUD.

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Format seconds the way a race clock reads them: minutes, seconds and
 * HUNDREDTHS, punctuated the way an arcade timer punctuates them —
 * `2'46"85`. Hundredths and not tenths because a hundredth is the unit a
 * lap record is actually won by, and a clock that cannot show the margin
 * is a clock nobody chases. */
export function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped - m * 60);
  const cs = Math.floor((clamped - m * 60 - s) * 100);
  return `${m}'${String(s).padStart(2, "0")}"${String(cs).padStart(2, "0")}`;
}

/** A finishing position, the way a results sheet writes one: 1ST, 2ND, 3RD,
 * 4TH — and 11TH through 13TH, which are the three every naive version of
 * this gets wrong. */
export function ordinal(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}TH`;
  return `${place}${["TH", "ST", "ND", "RD"][place % 10] ?? "TH"}`;
}
