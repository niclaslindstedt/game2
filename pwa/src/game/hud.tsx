// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD: chunky arcade chrome over the canvas. Reads a low-rate snapshot
// (the app refreshes it ~12×/s — the canvas is the 60 fps surface, the HUD
// is not), and owns the touch controls, which write straight into the
// input manager between snapshots.

import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { GamePhase, TurnSeverity } from "@engine";

import { deviceControls, type InputManager } from "./input.ts";
import { createThumbGuard } from "./thumb-guard.ts";
import { FinishCard, type FinishScores, type NextStage } from "./hud-finish.tsx";
import { Minimap, type HudMinimap } from "./minimap.tsx";
import type { HudSettings, PedalDir, TouchSettings } from "./settings.ts";
import { clamp } from "../lib/util.ts";
import { RaceClock, StartLights } from "./hud-clock.tsx";
import type { LiveRun } from "./snapshot.ts";

/** One co-driver call, already flipped into SCREEN space by the snapshot
 * (left means the road bends left through the windshield). */
export type HudPacenote = {
  dir: "left" | "right";
  severity: TurnSeverity;
  /** True when the turn holds long enough to earn the LONG modifier. */
  long: boolean;
  /** Meters from the car to the turn entry (0 while inside the turn). */
  distance: number;
};

export type HudSnapshot = {
  phase: GamePhase;
  /** Total race time, seconds — the clock that never resets. */
  time: number;
  /** R22 — which lap the run is on and how many it is raced over, the time
   * the current one has taken so far, and the ones already in the book. A
   * sprint sits at 1 of 1, and the lap clock is the total clock. */
  lap: number;
  laps: number;
  lapTime: number;
  lapTimes: number[];
  /** The time to beat on this stage — the player's own record, or null on
   * a stage nobody has set one on (and on Roam, which keeps no book). */
  bestTime: number | null;
  speedKmh: number;
  gear: number;
  /** True while the brake is backing the car out — the gear reads R. */
  reversing: boolean;
  gearbox: "auto" | "manual";
  /** Tachometer reading, 0..1 of the redline. */
  rpm: number;
  /** True while a higher gear is available and the revs are in the red. */
  shiftUp: boolean;
  airborne: boolean;
  /** The route, the car on it, and how far through the stage the run is —
   * the top bar has no progress pill; the minimap's frame is the gauge. */
  minimap: HudMinimap;
  /** The co-driver's next calls (current turn first), screen-space. */
  pacenotes: HudPacenote[];
  seed: number;
  carName: string;
  /** Two wheels past the verge — what the reset button offers itself for. */
  offRoad: boolean;
  /** True while the car is LOST — off the road, well away from it and
   * pointed away rather than merely beside it. The co-driver's way-home
   * strip waits for this rather than for `offRoad`: a sign that fires every
   * time a wheel clips the verge is one the player stops reading. The
   * BUTTON does not wait for it — a driver who wants out of the ditch they
   * are two metres into should not have to be lost first. */
  lost: boolean;
  /** Ground distance back to the point the reset would put the car, m —
   * only meaningful while `lost`. */
  homeDistance: number;
  finishTime: number | null;
  /** Set on the finish overlay when the run beat the stored record. */
  record: boolean;
  /** Booster tank readout, seconds left / full tank. */
  boostLeft: number;
  boostMax: number;
  boosting: boolean;
  /** Wind readout: strength plus the arrow's screen-space rotation
   * (degrees; 0 = blowing up-screen with the car). */
  windKmh: number;
  windScreenAngle: number;
  damage: HudDamage;
  /** Metres of road the run is ahead of (positive) or behind (negative)
   * the ghost it is racing, or null when there is no ghost out there. */
  ghostGap: number | null;
};

/** The damage readout, already flipped into SCREEN space by the snapshot
 * (like everything else in the app layer): zone 0 is the nose, indices grow
 * toward the side the player SEES on the right, and `mirrorR` is the mirror
 * on the right of their car on screen. All values 0 (sound) .. 1 (spent). */
export type HudDamage = {
  /** Ring crush per zone as a fraction of the max fold. */
  zones: number[];
  /** Underside crush fraction (slammed landings). */
  belly: number;
  /** Structural wear — 1 is the wreck. */
  wear: number;
  /** The internal systems' damage meters. */
  systems: { engine: number; suspension: number; gearbox: number; steering: number };
  broken: {
    bumperF: boolean;
    bumperR: boolean;
    mirrorL: boolean;
    mirrorR: boolean;
    spoiler: boolean;
    hood: boolean;
    hatch: boolean;
  };
};

