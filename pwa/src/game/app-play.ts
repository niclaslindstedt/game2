// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERY WAY A RUN IS STARTED AND LEFT. What it takes to get from a menu
// card to a car on a grid — the loading card and its steps, the stage
// stood up, the campaign level, the training ground, Roam, a replay, a
// benchmark — and the way back out of each of them.
//
// It sits on top of the arming half (`app-actions.ts`): that decides what
// a stage IS and hangs the field, the ghost and the tape off it; this
// decides WHEN, and what the player sees while it happens.

import { useRef } from "react";
import { carById, parseTape, readTape, status, type RunTape, type Track } from "@engine";

import { BENCHMARK } from "./benchmark-plan.ts";
import { runBenchmark, warmBenchmark, type BenchmarkWarmup } from "./benchmark.ts";
import { rememberBenchmark } from "./benchmark-history.ts";
import { desktopPicture } from "./desktop-video.ts";
import { connectOutput } from "../output-bridge.ts";
import { stageQuery } from "./debug-info.ts";
import { log as debugLog, logRunStart } from "./debug-log.ts";
import { type HudFlash } from "./hud.tsx";
import { loadedTimes, rememberTimes } from "./load-times.ts";
import { createLoad, loadPhase, loadTimes, type LoadStep } from "./race-loader.ts";
import {
  catchUpFrom,
  enterCrew,
  fieldWritten,
  playerSlot,
  type FieldBuild,
  type FieldPlan,
} from "./standings.ts";
import { type StageSpec } from "./stage-spec.ts";
import {
  readReplayMeta,
  replayField,
  replayStage,
  replayTitle,
  type ReplayMeta,
} from "./replay.ts";
import { newReplayId, putReplay } from "./replay-store.ts";
import { replayStageName } from "./menu-replays.tsx";
import { raceLaps, type PlayMode, type RaceSettings } from "./menu.tsx";
import { type MenuPage } from "./main-menu.tsx";
import {
  findLevel,
  levelLaps,
  loadProgress,
  type CampaignLevel,
  campaignKnobs,
} from "./campaign.ts";
import { pictureRows } from "./settings.ts";
import { coastMusic } from "./audio/music.ts";

connectOutput();

import { lapsOverride, RACE_KEY } from "./app-url.ts";
import { fieldCars, gridSlotFor, MODE_NAME, startCamera, trainingSpec } from "./app-race.ts";
import { LOAD_FADE_MS } from "./app-hud.ts";

import type { MutableRef } from "preact/hooks";

import type { RunStore } from "./app-store.ts";
/** The half of the actions a run is ARMED with. Stated here rather than
 * inferred off `app-actions.ts` because the two modules are mutually
 * recursive at the type level otherwise: that one builds this one. */
export type RunArming = {
  /** Stand the stage up: compile it if it is not the one standing, seat the
   * car, and hand the whole world to the renderer. */
  applyStageRef: MutableRef<(spec: StageSpec, force?: boolean) => void>;
  /** The rivals, the ghost and the tape, each armed for the stage about to
   * be driven — or cleared where the mode carries none of them. */
  armFieldRef: MutableRef<(spec: StageSpec, mode: PlayMode, plan?: FieldPlan) => void>;
  armGhostRef: MutableRef<(spec: StageSpec, mode: PlayMode, levelId?: string) => void>;
  armTapeRef: MutableRef<
    (spec: StageSpec, mode: PlayMode, levelId?: string, plan?: FieldPlan) => void
  >;
  armSplitRecords: (spec: StageSpec, mode: PlayMode) => void;
  /** ...and the same three called directly, where the loading card's steps
   * run them in order rather than a later render's version of them. */
  applyStage: (spec: StageSpec, force?: boolean) => void;
  armGhost: (spec: StageSpec, mode: PlayMode, levelId?: string) => void;
  armTape: (spec: StageSpec, mode: PlayMode, levelId?: string, plan?: FieldPlan) => void;
  ensureTrack: (spec: StageSpec) => Track;
  /** The rivals, opened and then installed as two steps, so the card can
   * show the crew arriving between them. */
  openFieldFor: (spec: StageSpec, mode: PlayMode, plan?: FieldPlan) => FieldBuild | null;
  installField: (build: FieldBuild) => void;
  clearField: () => void;
  /** The compiled stage for a spec, from the cache when it is the same one. */
  ensureTrackRef: MutableRef<(spec: StageSpec) => Track>;
  /** One line in the news column. */
  flash: (text: string, tone: HudFlash["tone"]) => void;
  /** Out to the main menu, whatever was standing. */
  goMainMenu: () => void;
  /** The live backdrop a menu page is driven under, and the theme playing
   * over it. */
  showBackdropRef: MutableRef<(page: MenuPage) => void>;
  stageMusicRef: MutableRef<() => void>;
};

export type PlayActions = ReturnType<typeof usePlayActions>;

export function usePlayActions(store: RunStore, arming: RunArming) {
  const {
    audioRef,
    benchRef,
    bookRef,
    canvasRef,
    cardPhaseRef,
    fieldRef,
    gameRef,
    godRef,
    loadDoneRef,
    loadRef,
    loadShownRef,
    menuRef,
    optionsRef,
    pickPlayCamera,
    playCameraRef,
    raceRef,
    rendererRef,
    replayRef,
    result,
    runRef,
    seedRef,
    setBench,
    setCardPhase,
    setLoading,
    setMenu,
    setPaused,
    setRace,
    setReplaying,
    setRun,
    tapeEndRef,
    tapeRef,
  } = store;
  const {
    applyStage,
    armGhost,
    armTape,
    ensureTrack,
    openFieldFor,
    installField,
    clearField,
    goMainMenu,
    showBackdropRef,
    stageMusicRef,
  } = arming;

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

  return {
    beginLoad,
    endLoad,
    beginLoadRef,
    endLoadRef,
    startStage,
    playLevel,
    playTraining,
    playRoam,
    startReplay,
    keepReplay,
    watchLastRun,
    benchmarkStage,
    startBenchmark,
    leaveBenchmark,
    leaveBenchmarkRef,
    applyRace,
  };
}
