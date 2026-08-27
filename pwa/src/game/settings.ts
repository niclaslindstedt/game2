// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options — what the HUD shows, how hard the renderer works,
// and how the car is driven — in one persisted blob, plus the device probe
// that decides which control sections are worth showing at all.
//
// Everything here is SCREEN-space and app-side: the engine neither knows
// nor cares. The renderer reads `VideoSettings`, the HUD reads
// `HudSettings`, input.ts reads the key bindings, and the audio bus reads
// `AudioSettings`.

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
  "minimap" | "pacenotes" | "pacenoteText" | "damage" | "tachometer" | "wind" | "boost" | "timer";

export type HudSettings = Record<HudToggle, boolean>;

/** The HUD parts a player may switch off, with what each one costs them.
 * Speed, gear and the countdown are not here: a rally game with no speedo
 * is a different game, and the countdown is the start line itself. */
export const HUD_TOGGLES: { id: HudToggle; label: string; hint: string }[] = [
  { id: "minimap", label: "MINIMAP", hint: "Route, position and progress" },
  { id: "pacenotes", label: "PACENOTES", hint: "The co-driver's corner calls" },
  {
    id: "pacenoteText",
    label: "PACENOTE WORDS",
    hint: "Off leaves the corner arrows alone, nothing to read",
  },
  { id: "damage", label: "DAMAGE", hint: "Crush, broken parts, systems" },
  { id: "tachometer", label: "TACHOMETER", hint: "Revs and the shift light" },
  { id: "boost", label: "BOOST TANK", hint: "How much booster is left" },
  { id: "wind", label: "WIND", hint: "Strength and bearing" },
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
  | "boost"
  | "shiftUp"
  | "shiftDown"
  | "reset"
  | "camera"
  | "restart"
  | "menu"
  | "pause";

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
  { id: "boost", label: "BOOST" },
  { id: "shiftUp", label: "SHIFT UP" },
  { id: "shiftDown", label: "SHIFT DOWN" },
  { id: "reset", label: "BACK TO TRACK" },
  { id: "camera", label: "CAMERA" },
  { id: "restart", label: "RESTART STAGE" },
  { id: "menu", label: "MAIN MENU" },
  { id: "pause", label: "PAUSE" },
];

export const DEFAULT_KEYS: KeyBindings = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  handbrake: ["Space"],
  boost: ["ShiftLeft"],
  shiftUp: ["KeyE", "KeyX", "ShiftRight"],
  shiftDown: ["KeyQ", "KeyZ", "ControlRight"],
  reset: ["KeyB"],
  camera: ["KeyV"],
  restart: ["KeyR"],
  menu: ["KeyC"],
  pause: ["Escape"],
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
  boost: PedalDir;
};

/** Brake is DOWN because that is what the gesture already means: a thumb
 * pulled back toward the player is the car being reined in, the same way a
 * thumb pushed away is the car sent forward. Boost takes the push. */
export const DEFAULT_TOUCH: TouchSettings = {
  steerSide: "left",
  brake: "down",
  boost: "up",
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
  /** True once the developer menu has been let out — see DEV_TAPS. It stays
   * out: a player who found it deliberately does not want to find it again
   * every time they open the game. */
  developer: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  hud: {
    minimap: true,
    pacenotes: true,
    pacenoteText: true,
    damage: true,
    tachometer: true,
    wind: true,
    boost: true,
    timer: true,
  },
  camera: "chase",
  // Defaults with headroom on both: the engine bed and the score sum into
  // one limiter, and a game that arrives at full scale has nowhere to go but
  // down. Music sits under the effects, because the effects are what the
  // player is actually driving on.
  audio: { music: 0.7, sfx: 0.9 },
  video: { resolution: "medium", drawDistance: "normal", effects: "full", flora: "normal" },
  keys: DEFAULT_KEYS,
  touch: DEFAULT_TOUCH,
  developer: false,
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
/** The pedal gestures shipped with brake on the push and boost on the pull,
 * which is backwards: pulling the thumb back is what reining a car in feels
 * like. Every player who has ever opened OPTIONS has the old pair stored,
 * and they did not choose it — a default is not a preference. So exactly
 * that pair, and only it, is turned round on load; any other arrangement is
 * a real choice and is left alone. */
function migratePedalDirs(touch: TouchSettings): void {
  if (touch.brake === "up" && touch.boost === "down") {
    touch.brake = "down";
    touch.boost = "up";
  }
}

export function loadSettings(): Settings {
  const settings: Settings = {
    hud: { ...DEFAULT_SETTINGS.hud },
    camera: DEFAULT_SETTINGS.camera,
    audio: { ...DEFAULT_SETTINGS.audio },
    video: { ...DEFAULT_SETTINGS.video },
    keys: { ...DEFAULT_SETTINGS.keys },
    touch: { ...DEFAULT_SETTINGS.touch },
    developer: false,
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
    migratePedalDirs(settings.touch);
    if (parsed.developer === true) settings.developer = true;
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
  action: "brake" | "handbrake" | "boost",
  dir: PedalDir,
): TouchSettings {
  const next = { ...touch };
  const clash = (["brake", "handbrake", "boost"] as const).find(
    (a) => a !== action && next[a] === dir,
  );
  if (clash) next[clash] = touch[action];
  next[action] = dir;
  return next;
}

/** Which control sections are worth showing. A desktop has no thumbs to
 * assign and a phone has no keys to rebind, so each surface only offers
 * what the device it is running on can actually use — a laptop with a
 * touchscreen reports both and gets both. */
export function deviceControls(): { keyboard: boolean; touch: boolean } {
  if (typeof window === "undefined") return { keyboard: true, touch: false };
  const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  const keyboard = !touch || matchMedia("(pointer: fine)").matches;
  return { keyboard, touch };
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