export type HudFlash = { id: number; text: string; tone: "good" | "bad" | "info" };

type HudProps = {
  snap: HudSnapshot;
  flashes: HudFlash[];
  input: InputManager;
  /** Which instruments the player has left switched on. */
  show: HudSettings;
  /** Which thumb steers, and what each drag off the pedal anchor does. */
  touchLayout: TouchSettings;
  /** The clock and the start lights read this every frame instead of
   * waiting for the next snapshot. */
  live: LiveRun;
  onPause: () => void;
  onCamera: () => void;
  /** The stage after this one, once this one is over — null on a run with
   * nowhere to go on to (Roam, and the end of the ladder). */
  nextStage: NextStage | null;
  /** Leave the run for the main menu — the results card's own way out. */
  onRetire: () => void;
  /** The time trial's board, and the initials it is still waiting on. Null
   * on every other kind of run. */
  scores: FinishScores | null;
};

/** Capture the pointer so a drag that leaves the zone keeps steering; a
 * pointer that cannot be captured (synthetic, already released) is fine —
 * the zone still tracks it by id. */
function capturePointer(e: { currentTarget: EventTarget | null; pointerId: number }): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* see above */
  }
}

/** Ask the DOM whether a finger is still on the glass. Capture is the only
 * one who knows: the browser drops it the moment a touch ends, whether or
 * not it ever told us the touch ended. This is what a zone's guard checks
 * before refusing a new claim, and what its watchdog ticks on. */
function stillDown(zone: EventTarget | null): (pointerId: number) => boolean {
  const el = zone as HTMLElement | null;
  return (pointerId) => el?.hasPointerCapture(pointerId) ?? false;
}

/** Thumb travel (px) from the anchor for full steering lock — the wheel's
 * whole throw. Long enough that holding a line is a push, not a switch. */
const WHEEL_REACH_PX = 70;
/** The throw is shaped `travel ** this`, so the first centimetre of thumb
 * buys less lock than the last. A slight steer is then a target a thumb can
 * actually hit instead of the twitch either side of centre — but only just
 * past linear: the car's own response carries the rest, and a stronger curve
 * here only makes the top of the throw feel like a cliff of its own. */
const WHEEL_THROW_CURVE = 1.15;
/** The rim has weight: it never teleports to the thumb, it turns toward it.
 * This is the floor rate in lock/second — what a fingertip nudge earns... */
const WHEEL_TURN_FLOOR = 1.8;
/** ...and this is what each unit of gap between thumb and rim adds on top,
 * so a committed shove reaches full lock in about a sixth of a second while
 * a wobble that is corrected before the rim catches up barely steers at all.
 * The engine's own rack (TUNING.steering.rackRate) lags again behind this,
 * and the two delays STACK: what the thumb feels is the sum, so neither can
 * be tuned for weight on its own. */
const WHEEL_TURN_GAIN = 12;
/** Rim rotation at full lock, degrees — also the fill arc's full sweep. */
const WHEEL_LOCK_DEG = 120;
/** Drag (px) from the anchor before a pedal gesture beats plain gas. */
const PEDAL_DEAD_PX = 28;

/** The directions a hint arrow can be drawn in, and what each bound action
 * is called on it — "DRIFT" rather than "HANDBRAKE", because that is what
 * the player is reaching for it to do. */
const PEDAL_HINT_DIRS: PedalDir[] = ["up", "down", "left", "right"];
const PEDAL_HINT_WORD: Record<Exclude<PedalMode, "gas">, string> = {
  brake: "BRAKE",
  boost: "BOOST",
  handbrake: "DRIFT",
};

/** The left thumb: touching anywhere anchors a steering wheel under the
 * finger; dragging sideways turns it and releasing recenters. The rim does
 * not snap to the thumb — it chases it at a rate set by the gap between the
 * two, which is what makes a small drag a small steer and a hard one
 * unambiguous. A blue arc fills the rim from 12 o'clock to the marker, so
 * the lock actually commanded is readable at a glance mid-drift.
 * Screen-space: right = +1 (input.ts flips the sign for the engine once).
 * Written straight into the input manager and the wheel's DOM from the
 * pointer events and one rAF loop; the 12 Hz HUD re-render never touches
 * these styles. */
