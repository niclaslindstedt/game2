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
// A CONTROLLER is the third surface, and the only one that has to be ASKED:
// the browser fires no events for a stick or a trigger, so `pollPads` reads
// the pads once a frame and gamepad.ts turns them into the same axis, two
// pedals and set of presses the other two produce. The pedals arrive
// analogue and stay that way — a trigger half open is half throttle, which
// is the whole reason to drive on a pad at all.
//
// SIGN BOUNDARY: everything in this file is SCREEN-space — positive steer
// means "turn right as seen through the chase cam". The engine's positive
// steer is clockwise in MAP view (+z toward +x), and the renderer maps
// engine axes straight onto three.js, whose y-up top-down view MIRRORS the
// map — so on screen the engine's positive steer is a LEFT turn. The one
// negation lives in sample(); flip it anywhere else and left/right invert.

import type { CarInput } from "@engine";

import {
  KEY_LOOK_RATE,
  MOUSE_LOOK_RATE,
  NEUTRAL_MOVE,
  PAD_LOOK_RATE,
  type FreeFlyMove,
} from "./camera-free.ts";
import {
  createPadReader,
  NEUTRAL_FLY,
  NEUTRAL_HOLD,
  readFlyPad,
  type NavPress,
  type PadFly,
  type PadFrame,
  type PadHold,
} from "./gamepad.ts";
import { snapPedal, snapSteer } from "./ghost.ts";
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  type KeyAction,
  type KeyBindings,
  type PadAction,
  type PadSettings,
} from "./settings.ts";
import { clamp } from "../lib/util.ts";

/** The presses the app reacts to rather than the car: they leave, reload or
 * reframe the run instead of driving it. */
export type InputAction = "restart" | "menu" | "camera" | "pause" | "screenshot";

/** The presses that walk a MENU rather than the game behind it. Only a
 * controller produces these: a keyboard has the mouse and the touchscreen
 * beside it, and its arrows are already the throttle and the wheel. */
export type NavAction = "navUp" | "navDown" | "navLeft" | "navRight" | "confirm" | "back" | "next";

