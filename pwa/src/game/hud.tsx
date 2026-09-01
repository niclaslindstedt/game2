// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD: chunky arcade chrome over the canvas. Reads a low-rate snapshot
// (the app refreshes it ~12×/s — the canvas is the 60 fps surface, the HUD
// is not), and lays out everything drawn over the road.
//
// The thumb zones it hangs at the bottom are next door in hud-touch.tsx —
// and, while god mode has the camera, in hud-fly.tsx: they are the one part
// of this screen that does NOT run off the snapshot (they write into the
// input manager at pointer rate), and that is a different job from drawing a
// readout.

import type { CSSProperties } from "react";

import type { DamageCall, GamePhase, TurnSeverity } from "@engine";

import { deviceControls, type InputManager } from "./input.ts";
import { FlyControls } from "./hud-fly.tsx";
import { PedalZone, SteerZone } from "./hud-touch.tsx";
import { PODIUM as PODIUM_PLACES } from "./campaign.ts";
import {
  FinishCard,
  type FinishRace,
  type FinishStandings,
  type FinishScores,
  type NextStage,
} from "./hud-finish.tsx";
import { SpectateBanner, SpectateGap, type SpectateProps } from "./hud-spectate.tsx";
import { MirrorSwitch, paceUnderGlass, type GlassSlot } from "./hud-mirror.tsx";
import { Minimap, type HudMinimap } from "./minimap.tsx";
import type { PaceSign } from "./pace-shape.ts";
import type { HudSettings, TouchSettings } from "./settings.ts";
import type { ShiftWindow } from "./shift-window.ts";
import { clamp, formatTime } from "../lib/util.ts";
import { RaceClock, StartLights } from "./hud-clock.tsx";
import type { LiveRun } from "./snapshot.ts";

/** One co-driver call, already flipped into SCREEN space by the snapshot
 * (left means the road bends left through the windshield). */
export type HudPacenote =
  | {
      kind: "turn";
      dir: "left" | "right";
      severity: TurnSeverity;
      /** True when the turn holds long enough to earn the LONG modifier. */
      long: boolean;
      /** Meters from the car to the turn entry (0 while inside the turn). */
      distance: number;
      /** The corner's own shape, ready to draw in the sign's 100x100 box — the
       * stage's plan view of this turn, already in screen axes (pace-shape.ts). */
      sign: PaceSign;
    }
  | {
      kind: "jump";
      /** Meters from the car to the takeoff lip. */
      distance: number;
    };

/** The car is in the start control — either beat of it. Nothing is geared
 * and no clock is running, which is what the instruments read off. */
function onTheLine(phase: GamePhase): boolean {
  return phase === "intro" || phase === "countdown";
}

export type HudSnapshot = {
  phase: GamePhase;
  /** Total race time, seconds — the clock that never resets. */
  time: number;
  /** R22 — which lap the run is on and how many it is raced over, the time
   * the current one has taken so far, and the ones already in the book. A
   * sprint sits at 1 of 1, and the lap clock is the total clock. */
  lap: number;
  laps: number;
  lapTime: number;
  lapTimes: number[];
  /** The time to beat on this stage — the player's own record, or null on
   * a stage nobody has set one on (and on Roam, which keeps no book). */
  bestTime: number | null;
  speedKmh: number;
  gear: number;
  /** True while the brake is backing the car out — the gear reads R. */
  reversing: boolean;
  gearbox: "auto" | "manual";
  /** Tachometer reading, 0..1 of the redline. */
  rpm: number;
  /** True while a higher gear is available and the revs are in the red: the
   * shift light on the cluster. */
  shiftUp: boolean;
  /** Which gears a GUARDED shift may take — the thumb flick's window, and
   * what colours the gear words on the pedal hint. Both false in the
   * automatic box, which picks its own. See shift-window.ts. */
  shift: ShiftWindow;
  /** Off the ground. Nothing is DRAWN from it — the flight is the biggest
   * thing on screen and needs no caption saying so — but it goes on the HUD
   * root as `data-air`, the same way `offRoad` does, so the screenshot
   * harness can wait for a car in the air without the debug overlay in the
   * frame. */
  airborne: boolean;
  /** The route, the car on it, and how far through the stage the run is —
   * the top bar has no progress pill; the minimap's frame is the gauge. */
  minimap: HudMinimap;
  /** The co-driver's next calls (current turn first), screen-space. */
  pacenotes: HudPacenote[];
  seed: number;
  carName: string;
  /** Two wheels past the verge. Nothing is drawn from it — it goes on the
   * HUD root as `data-off`, which is what lets the screenshot harness wait
   * for turf under the wheels without the debug overlay in the frame. */
  offRoad: boolean;
  /** True while the car is LOST — off the road, well away from it and
   * pointed away rather than merely beside it. The co-driver's way-home
   * strip waits for this rather than for a wheel merely clipping the verge:
   * a sign that fires every time it does is one the player stops reading. */
  lost: boolean;
  /** True while the car is driving the stage BACKWARDS — on the road, going
   * the wrong way down it. The co-driver's strip says TURN AROUND. Never
   * true at the same time as `lost`: the engine's wrong-way call is the one
   * that took an honest fix, so it vetoes being lost rather than losing to
   * it. */
  wrongWay: boolean;
  /** Ground distance back to the point the reset would put the car, m —
   * only meaningful while `lost`. */
  homeDistance: number;
  finishTime: number | null;
  /** Set on the finish overlay when the run beat the stored record. */
  record: boolean;
  /** Metres of road the run is ahead of (positive) or behind (negative)
   * the ghost it is racing, or null when there is no ghost out there. */
  ghostGap: number | null;
  /** R29 — where the run stands in the field, as of the last split board.
   * Null on every run with nobody else entered: a time trial and a Roam
   * stage are raced against the clock, and a position over an empty road
   * would be a number with nothing behind it. */
  standing: HudStanding | null;
};

