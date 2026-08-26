// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app shell: boots to the pre-race menu over a live view of today's
// stage — pick time of day, weather, and car, then START. Owns the fixed-
// timestep game loop (engine at 120 Hz, render per frame; the loop idles
// while the menu is up), the daily-seed stage rotation, and the PWA update
// toast. The heavy state lives in refs; the HUD re-renders from a ~12 Hz
// snapshot. URL params (?seed=, ?tod=, ?weather=, ?car=, ?start=1) pin a
// run for tooling and screenshots.

import { useEffect, useMemo, useRef, useState } from "react";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  TUNING,
  carById,
  compileStage,
  createGame,
  status,
  step,
  type GameEvent,
  type GameState,
  type StageLength,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import type { GameRenderer } from "./game/renderer.ts";
import { Hud, type HudFlash, type HudPacenote, type HudSnapshot } from "./game/hud.tsx";
import {
  PreRaceMenu,
  STAGE_LENGTH_OPTIONS,
  TIMES_OF_DAY,
  WEATHERS,
  type RaceSettings,
} from "./game/menu.tsx";

connectOutput();

/** Everyone gets the same opening stage on a given day; every finished
 * stage advances to the next seed. */
function dailySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}

const SETTINGS_KEY = "sideways-race-settings";

/** Initial settings: URL params (tooling) beat the stored choice beats the
 * defaults. Storage can be unavailable (private mode) — defaults are fine. */
function initialSettings(): RaceSettings {
  const settings: RaceSettings = {
    timeOfDay: "day",
    weather: "clear",
    carId: "compact",
    length: "medium",
  };
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) Object.assign(settings, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === settings.length)) settings.length = "medium";
  const params = new URLSearchParams(location.search);
  const tod = params.get("tod");
  if (TIMES_OF_DAY.some((t) => t.id === tod)) settings.timeOfDay = tod as TimeOfDay;
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) settings.weather = weather as Weather;
  const car = params.get("car");
  if (car === "compact" || car === "classic") settings.carId = car;
  const length = params.get("length");
  if (STAGE_LENGTH_OPTIONS.some((l) => l.id === length)) settings.length = length as StageLength;
  return settings;
}

/** How far ahead the co-driver calls, meters — four seconds at pace, with a
 * floor so slow corners still get called and a ceiling so a long straight
 * is not spent staring at the far end's turn. */
function callDistance(u: number): number {
  return Math.min(320, Math.max(150, u * 4));
}

/** Turn angle past which a call earns the LONG modifier, radians (~100°). */
const LONG_NOTE_ANGLE = 1.75;

/** The next co-driver calls: the note under or ahead of the car plus the
 * one after it (so combinations read as "hard left INTO easy right"). The
 * engine's positive dir grows the heading, which the mirrored screen shows
 * as a LEFT turn — the same one-flip rule input.ts applies to steering. */
function upcomingPacenotes(state: GameState): HudPacenote[] {
  const out: HudPacenote[] = [];
  for (const note of state.track.pacenotes) {
    if (note.endS <= state.progressS) continue;
    if (note.s - state.progressS > callDistance(state.car.u)) break;
    out.push({
      dir: note.dir > 0 ? "left" : "right",
      severity: note.severity,
      long: note.angle > LONG_NOTE_ANGLE,
      distance: Math.max(0, note.s - state.progressS),
    });
    if (out.length >= 2) break;
  }
  return out;
}

/** Tach reading, 0..1 of the redline: how far up the current gear the car
 * is, over an idle floor so the needle never falls off the dial. The engine
 * has no rev model — gearing plus FORWARD speed is the rev counter, and
 * forward speed is what the gearbox shifts on, so the needle and the shift
 * light always agree with the gear. */
function tachometer(state: GameState): number {
  const top = state.spec.gearTop[state.car.gear];
  return Math.min(1, 0.18 + 0.82 * Math.max(0, state.car.u / top));
}

