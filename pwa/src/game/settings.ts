// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options — what the HUD shows, how hard the renderer works,
// and how the car is driven — in one persisted blob, plus the device probe
// that decides which control sections are worth showing at all.
//
// Almost everything here is SCREEN-space and app-side: the engine neither
// knows nor cares. The one exception is the gearbox, which the engine does
// read — it is a choice about how the car is DRIVEN rather than how it is
// drawn, and it is offered for every car in the roster. The renderer reads `VideoSettings`, the HUD reads
// `HudSettings`, input.ts reads the key bindings, and the audio bus reads
// `AudioSettings`.

import type { GearboxMode } from "@engine";

/** Where the camera watches the car from, inside out. This is both the
 * order the camera key walks and the order the options screen lists, and
 * every entry is a mode the car can be DRIVEN from — the menu's drone and
 * the Roam map are placed by the app and are not offered here. The
 * geometry behind each name lives in camera.ts (the three inside the car in
 * camera-eye.ts); this is the vocabulary the player picks from. */
export type PlayCamera = "cockpit" | "hood" | "bumper" | "close" | "chase" | "far" | "heli" | "top";

export const PLAY_CAMERAS: { id: PlayCamera; label: string; hint: string }[] = [
  { id: "cockpit", label: "COCKPIT", hint: "Behind the wheel — dials, rim and screen pillars" },
  { id: "hood", label: "HOOD", hint: "From the seat, over your own bonnet" },
  { id: "bumper", label: "BUMPER", hint: "Down at the nose — no bodywork, just road" },
  { id: "close", label: "CLOSE", hint: "Tight behind the bumper, low and fast" },
  { id: "chase", label: "CHASE", hint: "The arcade rally view: roof height, close behind" },
  { id: "far", label: "FAR", hint: "Stood back — more road, more warning" },
  { id: "heli", label: "HELI", hint: "High and behind, as if flown from a drone" },
  { id: "top", label: "TOP", hint: "Straight over the roof, tilted down the road" },
];

/** The three views taken from inside the car — the ones OPTIONS ▸ VIEW's
 * seat, lens and head-motion settings apply to. Nothing outside the car has
 * a seat to raise or a head to steady. */
export const IN_CAR_CAMERAS: PlayCamera[] = ["cockpit", "hood", "bumper"];

/** THE IN-CAR VIEW, AS FOUR KNOBS. Every one of them is a ladder of named
 * stops rather than a slider, for the same reason the volumes are: a value
 * nobody can quite reproduce is worse than one they can name, and these are
 * numbers a player will want to come back to.
 *
 * They are also the tuning surface this view is DEVELOPED against — the
 * tooling sweeps the same four from the URL (`?seat=`, `?reach=`, `?vfov=`,
 * `?headmotion=`), so a contact sheet of variants costs a loop rather than
 * a rebuild. */
export type ViewSettings = {
  /** Seat height over the car's own mount, m. */
  seat: number;
  /** Seat reach toward the nose, m. */
  reach: number;
  /** Added to whichever in-car view's design field of view, deg. */
  fov: number;
  /** How much the driver's head moves at all, as a scale on the neck's
   * travel, the road grain, the impact jolt and the wobble together. */
  headMotion: number;
};

/** The seat ladder stops at HIGH. The screen aperture is fixed and the eye
 * walks up it, so a stop above this one puts the header rail across the apex
 * of every corner — a seat setting that costs the player the road is not a
 * setting, it is a trap with a name on it. */
export const SEAT_STOPS: { id: string; label: string; value: number }[] = [
  { id: "low", label: "LOW", value: -0.05 },
  { id: "mid", label: "MID", value: 0 },
  { id: "high", label: "HIGH", value: 0.05 },
];

export const REACH_STOPS: { id: string; label: string; value: number }[] = [
  { id: "back", label: "BACK", value: -0.08 },
  { id: "mid", label: "MID", value: 0 },
  { id: "fwd", label: "FORWARD", value: 0.08 },
];

/** The lens ladder stops at WIDE. Past that the cabin this view is framed by
 * stops being the frame — the pillars fold out to the edges, the fascia
 * flattens, and what is left is a wide-angle plate of road with a car drawn
 * round the outside of it. */
