// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Input: one manager merges keyboard state and the HUD's touch controls
// into the engine's CarInput. Keyboard steering ramps (a held arrow eases
// to full lock; release snaps back faster), touch steering is a direct
// axis. Shifts are edge-triggered and consumed by the step they arrive in.
//
// SIGN BOUNDARY: everything in this file is SCREEN-space — positive steer
// means "turn right as seen through the chase cam". The engine's positive
// steer is clockwise in MAP view (+z toward +x), and the renderer maps
// engine axes straight onto three.js, whose y-up top-down view MIRRORS the
// map — so on screen the engine's positive steer is a LEFT turn. The one
// negation lives in sample(); flip it anywhere else and left/right invert.

import type { CarInput } from "@engine";

export type InputManager = {
  /** Produce this step's input; advances steering smoothing by `dt`. */
  sample: (dt: number) => CarInput;
  /** HUD touch controls write their state here (screen-space steer). */
  touch: {
    steer: number;
    throttle: boolean;
    brake: boolean;
    handbrake: boolean;
    boost: boolean;
  };
  requestShift: (dir: 1 | -1) => void;
  /** Fired on R (restart) / C (car swap) / V (camera) so the app can react. */
  onAction: (handler: (action: "restart" | "swap" | "camera") => void) => void;
  dispose: () => void;
};

export function createInput(target: Window = window): InputManager {
  const down = new Set<string>();
  let steer = 0;
  let shiftUp = false;
  let shiftDown = false;
  let actionHandler: ((action: "restart" | "swap" | "camera") => void) | null = null;

  const touch = { steer: 0, throttle: false, brake: false, handbrake: false, boost: false };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    down.add(e.code);
    if (e.code === "KeyE" || e.code === "KeyX" || e.code === "ShiftRight") shiftUp = true;
    if (e.code === "KeyQ" || e.code === "KeyZ" || e.code === "ControlRight") shiftDown = true;
    if (e.code === "KeyR") actionHandler?.("restart");
    if (e.code === "KeyC") actionHandler?.("swap");
    if (e.code === "KeyV") actionHandler?.("camera");
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    down.delete(e.code);
  };
  const onBlur = (): void => down.clear();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  const sample = (dt: number): CarInput => {
    const left = down.has("ArrowLeft") || down.has("KeyA");
    const right = down.has("ArrowRight") || down.has("KeyD");
    // Screen-space: the right arrow is +1 here, negated below for the engine.
    const keyTarget = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = keyTarget === 0 ? 9 : 6;
    steer += (keyTarget - steer) * Math.min(1, rate * dt);
    if (Math.abs(steer) < 0.02 && keyTarget === 0) steer = 0;

    const input: CarInput = {
      steer: -(touch.steer !== 0 ? touch.steer : steer),
      throttle: down.has("ArrowUp") || down.has("KeyW") || touch.throttle ? 1 : 0,
      brake: down.has("ArrowDown") || down.has("KeyS") || touch.brake ? 1 : 0,
      handbrake: down.has("Space") || touch.handbrake,
      boost: down.has("ShiftLeft") || touch.boost,
      shiftUp,
      shiftDown,
    };
    shiftUp = false;
    shiftDown = false;
    return input;
  };

  return {
    sample,
    touch,
    requestShift: (dir) => {
      if (dir === 1) shiftUp = true;
      else shiftDown = true;
    },
    onAction: (handler) => {
      actionHandler = handler;
    },
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
