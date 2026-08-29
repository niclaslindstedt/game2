// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD: chunky arcade chrome over the canvas. Reads a low-rate snapshot
// (the app refreshes it ~12×/s — the canvas is the 60 fps surface, the HUD
// is not), and lays out everything drawn over the road.
//
// The thumb zones it hangs at the bottom are next door in hud-touch.tsx:
// they are the one part of this screen that does NOT run off the snapshot —
// they write into the input manager at pointer rate — and that is a
// different job from drawing a readout.

import type { CSSProperties } from "react";

import type { GamePhase, TurnSeverity } from "@engine";

import { deviceControls, type InputManager } from "./input.ts";
import { PedalZone, SteerZone } from "./hud-touch.tsx";
import { PODIUM as PODIUM_PLACES } from "./campaign.ts";
import {
  FinishCard,
  type FinishRace,
  type FinishStandings,
  type FinishScores,
  type NextStage,
} from "./hud-finish.tsx";
import { Minimap, type HudMinimap } from "./minimap.tsx";
import type { HudSettings, TouchSettings } from "./settings.ts";
import type { ShiftWindow } from "./shift-window.ts";
import { clamp, formatTime } from "../lib/util.ts";
import { RaceClock, StartLights } from "./hud-clock.tsx";
import type { LiveRun } from "./snapshot.ts";

/** One co-driver call, already flipped into SCREEN space by the snapshot
 * (left means the road bends left through the windshield). */
