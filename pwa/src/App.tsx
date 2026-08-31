// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app shell. The game LAUNCHES INTO THE MAIN MENU, and the menu is not
// a still: a bot drives a real stage behind it under a drone camera, dimmed
// by a scrim so the cards stay the thing you are reading. The Roam page
// swaps that backdrop for the stage seen from the sky, turning.
//
// So the loop has three gears, all over one canvas and one GameState:
//
//   menu, demo pages → the engine steps on BOT input, drone camera
//   menu, Roam page  → the engine holds, map camera turning over the stage
//   playing          → the engine steps on the player's input, chase camera
//
// The pause card holds the run where it stands. The heavy state lives in
// refs; the HUD re-renders from a ~12 Hz snapshot. URL params (?seed=,
// ?tod=, ?weather=, ?car=, ?length=, ?shape=, ?laps=, ?gearbox=, the generator dials
// ?elevation= ?steepness= ?water= ?trees= ?asphalt= ?width=, ?start=1, ?shot=1 and ?bot=1) pin a
// run for tooling and
// screenshots, and the developer tools add ?debug=1, ?god=1 and the free
// camera's pose (?gx= ?gy= ?gz= ?gyaw= ?gpitch=) — the repro line the debug
// overlay prints is exactly that set, so a screenshot reproduces as a URL.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  CARS,
  TUNING,
  botInput,
  carById,
  compileStage,
  createGame,
  damageScaleFor,
  resolveKnobs,
  skipIntro,
  status,
  step,
  type CarInput,
  type FiniteStageLength,
  type GameEvent,
  type GameState,
  type GearboxMode,
  type GridSlot,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Difficulty,
  type Season,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { BENCHMARK, runBenchmark, type BenchmarkStatus } from "./game/benchmark.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import { createMenuNav } from "./game/menu-nav.ts";
import type { CameraMode, MapPose } from "./game/camera.ts";
import type { FreeFlyPose } from "./game/camera-free.ts";
import { DebugCopyButton, DebugHud } from "./game/debug-hud.tsx";
import {
  debugBoxes,
  reproQuery,
  stageQuery,
  traceLine,
  type DebugBox,
  type DebugContext,
} from "./game/debug-info.ts";
import { debugLogging, log as debugLog, logRunStart, setDebugLogging } from "./game/debug-log.ts";
import type { GameRenderer } from "./game/renderer.ts";
import { Hud, damageCall, type HudFlash, type HudSnapshot, type HudSplit } from "./game/hud.tsx";
import type { FinishRace, FinishScores, FinishStandings } from "./game/hud-finish.tsx";
import {
  advanceField,
  catchUpField,
  createField,
  drainField,
  fieldResults,
  livePlace,
  onRoad,
  placeAtFinish,
  placeAtSplit,
  rubRivals,
  settleField,
  settleLimit,
  splitLeader,
  stepField,
  stopField,
  watchField,
  playerSlot,
  PLAYER_ID,
  RALLY_FIELD,
  type ClassRow,
  type FieldPlan,
  type RivalField,
  type RivalRun,
} from "./game/standings.ts";
import { readWatch, walkWatch, watchLeader, type Watched } from "./game/spectate.ts";
import type { SpectateProps } from "./game/hud-spectate.tsx";
import {
  createRunTape,
  saveRunTape,
  type RunTapeEnd,
  type RunTapeRecorder,
} from "./game/run-tape.ts";
import {
  lastInitials,
  loadBoard,
  placeOn,
  recordScore,
  rememberInitials,
  type ScoreEntry,
} from "./game/scores.ts";
import {
  createLive,
  createPaceMemory,
  readLive,
  takeSnapshot,
  type RunBook,
} from "./game/snapshot.ts";
import {
  DEFAULT_HEADS_UP,
  DEFAULT_STAGE_KNOBS,
  DIFFICULTY_OPTIONS,
  PauseMenu,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  TIMES_OF_DAY,
  WEATHERS,
  gridSize,
  raceLaps,
  type PlayMode,
  type RaceSettings,
} from "./game/menu.tsx";
import { MainMenu, type MenuPage } from "./game/main-menu.tsx";
import { PauseOptions, type OptionsTab } from "./game/menu-options.tsx";
import { BenchmarkCard } from "./game/menu-dev.tsx";
import type { MapDebug, MapRect, MapView } from "./game/menu-roam.tsx";
import { mapDebugBoxes, mapReproQuery } from "./game/map-debug.ts";
import { MAP_LAYERS, type MapLayerId, type MapLayerInfo } from "./game/map-layers.ts";
import {
  PODIUM,
  findLevel,
  ladderAfter,
  levelLaps,
  loadProgress,
  locationStandings,
  locationWon,
  pointsFor,
  recordFinish,
  recordResult,
  resetPoints,
  stagePoints,
  unlockEverything,
  type CampaignLevel,
  type CampaignProgress,
} from "./game/campaign.ts";
import {
  createGhostRecorder,
  ghostMatches,
  loadGhost,
  readGhost,
  saveGhost,
  type GhostRecorder,
  type GhostStage,
  type GhostTape,
} from "./game/ghost.ts";
import {
  PLAY_CAMERAS,
  frameFloorMs,
  loadSettings,
  saveSettings,
  type DevSettings,
  type PlayCamera,
  type Settings,
  type ViewSettings,
} from "./game/settings.ts";
import { formatTime } from "./lib/util.ts";
import { setAudioVolumes, unlockAudio } from "./game/audio/bus.ts";
import { playUi } from "./game/audio/ui.ts";
import { armMenuMusic, pauseMusic, playMusic, resumeMusic, stopMusic } from "./game/audio/music.ts";
import type { RunAudio } from "./game/audio/index.ts";
import { armScreenshots, captureFrame, type Capture, type ShotNotes } from "./game/screenshots.ts";
import { beginImageCopy } from "./lib/share-image.ts";
import { splashSkipped } from "./game/splash.ts";
import { SplashScreen } from "./game/splash-screen.tsx";
import { UpdateCard } from "./game/update-card.tsx";

connectOutput();

/** Everyone gets the same opening stage on a given day; the menu's demo
 * rolls on from it, and Roam starts there. */
function dailySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}

const RACE_KEY = "scandi-flick-race-settings";

/** ?bot=1 (tooling): the bot drives the run until a control is touched, and
 * then hands the wheel over for good. Blind key presses can only ever reach
 * the first corner, so this is how a scripted scene gets to a PLACE on the
 * stage — a sealed section, a ford, a jump — and takes over there. */
function autopilotRequested(): boolean {
  return new URLSearchParams(location.search).get("bot") === "1";
}

/** ?update=1 (tooling): show the new-build card as if a worker were waiting.
 * A real one only appears after a deploy has actually landed on a device
 * that already had the app, which is not a state a screenshot pass can
 * reach — and an interface nobody can look at is an interface nobody
 * maintains. RESTART still reloads, so the escape hatch is honest. */
function updateCardForced(): boolean {
  return new URLSearchParams(location.search).get("update") === "1";
}

/** ?mirrorhz=N (tooling): hold the rear-view mirror at that refresh rate
 * instead of letting the measured frame rate choose it (mirror-pace.ts).
 * `make profile` is what needs it: the harness rasterizes in software at a
 * handful of frames a second, so an adaptive mirror falls to its floor and
 * the draw calls that come back describe the governor rather than the
 * renderer. */
function mirrorHzFromUrl(): number | null {
  const raw = Number(new URLSearchParams(location.search).get("mirrorhz"));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** ?laps=N (tooling): race a circuit over this many laps instead of the
 * rule book's three. A scripted pass has to REACH a finish to photograph
 * one, and three laps of anything is a long time to hold a browser open. */
function lapsOverride(): number | null {
  const raw = Number(new URLSearchParams(location.search).get("laps"));
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : null;
}

/** ?mode=headsup (tooling): open a `?start=1` link on a GRID, with the field
 * entered and the whole of it on the road at once, rather than alone on a
 * Roam stage. The only discipline a link can ask for — the others hang off a
 * campaign level, and a run with no level has no book to keep and no points
 * to pay. The grid's own three settings come from the player's HEADS UP
 * page, exactly as they do when a person starts one. */
function headsUpFromUrl(): boolean {
  return new URLSearchParams(location.search).get("mode") === "headsup";
}

/** ?debug=1 / ?god=1 (tooling, and the repro line the debug overlay prints):
 * force the developer tools on for this launch whatever is in storage. A
 * screenshot has to reproduce on a machine that has never had the developer
 * menu let out — otherwise the one person who can check a repro is the one
 * who reported it. */
function devFromUrl(): Partial<DevSettings> {
  const params = new URLSearchParams(location.search);
  const dev: Partial<DevSettings> = {};
  if (params.get("debug") === "1") dev.debug = true;
  if (params.get("god") === "1") dev.god = true;
  // …and `?record=1`, so a scripted pass can collect a drive without anybody
  // having found the developer menu on the machine it runs on.
  if (params.get("record") === "1") dev.record = true;
  return dev;
}

/** ?gx= ?gy= ?gz= ?gyaw= ?gpitch= — where to park god mode's camera, in the
 * units camera-free.ts flies in (meters, radians). Absent components are
 * left wherever the rig already was; a URL with none of them just turns
 * flying on where the run starts. */
function poseFromUrl(): Partial<FreeFlyPose> {
  const params = new URLSearchParams(location.search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  return { x: num("gx"), y: num("gy"), z: num("gz"), yaw: num("gyaw"), pitch: num("gpitch") };
}

/** ?maz= ?mpitch= ?mzoom= ?mpanx= ?mpanz= — where to park the ROAM MAP's
 * camera, in the units it is steered in (radians, a multiplier on the
 * framing standoff, metres off the stage's centre). The other half of the
 * map's own repro line (map-debug.ts): a picture of a generator defect is
 * only worth taking if somebody else can stand in front of it. */
function mapPoseFromUrl(): Partial<MapPose> {
  const params = new URLSearchParams(location.search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    az: num("maz"),
    pitch: num("mpitch"),
    zoom: num("mzoom"),
    panX: num("mpanx"),
    panZ: num("mpanz"),
  };
}

/** ?layer= — which of the generator's layers the map opens painted with,
 * and `?mapfull=1` for the pane blown up to the whole screen. Both are the
 * developer's map (map-layers.ts), so both let the developer menu out for
 * this launch exactly as `?debug=1` does. */
function mapLayerFromUrl(): MapLayerId | null {
  const raw = new URLSearchParams(location.search).get("layer");
  return MAP_LAYERS.some((l) => l.id === raw) ? (raw as MapLayerId) : null;
}

function mapFullFromUrl(): boolean {
  return new URLSearchParams(location.search).get("mapfull") === "1";
}

/** The build this frame came out of — the first thing to check when a
 * screenshot and the current tree disagree about what the game does. */
const BUILD = `v${__APP_VERSION__} ${__COMMIT_SHA__}`;

/** How often the debug log writes a position line while a run is going,
 * seconds. One a second is a readable trace of a two-minute stage; faster
 * turns the copy into a wall nobody reads to the end of. */
const TRACE_PERIOD = 1;

/** Whether the player is actually asking for anything this step. */
function driving(input: CarInput): boolean {
  return input.throttle > 0 || input.brake > 0 || input.handbrake || Math.abs(input.steer) > 0;
}

/** The driver asking to get on with it during the establishing shot. A
 * pedal, the handbrake or a gear — anything a foot or a hand deliberately
 * does. NOT the wheel: a stick resting a hair off centre would cut the shot
 * before it had started, and a wobble on the line is a driver settling in.
 * The countdown itself is never skipped, so the lights are always seen. */
function wantsOff(input: CarInput): boolean {
  return input.throttle > 0.5 || input.brake > 0.5 || input.handbrake || input.shiftUp;
}

/** Initial race settings: URL params (tooling) beat the stored choice beats
 * the defaults. Storage can be unavailable (private mode) — defaults are
 * fine. */
function initialRace(): RaceSettings {
  const race: RaceSettings = {
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
    carId: "compact",
    length: "medium",
    shape: "sprint",
    knobs: { ...DEFAULT_STAGE_KNOBS },
    difficulty: "medium",
    headsUp: { ...DEFAULT_HEADS_UP },
  };
  try {
    const stored = localStorage.getItem(RACE_KEY);
    if (stored) Object.assign(race, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  // A record written before HEADS UP existed has no group at all, and one
  // written by a build with fewer settings in it has half a group: both are
  // the defaults with whatever was actually stored laid over them.
  race.headsUp = { ...DEFAULT_HEADS_UP, ...race.headsUp };
  race.headsUp.cars = gridSize(race.headsUp.cars);
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.headsUp.difficulty)) {
    race.headsUp.difficulty = DEFAULT_HEADS_UP.difficulty;
  }
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === race.length)) race.length = "medium";
  if (!STAGE_SHAPES.some((s) => s.id === race.shape)) race.shape = "sprint";
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.difficulty)) race.difficulty = "medium";
  const params = new URLSearchParams(location.search);
  const tod = params.get("tod");
  if (TIMES_OF_DAY.some((t) => t.id === tod)) race.timeOfDay = tod as TimeOfDay;
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) race.weather = weather as Weather;
  const season = params.get("season");
  if (SEASONS.some((x) => x.id === season)) race.season = season as Season;
  const car = params.get("car");
  // Checked against the catalog rather than against a pair of literals: a
  // roster this named by hand silently shoots the DEFAULT car for every id
  // added since, which is a contact sheet that quietly stops covering the
  // thing it was made to compare.
  if (CARS.some((c) => c.id === car)) race.carId = car as string;
  const length = params.get("length");
  if (STAGE_LENGTH_OPTIONS.some((l) => l.id === length)) race.length = length as StageLength;
  const shape = params.get("shape");
  if (STAGE_SHAPES.some((s) => s.id === shape)) race.shape = shape as StageShape;
  const difficulty = params.get("difficulty");
  if (DIFFICULTY_OPTIONS.some((d) => d.id === difficulty)) {
    race.difficulty = difficulty as Difficulty;
  }
  // The generator's dials, each 0..1 — the tooling pins a stage's character
  // the same way it pins its seed.
  race.knobs = resolveKnobs(race.knobs);
  for (const dial of STAGE_DIALS) {
    const raw = params.get(dial.key);
    if (raw !== null && Number.isFinite(Number(raw))) race.knobs[dial.key] = Number(raw);
  }
  race.knobs = resolveKnobs(race.knobs);
  return race;
}

/** ?seat= ?reach= ?vfov= ?headmotion= — the in-car view's four knobs, in the
 * units OPTIONS ▸ VIEW moves them in (metres, metres, degrees, a scale on
 * the head). The tooling sweeps these to shoot a contact sheet of variants
 * without a rebuild; a missing one keeps whatever the player has stored. */
function viewFromUrl(): Partial<ViewSettings> {
  const params = new URLSearchParams(location.search);
  const view: Partial<ViewSettings> = {};
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const seat = num("seat");
  if (seat !== undefined) view.seat = seat;
  const reach = num("reach");
  if (reach !== undefined) view.reach = reach;
  const fov = num("vfov");
  if (fov !== undefined) view.fov = fov;
  const head = num("headmotion");
  if (head !== undefined) view.headMotion = head;
  return view;
}

/** The player's options, with the URL's developer flags laid over them. A
 * repro link arrives on a machine that has never drummed on the chassis, so
 * it lets the developer menu out as well as the tools — otherwise the boxes
 * come up and there is no way to switch them off again. */
