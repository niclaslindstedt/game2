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
// ?tod=, ?weather=, ?car=, ?length=, ?shape=, ?laps=, the four generator dials ?elevation=
// ?water= ?trees= ?asphalt=, ?start=1 and ?bot=1) pin a run for tooling and
// screenshots, and the developer tools add ?debug=1, ?god=1 and the free
// camera's pose (?gx= ?gy= ?gz= ?gyaw= ?gpitch=) — the repro line the debug
// overlay prints is exactly that set, so a screenshot reproduces as a URL.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  TUNING,
  botInput,
  carById,
  compileStage,
  createGame,
  resolveKnobs,
  status,
  step,
  type CarInput,
  type FiniteStageLength,
  type GameEvent,
  type GameState,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import type { CameraMode } from "./game/camera.ts";
import type { FreeFlyPose } from "./game/camera-free.ts";
import { DebugHud } from "./game/debug-hud.tsx";
import { stageQuery, traceLine, type DebugContext } from "./game/debug-info.ts";
import { debugLogging, log as debugLog, logRunStart, setDebugLogging } from "./game/debug-log.ts";
import type { GameRenderer } from "./game/renderer.ts";
import { Hud, type HudFlash, type HudSnapshot } from "./game/hud.tsx";
import type { FinishScores } from "./game/hud-finish.tsx";
import {
  lastInitials,
  loadBoard,
  placeOn,
  recordScore,
  rememberInitials,
  type ScoreEntry,
} from "./game/scores.ts";
import { createLive, readLive, takeSnapshot, type RunBook } from "./game/snapshot.ts";
import {
  DEFAULT_STAGE_KNOBS,
  PauseMenu,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  TIMES_OF_DAY,
  WEATHERS,
  raceLaps,
  type RaceSettings,
} from "./game/menu.tsx";
import { MainMenu, type MenuPage, type PlayMode } from "./game/main-menu.tsx";
import type { MapRect, MapView } from "./game/menu-roam.tsx";
import {
  levelLaps,
  loadProgress,
  nextLevel,
  recordFinish,
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
  loadSettings,
  saveSettings,
  type DevSettings,
  type PlayCamera,
  type Settings,
} from "./game/settings.ts";
import { formatTime } from "./lib/util.ts";
import { setAudioVolumes, unlockAudio } from "./game/audio/bus.ts";
import { playUi } from "./game/audio/ui.ts";
import { armMenuMusic, pauseMusic, playMusic, resumeMusic, stopMusic } from "./game/audio/music.ts";
import type { RunAudio } from "./game/audio/index.ts";
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

/** ?laps=N (tooling): race a circuit over this many laps instead of the
 * rule book's three. A scripted pass has to REACH a finish to photograph
 * one, and three laps of anything is a long time to hold a browser open. */
