// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE APP STARTS WITH: the build stamp, the stored race settings and
// the stored options, and the rules for reconciling either with what a
// link asks for. A URL parameter beats storage beats the defaults, and
// every stored value is re-validated on the way in — a record written by a
// build that offered a different ceiling, or a car that has since been
// retired, must not leave the game holding a setting it cannot honour.

import {
  weathersIn,
  CARS,
  NUMERIC_KNOBS,
  GRID_MAX,
  resolveKnobs,
  DEFAULT_HOUR,
  DEFAULT_SANDSTORMS,
  type CarInput,
  type StageLength,
  type StageShape,
  type Difficulty,
  type Season,
  type Weather,
  isBiomeId,
} from "@engine";

import { hourOfWord, parseHour } from "./daylight.ts";
import {
  DEFAULT_HEADS_UP,
  DEFAULT_ROAM,
  DEFAULT_STAGE_KNOBS,
  DIFFICULTY_OPTIONS,
  ROAM_OPPONENTS_MAX,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  WEATHERS,
  gridSize,
  type RaceSettings,
} from "./menu.tsx";
import { loadSettings, type Settings } from "./settings.ts";

import { devFromUrl, mapFullFromUrl, mapLayerFromUrl, RACE_KEY, viewFromUrl } from "./app-url.ts";

/** The build this frame came out of — the first thing to check when a
 * screenshot and the current tree disagree about what the game does. */
export const BUILD = `v${__APP_VERSION__} ${__COMMIT_SHA__}`;

/** How often the debug log writes a position line while a run is going,
 * seconds. One a second is a readable trace of a two-minute stage; faster
 * turns the copy into a wall nobody reads to the end of. */
export const TRACE_PERIOD = 1;

/** Whether the player is actually asking for anything this step. */
export function driving(input: CarInput): boolean {
  return input.throttle > 0 || input.brake > 0 || input.handbrake || Math.abs(input.steer) > 0;
}

/** The driver asking to get on with it during the establishing shot. A
 * pedal, the handbrake or a gear — anything a foot or a hand deliberately
 * does. NOT the wheel: a stick resting a hair off centre would cut the shot
 * before it had started, and a wobble on the line is a driver settling in.
 * The countdown itself is never skipped, so the lights are always seen. */
export function wantsOff(input: CarInput): boolean {
  return input.throttle > 0.5 || input.brake > 0.5 || input.handbrake || input.shiftUp;
}

/** How many opponents Roam will actually put out — a whole number of them,
 * inside the travel the slider offers. A stored record from a build that
 * offered a different ceiling, or a `?rivals=` off a link, both come through
 * here. */
export function clampOpponents(count: number): number {
  return Math.min(ROAM_OPPONENTS_MAX, Math.max(0, Math.round(count)));
}

/** Initial race settings: URL params (tooling) beat the stored choice beats
 * the defaults. Storage can be unavailable (private mode) — defaults are
 * fine. */
