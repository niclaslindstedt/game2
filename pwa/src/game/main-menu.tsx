// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main menu — the surface the game launches into, painted over a live
// bot-driven stage seen from a drone. Everything the player can reach
// before a run starts hangs off here:
//
//   Campaign   → a location (Taiga) → four stages, each unlocked by the one
//                before it.
//   Time trial → the same stages, gated by the same unlocks: a time is
//                something you chase on a road you have already driven.
//   Roam       → any seed at all, previewed as the map itself (menu-roam).
//   Options    → HUD, video and controls (menu-options).
//
// The pages are a plain tagged union rather than a router: there is no URL
// to keep in step, and the whole menu is one component tree over one canvas.

import { useRef } from "react";
import { STAGE_RULES } from "@engine";

import { APP_NAME, REPO_URL } from "../identity.ts";
import { formatTime } from "../lib/util.ts";
import {
  LOCATIONS,
  levelLaps,
  levelUnlocked,
  locationById,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { CarPicker } from "./car-picker.tsx";
import type { RaceSettings } from "./menu.tsx";
import { OptionsPage, type OptionsTab } from "./menu-options.tsx";
import { unlockAudio } from "./audio/bus.ts";
import { playUi } from "./audio/ui.ts";
import { RoamPage, type MapRect, type MapView } from "./menu-roam.tsx";
import type { Settings } from "./settings.ts";

export type MenuPage =
  | { page: "root" }
  | { page: "campaign" }
  | { page: "location"; locationId: string }
  | { page: "timetrial" }
  | { page: "roam" }
  | { page: "options"; tab: OptionsTab }
  | { page: "developer" };

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
  best: number | undefined;
  onPlay: () => void;
};

/** One stage box. Locked boxes wear a grey border and a padlock and cannot
 * be pressed; open ones wear green and say what they are. */
function LevelBox({ level, index, unlocked, best, onPlay }: LevelBoxProps) {
  if (!unlocked) {
    return (
      <div className="menu-level menu-level-locked" aria-label={`Stage ${index + 1}, locked`}>
        <span className="menu-level-no">{index + 1}</span>
        <LockGlyph />
        <span className="menu-level-hint">Finish the stage before this one</span>
      </div>
    );
  }
  return (
    <button type="button" className="menu-level menu-level-open" onClick={onPlay}>
      <span className="menu-level-no">{index + 1}</span>
      <span className="menu-level-name">{level.name}</span>
      <span className="menu-level-meta">{lengthLabel(level)}</span>
      <span className="menu-level-blurb">{level.blurb}</span>
      {best !== undefined && <span className="menu-level-best">BEST {formatTime(best)}</span>}
    </button>
  );
}

function LevelGrid({
  location,
  progress,
  onPlay,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  onPlay: (level: CampaignLevel, index: number) => void;
}) {
  return (
    <div className="menu-grid">
      {location.levels.map((level, index) => (
        <LevelBox
          key={level.id}
          level={level}
          index={index}
          unlocked={levelUnlocked(location, index, progress)}
          best={progress.best[level.id]}
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

/** The developer menu: out of the way of a player who never found it, and
 * blunt for one who did. Everything here bypasses the game rather than
 * playing it, which is the point — it is how the whole thing gets tested
 * without driving four stages first. */
function DeveloperPage({
  progress,
  onUnlockEverything,
  onNavigate,
}: {
  progress: CampaignProgress;
  onUnlockEverything: () => void;
  onNavigate: (page: MenuPage) => void;
}) {
  const total = LOCATIONS.reduce((n, l) => n + l.levels.length, 0);
  const cleared = LOCATIONS.reduce(
    (n, l) => n + l.levels.filter((v) => progress.cleared.includes(v.id)).length,
    0,
  );
  const allOpen = cleared >= total;
  return (
    <div className="menu-card">
      <BackButton label="MAIN MENU" onClick={() => onNavigate({ page: "root" })} />
      <div className="menu-title menu-title-dev">DEVELOPER</div>
      <div className="menu-sub">
        {cleared} of {total} stages cleared
      </div>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={onUnlockEverything}
        disabled={allOpen}
      >
        UNLOCK EVERYTHING
        <span className="menu-item-sub">
          {allOpen
            ? "Every stage is already open, in campaign and time trial"
            : "Open every stage in campaign and time trial. Best times are kept."}
        </span>
      </button>
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
          <span className="menu-item-sub">Chase the clock on stages you have unlocked</span>
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
  onNavigate,
}: {
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  return (
    <div className="menu-card">
      <BackButton label="MAIN MENU" onClick={() => onNavigate({ page: "root" })} />
      <div className="menu-title">CAMPAIGN</div>
      <div className="menu-sub">Pick a location</div>
      <div className="menu-locations">
        {LOCATIONS.map((location) => {
          const cleared = location.levels.filter((l) => progress.cleared.includes(l.id)).length;
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
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LocationPage({
  locationId,
  progress,
  race,
  onRace,
  onNavigate,
  onPlayLevel,
  onDeveloper,
}: {
  locationId: string;
  progress: CampaignProgress;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  onNavigate: (page: MenuPage) => void;
  onPlayLevel: (level: CampaignLevel, mode: PlayMode) => void;
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
        onPlay={(level) => onPlayLevel(level, "campaign")}
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
      <div className="menu-sub">Unlock a stage in the campaign to run it here</div>
      {LOCATIONS.map((location) => (
        <div key={location.id} className="menu-section">
          <div className="menu-section-title">{location.name.toUpperCase()}</div>
          <LevelGrid
            location={location}
            progress={progress}
            onPlay={(level) => onPlayLevel(level, "timetrial")}
          />
        </div>
      ))}
      <CarRow race={race} onRace={onRace} onDeveloper={onDeveloper} />
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
};

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
            onPlayLevel={props.onPlayLevel}
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
            onUnlockEverything={props.onUnlockEverything}
            onNavigate={navigate}
          />
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