function lapsOverride(): number | null {
  const raw = Number(new URLSearchParams(location.search).get("laps"));
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : null;
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

/** The build this frame came out of — the first thing to check when a
 * screenshot and the current tree disagree about what the game does. */
const BUILD = `v${__APP_VERSION__} ${__COMMIT_SHA__}`;

/** How often the debug log writes a position line while a run is going,
 * seconds. One a second is a readable trace of a two-minute stage; faster
 * turns the copy into a wall nobody reads to the end of. */
const TRACE_PERIOD = 1;

/** Whether the player is actually asking for anything this step. */
function driving(input: CarInput): boolean {
  return (
    input.throttle > 0 ||
    input.brake > 0 ||
    input.handbrake ||
    input.boost ||
    Math.abs(input.steer) > 0
  );
}

/** Initial race settings: URL params (tooling) beat the stored choice beats
 * the defaults. Storage can be unavailable (private mode) — defaults are
 * fine. */
function initialRace(): RaceSettings {
  const race: RaceSettings = {
    timeOfDay: "day",
    weather: "clear",
    carId: "compact",
    length: "medium",
    shape: "sprint",
    knobs: { ...DEFAULT_STAGE_KNOBS },
  };
  try {
    const stored = localStorage.getItem(RACE_KEY);
    if (stored) Object.assign(race, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === race.length)) race.length = "medium";
  if (!STAGE_SHAPES.some((s) => s.id === race.shape)) race.shape = "sprint";
  const params = new URLSearchParams(location.search);
  const tod = params.get("tod");
  if (TIMES_OF_DAY.some((t) => t.id === tod)) race.timeOfDay = tod as TimeOfDay;
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) race.weather = weather as Weather;
  const car = params.get("car");
  if (car === "compact" || car === "classic") race.carId = car;
  const length = params.get("length");
  if (STAGE_LENGTH_OPTIONS.some((l) => l.id === length)) race.length = length as StageLength;
  const shape = params.get("shape");
  if (STAGE_SHAPES.some((s) => s.id === shape)) race.shape = shape as StageShape;
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

/** The player's options, with the URL's developer flags laid over them. A
 * repro link arrives on a machine that has never drummed on the chassis, so
 * it lets the developer menu out as well as the tools — otherwise the boxes
 * come up and there is no way to switch them off again. */
function initialSettings(): Settings {
  const settings = loadSettings();
  const forced = devFromUrl();
  if (forced.debug || forced.god) {
    settings.developer = true;
    settings.dev = { ...settings.dev, ...forced };
  }
  return settings;
}

/** Where a `?g…=` link wants god mode's camera parked. Read once: it names
 * the frame the link was made from, and re-applying it every time the
 * camera came back would make the flight impossible to leave. */
const URL_POSE = poseFromUrl();

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
  timeOfDay: TimeOfDay;
  weather: Weather;
  /** The menu's demo has no grid to sit on — nobody is waiting for it. */
  skipCountdown: boolean;
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
    a.timeOfDay === b.timeOfDay &&
    a.weather === b.weather &&
    a.skipCountdown === b.skipCountdown
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
    skipCountdown: true,
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
        skipCountdown: true,
      } satisfies StageSpec,
      driven: false,
    };
  }
  return { camera: "drone" as CameraMode, stage: demoStage(race, demoSeed), driven: true };
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

/** Air time under which a landing is not worth a banner, s — every ripple
 * and curb technically leaves the ground, and "CLEAN AIR 0.0s" three times
 * in a row is the HUD talking over the game. */
