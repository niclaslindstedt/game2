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
// ?tod=, ?weather=, ?car=, ?length=, the four generator dials ?elevation=
// ?water= ?trees= ?asphalt=, ?start=1 and ?bot=1) pin a run for tooling and
// screenshots.

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
  type GameEvent,
  type GameState,
  type StageKnobs,
  type StageLength,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import type { CameraMode } from "./game/camera.ts";
import type { GameRenderer } from "./game/renderer.ts";
import { Hud, type HudFlash, type HudSnapshot } from "./game/hud.tsx";
import { takeSnapshot } from "./game/snapshot.ts";
import {
  DEFAULT_STAGE_KNOBS,
  PauseMenu,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  TIMES_OF_DAY,
  WEATHERS,
  type RaceSettings,
} from "./game/menu.tsx";
import { MainMenu, type MenuPage, type PlayMode } from "./game/main-menu.tsx";
import type { MapRect } from "./game/menu-roam.tsx";
import {
  loadProgress,
  recordFinish,
  unlockEverything,
  type CampaignLevel,
  type CampaignProgress,
} from "./game/campaign.ts";
import { loadSettings, saveSettings, type Settings } from "./game/settings.ts";
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
    knobs: { ...DEFAULT_STAGE_KNOBS },
  };
  try {
    const stored = localStorage.getItem(RACE_KEY);
    if (stored) Object.assign(race, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === race.length)) race.length = "medium";
  const params = new URLSearchParams(location.search);
  const tod = params.get("tod");
  if (TIMES_OF_DAY.some((t) => t.id === tod)) race.timeOfDay = tod as TimeOfDay;
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) race.weather = weather as Weather;
  const car = params.get("car");
  if (car === "compact" || car === "classic") race.carId = car;
  const length = params.get("length");
  if (STAGE_LENGTH_OPTIONS.some((l) => l.id === length)) race.length = length as StageLength;
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

/** Everything that decides WHICH stage is standing: change any of it and
 * the run is rebuilt. */
