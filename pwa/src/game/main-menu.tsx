// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main menu — the surface the game launches into, painted over a live
// bot-driven stage seen from a drone. Everything the player can reach
// before a run starts hangs off here:
//
//   Campaign   → a location (Taiga) → its stages, each unlocked by the one
//                before it.
//   Time trial → the same stages, behind a stricter gate: a stage opens
//                here once it has been FINISHED, because a time is something
//                you chase on a road you have already driven to the end.
//   Roam       → any seed at all, previewed as the map itself (menu-roam).
//   Options    → HUD, video and controls (menu-options).
//
// The pages are a plain tagged union rather than a router: there is no URL
// to keep in step, and the whole menu is one component tree over one canvas.

import { useEffect, useRef, useState } from "react";
import { FIELD_SIZE, STAGE_RULES, type Difficulty } from "@engine";

import { APP_NAME, REPO_URL } from "../identity.ts";
import { formatTime, ordinal } from "../lib/util.ts";
import {
  LOCATIONS,
  PODIUM,
  bestPlace,
  levelCompleted,
  levelLaps,
  levelUnlocked,
  locationById,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { CarPicker } from "./car-picker.tsx";
import {
  championshipWon,
  locationUnlocked,
  playerStanding,
  seasonComplete,
  seasonContinue,
  standings,
  type Championship,
} from "./championship.ts";
import { ResultsModal } from "./results-table.tsx";
import { DebugLogPage, DeveloperPage } from "./menu-dev.tsx";
import { DIFFICULTY_OPTIONS, OptionRow, type RaceSettings } from "./menu.tsx";
import { OptionsPage, type OptionsTab } from "./menu-options.tsx";
import { unlockAudio } from "./audio/bus.ts";
import { playUi } from "./audio/ui.ts";
import { RoamPage, type MapRect, type MapView } from "./menu-roam.tsx";
import { ScoreBoard } from "./score-board.tsx";
import { loadBoard } from "./scores.ts";
import type { Settings } from "./settings.ts";

export type MenuPage =
  | { page: "root" }
  | { page: "campaign" }
  | { page: "location"; locationId: string }
  | { page: "timetrial" }
  | { page: "scores" }
  | { page: "roam" }
  | { page: "options"; tab: OptionsTab }
  | { page: "developer" }
  | { page: "debuglog" };

/** How a stage was entered — the campaign is what records a clear, and a
 * time trial is a lap you drive for the clock alone. */
export type PlayMode = "campaign" | "timetrial" | "roam";

export type MainMenuProps = {
  page: MenuPage;
  onNavigate: (page: MenuPage) => void;
  progress: CampaignProgress;
  onPlayLevel: (level: CampaignLevel, mode: PlayMode) => void;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  seed: number;
  onSeed: (seed: number) => void;
  onPlayRoam: () => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  /** Let the developer menu out — the chassis secret found (see DEV_TAPS). */
  onDeveloper: () => void;
  onUnlockEverything: () => void;
  /** R30 — the points every location's season has paid out so far. */
  season: Championship;
  /** Tear a location's table up and start its season again. */
  onSeasonReset: (locationId: string) => void;
  /** Where Roam's map pane is, for the renderer to draw the stage into. */
  onMapRect: (rect: MapRect | null) => void;
  /** Roam's handle on the map camera — the pane's drags, wheels and pinches. */
  mapView: MapView;
};

/** The build, bottom right, linking to the exact commit it was cut from.
 * A build with no commit behind it (a working tree, `git` unavailable) says
 * so and links nowhere — a dead link is worse than an honest label. */
function VersionStamp() {
  const label = `v${__APP_VERSION__}`;
  const sha = __COMMIT_SHA__;
  if (!sha || sha === "dev") {
    return <span className="menu-version menu-version-dev">{label} · dev</span>;
  }
  return (
    <a
      className="menu-version"
      href={`${REPO_URL}/commit/${sha}`}
      target="_blank"
      rel="noreferrer noopener"
      title="Open this build's commit on GitHub"
    >
      {label} · {sha}
    </a>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="menu-back" onClick={onClick}>
      ‹ {label}
    </button>
  );
}

/** The padlock on a locked stage box. Drawn rather than lettered so it
 * stays a lock at every box size and in every font the shell falls back to. */
function LockGlyph() {
  return (
    <svg className="menu-lock" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="currentColor" />
    </svg>
  );
}

/** A stage's billing without compiling it: the band's name, the minutes it
 * is sized for, and — on a circuit — the laps it is cut into, which is the
 * one thing about a level a player has to know before pressing it. */
function lengthLabel(level: CampaignLevel): string {
  const laps = levelLaps(level);
  const shape = laps > 1 ? `${laps} LAPS` : level.length.toUpperCase();
  return `${shape} · ${STAGE_RULES.stageLengths[level.length].minutes} MIN`;
}

type LevelBoxProps = {
  level: CampaignLevel;
  index: number;
  unlocked: boolean;
  /** What a locked box asks for — the two pages lock a stage for different
   * reasons, and a padlock with no reason on it is just a wall. */
  hint: string;
  best: number | undefined;
  /** R29 — the best position this stage has ever been finished in at the
   * difficulty currently selected, or undefined if it never has been.
   * Undefined ALSO on the time trial's grid, which races nobody. */
  place: number | undefined;
  onPlay: () => void;
};

/** One stage box. Locked boxes wear a grey border and a padlock, name
 * nothing about the stage behind them and cannot be pressed; open ones wear
 * green and say what they are. */
function LevelBox({ level, index, unlocked, hint, best, place, onPlay }: LevelBoxProps) {
  if (!unlocked) {
    return (
      <div className="menu-level menu-level-locked" aria-label={`Stage ${index + 1}, locked`}>
        <span className="menu-level-no">{index + 1}</span>
        <LockGlyph />
        <span className="menu-level-hint">{hint}</span>
      </div>
    );
  }
  return (
    <button type="button" className="menu-level menu-level-open" onClick={onPlay}>
      <span className="menu-level-no">{index + 1}</span>
      <span className="menu-level-name">{level.name}</span>
      <span className="menu-level-meta">{lengthLabel(level)}</span>
      <span className="menu-level-blurb">{level.blurb}</span>
      {/* Two bests, and the RESULT is the one that matters: a stage is
          cleared by beating the field, not by beating the clock. The time
          rides underneath it as the thing to chase once it is. */}
      {place !== undefined && (
        <span
          className={`menu-level-place ${place <= PODIUM ? "menu-level-place-podium" : ""}`}
          title={`Best finish: ${place} of ${FIELD_SIZE}`}
        >
          BEST {ordinal(place)}
        </span>
      )}
      {best !== undefined && <span className="menu-level-best">BEST {formatTime(best)}</span>}
    </button>
  );
}

/** The same grid serves both pages, so which stages it opens is passed in
 * rather than assumed: the campaign opens the next stage up the ladder, the
 * time trial only stages already driven to the end. */
function LevelGrid({
  location,
  progress,
  open,
  hint,
  difficulty,
  onPlay,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  open: (level: CampaignLevel, index: number) => boolean;
  hint: string;
  /** Which field's results to show on the boxes. Absent on the time trial's
   * grid, where there is no field and a placing would be a fiction. */
  difficulty?: Difficulty;
  onPlay: (level: CampaignLevel, index: number) => void;
}) {
  return (
    <div className="menu-grid">
      {location.levels.map((level, index) => (
        <LevelBox
          key={level.id}
          level={level}
          index={index}
          unlocked={open(level, index)}
          hint={hint}
          best={progress.best[level.id]}
          place={difficulty === undefined ? undefined : bestPlace(progress, level.id, difficulty)}
          onPlay={() => onPlay(level, index)}
        />
      ))}
    </div>
  );
}

/** The car, on every page that starts a stage. The campaign's conditions
 * are authored into each level, but the car is always the player's call.
 * The chassis is also where the developer menu is hidden. */
function CarRow({
  race,
  onRace,
  onDeveloper,
}: {
  race: RaceSettings;
  onRace: (r: RaceSettings) => void;
  onDeveloper: () => void;
}) {
  return (
    <div className="menu-row">
      <span className="menu-label">CAR</span>
      <CarPicker
        carId={race.carId}
        onPick={(carId) => onRace({ ...race, carId })}
        onDeveloper={onDeveloper}
      />
    </div>
  );
}

function RootPage({
  developer,
  onNavigate,
}: {
  developer: boolean;
  onNavigate: (page: MenuPage) => void;
}) {
  return (
    <div className="menu-card menu-card-root">
      <div className="menu-brand">
        <span className="menu-brand-name">{APP_NAME.toUpperCase()}</span>
        <span className="menu-brand-tag">arcade rally drifting</span>
      </div>
      <div className="menu-items">
        <button
          type="button"
          className="menu-item"
          onClick={() => onNavigate({ page: "campaign" })}
        >
          CAMPAIGN
          <span className="menu-item-sub">Work through a location, stage by stage</span>
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => onNavigate({ page: "timetrial" })}
        >
          TIME TRIAL
          <span className="menu-item-sub">Chase the clock on stages you have finished</span>
        </button>
        <button type="button" className="menu-item" onClick={() => onNavigate({ page: "roam" })}>
          ROAM
          <span className="menu-item-sub">Any seed, any length — drive whatever it builds</span>
        </button>
        <button
          type="button"
          className="menu-item menu-item-quiet"
          onClick={() => onNavigate({ page: "options", tab: "hud" })}
        >
          OPTIONS
          <span className="menu-item-sub">HUD, video and controls</span>
        </button>
        {developer && (
          <button
            type="button"
            className="menu-item menu-item-dev"
            onClick={() => onNavigate({ page: "developer" })}
          >
            DEVELOPER
            <span className="menu-item-sub">Tools for testing the game</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CampaignPage({
  progress,
  season,
  onNavigate,
}: {
  progress: CampaignProgress;
  season: Championship;
  onNavigate: (page: MenuPage) => void;
}) {
  return (
    <div className="menu-card">
      <BackButton label="MAIN MENU" onClick={() => onNavigate({ page: "root" })} />
      <div className="menu-title">CAMPAIGN</div>
      <div className="menu-sub">Pick a location</div>
      <div className="menu-locations">
        {LOCATIONS.map((location, index) => {
          const cleared = location.levels.filter((l) => progress.cleared.includes(l.id)).length;
          const mine = playerStanding(location, season);
          // R30 — a country is opened by the PREVIOUS country's championship,
          // not by its stages: a player who podiumed their way through Taiga
          // has seen all of it and still has a table to win.
          if (!locationUnlocked(location, season)) {
            const before = LOCATIONS[index - 1];
            return (
              <div
                key={location.id}
                className="menu-location menu-location-locked menu-level-locked"
                aria-label={`${location.name}, locked`}
              >
                <span className="menu-location-name">{location.name.toUpperCase()}</span>
                <LockGlyph />
                <span className="menu-location-blurb">Win the {before.name} championship</span>
              </div>
            );
          }
          return (
            <button
              key={location.id}
              type="button"
              className="menu-location"
              onClick={() => onNavigate({ page: "location", locationId: location.id })}
            >
              <span className="menu-location-name">{location.name.toUpperCase()}</span>
              <span className="menu-location-blurb">{location.blurb}</span>
              <span className="menu-location-progress">
                {cleared} / {location.levels.length} STAGES
                {championshipWon(location, season)
                  ? " · CHAMPION"
                  : mine.points > 0
                    ? ` · ${mine.points} PTS, ${mine.tied ? "=" : ""}${ordinal(mine.place)}`
                    : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** R30 — THE SEASON PANEL. The location's table is the thing the player is
 * actually playing for once the stages are open, so it sits on the location
 * page with the three presses it is worth: pick the season back up, read the
 * whole table, or tear it up and start again.
 *
 * CONTINUE walks FORWARD first — the next stage never driven — and only then
 * back to the first stage not yet WON. That is the shape of a points
 * championship: see the country, then go back for the wins it costs to leave
 * it. */
function SeasonPanel({
  location,
  progress,
  season,
  onPlayLevel,
  onReset,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  season: Championship;
  onPlayLevel: (level: CampaignLevel, mode: PlayMode) => void;
  onReset: (locationId: string) => void;
}) {
  const [table, setTable] = useState(false);
  // A reset costs a whole season and cannot be undone, so it asks once. The
  // question expires with the page rather than sitting armed forever.
  const [sure, setSure] = useState(false);
  const rows = standings(location, season);
  const mine = playerStanding(location, season);
  const next = seasonContinue(location, progress, season);
  const won = championshipWon(location, season);
  const run = location.levels.filter((level) => season[location.id]?.[level.id]).length;
  return (
    <div className="menu-season">
      <div className="menu-season-line">
        <span className="menu-label">CHAMPIONSHIP</span>
        <span className={`menu-season-place ${won ? "menu-season-won" : ""}`}>
          {won
            ? "WON"
            : run === 0
              ? // A place on a table nobody has scored on is not a place.
                "NOT STARTED"
              : `${mine.tied ? "=" : ""}${ordinal(mine.place)} OF ${rows.length}`}
        </span>
        {run > 0 && <span className="menu-season-points">{mine.points} PTS</span>}
        <span className="menu-season-run">
          {run} / {location.levels.length} STAGES DRIVEN
        </span>
      </div>
      {!won && (
        <div className="menu-season-hint">
          {seasonComplete(location, season)
            ? "TOP THE TABLE TO OPEN THE NEXT COUNTRY"
            : "3 · 2 · 1 POINTS FOR THE PODIUM — DRIVE THEM ALL, THEN WIN THEM"}
        </div>
      )}
      <div className="menu-season-acts">
        {next && (
          <button
            type="button"
            className="menu-opt menu-season-go"
            onClick={() => {
              playUi("start");
              onPlayLevel(next, "campaign");
            }}
          >
            CONTINUE: {next.name.toUpperCase()}
          </button>
        )}
        <button
          type="button"
          className="menu-opt"
          onClick={() => {
            playUi("select");
            setTable(true);
          }}
        >
          STANDINGS
        </button>
        {mine.points > 0 && (
          <button
            type="button"
            className="menu-opt"
            onClick={() => {
              playUi("select");
              if (!sure) {
                setSure(true);
                return;
              }
              setSure(false);
              onReset(location.id);
            }}
          >
            {sure ? "SURE? RESET" : "RESET SEASON"}
          </button>
        )}
      </div>
      {table && (
        <ResultsModal
          title={`${location.name.toUpperCase()} CHAMPIONSHIP`}
          sub={`${run} of ${location.levels.length} stages driven`}
          rows={rows.map((row) => ({
            place: row.place,
            name: row.alias,
            total: row.points,
            you: row.you,
          }))}
          stage={false}
          onClose={() => setTable(false)}
        />
      )}
    </div>
  );
}

function LocationPage({
  locationId,
  progress,
  season,
  race,
  onRace,
  onNavigate,
  onPlayLevel,
  onSeasonReset,
  onDeveloper,
}: {
  locationId: string;
  progress: CampaignProgress;
  season: Championship;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  onNavigate: (page: MenuPage) => void;
  onPlayLevel: (level: CampaignLevel, mode: PlayMode) => void;
  onSeasonReset: (locationId: string) => void;
  onDeveloper: () => void;
}) {
  const location = locationById(locationId);
  return (
    <div className="menu-card menu-card-wide">
      <BackButton label="CAMPAIGN" onClick={() => onNavigate({ page: "campaign" })} />
      <div className="menu-title">{location.name.toUpperCase()}</div>
      <div className="menu-sub">{location.blurb}</div>
      <LevelGrid
        location={location}
        progress={progress}
        open={(_level, index) => levelUnlocked(location, index, progress)}
        hint="Podium on the stage before this one"
        difficulty={race.difficulty}
        onPlay={(level) => onPlayLevel(level, "campaign")}
      />
      <SeasonPanel
        location={location}
        progress={progress}
        season={season}
        onPlayLevel={onPlayLevel}
        onReset={onSeasonReset}
      />
      {/* R29 — how good the fourteen crews you are running against are. It
          sits with the car because it is the same kind of choice: the two
          things the player brings to an authored stage. */}
      <OptionRow
        label="RIVALS"
        options={DIFFICULTY_OPTIONS}
        value={race.difficulty}
        onPick={(difficulty) => onRace({ ...race, difficulty })}
      />
      <CarRow race={race} onRace={onRace} onDeveloper={onDeveloper} />
    </div>
  );
}

function TimeTrialPage({
  progress,
  race,
  onRace,
  onNavigate,
  onPlayLevel,
  onDeveloper,
}: {
  progress: CampaignProgress;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  onNavigate: (page: MenuPage) => void;
  onPlayLevel: (level: CampaignLevel, mode: PlayMode) => void;
  onDeveloper: () => void;
}) {
  return (
    <div className="menu-card menu-card-wide">
      <BackButton label="MAIN MENU" onClick={() => onNavigate({ page: "root" })} />
      <div className="menu-title">TIME TRIAL</div>
      <div className="menu-sub">Finish a stage in the campaign to run it here</div>
      {LOCATIONS.map((location) => (
        <div key={location.id} className="menu-section">
          <div className="menu-section-title">{location.name.toUpperCase()}</div>
          <LevelGrid
            location={location}
            progress={progress}
            open={(level) => levelCompleted(level, progress)}
            hint="Finish this stage in the campaign"
            onPlay={(level) => onPlayLevel(level, "timetrial")}
          />
        </div>
      ))}
      <button type="button" className="menu-item" onClick={() => onNavigate({ page: "scores" })}>
        HIGH SCORES
        <span className="menu-item-sub">The ten best times on every stage you have finished</span>
      </button>
      <CarRow race={race} onRace={onRace} onDeveloper={onDeveloper} />
    </div>
  );
}

/** THE HIGH SCORES — every stage the player has driven to the end, with its
 * ten best times. A stage nobody has finished has no board to read yet and is
 * left off entirely: ten dotted rows under a name you have never seen is a
 * wall, where the same ten rows under a stage you know is an invitation. */
function ScoresPage({
  progress,
  onNavigate,
}: {
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  const open = LOCATIONS.flatMap((location) =>
    location.levels
      .filter((level) => levelCompleted(level, progress))
      .map((level) => ({ location, level })),
  );
  return (
    <div className="menu-card menu-card-wide">
      <BackButton label="TIME TRIAL" onClick={() => onNavigate({ page: "timetrial" })} />
      <div className="menu-title">HIGH SCORES</div>
      <div className="menu-sub">The ten best times on every stage you have finished</div>
      {open.length === 0 ? (
        <div className="menu-empty">Drive a stage to the end in the campaign first.</div>
      ) : (
        <div className="score-stages">
          {open.map(({ location, level }) => (
            <div key={level.id} className="score-stage">
              <div className="score-stage-name">{level.name.toUpperCase()}</div>
              <div className="score-stage-where">{location.name}</div>
              <ScoreBoard entries={loadBoard(level.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** How deep in the menu each page sits, so a navigation can tell whether it
 * is going IN or coming BACK — the two make different noises, and a menu
 * where they do not is a menu that gives no feedback about where you are. */
const DEPTH: Record<MenuPage["page"], number> = {
  root: 0,
  campaign: 1,
  timetrial: 1,
  roam: 1,
  options: 1,
  developer: 1,
  location: 2,
  debuglog: 2,
  scores: 2,
};

/** Where BACK goes from a page — the same step that page's own back button
 * takes, so the button and the key can never disagree. Null on the root,
 * which has nowhere further out to go. */
function parentOf(page: MenuPage): MenuPage | null {
  if (page.page === "root") return null;
  if (page.page === "location") return { page: "campaign" };
  if (page.page === "scores") return { page: "timetrial" };
  return { page: "root" };
}

export function MainMenu(props: MainMenuProps) {
  const { page, onNavigate } = props;
  /** Every navigation in the menu passes through here, so the interface's
   * sounds are wired in ONE place rather than on forty buttons. */
  const navigate = (next: MenuPage): void => {
    if (next.page === page.page && next.page === "options") playUi("page");
    else if (DEPTH[next.page] < DEPTH[page.page]) playUi("back");
    else playUi("select");
    onNavigate(next);
  };
  /** The cursor arriving on a row. Delegated rather than hung off each
   * button: the pages are plain markup, and forty `onPointerEnter`s is forty
   * chances to forget one. Rate-limited inside `playUi`, so a pointer dragged
   * across the card is a run of ticks rather than a buzz. */
  const hovered = useRef<Element | null>(null);
  const onPointerOver = (e: { target: EventTarget | null }): void => {
    const row = (e.target as HTMLElement | null)?.closest("button:not([disabled])") ?? null;
    if (!row || row === hovered.current) return;
    hovered.current = row;
    playUi("move");
  };
  /** A real gesture anywhere in the menu. Two jobs: it is the moment a browser
   * will let audio start, and it is where a press on a stage that is not open
   * yet is caught — a locked box is a `div` rather than a button, because
   * there is nothing to press. */
  const onPointerDown = (e: { target: EventTarget | null }): void => {
    unlockAudio();
    if ((e.target as HTMLElement | null)?.closest(".menu-level-locked")) playUi("deny");
  };
  /** ESCAPE — whatever the player has bound PAUSE to — steps back out of a
   * page. In a run that key opens the pause card; in the menu there is no
   * run to pause, so it is the way out, and a menu that can only be left
   * with the mouse is a menu ignoring the keyboard it just described.
   *
   * Held in a ref and hung off ONE listener: the handler has to see the
   * page the menu is on right now, and re-subscribing a window listener on
   * every render of the menu is a listener leak waiting to happen. The
   * rebind rows in OPTIONS listen in the CAPTURE phase and stop the event
   * there, so arming a binding and pressing Escape cancels the binding
   * rather than also walking out of the page. */
  const onEscape = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onEscape.current = (e) => {
    if (!props.settings.keys.pause.includes(e.code)) return;
    const back = parentOf(page);
    if (!back) return;
    e.preventDefault();
    navigate(back);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => onEscape.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Roam is the one page that is not a card over a backdrop — the map IS
  // the page — so it paints its own scrim and skips the shared one.
  const roam = page.page === "roam";
  return (
    <div
      className={`menu ${roam ? "menu-open" : ""} pointer-events-auto`}
      onPointerOver={onPointerOver}
      onPointerDown={onPointerDown}
    >
      <div className="menu-scrim" aria-hidden="true" />
      <div className="menu-body">
        {page.page === "root" && (
          <RootPage developer={props.settings.developer} onNavigate={navigate} />
        )}
        {page.page === "campaign" && (
          <CampaignPage progress={props.progress} season={props.season} onNavigate={navigate} />
        )}
        {page.page === "location" && (
          <LocationPage
            locationId={page.locationId}
            progress={props.progress}
            season={props.season}
            race={props.race}
            onRace={props.onRace}
            onNavigate={navigate}
            onPlayLevel={props.onPlayLevel}
            onSeasonReset={props.onSeasonReset}
            onDeveloper={props.onDeveloper}
          />
        )}
        {page.page === "timetrial" && (
          <TimeTrialPage
            progress={props.progress}
            race={props.race}
            onRace={props.onRace}
            onNavigate={navigate}
            onPlayLevel={props.onPlayLevel}
            onDeveloper={props.onDeveloper}
          />
        )}
        {page.page === "scores" && <ScoresPage progress={props.progress} onNavigate={navigate} />}
        {roam && (
          <RoamPage
            race={props.race}
            onRace={props.onRace}
            seed={props.seed}
            onSeed={props.onSeed}
            onStart={props.onPlayRoam}
            onBack={() => navigate({ page: "root" })}
            onDeveloper={props.onDeveloper}
            onMapRect={props.onMapRect}
            mapView={props.mapView}
          />
        )}
        {page.page === "developer" && (
          <DeveloperPage
            progress={props.progress}
            dev={props.settings.dev}
            onDev={(dev) => props.onSettings({ ...props.settings, dev })}
            onUnlockEverything={props.onUnlockEverything}
            onBack={() => navigate({ page: "root" })}
            onDebugLog={() => navigate({ page: "debuglog" })}
          />
        )}
        {page.page === "debuglog" && (
          <DebugLogPage onBack={() => navigate({ page: "developer" })} />
        )}
        {page.page === "options" && (
          <OptionsPage
            tab={page.tab}
            onTab={(tab) => navigate({ page: "options", tab })}
            settings={props.settings}
            onSettings={props.onSettings}
            onBack={() => navigate({ page: "root" })}
          />
        )}
      </div>
      {page.page === "root" && <VersionStamp />}
    </div>
  );
}
