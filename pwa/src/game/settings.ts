// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options — what the HUD shows, how hard the renderer works,
// and how the car is driven — in one persisted blob.
//
// Almost everything here is SCREEN-space and app-side: the engine neither
// knows nor cares. The one exception is the gearbox, which the engine does
// read — it is a choice about how the car is DRIVEN rather than how it is
// drawn, and it is offered for every car in the roster. The renderer reads
// `VideoSettings`, the HUD reads the `HudShow` derived from `HudSettings`,
// input.ts reads the key bindings, and the audio bus reads `AudioSettings`.
//
// THE BLOB HOLDS MORE KNOBS THAN THE MENU OFFERS, on purpose. The options
// page (menu-options.tsx) asks a player a dozen questions; the in-car seat
// and lens, the pad's deadzone and the pedal gestures are all still here
// with their defaults and their readers, and the tooling still sets some of
// them from the URL. They are the game's knobs rather than the player's.
//
// The PICTURE is the one place that grouping is drawn deliberately rather
// than by default: eleven renderer levers, three player rows. RESOLUTION and
// DISTANCE stand alone because they are separate costs a machine can be
// separately short of, and the ten that decide how much world gets built
// ride one DETAIL row (`DETAIL_PRESETS`) because they are one judgement —
// a simple game does not hand somebody a question about undergrowth
// density. Which levers share a row is a design decision; see
// `VideoSettings`.
//
// RESOLUTION is asked TWICE, because the honest question is not the same in
// a browser tab and in a window the game owns: the site asks for a share of
// the device's pixels, the desktop app names a height. Both are that one
// row and only one of them is ever offered — `desktop-video.ts` owns the
// desktop half and the reason.

import type { GearboxMode } from "@engine";

import { renderHeightOf } from "./desktop-video.ts";

/** Where the camera watches the car from, walked from the nose BACKWARDS:
 * the three seats first, closest to the road first, then out onto the boom
 * and up. This is both the order the camera key walks and the order the
 * options screen lists, and every entry is a mode the car can be DRIVEN
 * from — the menu's drone and the Roam map are placed by the app and are
 * not offered here. The geometry behind each name lives in camera.ts (the
 * three inside the car in camera-eye.ts); this is the vocabulary the
 * player picks from. */
export type PlayCamera =
  "bumper" | "hood" | "cockpit" | "close" | "chase" | "far" | "heli" | "top" | "tv";

/** No hints, like every ladder the options page walks: a camera describes
 * itself the moment it is picked, because picking it MOVES the one behind
 * the menu card. What each angle is FOR is camera.ts. */
export const PLAY_CAMERAS: { id: PlayCamera; label: string }[] = [
  { id: "bumper", label: "BUMPER" },
  { id: "hood", label: "HOOD" },
  { id: "cockpit", label: "COCKPIT" },
  { id: "close", label: "CLOSE" },
  { id: "chase", label: "CHASE" },
  { id: "far", label: "FAR" },
  { id: "heli", label: "HELI" },
  { id: "top", label: "TOP" },
  // The one view that is not hung off the car at all: a gallery of fixed
  // trackside tripods the director cuts between (camera-tv.ts). Last on the
  // ladder because it is the furthest thing from sitting in the car.
  { id: "tv", label: "TV" },
];

/** The three views taken from inside the car — the ones the seat, lens and
 * head-motion knobs apply to. Nothing outside the car has a seat to raise
 * or a head to steady. */
export const IN_CAR_CAMERAS: PlayCamera[] = ["bumper", "hood", "cockpit"];

/** THE IN-CAR VIEW, AS FOUR KNOBS. Every one of them is a ladder of named
 * stops rather than a slider: a value nobody can quite reproduce is worse
 * than one they can name.
 *
 * Only HEAD MOTION reaches the menu, and there as a switch — OFF is the
 * stop somebody the movement makes ill needs, and it has to be one press
 * away. The other three are the tuning surface this view is DEVELOPED
 * against: the tooling sweeps all four from the URL (`?seat=`, `?reach=`,
 * `?vfov=`, `?headmotion=`), so a contact sheet of variants costs a loop
 * rather than a rebuild. */
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

/** THE HUD, AS THE PLAYER SETS IT: on or off, whether the car has a
 * rear-view mirror, and whether the frame rate is on show. One switch for
 * the panel rather than one per instrument, because a rally HUD is one
 * instrument panel — nobody wants the clock without the map. The other two
 * are the parts that are not instruments: the glass, which is the CAR's and
 * stays up with the HUD off for anyone who drives by the road behind them,
 * and a number about the machine rather than about the race. */
