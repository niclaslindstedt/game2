// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TACHOMETER — the one instrument on the HUD that is DRAWN rather than
// printed, and the arithmetic that lays its scale out.
//
// It is a module of its own because hud.tsx sits at the §20.5 line cap and
// this is the piece of it with the clearest edge: a needle, a scale and the
// trigonometry that puts one on the other. Nothing here reads the game —
// the dial is handed a fraction of the limiter and draws it.

import type { CSSProperties } from "react";

import { clamp } from "../lib/util.ts";
import { TOTAL_DIGITS, TRIP_DIGITS, odometerDrums } from "./odometer.ts";

/** The dial is laid out like the arcade cluster it comes from: it reads
 * 0–9 (thousands) counter-clockwise from the bottom, red from 7.5 up, and
 * the bottom of the scale is COMPRESSED — idle sits just off the stop and
 * the band you actually drive in owns the top half of the dial, where the
 * eye already is. Angles are degrees clockwise from twelve o'clock. */
const DIAL_START = 175;
/** Degrees from the 0 mark to the 4 mark — the compressed lead-in... */
const DIAL_LEAD = 50;
/** ...then 4 to 9 spread over the rest of the sweep. */
const DIAL_SPAN = 205;
const DIAL_KNEE = 4;
const DIAL_MAX = 9;
/** Where the red band starts, thousands — and the reading at which the whole
 * instrument starts shaking. */
const DIAL_RED = 7.5;

function dialAngle(value: number): number {
  if (value <= DIAL_KNEE) return DIAL_START + (value / DIAL_KNEE) * DIAL_LEAD;
  return DIAL_START + DIAL_LEAD + ((value - DIAL_KNEE) / (DIAL_MAX - DIAL_KNEE)) * DIAL_SPAN;
}

function dialPoint(radius: number, value: number): [number, number] {
  const a = (dialAngle(value) * Math.PI) / 180;
  return [50 + radius * Math.sin(a), 50 - radius * Math.cos(a)];
}

/** THE SCALE'S OWN RING, and it is drawn where it is BECAUSE of the
 * counters. A rev counter with a pair of odometers in it is two instruments
 * sharing one face, and the middle belongs to the one that has figures to
 * read: so the band is a stripe rather than a bar, the ticks are longer and
 * stand outside it, and the numbers sit just inside the ticks instead of
 * halfway to the hub. That is also how a real cluster is laid out — nothing
 * on a car's tacho lives at half radius — and it is what leaves the face
 * clear enough for a seven-drum window to be read at a glance. */
const DIAL_BAND = 42;
const DIAL_TICK_OUT = 40;
const DIAL_TICK_IN = 36.5;
const DIAL_NUMBERS = 32.5;

/** THE COUNTERS' WINDOWS, measured off a real cluster and scaled to the
 * dial's own hundred-unit box. On the gauge they were taken from, a cell is
 * 5.2 units across and the window 8.3 deep, with the figures filling a bit
 * over half that depth — a small, dense plate with a lot of face around it,
 * which is why it reads as an instrument set INTO the dial rather than as a
 * caption on it.
 *
 * WHERE THEY SIT is this dial's own answer rather than that gauge's. There
 * are two of them, the trip and the total, and a pair reads as a pair only
 * if it is symmetrical: both windows are centred on the twelve o'clock line
 * and stand the same distance either side of the hub, in the two halves of
 * the face the scale leaves empty. `OFFSET` is that distance, and it is what
 * puts the far edge of the wider window comfortably inside the ring of
 * figures the scale is read off. */
const ODO_CELL = 5.2;
const ODO_H = 8.3;
const ODO_OFFSET = 16.15;

/** THE DRUMS, TURNING. Each one shows the digit it is on and the digit
 * coming up behind it, on a strip the height of the window, slid up by
 * however far that drum has turned — so a counter mid-step reads exactly as
 * a mechanical one does, with the old number leaving the top of the window
 * as the new one arrives from underneath.
 *
 * Keyed by the digit each drum is ON, which is what makes the roll only
 * ever go one way: the turn itself tweens (the strip slides), and the step
 * that carries the drum over replaces the element instead, so the browser
 * has nothing to tween BACKWARDS when the offset returns to zero.
 *
 * `above` puts the window in the upper half of the face instead of the
 * lower one; `digits` is how wide it is, which is the only thing that
 * separates the total from the trip. */
