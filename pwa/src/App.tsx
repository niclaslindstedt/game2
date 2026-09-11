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

import { useCallback, useEffect, useRef } from "react";
import { carById, status } from "@engine";

import { onShellCommand } from "./shell-host.ts";
import { connectOutput } from "./output-bridge.ts";
import { DebugCopyButton, DebugHud } from "./game/debug-hud.tsx";
import { log as debugLog, setDebugLogging } from "./game/debug-log.ts";
import { Hud, HudFlashes } from "./game/hud.tsx";
import type { FinishRace, FinishScores, FinishStandings } from "./game/hud-finish.tsx";
import { LoadingScreen } from "./game/loading-screen.tsx";
import type { SheetRow } from "./game/results-sheet.tsx";
import { fieldResults, PLAYER_ID } from "./game/standings.ts";
import type { SpectateProps } from "./game/hud-spectate.tsx";
import { saveRunTape, type RunTapeEnd } from "./game/run-tape.ts";
import { replayLine, replayTitle } from "./game/replay.ts";
import { replayTape } from "./game/replay-store.ts";
import { ReplayBar } from "./game/hud-replay.tsx";
import { glassSlot } from "./game/hud-mirror.tsx";
import { replayStageName } from "./game/menu-replays.tsx";
import { recordScore, rememberInitials } from "./game/scores.ts";
import { PauseMenu, gridSize } from "./game/menu.tsx";
import { MainMenu } from "./game/main-menu.tsx";
import { OrientationGate } from "./game/orientation-gate.tsx";
import { mustPause } from "./game/orientation.ts";
import { BenchmarkCard } from "./game/menu-bench.tsx";
import {
  PODIUM,
  findLevel,
  ladderAfter,
  lockEverything,
  lockLocation,
  locationStandings,
  locationWon,
  pointsFor,
  resetPoints,
  stagePoints,
  unlockEverything,
  unlockLocation,
} from "./game/campaign.ts";
import { setAudioVolumes, unlockAudio } from "./game/audio/bus.ts";
import { armMenuMusic, pauseMusic, resumeMusic, stopMusic } from "./game/audio/music.ts";
import { setRumble } from "./game/haptics.ts";
import { relaySharedTaps } from "./game/second-finger.ts";
import { SplashScreen } from "./game/splash-screen.tsx";
import { guardTextInteraction } from "./game/text-interaction.ts";
import { UpdateButton } from "./game/update-button.tsx";

connectOutput();

import { URL_POSE } from "./game/app-url.ts";

import { useRunActions } from "./game/app-actions.ts";
import { startRun } from "./game/run-loop.ts";
import { useRunStore } from "./game/app-store.ts";

export function App() {
  const store = useRunStore();
  const {
    actionsRef,
    audioRef,
    autopilotRef,
    bench,
    booted,
    canvasRef,
    cardPhase,
    debugCtx,
    demoSeed,
    fieldRef,
    flashes,
    forcedUpdate,
    gameRef,
    godRef,
    gpuLost,
    hudCamera,
    hudFps,
    hudHidden,
    hudParts,
    input,
    liveRef,
    loading,
    menu,
    menuRef,
    odo,
    options,
    optionsRef,
    padded,
    paused,
    pausedRef,
    playCameraRef,
    progress,
    pwa,
    race,
    rendererRef,
    replaying,
    result,
    run,
    scores,
    seed,
    setMenu,
    setPaused,
    setProgress,
    setScores,
    setSeed,
    setSplashUp,
    snap,
    splashUp,
    split,
    stageRef,
    tapeEndRef,
    tapeRef,
    watchActionsRef,
    watchFace,
    watchLiveRef,
    watching,
    mirrorLive,
  } = store;

  const actions = useRunActions(store);
  const {
    flash,
    toggleMirror,
    takeShotRef,
    stageMusicRef,
    showBackdropRef,
    goMainMenu,
    playLevel,
    playRoam,
    startReplay,
    keepReplay,
    watchLastRun,
    watchRunSoFar,
    startBenchmark,
    leaveBenchmark,
    applyRace,
    setMapRect,
    mapView,
    mapDebug,
    loadRoamLevel,
    revealDeveloper,
    applyOptions,
    readDebugRef,
  } = actions;

  // The menu's backdrop follows the page, the seed and the demo's roll.
  useEffect(() => {
    if (menu) showBackdropRef.current(menu);
  }, [menu, seed, demoSeed, showBackdropRef]);

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
  }, [godActive, input, menuRef, playCameraRef, rendererRef]);

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
    // `flash` is rebuilt every render, and the guard above makes a re-run a
    // no-op — the announcement is owed to a CHANGE of god mode, not to a
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [godActive, autopilotRef]);

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
  }, [optionsRef]);

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
    [actionsRef, menuRef, setMenu, setPaused, takeShotRef],
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

  // A SCREEN TURNED UPRIGHT MID-RUN. Portrait is barred (orientation.ts) and
  // the cover that goes up is opaque, so the same rule the lost GPU context
  // obeys applies: a run nobody can see goes on the pause card and waits
  // there. A menu needs none of it — what is driving under a menu is a bot.
  const onPortraitBarred = useCallback(() => {
    if (mustPause(true, menuRef.current !== null)) setPaused(true);
  }, [menuRef, setPaused]);

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
  }, [audioRef]);

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
  }, [inMenu, benchmarking, stageMusicRef]);

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

  // The loop is stood up ONCE, on the render the canvas arrives. It reads
  // the app through the store's refs from then on, so a later render's
  // `store` and `actions` are the same thing to it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => startRun(store, actions), []);

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

  /** WATCH THE RUN SO FAR — the same offer, mid-stage, off the pause card.
   * Offered on any run with a recording behind it that has not stopped yet:
   * over a replay there is nothing new to watch, once the clock has stopped
   * the results card is already offering it with a result on it, and a tape
   * with no steps on it — the card opened during the countdown — is a
   * recording of nothing. The card asks before it takes it, because it ends
   * the run (menu.tsx). */
  const onWatchSoFar =
    run.mode !== "replay" && tapeRef.current?.steps() && !tapeEndRef.current
      ? (): void => watchRunSoFar()
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
        // strip is chrome and places itself off the same numbers `.hud`
        // carries, but it has to stand whether or not the rest of the HUD is
        // up — ALT takes that down, and the results card takes it down for
        // itself.
        <div
          className="hud pointer-events-none absolute inset-0 select-none"
          // The strip stands across the TOP of the frame, which is also where
          // the rear-view glass hangs — so this layer reads the same two flags
          // the HUD's own root does (`glassSlot`, hud-mirror.tsx) and the bar
          // drops under the glass wherever there is a strip of it. From the
          // seat there is none: the rear view is in the windscreen.
          data-glass={
            glassSlot({
              mirror: hudParts.mirror,
              spectating: spectate !== null,
              flying: godActive,
              phase: (watchFace ? watchFace.snap : snap)?.phase ?? "",
              live: mirrorLive,
            }) === "off"
              ? undefined
              : "1"
          }
          data-seated={hudCamera === "cockpit" && !godActive ? "1" : undefined}
        >
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
          onWatchReplay={onWatchSoFar}
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
      {/* PORTRAIT IS TURNED OFF (orientation.ts). Last in the tree and above
          even the splash card: an upright screen is not a state any surface
          of this game is offered in, so the cover goes over all of them. */}
      <OrientationGate onBarred={onPortraitBarred} />
    </div>
  );
}
