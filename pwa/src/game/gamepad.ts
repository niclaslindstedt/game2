// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The controller, read. A handheld running this as an installed PWA — a
// Retroid Pocket, an Odin, a phone with a clip-on pad — has sticks and
// analogue triggers in its hands, and this is what turns them into the same
// three things a thumb on glass produces: an axis, two pedals and a set of
// presses. While god mode has the camera the same hardware is read as a
// FLIGHT instead (`readFlyPad`) — a handheld has no keyboard, and a
// developer tool only a keyboard can reach is one that does not exist on the
// device the game is being played on.
//
// DOM-free on purpose. The browser's `Gamepad` is a live object that
// re-reads the hardware on every property access and cannot be constructed;
// everything here works on a plain SNAPSHOT of one, so the tests can hold a
// pad still, press a button, and check what came out. input.ts does the
// polling and hands the snapshots down.
//
// SIGN BOUNDARY: `steer` here is SCREEN-space, +1 = right, matching
// input.ts's touch axis. The one negation into engine space stays in
// input.ts's sample(), where it already lives.

import type { PadAction, PadBindings, PadSource } from "./settings.ts";

/** A `Gamepad` reduced to the parts that are read, as plain numbers. */
export type PadFrame = {
  /** Analogue value per button, 0–1. A digital button reports 0 or 1; a
   * trigger reports where it is. */
  buttons: number[];
  axes: number[];
  /** True when the browser claims the W3C standard mapping — the only case
   * in which a button index has a name anyone can print. */
  standard: boolean;
  id: string;
};

/** What a frame of pad reads is worth to the car. */
export type PadHold = {
  /** Screen-space steering from the STICK alone, −1…1. Zero when the stick
   * is inside its deadzone, which is also what "nobody is touching it"
   * looks like — so a zero here means the keyboard or the d-pad may speak. */
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  /** The d-pad's steer, −1 / 0 / +1. Kept apart from the stick because it
   * is DIGITAL: it rides input.ts's keyboard ramp rather than going straight
   * to the wheel, or a tap of left would be instant full lock. */
  steerStep: number;
  /** Which way the MENU cursor is being asked to go, −1 / 0 / +1 on each
   * axis, from the d-pad and the stick together. `navY` is +1 for DOWN,
   * which is the sign a stick pushed toward the player already reports —
   * the screen's sense, not the world's. */
  navX: number;
  navY: number;
};

/** How far the stick has to be pushed before it counts as a menu press. Far
 * higher than the driving deadzone: a stick resting a little off centre must
 * never walk a menu on its own, and nobody nudges a stick to pick a row. */
const NAV_PUSH = 0.55;

/** The menu cursor's key repeat: the wait before a held direction starts
 * repeating, then the gap between repeats, in seconds. The same shape every
 * keyboard has, for the same reason — one press is one row, and holding it
 * walks the list. */
export const NAV_DELAY = 0.36;
export const NAV_REPEAT = 0.11;

/** The stick's other half. Pads pair their axes (0/1 left stick, 2/3 right),
 * so the vertical of whichever stick STEERS is the one beside it — which
 * means the menu follows the player's steering choice without a second
 * binding to get wrong. */
export function pairedAxis(axis: number): number {
  return axis % 2 === 0 ? axis + 1 : axis - 1;
}

/** The OTHER stick — the one that is not steering. Pads lay their two sticks
 * out as axes 0/1 and 2/3, so whichever pair drives, the other pair is the
 * one a free camera looks with. Derived rather than bound: god mode is a
 * developer tool, and a tool that needs its own options page before it can
 * be flown is one nobody reaches for. */
export function otherStick(axis: number): number {
  return (axis + 2) % 4;
}

/** The pedals' floor. A trigger at rest is not always at zero, and a car
 * that creeps off the line under nobody's foot reads as a physics bug. */
const TRIGGER_FLOOR = 0.06;

/** What counts as a press for anything that is not a pedal — a trigger
 * bound to the handbrake, a stick flicked far enough to mean it. */
const PRESS = 0.5;

/** How far a control has to move, from wherever it was sitting, to be the
 * one the player just offered up for rebinding. Deliberately high: a pad
 * with a drifting stick would otherwise bind that stick to whatever the
 * player was trying to assign. */
const CAPTURE = 0.6;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Rescale so that just past `floor` is 0 and full travel is still 1 —
 * without it a deadzone is a step, and the first degree of usable lock
 * arrives already worth 15% of the wheel. */
