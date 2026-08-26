// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD: chunky arcade chrome over the canvas. Reads a low-rate snapshot
// (the app refreshes it ~12×/s — the canvas is the 60 fps surface, the HUD
// is not), and owns the touch controls, which write straight into the
// input manager between snapshots.

import { useRef } from "react";

import type { InputManager } from "./input.ts";
import { clamp, formatTime } from "../lib/util.ts";

export type HudSnapshot = {
  phase: "countdown" | "racing" | "finished";
  countdown: number;
  time: number;
  speedKmh: number;
  gear: number;
  gearbox: "auto" | "manual";
  drifting: boolean;
  airborne: boolean;
  driftScore: number;
  progress: number;
  seed: number;
  carName: string;
  offRoad: boolean;
  finishTime: number | null;
  /** Booster tank readout, seconds left / full tank. */
  boostLeft: number;
  boostMax: number;
  boosting: boolean;
};

export type HudFlash = { id: number; text: string; tone: "good" | "bad" | "info" };

type HudProps = {
  snap: HudSnapshot;
  flashes: HudFlash[];
  input: InputManager;
  onSwapCar: () => void;
  onRestart: () => void;
  onCamera: () => void;
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

/** Thumb travel (px) from the anchor for full steering lock — the wheel's
 * whole throw. Long enough that holding a line is a push, not a switch. */
const WHEEL_REACH_PX = 70;
/** Drag (px) from the anchor before a pedal gesture beats plain gas. */
const PEDAL_DEAD_PX = 28;

/** The left thumb: touching anywhere anchors a steering wheel under the
 * finger; dragging sideways turns it — rotation tracks the drag, so a small
 * push is a small steer — and releasing recenters. Screen-space: right = +1
 * (input.ts flips the sign for the engine once). Written straight into the
 * input manager and the wheel's DOM from the pointer events; the 12 Hz HUD
 * re-render never touches these styles. */
function SteerZone({ touch }: { touch: InputManager["touch"] }) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const originRef = useRef(0);

  const setSteer = (value: number): void => {
    touch.steer = value;
    wheelRef.current?.style.setProperty("--turn", `${(value * 120).toFixed(1)}deg`);
  };
  const release = (e: { pointerId: number }): void => {
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setSteer(0);
    if (wheelRef.current) wheelRef.current.style.display = "none";
  };

  return (
    <div
      className="hud-zone hud-zone-left"
      onPointerDown={(e) => {
        // The first finger owns the wheel; a second touch on this half is
        // ignored rather than re-anchoring the steering under the first.
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        originRef.current = e.clientX;
        capturePointer(e);
        const wheel = wheelRef.current;
        if (wheel) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          wheel.style.left = `${e.clientX - box.left}px`;
          wheel.style.top = `${e.clientY - box.top}px`;
          wheel.style.display = "block";
        }
        setSteer(0);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointerRef.current) return;
        setSteer(clamp((e.clientX - originRef.current) / WHEEL_REACH_PX, -1, 1));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={wheelRef} className="hud-wheel" aria-hidden="true">
        <svg className="hud-wheel-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="11" />
          <path
            d="M50 50 L50 89 M50 50 L16 32 M50 50 L84 32"
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

/** The right thumb: touching anywhere is GAS; dragging up from the anchor
 * brakes, down burns the booster, right pulls the handbrake (gas stays on
 * through boost and handbrake — that is what makes the handbrake a drift
 * tool). Sliding back inside the deadzone returns to plain gas; releasing
 * lets everything go. Three anchored hint arrows light the active gesture. */
function PedalZone({ touch }: { touch: InputManager["touch"] }) {
  const hintRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });

  const setMode = (mode: PedalMode | null): void => {
    touch.throttle = mode !== null && mode !== "brake";
    touch.brake = mode === "brake";
    touch.boost = mode === "boost";
    touch.handbrake = mode === "handbrake";
    const hint = hintRef.current;
    if (hint) hint.dataset.mode = mode ?? "";
  };
  const release = (e: { pointerId: number }): void => {
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setMode(null);
    if (hintRef.current) hintRef.current.style.display = "none";
  };

  return (
    <div
      className="hud-zone hud-zone-right"
      onPointerDown={(e) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        originRef.current = { x: e.clientX, y: e.clientY };
        capturePointer(e);
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
        if (e.pointerId !== pointerRef.current) return;
        const dx = e.clientX - originRef.current.x;
        const dy = e.clientY - originRef.current.y;
        // Dominant axis picks the gesture; a drag left means nothing and
        // stays gas, so a sloppy thumb never brakes by accident.
        let mode: PedalMode = "gas";
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= PEDAL_DEAD_PX) {
          if (Math.abs(dy) >= Math.abs(dx)) mode = dy < 0 ? "brake" : "boost";
          else if (dx > 0) mode = "handbrake";
        }
        setMode(mode);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={hintRef} className="hud-pedal-hint" aria-hidden="true">
        <span className="hud-hint hud-hint-up">
          <i className="hud-hint-arrow hud-hint-arrow-up" />
          BRAKE
        </span>
        <span className="hud-hint hud-hint-down">
          <i className="hud-hint-arrow hud-hint-arrow-down" />
          BOOST
        </span>
        <span className="hud-hint hud-hint-right">
          <i className="hud-hint-arrow hud-hint-arrow-right" />
          DRIFT
        </span>
      </div>
    </div>
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

export function Hud({ snap, flashes, input, onSwapCar, onRestart, onCamera }: HudProps) {
  const { touch } = input;
  return (
    <div className="hud pointer-events-none absolute inset-0 select-none">
      {/* Top bar: stage + timer + progress. */}
      <div className="hud-top">
        <div className="hud-chip">
          STAGE {snap.seed}
          <span className="hud-chip-sub">{snap.carName}</span>
        </div>
        <div className="hud-chip hud-timer">{formatTime(snap.time)}</div>
        <div className="hud-progress">
          <div
            className="hud-progress-fill"
            style={{ width: `${(snap.progress * 100).toFixed(1)}%` }}
          />
        </div>
        <div className="hud-actions pointer-events-auto">
          <button type="button" className="hud-mini" onClick={onCamera} title="Camera (V)">
            CAM
          </button>
          <button type="button" className="hud-mini" onClick={onSwapCar} title="Swap car (C)">
            SWAP CAR
          </button>
          <button type="button" className="hud-mini" onClick={onRestart} title="Restart stage (R)">
            RESTART
          </button>
        </div>
      </div>

      {/* Center: countdown / finish / event flashes. */}
      <div className="hud-center">
        {snap.phase === "countdown" && (
          <div className="hud-count">{Math.ceil(snap.countdown) || "GO"}</div>
        )}
        {snap.phase === "finished" && snap.finishTime !== null && (
          <div className="hud-finish">
            <div className="hud-finish-title">STAGE CLEAR</div>
            <div className="hud-finish-time">{formatTime(snap.finishTime)}</div>
            <div className="hud-finish-sub">next stage rolling in…</div>
          </div>
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

      {/* Bottom-left: speed + gear. */}
      <div className="hud-speed">
        <span className="hud-speed-num">{Math.round(snap.speedKmh)}</span>
        <span className="hud-speed-unit">km/h</span>
        <span className={`hud-gear ${snap.gearbox === "manual" ? "hud-gear-manual" : ""}`}>
          {snap.gearbox === "auto" ? `A${snap.gear + 1}` : `${snap.gear + 1}`}
        </span>
        {snap.drifting && <span className="hud-drift">DRIFT {Math.round(snap.driftScore)}</span>}
        {snap.offRoad && <span className="hud-off">OFF ROAD</span>}
        <span className={`hud-boostbar ${snap.boosting ? "hud-boostbar-hot" : ""}`}>
          <span className="hud-boostbar-label">BOOST</span>
          <span className="hud-boostbar-track">
            <span
              className="hud-boostbar-fill"
              style={{ width: `${((snap.boostLeft / snap.boostMax) * 100).toFixed(1)}%` }}
            />
          </span>
        </span>
      </div>

      {/* Touch controls — the left half of the screen anchors a steering
          wheel under the thumb, the right half is the gesture pedal (gas /
          brake / boost / handbrake). Manual gear taps float above the
          pedal zone. */}
      <div className="hud-touch">
        <SteerZone touch={touch} />
        <PedalZone touch={touch} />
        {snap.gearbox === "manual" && (
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

      <div className="hud-build">{__BUILD_LABEL__}</div>
    </div>
  );
}
