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
// ?hour=, ?weather=, ?car=, ?length=, ?shape=, ?laps=, ?gearbox=, the generator dials
// ?elevation= ?steepness= ?water= ?trees= ?asphalt= ?width=, ?start=1, ?shot=1 and ?bot=1) pin a
// run for tooling and
// screenshots, and the developer tools add ?debug=1, ?god=1 and the free
// camera's pose (?gx= ?gy= ?gz= ?gyaw= ?gpitch=) — the repro line the debug
// overlay prints is exactly that set, so a screenshot reproduces as a URL.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePwaUpdate } from "./lib/pwa-update.ts";
import {
  weathersIn,
  CARS,
  NUMERIC_KNOBS,
  TUNING,
  botInput,
  carById,
  ARENA_KNOBS,
  DEFAULT_KNOBS,
  GRID_MAX,
  GRID_MIN,
  apronForGrid,
  compileArena,
  compileStage,
  createGame,
  damageScaleFor,
  parseTape,
  placeRun,
  readTape,
  resolveKnobs,
  skipIntro,
  DEFAULT_HOUR,
  DEFAULT_SANDSTORMS,
  status,
  step,
  type CarInput,
  type FiniteStageLength,
  type GameEvent,
  type GameState,
  type GearboxMode,
  type RetireReason,
  type GridSlot,
  type StageLength,
  type StageShape,
  type Difficulty,
  type RunTape,
  type Season,
  type TapePlayer,
  type Track,
  type Weather,
  isBiomeId,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { onShellCommand, shellHost } from "./shell-host.ts";
import { BENCHMARK } from "./game/benchmark-plan.ts";
import {
  runBenchmark,
  warmBenchmark,
  type BenchmarkStatus,
  type BenchmarkWarmup,
} from "./game/benchmark.ts";
import { rememberBenchmark } from "./game/benchmark-history.ts";
import { desktopPicture } from "./game/desktop-video.ts";
import { hourOfWord, parseHour } from "./game/daylight.ts";
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
import {
  Hud,
  HudFlashes,
  damageCall,
  lampCalls,
  overheatCall,
  wheelCall,
  type HudFlash,
  type HudSnapshot,
  type HudSplit,
} from "./game/hud.tsx";
import type { FinishRace, FinishScores, FinishStandings } from "./game/hud-finish.tsx";
import {
  loadSplitRecords,
  postSplitRecord,
  splitStageId,
  type SplitRecords,
} from "./game/split-records.ts";
import { warmPortraits } from "./game/car-portraits.ts";
import { LoadingScreen } from "./game/loading-screen.tsx";
import { loadedTimes, rememberTimes } from "./game/load-times.ts";
import {
  advanceLoad,
  createLoad,
  loadBudgetMs,
  loadPhase,
  loadTimes,
  type LoadJob,
  type LoadPhase,
  type LoadStep,
} from "./game/race-loader.ts";
import type { SheetRow } from "./game/results-sheet.tsx";
import {
  advanceField,
  catchUpField,
  catchUpFrom,
  drainField,
  enterCrew,
  fieldTraced,
  fieldWritten,
  fieldResults,
  livePlace,
  onRoad,
  openField,
  placeAtFinish,
  placeAtSplit,
  placeField,
  rubRivals,
  sealField,
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
  type FieldBuild,
  type FieldPlan,
  type RivalField,
  type RivalRun,
} from "./game/standings.ts";
import { placeFromQuery } from "./game/place-url.ts";
import { readWatch, walkWatch, watchLeader, type Watched } from "./game/spectate.ts";
import type { SpectateProps } from "./game/hud-spectate.tsx";
import {
  createRunTape,
  saveRunTape,
  type RunTapeEnd,
  type RunTapeRecorder,
} from "./game/run-tape.ts";
import { sameStage, type StageSpec } from "./game/stage-spec.ts";
import {
  readReplayMeta,
  replayField,
  replayLine,
  replayStage,
  replayTitle,
  type ReplayMeta,
} from "./game/replay.ts";
import { newReplayId, putReplay, replayTape } from "./game/replay-store.ts";
import { ReplayBar } from "./game/hud-replay.tsx";
import { replayStageName } from "./game/menu-replays.tsx";
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
import { createTrip, type Trip } from "./game/odometer.ts";
import {
  DEFAULT_HEADS_UP,
  DEFAULT_ROAM,
  DEFAULT_STAGE_KNOBS,
  DIFFICULTY_OPTIONS,
  PauseMenu,
  ROAM_OPPONENTS_MAX,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  WEATHERS,
  gridSize,
  raceLaps,
  type PlayMode,
  type RaceSettings,
} from "./game/menu.tsx";
import { MainMenu, type MenuPage } from "./game/main-menu.tsx";
import { demoStage } from "./game/menu-demo.ts";
import { BenchmarkCard } from "./game/menu-bench.tsx";
import type { MapDebug } from "./game/menu-map-viewer.tsx";
import type { MapRect, MapView } from "./game/map-pane.tsx";
import { mapDebugBoxes, mapReproQuery } from "./game/map-debug.ts";
import { MAP_LAYERS, type MapLayerId, type MapLayerInfo } from "./game/map-layers.ts";
import {
  PODIUM,
  findLevel,
  ladderAfter,
  levelLaps,
  loadProgress,
  lockEverything,
  lockLocation,
  locationStandings,
  locationWon,
  pointsFor,
  recordFinish,
  recordResult,
  resetPoints,
  stagePoints,
  unlockEverything,
  unlockLocation,
  type CampaignLevel,
  type CampaignProgress,
  campaignKnobs,
} from "./game/campaign.ts";
import { TRAINING_LEVEL, TRAINING_LOCATION } from "./game/training.ts";
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
  hudShow,
  loadSettings,
  pictureRows,
  saveSettings,
  type DevSettings,
  type PlayCamera,
  type Settings,
  type ViewSettings,
} from "./game/settings.ts";
import { formatTime } from "./lib/util.ts";
import { setAudioVolumes, unlockAudio } from "./game/audio/bus.ts";
import { playUi } from "./game/audio/ui.ts";
import {
  armMenuMusic,
  coastMusic,
  musicPlaying,
  pauseMusic,
  playMusic,
  resumeMusic,
  stageTrack,
  stopMusic,
} from "./game/audio/music.ts";
import type { RunAudio } from "./game/audio/index.ts";
import { runRumble, setRumble } from "./game/haptics.ts";
import { armScreenshots, captureFrame, type Capture, type ShotNotes } from "./game/screenshots.ts";
import { relaySharedTaps } from "./game/second-finger.ts";
import { readHudLayer, type HudLayer } from "./game/shot-hud.ts";
import { beginImageCopy, copiedWithin } from "./lib/share-image.ts";
import { splashSkipped } from "./game/splash.ts";
import { SplashScreen } from "./game/splash-screen.tsx";
import { guardTextInteraction } from "./game/text-interaction.ts";
import { UpdateButton } from "./game/update-button.tsx";

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

/** ?update=1 (tooling): show the new-build button as if a worker were
 * waiting. A real one only appears after a deploy has actually landed on a
 * device that already had the app, which is not a state a screenshot pass
 * can reach — and an interface nobody can look at is an interface nobody
 * maintains. The second press still reloads, so the escape hatch is
 * honest. */
function updateNudgeForced(): boolean {
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

/** ?mode= ?level= ?at= ?paused=1 (tooling): WHERE a `?start=1` link opens.
 * `mode=headsup` opens on a GRID, with the field entered and the whole of it
 * on the road at once, rather than alone on a Roam stage — the grid's own
 * three settings come from the player's HEADS UP page, exactly as they do
 * when a person starts one. `level=` enters the run on a campaign stage, in
 * the campaign unless `mode=` says a time trial, so it has a book to keep
 * and points to pay; and `at=` stands the run at a MOMENT of it — mid-stage,
 * a step short of the line, stopped with a dead engine — instead of on the
 * lights (place-url.ts, over engine/game/place.ts). Read once, like the
 * camera poses below: a link names the frame it was cut for. */
const URL_PLACE = placeFromQuery(location.search);

/** The discipline a link opens in: what it asked for, else the campaign on
 * a link that named a level, else Roam. A heads-up link with a level on it
 * is a heads-up race on that stage, exactly as the HEADS UP page enters
 * one. */
function modeFromUrl(): { mode: PlayMode; levelId?: string } {
  const level = URL_PLACE.levelId ? findLevel(URL_PLACE.levelId) : null;
  const mode = URL_PLACE.mode ?? (level ? "campaign" : "roam");
  return level && mode !== "roam" ? { mode, levelId: level.level.id } : { mode };
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
 * and `?mapfull=1` for the map filling the screen. Both are the DEVELOPER'S
 * MAP VIEWER (menu-map-viewer.tsx) and nothing a player has, so both open
 * that page rather than Roam, and both let the developer menu out for this
 * launch exactly as `?debug=1` does. */
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

/** How many opponents Roam will actually put out — a whole number of them,
 * inside the travel the slider offers. A stored record from a build that
 * offered a different ceiling, or a `?rivals=` off a link, both come through
 * here. */
function clampOpponents(count: number): number {
  return Math.min(ROAM_OPPONENTS_MAX, Math.max(0, Math.round(count)));
}

/** Initial race settings: URL params (tooling) beat the stored choice beats
 * the defaults. Storage can be unavailable (private mode) — defaults are
 * fine. */
function initialRace(): RaceSettings {
  const race: RaceSettings = {
    hour: DEFAULT_HOUR,
    weather: "clear",
    season: "summer",
    temperature: null,
    sandstorms: DEFAULT_SANDSTORMS,
    carId: "compact",
    length: "medium",
    shape: "sprint",
    knobs: { ...DEFAULT_STAGE_KNOBS },
    difficulty: "medium",
    headsUp: { ...DEFAULT_HEADS_UP },
    roam: { ...DEFAULT_ROAM },
  };
  try {
    const stored = localStorage.getItem(RACE_KEY);
    if (stored) Object.assign(race, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  // A record written when a stage was set by a WORD carries `timeOfDay`
  // and no hour: it is read as the hour that light happens at in the
  // season and the country it stored (daylight.ts).
  const legacy = (race as { timeOfDay?: unknown }).timeOfDay;
  if (typeof legacy === "string" && typeof race.hour !== "number") {
    race.hour = hourOfWord(legacy, race.season, race.knobs?.biome ?? "taiga");
  }
  delete (race as { timeOfDay?: unknown }).timeOfDay;
  race.hour = parseHour(race.hour) ?? DEFAULT_HOUR;
  // A record written before HEADS UP existed has no group at all, and one
  // written by a build with fewer settings in it has half a group: both are
  // the defaults with whatever was actually stored laid over them.
  race.headsUp = { ...DEFAULT_HEADS_UP, ...race.headsUp };
  // The heads-up grid is held to what the AUTHORED roster and the rule
  // book's own apron stand (`GRID_MAX`), not to the ceiling `gridSize`
  // allows: the deeper grids are Roam's, and they are built for.
  race.headsUp.cars = gridSize(Math.min(race.headsUp.cars, GRID_MAX));
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.headsUp.difficulty)) {
    race.headsUp.difficulty = DEFAULT_HEADS_UP.difficulty;
  }
  race.roam = { ...DEFAULT_ROAM, ...race.roam };
  race.roam.opponents = clampOpponents(race.roam.opponents);
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === race.length)) race.length = "medium";
  if (!STAGE_SHAPES.some((s) => s.id === race.shape)) race.shape = "sprint";
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.difficulty)) race.difficulty = "medium";
  const params = new URLSearchParams(location.search);
  // ?hour= is the sun's clock at the start (0..24); ?tod= is the word a
  // stage used to be set by, read as the hour that light happens at in the
  // season and the country the link names (daylight.ts).
  const hour = parseHour(params.get("hour"));
  if (hour !== null) race.hour = hour;
  else {
    const tod = params.get("tod");
    if (tod) race.hour = hourOfWord(tod, race.season, race.knobs.biome);
  }
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) race.weather = weather as Weather;
  const season = params.get("season");
  if (SEASONS.some((x) => x.id === season)) race.season = season as Season;
  // ?temp= — the air at the datum, °C (climate.ts); a record from a build
  // with no temperature in it, or anything that is not a number, is AUTO.
  if (race.temperature !== null && !Number.isFinite(race.temperature)) race.temperature = null;
  race.temperature ??= null;
  const temp = params.get("temp");
  if (temp !== null && temp !== "auto" && Number.isFinite(Number(temp))) {
    race.temperature = Number(temp);
  }
  // ?sandstorms= — how often the desert's fronts come, 0..1
  // (game/sandstorm.ts). Clamped rather than rejected: a link from a build
  // with a different band is still asking for "as often as it goes".
  if (!Number.isFinite(race.sandstorms)) race.sandstorms = DEFAULT_SANDSTORMS;
  const storms = params.get("sandstorms");
  if (storms !== null && Number.isFinite(Number(storms))) {
    race.sandstorms = Math.min(1, Math.max(0, Number(storms)));
  }
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
  // ?rivals= — how many cars Roam puts on the road with the player, so a
  // screenshot or a repro of a busy stage can be stood in again.
  const rivals = params.get("rivals");
  if (rivals !== null && Number.isFinite(Number(rivals))) {
    race.roam.opponents = clampOpponents(Number(rivals));
  }
  // The generator's dials, each 0..1 — the tooling pins a stage's character
  // the same way it pins its seed. Read off the ENGINE's list rather than
  // off the menu's rows: a knob the menu does not draw a row for (R21's
  // `width`, now that R46's slider owns it) is still a knob a screenshot
  // has to be able to pin, and the repro line writes every one of them.
  race.knobs = resolveKnobs(race.knobs);
  for (const key of NUMERIC_KNOBS) {
    const raw = params.get(key);
    if (raw !== null && Number.isFinite(Number(raw))) race.knobs[key] = Number(raw);
  }
  // ...and the country (R40), the one dial that is a name. A stored race
  // from a build with no countries in it resolves to the taiga.
  const biome = params.get("biome");
  if (isBiomeId(biome)) race.knobs.biome = biome;
  race.knobs = resolveKnobs(race.knobs);
  // A weather the country does not have (a desert save left on RAIN by a
  // build that offered it) is cleared rather than drawn as something else.
  if (!weathersIn(race.knobs.biome, race.season).includes(race.weather)) race.weather = "clear";
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
  // ?hud=0 — a CLEAN FRAME: the instrument panel and the rear-view glass
  // both off, so a tool photographing the WORLD gets the world and nothing
  // laid over it. Both switches together rather than only the panel, since
  // half a HUD in shot is the same problem as all of it; pinned from the URL
  // for the reason the gearbox is, so a picture does not depend on what the
  // machine taking it happens to have stored. The frame rate is pinned OFF
  // either way: it is the one readout that is about the machine taking the
  // picture rather than about the game in it, and a number that differs on
  // every runner is a number no two shots can be compared across.
  const hud = new URLSearchParams(location.search).get("hud");
  if (hud === "0" || hud === "1") {
    settings.hud = { on: hud === "1", mirror: hud === "1", fps: false };
  }
  // ?drawdistance= — how far the air lets the camera see (OPTIONS ▸ VIDEO's
  // own switch, `DRAW_DISTANCE_SCALE` on the sky preset's fog). The fog is
  // tuned for a driver's eye a metre and a half off the road, where 520 m is
  // a long way; a camera lifted a hundred metres up is looking through four
  // times that at the ground in front of it, and on the stored default the
  // whole middle distance washes out to fog colour. A preview of the COUNTRY
  // asks for the setting a player with a good machine already has.
  const range = new URLSearchParams(location.search).get("drawdistance");
  if (range === "near" || range === "normal" || range === "far") {
    settings.video = { ...settings.video, drawDistance: range };
  }
  return settings;
}

