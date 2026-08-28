// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Input: one manager merges keyboard state and the HUD's touch controls
// into the engine's CarInput. Keyboard steering ramps (a held arrow eases
// to full lock; release snaps back faster), touch steering is a direct
// axis. Shifts are edge-triggered and consumed by the step they arrive in.
// The discipline the HUD's thumb zones hold a finger BY is next door in
// thumb-guard.ts, which stays DOM-free so the tests can read it.
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

import { KEY_LOOK_RATE, MOUSE_LOOK_RATE, NEUTRAL_MOVE, type FreeFlyMove } from "./camera-free.ts";
import { snapPedal, snapSteer } from "./ghost.ts";
import { DEFAULT_KEYS, type KeyAction, type KeyBindings } from "./settings.ts";

/** The presses the app reacts to rather than the car: they leave, reload or
 * reframe the run instead of driving it. */
export type InputAction = "restart" | "menu" | "camera" | "pause" | "screenshot";

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
  /**
   * Hand the keyboard over to something that is being TYPED INTO, and take it
   * back afterwards. While it is handed over the bindings do not exist: no
   * pedal, no gear, no restart.
   *
   * Nothing else can do this job. Both listeners sit on the same target, so a
   * `preventDefault` in the typing surface's own handler does not stop this
   * one — and the bindings are letters, so typing `RM` into the high score
   * board would otherwise restart the run and then walk out to the main menu.
   */
  setTyping: (typing: boolean) => void;
  requestShift: (dir: 1 | -1) => void;
  /** Queue a reset-to-track (the bound key / HUD button) — edge-triggered
   * into the engine, which respawns the car at its last on-road progress. */
  requestReset: () => void;
  /** Fired on the keys bound to restart / main menu / camera / pause so the
   * app can react. */
  onAction: (handler: (action: InputAction) => void) => void;
  /** Hand the controls to god mode's camera, or take them back. While it is
   * on the CAR is given nothing at all — `sample` returns neutral — so a
   * flight cannot leave the wheel wound on or the throttle buried when the
   * camera comes back down. */
  setFreeFly: (on: boolean) => void;
  /** What the free camera should do with `dt` seconds of held keys and the
   * mouse travel banked since the last read. Consuming: the look and wheel
   * deltas come out once. */
  flyMove: (dt: number) => FreeFlyMove;
  /** True while ALT is held — the key that takes the HUD off the screen for
   * a clean screenshot. Read rather than dispatched: it is a state the
   * screen is in, not a press anything acts on. */
  altHeld: () => boolean;
  dispose: () => void;
};

/** God mode's keyboard, fixed rather than rebindable: it is a developer
 * tool, and a scripted pass driving it headlessly has to know what the keys
 * ARE without reading anyone's local storage.
 *
 * Q and E shadow SPACE and CTRL on purpose. Ctrl+W is the browser's
 * close-tab chord and cannot be swallowed by a page, so descending while
 * flying forward needs a second way to say "down" — and Q/E is what every
 * level editor already means by it. */
const FLY_KEYS = {
  forward: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  up: ["Space", "KeyE"],
  down: ["ControlLeft", "ControlRight", "KeyQ"],
  fast: ["ShiftLeft", "ShiftRight"],
  lookLeft: ["ArrowLeft"],
  lookRight: ["ArrowRight"],
  lookUp: ["ArrowUp"],
  lookDown: ["ArrowDown"],
  slower: ["Minus", "NumpadSubtract"],
  faster: ["Equal", "NumpadAdd"],
} as const;

/** Every code god mode claims, so a flight can swallow the presses the
 * browser would otherwise scroll, zoom or bookmark with. */
const FLY_CODES = new Set<string>(Object.values(FLY_KEYS).flat());

/** Speed steps a single press of - / = is worth. Held, the key repeats and
 * walks the cruise speed at the browser's own repeat rate, which is a
 * usable dial and needs no ramp of its own. */
const KEY_SPEED_STEP = 1;

/** What the car is handed while god mode has the controls: nothing at all.
 * A frozen constant rather than a fresh object per step — the engine reads
 * it and never writes it. */
const FLYING_INPUT: CarInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boost: false,
  shiftUp: false,
  shiftDown: false,
  reset: false,
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

/** Which control sections are worth showing. A desktop has no thumbs to
 * assign and a phone has no keys to rebind, so each surface only offers
 * what the device it is running on can actually use — a laptop with a
 * touchscreen reports both and gets both. It lives here, with the rest of
 * what asks the browser about input, rather than beside the bindings it
 * decides the fate of: settings.ts is read by the camera, and through it by
 * the engine's own test suite, which has no DOM to ask. */
export function deviceControls(): { keyboard: boolean; touch: boolean } {
  if (typeof window === "undefined") return { keyboard: true, touch: false };
  const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  const keyboard = !touch || matchMedia("(pointer: fine)").matches;
  return { keyboard, touch };
}

