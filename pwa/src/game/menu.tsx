// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-race pause card, and the option vocabulary every menu surface
// shares: the stage-length bands, the times of day, the weathers, and the
// segmented `OptionRow` they are all picked with.
//
// PauseMenu is the one you reach mid-stage, by tapping the minimap: the run
// holds where it stands, and it carries the three ways on — resume, run this
// stage again, or leave for the main menu — and between them the handful of
// knobs a player actually stops mid-stage for: the camera they cannot see
// out of, the HUD, the mirror, the two volumes. Everything else is the
// options page, off the front door. It lives here rather than in the top
// bar because the bar is a strip over the road, and every button on it is a
// button in the way of the driving.

import {
  BIOMES,
  BIOME_IDS,
  DEFAULT_KNOBS,
  DIFFICULTIES,
  biomeRules,
  type BiomeId,
  DIFFICULTY_IDS,
  GRID_DEFAULT,
  GRID_MAX,
  GRID_MIN,
  STAGE_RULES,
  gridSize,
  type Difficulty,
  type GearboxMode,
  type NumericKnob,
  type StageKnobs,
  type StageLength,
  type Season,
  type StageShape,
  type TimeOfDay,
  type Weather,
} from "@engine";

import { playToggle, playUi } from "./audio/ui.ts";
import { manualGain } from "./car-stats.ts";
import { FadeRow, StepRow, type Stop } from "./menu-knobs.tsx";
import { PLAY_CAMERAS, type DevSettings, type Settings } from "./settings.ts";

/** How a stage was entered — the campaign is what records a clear, a time
 * trial is a lap you drive for the clock alone, and a heads-up race is the
 * campaign's field with the championship taken off: nothing about it is
 * written down anywhere. */
export type PlayMode = "campaign" | "timetrial" | "headsup" | "roam";

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
  /** HEADS UP's own three. They are kept apart from the campaign's
   * `difficulty` on purpose: a player who turns the rivals down for a
   * knockabout race must not find their championship quietly turned down
   * with it. */
  headsUp: HeadsUpSettings;
};

/** What a heads-up race is set up with: how good the field is, how many cars
 * are on it, and whether they all leave on the same green. */
export type HeadsUpSettings = {
  difficulty: Difficulty;
  /** Cars on the entry list, the player included. */
  cars: number;
  massStart: boolean;
};

export { gridSize };

export const DEFAULT_HEADS_UP: HeadsUpSettings = {
  difficulty: "medium",
  cars: GRID_DEFAULT,
  massStart: true,
};

/** The grids a mass start is offered in — every even size the apron behind
 * the start gate will hold, ending at the deepest one (`GRID_MAX`, which is
 * also the default). The ceiling is the generator's rather than a choice: a
 * grid stands on the run-up, and past the end of it a car is off the stage.
 * A rally start is not offered the row, because nobody there needs room on
 * the line and a short entry list would only take rivals off the sheet. */
export const GRID_OPTIONS: { id: string; label: string; cars: number }[] = (() => {
  const sizes = new Set<number>();
  for (let cars = 4; cars < GRID_MAX; cars += 2) sizes.add(cars);
  sizes.add(GRID_MAX);
  return [...sizes]
    .filter((cars) => cars >= GRID_MIN)
    .map((cars) => ({ id: String(cars), label: String(cars), cars }));
})();

/** The nearest grid on offer to `cars` — what a stored or dialled-in number
 * lights up. */
