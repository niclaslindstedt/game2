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
//   Options    → the dozen knobs, and the keyboard's and the controller's
//                bindings behind two of them (menu-options).
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
  latestOpen,
  levelCleared,
  levelCompleted,
  levelForRoad,
  levelUnlocked,
  locationById,
  locationComplete,
  locationStandings,
  locationUnlocked,
  locationWon,
  playerStanding,
  stagesDriven,
  stagesTimed,
  timeTrialOpen,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { LevelGrid, LocationList } from "./menu-levels.tsx";
import { StandingsModal, warmStandings, type StandingsRow } from "./results-table.tsx";
import { CarSetupPage } from "./menu-car.tsx";
import { GalleryPage } from "./menu-gallery.tsx";
import { TRAINING_ID, TRAINING_LEVEL, TRAINING_LOCATION, isTraining } from "./training.ts";
import { DebugLogPage, DeveloperPage } from "./menu-dev.tsx";
import { HeadsUpPage } from "./menu-headsup.tsx";
import { DifficultyPicker, MenuHead, gridSize, type PlayMode, type RaceSettings } from "./menu.tsx";
import { OptionsPage, type OptionsSub } from "./menu-options.tsx";
import { unlockAudio } from "./audio/bus.ts";
import { playUi } from "./audio/ui.ts";
import { MapViewerPage, type MapDebug } from "./menu-map-viewer.tsx";
import { RoamPage } from "./menu-roam.tsx";
import type { MapRect, MapView } from "./map-pane.tsx";
import type { Settings } from "./settings.ts";

export type MenuPage =
  | { page: "root" }
  | { page: "campaign" }
  | { page: "location"; locationId: string }
  /** The time trial and heads up — and, with `locationId` set, the country's
   * own six stages. A step of the page rather than a page of its own, the
   * way the campaign's location is: the country is chosen first on all
   * three, because a page carrying every country's grid at once is a page
   * where the stage you want is below the fold. */
  | { page: "timetrial"; locationId?: string }
  | { page: "headsup"; locationId?: string }
  /** The pre-race card for one stage — the car, its spec sheet, the
   * gearbox and START. `mode` is how the stage will be entered, and it is
   * what decides which grid BACK returns to. */
  | { page: "car"; levelId: string; mode: PlayMode }
  | { page: "gallery" }
  /** Roam — and, with `viewing` set, the developer's MAP VIEWER.
   *
   * ONE page state rather than two because the backdrop is the same in
   * both: the engine is held under the map camera on this state and on no
   * other, and the pane's rectangle, the map's framing and the stage
   * standing under it belong to whichever of the two is up. What is DRAWN
   * is two different components — menu-roam.tsx and menu-map-viewer.tsx —
   * because they are two different questions: Roam is a stage you are
   * choosing in order to drive it, and the viewer is a stage you are
   * reading.
   *
   * `picking` is set while the STAGE LIST is up, on either; `car` is set
   * on the pre-race card Roam hands off to. Both are steps of the page
   * rather than pages of their own, so BACK walks them in the order the
   * presses came in. */
  | { page: "roam"; picking?: boolean; viewing?: boolean; car?: boolean }
  /** Options — and, with `sub` set, one of the binding pages behind its
   * CONTROLS rows. A step of the page rather than a page of its own, the
   * way Roam's stage list is: BACK from it lands on the rows. */
  | { page: "options"; sub?: OptionsSub }
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
  /** The developer's map tools on Roam — the generator's layers, the
   * full-screen pane and the debug box. Null for everybody else. */
  mapDebug: MapDebug | null;
  /** Load one of the CAMPAIGN's own stages into Roam's settings — its seed,
   * its band, its shape and the conditions it is authored in — so it can be
   * looked at on the map and then driven. */
  onRoamLevel: (level: CampaignLevel) => void;
  /** Leave the menu for the developer's stopwatch — a fixed piece of racing,
   * drawn as fast as the machine will draw it (game/benchmark.ts). */
  onBenchmark: () => void;
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

/** Where the CAMPAIGN tile lands. A page listing ONE country is a press
 * that asks nothing — so while there is only one, the tile opens it and the
 * list is skipped. The rule is read off the catalog rather than hardcoded:
 * the day a second country ships, the list comes back on its own, and
 * `parentOf` reads the same rule so BACK never lands on the skipped page. */
