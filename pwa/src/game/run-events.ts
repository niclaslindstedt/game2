// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT ONE STEP OF THE ENGINE MEANS TO THE PLAYER. A step hands back the
// events it emitted — a wheel dropped a stone, a board was passed, a rival
// was overtaken, the car drowned, the flag fell — and this is where each of
// them becomes a sound, a line in the news column, a split on screen, a
// score written, a photograph taken, or the results card. It also owns the
// two moments the run changes hands: a restart, and the cut to watching
// somebody else finish.
//
// Made once per run by `run-loop.ts`, over the renderer and the audio it
// has just stood up.

import { carById, type FiniteStageLength, type GameEvent, type GameState } from "@engine";

import { connectOutput } from "../output-bridge.ts";
import type { CameraMode } from "./camera.ts";
import { debugLogging, log as debugLog } from "./debug-log.ts";
import { damageCall, lampCalls, overheatCall, wheelCall } from "./hud.tsx";
import {
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
  stopField,
  type RivalField,
  type RivalRun,
} from "./standings.ts";
import { readWatch, walkWatch, watchLeader } from "./spectate.ts";
import { lastInitials, loadBoard, placeOn } from "./scores.ts";
import { readLive, takeSnapshot } from "./snapshot.ts";
import { findLevel, loadProgress, recordFinish, recordResult } from "./campaign.ts";
import { saveGhost } from "./ghost.ts";
import { WATCHING_CAMERAS } from "./settings.ts";
import { formatTime } from "../lib/util.ts";
import { stopMusic } from "./audio/music.ts";
import { runRumble } from "./haptics.ts";

connectOutput();

import { runDifficulty } from "./app-race.ts";
import {
  REAL_AIR,
  SETTLE_ALL,
  SETTLE_PASSES,
  SPLIT_HOLD,
  WATCH_CAMERA,
  type Settling,
  type WatchFace,
  type WatchMode,
} from "./app-hud.ts";

import type { RunStore } from "./app-store.ts";
import type { RunActions } from "./app-actions.ts";
import type { GameRenderer } from "./renderer.ts";

export function createRunEvents(store: RunStore, actions: RunActions, renderer: GameRenderer) {
  const {
    actionsRef,
    audioRef,
    autopilotRef,
    benchRef,
    bookRef,
    debugRef,
    demoRollRef,
    fieldRef,
    finishTimeRef,
    ghostOnFileRef,
    ghostRef,
    godRef,
    hudFpsRef,
    input,
    menuNav,
    menuRef,
    optionsRef,
    paceRef,
    pickPlayCamera,
    playCameraRef,
    raceRef,
    recorderRef,
    replayRef,
    retiredRef,
    runRef,
    setDebugCtx,
    setDemoSeed,
    setHudFps,
    setOdo,
    setPaused,
    setProgress,
    setResult,
    setScores,
    setSnap,
    setSplit,
    setWatchFace,
    setWatching,
    settleRef,
    spectateRef,
    splitRef,
    stageRef,
    standingRef,
    tapeEndRef,
    tapeRef,
    tripRef,
    watchActionsRef,
    watchLiveRef,
    watchModeRef,
    watchPaceRef,
  } = store;
  const {
    applyOptions,
    flash,
    takeShotRef,
    showSplit,
    goMainMenu,
    beginLoadRef,
    leaveBenchmarkRef,
    debugContextRef,
  } = actions;

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
    // A REPLAY WALKS ONE RUNG FURTHER. The TV gallery is off the ladder a
    // stage is driven from — its tripods show an audience the corner rather
    // than showing a driver the road (camera-tv.ts) — but a recording is
    // exactly the run nobody is steering, so it belongs on the end of the
    // ladder there and only there.
    const mode = renderer.cycleCamera(replayRef.current !== null);
    const play = WATCHING_CAMERAS.find((cam) => cam.id === mode);
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
    renderer.setCamera(on ? WATCH_CAMERA[how === "feed" ? "feed" : "backdrop"] : cameraForPlayer());
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
    else if (action === "hud") {
      // The SAME switch OPTIONS ▸ HUD and the pause card carry, rather than a
      // latch of this key's own: a HUD that came back the next time the game
      // was started would be a setting the player has to find twice, and both
      // rows read the answer straight off the settings they are drawn from —
      // so the card a player opens after pressing this already says OFF.
      // Distinct from the chrome ALT and god mode's Z take off, which is a
      // frame being photographed rather than a player's standing choice.
      const hud = optionsRef.current.hud;
      applyOptions({ ...optionsRef.current, hud: { ...hud, on: !hud.on } });
    } else if (action === "pause") {
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

  return {
    restart,
    camera,
    bookResults,
    readFeed,
    cameraForPlayer,
    cutTo,
    settleNow,
    rubField,
    handleEvents,
    pushHud,
  };
}