export type HudSettings = {
  /** The instrument panel: clock, map, cluster, calls, tags and the buttons
   * on the top bar. Off is a clean frame with the pause chip left on it —
   * the one door back that a phone with no keys cannot do without. */
  on: boolean;
  /** The rear-view glass at the top of the screen, in every view. Off by
   * default: it is a SECOND RENDER of the world every time it is redrawn —
   * the dearest thing on the HUD by a distance, and the first thing to cost
   * a phone its frames — and a rally is a road nobody behind you is sharing.
   * The player who wants to watch the car behind turns it on once. */
  mirror: boolean;
  /** The frame rate, under the map. Off by default: it is a number about
   * the machine, and a player who has not asked what their machine is doing
   * should not have it counted at them all the way down a stage. */
  fps: boolean;
};

/** Every part of the HUD that can be switched, one flag each — the HUD's
 * own contract (hud.tsx reads it), kept per instrument so a build can still
 * take one part down on its own. The player's switches map onto it
 * through `hudShow`. Speed, gear and the countdown are not on it: the
 * countdown is the start line itself, and the cluster comes and goes with
 * the panel as a whole. */
export type HudInstrument =
  | "minimap"
  | "damage"
  | "mirror"
  | "nameTags"
  | "cameraButton"
  | "pacenotes"
  | "tachometer"
  | "timer"
  | "stage"
  | "cluster"
  | "position"
  | "fps";

export type HudShow = Record<HudInstrument, boolean>;

/** The player's switches, spread over the panel. */
export function hudShow(hud: HudSettings): HudShow {
  const on = hud.on;
  return {
    minimap: on,
    damage: on,
    mirror: hud.mirror,
    nameTags: on,
    cameraButton: on,
    pacenotes: on,
    tachometer: on,
    timer: on,
    stage: on,
    cluster: on,
    position: on,
    // Panel furniture, so it goes down with the panel: the readout hangs off
    // the stage label, and a clean frame is a clean frame.
    fps: on && hud.fps,
  };
}

/** The two faders. Kept apart because they are two different jobs: the
 * effects are information the player needs to drive, and the music is the
 * room it happens in — plenty of people want one without the other. */
export type AudioSettings = {
  /** 0–1 master for the score. */
  music: number;
  /** 0–1 master for every sound effect, the engine bed included. */
  sfx: number;
};

export * from "./settings-detail.ts";
export * from "./settings-input.ts";
export * from "./settings-video.ts";

import {
  DEFAULT_VIDEO,
  DETAIL_PRESETS,
  detailOf,
  DISTANCE_STOPS,
  LIGHTING_STOPS,
  RESOLUTION_STOPS,
  SKY_STOPS,
} from "./settings-detail.ts";
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  DEFAULT_TOUCH,
  PAD_ACTIONS,
  type KeyBindings,
  type PadAction,
  type PadSettings,
  type PadSource,
  type PedalDir,
  type TouchSettings,
} from "./settings-input.ts";
import type { VideoSettings } from "./settings-video.ts";

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
   * any one of them, so it lives here rather than in the catalog.
   *
   * The options page does NOT ask it. It is asked on the pre-race card
   * (menu-car.tsx), which is the one screen where the question means
   * something — the car's top speed and its 0–100 are quoted THROUGH the
   * box, so AUTO and MANUAL are two different sets of numbers sitting
   * beside the choice. This field is only the MEMORY of that answer: the
   * card writes back to it, so the box a player drove last time is the box
   * the next car is offered with, and nobody has to answer twice. */
  gearbox: GearboxMode;
  /** Whether the device is allowed to VIBRATE — the hits, the drift and the
   * gearbox (`game/rumble.ts`). On by default: on a phone it is most of what
   * says the car just hit something, and the game is played with the sound
   * off far more often than anybody admits. Offered only where there is a
   * motor to switch (`canRumble` in `game/haptics.ts`), so a desktop player
   * is never asked a question about hardware they do not have. */
  rumble: boolean;
  /** Whether the SCREENSHOT bind takes pictures at all. On by default —
   * the feature is the point of having it — and off is for a player who
   * keeps hitting ENTER by accident, or who would rather their own device's
   * screenshot key were the only camera in the room. Off leaves the gallery
   * reachable: the pictures already in the roll are still theirs to look
   * at, copy and share. */
  screenshots: boolean;
  /** Whether every picture also goes on the CLIPBOARD as it is filed in the
   * roll. On by default: a screenshot is nearly always taken to be shown to
   * somebody, and the shortest road from the shutter to a chat window is a
   * paste. Off is for a player who works with something else on their
   * clipboard and would rather the game left it alone — the picture still
   * lands in the gallery, where COPY is a press away. */
  copyShots: boolean;
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
  hud: { on: true, mirror: false, fps: false },
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
  video: { ...DEFAULT_VIDEO },
  keys: DEFAULT_KEYS,
  touch: DEFAULT_TOUCH,
  pad: DEFAULT_PAD,
  // The automatic: a player who has not chosen has not asked to be given
  // something else to manage while the road is coming at them.
  gearbox: "auto",
  rumble: true,
  screenshots: true,
  copyShots: true,
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