function campaignEntry(): MenuPage {
  return LOCATIONS.length === 1
    ? { page: "location", locationId: LOCATIONS[0].id }
    : { page: "campaign" };
}

/** The front door's own way ON: the tile a player who pressed START at the
 * studio card meant to press. CAMPAIGN is the game — the other five are
 * ways of driving stages the campaign opens, or of setting the game up to
 * be driven. */
const ROOT_NEXT = "campaign";

/** THE FRONT DOOR, as six marks. Every row used to carry a sentence saying
 * what the mode was, which is a menu explaining itself: six explanations is
 * a card that fills a phone, and none of them survives the second visit. A
 * glyph and a name is the whole entry — what CAMPAIGN is, is learned by
 * pressing it once.
 *
 * `data-menu` is the stable hook the capture harness presses; the label is
 * free to change without a probe changing with it. */
const ROOT_ITEMS: {
  key: string;
  glyph: GlyphName;
  label: string;
  page: MenuPage;
  quiet?: boolean;
}[] = [
  { key: "campaign", glyph: "trophy", label: "CAMPAIGN", page: campaignEntry() },
  { key: "timetrial", glyph: "stopwatch", label: "TIME TRIAL", page: { page: "timetrial" } },
  { key: "headsup", glyph: "headsup", label: "HEADS UP", page: { page: "headsup" } },
  { key: "roam", glyph: "roam", label: "ROAM", page: { page: "roam" } },
  {
    key: "training",
    glyph: "cone",
    label: "TRAINING",
    page: { page: "car", levelId: TRAINING_ID, mode: "training" },
  },
  { key: "gallery", glyph: "camera", label: "GALLERY", page: { page: "gallery" }, quiet: true },
  {
    key: "options",
    glyph: "sliders",
    label: "OPTIONS",
    page: { page: "options" },
    quiet: true,
  },
];

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
      <div className="menu-tiles">
        {ROOT_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`menu-tile ${item.quiet ? "menu-tile-quiet" : ""}`}
            data-menu={item.key}
            data-nav-next={item.key === ROOT_NEXT ? "" : undefined}
            onClick={() => onNavigate(item.page)}
          >
            <Glyph name={item.glyph} />
            <span className="menu-tile-name">{item.label}</span>
          </button>
        ))}
        {developer && (
          <button
            type="button"
            className="menu-tile menu-tile-dev"
            data-menu="developer"
            onClick={() => onNavigate({ page: "developer" })}
          >
            <Glyph name="terminal" />
            <span className="menu-tile-name">DEVELOPER</span>
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
  // The FURTHEST country open, which is the one a player coming back is
  // playing. It is where the cursor stands and what START takes.
  const resume = LOCATIONS.filter((location) => locationUnlocked(location, progress)).at(-1);
  return (
    <div className="menu-card">
      <MenuHead back={() => onNavigate({ page: "root" })} backLabel="MENU" title="CAMPAIGN" />
      <LocationList
        open={(location) => locationUnlocked(location, progress)}
        // R30 — a country is opened by the PREVIOUS country's TABLE, not by
        // its stages: a player who podiumed their way through Taiga has seen
        // all of it and still has a table to top. That rule is the one thing
        // here a padlock cannot say on its own, so it stays written.
        hint={(_location, index) => `Top the ${LOCATIONS[index - 1].name} table`}
        line={(location) => {
          const cleared = location.levels.filter((l) => levelCleared(progress, l.id)).length;
          const mine = playerStanding(location, progress);
          return (
            <span
              className="menu-location-progress"
              title={`${cleared} of ${location.levels.length} stages cleared`}
            >
              {cleared} / {location.levels.length}
              {locationWon(location, progress)
                ? " · WON"
                : mine.points > 0
                  ? ` · ${mine.points} PTS · ${mine.tied ? "=" : ""}${ordinal(mine.place)}`
                  : ""}
            </span>
          );
        }}
        next={resume}
        onPick={(location) => onNavigate({ page: "location", locationId: location.id })}
      />
    </div>
  );
}

/** WHERE THE LOCATION STANDS, in the one line that used to be a panel: the
 * player's place on its table, what they have scored, and how much of the
 * country has been driven. Read by the head's press (for its tooltip and
 * whether it is lit) and by the board itself, off one function so the two can
 * never disagree about a country that has been won. */
function locationLine(
  location: CampaignLocation,
  progress: CampaignProgress,
): { rows: StandingsRow[]; mine: StandingsRow; won: boolean; run: number; place: string } {
  const rows = locationStandings(location, progress);
  const mine = playerStanding(location, progress);
  const won = locationWon(location, progress);
  const run = stagesDriven(location, progress);
  return {
    rows,
    mine,
    won,
    run,
    place: won
      ? "WON"
      : run === 0
        ? // A place on a table nobody has scored on is not a place.
          "NOT STARTED"
        : `${mine.tied ? "=" : ""}${ordinal(mine.place)} OF ${rows.length}`,
  };
}

/** R30 — THE STANDINGS, BEHIND ONE PRESS IN THE HEAD.
 *
 * The location's table is what the stage boxes are being driven FOR — the
 * same points open the next box and the next country — but knowing where it
 * stands is a question a player asks between runs, not on every visit to the
 * grid. It used to be a panel under the boxes: a line of figures and a row
 * of buttons, permanently occupying the height of a seventh stage box on a
 * page whose whole job is to show six.
 *
 * So it is a button at the far end of the head instead, and everything it
 * used to print lives on the board it opens (results-table.tsx). The button
 * itself wears the menu's yellow once the country is WON, which is the
 * single fact worth reading without opening anything.
 *
 * The CONTINUE press went with the panel. The grid already marks the stage
 * it would pick (`LevelGrid`'s `next`) — the box is ringed, the controller's
 * cursor lands on it and START takes it — so a second control naming the
 * same stage in words was a row spent saying what the boxes already say. */
function StandingsAct({
  location,
  progress,
  onOpen,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  onOpen: () => void;
}) {
  const { won, place } = locationLine(location, progress);
  return (
    <button
      type="button"
      className={`menu-head-act ${won ? "menu-head-act-lit" : ""}`}
      title={`${location.name} standings — ${place}`}
      onClick={() => {
        playUi("select");
        onOpen();
      }}
    >
      <Glyph name="standings" />
      <span className="menu-head-act-word">STANDINGS</span>
    </button>
  );
}

/** THE BOARD ITSELF — the table, the gate the country is still behind, and
 * the press that tears its points up.
 *
 * It is rendered OUTSIDE the menu card rather than beside the button that
 * opens it, and that is load-bearing rather than tidiness: `.menu-card`
 * carries a `backdrop-filter`, which makes it the containing block for
 * anything `position: fixed` inside it — so a modal mounted in the card is
 * confined to the CARD's box instead of the screen's, and on a phone held
 * sideways the way out ends up below the fold. Fixed means fixed to the
 * viewport only from out here. */
function StandingsBoard({
  location,
  progress,
  carId,
  onReset,
  onClose,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  /** The car the player is entered in — the one row on the board whose car
   * is a choice rather than a fact about the roster. */
  carId: string;
  onReset: (locationId: string) => void;
  onClose: () => void;
}) {
  // A reset costs every point in the location and cannot be undone, so it asks
  // once. The question expires with the board rather than sitting armed
  // forever.
  const [sure, setSure] = useState(false);
  const { rows, mine, won, run, place } = locationLine(location, progress);
  return (
    <StandingsModal
      title={`${location.name.toUpperCase()} STANDINGS`}
      // WHERE THE PLAYER STANDS, in one line: what the panel under the stage
      // boxes used to print, on the board it was always about.
      sub={`${place}${run > 0 ? ` · ${mine.points} PTS` : ""} · ${run} OF ${
        location.levels.length
      } DRIVEN`}
      rows={rows}
      yourCarId={carId}
      foot={
        <div className="menu-standings-foot">
          {!won && locationComplete(location, progress) && (
            <span className="menu-standings-hint">TOP THE TABLE TO OPEN THE NEXT COUNTRY</span>
          )}
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
                onClose();
                onReset(location.id);
              }}
            >
              {sure ? "SURE? THE POINTS GO" : "RESET"}
            </button>
          )}
        </div>
      }
      onClose={onClose}
    />
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
  const out = locationParent();
  const gate = (_level: CampaignLevel, index: number): boolean =>
    levelUnlocked(location, index, progress);
  // THE STAGE THIS PAGE WOULD PICK — the box the cursor lands on, the box
  // START takes, and the box the grid lights. Falling back to the last open
  // one for a location with nothing left to win, which is the end of its own
  // ladder.
  const resume = continueAt(location, progress) ?? latestOpen(location, gate);
  // The board is up — a step of this page rather than a page of its own: it
  // stands OVER the grid, and leaving it lands back on the boxes.
  const [table, setTable] = useState(false);
  // Its pictures, ordered while the player is still reading the stage boxes
  // (`warmStandings`) — a portrait is a real body on a stand, and a board
  // that asks for fifteen the moment it opens spends its first seconds as an
  // empty column. The table is rebuilt inside the effect rather than read off
  // the render's own copy: a fresh array every render would make it a
  // dependency that always changed.
  useEffect(() => {
    warmStandings(locationStandings(location, progress), race.carId);
  }, [location, progress, race.carId]);
  return (
    <>
      <div className="menu-card menu-card-wide">
        <MenuHead
          back={() => onNavigate(out)}
          backLabel={out.page === "root" ? "MENU" : "CAMPAIGN"}
          title={location.name.toUpperCase()}
          act={
            <StandingsAct location={location} progress={progress} onOpen={() => setTable(true)} />
          }
        />
        <LevelGrid
          location={location}
          progress={progress}
          open={gate}
          hint="Podium on the stage before this one"
          difficulty={race.difficulty}
          next={resume}
          onPlay={pick}
        />
        {/* R29 — how good the fourteen crews you are running against are, and
            what a crash costs your own car while you race them
            (`damageScaleFor`). It stays on the GRID rather than moving to the
            pre-race card with the car, because it is what the boxes'
            best-result lines are measured against: change it here and the
            whole ladder is re-read at once. And it is the biggest control on
            the page, because it is the biggest decision on it — every result
            the boxes above are showing was scored at one of these three. */}
        <DifficultyPicker
          value={race.difficulty}
          onPick={(difficulty) => onRace({ ...race, difficulty })}
        />
      </div>
      {table && (
        <StandingsBoard
          location={location}
          progress={progress}
          carId={race.carId}
          onReset={onResetPoints}
          onClose={() => setTable(false)}
        />
      )}
    </>
  );
}