export function createInput(target: Window = window): InputManager {
  /** Every bound code, mapped to the actions it fires. A code can serve
   * more than one action — nothing stops a player binding it twice. */
  let byCode = new Map<string, KeyAction[]>();
  /** Which actions are held down right now, by action rather than by code,
   * so a two-key alias (arrows AND WASD) reads as one press. */
  const held = new Set<KeyAction>();
  const downCodes = new Set<string>();
  /** The keyboard is somebody else's — see `setTyping`. */
  let typing = false;
  let steer = 0;
  let shiftUp = false;
  let shiftDown = false;
  let reset = false;
  let actionHandler: ((action: InputAction) => void) | null = null;
  /** God mode: whether the camera has the controls, which raw codes are
   * down, and the look and speed nudges banked since the camera last read
   * them. Raw codes rather than bound actions — the fly keys are fixed. */
  let flying = false;
  const flyDown = new Set<string>();
  let mouseYaw = 0;
  let mousePitch = 0;
  let speedSteps = 0;
  let altHeld = false;

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
    // Nothing on the keyboard is this manager's while something is being
    // typed into — not the pedals, not the free camera, and not the ALT
    // that hides the HUD out from under the surface asking for the keys.
    if (typing) return;
    // ALT is a HOLD, not a press: it hides the HUD for as long as it is
    // down. Swallowed so the browser does not take the keystroke off to its
    // own menu bar and leave the key stuck down with no keyup coming.
    if (e.altKey || e.code === "AltLeft" || e.code === "AltRight") {
      altHeld = true;
      if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
    }
    if (flying && FLY_CODES.has(e.code)) {
      e.preventDefault();
      flyDown.add(e.code);
      // The speed keys are the one fly control that acts on the PRESS
      // rather than on being held, and they are left to repeat: holding one
      // walks the cruise speed at the browser's repeat rate.
      if ((FLY_KEYS.slower as readonly string[]).includes(e.code)) speedSteps -= KEY_SPEED_STEP;
      else if ((FLY_KEYS.faster as readonly string[]).includes(e.code)) {
        speedSteps += KEY_SPEED_STEP;
      }
    }
    if (e.repeat) return;
    const actions = byCode.get(e.code);
    if (!actions) return;
    downCodes.add(e.code);
    for (const action of actions) {
      held.add(action);
      if (action === "shiftUp") shiftUp = true;
      else if (action === "shiftDown") shiftDown = true;
      else if (action === "reset") reset = true;
      else if (
        action === "restart" ||
        action === "camera" ||
        action === "pause" ||
        action === "screenshot"
      ) {
        actionHandler?.(action);
      } else if (action === "menu") actionHandler?.("menu");
      if (SWALLOWED.includes(action)) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    // The releases land either way: a key that went down before the keyboard
    // was handed over still has to be let go of.
    if (!e.altKey) altHeld = false;
    flyDown.delete(e.code);
    if (typing) return;
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
    // A key the window never saw released would otherwise stay down for
    // good: the camera would fly away by itself, and the HUD would stay
    // hidden, after an alt-tab out of the tab.
    flyDown.clear();
    altHeld = false;
  };

  /** Mouse look, under pointer lock only. Unlocked, the pointer belongs to
   * the page — a drag over the canvas is somebody selecting text, not
   * somebody aiming a camera. */
  const onMouseMove = (e: MouseEvent): void => {
    if (!flying || !document.pointerLockElement) return;
    mouseYaw += e.movementX * MOUSE_LOOK_RATE;
    mousePitch -= e.movementY * MOUSE_LOOK_RATE;
  };
  /** The wheel is the cruise-speed dial. `deltaY` is reported in wildly
   * different units between browsers and devices, so only its SIGN is
   * read — one notch is one step whatever the mouse says it sent. */
  const onWheel = (e: WheelEvent): void => {
    if (!flying || e.deltaY === 0) return;
    e.preventDefault();
    speedSteps -= Math.sign(e.deltaY);
  };

  /** Hand the keyboard over, or take it back. Whatever was down when it went
   * is released: a key held at the moment the card came up has no keyup
   * coming that this listener will see. */
  const setTyping = (on: boolean): void => {
    typing = on;
    held.clear();
    downCodes.clear();
    // Same reason `onBlur` does it: a key that was down when the keyboard
    // changed hands has no release this manager will act on.
    flyDown.clear();
    altHeld = false;
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  target.addEventListener("mousemove", onMouseMove);
  target.addEventListener("wheel", onWheel, { passive: false });

  const sample = (dt: number): CarInput => {
    // God mode has the controls: the car is given nothing, and the shift
    // and reset edges banked while flying are dropped rather than saved up
    // to fire the moment the camera lands.
    if (flying) {
      shiftUp = false;
      shiftDown = false;
      reset = false;
      return FLYING_INPUT;
    }
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
    setTyping,
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
    setFreeFly: (on) => {
      if (on === flying) return;
      flying = on;
      flyDown.clear();
      mouseYaw = 0;
      mousePitch = 0;
      speedSteps = 0;
      // The wheel and the pedals are RAMPS, and a ramp left wound on is
      // what the car would be handed the instant the camera lands.
      steer = 0;
      held.clear();
      downCodes.clear();
    },
    flyMove: (dt) => {
      if (!flying) return NEUTRAL_MOVE;
      const axis = (plus: readonly string[], minus: readonly string[]): number =>
        (plus.some((c) => flyDown.has(c)) ? 1 : 0) - (minus.some((c) => flyDown.has(c)) ? 1 : 0);
      const move: FreeFlyMove = {
        forward: axis(FLY_KEYS.forward, FLY_KEYS.back),
        right: axis(FLY_KEYS.right, FLY_KEYS.left),
        up: axis(FLY_KEYS.up, FLY_KEYS.down),
        yawDelta: mouseYaw + axis(FLY_KEYS.lookRight, FLY_KEYS.lookLeft) * KEY_LOOK_RATE * dt,
        pitchDelta: mousePitch + axis(FLY_KEYS.lookUp, FLY_KEYS.lookDown) * KEY_LOOK_RATE * dt,
        fast: FLY_KEYS.fast.some((c) => flyDown.has(c)),
        speedSteps,
      };
      mouseYaw = 0;
      mousePitch = 0;
      speedSteps = 0;
      return move;
    },
    altHeld: () => altHeld,
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("mousemove", onMouseMove);
      target.removeEventListener("wheel", onWheel);
    },
  };
}