function initialSettings(): Settings {
  const settings = loadSettings();
  Object.assign(settings.view, viewFromUrl());
  const forced = devFromUrl();
  if (forced.debug || forced.god || forced.record) {
    settings.developer = true;
    settings.dev = { ...settings.dev, ...forced };
  }
  // ...and the map's own repro line, which asks for the same thing by a
  // different door: a link that names a layer is a link to a developer tool.
  if (mapLayerFromUrl() || mapFullFromUrl()) settings.developer = true;
  // The box, pinned the way `?camera=` pins the angle: which gears the HUD
  // offers and what a thumb flick on the pedal is worth both hang off it, so
  // a shot of either must not depend on what is in the screenshot machine's
  // local storage.
  const gearbox = new URLSearchParams(location.search).get("gearbox");
  if (gearbox === "auto" || gearbox === "manual") settings.gearbox = gearbox;
  return settings;
}

/** Where a `?g…=` link wants god mode's camera parked. Read once: it names
 * the frame the link was made from, and re-applying it every time the
 * camera came back would make the flight impossible to leave. */
const URL_POSE = poseFromUrl();

/** ...and where a `?m…=` link wants the ROAM MAP framed. Read once for the
 * same reason: it names the picture the link was cut from, and re-applying
 * it every frame would make the map impossible to move. */
const URL_MAP_POSE = mapPoseFromUrl();

/** Everything that decides WHICH stage is standing: change any of it and
 * the run is rebuilt. */
type StageSpec = {
  seed: number;
  length: StageLength;
  /** R25 — a sprint from a start to a finish, or a circuit raced over laps. */
  shape: StageShape;
  /** Laps a circuit is raced over; 1 on anything that does not come back. */
  laps: number;
  /** The generator's dials — what KIND of country the seed is built in. */
  knobs: StageKnobs;
  carId: string;
  /** The box, when the stage insists on one. Normally absent: which gearbox
   * the car is driven with is the PLAYER's option, read fresh off OPTIONS
   * every time a stage is built. The benchmark is the exception — the two
   * boxes scale the gear tops and the drive between them (`gearedSpec`), so
   * a measurement that inherited one would be timing a different car. */
  gearbox?: GearboxMode;
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
  /** The menu's demo has no grid to sit on — nobody is waiting for it. */
  skipCountdown: boolean;
  /** Where the player is stood when the whole field leaves together: the
   * last row of the mass-start grid, deepest into the apron behind the start
   * gate, and the drive it is owed for the rows in front of it
   * (engine/sim/grid.ts). Null on every other start — a rally interval, a
   * time trial, Roam — where the player is on the line on their own and owes
   * nobody anything. */
  grid: GridSlot | null;
};

function sameStage(a: StageSpec | null, b: StageSpec): boolean {
  return (
    a !== null &&
    a.seed === b.seed &&
    a.length === b.length &&
    a.shape === b.shape &&
    a.laps === b.laps &&
    STAGE_DIALS.every((dial) => a.knobs[dial.key] === b.knobs[dial.key]) &&
    a.carId === b.carId &&
    a.gearbox === b.gearbox &&
    a.timeOfDay === b.timeOfDay &&
    a.weather === b.weather &&
    a.season === b.season &&
    a.skipCountdown === b.skipCountdown &&
    a.grid?.number === b.grid?.number &&
    a.grid?.back === b.grid?.back
  );
}

/** The stage the menu's demo is driving. Medium is the length that shows
 * the most road in the least time; the conditions are the player's own, so
 * the menu previews the weather they last chose to race in. */
function demoStage(race: RaceSettings, seed: number): StageSpec {
  return {
    seed,
    length: "medium",
    shape: "sprint",
    laps: 1,
    knobs: race.knobs,
    carId: race.carId,
    timeOfDay: race.timeOfDay,
    weather: race.weather,
    season: race.season,
    skipCountdown: true,
    grid: null,
  };
}

/** What a menu page wants standing behind it, and how it is framed. */
function backdropFor(page: MenuPage, race: RaceSettings, seed: number, demoSeed: number) {
  if (page.page === "roam") {
    return {
      camera: "map" as CameraMode,
      stage: {
        seed,
        length: race.length,
        shape: race.shape,
        laps: lapsOverride() ?? raceLaps(race),
        knobs: race.knobs,
        carId: race.carId,
        timeOfDay: race.timeOfDay,
        weather: race.weather,
        season: race.season,
        skipCountdown: true,
        grid: null,
      } satisfies StageSpec,
      driven: false,
    };
  }
  return { camera: "drone" as CameraMode, stage: demoStage(race, demoSeed), driven: true };
}

/** What a run is CALLED, for the line the log opens with. */
const MODE_NAME: Record<PlayMode, string> = {
  campaign: "Campaign",
  timetrial: "Time trial",
  headsup: "Heads up",
  roam: "Roam",
};

/** HOW THE FIELD IS ENTERED for a run: the campaign runs the whole roster
 * a rally interval apart at the campaign's own difficulty (R29), and a
 * heads-up race runs whatever its three settings say. Nothing else enters
 * anybody, so nothing else asks. */
function fieldPlan(race: RaceSettings, mode: PlayMode): FieldPlan {
  if (mode !== "headsup") return { ...RALLY_FIELD, difficulty: runDifficulty(race, mode) };
  return {
    difficulty: runDifficulty(race, mode),
    cars: gridSize(race.headsUp.cars),
    massStart: race.headsUp.massStart,
  };
}

/** WHICH DIFFICULTY THIS RUN IS DRIVEN AT. The same word the field is
 * entered on — HEADS UP keeps its own, everything else takes the campaign's
 * — and it is asked for on every mode, not only the two that enter anybody:
 * a difficulty says what a hit costs the player's own car
 * (`damageScaleFor`), and a time trial with nobody on the road is still
 * driven at one setting or another. */
function runDifficulty(race: RaceSettings, mode: PlayMode): Difficulty {
  return mode === "headsup" ? race.headsUp.difficulty : race.difficulty;
}

/** The camera a run opens on: the player's own choice from OPTIONS, unless
 * the tooling pins one with `?camera=` the way it pins the seed — a shot of
 * a given angle should not depend on what is in the screenshot machine's
 * local storage. */
function startCamera(chosen: PlayCamera): PlayCamera {
  const param = new URLSearchParams(location.search).get("camera");
  return PLAY_CAMERAS.some((cam) => cam.id === param) ? (param as PlayCamera) : chosen;
}

let flashId = 0;

/** How long a split stays on screen, SECONDS OF THE RUN. Long enough to read
 * the gap and the clock under it at speed, and a small fraction of the gap
 * between boards, so a second split is always the first one long gone.
 *
 * Measured on the race clock rather than on a timer, because that is the
 * clock the reading belongs to: a paused run holds its split the way it
 * holds everything else on the HUD, and a machine rendering the stage at a
 * fraction of real time shows it for as much of the ROAD as a machine that
 * is keeping up. */
const SPLIT_HOLD = 3.6;

/** R30 — one run-out in progress: the field still on the road, and everything
 * the classification it is going to produce has to be filed under. Named
 * rather than inlined on the ref because three frames read it — the card's
 * own backdrop, the feed a press of SPECTATE opens (spectate.ts), and the
 * one-go settle that books the sheet when the player presses on. */
type Settling = {
  field: RivalField;
  levelId: string;
  /** The player's own stage time, and the car they set it in. */
  time: number;
  carId: string;
  /** …and their split times in board order, which is what a spectator's gap
   * is measured against: the crew on screen is racing a time that is already
   * on the sheet. */
  splits: number[];
  /** Race time at which anybody still going is retired where they stand. */
  limit: number;
  /** Whether the classification goes on the campaign's board. False on a
   * heads-up race, which is settled to be READ and never written down. */
  score: boolean;
};

/** HOW THE RUN-OUT IS BEING WATCHED.
 *
 * `backdrop` is the default and needs no press: once the player's own
 * roll-out is over, their car is parked and the race is still on, so the
 * results card sits over the RACE rather than over a stationary car — the
 * leader of what is left, driving.
 *
 * `feed` is what SPECTATE buys: the same run-out, the same shot, with the
 * card down, the whole driving layout pointed at the crew on screen, and the
 * banner naming them over the two buttons that walk the field
 * (spectate.ts). */
type WatchMode = "off" | "backdrop" | "feed";

/** THE FEED, as the HUD wears it: the banner's line on the crew under the
 * camera, and the instruments the driving layout is pointed at them with —
 * their clock, their revs, their gear, their dents, their route, their
 * place. One object because both halves are read off the same crew on the
 * same tick, and a HUD holding one of them without the other would be a
 * name over somebody else's numbers for a frame. */
type WatchFace = { feed: Watched; snap: HudSnapshot };

/** …and the camera each is watched from. It is an OUTSIDE view and not a
 * choice: the in-car rigs are measured off the silhouette of the car the
 * stage was built around (`setEyes`), and the car on screen is somebody
 * else's.
 *
 * BOTH ways of watching take the SAME rig, and that is the point of the
 * pair being written out here rather than assumed. The transit that carries
 * the lens onto a crew (camera-sweep.ts) lands it behind them in the view
 * the player was just driving in, which is the shot a spectator is owed —
 * so pressing SPECTATE over the card is the card coming down rather than the
 * camera going somewhere else, and BACK TO RESULTS is it going back up.
 * A second flight between two ways of watching the same car said nothing
 * about the race and cost a second of it. */
const WATCH_CAMERA = { backdrop: "chase", feed: "chase" } as const;

/** How much of R25's roll-out the player's own car keeps before the card's
 * backdrop takes the frame, s.
 *
 * The flying finish is the celebration and it is worth having: the camera
 * plants at the gate, holds, and watches the car go down the run-out. But it
 * is a GESTURE, and it is over long before the car has finished coasting —
 * past this the shot is a small car receding, and there is a race going on
 * somewhere up the road. So the beat is given its seconds and then handed
 * over, rather than waiting out a roll-out that can run for half a minute.
 *
 * Measured on `rollout`, the run's own clock for the beat, so a machine
 * drawing the stage at a fraction of real time gives the shot the same
 * amount of ROAD as one that is keeping up. */
const BACKDROP_AFTER = 4.5;

/** Steps per pass when the run-out is finished off in one go, and how many
 * passes it is given. The product is far more road than `settleLimit` can
 * ever ask for, and the whole thing is spent on a screen that is being torn
 * down anyway — see `settleNow`. */
const SETTLE_ALL = 20_000;
const SETTLE_PASSES = 500;

/** Air time under which a landing is not worth a banner, s — every ripple
 * and curb technically leaves the ground, and "CLEAN AIR 0.0s" three times
 * in a row is the HUD talking over the game. */