/** THE TIME TRIAL — the campaign's roads with the field taken off, driven
 * for the clock alone. Two steps, the campaign's own: which country, then
 * which of its six.
 *
 * The gate is a COUNTRY here (`timeTrialOpen`), which is the one place in
 * the game a mode runs ahead of the campaign's ladder: open a country in the
 * campaign and all six of its roads are open to the clock at once, in any
 * order, without podiuming down the rungs a second time to reach the last
 * one. It never runs ahead of the COUNTRIES — the desert is behind the
 * taiga's table here exactly as it is next door.
 *
 * There is no board on this page. The ten best times for a stage are the
 * arcade's invitation, and an invitation is worth something at the moment a
 * run has just landed on it — the results card — and nothing at all as a
 * list read cold from a menu. */
function TimeTrialPage({
  locationId,
  progress,
  onNavigate,
}: {
  /** The country being looked at, or null on the step that chooses one. */
  locationId: string | null;
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  const open = (location: CampaignLocation): boolean => timeTrialOpen(location, progress);
  if (locationId === null) {
    // The furthest country open, which is the one a player coming back is
    // driving. The first one always is, so this page is never empty.
    const resume = LOCATIONS.filter(open).at(-1);
    return (
      <div className="menu-card">
        <MenuHead back={() => onNavigate({ page: "root" })} backLabel="MENU" title="TIME TRIAL" />
        <LocationList
          open={open}
          // The same reason the campaign gives, because it is the same lock:
          // a country is opened by the previous country's TABLE.
          hint={(_location, index) => `Top the ${LOCATIONS[index - 1].name} table`}
          line={(location) => {
            const timed = stagesTimed(location, progress);
            return (
              <span
                className="menu-location-progress"
                title={`${timed} of ${location.levels.length} stages timed`}
              >
                {timed} / {location.levels.length} TIMED
              </span>
            );
          }}
          next={resume}
          onPick={(location) => onNavigate({ page: "timetrial", locationId: location.id })}
        />
      </div>
    );
  }
  const location = locationById(locationId);
  const before = LOCATIONS[LOCATIONS.indexOf(location) - 1];
  // Every stage of an open country is open, so the grid asks the COUNTRY its
  // question once and hands the same answer to all six boxes.
  const here = open(location);
  // The cursor still stands on the furthest road actually driven rather than
  // on the last box in the country: a player coming back lands where they
  // are, and a country nobody has timed yet opens on its first stage.
  const driven = (level: CampaignLevel): boolean => levelCompleted(level, progress);
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={() => onNavigate({ page: "timetrial" })}
        backLabel="TIME TRIAL"
        title={location.name.toUpperCase()}
      />
      <LevelGrid
        location={location}
        progress={progress}
        open={() => here}
        hint={before ? `Top the ${before.name} table` : ""}
        next={latestOpen(location, driven) ?? location.levels[0]}
        onPlay={(level) => onNavigate({ page: "car", levelId: level.id, mode: "timetrial" })}
      />
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
  // Deeper than either grid that reaches it, so arriving at the pre-race
  // card sounds like going IN from both of them.
  car: 3,
};

/** ...and the same number for a page that has steps INSIDE it. Roam is three
 * depths in one entry — the page, the developer's viewer reached from a
 * page as deep as it is, and the stage list over either — so without this,
 * opening the list and shutting it would make the same noise as each other. */
function depthOf(page: MenuPage): number {
  if (page.page === "options") return DEPTH.options + (page.sub ? 1 : 0);
  if (page.page === "timetrial" || page.page === "headsup") {
    return DEPTH[page.page] + (page.locationId === undefined ? 0 : 1);
  }
  if (page.page !== "roam") return DEPTH[page.page];
  return DEPTH.roam + (page.viewing === true ? 1 : 0) + (page.picking === true ? 1 : 0);
}

/** Where BACK goes from a page — the same step that page's own back button
 * takes, so the button and the key can never disagree. Null on the root,
 * which has nowhere further out to go. */
function parentOf(page: MenuPage): MenuPage | null {
  if (page.page === "root") return null;
  // Roam walks out through its own steps: the stage list back onto the map
  // it was opened from, then the map itself back to whichever door it was
  // reached through — the front one, or the developer menu.
  if (page.page === "roam") {
    if (page.picking === true || page.car === true) return { page: "roam", viewing: page.viewing };
    return page.viewing === true ? { page: "developer" } : { page: "root" };
  }
  if (page.page === "options" && page.sub) return { page: "options" };
  if (page.page === "timetrial" && page.locationId !== undefined) return { page: "timetrial" };
  if (page.page === "headsup" && page.locationId !== undefined) return { page: "headsup" };
  if (page.page === "location") return locationParent();
  if (page.page === "car") return carParent(page.levelId, page.mode);
  return { page: "root" };
}

/** Out of a country: the list of them, or straight to the front door while
 * there is only one to list (see `campaignEntry`). */
function locationParent(): MenuPage {
  return LOCATIONS.length === 1 ? { page: "root" } : { page: "campaign" };
}

/** The grid the pre-race card was reached from — the stage's OWN country on
 * all three modes, since all three now choose one before they show a grid.
 * A level id with no location behind it cannot happen from the grids, but a
 * stale one out of a reload should land somewhere real rather than on a
 * blank card: without a country, each mode falls back to its list of them. */
function carParent(levelId: string, mode: PlayMode): MenuPage {
  if (mode === "training") return { page: "root" };
  const found = findLevel(levelId);
  if (mode === "timetrial") return { page: "timetrial", locationId: found?.location.id };
  if (mode === "headsup") return { page: "headsup", locationId: found?.location.id };
  return found ? { page: "location", locationId: found.location.id } : campaignEntry();
}

export function MainMenu(props: MainMenuProps) {
  const { onNavigate } = props;
  // The stage the pre-race card is for. A card whose level id is not in the
  // catalog (a build that dropped a stage, under a page state that still
  // names it) shows the grid it came from rather than an empty card — a
  // substitution rather than a navigation, because a render is not the
  // place to change what page the app thinks it is on.
  // The training ground is addressed by the same card as a campaign stage
  // and is deliberately not IN the campaign (`training.ts`), so the lookup
  // that walks the ladder cannot find it and this is where it is resolved.
  const found =
    props.page.page !== "car"
      ? null
      : isTraining(props.page.levelId)
        ? { location: TRAINING_LOCATION, level: TRAINING_LEVEL, index: 0 }
        : findLevel(props.page.levelId);
  // WHICH ROAD ROAM IS STANDING ON, for the pre-race card's title. Derived
  // from the settings the same way Roam's own LEVEL row is, so the card and
  // the row can never name different stages.
  const roamLevel =
    props.page.page === "roam"
      ? levelForRoad(props.seed, props.race.length, props.race.shape, props.race.knobs)
      : null;
  const page =
    props.page.page === "car" && found === null
      ? carParent(props.page.levelId, props.page.mode)
      : props.page;
  /** Every navigation in the menu passes through here, so the interface's
   * sounds are wired in ONE place rather than on forty buttons. */
  const navigate = (next: MenuPage): void => {
    if (depthOf(next) < depthOf(page)) playUi("back");
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
  // the page — so it paints its own scrim and skips the shared one. Its
  // STAGE LIST is a card like any other, though, and takes the shared one
  // back: a list of names read over a sunlit map is a list nobody can read.
  const roam = page.page === "roam" && page.picking !== true;
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
          <TimeTrialPage
            locationId={page.locationId ?? null}
            progress={props.progress}
            onNavigate={navigate}
          />
        )}
        {page.page === "headsup" && (
          <HeadsUpPage
            locationId={page.locationId ?? null}
            progress={props.progress}
            headsUp={props.race.headsUp}
            onHeadsUp={(headsUp) =>
              props.onRace({ ...props.race, headsUp: { ...headsUp, cars: gridSize(headsUp.cars) } })
            }
            onLocation={(location) => navigate({ page: "headsup", locationId: location?.id })}
            onBack={() => navigate({ page: "root" })}
            onPlay={(level) => navigate({ page: "car", levelId: level.id, mode: "headsup" })}
          />
        )}
        {page.page === "car" && found !== null && (
          <CarSetupPage
            title={found.level.name.toUpperCase()}
            // The training ground has no location behind it to go back to —
            // it is reached from the root menu and `carParent` sends BACK
            // there, so the label has to say so rather than naming the card
            // the player is already standing on.
            backLabel={page.mode === "training" ? "MENU" : found.location.name.toUpperCase()}
            best={props.progress.best[found.level.id]}
            race={props.race}
            onRace={props.onRace}
            settings={props.settings}
            onSettings={props.onSettings}
            onBack={() => navigate(carParent(page.levelId, page.mode))}
            onStart={() => props.onPlayLevel(found.level, page.mode)}
            onDeveloper={props.onDeveloper}
          />
        )}
        {page.page === "gallery" && (
          <GalleryPage settings={props.settings} onBack={() => navigate({ page: "root" })} />
        )}
        {page.page === "roam" && page.viewing === true && (
          <MapViewerPage
            race={props.race}
            seed={props.seed}
            onSeed={props.onSeed}
            progress={props.progress}
            onLevel={props.onRoamLevel}
            picking={page.picking === true}
            onPicking={(picking) => navigate({ page: "roam", picking, viewing: true })}
            onMapRect={props.onMapRect}
            mapView={props.mapView}
            map={props.mapDebug}
            onBack={() => navigate(parentOf(page) ?? { page: "root" })}
          />
        )}
        {/* ROAM, and the CAR CARD it hands off to. The card is a step of
            this page rather than a page of its own for the reason the stage
            list is: what it is setting up is Roam's own settings, and the
            map goes on standing behind it. */}
        {page.page === "roam" && page.viewing !== true && page.car !== true && (
          <RoamPage
            race={props.race}
            onRace={props.onRace}
            seed={props.seed}
            onSeed={props.onSeed}
            onNext={() => navigate({ page: "roam", car: true })}
            onBack={() => navigate(parentOf(page) ?? { page: "root" })}
            progress={props.progress}
            onLevel={props.onRoamLevel}
            picking={page.picking === true}
            onPicking={(picking) => navigate({ page: "roam", picking })}
            onMapRect={props.onMapRect}
            mapView={props.mapView}
          />
        )}
        {page.page === "roam" && page.viewing !== true && page.car === true && (
          <CarSetupPage
            title={roamLevel?.name.toUpperCase() ?? `SEED ${props.seed}`}
            backLabel="ROAM"
            startLabel="DRIVE IT"
            race={props.race}
            onRace={props.onRace}
            settings={props.settings}
            onSettings={props.onSettings}
            onBack={() => navigate({ page: "roam" })}
            onStart={props.onPlayRoam}
            onDeveloper={props.onDeveloper}
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
            onMapViewer={() => navigate({ page: "roam", viewing: true, picking: true })}
            onBenchmark={props.onBenchmark}
          />
        )}
        {page.page === "debuglog" && (
          <DebugLogPage onBack={() => navigate({ page: "developer" })} />
        )}
        {page.page === "options" && (
          <OptionsPage
            sub={page.sub ?? null}
            onSub={(sub) => navigate(sub ? { page: "options", sub } : { page: "options" })}
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
