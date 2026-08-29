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
 * geometry behind each name lives in camera.ts; this is the vocabulary the
 * player picks from. */
export type PlayCamera = "hood" | "close" | "chase" | "far" | "heli" | "top";

export const PLAY_CAMERAS: { id: PlayCamera; label: string; hint: string }[] = [
  { id: "hood", label: "HOOD", hint: "From the seat, over your own bonnet" },
  { id: "close", label: "CLOSE", hint: "Tight behind the bumper, low and fast" },
  { id: "chase", label: "CHASE", hint: "The arcade rally view: roof height, close behind" },
  { id: "far", label: "FAR", hint: "Stood back — more road, more warning" },
  { id: "heli", label: "HELI", hint: "High and behind, as if flown from a drone" },
  { id: "top", label: "TOP", hint: "Straight over the roof, tilted down the road" },
];

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
  /** How much CABIN is built behind the glass. `off` leaves the windows
   * solid the way they used to be — the cheapest car, and the only level
   * that costs no extra draw call per car on the road. `low` furnishes the
   * read: the trim, the dash, the seats and the crew sat in them. `full`
   * adds the roll cage, the harnesses and a steering wheel that turns with
   * the front tyres. Applies to the NEXT stage built, like the undergrowth:
   * a cabin is geometry, and geometry is decided when a car is made. */
  interior: "off" | "low" | "full";
  /** How thickly the world is planted with the SOFT stuff — undergrowth,
   * shrubs, stumps. Applies to the NEXT stage built. Named UNDERGROWTH in
   * the menu, not FOREST: the forest's own density is a generator dial the
   * player sets per stage, and this one never touches it. */
  flora: "sparse" | "normal" | "lush";
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

/** Flora density multiplier — the scatter chance for everything the world
 * plants that the physics does not collide with. The engine's own trunk
 * field is never thinned: those are solid, and a tree you can hit but
 * cannot see is the worst bug this setting could buy. */
export const FLORA_SCALE: Record<VideoSettings["flora"], number> = {
  sparse: 0.4,
  normal: 1,
  lush: 1.5,
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
  audio: AudioSettings;
  video: VideoSettings;
  keys: KeyBindings;
  touch: TouchSettings;
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
    interior: "full",
  },
  keys: DEFAULT_KEYS,
  touch: DEFAULT_TOUCH,
  // The automatic: a player who has not chosen has not asked to be given
  // something else to manage while the road is coming at them.
  gearbox: "auto",
  screenshots: true,
  developer: false,
  dev: { debug: false, god: false },
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

export function loadSettings(): Settings {
  const settings: Settings = {
    hud: { ...DEFAULT_SETTINGS.hud },
    camera: DEFAULT_SETTINGS.camera,
    audio: { ...DEFAULT_SETTINGS.audio },
    video: { ...DEFAULT_SETTINGS.video },
    keys: { ...DEFAULT_SETTINGS.keys },
    touch: { ...DEFAULT_SETTINGS.touch },
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
    if (parsed.audio) Object.assign(settings.audio, parsed.audio);
    if (parsed.video) Object.assign(settings.video, parsed.video);
    if (parsed.keys) Object.assign(settings.keys, parsed.keys);
    if (parsed.touch) Object.assign(settings.touch, parsed.touch);
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
