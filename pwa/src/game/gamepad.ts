// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The controller, read. A handheld running this as an installed PWA — a
// Retroid Pocket, an Odin, a phone with a clip-on pad — has sticks and
// analogue triggers in its hands, and this is what turns them into the same
// three things a thumb on glass produces: an axis, two pedals and a set of
// presses.
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
};

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
  return {
    steer,
    throttle: clamp01(deadzone(throttle, TRIGGER_FLOOR)),
    brake: clamp01(deadzone(brake, TRIGGER_FLOOR)),
    handbrake: actionValue(frames, bindings, "handbrake") >= PRESS,
    steerStep: right - left,
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
];

export type PadReader = {
  /** Fold this frame's pads in: the holds to apply, and the presses that
   * happened between the last call and this one. */
  read: (frames: PadFrame[]) => { hold: PadHold; pressed: PadAction[] };
  /** Re-point the pad at its actions. Whatever was down is forgotten, or an
   * action rebound with a button held would never see that button rise and
   * would refuse to fire for the rest of the session. */
  setBindings: (bindings: PadBindings) => void;
  /** Drop every held edge — used when the pad is taken away from the car
   * (god mode, a menu, a disconnect) so nothing arrives late. */
  release: () => void;
};

export const NEUTRAL_HOLD: PadHold = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  steerStep: 0,
};

export function createPadReader(bindings: PadBindings): PadReader {
  let current = bindings;
  const down = new Set<PadAction>();
  return {
    read: (frames) => {
      const hold = frames.length === 0 ? NEUTRAL_HOLD : readPad(frames, current);
      const pressed: PadAction[] = [];
      for (const action of EDGE_ACTIONS) {
        const on = actionValue(frames, current, action) >= PRESS;
        if (on && !down.has(action)) pressed.push(action);
        if (on) down.add(action);
        else down.delete(action);
      }
      return { hold, pressed };
    },
    setBindings: (next) => {
      current = next;
      down.clear();
    },
    release: () => down.clear(),
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
