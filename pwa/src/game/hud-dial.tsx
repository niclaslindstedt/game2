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

function dialArc(radius: number, from: number, to: number): string {
  const [x0, y0] = dialPoint(radius, from);
  const [x1, y1] = dialPoint(radius, to);
  const large = dialAngle(to) - dialAngle(from) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

export function Tachometer({ rpm }: { rpm: number }) {
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
      <path className="hud-tach-track" d={dialArc(41, 0, DIAL_MAX)} />
      <path className="hud-tach-red" d={dialArc(41, DIAL_RED, DIAL_MAX)} />
      {[0, 4, 5, 6, 7, 8, 9].map((tick) => {
        const [tx, ty] = dialPoint(26, tick);
        const [ax, ay] = dialPoint(34, tick);
        const [bx, by] = dialPoint(30, tick);
        return (
          <g key={tick}>
            <path className="hud-tach-tick" d={`M ${ax} ${ay} L ${bx} ${by}`} />
            <text className="hud-tach-label" x={tx} y={ty}>
              {tick}
            </text>
          </g>
        );
      })}
      {/* The needle is transformed rather than re-pathed so the browser can
          tween it between HUD snapshots — the dial reads smooth at 12 Hz. */}
      <g className="hud-tach-needle" style={{ transform: `rotate(${dialAngle(value)}deg)` }}>
        <path d="M 50 50 L 50 12" />
        <circle cx="50" cy="50" r="5" />
      </g>
    </svg>
  );
}
