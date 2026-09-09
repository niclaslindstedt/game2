// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERY WAY THE PLAYER CHANGES WHAT THE APP IS DOING. A press on a menu
// card, a key, a pad button or a link all end up in one of these: stand a
// stage up, arm the field and the ghost and the tape for it, load it and
// hand over to the frame loop, take a photograph, put a split on screen,
// leave for the menu again.
//
// They are closures over the store (`app-store.ts`) rather than free
// functions because every one of them reads or writes what the app
// remembers, and they are made fresh on every render for the same reason a
// component's handlers are. The frame loop is handed the FIRST render's
// set, which is what it has always had: it reads the world through refs,
// and the refs are the same objects on every render.

import { useRef } from "react";
import {
  NUMERIC_KNOBS,
  TUNING,
  carById,
  apronForGrid,
  compileArena,
  compileStage,
  createGame,
  damageScaleFor,
  status,
  type FiniteStageLength,
  type Track,
} from "@engine";

import { connectOutput } from "../output-bridge.ts";
import { type HudFlash } from "./hud.tsx";
import { loadSplitRecords, postSplitRecord, splitStageId } from "./split-records.ts";
import { warmPortraits } from "./car-portraits.ts";
import {
  enterCrew,
  openField,
  sealField,
  PLAYER_ID,
  type FieldBuild,
  type FieldPlan,
} from "./standings.ts";
import { createRunTape } from "./run-tape.ts";
import { sameStage, type StageSpec } from "./stage-spec.ts";
import { takeSnapshot } from "./snapshot.ts";
import { createTrip } from "./odometer.ts";
import { type PlayMode } from "./menu.tsx";
import { type MenuPage } from "./main-menu.tsx";
import { findLevel } from "./campaign.ts";
import {
  createGhostRecorder,
  ghostMatches,
  loadGhost,
  readGhost,
  type GhostStage,
} from "./ghost.ts";
import { playUi } from "./audio/ui.ts";
import { musicPlaying, playMusic, stageTrack } from "./audio/music.ts";
import { readHudLayer } from "./shot-hud.ts";
import { beginImageCopy, copiedWithin } from "../lib/share-image.ts";

connectOutput();

import { backdropFor, fieldPlan, runDifficulty } from "./app-race.ts";
import { FLASH_FADE, FLASH_LIFE, FLASH_LINES, nextFlashId } from "./app-hud.ts";

import type { RunStore } from "./app-store.ts";
import { usePlayActions } from "./app-play.ts";
import { useMapActions } from "./app-map.ts";

export type RunActions = ReturnType<typeof useRunActions>;

export function useRunActions(store: RunStore) {
  const {
    audioRef,
    bookRef,
    debugRef,
    demoRollRef,
    demoSeedRef,
    fieldRef,
    finishTimeRef,
    flashesRef,
    gameRef,
    ghostOnFileRef,
    ghostRef,
    godRef,
    loadRef,
    menuRef,
    mirrorLiveRef,
    optionsRef,
    paceRef,
    raceRef,
    recorderRef,
    recordsRef,
    rendererRef,
    replayRef,
    retiredRef,
    runRef,
    seedRef,
    setFlashes,
    setMenu,
    setMirrorLive,
    setOdo,
    setPaused,
    setReplaying,
    setResult,
    setScores,
    setSnap,
    setSplit,
    settleRef,
    shotRef,
    splitsRef,
    stageRef,
    standingRef,
    tapeEndRef,
    tapeRef,
    trackRef,
    tripRef,
    watchActionsRef,
  } = store;

  const flash = (text: string, tone: HudFlash["tone"]): void => {
    const put = (column: HudFlash[]): void => {
      flashesRef.current = column;
      setFlashes(column);
    };
    const drop = (gone: number): void => put(flashesRef.current.filter((f) => f.id !== gone));
    const id = nextFlashId();
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
      id: nextFlashId(),
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
      // R47 — the run's own snow, so a solid field cuts ONE set of tracks
      // into it and everybody drives everybody's (`snowpack.ts`).
      snow: gameRef.current?.snow,
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

  const arming = {
    applyStage,
    armGhost,
    armTape,
    ensureTrack,
    openFieldFor,
    installField,
    applyStageRef,
    armFieldRef,
    armGhostRef,
    armSplitRecords,
    armTapeRef,
    clearField,
    ensureTrackRef,
    flash,
    goMainMenu,
    showBackdropRef,
    stageMusicRef,
  };
  const play = usePlayActions(store, arming);
  const {
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
  } = play;

  const map = useMapActions(store, applyRace);
  const {
    setMapRect,
    mapLayer,
    setMapLayer,
    mapInfo,
    setMapInfo,
    mapView,
    mapInfoRef,
    readMapDebug,
    readMapDebugRef,
    takeMapShot,
    takeMapShotRef,
    mapDebug,
    loadRoamLevel,
    revealDeveloper,
    applyOptions,
    debugContext,
    debugContextRef,
    readDebug,
    readDebugRef,
  } = map;

  return {
    flash,
    toggleMirror,
    shotLabel,
    takeShot,
    takeShotRef,
    showSplit,
    ensureTrack,
    ensureTrackRef,
    applyStage,
    applyStageRef,
    stageMusic,
    stageMusicRef,
    clearField,
    openFieldFor,
    installField,
    armField,
    armFieldRef,
    armSplitRecords,
    armGhost,
    armGhostRef,
    armTape,
    armTapeRef,
    showBackdrop,
    showBackdropRef,
    goMainMenu,
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
    setMapRect,
    mapLayer,
    setMapLayer,
    mapInfo,
    setMapInfo,
    mapView,
    mapInfoRef,
    readMapDebug,
    readMapDebugRef,
    takeMapShot,
    takeMapShotRef,
    mapDebug,
    loadRoamLevel,
    revealDeveloper,
    applyOptions,
    debugContext,
    debugContextRef,
    readDebug,
    readDebugRef,
  };
}