export function gridOption(cars: number): string {
  let best = GRID_OPTIONS[0];
  for (const opt of GRID_OPTIONS) {
    if (Math.abs(opt.cars - cars) < Math.abs(best.cars - cars)) best = opt;
  }
  return best.id;
}

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
  key: NumericKnob;
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
    // R34 — how steep the country stands, as against how high `elevation`
    // stands it. The two read as one thing on a map and as two entirely
    // different stages from the driver's seat: ALPINE hills on a WORN dial
    // are long open slopes you can see across, and the same hills on SHEER
    // are rock either side of the road.
    key: "steepness",
    label: "TERRAIN",
    stops: [
      { id: "low", label: "WORN", value: 0.12 },
      { id: "mid", label: "RUGGED", value: 0.5 },
      { id: "high", label: "SHEER", value: 0.9 },
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

/** ...of which a COUNTRY offers some (R40): the desert has no rain, and its
 * storm is sand. The row a page shows is the country's, so the sky can
 * never be set to a weather the place does not have. */
export function weathersOf(biome: BiomeId): { id: Weather; label: string }[] {
  const offered = biomeRules(biome).weathers;
  return WEATHERS.filter((w) => offered.includes(w.id));
}

/** R40 — the countries, as the menus name them. First is the default. */
export const BIOME_OPTIONS: { id: BiomeId; label: string }[] = BIOME_IDS.map((id) => ({
  id,
  label: BIOMES[id].label,
}));

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
    // A head carrying a subtitle is two rows tall and the way out stands
    // level with the TITLE, not floating between the two; a head that is
    // only a title is one row, and the button centres on it. The difference
    // is marked here rather than guessed at in the stylesheet, because it is
    // a fact about the content and there is exactly one place that knows it.
    <div className={`menu-head ${sub === undefined ? "menu-head-solo" : ""}`}>
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

/** The two boxes, each with the sentence that says what taking it buys.
 * Shared by OPTIONS and the pre-race card, which offer the same setting:
 * two surfaces wording the same choice differently is two settings as far
 * as the player is concerned.
 *
 * The manual's headline figure comes off the tuning (`manualGain`), not out
 * of the sentence — a retune of the ratios that left the card still
 * claiming six percent would be a card lying about the only choice on it.
 * The short line under it is what the pre-race card's two big boxes wear;
 * the long one is what either surface's caption bar reads. */
export const GEARBOX_OPTIONS: (Stop<GearboxMode> & { blurb: string })[] = [
  {
    id: "auto",
    label: "AUTO",
    blurb: "SHIFTS FOR YOU",
    hint: "The road box — it takes every gear for you, and never fluffs one",
  },
  {
    id: "manual",
    label: "MANUAL",
    blurb: `+${manualGain()}% TOP SPEED`,
    hint: `The racing set — ${manualGain()}% taller gearing, paid for with a beat of throttle at every shift you now take yourself`,
  },
];

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

/** A CONTINUOUS setting, drawn as the thing it is.
 *
 * A row of chips is the right control for a choice whose answers have names
 * — LOW, MEDIUM, HIGH — and the wrong one for a level, where the answer is
 * "a bit less than that" and the chips are five places the value is allowed
 * to stand. The readout is what a bare slider lacks: a number to come back
 * to, and a word for the bottom of the travel, since OFF is a thing people
 * mean rather than a very quiet thing.
 *
 * A controller reaches it too — menu-nav.ts walks range inputs and steps
 * them sideways, the same way it steps the car on its stand. */
export function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="menu-row">
      <span className="menu-label">{label}</span>
      <div className="menu-slide">
        <input
          className="menu-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onInput={(e) => {
            // The tick is the point on a volume fader: it is an EFFECT, so
            // moving the effects level is heard at the level being set while
            // the thumb is still on it. Capped inside playUi, so a drag is a
            // run of ticks rather than a buzz.
            playUi("move");
            onChange(Number((e.target as HTMLInputElement).value));
          }}
        />
        <span className="menu-slide-read">{format(value)}</span>
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
  /** The player's options, for the knobs on the card. Every change applies
   * to the run standing behind the scrim the moment it is made. */
  settings: Settings;
  onSettings: (settings: Settings) => void;
};

const ON_OFF: Stop<"off" | "on">[] = [
  { id: "off", label: "OFF" },
  { id: "on", label: "ON" },
];

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
  settings,
  onSettings,
}: PauseProps) {
  const set = (patch: Partial<Settings>): void => onSettings({ ...settings, ...patch });
  return (
    <div className="hud-menu-wrap pointer-events-auto" onPointerDown={onResume} role="presentation">
      <div className="hud-menu hud-pause" onPointerDown={(e) => e.stopPropagation()}>
        <div className="hud-menu-title">PAUSED</div>
        <div className="hud-pause-sub">
          STAGE {seed} — {carName}
        </div>
        {/* RESUME is both the way OUT of this card and where a controller's
            cursor belongs: it is the press a card opened by mis-aiming for
            the minimap needs, and two of the three rows under it throw the
            stage away. Without the focus mark the cursor skips it — a way
            back is normally a chevron nobody came for — and lands on the
            first row that is not it. */}
        <button
          type="button"
          className="hud-start"
          data-nav-back
          data-nav-focus
          onClick={() => {
            playUi("back");
            onResume();
          }}
        >
          RESUME
        </button>
        {/* THE KNOBS, between RESUME and the two presses that throw the
            stage away. The camera you cannot see out of, the HUD in the
            way of a picture, the score you want quieter are settings you
            want changed HERE, with the stage still standing — and they
            are all this card offers, so it stays a card. Standing between
            RESUME and RESTART is also what keeps a thumb aiming for the
            first from landing on the second. */}
        <div className="hud-pause-knobs">
          <StepRow
            label="CAMERA"
            stops={PLAY_CAMERAS}
            value={settings.camera}
            onPick={(camera) => set({ camera })}
          />
          <StepRow
            label="HUD"
            stops={ON_OFF}
            value={settings.hud.on ? "on" : "off"}
            onPick={(id) => set({ hud: { ...settings.hud, on: id === "on" } })}
          />
          <StepRow
            label="REAR VIEW"
            stops={ON_OFF}
            value={settings.hud.mirror ? "on" : "off"}
            onPick={(id) => set({ hud: { ...settings.hud, mirror: id === "on" } })}
          />
          <FadeRow
            label="EFFECTS"
            value={settings.audio.sfx}
            onChange={(sfx) => set({ audio: { ...settings.audio, sfx } })}
          />
          <FadeRow
            label="MUSIC"
            value={settings.audio.music}
            onChange={(music) => set({ audio: { ...settings.audio, music } })}
          />
        </div>
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
