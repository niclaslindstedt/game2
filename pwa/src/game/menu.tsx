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
  altitudeOf,
  duneHeightOf,
  sandPeriodOf,
  biomeRules,
  defaultTemperature,
  fallsAsSnow,
  weathersIn,
  BIOMES,
  BIOME_IDS,
  DEFAULT_KNOBS,
  DIFFICULTIES,
  type BiomeId,
  DIFFICULTY_IDS,
  GRID_CEILING,
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
  type Weather,
} from "@engine";

import type { ComponentChildren } from "preact";
import { useState } from "react";

import { playToggle, playUi } from "./audio/ui.ts";
import { manualGain } from "./car-stats.ts";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { FadeRow, StepRow, type Stop } from "./menu-knobs.tsx";
import { PLAY_CAMERAS, type DevSettings, type Settings } from "./settings.ts";

/** How a stage was entered — the campaign is what records a clear, a time
 * trial is a lap you drive for the clock alone, and a heads-up race is the
 * campaign's field with the championship taken off: nothing about it is
 * written down anywhere. */
/** The disciplines a run can be started in. Two of them are not stages the
 * player drives: TRAINING opens the hand-built training ground
 * (`mapgen/arena.ts`) instead of a seed, and keeps no time, no field and no
 * score; REPLAY hands the wheel to a recorded tape (`replay.ts`) and keeps
 * nothing either — it is a run being WATCHED, and nothing a watcher does may
 * reach a board. */
export type PlayMode = "campaign" | "timetrial" | "headsup" | "roam" | "training" | "replay";

export type RaceSettings = {
  /** The hour the stage starts at, 0..24 — the sun's clock runs on from
   * it at an hour a minute (`RaceEnv.hour`). */
  hour: number;
  weather: Weather;
  season: Season;
  /** The air at the datum, °C, or null for the season's own in the
   * country (climate.ts) — what the TEMPERATURE row stores as AUTO. */
  temperature: number | null;
  /** R40 — how often the SANDSTORMS come, 0..1 (`game/sandstorm.ts`).
   * Kept beside the weather rather than among the generator's dials
   * because it is not one: the fronts blow across a stage the seed built
   * without them, so moving this rebuilds the RUN and never the road. */
  sandstorms: number;
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
  /** ROAM's own — how many cars it puts on the road with you. How GOOD they
   * are is the campaign's `difficulty` above, because Roam already reads it
   * for what a crash costs and one page does not ask the same question
   * twice. */
  roam: RoamSettings;
};

/** ROAM'S OWN: how many cars are out there with you. Kept apart from the
 * heads-up race's `cars` for the reason that setting is kept apart from the
 * campaign's difficulty — the two are different races, and a number dialled
 * in for one must not turn up in the other. It counts OPPONENTS rather than
 * cars because that is the question being asked on a page where the player
 * is the one certainty: zero is the road to yourself, which is what Roam has
 * always been and still defaults to. */
export type RoamSettings = {
  opponents: number;
};

/** The most opponents Roam will put on the road: a full grid of
 * `GRID_CEILING` less the player. It is a long way past what the game is
 * balanced for and that is the point — the slider is the player choosing
 * how much of their own frame rate to spend on traffic. */
export const ROAM_OPPONENTS_MAX = GRID_CEILING - 1;

export const DEFAULT_ROAM: RoamSettings = { opponents: 0 };

/** What the opponents row reads as. NONE rather than 0 for the reason a
 * fader reads OFF: an empty road is a state, not a quantity. */
export function opponentsWord(count: number): string {
  return count <= 0 ? "NONE" : String(Math.round(count));
}

/** What a heads-up race is set up with: how good the field is, and how many
 * cars are on it. There is no start-type setting — a heads-up race is a mass
 * start, one grid and one green, and that is what the mode IS. */
export type HeadsUpSettings = {
  difficulty: Difficulty;
  /** Cars on the entry list, the player included. */
  cars: number;
};

export { gridSize };

export const DEFAULT_HEADS_UP: HeadsUpSettings = {
  difficulty: "medium",
  cars: GRID_DEFAULT,
};

/** THE GRIDS ON OFFER — a ladder rather than every size the apron will
 * hold: two is a duel, and each rung after it roughly doubles the traffic,
 * which is the thing about a grid a player can actually feel. Adjacent even
 * numbers are chips that read alike and race alike, and a row of them is a
 * decision nobody can make.
 *
 * The top rung is the ceiling rather than the ladder's own last step: the
 * roster and the apron decide how deep a grid can be (`GRID_MAX`), so a
 * fifteenth rival added to `rivals.ts` moves this without it being edited,
 * and a rung past the ceiling is dropped instead of quietly clamping onto
 * the one below it. */