function takeSnapshot(state: GameState, finishTime: number | null): HudSnapshot {
  const rpm = tachometer(state);
  // The rendered world is a mirror of the engine's map view, so the wind
  // arrow's screen angle is the NEGATED car-relative bearing (the same
  // one-flip rule input.ts applies to steering).
  const windKmh = Math.hypot(state.wind.x, state.wind.z) * 3.6;
  const windScreenAngle =
    -(Math.atan2(state.wind.x, state.wind.z) - state.car.heading) * (180 / Math.PI);
  return {
    phase: state.phase,
    countdown: Math.max(0, TUNING.countdown - state.t),
    time: state.raceTime,
    // The speedo reads GROUND speed, not forward speed: a car crossed up
    // at 140 km/h is doing 140 km/h, and a needle that dips every time the
    // nose swings would tell the player the slide is costing them.
    speedKmh: Math.max(0, Math.hypot(state.car.u, state.car.w) * 3.6),
    gear: state.car.gear,
    gearbox: state.spec.gearbox,
    rpm,
    shiftUp: rpm > 0.83 && state.car.gear < state.spec.gearTop.length - 1,
    airborne: state.car.airborne,
    progress: state.track.endless ? 0 : Math.min(1, state.progressS / state.track.length),
    endless: state.track.endless,
    distanceKm: state.progressS / 1000,
    pacenotes: state.phase === "racing" ? upcomingPacenotes(state) : [],
    seed: state.seed,
    carName: state.spec.name,
    offRoad: state.offRoad,
    finishTime,
    boostLeft: state.car.boostLeft,
    boostMax: TUNING.boost.capacity,
    boosting: state.car.boosting,
    windKmh,
    windScreenAngle,
  };
}

