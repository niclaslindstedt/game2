// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Input: one manager merges keyboard state and the HUD's touch controls
// into the engine's CarInput. Keyboard steering ramps (a held arrow eases
// to full lock; release snaps back faster), touch steering is a direct
// axis. Shifts are edge-triggered and consumed by the step they arrive in.
//
// Which key does what is the player's to change: the manager holds a
// code → action index built from the bindings in settings.ts, so a rebind
// is a call to `setKeys` and nothing here knows about any particular key.
//
// SIGN BOUNDARY: everything in this file is SCREEN-space — positive steer
// means "turn right as seen through the chase cam". The engine's positive
// steer is clockwise in MAP view (+z toward +x), and the renderer maps
// engine axes straight onto three.js, whose y-up top-down view MIRRORS the
// map — so on screen the engine's positive steer is a LEFT turn. The one
// negation lives in sample(); flip it anywhere else and left/right invert.

import type { CarInput } from "@engine";

import { snapPedal, snapSteer } from "./ghost.ts";
import { DEFAULT_KEYS, type KeyAction, type KeyBindings } from "./settings.ts";

/** The presses the app reacts to rather than the car: they leave, reload or
 * reframe the run instead of driving it. */
export type InputAction = "restart" | "menu" | "camera" | "pause";

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
  /** Re-point every key at its action; unbound actions simply go unpressed. */
  setKeys: (bindings: KeyBindings) => void;
  requestShift: (dir: 1 | -1) => void;
  /** Queue a reset-to-track (the bound key / HUD button) — edge-triggered
   * into the engine, which respawns the car at its last on-road progress. */
  requestReset: () => void;
  /** Fired on the keys bound to restart / main menu / camera / pause so the
   * app can react. */
  onAction: (handler: (action: InputAction) => void) => void;
  dispose: () => void;
};

/** Keyboard steering ramp, 1/s: a held arrow eases toward full lock at
 * this rate... */
const KEY_STEER_ATTACK = 6;
/** ...and a released one snaps back to centre at this one — faster, so
 * letting go is letting go, not a slow unwind. */
const KEY_STEER_RELEASE = 9;
/** Below this the centred keyboard axis snaps to exactly zero. */
const KEY_STEER_SNAP = 0.02;

/** Actions the browser must not also act on: the arrows and space scroll
 * the page, which on a keyboard-driven game means the whole shell jumps. */
const SWALLOWED: KeyAction[] = ["left", "right", "throttle", "brake", "handbrake"];

export function createInput(target: Window = window): InputManager {
  /** Every bound code, mapped to the actions it fires. A code can serve
   * more than one action — nothing stops a player binding it twice. */
  let byCode = new Map<string, KeyAction[]>();
  /** Which actions are held down right now, by action rather than by code,
   * so a two-key alias (arrows AND WASD) reads as one press. */
  const held = new Set<KeyAction>();
  const downCodes = new Set<string>();
  let steer = 0;
  let shiftUp = false;
  let shiftDown = false;
  let reset = false;
  let actionHandler: ((action: InputAction) => void) | null = null;

  const touch = { steer: 0, throttle: false, brake: false, handbrake: false, boost: false };

  const setKeys = (bindings: KeyBindings): void => {
    const next = new Map<string, KeyAction[]>();
    for (const [action, codes] of Object.entries(bindings) as [KeyAction, string[]][]) {
      for (const code of codes) {
        const list = next.get(code);
        if (list) list.push(action);
        else next.set(code, [action]);
      }
    }
    byCode = next;
    // A rebind while a key is down would otherwise leave its old action
    // stuck on with no keyup ever coming for it.
    held.clear();
    downCodes.clear();
  };
  setKeys(DEFAULT_KEYS);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const actions = byCode.get(e.code);
    if (!actions) return;
    downCodes.add(e.code);
    for (const action of actions) {
      held.add(action);
      if (action === "shiftUp") shiftUp = true;
      else if (action === "shiftDown") shiftDown = true;
      else if (action === "reset") reset = true;
      else if (action === "restart" || action === "camera" || action === "pause") {
        actionHandler?.(action);
      } else if (action === "menu") actionHandler?.("menu");
      if (SWALLOWED.includes(action)) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!downCodes.delete(e.code)) return;
    // An action stays held while ANY other code still bound to it is down.
    for (const action of byCode.get(e.code) ?? []) {
      const stillDown = [...downCodes].some((code) => byCode.get(code)?.includes(action));
      if (!stillDown) held.delete(action);
    }
  };
  const onBlur = (): void => {
    held.clear();
    downCodes.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  const sample = (dt: number): CarInput => {
    // Screen-space: the right-steer key is +1 here, negated below for the
    // engine.
    const keyTarget = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    const rate = keyTarget === 0 ? KEY_STEER_RELEASE : KEY_STEER_ATTACK;
    steer += (keyTarget - steer) * Math.min(1, rate * dt);
    if (Math.abs(steer) < KEY_STEER_SNAP && keyTarget === 0) steer = 0;

    // Snapped onto the ghost tape's grid (ghost.ts) on the way out. A run
    // is recorded as the controls it was driven on, and a replay only lands
    // on the same road if what the engine receives is exactly what gets
    // written down — so the wheel and the pedals have a fixed resolution,
    // set once here at the one place they are produced. It is far finer
    // than a thumb or a key ramp can resolve.
    const input: CarInput = {
      steer: snapSteer(-(touch.steer !== 0 ? touch.steer : steer)),
      throttle: snapPedal(held.has("throttle") || touch.throttle ? 1 : 0),
      brake: snapPedal(held.has("brake") || touch.brake ? 1 : 0),
      handbrake: held.has("handbrake") || touch.handbrake,
      boost: held.has("boost") || touch.boost,
      shiftUp,
      shiftDown,
      reset,
    };
    shiftUp = false;
    shiftDown = false;
    reset = false;
    return input;
  };

  return {
    sample,
    touch,
    setKeys,
    requestShift: (dir) => {
      if (dir === 1) shiftUp = true;
      else shiftDown = true;
    },
    requestReset: () => {
      reset = true;
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