export type InputManager = {
  /** Produce this step's input; advances steering smoothing by `dt`. */
  sample: (dt: number) => CarInput;
  /** HUD touch controls write their state here (screen-space steer). */
  touch: {
    steer: number;
    throttle: boolean;
    brake: boolean;
    handbrake: boolean;
  };
  /** Re-point every key at its action; unbound actions simply go unpressed. */
  setKeys: (bindings: KeyBindings) => void;
  /** Re-point the controller, and say whether it drives and whether it takes
   * the thumb zones off the screen. */
  setPad: (pad: PadSettings) => void;
  /** Read every connected pad and fold this frame's sticks, triggers and
   * presses in, advancing the menu cursor's repeat clock by `dt` seconds.
   * Called ONCE a frame — a pad fires no events, so nothing it does exists
   * until this asks. Returns whether a pad is driving, which is what the HUD
   * hangs the thumb zones on. */
  pollPads: (dt: number) => boolean;
  /** Hand the pad to a MENU, or take it back. While a card is up the pad
   * walks it: the cursor moves, SELECT presses what it is on, and nothing
   * the pad does reaches the car — not the gears, and not the reset that
   * would otherwise be sitting queued when the card comes down. PAUSE is the
   * one press that still goes through, because it is the way back out. */
  setNavigating: (on: boolean) => void;
  /** Where the menu cursor is being sent, and what is being pressed on it. */
  onNav: (handler: (action: NavAction) => void) => void;
  /** Whether a pad was connected the last time anyone asked. Read rather
   * than dispatched: a pad's presence is a state the device is in. */
  padConnected: () => boolean;
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
  /** God mode's TOUCH controls write here, the way the driving zones write
   * into `touch` — a phone has no keyboard, and a developer tool that only
   * a keyboard can reach does not exist on the device the game is installed
   * on.
   *
   * The three axes are HELD: a thumb on the stick leaves them set. The look
   * and speed fields are DELTAS the camera CONSUMES and zeroes on its way
   * past, exactly as it does the mouse's — a drag says how far the view
   * moved, not where it should end up. */
  flyTouch: {
    forward: number;
    right: number;
    up: number;
    fast: boolean;
    /** Radians banked since the last read, screen-space: yaw positive to
     * the right, pitch positive up. */
    yaw: number;
    pitch: number;
    /** Cruise-speed notches banked since the last read. */
    steps: number;
  };
  /** What the free camera should do with `dt` seconds of held keys, sticks
   * and thumbs, and the mouse travel banked since the last read. Consuming:
   * the look and wheel deltas come out once. */
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

/** How many rebinding rows are currently waiting for a press. While any of
 * them is, the pad belongs to that row and not to the car: binding CAMERA
 * by pressing START would otherwise ALSO fire pause on the way past, and
 * every rebind would leave the game somewhere else.
 *
 * A module-level latch rather than a manager method because there is only
 * one pad in the room and the surface holding it is not the one that reads
 * it — the same shape as the keyboard's answer to the same problem, which
 * is a capture-phase listener swallowing the event for everyone. */
let padHolds = 0;

/** Take the pad, and give it back. Symmetrical: every `holdPad(true)` owes
 * a `holdPad(false)`, which is why the callers are effect cleanups. */
export function holdPad(on: boolean): void {
  padHolds = Math.max(0, padHolds + (on ? 1 : -1));
}

/** Every connected pad, as the plain snapshots gamepad.ts reads. The
 * browser's `Gamepad` is a live view of the hardware that cannot be held
 * on to, so this copies what it says the moment it says it.
 *
 * Chromium hands nothing back until the page has seen a button press —
 * privacy, not a bug — which is why a pad appears the instant it is USED
 * rather than the instant it is plugged in. That is the better moment
 * anyway: it is when the player is asking for it. */
export function readPadFrames(): PadFrame[] {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  const frames: PadFrame[] = [];
  for (const pad of navigator.getGamepads()) {
    if (!pad?.connected) continue;
    frames.push({
      buttons: pad.buttons.map((b) => b.value),
      axes: [...pad.axes],
      standard: pad.mapping === "standard",
      id: pad.id,
    });
  }
  return frames;
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

  const touch = { steer: 0, throttle: false, brake: false, handbrake: false };
  const flyTouch = { forward: 0, right: 0, up: 0, fast: false, yaw: 0, pitch: 0, steps: 0 };

  /** The controller. `padHold` is last frame's sticks and triggers, held
   * between polls because `sample` runs once per 120 Hz STEP and the pad is
   * asked once per FRAME — several steps read the same reading, exactly as
   * several steps read the same key state between two keydowns. */
  const padReader = createPadReader(DEFAULT_PAD.bindings);
  let padOptions: PadSettings = DEFAULT_PAD;
  let padHold: PadHold = NEUTRAL_HOLD;
  /** The same pads, read as a flight while god mode has the camera. Held
   * between polls for the reason `padHold` is: the pad is asked once a
   * frame and the camera flies on every one of them. */
  let padFly: PadFly = NEUTRAL_FLY;
  let padPresent = false;
  /** True while a menu card owns the pad — see `setNavigating`. */
  let navigating = false;
  let navHandler: ((action: NavAction) => void) | null = null;

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
    // The pad goes with it. It has no letters to offer the card asking for
    // them, and what it does have is a button that throws the stage away.
    padHold = NEUTRAL_HOLD;
    padReader.release();
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

  const setPad = (pad: PadSettings): void => {
    padOptions = pad;
    padReader.setBindings(pad.bindings);
    padHold = NEUTRAL_HOLD;
  };

  /** Which edge presses the app acts on rather than the car. The same list
   * the keyboard fires, minus the two the pad has its own words for. */
  const PAD_APP_ACTIONS: PadAction[] = ["restart", "camera", "pause", "screenshot", "menu"];

  /** Which way a cursor move goes as an action name. */
  const NAV_BY_PRESS: Record<NavPress, NavAction> = {
    up: "navUp",
    down: "navDown",
    left: "navLeft",
    right: "navRight",
  };

  const pollPads = (dt: number): boolean => {
    const frames = readPadFrames();
    padPresent = frames.length > 0;
    // A pad switched off in the options is not read at all: the point of
    // that switch is a device that reports itself as a gamepad and then
    // holds an axis over, and a reading taken and discarded would still let
    // it hide the thumb zones out from under the player's only controls.
    if (!padOptions.enabled || typing || padHolds > 0) {
      padHold = NEUTRAL_HOLD;
      padFly = NEUTRAL_FLY;
      padReader.release();
      return false;
    }
    const { hold, pressed, nav } = padReader.read(frames, dt);
    // A card is up: the pad is walking it, and the car is given nothing.
    // Not even the edges — a gear or a reset banked behind a pause card
    // arrives the instant the card comes down, which reads as the game
    // doing something on its own.
    const flyingPad = flying && !navigating;
    padHold = navigating || flying ? NEUTRAL_HOLD : hold;
    // The camera has the sticks: the same hardware, read as a flight. The
    // car is given nothing either way — `sample` sees to that — but reading
    // it as a drive as well would leave a stale wheel angle sitting in
    // `padHold` for the frame the camera lands on.
    padFly = flyingPad ? readFlyPad(frames, padOptions.bindings) : NEUTRAL_FLY;
    for (const action of pressed) {
      if (flyingPad) {
        // The shoulders are the cruise-speed dial while flying — the one
        // control a flight needs that neither stick nor trigger carries.
        // Everything else the pad does to a RUN (a gear, a reset) is
        // dropped rather than banked: god mode holds the run still, and a
        // press queued through a flight arrives the instant it lands.
        if (action === "shiftUp") speedSteps += KEY_SPEED_STEP;
        else if (action === "shiftDown") speedSteps -= KEY_SPEED_STEP;
        else if (PAD_APP_ACTIONS.includes(action)) actionHandler?.(action as InputAction);
        continue;
      }
      if (navigating) {
        if (action === "confirm" || action === "back" || action === "next") navHandler?.(action);
        // PAUSE still goes through: it is the press that put the card up,
        // and it has to be the press that takes it down again. It shares a
        // button with NEXT by default, and that is not a clash — the pause
        // card marks no way ON, so over a run START closes the card, and
        // over a menu there is no run for it to reach.
        else if (action === "pause") actionHandler?.("pause");
        continue;
      }
      if (action === "shiftUp") shiftUp = true;
      else if (action === "shiftDown") shiftDown = true;
      else if (action === "reset") reset = true;
      else if (PAD_APP_ACTIONS.includes(action)) actionHandler?.(action as InputAction);
    }
    if (navigating) for (const press of nav) navHandler?.(NAV_BY_PRESS[press]);
    return padPresent;
  };

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
    // engine. The d-pad joins the KEYS rather than the stick: it is a pair
    // of digital presses, and a press taken straight to the wheel would be
    // instant full lock — so it rides the same ramp the arrows do.
    const keyTarget =
      (held.has("right") || padHold.steerStep > 0 ? 1 : 0) -
      (held.has("left") || padHold.steerStep < 0 ? 1 : 0);
    const rate = keyTarget === 0 ? KEY_STEER_RELEASE : KEY_STEER_ATTACK;
    steer += (keyTarget - steer) * Math.min(1, rate * dt);
    if (Math.abs(steer) < KEY_STEER_SNAP && keyTarget === 0) steer = 0;

    // Three surfaces, one wheel. A thumb on the glass wins, then the stick,
    // then the ramp — each only speaks while the one above it is at rest, so
    // nothing has to be switched off for the next thing to work. The pedals
    // take the DEEPEST of the three instead: a trigger and a key are both
    // asking for throttle, and the answer to both is the one that asks for
    // more.
    const wheel = touch.steer !== 0 ? touch.steer : padHold.steer !== 0 ? padHold.steer : steer;
    const throttle = Math.max(held.has("throttle") || touch.throttle ? 1 : 0, padHold.throttle);
    const brake = Math.max(held.has("brake") || touch.brake ? 1 : 0, padHold.brake);

    // Snapped onto the ghost tape's grid (ghost.ts) on the way out. A run
    // is recorded as the controls it was driven on, and a replay only lands
    // on the same road if what the engine receives is exactly what gets
    // written down — so the wheel and the pedals have a fixed resolution,
    // set once here at the one place they are produced. It is far finer
    // than a thumb or a key ramp can resolve.
    const input: CarInput = {
      steer: snapSteer(-wheel),
      throttle: snapPedal(throttle),
      brake: snapPedal(brake),
      handbrake: held.has("handbrake") || touch.handbrake || padHold.handbrake,
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
    setPad,
    pollPads,
    setNavigating: (on) => {
      if (on === navigating) return;
      navigating = on;
      // Whatever was down when the card went up or came down has to be let
      // go of before it counts again: the button that opened a menu must not
      // also press its first row, the one that closed it must not also drive
      // away, and — the reason the release is a LATCH rather than a
      // forgetting — a button simply held down must not open the card, close
      // it, and open it again on three consecutive frames.
      padHold = NEUTRAL_HOLD;
      padReader.release();
    },
    onNav: (handler) => {
      navHandler = handler;
    },
    padConnected: () => padPresent && padOptions.enabled,
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
      // what the car would be handed the instant the camera lands. The pad's
      // reading is not a ramp, but it is just as stale: the next poll is the
      // only honest thing to drive on.
      steer = 0;
      held.clear();
      downCodes.clear();
      padHold = NEUTRAL_HOLD;
      padFly = NEUTRAL_FLY;
      padReader.release();
      // A thumb that was on a fly zone when the camera landed has no
      // pointerup this manager will see — the zone it was holding is not on
      // the screen any more.
      flyTouch.forward = 0;
      flyTouch.right = 0;
      flyTouch.up = 0;
      flyTouch.fast = false;
      flyTouch.yaw = 0;
      flyTouch.pitch = 0;
      flyTouch.steps = 0;
    },
    flyTouch,
    flyMove: (dt) => {
      if (!flying) return NEUTRAL_MOVE;
      const axis = (plus: readonly string[], minus: readonly string[]): number =>
        (plus.some((c) => flyDown.has(c)) ? 1 : 0) - (minus.some((c) => flyDown.has(c)) ? 1 : 0);
      // Three surfaces, one rig. The keys, the sticks and the thumbs ADD
      // rather than override each other: unlike the wheel, where two
      // surfaces asking for different lock is a contradiction, two hands
      // pushing the same camera forward is just a camera going forward.
      // Clamped so the sum still means "full travel", which is what
      // camera-free's diagonal normalisation is measured against.
      const push = (keys: number, pad: number, thumb: number): number =>
        clamp(keys + pad + thumb, -1, 1);
      const move: FreeFlyMove = {
        forward: push(axis(FLY_KEYS.forward, FLY_KEYS.back), padFly.forward, flyTouch.forward),
        right: push(axis(FLY_KEYS.right, FLY_KEYS.left), padFly.right, flyTouch.right),
        up: push(axis(FLY_KEYS.up, FLY_KEYS.down), padFly.up, flyTouch.up),
        yawDelta:
          mouseYaw +
          flyTouch.yaw +
          (axis(FLY_KEYS.lookRight, FLY_KEYS.lookLeft) * KEY_LOOK_RATE +
            padFly.lookX * PAD_LOOK_RATE) *
            dt,
        pitchDelta:
          mousePitch +
          flyTouch.pitch +
          (axis(FLY_KEYS.lookUp, FLY_KEYS.lookDown) * KEY_LOOK_RATE +
            padFly.lookY * PAD_LOOK_RATE) *
            dt,
        fast: FLY_KEYS.fast.some((c) => flyDown.has(c)) || padFly.fast || flyTouch.fast,
        speedSteps: speedSteps + flyTouch.steps,
      };
      mouseYaw = 0;
      mousePitch = 0;
      speedSteps = 0;
      flyTouch.yaw = 0;
      flyTouch.pitch = 0;
      flyTouch.steps = 0;
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