type StageSpec = {
  seed: number;
  length: StageLength;
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
  const [options, setOptions] = useState<Settings>(loadSettings);
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
  /** The attract card is up until a press clears it; `booted` is the moment
   * the render stack has landed and the first stage is standing, which is what
   * the card is covering — and what it waits for before it puts its title up
   * and asks for that press. Tooling runs pass ?start=1 and never see it. */
  const [splashUp, setSplashUp] = useState(() => !splashSkipped(location.search));
  const [booted, setBooted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  const finishTimeRef = useRef<number | null>(null);
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
    const key = `${spec.seed}/${spec.length}/${STAGE_DIALS.map((d) => spec.knobs[d.key]).join(",")}`;
    if (trackRef.current?.key !== key || spec.length === "endless") {
      trackRef.current = { key, track: compileStage(spec.seed, spec.length, spec.knobs) };
    }
    finishTimeRef.current = null;
    const state = createGame({
      seed: spec.seed,
      carId: spec.carId,
      track: trackRef.current.track,
      skipCountdown: spec.skipCountdown,
      env: { timeOfDay: spec.timeOfDay, weather: spec.weather },
    });
    const previous = gameRef.current;
    gameRef.current = state;
    // A different track object (new seed OR new length) is a different
    // world; only same-track tweaks get away with a re-light.
    if (!previous || previous.track !== state.track || previous.spec.id !== spec.carId) {
      renderer.setGame(state);
    } else {
      renderer.setConditions(state);
    }
    setSnap(takeSnapshot(state, null));
  };
  const applyStageRef = useRef(applyStage);
  applyStageRef.current = applyStage;

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

  /** Leave whatever is on screen for the main menu, with its demo behind it. */
  const goMainMenu = (): void => {
    setPaused(false);
    setMenu({ page: "root" });
  };

  const startStage = (spec: StageSpec, mode: PlayMode, levelId?: string): void => {
    playUi("start");
    // A new run inherits nothing from the last one: the engine's note would
    // otherwise glide from wherever the previous car left it.
    audioRef.current?.reset();
    setPaused(false);
    setRun({ mode, levelId });
    runRef.current = { mode, levelId };
    setMenu(null);
    menuRef.current = null;
    applyStage(spec, true);
    rendererRef.current?.setCamera("chase");
  };

  const playLevel = (level: CampaignLevel, mode: PlayMode): void => {
    status(`${mode === "timetrial" ? "Time trial" : "Campaign"} — ${level.name}`);
    startStage(
      {
        seed: level.seed,
        length: level.length,
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

  // The menu's backdrop follows the page, the seed and the demo's roll.
  useEffect(() => {
    if (menu) showBackdropRef.current(menu);
  }, [menu, seed, demoSeed]);

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
        applyStageRef.current(
          {
            seed: seedRef.current,
            length: r.length,
            knobs: r.knobs,
            carId: r.carId,
            timeOfDay: r.timeOfDay,
            weather: r.weather,
            skipCountdown: false,
          },
          true,
        );
      }

      const restart = (): void => {
        setPaused(false);
        const spec = stageRef.current;
        if (spec) applyStageRef.current(spec, true);
      };
      const camera = (): void => {
        if (menuRef.current) return;
        const mode = renderer.cycleCamera();
        flash(mode === "hood" ? "HOOD CAM" : "CHASE CAM", "info");
      };
      actionsRef.current = { restart, menu: goMainMenu, camera };
      input.onAction((action) => {
        if (action === "restart") restart();
        else if (action === "menu") goMainMenu();
        else if (action === "pause") {
          if (!menuRef.current) setPaused((was) => !was);
        } else camera();
      });

      let nextStageTimer: ReturnType<typeof setTimeout> | null = null;
      cleanups.push(() => {
        if (nextStageTimer) clearTimeout(nextStageTimer);
      });
      const handleEvents = (state: GameState, events: GameEvent[]): void => {
        renderer.onEvents(state, events);
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
            if (active.levelId) setProgress(recordFinish(active.levelId, ev.time));
            // A stage ends where it started: back to the menu, with the
            // result on screen long enough to read.
            nextStageTimer = setTimeout(goMainMenu, 4500);
            continue;
          }
          if (demo) continue;
          // The banner is for what the player CANNOT see: how long that jump
          // hung, and the moment the tank runs dry. Splashes, crashes,
          // landings and respawns all announce themselves on screen already
          // — captioning them is noise over the top of the game.
          if (ev.type === "landing" && ev.clean && ev.airTime >= REAL_AIR) {
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
      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        const dtFrame = Math.min(0.1, (now - last) / 1000);
        last = now;
        const state = gameRef.current;
        if (!state) return;
        const page = menuRef.current;
        // The pause card is a run that must not tick while the player is
        // reading it; the Roam page is a stage nobody is driving.
        if ((page === null && pausedRef.current) || page?.page === "roam") {
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
          const events = step(state, page || autopilot ? botInput(state) : human);
          if (events.length > 0) handleEvents(state, events);
        }
        // The road bed belongs to a run the player is IN. Behind the menu the
        // stage is scenery under a theme, and an engine bed over the top of
        // that is two pieces of music at once.
        if (!page) audioRef.current?.frame(state, dtFrame);
        renderer.render(state, dtFrame);
        hudClock += dtFrame;
        if (hudClock > 0.08) {
          hudClock = 0;
          if (!page) setSnap(takeSnapshot(state, finishTimeRef.current));
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

  return (
    <div className="app-root">
      <canvas ref={canvasRef} className="game-canvas" onPointerDown={unlockAudio} />
      {snap && !menu && (
        <Hud
          snap={snap}
          flashes={flashes}
          input={input}
          show={options.hud}
          touchLayout={options.touch}
          onPause={() => setPaused(true)}
          onCamera={() => actionsRef.current.camera()}
        />
      )}
      {paused && !menu && (
        <PauseMenu
          seed={stageRef.current?.seed ?? seed}
          carName={carById(race.carId).name}
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