/** The defaults, as a blob nothing else shares a reference with — what a
 * first launch loads, and what RESTORE DEFAULTS puts back. */
export function freshSettings(): Settings {
  return {
    hud: { ...DEFAULT_SETTINGS.hud },
    camera: DEFAULT_SETTINGS.camera,
    view: { ...DEFAULT_SETTINGS.view },
    audio: { ...DEFAULT_SETTINGS.audio },
    video: { ...DEFAULT_SETTINGS.video },
    keys: { ...DEFAULT_SETTINGS.keys },
    touch: { ...DEFAULT_SETTINGS.touch },
    pad: clonePad(DEFAULT_PAD),
    gearbox: DEFAULT_SETTINGS.gearbox,
    rumble: DEFAULT_SETTINGS.rumble,
    screenshots: DEFAULT_SETTINGS.screenshots,
    copyShots: DEFAULT_SETTINGS.copyShots,
    developer: false,
    dev: { ...DEFAULT_SETTINGS.dev },
  };
}

export function loadSettings(): Settings {
  const settings = freshSettings();
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return settings;
    const parsed = JSON.parse(stored) as Partial<Settings>;
    // Field by field rather than merged: a blob written when the HUD was
    // eight switches still carries them, and they are not settings any more.
    const hud = parsed.hud as Partial<Record<string, unknown>> | undefined;
    if (typeof hud?.on === "boolean") settings.hud.on = hud.on;
    if (typeof hud?.mirror === "boolean") settings.hud.mirror = hud.mirror;
    if (typeof hud?.fps === "boolean") settings.hud.fps = hud.fps;
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
    // Row by row, because the rows are independent: the single levers are
    // checked against their own ladders and the other ten are snapped
    // together onto a DETAIL stop. Checked rather than merged for the reason
    // the view is snapped to its ladders — a value off a ladder is a place
    // the menu could never put the player back to once they moved off it —
    // but never snapped ACROSS rows, which is what a blob from the old
    // single QUALITY row would otherwise do to a mixed picture.
    if (parsed.video) {
      const video = parsed.video as Partial<Record<keyof VideoSettings, unknown>>;
      const resolution = RESOLUTION_STOPS.find((stop) => stop.id === video.resolution);
      if (resolution) settings.video.resolution = resolution.id;
      // The desktop row, checked against its own ladder for the same reason:
      // a height this build no longer offers is a stop the arrows could
      // never bring the player back to, so it lands on NATIVE instead.
      settings.video.renderHeight = renderHeightOf(String(video.renderHeight));
      const distance = DISTANCE_STOPS.find((stop) => stop.id === video.drawDistance);
      if (distance) settings.video.drawDistance = distance.id;
      Object.assign(settings.video, DETAIL_PRESETS[detailOf(parsed.video)]);
      // AFTER the preset, and off the blob rather than off the preset: both
      // of these were once levers on the DETAIL row, so a blob written on
      // that ladder carries a choice the row it came in on no longer sets.
      // Read on its own, that choice survives the change; read off the
      // preset, everybody who had ever moved DETAIL would come back to a
      // sky — or a set of lamps — they never picked.
      const lighting = LIGHTING_STOPS.find((stop) => stop.id === video.lighting);
      if (lighting) settings.video.lighting = lighting.id;
      const sky = SKY_STOPS.find((stop) => stop.id === video.sky);
      if (sky) settings.video.sky = sky.id;
    }
    if (parsed.keys) Object.assign(settings.keys, parsed.keys);
    if (parsed.touch) Object.assign(settings.touch, parsed.touch);
    if (parsed.pad) mergePad(settings.pad, parsed.pad);
    migrateCameraKey(settings.keys);
    migratePedalDirs(settings.touch);
    if (parsed.gearbox === "manual") settings.gearbox = "manual";
    if (parsed.rumble === false) settings.rumble = false;
    if (parsed.screenshots === false) settings.screenshots = false;
    if (parsed.copyShots === false) settings.copyShots = false;
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
