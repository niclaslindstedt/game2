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

/** Month names, so a date reads the same on every machine. `toLocaleString`
 * would hand back whatever the browser's locale says, and a board whose rows
 * are dated in three different formats is a board nobody scans. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** WHEN a stamped thing happened, as short as a table row can carry: `12 SEP`
 * inside the current year, `12 SEP 24` outside it — a year on every row is a
 * column of the same four digits, and a row with no year on it at all is a
 * row that quietly ages into a lie. In the reader's own time zone, because
 * the only date a player wants is the one they were driving on. Empty for a
 * stamp nobody wrote (0, or anything that is not a time). */
export function formatDay(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const day = new Date(at);
  const stamp = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
  if (day.getFullYear() === new Date(now).getFullYear()) return stamp;
  return `${stamp} ${String(day.getFullYear() % 100).padStart(2, "0")}`;
}

/** A finishing position, the way a results sheet writes one: 1ST, 2ND, 3RD,
 * 4TH — and 11TH through 13TH, which are the three every naive version of
 * this gets wrong. */
export function ordinal(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}TH`;
  return `${place}${["TH", "ST", "ND", "RD"][place % 10] ?? "TH"}`;
}

/** How bright a colour-coded plate has to end up, 0–1 of perceived
 * luminance, before dark ink can be read against it. */
const MIN_LUMA = 0.5;

/** A packed 0xRRGGBB colour as CSS, brightened until it clears `MIN_LUMA`.
 *
 * Every surface that dresses something in a CAR'S OWN PAINT runs it through
 * here — the name tag over a rival (name-tag.ts) and their plate on the
 * minimap — so one crew is one colour wherever they are shown. Body colours
 * are chosen to separate from GRAVEL AND GREENS (car-livery.ts), which
 * leaves several of them darker than a plate: raw oil-and-rust behind dark
 * ink is a hole rather than a badge. Anything under the floor is mixed
 * toward white until it clears it, which lifts the shade without moving the
 * hue, so the car is still recognisably the dark blue one. */
export function legible(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  // Rec. 709 luma — the weights the eye actually gives the channels, so a
  // saturated blue is treated as the dark colour it looks like.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luma >= MIN_LUMA) return `rgb(${r},${g},${b})`;
  // How far toward white the mix has to go to land ON the floor: the mix is
  // linear in each channel, so it is linear in the luma too.
  const mix = (MIN_LUMA - luma) / (1 - luma);
  const lift = (c: number): number => Math.round(c + (255 - c) * mix);
  return `rgb(${lift(r)},${lift(g)},${lift(b)})`;
}
