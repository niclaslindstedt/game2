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
  compileTrack,
  createGame,
  status,
  step,
  type GameEvent,
  type GameState,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import { createRenderer, type GameRenderer } from "./game/renderer.ts";
import { Hud, type HudFlash, type HudSnapshot } from "./game/hud.tsx";
import { PreRaceMenu, TIMES_OF_DAY, WEATHERS, type RaceSettings } from "./game/menu.tsx";

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
  const settings: RaceSettings = { timeOfDay: "day", weather: "clear", carId: "compact" };
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) Object.assign(settings, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  const params = new URLSearchParams(location.search);
  const tod = params.get("tod");
  if (TIMES_OF_DAY.some((t) => t.id === tod)) settings.timeOfDay = tod as TimeOfDay;
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) settings.weather = weather as Weather;
  const car = params.get("car");
  if (car === "compact" || car === "classic") settings.carId = car;
  return settings;
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
    progress: Math.min(1, state.progressS / state.track.length),
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
  const trackRef = useRef<{ seed: number; track: Track } | null>(null);

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
   * track is cached per seed, so menu tweaks re-light instantly. */
  const newGame = (nextSeed: number, rebuildWorld: boolean): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (trackRef.current?.seed !== nextSeed) {
      trackRef.current = { seed: nextSeed, track: compileTrack(nextSeed) };
    }
    finishTimeRef.current = null;
    const s = settingsRef.current;
    const state = createGame({
      seed: nextSeed,
      carId: s.carId,
      track: trackRef.current.track,
      env: { timeOfDay: s.timeOfDay, weather: s.weather },
    });
    const previous = gameRef.current;
    gameRef.current = state;
    if (rebuildWorld || !previous || previous.seed !== nextSeed || previous.spec.id !== s.carId) {
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
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
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

    const onResize = (): void => renderer.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      cancelAnimationFrame(raf);
      if (nextStageTimer) clearTimeout(nextStageTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      renderer.dispose();
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
