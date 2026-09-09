// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE PLAYER PRESSES: every action the game can be given, the keys
// bound to each by default, the gamepad's sources and the labels they are
// shown under, and the touch layout. Data only — reading a device is
// `input.ts`'s.

/** Everything the keyboard can be asked to do. `menu` leaves the run for
 * the main menu; `pause` opens the in-race card. */
export type KeyAction =
  | "left"
  | "right"
  | "throttle"
  | "brake"
  | "handbrake"
  | "shiftUp"
  | "shiftDown"
  | "reset"
  | "camera"
  | "restart"
  | "menu"
  | "pause"
  | "screenshot";

/** Bound `KeyboardEvent.code` values per action — a list, because the
 * defaults ship the arrow keys and WASD side by side. Rebinding an action
 * replaces its whole list with the one key that was pressed. */
export type KeyBindings = Record<KeyAction, string[]>;

export const KEY_ACTIONS: { id: KeyAction; label: string }[] = [
  { id: "throttle", label: "THROTTLE" },
  { id: "brake", label: "BRAKE" },
  { id: "left", label: "STEER LEFT" },
  { id: "right", label: "STEER RIGHT" },
  { id: "handbrake", label: "HANDBRAKE" },
  { id: "shiftUp", label: "SHIFT UP" },
  { id: "shiftDown", label: "SHIFT DOWN" },
  { id: "reset", label: "BACK TO TRACK" },
  { id: "camera", label: "CAMERA" },
  { id: "restart", label: "RESTART STAGE" },
  { id: "menu", label: "MAIN MENU" },
  { id: "pause", label: "PAUSE" },
  { id: "screenshot", label: "SCREENSHOT" },
];

export const DEFAULT_KEYS: KeyBindings = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  handbrake: ["Space"],
  shiftUp: ["KeyE", "KeyX", "ShiftRight"],
  shiftDown: ["KeyQ", "KeyZ", "ControlRight"],
  // R for the one of these two a driver reaches for MID-STAGE: the car is
  // in a ditch, or on its roof, and the run wants putting back on the road
  // at the last board. Restarting the whole stage is the rarer press and
  // the more expensive one to make by accident, so it takes the key this
  // one vacated rather than sharing a hand with it.
  reset: ["KeyR"],
  camera: ["KeyC", "KeyV"],
  restart: ["KeyB"],
  menu: ["KeyM"],
  pause: ["Escape"],
  // ENTER, because it is the one key on a driving keyboard that nothing
  // else on the road wants: the pedals are the arrows and WASD, the gears
  // and the camera are letters around them, and ESCAPE is the pause card.
  screenshot: ["Enter"],
};

/** Where a pad action reads from. A button index under the browser's
 * gamepad mapping, or an axis and the direction along it that counts as
 * pressed — the shoulder triggers are buttons under the W3C standard
 * mapping and axes on plenty of Android controllers, so an action has to be
 * able to name either. */
export type PadSource =
  { kind: "button"; index: number } | { kind: "axis"; index: number; dir: 1 | -1 };

/** Everything a controller can be asked to do. Steering is not here: a
 * stick is an AXIS and is bound as one (`steerAxis`), while `steerLeft` and
 * `steerRight` are the d-pad — a digital pair that rides the same ramp the
 * keyboard's arrows do.
 *
 * The last five are the MENUS, not the car: a pad has to be able to walk a
 * card and press what it lands on, or half the game is unreachable on a
 * handheld. `steerLeft`/`steerRight` move the cursor sideways in a menu —
 * the same d-pad, doing the thing that d-pad means — so only up and down
 * need names of their own. `next` is the odd one: it presses a surface's
 * way ON rather than whatever the cursor found, so START walks a player
 * from the front door to the green light without them choosing anything. */
export type PadAction =
  | "throttle"
  | "brake"
  | "handbrake"
  | "steerLeft"
  | "steerRight"
  | "shiftUp"
  | "shiftDown"
  | "reset"
  | "camera"
  | "restart"
  | "menu"
  | "pause"
  | "screenshot"
  | "confirm"
  | "back"
  | "next"
  | "navUp"
  | "navDown";

export type PadBindings = {
  /** Sources per action — a list, the way the keyboard's are, so one action
   * can answer to more than one thing on the pad. */
  sources: Record<PadAction, PadSource[]>;
  /** Which axis steers, and whether it reads backwards. */
  steerAxis: number;
  steerInvert: boolean;
  /** How far off centre the steering axis has to be before the car is asked
   * to turn. A worn stick rests off zero, and a car that steers itself down
   * every straight is worse than one that ignores the first few percent. */
  deadzone: number;
};

export type PadSettings = {
  bindings: PadBindings;
  /** Whether a connected pad drives at all. The escape hatch for a device
   * that reports itself as a gamepad and then holds an axis over: with this
   * off the pad is not read and nothing it does reaches the car. */
  enabled: boolean;
  /** Whether a connected pad takes the thumb zones off the screen. On by
   * default — a handheld running this as an installed PWA has the controls
   * in its hands, and the wheel and pedal under them are just glass in the
   * way of the road. */
  hideTouch: boolean;
};

/** The rows on the CONTROLLER page, in the order they are printed: the car
 * first, then the menus. */
