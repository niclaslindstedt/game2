// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-race pause card, and the option vocabulary every menu surface
// shares: the stage-length bands, the times of day, the weathers, and the
// segmented `OptionRow` they are all picked with.
//
// PauseMenu is the one you reach mid-stage, by tapping the minimap: the run
// holds where it stands, and it carries the three ways on — run this stage
// again, leave for the main menu, or resume. It lives here rather than in
// the top bar because the bar is a strip over the road, and every button on
// it is a button in the way of the driving.

import {
  DEFAULT_KNOBS,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  STAGE_RULES,
  type Difficulty,
  type GearboxMode,
  type StageKnobs,
  type StageLength,
  type Season,
  type StageShape,
  type TimeOfDay,
  type Weather,
} from "@engine";

import { playToggle, playUi } from "./audio/ui.ts";
import type { DevSettings } from "./settings.ts";

export type RaceSettings = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
  carId: string;
  length: StageLength;
  /** R22 — a sprint from a start to a finish, or a circuit raced over laps. */
  shape: StageShape;
  /** The generator's dials — what KIND of stage the seed builds. */
  knobs: StageKnobs;
  /** R29 — how good the campaign's field is. Nothing else reads it: Roam
   * has nobody entered and a time trial races the clock. */
  difficulty: Difficulty;
};

/** R29 — the three settings the campaign's field comes in, labelled from the
 * engine's own table so the menu can never offer one the field does not
 * have. What each buys is a points budget for the fourteen crews, and it is
 * deliberately NOT spelled out on the button: "EASY" is a promise about how
 * hard it will be to podium, not a stat block. */
export const DIFFICULTY_OPTIONS: { id: Difficulty; label: string }[] = DIFFICULTY_IDS.map((id) => ({
  id,
  label: DIFFICULTIES[id].label,
}));

/** R22 — the two shapes a stage comes in. A circuit is the same minutes of
 * driving as the sprint band it is named for, cut into laps: the road is
 * short enough to learn, which is what makes a lap time worth chasing. */
export const STAGE_SHAPES: { id: StageShape; label: string }[] = [
  { id: "sprint", label: "SPRINT" },
  { id: "circuit", label: "CIRCUIT" },
];

/** How many laps a race setup is run over — one, unless it is a circuit. */
export function raceLaps(race: RaceSettings): number {
  return race.shape === "circuit" && race.length !== "endless" ? STAGE_RULES.circuit.laps : 1;
}

/** The dials, as the menu offers them: three positions each, because a
 * slider on a phone during a pre-race screen is a fiddle and what a player
 * actually wants to say is "more hills" or "no tarmac". The values are the
 * engine's 0..1 knobs (rules.ts). */
export type DialStop = { id: string; label: string; value: number };

export const STAGE_DIALS: {
  key: keyof StageKnobs;
  label: string;
  stops: DialStop[];
}[] = [
  {
    key: "elevation",
    label: "HILLS",
    stops: [
      { id: "low", label: "FLAT", value: 0.12 },
      { id: "mid", label: "ROLLING", value: 0.5 },
      { id: "high", label: "ALPINE", value: 0.9 },
    ],
  },
  {
    key: "water",
    label: "WATER",
    stops: [
      { id: "low", label: "DRY", value: 0.1 },
      { id: "mid", label: "STREAMS", value: 0.5 },
      { id: "high", label: "LAKELAND", value: 0.9 },
    ],
  },
  {
    key: "trees",
    label: "FOREST",
    stops: [
      { id: "low", label: "OPEN", value: 0.12 },
      { id: "mid", label: "WOODED", value: 0.5 },
      { id: "high", label: "DEEP", value: 0.9 },
    ],
  },
  {
    key: "asphalt",
    label: "TARMAC",
    stops: [
      { id: "low", label: "NONE", value: 0 },
      { id: "mid", label: "SOME", value: 0.25 },
      { id: "high", label: "HALF", value: 0.5 },
    ],
  },
  {
    key: "width",
    label: "ROAD",
    stops: [
      { id: "low", label: "NARROW", value: 0.1 },
      { id: "mid", label: "RALLY", value: 0.55 },
      { id: "high", label: "WIDE", value: 1 },
    ],
  },
];

/** Which stop a knob value sits on — the nearest one, so a value dialled in
 * from the URL still lights up the button it is closest to. */
export function dialStop(stops: DialStop[], value: number): string {
  let best = stops[0];
  for (const stop of stops) {
    if (Math.abs(stop.value - value) < Math.abs(best.value - value)) best = stop;
  }
  return best.id;
}

export const DEFAULT_STAGE_KNOBS: StageKnobs = { ...DEFAULT_KNOBS };

/** The stage lengths, in the order Roam's slider walks them — minutes of
 * driving at rally pace, ending in the endless stream that keeps generating
 * road off the seed for as long as the run lasts. */
export const STAGE_LENGTH_OPTIONS: { id: StageLength; label: string }[] = [
  { id: "short", label: "SHORT" },
  { id: "medium", label: "MEDIUM" },
  { id: "long", label: "LONG" },
  { id: "xlong", label: "X-LONG" },
  { id: "endless", label: "ENDLESS" },
];

export const TIMES_OF_DAY: { id: TimeOfDay; label: string }[] = [
  { id: "dawn", label: "DAWN" },
  { id: "day", label: "DAY" },
  { id: "dusk", label: "DUSK" },
  { id: "night", label: "NIGHT" },
];

/** The taiga's three. The boreal forest under snow is the arctic biome,
 * not a fourth season of this one. */