export function deadzone(value: number, floor: number): number {
  const size = Math.abs(value);
  if (size <= floor) return 0;
  const scaled = (size - floor) / (1 - floor);
  return value < 0 ? -Math.min(1, scaled) : Math.min(1, scaled);
}

/** What one source reads, as a 0–1 amount.
 *
 * An axis is clamped to the bound direction rather than centred, which is
 * what lets one binding serve both trigger conventions: a trigger axis that
 * rests at −1 and one that rests at 0 both read 0 at rest and 1 buried. */
function sourceValue(frame: PadFrame, source: PadSource): number {
  if (source.kind === "button") return clamp01(frame.buttons[source.index] ?? 0);
  const axis = frame.axes[source.index];
  if (axis === undefined) return 0;
  return clamp01(deadzone(axis * source.dir, TRIGGER_FLOOR));
}

/** The strongest read of an action across every pad in hand. Two pads is
 * not a case anyone plans for, but it is exactly what a handheld plugged
 * into a dock looks like, and taking the larger of the two means neither
 * one sitting idle can hold the other's pedal up. */
function actionValue(frames: PadFrame[], bindings: PadBindings, action: PadAction): number {
  let best = 0;
  for (const source of bindings.sources[action]) {
    for (const frame of frames) {
      const value = sourceValue(frame, source);
      if (value > best) best = value;
    }
  }
  return best;
}

/** Every action currently down, and how hard. Pedals keep their analogue
 * value; everything else is a press once it is past halfway. */
export function readPad(frames: PadFrame[], bindings: PadBindings): PadHold {
  const throttle = actionValue(frames, bindings, "throttle");
  const brake = actionValue(frames, bindings, "brake");
  const left = actionValue(frames, bindings, "steerLeft") >= PRESS ? 1 : 0;
  const right = actionValue(frames, bindings, "steerRight") >= PRESS ? 1 : 0;
  let steer = 0;
  for (const frame of frames) {
    const axis = frame.axes[bindings.steerAxis];
    if (axis === undefined) continue;
    const value = deadzone(axis, bindings.deadzone) * (bindings.steerInvert ? -1 : 1);
    if (Math.abs(value) > Math.abs(steer)) steer = value;
  }
  // The menu cursor reads the d-pad and the stick as one: sideways is the
  // same pair that steers, because that is what the d-pad already means, and
  // up/down are bound in their own right.
  let stickX = 0;
  let stickY = 0;
  for (const frame of frames) {
    const x = frame.axes[bindings.steerAxis] ?? 0;
    const y = frame.axes[pairedAxis(bindings.steerAxis)] ?? 0;
    if (Math.abs(x) > Math.abs(stickX)) stickX = x;
    if (Math.abs(y) > Math.abs(stickY)) stickY = y;
  }
  if (bindings.steerInvert) stickX = -stickX;
  const push = (value: number): number => (value >= NAV_PUSH ? 1 : value <= -NAV_PUSH ? -1 : 0);
  const down = actionValue(frames, bindings, "navDown") >= PRESS ? 1 : 0;
  const up = actionValue(frames, bindings, "navUp") >= PRESS ? 1 : 0;
  return {
    steer,
    throttle: clamp01(deadzone(throttle, TRIGGER_FLOOR)),
    brake: clamp01(deadzone(brake, TRIGGER_FLOOR)),
    handbrake: actionValue(frames, bindings, "handbrake") >= PRESS,
    steerStep: right - left,
    navX: right - left || push(stickX),
    navY: down - up || push(stickY),
  };
}

/** What a frame of pad is worth to GOD MODE's free camera. The same pad,
 * read as a flight rather than as a drive: the stick that steers moves the
 * rig, the other one aims it, and the pedals become up and down.
 *
 * Screen-space throughout, matching `FreeFlyMove`: `right` is strafe to the
 * right of the picture, `lookY` is positive UP. A stick pushed away from the
 * player reports NEGATIVE on its vertical axis, so both of those cross a
 * sign here and nowhere else. */
export type PadFly = {
  forward: number;
  right: number;
  /** Throttle lifts, brake descends, both analogue — a trigger half open is
   * half the climb rate, which is what makes a pad worth flying on. */
  up: number;
  lookX: number;
  lookY: number;
  fast: boolean;
};