const REAL_AIR = 0.5;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const input = useMemo(() => createInput(), []);
  const [race, setRace] = useState<RaceSettings>(initialRace);
  const [options, setOptions] = useState<Settings>(initialSettings);
  const [progress, setProgress] = useState<CampaignProgress>(loadProgress);
  const [menu, setMenu] = useState<MenuPage | null>(() => {
    // ?start=1 launches straight into a run (tooling); everyone else gets
    // the main menu.
    const params = new URLSearchParams(location.search);
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
   * is, so a finish can record the clear. */
  const [run, setRun] = useState<{ mode: PlayMode; levelId?: string }>({ mode: "roam" });
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
  /** The attract card is up until a press clears it; `booted` is the moment
   * the render stack has landed and the first stage is standing, which is what
   * the card is covering — and what it waits for before it puts its title up
   * and asks for that press. Tooling runs pass ?start=1 and never see it. */
  const [splashUp, setSplashUp] = useState(() => !splashSkipped(location.search));
  const [booted, setBooted] = useState(false);
  const [paused, setPaused] = useState(false);
  /** True while ALT is held: the game's chrome comes off so a frame can be
   * judged on the pixels alone. The debug overlay is NOT part of it — a
   * screenshot with nothing to say where it was taken is the one thing the
   * overlay exists to prevent. */
  const [hudHidden, setHudHidden] = useState(false);
  /** What the debug overlay is reading, refreshed on the HUD's own tick and
   * only while the overlay is up. */
  const [debugCtx, setDebugCtx] = useState<DebugContext | null>(null);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
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
  /** God mode and the overlay, as the frame loop sees them. */
  const godRef = useRef(false);
  const debugRef = useRef(options.dev.debug);
  debugRef.current = options.dev.debug;
  /** The compiled stage, cached under everything that decides what it IS:
   * the seed, the length band, and the dials. */
  const audioRef = useRef<RunAudio | null>(null);
  const trackRef = useRef<{ key: string; track: Track } | null>(null);
  const stageRef = useRef<StageSpec | null>(null);
  /** Roam's map pane, held here so a renderer that finishes loading after
   * the pane has already measured itself still learns where to draw. */
  const mapRectRef = useRef<MapRect | null>(null);

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
      // one is built, and never mid-run.
      gearbox: optionsRef.current.gearbox,
      track: trackRef.current.track,
      laps: spec.laps,
      // The countdown is the start line's ceremony for a DRIVER. In god
      // mode there is nobody on the grid — the car is handed neutral input
      // and stays there — so the lights would only hang over the middle of
      // every frame the free camera was flown out to take.
      skipCountdown: spec.skipCountdown || godRef.current,
      env: { timeOfDay: spec.timeOfDay, weather: spec.weather },
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
    setSnap(takeSnapshot(state, null, null, bookRef.current));
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
  const armGhost = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
    const renderer = rendererRef.current;
    recorderRef.current = null;
    ghostRef.current = null;
    renderer?.setGhost(null);
    if (!renderer || !trackRef.current || menuRef.current) return;
    if (!levelId || spec.length === "endless") return;
    recorderRef.current = createGhostRecorder();
    if (mode !== "timetrial") return;
    const stage: GhostStage = {
      seed: spec.seed,
      length: spec.length as FiniteStageLength,
      knobs: spec.knobs,
      timeOfDay: spec.timeOfDay,
      weather: spec.weather,
    };
    const saved = loadGhost(levelId);
    if (!saved || !ghostMatches(saved, stage)) return;
    // The ghost's own game, on the SAME compiled track — the stage is read
    // only, so there is nothing to build twice but the run itself.
    const state = createGame({
      seed: spec.seed,
      carId: saved.carId,
      track: trackRef.current.track,
      skipCountdown: spec.skipCountdown,
      env: { timeOfDay: spec.timeOfDay, weather: spec.weather },
    });
    ghostRef.current = { state, tape: readGhost(saved), at: 0 };
    renderer.setGhost(state);
    status(`Ghost: your ${saved.time.toFixed(2)} s in the ${carById(saved.carId).name}`);
  };
  const armGhostRef = useRef(armGhost);
  armGhostRef.current = armGhost;

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
    rendererRef.current?.setGhost(null);
    setMenu({ page: "root" });
  };

  const startStage = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
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
    armGhost(spec, mode, levelId);
    playCameraRef.current = startCamera(optionsRef.current.camera);
    // The god-mode effect owns the camera while it is flying; setting a play
    // camera here as well would land the flight every time a run started.
    if (!godRef.current) rendererRef.current?.setCamera(playCameraRef.current);
    logRunStart(`${mode} ${stageQuery(spec)}`);
  };

  const playLevel = (level: CampaignLevel, mode: PlayMode): void => {
    status(`${mode === "timetrial" ? "Time trial" : "Campaign"} — ${level.name}`);
    startStage(
      {
        seed: level.seed,
        length: level.length,
        shape: level.shape ?? "sprint",
        laps: lapsOverride() ?? levelLaps(level),
        // A campaign stage is the same country for everybody: the dials are
        // Roam's to play with, not the campaign's to inherit.
        knobs: DEFAULT_STAGE_KNOBS,
        carId: raceRef.current.carId,
        timeOfDay: level.timeOfDay,
        weather: level.weather,
        skipCountdown: false,
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
        skipCountdown: false,
      },
      "roam",
    );
  };

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
      onReset: () => rendererRef.current?.resetMap(),
    }),
    [],
  );

  /** The chassis secret, found. It sticks: a player who drummed seven times
   * on purpose does not want to do it again next launch. */
  const revealDeveloper = (): void => {
    if (optionsRef.current.developer) return;
    status("Developer menu unlocked");
    applyOptions({ ...optionsRef.current, developer: true });
  };

  const applyOptions = (next: Settings): void => {
    setOptions(next);
    optionsRef.current = next;
    saveSettings(next);
    setAudioVolumes(next.audio);
    input.setKeys(next.keys);
    rendererRef.current?.setVideo(next.video);
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
      fps,
      build: BUILD,
    };
  };
  const debugContextRef = useRef(debugContext);
  debugContextRef.current = debugContext;

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
  useEffect(() => {
    if (inMenu) return armMenuMusic();
    playMusic("taiga");
    return undefined;
  }, [inMenu]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    input.setKeys(optionsRef.current.keys);
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
      renderer.setMapRect(mapRectRef.current);
      cleanups.push(() => renderer.dispose());
      const page = menuRef.current;
      if (page) showBackdropRef.current(page);
      else {
        const r = raceRef.current;
        const spec: StageSpec = {
          seed: seedRef.current,
          length: r.length,
          shape: r.shape,
          laps: lapsOverride() ?? raceLaps(r),
          knobs: r.knobs,
          carId: r.carId,
          timeOfDay: r.timeOfDay,
          weather: r.weather,
          skipCountdown: false,
        };
        applyStageRef.current(spec, true);
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
        applyStageRef.current(spec, true);
        const active = runRef.current;
        armGhostRef.current(spec, active.mode, active.levelId);
      };
      const camera = (): void => {
        if (menuRef.current) return;
        // Genuinely nothing to do while flying: god mode is not on the
        // ladder, and walking off it would land the camera by accident.
        if (godRef.current) return;
        const mode = renderer.cycleCamera();
        const play = PLAY_CAMERAS.find((cam) => cam.id === mode);
        // Remembered only when it IS a play camera: the ladder never walks
        // onto the overhead views, and the one god mode lands back on has to
        // be a camera somebody can drive from.
        if (play) playCameraRef.current = play.id;
        flash(`${play?.label ?? "CHASE"} CAM`, "info");
      };
      actionsRef.current = { restart, menu: goMainMenu, camera };
      input.onAction((action) => {
        if (action === "restart") restart();
        else if (action === "menu") goMainMenu();
        else if (action === "pause") {
          if (!menuRef.current) setPaused((was) => !was);
        } else camera();
      });

      const handleEvents = (state: GameState, events: GameEvent[]): void => {
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
            if (active.levelId) {
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
                  ),
                );
              }
              recorderRef.current = null;
              setProgress(recordFinish(active.levelId, ev.time));
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
          // hung, and the moment the tank runs dry. Splashes, crashes,
          // landings and respawns all announce themselves on screen already
          // — captioning them is noise over the top of the game.
          if (ev.type === "lap") {
            flash(
              `LAP ${ev.lap} — ${formatTime(ev.time)}${ev.best ? " BEST" : ""}`,
              ev.best ? "good" : "info",
            );
          } else if (ev.type === "landing" && ev.clean && ev.airTime >= REAL_AIR) {
            flash(`CLEAN AIR ${ev.airTime.toFixed(1)}s`, "good");
          } else if (ev.type === "boostEmpty") {
            flash("BOOSTER SPENT", "bad");
          }
        }
      };

      // Fixed-timestep driver: engine steps at TUNING.dt regardless of frame
      // rate; a hitching tab clamps the backlog instead of spiraling. Behind
      // the menu the BOT is at the wheel; on the Roam page nothing drives at
      // all and only the map camera turns.
      let raf = 0;
      let autopilot = autopilotRequested();
      let last = performance.now();
      let acc = 0;
      let hudClock = 0;
      /** Frames and seconds since the rate was last worked out, and the
       * answer — the debug overlay's only performance number. */
      let fpsFrames = 0;
      let fpsSeconds = 0;
      let fps = 0;
      let traceClock = 0;
      let altWas = false;
      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        const dtFrame = Math.min(0.1, (now - last) / 1000);
        last = now;
        fpsFrames++;
        fpsSeconds += dtFrame;
        if (fpsSeconds >= 0.5) {
          fps = fpsFrames / fpsSeconds;
          fpsFrames = 0;
          fpsSeconds = 0;
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
        // The pause card is a run that must not tick while the player is
        // reading it — and a paused run is a FROZEN one: rendered with no
        // time passing, so the wheels stop turning, the dust hangs and the
        // camera holds. A frame's worth of dt handed to the renderer over a
        // state that is not moving is a car doing 120 km/h on stopped
        // ground. The Roam page is different: nothing is driving there
        // either, but the map camera is still turning, so it keeps its time.
        if (page === null && pausedRef.current) {
          acc = 0;
          renderer.render(state, 0);
          return;
        }
        if (page?.page === "roam") {
          acc = 0;
          renderer.render(state, dtFrame);
          return;
        }
        acc += dtFrame;
        while (acc >= TUNING.dt) {
          acc -= TUNING.dt;
          // Sampled every step whether or not it is the one driving: the
          // pedals and the wheel RAMP, and a sample skipped is a ramp that
          // never moves.
          const human = input.sample(TUNING.dt);
          if (autopilot && driving(human)) autopilot = false;
          const driven = page || autopilot ? botInput(state) : human;
          const events = step(state, driven);
          if (events.length > 0) handleEvents(state, events);
          if (page) continue;
          // The tape is what the ENGINE was handed, so a replay drives the
          // same road; the ghost's own game steps beside it off its own.
          recorderRef.current?.record(driven);
          const ghost = ghostRef.current;
          if (ghost) {
            const ghostEvents = step(ghost.state, ghost.tape.at(ghost.at++));
            if (ghostEvents.length > 0) renderer.onGhostEvents(ghost.state, ghostEvents);
          }
        }
        // The road bed belongs to a run the player is IN. Behind the menu the
        // stage is scenery under a theme, and an engine bed over the top of
        // that is two pieces of music at once.
        if (!page) audioRef.current?.frame(state, dtFrame);
        renderer.render(state, dtFrame);
        // Every frame, ahead of the throttled snapshot: the clock's
        // hundredths and the start lights are the two things a run cannot
        // read at 12 Hz.
        if (!page) readLive(liveRef.current, state);
        hudClock += dtFrame;
        if (hudClock > 0.08) {
          hudClock = 0;
          if (!page) {
            setSnap(
              takeSnapshot(
                state,
                finishTimeRef.current,
                ghostRef.current?.state.progressS ?? null,
                bookRef.current,
              ),
            );
            // The overlay reads its own snapshot: it needs the CAMERA, which
            // the HUD's has no reason to carry, and it is off entirely for
            // everyone who never let the developer menu out.
            if (debugRef.current) setDebugCtx(debugContextRef.current(fps));
          }
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
  // the way out and nothing else.
  const upNext = run.mode === "campaign" && run.levelId ? nextLevel(run.levelId) : null;
  const nextStage = upNext
    ? { name: upNext.name, go: (): void => playLevel(upNext, "campaign") }
    : null;

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
      {snap && !menu && !hudHidden && (
        <Hud
          snap={snap}
          live={liveRef.current}
          flashes={flashes}
          input={input}
          show={options.hud}
          touchLayout={options.touch}
          onPause={() => setPaused(true)}
          onCamera={() => actionsRef.current.camera()}
          nextStage={nextStage}
          onRetire={goMainMenu}
          scores={finishScores}
        />
      )}
      {/* Outside the HUD on purpose: ALT takes the game's chrome off so a
          frame can be judged on its pixels, and a frame nobody can place is
          worth nothing to whoever has to fix it. */}
      {options.dev.debug && debugCtx && gameRef.current && !menu && (
        <DebugHud ctx={debugCtx} state={gameRef.current} hudHidden={hudHidden} />
      )}
      {paused && !menu && (
        <PauseMenu
          seed={stageRef.current?.seed ?? seed}
          carName={carById(race.carId).name}
          dev={options.developer ? options.dev : null}
          onDev={(dev) => applyOptions({ ...options, dev })}
          onResume={() => setPaused(false)}
          onRestart={() => actionsRef.current.restart()}
          onMainMenu={goMainMenu}
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
          onMapRect={setMapRect}
          mapView={mapView}
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
