// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING ONE RUNNING APP REMEMBERS, in the order the hooks are called.
// Two kinds live here and the split between them is the whole design: what
// the SCREEN is drawn from is state, and what the FRAME LOOP reads is a
// ref — the loop runs at 60 Hz off a closure made once, so anything it has
// to see the latest of is mirrored into a ref beside its state on every
// render.
//
// It is one hook rather than several so the order is stated once and the
// rest of the app takes a single object: `App.tsx` builds it, the actions
// (`app-actions.ts`) are made over it, and the frame loop
// (`run-loop.ts`) is handed it.

import { useMemo, useRef, useState } from "react";
import { usePwaUpdate } from "../lib/pwa-update.ts";
import {
  type GameState,
  type GearboxMode,
  type RetireReason,
  type Difficulty,
  type TapePlayer,
  type Track,
} from "@engine";

import { cacheIdForBase } from "../app-pwa.ts";
import { shellHost } from "../shell-host.ts";
import { type BenchmarkStatus } from "./benchmark.ts";
import { connectOutput } from "../output-bridge.ts";
import { createInput } from "./input.ts";
import { createMenuNav } from "./menu-nav.ts";
import { type DebugContext } from "./debug-info.ts";
import type { GameRenderer } from "./renderer.ts";
import { type HudFlash, type HudSnapshot, type HudSplit } from "./hud.tsx";
import { type SplitRecords } from "./split-records.ts";
import { type LoadJob, type LoadPhase } from "./race-loader.ts";
import { type ClassRow, type FieldPlan, type RivalField, type RivalRun } from "./standings.ts";
import { type RunTapeEnd, type RunTapeRecorder } from "./run-tape.ts";
import { type StageSpec } from "./stage-spec.ts";
import { type ReplayMeta } from "./replay.ts";
import { type ScoreEntry } from "./scores.ts";
import { createLive, createPaceMemory, type RunBook } from "./snapshot.ts";
import { type Trip } from "./odometer.ts";
import { type PlayMode, type RaceSettings } from "./menu.tsx";
import { type MenuPage } from "./main-menu.tsx";
import type { MapRect } from "./map-pane.tsx";
import { loadProgress, type CampaignProgress } from "./campaign.ts";
import { type GhostRecorder, type GhostTape } from "./ghost.ts";
import { hudShow, type PlayCamera, type Settings } from "./settings.ts";
import type { RunAudio } from "./audio/index.ts";
import { type Capture, type ShotNotes } from "./screenshots.ts";
import { type HudLayer } from "./shot-hud.ts";
import { splashSkipped } from "./splash.ts";

connectOutput();

import {
  autopilotRequested,
  dailySeed,
  mapFullFromUrl,
  mapLayerFromUrl,
  modeFromUrl,
  updateNudgeForced,
  URL_PLACE,
} from "./app-url.ts";
import { initialRace, initialSettings } from "./app-start.ts";
import { type Settling, type WatchFace, type WatchMode } from "./app-hud.ts";

export type RunStore = ReturnType<typeof useRunStore>;