export const FOV_STOPS: { id: string; label: string; value: number }[] = [
  { id: "narrow", label: "NARROW", value: -8 },
  { id: "standard", label: "STANDARD", value: 0 },
  { id: "wide", label: "WIDE", value: 8 },
];

/** OFF is a real stop, not the bottom of a ramp: a bolted lens is the right
 * answer for anybody the motion makes ill, and it has to be reachable. */
export const HEAD_STOPS: { id: string; label: string; value: number }[] = [
  { id: "off", label: "OFF", value: 0 },
  { id: "light", label: "LIGHT", value: 0.55 },
  { id: "standard", label: "STANDARD", value: 1 },
  { id: "heavy", label: "HEAVY", value: 1.5 },
];

/** The stop nearest a stored value — a build that moves a ladder must still
 * show something sensible for a choice made on the old one. */
export function nearestStop(stops: { id: string; value: number }[], value: number): string {
  let best = stops[0];
  for (const stop of stops) {
    if (Math.abs(stop.value - value) < Math.abs(best.value - value)) best = stop;
  }
  return best.id;
}

/** A stored knob, put back on its ladder. `nearestStop` is what the menu
 * highlights with; this is what the camera is actually given, and the two
 * must not be allowed to disagree — a build that drops a stop otherwise
 * leaves the player driving on a number no button on the page can restore.
 * Anything that is not a number at all was never a choice, so it keeps the
 * default rather than being rounded to the bottom of the ladder. */
function snapToStop(
  stops: { id: string; value: number }[],
  stored: unknown,
  fallback: number,
): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return fallback;
  const id = nearestStop(stops, stored);
  return stops.find((stop) => stop.id === id)?.value ?? fallback;
}

export type HudToggle =
  | "minimap"
  | "mirror"
  | "nameTags"
  | "cameraButton"
  | "pacenotes"
  | "pacenoteText"
  | "damage"
  | "tachometer"
  | "timer";

export type HudSettings = Record<HudToggle, boolean>;

/** The HUD parts a player may switch off, with what each one costs them.
 * Speed, gear and the countdown are not here: a rally game with no speedo
 * is a different game, and the countdown is the start line itself. */
export const HUD_TOGGLES: { id: HudToggle; label: string; hint: string }[] = [
  { id: "minimap", label: "MINIMAP", hint: "Route, position and progress" },
  { id: "mirror", label: "REAR VIEW", hint: "The road behind, from the car, in every view" },
  { id: "nameTags", label: "NAME TAGS", hint: "Who the other cars on the road are" },
  {
    id: "cameraButton",
    label: "CAMERA BUTTON",
    hint: "The on-screen view switch (the key still works)",
  },
  { id: "pacenotes", label: "PACENOTES", hint: "The co-driver's corner calls" },
  {
    id: "pacenoteText",
    label: "PACENOTE WORDS",
    hint: "Off leaves the corner arrows alone, nothing to read",
  },
  { id: "damage", label: "DAMAGE", hint: "Crush, broken parts, systems" },
  { id: "tachometer", label: "TACHOMETER", hint: "Revs and the shift light" },
  { id: "timer", label: "STAGE CLOCK", hint: "Running time on the top bar" },
];

/** The two faders. Kept apart because they are two different jobs: the
 * effects are information the player needs to drive, and the music is the
 * room it happens in — plenty of people want one without the other. */
export type AudioSettings = {
  /** 0–1 master for the score. */
  music: number;
  /** 0–1 master for every sound effect, the engine bed included. */
  sfx: number;
};