function Counter({ metres, digits, above }: { metres: number; digits: number; above: boolean }) {
  const drums = odometerDrums(metres, digits);
  const width = ODO_CELL * digits;
  const y = 50 + (above ? -ODO_OFFSET : ODO_OFFSET) - ODO_H / 2;
  return (
    <svg
      className="hud-odo"
      x={50 - width / 2}
      y={y}
      width={width}
      height={ODO_H}
      viewBox={`0 0 ${width} ${ODO_H}`}
    >
      <rect className="hud-odo-window" x="0" y="0" width={width} height={ODO_H} rx="0.6" />
      {drums.map((drum, i) => (
        <g
          key={`${i}:${drum.digit}`}
          className="hud-odo-drum"
          style={{ transform: `translateY(${(-drum.roll * ODO_H).toFixed(3)}px)` }}
        >
          <text className="hud-odo-digit" x={i * ODO_CELL + ODO_CELL / 2} y={ODO_H / 2}>
            {drum.digit}
          </text>
          <text className="hud-odo-digit" x={i * ODO_CELL + ODO_CELL / 2} y={ODO_H * 1.5}>
            {(drum.digit + 1) % 10}
          </text>
        </g>
      ))}
      {drums.slice(1).map((_, i) => (
        <path
          className="hud-odo-seam"
          key={i}
          d={`M ${(i + 1) * ODO_CELL} 0 L ${(i + 1) * ODO_CELL} ${ODO_H}`}
        />
      ))}
    </svg>
  );
}

function dialArc(radius: number, from: number, to: number): string {
  const [x0, y0] = dialPoint(radius, from);
  const [x1, y1] = dialPoint(radius, to);
  const large = dialAngle(to) - dialAngle(from) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

/** `tripM` is what this run has covered, metres — the lower counter, which
 * starts again at zero on every stage. `odoM` is the LIFETIME distance of
 * the car being read: the upper counter, the one number on the instrument
 * that is not about this run, and null for a car whose life is nobody's
 * business (the run-out being watched is somebody else's crew, and their
 * mileage is not the player's). */
export function Tachometer({
  rpm,
  tripM,
  odoM,
}: {
  rpm: number;
  tripM: number;
  odoM: number | null;
}) {
  const value = clamp(rpm, 0, 1) * DIAL_MAX;
  // An engine held up against its limiter shakes the car it is bolted to,
  // and the instrument bolted to that — the buzz IS the reading, which is
  // why it is on the dial and not on the needle alone. It grows across the
  // red band rather than switching on at it, so a gear revving out trembles
  // and a throttle pinned on the start line really buzzes.
  const heat = clamp((value - DIAL_RED) / (DIAL_MAX - DIAL_RED), 0, 1);
  return (
    <svg
      className={`hud-tach ${heat > 0 ? "hud-tach-hot" : ""}`}
      style={heat > 0 ? ({ "--shake": heat.toFixed(2) } as CSSProperties) : undefined}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle className="hud-tach-face" cx="50" cy="50" r="46" />
      <path className="hud-tach-track" d={dialArc(DIAL_BAND, 0, DIAL_MAX)} />
      <path className="hud-tach-red" d={dialArc(DIAL_BAND, DIAL_RED, DIAL_MAX)} />
      {[0, 4, 5, 6, 7, 8, 9].map((tick) => {
        const [tx, ty] = dialPoint(DIAL_NUMBERS, tick);
        const [ax, ay] = dialPoint(DIAL_TICK_OUT, tick);
        const [bx, by] = dialPoint(DIAL_TICK_IN, tick);
        return (
          <g key={tick}>
            <path className="hud-tach-tick" d={`M ${ax} ${ay} L ${bx} ${by}`} />
            <text className="hud-tach-label" x={tx} y={ty}>
              {tick}
            </text>
          </g>
        );
      })}
      {/* THE TWO COUNTERS, on the face of the gauge where a car keeps them.
          Above the hub, the TOTAL: every kilometre this car has ever been
          driven, in any discipline. Below it, the TRIP: this stage, from
          zero. Both are drawn before the needle so the needle sweeps over
          their windows rather than under them, which is the way round a
          real cluster is built. */}
      {odoM !== null && <Counter metres={odoM} digits={TOTAL_DIGITS} above={true} />}
      <Counter metres={tripM} digits={TRIP_DIGITS} above={false} />
      {/* The needle is transformed rather than re-pathed so the browser can
          tween it between HUD snapshots — the dial reads smooth at 12 Hz. */}
      <g className="hud-tach-needle" style={{ transform: `rotate(${dialAngle(value)}deg)` }}>
        <path d="M 50 50 L 50 12" />
        {/* The boss is drawn small because the counter's window starts just
            under it; the needle's own stroke gives it back the size it
            reads at. */}
        <circle cx="50" cy="50" r="2.5" />
      </g>
    </svg>
  );
}