export const NEUTRAL_FLY: PadFly = {
  forward: 0,
  right: 0,
  up: 0,
  lookX: 0,
  lookY: 0,
  fast: false,
};

/** The look stick's response curve. Squaring keeps the middle of the travel
 * gentle enough to line a shot up on one tree while the top of it still
 * whips round — the same bargain the touch wheel's throw curve makes, and
 * for the same reason: a camera that aims in one register only is one that
 * is either twitchy or slow, never both. */
const LOOK_CURVE = 2;

/** Read the pads as a FLIGHT. Everything here is derived from the driving
 * bindings — the steering axis, its deadzone and invert, and the two
 * pedals — so nothing about god mode has to be bound before it can be
 * flown. */
export function readFlyPad(frames: PadFrame[], bindings: PadBindings): PadFly {
  if (frames.length === 0) return NEUTRAL_FLY;
  const lookAxis = otherStick(bindings.steerAxis);
  /** The furthest any pad has this axis pushed, deadzoned. Two pads is a
   * handheld in a dock, and the same rule the pedals use applies: neither
   * one sitting idle may hold the other's stick at centre. */
  const axis = (index: number): number => {
    let best = 0;
    for (const frame of frames) {
      const value = deadzone(frame.axes[index] ?? 0, bindings.deadzone);
      if (Math.abs(value) > Math.abs(best)) best = value;
    }
    return best;
  };
  const curve = (value: number): number => Math.sign(value) * Math.abs(value) ** LOOK_CURVE;
  /** Turn a stick round without minting a negative zero: `-0` is a distinct
   * value in JavaScript, and it reads back out of an equality check — and
   * out of anything that prints an axis — as a number that is not zero. */
  const flip = (value: number): number => (value === 0 ? 0 : -value);
  /** A player whose stick reads backwards said so once, on the driving
   * page; both horizontal axes owe that answer, or half the pad would be
   * mirrored against the other. */
  const sideways = (value: number): number => (bindings.steerInvert ? flip(value) : value);
  const up = actionValue(frames, bindings, "throttle");
  const down = actionValue(frames, bindings, "brake");
  return {
    forward: flip(axis(pairedAxis(bindings.steerAxis))),
    right: sideways(axis(bindings.steerAxis)),
    up: clamp01(deadzone(up, TRIGGER_FLOOR)) - clamp01(deadzone(down, TRIGGER_FLOOR)),
    lookX: sideways(curve(axis(lookAxis))),
    lookY: flip(curve(axis(pairedAxis(lookAxis)))),
    fast: actionValue(frames, bindings, "handbrake") >= PRESS,
  };
}

/** Actions that fire on the way DOWN and are consumed once — the gears, the
 * camera, the way out of the run. The rest are holds and are read straight
 * off `readPad`. */
const EDGE_ACTIONS: PadAction[] = [
  "shiftUp",
  "shiftDown",
  "reset",
  "camera",
  "restart",
  "menu",
  "pause",
  "screenshot",
  "confirm",
  "back",
  "next",
];

/** Which way a menu cursor was just asked to move. Not a `PadAction`: it is
 * not a button, it is the answer a direction gives once the repeat clock has
 * had its say. */
export type NavPress = "up" | "down" | "left" | "right";

export type PadReader = {
  /** Fold this frame's pads in: the holds to apply, the presses that
   * happened between the last call and this one, and the menu-cursor moves
   * the repeat clock has let through over `dt` seconds. */
  read: (
    frames: PadFrame[],
    dt: number,
  ) => {
    hold: PadHold;
    pressed: PadAction[];
    nav: NavPress[];
  };
  /** Re-point the pad at its actions. Whatever was down is forgotten and the
   * edges are re-armed against a RELEASE: an action bound to a button that
   * is being held at that moment — which is every rebind, because the press
   * that chose the button is still down — must see that button rise before
   * it fires. */
  setBindings: (bindings: PadBindings) => void;
  /** Take the pad away from the car (god mode, a menu, a disconnect) so
   * nothing arrives late, and re-arm every edge against a release: whatever
   * is held at the hand-over has to be let go of before it counts again. */
  release: () => void;
};

export const NEUTRAL_HOLD: PadHold = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  steerStep: 0,
  navX: 0,
  navY: 0,
};