/** Where a `?g…=` link wants god mode's camera parked. Read once: it names
 * the frame the link was made from, and re-applying it every time the
 * camera came back would make the flight impossible to leave. */
const URL_POSE = poseFromUrl();

/** ?freefov= — the LENS god mode's camera wears, deg of vertical fov, or 0
 * for the design one. three's fov is vertical, so a very wide viewport opens
 * the HORIZONTAL field instead of showing more of the same lens, and past
 * about 150° across the ground domes and anything near the edge shears. A
 * tool shooting a wide strip (scripts/biome-preview.mjs) asks for a longer
 * lens here and gets a panorama instead of a fisheye. */
const URL_FREE_FOV = (() => {
  const raw = new URLSearchParams(location.search).get("freefov");
  const deg = Number(raw);
  return raw !== null && Number.isFinite(deg) && deg > 0 && deg < 180 ? deg : 0;
})();

/** ?air= — how far the world is DRAWN for this frame, m, or 0 for the
 * driving distances. OPTIONS ▸ VIDEO's draw distance only scales the fog
 * preset, and its longest setting is still sized to a driver's eye a metre
 * off the road; a camera two hundred metres up with the horizon in frame is
 * looking at kilometres, and on any of them the ground and the roads on it
 * stop partway out with open haze past the end. A still can afford to draw
 * what a run cannot, so the tools ask for it outright. */
const URL_AIR = (() => {
  const raw = new URLSearchParams(location.search).get("air");
  const m = Number(raw);
  return raw !== null && Number.isFinite(m) && m > 0 && m <= 20000 ? m : 0;
})();

/** ...and where a `?m…=` link wants the ROAM MAP framed. Read once for the
 * same reason: it names the picture the link was cut from, and re-applying
 * it every frame would make the map impossible to move. */
const URL_MAP_POSE = mapPoseFromUrl();

/** THE TRAINING GROUND as a stage spec. There is only one of it — the
 * place is authored (`mapgen/arena.ts`), the conditions are fixed, and the
 * only thing a player chooses is the car — so it is stated once here and
 * read by the menu's way in and by a `?mode=training` link alike. */
function trainingSpec(carId: string): StageSpec {
  return {
    arena: true,
    seed: TRAINING_LEVEL.seed,
    length: TRAINING_LEVEL.length,
    shape: "sprint",
    laps: 1,
    // The dials the arena's own country was built with, so the debug
    // overlay states the ground that is actually there.
    knobs: { ...DEFAULT_KNOBS, ...ARENA_KNOBS, biome: TRAINING_LOCATION.biome },
    carId,
    hour: TRAINING_LEVEL.hour,
    weather: TRAINING_LEVEL.weather,
    season: TRAINING_LEVEL.season,
    // Nobody is waiting on the line: the training ground is a place you
    // arrive at, not a stage you are sent down.
    skipCountdown: true,
    grid: null,
  };
}

/** What a menu page wants standing behind it, and how it is framed.
 *
 * `standing` is the stage on screen, for the demo to take its road from —
 * null where the demo is to roll one of its own (see `demoStage`). */
function backdropFor(
  page: MenuPage,
  race: RaceSettings,
  seed: number,
  demoSeed: number,
  standing: StageSpec | null,
) {
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
        hour: race.hour,
        weather: race.weather,
        season: race.season,
        temperature: race.temperature,
        sandstorms: race.sandstorms,
        skipCountdown: true,
        grid: null,
      } satisfies StageSpec,
    };
  }
  return { camera: "drone" as CameraMode, stage: demoStage(race, demoSeed, standing) };
}

/** What a run is CALLED, for the line the log opens with. */
const MODE_NAME: Record<PlayMode, string> = {
  campaign: "Campaign",
  timetrial: "Time trial",
  headsup: "Heads up",
  roam: "Roam",
  training: "Training",
  replay: "Replay",
};

/** HOW MANY CARS a run puts on the road, the player included. One on
 * everything that races alone — a time trial, the training ground, the menu
 * behind a card — which is what makes this the one question the grid, the
 * apron and the entry list are all asked.
 *
 * HEADS UP is held to `GRID_MAX`: the authored roster on the apron the rule
 * book lays. ROAM is not — its slider goes to a full `GRID_CEILING` grid,
 * the stage is compiled with the run-up to stand it (`apronForGrid`) and
 * the roster is dressed out with club entries. */
function fieldCars(race: RaceSettings, mode: PlayMode): number {
  if (mode === "headsup") return gridSize(Math.min(race.headsUp.cars, GRID_MAX));
  if (mode === "roam" && race.roam.opponents > 0) return gridSize(race.roam.opponents + 1);
  return 1;
}

/** HOW THE FIELD IS ENTERED for a run, or null where nobody is entered at
 * all: the campaign runs the whole roster a rally interval apart at the
 * campaign's own difficulty (R29) as GHOSTS — every crew's stage written
 * down before the green, and nothing on the road solid — and every other
 * field in the game is a MASS START with every car solid: that is the
 * discipline where a rival can be leaned on or put in the trees, and one
 * grid and one green is what makes it one. A heads-up race is always that;
 * Roam is that whenever its opponents slider is off zero.
 *
 * An ENDLESS stage takes a mass start but never the campaign's ghosts: a
 * trace is a whole run written down before the green, and a road that never
 * finishes has no such thing to write. */
function fieldPlan(race: RaceSettings, mode: PlayMode, spec: StageSpec): FieldPlan | null {
  if (mode === "campaign") {
    if (spec.length === "endless") return null;
    return { ...RALLY_FIELD, difficulty: runDifficulty(race, mode) };
  }
  const cars = fieldCars(race, mode);
  if (cars < GRID_MIN) return null;
  return { difficulty: runDifficulty(race, mode), cars, massStart: true, contact: true };
}

/** WHERE THE PLAYER STANDS at the green: the back row of the grid on a mass
 * start, and nothing — the line itself, alone — everywhere else. Stated once
 * because three ways into a run ask it, and the apron the stage is built
 * with has to agree with it (`apronForGrid`, off the same `fieldCars`). */