/** R29 — the position board: which place, out of how many cars. Moves only
 * at a split (and at the line), because that is the only moment a rally
 * actually knows: everybody is on the road at once, ten seconds apart, and
 * the timing point is where the times meet. */
export type HudStanding = {
  place: number;
  of: number;
};

export type HudFlash = { id: number; text: string; tone: "good" | "bad" | "info" };

/** WHAT A BROKEN CAR SAYS ABOUT ITSELF. The damage a player can see is
 * already on the screen — the wing is folded, the bonnet went over the roof
 * three corners ago — and the damage they cannot see is the machinery under
 * it. A gauge for that is a thing in a corner, read by nobody who is busy
 * driving; so it is SAID instead, in the middle of the screen where every
 * other piece of news is said, and only twice per part: once as it starts
 * to give, once as it goes (`systemFail`, engine-side).
 *
 * Two words each, because it is read at speed out of the corner of an eye
 * on the way into a corner. The first is the part; the second is how bad.
 * Chassis wear remains meaningful to the driving model, but is deliberately
 * silent here: it is not a valuable part whose failure gives the driver a
 * useful adjustment to make. */
const DAMAGE_PARTS: Record<Exclude<DamageCall, "chassis">, string> = {
  engine: "ENGINE",
  suspension: "SUSPENSION",
  gearbox: "GEARBOX",
  steering: "STEERING",
};

/** The call itself: what to put on screen, and in which colour. A part that
 * is GIVING is a warning the driver can still do something about — ease off
 * the kerbs, stop landing it flat — so it goes up in the same tone as a
 * split; a part that is GONE is not news, it is a fact about the rest of the
 * stage, and it goes up red. */
export function damageCall(
  system: DamageCall,
  spent: boolean,
): { text: string; tone: HudFlash["tone"] } | null {
  if (system === "chassis") return null;
  const part = DAMAGE_PARTS[system];
  if (!spent) return { text: `${part} DAMAGED`, tone: "info" };
  return { text: `${part} BROKEN`, tone: "bad" };
}

/** R28 — the SPLIT: what the board the car has just gone through said. Held
 * on screen for a few seconds and then gone, the way a split board is: it
 * is read at 140 km/h out of the corner of an eye, so the number that
 * matters — the gap — is the big one and everything else is a caption. */
export type HudSplit = {
  id: number;
  /** Which board it was, 1-based, and how many the lap has. */
  index: number;
  count: number;
  /** The race clock as the car went through, seconds. */
  time: number;
  /** Seconds up (positive: slower) or down (negative: quicker) on whoever
   * this run is being measured against — null when it is measured against
   * nobody, which is a stage nothing has been driven on yet. */
  delta: number | null;
  /** Who that is, for the caption under the gap. */
  against: string;
};