export function initialRace(): RaceSettings {
  const race: RaceSettings = {
    hour: DEFAULT_HOUR,
    weather: "clear",
    season: "summer",
    temperature: null,
    sandstorms: DEFAULT_SANDSTORMS,
    carId: "compact",
    length: "medium",
    shape: "sprint",
    knobs: { ...DEFAULT_STAGE_KNOBS },
    difficulty: "medium",
    headsUp: { ...DEFAULT_HEADS_UP },
    roam: { ...DEFAULT_ROAM },
  };
  try {
    const stored = localStorage.getItem(RACE_KEY);
    if (stored) Object.assign(race, JSON.parse(stored));
  } catch {
    /* storage unavailable — keep defaults */
  }
  // A record written when a stage was set by a WORD carries `timeOfDay`
  // and no hour: it is read as the hour that light happens at in the
  // season and the country it stored (daylight.ts).
  const legacy = (race as { timeOfDay?: unknown }).timeOfDay;
  if (typeof legacy === "string" && typeof race.hour !== "number") {
    race.hour = hourOfWord(legacy, race.season, race.knobs?.biome ?? "taiga");
  }
  delete (race as { timeOfDay?: unknown }).timeOfDay;
  race.hour = parseHour(race.hour) ?? DEFAULT_HOUR;
  // A record written before HEADS UP existed has no group at all, and one
  // written by a build with fewer settings in it has half a group: both are
  // the defaults with whatever was actually stored laid over them.
  race.headsUp = { ...DEFAULT_HEADS_UP, ...race.headsUp };
  // The heads-up grid is held to what the AUTHORED roster and the rule
  // book's own apron stand (`GRID_MAX`), not to the ceiling `gridSize`
  // allows: the deeper grids are Roam's, and they are built for.
  race.headsUp.cars = gridSize(Math.min(race.headsUp.cars, GRID_MAX));
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.headsUp.difficulty)) {
    race.headsUp.difficulty = DEFAULT_HEADS_UP.difficulty;
  }
  race.roam = { ...DEFAULT_ROAM, ...race.roam };
  race.roam.opponents = clampOpponents(race.roam.opponents);
  if (!STAGE_LENGTH_OPTIONS.some((l) => l.id === race.length)) race.length = "medium";
  if (!STAGE_SHAPES.some((s) => s.id === race.shape)) race.shape = "sprint";
  if (!DIFFICULTY_OPTIONS.some((d) => d.id === race.difficulty)) race.difficulty = "medium";
  const params = new URLSearchParams(location.search);
  // ?hour= is the sun's clock at the start (0..24); ?tod= is the word a
  // stage used to be set by, read as the hour that light happens at in the
  // season and the country the link names (daylight.ts).
  const hour = parseHour(params.get("hour"));
  if (hour !== null) race.hour = hour;
  else {
    const tod = params.get("tod");
    if (tod) race.hour = hourOfWord(tod, race.season, race.knobs.biome);
  }
  const weather = params.get("weather");
  if (WEATHERS.some((w) => w.id === weather)) race.weather = weather as Weather;
  const season = params.get("season");
  if (SEASONS.some((x) => x.id === season)) race.season = season as Season;
  // ?temp= — the air at the datum, °C (climate.ts); a record from a build
  // with no temperature in it, or anything that is not a number, is AUTO.
  if (race.temperature !== null && !Number.isFinite(race.temperature)) race.temperature = null;
  race.temperature ??= null;
  const temp = params.get("temp");
  if (temp !== null && temp !== "auto" && Number.isFinite(Number(temp))) {
    race.temperature = Number(temp);
  }
  // ?sandstorms= — how often the desert's fronts come, 0..1
  // (game/sandstorm.ts). Clamped rather than rejected: a link from a build
  // with a different band is still asking for "as often as it goes".
  if (!Number.isFinite(race.sandstorms)) race.sandstorms = DEFAULT_SANDSTORMS;
  const storms = params.get("sandstorms");
  if (storms !== null && Number.isFinite(Number(storms))) {
    race.sandstorms = Math.min(1, Math.max(0, Number(storms)));
  }
  const car = params.get("car");
  // Checked against the catalog rather than against a pair of literals: a
  // roster this named by hand silently shoots the DEFAULT car for every id
  // added since, which is a contact sheet that quietly stops covering the
  // thing it was made to compare.
  if (CARS.some((c) => c.id === car)) race.carId = car as string;
  const length = params.get("length");
  if (STAGE_LENGTH_OPTIONS.some((l) => l.id === length)) race.length = length as StageLength;
  const shape = params.get("shape");
  if (STAGE_SHAPES.some((s) => s.id === shape)) race.shape = shape as StageShape;
  const difficulty = params.get("difficulty");
  if (DIFFICULTY_OPTIONS.some((d) => d.id === difficulty)) {
    race.difficulty = difficulty as Difficulty;
  }
  // ?rivals= — how many cars Roam puts on the road with the player, so a
  // screenshot or a repro of a busy stage can be stood in again.
  const rivals = params.get("rivals");
  if (rivals !== null && Number.isFinite(Number(rivals))) {
    race.roam.opponents = clampOpponents(Number(rivals));
  }
  // The generator's dials, each 0..1 — the tooling pins a stage's character
  // the same way it pins its seed. Read off the ENGINE's list rather than
  // off the menu's rows: a knob the menu does not draw a row for (R21's
  // `width`, now that R46's slider owns it) is still a knob a screenshot
  // has to be able to pin, and the repro line writes every one of them.
  race.knobs = resolveKnobs(race.knobs);
  for (const key of NUMERIC_KNOBS) {
    const raw = params.get(key);
    if (raw !== null && Number.isFinite(Number(raw))) race.knobs[key] = Number(raw);
  }
  // ...and the country (R40), the one dial that is a name. A stored race
  // from a build with no countries in it resolves to the taiga.
  const biome = params.get("biome");
  if (isBiomeId(biome)) race.knobs.biome = biome;
  race.knobs = resolveKnobs(race.knobs);
  // A weather the country does not have (a desert save left on RAIN by a
  // build that offered it) is cleared rather than drawn as something else.
  if (!weathersIn(race.knobs.biome, race.season).includes(race.weather)) race.weather = "clear";
  return race;
}