export const SEASONS: { id: Season; label: string }[] = [
  { id: "spring", label: "SPRING" },
  { id: "summer", label: "SUMMER" },
  { id: "autumn", label: "AUTUMN" },
];

export const WEATHERS: { id: Weather; label: string }[] = [
  { id: "clear", label: "CLEAR" },
  { id: "rain", label: "RAIN" },
  { id: "storm", label: "STORM" },
];

/** The head of a menu page: the way back, and what the page IS, on ONE
 * line. Stacked — a back button, then a title, then a subtitle — those
 * three rows eat the top third of a card and say nothing the one line does
 * not, which on a stage grid is a row of boxes pushed off the bottom.
 *
 * The back button keeps its own `.menu-back` chrome so a page that has not
 * been converted still looks like the same menu. */
export function MenuHead({
  back,
  backLabel,
  title,
  sub,
}: {
  back: () => void;
  backLabel: string;
  title: string;
  /** The page's one line of billing. Omitted on pages whose title says it
   * all — the head then holds the title alone, still on one row. */
  sub?: string;
}) {
  return (
    <div className="menu-head">
      {/* `data-nav-back` is what a controller's B button presses — see
          menu-nav.ts. Marked rather than guessed at: every surface has a way
          out, and no two of them look alike in the markup. */}
      <button type="button" className="menu-back" data-nav-back onClick={back}>
        ‹ {backLabel}
      </button>
      <div className="menu-head-text">
        <div className="menu-title">{title}</div>
        {sub !== undefined && <div className="menu-sub">{sub}</div>}
      </div>
    </div>
  );
}

/** The two boxes, and the one sentence that says what choosing the second
 * one costs. Shared by OPTIONS and the pre-race card, which offer the same
 * setting: two surfaces wording the same choice differently is two
 * settings as far as the player is concerned. */
export const GEARBOX_OPTIONS: { id: GearboxMode; label: string }[] = [
  { id: "auto", label: "AUTO" },
  { id: "manual", label: "MANUAL" },
];

export function GearboxRow({
  label,
  gearbox,
  onGearbox,
}: {
  label: string;
  gearbox: GearboxMode;
  onGearbox: (gearbox: GearboxMode) => void;
}) {
  return (
    <div className="menu-gearbox">
      <OptionRow label={label} options={GEARBOX_OPTIONS} value={gearbox} onPick={onGearbox} />
      <div className="opt-note">
        The manual is the racing set: taller gears and more of the engine reaching the road, worth
        about 6% more top speed in any car — paid for with a beat of throttle at every shift, and a
        gear you have to pick yourself. The automatic never fluffs one.
      </div>
    </div>
  );
}

export function OptionRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div className="menu-row">
      <span className="menu-label">{label}</span>
      <div className="menu-opts">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`menu-opt ${opt.id === value ? "menu-opt-active" : ""}`}
            onClick={() => {
              playToggle(true);
              onPick(opt.id);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A switch with its cost written under it. Shared by OPTIONS and the
 * developer menu, which both ask the same question — on or off, and what
 * does that buy me. */
export function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`opt-toggle ${on ? "opt-toggle-on" : ""}`}
      onClick={() => {
        // The switch sounds like what it is about to BECOME, which is the
        // whole reason the pitch moves: a toggle whose two states sound the
        // same tells the player nothing they could not already see.
        playToggle(!on);
        onToggle();
      }}
      aria-pressed={on}
    >
      <span className="opt-toggle-text">
        <b>{label}</b>
        <span className="opt-toggle-hint">{hint}</span>
      </span>
      <span className="opt-switch" aria-hidden="true">
        <span className="opt-switch-knob" />
      </span>
    </button>
  );
}

type PauseProps = {
  seed: number;
  carName: string;
  /** The developer tools, offered here as well as in the menu: the moment
   * you want to fly to something is the moment you are looking at it, and
   * that moment is behind the pause card, not four screens away. Null when
   * the developer menu has never been let out. */
  dev: DevSettings | null;
  onDev: (dev: DevSettings) => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
};

/** The in-race menu, opened by tapping the minimap. The backdrop resumes:
 * a menu you opened by mis-aiming for the map must cost one tap to leave. */
export function PauseMenu({
  seed,
  carName,
  dev,
  onDev,
  onResume,
  onRestart,
  onMainMenu,
}: PauseProps) {
  return (
    <div className="hud-menu-wrap pointer-events-auto" onPointerDown={onResume} role="presentation">
      <div className="hud-menu hud-pause" onPointerDown={(e) => e.stopPropagation()}>
        <div className="hud-menu-title">PAUSED</div>
        <div className="hud-pause-sub">
          STAGE {seed} — {carName}
        </div>
        <button
          type="button"
          className="hud-start"
          data-nav-back
          onClick={() => {
            playUi("back");
            onResume();
          }}
        >
          RESUME
        </button>
        <button
          type="button"
          className="hud-pause-act"
          onClick={() => {
            playUi("start");
            onRestart();
          }}
        >
          RESTART STAGE
        </button>
        <button
          type="button"
          className="hud-pause-act"
          onClick={() => {
            playUi("select");
            onMainMenu();
          }}
        >
          MAIN MENU
        </button>
        {dev && (
          <div className="hud-pause-dev">
            <ToggleRow
              label="GOD MODE"
              hint="Fly the camera off the car"
              on={dev.god}
              onToggle={() => onDev({ ...dev, god: !dev.god })}
            />
            <ToggleRow
              label="DEBUG OVERLAY"
              hint="Where you are, and the line that gets anyone back here"
              on={dev.debug}
              onToggle={() => onDev({ ...dev, debug: !dev.debug })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