const GRID_LADDER = [2, 4, 8, 12, 16];

export const GRID_OPTIONS: { id: string; label: string; cars: number }[] = (() => {
  const sizes = new Set(GRID_LADDER.filter((cars) => cars >= GRID_MIN && cars < GRID_MAX));
  sizes.add(GRID_MAX);
  return [...sizes]
    .sort((a, b) => a - b)
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

/** What a rung costs the player's OWN car, read off the same table the field
 * is entered from (`damageScaleFor`). Derived rather than written out, so a
 * retune of `DIFFICULTIES` can never leave the menu quoting a scale the game
 * no longer runs. */
function damageWord(damage: number): string {
  if (damage <= 0) return "NO DAMAGE";
  if (damage >= 1) return "FULL DAMAGE";
  if (Math.abs(damage - 0.5) < 0.01) return "HALF DAMAGE";
  return `${Math.round(damage * 100)}% DAMAGE`;
}

/** ...and what it does to the FOURTEEN CREWS, which is the other half of the
 * word and the half a player meets first: a difficulty is a points budget
 * every rival spends on their own driving, plus how much of their temper
 * they are allowed off the leash (`budgetFor`, `DIFFICULTIES[].aggression`).
 * A skill budget is not a figure anybody can read — 27 against 42 says
 * nothing — so this half is WORDED rather than derived, and the meter beside
 * it is what says how far up the ladder the rung stands. Keyed by id so a
 * rung the engine grows arrives wordless rather than mislabelled. */
const CREW_WORD: Partial<Record<Difficulty, string>> = {
  easy: "CALM CREWS",
  medium: "QUICK CREWS",
  hard: "BEST CREWS",
};

/** The three rungs as CARDS rather than chips: the meter that says how far up
 * the ladder each one stands, the word, and the two things the word decides
 * — how good the crews are, and what a crash costs. */
export const DIFFICULTY_CARDS: {
  id: Difficulty;
  label: string;
  glyph: GlyphName;
  crews: string;
  damage: string;
}[] = DIFFICULTY_IDS.map((id) => ({
  id,
  label: DIFFICULTIES[id].label,
  // The meter is named for the rung it draws — one mark per idea, and the
  // idea here IS easy, medium, hard.
  glyph: id as GlyphName,
  crews: CREW_WORD[id] ?? "",
  damage: damageWord(DIFFICULTIES[id].damage),
}));

/** R29 — HOW HARD THE GAME IS, as the decision it actually is.
 *
 * It is not a knob among knobs. It buys every rival crew a bigger budget to
 * spend on their own driving AND lets more of every impact through to the
 * player's car, and every result already on the ladder was scored against
 * one particular answer. A row of three chips the size of the HILLS dial
 * says none of that. Three cards do, with room to say both halves and for a
 * meter that reads before the word does, in the green-amber-red every other
 * scale in the world is painted in.
 *
 * `label` is a parameter because HEADS UP asks the same question about its
 * own field, which is deliberately not the campaign's (see
 * `RaceSettings.headsUp`) — the two must never look like one setting. */
export function DifficultyPicker({
  value,
  onPick,
  label = "DIFFICULTY",
}: {
  value: Difficulty;
  onPick: (id: Difficulty) => void;
  label?: string;
}) {
  return (
    <div className="menu-diff">
      <span className="menu-label">{label}</span>
      <div className="menu-diff-opts" role="radiogroup" aria-label={label}>
        {DIFFICULTY_CARDS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={opt.id === value}
            className={`menu-diff-opt menu-diff-${opt.id} ${
              opt.id === value ? "menu-diff-on" : ""
            }`}
            onClick={() => {
              playToggle(true);
              onPick(opt.id);
            }}
          >
            <Glyph name={opt.glyph} className="menu-diff-meter" />
            <span className="menu-diff-name">{opt.label}</span>
            <span className="menu-diff-blurb">
              <span>{opt.crews}</span>
              <span>{opt.damage}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

/** The dials, as the menu offers them AS STOPS: three positions each,
 * because a slider on a phone during a pre-race screen is a fiddle and what
 * a player actually wants to say is "more hills" or "no tarmac". The values
 * are the engine's 0..1 knobs (rules.ts).
 *
 * It is not every numeric knob the engine has, and must not be read as one
 * — `NUMERIC_KNOBS` is that list, and it is what the URL, the repro line
 * and the stage cache walk. Two knobs are deliberately not here: R46's
 * `challenge`, which is a SLIDER (`challengeWord`) because difficulty is a
 * scale rather than three named places, and R21's `width`, which that
 * slider now owns — the road narrows as the stage gets harder, and a ROAD
 * row beside a DIFFICULTY row is two controls fighting over one number. */
export type DialStop = { id: string; label: string; value: number };

export const STAGE_DIALS: {
  key: NumericKnob;
  label: string;
  stops: DialStop[];
  /** R47 — a dial only one country reads is only offered there. */
  biome?: BiomeId;
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
    // R49 — WHICH WAY the stage runs through that country, as against how
    // much of it there is (`elevation`) and how steep it stands
    // (`steepness`). A DESCENT is the one a player feels first: the road
    // gives back speed the whole way instead of asking for it.
    key: "tilt",
    label: "GRADIENT",
    stops: [
      { id: "low", label: "CLIMB", value: 0.15 },
      { id: "mid", label: "MIXED", value: 0.5 },
      { id: "high", label: "DESCENT", value: 0.85 },
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
    // R47 — how many mountains the alpine has: one standing alone in a
    // plain, with nothing but the drop off the road's edge; a valley with
    // a flank up each side; or a whole range of them.
    key: "peaks",
    label: "PEAKS",
    biome: "alpine",
    stops: [
      { id: "low", label: "ONE", value: 0 },
      { id: "mid", label: "VALLEY", value: 0.5 },
      { id: "high", label: "RANGE", value: 1 },
    ],
  },
];

/** R46 — WHAT A POSITION ON THE STAGE'S DIFFICULTY DIAL IS CALLED.
 *
 * A percentage would say nothing: a road is not 70% hard. Five words over
 * the travel, and the middle one is RALLY — the vocabulary every campaign
 * stage is built on and everything in the game was tuned against — so a
 * player who has moved the slider can always find their way back to the
 * game as it ships by reading the word rather than by counting pips.
 *
 * This is the ROAD, not the field: R29's `difficulty` (the three cards on
 * the campaign's page) is how good the rivals are, and Roam has no rivals. */
export const CHALLENGE_WORDS: { at: number; label: string }[] = [
  { at: 0.2, label: "GENTLE" },
  { at: 0.4, label: "STEADY" },
  { at: 0.6, label: "RALLY" },
  { at: 0.8, label: "TESTING" },
  { at: 1.01, label: "SAVAGE" },
];

export function challengeWord(value: number): string {
  return (CHALLENGE_WORDS.find((word) => value < word.at) ?? CHALLENGE_WORDS[4]).label;
}

/** ...and the mark beside it: the same three-bar meter the campaign's
 * difficulty cards are drawn with, filling as the slider travels. One idea,
 * one mark, wherever the game is asked how hard something is. */
export function challengeGlyph(value: number): GlyphName {
  return value < 0.4 ? "easy" : value < 0.7 ? "medium" : "hard";
}

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

/** The four. Winter is the one that reaches the wheels: a frozen country
 * is snow on the road and a blanket beside it (climate.ts). */
export const SEASONS: { id: Season; label: string }[] = [
  { id: "spring", label: "SPRING" },
  { id: "summer", label: "SUMMER" },
  { id: "autumn", label: "AUTUMN" },
  { id: "winter", label: "WINTER" },
];

/** THE TEMPERATURE ROW's span, °C at the datum: an arctic night at one end
 * and a desert afternoon at the other, which between them cover every air
 * this game has anything to say about — the freeze at 0, the ice at -5
 * (climate.ts) and the deep cold the snow bites in are all inside it.
 *
 * It is a FADER rather than a ladder of stops because a temperature is a
 * quantity and not a set of answers: the interesting part of the range is
 * the couple of degrees either side of freezing, where the road glazes and
 * the lakes go over, and a five-degree rung steps straight past it. */
export const TEMPERATURE_RANGE = { min: -40, max: 40 } as const;

/** Where the fader's thumb stands, °C: the temperature this stage names, or
 * the season's own in this country (climate.ts) until somebody moves it.
 * There is no AUTO stop to land on — a fader has nowhere to put one, and
 * moving the SEASON hands the row back to the season anyway (see the Roam
 * page). Clamped to the travel, so a temperature dialled in from a link
 * still lands on a stop the row can draw the thumb on. */
export function temperatureAir(temperature: number | null, biome: BiomeId, season: Season): number {
  const air = temperature ?? defaultTemperature(biome, season);
  const { min, max } = TEMPERATURE_RANGE;
  return Math.min(max, Math.max(min, Math.round(air)));
}

/** What the fader READS as: the air, signed, so a glance says which side of
 * freezing the stage is on. */
/** R47 — WHAT THE ALTITUDE ROW READS: how high the mountain this seed
 * builds stands over its valley floor, in metres (`altitudeOf`). The dial
 * itself is a 0..1 position like every other knob; the metres are what it
 * MEANS, and they are the only thing worth putting on the row — "0.62" is
 * not a mountain and nobody can picture one. */
export function altitudeLabel(knobs: StageKnobs, altitude: number): string {
  return `${Math.round(altitudeOf({ ...knobs, altitude }))} M`;
}

/** ...and whether this country has an altitude to dial at all: R47's row
 * is only offered where there is a mountain for it to move. Asked of the
 * country rather than of its name, so a second mountain country would be
 * offered it without anybody having to remember to come here. */
export function hasAltitude(biome: BiomeId | string | undefined): boolean {
  return biomeRules(biome).land.massif !== null;
}

/** R40 — WHAT THE DUNE ROW READS: how high the sand this country's wind has
 * piled stands over the trough beside it, in metres (`duneHeightOf`). A
 * MAXIMUM, and the row says so — most of the country is lower, and between
 * the ergs there is none at all. Metres for the reason ALTITUDE is in
 * metres: a dune is a height, and nobody can picture "0.62" of one. */
export function duneLabel(knobs: StageKnobs, dunes: number): string {
  const m = Math.round(duneHeightOf({ ...knobs, dunes }));
  return m === 0 ? "NONE" : `${m} M`;
}

/** ...and whether this country has any sand to pile. Asked of the country
 * (`BiomeLand.dunes`) rather than of its name. */
export function hasDunes(biome: BiomeId | string | undefined): boolean {
  return biomeRules(biome).land.dunes !== null;
}

/** R40 — WHAT THE SANDSTORM ROW READS: how long there is between one wall
 * of sand and the next (`sandPeriodOf`), as minutes, because a period is
 * what the dial actually moves and "how often" is the question the player
 * is asking. OFF at the bottom of the travel, where no front is scheduled
 * at all — the one position that removes the weather rather than spacing
 * it out. */
export function sandstormLabel(biome: BiomeId | string | undefined, sandstorms: number): string {
  const period = sandPeriodOf({ sand: hasSandstorms(biome), sandstorms });
  if (period === null) return "OFF";
  const minutes = period / 60;
  return `EVERY ${minutes < 10 ? minutes.toFixed(1) : minutes.toFixed(0)} MIN`;
}

/** ...and whether the wind in this country picks the ground up and carries
 * it (`BiomeRules.blown`) — whether there are storms of it to space out. */
export function hasSandstorms(biome: BiomeId | string | undefined): boolean {
  return biomeRules(biome).blown;
}

export function temperatureLabel(air: number): string {
  return `${air > 0 ? "+" : ""}${air}°C`;
}

export const WEATHERS: { id: Weather; label: string }[] = [
  { id: "clear", label: "CLEAR" },
  { id: "rain", label: "RAIN" },
  { id: "storm", label: "STORM" },
];

/** ...of which a COUNTRY offers some (R40) in a SEASON (climate.ts): the
 * desert has no rain but in its winter, and its storm is sand. The row a
 * page shows is the country's, so the sky can never be set to a weather
 * the place does not have. Under freezing the same two weathers are named
 * for what they are there — SNOW and a BLIZZARD — because what falls is
 * the temperature's call (`fallsAsSnow`), not the row's. */
export function weathersOf(
  biome: BiomeId,
  season: Season = "summer",
  temperature: number | null = null,
): { id: Weather; label: string }[] {
  const offered = weathersIn(biome, season);
  const air = temperature ?? defaultTemperature(biome, season);
  const snow = fallsAsSnow(air);
  return WEATHERS.filter((w) => offered.includes(w.id)).map((w) =>
    snow && w.id === "rain"
      ? { id: w.id, label: "SNOW" }
      : snow && w.id === "storm"
        ? { id: w.id, label: "BLIZZARD" }
        : w,
  );
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
  act,
  aside,
}: {
  back: () => void;
  backLabel: string;
  title: string;
  /** The page's one line of billing. Omitted on pages whose title says it
   * all — the head then holds the title alone, still on one row. */
  sub?: string;
  /** THE PAGE'S ONE OTHER PRESS, at the far end of the head. A page whose
   * content is a grid has nowhere to put a second action that is not a row
   * of the grid's own height — and a row is the one thing a stage grid on a
   * phone cannot spare. The head already reserves that line, so a press put
   * here costs nothing and STAYS on it: where there is no width for the
   * word, the mark carries it (`.menu-head-act`).
   *
   * A press, not a figure — see `aside` for the other kind. A head carries
   * one or the other: they want the same corner, and only one of them may
   * fall to a second row. */
  act?: ComponentChildren;
  /** ONE READING the page is about, given the head's far corner where there
   * is room for it: a figure rather than a sentence, and never something the
   * title already says. Where there is no width for a third column it comes
   * back down under the title, which is where a subtitle would have been. */
  aside?: ComponentChildren;
}) {
  const solo = sub === undefined && aside === undefined;
  return (
    // A head carrying a subtitle is two rows tall and the way out stands
    // level with the TITLE, not floating between the two; a head that is
    // only a title is one row, and the button centres on it. The difference
    // is marked here rather than guessed at in the stylesheet, because it is
    // a fact about the content and there is exactly one place that knows it.
    <div
      className={`menu-head ${solo ? "menu-head-solo" : ""} ${aside === undefined ? "" : "menu-head-aside"}`}
    >
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
      {act}
      {aside !== undefined && <div className="menu-head-side">{aside}</div>}
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
  wide = false,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  /** Chips sized to be AIMED AT rather than to fit: a row whose answers are
   * one or two characters (a grid size, a lap count) is a row of targets the
   * width of the glyph on them, which on a phone is a row of misses. The
   * chips then share the row's width evenly instead of hugging their text. */
  wide?: boolean;
  onPick: (id: T) => void;
}) {
  return (
    <div className="menu-row">
      <span className="menu-label">{label}</span>
      <div className={`menu-opts ${wide ? "menu-opts-wide" : ""}`}>
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
  /** WATCH THE RUN SO FAR — put the drive up to this moment straight back on
   * the road (app-play.ts). It ENDS the run, which is why it asks; null when
   * there is nothing behind the press — no recording armed, or the thing
   * being watched is already one. */
  onWatchReplay: (() => void) | null;
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
  onWatchReplay,
  settings,
  onSettings,
}: PauseProps) {
  const set = (patch: Partial<Settings>): void => onSettings({ ...settings, ...patch });
  /** Whether WATCH REPLAY has been pressed once and is now asking.
   *
   * THE ONE PRESS ON THIS CARD THAT ASKS, and it asks because it is the only
   * one whose cost is not written on it. RESTART STAGE and MAIN MENU say
   * exactly what they do and a player pressing either has decided to stop
   * driving; WATCH REPLAY sounds like something you do BESIDE a run, and it
   * is not — a replay is a run, the app stands one stage at a time, and
   * taking the tape means giving the drive up. So the row says so and takes
   * the second press, rather than a card of its own: a dialog over a dialog
   * is a modal to dismiss for a player who only mis-aimed for the minimap,
   * and the ask is one line of the row they are already looking at.
   *
   * Nothing has to disarm it: every way out of this card unmounts it —
   * resuming, restarting, leaving, and the press itself — so a question
   * nobody answered is gone by the time the card is opened again. */
  const [asking, setAsking] = useState(false);
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
        {/* WATCH REPLAY stands FIRST of the three, above the two presses
            that end the run without showing the player anything. All three
            end it; this is the only one that hands something back for it,
            and a player who has stopped mid-stage to look at what just
            happened is reaching for exactly this. */}
        {onWatchReplay && (
          <button
            type="button"
            className={`hud-pause-act ${asking ? "hud-pause-asking" : ""}`}
            onClick={() => {
              playUi("select");
              if (!asking) {
                setAsking(true);
                return;
              }
              setAsking(false);
              onWatchReplay();
            }}
          >
            WATCH REPLAY
            <span className="hud-pause-cost">
              {asking ? "PRESS AGAIN — THIS ENDS THE RUN" : "ENDS THE RUN"}
            </span>
          </button>
        )}
        <button type="button" className="hud-pause-act" onClick={onRestart}>
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