const REAL_AIR = 0.5;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const input = useMemo(() => createInput(), []);
  /** The controller's way around the menus. It reads the cards off the DOM
   * rather than off this component's state, so it covers the finish card and
   * the studio card too — surfaces `menu` and `paused` know nothing about. */
  const menuNav = useMemo(() => createMenuNav(), []);
  const [race, setRace] = useState<RaceSettings>(initialRace);
  const [options, setOptions] = useState<Settings>(initialSettings);
  /** R29/R30 — the campaign board: what has been driven, what every stage
   * paid, and the best of each. Read once and carried in state, because the
   * results card and the campaign menu both render off it and neither should
   * be a storage read. */
  const [progress, setProgress] = useState<CampaignProgress>(loadProgress);
  /** The stage just finished, classified — every crew's time in finishing
   * order, which only exists once the last car is home. Null until then, and
   * again the moment the next run starts. */
  const [result, setResult] = useState<{ levelId: string; rows: ClassRow[] } | null>(null);
  /** The benchmark on screen: where it has got to while it runs, and the
   * time it took once it is done. Null whenever there is not one, which is
   * what the HUD, the pause card and the frame loop all read to know the
   * canvas is not theirs. */
  const [bench, setBench] = useState<BenchmarkStatus | null>(null);
  /** …and the way to stop it, which outlives any one frame. Kept beside the
   * state rather than derived from it because the frame loop and the input
   * handler are built once and read everything through refs. */
  const benchRef = useRef<{ stop: () => void } | null>(null);
  const [menu, setMenu] = useState<MenuPage | null>(() => {
    // ?start=1 launches straight into a run (tooling); everyone else gets
    // the main menu. `?roam=1` opens the map page itself — what the map's
    // repro line points at, and what a screenshot pass of the generator's
    // layers asks for.
    const params = new URLSearchParams(location.search);
    if (params.get("roam") === "1") return { page: "roam" };
    return params.get("start") === "1" && params.get("menu") !== "1" ? null : { page: "root" };
  });
  const [seed, setSeed] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : dailySeed();
  });
  /** Which stage the menu's demo is on. It rolls forward every time the bot
   * finishes one, so a menu left open keeps showing new road. */
  const [demoSeed, setDemoSeed] = useState(() => dailySeed());
  /** The run in progress: how it was entered, and which campaign level it
   * is, so a finish can record the clear. A `?start=1` link never passes
   * through `startStage`, so the discipline it opens in is settled here. */
  const [run, setRun] = useState<{ mode: PlayMode; levelId?: string }>(() => ({
    mode: headsUpFromUrl() ? "headsup" : "roam",
  }));
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  /** THE TIME TRIAL'S BOARD, for the run that has just ended. `pending` is the
   * run waiting on its three letters; it is what holds the results card's ways
   * on back until they are typed. Cleared with every start, so a board never
   * outlives the stage it belongs to. */
  const [scores, setScores] = useState<{
    board: readonly ScoreEntry[];
    place: number;
    pending: { levelId: string; time: number; carId: string; offer: string } | null;
  } | null>(null);
  /** The clock and the start lights, at frame rate. One object for the life
   * of the app, rewritten in place — the HUD holds its identity and reads it
   * on its own animation frame, so neither instrument waits for a snapshot. */
  const liveRef = useRef(createLive());
  /** The co-driver's latch, one object for the life of the app: which corner
   * is already on the strip, so a call cannot be taken back down by the
   * braking that follows it. */
  const paceRef = useRef(createPaceMemory());
  /** The attract card is up until a press clears it; `booted` is the moment
   * the render stack has landed and the first stage is standing, which is what
   * the card is covering — and what it waits for before it puts its title up
   * and asks for that press. Tooling runs pass ?start=1 and never see it. */
  const [splashUp, setSplashUp] = useState(() => !splashSkipped(location.search));
  const [booted, setBooted] = useState(false);
  const [paused, setPaused] = useState(false);
  /** WHICH CARD THE HELD RUN IS SHOWING: null is the pause card itself, a
   * tab is OPTIONS opened over it. The run is paused either way — this only
   * says what is drawn on top of it, so nothing about the hold, the frozen
   * frame or the held score has to learn about the page. */
  const [pauseTab, setPauseTab] = useState<OptionsTab | null>(null);
  /** True while ALT is held: the game's chrome comes off so a frame can be
   * judged on the pixels alone. The debug overlay is NOT part of it — a
   * screenshot with nothing to say where it was taken is the one thing the
   * overlay exists to prevent. */
  const [hudHidden, setHudHidden] = useState(false);
  /** True while a controller is connected and allowed to drive. The frame
   * loop asks the pad every frame; this is only written when the answer
   * CHANGES, because it is a React state and a stage is 90 000 frames. */
  const [padded, setPadded] = useState(false);
  /** What the debug overlay is reading, refreshed on the HUD's own tick and
   * only while the overlay is up. */
  const [debugCtx, setDebugCtx] = useState<DebugContext | null>(null);
  /** The frame rate, out where anything that has to describe THIS MOMENT can
   * reach it. The overlay gets it pushed on the HUD's tick; the shutter and
   * the copy button read it at the press, and neither of them is in the loop
   * that works it out. */
  const fpsRef = useRef(0);
  /** ...and the same number rounded off for the HUD's own readout under the
   * minimap, which only anybody who has let the developer menu out ever
   * sees. Its own state rather than a field of the HUD snapshot: the
   * snapshot is what the CAR is doing, and this is what the machine drawing
   * it is doing. Written on the HUD's twelve-a-second tick, and only while
   * there is somebody to read it. */
  const [hudFps, setHudFps] = useState(0);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  /** R28 — the split just driven through, until the run's clock times it
   * out. Mirrored in a ref: the frame loop is created once and expires it
   * from there, off the same clock the split is a reading of. */
  const [split, setSplit] = useState<HudSplit | null>(null);
  const splitRef = useRef<HudSplit | null>(null);
  splitRef.current = split;
  /** The splits this run is measured against, in board order — the ghost's
   * own, on a stage where the ghost is the only thing out there. A campaign
   * run prefers the LEADER's split, which is not knowable in advance and is
   * read off the field as each board goes by. */
  const splitsRef = useRef<{ times: number[]; against: string }>({ times: [], against: "" });
  /** R29 — THE FIELD: fourteen rival games on the same road, stepped beside
   * the player's. Null on every run with nobody entered (Roam, time trial,
   * the menu's demo). */
  const fieldRef = useRef<RivalField | null>(null);
  /** R30 — the field being RUN HOME behind the results card. The player is
   * across the line, but the crews still out there have places worth points
   * to somebody, so they are driven to the finish off the card's own frames
   * (see `settleField`) and the classification is booked when the last one
   * lands. Null once the sheet is in, and again on every start. */
  const settleRef = useRef<Settling | null>(null);
  /** R30 — the crew that run-out is being WATCHED through (spectate.ts), and
   * null whenever the card is up instead. Held in a ref because the frame
   * loop follows it; `watchFace` is the same feed read for the HUD, on the
   * HUD's own tick. */
  const spectateRef = useRef<RivalRun | null>(null);
  /** …and whether that is the card's own backdrop or the feed the player
   * asked for. Both step the same run-out; they differ in the camera and in
   * which of the two the HUD is drawing. */
  const watchModeRef = useRef<WatchMode>("off");
  /** …and the same answer as state, for the HUD: behind the CARD the
   * run-out is a backdrop, every instrument on the driving layout is a
   * reading of a car that is parked, so the chrome comes down and the card
   * is left standing over the race on its own. */
  const [watching, setWatching] = useState(false);
  /** …and the feed itself, once the player has asked for one. Null whenever
   * the card is up instead; refreshed on the HUD's own tick from inside the
   * frame loop. */
  const [watchFace, setWatchFace] = useState<WatchFace | null>(null);
  /** The watched crew's own frame-rate channel and co-driver memory, so a
   * clock in somebody else's car still counts hundredths and the player's
   * own latch is never written by a run they are not driving. */
  const watchLiveRef = useRef(createLive());
  const watchPaceRef = useRef(createPaceMemory());
  /** The feed's presses, plus the way it is torn down. Wired inside the
   * frame-loop effect, where the renderer that has to be told lives. */
  const watchActionsRef = useRef<{
    open: () => void;
    step: (by: number) => void;
    leave: () => void;
    close: () => void;
  }>({
    open: () => undefined,
    step: () => undefined,
    leave: () => undefined,
    close: () => undefined,
  });
  /** Where the run stands, as of the last board it went through. Held in a
   * ref because the HUD reads it off the snapshot the frame loop takes, and
   * mirrored into state only so the results card re-renders on the finish. */
  const standingRef = useRef<{ place: number; of: number } | null>(null);
  const finishTimeRef = useRef<number | null>(null);
  /** The controls of the run being driven, written down step by step so a
   * time worth keeping can be raced against later. Null on a stage that
   * keeps no time — Roam, and the menu's demo. */
  const recorderRef = useRef<GhostRecorder | null>(null);
  /** The ghost being raced: its OWN game, stepped from the tape beside the
   * player's, plus how far into the tape that game has got. Two games, one
   * track, and nothing between them — the cars cannot touch, because
   * neither one is in the other's world. */
  const ghostRef = useRef<{ state: GameState; tape: GhostTape; at: number } | null>(null);
  /** THE RUN TAPE (game/run-tape.ts): the same controls the ghost writes
   * down, in a file something outside the browser can drive. Armed only by
   * the COLLECT RACE DATA switch, on every kind of run — including the ones
   * that keep no time, because a Roam lap is as good a drive to calibrate
   * against as a campaign stage. Null the rest of the time, which is always. */
  const tapeRef = useRef<RunTapeRecorder | null>(null);
  /** What the run scored, booked at the line. Its presence is also what
   * STOPS the tape: R25's roll-out is driven past a clock that has already
   * stopped, and recording it would put a minute of coasting on the end of
   * every replay. */
  const tapeEndRef = useRef<Omit<RunTapeEnd, "rows" | "rivalSplits"> | null>(null);
  /** The book this run is being timed against — null on Roam and behind the
   * menu, where nobody is keeping score. The HUD's clock reads it, and so
   * does the results card's NEW RECORD. */
  const bookRef = useRef<RunBook | null>(null);
  const actionsRef = useRef<{ restart: () => void; menu: () => void; camera: () => void }>({
    restart: () => undefined,
    menu: () => undefined,
    camera: () => undefined,
  });

  // The loop reads these through refs: it is created once, and every menu
  // press, option change and restart flows in without rebuilding it.
  const raceRef = useRef(race);
  raceRef.current = race;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const demoSeedRef = useRef(demoSeed);
  demoSeedRef.current = demoSeed;
  const runRef = useRef(run);
  runRef.current = run;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pauseTabRef = useRef(pauseTab);
  pauseTabRef.current = pauseTab;
  /** The camera the run would be watched from if god mode landed right now.
   * Tracked here rather than read back off the renderer because the free
   * camera has REPLACED the mode there — the ladder the camera key walks is
   * the app's memory, not the renderer's. */
  const playCameraRef = useRef<PlayCamera>(options.camera);
  /** God mode and the overlay, as the frame loop sees them. */
  const godRef = useRef(false);
  const debugRef = useRef(options.dev.debug);
  debugRef.current = options.dev.debug;
  /** ...and whether the developer menu has been let out at all, which is
   * what puts the frame rate on the HUD. A wider door than the overlay on
   * purpose: the rate is worth watching while the game is being PLAYED, and
   * the overlay is a set of boxes across the road. */
  const developerRef = useRef(options.developer);
  developerRef.current = options.developer;
  /** `?bot=1` — the bot has the wheel until a human touches a control. A ref
   * rather than a local of the frame loop because god mode's HOLD reads it:
   * a run somebody else is driving is the one flight that must not stop it. */
  const autopilotRef = useRef(autopilotRequested());
  /** Whether god mode is holding the run still, decided once by the frame
   * loop and read back by the debug overlay — a picture taken from up here
   * should say whether the world under it was moving. */
  const heldRef = useRef(false);
  /** The compiled stage, cached under everything that decides what it IS:
   * the seed, the length band, and the dials. */
  const audioRef = useRef<RunAudio | null>(null);
  const trackRef = useRef<{ key: string; track: Track } | null>(null);
  const stageRef = useRef<StageSpec | null>(null);
  /** Roam's map pane, held here so a renderer that finishes loading after
   * the pane has already measured itself still learns where to draw. */
  const mapRectRef = useRef<MapRect | null>(null);
  /** A screenshot the player has asked for, waiting for a frame to be taken
   * off. It is a REQUEST rather than a capture because the drawing buffer
   * is only readable inside the animation callback that drew it — the frame
   * loop is the only place in the app that is (screenshots.ts) — and
   * because a press must never stop the car. Null means nothing pending;
   * a second press before the first has been served simply relabels it.
   *
   * `notes` is the caption painted INTO the picture rather than left on the
   * page (screenshots.ts): the developer map's boxes, or the driving
   * overlay's while it is up. Null on a player's own shot, which is the
   * frame and nothing else. `done` is how whoever asked finds out — the
   * capture happens frames later, in the loop, and it is the only place that
   * ever holds the finished picture. */
  const shotRef = useRef<{
    label: string;
    notes: ShotNotes | null;
    done?: (capture: Capture | null) => void;
  } | null>(null);

  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });
  const forcedUpdate = useMemo(() => updateCardForced(), []);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const flash = (text: string, tone: HudFlash["tone"]): void => {
    const id = ++flashId;
    setFlashes((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setFlashes((prev) => prev.filter((f) => f.id !== id)), 1800);
  };

  /** What the gallery writes under a picture: the stage it was taken on and
   * the car it was taken in. Those two place a frame that otherwise has
   * nothing in it but trees — a roll of forty low-poly forests is
   * unbrowsable without them. */
  const shotLabel = (): string => {
    const found = runRef.current.levelId ? findLevel(runRef.current.levelId) : null;
    const where = found ? found.level.name : `Stage ${stageRef.current?.seed ?? seedRef.current}`;
    return `${where} · ${carById(raceRef.current.carId).name}`;
  };

  /** THE SHUTTER — the bound key, or the HUD's own button on a phone.
   * Nothing is captured here: the drawing buffer can only be read inside
   * the animation callback that filled it (screenshots.ts), so a press
   * leaves a label behind and the very next frame is the picture. A second
   * press before the first has been served simply relabels the request,
   * which is right — the two would have been the same frame anyway.
   *
   * TWO THINGS RIDE ON THE PRESS ITSELF and cannot wait for the frame:
   *
   * The DEBUG BOXES, when the overlay is up. They are DOM over the canvas,
   * so none of what they say is in the drawing buffer the picture comes off
   * — which is exactly wrong for the kind of picture whose whole purpose is
   * to be handed to somebody else. Read here rather than in the loop because
   * this is the moment the shutter was pressed, and a flying camera has
   * moved by the time the frame is served.
   *
   * The CLIPBOARD, when the player asked for it. `write` wants the gesture's
   * transient activation, which the encode outlives, so the claim is staked
   * inside the press and the picture is handed over afterwards
   * (lib/share-image.ts). */
  const takeShot = (): void => {
    if (!optionsRef.current.screenshots) return;
    // Not behind the menu: that frame is the drone circling a stage nobody
    // is driving, with a card over half of it.
    if (menuRef.current !== null) return;
    // The shutter answers the PRESS, not the encode. A camera noise that
    // arrived a beat after the button would read as lag rather than as a
    // camera.
    playUi("select");
    const copy = optionsRef.current.copyShots ? beginImageCopy() : null;
    const read = debugRef.current ? readDebugRef.current() : null;
    shotRef.current = {
      label: shotLabel(),
      notes: read ? { boxes: read.boxes, repro: read.repro } : null,
      done: (capture) => {
        if (!copy) {
          flash(capture ? "PICTURE SAVED" : "PICTURE FAILED", capture ? "good" : "bad");
          return;
        }
        copy.settle(capture?.blob ?? null);
        // ONE receipt, and it waits for the clipboard: a picture the player
        // meant to paste is not saved until it is pasteable, and two flashes
        // for one press is the HUD talking to itself. The wait is the write,
        // not the encode — the blob is already in hand by here.
        void copy.done.then((copied) => {
          if (!capture) flash("PICTURE FAILED", "bad");
          else flash(copied ? "PICTURE SAVED · COPIED" : "PICTURE SAVED", "good");
        });
      },
    };
  };
  const takeShotRef = useRef(takeShot);
  takeShotRef.current = takeShot;

  /** R28 — put a split on screen. Taking it off again belongs to the frame
   * loop, which has the race clock; one board is up at a time, and they are
   * `checkpoint.spacing` seconds apart, so a second one arriving is the
   * first one long gone. */
  const showSplit = (
    index: number,
    count: number,
    split: number,
    time: number,
    measured: { time: number; against: string } | null,
  ): void => {
    const { times, against } = splitsRef.current;
    // The car the gap is to: the field's leader through this board when
    // there is a field, and your own best run when there is not.
    const reference =
      measured ?? (times[split] === undefined ? null : { time: times[split], against });
    setSplit({
      id: ++flashId,
      index,
      count,
      time,
      delta: reference === null ? null : time - reference.time,
      against: reference?.against ?? "",
    });
  };

  /** (Re)build the run for a stage spec, unless that exact stage is already
   * standing. The compiled track is cached per seed and length, so changing
   * only the light re-lights instead of rebuilding the world. */
  const applyStage = (spec: StageSpec, force = false): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!force && sameStage(stageRef.current, spec)) return;
    stageRef.current = spec;
    // An endless track is never reused: a restart must begin from a fresh
    // opening window, not from however far the last run streamed (the
    // renderer has long since dropped the world around the start).
    const key = `${spec.seed}/${spec.length}/${spec.shape}/${STAGE_DIALS.map((d) => spec.knobs[d.key]).join(",")}`;
    if (trackRef.current?.key !== key || spec.length === "endless") {
      trackRef.current = {
        key,
        track: compileStage(spec.seed, spec.length, spec.knobs, spec.shape),
      };
    }
    finishTimeRef.current = null;
    // The board belongs to the run that set it. Cleared here rather than in
    // `startStage` so a RESTART — which comes straight through this and never
    // through that — drops the last attempt's table too.
    setScores(null);
    const state = createGame({
      seed: spec.seed,
      carId: spec.carId,
      // The box is a player option rather than part of the stage: it is
      // read fresh here so a change in OPTIONS is in the car the next time
      // one is built, and never mid-run — unless the stage pins one, which
      // only a measurement does.
      gearbox: spec.gearbox ?? optionsRef.current.gearbox,
      track: trackRef.current.track,
      laps: spec.laps,
      // The countdown is the start line's ceremony for a DRIVER. In god
      // mode there is nobody on the grid — the car is handed neutral input
      // and stays there — so the lights would only hang over the middle of
      // every frame the free camera was flown out to take.
      skipCountdown: spec.skipCountdown || godRef.current,
      // The back row of a mass-start grid, and the metres it is owed. The
      // rivals are entered off the same grid in `createField`, so the slot
      // the player takes is the one slot that list does not.
      gridOffset: spec.grid?.lateral ?? 0,
      gridBack: spec.grid?.back ?? 0,
      catchUp:
        spec.grid && spec.grid.gain > 0
          ? { gain: spec.grid.gain, untilS: TUNING.massStart.catchUpS }
          : undefined,
      // What a hit COSTS this car, from the difficulty the run is driven at:
      // nothing on EASY, half on MEDIUM, the whole of it on HARD. Read fresh
      // on every build, like the gearbox above, so a setting changed in the
      // menu is in the next car put on the road and never in the one being
      // driven. The rivals are never scaled (`createField`): what the crews
      // do to each other is the simulation being honest.
      damageScale: damageScaleFor(runDifficulty(raceRef.current, runRef.current.mode)),
      env: { timeOfDay: spec.timeOfDay, weather: spec.weather, season: spec.season },
    });
    const previous = gameRef.current;
    gameRef.current = state;
    // A different track object (new seed OR new length) is a different
    // world, and the only thing worth rebuilding one for. A different car on
    // the same road is a body swap, and everything else — the light, the
    // weather — is a re-light.
    if (!previous || previous.track !== state.track) renderer.setGame(state);
    else if (previous.spec.id !== spec.carId) renderer.setCar(state);
    else renderer.setConditions(state);
    setSnap(takeSnapshot(state, paceRef.current, null, null, bookRef.current));
  };
  const applyStageRef = useRef(applyStage);
  applyStageRef.current = applyStage;

  /** Arm a run's ghost: a fresh recorder on any stage that keeps a time,
   * and — in a time trial — the best run on it put back on the road as a
   * second game stepped from its tape. Called on every start AND every
   * restart, because a restart is a new attempt and a half-written tape
   * would replay the first one's corners onto the second one's road.
   *
   * A ghost is only worth building on the finite, fixed-dial campaign
   * stages a time belongs to; nothing here ever runs behind the menu. */
  /** R29 — enter the field for a run with rivals in it: real crews on the
   * same compiled track, at the difficulty the player chose. The CAMPAIGN
   * enters the whole roster one at a time; HEADS UP enters its own grid, its
   * own size and its own start type. Nobody is entered on Roam, in a time
   * trial or behind the menu, and an endless stage has no finish to place at,
   * so all of those race alone. Called on every start AND every restart — a
   * field carried over from the last attempt would be a dozen cars already
   * halfway down the road. */
  const armField = (spec: StageSpec, mode: PlayMode, plan?: FieldPlan): void => {
    fieldRef.current = null;
    standingRef.current = null;
    // Whatever the last attempt was still running home is FINISHED FIRST and
    // written down — the run-out plays at race speed behind the card, so a
    // player who pressed on before the last car landed would otherwise walk
    // away from a classification nobody ever recorded. Then the shot that was
    // watching it comes down with the road it was pointed at.
    watchActionsRef.current.close();
    settleRef.current = null;
    setResult(null);
    rendererRef.current?.setStanding(null);
    rendererRef.current?.field.clear();
    if (!trackRef.current || menuRef.current) return;
    if ((mode !== "campaign" && mode !== "headsup") || spec.length === "endless") return;
    const race = raceRef.current;
    // …unless the caller states the entry list itself. Only the benchmark
    // does: a measurement cannot be entered off settings the player is free
    // to move, or two runs of it are two different races.
    const field = createField(trackRef.current.track, plan ?? fieldPlan(race, mode), {
      seed: spec.seed,
      laps: spec.laps,
      timeOfDay: spec.timeOfDay,
      weather: spec.weather,
      season: spec.season,
    });
    fieldRef.current = field;
    // The cars themselves. Nothing is built until a crew comes within reach
    // (field-cars.ts), so entering a field costs the fourteen games and no
    // geometry at all until one of them is actually somewhere you can see.
    rendererRef.current?.field.set(field.runs);
    // Last car on the road until a board says otherwise — which is the truth
    // on the grid, not a placeholder.
    standingRef.current = { place: field.playerNumber, of: field.of };
  };
  const armFieldRef = useRef(armField);
  armFieldRef.current = armField;

  const armGhost = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
    const renderer = rendererRef.current;
    recorderRef.current = null;
    ghostRef.current = null;
    splitsRef.current = { times: [], against: "" };
    setSplit(null);
    renderer?.setGhost(null);
    if (!renderer || !trackRef.current || menuRef.current) return;
    if (!levelId || spec.length === "endless") return;
    recorderRef.current = createGhostRecorder();
    const stage: GhostStage = {
      seed: spec.seed,
      length: spec.length as FiniteStageLength,
      knobs: spec.knobs,
      timeOfDay: spec.timeOfDay,
      weather: spec.weather,
    };
    const saved = loadGhost(levelId);
    if (!saved || !ghostMatches(saved, stage)) return;
    // R28 — the splits to be measured against when there is no field out
    // there: your own best run. A campaign run has fourteen real cars on the
    // road and reads the LEADER's board instead (see the checkpoint handler),
    // falling back to this on the boards nobody has reached yet.
    splitsRef.current = { times: saved.splits, against: "GHOST" };
    // Only a TIME TRIAL puts the ghost's car back on the road beside you.
    if (mode !== "timetrial") return;
    // The ghost's own game, on the SAME compiled track — the stage is read
    // only, so there is nothing to build twice but the run itself.
    const state = createGame({
      seed: spec.seed,
      carId: saved.carId,
      track: trackRef.current.track,
      skipCountdown: spec.skipCountdown,
      env: { timeOfDay: spec.timeOfDay, weather: spec.weather, season: spec.season },
    });
    ghostRef.current = { state, tape: readGhost(saved), at: 0 };
    renderer.setGhost(state);
    status(`Ghost: your ${saved.time.toFixed(2)} s in the ${carById(saved.carId).name}`);
  };
  const armGhostRef = useRef(armGhost);
  armGhostRef.current = armGhost;

  /** Arm the run tape, when the developer switch asks for one. Called on
   * every start AND every restart, for the same reason the ghost is: a tape
   * carried over from the last attempt would be one run's controls under
   * another run's clock. The FIELD it names is the plan the field was
   * actually entered on, so a replay races the same crews at the same
   * difficulty unless it is deliberately asked not to. */
  const armTape = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
    tapeRef.current = null;
    tapeEndRef.current = null;
    if (!optionsRef.current.dev.record || menuRef.current) return;
    const entered = mode === "campaign" || mode === "headsup";
    tapeRef.current = createRunTape({
      seed: spec.seed,
      length: spec.length,
      shape: spec.shape,
      laps: spec.laps,
      knobs: spec.knobs,
      carId: spec.carId,
      gearbox: optionsRef.current.gearbox,
      timeOfDay: spec.timeOfDay,
      weather: spec.weather,
      season: spec.season,
      // What `applyStage` actually handed the engine, god mode included:
      // a tape has to say what the run WAS, not what the menu asked for.
      skipCountdown: spec.skipCountdown || godRef.current,
      grid: spec.grid,
      mode,
      ...(levelId ? { levelId } : {}),
      field: entered && spec.length !== "endless" ? fieldPlan(raceRef.current, mode) : null,
    });
  };
  const armTapeRef = useRef(armTape);
  armTapeRef.current = armTape;

  /** Put the backdrop the current menu page asks for on screen. */
  const showBackdrop = (page: MenuPage): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const backdrop = backdropFor(page, raceRef.current, seedRef.current, demoSeedRef.current);
    applyStageRef.current(backdrop.stage);
    renderer.setCamera(backdrop.camera);
  };
  const showBackdropRef = useRef(showBackdrop);
  showBackdropRef.current = showBackdrop;

  /** Leave whatever is on screen for the main menu, with its demo behind it.
   * The run's tape and its ghost go with it: a stage abandoned halfway is
   * not a time, and the demo behind the cards races nobody. */
  const goMainMenu = (): void => {
    setPaused(false);
    setScores(null);
    recorderRef.current = null;
    ghostRef.current = null;
    fieldRef.current = null;
    standingRef.current = null;
    // Same bargain as a restart: the stage the player just drove keeps its
    // classification, whether or not they stayed to watch it decided.
    watchActionsRef.current.close();
    settleRef.current = null;
    setResult(null);
    rendererRef.current?.setGhost(null);
    rendererRef.current?.field.clear();
    setMenu({ page: "root" });
  };

  const startStage = (
    spec: StageSpec,
    mode: PlayMode,
    levelId?: string,
    plan?: FieldPlan,
  ): void => {
    playUi("start");
    // The time to beat comes out of the book before the run starts, not
    // after: a clock with nothing to chase is only a stopwatch, and a
    // record read back after the finish has already been written is one
    // every run beats.
    bookRef.current = levelId ? { best: loadProgress().best[levelId] ?? null } : null;
    // A new run inherits nothing from the last one: the engine's note would
    // otherwise glide from wherever the previous car left it.
    audioRef.current?.reset();
    // The finish sting silenced the score (see the finish handler). Starting
    // the next stage from the results card never passes through the menu, so
    // the theme is re-armed here rather than by the menu's own effect; it is
    // a no-op when the score is already the one playing.
    playMusic("taiga");
    setPaused(false);
    setRun({ mode, levelId });
    runRef.current = { mode, levelId };
    setMenu(null);
    menuRef.current = null;
    applyStage(spec, true);
    armField(spec, mode, plan);
    armGhost(spec, mode, levelId);
    armTape(spec, mode, levelId);
    playCameraRef.current = startCamera(optionsRef.current.camera);
    // The god-mode effect owns the camera while it is flying; setting a play
    // camera here as well would land the flight every time a run started.
    if (!godRef.current) rendererRef.current?.setCamera(playCameraRef.current);
    logRunStart(`${mode} ${stageQuery(spec)}`);
  };

  const playLevel = (level: CampaignLevel, mode: PlayMode): void => {
    const race = raceRef.current;
    status(`${MODE_NAME[mode]} — ${level.name}`);
    startStage(
      {
        seed: level.seed,
        length: level.length,
        shape: level.shape ?? "sprint",
        laps: lapsOverride() ?? levelLaps(level),
        // A campaign stage is the same country for everybody: the dials are
        // Roam's to play with, not the campaign's to inherit.
        knobs: DEFAULT_STAGE_KNOBS,
        carId: race.carId,
        timeOfDay: level.timeOfDay,
        weather: level.weather,
        season: level.season,
        skipCountdown: false,
        // The back row, on a mass start. Everything else puts the player on
        // the line on their own.
        grid: mode === "headsup" && race.headsUp.massStart ? playerSlot(race.headsUp.cars) : null,
      },
      mode,
      level.id,
    );
  };

  const playRoam = (): void => {
    const r = raceRef.current;
    status(`Roaming stage ${seedRef.current} — ${carById(r.carId).name}`);
    startStage(
      {
        seed: seedRef.current,
        length: r.length,
        shape: r.shape,
        laps: lapsOverride() ?? raceLaps(r),
        knobs: r.knobs,
        carId: r.carId,
        timeOfDay: r.timeOfDay,
        weather: r.weather,
        season: r.season,
        skipCountdown: false,
        grid: null,
      },
      "roam",
    );
  };

  /** THE BENCHMARK — the developer menu's stopwatch (game/benchmark.ts).
   *
   * It is a RUN in every sense the renderer and the engine care about: the
   * campaign's first stage, the whole field on one green, and a bot at every
   * wheel including the player's. What it is not is a run the app is playing
   * — nothing is recorded, no theme plays over it, no HUD is drawn, and the
   * frame loop below hands the canvas over for as long as it lasts, because
   * the benchmark drives its own frames as fast as the machine will draw
   * them and a second loop rendering between them would be measuring itself.
   *
   * Every dial of it is pinned here rather than read off the player's
   * settings, for the one reason the whole tool exists: two numbers have to
   * be two numbers about the same race. OPTIONS ▸ VIDEO is the deliberate
   * exception — finding out what a resolution costs is what running it twice
   * is FOR. */
  const benchmarkStage = (level: CampaignLevel): StageSpec => {
    return {
      seed: level.seed,
      length: level.length,
      shape: level.shape ?? "sprint",
      laps: levelLaps(level),
      knobs: DEFAULT_STAGE_KNOBS,
      carId: BENCHMARK.carId,
      gearbox: BENCHMARK.gearbox,
      timeOfDay: level.timeOfDay,
      weather: level.weather,
      season: level.season,
      skipCountdown: false,
      // The back row of the grid the field is stood on, exactly as a
      // heads-up race stands it.
      grid: playerSlot(BENCHMARK.field.cars),
    };
  };

  const startBenchmark = (): void => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const found = findLevel(BENCHMARK.levelId);
    if (!renderer || !canvas || !found) return;
    benchRef.current?.stop();
    startStage(benchmarkStage(found.level), "headsup", undefined, BENCHMARK.field);
    // Nothing about a measurement is written down, and the developer switch
    // that collects race data would otherwise be recording one.
    tapeRef.current = null;
    renderer.setCamera(BENCHMARK.camera);
    const state = gameRef.current;
    const field = fieldRef.current;
    if (!state || !field) return;
    benchRef.current = {
      stop: runBenchmark({ state, field, renderer, canvas, onStatus: setBench }),
    };
  };

  /** Put the canvas back. The frozen last frame goes with it: the way out of
   * a benchmark is the developer menu it was started from. */
  const leaveBenchmark = (): void => {
    benchRef.current?.stop();
    benchRef.current = null;
    setBench(null);
    goMainMenu();
    setMenu({ page: "developer" });
  };
  const leaveBenchmarkRef = useRef(leaveBenchmark);
  leaveBenchmarkRef.current = leaveBenchmark;

  const applyRace = (next: RaceSettings): void => {
    setRace(next);
    raceRef.current = next;
    try {
      localStorage.setItem(RACE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the choice still applies to this session */
    }
    if (menuRef.current) showBackdropRef.current(menuRef.current);
  };

  const setMapRect = (rect: MapRect | null): void => {
    mapRectRef.current = rect;
    rendererRef.current?.setMapRect(rect);
  };

  /** Roam's map pane, driving the camera it is a window onto. Held in a memo
   * so the pane's native listeners are wired once rather than on every
   * re-render the menu does. */
  const mapView = useMemo<MapView>(
    () => ({
      onMove: (dAz, dPitch, zoomBy) => rendererRef.current?.nudgeMap(dAz, dPitch, zoomBy),
      onPan: (dxFrac, dyFrac) => rendererRef.current?.panMap(dxFrac, dyFrac),
      onReset: () => rendererRef.current?.resetMap(),
    }),
    [],
  );

  /** THE DEVELOPER'S MAP (map-layers.ts): which of the generator's layers is
   * painted over the stage, and whether the pane has been blown up to the
   * whole screen. Neither is persisted — a debug layer that came back next
   * launch would be a surprise rather than a tool. */
  const [mapLayer, setMapLayer] = useState<MapLayerId | null>(mapLayerFromUrl);
  const [mapFull, setMapFull] = useState(mapFullFromUrl);
  /** What the painted layer measured, kept in a ref as well as in state: the
   * debug panel reads it four times a second off a closure that must not be
   * re-made on every frame, and the legend under the map renders off state. */
  const [mapInfo, setMapInfo] = useState<MapLayerInfo | null>(null);
  const mapInfoRef = useRef<MapLayerInfo | null>(null);
  mapInfoRef.current = mapInfo;

  // The layer follows the STAGE as well as the switch: stepping the seed or
  // moving a dial rebuilds the backdrop, and a layer sampled off the stage
  // before it is a layer describing a landscape that is no longer there.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const onRoam = menu?.page === "roam";
    setMapInfo(renderer.setMapLayer(onRoam ? mapLayer : null));
    // The idle turn is the MENU's decoration. Once the map is being read —
    // blown up to the screen, or with a layer painted on it — it holds
    // still, because a reading that turns on its own cannot be compared
    // with the one taken before the change that is under test.
    renderer.holdMap(onRoam && (mapFull || mapLayer !== null));
  }, [mapLayer, mapFull, menu, seed, race, booted]);

  /** The boxes over a full-screen map, read fresh: the framing moves under
   * the hand, so this is a function rather than a value. Null before there
   * is a stage to describe. */
  const readMapDebug = (): { boxes: DebugBox[]; repro: string } | null => {
    const renderer = rendererRef.current;
    const spec = stageRef.current;
    const track = trackRef.current?.track;
    if (!renderer || !spec || !track) return null;
    const pose = renderer.mapPose();
    return {
      boxes: mapDebugBoxes(spec, track, pose, mapInfoRef.current, BUILD),
      repro: mapReproQuery(spec, pose, mapInfoRef.current?.id ?? null),
    };
  };
  const readMapDebugRef = useRef(readMapDebug);
  readMapDebugRef.current = readMapDebug;

  /** THE DEVELOPER MAP'S SHUTTER. The same request the driving shutter
   * leaves behind — the drawing buffer can only be read inside the frame
   * loop — with the boxes and the legend attached, so what lands in the roll
   * is a picture that already says which seed it is and what is painted on
   * it. Deliberately NOT behind the player's SCREENSHOTS option: that switch
   * is about the game's own camera, and a developer who opened this page has
   * asked for this one. The CLIPBOARD does follow the player's switch, and
   * is claimed inside the press for the same reason the shutter's is
   * (lib/share-image.ts). Resolves once the frame has been filed, which is
   * how the button reports back. */
  const takeMapShot = (): Promise<{ saved: boolean; copied: boolean }> =>
    new Promise((resolve) => {
      const read = readMapDebugRef.current();
      const info = mapInfoRef.current;
      const spec = stageRef.current;
      playUi("select");
      const copy = optionsRef.current.copyShots ? beginImageCopy() : null;
      shotRef.current = {
        label: `Map ${spec?.seed ?? seedRef.current}${info ? ` · ${info.label}` : ""}`,
        notes: read ? { boxes: read.boxes, repro: read.repro, legend: info?.legend ?? [] } : null,
        done: (capture) => {
          if (!copy) {
            resolve({ saved: capture !== null, copied: false });
            return;
          }
          copy.settle(capture?.blob ?? null);
          void copy.done.then((copied) => resolve({ saved: capture !== null, copied }));
        },
      };
    });
  const takeMapShotRef = useRef(takeMapShot);
  takeMapShotRef.current = takeMapShot;

  const mapDebug = useMemo<MapDebug>(
    () => ({
      layer: mapLayer,
      onLayer: setMapLayer,
      full: mapFull,
      onFull: setMapFull,
      legend: mapInfo?.legend ?? [],
      read: () => readMapDebugRef.current(),
      onShot: () => takeMapShotRef.current(),
    }),
    [mapLayer, mapFull, mapInfo],
  );

  /** A CAMPAIGN STAGE, LOADED INTO ROAM. A level is a seed, a band, a shape
   * and the conditions it is set in — exactly what Roam's own settings are —
   * so picking one off the stage list is loading it into those settings
   * rather than a second stage pipeline. Everything already on that page
   * comes with it: the map and its layers, the pan, the zoom, the shutter,
   * the conditions, the car, and DRIVE IT.
   *
   * The dials are RESET rather than inherited. The campaign's stages are the
   * same country for everybody — they are built off the rule book's defaults
   * (see `playLevel`) — and a stage loaded onto whatever Roam happened to be
   * left on would be a road no player has ever driven wearing that stage's
   * name. Everything else here is a starting point the player may then move,
   * which is the whole reason this lands on Roam and not on a grid. */
  const loadRoamLevel = (level: CampaignLevel): void => {
    status(`${level.name} — loaded into Roam`);
    seedRef.current = level.seed;
    setSeed(level.seed);
    applyRace({
      ...raceRef.current,
      length: level.length,
      shape: level.shape ?? "sprint",
      knobs: DEFAULT_STAGE_KNOBS,
      timeOfDay: level.timeOfDay,
      weather: level.weather,
      season: level.season,
    });
    setMenu({ page: "roam" });
  };

  /** The chassis secret, found. It sticks: a player who drummed seven times
   * on purpose does not want to do it again next launch. */
  const revealDeveloper = (): void => {
    if (optionsRef.current.developer) return;
    status("Developer menu unlocked");
    applyOptions({ ...optionsRef.current, developer: true });
  };

  const applyOptions = (next: Settings): void => {
    // WHICH CAMERA A RUN OPENS ON is also which camera the run STANDING
    // RIGHT NOW is watched from: OPTIONS is reachable from the pause card,
    // and a view picked over a frozen frame that only takes effect on the
    // next stage reads as a setting that did not take. Only when the choice
    // MOVED — the camera key walks the same ladder without writing to
    // options, and re-seating the lens on every unrelated option change
    // would undo that walk. Behind a menu the drone and the map own the
    // view, so the pick waits for the cards to come down, the same rule god
    // mode's hold follows.
    const reframe = next.camera !== optionsRef.current.camera;
    setOptions(next);
    optionsRef.current = next;
    saveSettings(next);
    setAudioVolumes(next.audio);
    input.setKeys(next.keys);
    input.setPad(next.pad);
    rendererRef.current?.setVideo(next.video);
    rendererRef.current?.setMirror(next.hud.mirror);
    rendererRef.current?.setNameTags(next.hud.nameTags);
    rendererRef.current?.setView(next.view);
    if (reframe && !menuRef.current) {
      playCameraRef.current = next.camera;
      if (!godRef.current) rendererRef.current?.setCamera(next.camera);
    }
  };

  /** The debug snapshot the overlay renders and the log quotes. Null before
   * the renderer has landed or while no stage is standing. */
  const debugContext = (fps: number): DebugContext | null => {
    const renderer = rendererRef.current;
    const spec = stageRef.current;
    if (!renderer || !spec) return null;
    const pose = renderer.cameraPose();
    return {
      stage: spec,
      view: pose.mode,
      playCamera: playCameraRef.current,
      pose,
      god: pose.mode === "free",
      held: heldRef.current,
      fps,
      mirror: renderer.mirrorPace(),
      build: BUILD,
    };
  };
  const debugContextRef = useRef(debugContext);
  debugContextRef.current = debugContext;

  /** The overlay's boxes and its repro line, read FRESH — the same pair the
   * map's `readMapDebug` hands back, for the driving half of the game.
   *
   * A function rather than the `debugCtx` state on purpose, and for two
   * reasons that both come down to timing. The state is only pushed while
   * the overlay is UP, so with the boxes switched off there is nothing in it
   * to copy; and it is pushed on the HUD's twelve-a-second tick, where the
   * camera this describes moves every frame. What a picture is captioned
   * with, and what a button copies, has to be the moment it was asked for.
   * Null before there is a stage to describe. */
  const readDebug = (): { boxes: DebugBox[]; repro: string } | null => {
    const ctx = debugContextRef.current(fpsRef.current);
    const state = gameRef.current;
    if (!ctx || !state) return null;
    return { boxes: debugBoxes(ctx, state), repro: reproQuery(ctx) };
  };
  const readDebugRef = useRef(readDebug);
  readDebugRef.current = readDebug;

  // The menu's backdrop follows the page, the seed and the demo's roll.
  useEffect(() => {
    if (menu) showBackdropRef.current(menu);
  }, [menu, seed, demoSeed]);

  // GOD MODE IS A RUN'S CAMERA, not the menu's. Behind a menu page the
  // drone and the map own the view, so flying is held until the cards come
  // down — and switching it on from the pause card takes effect the moment
  // that card is dismissed, which is the same rule stated once.
  const godActive = options.dev.god && menu === null;
  godRef.current = godActive;
  useEffect(() => {
    input.setFreeFly(godActive);
    const renderer = rendererRef.current;
    if (!renderer) return;
    // The menu places its own backdrop camera (the drone, or Roam's map) and
    // this effect runs AFTER the one that does it: reaching for a play
    // camera here would leave the demo behind the cards framed as if
    // somebody were driving it.
    if (menuRef.current) return;
    renderer.setCamera(godActive ? "free" : playCameraRef.current);
    if (!godActive) {
      debugLog("god", "landed");
      return;
    }
    // A link that named a pose is answered AFTER the hand-over, which has
    // just seeded the rig from the camera that was standing.
    renderer.placeCamera(URL_POSE);
    const p = renderer.cameraPose();
    debugLog(
      "god",
      `flying from ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} yaw ${p.yaw.toFixed(3)}`,
    );
  }, [godActive, input]);

  // …and the run it is holding is SAID OUT LOUD, because the alternative is
  // a player who switched god mode on from the pause card, pressed RESUME,
  // and watched nothing move. Only on the way in and the way out: arriving
  // with the tools already on (a `?god=1` link) is not a change, and a run
  // the bot is driving was never held to announce.
  const godAnnounced = useRef(godActive);
  useEffect(() => {
    if (godAnnounced.current === godActive) return;
    godAnnounced.current = godActive;
    if (autopilotRef.current) return;
    flash(godActive ? "GOD MODE — RUN HELD" : "RUN RESUMED", "info");
  }, [godActive]);

  // The log fills only while the overlay is up: the two are one tool, and a
  // ring buffer nobody asked for is a leak in a shipped game.
  useEffect(() => {
    setDebugLogging(options.dev.debug);
  }, [options.dev.debug]);

  // The volumes the player last chose, applied before anything can make a
  // noise — including the theme the menu arms on its very first paint.
  useEffect(() => {
    setAudioVolumes(optionsRef.current.audio);
  }, []);

  // WHICH THEME IS PLAYING IS A FUNCTION OF WHERE THE PLAYER IS, and nothing
  // else. Keyed on whether a menu is up rather than on which page, so walking
  // from the root to Options to Roam never restarts the music. `armMenuMusic`
  // also owns the unlock: it claims the arrangement immediately and starts it
  // on the first gesture anywhere, so the theme belongs to the menu opening
  // rather than to whichever row the player happens to press first.
  const inMenu = menu !== null;
  // …with one place that is neither: a BENCHMARK is a race stepped at
  // whatever rate the machine manages, and a theme playing over it is a
  // score against a film run at the wrong speed.
  const benchmarking = bench !== null;
  useEffect(() => {
    if (benchmarking) {
      stopMusic();
      return undefined;
    }
    if (inMenu) return armMenuMusic();
    playMusic("taiga");
    return undefined;
  }, [inMenu, benchmarking]);

  // WHILE THE BOARD IS BEING TYPED INTO, THE KEYBOARD IS NOT THE CAR'S. The
  // bindings are letters — `R` restarts the run, `M` walks out to the main
  // menu — and both listeners sit on the same target, so the entry's own
  // `preventDefault` cannot stop them. The input manager hands the keyboard
  // over for as long as the three letters are outstanding.
  const typingScore = scores?.pending != null;
  useEffect(() => {
    input.setTyping(typingScore);
    return () => input.setTyping(false);
  }, [input, typingScore]);

  // The pause card freezes the score where it stands rather than stopping it:
  // a theme that restarted every time somebody checked the map would be a
  // reason not to check the map.
  useEffect(() => {
    if (paused) pauseMusic();
    else resumeMusic();
  }, [paused]);

  // Every way a hold ENDS — resume, restart, retiring to the menu — puts the
  // pause card back to its first page, in one place rather than in each of
  // them: the next pause is a card the player has to be able to predict.
  useEffect(() => {
    if (!paused) setPauseTab(null);
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    input.setKeys(optionsRef.current.keys);
    input.setPad(optionsRef.current.pad);
    // The render stack — three.js and the whole world builder — loads as
    // its own chunk, keeping the entry script inside the §11.3.9
    // critical-path budget: the shell parses and paints at once, the world
    // follows a breath later (from the service-worker cache once installed).
    // The RUN's audio is not startup either, so it loads on its own chunk
    // beside the renderer. The frame loop and the event handler both go
    // through `audioRef`, so the game is simply silent until it lands — which
    // is a breath at most, and never longer than the world takes to build.
    // The menu's own sounds (`audio/ui.ts`) are the only audio in the entry.
    void import("./game/audio/index.ts").then(({ createRunAudio }) => {
      if (!disposed) audioRef.current = createRunAudio();
    });
    void import("./game/renderer.ts").then(({ createRenderer }) => {
      if (disposed) return;
      const renderer = createRenderer(canvas, optionsRef.current.video);
      rendererRef.current = renderer;
      // Name the roll and decode the mark now rather than on the first
      // press: both are cheap, and the first picture of a session is the
      // one most likely to be shown to somebody.
      if (optionsRef.current.screenshots) armScreenshots();
      renderer.setMirror(optionsRef.current.hud.mirror);
      renderer.pinMirrorPace(mirrorHzFromUrl());
      renderer.setNameTags(optionsRef.current.hud.nameTags);
      renderer.setView(optionsRef.current.view);
      renderer.setMapRect(mapRectRef.current);
      // A link that named a map framing is answered before the first frame,
      // so the picture it reproduces is the picture it was cut from rather
      // than the default framing seen for a moment first.
      renderer.placeMap(URL_MAP_POSE);
      // Thunder arrives seconds after the flash that made it (storm.ts), so
      // the renderer decides WHEN and the bank decides what it sounds like.
      // Muted behind a menu for the same reason every other run sound is:
      // the demo is scenery under a theme.
      renderer.onThunder((clap) => {
        if (menuRef.current === null) audioRef.current?.thunder(clap);
      });
      // The light things the car drives through are knocked over by the
      // renderer, so this is the only place their noise can be raised.
      renderer.onKnock((speed) => {
        if (menuRef.current === null) audioRef.current?.knock(speed);
      });
      cleanups.push(() => renderer.dispose());
      const page = menuRef.current;
      if (page) showBackdropRef.current(page);
      else {
        const r = raceRef.current;
        const mode = runRef.current.mode;
        const spec: StageSpec = {
          seed: seedRef.current,
          length: r.length,
          shape: r.shape,
          laps: lapsOverride() ?? raceLaps(r),
          knobs: r.knobs,
          carId: r.carId,
          timeOfDay: r.timeOfDay,
          weather: r.weather,
          season: r.season,
          skipCountdown: false,
          // The back row, on a `?mode=headsup` grid; alone on the line
          // otherwise, which is every other way into here.
          grid: mode === "headsup" && r.headsUp.massStart ? playerSlot(r.headsUp.cars) : null,
        };
        applyStageRef.current(spec, true);
        // The field, on the same link: a heads-up race with nobody entered
        // is a Roam stage on a grid.
        armFieldRef.current(spec, mode);
        // …and the run tape, if `?record=1` asked for one: a scripted pass
        // that drives a stage is exactly the drive somebody wants the file
        // for, and this path never reaches `startStage`.
        armTapeRef.current(spec, mode);
        // The establishing shot is ten seconds of camera before a tooling
        // run has done anything, and every screenshot scene would sit
        // through it. A `?start=1` link therefore lands straight on the
        // lights; `?shot=1` is how the scenes that want to LOOK at the shot
        // ask for it.
        const wantsShot = new URLSearchParams(location.search).get("shot") === "1";
        if (!wantsShot && gameRef.current) {
          const jumped = skipIntro(gameRef.current);
          // The field is pushed on by exactly what the player jumped, or the
          // grid the whole race is read off quietly comes apart: fourteen
          // crews would still be sitting through a ceremony the player has
          // already driven out of.
          if (fieldRef.current) advanceField(fieldRef.current, jumped);
          // Written down as the driver's own cut, at step 0 — which is what
          // it is. A tape whose header claimed the ceremony was never built
          // would replay ten seconds of camera the run did not sit through.
          tapeRef.current?.skipped();
        }
        // A `?start=1` run never passes through `startStage`, and a debug log
        // with no run section is one COPY LATEST RUN can say nothing about —
        // which is exactly the run a tooling link is most likely to be
        // capturing.
        logRunStart(`url ${stageQuery(spec)}`);
        playCameraRef.current = startCamera(optionsRef.current.camera);
        renderer.setCamera(godRef.current ? "free" : playCameraRef.current);
        if (godRef.current) renderer.placeCamera(URL_POSE);
      }

      const restart = (): void => {
        setPaused(false);
        const spec = stageRef.current;
        if (!spec) return;
        // A new attempt inherits nothing from the last one, exactly as a
        // fresh start does not: the engine's note starts from idle rather
        // than gliding down from whatever the finish left, and the theme is
        // re-armed — the finish sting stopped the score, and a run restarted
        // from the results card never passes through the menu that would put
        // it back. Both are no-ops mid-race, which is the other way in here.
        audioRef.current?.reset();
        playMusic("taiga");
        applyStageRef.current(spec, true);
        const active = runRef.current;
        armFieldRef.current(spec, active.mode);
        armGhostRef.current(spec, active.mode, active.levelId);
        armTapeRef.current(spec, active.mode, active.levelId);
      };
      const camera = (): void => {
        if (menuRef.current) return;
        // Genuinely nothing to do while flying: god mode is not on the
        // ladder, and walking off it would land the camera by accident.
        if (godRef.current) return;
        // …and nothing to do while the run-out is on screen either. The
        // ladder's in-car views are mounted off the silhouette of the
        // player's own car (`setEyes`), and the car in shot is somebody
        // else's: walking onto one would put the lens inside a body it was
        // never measured for. Both ways of watching it are from outside,
        // and both are already standing in the one view that is.
        if (spectateRef.current) return;
        const mode = renderer.cycleCamera();
        const play = PLAY_CAMERAS.find((cam) => cam.id === mode);
        // Remembered only when it IS a play camera: the ladder never walks
        // onto the overhead views, and the one god mode lands back on has to
        // be a camera somebody can drive from.
        if (play) playCameraRef.current = play.id;
        flash(`${play?.label ?? "CHASE"} CAM`, "info");
      };
      actionsRef.current = { restart, menu: goMainMenu, camera };

      /** R30 — THE CLASSIFICATION, BOOKED: the sheet the campaign's board
       * takes and the card's table opens. Every way the run-out can end lands
       * here — the last car coming home under the camera, a road that was
       * already clear, and the player pressing on before either — because a
       * result must not depend on how much of it anybody stayed to watch. */
      const bookResults = (settling: Settling): void => {
        settleRef.current = null;
        const rows = fieldResults(settling.field, {
          time: settling.time,
          carId: settling.carId,
        });
        if (settling.score) setProgress(recordResult(settling.levelId, rows));
        setResult({ levelId: settling.levelId, rows });
      };

      /** THE FEED, READ: the banner's line on `run` and the instruments the
       * driving layout wears while it is on them. Null once that crew is off
       * the road — home, retired, or the whole run-out already booked.
       *
       * The snapshot is taken exactly as the player's own is, off a
       * different `GameState`: the whole point of the mode is that a watched
       * car reads on the same dials. What it is NOT given is anything the
       * reading would be a lie about — no ghost to be up the road on, no
       * record book to be beating, and no finish time, which is what keeps
       * the results card off a run that is still going. */
      const readFeed = (run: RivalRun): WatchFace | null => {
        const settling = settleRef.current;
        if (!settling) return null;
        const feed = readWatch(settling.field, run, settling.splits);
        if (!feed) return null;
        return {
          feed,
          snap: takeSnapshot(
            run.state,
            watchPaceRef.current,
            null,
            null,
            null,
            feed.place === null ? null : { place: feed.place, of: feed.of },
            settling.field,
          ),
        };
      };

      /** The camera the player's OWN run is watched from right now — where
       * the lens goes back to when nothing is being followed. */
      const cameraForPlayer = (): CameraMode => (godRef.current ? "free" : playCameraRef.current);

      /** CUT TO `run`, in `how` — or stand the whole thing down on null,
       * which puts the lens back on the player's own car. Three things and
       * no more: who the frame loop follows, who the renderer draws the
       * world around, and which camera it is watched from. Everything else
       * about the mode falls out of those. */
      const cutTo = (run: RivalRun | null, how: WatchMode): void => {
        // Never onto a car that is not out there. Nothing here hands one in
        // — every source reads off the road — but a crew who is home has no
        // picture and no numbers, so standing down is the only honest answer
        // to being pointed at one.
        const on = run && onRoad(run) ? run : null;
        spectateRef.current = on;
        watchModeRef.current = on ? how : "off";
        // The MODE goes first and the crew second: standing down hands the
        // rig back to the player's own view, and it is `spectate(null)` that
        // re-stands it around their car — in whichever view that turns out
        // to be.
        renderer.setCamera(
          on ? WATCH_CAMERA[how === "feed" ? "feed" : "backdrop"] : cameraForPlayer(),
        );
        renderer.spectate(on);
        setWatching(on !== null);
        // The instruments belong to the FEED alone. Behind the card there is
        // a card, and a second set of readouts under it would be two things
        // asking to be read at once.
        if (on && how === "feed") readLive(watchLiveRef.current, on.state);
        setWatchFace(on && how === "feed" ? readFeed(on) : null);
      };

      /** FINISH THE RUN-OUT WHERE IT STANDS, at whatever it costs, and book
       * the sheet. The run-out plays at race speed behind the card now, so a
       * player pressing NEXT thirty seconds in would otherwise walk away
       * from a classification that was never written down — and R30's points
       * behind the player are worth two and one to somebody whether or not
       * anybody stayed to watch them being earned. A few hundred thousand
       * steps on a screen that is being torn down anyway. */
      const settleNow = (): void => {
        const settling = settleRef.current;
        if (!settling) return;
        let pass = 0;
        while (!settleField(settling.field, SETTLE_ALL, settling.limit) && pass < SETTLE_PASSES) {
          pass += 1;
        }
        bookResults(settling);
      };

      watchActionsRef.current = {
        open: () => {
          const settling = settleRef.current;
          if (settling) cutTo(watchLeader(settling.field), "feed");
        },
        step: (by) => {
          const settling = settleRef.current;
          if (settling) cutTo(walkWatch(settling.field, spectateRef.current, by), "feed");
        },
        // BACK TO RESULTS drops to the card, and the card's own backdrop is
        // this same run-out from this same shot: the race does not stop
        // because somebody stopped watching it closely, and the picture does
        // not move because the card came back up over it.
        leave: () => {
          if (spectateRef.current) cutTo(spectateRef.current, "backdrop");
        },
        close: () => {
          settleNow();
          cutTo(null, "off");
        },
      };
      input.onNav((action) => {
        if (action === "confirm") menuNav.confirm();
        else if (action === "back") menuNav.back();
        else if (action === "next") menuNav.next();
        else if (action === "navUp") menuNav.move("up");
        else if (action === "navDown") menuNav.move("down");
        else if (action === "navLeft") menuNav.move("left");
        else menuNav.move("right");
      });
      input.onAction((action) => {
        // A benchmark is not a run: none of the run's own keys mean what
        // they usually mean over one, and every one of them is somebody
        // reaching for the way out.
        if (benchRef.current) {
          leaveBenchmarkRef.current();
          return;
        }
        if (action === "restart") restart();
        else if (action === "menu") goMainMenu();
        else if (action === "screenshot") takeShotRef.current();
        else if (action === "pause") {
          if (menuRef.current) return;
          // OPTIONS is a page INSIDE the hold, so the pause key steps back
          // out of it rather than resuming: a player who paused to change one
          // setting must not be thrown back onto the road by the same key
          // that got them off it. It is the rule the menu's own Escape
          // follows one page at a time (main-menu.tsx).
          if (pauseTabRef.current !== null) setPauseTab(null);
          else setPaused((was) => !was);
        } else camera();
      });

      /** R29 — the player against everybody else on the road. A rally stage
       * is driven alone right up until you catch the crew in front, and from
       * there they are a car: one you can lean on out of a corner, and one
       * you can put into the trees.
       *
       * The field against ITSELF is resolved a step earlier, inside
       * `stepField`, where the whole road takes one tick together. This is
       * the player's half of the same model. */
      const rubField = (field: RivalField, state: GameState): void => {
        // Their half of a hit lands on their body alone: they crumple and
        // shed parts, and make no sound and throw no dust, because the hit
        // happened over there.
        const mine = rubRivals(field, state, (run, theirs) => renderer.field.events(run, theirs));
        // The player's half goes through the same door every other impact
        // does — the sound, the camera's kick and the damage instrument all
        // hang off it.
        if (mine.length > 0) handleEvents(state, mine);
      };

      const handleEvents = (state: GameState, events: GameEvent[]): void => {
        // R25's salute is sized by where the time placed, and the renderer
        // fires it off the finish event itself — so the field's verdict has
        // to be in before the events are handed over, not after.
        const field = fieldRef.current;
        let home: number | null = null;
        for (const ev of events) if (ev.type === "finish") home = ev.time;
        if (field && home !== null && menuRef.current === null) {
          // The classification cannot be read while a crew is still owed
          // road: the stagger means the only rival who could still beat this
          // time is one nobody has driven yet. The establishing shot has
          // normally paid the whole field off long before here — this is the
          // guarantee, not the usual path.
          drainField(field);
          // Everybody else left BEFORE the player, so anybody still out
          // there has already been driving for longer than this time and
          // cannot beat it: the count of the crews who did is final.
          standingRef.current = { place: placeAtFinish(field, home), of: field.of };
          renderer.setStanding(standingRef.current.place);
          const active = runRef.current;
          const where = active.levelId ? findLevel(active.levelId) : null;
          if (where) {
            // R30 — the player is home, but the places BEHIND them are worth
            // two points and one to somebody, so the crews still out there are
            // run home off the card's frames rather than abandoned. A heads-up
            // race pays nobody and still runs them home: the result sheet is
            // the whole point of the race, and a sheet that stops at the
            // player is not one.
            settleRef.current = {
              field,
              levelId: where.level.id,
              time: home,
              carId: stageRef.current?.carId ?? "",
              splits: [...state.checkpointTimes],
              limit: settleLimit(home),
              // R30's points are the CAMPAIGN's board and only its. A heads-up
              // race is one race and nothing carries out of it.
              score: active.mode === "campaign",
            };
          } else {
            // Nobody is entered: anybody still out there is behind the
            // player, and stepping them on would only cost the card frames.
            stopField(field);
          }
        }
        // The tape's last line but one: what the run scored, booked at the
        // line and never after it. The field's own sheet is not in yet —
        // the stragglers are still coming home — so it is read off the
        // field when the file is actually asked for.
        if (home !== null && tapeRef.current && !tapeEndRef.current && menuRef.current === null) {
          tapeEndRef.current = {
            finished: true,
            time: home,
            laps: state.laps,
            lapTimes: [...state.lapTimes],
            splits: [...state.checkpointTimes],
            place: standingRef.current?.place ?? null,
            of: standingRef.current?.of ?? null,
            stats: { ...state.stats },
          };
        }
        renderer.onEvents(state, events);
        if (debugLogging() && menuRef.current === null) {
          for (const ev of events) {
            // Every event but the crowd, which fires at every stand on the
            // stage and would bury the ones that mean something.
            if (ev.type === "cheer") continue;
            const { type, ...rest } = ev as GameEvent & Record<string, unknown>;
            const detail = Object.entries(rest)
              .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : String(v)}`)
              .join(" ");
            debugLog(
              "event",
              `${state.raceTime.toFixed(2)}s ${type}${detail ? ` ${detail}` : ""} @ s=${state.progressS.toFixed(0)}`,
            );
          }
        }
        // The demo is scenery: it gets no flashes, no "next stage" countdown
        // and NO SOUND — the menu has a theme of its own, and a bot crashing
        // behind the card would be the loudest thing in it.
        const demo = menuRef.current !== null;
        if (!demo) audioRef.current?.events(events);
        for (const ev of events) {
          if (ev.type === "finish") {
            if (demo) {
              setDemoSeed((s) => s + 1);
              continue;
            }
            finishTimeRef.current = ev.time;
            // The finish sting is the loudest musical moment in the game and
            // has to land in quiet; the menu re-arms its own theme when the
            // results card times out.
            stopMusic();
            const active = runRef.current;
            // Both modes post a time; only the campaign's clear opens the
            // next stage, and a time trial's level is cleared by definition.
            // A HEADS-UP race posts nothing at all: it is raced off a grid the
            // player started on the back row of, over a stage distance that is
            // therefore not the one the board's times were set over, and a
            // best time is a promise that both were the same road.
            if (active.levelId && active.mode !== "headsup") {
              // A ghost IS the best time, so it is kept by the same rule and
              // read before the new time overwrites the old one. Recorded on
              // the campaign too: the board is shared, and a best set there
              // is the run a time trial has to beat.
              const beat = loadProgress().best[active.levelId];
              const spec = stageRef.current;
              const tape = recorderRef.current;
              if (
                tape &&
                spec &&
                spec.length !== "endless" &&
                (beat === undefined || ev.time < beat)
              ) {
                saveGhost(
                  active.levelId,
                  tape.seal(
                    {
                      seed: spec.seed,
                      length: spec.length as FiniteStageLength,
                      knobs: spec.knobs,
                      timeOfDay: spec.timeOfDay,
                      weather: spec.weather,
                    },
                    spec.carId,
                    ev.time,
                    state.checkpointTimes,
                  ),
                );
              }
              recorderRef.current = null;
              setProgress(
                recordFinish(
                  active.levelId,
                  ev.time,
                  // A run with nobody entered posts a time and nothing else:
                  // the ladder's next rung is opened by a podium, and a time
                  // trial is not a place.
                  standingRef.current && active.mode === "campaign"
                    ? {
                        place: standingRef.current.place,
                        difficulty: raceRef.current.difficulty,
                      }
                    : null,
                ),
              );
              // THE BOARD IS THE TIME TRIAL'S, and only its. The campaign is a
              // ladder you climb once; the trial is the stage you come back to,
              // which is the only place ten rows of other people's initials
              // mean anything.
              if (active.mode === "timetrial") {
                const board = loadBoard(active.levelId);
                const at = placeOn(board, ev.time);
                setScores({
                  board,
                  place: at + 1,
                  pending:
                    at >= 0
                      ? {
                          levelId: active.levelId,
                          time: ev.time,
                          carId: stageRef.current?.carId ?? "",
                          // Read ONCE, here: the card re-renders a dozen times
                          // a second off the HUD snapshot, and the offered name
                          // must not be a storage read on every one of them.
                          offer: lastInitials(),
                        }
                      : null,
                });
              }
            }
            // The card goes up NOW — the clock has stopped — but the run
            // is not over: the car is still coasting down R25's run-out with
            // the camera planted at the gate, and that beat IS the
            // celebration. Where the run goes next is the PLAYER's press on
            // the card, not a countdown: a stage that threw you back to the
            // menu on its own was the ladder taking the next rung away.
            continue;
          }
          if (demo) continue;
          // The banner is for what the player CANNOT see: how long that jump
          // hung, and the machinery giving out under a body that still looks
          // driveable. Splashes, crashes, landings, respawns and the panels
          // going over the roof all announce themselves on screen already —
          // captioning them is noise over the top of the game.
          if (ev.type === "checkpoint") {
            // R29 — the one moment a staggered rally actually knows where
            // anybody is: the board. Your place is every car through it in
            // less than you took, plus you.
            let measured: { time: number; against: string } | null = null;
            if (field) {
              // A mass start already knows where everybody is on every frame
              // (`livePlace`, below), and the count of better split times is
              // the wrong answer there — it places a car that is level with
              // you but yet to reach the board as though it were behind.
              if (!field.massStart) {
                standingRef.current = {
                  place: placeAtSplit(field, ev.split, ev.time),
                  of: field.of,
                };
              }
              const leader = splitLeader(field, ev.split);
              if (leader) measured = { time: leader.time, against: leader.alias.toUpperCase() };
            }
            showSplit(ev.index + 1, ev.count, ev.split, ev.time, measured);
          } else if (ev.type === "lap") {
            flash(
              `LAP ${ev.lap} — ${formatTime(ev.time)}${ev.best ? " BEST" : ""}`,
              ev.best ? "good" : "info",
            );
          } else if (ev.type === "landing" && ev.clean && ev.airTime >= REAL_AIR) {
            flash(`CLEAN AIR ${ev.airTime.toFixed(1)}s`, "good");
          } else if (ev.type === "systemFail") {
            // The one exception to the rule above: a bent car announces
            // itself and hurt MACHINERY does not. There is nothing to look
            // at — the engine bay is shut, the rack is under the floor — so
            // the news is said here, where the splits are said.
            const call = damageCall(ev.system, ev.spent);
            flash(call.text, call.tone);
          }
        }
      };

      /** Everything on screen that reads the run twelve times a second: the
       * HUD's snapshot, the split ageing beside it, and the debug overlay's
       * own. Written once and called from both the frame that STEPPED the
       * run and the frame that is holding it still — a run held from its
       * very first frame (a `?god=1` link) has never handed the HUD
       * anything, and a HUD with nothing in it leaves the start-line caption
       * hanging across the middle of every picture flown out to be taken. */
      const pushHud = (state: GameState, fps: number): void => {
        // R29 — a HEADS-UP race is the one discipline that knows the order of
        // the road at every moment, so its position board reads live rather
        // than waiting for the next split. Off the HUD's own clock and not
        // the physics step: it is a number on a screen that redraws twelve
        // times a second.
        const racing = fieldRef.current;
        if (racing?.massStart && state.phase === "racing") {
          standingRef.current = { place: livePlace(racing, state), of: racing.of };
        }
        setSnap(
          takeSnapshot(
            state,
            paceRef.current,
            finishTimeRef.current,
            ghostRef.current?.state.progressS ?? null,
            bookRef.current,
            standingRef.current,
            fieldRef.current,
          ),
        );
        // R28 — and the split ages on the race clock beside it.
        const up = splitRef.current;
        if (up && state.raceTime - up.time > SPLIT_HOLD) setSplit(null);
        // The overlay reads its own snapshot: it needs the CAMERA, which the
        // HUD's has no reason to carry, and it is off entirely for everyone
        // who never let the developer menu out.
        if (debugRef.current) setDebugCtx(debugContextRef.current(fps));
        // The rate under the map. Rounded here rather than at the readout,
        // so a state that has not moved is a render that does not happen.
        if (developerRef.current) setHudFps(Math.round(fps));
      };

      // Fixed-timestep driver: engine steps at TUNING.dt regardless of frame
      // rate; a hitching tab clamps the backlog instead of spiraling. Behind
      // the menu the BOT is at the wheel; on the Roam page nothing drives at
      // all and only the map camera turns.
      let raf = 0;
      let last = performance.now();
      let acc = 0;
      let hudClock = 0;
      /** The shortest gap between two DRAWN frames, ms — the phone cap, read
       * once here because a media query per frame is a query per frame. */
      const frameFloor = frameFloorMs();
      /** Frames and seconds since the rate was last worked out, and the
       * answer — the debug overlay's only performance number. */
      let fpsFrames = 0;
      let fpsSeconds = 0;
      let fps = 0;
      let traceClock = 0;
      let altWas = false;
      let padWas = false;
      /** The picture, if one was asked for.
       *
       * It has to be lifted off the drawing buffer in the SAME TASK as the
       * render that filled it — the context keeps no back buffer for anyone
       * who asks later (screenshots.ts) — so this is called after every
       * render the loop does, and there are three: the driving one, the
       * frozen one behind a pause card, and the Roam page's map. That last
       * one is the whole point of the developer map's shutter, and it is
       * exactly the branch that used to return before ever reaching here.
       * Everything after the grab can wait, and does. */
      const servePendingShot = (): void => {
        const wanted = shotRef.current;
        if (wanted === null) return;
        shotRef.current = null;
        void captureFrame(canvas, wanted.label, wanted.notes).then((capture) => {
          // Whoever asked says what happened: the shutter flashes it on the
          // HUD, a menu's button says it on its own face. This is also the
          // one place the finished picture exists, which is why the whole
          // capture goes back rather than a yes or no.
          if (wanted.done) wanted.done(capture);
          else flash(capture ? "PICTURE SAVED" : "PICTURE FAILED", capture ? "good" : "bad");
        });
      };
      /** R30 — THE CARD'S OWN BACKDROP. A few seconds past the line the
       * player's own car is a small thing receding down the run-out, and
       * there is a RACE going on up the road: crews still out there, driving
       * for places worth points. So the run-out opens itself on the crew
       * behind — the leader of what is left, which on a road everybody is
       * driving toward the same line is the next car due through it. The
       * camera flies back up the road to them (camera-sweep.ts) and settles
       * in behind them in the view the player was driving in a moment ago;
       * the card stands over that the way the main menu stands over a stage
       * somebody is driving, and SPECTATE becomes a matter of the numbers
       * appearing rather than of starting anything.
       *
       * R25's own celebration keeps `BACKDROP_AFTER` of the roll-out first:
       * the flying finish is a gesture worth watching, and it is finished
       * well before the car is. */
      const openBackdrop = (state: GameState): void => {
        if (spectateRef.current) return;
        const past =
          state.phase === "finished" ||
          (state.phase === "rollout" && state.rollout >= BACKDROP_AFTER);
        if (!past) return;
        const settling = settleRef.current;
        if (!settling) return;
        const leader = watchLeader(settling.field);
        // Nobody left to point a camera at: the road cleared while the
        // player was still coasting down R25's run-out, and the sheet is
        // simply in. Booked HERE because nothing else is going to — the
        // run-out is driven at race speed now, and this is the one place
        // that asks whether it is over before it has begun.
        if (!leader) {
          bookResults(settling);
          return;
        }
        cutTo(leader, "backdrop");
      };

      /** R30 — ONE FRAME OF THE RUN-OUT BEING WATCHED (spectate.ts), and
       * false when nothing is being followed and the run below the loop is
       * the player's own.
       *
       * One path for both ways of watching it — the card's backdrop and the
       * feed the player asked for — because they are the same run-out: a
       * frame's worth of ticks, every remaining crew driven alone by
       * `watchField`, the sheet booked on the tick the last one lands. The
       * player's own game is not stepped at all: their run ended at the
       * line.
       *
       * `frozen` is a pause card or god mode's hold: the shot keeps its frame
       * and stops its clock, exactly as a run under either does. */
      const spectateFrame = (dtFrame: number, frozen: boolean): boolean => {
        let watching = spectateRef.current;
        if (!watching) return false;
        const how = watchModeRef.current;
        const settling = settleRef.current;
        // The sheet came in, the run was thrown away underneath, or a menu
        // has opened over the top: there is nothing left out there to point a
        // camera at. Stood DOWN rather than merely skipped — following a
        // rival is what holds the player's own car off the road, and a shot
        // nobody steps is a car that never comes back.
        if (!settling || menuRef.current) {
          cutTo(null, "off");
          return false;
        }
        if (!frozen) {
          acc += dtFrame;
          let ticks = 0;
          while (acc >= TUNING.dt) {
            acc -= TUNING.dt;
            ticks += 1;
          }
          if (ticks > 0 && watchField(settling.field, ticks, settling.limit)) {
            bookResults(settling);
            cutTo(null, "off");
            return false;
          }
          // THE CREW UNDER THE CAMERA IS HOME — across the line, or retired
          // where they stood. A broadcast cuts to whoever is still driving
          // rather than holding on an empty road, and the car it cuts to is
          // the LEADER of what is left: `stillRunning` is ordered by road
          // covered, so a crew who has just reached the finish was by
          // definition in front of everybody still on the stage, and the new
          // leader is the next one down it.
          if (!onRoad(watching)) {
            const next = watchLeader(settling.field);
            if (!next) {
              bookResults(settling);
              cutTo(null, "off");
              return false;
            }
            cutTo(next, how);
            watching = next;
          }
          // The engine note of the car being WATCHED. There is no road bed
          // for a car nobody is in, and this is the one the picture is of.
          audioRef.current?.frame(watching.state, dtFrame);
        }
        renderer.render(watching.state, frozen ? 0 : dtFrame);
        servePendingShot();
        // Only the FEED has instruments to refresh. Behind the card the
        // readouts are the card's. The clock is the same two-channel split
        // the player's own run uses: hundredths every frame, everything else
        // on the HUD's own tick.
        if (how === "feed") readLive(watchLiveRef.current, watching.state);
        hudClock += dtFrame;
        if (hudClock > 0.08) {
          hudClock = 0;
          if (how === "feed") setWatchFace(readFeed(watching));
        }
        return true;
      };

      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        // The phone's frame ceiling (`FRAME_HZ`). `last` only moves on a
        // frame that is KEPT, so the time a skipped one covered is handed to
        // the next one rather than lost — the physics below runs off that
        // same accumulator, so a frame not drawn is a frame with more steps
        // in it, never a slower car.
        if (now - last < frameFloor) return;
        const dtFrame = Math.min(0.1, (now - last) / 1000);
        last = now;
        // The pad is ASKED, once a frame, before anything below can return
        // early: a controller fires no events, so a poll skipped behind the
        // pause card is a pause card nothing on the pad can dismiss.
        // A card on screen takes the pad off the car and puts it on the
        // cursor. Asked before the poll, so the press that opens a menu and
        // the first press inside it can never be the same one.
        input.setNavigating(menuNav.active());
        const padNow = input.pollPads(dtFrame);
        if (padNow !== padWas) {
          padWas = padNow;
          setPadded(padNow);
        }
        // THE BENCHMARK OWNS THE CANVAS while one is up. It pumps its own
        // frames as fast as the machine will draw them, and a frame drawn
        // here between two of those is time the measurement is charged for
        // and did not spend. The pad is still polled above, so the way out
        // of one is a button like anything else.
        if (benchRef.current) return;
        // The cursor is only ever placed for a pad: a focus ring appearing
        // under somebody's mouse is the game moving their cursor for them.
        if (padNow) menuNav.sync();
        fpsFrames++;
        fpsSeconds += dtFrame;
        if (fpsSeconds >= 0.5) {
          fps = fpsFrames / fpsSeconds;
          fpsFrames = 0;
          fpsSeconds = 0;
          fpsRef.current = fps;
        }
        const state = gameRef.current;
        if (!state) return;
        const page = menuRef.current;
        // ALT is a HOLD on the chrome, read here rather than dispatched: it
        // is a state the screen is in, and a press that fired an event would
        // leave the HUD off for good on an alt-tab.
        if (input.altHeld() !== altWas) {
          altWas = input.altHeld();
          setHudHidden(altWas);
        }
        // God mode flies before anything else can return early, and its
        // controls are DRAINED even when they cannot be used: mouse travel
        // and key repeats banked behind a pause card would otherwise all
        // arrive at once the moment the run resumed.
        const flying = godRef.current && page === null;
        if (flying) {
          const move = input.flyMove(dtFrame);
          if (!pausedRef.current) renderer.flyCamera(move);
        }
        // GOD MODE HOLDS THE RUN. Flying is for LOOKING at a moment — the
        // corner that reads wrong, the tree standing in the road, the water
        // that ended up on the wrong side of a ridge — and a moment that
        // drives on while it is being looked at is a moment nobody can fly
        // back to. So the simulation stops for as long as the camera is off
        // the car, and picks up exactly where it was when god mode lands.
        //
        // One exception, and it is the whole of `?bot=1`: a run somebody
        // ELSE is driving is one the camera was sent up to watch get
        // somewhere, so it keeps its time.
        const held = flying && !autopilotRef.current;
        heldRef.current = held;
        // R30 — the run-out, watched. Taken after god mode's controls have
        // been DRAINED above and before the pause card's frozen frame below:
        // watching is neither of those, and its own hold is the same two.
        // The card's own backdrop opens itself here; the feed is a press.
        if (page === null) openBackdrop(state);
        if (spectateFrame(dtFrame, pausedRef.current || held)) return;
        // The pause card is a run that must not tick while the player is
        // reading it — and a paused run is a FROZEN one: rendered with no
        // time passing, so the wheels stop turning, the dust hangs and the
        // camera holds. A frame's worth of dt handed to the renderer over a
        // state that is not moving is a car doing 120 km/h on stopped
        // ground. The Roam page is different: nothing is driving there
        // either, but the map camera is still turning, so it keeps its time.
        if (page === null && (pausedRef.current || held)) {
          acc = 0;
          // …and the one thing that still moves under god mode's hold is the
          // camera, on its own clock: the frame below it is drawn with dt 0,
          // so the flight has no dt to take its step from.
          if (held && !pausedRef.current) renderer.flyFrozen(dtFrame);
          renderer.render(state, 0);
          servePendingShot();
          // The readouts still get read under god mode's hold — over a state
          // that is not moving, so they settle in one pass and cost nothing
          // after it. The overlay is the reason to be up here at all: its
          // REPRO line names where the lens is standing, and a line held
          // still with the run would put whoever pasted it somewhere the
          // picture was never taken from. The pause CARD is the other case
          // and keeps its silence: it stands over a run that has already
          // been read, and the card is what the player is looking at.
          if (held) {
            readLive(liveRef.current, state);
            hudClock += dtFrame;
            if (hudClock > 0.08) {
              hudClock = 0;
              pushHud(state, fps);
            }
          }
          return;
        }
        if (page?.page === "roam") {
          acc = 0;
          renderer.render(state, dtFrame);
          servePendingShot();
          return;
        }
        acc += dtFrame;
        while (acc >= TUNING.dt) {
          acc -= TUNING.dt;
          // Sampled every step whether or not it is the one driving: the
          // pedals and the wheel RAMP, and a sample skipped is a ramp that
          // never moves.
          const human = input.sample(TUNING.dt);
          if (autopilotRef.current && driving(human)) autopilotRef.current = false;
          const driven = page || autopilotRef.current ? botInput(state) : human;
          // R29 — the field takes the same tick, and takes it FIRST: the
          // player is the last car on the road, so a rival through a board on
          // this step was through it before them. They run from the FIRST
          // step of the establishing shot, which is car 14 leaving the
          // control; every crew's own clock started at their own green, and
          // the offset between the fifteen of them is carried by the head
          // start each one was entered owing (standings.ts).
          const running = fieldRef.current;
          // …and they can SEE the player while they do it: handed the car
          // they are racing, a bot goes round it, sits in behind it, or
          // leans on it, depending on the crew (engine/sim/bot.ts). Their
          // own events go to their own bodywork and nowhere else.
          if (running) stepField(running, state, renderer.field.events);
          // The driver's own way out of the ceremony. Taken before the step,
          // so the frame that skips is already a countdown frame — and the
          // field is pushed on by exactly what the player jumped, or the
          // stagger the whole classification rests on quietly shrinks.
          if (state.phase === "intro" && wantsOff(human)) {
            // The camera is told FIRST, while the shot is still up: the
            // engine's skip is one instant jump — the field's stagger
            // depends on it being one — and the camera answers it by flying
            // the rest of the shot quickly rather than cutting.
            renderer.skipIntroShot();
            const jumped = skipIntro(state);
            if (running) advanceField(running, jumped);
            // Not an input, but it moves the whole field's clock, so a replay
            // that missed it would race a stagger nobody drove.
            if (!tapeEndRef.current) tapeRef.current?.skipped();
          }
          const events = step(state, driven);
          if (events.length > 0) handleEvents(state, events);
          // …and then the one place two cars can be in at once.
          if (running) rubField(running, state);
          if (page) continue;
          // The tape is what the ENGINE was handed, so a replay drives the
          // same road; the ghost's own game steps beside it off its own.
          recorderRef.current?.record(driven);
          // …and the same controls again, for the file the developer switch
          // collects. Both tapes are written HERE, off the one input the
          // engine actually received, because a recording taken anywhere
          // else is a recording of something that did not happen.
          if (!tapeEndRef.current) tapeRef.current?.record(driven, state);
          const ghost = ghostRef.current;
          if (ghost) {
            const ghostEvents = step(ghost.state, ghost.tape.at(ghost.at++));
            if (ghostEvents.length > 0) renderer.onGhostEvents(ghost.state, ghostEvents);
          }
        }
        // The head start the field is still owed, in whatever slice of this
        // frame it is allowed. Runs under the establishing shot, which is
        // exactly what the shot is long enough for.
        if (fieldRef.current) catchUpField(fieldRef.current);
        // R30's stragglers are NOT fast-forwarded here. Through the player's
        // own roll-out the field is still taking the same tick they are
        // (`stepField`, in the step loop above), and the moment that beat
        // ends the card's backdrop takes the run-out over at race speed
        // (`openBackdrop`). A frame that also drove them eight hundred steps
        // would have the whole field home before there was anything to
        // watch — which is exactly what the card used to stand over.
        //
        // The one path that still finishes a run-out in one go is the way
        // OUT (`settleNow`): a player pressing on must not cost the field its
        // places.
        //
        // The road bed belongs to a run the player is IN. Behind the menu the
        // stage is scenery under a theme, and an engine bed over the top of
        // that is two pieces of music at once.
        if (!page) audioRef.current?.frame(state, dtFrame);
        renderer.render(state, dtFrame);
        servePendingShot();
        // Every frame, ahead of the throttled snapshot: the clock's
        // hundredths and the start lights are the two things a run cannot
        // read at 12 Hz.
        if (!page) readLive(liveRef.current, state);
        hudClock += dtFrame;
        if (hudClock > 0.08) {
          hudClock = 0;
          if (!page) pushHud(state, fps);
        }
        // The trace: one position line a second, so the log says how the run
        // ARRIVED at whatever the screenshot caught it doing.
        if (!page && debugLogging()) {
          traceClock += dtFrame;
          if (traceClock >= TRACE_PERIOD) {
            traceClock = 0;
            const ctx = debugContextRef.current(fps);
            if (ctx) debugLog("trace", traceLine(ctx, state));
          }
        }
      };
      raf = requestAnimationFrame(frame);
      cleanups.push(() => cancelAnimationFrame(raf));
      // The world is built and the loop is turning: everything the studio
      // card was covering has landed.
      setBooted(true);

      const onResize = (): void => renderer.resize();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      cleanups.push(() => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      });
    });

    return () => {
      disposed = true;
      // LIFO: stop the loop and listeners before the renderer they drive.
      for (const fn of cleanups.reverse()) fn();
      input.dispose();
    };
    // The loop is created once; menu, options, and restarts flow through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WHERE THE RESULTS CARD GOES ON TO. Only the ladder has a next rung:
  // Roam is one stage and a time trial is one stage repeated, so both offer
  // the way out and nothing else. R30 — and the rung into the NEXT country is
  // behind this location's table, so the ladder is asked rather than walked.
  const ladder =
    run.mode === "campaign" && run.levelId
      ? ladderAfter(run.levelId, progress)
      : ({ kind: "end" } as const);
  const upNext = ladder.kind === "next" ? ladder.level : null;
  // R29 — …and only ON THE PODIUM. A stage finished outside the top three
  // is not cleared, so the card that comes up has nowhere to offer: the way
  // on is the same stage again.
  const missedPodium =
    run.mode === "campaign" && snap?.standing != null && snap.standing.place > PODIUM;
  const nextStage =
    upNext && !missedPodium
      ? { name: upNext.name, go: (): void => playLevel(upNext, "campaign") }
      : null;
  // …and when the way on is a country rather than a stage, what is holding
  // it shut. Said only to a player who cleared the stage: one outside the
  // podium is being told to run this one again, and a second lock behind
  // that one is noise.
  const lockedBehind = ladder.kind === "locked" && !missedPodium ? ladder.location.name : null;

  // R30 — THE CARD'S POINTS. The place is worth what the place is worth; the
  // board it went onto is read back out of the campaign's own record, so the
  // total on the card is the total the menu will show. The sheet itself is
  // null until the last car is home (`settleField`), which is what the card's
  // own table waits on.
  const here = run.mode === "campaign" && run.levelId ? findLevel(run.levelId) : null;
  // …and HEADS UP's own, which is the same sheet with the board taken off:
  // where everybody finished, and nothing carried out of the race.
  const headsUp: FinishRace | null =
    run.mode === "headsup" && run.levelId
      ? {
          rows:
            result?.levelId === run.levelId
              ? result.rows.map((row) => ({
                  place: row.place,
                  name: row.alias,
                  time: row.time,
                  you: row.you,
                }))
              : null,
          cars: gridSize(race.headsUp.cars),
          massStart: race.headsUp.massStart,
        }
      : null;
  const campaign: FinishStandings | null = ((): FinishStandings | null => {
    if (!here || !snap?.standing) return null;
    const table = locationStandings(here.location, progress);
    const mine = table.find((row) => row.you) ?? table[table.length - 1];
    const sheet = result?.levelId === here.level.id ? result.rows : null;
    const totals = new Map(table.map((row) => [row.id, row.points]));
    const paid = sheet ? new Map(sheet.map((row) => [row.id, pointsFor(row.place)])) : null;
    const kept = stagePoints(here.level.id, progress)[PLAYER_ID] ?? 0;
    // What the place paid is known AT THE LINE and is already on the board
    // (`recordFinish`), so the card says it while the last cars are still
    // coming home; only the field's own sheet waits for them.
    const scored = pointsFor(snap.standing.place);
    return {
      location: here.location.name,
      points: scored,
      // A re-run that went worse keeps the run that went better (see
      // `recordResult`), and the card says so rather than showing a total
      // that did not move.
      kept: kept > scored ? kept : null,
      total: mine.points,
      place: mine.place,
      tied: mine.tied,
      of: table.length,
      won: sheet !== null && locationWon(here.location, progress),
      rows:
        sheet &&
        sheet.map((row) => ({
          place: row.place,
          name: row.alias,
          time: row.time,
          points: paid?.get(row.id) ?? 0,
          total: totals.get(row.id) ?? 0,
          you: row.you,
        })),
    };
  })();

  // ...and where it goes back to. A TIME TRIAL is one stage run again and
  // again against a board, so the card offers the same stage from the grid
  // — the same road, the same car, a clean clock and a fresh ghost. It is
  // the restart the pause menu and `R` already do, put where a player who
  // has just read their time is looking.
  // …and a campaign run that missed the podium wants exactly the same
  // button: the stage is still there, and the field will run it again.
  // …and a HEADS-UP race wants it for the same reason a time trial does: the
  // race is the whole thing, and the only way on from one is another.
  const onRetry =
    run.mode === "timetrial" || run.mode === "headsup" || missedPodium
      ? (): void => actionsRef.current.restart()
      : null;

  /** THE RUN, AS A FILE. Sealed at the press rather than at the line, which
   * is what lets it carry the field's own result sheet: the stragglers are
   * still coming home when the card comes up, and a classification read
   * before the road is clear would name retirements nobody made. Press it
   * while the sheet still says CARS STILL OUT and the tape simply carries
   * the drive without one. Null unless a tape was collected AND the run
   * reached the line — there is nothing to calibrate against otherwise. */
  const saveRun =
    options.dev.record && tapeRef.current && tapeEndRef.current
      ? (): boolean => {
          const tape = tapeRef.current;
          const end = tapeEndRef.current;
          if (!tape || !end) return false;
          const rivalSplits: Record<string, number[]> = {};
          const field = fieldRef.current;
          if (field) for (const run of field.runs) rivalSplits[run.entry.crew.id] = run.splits;
          const full: RunTapeEnd = { ...end, rows: result?.rows ?? [], rivalSplits };
          return saveRunTape(tape.seal(full), tape.name(full));
        }
      : null;

  // R30 — WHETHER THERE IS ANYTHING TO WATCH. The same condition the FULL
  // RESULTS button is waiting out, read off the same state: a run with a
  // field entered, whose sheet has not landed yet. It is the whole of what
  // the wait is, so it is also the whole of what the offer is.
  const carsStillOut = (campaign !== null || headsUp !== null) && result?.levelId !== run.levelId;
  const onSpectate = carsStillOut ? (): void => watchActionsRef.current.open() : null;
  /** The feed itself, once one is up. `watchFace` is refreshed on the HUD's
   * own tick from inside the loop; the two presses are wired there as well. */
  const spectate: SpectateProps | null = watchFace && {
    watched: watchFace.feed,
    onStep: (by: number): void => watchActionsRef.current.step(by),
    onLeave: (): void => watchActionsRef.current.leave(),
  };

  // The board the results card shows, and the three letters it is waiting on.
  // Entering them writes the row and hands the new board straight back, so the
  // player sees where they landed without the card being rebuilt around them.
  const finishScores: FinishScores | null = scores && {
    board: scores.board,
    place: scores.place,
    entering: scores.pending && {
      initial: scores.pending.offer,
      onDone: (who: string): void => {
        const posted = scores.pending;
        if (!posted) return;
        rememberInitials(who);
        const board = recordScore(posted.levelId, {
          who,
          time: posted.time,
          carId: posted.carId,
          at: Date.now(),
        });
        setScores({ board, place: scores.place, pending: null });
      },
    },
  };

  return (
    <div className="app-root">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onPointerDown={(e) => {
          unlockAudio();
          // Mouse look needs the pointer, and the browser only hands it over
          // inside a gesture. A refusal is not worth reporting: the arrow
          // keys steer the same camera, and they are what a scripted pass
          // uses anyway.
          if (!godRef.current || menuRef.current || pausedRef.current) return;
          void (e.currentTarget as HTMLCanvasElement).requestPointerLock?.();
        }}
      />
      {snap && !menu && !hudHidden && !bench && (
        <Hud
          // WHOSE CAR THE INSTRUMENTS ARE READING. The player's, until a
          // run-out is being watched closely — then it is the crew under the
          // camera, on the same dials, and the layout never has to know.
          snap={watchFace ? watchFace.snap : snap}
          live={watchFace ? watchLiveRef.current : liveRef.current}
          paused={paused}
          flying={godActive}
          flashes={flashes}
          split={split}
          input={input}
          show={options.hud}
          fps={options.developer ? hudFps : null}
          touchLayout={options.touch}
          padDriving={padded && options.pad.hideTouch}
          onPause={() => setPaused(true)}
          onCamera={() => actionsRef.current.camera()}
          onShot={options.screenshots ? () => takeShotRef.current() : null}
          nextStage={nextStage}
          onRetry={onRetry}
          onRetire={goMainMenu}
          scores={finishScores}
          campaign={campaign}
          race={headsUp}
          locked={lockedBehind}
          onSaveRun={saveRun}
          onSpectate={onSpectate}
          watching={watching}
          spectate={spectate}
        />
      )}
      {/* Outside the HUD on purpose: ALT takes the game's chrome off so a
          frame can be judged on its pixels, and a frame nobody can place is
          worth nothing to whoever has to fix it. */}
      {options.dev.debug && debugCtx && gameRef.current && !menu && !bench && (
        <DebugHud ctx={debugCtx} state={gameRef.current} hudHidden={hudHidden} />
      )}
      {/* Flying with the boxes OFF — the picture is wanted whole, and the
          numbers behind it are one press away instead of over it. Never
          alongside the overlay: up there they are already on screen. */}
      {godActive && !options.dev.debug && !paused && !bench && (
        <DebugCopyButton read={() => readDebugRef.current()} />
      )}
      {bench && <BenchmarkCard status={bench} onAgain={startBenchmark} onLeave={leaveBenchmark} />}
      {paused && !menu && !bench && pauseTab === null && (
        <PauseMenu
          seed={stageRef.current?.seed ?? seed}
          carName={carById(race.carId).name}
          dev={options.developer ? options.dev : null}
          onDev={(dev) => applyOptions({ ...options, dev })}
          onResume={() => setPaused(false)}
          onRestart={() => actionsRef.current.restart()}
          onMainMenu={goMainMenu}
          // HUD first: the camera and the instruments are what a player
          // stopped mid-stage to change.
          onOptions={() => setPauseTab("hud")}
        />
      )}
      {/* OPTIONS over the held run. It REPLACES the pause card rather than
          stacking on it: two cards deep is two scrims over the frame the
          player is trying to look at, and the pad's cursor would have to
          choose between them (menu-nav's ROOTS takes the first surface it
          finds). BACK comes straight back here. */}
      {paused && !menu && !bench && pauseTab !== null && (
        <PauseOptions
          tab={pauseTab}
          onTab={setPauseTab}
          settings={options}
          onSettings={applyOptions}
          onBack={() => setPauseTab(null)}
        />
      )}
      {menu && (
        <MainMenu
          page={menu}
          onNavigate={setMenu}
          progress={progress}
          onPlayLevel={playLevel}
          race={race}
          onRace={applyRace}
          seed={seed}
          onSeed={setSeed}
          onPlayRoam={playRoam}
          settings={options}
          onSettings={applyOptions}
          onDeveloper={revealDeveloper}
          onUnlockEverything={() => setProgress(unlockEverything())}
          onResetPoints={(locationId) => setProgress(resetPoints(locationId))}
          onMapRect={setMapRect}
          mapView={mapView}
          mapDebug={options.developer ? mapDebug : null}
          onRoamLevel={loadRoamLevel}
          onBenchmark={startBenchmark}
        />
      )}
      {splashUp && <SplashScreen warm={booted} onDone={() => setSplashUp(false)} />}
      <UpdateCard
        needRefresh={(pwa.needRefresh || forcedUpdate) && !updateDismissed}
        incomingVersion={pwa.incomingVersion ?? (forcedUpdate ? __APP_VERSION__ : null)}
        onReload={pwa.reload}
        onDismiss={() => {
          setUpdateDismissed(true);
          pwa.dismiss();
        }}
      />
    </div>
  );
}