let flashId = 0;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const input = useMemo(() => createInput(), []);
  const [settings, setSettings] = useState<RaceSettings>(initialSettings);
  const [menuOpen, setMenuOpen] = useState(() => {
    const params = new URLSearchParams(location.search);
    // ?start=1 skips the menu (tooling); ?menu=1 forces it back open.
    return params.get("menu") === "1" || params.get("start") !== "1";
  });
  const [seed, setSeed] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : dailySeed();
  });
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  const finishTimeRef = useRef<number | null>(null);
  const actionsRef = useRef<{ restart: () => void; menu: () => void; camera: () => void }>({
    restart: () => undefined,
    menu: () => undefined,
    camera: () => undefined,
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const trackRef = useRef<{ seed: number; length: StageLength; track: Track } | null>(null);

  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });

  const flash = (text: string, tone: HudFlash["tone"]): void => {
    const id = ++flashId;
    setFlashes((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setFlashes((prev) => prev.filter((f) => f.id !== id)), 1800);
  };

  /** (Re)build the run for the current seed and settings. The compiled
   * track is cached per seed and length, so menu tweaks re-light instantly. */
  const newGame = (nextSeed: number, rebuildWorld: boolean): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const s = settingsRef.current;
    // An endless track is never reused: a restart must begin from a fresh
    // opening window, not from however far the last run streamed (the
    // renderer has long since dropped the world around the start).
    if (
      trackRef.current?.seed !== nextSeed ||
      trackRef.current.length !== s.length ||
      s.length === "endless"
    ) {
      trackRef.current = {
        seed: nextSeed,
        length: s.length,
        track: compileStage(nextSeed, s.length),
      };
    }
    finishTimeRef.current = null;
    const state = createGame({
      seed: nextSeed,
      carId: s.carId,
      track: trackRef.current.track,
      env: { timeOfDay: s.timeOfDay, weather: s.weather },
    });
    const previous = gameRef.current;
    gameRef.current = state;
    // A different track object (new seed OR new length) is a different
    // world; only same-track tweaks get away with a re-light.
    if (
      rebuildWorld ||
      !previous ||
      previous.track !== state.track ||
      previous.spec.id !== s.carId
    ) {
      renderer.setGame(state);
    } else {
      renderer.setConditions(state);
    }
    setSnap(takeSnapshot(state, null));
  };
  const newGameRef = useRef(newGame);
  newGameRef.current = newGame;

  const applySettings = (next: RaceSettings): void => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the choice still applies to this session */
    }
    settingsRef.current = next;
    newGame(seedRef.current, false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    // The render stack — three.js and the whole world builder — loads as
    // its own chunk, keeping the entry script inside the §11.3.9
    // critical-path budget: the shell parses and paints at once, the world
    // follows a breath later (from the service-worker cache once installed).
    void import("./game/renderer.ts").then(({ createRenderer }) => {
      if (disposed) return;
      const renderer = createRenderer(canvas);
      rendererRef.current = renderer;
      cleanups.push(() => renderer.dispose());
      newGameRef.current(seedRef.current, true);

      const restart = (): void => newGameRef.current(seedRef.current, false);
      const menu = (): void => {
        newGameRef.current(seedRef.current, false);
        setMenuOpen(true);
      };
      const camera = (): void => {
        const mode = renderer.cycleCamera();
        flash(mode === "hood" ? "HOOD CAM" : "CHASE CAM", "info");
      };
      actionsRef.current = { restart, menu, camera };
      input.onAction((action) => {
        if (action === "restart") restart();
        else if (action === "swap") menu();
        else camera();
      });

      let nextStageTimer: ReturnType<typeof setTimeout> | null = null;
      cleanups.push(() => {
        if (nextStageTimer) clearTimeout(nextStageTimer);
      });
      const handleEvents = (state: GameState, events: GameEvent[]): void => {
        renderer.onEvents(state, events);
        for (const ev of events) {
          if (ev.type === "landing") {
            flash(
              ev.clean ? `CLEAN AIR ${ev.airTime.toFixed(1)}s` : "ROUGH LANDING",
              ev.clean ? "good" : "bad",
            );
          } else if (ev.type === "splash") {
            flash("SPLASH", "info");
          } else if (ev.type === "boostEmpty") {
            flash("BOOSTER SPENT", "bad");
          } else if (ev.type === "crash") {
            flash(ev.into === "water" ? "INTO THE WATER" : "CRASHED", "bad");
          } else if (ev.type === "respawn") {
            flash("BACK ON THE ROAD", "bad");
          } else if (ev.type === "finish") {
            finishTimeRef.current = ev.time;
            nextStageTimer = setTimeout(() => {
              const next = seedRef.current + 1;
              seedRef.current = next;
              setSeed(next);
              newGameRef.current(next, true);
            }, 4000);
          }
        }
      };

      // Fixed-timestep driver: engine steps at TUNING.dt regardless of frame
      // rate; a hitching tab clamps the backlog instead of spiraling. While
      // the menu is up the engine holds and only the scene breathes.
      let raf = 0;
      let last = performance.now();
      let acc = 0;
      let hudClock = 0;
      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        const dtFrame = Math.min(0.1, (now - last) / 1000);
        last = now;
        const state = gameRef.current;
        if (!state) return;
        if (menuOpenRef.current) {
          acc = 0;
          renderer.render(state, dtFrame);
          return;
        }
        acc += dtFrame;
        while (acc >= TUNING.dt) {
          acc -= TUNING.dt;
          const events = step(state, input.sample(TUNING.dt));
          if (events.length > 0) handleEvents(state, events);
        }
        renderer.render(state, dtFrame);
        hudClock += dtFrame;
        if (hudClock > 0.08) {
          hudClock = 0;
          setSnap(takeSnapshot(state, finishTimeRef.current));
        }
      };
      raf = requestAnimationFrame(frame);
      cleanups.push(() => cancelAnimationFrame(raf));

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
    // The loop is created once; menu, settings, and restarts flow through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-root">
      <canvas ref={canvasRef} className="game-canvas" />
      {snap && !menuOpen && (
        <Hud
          snap={snap}
          flashes={flashes}
          input={input}
          onMenu={() => actionsRef.current.menu()}
          onRestart={() => actionsRef.current.restart()}
          onCamera={() => actionsRef.current.camera()}
        />
      )}
      {menuOpen && (
        <PreRaceMenu
          seed={seed}
          settings={settings}
          onChange={applySettings}
          onStart={() => {
            status(
              `Racing ${carById(settings.carId).name} — ${settings.timeOfDay}, ${settings.weather}`,
            );
            setMenuOpen(false);
          }}
        />
      )}
      <UpdateToast
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={pwa.reload}
        onDismiss={pwa.dismiss}
      />
    </div>
  );
}
