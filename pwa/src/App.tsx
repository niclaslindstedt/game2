// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app shell: boots straight into a stage — no menu. Owns the fixed-
// timestep game loop (engine at 120 Hz, render per frame), the daily-seed
// stage rotation, car swapping, and the PWA update toast. The heavy state
// lives in refs; the HUD re-renders from a ~12 Hz snapshot.

import { useEffect, useMemo, useRef, useState } from "react";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import { TUNING, carById, createGame, status, step, type GameEvent, type GameState } from "@engine";

import { cacheIdForBase } from "./app-pwa.ts";
import { connectOutput } from "./output-bridge.ts";
import { createInput } from "./game/input.ts";
import { createRenderer, type GameRenderer } from "./game/renderer.ts";
import { Hud, type HudFlash, type HudSnapshot } from "./game/hud.tsx";

connectOutput();

/** Everyone gets the same opening stage on a given day; every finished
 * stage advances to the next seed. */
function dailySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function takeSnapshot(state: GameState, finishTime: number | null): HudSnapshot {
  return {
    phase: state.phase,
    countdown: Math.max(0, TUNING.countdown - state.t),
    time: state.raceTime,
    speedKmh: Math.max(0, state.car.u * 3.6),
    gear: state.car.gear,
    gearbox: state.spec.gearbox,
    drifting: state.car.drifting,
    airborne: state.car.airborne,
    driftScore: state.stats.driftScore,
    progress: Math.min(1, state.progressS / state.track.length),
    seed: state.seed,
    carName: state.spec.name,
    offRoad: state.offRoad,
    finishTime,
    boostLeft: state.car.boostLeft,
    boostMax: TUNING.boost.capacity,
    boosting: state.car.boosting,
  };
}

let flashId = 0;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const input = useMemo(() => createInput(), []);
  const [carId, setCarId] = useState("compact");
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  const finishTimeRef = useRef<number | null>(null);
  const actionsRef = useRef<{ restart: () => void; swap: () => void; camera: () => void }>({
    restart: () => undefined,
    swap: () => undefined,
    camera: () => undefined,
  });
  const carIdRef = useRef(carId);
  carIdRef.current = carId;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;

    let seed = dailySeed();
    const newGame = (nextSeed: number, nextCarId: string): void => {
      seed = nextSeed;
      finishTimeRef.current = null;
      const state = createGame({ seed: nextSeed, carId: nextCarId });
      gameRef.current = state;
      renderer.setGame(state);
      setSnap(takeSnapshot(state, null));
    };
    newGame(seed, carIdRef.current);

    const restart = (): void => newGame(seed, carIdRef.current);
    const swap = (): void => {
      const next = carIdRef.current === "compact" ? "classic" : "compact";
      setCarId(next);
      status(`Car swapped to ${carById(next).name}`);
      newGame(seed, next);
    };
    const camera = (): void => {
      const mode = renderer.cycleCamera();
      flash(mode === "hood" ? "HOOD CAM" : "CHASE CAM", "info");
    };
    actionsRef.current = { restart, swap, camera };
    input.onAction((action) => {
      if (action === "restart") restart();
      else if (action === "swap") swap();
      else camera();
    });

    let nextStageTimer: ReturnType<typeof setTimeout> | null = null;
    const handleEvents = (state: GameState, events: GameEvent[]): void => {
      renderer.onEvents(state, events);
      for (const ev of events) {
        if (ev.type === "driftEnd" && ev.clean) {
          flash(`DRIFT +${ev.boost.toFixed(1)}`, "good");
        } else if (ev.type === "landing") {
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
          nextStageTimer = setTimeout(() => newGame(seed + 1, carIdRef.current), 4000);
        }
      }
    };

    // Fixed-timestep driver: engine steps at TUNING.dt regardless of frame
    // rate; a hitching tab clamps the backlog instead of spiraling.
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
    // The loop is created once; car swaps and restarts flow through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-root">
      <canvas ref={canvasRef} className="game-canvas" />
      {snap && (
        <Hud
          snap={snap}
          flashes={flashes}
          input={input}
          onSwapCar={() => actionsRef.current.swap()}
          onRestart={() => actionsRef.current.restart()}
          onCamera={() => actionsRef.current.camera()}
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