export function createPadReader(bindings: PadBindings): PadReader {
  let current = bindings;
  const down = new Set<PadAction>();
  /** Last frame's cursor direction, and how long until the held one fires
   * again. One clock per axis, so holding DOWN while flicking RIGHT does not
   * reset the list's own repeat. */
  const heldNav = { x: 0, y: 0 };
  const navClock = { x: 0, y: 0 };
  /** Set whenever the pad changes hands. The next read RECORDS what is held
   * without firing any of it, so a button that was already down when the
   * game changed out from under it has to be released before it is a press
   * again.
   *
   * The hand-over is what makes this necessary: it forgets what was down, so
   * without the latch a HELD button arrives fresh on the very next frame. On
   * a handheld that is a pause card opening under START, the same held START
   * closing it a frame later, and the card flickering until the thumb comes
   * off — landing on whichever state the release happened to fall in.
   *
   * A fresh reader is NOT latched: a browser hands out no pads at all until
   * the page has seen a button press, so the first press one ever reports is
   * a real one the player just made. */
  let latch = false;

  /** One axis of the cursor: fire on the way off centre, then on the repeat
   * clock while it is held over. */
  const stepNav = (axis: "x" | "y", value: number, dt: number): boolean => {
    if (value === 0 || value !== heldNav[axis]) {
      heldNav[axis] = value;
      navClock[axis] = NAV_DELAY;
      return value !== 0;
    }
    navClock[axis] -= dt;
    if (navClock[axis] > 0) return false;
    navClock[axis] = NAV_REPEAT;
    return true;
  };

  return {
    read: (frames, dt) => {
      const hold = frames.length === 0 ? NEUTRAL_HOLD : readPad(frames, current);
      const pressed: PadAction[] = [];
      for (const action of EDGE_ACTIONS) {
        const on = actionValue(frames, current, action) >= PRESS;
        if (on && !down.has(action) && !latch) pressed.push(action);
        if (on) down.add(action);
        else down.delete(action);
      }
      const nav: NavPress[] = [];
      // The directions are stepped either way — the repeat clock has to
      // learn where the stick already is — but a held one says nothing on
      // the frame the pad changed hands.
      const movedX = stepNav("x", hold.navX, dt);
      const movedY = stepNav("y", hold.navY, dt);
      if (!latch) {
        if (movedX) nav.push(hold.navX > 0 ? "right" : "left");
        if (movedY) nav.push(hold.navY > 0 ? "down" : "up");
      }
      latch = false;
      return { hold, pressed, nav };
    },
    setBindings: (next) => {
      current = next;
      down.clear();
      latch = true;
    },
    release: () => {
      down.clear();
      heldNav.x = 0;
      heldNav.y = 0;
      latch = true;
    },
  };
}

/** The control the player just offered up, measured against a baseline
 * taken when the row started listening. Buttons win over axes at equal
 * travel: a trigger reports as both on some pads, and the button is the one
 * with a name to print.
 *
 * Returns null until something moves far enough to be deliberate, which is
 * what lets the options row sit there listening rather than binding the
 * first sample of a stick that was never at zero. */
export function captureSource(frames: PadFrame[], baseline: PadFrame[]): PadSource | null {
  for (const [index, frame] of frames.entries()) {
    const was = baseline[index];
    for (const [button, value] of frame.buttons.entries()) {
      const before = was?.buttons[button] ?? 0;
      if (value >= PRESS && value - before >= CAPTURE) return { kind: "button", index: button };
    }
  }
  for (const [index, frame] of frames.entries()) {
    const was = baseline[index];
    for (const [axis, value] of frame.axes.entries()) {
      const moved = value - (was?.axes[axis] ?? 0);
      if (Math.abs(moved) >= CAPTURE) return { kind: "axis", index: axis, dir: moved < 0 ? -1 : 1 };
    }
  }
  return null;
}

/** The same, for the steering axis: which one moved, and whether it moved
 * the wrong way. A player who pushes RIGHT and gets a left turn has told us
 * their stick reads inverted, and that is the whole of the invert flag. */
export function captureAxis(
  frames: PadFrame[],
  baseline: PadFrame[],
): { axis: number; invert: boolean } | null {
  for (const [index, frame] of frames.entries()) {
    const was = baseline[index];
    for (const [axis, value] of frame.axes.entries()) {
      const moved = value - (was?.axes[axis] ?? 0);
      if (Math.abs(moved) >= CAPTURE) return { axis, invert: moved < 0 };
    }
  }
  return null;
}