type HudProps = {
  /** THE CAR THIS SCREEN IS ABOUT. The player's own, normally — and, while a
   * run-out is being WATCHED, the crew under the camera instead (spectate.ts).
   * Every instrument below reads it without knowing which, because a clock,
   * a rev counter and a dented wing are the same readings whoever is
   * driving. The app picks; see `spectate`. */
  snap: HudSnapshot;
  flashes: HudFlash[];
  /** The split board just driven through, until it times out. */
  split: HudSplit | null;
  input: InputManager;
  /** Which instruments the player has left switched on. */
  show: HudSettings;
  /** The frame rate, for the readout under the minimap — or null for the
   * players who have never let the developer menu out, which is everybody
   * but whoever is working on the game. It hangs off the map rather than
   * living in the debug overlay because the number worth having is the one
   * the game is running at while it is being PLAYED, and the overlay is a
   * wall of boxes across the road. */
  fps: number | null;
  /** Which thumb steers, and what each drag off the pedal anchor does. */
  touchLayout: TouchSettings;
  /** Whether a controller has the car. The thumb zones come off when one
   * does: a handheld with sticks and triggers in its hands does not want a
   * wheel and a pedal drawn over the road it is already driving on. */
  padDriving: boolean;
  /** The clock and the start lights read this every frame instead of
   * waiting for the next snapshot. */
  live: LiveRun;
  /** Whether the pause card is up over this HUD. The gantry is the one
   * instrument that has to know: the establishing shot's caption stands in
   * the middle of the screen, exactly where the card does, and the card is
   * translucent enough to print it through its own title. Held, there is
   * nothing to leave the shot with anyway. */
  paused: boolean;
  /** Whether god mode has the camera. The gantry is the other instrument
   * that has to know: nobody is on the grid to leave, and the run is held at
   * whatever instant the camera came off the car, so lights left up would
   * hang over the middle of every frame flown out to be photographed instead
   * of ageing out with the clock. */
  flying: boolean;
  onPause: () => void;
  onCamera: () => void;
  /** Whether the rear-view glass has the road in it. Not the same switch as
   * `show.mirror`: that one is whether the game has a mirror at all, this one
   * is whether the one it has is showing anything for now (hud-mirror.tsx). */
  mirrorLive: boolean;
  /** Blank the glass, or put the road back in it. */
  onMirror: () => void;
  /** Take a picture. Null where there is none to take — the player has
   * switched screenshots off. */
  onShot: (() => void) | null;
  /** The stage after this one, once this one is over — null on a run with
   * nowhere to go on to (Roam, and the end of the ladder). */
  nextStage: NextStage | null;
  /** Run the same stage again from the grid — the time trial's own way on.
   * Null where a re-run means nothing. */
  onRetry: (() => void) | null;
  /** Leave the run for the main menu — the results card's own way out. */
  onRetire: () => void;
  /** The time trial's board, and the initials it is still waiting on. Null
   * on every other kind of run. */
  scores: FinishScores | null;
  /** R30 — the stage's points and the location table they went onto. Null
   * outside the campaign. */
  campaign: FinishStandings | null;
  /** HEADS UP's own sheet — one race, no board. Null outside that mode, and
   * never set at the same time as `campaign`. */
  race: FinishRace | null;
  /** The location whose table stands between this run and the next country,
   * or null when nothing does. */
  locked: string | null;
  /** Save the run as a run tape from the results card. Null unless the
   * developer switch that collects them is on. */
  onSaveRun: (() => boolean) | null;
  /** Leave the card and go and WATCH the crews still out there. Null when
   * the road is already clear, and on every run with nobody entered. */
  onSpectate: (() => void) | null;
  /** Whether the RUN-OUT is what is on screen — the card's own backdrop or
   * the feed alike (spectate.ts). BEHIND THE CARD it is a backdrop and
   * nothing more: the player's car is parked past the line, so the chrome
   * comes down and what is left is the card, over the race. */
  watching: boolean;
  /** THE SPECTATOR FEED, when one is up (spectate.ts). The driving layout
   * stays where it is and `snap` and `live` become the WATCHED crew's, so
   * their clock, dials, damage, route and place read exactly where the
   * player's own did; this is only the banner naming them, and the two
   * presses that change which car it is. Null the rest of the time. */
  spectate: SpectateProps | null;
};

/** The tach dial, laid out like the arcade cluster it comes from: it reads
 * 0–9 (thousands) counter-clockwise from the bottom, red from 7.5 up, and
 * the bottom of the scale is COMPRESSED — idle sits just off the stop and
 * the band you actually drive in owns the top half of the dial, where the
 * eye already is. Angles are degrees clockwise from twelve o'clock. */
const DIAL_START = 175;
/** Degrees from the 0 mark to the 4 mark — the compressed lead-in... */
const DIAL_LEAD = 50;
/** ...then 4 to 9 spread over the rest of the sweep. */
const DIAL_SPAN = 205;
const DIAL_KNEE = 4;
const DIAL_MAX = 9;
/** Where the red band starts, thousands — and the reading at which the whole
 * instrument starts shaking. */
const DIAL_RED = 7.5;

function dialAngle(value: number): number {
  if (value <= DIAL_KNEE) return DIAL_START + (value / DIAL_KNEE) * DIAL_LEAD;
  return DIAL_START + DIAL_LEAD + ((value - DIAL_KNEE) / (DIAL_MAX - DIAL_KNEE)) * DIAL_SPAN;
}

function dialPoint(radius: number, value: number): [number, number] {
  const a = (dialAngle(value) * Math.PI) / 180;
  return [50 + radius * Math.sin(a), 50 - radius * Math.cos(a)];
}