export function useRunStore() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const input = useMemo(() => createInput(), []);
  /** The controller's way around the menus. It reads the cards off the DOM
   * rather than off this component's state, so it covers the finish card and
   * the studio card too — surfaces `menu` and `paused` know nothing about. */
  const menuNav = useMemo(() => createMenuNav(), []);
  const [race, setRace] = useState<RaceSettings>(initialRace);
  const [options, setOptions] = useState<Settings>(initialSettings);
  /** R29/R30 — the campaign board: what has been driven, what every stage
   * paid, and the best of each. Read once and carried in state, because the
   * results card and the campaign menu both render off it and neither should
   * be a storage read. */
  const [progress, setProgress] = useState<CampaignProgress>(loadProgress);
  /** The stage just finished, classified — every crew's time in finishing
   * order, which only exists once the last car is home. Null until then, and
   * again the moment the next run starts. */
  const [result, setResult] = useState<{ levelId: string; rows: ClassRow[] } | null>(null);
  /** The benchmark on screen: where it has got to while it runs, and the
   * time it took once it is done. Null whenever there is not one, which is
   * what the HUD, the pause card and the frame loop all read to know the
   * canvas is not theirs. */
  const [bench, setBench] = useState<BenchmarkStatus | null>(null);
  /** …and the way to stop it, which outlives any one frame. Kept beside the
   * state rather than derived from it because the frame loop and the input
   * handler are built once and read everything through refs. */
  const benchRef = useRef<{ stop: () => void } | null>(null);
  const [menu, setMenu] = useState<MenuPage | null>(() => {
    // ?start=1 launches straight into a run (tooling); everyone else gets
    // the main menu. `?roam=1` opens the map page itself — what the map's
    // repro line points at, and what a screenshot pass of the generator's
    // layers asks for.
    const params = new URLSearchParams(location.search);
    // `?roam=1` opens the map page. Which of the two it is is decided by the
    // developer's own switches: a line carrying a layer or the full-screen
    // flag is a repro of the VIEWER (see mapReproQuery), and one carrying
    // neither is a player's link to a seed.
    if (params.get("roam") === "1") {
      const viewing = mapFullFromUrl() || mapLayerFromUrl() !== null;
      return viewing ? { page: "roam", viewing: true } : { page: "roam" };
    }
    return params.get("start") === "1" && params.get("menu") !== "1" ? null : { page: "root" };
  });
  const [seed, setSeed] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : dailySeed();
  });
  /** Which stage the menu's demo is on. It rolls forward every time the bot
   * finishes one, so a menu left open keeps showing new road. */
  const [demoSeed, setDemoSeed] = useState(() => dailySeed());
  /** …and that roll is a ONE-SHOT instruction to the backdrop: build the
   * demo's own road rather than take the one standing (`demoStage`). Consumed
   * by the next backdrop, because past it the demo is simply on whatever is
   * there — and because every OTHER way a backdrop is asked for (arriving at
   * a menu page, changing a setting behind one) is one where the road already
   * on screen is the road to keep. */
  const demoRollRef = useRef(false);
  /** The run in progress: how it was entered, and which campaign level it
   * is, so a finish can record the clear. A `?start=1` link never passes
   * through `startStage`, so the discipline it opens in is settled here. */
  const [run, setRun] = useState<{ mode: PlayMode; levelId?: string }>(modeFromUrl);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  /** THE ODOMETER on the tachometer: the lifetime metres of the car being
   * driven, read on the HUD's own tick. Beside the snapshot rather than in
   * it because it belongs to the CAR and not to the run — every discipline
   * feeds the same counter, and a stage walked out of halfway still leaves
   * the kilometres it covered on it (odometer.ts). */
  const [odo, setOdo] = useState<number | null>(null);
  /** The open counter for the car on the road, and the run that is running
   * into it. Replaced whenever a different car is put on the road; the
   * total behind it is written on every hundred metres. */
  const tripRef = useRef<Trip | null>(null);
  /** THE TIME TRIAL'S BOARD, for the run that has just ended. `pending` is the
   * run waiting on its three letters; it is what holds the results card's ways
   * on back until they are typed. Cleared with every start, so a board never
   * outlives the stage it belongs to. */
  const [scores, setScores] = useState<{
    board: readonly ScoreEntry[];
    place: number;
    /** The car, the box and the difficulty the run was driven with, as one
     * line for the card — the same three the row it becomes will carry. */
    drove: string;
    pending: {
      levelId: string;
      time: number;
      carId: string;
      gearbox: GearboxMode;
      difficulty: Difficulty;
      /** When the run ENDED, not when the name was posted: the board shows
       * the row's date while it is being typed, and a stamp taken at the
       * press would change under the player mid-entry. */
      at: number;
      offer: string;
    } | null;
  } | null>(null);
  /** The clock and the start lights, at frame rate. One object for the life
   * of the app, rewritten in place — the HUD holds its identity and reads it
   * on its own animation frame, so neither instrument waits for a snapshot. */
  const liveRef = useRef(createLive());
  /** The co-driver's latch, one object for the life of the app: which corner
   * is already on the strip, so a call cannot be taken back down by the
   * braking that follows it. */
  const paceRef = useRef(createPaceMemory());
  /** The attract card is up until a press clears it; `booted` is the moment
   * the render stack has landed and the first stage is standing, which is what
   * the card is covering — and what it waits for before it puts its title up
   * and asks for that press. Tooling runs pass ?start=1 and never see it. */
  const [splashUp, setSplashUp] = useState(() => !splashSkipped(location.search));
  const [booted, setBooted] = useState(false);
  // Up from the first frame on a `?paused=1` link: the card is the one
  // surface a screenshot of it wants, and a press to raise it is a press a
  // scene has to time.
  const [paused, setPaused] = useState(URL_PLACE.paused);
  /** Whether the loading card is up. Two beats, like the splash card: `true`
   * while the load is running, then `"leaving"` for the fade that hands the
   * road over — the run is LIVE under a leaving card, which is what makes
   * the lights the first thing a player sees rather than the second. */
  const [loading, setLoading] = useState<boolean | "leaving">(false);
  /** What the loading card says it is doing, and where that sits in the count
   * (`race-loader.ts`). Null before the first load of the session, and while
   * the same card is standing in for a lost GPU context. */
  const [cardPhase, setCardPhase] = useState<LoadPhase | null>(null);
  /** True while the GPU has the WebGL context and the page does not — see
   * `gpu-context.ts`. Nothing can be drawn, so the frame loop holds and the
   * cover goes up; the ref is what the loop reads, since the loop is built
   * once and never sees a re-render. */
  const [gpuLost, setGpuLost] = useState(false);
  const gpuLostRef = useRef(false);
  /** True while ALT is held: the game's chrome comes off so a frame can be
   * judged on the pixels alone. The debug overlay is NOT part of it — a
   * screenshot with nothing to say where it was taken is the one thing the
   * overlay exists to prevent. */
  const [hudHidden, setHudHidden] = useState(false);
  /** True while a controller is connected and allowed to drive. The frame
   * loop asks the pad every frame; this is only written when the answer
   * CHANGES, because it is a React state and a stage is 90 000 frames. */
  const [padded, setPadded] = useState(false);
  /** What the debug overlay is reading, refreshed on the HUD's own tick and
   * only while the overlay is up. */
  const [debugCtx, setDebugCtx] = useState<DebugContext | null>(null);
  /** The frame rate, out where anything that has to describe THIS MOMENT can
   * reach it. The overlay gets it pushed on the HUD's tick; the shutter and
   * the copy button read it at the press, and neither of them is in the loop
   * that works it out. */
  const fpsRef = useRef(0);
  /** ...and the same number rounded off for the HUD's own readout under the
   * minimap, which only the players who asked for it (OPTIONS ▸ HUD ▸ FPS)
   * ever see. Its own state rather than a field of the HUD snapshot: the
   * snapshot is what the CAR is doing, and this is what the machine drawing
   * it is doing. Written on the HUD's twelve-a-second tick, and only while
   * there is somebody to read it. */
  const [hudFps, setHudFps] = useState(0);
  const [flashes, setFlashes] = useState<HudFlash[]>([]);
  /** The same column in a ref, because every line's own timer expires it
   * from outside the render: `flash` has to read the column that is UP to
   * decide whether the line it is adding pushes an old one out. */
  const flashesRef = useRef<HudFlash[]>([]);
  /** R28 — the split just driven through, until the run's clock times it
   * out. Mirrored in a ref: the frame loop is created once and expires it
   * from there, off the same clock the split is a reading of. */
  const [split, setSplit] = useState<HudSplit | null>(null);
  const splitRef = useRef<HudSplit | null>(null);
  splitRef.current = split;
  /** The splits this run is measured against, in board order — the ghost's
   * own, on a stage where the ghost is the only thing out there. A campaign
   * run prefers the LEADER's split, which is not knowable in advance and is
   * read off the field as each board goes by. */
  const splitsRef = useRef<{ times: number[]; against: string }>({ times: [], against: "" });
  /** R28 — THE SEGMENT RECORDS: the quickest this machine has ever covered
   * the road between one board and the next, and the race clock at the last
   * board so the segment can be measured off it. Kept for the run rather
   * than read back off storage per board, so a machine that cannot store
   * anything still calls the records set this session. `id` is empty on a
   * stage that keeps no book at all (`armSplitRecords`). */
  const recordsRef = useRef<{ id: string; best: SplitRecords; lastBoard: number }>({
    id: "",
    best: [],
    lastBoard: 0,
  });
  /** R29 — THE FIELD: fourteen rival games on the same road, stepped beside
   * the player's. Null on every run with nobody entered (Roam, time trial,
   * the menu's demo). */
  const fieldRef = useRef<RivalField | null>(null);
  /** THE RACE BEING STOOD UP, and null whenever one is not (`race-loader.ts`).
   * The frame loop hands it whole frames for as long as it is here, and draws
   * nothing else while it does: there is a card over the canvas. */
  const loadRef = useRef<LoadJob | null>(null);
  /** What to run on the frame the load finishes, for the one caller that
   * cannot simply be handed a run and left to it. */
  const loadDoneRef = useRef<(() => void) | null>(null);
  /** Whether the loading card has had a frame to be DRAWN in. The first
   * step of a load compiles a road and holds the frame it does it in, so
   * starting one on the same frame the card is mounted would paint the card
   * after the freeze it exists to cover — which is the bug, with an extra
   * component. So the driver spends one frame doing nothing at all. */
  const loadShownRef = useRef(false);
  /** Which phase of the load the card is naming (`loadPhase`). Held in a ref
   * beside the state because the loop reads it every frame and must be able
   * to tell a phase CHANGE from the many frames still on the same one — both
   * so the card is re-rendered once per phase rather than once per frame, and
   * because a change is what buys the phase a frame to be drawn in. */
  const cardPhaseRef = useRef<LoadPhase | null>(null);
  /** R30 — the field being RUN HOME behind the results card. The player is
   * across the line, but the crews still out there have places worth points
   * to somebody, so they are driven to the finish off the card's own frames
   * (see `settleField`) and the classification is booked when the last one
   * lands. Null once the sheet is in, and again on every start. */
  const settleRef = useRef<Settling | null>(null);
  /** R30 — the crew that run-out is being WATCHED through (spectate.ts), and
   * null whenever the card is up instead. Held in a ref because the frame
   * loop follows it; `watchFace` is the same feed read for the HUD, on the
   * HUD's own tick. */
  const spectateRef = useRef<RivalRun | null>(null);
  /** …and whether that is the card's own backdrop or the feed the player
   * asked for. Both step the same run-out; they differ in the camera and in
   * which of the two the HUD is drawing. */
  const watchModeRef = useRef<WatchMode>("off");
  /** …and the same answer as state, for the HUD: behind the CARD the
   * run-out is a backdrop, every instrument on the driving layout is a
   * reading of a car that is parked, so the chrome comes down and the card
   * is left standing over the race on its own. */
  const [watching, setWatching] = useState(false);
  /** …and the feed itself, once the player has asked for one. Null whenever
   * the card is up instead; refreshed on the HUD's own tick from inside the
   * frame loop. */
  const [watchFace, setWatchFace] = useState<WatchFace | null>(null);
  /** The watched crew's own frame-rate channel and co-driver memory, so a
   * clock in somebody else's car still counts hundredths and the player's
   * own latch is never written by a run they are not driving. */
  const watchLiveRef = useRef(createLive());
  const watchPaceRef = useRef(createPaceMemory());
  /** The feed's presses, plus the way it is torn down. Wired inside the
   * frame-loop effect, where the renderer that has to be told lives. */
  const watchActionsRef = useRef<{
    open: () => void;
    step: (by: number) => void;
    leave: () => void;
    close: () => void;
  }>({
    open: () => undefined,
    step: () => undefined,
    leave: () => undefined,
    close: () => undefined,
  });
  /** Where the run stands, as of the last board it went through. Held in a
   * ref because the HUD reads it off the snapshot the frame loop takes, and
   * mirrored into state only so the results card re-renders on the finish. */
  const standingRef = useRef<{ place: number; of: number } | null>(null);
  const finishTimeRef = useRef<number | null>(null);
  /** Why the run ended short of the line, once it has (`retire`): what the
   * card says over a car that is never going to move again. Null on a run
   * still going, and on one that reached the line. */
  const retiredRef = useRef<RetireReason | null>(null);
  /** The controls of the run being driven, written down step by step so a
   * time worth keeping can be raced against later. Null on a stage that
   * keeps no time — Roam, and the menu's demo. */
  const recorderRef = useRef<GhostRecorder | null>(null);
  /** The ghost being raced: its OWN game, stepped from the tape beside the
   * player's, plus how far into the tape that game has got. Two games, one
   * track, and nothing between them — the cars cannot touch, because
   * neither one is in the other's world. */
  const ghostRef = useRef<{ state: GameState; tape: GhostTape; at: number } | null>(null);
  /** Whether the stage being driven HAS a ghost on file that still describes
   * it. A best time is normally what decides whether a run is kept, but a
   * stage with a time and no tape — a board carried over from a build whose
   * tapes this one cannot read — would then keep no ghost until the day
   * somebody beat their own record. Read at the line (see the finish
   * handler); armed with the ghost. */
  const ghostOnFileRef = useRef(false);
  /** THE RUN TAPE (game/run-tape.ts): the same controls the ghost writes
   * down, in a file something outside the browser can drive. Armed only by
   * the COLLECT RACE DATA switch, on every kind of run — including the ones
   * that keep no time, because a Roam lap is as good a drive to calibrate
   * against as a campaign stage. Null the rest of the time, which is always. */
  const tapeRef = useRef<RunTapeRecorder | null>(null);
  /** What the run scored, booked at the line. Its presence is also what
   * STOPS the tape: R25's roll-out is driven past a clock that has already
   * stopped, and recording it would put a minute of coasting on the end of
   * every replay. */
  const tapeEndRef = useRef<Omit<RunTapeEnd, "rows" | "rivalSplits"> | null>(null);
  /** THE REPLAY ON SCREEN, when the run being watched is a recorded one
   * (game/replay.ts). The tape has the wheel: the frame loop hands the engine
   * the controls this recording was driven on instead of the player's, and
   * everything else about the run — the stage, the car, the field, the
   * physics — is the same code doing the same work, which is what makes the
   * picture the run rather than a picture OF the run.
   *
   * `at` is how many steps of it have been driven, and it is the only piece
   * of this that moves. Null on every run the player is actually driving. */
  const replayRef = useRef<{
    /** What it is filed under, minted at the press whether or not it is ever
     * kept, so the disk can be pressed twice without doubling the row. */
    id: string;
    meta: ReplayMeta;
    /** The tape as JSONL, held so the disk files what is being watched
     * rather than re-sealing a recorder that is no longer running. */
    text: string;
    player: TapePlayer;
    /** The field the run was driven against, re-entered for the watching. */
    plan: FieldPlan | null;
    at: number;
  } | null>(null);
  /** ...and the strip over it (hud-replay.tsx): what is being watched, and
   * whether it has been kept. State rather than a ref because the disk's own
   * press is what changes it. */
  const [replaying, setReplaying] = useState<{ meta: ReplayMeta; kept: boolean } | null>(null);
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
  /** The same camera as the HUD sees it, so the cluster can stand down
   * while the player is sat in the car. Written wherever the ref is. */
  const [hudCamera, setHudCamera] = useState<PlayCamera>(options.camera);
  const pickPlayCamera = (cam: PlayCamera): void => {
    playCameraRef.current = cam;
    setHudCamera(cam);
  };
  /** God mode and the overlay, as the frame loop sees them. */
  const godRef = useRef(false);
  const debugRef = useRef(options.dev.debug);
  debugRef.current = options.dev.debug;
  /** Which parts of the HUD the player's switches leave up. Worked out once
   * here so the readout and the frame loop that feeds it read the same
   * answer. */
  const hudParts = hudShow(options.hud);
  /** ...and whether the frame rate is one of them, as the frame loop sees
   * it: a rate nobody is looking at is a state that should not be written
   * twelve times a second. */
  const hudFpsRef = useRef(hudParts.fps);
  hudFpsRef.current = hudParts.fps;
  /** `?bot=1` — the bot has the wheel until a human touches a control. A ref
   * rather than a local of the frame loop because god mode's HOLD reads it:
   * a run somebody else is driving is the one flight that must not stop it. */
  const autopilotRef = useRef(autopilotRequested());
  /** Whether god mode is holding the run still, decided once by the frame
   * loop and read back by the debug overlay — a picture taken from up here
   * should say whether the world under it was moving. */
  const heldRef = useRef(false);
  /** The compiled stage, cached under everything that decides what it IS:
   * the seed, the length band, and the dials. */
  const audioRef = useRef<RunAudio | null>(null);
  const trackRef = useRef<{ key: string; track: Track } | null>(null);
  const stageRef = useRef<StageSpec | null>(null);
  /** Roam's map pane, held here so a renderer that finishes loading after
   * the pane has already measured itself still learns where to draw. */
  const mapRectRef = useRef<MapRect | null>(null);
  /** A screenshot the player has asked for, waiting for a frame to be taken
   * off. It is a REQUEST rather than a capture because the drawing buffer
   * is only readable inside the animation callback that drew it — the frame
   * loop is the only place in the app that is (screenshots.ts) — and
   * because a press must never stop the car. Null means nothing pending;
   * a second press before the first has been served simply relabels it.
   *
   * `notes` is the caption painted INTO the picture rather than left on the
   * page (screenshots.ts): the developer map's boxes, or the driving
   * overlay's while it is up. Null on a player's own shot, which is the
   * frame and its instruments. `hud` is those instruments, serialized at
   * the press for the same reason the boxes are — both are DOM, and neither
   * is in the drawing buffer the frame comes off (shot-hud.ts). `done` is
   * how whoever asked finds out — the capture happens frames later, in the
   * loop, and it is the only place that ever holds the finished picture. */
  const shotRef = useRef<{
    label: string;
    notes: ShotNotes | null;
    /** Whether the app's MARK goes in the corner (screenshots.ts). Off for
     * a developer's picture: the mark is there to say where a shared frame
     * came from, and a debug capture is evidence — it is read for the boxes
     * and the repro line, and a badge over the bottom-right corner is one
     * more thing sitting on the subject. */
    sign: boolean;
    hud: HudLayer | null;
    done?: (capture: Capture | null) => void;
  } | null>(null);

  // Off in dev, and off inside the desktop app: there the site is bundled
  // and served off local disk, so the bundle is the update and a worker
  // precaching it would only ever prompt about a build it already is.
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV && shellHost() === null,
  });
  const forcedUpdate = useMemo(() => updateNudgeForced(), []);
  /** Whether the rear-view glass has the road in it, this session. The HUD
   * option decides whether the game has a mirror at all; this is the press on
   * the glass itself (hud-mirror.tsx), and it only ever takes the RENDERING
   * down — the glass stays where it hung, grey, and is the whole of what has
   * to be found to bring the picture back. Deliberately not saved: blanking
   * the mirror over one jump says nothing about what the player wants the
   * next time the game is opened, and the menu is where a mirror is switched
   * off for good.
   *
   * The switch says so on the glass rather than in the flash column: the
   * words belong on the thing that changed, and a grey strip at the top of
   * the frame has to carry its own explanation for as long as it is up. */
  const [mirrorLive, setMirrorLive] = useState(true);
  const mirrorLiveRef = useRef(true);

  return {
    mirrorLive,
    setMirrorLive,
    mirrorLiveRef,
    actionsRef,
    audioRef,
    autopilotRef,
    bench,
    benchRef,
    bookRef,
    booted,
    canvasRef,
    cardPhase,
    cardPhaseRef,
    debugCtx,
    debugRef,
    demoRollRef,
    demoSeed,
    demoSeedRef,
    fieldRef,
    finishTimeRef,
    flashes,
    flashesRef,
    forcedUpdate,
    fpsRef,
    gameRef,
    ghostOnFileRef,
    ghostRef,
    godRef,
    gpuLost,
    gpuLostRef,
    heldRef,
    hudCamera,
    hudFps,
    hudFpsRef,
    hudHidden,
    hudParts,
    input,
    liveRef,
    loadDoneRef,
    loadRef,
    loadShownRef,
    loading,
    mapRectRef,
    menu,
    menuNav,
    menuRef,
    odo,
    options,
    optionsRef,
    paceRef,
    padded,
    paused,
    pausedRef,
    pickPlayCamera,
    playCameraRef,
    progress,
    pwa,
    race,
    raceRef,
    recorderRef,
    recordsRef,
    rendererRef,
    replayRef,
    replaying,
    result,
    retiredRef,
    run,
    runRef,
    scores,
    seed,
    seedRef,
    setBench,
    setBooted,
    setCardPhase,
    setDebugCtx,
    setDemoSeed,
    setFlashes,
    setGpuLost,
    setHudCamera,
    setHudFps,
    setHudHidden,
    setLoading,
    setMenu,
    setOdo,
    setOptions,
    setPadded,
    setPaused,
    setProgress,
    setRace,
    setReplaying,
    setResult,
    setRun,
    setScores,
    setSeed,
    setSnap,
    setSplashUp,
    setSplit,
    setWatchFace,
    setWatching,
    settleRef,
    shotRef,
    snap,
    spectateRef,
    splashUp,
    split,
    splitRef,
    splitsRef,
    stageRef,
    standingRef,
    tapeEndRef,
    tapeRef,
    trackRef,
    tripRef,
    watchActionsRef,
    watchFace,
    watchLiveRef,
    watchModeRef,
    watchPaceRef,
    watching,
  };
}