export type VideoSettings = {
  /** Pixel-ratio ceiling — the single biggest lever on a weak GPU. */
  resolution: "low" | "medium" | "high";
  /** How far the fog lets you see, and how far the camera draws. */
  drawDistance: "near" | "normal" | "far";
  /** Particles, rain and the ambient life — the transient FX budget. */
  effects: "off" | "low" | "full";
  /** HOW MUCH OF A CAR IS BUILT for the sake of what is only visible up
   * close — the two things behind and on the glass, on one ladder because
   * they are one judgement: how much does a car you are looking AT deserve.
   *
   * The cabin: `off` leaves the windows solid the way they used to be — the
   * cheapest car, and the only level that costs no extra draw call per car
   * on the road. `low` furnishes the read: the trim, the dash, the seats and
   * the crew sat in them. `full` adds the roll cage, the harnesses and a
   * steering wheel that turns with the front tyres.
   *
   * The grime film the wipers clear (`SCREEN_GRIME`) rides along: `off`
   * leaves every screen permanently clean, and both levels above it wet the
   * whole road's glass — a rival's at a resolution that costs 48 triangles
   * rather than 3,456, which is what makes giving it to a whole grid
   * affordable at all.
   *
   * Applies to the NEXT stage built, like the undergrowth: both are
   * geometry, and geometry is decided when a car is made. */
  interior: "off" | "low" | "full";
  /** How thickly the world is planted with the SOFT stuff — undergrowth,
   * shrubs, stumps. Applies to the NEXT stage built. Named UNDERGROWTH in
   * the menu, not FOREST: the forest's own density is a generator dial the
   * player sets per stage, and this one never touches it. */
  flora: "sparse" | "normal" | "lush";
  /** How much LOOSE STONE the ground is scattered with — the chippings
   * spilled across the road's edge that make it run out into the country
   * instead of ending at a line (R16, road-spill.ts), and the cobbles out in
   * the field beyond them. Its own row rather than a share of UNDERGROWTH
   * because it is the one detail setting that is not decoration: what it
   * thins is the transition at the road's edge, which is the thing a driver
   * looks straight down for a whole stage. Thousands of small instances, so
   * it is also the row with the most frames in it after RESOLUTION. Applies
   * to the NEXT stage built, like the undergrowth. */
  ground: "plain" | "normal" | "rich";
};

/** Pixel-ratio ceilings. Below 1 the canvas renders smaller than the screen
 * and is scaled up — blurry, and the difference between a phone that holds
 * 60 fps and one that does not. */
export const RESOLUTION_SCALE: Record<VideoSettings["resolution"], number> = {
  low: 0.65,
  medium: 1,
  high: 2,
};

/** Multipliers on the environment preset's fog distances and the camera's
 * far plane. Pulling the fog in is what stops a weak device from drawing
 * half a stage it cannot see through anyway. */
export const DRAW_DISTANCE_SCALE: Record<VideoSettings["drawDistance"], number> = {
  near: 0.6,
  normal: 1,
  far: 1.45,
};

/** Particle-count and spawn-rate multiplier per effects level; `off` also
 * takes the rain and the ambient life out entirely. */
export const EFFECTS_SCALE: Record<VideoSettings["effects"], number> = {
  off: 0,
  low: 0.45,
  full: 1,
};

/** The player's option, as the detail level car-body.ts builds against. The
 * two are not one enum because the setting lives in a module the menus load
 * and the level lives in one that imports three.js. */
export const INTERIOR_DETAIL: Record<VideoSettings["interior"], "off" | "low" | "high"> = {
  off: "off",
  low: "low",
  full: "high",
};

/** Whether the road's glass gets dirty at all, off the same row. How FINELY
 * any one screen carries it is not this setting's business — that is decided
 * per car by whose it is (`FilmDetail`), because the car being driven is
 * read through and every other one is read at range. */
export const SCREEN_GRIME: Record<VideoSettings["interior"], boolean> = {
  off: false,
  low: true,
  full: true,
};

/** Flora density multiplier — the scatter chance for everything the world
 * plants that the physics does not collide with. The engine's own trunk
 * field is never thinned: those are solid, and a tree you can hit but
 * cannot see is the worst bug this setting could buy. */
export const FLORA_SCALE: Record<VideoSettings["flora"], number> = {
  sparse: 0.4,
  normal: 1,
  lush: 1.5,
};

/** Loose-stone density multiplier — the road's spill and the litter beyond
 * it. `plain` is a third rather than nothing: the road's edge still has to
 * TRANSITION at every setting, because a hard line between gravel and grass
 * is a defect and not a level of detail. Everything this scales is a few
 * centimetres tall and drives straight over, so thinning it can never
 * change what a car hits. */
export const GROUND_SCALE: Record<VideoSettings["ground"], number> = {
  plain: 0.33,
  normal: 1,
  rich: 1.6,
};

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
  reset: ["KeyB"],
  camera: ["KeyC", "KeyV"],
  restart: ["KeyR"],
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
 * The last four are the MENUS, not the car: a pad has to be able to walk a
 * card and press what it lands on, or half the game is unreachable on a
 * handheld. `steerLeft`/`steerRight` move the cursor sideways in a menu —
 * the same d-pad, doing the thing that d-pad means — so only up and down
 * need names of their own. */
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

