// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FRAME LOOP, and everything that lives inside one run. It is made
// ONCE, when the canvas arrives, and it outlives every render after that:
// the renderer and the run audio load on their own chunks, the engine is
// stepped at its fixed rate against a wall clock, the field is advanced
// beside it, the HUD is fed on its own slower clock, and the events a step
// emits are turned into sound, news lines, splits and photographs.
//
// It reads the app through refs (`app-store.ts`) for the reason any 60 Hz
// closure does — it was made once and the render that made it is long gone
// — and it presses the app's own buttons through the actions
// (`app-actions.ts`) rather than duplicating any of them.

import { TUNING, botInput, placeRun, skipIntro, step, type GameState } from "@engine";

import { connectOutput } from "../output-bridge.ts";
import { stageQuery, traceLine } from "./debug-info.ts";
import { debugLogging, log as debugLog, logRunStart } from "./debug-log.ts";
import { advanceLoad, loadBudgetMs, loadPhase } from "./race-loader.ts";
import {
  advanceField,
  catchUpField,
  fieldTraced,
  onRoad,
  placeField,
  stepField,
  watchField,
} from "./standings.ts";
import { watchLeader } from "./spectate.ts";
import { type StageSpec } from "./stage-spec.ts";
import { readLive } from "./snapshot.ts";
import { raceLaps } from "./menu.tsx";
import { findLevel, levelLaps, loadProgress, campaignKnobs } from "./campaign.ts";
import { frameFloorMs } from "./settings.ts";
import { runRumble } from "./haptics.ts";
import { armScreenshots, captureFrame } from "./screenshots.ts";

connectOutput();

import {
  lapsOverride,
  mirrorHzFromUrl,
  URL_AIR,
  URL_FREE_FOV,
  URL_MAP_POSE,
  URL_PLACE,
  URL_POSE,
  URL_TV_STAND,
} from "./app-url.ts";
import { driving, TRACE_PERIOD, wantsOff } from "./app-start.ts";
import { fieldCars, gridSlotFor, startCamera, trainingSpec } from "./app-race.ts";
import { BACKDROP_AFTER, FIELD_HOLD_MS } from "./app-hud.ts";

import type { RunActions } from "./app-actions.ts";
import type { RunStore } from "./app-store.ts";
import { createRunEvents } from "./run-events.ts";

/** Stand one run's loop up on `canvas`. Returns the teardown the effect
 * that called it owes React. */
export function startRun(store: RunStore, actions: RunActions): (() => void) | undefined {
  const {
    audioRef,
    autopilotRef,
    benchRef,
    bookRef,
    canvasRef,
    cardPhaseRef,
    fieldRef,
    fpsRef,
    gameRef,
    ghostRef,
    godRef,
    gpuLostRef,
    heldRef,
    input,
    liveRef,
    loadRef,
    loadShownRef,
    mapRectRef,
    menuNav,
    menuRef,
    mirrorLiveRef,
    optionsRef,
    pausedRef,
    pickPlayCamera,
    playCameraRef,
    raceRef,
    recorderRef,
    rendererRef,
    replayRef,
    runRef,
    seedRef,
    setBooted,
    setCardPhase,
    setGpuLost,
    setHudHidden,
    setPadded,
    setPaused,
    setWatchFace,
    settleRef,
    shotRef,
    spectateRef,
    tapeEndRef,
    tapeRef,
    watchLiveRef,
    watchModeRef,
  } = store;
  const {
    flash,
    applyStageRef,
    armFieldRef,
    armGhostRef,
    armTapeRef,
    showBackdropRef,
    endLoadRef,
    debugContextRef,
  } = actions;
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
  void import("./audio/index.ts").then(({ createRunAudio }) => {
    if (disposed) return;
    const audio = createRunAudio();
    // The mix follows the camera from the first frame, not the first
    // change of it.
    audio.setView(playCameraRef.current);
    audioRef.current = audio;
  });
  void import("./renderer.ts").then(({ createRenderer }) => {
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
    // ...and a scripted still that wants the TV mode's TRIPODS rather than
    // its broadcast, for the same reason again: a director that chooses per
    // corner cannot be photographed twice (camera-tv-cut.ts).
    if (URL_TV_STAND) renderer.pinTvStand();
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

    const runEvents = createRunEvents(store, actions, renderer);
    const { bookResults, readFeed, cutTo, rubField, handleEvents, pushHud } = runEvents;

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
}