function dialArc(radius: number, from: number, to: number): string {
  const [x0, y0] = dialPoint(radius, from);
  const [x1, y1] = dialPoint(radius, to);
  const large = dialAngle(to) - dialAngle(from) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

function Tachometer({ rpm }: { rpm: number }) {
  const value = clamp(rpm, 0, 1) * DIAL_MAX;
  // An engine held up against its limiter shakes the car it is bolted to,
  // and the instrument bolted to that — the buzz IS the reading, which is
  // why it is on the dial and not on the needle alone. It grows across the
  // red band rather than switching on at it, so a gear revving out trembles
  // and a throttle pinned on the start line really buzzes.
  const heat = clamp((value - DIAL_RED) / (DIAL_MAX - DIAL_RED), 0, 1);
  return (
    <svg
      className={`hud-tach ${heat > 0 ? "hud-tach-hot" : ""}`}
      style={heat > 0 ? ({ "--shake": heat.toFixed(2) } as CSSProperties) : undefined}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle className="hud-tach-face" cx="50" cy="50" r="46" />
      <path className="hud-tach-track" d={dialArc(41, 0, DIAL_MAX)} />
      <path className="hud-tach-red" d={dialArc(41, DIAL_RED, DIAL_MAX)} />
      {[0, 4, 5, 6, 7, 8, 9].map((tick) => {
        const [tx, ty] = dialPoint(26, tick);
        const [ax, ay] = dialPoint(34, tick);
        const [bx, by] = dialPoint(30, tick);
        return (
          <g key={tick}>
            <path className="hud-tach-tick" d={`M ${ax} ${ay} L ${bx} ${by}`} />
            <text className="hud-tach-label" x={tx} y={ty}>
              {tick}
            </text>
          </g>
        );
      })}
      {/* The needle is transformed rather than re-pathed so the browser can
          tween it between HUD snapshots — the dial reads smooth at 12 Hz. */}
      <g className="hud-tach-needle" style={{ transform: `rotate(${dialAngle(value)}deg)` }}>
        <path d="M 50 50 L 50 12" />
        <circle cx="50" cy="50" r="5" />
      </g>
    </svg>
  );
}

/** The pacenote sign: the corner's own shape, drawn like a rally note board.
 * The line is the road — the approach at the bottom, the bend the way the
 * bend goes — with a heavy head on the exit. pace-shape.ts has squared both
 * up and fitted them to this 100x100 box, so all that is left here is the
 * hand they are drawn in: one chunky rounded stroke in the severity's
 * colour, and the head filled in the same. */
function PacenoteArrow({ sign }: { sign: PaceSign }) {
  return (
    <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d={`M ${sign.line.map((p) => p.join(" ")).join(" L ")}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={sign.head.map((p) => p.join(",")).join(" ")} fill="currentColor" />
    </svg>
  );
}

const SEVERITY_WORD: Record<TurnSeverity, string> = {
  soft: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
};

function pacenoteText(note: HudPacenote): string {
  if (note.kind === "jump") return "JUMP";
  return `${note.long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${note.dir.toUpperCase()}`;
}

function PacenoteIcon({ note }: { note: HudPacenote }) {
  if (note.kind === "jump") {
    return (
      <svg className="hud-pace-arrow hud-pace-jump-icon" viewBox="0 0 100 100" aria-hidden="true">
        <path
          d="M 15 72 L 39 72 L 55 35 L 77 35"
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="76,17 96,35 76,53" fill="currentColor" />
      </svg>
    );
  }
  return <PacenoteArrow sign={note.sign} />;
}

function pacenoteClass(note: HudPacenote): string {
  return note.kind === "jump" ? "hud-pace-jump" : `hud-pace-${note.severity}`;
}

/** The way home, in the co-driver's own slot. Off the road there is no next
 * corner to call — the road itself is the thing that has to be found again —
 * so the strip stops reading the stage and starts reading the way back. The
 * metres are the distance to the exact point the arrow over the car points
 * at, and that the reset key hands you directly. */
function WayHomeCall({ distance, glass }: { distance: number; glass: GlassSlot }) {
  return (
    <div className={`hud-pace ${paceUnderGlass(glass)}`}>
      <div className="hud-pace-call hud-pace-home">
        {/* A warning triangle, drawn in the co-driver strip's own hand —
            chunky rounded strokes, one color — so it reads as the same
            instrument as the corner calls it stands in for. */}
        <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M 50 17 L 89 83 L 11 83 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="11"
            strokeLinejoin="round"
          />
          <path d="M 50 41 L 50 60" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <circle cx="50" cy="72" r="6" fill="currentColor" />
        </svg>
        <span className="hud-pace-text">
          RETURN TO TRACK
          <span className="hud-pace-dist">{Math.round(distance)}m</span>
          {/* What the RESET key does, which is not the same as what the
              arrow points at: driving back keeps the road, and the key hands
              it back to the last checkpoint (R28). A driver deciding between
              the two has to be told the price. */}
          <span className="hud-pace-cost">↺ LAST CP</span>
        </span>
      </div>
    </div>
  );
}

/** Turned round and driving back up the stage, in the co-driver's slot. The
 * road is still under the wheels, so there is nothing to find and no
 * distance to quote — the whole call is one instruction and the mark that
 * says it without being read. */
function TurnAroundCall({ glass }: { glass: GlassSlot }) {
  return (
    <div className={`hud-pace ${paceUnderGlass(glass)}`}>
      <div className="hud-pace-call hud-pace-turn">
        {/* The U-turn off a road sign: up the near side, over the top, and
            back down the far one under a solid head. Drawn in the strip's
            own hand — one colour, chunky rounded strokes — so it reads as
            the same instrument as the corner calls it stands in for. */}
        <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M 76 86 L 76 42 A 24 24 0 0 0 28 42 L 28 54"
            fill="none"
            stroke="currentColor"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon points="6,52 50,52 28,90" fill="currentColor" />
        </svg>
        <span className="hud-pace-text">TURN AROUND</span>
      </div>
    </div>
  );
}

/** R28 — the split, as the car goes through a board. The GAP is the whole
 * instrument: yellow and leading with a minus when the run is up on what it
 * is chasing, red and a plus when it is down, with which board it was and
 * the clock as a caption under it. A stage nobody has driven yet has no gap
 * to show, and then the caption is the whole readout — a second set of big
 * digits under the race clock would read as a second race clock, and a zero
 * would read as dead level with a car that is not there. It goes up under
 * the race clock and ages off it: a split is read once, at speed, and then
 * it is behind you. */
function SplitBoard({ split }: { split: HudSplit }) {
  const { delta } = split;
  const up = delta !== null && delta < 0;
  return (
    <div
      className={`hud-split ${delta === null ? "" : up ? "hud-split-up" : "hud-split-down"}`}
      role="status"
    >
      {delta !== null && (
        <div className="hud-split-gap">
          {up ? "−" : "+"}
          {Math.abs(delta).toFixed(2)}
        </div>
      )}
      <div className="hud-split-sub">
        CP {split.index}
        <span className="hud-split-of">/{split.count}</span>
        {` · ${formatTime(split.time)}`}
        {delta !== null && ` · ${split.against}`}
      </div>
    </div>
  );
}

/** How far out a call is at its faintest, and how close it has to come to
 * be fully lit, meters. The far end is the co-driver's own lead at speed
 * (CALL_LEAD_MAX in snapshot.ts); the near end is about where the braking is
 * already happening, so the call finishes arriving before it matters. */
const CALL_FADE_FAR = 150;
const CALL_FADE_NEAR = 30;

/** The faintest the call being driven ever goes. Deliberately ABOVE the
 * next-corner plate's 0.5: however far off the corner is, the call that is
 * next is never dimmer than the one queued behind it. */
const CALL_FADE_FLOOR = 0.62;

/** The call's opacity, as a distance: far is faint, near is solid. */
function callFade(distance: number): number {
  const near = clamp((CALL_FADE_FAR - distance) / (CALL_FADE_FAR - CALL_FADE_NEAR), 0, 1);
  return CALL_FADE_FLOOR + (1 - CALL_FADE_FLOOR) * near;
}

/** The co-driver strip: the current call big, and — only when the next
 * corner lands inside the same lead — that one small and half transparent
 * underneath, "HARD LEFT … into easy right", the way a crew reads a stage.
 * A corner further out than that is not on the strip at all; the snapshot
 * hands it over when the car gets to it.
 *
 * HOW FAR OFF the corner is, is the call's OPACITY rather than a number of
 * metres beside it. A distance printed on a sign has to be read and then
 * converted into a feeling of imminence; a sign that hardens as the corner
 * comes IS that feeling, delivered in the corner of an eye already busy with
 * the road. It also means the strip carries one instruction and no arithmetic.
 *
 * With the words switched off it is the SIGNS alone. A sign that is the
 * corner's own shape carries the direction and the severity by being that
 * corner, the colour says the severity again, and the fade carries the
 * distance — so nothing about the call is lost. What goes is the READING,
 * which at rally pace is the expensive part. */
function Pacenotes({
  notes,
  words,
  glass,
}: {
  notes: HudPacenote[];
  words: boolean;
  glass: GlassSlot;
}) {
  const now = notes[0];
  const next = notes[1];
  return (
    <div className={`hud-pace ${words ? "" : "hud-pace-glyphs"} ${paceUnderGlass(glass)}`}>
      <div
        className={`hud-pace-call ${pacenoteClass(now)}${
          now.kind === "turn" ? ` hud-pace-to-${now.dir}` : ""
        }`}
        style={{ opacity: callFade(now.distance) }}
      >
        <PacenoteIcon note={now} />
        {words && <span className="hud-pace-text">{pacenoteText(now)}</span>}
      </div>
      {next && (
        <div
          className={`hud-pace-call hud-pace-next ${pacenoteClass(next)}${
            next.kind === "turn" ? ` hud-pace-to-${next.dir}` : ""
          }`}
        >
          <PacenoteIcon note={next} />
          {words && <span className="hud-pace-text">{pacenoteText(next)}</span>}
        </div>
      )}
    </div>
  );
}

/** The camera button's glyph: a movie camera — body, lens cone, and the two
 * film reels on top. Drawn rather than lettered because the top bar is the
 * one strip that has to stay out of the way of the road. */
function CameraGlyph() {
  return (
    <svg className="hud-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="5" r="3.1" />
      <circle cx="15" cy="5" r="3.1" />
      <rect x="2" y="9" width="14" height="10.5" rx="2" />
      <path d="M 16.6 12.6 L 22 9.6 L 22 18.9 L 16.6 15.9 Z" />
    </svg>
  );
}

/** The shutter's glyph: a camera body with its lens, and the flash hump on
 * the shoulder. A camera and not a circle, because a round button on the
 * top bar next to a round-ish camera button is two of the same thing. */
function ShutterGlyph() {
  return (
    <svg className="hud-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M 9 3 h 6 l 1.2 2.2 H 20 a 2 2 0 0 1 2 2 v 11 a 2 2 0 0 1 -2 2 H 4 a 2 2 0 0 1 -2 -2 v -11 a 2 2 0 0 1 2 -2 h 3.8 Z" />
      <circle cx="12" cy="13" r="4.4" fill="#123069" />
      <circle cx="12" cy="13" r="2.3" />
    </svg>
  );
}

/** R29 — where the run stands in the field. Only two numbers, and only one
 * of them is big: the place is what is read at speed, the field size is the
 * caption that makes it mean something. It holds its value between split
 * boards rather than counting — a position that ticked over continuously
 * would be claiming knowledge a staggered rally does not have. */
function PositionBoard({ standing }: { standing: HudStanding }) {
  return (
    <div
      className={`hud-place ${standing.place <= PODIUM_PLACES ? "hud-place-podium" : ""}`}
      aria-label={`Position ${standing.place} of ${standing.of}`}
    >
      <span className="hud-place-no">{standing.place}</span>
      <span className="hud-place-of">/{standing.of}</span>
    </div>
  );
}

export function Hud({
  snap,
  live,
  paused,
  flying,
  flashes,
  split,
  input,
  show,
  fps,
  touchLayout,
  padDriving,
  onPause,
  onCamera,
  mirrorLive,
  onMirror,
  onShot,
  nextStage,
  onRetry,
  onRetire,
  scores,
  campaign,
  race,
  locked,
  onSaveRun,
  onSpectate,
  watching,
  spectate,
}: HudProps) {
  const { touch } = input;
  const pedalSide = touchLayout.steerSide === "left" ? "right" : "left";
  // The thumb zones exist only where there are thumbs. CSS already hides
  // them on a pointer-fine display, but hidden is not the same as absent:
  // the pedal zone's whole default is GAS, so anything that can still reach
  // it — a stylus, a hybrid laptop, a browser that reports its pointers
  // oddly — is a way for the car to be given throttle nobody asked for. On a
  // desktop the throttle key is the only throttle there is, and on a handheld
  // with a controller in its hands the pad is.
  const thumbs = deviceControls().touch && !padDriving;
  // WHAT THE MIRROR IS DOING over this frame — the switch that is drawn, and
  // the clearance everything hanging under it takes. It has to agree with the
  // renderer, which puts no glass up under a camera nobody drives from, on
  // somebody else's car, or past the line: a slot that cleared a mirror which
  // was not there would leave the co-driver's calls halfway down the screen.
  const glass: GlassSlot =
    !show.mirror || spectate || flying || snap.phase === "finished"
      ? "off"
      : mirrorLive
        ? "live"
        : "blank";
  /** The results card, wherever it ends up being drawn. */
  const finish = (snap.phase === "rollout" || snap.phase === "finished") &&
    snap.finishTime !== null && (
      <FinishCard
        time={snap.finishTime}
        record={snap.record}
        laps={snap.laps}
        lapTimes={snap.lapTimes}
        standing={
          snap.standing && {
            ...snap.standing,
            // A heads-up race has no podium to miss: it pays nothing, it
            // opens nothing, and every finish in it is simply the result.
            podium: race !== null || snap.standing.place <= PODIUM_PLACES,
          }
        }
        nextStage={nextStage}
        onRetry={onRetry}
        onRetire={onRetire}
        scores={scores}
        campaign={campaign}
        race={race}
        locked={locked}
        onSaveRun={onSaveRun}
        onSpectate={onSpectate}
      />
    );
  // THE RESULTS CARD OWNS THE SCREEN while the run-out is only its backdrop.
  // Nothing is being watched closely, the player's own car is parked past the
  // line, and a driving layout full of readings off a stationary car nobody
  // can see would be two things asking to be read at once. So the chrome
  // comes down and what is left is the card, standing over the race.
  //
  // The FEED is the other case, and it does not come through here: it keeps
  // the whole layout and points it at somebody else (see `spectate`).
  if (watching && !spectate) {
    return (
      <div className="hud pointer-events-none absolute inset-0 select-none">
        <div className="hud-center">{finish}</div>
      </div>
    );
  }
  return (
    <div
      className="hud pointer-events-none absolute inset-0 select-none"
      data-off={snap.offRoad ? "1" : undefined}
      data-air={snap.airborne && snap.phase === "racing" ? "1" : undefined}
    >
      {/* THE MIRROR IS ITS OWN SWITCH: press the glass to put the rear view
          out, press the grey it leaves behind to bring it back. Only where
          there is glass to press (see `glass` above), and FIRST in the bar's
          DOM so that the top row's own buttons win wherever their boxes run
          over the ends of the strip. */}
      {glass !== "off" && <MirrorSwitch live={glass === "live"} onToggle={onMirror} />}

      {/* Top bar: the CLOCK, and the one press that belongs on the road —
          the camera. Which stage this is rides under the minimap instead:
          the top-left corner belongs to the time, because the time is what
          the driver is racing. Restart and race setup live behind the
          minimap, one tap away and out of the sky. */}
      <div className="hud-top">
        <div className="hud-topleft">
          {show.timer && <RaceClock face={snap} live={live} />}
          {/* Under the clock, the gap that corner of the screen is for. While
              a run-out is watched it is the WATCHED crew's gap to the time
              already on the sheet — the player's — which is the one number a
              spectator actually came for. */}
          {show.timer && spectate && <SpectateGap watched={spectate.watched} />}
          {/* The gap to the ghost is its own chip rather than a line inside
              the clock: the clock's text is what the tooling reads the run's
              progress off, and it holds nothing but the time. */}
          {show.timer && !spectate && snap.ghostGap !== null && (
            <div
              className={`hud-chip hud-gap ${snap.ghostGap < 0 ? "hud-gap-down" : ""}`}
              aria-label="Gap to your best run"
            >
              {snap.ghostGap < 0 ? "−" : "+"}
              {Math.abs(Math.round(snap.ghostGap))}m<span className="hud-chip-sub">GHOST</span>
            </div>
          )}
          {/* R28 — the split, under the clock it is a reading of. The
              co-driver owns the top of the screen and the corner call is
              the one thing a driver may never have covered up, so a board
              reports where the time already lives. It is the PLAYER's board,
              though — a reading of a run that is over — so it stays down
              while the screen is somebody else's car. */}
          {show.timer && !spectate && split && snap.phase === "racing" && (
            <SplitBoard split={split} />
          )}
        </div>
        <div className="hud-actions pointer-events-auto">
          {/* TOUCH ONLY, and that is the whole of its case: a device with a
              keyboard or a controller already has the bind, and a fourth
              thing on the one row a thumb reaches for mid-stage is clutter
              for somebody who does not need it. Without this button the
              feature simply could not be REACHED on a phone — everything
              else about it already worked there. */}
          {onShot && thumbs && (
            <button
              type="button"
              className="hud-mini hud-mini-icon"
              onClick={onShot}
              title="Screenshot"
              aria-label="Take a screenshot"
            >
              <ShutterGlyph />
            </button>
          )}
          {/* Off while a run-out is watched, because the press is: the
              ladder's in-car views are mounted off the silhouette of the
              player's OWN car, so App refuses to walk it onto somebody
              else's. A button that does nothing is worse than no button. */}
          {show.cameraButton && !spectate && (
            <button
              type="button"
              className="hud-mini hud-mini-icon"
              onClick={onCamera}
              title="Camera (V)"
              aria-label="Camera"
            >
              <CameraGlyph />
            </button>
          )}
          {/* R29 — the position board, between the camera and the map. It is
              the last thing on the row, which puts it hard against the
              minimap: place and route are the two things a driver glances
              right for, and they should be one glance. */}
          {snap.standing && <PositionBoard standing={snap.standing} />}
        </div>
      </div>

      {/* The minimap owns the top-right corner: the route, the car on it, and
          the run's progress read off the frame. Tap it for the race menu.
          Switched off, the pause card is still one tap away — the chip in
          its place keeps that door open. */}
      {show.minimap ? (
        <div className="hud-minimap-dock pointer-events-auto">
          <Minimap map={snap.minimap} onOpen={onPause} />
        </div>
      ) : (
        <div className="hud-actions hud-actions-solo pointer-events-auto">
          <button
            type="button"
            className="hud-mini"
            onClick={onPause}
            title="Pause"
            aria-label="Pause"
          >
            ‖
          </button>
        </div>
      )}

      {/* Which stage, and in what — hung off the bottom edge of the map (or
          of the row that stands in for it), where a label the player reads
          once a run belongs. */}
      <div className={`hud-chip hud-stage ${show.minimap ? "" : "hud-stage-nomap"}`}>
        STAGE {snap.seed}
        <span className="hud-chip-sub">{snap.carName}</span>
        {/* The frame rate, under the map with the rest of the run's label —
            developers only. In the same chip rather than beside it so it
            hangs off whatever that chip is currently hanging off: the map's
            bottom edge, or the button row when the map is switched off. */}
        {fps !== null && <span className="hud-chip-sub hud-fps">{fps} FPS</span>}
      </div>

      {/* The co-driver's slot: corner calls while there is a road to call,
          the way back the moment there isn't, and TURN AROUND for the road
          that is still there and being driven the wrong way down. The first
          two can never both be true — the engine's wrong-way call vetoes
          being lost — so the order here only settles which one is written
          first, not which one wins. Neither is behind the pacenote toggle:
          switching off the corner calls is a driver saying they know the
          stage, not one who wants to stay lost.
          WATCHING, the slot is the spectator's banner instead: there is
          nobody in this car to call a corner to, and nobody to send home. */}
      {spectate ? (
        <SpectateBanner {...spectate} />
      ) : (
        snap.phase === "racing" &&
        (snap.lost ? (
          <WayHomeCall distance={snap.homeDistance} glass={glass} />
        ) : snap.wrongWay ? (
          <TurnAroundCall glass={glass} />
        ) : (
          show.pacenotes &&
          snap.pacenotes.length > 0 && (
            <Pacenotes notes={snap.pacenotes} words={show.pacenoteText} glass={glass} />
          )
        ))
      )}

      {/* Center: countdown / finish / event flashes. All three belong to the
          player's own run — the gantry they left, the card their time earned,
          the calls their car threw off — so the middle of the screen is empty
          while somebody else's is on it. */}
      {!spectate && (
        <div className="hud-center">
          {/* Away entirely while god mode flies — same reasoning as the
              way-home arrow the renderer takes down in the free camera: it is
              an aid for somebody driving, and nobody is. */}
          {!flying && <StartLights live={live} muted={paused} />}
          {finish}
          <div className="hud-flashes">
            {flashes.map((f) => (
              <div key={f.id} className={`hud-flash hud-flash-${f.tone}`}>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom-left: the instrument panel. It is a fixed cast sized to the
          narrowest phone — revs, gear, speed and nothing that comes and goes,
          because anything that can appear mid-run would push an instrument
          off the right edge. The top bar is the same bargain: the stage, the
          clock and the camera. News about the car is SAID instead, in the
          middle of the screen (`damageCall`). */}
      <div className="hud-speed">
        <div className="hud-cluster">
          {show.tachometer && <Tachometer rpm={snap.rpm} />}
          <div className={`hud-gearbox ${snap.shiftUp ? "hud-gearbox-shift" : ""}`}>
            {/* NEUTRAL ON THE GRID: nothing has been geared yet, and a box
                reading first before the lights have gone is the instrument
                telling the player the run has started when it has not. */}
            <span className="hud-gear">
              {snap.reversing ? "R" : onTheLine(snap.phase) ? "N" : snap.gear + 1}
            </span>
            <span className="hud-shiftlight">{snap.gearbox === "auto" ? "AUTO" : "SHIFT"}</span>
          </div>
          <span className="hud-speed-num">{Math.round(snap.speedKmh)}</span>
          <span className="hud-speed-unit">km/h</span>
        </div>
      </div>

      {/* Touch controls — one half of the screen anchors a steering wheel
          under the thumb, the other is the gesture pedal (gas / brake /
          handbrake, and the gears on a flick). Which half is which is the
          player's choice.

          While GOD MODE has the camera the same two halves fly it instead:
          the car is parked and given nothing, so a wheel and a throttle over
          it are controls that do nothing — and on a phone, where the fly
          keyboard is not, they would be the only controls there are.

          Watching a run-out is the same bargain without the camera to fly:
          the car on screen is being driven by somebody else and the player's
          own is parked past the line, so the wheel and the pedal come off
          and the two arrows on the banner are the whole of the mode. */}
      <div className="hud-touch">
        {thumbs && flying && <FlyControls fly={input.flyTouch} stickSide={touchLayout.steerSide} />}
        {thumbs && !flying && !spectate && <SteerZone touch={touch} side={touchLayout.steerSide} />}
        {thumbs && !flying && !spectate && (
          <PedalZone
            touch={touch}
            layout={touchLayout}
            side={pedalSide}
            shift={snap.gearbox === "manual" ? snap.shift : null}
            onShift={input.requestShift}
          />
        )}
      </div>
    </div>
  );
}