/** The rows on the CONTROLS tab, in the order they are printed: the car
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
 * In a menu the same buttons mean menu things: A selects, B goes back, and
 * the d-pad and stick walk the card.
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

/** The deadzone's stops, as fractions of full stick travel. */
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
 * anywhere already means. */
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

export type Settings = {
  hud: HudSettings;
  /** The camera a run OPENS on. The camera key still walks the whole
   * ladder from wherever the run started; this only decides where it
   * starts, because a player who drives from the hood should not have to
   * press V four times at every start line. */
  camera: PlayCamera;
  /** Seat, lens and head motion for the three views taken from inside the
   * car. One set for all three: a player who wants to sit high and see wide
   * wants it in the cockpit and over the bonnet alike, and each view's own
   * row in camera-eye.ts is what makes the same offsets read differently. */
  view: ViewSettings;
  audio: AudioSettings;
  video: VideoSettings;
  keys: KeyBindings;
  touch: TouchSettings;
  /** The controller: what its buttons do, and what its presence does to the
   * touch controls. Separate from `keys` because a pad is not a keyboard —
   * its pedals are analogue and its stick is an axis, and both are things a
   * key cannot be. */
  pad: PadSettings;
  /** Which box the driver wants, for EVERY car. It is a preference about
   * how much of the car you want to be responsible for, not a property of
   * any one of them, so it lives here rather than in the catalog. */
  gearbox: GearboxMode;
  /** Whether the SCREENSHOT key and the HUD's shutter take pictures at
   * all. On by default — the feature is the point of having it — and off
   * is for a player who keeps hitting ENTER by accident, or who would
   * rather their own device's screenshot key were the only camera in the
   * room. Off leaves the gallery reachable: the pictures already in the
   * roll are still theirs to look at, copy and share. */
  screenshots: boolean;
  /** True once the developer menu has been let out — see DEV_TAPS. It stays
   * out: a player who found it deliberately does not want to find it again
   * every time they open the game. */
  developer: boolean;
  /** The developer tools themselves — only reachable once `developer` is
   * true, and only ever switched on deliberately. */
  dev: DevSettings;
};

/** The two developer tools, and what each one is FOR.
 *
 * Both exist to make a problem somebody saw reproducible by somebody else:
 * god mode puts the camera anywhere on the stage, and the debug overlay
 * writes down exactly where "anywhere" was, in the form a URL can carry.
 * That pair is the whole loop — fly to the bad spot, screenshot it, and the
 * boxes in the corner of that screenshot are enough to put anyone else on
 * the same square metre of road. */
export type DevSettings = {
  /** The debug overlay: the boxes naming the stage, the place, the camera
   * and the car, plus the repro line that reproduces the frame. Stays on
   * screen while ALT hides the rest of the HUD — a screenshot with the HUD
   * out of the way still has to say where it was taken. */
  debug: boolean;
  /** God mode: the camera comes off the car and flies, and the car is handed
   * neutral input so it sits where it was left. */
  god: boolean;
  /** COLLECT RACE DATA: write every run down as the controls that drove it,
   * and offer the file at the finish (game/run-tape.ts). Separate from the
   * overlay on purpose — a drive collected for calibration should not have
   * to be driven with debug boxes across it. */
  record: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  hud: {
    minimap: true,
    mirror: true,
    nameTags: true,
    cameraButton: true,
    pacenotes: true,
    pacenoteText: true,
    damage: true,
    tachometer: true,
    timer: true,
  },
  // The shortest boom outside the car: the car is big in the frame, a drift
  // swings it right across, and standing that close is what makes it
  // the calmest read at pace — the nearer the camera, the fewer metres of
  // world a given lag in the follow drags across the frame. A player who
  // has not chosen a view gets the one that asks least of them; the ladder
  // runs both ways from here, one press of the camera key at a time.
  camera: "close",
  view: { seat: 0, reach: 0, fov: 0, headMotion: 1 },
  // Defaults with headroom on both: the engine bed and the score sum into
  // one limiter, and a game that arrives at full scale has nowhere to go but
  // down. Music sits under the effects, because the effects are what the
  // player is actually driving on.
  audio: { music: 0.7, sfx: 0.9 },
  video: {
    resolution: "medium",
    drawDistance: "normal",
    effects: "full",
    flora: "normal",
    ground: "normal",
    interior: "full",
  },
  keys: DEFAULT_KEYS,
  touch: DEFAULT_TOUCH,
  pad: DEFAULT_PAD,
  // The automatic: a player who has not chosen has not asked to be given
  // something else to manage while the road is coming at them.
  gearbox: "auto",
  screenshots: true,
  developer: false,
  dev: { debug: false, god: false, record: false },
};

