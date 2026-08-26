// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD: chunky arcade chrome over the canvas. Reads a low-rate snapshot
// (the app refreshes it ~12×/s — the canvas is the 60 fps surface, the HUD
// is not), and owns the touch controls, which write straight into the
// input manager between snapshots.

import type { InputManager } from "./input.ts";
import { formatTime } from "../lib/util.ts";

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
      </div>

      {/* Touch controls — steering pads left, pedals right. */}
      <div className="hud-touch pointer-events-auto">
        <div className="hud-touch-left">
          <TouchButton
            label="◀"
            className="hud-steer"
            onPress={() => (touch.steer = -1)}
            onRelease={() => {
              if (touch.steer < 0) touch.steer = 0;
            }}
          />
          <TouchButton
            label="▶"
            className="hud-steer"
            onPress={() => (touch.steer = 1)}
            onRelease={() => {
              if (touch.steer > 0) touch.steer = 0;
            }}
          />
        </div>
        <div className="hud-touch-right">
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
          <TouchButton
            label="DRIFT"
            className="hud-hand"
            onPress={() => (touch.handbrake = true)}
            onRelease={() => (touch.handbrake = false)}
          />
          <div className="hud-pedals">
            <TouchButton
              label="BRAKE"
              className="hud-brake"
              onPress={() => (touch.brake = true)}
              onRelease={() => (touch.brake = false)}
            />
            <TouchButton
              label="GAS"
              className="hud-gas"
              onPress={() => (touch.throttle = true)}
              onRelease={() => (touch.throttle = false)}
            />
          </div>
        </div>
      </div>

      <div className="hud-build">{__BUILD_LABEL__}</div>
    </div>
  );
}