export type HudPacenote = {
  dir: "left" | "right";
  severity: TurnSeverity;
  /** True when the turn holds long enough to earn the LONG modifier. */
  long: boolean;
  /** Meters from the car to the turn entry (0 while inside the turn). */
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
  /** Ground distance back to the point the reset would put the car, m —
   * only meaningful while `lost`. */
  homeDistance: number;
  finishTime: number | null;
  /** Set on the finish overlay when the run beat the stored record. */
  record: boolean;
  damage: HudDamage;
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

/** The damage readout, already flipped into SCREEN space by the snapshot
 * (like everything else in the app layer): zone 0 is the nose, indices grow
 * toward the side the player SEES on the right, and `mirrorR` is the mirror
 * on the right of their car on screen. All values 0 (sound) .. 1 (spent). */
export type HudDamage = {
  /** Ring crush per zone as a fraction of the max fold. */
  zones: number[];
  /** Underside crush fraction (slammed landings). */
  belly: number;
  /** Structural wear — 1 is the wreck. */
  wear: number;
  /** The internal systems' damage meters. */
  systems: { engine: number; suspension: number; gearbox: number; steering: number };
  broken: {
    bumperF: boolean;
    bumperR: boolean;
    mirrorL: boolean;
    mirrorR: boolean;
    spoiler: boolean;
    hood: boolean;
    hatch: boolean;
  };
};

export type HudFlash = { id: number; text: string; tone: "good" | "bad" | "info" };

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
  snap: HudSnapshot;
  flashes: HudFlash[];
  /** The split board just driven through, until it times out. */
  split: HudSplit | null;
  input: InputManager;
  /** Which instruments the player has left switched on. */
  show: HudSettings;
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
  onPause: () => void;
  onCamera: () => void;
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

/** The pacenote arrows, drawn like rally corner signs: the shaft is the
 * road, the bend is the corner. Points bend RIGHT here; a left call mirrors
 * the whole icon. The head is computed from the last two points so every
 * severity's arrow stays consistent. */
const PACE_ARROWS: Record<TurnSeverity, [number, number][]> = {
  soft: [
    [42, 92],
    [42, 55],
    [47, 38],
    [58, 26],
    [68, 19],
  ],
  medium: [
    [40, 92],
    [40, 58],
    [44, 44],
    [54, 37],
    [70, 34],
    [80, 34],
  ],
  hard: [
    [38, 92],
    [38, 52],
    [42, 32],
    [56, 24],
    [68, 28],
    [74, 42],
    [74, 58],
  ],
};

function PacenoteArrow({ severity, dir }: { severity: TurnSeverity; dir: "left" | "right" }) {
  const pts = PACE_ARROWS[severity];
  const d = `M ${pts.map((p) => p.join(" ")).join(" L ")}`;
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = [
    [x2 + ux * 15, y2 + uy * 15],
    [x2 - uy * 10, y2 + ux * 10],
    [x2 + uy * 10, y2 - ux * 10],
  ];
  return (
    <svg
      className="hud-pace-arrow"
      viewBox="0 0 100 100"
      style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={head.map((p) => p.join(",")).join(" ")} fill="currentColor" />
    </svg>
  );
}

const SEVERITY_WORD: Record<TurnSeverity, string> = {
  soft: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
};

function pacenoteText(note: HudPacenote): string {
  return `${note.long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${note.dir.toUpperCase()}`;
}

/** The way home, in the co-driver's own slot. Off the road there is no next
 * corner to call — the road itself is the thing that has to be found again —
 * so the strip stops reading the stage and starts reading the way back. The
 * metres are the distance to the exact point the arrow over the car points
 * at, and that the reset key hands you directly. */
function WayHomeCall({ distance, belowMirror }: { distance: number; belowMirror: boolean }) {
  return (
    <div className={`hud-pace ${belowMirror ? "hud-pace-under-glass" : ""}`}>
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

/** The co-driver strip: the current call big, and — only when the next
 * corner lands inside the same lead — that one small and half transparent
 * underneath, "HARD LEFT … into easy right", the way a crew reads a stage.
 * A corner further out than that is not on the strip at all; the snapshot
 * hands it over when the car gets to it.
 *
 * With the words switched off it is the ARROWS alone. The arrow already
 * carries severity in its shape and direction in its mirroring, so nothing
 * about the call is lost — what goes is the READING, which at rally pace is
 * the expensive part. The distance stays: it is a number glanced at, not a
 * phrase parsed, and there is no glyph that says "in 200 m". */
function Pacenotes({
  notes,
  words,
  belowMirror,
}: {
  notes: HudPacenote[];
  words: boolean;
  belowMirror: boolean;
}) {
  const now = notes[0];
  const next = notes[1];
  return (
    <div
      className={`hud-pace ${words ? "" : "hud-pace-glyphs"} ${
        belowMirror ? "hud-pace-under-glass" : ""
      }`}
    >
      <div className={`hud-pace-call hud-pace-${now.severity}`}>
        <PacenoteArrow severity={now.severity} dir={now.dir} />
        <span className="hud-pace-text">
          {words && pacenoteText(now)}
          {now.distance >= 10 && (
            <span className="hud-pace-dist">{Math.round(now.distance / 10) * 10}m</span>
          )}
        </span>
      </div>
      {next && (
        <div className={`hud-pace-call hud-pace-next hud-pace-${next.severity}`}>
          <PacenoteArrow severity={next.severity} dir={next.dir} />
          {words && <span className="hud-pace-text">{pacenoteText(next)}</span>}
        </div>
      )}
    </div>
  );
}

/** The eight zone indicators around the 2D car, in the panel's 60×100 user
 * space: strokes hugging the outline, index 0 the nose, clockwise. */
const DAMAGE_ZONE_PATHS = [
  "M 22 3 Q 30 0.5 38 3", // nose
  "M 41 4 Q 46 7 46.5 14", // front-right corner
  "M 47 21 L 47 59", // right flank
  "M 46.5 66 Q 46 89 41 94", // rear-right corner
  "M 37 96.5 Q 30 99 23 96.5", // tail
  "M 19 94 Q 14 89 13.5 66", // rear-left corner
  "M 13 59 L 13 21", // left flank
  "M 13.5 14 Q 14 7 19 4", // front-left corner
];

/** The color a part wears while it is SOUND. Deliberately COOL: the ramp
 * below runs yellow to red, and a warm "neutral" — cream, bone, off-white —
 * sits close enough to the low end of that ramp, over this instrument's navy
 * plate, to read as a car that is already hurt. Steel blue cannot be
 * mistaken for any value on the ramp. */
function soundTint(alpha: number): string {
  return `rgba(150, 178, 214, ${alpha})`;
}

/** Crush color ramp: quiet steel while sound, then yellow folding to red. */
function crushColor(v: number): string {
  if (v <= 0.02) return soundTint(0.3);
  return `hsl(${Math.round(50 - 45 * Math.min(1, v))} 95% 55%)`;
}

/** System color ramp: a part that is SOUND reads as quiet steel, and only a
 * hurt one takes color — yellow folding to red as it gives out. Painting
 * every healthy part bright green makes five lights that shout nothing; this
 * instrument stays silent until it has news, so a glance mid-corner finds the
 * one part that is wrong instead of scanning a row of bars. */
function systemColor(damage: number): string {
  if (damage <= 0.04) return soundTint(0.62);
  return `hsl(${Math.round(52 - 48 * Math.min(1, damage))} 92% 55%)`;
}

/** The damage instrument: ONE glyph, no bars. A top-view car wears the crush
 * on its outline where the hits landed, the breakables cross out red as they
 * tear off, and the four internal systems are the parts themselves — the
 * engine block under the bonnet, the rack across the front axle, the gearbox
 * down the tunnel, the suspension at the four wheels — each taking color as
 * it fails. The shell's own outline is the chassis, the bar the wreck is
 * called on. Drawn in the tach's materials so the cluster reads as one
 * instrument panel; sits above the tach, where the eye already is. */
function DamagePanel({ damage }: { damage: HudDamage }) {
  const broken = damage.broken;
  const part = (isBroken: boolean): string =>
    `hud-dmg-part ${isBroken ? "hud-dmg-part-broken" : ""}`;
  const sys = damage.systems;
  return (
    <div
      className="hud-damage"
      title="Damage — engine, steering, gearbox, suspension, chassis"
      aria-hidden="true"
    >
      <svg className="hud-dmg-car" viewBox="0 0 60 100">
        {/* The instrument face — same plate the tach dial sits on. */}
        <rect className="hud-dmg-face" x="1.5" y="1" width="57" height="98" rx="10" />
        {/* The shell: its outline is the chassis gauge, and the crush strokes
            below bloom over it where the car actually took the hit. */}
        <path
          className="hud-dmg-body"
          d="M 19 9 Q 19 4.5 30 4.5 Q 41 4.5 41 9 L 42 84 Q 42 95 30 95 Q 18 95 18 84 Z"
          style={{ stroke: systemColor(damage.wear) }}
        />
        <rect
          className="hud-dmg-belly"
          x="20"
          y="24"
          width="20"
          height="56"
          rx="8"
          style={{
            fill: crushColor(damage.belly),
            opacity: Math.min(0.8, damage.belly * 1.6).toFixed(2),
          }}
        />
        {/* ENGINE: the block filling the bonnet. */}
        <rect
          className="hud-dmg-sys"
          x="21.5"
          y="10"
          width="17"
          height="11"
          rx="2.5"
          style={{ fill: systemColor(sys.engine) }}
        />
        {/* STEERING: the rack across the front axle, drawn under the wheels
            it turns, so the two read as one assembly. */}
        <rect
          className="hud-dmg-sys"
          x="15"
          y="25"
          width="30"
          height="3.4"
          rx="1.7"
          style={{ fill: systemColor(sys.steering) }}
        />
        {/* GEARBOX: the tunnel running back from the cabin. */}
        <rect
          className="hud-dmg-sys"
          x="26.5"
          y="58"
          width="7"
          height="26"
          rx="3"
          style={{ fill: systemColor(sys.gearbox) }}
        />
        <rect className="hud-dmg-cabin" x="22.5" y="32" width="15" height="24" rx="4" />
        {/* SUSPENSION: the four corners it holds up. The front pair straddles
            the rack above — an axle, not two loose blocks. */}
        {[
          [15.5, 22.5],
          [39.5, 22.5],
          [15.5, 68],
          [39.5, 68],
        ].map(([x, y]) => (
          <rect
            key={`${x},${y}`}
            className="hud-dmg-sys"
            x={x}
            y={y}
            width="5"
            height="12"
            rx="1.8"
            style={{ fill: systemColor(sys.suspension) }}
          />
        ))}
        {/* The ring: crush painted where it happened. */}
        {DAMAGE_ZONE_PATHS.map((d, i) => (
          <path
            key={d}
            className="hud-dmg-zone"
            d={d}
            style={{ stroke: crushColor(damage.zones[i]) }}
          />
        ))}
        {/* The breakables: solid while bolted on, crossed out when gone.
            The two lids are outlines over the bay they cover, so a missing
            bonnet reads as an open engine bay rather than a missing bar. */}
        <rect
          className={part(broken.hood)}
          x="22"
          y="10.5"
          width="16"
          height="10"
          rx="2"
          fill="none"
        />
        <rect
          className={part(broken.hatch)}
          x="22"
          y="79"
          width="16"
          height="8"
          rx="2"
          fill="none"
        />
        <rect className={part(broken.bumperF)} x="21" y="6" width="18" height="3.2" rx="1.5" />
        <rect className={part(broken.bumperR)} x="21" y="89.5" width="18" height="3.2" rx="1.5" />
        <rect className={part(broken.mirrorL)} x="9" y="29" width="4.5" height="7" rx="1.4" />
        <rect className={part(broken.mirrorR)} x="46.5" y="29" width="4.5" height="7" rx="1.4" />
        <rect className={part(broken.spoiler)} x="17" y="84.5" width="26" height="3.2" rx="1.5" />
      </svg>
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
  flashes,
  split,
  input,
  show,
  touchLayout,
  padDriving,
  onPause,
  onCamera,
  onShot,
  nextStage,
  onRetry,
  onRetire,
  scores,
  campaign,
  race,
  locked,
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
  return (
    <div
      className="hud pointer-events-none absolute inset-0 select-none"
      data-off={snap.offRoad ? "1" : undefined}
    >
      {/* Top bar: the CLOCK, and the one press that belongs on the road —
          the camera. Which stage this is rides under the minimap instead:
          the top-left corner belongs to the time, because the time is what
          the driver is racing. Restart and race setup live behind the
          minimap, one tap away and out of the sky. */}
      <div className="hud-top">
        <div className="hud-topleft">
          {show.timer && <RaceClock face={snap} live={live} />}
          {/* The gap to the ghost is its own chip rather than a line inside
              the clock: the clock's text is what the tooling reads the run's
              progress off, and it holds nothing but the time. */}
          {show.timer && snap.ghostGap !== null && (
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
              reports where the time already lives. */}
          {show.timer && split && snap.phase === "racing" && <SplitBoard split={split} />}
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
          {show.cameraButton && (
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
      </div>

      {/* The co-driver's slot: corner calls while there is a road to call,
          the way back the moment there isn't. The way home is not behind the
          pacenote toggle — switching off the corner calls is a driver saying
          they know the stage, not one who wants to stay lost. */}
      {snap.phase === "racing" &&
        (snap.lost ? (
          <WayHomeCall distance={snap.homeDistance} belowMirror={show.mirror} />
        ) : (
          show.pacenotes &&
          snap.pacenotes.length > 0 && (
            <Pacenotes notes={snap.pacenotes} words={show.pacenoteText} belowMirror={show.mirror} />
          )
        ))}

      {/* Center: countdown / finish / event flashes. */}
      <div className="hud-center">
        <StartLights live={live} muted={paused} />
        {(snap.phase === "rollout" || snap.phase === "finished") && snap.finishTime !== null && (
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
          />
        )}
        {snap.airborne && snap.phase === "racing" && <div className="hud-air">AIRBORNE</div>}
        <div className="hud-flashes">
          {flashes.map((f) => (
            <div key={f.id} className={`hud-flash hud-flash-${f.tone}`}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-left: the instrument panel, in two rows. The car's CONDITION
          sits in its own row above the dials rather than among them: the dial
          row is a fixed cast sized to the narrowest phone, and anything that
          can appear or grow mid-run would push an instrument off the right
          edge. The top bar is the same bargain — it holds the stage, the clock
          and the camera, and nothing that comes and goes. */}
      <div className="hud-speed">
        <div className="hud-status">{show.damage && <DamagePanel damage={snap.damage} />}</div>
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
          player's choice. */}
      <div className="hud-touch">
        {thumbs && <SteerZone touch={touch} side={touchLayout.steerSide} />}
        {thumbs && (
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