export const PAD_ACTIONS: { id: PadAction; label: string; menu?: true }[] = [
  { id: "throttle", label: "THROTTLE" },
  { id: "brake", label: "BRAKE" },
  { id: "handbrake", label: "HANDBRAKE" },
  { id: "steerLeft", label: "STEER LEFT" },
  { id: "steerRight", label: "STEER RIGHT" },
  { id: "shiftUp", label: "SHIFT UP" },
  { id: "shiftDown", label: "SHIFT DOWN" },
  { id: "reset", label: "BACK TO TRACK" },
  { id: "camera", label: "CAMERA" },
  { id: "restart", label: "RESTART STAGE" },
  { id: "pause", label: "PAUSE" },
  { id: "screenshot", label: "SCREENSHOT" },
  { id: "menu", label: "MAIN MENU" },
  { id: "confirm", label: "MENU: SELECT", menu: true },
  { id: "back", label: "MENU: BACK", menu: true },
  { id: "next", label: "MENU: NEXT", menu: true },
  { id: "navUp", label: "MENU: UP", menu: true },
  { id: "navDown", label: "MENU: DOWN", menu: true },
];

const button = (index: number): PadSource[] => [{ kind: "button", index }];

/** The W3C standard mapping, laid out the way a driving game wants it: the
 * analogue triggers are the pedals (right gas, left brake, the pair that
 * makes a pad worth driving on at all), A is the handbrake under the thumb
 * that is already there, X switches the camera, the shoulders shift, and
 * SELECT — the button nothing on the road wants — takes the picture. The
 * d-pad steers for anyone who would rather not use the stick.
 *
 * In a menu the same buttons mean menu things: A selects, B goes back, the
 * d-pad and stick walk the card, and START — the same button that pauses a
 * run — is NEXT: it takes each screen's way on, so holding it down from the
 * front door lands on a start line without a single choice being made.
 *
 * TWO actions are deliberately unbound, and for the same reason in each
 * case — there is already a way to do it that cannot be done by accident:
 *
 * - RESTART, because throwing the stage away halfway down it is the one
 *   press on this pad that is not recoverable by pressing it again, and a
 *   face button that does it is one fumble from a ruined run.
 * - MAIN MENU, because PAUSE opens a card that has MAIN MENU on it. A
 *   button that walks straight out of a run, in the middle of the run, is
 *   the same fumble wearing a different hat.
 *
 * Both are in the list, so anyone who wants them can put them somewhere. */
export const DEFAULT_PAD: PadSettings = {
  bindings: {
    sources: {
      throttle: button(7),
      brake: button(6),
      handbrake: button(0),
      steerLeft: button(14),
      steerRight: button(15),
      shiftUp: button(5),
      shiftDown: button(4),
      reset: button(1),
      camera: button(2),
      restart: [],
      menu: [],
      pause: button(9),
      screenshot: button(8),
      confirm: button(0),
      back: button(1),
      next: button(9),
      navUp: button(12),
      navDown: button(13),
    },
    steerAxis: 0,
    steerInvert: false,
    deadzone: 0.15,
  },
  enabled: true,
  hideTouch: true,
};

/** The standard mapping's button names, in index order. A pad that reports
 * any other mapping gets numbers instead: the browser is telling us it does
 * not know what the buttons ARE, and a wrong name is worse than none. */
const STANDARD_BUTTONS = [
  "A",
  "B",
  "X",
  "Y",
  "L1",
  "R1",
  "L2",
  "R2",
  "SELECT",
  "START",
  "L3",
  "R3",
  "D-PAD UP",
  "D-PAD DOWN",
  "D-PAD LEFT",
  "D-PAD RIGHT",
  "HOME",
];

/** A pad source as the player reads it off the thing in their hands. */
export function padSourceLabel(source: PadSource, standard: boolean): string {
  if (source.kind === "axis") return `AXIS ${source.index}${source.dir < 0 ? "−" : "+"}`;
  const name = standard ? STANDARD_BUTTONS[source.index] : undefined;
  return name ?? `BUTTON ${source.index}`;
}

/** The steering axis as the player reads it. Axis 0 is the left stick on
 * every standard pad, and naming it is the difference between a row that
 * explains itself and one that says `AXIS 0`. */
export function padAxisLabel(axis: number, invert: boolean, standard: boolean): string {
  const named =
    standard && axis === 0 ? "LEFT STICK" : standard && axis === 2 ? "RIGHT STICK" : null;
  return `${named ?? `AXIS ${axis}`}${invert ? " (INVERTED)" : ""}`;
}

/** The deadzone's stops, as fractions of full stick travel. A knob the menu
 * no longer offers — the default suits every pad tried — kept as the ladder
 * for whoever wires a row back. */
export const PAD_DEADZONES: { id: string; label: string }[] = [
  { id: "0.05", label: "5%" },
  { id: "0.1", label: "10%" },
  { id: "0.15", label: "15%" },
  { id: "0.25", label: "25%" },
];

/** The four ways a thumb can drag off its anchor on the pedal zone. */
export type PedalDir = "up" | "down" | "left" | "right";
export const PEDAL_DIRS: { id: PedalDir; label: string }[] = [
  { id: "up", label: "UP" },
  { id: "down", label: "DOWN" },
  { id: "left", label: "LEFT" },
  { id: "right", label: "RIGHT" },
];

/** The touch layout: which half of the screen steers (the other half is the
 * pedal), and which drag direction off the pedal anchor does what. Plain
 * gas needs no direction — it is what a touch that has not been dragged
 * anywhere already means. Only the side reaches the menu; the gestures ship
 * as `DEFAULT_TOUCH` and `assignPedalDir` is the rule for changing them. */
export type TouchSettings = {
  steerSide: "left" | "right";
  brake: PedalDir;
  handbrake: PedalDir;
};

/** Brake is DOWN because that is what the gesture already means: a thumb
 * pulled back toward the player is the car being reined in, the same way a
 * thumb pushed away is the car sent forward. */
export const DEFAULT_TOUCH: TouchSettings = {
  steerSide: "left",
  brake: "down",
  handbrake: "right",
};