function gridSlotFor(race: RaceSettings, mode: PlayMode): GridSlot | null {
  const cars = fieldCars(race, mode);
  return cars < GRID_MIN ? null : playerSlot(cars);
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

/** THE NEWS COLUMN, at the foot of the screen (`.hud-flashes`). Five lines
 * STAND at a time and each one holds its place for fifteen seconds: news
 * about the car arrives while the driver is busy with a corner, and a line
 * that has come and gone by the time they look up has told nobody anything.
 * Five is what the corner holds at that size without becoming a wall.
 *
 * A sixth line does not wait for the oldest one's clock to run out — it puts
 * it out early, over FLASH_FADE, which is the same fade its own fifteen
 * seconds would have ended in. The CSS runs both fades (`hud-flash-fade`);
 * these numbers only have to agree with it, because the row is dropped when
 * the fade it is playing is over. */
const FLASH_LINES = 5;
const FLASH_LIFE = 15000;
const FLASH_FADE = 400;

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

/** How much of a frame the LOADING BEAT may spend writing the field down,
 * ms. The beat is a held frame with a caption on it, so it is not paying
 * for smoothness: forty is a picture that still answers at twenty-odd
 * frames a second while nearly all of the machine goes on the field. */
const FIELD_HOLD_MS = 40;

/** How long the loading card takes to fade off the road, ms. Must match the
 * `.loading` transition in styles.css, which is what times the unmount
 * behind it. */
const LOAD_FADE_MS = 260;

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
    // `?roam=1` opens the map page. Which of the two it is is decided by the
    // developer's own switches: a line carrying a layer or the full-screen
    // flag is a repro of the VIEWER (see mapReproQuery), and one carrying
    // neither is a player's link to a seed.
    if (params.get("roam") === "1") {
      const viewing = mapFullFromUrl() || mapLayerFromUrl() !== null;
      return viewing ? { page: "roam", viewing: true } : { page: "roam" };
    }
    return params.get("start") === "1" && params.get("menu") !== "1" ? null : { page: "root" };
  });
  const [seed, setSeed] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : dailySeed();
  });
  /** Which stage the menu's demo is on. It rolls forward every time the bot
   * finishes one, so a menu left open keeps showing new road. */
  const [demoSeed, setDemoSeed] = useState(() => dailySeed());
  /** …and that roll is a ONE-SHOT instruction to the backdrop: build the
   * demo's own road rather than take the one standing (`demoStage`). Consumed
   * by the next backdrop, because past it the demo is simply on whatever is
   * there — and because every OTHER way a backdrop is asked for (arriving at
   * a menu page, changing a setting behind one) is one where the road already
   * on screen is the road to keep. */
  const demoRollRef = useRef(false);
  /** The run in progress: how it was entered, and which campaign level it
   * is, so a finish can record the clear. A `?start=1` link never passes
   * through `startStage`, so the discipline it opens in is settled here. */
  const [run, setRun] = useState<{ mode: PlayMode; levelId?: string }>(modeFromUrl);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  /** THE ODOMETER on the tachometer: the lifetime metres of the car being
   * driven, read on the HUD's own tick. Beside the snapshot rather than in
   * it because it belongs to the CAR and not to the run — every discipline
   * feeds the same counter, and a stage walked out of halfway still leaves
   * the kilometres it covered on it (odometer.ts). */
  const [odo, setOdo] = useState<number | null>(null);
  /** The open counter for the car on the road, and the run that is running
   * into it. Replaced whenever a different car is put on the road; the
   * total behind it is written on every hundred metres. */
  const tripRef = useRef<Trip | null>(null);
  /** THE TIME TRIAL'S BOARD, for the run that has just ended. `pending` is the
   * run waiting on its three letters; it is what holds the results card's ways
   * on back until they are typed. Cleared with every start, so a board never
   * outlives the stage it belongs to. */
  const [scores, setScores] = useState<{
    board: readonly ScoreEntry[];
    place: number;
    /** The car, the box and the difficulty the run was driven with, as one
     * line for the card — the same three the row it becomes will carry. */
    drove: string;
    pending: {
      levelId: string;
      time: number;
      carId: string;
      gearbox: GearboxMode;
      difficulty: Difficulty;
      /** When the run ENDED, not when the name was posted: the board shows
       * the row's date while it is being typed, and a stamp taken at the
       * press would change under the player mid-entry. */
      at: number;
      offer: string;
    } | null;
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
  // Up from the first frame on a `?paused=1` link: the card is the one
  // surface a screenshot of it wants, and a press to raise it is a press a
  // scene has to time.
  const [paused, setPaused] = useState(URL_PLACE.paused);
  /** Whether the loading card is up. Two beats, like the splash card: `true`
   * while the load is running, then `"leaving"` for the fade that hands the
   * road over — the run is LIVE under a leaving card, which is what makes
   * the lights the first thing a player sees rather than the second. */
  const [loading, setLoading] = useState<boolean | "leaving">(false);
  /** What the loading card says it is doing, and where that sits in the count
   * (`race-loader.ts`). Null before the first load of the session, and while
   * the same card is standing in for a lost GPU context. */
  const [cardPhase, setCardPhase] = useState<LoadPhase | null>(null);
  /** True while the GPU has the WebGL context and the page does not — see
   * `gpu-context.ts`. Nothing can be drawn, so the frame loop holds and the
   * cover goes up; the ref is what the loop reads, since the loop is built
   * once and never sees a re-render. */
  const [gpuLost, setGpuLost] = useState(false);
  const gpuLostRef = useRef(false);
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
   * minimap, which only the players who asked for it (OPTIONS ▸ HUD ▸ FPS)
   * ever see. Its own state rather than a field of the HUD snapshot: the
   * snapshot is what the CAR is doing, and this is what the machine drawing
   * it is doing. Written on the HUD's twelve-a-second tick, and only while
   * there is somebody to read it. */
  const [hudFps, setHudFps] = useState(0);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  /** The same column in a ref, because every line's own timer expires it
   * from outside the render: `flash` has to read the column that is UP to
   * decide whether the line it is adding pushes an old one out. */
  const flashesRef = useRef<HudFlash[]>([]);
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
  /** R28 — THE SEGMENT RECORDS: the quickest this machine has ever covered
   * the road between one board and the next, and the race clock at the last
   * board so the segment can be measured off it. Kept for the run rather
   * than read back off storage per board, so a machine that cannot store
   * anything still calls the records set this session. `id` is empty on a
   * stage that keeps no book at all (`armSplitRecords`). */
  const recordsRef = useRef<{ id: string; best: SplitRecords; lastBoard: number }>({
    id: "",
    best: [],
    lastBoard: 0,
  });
  /** R29 — THE FIELD: fourteen rival games on the same road, stepped beside
   * the player's. Null on every run with nobody entered (Roam, time trial,
   * the menu's demo). */
  const fieldRef = useRef<RivalField | null>(null);
  /** THE RACE BEING STOOD UP, and null whenever one is not (`race-loader.ts`).
   * The frame loop hands it whole frames for as long as it is here, and draws
   * nothing else while it does: there is a card over the canvas. */
  const loadRef = useRef<LoadJob | null>(null);
  /** What to run on the frame the load finishes, for the one caller that
   * cannot simply be handed a run and left to it. */
  const loadDoneRef = useRef<(() => void) | null>(null);
  /** Whether the loading card has had a frame to be DRAWN in. The first
   * step of a load compiles a road and holds the frame it does it in, so
   * starting one on the same frame the card is mounted would paint the card
   * after the freeze it exists to cover — which is the bug, with an extra
   * component. So the driver spends one frame doing nothing at all. */
  const loadShownRef = useRef(false);
  /** Which phase of the load the card is naming (`loadPhase`). Held in a ref
   * beside the state because the loop reads it every frame and must be able
   * to tell a phase CHANGE from the many frames still on the same one — both
   * so the card is re-rendered once per phase rather than once per frame, and
   * because a change is what buys the phase a frame to be drawn in. */
  const cardPhaseRef = useRef<LoadPhase | null>(null);
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
  /** Why the run ended short of the line, once it has (`retire`): what the
   * card says over a car that is never going to move again. Null on a run
   * still going, and on one that reached the line. */
  const retiredRef = useRef<RetireReason | null>(null);
  /** The controls of the run being driven, written down step by step so a
   * time worth keeping can be raced against later. Null on a stage that
   * keeps no time — Roam, and the menu's demo. */
  const recorderRef = useRef<GhostRecorder | null>(null);
  /** The ghost being raced: its OWN game, stepped from the tape beside the
   * player's, plus how far into the tape that game has got. Two games, one
   * track, and nothing between them — the cars cannot touch, because
   * neither one is in the other's world. */
  const ghostRef = useRef<{ state: GameState; tape: GhostTape; at: number } | null>(null);
  /** Whether the stage being driven HAS a ghost on file that still describes
   * it. A best time is normally what decides whether a run is kept, but a
   * stage with a time and no tape — a board carried over from a build whose
   * tapes this one cannot read — would then keep no ghost until the day
   * somebody beat their own record. Read at the line (see the finish
   * handler); armed with the ghost. */
  const ghostOnFileRef = useRef(false);
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
  /** THE REPLAY ON SCREEN, when the run being watched is a recorded one
   * (game/replay.ts). The tape has the wheel: the frame loop hands the engine
   * the controls this recording was driven on instead of the player's, and
   * everything else about the run — the stage, the car, the field, the
   * physics — is the same code doing the same work, which is what makes the
   * picture the run rather than a picture OF the run.
   *
   * `at` is how many steps of it have been driven, and it is the only piece
   * of this that moves. Null on every run the player is actually driving. */
  const replayRef = useRef<{
    /** What it is filed under, minted at the press whether or not it is ever
     * kept, so the disk can be pressed twice without doubling the row. */
    id: string;
    meta: ReplayMeta;
    /** The tape as JSONL, held so the disk files what is being watched
     * rather than re-sealing a recorder that is no longer running. */
    text: string;
    player: TapePlayer;
    /** The field the run was driven against, re-entered for the watching. */
    plan: FieldPlan | null;
    at: number;
  } | null>(null);
  /** ...and the strip over it (hud-replay.tsx): what is being watched, and
   * whether it has been kept. State rather than a ref because the disk's own
   * press is what changes it. */
  const [replaying, setReplaying] = useState<{ meta: ReplayMeta; kept: boolean } | null>(null);
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
  /** The camera the run would be watched from if god mode landed right now.
   * Tracked here rather than read back off the renderer because the free
   * camera has REPLACED the mode there — the ladder the camera key walks is
   * the app's memory, not the renderer's. */
  const playCameraRef = useRef<PlayCamera>(options.camera);
  /** The same camera as the HUD sees it, so the cluster can stand down
   * while the player is sat in the car. Written wherever the ref is. */
  const [hudCamera, setHudCamera] = useState<PlayCamera>(options.camera);
  const pickPlayCamera = (cam: PlayCamera): void => {
    playCameraRef.current = cam;
    setHudCamera(cam);
  };
  /** God mode and the overlay, as the frame loop sees them. */
  const godRef = useRef(false);
  const debugRef = useRef(options.dev.debug);
  debugRef.current = options.dev.debug;
  /** Which parts of the HUD the player's switches leave up. Worked out once
   * here so the readout and the frame loop that feeds it read the same
   * answer. */
  const hudParts = hudShow(options.hud);
  /** ...and whether the frame rate is one of them, as the frame loop sees
   * it: a rate nobody is looking at is a state that should not be written
   * twelve times a second. */
  const hudFpsRef = useRef(hudParts.fps);
  hudFpsRef.current = hudParts.fps;
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
   * frame and its instruments. `hud` is those instruments, serialized at
   * the press for the same reason the boxes are — both are DOM, and neither
   * is in the drawing buffer the frame comes off (shot-hud.ts). `done` is
   * how whoever asked finds out — the capture happens frames later, in the
   * loop, and it is the only place that ever holds the finished picture. */
  const shotRef = useRef<{
    label: string;
    notes: ShotNotes | null;
    /** Whether the app's MARK goes in the corner (screenshots.ts). Off for
     * a developer's picture: the mark is there to say where a shared frame
     * came from, and a debug capture is evidence — it is read for the boxes
     * and the repro line, and a badge over the bottom-right corner is one
     * more thing sitting on the subject. */
    sign: boolean;
    hud: HudLayer | null;
    done?: (capture: Capture | null) => void;
  } | null>(null);

  // Off in dev, and off inside the desktop app: there the site is bundled
  // and served off local disk, so the bundle is the update and a worker
  // precaching it would only ever prompt about a build it already is.
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV && shellHost() === null,
  });
  const forcedUpdate = useMemo(() => updateNudgeForced(), []);

  const flash = (text: string, tone: HudFlash["tone"]): void => {
    const put = (column: HudFlash[]): void => {
      flashesRef.current = column;
      setFlashes(column);
    };
    const drop = (gone: number): void => put(flashesRef.current.filter((f) => f.id !== gone));
    const id = ++flashId;
    const column: HudFlash[] = [...flashesRef.current, { id, text, tone }];
    // Only the newest five STAND; anything this line has pushed past the top
    // of the stack starts fading now instead of sitting out its fifteen.
    const standing = column.filter((f) => !f.out);
    const pushed = new Set(
      standing.slice(0, Math.max(0, standing.length - FLASH_LINES)).map((f) => f.id),
    );
    put(
      pushed.size === 0 ? column : column.map((f) => (pushed.has(f.id) ? { ...f, out: true } : f)),
    );
    for (const gone of pushed) setTimeout(() => drop(gone), FLASH_FADE);
    // The line's own clock. The CSS fades it out over the last of these, so
    // the row is already invisible by the time it leaves the column.
    setTimeout(() => drop(id), FLASH_LIFE);
  };

  /** Whether the rear-view glass has the road in it, this session. The HUD
   * option decides whether the game has a mirror at all; this is the press on
   * the glass itself (hud-mirror.tsx), and it only ever takes the RENDERING
   * down — the glass stays where it hung, grey, and is the whole of what has
   * to be found to bring the picture back. Deliberately not saved: blanking
   * the mirror over one jump says nothing about what the player wants the
   * next time the game is opened, and the menu is where a mirror is switched
   * off for good.
   *
   * The switch says so on the glass rather than in the flash column: the
   * words belong on the thing that changed, and a grey strip at the top of
   * the frame has to carry its own explanation for as long as it is up. */
  const [mirrorLive, setMirrorLive] = useState(true);
  const mirrorLiveRef = useRef(true);
  const toggleMirror = (): void => {
    const live = !mirrorLiveRef.current;
    mirrorLiveRef.current = live;
    setMirrorLive(live);
    rendererRef.current?.setMirror(live && optionsRef.current.hud.mirror);
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
   * THREE THINGS RIDE ON THE PRESS ITSELF and cannot wait for the frame:
   *
   * The HUD. It is DOM over the canvas, so none of it is in the drawing
   * buffer the picture comes off, and it is rasterized in afterwards
   * (shot-hud.ts) — but WHICH HUD is decided here, because the clock, the
   * call and the place the picture has to carry are the ones that were on
   * screen when the button went down. Null while ALT has the instruments
   * down, which is still the fastest way to a frame on its own.
   *
   * The DEBUG BOXES, when the overlay is up. Same reason, one layer up:
   * read here rather than in the loop because this is the moment the shutter
   * was pressed, and a flying camera has moved by the time the frame is
   * served.
   *
   * The CLIPBOARD, when the player asked for it. `write` wants the gesture's
   * transient activation, which the encode outlives, so the claim is staked
   * inside the press and the picture is handed over afterwards
   * (lib/share-image.ts). */
  const takeShot = (): void => {
    // A press always gets an answer. The switch is in OPTIONS and the key is
    // not, so a shutter that has been turned off is a key that does nothing
    // at all — and the one press nobody can afford to guess about is the one
    // that was meant to record something.
    if (!optionsRef.current.screenshots) {
      flash("SCREENSHOTS ARE OFF · OPTIONS", "bad");
      return;
    }
    // Not behind the menu: that frame is the drone circling a stage nobody
    // is driving, with a card over half of it. Nothing is said, because
    // nothing would be seen — the news column is the HUD's, and the HUD is
    // down under a card.
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
      sign: !debugRef.current,
      hud: readHudLayer(),
      done: (capture) => {
        if (!copy) {
          flash(capture ? "PICTURE SAVED" : "PICTURE FAILED", capture ? "good" : "bad");
          return;
        }
        copy.settle(capture?.blob ?? null);
        // ONE receipt, and it waits for the clipboard — but not forever
        // (`copiedWithin`): a picture the player meant to paste is not saved
        // until it is pasteable, and two flashes for one press is the HUD
        // talking to itself, but a write that never answers must not be able
        // to swallow the whole reply. The wait is the write, not the encode —
        // the blob is already in hand by here.
        void copiedWithin(copy).then((copied) => {
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
    // THE READING IS THE SEGMENT — the road since the last board, which is
    // the piece of stage that has just been driven. Off the run's own clock
    // rather than off `checkpointTimes`, so a board missed and driven back
    // to (R28) measures from wherever the last one actually was.
    const book = recordsRef.current;
    const segment = Math.max(0, time - book.lastBoard);
    book.lastBoard = time;
    // Boards are numbered on the LAP, and so are the records: on a circuit
    // the road between board two and board three is the same road every time
    // round, and a record kept per board of the whole RUN would give a
    // three-lap stage three books that never meet.
    //
    // God mode posts nothing. A car that can be flown to the next board is
    // not driving to it, and a record it left behind could never be taken
    // off the stage again.
    const record =
      book.id !== "" && !godRef.current && postSplitRecord(book.id, book.best, index - 1, segment);
    setSplit({
      id: ++flashId,
      index,
      count,
      time,
      segment,
      delta: reference === null ? null : time - reference.time,
      against: reference?.against ?? "",
      record,
    });
  };

  /** (Re)build the run for a stage spec, unless that exact stage is already
   * standing. The compiled track is cached per seed and length, so changing
   * only the light re-lights instead of rebuilding the world. */
  /** COMPILE THIS STAGE'S ROAD into the cache, unless the one standing there
   * is already it. The most expensive single thing the generator does, and
   * the first thing a race needs — so it is its own step of the load
   * (`race-loader.ts`), and `applyStage` below finds the cache warm.
   *
   * The KEY is what makes two requests the same stage. An endless track is
   * never reused: a restart must begin from a fresh opening window, not from
   * however far the last run streamed (the renderer has long since dropped
   * the world around the start). */
  const ensureTrack = (spec: StageSpec): Track => {
    // R24 — how much run-up this stage is built with: enough to stand the
    // whole grid behind the gate. It is part of the compiled track, so it
    // is part of the key: the same seed asked for with a deeper field is a
    // stage with more road behind its start line.
    const apron = apronForGrid(spec.cars ?? 1);
    const key = spec.arena
      ? `arena/${spec.seed}`
      : `${spec.seed}/${spec.length}/${spec.shape}/${spec.knobs.biome}/${NUMERIC_KNOBS.map((knob) => spec.knobs[knob]).join(",")}` +
        // The climate is part of the ROAD (climate.ts): the same seed in
        // winter is the same route made of snow, and that is a different
        // compiled track.
        `/${spec.season}/${spec.temperature ?? "auto"}/${apron}`;
    const held = trackRef.current;
    if (held && held.key === key && spec.length !== "endless") return held.track;
    trackRef.current = {
      key,
      track: spec.arena
        ? compileArena(spec.seed)
        : compileStage(
            spec.seed,
            spec.length,
            spec.knobs,
            spec.shape,
            { season: spec.season, temperature: spec.temperature },
            apron,
          ),
    };
    return trackRef.current.track;
  };
  const ensureTrackRef = useRef(ensureTrack);
  ensureTrackRef.current = ensureTrack;

  const applyStage = (spec: StageSpec, force = false): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!force && sameStage(stageRef.current, spec)) return;
    stageRef.current = spec;
    const track = ensureTrack(spec);
    finishTimeRef.current = null;
    retiredRef.current = null;
    // THE CAR'S COUNTER FOLLOWS THE CAR. A different car is a different
    // life, so the one being left is written out and the one arriving is
    // read in; the same car staged again (a restart, the next stage of a
    // location) keeps the counter it already has, running. Either way the
    // trip is held: the run about to be built starts from zero metres, and
    // what the LAST one covered has already been banked.
    if (tripRef.current?.carId !== spec.carId) {
      tripRef.current?.flush();
      tripRef.current = createTrip(spec.carId);
    }
    tripRef.current.hold();
    setOdo(tripRef.current.total());
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
      track,
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
      // driven — unless the stage pins one, which a REPLAY does: it is the
      // one difficulty setting that reaches the physics, so a recording
      // re-driven at another one bends a different amount of metal. The
      // rivals are never scaled (`createField`): what the crews do to each
      // other is the simulation being honest.
      damageScale:
        spec.damageScale ?? damageScaleFor(runDifficulty(raceRef.current, runRef.current.mode)),
      env: {
        hour: spec.hour,
        weather: spec.weather,
        season: spec.season,
        sandstorms: spec.sandstorms,
      },
    });
    const previous = gameRef.current;
    gameRef.current = state;
    // A different track object (new seed OR new length) is a different
    // world, and the only thing worth rebuilding one for. A different car on
    // the same road is a body swap — and so is a RUN STARTING (`force`): the
    // engine hands over a car with a clean ledger, but the body standing in
    // the scene is still bent, still missing whatever it lost, and still
    // wearing the last attempt's dirt, none of which is re-derived from the
    // ledger per frame. Everything else — the light, the weather — is a
    // re-light.
    if (!previous || previous.track !== state.track) renderer.setGame(state);
    else if (force || previous.spec.id !== spec.carId) renderer.setCar(state);
    else renderer.setConditions(state);
    setSnap(takeSnapshot(state, paceRef.current, null, null, bookRef.current));
    // The score is a function of the stage — its country, its sky, its
    // shape — so it is picked here, where the stage is. Behind a menu the
    // stage is scenery under the menu's own theme, and behind the LOADING
    // CARD the player has not arrived anywhere yet either: whatever they
    // pressed start under carries them across, and `endLoad` hands over at
    // the lights. Silence is the one thing worth interrupting a load for —
    // a restart from the results card comes in with the finish sting having
    // stopped the score, and there is nothing to carry.
    if (menuRef.current === null && (loadRef.current === null || !musicPlaying())) {
      playMusic(stageTrack(state));
    }
  };
  const applyStageRef = useRef(applyStage);
  applyStageRef.current = applyStage;

  /** Play the score of whatever stage is standing. Every path that leaves
   * the menu for a run — and every restart — goes through here, so a stage
   * re-lit in the rain gets the rain's score without a rebuild. */
  const stageMusic = (): void => {
    // Not while a race is being stood up: the card is not a place the player
    // has arrived at, and `endLoad` is what hands the theme over once it
    // lifts. Every path out of the menu goes through here and every one of
    // them is a load, so this is the guard that keeps the menu's theme
    // playing across the card.
    if (loadRef.current) return;
    const state = gameRef.current;
    playMusic(state ? stageTrack(state) : "taiga");
  };
  const stageMusicRef = useRef(stageMusic);
  stageMusicRef.current = stageMusic;

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
   * own size and its own start type; ROAM enters whatever its opponents
   * slider asks for, on one grid, and nothing at all where it is at zero —
   * which is where it stands until a player moves it. Nobody is entered in
   * a time trial, on the training ground or behind the menu. Called on every
   * start AND every restart — a field carried over from the last attempt
   * would be a dozen cars already halfway down the road. */
  /** Take the LAST attempt's field off the road. Every path that enters one
   * runs this first, whether or not it goes on to enter another. */
  const clearField = (): void => {
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
  };

  /** DRAW UP the entry list for a run, with nobody's game built yet — the
   * crews go in one at a time (`enterCrew`), which is what lets the loading
   * card pay for fourteen of them a crew at a time rather than in one lump.
   * Null wherever nobody is entered: a time trial, the training ground, a
   * Roam stage with the opponents slider at zero, or behind the menu. */
  const openFieldFor = (spec: StageSpec, mode: PlayMode, plan?: FieldPlan): FieldBuild | null => {
    if (!trackRef.current || menuRef.current) return null;
    // …unless the caller states the entry list itself. Only the benchmark
    // does: a measurement cannot be entered off settings the player is free
    // to move, or two runs of it are two different races.
    const entry = plan ?? fieldPlan(raceRef.current, mode, spec);
    if (!entry) return null;
    return openField(trackRef.current.track, entry, {
      seed: spec.seed,
      laps: spec.laps,
      hour: spec.hour,
      weather: spec.weather,
      season: spec.season,
    });
  };

  /** Put the built field on the road. */
  const installField = (build: FieldBuild): void => {
    const race = raceRef.current;
    const field = sealField(build);
    fieldRef.current = field;
    // The cars themselves. Nothing is built until a crew comes within reach
    // (field-cars.ts), so entering a field costs the fourteen games and no
    // geometry at all until one of them is actually somewhere you can see.
    rendererRef.current?.field.set(field.runs);
    // …and their PORTRAITS, for the results sheet at the end of this stage
    // (car-portraits.ts). Behind the loading card they are ordered AND taken
    // before the lights; on the paths that do not load — a tooling link —
    // they are taken one per idle slot under the establishing shot instead.
    warmPortraits([
      { carId: race.carId, crewId: PLAYER_ID, number: field.playerNumber, you: true },
      ...field.runs.map((run) => ({
        carId: run.entry.crew.carId,
        crewId: run.entry.crew.id,
        number: run.entry.number,
        you: false,
      })),
    ]);
    // Last car on the road until a board says otherwise — which is the truth
    // on the grid, not a placeholder.
    standingRef.current = { place: field.playerNumber, of: field.of };
  };

  /** R29 in one call: the whole field entered where nobody is holding a
   * frame. The loading card takes the same three steps apart so it can draw
   * between them (`race-loader.ts`); this is the path for everything that
   * does not load — a tooling `?start=1` link, and the boot stage. */
  const armField = (spec: StageSpec, mode: PlayMode, plan?: FieldPlan): void => {
    clearField();
    const build = openFieldFor(spec, mode, plan);
    if (!build) return;
    while (enterCrew(build));
    installField(build);
  };
  const armFieldRef = useRef(armField);
  armFieldRef.current = armField;

  /** R28 — open this stage's record book. Called wherever the splits are
   * reset, because the segment times are read off the same boards: a book
   * carried over from the last attempt would measure the first segment of
   * this run off the last one's clock.
   *
   * An ENDLESS stage keeps none. Its boards are laid as the road streams, so
   * how far in a given board number stands depends on how far the run got —
   * there is no fixed piece of road for a record to be a record OF. Nor does
   * the training ground, which is not a stage and has no boards on it.
   *
   * ROAM keeps none either, and for a different reason: it is the page where
   * the stage itself is being tried on. A seed, a length, a country and six
   * dials are all a press away, so the road under a board is never the road
   * a driver is settling into — and NEW RECORD! beside a split nobody was
   * chasing reads as noise rather than as the reward it is on a stage that
   * is driven again and again. */
  const armSplitRecords = (spec: StageSpec, mode: PlayMode): void => {
    const kept = !spec.arena && spec.length !== "endless" && mode !== "roam";
    const id = kept ? splitStageId(spec) : "";
    recordsRef.current = { id, best: id === "" ? [] : loadSplitRecords(id), lastBoard: 0 };
  };

  const armGhost = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
    const renderer = rendererRef.current;
    recorderRef.current = null;
    ghostRef.current = null;
    splitsRef.current = { times: [], against: "" };
    armSplitRecords(spec, mode);
    setSplit(null);
    // The news column goes with it. A line stands for fifteen seconds now,
    // which is long enough to outlive the run it was about: a restart whose
    // first corner is read past LEFT REAR WHEEL OFF from the attempt before
    // is a HUD lying about the car under the player.
    flashesRef.current = [];
    setFlashes([]);
    renderer?.setGhost(null);
    ghostOnFileRef.current = false;
    if (!renderer || !trackRef.current || menuRef.current) return;
    if (!levelId || spec.length === "endless") return;
    // The ceremony the run is about to sit through is part of the recording:
    // a tape whose header said the lights ran would replay ten seconds of
    // driving under a countdown that never happened.
    recorderRef.current = createGhostRecorder({
      skipCountdown: spec.skipCountdown || godRef.current,
    });
    const stage: GhostStage = {
      seed: spec.seed,
      length: spec.length as FiniteStageLength,
      knobs: spec.knobs,
      hour: spec.hour,
      weather: spec.weather,
      season: spec.season,
      temperature: spec.temperature ?? null,
    };
    const saved = loadGhost(levelId);
    if (!saved || !ghostMatches(saved, stage)) return;
    ghostOnFileRef.current = true;
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
      // The run's OWN opening, off the tape — not this attempt's. Step 0 has
      // to mean the same moment in both games, and whether there was a
      // countdown at all is the first thing that decides it.
      skipCountdown: saved.skipCountdown,
      env: {
        hour: spec.hour,
        weather: spec.weather,
        season: spec.season,
        sandstorms: spec.sandstorms,
      },
    });
    ghostRef.current = { state, tape: readGhost(saved), at: 0 };
    renderer.setGhost(state);
    status(`Ghost: your ${saved.time.toFixed(2)} s in the ${carById(saved.carId).name}`);
  };
  const armGhostRef = useRef(armGhost);
  armGhostRef.current = armGhost;

  /** ARM THE RUN TAPE. Every real run is recorded, because a recorder armed
   * after the fact records nothing: the tape is what a REPLAY is made of
   * (`game/replay.ts`), and the offer to watch the run just driven has to be
   * there whether or not the player knew they would want it.
   *
   * Called on every start AND every restart, for the same reason the ghost
   * is: a tape carried over from the last attempt would be one run's controls
   * under another run's clock.
   *
   * Nothing is armed behind the menu, where the stage is scenery a bot is
   * driving — nor over a REPLAY, which is a recording being watched and has
   * nothing new to record.
   *
   * WHAT THE HEADER OWES is everything a rebuild cannot re-derive, and every
   * field of it is read off what `applyStage` actually handed the engine
   * rather than off what the menu asked for: the box the car is in, the
   * ceremony god mode skipped, the damage scale the difficulty bought, and
   * the field's own plan. */
  const armTape = (spec: StageSpec, mode: PlayMode, levelId?: string, plan?: FieldPlan): void => {
    tapeRef.current = null;
    tapeEndRef.current = null;
    if (menuRef.current || mode === "replay") return;
    tapeRef.current = createRunTape({
      seed: spec.seed,
      length: spec.length,
      shape: spec.shape,
      laps: spec.laps,
      knobs: spec.knobs,
      carId: spec.carId,
      gearbox: spec.gearbox ?? optionsRef.current.gearbox,
      hour: spec.hour,
      weather: spec.weather,
      season: spec.season,
      temperature: spec.temperature ?? null,
      ...(spec.sandstorms === undefined ? {} : { sandstorms: spec.sandstorms }),
      ...(spec.arena ? { arena: true } : {}),
      damageScale: spec.damageScale ?? damageScaleFor(runDifficulty(raceRef.current, mode)),
      skipCountdown: spec.skipCountdown || godRef.current,
      grid: spec.grid,
      mode,
      ...(levelId ? { levelId } : {}),
      // The plan the field was actually entered on — the caller's, where it
      // stated one (the benchmark), and the settings-derived one otherwise.
      // Null on a run with nobody on the road, which is what `fieldPlan`
      // hands back for it.
      field: plan ?? fieldPlan(raceRef.current, mode, spec),
    });
  };
  const armTapeRef = useRef(armTape);
  armTapeRef.current = armTape;

  /** Put the backdrop the current menu page asks for on screen. */
  const showBackdrop = (page: MenuPage): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    // The demo's roll is spent here and nowhere else: what the backdrop is
    // asked for after it is whatever this one leaves standing.
    const rolled = demoRollRef.current;
    demoRollRef.current = false;
    const backdrop = backdropFor(
      page,
      raceRef.current,
      seedRef.current,
      demoSeedRef.current,
      rolled ? null : stageRef.current,
    );
    applyStageRef.current(backdrop.stage);
    renderer.setCamera(backdrop.camera);
  };
  const showBackdropRef = useRef(showBackdrop);
  showBackdropRef.current = showBackdrop;

  /** Leave whatever is on screen for the main menu, with its demo behind it.
   * The run's tape and its ghost go with it: a stage abandoned halfway is
   * not a time, and the demo behind the cards races nobody. So does a REPLAY
   * — a recording nobody is watching any more is not on screen, and one that
   * was never kept is gone for good, which is the bargain the disk offers. */
  const goMainMenu = (): void => {
    setPaused(false);
    setScores(null);
    recorderRef.current = null;
    ghostRef.current = null;
    replayRef.current = null;
    setReplaying(null);
    fieldRef.current = null;
    standingRef.current = null;
    // Same bargain as a restart: the stage the player just drove keeps its
    // classification, whether or not they stayed to watch it decided.
    watchActionsRef.current.close();
    settleRef.current = null;
    setResult(null);
    rendererRef.current?.setGhost(null);
    rendererRef.current?.field.clear();
    // The run's noise goes with the run. The frame loop hushes the beds for
    // as long as a menu is up, but a stage walked out of halfway is over:
    // its countdown, its whistle and its engine note are not owed to the
    // demo now driving behind the cards, nor to whatever is started next.
    audioRef.current?.reset();
    setMenu({ page: "root" });
  };

  /** THE PREPARATION A RACE NEEDS, cut into steps and put behind the loading
   * card (`race-loader.ts`, `loading-screen.tsx`).
   *
   * The order is a dependency chain and not a preference: the road has to be
   * compiled before a car can be put on it, the world built before its
   * shaders can be compiled, and the field entered before its crews can be
   * driven. What each step cost when it was last MEASURED — the campaign's
   * first stage, a quick desktop, the debug log's own `load` line, which is
   * where to read these again rather than guess at them:
   *
   *   road      219 ms   whole, the generator compiling the route
   *   world     333 ms   whole, the game state and the country and its forest
   *   crews     508 ms   fourteen games, cut a crew to a slice
   *   enter       1 ms
   *   drive    2391 ms   fourteen whole stages DRIVEN, cut by the frame
   *   ghost/tape  1 ms
   *   warm     1130 ms   whole, every shader the stage is about to need
   *
   * `drive` is over half of it and cuts cleanly, so most of a load is frames
   * the card is free to draw in. The steps that cannot be cut hold a frame
   * each; that is the honest cost of work that cannot be halved, and the
   * reason to keep an eye on `warm`, which is the biggest of them. */
  const beginLoad = (
    spec: StageSpec,
    mode: PlayMode,
    levelId?: string,
    plan?: FieldPlan,
    done?: () => void,
    extra: readonly LoadStep[] = [],
  ): void => {
    // The field being replaced comes off the road NOW rather than inside the
    // load: a run being abandoned has a classification to finish writing
    // (`clearField`), and it belongs to the press that abandoned it.
    clearField();
    let build: FieldBuild | null = null;
    const steps: LoadStep[] = [
      { id: "road", label: "Plotting the route", run: () => (ensureTrack(spec), false) },
      // The car, the world, the light and the score. `applyStage` finds the
      // road above already compiled and cached, so what is left here is the
      // game state and the renderer's world.
      { id: "world", label: "Building the country", run: () => (applyStage(spec, true), false) },
      {
        id: "crews",
        label: "Entering the field",
        // The entry list is the denominator, and the crews come off it one at
        // a time — the one phase of the load that can count itself exactly.
        progress: () => (build ? build.next / build.entries.length : 0),
        run: () => {
          build ??= openFieldFor(spec, mode, plan);
          // A run with nobody entered — a time trial, the training ground,
          // Roam with the slider at zero — has no crews and no traces, and
          // is a load of the road and the world alone.
          return build !== null && enterCrew(build);
        },
      },
      {
        id: "enter",
        label: "Entering the field",
        run: () => (build && installField(build), false),
      },
      // R29 — every crew's whole stage, written down before the lights. The
      // one step that is genuinely long, and the one that cuts cleanly: the
      // engine has taken a budget for it since the establishing shot was
      // what hid it.
      {
        id: "drive",
        label: "Timing the opposition",
        // Road written, not crews finished — every crew is written a slice at
        // a time, so they all reach the line together and a count of finished
        // ones would sit at nothing and then jump (`fieldWritten`).
        progress: () => {
          const field = fieldRef.current;
          return field === null ? 0 : fieldWritten(field);
        },
        run: (budget) => {
          const field = fieldRef.current;
          return field !== null && catchUpFrom(field, budget);
        },
      },
      { id: "ghost", label: "Warming up", run: () => (armGhost(spec, mode, levelId), false) },
      { id: "tape", label: "Warming up", run: () => (armTape(spec, mode, levelId, plan), false) },
      // Every shader the stage is about to need, compiled where there is
      // nothing to stutter. Last, because it compiles what is IN the scene
      // and the field's cars are part of it.
      { id: "warm", label: "Warming up", run: () => (rendererRef.current?.warm(), false) },
      // …and whatever the CALLER still owes before its first frame, which is
      // the benchmark and nothing else: the countdown it warms the machine up
      // on belongs under this card rather than in front of the stopwatch
      // (`startBenchmark`). Last, after every shader the stage needs is
      // compiled, because the frames it draws are frames of the finished
      // scene.
      ...extra,
    ];
    // What the same phases cost on this machine last time, for the three of
    // them that have nothing inside to count (`load-times.ts`).
    const job = createLoad(steps, loadedTimes());
    loadRef.current = job;
    loadDoneRef.current = done ?? null;
    loadShownRef.current = false;
    // The first phase is on the card from its FIRST paint: the frame the card
    // is given to be drawn in (`loadShownRef`) is the same frame the line has
    // to be right on, because the step after it holds the thread.
    cardPhaseRef.current = loadPhase(job);
    setCardPhase(cardPhaseRef.current);
    // The frames are about to go away for seconds at a time; the score has to
    // be written down before they do, or it breaks up over the card
    // (`coastMusic`).
    coastMusic(true);
    setLoading(true);
  };

  /** Hand the run over. Called on the frame the last step finished: the card
   * starts fading and the run under it is live from that frame, so the fade
   * uncovers a countdown that is already running rather than a still. */
  const endLoad = (): void => {
    const job = loadRef.current;
    const done = loadDoneRef.current;
    loadRef.current = null;
    loadDoneRef.current = null;
    setLoading("leaving");
    window.setTimeout(() => setLoading(false), LOAD_FADE_MS);
    // The frames are back, so the score stops booking ahead — and only NOW
    // does the stage's own theme come in. Whatever carried the player across
    // the card plays out its last booked bar and this one starts where that
    // ends (`TrackPlayer.play`), so the change of theme lands with the lights
    // instead of arriving on top of the one it replaces.
    coastMusic(false);
    stageMusicRef.current();
    if (job) {
      // …and what it cost this time, for the next card's bars. Only off a
      // load that ran to the end; `loadTimes` drops an abandoned one.
      rememberTimes(loadTimes(job));
      // What the load cost, step by step — the one place the shape of one is
      // visible, and the thing to read when a stage starts taking too long.
      debugLog(
        "load",
        job.steps.map((step, i) => `${step.id} ${job.spent[i].toFixed(0)}ms`).join(" · "),
      );
    }
    // Whatever was waiting for a stage that is actually STANDING — which is
    // the benchmark, and nothing else. Run last, because it may take the
    // canvas off the frame loop entirely.
    done?.();
  };

  const beginLoadRef = useRef(beginLoad);
  beginLoadRef.current = beginLoad;
  const endLoadRef = useRef(endLoad);
  endLoadRef.current = endLoad;

  const startStage = (
    spec: StageSpec,
    mode: PlayMode,
    levelId?: string,
    plan?: FieldPlan,
    /** Run on the frame the loading card lifts. Only the benchmark uses it —
     * see `startBenchmark`. */
    done?: () => void,
    /** Steps the caller adds to the tail of the load, paid for under the same
     * card as the rest of it. Only the benchmark uses these either. */
    extra?: readonly LoadStep[],
  ): void => {
    // The time to beat comes out of the book before the run starts, not
    // after: a clock with nothing to chase is only a stopwatch, and a
    // record read back after the finish has already been written is one
    // every run beats.
    bookRef.current = levelId ? { best: loadProgress().best[levelId] ?? null } : null;
    // A new run inherits nothing from the last one: the engine's note would
    // otherwise glide from wherever the previous car left it.
    audioRef.current?.reset();
    // …and neither does it inherit the last one's RECORDING. `startReplay`
    // arms the ref before it comes through here, so this only ever clears a
    // replay the player is leaving for something they are going to drive.
    if (mode !== "replay") {
      replayRef.current = null;
      setReplaying(null);
    }
    setPaused(false);
    setRun({ mode, levelId });
    runRef.current = { mode, levelId };
    setMenu(null);
    menuRef.current = null;
    beginLoad(spec, mode, levelId, plan, done, extra);
    // A REPLAY OPENS ON THE TV GALLERY. It is the one view built for watching
    // rather than driving — fixed tripods on the outside of every corner,
    // the car arriving at the lens (camera-tv.ts) — and a recording is
    // exactly the thing there is nothing to drive in. The ladder is still
    // there: the camera key walks off it the moment the player wants a
    // different angle, and `?camera=` still wins for the tooling.
    pickPlayCamera(startCamera(mode === "replay" ? "tv" : optionsRef.current.camera));
    audioRef.current?.setView(playCameraRef.current);
    // The god-mode effect owns the camera while it is flying; setting a play
    // camera here as well would land the flight every time a run started.
    if (!godRef.current) rendererRef.current?.setCamera(playCameraRef.current);
    logRunStart(`${mode} ${stageQuery(spec)}`);
  };

  const playLevel = (level: CampaignLevel, mode: PlayMode): void => {
    const race = raceRef.current;
    if (mode === "training") {
      playTraining();
      return;
    }
    status(`${MODE_NAME[mode]} — ${level.name}`);
    startStage(
      {
        seed: level.seed,
        length: level.length,
        shape: level.shape ?? "sprint",
        laps: lapsOverride() ?? levelLaps(level),
        // A campaign stage is the same country for everybody: the dials are
        // Roam's to play with, not the campaign's to inherit — the location
        // says which country, and the rule book's defaults say the rest.
        knobs: campaignKnobs(level),
        carId: race.carId,
        hour: level.hour,
        weather: level.weather,
        season: level.season,
        skipCountdown: false,
        // The back row, on a mass start. Everything else puts the player on
        // the line on their own.
        grid: gridSlotFor(race, mode),
        cars: fieldCars(race, mode),
      },
      mode,
      level.id,
    );
  };

  /** THE TRAINING GROUND. Not a stage: no clock to stop, no field to enter,
   * nobody's ghost to chase and no book to write into — which is why it
   * goes in through `startStage` with no level id. Everything the run does
   * keep (the car, the box, the camera) is the player's own setting, read
   * the way every other run reads it. */
  const playTraining = (): void => {
    status(`Training — ${carById(raceRef.current.carId).name}`);
    startStage(trainingSpec(raceRef.current.carId), "training");
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
        hour: r.hour,
        weather: r.weather,
        season: r.season,
        // ...and the COLD, which is part of the road: under freezing the
        // loose surface is snow, and under `CLIMATE.ice` the lakes are ice
        // the route may be drawn across (R48). A Roam stage driven without
        // it is a different stage from the one the map behind the page has
        // been drawing.
        temperature: r.temperature,
        skipCountdown: false,
        // The back row of the grid, whenever the opponents slider has put
        // one there; the line on its own at zero, which is where it stands.
        grid: gridSlotFor(r, "roam"),
        cars: fieldCars(r, "roam"),
      },
      "roam",
    );
  };

  /** WATCH A RECORDED RUN (game/replay.ts).
   *
   * The whole of a replay is here: parse the tape, rebuild the world its
   * header describes, re-enter the field it was driven against, and start the
   * stage with the recording holding the wheel. Nothing downstream is a
   * special case — the same engine steps the same physics off the same
   * controls, which is what makes a replay the run itself rather than a
   * picture of it.
   *
   * It is entered with NO LEVEL ID whatever stage the tape was driven on, and
   * that is the one line that keeps a replay honest: the level id is what
   * opens the ghost, the record book, the campaign's points and the time
   * trial's board, so a run that is only being watched can reach none of
   * them. Watching your own best lap must not be able to beat it.
   *
   * `saved` is the roll's own listing when the replay came off it, and null
   * when it is the run just driven — which is not kept until the disk in the
   * bar is pressed. */
  const startReplay = (text: string, saved: ReplayMeta | null): void => {
    let tape: RunTape;
    try {
      tape = parseTape(text);
    } catch (err) {
      // A tape this build cannot read — an older format, another timestep —
      // is a replay that would be a fiction, and the parser says which.
      status(`Replay: ${err instanceof Error ? err.message : "unreadable"}`);
      return;
    }
    const spec = replayStage(tape.header);
    const plan = replayField(tape.header);
    // A recording is given its id the moment it goes on screen, kept or not,
    // so the disk can file it — and be pressed twice without doubling its
    // row — before it has ever been stored.
    const id = saved?.id ?? newReplayId();
    const meta = saved ?? readReplayMeta(tape, id);
    replayRef.current = { id, meta, text, player: readTape(tape), plan, at: 0 };
    setReplaying({ meta, kept: saved !== null });
    status(`Replay — ${replayTitle(meta, replayStageName(meta.levelId))}`);
    startStage(spec, "replay", undefined, plan ?? undefined);
  };

  /** KEEP THE REPLAY BEING WATCHED — the disk in the replay bar. Files the
   * tape it is already driving, so what is kept is exactly what is on screen;
   * pressing it twice replaces its own row rather than doubling it. */
  const keepReplay = (): void => {
    const replay = replayRef.current;
    if (!replay) return;
    setReplaying({ meta: putReplay(replay.meta, replay.text), kept: true });
  };

  /** WATCH THE RUN JUST DRIVEN — the results card's own press. The recorder
   * is still holding the whole of it (`armTape`), so this seals it where the
   * run ended and puts it straight back on the road. Nothing is stored: the
   * disk in the replay bar is what keeps it, and a player who only wanted to
   * see the corner they lost it on owes the roll nothing. */
  const watchLastRun = (): void => {
    const tape = tapeRef.current;
    const end = tapeEndRef.current;
    if (!tape || !end) return;
    const rivalSplits: Record<string, number[]> = {};
    const field = fieldRef.current;
    if (field) for (const run of field.runs) rivalSplits[run.entry.crew.id] = run.splits;
    startReplay(tape.seal({ ...end, rows: result?.rows ?? [], rivalSplits }), null);
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
      knobs: campaignKnobs(level),
      carId: BENCHMARK.carId,
      gearbox: BENCHMARK.gearbox,
      // The stage's own clock is NOT used: the benchmark pins one, so the
      // car's lamps are lit and the LIGHTING row has something to cost
      // (see `BenchmarkPlan.hour`). The weather and the season stay the
      // level's — both are already clear, and both change the fog the
      // DISTANCE row is a multiplier on.
      hour: BENCHMARK.hour,
      weather: level.weather,
      season: level.season,
      skipCountdown: false,
      // The back row of the grid the field is stood on, exactly as a
      // heads-up race stands it.
      grid: playerSlot(BENCHMARK.field.cars),
      cars: BENCHMARK.field.cars,
    };
  };

  const startBenchmark = (): void => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const found = findLevel(BENCHMARK.levelId);
    if (!renderer || !canvas || !found) return;
    benchRef.current?.stop();
    // THE MEASUREMENT WAITS FOR THE LOAD. A stage is stood up behind the
    // loading card now (`race-loader.ts`), so nothing about it exists on the
    // line after this call: the field has just been cleared and the game
    // still belongs to the last stage. Taking the canvas here would read a
    // null field and never start — and it would also stop the frame loop the
    // load is driven from, hanging the card for good.
    //
    // Waiting is what the measurement wanted anyway. The stage that comes out
    // the far side has its world built, its shaders compiled and its whole
    // field driven, so the frames being timed are frames of RACING rather
    // than frames with a generator still running underneath them.
    //
    // AND SO DOES THE WARM-UP (benchmark.ts). The countdown is a stretch of
    // race the machine has to draw before it is warm — a WAIT, like every
    // other wait standing a stage up costs, so it belongs under the same card
    // as the rest of them rather than in front of a stopwatch that is not
    // running yet. It goes on the tail of the load with the loader's own mark
    // over it and a bar counting it out, and what the card lifts on is a race
    // already at green.
    let warm: BenchmarkWarmup | null = null;
    const warmUp: LoadStep = {
      id: "grid",
      label: "Warming the tyres",
      progress: () => warm?.progress() ?? 0,
      run: (budget) => {
        // Built on the first slice and not with the step: the game and the
        // field it warms are what the steps ABOVE it have just made.
        const state = gameRef.current;
        const field = fieldRef.current;
        if (!state || !field) return false;
        warm ??= warmBenchmark({ state, field, renderer, canvas });
        return warm.run(budget);
      },
    };
    /** Take the canvas and start the stopwatch. Run on the frame the card
     * lifts, which is the frame after the warm-up's last one. */
    const measure = (): void => {
      // Nothing about a measurement is written down, and the developer switch
      // that collects race data would otherwise be recording one.
      tapeRef.current = null;
      renderer.setCamera(BENCHMARK.camera);
      const state = gameRef.current;
      const field = fieldRef.current;
      if (!state || !field) return;
      benchRef.current = {
        stop: runBenchmark({
          state,
          field,
          renderer,
          canvas,
          onStatus: (status) => {
            setBench(status);
            // KEPT AT THE END, and here rather than on the card: a score is
            // only worth anything against a second one taken on the same
            // machine with a row of OPTIONS ▸ VIDEO moved, and by the time
            // that second run is set up the first card is gone. Writing it
            // down is an effect of the run finishing, which is a fact about
            // the app and not about the card that happens to be drawing it.
            if (status.phase !== "done") return;
            rememberBenchmark({
              at: Date.now(),
              index: status.index,
              stage: found.level.name,
              cars: status.cars,
              width: status.width,
              height: status.height,
              pixelRatio: devicePixelRatio,
              picture: pictureRows(optionsRef.current.video, desktopPicture()),
              plan: [
                { label: "car", value: BENCHMARK.carId },
                { label: "box", value: BENCHMARK.gearbox },
                { label: "camera", value: BENCHMARK.camera },
                { label: "hour", value: `${BENCHMARK.hour}` },
              ],
              frames: BENCHMARK.frames,
              step: BENCHMARK.step,
              samples: status.samples,
              costs: status.costs,
              scene: status.scene,
            });
          },
        }),
      };
    };
    startStage(benchmarkStage(found.level), "headsup", undefined, BENCHMARK.field, measure, [
      warmUp,
    ]);
  };

  /** Put the canvas back. The frozen last frame goes with it: the way out of
   * a benchmark is the developer menu it was started from. */
  const leaveBenchmark = (page: MenuPage = { page: "developer" }): void => {
    benchRef.current?.stop();
    benchRef.current = null;
    setBench(null);
    goMainMenu();
    setMenu(page);
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
   * painted over the stage. Not persisted — a debug layer that came back
   * next launch would be a surprise rather than a tool. */
  const [mapLayer, setMapLayer] = useState<MapLayerId | null>(mapLayerFromUrl);
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
    // The layers belong to the VIEWER and to nothing else: Roam is a page
    // for choosing a road to drive, and a stage painted in soil depths is
    // not a stage anybody is choosing by looking at. So the switch is read
    // there and nowhere else, which is what stops a layer left on in the
    // viewer following the player back onto Roam.
    const onViewer = menu?.page === "roam" && menu.viewing === true;
    setMapInfo(renderer.setMapLayer(onViewer ? mapLayer : null));
    // The idle turn is the MENU's decoration. Once the map is being READ it
    // holds still, because a reading that turns on its own cannot be
    // compared with the one taken before the change that is under test.
    renderer.holdMap(onViewer);
  }, [mapLayer, menu, seed, race, booted]);

  /** The boxes over the viewer's map, read fresh: the framing moves under
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
        // Null every time in practice — the map is a menu page and the
        // driving HUD is not up over one — and asked anyway, so the two
        // shutters never disagree about what a picture is.
        sign: false,
        hud: readHudLayer(),
        done: (capture) => {
          if (!copy) {
            resolve({ saved: capture !== null, copied: false });
            return;
          }
          copy.settle(capture?.blob ?? null);
          void copiedWithin(copy).then((copied) => resolve({ saved: capture !== null, copied }));
        },
      };
    });
  const takeMapShotRef = useRef(takeMapShot);
  takeMapShotRef.current = takeMapShot;

  const mapDebug = useMemo<MapDebug>(
    () => ({
      layer: mapLayer,
      onLayer: setMapLayer,
      legend: mapInfo?.legend ?? [],
      read: () => readMapDebugRef.current(),
      onShot: () => takeMapShotRef.current(),
    }),
    [mapLayer, mapInfo],
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
      knobs: campaignKnobs(level),
      hour: level.hour,
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
    // Switching the rear view back ON in the menu is a player asking to SEE
    // it, so a glass blanked in-game gets its picture back with it. The other
    // direction needs nothing: off, there is no mirror to be blanked.
    if (next.hud.mirror && !optionsRef.current.hud.mirror) {
      mirrorLiveRef.current = true;
      setMirrorLive(true);
    }
    setOptions(next);
    optionsRef.current = next;
    saveSettings(next);
    setAudioVolumes(next.audio);
    setRumble(next.rumble);
    input.setKeys(next.keys);
    input.setPad(next.pad);
    rendererRef.current?.setVideo(next.video);
    rendererRef.current?.setMirror(next.hud.mirror && mirrorLiveRef.current);
    rendererRef.current?.setNameTags(next.hud.on);
    rendererRef.current?.setView(next.view);
    if (reframe && !menuRef.current) {
      pickPlayCamera(next.camera);
      audioRef.current?.setView(next.camera);
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
      lamps: renderer.lampState(),
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
  // noise — including the theme the menu arms on its very first paint. The
  // vibration switch goes with them for the same reason: a player who turned
  // the motor off should not be buzzed once before the setting lands.
  useEffect(() => {
    setAudioVolumes(optionsRef.current.audio);
    setRumble(optionsRef.current.rumble);
  }, []);

  // THE DESKTOP APP'S MENU BAR, pressing the game's own buttons.
  //
  // A Mac window has a menu bar whether the app draws one or not, so the
  // desktop shell draws a real one (`tauri/shell/src/menu.rs`) — and every row
  // in it reaches a button that is already on screen somewhere. This is the
  // one place those words are spent, and each one is spent through the SAME
  // handler the button uses, so a menu row and a press can never drift apart.
  //
  // A row the game cannot serve where it stands does NOTHING, and that is the
  // design rather than a gap: GALLERY mid-race would throw away the run to
  // open a photo roll, and no menu row should be able to do that by accident.
  // In a browser nothing dispatches these at all.
  useEffect(
    () =>
      onShellCommand((command) => {
        const inMenu = menuRef.current !== null;
        switch (command) {
          case "restart":
            actionsRef.current.restart();
            return;
          case "menu":
            actionsRef.current.menu();
            return;
          case "pause":
            // Only over a run, and a toggle, because the row is one row: a
            // menu bar that offers PAUSE while the main menu is up is offering
            // to freeze a drone shot.
            if (!inMenu) setPaused((was) => !was);
            return;
          case "photo":
            takeShotRef.current();
            return;
          case "gallery":
            if (inMenu) setMenu({ page: "gallery" });
            return;
          case "settings":
            // Mid-run the settings live on the PAUSE CARD, which is where the
            // player reaches them without a menu bar too — so the row does
            // what the player would: it stops the car first.
            if (inMenu) setMenu({ page: "options" });
            else setPaused(true);
            return;
          case "controls":
            if (inMenu) setMenu({ page: "options", sub: "keyboard" });
            else setPaused(true);
            return;
        }
      }),
    [],
  );

  // NO LOUPE, ANYWHERE. iOS reads a press-and-hold as "put the caret here"
  // and answers it with a magnifying lens — over the road, taking the thumb
  // that was holding the throttle with it. text-interaction.ts owns the whole
  // rule, including which surfaces still get the browser's own touch; this is
  // the one place it is installed, for the life of the app.
  useEffect(() => guardTextInteraction(document, (el) => getComputedStyle(el as Element)), []);

  // A THUMB ON THE THROTTLE MUST NOT COST THE PLAYER THE BUTTONS. The browser
  // synthesizes a touch's `click` only from a tap that had the glass to
  // itself, so with the gas or the wheel held every press on the HUD and the
  // pause card silently does nothing. second-finger.ts owns the rule and fires
  // those presses itself; this is the one place it is installed. Every
  // clickable surface in this app is a `<button>`, which is what the hit test
  // asks for.
  useEffect(
    () =>
      relaySharedTaps(window, (x, y) => document.elementFromPoint(x, y)?.closest("button") ?? null),
    [],
  );

  // THE APP GOING AWAY IS AN OUTAGE THE BEDS HAVE TO BE TOLD ABOUT, the same
  // one a lost GPU context is. The frame loop is what feeds them and it stops
  // with the page, so a run left mid-corner leaves the engine, the tyres and
  // the wind holding whatever they were last steered to for the whole of the
  // player's absence. Suspending the context is meant to cover that, and on
  // iOS routinely does not: the audio session is interrupted on the way out,
  // which leaves the context in a state `suspend()` declines to act on, and a
  // bed left standing in it is one note played out loud from behind whatever
  // the player switched to. Nothing is lost by hushing — the beds are rebuilt
  // and re-steered by the first frame back, which is the frame the picture
  // returns on.
  useEffect(() => {
    const hush = (): void => audioRef.current?.silence();
    const onVisibility = (): void => {
      if (document.hidden) hush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // A page frozen, bfcached or navigated away does not always announce
    // itself through visibilitychange.
    window.addEventListener("pagehide", hush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", hush);
    };
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
    stageMusicRef.current();
    return undefined;
  }, [inMenu, benchmarking]);

  // WHILE THE BOARD IS BEING TYPED INTO, THE KEYBOARD IS NOT THE CAR'S. The
  // bindings are letters — `R` puts the car back at the last board, `B`
  // restarts the run, `M` walks out to the main menu — and both listeners
  // sit on the same target, so the entry's own `preventDefault` cannot stop
  // them. The input manager hands the keyboard over for as long as the
  // three letters are outstanding.
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
      if (disposed) return;
      const audio = createRunAudio();
      // The mix follows the camera from the first frame, not the first
      // change of it.
      audio.setView(playCameraRef.current);
      audioRef.current = audio;
    });
    void import("./game/renderer.ts").then(({ createRenderer }) => {
      if (disposed) return;
      const renderer = createRenderer(canvas, optionsRef.current.video);
      rendererRef.current = renderer;
      // Pushed before anything that will call INTO the renderer registers its
      // own cleanup: teardown runs LIFO, so the renderer goes last, after
      // every listener that could still ask it to resize has been unhooked.
      cleanups.push(() => renderer.dispose());
      // THE CANVAS FOLLOWS THE VIEWPORT FROM HERE, not from the first frame.
      // Everything below this line — the world builder above all — is seconds
      // of blocked main thread on a phone, and the whole of it is behind the
      // studio card. A screen rotated while it runs must not be a screen the
      // buffer is still cut for when the card lifts.
      const onResize = (): void => renderer.resize();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      // …and a rotation the page was not AWAKE for. A phone rotated in
      // another app resizes this one while it is hidden, where it gets no
      // frame to notice in and, on iOS, no `resize` event either: the app
      // simply comes back to a box nothing ever announced. Coming back into
      // view is the event that always arrives, so it is the one that asks.
      const onShown = (): void => {
        if (!document.hidden) renderer.resize();
      };
      document.addEventListener("visibilitychange", onShown);
      window.addEventListener("pageshow", onShown);
      cleanups.push(() => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        document.removeEventListener("visibilitychange", onShown);
        window.removeEventListener("pageshow", onShown);
      });
      // …and the harder half of the same story: the GPU can take the CONTEXT
      // back, not just resize the box. `gpu-context.ts` owns why that happens
      // and how often; this is what the app does about it. A run cannot be
      // driven behind a screen that draws nothing, so it goes on the pause
      // card — the same card, and the same rule about a menu, as the pause
      // key — and the cover goes over the top until the picture is back.
      renderer.onContext((lost) => {
        gpuLostRef.current = lost;
        setGpuLost(lost);
        if (!lost) return;
        // The frame loop is what feeds the beds, and it holds while the
        // context is gone — so an engine left running is one note held for
        // the whole outage. The MUSIC needs no help: the pause below stops
        // it the way the pause card always does.
        audioRef.current?.silence();
        if (menuRef.current === null) setPaused(true);
      });
      // Name the roll and decode the mark now rather than on the first
      // press: both are cheap, and the first picture of a session is the
      // one most likely to be shown to somebody.
      if (optionsRef.current.screenshots) armScreenshots();
      renderer.setMirror(optionsRef.current.hud.mirror && mirrorLiveRef.current);
      renderer.pinMirrorPace(mirrorHzFromUrl());
      renderer.setNameTags(optionsRef.current.hud.on);
      renderer.setView(optionsRef.current.view);
      renderer.setMapRect(mapRectRef.current);
      // A link that named a map framing is answered before the first frame,
      // so the picture it reproduces is the picture it was cut from rather
      // than the default framing seen for a moment first.
      renderer.placeMap(URL_MAP_POSE);
      // ...and a link that named a LENS for god mode's camera, for the same
      // reason: a tool shooting a wide panorama needs the frame it asked for
      // on the first frame, not the design lens for a beat and then its own.
      renderer.setFreeFov(URL_FREE_FOV);
      // ...and how far it may SEE, for a still that is looking at kilometres.
      renderer.setAir(URL_AIR);
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
      const page = menuRef.current;
      if (page) showBackdropRef.current(page);
      else {
        const r = raceRef.current;
        const { mode, levelId } = runRef.current;
        // A link that names a campaign level opens THAT stage — its seed,
        // its country, its conditions — exactly as `playLevel` would, so the
        // card at the end of it has a book, a field and a ladder to read.
        const level = levelId ? findLevel(levelId)?.level : undefined;
        const spec: StageSpec =
          mode === "training"
            ? trainingSpec(r.carId)
            : level
              ? {
                  seed: level.seed,
                  length: level.length,
                  shape: level.shape ?? "sprint",
                  laps: lapsOverride() ?? levelLaps(level),
                  knobs: campaignKnobs(level),
                  carId: r.carId,
                  hour: level.hour,
                  weather: level.weather,
                  season: level.season,
                  skipCountdown: false,
                  grid: gridSlotFor(r, mode),
                  cars: fieldCars(r, mode),
                }
              : {
                  seed: seedRef.current,
                  length: r.length,
                  shape: r.shape,
                  laps: lapsOverride() ?? raceLaps(r),
                  knobs: r.knobs,
                  carId: r.carId,
                  hour: r.hour,
                  weather: r.weather,
                  season: r.season,
                  // ...and the COLD, which is part of the ROAD rather than
                  // of the weather over it (climate.ts): under freezing the
                  // loose surface is snow, what falls is flakes, and under
                  // `CLIMATE.ice` the lakes are a floor the route may be
                  // drawn across. Left out, every `?temp=` link silently
                  // gets the season's own temperature instead — which is
                  // the one stage a link asking for a temperature is not
                  // asking for, and the reason a cold stage cannot be
                  // photographed or reported from a repro line at all.
                  temperature: r.temperature,
                  skipCountdown: false,
                  // The back row, on a `?mode=headsup` grid or a Roam stage
                  // with opponents on it; alone on the line otherwise.
                  grid: gridSlotFor(r, mode),
                  cars: fieldCars(r, mode),
                };
        // The time to beat, on a stage that keeps one — read before the run
        // starts, as `startStage` reads it, or a placed finish could never
        // say NEW RECORD.
        bookRef.current = levelId ? { best: loadProgress().best[levelId] ?? null } : null;
        applyStageRef.current(spec, true);
        // The field, on the same link: a heads-up race with nobody entered
        // is a Roam stage on a grid.
        armFieldRef.current(spec, mode);
        // …and the ghost and the run tape. Neither on a PLACED run: a
        // recording of a run that was stood at its finish is a recording of
        // nothing anybody drove, and a ghost replaying from step 0 beside a
        // car already at the line is a car parked on the start line. The
        // ghost is otherwise the same one a player gets from the menu, so a
        // `?mode=timetrial&level=…` link is the whole run rather than a
        // lonelier one — and this path never reaches `startStage`.
        if (!URL_PLACE.moment) {
          armGhostRef.current(spec, mode, levelId);
          armTapeRef.current(spec, mode, levelId);
        }
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
          recorderRef.current?.skipped();
        }
        // …and further along, if the link asked to be stood at a moment of
        // the run rather than at its start. The engine still owns the
        // moment itself: a finish placement is a step short of the line,
        // and the loop's first step drives through it and fires `finish`
        // through the same handler every finish goes through, so the card,
        // the salute and the run-out are the real ones. The field is stood
        // at the same moment, or the sheet would read a stagger nobody
        // drove.
        if (URL_PLACE.moment && gameRef.current) {
          const jumped = placeRun(gameRef.current, URL_PLACE.moment);
          if (fieldRef.current) placeField(fieldRef.current, gameRef.current, jumped);
        }
        // A `?start=1` run never passes through `startStage`, and a debug log
        // with no run section is one COPY LATEST RUN can say nothing about —
        // which is exactly the run a tooling link is most likely to be
        // capturing.
        logRunStart(`url ${stageQuery(spec)}`);
        pickPlayCamera(startCamera(optionsRef.current.camera));
        audioRef.current?.setView(playCameraRef.current);
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
        // …and it LOADS, exactly as a fresh start does. A restart rebuilds
        // the world and re-enters the field, which means it re-drives every
        // crew's whole stage: the same seconds a start costs, and the same
        // card over them (`race-loader.ts`).
        const active = runRef.current;
        // A REPLAY restarts from its own first step, with the field it was
        // driven against re-entered off the tape rather than off the menu's
        // settings — the apron and the stagger are part of the recording.
        const replay = replayRef.current;
        if (replay) replay.at = 0;
        beginLoadRef.current(spec, active.mode, active.levelId, replay?.plan ?? undefined);
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
        if (play) {
          pickPlayCamera(play.id);
          // The ear moves with the eye: the same key that walks the camera
          // ladder walks the mix from the cabin to the helicopter.
          audioRef.current?.setView(play.id);
        }
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
          setPaused((was) => !was);
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
        // ...and the same door for what is FELT: a bot crashing behind the
        // menu card is not the player's crash, so it does not reach a hand
        // any more than it reaches an ear.
        if (!demo) runRumble.events(events);
        // THE LAMPS ARE FOUR AND THE NEWS IS ONE. A nose driven in square
        // takes both headlamps on the same step, and two lines saying half
        // of it each is two lines nobody reads. So the batch is scanned
        // first and the lamps are called from the WHOLE of it — the pair as
        // one line, a single side by which side it was.
        for (const call of lampCalls(
          events.flatMap((ev) => (ev.type === "partBreak" ? [ev.part] : [])),
        )) {
          if (!demo) flash(call.text, call.tone);
        }
        for (const ev of events) {
          if (ev.type === "finish") {
            if (demo) {
              demoRollRef.current = true;
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
              //
              // …or when there is no ghost on file for this stage at all,
              // whatever the clock says. The two are stored separately and a
              // time outlives a tape — a board carried over from a build
              // whose tapes this one no longer reads leaves a stage with a
              // record and nothing to race, and a rule that only kept a NEW
              // best would leave it that way until the record fell.
              const beat = loadProgress().best[active.levelId];
              const spec = stageRef.current;
              const tape = recorderRef.current;
              if (
                tape &&
                spec &&
                spec.length !== "endless" &&
                (beat === undefined || ev.time < beat || !ghostOnFileRef.current)
              ) {
                saveGhost(
                  active.levelId,
                  tape.seal(
                    {
                      seed: spec.seed,
                      length: spec.length as FiniteStageLength,
                      knobs: spec.knobs,
                      hour: spec.hour,
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
                const carId = stageRef.current?.carId ?? "";
                // WHAT THE TIME WAS SET WITH — every choice that was still
                // the player's when the clock started, because each of them
                // is worth seconds and a board that hides them cannot be
                // argued with. The box off the CAR rather than the setting:
                // that is the one the physics actually shifted (`car.gearbox`),
                // and a menu changed during the run-out must not rewrite the
                // run that has just ended.
                const gearbox = state.car.gearbox;
                const difficulty = runDifficulty(raceRef.current, active.mode);
                setScores({
                  board,
                  place: at + 1,
                  drove: [
                    carId ? carById(carId).name.toUpperCase() : null,
                    gearbox.toUpperCase(),
                    difficulty.toUpperCase(),
                  ]
                    .filter((word): word is string => Boolean(word))
                    .join(" · "),
                  pending:
                    at >= 0
                      ? {
                          levelId: active.levelId,
                          time: ev.time,
                          carId,
                          gearbox,
                          difficulty,
                          at: Date.now(),
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
          } else if (ev.type === "missed") {
            // R28 — the line went by and nothing happened, which is the one
            // thing on the stage a player cannot be left to work out for
            // themselves. Say WHICH board is owed, in the same numbering the
            // split card has been counting up in all run.
            flash(`SPLIT ${ev.next + 1}/${ev.count} MISSED — GO BACK`, "bad");
          } else if (ev.type === "landing" && ev.clean && ev.airTime >= REAL_AIR) {
            flash(`CLEAN AIR ${ev.airTime.toFixed(1)}s`, "good");
          } else if (ev.type === "systemFail") {
            // The one exception to the rule above: a bent car announces
            // itself and hurt MACHINERY does not. Valuable machinery gives
            // the driver a useful adjustment to make; chassis wear remains
            // gameplay-relevant but is deliberately silent.
            const call = damageCall(ev.system, ev.stage);
            if (call) flash(call.text, call.tone);
          } else if (ev.type === "overheat") {
            // The one damage call that comes back down: a needle is a thing
            // to be managed, and lifting off is an instruction the driver
            // can still act on.
            const call = overheatCall(ev.level);
            flash(call.text, call.tone);
          } else if (ev.type === "wheelFail") {
            const call = wheelCall(ev.wheel, ev.off);
            flash(call.text, call.tone);
          } else if (ev.type === "retire") {
            // THE RUN IS OVER, and there is no time to post. The car is
            // sitting where it stopped; the card goes up over it with the
            // reason on it, the field is stood down (nothing is classified
            // off a run that did not reach the line), and the theme stops
            // the way it does at a finish — this is the end of the stage,
            // just not the one anybody wanted. Nothing is FLASHED: whatever
            // finished the car said so at the moment it happened (an engine
            // at the top of its ledger, the second wheel leaving), and this
            // is only where the coasting stopped.
            if (demo) {
              demoRollRef.current = true;
              setDemoSeed((s) => s + 1);
              continue;
            }
            retiredRef.current = ev.reason;
            // The tape's last line, on a run that never reached one. Booked
            // here for the same reason a finish books it: past this the car
            // is a wreck being looked at, and a replay that carried the
            // looking would run for as long as the card was left up.
            if (tapeRef.current && !tapeEndRef.current && menuRef.current === null) {
              tapeEndRef.current = {
                finished: false,
                time: state.raceTime,
                laps: state.laps,
                lapTimes: [...state.lapTimes],
                splits: [...state.checkpointTimes],
                place: null,
                of: null,
                stats: { ...state.stats },
              };
            }
            stopMusic();
            const field = fieldRef.current;
            if (field) stopField(field);
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
        // THE ODOMETER TAKES THE RUN'S METRES. Here rather than in the step
        // loop because the counter is a readout and reads at the readout's
        // rate: it steps once every hundred metres, which is a hundred times
        // slower than this tick even at the speed the game is quickest at.
        //
        // What it counts is anything the PLAYER drives — the campaign, a
        // trial, a heads-up race, Roam, and the training ground, which is
        // the whole point of a counter that belongs to the car. What it
        // does not count is a car being driven for the player: the bot's
        // demo behind the menu cards never gets here at all (nothing pushes
        // the HUD with a page up), and `?bot=1`'s autopilot is held while it
        // has the wheel, so the kilometres it drives are nobody's.
        const trip = tripRef.current;
        if (trip) {
          if (autopilotRef.current) trip.hold();
          else setOdo(trip.look(state.stats.distance));
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
            retiredRef.current,
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
        if (hudFpsRef.current) setHudFps(Math.round(fps));
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
      let hudOffWas = false;
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
        void captureFrame(canvas, wanted.label, wanted.notes, wanted.hud, wanted.sign).then(
          (capture) => {
            // Whoever asked says what happened: the shutter flashes it on the
            // HUD, a menu's button says it on its own face. This is also the
            // one place the finished picture exists, which is why the whole
            // capture goes back rather than a yes or no.
            if (wanted.done) wanted.done(capture);
            else flash(capture ? "PICTURE SAVED" : "PICTURE FAILED", capture ? "good" : "bad");
          },
        );
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

      /** THIS FRAME IS NOT BEING HEARD. The beds are steered by `audio.frame`
       * and by nothing else — nothing is booked ahead — so a frame that
       * simply does not feed them leaves every layer holding the level it was
       * last given: the engine note, the tyres and the wind carry on behind a
       * pause card that stopped the car, and behind the menu the player left
       * the run for. Every path out of the frame that skips the beds says so
       * through here, and the next fed frame builds them again. */
      const hushAudio = (): void => audioRef.current?.silence();

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
        } else hushAudio();
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
        // NOTHING IS DRAWABLE WITHOUT A GPU CONTEXT (gpu-context.ts), and
        // every step below aims at a picture: running them spends a phone's
        // battery on a frame nobody will see, and advances every effect's
        // clock over a blackout, so the world jumps when the picture returns.
        // Ahead of the load below, which cannot WARM a shader on a context
        // that is gone — held here, it picks up where it left off on the
        // frame after the picture comes back. The pad is polled above and
        // the cards are DOM, so the pause card the loss raised is still read
        // and still answers a controller while this holds. `last` moved
        // above too, so the frame that resumes is one frame long rather than
        // the whole outage.
        if (gpuLostRef.current) return;
        // THE LOAD OWNS THE FRAME while a race is being stood up
        // (`race-loader.ts`). Nothing below runs: there is a card over the
        // canvas, so a frame spent drawing the world behind it is a frame
        // taken off the work the card is there to hide — and the game state
        // under it is still the LAST stage's, which nobody should be
        // stepping. The pad is polled above, as it is behind every other
        // early return here.
        const load = loadRef.current;
        if (load) {
          // One frame for the card to be drawn in, before a step that cannot
          // be cut up takes the next one whole.
          if (!loadShownRef.current) {
            loadShownRef.current = true;
            return;
          }
          // …and one frame for each PHASE after it, for the same reason and
          // read the same way round: the line has to name the work that is
          // about to happen, not the work that just did. `warm` compiles
          // every shader the stage needs in one indivisible call, so a phase
          // announced on the frame it starts is one the player reads after it
          // is over — or, when the steps behind it all finish inside a single
          // slice, never reads at all.
          const phase = loadPhase(load);
          if (phase.at !== cardPhaseRef.current?.at) {
            cardPhaseRef.current = phase;
            setCardPhase(phase);
            return;
          }
          // …and the BAR moves without buying a frame of its own. A phase
          // that counts itself reports a new fraction every frame, which is
          // a re-render per frame behind a card nobody is reading that
          // closely: redrawn on the hundredth of the bar instead.
          const was = cardPhaseRef.current?.done;
          if (phase.done !== null && (was == null || Math.abs(phase.done - was) >= 0.01)) {
            cardPhaseRef.current = phase;
            setCardPhase(phase);
          }
          // …and how much of THIS frame it may have, off how long the
          // frames are actually coming (`loadBudgetMs`).
          const deadline = performance.now() + loadBudgetMs(dtFrame * 1000);
          // Both closures, not `performance.now` itself: a native method
          // handed over bare is called with no receiver and throws.
          const clock = () => performance.now();
          if (!advanceLoad(load, () => clock() < deadline, clock)) {
            endLoadRef.current();
          }
          return;
        }
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
        // The chrome comes off two ways — ALT held, or god mode's Z — and
        // both are read here rather than dispatched: what is on screen is a
        // state, and a press that fired an event would leave the HUD off for
        // good on an alt-tab.
        if (input.hudHidden() !== hudOffWas) {
          hudOffWas = input.hudHidden();
          setHudHidden(hudOffWas);
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
          // A frozen run is a SILENT one. The card stops the car, so it stops
          // the noise the car was making too.
          hushAudio();
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
          hushAudio();
          renderer.render(state, dtFrame);
          servePendingShot();
          return;
        }
        // THE LOADING BEAT. A field of ghosts has every crew's whole stage
        // written down before the lights run (standings.ts): the establishing
        // shot's slices are normally enough, and when they are not — a long
        // stage on a slow phone, or a shot cut short — the countdown waits
        // HERE, on the frame the shot landed on, with a caption up and most
        // of every frame spent on what is left. Nothing steps: the lights
        // have not started, so no clock is owed anything, and a ghost the
        // clock outran would be a car missing from the road.
        const entered = fieldRef.current;
        if (entered && !page && state.phase === "countdown" && !fieldTraced(entered)) {
          acc = 0;
          catchUpField(entered, FIELD_HOLD_MS);
          audioRef.current?.frame(state, dtFrame);
          renderer.render(state, dtFrame);
          servePendingShot();
          readLive(liveRef.current, state, true);
          hudClock += dtFrame;
          if (hudClock > 0.08) {
            hudClock = 0;
            pushHud(state, fps);
          }
          return;
        }
        acc += dtFrame;
        while (acc >= TUNING.dt) {
          // …and it is entered from inside the step loop too: the shot ends
          // (or is skipped, below) between one step and the next, and the
          // lights must not take a single step ahead of the field.
          if (entered && state.phase === "countdown" && !fieldTraced(entered)) {
            acc = 0;
            break;
          }
          acc -= TUNING.dt;
          // Sampled every step whether or not it is the one driving: the
          // pedals and the wheel RAMP, and a sample skipped is a ramp that
          // never moves.
          const human = input.sample(TUNING.dt);
          if (autopilotRef.current && driving(human)) autopilotRef.current = false;
          // A REPLAY HAS THE WHEEL, when one is on screen: the engine is
          // handed the controls the recording was driven on rather than the
          // ones anybody is pressing now, and everything else about the step
          // — the field, the physics, the events — is the same code doing the
          // same work. Past the end of the tape the reader hands back neutral,
          // which is a car that has already crossed its line.
          const replay = replayRef.current;
          const driven = replay
            ? replay.player.at(replay.at)
            : page || autopilotRef.current
              ? botInput(state)
              : human;
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
          // …taken off the RECORDING while one is playing, on the step it was
          // taken on. Without it a replay sits out an establishing shot the
          // run walked out of, and every crew's stagger is that many seconds
          // wrong for the rest of the stage.
          const cut = replay ? replay.player.skipsAt(replay.at) : wantsOff(human);
          if (state.phase === "intro" && cut) {
            // The camera is told FIRST, while the shot is still up: the
            // engine's skip is one instant jump — the field's stagger
            // depends on it being one — and the camera answers it by flying
            // the rest of the shot quickly rather than cutting.
            renderer.skipIntroShot();
            const jumped = skipIntro(state);
            if (running) advanceField(running, jumped);
            // Not an input, but it moves the whole field's clock, so a replay
            // that missed it would race a stagger nobody drove — and it moves
            // every corner of the ghost's own tape seconds earlier, so the
            // ghost's has to carry it too.
            if (!tapeEndRef.current) tapeRef.current?.skipped();
            recorderRef.current?.skipped();
          }
          const events = step(state, driven);
          // The recording walks forward with the engine it is driving — one
          // step of the tape per step of the physics, which is the whole of
          // why the car ends up in the same places.
          if (replay) replay.at++;
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
            // …including the driver's own cut, taken on the step it was taken
            // on and before that step, exactly as the run took it. Without it
            // the ghost sits out an establishing shot the run walked out of
            // and spends the first seconds of the tape parked on the line.
            if (ghost.tape.skipsAt(ghost.at)) skipIntro(ghost.state);
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
        if (page) hushAudio();
        else {
          audioRef.current?.frame(state, dtFrame);
          // The drift's pulse train, on the frames the player is driving and
          // nowhere else: a card over a held run is a run nobody has their
          // hands on (game/rumble.ts).
          runRumble.frame(state.car, dtFrame);
        }
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
  // THE SHEET THE CARD SHOWS. Final once the run-out is booked (`result`);
  // before that, PROVISIONAL — the same classification read off the field as
  // it stands, with the crews still out at the bottom marked as such, so the
  // card has a table on it from the moment it comes up and the rows fill in
  // as the stragglers come home. Read off the field ref rather than carried
  // in state: the HUD already redraws a dozen times a second off `snap`, and
  // fifteen rows are nothing beside what that costs.
  const sheetRows = ((): { rows: SheetRow[]; settled: boolean } | null => {
    if (!run.levelId || (run.mode !== "campaign" && run.mode !== "headsup")) return null;
    const settled = result?.levelId === run.levelId;
    const field = fieldRef.current;
    const classed = settled
      ? result.rows
      : field && snap?.finishTime !== null && snap?.finishTime !== undefined
        ? fieldResults(field, { time: snap.finishTime, carId: race.carId })
        : null;
    if (!classed) return null;
    return {
      settled,
      rows: classed.map((row) => ({
        place: row.place,
        alias: row.alias,
        driver: row.driver,
        carId: row.carId,
        crewId: row.id,
        number: row.number,
        time: row.time,
        out: row.out,
        you: row.you,
      })),
    };
  })();
  // …and HEADS UP's own, which is the same sheet with the board taken off:
  // where everybody finished, and nothing carried out of the race.
  const headsUp: FinishRace | null =
    run.mode === "headsup" && sheetRows
      ? {
          rows: sheetRows.rows,
          settled: sheetRows.settled,
          cars: gridSize(race.headsUp.cars),
        }
      : null;
  const campaign: FinishStandings | null = ((): FinishStandings | null => {
    if (!here || !snap?.standing || !sheetRows) return null;
    const table = locationStandings(here.location, progress);
    const mine = table.find((row) => row.you) ?? table[table.length - 1];
    const totals = new Map(table.map((row) => [row.id, row.points]));
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
      won: sheetRows.settled && locationWon(here.location, progress),
      settled: sheetRows.settled,
      // A crew still out has earned nothing yet; a provisional place at the
      // bottom of the sheet is not a fourth place worth nothing, it is no
      // place at all.
      rows: sheetRows.rows.map((row) => ({
        ...row,
        points: row.out ? 0 : pointsFor(row.place),
        total: totals.get(row.crewId) ?? 0,
      })),
    };
  })();

  // ...and where it goes back to. A TIME TRIAL is one stage run again and
  // again against a board, so the card offers the same stage from the grid
  // — the same road, the same car, a clean clock and a fresh ghost. It is
  // the restart the pause menu and `B` already do, put where a player who
  // has just read their time is looking.
  // …and a campaign run that missed the podium wants exactly the same
  // button: the stage is still there, and the field will run it again.
  // …and a HEADS-UP race wants it for the same reason a time trial does: the
  // race is the whole thing, and the only way on from one is another.
  // …and a RETIREMENT wants it in every mode: the stage was not cleared,
  // and running it again is the only way it ever will be.
  const onRetry =
    run.mode === "timetrial" || run.mode === "headsup" || missedPodium || snap?.phase === "retired"
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

  /** WATCH THE RUN AGAIN — the results card's own press. Offered on every run
   * with a recording behind it and a clock that has stopped, whether it
   * reached the line or ended against a tree, and never over a replay: the
   * card at the end of one is the end of the recording, and there is nothing
   * new to watch. */
  const onReplay =
    run.mode !== "replay" && tapeRef.current && tapeEndRef.current
      ? (): void => watchLastRun()
      : null;

  // R30 — WHETHER THERE IS ANYTHING TO WATCH. The same condition the sheet's
  // OUT rows are waiting out, read off the same state: a run with a field
  // entered, whose sheet has not landed yet. It is the whole of what the
  // wait is, so it is also the whole of what the offer is.
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
    drove: scores.drove,
    entering: scores.pending && {
      // The row the board stands in place while it is being named. Its stamp
      // is taken at the LINE rather than at the press, so the date the player
      // watches themselves type onto is the date that gets stored.
      run: {
        time: scores.pending.time,
        carId: scores.pending.carId,
        gearbox: scores.pending.gearbox,
        difficulty: scores.pending.difficulty,
        at: scores.pending.at,
      },
      initial: scores.pending.offer,
      onDone: (who: string): void => {
        const posted = scores.pending;
        if (!posted) return;
        rememberInitials(who);
        const board = recordScore(posted.levelId, {
          who,
          time: posted.time,
          carId: posted.carId,
          gearbox: posted.gearbox,
          difficulty: posted.difficulty,
          at: posted.at,
        });
        setScores({ board, place: scores.place, drove: scores.drove, pending: null });
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
      {/* The chrome comes off — ALT held, or god mode's Z — so the frame
          under it can be photographed, and it used to take the news column
          with it, including the shutter's own receipt. That is the one line
          somebody who just hid the HUD is most likely to be waiting for, so
          the column stands on its own while the rest is down. None of it
          reaches the picture: the capture is read off the drawing buffer and
          this is DOM over it. */}
      {snap && !menu && hudHidden && !bench && (
        <div className="hud pointer-events-none absolute inset-0 select-none">
          <HudFlashes flashes={flashes} />
        </div>
      )}
      {snap && !menu && !hudHidden && !bench && (
        <Hud
          // WHOSE CAR THE INSTRUMENTS ARE READING. The player's, until a
          // run-out is being watched closely — then it is the crew under the
          // camera, on the same dials, and the layout never has to know.
          snap={watchFace ? watchFace.snap : snap}
          // …and the counter in the middle of its rev counter, which is the
          // one instrument that does NOT transfer with the camera: the
          // player's own car has a life the game keeps, and the crew being
          // watched has not.
          odoM={watchFace ? null : odo}
          live={watchFace ? watchLiveRef.current : liveRef.current}
          paused={paused}
          flying={godActive}
          seated={hudCamera === "cockpit" && !godActive}
          flashes={flashes}
          split={split}
          input={input}
          show={hudParts}
          fps={hudFps}
          touchLayout={options.touch}
          padDriving={padded && options.pad.hideTouch}
          onPause={() => setPaused(true)}
          onCamera={() => actionsRef.current.camera()}
          onReset={() => input.requestReset()}
          mirrorLive={mirrorLive}
          onMirror={toggleMirror}
          nextStage={nextStage}
          onRetry={onRetry}
          onRetire={goMainMenu}
          scores={finishScores}
          campaign={campaign}
          race={headsUp}
          locked={lockedBehind}
          onSaveRun={saveRun}
          onReplay={onReplay}
          replaying={replaying !== null}
          onSpectate={onSpectate}
          watching={watching}
          spectate={spectate}
        />
      )}
      {/* THE REPLAY STRIP, over everything a replay draws — the results card
          at the end of the recording included, because the disk is most
          likely to be wanted once the player has seen how it went. Outside
          the HUD for the same reason the news column is: ALT takes the
          chrome off so a frame can be judged on its pixels, and the way out
          of a replay is not chrome. */}
      {replaying && !menu && !bench && (
        // In a HUD layer of its own rather than inside the one above: the
        // strip is chrome and measures itself against the instrument panel
        // (`--hud-tach`, stated once on `.hud`), but it has to stand whether
        // or not the rest of the HUD is up — ALT takes that down, and the
        // results card takes it down for itself.
        <div className="hud pointer-events-none absolute inset-0 select-none">
          <ReplayBar
            title={replayTitle(replaying.meta, replayStageName(replaying.meta.levelId))}
            line={replayLine(replaying.meta)}
            onSave={replaying.kept ? null : keepReplay}
            onLeave={goMainMenu}
          />
        </div>
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
      {bench && (
        <BenchmarkCard
          status={bench}
          video={options.video}
          onAgain={startBenchmark}
          onHistory={() => leaveBenchmark({ page: "benchhistory" })}
          onLeave={() => leaveBenchmark()}
        />
      )}
      {paused && !menu && !bench && (
        <PauseMenu
          seed={stageRef.current?.seed ?? seed}
          carName={carById(race.carId).name}
          dev={options.developer ? options.dev : null}
          onDev={(dev) => applyOptions({ ...options, dev })}
          onResume={() => setPaused(false)}
          onRestart={() => actionsRef.current.restart()}
          onMainMenu={goMainMenu}
          settings={options}
          onSettings={applyOptions}
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
          onUnlock={(locationId) =>
            setProgress(locationId === null ? unlockEverything() : unlockLocation(locationId))
          }
          onLock={(locationId) =>
            setProgress(locationId === null ? lockEverything() : lockLocation(locationId))
          }
          onResetPoints={(locationId) => setProgress(resetPoints(locationId))}
          onMapRect={setMapRect}
          mapView={mapView}
          mapDebug={options.developer ? mapDebug : null}
          onRoamLevel={loadRoamLevel}
          onBenchmark={startBenchmark}
          onWatchReplay={(meta) => {
            // The tape is a megabyte off disk and a menu row is a press, so
            // the read is awaited here rather than in the page. A replay that
            // has gone (a store cleared under the listing) says so and leaves
            // the player on the menu.
            void replayTape(meta.id).then((text) => {
              if (text === null) {
                status("Replay: no longer on this machine");
                return;
              }
              startReplay(text, meta);
            });
          }}
        />
      )}
      {/* THE SAME CARD FOR BOTH WAYS THERE IS NOTHING TO LOOK AT: a race being
          stood up, and a GPU that has taken the context back (gpu-context.ts).
          A loss part-way through a load holds the card up and cancels its
          fade — the road is not ready to be handed over to anybody. */}
      {(loading !== false || gpuLost) && (
        <LoadingScreen
          leaving={loading === "leaving" && !gpuLost}
          phase={loading === false ? null : cardPhase}
        />
      )}
      {splashUp && <SplashScreen warm={booted} onDone={() => setSplashUp(false)} />}
      <UpdateButton
        needRefresh={pwa.needRefresh || forcedUpdate}
        incomingVersion={pwa.incomingVersion ?? (forcedUpdate ? __APP_VERSION__ : null)}
        onReload={pwa.reload}
      />
    </div>
  );
}