/** Taps on the car's chassis that let the developer menu out, and how long
 * a tap waits for the next one before the count starts over. Seven is far
 * past anything a player does by accident, and the window is short enough
 * that it has to be deliberate drumming rather than idle poking. */
export const DEV_TAPS = 7;
export const DEV_TAP_WINDOW_MS = 700;

const SETTINGS_KEY = "scandi-flick-options";

/** Merge stored options over the defaults one group at a time, so a build
 * that adds a toggle keeps every choice already made around it. */
/** The pedal gestures shipped with the brake on the PUSH, which is
 * backwards: pulling the thumb back is what reining a car in feels like.
 * Every player who has ever opened OPTIONS has that stored, and they did not
 * choose it — a default is not a preference. So exactly the arrangement that
 * shipped is turned round on load; any other one is a real choice and is left
 * alone. `boost` is a gesture the pedal no longer has: its stored key serves
 * only to identify that shipped arrangement, and is dropped rather than
 * written back out. */
function migratePedalDirs(touch: TouchSettings & { boost?: PedalDir }): void {
  if (touch.brake === "up" && touch.boost === "down") touch.brake = "down";
  delete touch.boost;
}

/** C used to be the way OUT of a run and V the way round the cameras, which
 * had the letter that names the thing sitting on the thing it does not do.
 * The camera moved onto C (V still works) and the menu onto M. As with the
 * pedals, a default is not a preference: exactly the old pair, and only it,
 * is moved across on load — a player who bound either key themselves keeps
 * what they chose. */
function migrateCameraKey(keys: KeyBindings): void {
  const only = (codes: string[], code: string): boolean => codes.length === 1 && codes[0] === code;
  if (!only(keys.camera, "KeyV") || !only(keys.menu, "KeyC")) return;
  keys.camera = [...DEFAULT_KEYS.camera];
  keys.menu = [...DEFAULT_KEYS.menu];
}

/** A pad settings blob nothing else shares a reference with. The bindings
 * are nested two deep, so the spread every other group is cloned with would
 * hand the defaults' own source lists to the live settings — and rebinding
 * one action would then silently rewrite what RESET PAD restores. */
export function clonePad(pad: PadSettings): PadSettings {
  const sources = {} as Record<PadAction, PadSource[]>;
  for (const action of PAD_ACTIONS) sources[action.id] = [...pad.bindings.sources[action.id]];
  return { ...pad, bindings: { ...pad.bindings, sources } };
}

/** Merge a stored pad blob over the defaults, action by action, so a build
 * that adds a pad action keeps every binding already made around it — and a
 * stored source list that is not a list of sources is dropped rather than
 * handed to the reader. */
function mergePad(pad: PadSettings, stored: Partial<PadSettings>): void {
  if (typeof stored.enabled === "boolean") pad.enabled = stored.enabled;
  if (typeof stored.hideTouch === "boolean") pad.hideTouch = stored.hideTouch;
  const bindings = stored.bindings;
  if (!bindings) return;
  if (Number.isInteger(bindings.steerAxis)) pad.bindings.steerAxis = bindings.steerAxis;
  if (typeof bindings.steerInvert === "boolean") pad.bindings.steerInvert = bindings.steerInvert;
  if (Number.isFinite(bindings.deadzone)) {
    pad.bindings.deadzone = Math.min(0.5, Math.max(0, bindings.deadzone));
  }
  const sources = bindings.sources;
  if (!sources) return;
  for (const action of PAD_ACTIONS) {
    const list = sources[action.id];
    if (Array.isArray(list)) pad.bindings.sources[action.id] = list.filter(isSource);
  }
}