function SteerZone({ touch, side }: { touch: InputManager["touch"]; side: "left" | "right" }) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<SVGCircleElement>(null);
  const originRef = useRef(0);
  /** Where the thumb is asking the rim to be, and where the rim has got to. */
  const targetRef = useRef(0);
  const steerRef = useRef(0);
  const frameRef = useRef(0);
  const lastRef = useRef(0);

  const setSteer = (value: number): void => {
    steerRef.current = value;
    touch.steer = value;
    const deg = value * WHEEL_LOCK_DEG;
    wheelRef.current?.style.setProperty("--turn", `${deg.toFixed(1)}deg`);
    const fill = fillRef.current;
    if (fill) {
      // pathLength=360 makes the dash units degrees. SVG's zero is 3
      // o'clock and sweeps clockwise, so a right turn starts a -90° arc at
      // 12; a left turn starts where the marker now is and sweeps back up
      // to 12, which paints the same wedge on the other side.
      fill.setAttribute("transform", `rotate(${(deg < 0 ? -90 + deg : -90).toFixed(1)} 50 50)`);
      fill.setAttribute("stroke-dasharray", `${Math.abs(deg).toFixed(1)} 360`);
    }
  };

  /** Turn the rim toward the thumb. Runs only while a finger is down — the
   * thumb can hold still, so pointer events alone would stall the chase. */
  const spin = (now: number): void => {
    frameRef.current = requestAnimationFrame(spin);
    const dt = Math.min(0.05, (now - lastRef.current) / 1000);
    lastRef.current = now;
    const gap = targetRef.current - steerRef.current;
    const step = (WHEEL_TURN_FLOOR + WHEEL_TURN_GAIN * Math.abs(gap)) * dt;
    setSteer(Math.abs(gap) <= step ? targetRef.current : steerRef.current + Math.sign(gap) * step);
  };
  const stopSpin = (): void => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  /** Centre the wheel and put it away. Everything it touches is a ref, so
   * the guard can call it from a window event or an unmount just as safely
   * as the pointerup does. */
  const letGo = (): void => {
    stopSpin();
    targetRef.current = 0;
    setSteer(0);
    if (wheelRef.current) wheelRef.current.style.display = "none";
  };
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const guard = useMemo(() => createThumbGuard(() => letGoRef.current(), window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className={`hud-zone hud-zone-${side}`}
      onPointerDown={(e) => {
        // The first finger owns the wheel; a second touch on this half is
        // ignored rather than re-anchoring the steering under the first —
        // unless the first is a finger the browser never told us about,
        // which is what the guard refuses to keep believing in.
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        originRef.current = e.clientX;
        const wheel = wheelRef.current;
        if (wheel) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          wheel.style.left = `${e.clientX - box.left}px`;
          wheel.style.top = `${e.clientY - box.top}px`;
          wheel.style.display = "block";
        }
        targetRef.current = 0;
        setSteer(0);
        lastRef.current = performance.now();
        if (!frameRef.current) frameRef.current = requestAnimationFrame(spin);
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        const travel = clamp((e.clientX - originRef.current) / WHEEL_REACH_PX, -1, 1);
        targetRef.current = Math.sign(travel) * Math.abs(travel) ** WHEEL_THROW_CURVE;
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      // Capture taken away mid-drag: whatever the browser does with the rest
      // of that touch, this zone is no longer hearing about it.
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={wheelRef} className="hud-wheel" aria-hidden="true">
        {/* The rim is a circle: rotating it would show nothing, so it stays
            in the still layer and carries the fill arc, which measures from
            a fixed 12 o'clock. Only the spokes and the marker turn. */}
        <svg className="hud-wheel-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="11" />
          <circle
            ref={fillRef}
            className="hud-wheel-fill"
            cx="50"
            cy="50"
            r="43"
            fill="none"
            strokeWidth="11"
            pathLength={360}
            strokeDasharray="0 360"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <svg className="hud-wheel-svg hud-wheel-spokes" viewBox="0 0 100 100">
          {/* Three spokes in a T: the bar across 9–3 and the stem down to
              6, the way a flat-bottom sport wheel is built. It leaves the
              top of the rim clear, which is where the fill arc starts. */}
          <path
            d="M11 50 L89 50 M50 50 L50 89"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="10" fill="currentColor" />
          <rect x="46" y="1" width="8" height="12" rx="2" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

type PedalMode = "gas" | "brake" | "boost" | "handbrake";

/** The pedal thumb: touching anywhere is GAS; dragging off the anchor does
 * whatever the player has bound to that direction (gas stays on through
 * boost and handbrake — that is what makes the handbrake a drift tool).
 * Sliding back inside the deadzone returns to plain gas; releasing lets
 * everything go. Three anchored hint arrows light the active gesture. */
function PedalZone({
  touch,
  layout,
  side,
}: {
  touch: InputManager["touch"];
  layout: TouchSettings;
  side: "left" | "right";
}) {
  /** The player's direction map, inverted: which action each drag means.
   * Plain gas is never in here — it is what a drag that lands on the one
   * unbound direction falls back to. */
  const byDir: Partial<Record<PedalDir, Exclude<PedalMode, "gas">>> = {
    [layout.brake]: "brake",
    [layout.handbrake]: "handbrake",
    [layout.boost]: "boost",
  };
  const hintRef = useRef<HTMLDivElement>(null);
  const originRef = useRef({ x: 0, y: 0 });

  const setMode = (mode: PedalMode | null): void => {
    touch.throttle = mode !== null && mode !== "brake";
    touch.brake = mode === "brake";
    touch.boost = mode === "boost";
    touch.handbrake = mode === "handbrake";
    const hint = hintRef.current;
    if (hint) hint.dataset.mode = mode ?? "";
  };
  /** Lift every pedal. Like the wheel's, this has to be safe to run when
   * nothing is held: a lost pointerup here is throttle nobody asked for. */
  const letGo = (): void => {
    setMode(null);
    if (hintRef.current) hintRef.current.style.display = "none";
  };
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const guard = useMemo(() => createThumbGuard(() => letGoRef.current(), window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className={`hud-zone hud-zone-${side}`}
      onPointerDown={(e) => {
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        originRef.current = { x: e.clientX, y: e.clientY };
        const hint = hintRef.current;
        if (hint) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          hint.style.left = `${e.clientX - box.left}px`;
          hint.style.top = `${e.clientY - box.top}px`;
          hint.style.display = "block";
        }
        setMode("gas");
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        const dx = e.clientX - originRef.current.x;
        const dy = e.clientY - originRef.current.y;
        // Dominant axis picks the direction; the one direction nothing is
        // bound to stays gas, so a sloppy thumb never brakes by accident.
        let mode: PedalMode = "gas";
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= PEDAL_DEAD_PX) {
          const dir: PedalDir =
            Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "up" : "down") : dx > 0 ? "right" : "left";
          mode = byDir[dir] ?? "gas";
        }
        setMode(mode);
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={hintRef} className="hud-pedal-hint" aria-hidden="true">
        {PEDAL_HINT_DIRS.map((dir) => {
          const mode = byDir[dir];
          if (!mode) return null;
          return (
            <span key={dir} className={`hud-hint hud-hint-${dir}`}>
              <i className={`hud-hint-arrow hud-hint-arrow-${dir}`} />
              {PEDAL_HINT_WORD[mode]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The tach dial, laid out like the arcade cluster it comes from: it reads
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

function Tachometer({ rpm }: { rpm: number }) {
  const value = clamp(rpm, 0, 1) * DIAL_MAX;
  return (
    <svg className="hud-tach" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="hud-tach-face" cx="50" cy="50" r="46" />
      <path className="hud-tach-track" d={dialArc(41, 0, DIAL_MAX)} />
      <path className="hud-tach-red" d={dialArc(41, 7.5, DIAL_MAX)} />
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

/** The pacenote arrows, drawn like rally corner signs: the shaft is the
 * road, the bend is the corner. Points bend RIGHT here; a left call mirrors
 * the whole icon. The head is computed from the last two points so every
 * severity's arrow stays consistent. */
const PACE_ARROWS: Record<TurnSeverity, [number, number][]> = {
  soft: [
    [42, 92],
    [42, 55],
    [47, 38],
    [58, 26],
    [68, 19],
  ],
  medium: [
    [40, 92],
    [40, 58],
    [44, 44],
    [54, 37],
    [70, 34],
    [80, 34],
  ],
  hard: [
    [38, 92],
    [38, 52],
    [42, 32],
    [56, 24],
    [68, 28],
    [74, 42],
    [74, 58],
  ],
};

function PacenoteArrow({ severity, dir }: { severity: TurnSeverity; dir: "left" | "right" }) {
  const pts = PACE_ARROWS[severity];
  const d = `M ${pts.map((p) => p.join(" ")).join(" L ")}`;
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = [
    [x2 + ux * 15, y2 + uy * 15],
    [x2 - uy * 10, y2 + ux * 10],
    [x2 + uy * 10, y2 - ux * 10],
  ];
  return (
    <svg
      className="hud-pace-arrow"
      viewBox="0 0 100 100"
      style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={head.map((p) => p.join(",")).join(" ")} fill="currentColor" />
    </svg>
  );
}

const SEVERITY_WORD: Record<TurnSeverity, string> = {
  soft: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
};

function pacenoteText(note: HudPacenote): string {
  return `${note.long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${note.dir.toUpperCase()}`;
}

/** The way home, in the co-driver's own slot. Off the road there is no next
 * corner to call — the road itself is the thing that has to be found again —
 * so the strip stops reading the stage and starts reading the way back. The
 * metres are the distance to the exact point the arrow over the car points
 * at, and that the TRACK button hands you directly. */
function WayHomeCall({ distance }: { distance: number }) {
  return (
    <div className="hud-pace">
      <div className="hud-pace-call hud-pace-home">
        {/* A warning triangle, drawn in the co-driver strip's own hand —
            chunky rounded strokes, one color — so it reads as the same
            instrument as the corner calls it stands in for. */}
        <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M 50 17 L 89 83 L 11 83 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="11"
            strokeLinejoin="round"
          />
          <path d="M 50 41 L 50 60" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <circle cx="50" cy="72" r="6" fill="currentColor" />
        </svg>
        <span className="hud-pace-text">
          RETURN TO TRACK
          <span className="hud-pace-dist">{Math.round(distance)}m</span>
        </span>
      </div>
    </div>
  );
}

/** The co-driver strip: the current call big, the following call small —
 * "HARD LEFT … into easy right", the way a crew reads a stage.
 *
 * With the words switched off it is the ARROWS alone. The arrow already
 * carries severity in its shape and direction in its mirroring, so nothing
 * about the call is lost — what goes is the READING, which at rally pace is
 * the expensive part. The distance stays: it is a number glanced at, not a
 * phrase parsed, and there is no glyph that says "in 200 m". */
function Pacenotes({ notes, words }: { notes: HudPacenote[]; words: boolean }) {
  const now = notes[0];
  const next = notes[1];
  return (
    <div className={`hud-pace ${words ? "" : "hud-pace-glyphs"}`}>
      <div className={`hud-pace-call hud-pace-${now.severity}`}>
        <PacenoteArrow severity={now.severity} dir={now.dir} />
        <span className="hud-pace-text">
          {words && pacenoteText(now)}
          {now.distance >= 45 && (
            <span className="hud-pace-dist">{Math.round(now.distance / 10) * 10}m</span>
          )}
        </span>
      </div>
      {next && (
        <div className={`hud-pace-call hud-pace-next hud-pace-${next.severity}`}>
          <PacenoteArrow severity={next.severity} dir={next.dir} />
          {words && <span className="hud-pace-text">{pacenoteText(next)}</span>}
        </div>
      )}
    </div>
  );
}

/** The eight zone indicators around the 2D car, in the panel's 60×100 user
 * space: strokes hugging the outline, index 0 the nose, clockwise. */
const DAMAGE_ZONE_PATHS = [
  "M 22 3 Q 30 0.5 38 3", // nose
  "M 41 4 Q 46 7 46.5 14", // front-right corner
  "M 47 21 L 47 59", // right flank
  "M 46.5 66 Q 46 89 41 94", // rear-right corner
  "M 37 96.5 Q 30 99 23 96.5", // tail
  "M 19 94 Q 14 89 13.5 66", // rear-left corner
  "M 13 59 L 13 21", // left flank
  "M 13.5 14 Q 14 7 19 4", // front-left corner
];

/** The color a part wears while it is SOUND. Deliberately COOL: the ramp
 * below runs yellow to red, and a warm "neutral" — cream, bone, off-white —
 * sits close enough to the low end of that ramp, over this instrument's navy
 * plate, to read as a car that is already hurt. Steel blue cannot be
 * mistaken for any value on the ramp. */
function soundTint(alpha: number): string {
  return `rgba(150, 178, 214, ${alpha})`;
}

/** Crush color ramp: quiet steel while sound, then yellow folding to red. */
function crushColor(v: number): string {
  if (v <= 0.02) return soundTint(0.3);
  return `hsl(${Math.round(50 - 45 * Math.min(1, v))} 95% 55%)`;
}

/** System color ramp: a part that is SOUND reads as quiet steel, and only a
 * hurt one takes color — yellow folding to red as it gives out. Painting
 * every healthy part bright green makes five lights that shout nothing; this
 * instrument stays silent until it has news, so a glance mid-corner finds the
 * one part that is wrong instead of scanning a row of bars. */
function systemColor(damage: number): string {
  if (damage <= 0.04) return soundTint(0.62);
  return `hsl(${Math.round(52 - 48 * Math.min(1, damage))} 92% 55%)`;
}

/** The damage instrument: ONE glyph, no bars. A top-view car wears the crush
 * on its outline where the hits landed, the breakables cross out red as they
 * tear off, and the four internal systems are the parts themselves — the
 * engine block under the bonnet, the rack across the front axle, the gearbox
 * down the tunnel, the suspension at the four wheels — each taking color as
 * it fails. The shell's own outline is the chassis, the bar the wreck is
 * called on. Drawn in the tach's materials so the cluster reads as one
 * instrument panel; sits above the tach, where the eye already is. */
function DamagePanel({ damage }: { damage: HudDamage }) {
  const broken = damage.broken;
  const part = (isBroken: boolean): string =>
    `hud-dmg-part ${isBroken ? "hud-dmg-part-broken" : ""}`;
  const sys = damage.systems;
  return (
    <div
      className="hud-damage"
      title="Damage — engine, steering, gearbox, suspension, chassis"
      aria-hidden="true"
    >
      <svg className="hud-dmg-car" viewBox="0 0 60 100">
        {/* The instrument face — same plate the tach dial sits on. */}
        <rect className="hud-dmg-face" x="1.5" y="1" width="57" height="98" rx="10" />
        {/* The shell: its outline is the chassis gauge, and the crush strokes
            below bloom over it where the car actually took the hit. */}
        <path
          className="hud-dmg-body"
          d="M 19 9 Q 19 4.5 30 4.5 Q 41 4.5 41 9 L 42 84 Q 42 95 30 95 Q 18 95 18 84 Z"
          style={{ stroke: systemColor(damage.wear) }}
        />
        <rect
          className="hud-dmg-belly"
          x="20"
          y="24"
          width="20"
          height="56"
          rx="8"
          style={{
            fill: crushColor(damage.belly),
            opacity: Math.min(0.8, damage.belly * 1.6).toFixed(2),
          }}
        />
        {/* ENGINE: the block filling the bonnet. */}
        <rect
          className="hud-dmg-sys"
          x="21.5"
          y="10"
          width="17"
          height="11"
          rx="2.5"
          style={{ fill: systemColor(sys.engine) }}
        />
        {/* STEERING: the rack across the front axle, drawn under the wheels
            it turns, so the two read as one assembly. */}
        <rect
          className="hud-dmg-sys"
          x="15"
          y="25"
          width="30"
          height="3.4"
          rx="1.7"
          style={{ fill: systemColor(sys.steering) }}
        />
        {/* GEARBOX: the tunnel running back from the cabin. */}
        <rect
          className="hud-dmg-sys"
          x="26.5"
          y="58"
          width="7"
          height="26"
          rx="3"
          style={{ fill: systemColor(sys.gearbox) }}
        />
        <rect className="hud-dmg-cabin" x="22.5" y="32" width="15" height="24" rx="4" />
        {/* SUSPENSION: the four corners it holds up. The front pair straddles
            the rack above — an axle, not two loose blocks. */}
        {[
          [15.5, 22.5],
          [39.5, 22.5],
          [15.5, 68],
          [39.5, 68],
        ].map(([x, y]) => (
          <rect
            key={`${x},${y}`}
            className="hud-dmg-sys"
            x={x}
            y={y}
            width="5"
            height="12"
            rx="1.8"
            style={{ fill: systemColor(sys.suspension) }}
          />
        ))}
        {/* The ring: crush painted where it happened. */}
        {DAMAGE_ZONE_PATHS.map((d, i) => (
          <path
            key={d}
            className="hud-dmg-zone"
            d={d}
            style={{ stroke: crushColor(damage.zones[i]) }}
          />
        ))}
        {/* The breakables: solid while bolted on, crossed out when gone.
            The two lids are outlines over the bay they cover, so a missing
            bonnet reads as an open engine bay rather than a missing bar. */}
        <rect
          className={part(broken.hood)}
          x="22"
          y="10.5"
          width="16"
          height="10"
          rx="2"
          fill="none"
        />
        <rect
          className={part(broken.hatch)}
          x="22"
          y="79"
          width="16"
          height="8"
          rx="2"
          fill="none"
        />
        <rect className={part(broken.bumperF)} x="21" y="6" width="18" height="3.2" rx="1.5" />
        <rect className={part(broken.bumperR)} x="21" y="89.5" width="18" height="3.2" rx="1.5" />
        <rect className={part(broken.mirrorL)} x="9" y="29" width="4.5" height="7" rx="1.4" />
        <rect className={part(broken.mirrorR)} x="46.5" y="29" width="4.5" height="7" rx="1.4" />
        <rect className={part(broken.spoiler)} x="17" y="84.5" width="26" height="3.2" rx="1.5" />
      </svg>
    </div>
  );
}

/** The camera button's glyph: a movie camera — body, lens cone, and the two
 * film reels on top. Drawn rather than lettered because the top bar is the
 * one strip that has to stay out of the way of the road. */
function CameraGlyph() {
  return (
    <svg className="hud-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="5" r="3.1" />
      <circle cx="15" cy="5" r="3.1" />
      <rect x="2" y="9" width="14" height="10.5" rx="2" />
      <path d="M 16.6 12.6 L 22 9.6 L 22 18.9 L 16.6 15.9 Z" />
    </svg>
  );
}

function TouchButton({
  label,
  className,
  onPress,
  onRelease,
}: {
  label: string;
  className: string;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      className={`hud-btn ${className}`}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function Hud({
  snap,
  live,
  flashes,
  input,
  show,
  touchLayout,
  onPause,
  onCamera,
  nextStage,
  onRetire,
  scores,
}: HudProps) {
  const { touch } = input;
  const pedalSide = touchLayout.steerSide === "left" ? "right" : "left";
  // The thumb zones exist only where there are thumbs. CSS already hides
  // them on a pointer-fine display, but hidden is not the same as absent:
  // the pedal zone's whole default is GAS, so anything that can still reach
  // it — a stylus, a hybrid laptop, a browser that reports its pointers
  // oddly — is a way for the car to be given throttle nobody asked for. On a
  // desktop the throttle key is the only throttle there is.
  const thumbs = deviceControls().touch;
  return (
    <div className="hud pointer-events-none absolute inset-0 select-none">
      {/* Top bar: the CLOCK, and the one press that belongs on the road —
          the camera. Which stage this is rides under the minimap instead:
          the top-left corner belongs to the time, because the time is what
          the driver is racing. Restart and race setup live behind the
          minimap, one tap away and out of the sky. */}
      <div className="hud-top">
        <div className="hud-topleft">
          {show.timer && <RaceClock face={snap} live={live} />}
          {/* The gap to the ghost is its own chip rather than a line inside
              the clock: the clock's text is what the tooling reads the run's
              progress off, and it holds nothing but the time. */}
          {show.timer && snap.ghostGap !== null && (
            <div
              className={`hud-chip hud-gap ${snap.ghostGap < 0 ? "hud-gap-down" : ""}`}
              aria-label="Gap to your best run"
            >
              {snap.ghostGap < 0 ? "−" : "+"}
              {Math.abs(Math.round(snap.ghostGap))}m<span className="hud-chip-sub">GHOST</span>
            </div>
          )}
        </div>
        <div className="hud-actions pointer-events-auto">
          <button
            type="button"
            className="hud-mini hud-mini-icon"
            onClick={onCamera}
            title="Camera (V)"
            aria-label="Camera"
          >
            <CameraGlyph />
          </button>
        </div>
      </div>

      {/* The minimap owns the top-right corner: the route, the car on it, and
          the run's progress read off the frame. Tap it for the race menu.
          Switched off, the pause card is still one tap away — the chip in
          its place keeps that door open. */}
      {show.minimap ? (
        <div className="hud-minimap-dock pointer-events-auto">
          <Minimap map={snap.minimap} onOpen={onPause} />
        </div>
      ) : (
        <div className="hud-actions hud-actions-solo pointer-events-auto">
          <button
            type="button"
            className="hud-mini"
            onClick={onPause}
            title="Pause"
            aria-label="Pause"
          >
            ‖
          </button>
        </div>
      )}

      {/* Which stage, and in what — hung off the bottom edge of the map (or
          of the row that stands in for it), where a label the player reads
          once a run belongs. */}
      <div className={`hud-chip hud-stage ${show.minimap ? "" : "hud-stage-nomap"}`}>
        STAGE {snap.seed}
        <span className="hud-chip-sub">{snap.carName}</span>
      </div>

      {/* The co-driver's slot: corner calls while there is a road to call,
          the way back the moment there isn't. The way home is not behind the
          pacenote toggle — switching off the corner calls is a driver saying
          they know the stage, not one who wants to stay lost. */}
      {snap.phase === "racing" &&
        (snap.lost ? (
          <WayHomeCall distance={snap.homeDistance} />
        ) : (
          show.pacenotes &&
          snap.pacenotes.length > 0 && (
            <Pacenotes notes={snap.pacenotes} words={show.pacenoteText} />
          )
        ))}

      {/* Center: countdown / finish / event flashes. */}
      <div className="hud-center">
        <StartLights live={live} />
        {(snap.phase === "rollout" || snap.phase === "finished") && snap.finishTime !== null && (
          <FinishCard
            time={snap.finishTime}
            record={snap.record}
            laps={snap.laps}
            lapTimes={snap.lapTimes}
            nextStage={nextStage}
            onRetire={onRetire}
            scores={scores}
          />
        )}
        {snap.airborne && snap.phase === "racing" && <div className="hud-air">AIRBORNE</div>}
        <div className="hud-flashes">
          {flashes.map((f) => (
            <div key={f.id} className={`hud-flash hud-flash-${f.tone}`}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-left: the instrument panel, in two rows. The top row is the
          car's CONDITION — the damage glyph, and everything that comes and
          goes with the situation, the way back onto the road included.
          Keeping those out of the dial row is what stops a phone from losing
          the booster off the right edge the moment the car puts two wheels in
          the grass: a row that grows with the situation cannot also be a row
          sized to fit. The top bar is the same bargain — it holds the stage,
          the clock and the camera, and nothing that appears mid-run. */}
      <div className="hud-speed">
        <div className="hud-status">
          {show.damage && <DamagePanel damage={snap.damage} />}
          {/* Off the road the co-driver's strip says WHERE the road is and
              the arrow over the car says which way; all this row owes is the
              button that takes you there. */}
          {snap.offRoad && (
            <button
              type="button"
              className="hud-mini hud-mini-alert pointer-events-auto"
              onClick={() => input.requestReset()}
              title="Back to track (B)"
            >
              TRACK
            </button>
          )}
          {show.wind && snap.windKmh >= 4 && (
            <span className="hud-wind" title="Wind">
              <span
                className="hud-wind-arrow"
                style={{ transform: `rotate(${snap.windScreenAngle.toFixed(0)}deg)` }}
              >
                ↑
              </span>
              {Math.round(snap.windKmh)}
            </span>
          )}
        </div>
        <div className="hud-cluster">
          {show.tachometer && <Tachometer rpm={snap.rpm} />}
          <div className={`hud-gearbox ${snap.shiftUp ? "hud-gearbox-shift" : ""}`}>
            {/* NEUTRAL ON THE GRID: nothing has been geared yet, and a box
                reading first before the lights have gone is the instrument
                telling the player the run has started when it has not. */}
            <span className="hud-gear">
              {snap.reversing ? "R" : snap.phase === "countdown" ? "N" : snap.gear + 1}
            </span>
            <span className="hud-shiftlight">{snap.gearbox === "auto" ? "AUTO" : "SHIFT"}</span>
          </div>
          <span className="hud-speed-num">{Math.round(snap.speedKmh)}</span>
          <span className="hud-speed-unit">km/h</span>
          {/* The booster tank. `--fill` drives the bar in whichever direction
              the layout runs — a width in landscape, a height in portrait,
              where the cluster has no room left sideways. */}
          {show.boost && (
            <span className={`hud-boostbar ${snap.boosting ? "hud-boostbar-hot" : ""}`}>
              <span className="hud-boostbar-label">BOOST</span>
              <span className="hud-boostbar-track">
                <span
                  className="hud-boostbar-fill"
                  style={
                    {
                      "--fill": `${((snap.boostLeft / snap.boostMax) * 100).toFixed(1)}%`,
                    } as CSSProperties
                  }
                />
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Touch controls — one half of the screen anchors a steering wheel
          under the thumb, the other is the gesture pedal (gas / brake /
          boost / handbrake). Which half is which is the player's choice.
          Manual gear taps float above the pedal zone. */}
      <div className="hud-touch">
        {thumbs && <SteerZone touch={touch} side={touchLayout.steerSide} />}
        {thumbs && <PedalZone touch={touch} layout={touchLayout} side={pedalSide} />}
        {thumbs && snap.gearbox === "manual" && (
          <div className="hud-gears">
            <TouchButton
              label="−"
              className="hud-shift"
              onPress={() => input.requestShift(-1)}
              onRelease={() => undefined}
            />
            <TouchButton
              label="+"
              className="hud-shift"
              onPress={() => input.requestShift(1)}
              onRelease={() => undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