/** The player's options, with the URL's developer flags laid over them. A
 * repro link arrives on a machine that has never drummed on the chassis, so
 * it lets the developer menu out as well as the tools — otherwise the boxes
 * come up and there is no way to switch them off again. */
export function initialSettings(): Settings {
  const settings = loadSettings();
  Object.assign(settings.view, viewFromUrl());
  const forced = devFromUrl();
  if (forced.debug || forced.god || forced.record) {
    settings.developer = true;
    settings.dev = { ...settings.dev, ...forced };
  }
  // ...and the map's own repro line, which asks for the same thing by a
  // different door: a link that names a layer is a link to a developer tool.
  if (mapLayerFromUrl() || mapFullFromUrl()) settings.developer = true;
  // The box, pinned the way `?camera=` pins the angle: which gears the HUD
  // offers and what a thumb flick on the pedal is worth both hang off it, so
  // a shot of either must not depend on what is in the screenshot machine's
  // local storage.
  const gearbox = new URLSearchParams(location.search).get("gearbox");
  if (gearbox === "auto" || gearbox === "manual") settings.gearbox = gearbox;
  // ?hud=0 — a CLEAN FRAME: the instrument panel and the rear-view glass
  // both off, so a tool photographing the WORLD gets the world and nothing
  // laid over it. Both switches together rather than only the panel, since
  // half a HUD in shot is the same problem as all of it; pinned from the URL
  // for the reason the gearbox is, so a picture does not depend on what the
  // machine taking it happens to have stored. The frame rate is pinned OFF
  // either way: it is the one readout that is about the machine taking the
  // picture rather than about the game in it, and a number that differs on
  // every runner is a number no two shots can be compared across.
  const hud = new URLSearchParams(location.search).get("hud");
  if (hud === "0" || hud === "1") {
    settings.hud = { on: hud === "1", mirror: hud === "1", fps: false };
  }
  // ?drawdistance= — how far the air lets the camera see (OPTIONS ▸ VIDEO's
  // own switch, `DRAW_DISTANCE_SCALE` on the sky preset's fog). The fog is
  // tuned for a driver's eye a metre and a half off the road, where 520 m is
  // a long way; a camera lifted a hundred metres up is looking through four
  // times that at the ground in front of it, and on the stored default the
  // whole middle distance washes out to fog colour. A preview of the COUNTRY
  // asks for the setting a player with a good machine already has.
  const range = new URLSearchParams(location.search).get("drawdistance");
  if (range === "near" || range === "normal" || range === "far") {
    settings.video = { ...settings.video, drawDistance: range };
  }
  return settings;
}