function isSource(value: unknown): value is PadSource {
  if (!value || typeof value !== "object") return false;
  const source = value as PadSource;
  if (!Number.isInteger(source.index) || source.index < 0) return false;
  if (source.kind === "button") return true;
  return source.kind === "axis" && (source.dir === 1 || source.dir === -1);
}

export function loadSettings(): Settings {
  const settings: Settings = {
    hud: { ...DEFAULT_SETTINGS.hud },
    camera: DEFAULT_SETTINGS.camera,
    view: { ...DEFAULT_SETTINGS.view },
    audio: { ...DEFAULT_SETTINGS.audio },
    video: { ...DEFAULT_SETTINGS.video },
    keys: { ...DEFAULT_SETTINGS.keys },
    touch: { ...DEFAULT_SETTINGS.touch },
    pad: clonePad(DEFAULT_PAD),
    gearbox: DEFAULT_SETTINGS.gearbox,
    screenshots: DEFAULT_SETTINGS.screenshots,
    developer: false,
    dev: { ...DEFAULT_SETTINGS.dev },
  };
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return settings;
    const parsed = JSON.parse(stored) as Partial<Settings>;
    if (parsed.hud) Object.assign(settings.hud, parsed.hud);
    // Checked against the list rather than merged: a build that renames or
    // drops an angle must not leave the player pointed at one that no
    // longer exists, which would be a run with no camera at all.
    if (PLAY_CAMERAS.some((cam) => cam.id === parsed.camera)) {
      settings.camera = parsed.camera as PlayCamera;
    }
    // Snapped to the ladders rather than merged raw, for the same reason the
    // camera above is checked against its list: the four are stops, not a
    // slider, so a value off the ladder is a view the player cannot get back
    // to once they have moved away from it.
    if (parsed.view) {
      const view = parsed.view as Partial<Record<keyof ViewSettings, unknown>>;
      const base = DEFAULT_SETTINGS.view;
      settings.view.seat = snapToStop(SEAT_STOPS, view.seat, base.seat);
      settings.view.reach = snapToStop(REACH_STOPS, view.reach, base.reach);
      settings.view.fov = snapToStop(FOV_STOPS, view.fov, base.fov);
      settings.view.headMotion = snapToStop(HEAD_STOPS, view.headMotion, base.headMotion);
    }
    if (parsed.audio) Object.assign(settings.audio, parsed.audio);
    if (parsed.video) Object.assign(settings.video, parsed.video);
    if (parsed.keys) Object.assign(settings.keys, parsed.keys);
    if (parsed.touch) Object.assign(settings.touch, parsed.touch);
    if (parsed.pad) mergePad(settings.pad, parsed.pad);
    migrateCameraKey(settings.keys);
    migratePedalDirs(settings.touch);
    if (parsed.gearbox === "manual") settings.gearbox = "manual";
    if (parsed.screenshots === false) settings.screenshots = false;
    if (parsed.developer === true) settings.developer = true;
    if (parsed.dev) Object.assign(settings.dev, parsed.dev);
    // A tool nobody can reach is a tool nobody can switch off: if the menu
    // that owns these was never let out, neither of them is on.
    if (!settings.developer) settings.dev = { ...DEFAULT_SETTINGS.dev };
  } catch {
    /* storage unavailable — the defaults are a perfectly good game */
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — the choice still applies to this session */
  }
}

/** Assigning a pedal gesture SWAPS rather than duplicates: two actions on
 * one direction would make one of them unreachable, and a settings screen
 * that can lock the handbrake away is worse than one that cannot. */
export function assignPedalDir(
  touch: TouchSettings,
  action: "brake" | "handbrake",
  dir: PedalDir,
): TouchSettings {
  const next = { ...touch };
  const clash = (["brake", "handbrake"] as const).find((a) => a !== action && next[a] === dir);
  if (clash) next[clash] = touch[action];
  next[action] = dir;
  return next;
}

/** A `KeyboardEvent.code` as a player reads it on their keyboard. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5).toUpperCase()} ARROW`;
  if (code === "Space") return "SPACE";
  if (code === "ShiftLeft") return "L SHIFT";
  if (code === "ShiftRight") return "R SHIFT";
  if (code === "ControlLeft") return "L CTRL";
  if (code === "ControlRight") return "R CTRL";
  if (code === "AltLeft") return "L ALT";
  if (code === "AltRight") return "R ALT";
  return code.toUpperCase();
}
