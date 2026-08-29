// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main menu — the surface the game launches into, painted over a live
// bot-driven stage seen from a drone. Everything the player can reach
// before a run starts hangs off here:
//
//   Campaign   → a location (Taiga) → its stages, each unlocked by the one
//                before it → the car (menu-car).
//   Time trial → the same stages, behind a stricter gate: a stage opens
//                here once it has been FINISHED, because a time is something
//                you chase on a road you have already driven to the end.
//                Then the same car card.
//   Roam       → any seed at all, previewed as the map itself (menu-roam).
//   Options    → HUD, video and controls (menu-options).
//
// Picking a stage does not start it: both grids hand off to the pre-race
// card, which is where the car and the gearbox are chosen and where START
// is. A road and a car are two decisions, and asking for both on one screen
// is what buried the car picker under six stage boxes.
//
// The pages are a plain tagged union rather than a router: there is no URL
// to keep in step, and the whole menu is one component tree over one canvas.

import { useEffect, useRef, useState } from "react";

import { APP_NAME, REPO_URL } from "../identity.ts";
import { ordinal } from "../lib/util.ts";
import {
  LOCATIONS,
  continueAt,
  findLevel,
  levelCleared,
  levelCompleted,
  levelUnlocked,
  locationById,
  locationComplete,
  locationStandings,
  locationUnlocked,
  locationWon,
  playerStanding,
  stagesDriven,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { LevelGrid, LockGlyph, lengthLabel } from "./menu-levels.tsx";
import { ResultsModal } from "./results-table.tsx";
import { CarSetupPage } from "./menu-car.tsx";
import { GalleryPage } from "./menu-gallery.tsx";
import { DebugLogPage, DeveloperPage } from "./menu-dev.tsx";
import { HeadsUpPage } from "./menu-headsup.tsx";
import {
  DIFFICULTY_OPTIONS,
  MenuHead,
  OptionRow,
  gridSize,
  type PlayMode,
  type RaceSettings,
} from "./menu.tsx";
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
  | { page: "headsup" }
  /** The pre-race card for one stage — the car, its spec sheet, the
   * gearbox and START. `mode` is how the stage will be entered, and it is
   * what decides which grid BACK returns to. */
  | { page: "car"; levelId: string; mode: PlayMode }
  | { page: "scores" }
  | { page: "gallery" }
  | { page: "roam" }
  | { page: "options"; tab: OptionsTab }
  | { page: "developer" }
  | { page: "debuglog" };

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
  /** Tear a location's table up and drive it again. */
  onResetPoints: (locationId: string) => void;
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
        <button type="button" className="menu-item" onClick={() => onNavigate({ page: "headsup" })}>
          HEADS UP
          <span className="menu-item-sub">
            One race against the field, for nothing but the race
          </span>
        </button>
        <button type="button" className="menu-item" onClick={() => onNavigate({ page: "roam" })}>
          ROAM
          <span className="menu-item-sub">Any seed, any length — drive whatever it builds</span>
        </button>
        <button
          type="button"
          className="menu-item menu-item-quiet"
          onClick={() => onNavigate({ page: "gallery" })}
        >
          GALLERY
          <span className="menu-item-sub">The pictures you took, to look at and send on</span>
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
  onNavigate,
}: {
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  return (
    <div className="menu-card">
      <MenuHead
        back={() => onNavigate({ page: "root" })}
        backLabel="MAIN MENU"
        title="CAMPAIGN"
        sub="Pick a location"
      />
      <div className="menu-locations">
        {LOCATIONS.map((location, index) => {
          const cleared = location.levels.filter((l) => levelCleared(progress, l.id)).length;
          const mine = playerStanding(location, progress);
          // R30 — a country is opened by the PREVIOUS country's TABLE, not by
          // its stages: a player who podiumed their way through Taiga has seen
          // all of it and still has a table to top.
          if (!locationUnlocked(location, progress)) {
            const before = LOCATIONS[index - 1];
            return (
              <div
                key={location.id}
                className="menu-location menu-location-locked menu-level-locked"
                aria-label={`${location.name}, locked`}
              >
                <span className="menu-location-name">{location.name.toUpperCase()}</span>
                <LockGlyph />
                <span className="menu-location-blurb">Top the {before.name} table</span>
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
                {locationWon(location, progress)
                  ? " · WON"
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

/** R30 — THE STANDINGS PANEL. The location's table is what the stage boxes
 * above it are being driven FOR — the same points open the next box and the
 * next country — so it sits on the location page with the three presses it is
 * worth: pick the campaign back up, read the whole table, or tear it up and
 * drive it again. CONTINUE goes to the same pre-race card the grid does — it
 * names the stage, and the car is still a decision.
 *
 * CONTINUE walks FORWARD first — the next stage never driven — and only then
 * back to the first stage not yet WON. That is the shape of a points
 * campaign: see the country, then go back for the wins it costs to leave
 * it. */
function StandingsPanel({
  location,
  progress,
  onPick,
  onReset,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  onPick: (level: CampaignLevel) => void;
  onReset: (locationId: string) => void;
}) {
  const [table, setTable] = useState(false);
  // A reset costs every point in the location and cannot be undone, so it asks
  // once. The question expires with the page rather than sitting armed forever.
  const [sure, setSure] = useState(false);
  const rows = locationStandings(location, progress);
  const mine = playerStanding(location, progress);
  const next = continueAt(location, progress);
  const won = locationWon(location, progress);
  const run = stagesDriven(location, progress);
  return (
    <div className="menu-standings">
      <div className="menu-standings-line">
        <span className="menu-label">STANDINGS</span>
        <span className={`menu-standings-place ${won ? "menu-standings-won" : ""}`}>
          {won
            ? "WON"
            : run === 0
              ? // A place on a table nobody has scored on is not a place.
                "NOT STARTED"
              : `${mine.tied ? "=" : ""}${ordinal(mine.place)} OF ${rows.length}`}
        </span>
        {run > 0 && <span className="menu-standings-points">{mine.points} PTS</span>}
        <span className="menu-standings-run">
          {run} / {location.levels.length} STAGES DRIVEN
        </span>
      </div>
      {!won && (
        <div className="menu-standings-hint">
          {locationComplete(location, progress)
            ? "TOP THE TABLE TO OPEN THE NEXT COUNTRY"
            : "3 · 2 · 1 POINTS FOR THE PODIUM — DRIVE THEM ALL, THEN WIN THEM"}
        </div>
      )}
      <div className="menu-standings-acts">
        {next && (
          <button type="button" className="menu-opt menu-standings-go" onClick={() => onPick(next)}>
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
          FULL TABLE
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
            {sure ? "SURE? THE POINTS GO" : "RESET LOCATION"}
          </button>
        )}
      </div>
      {table && (
        <ResultsModal
          title={`${location.name.toUpperCase()} STANDINGS`}
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
  race,
  onRace,
  onNavigate,
  onResetPoints,
}: {
  locationId: string;
  progress: CampaignProgress;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  onNavigate: (page: MenuPage) => void;
  onResetPoints: (locationId: string) => void;
}) {
  const location = locationById(locationId);
  const pick = (level: CampaignLevel): void =>
    onNavigate({ page: "car", levelId: level.id, mode: "campaign" });
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={() => onNavigate({ page: "campaign" })}
        backLabel="CAMPAIGN"
        title={location.name.toUpperCase()}
        sub={location.blurb}
      />
      <LevelGrid
        location={location}
        progress={progress}
        open={(_level, index) => levelUnlocked(location, index, progress)}
        hint="Podium on the stage before this one"
        difficulty={race.difficulty}
        onPlay={pick}
      />
      <StandingsPanel
        location={location}
        progress={progress}
        onPick={pick}
        onReset={onResetPoints}
      />
      {/* R29 — how good the fourteen crews you are running against are. It
          stays on the GRID rather than moving to the pre-race card with the
          car, because it is what the boxes' best-result lines are measured
          against: change it here and the whole ladder is re-read at once. */}
      <OptionRow
        label="RIVALS"
        options={DIFFICULTY_OPTIONS}
        value={race.difficulty}
        onPick={(difficulty) => onRace({ ...race, difficulty })}
      />
    </div>
  );
}

function TimeTrialPage({
  progress,
  onNavigate,
}: {
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={() => onNavigate({ page: "root" })}
        backLabel="MAIN MENU"
        title="TIME TRIAL"
        sub="Finish a stage in the campaign to run it here"
      />
      {LOCATIONS.map((location) => (
        <div key={location.id} className="menu-section">
          <div className="menu-section-title">{location.name.toUpperCase()}</div>
          <LevelGrid
            location={location}
            progress={progress}
            open={(level) => levelCompleted(level, progress)}
            hint="Finish this stage in the campaign"
            onPlay={(level) => onNavigate({ page: "car", levelId: level.id, mode: "timetrial" })}
          />
        </div>
      ))}
      <button type="button" className="menu-item" onClick={() => onNavigate({ page: "scores" })}>
        HIGH SCORES
        <span className="menu-item-sub">The ten best times on every stage you have finished</span>
      </button>
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
      <MenuHead
        back={() => onNavigate({ page: "timetrial" })}
        backLabel="TIME TRIAL"
        title="HIGH SCORES"
        sub="The ten best times on every stage you have finished"
      />
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
  headsup: 1,
  roam: 1,
  gallery: 1,
  options: 1,
  developer: 1,
  location: 2,
  debuglog: 2,
  scores: 2,
  // Deeper than either grid that reaches it, so arriving at the pre-race
  // card sounds like going IN from both of them.
  car: 3,
};

/** Where BACK goes from a page — the same step that page's own back button
 * takes, so the button and the key can never disagree. Null on the root,
 * which has nowhere further out to go. */
function parentOf(page: MenuPage): MenuPage | null {
  if (page.page === "root") return null;
  if (page.page === "location") return { page: "campaign" };
  if (page.page === "scores") return { page: "timetrial" };
  if (page.page === "car") return carParent(page.levelId, page.mode);
  return { page: "root" };
}

/** The grid the pre-race card was reached from. A campaign stage goes back
 * to its own location's ladder; a time trial goes back to the one page that
 * lists every stage. A level id with no location behind it cannot happen
 * from the grids, but a stale one out of a reload should land somewhere
 * real rather than on a blank card. */
function carParent(levelId: string, mode: PlayMode): MenuPage {
  if (mode === "timetrial") return { page: "timetrial" };
  if (mode === "headsup") return { page: "headsup" };
  const found = findLevel(levelId);
  return found ? { page: "location", locationId: found.location.id } : { page: "campaign" };
}

export function MainMenu(props: MainMenuProps) {
  const { onNavigate } = props;
  // The stage the pre-race card is for. A card whose level id is not in the
  // catalog (a build that dropped a stage, under a page state that still
  // names it) shows the grid it came from rather than an empty card — a
  // substitution rather than a navigation, because a render is not the
  // place to change what page the app thinks it is on.
  const found = props.page.page === "car" ? findLevel(props.page.levelId) : null;
  const page =
    props.page.page === "car" && found === null
      ? carParent(props.page.levelId, props.page.mode)
      : props.page;
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
          <CampaignPage progress={props.progress} onNavigate={navigate} />
        )}
        {page.page === "location" && (
          <LocationPage
            locationId={page.locationId}
            progress={props.progress}
            race={props.race}
            onRace={props.onRace}
            onNavigate={navigate}
            onResetPoints={props.onResetPoints}
          />
        )}
        {page.page === "timetrial" && (
          <TimeTrialPage progress={props.progress} onNavigate={navigate} />
        )}
        {page.page === "headsup" && (
          <HeadsUpPage
            progress={props.progress}
            headsUp={props.race.headsUp}
            onHeadsUp={(headsUp) =>
              props.onRace({ ...props.race, headsUp: { ...headsUp, cars: gridSize(headsUp.cars) } })
            }
            onBack={() => navigate({ page: "root" })}
            onPlay={(level) => navigate({ page: "car", levelId: level.id, mode: "headsup" })}
          />
        )}
        {page.page === "car" && found !== null && (
          <CarSetupPage
            location={found.location}
            level={found.level}
            mode={page.mode}
            billing={lengthLabel(found.level)}
            progress={props.progress}
            race={props.race}
            onRace={props.onRace}
            settings={props.settings}
            onSettings={props.onSettings}
            onBack={() => navigate(carParent(page.levelId, page.mode))}
            onStart={() => props.onPlayLevel(found.level, page.mode)}
            onDeveloper={props.onDeveloper}
          />
        )}
        {page.page === "scores" && <ScoresPage progress={props.progress} onNavigate={navigate} />}
        {page.page === "gallery" && (
          <GalleryPage settings={props.settings} onBack={() => navigate({ page: "root" })} />
        )}
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
