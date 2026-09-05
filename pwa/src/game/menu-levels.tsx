// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE GRID — one row of boxes per location, and the box itself.
//
// Three pages show the same stages behind three different gates, and they
// have to look identical while they do it: the CAMPAIGN opens the next rung
// of the ladder, the TIME TRIAL opens a whole COUNTRY at a time (all six the
// moment the campaign opens the country), and HEADS UP opens anything driven
// to the end, to race the field over again. So the boxes live here and the
// gate is passed in — a page decides what is open and what a locked box asks
// for, and nothing else about a stage box is a page's business.
//
// The same stages come round a fourth time behind NO gate at all —
// `StagePicker`, at the foot of this file — for Roam and for the developer's
// map viewer, which put a road on the map rather than on a start line: the
// same country rows and the same boxes, with every padlock off, because a
// stage should look like itself wherever it is offered.
//
// And ABOVE the grid, on all of those pages, sits the step that chooses
// which country's six are being looked at: `LocationList`. It is the same
// row of banners everywhere because the question is the same one — where
// am I driving — and only the gate behind it differs.

import { FIELD_SIZE, STAGE_RULES, type Difficulty } from "@engine";
import type { ComponentChildren } from "preact";
import { useState } from "react";

import { formatTime, ordinal } from "../lib/util.ts";
import { Glyph } from "./menu-glyphs.tsx";
import {
  LOCATIONS,
  PODIUM,
  POINTS,
  bestPlace,
  levelLaps,
  stagePoints,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { MenuHead } from "./menu.tsx";
import { ROUTE_STROKE, biomeShot, routeShape } from "./stage-preview.ts";
import { PLAYER_ID } from "./standings.ts";

/** The padlock on anything not open yet. The drawing lives with the rest of
 * the menu's marks; this is the box it hangs in. */
export function LockGlyph() {
  return <Glyph name="lock" className="menu-lock" />;
}

/** THE STAGE'S ROAD, as the shape it is — the whole route in the corner of
 * its own box, so six boxes read as six different roads before a word on
 * any of them has been read.
 *
 * It sits BEHIND the text rather than beside it. A stage box is already as
 * short as its contents allow (a phone held sideways fits six of them only
 * just), so a picture given a column of its own would cost the grid the
 * layout it was cut down to get. Behind, at low contrast, it costs nothing
 * and the name still reads over it.
 *
 * Stroked in `currentColor`, so the box's own state paints it: the menu's
 * yellow on an open stage, grey on a locked one, and no second palette to
 * keep in step. Aria-hidden — it says nothing the box does not already say
 * in words. */
function RouteMap({ levelId }: { levelId: string }) {
  const shape = routeShape(levelId);
  if (!shape) return null;
  return (
    <svg
      className="menu-level-route"
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={shape.d}
        fill="none"
        stroke="currentColor"
        strokeWidth={ROUTE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A stage's billing without compiling it: the band's name, the minutes it
 * is sized for, and — on a circuit — the laps it is cut into, which is the
 * one thing about a level a player has to know before pressing it. */
export function lengthLabel(level: CampaignLevel): string {
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
  /** R30 — what the stage is currently paying the player's table, or
   * undefined where points are not the point (the time trial). A stage that
   * has been driven and paid NOTHING says so: nought is the reason the box
   * after it is still shut. */
  points: number | undefined;
  /** This is the stage the page would pick for you — the box wears a ring,
   * the controller lands its cursor here, and START takes it (menu-nav.ts).
   * One box per PAGE, so a page listing several locations names it once. */
  next: boolean;
  onPlay: () => void;
};

/** One stage box. The BORDER carries the state — lit and open, grey and shut
 * — because at a glance across six boxes the frame is what the eye counts.
 * Behind it all sits the stage's own road (`RouteMap`), which is what tells
 * six boxes apart before their names have been read.
 *
 * What is INSIDE is only what is specific to this stage: its number, its
 * name, how long it is, and what has been got out of it. The stage's blurb
 * ("Open forest road, one jump") and the locked box's reason both came off,
 * and between them they were most of the box's height: a padlock already
 * says shut, and what a road is like is something you find out by driving
 * it. The reason stays as the box's accessible name, for a reader that
 * cannot see a padlock.
 *
 * The three results share ONE wrapping row rather than three stacked lines,
 * each behind the mark that says which it is: a cup for the finish, a watch
 * for the clock. A stage that has never been driven shows an empty row and
 * takes no height for it. */
function LevelBox({
  level,
  index,
  unlocked,
  hint,
  best,
  place,
  points,
  next,
  onPlay,
}: LevelBoxProps) {
  if (!unlocked) {
    return (
      <div
        className="menu-level menu-level-locked"
        title={hint}
        aria-label={`Stage ${index + 1}, locked — ${hint}`}
      >
        <RouteMap levelId={level.id} />
        <span className="menu-level-no">{index + 1}</span>
        <LockGlyph />
      </div>
    );
  }
  const laps = levelLaps(level);
  return (
    <button
      type="button"
      className={`menu-level menu-level-open ${next ? "menu-level-next" : ""}`}
      // THE BOX THE PAGE WOULD PICK, said in the picture as well as to the
      // pad: it is where the cursor lands and what START takes, and since
      // the campaign's CONTINUE button came off the location page this ring
      // is the only thing telling a thumb where it left off.
      aria-current={next ? "step" : undefined}
      data-nav-next={next ? "" : undefined}
      onClick={onPlay}
    >
      <RouteMap levelId={level.id} />
      <span className="menu-level-head">
        <span className="menu-level-no">{index + 1}</span>
        <Glyph name={laps > 1 ? "circuit" : "sprint"} className="menu-level-shape" />
      </span>
      <span className="menu-level-name">{level.name}</span>
      <span className="menu-level-meta">{lengthLabel(level)}</span>
      <span className="menu-level-marks">
        {/* R30 — what this stage is paying the location's table, which is the
            same board the next box is locked to, so it leads the two bests. */}
        {points !== undefined && (
          <span
            className={`menu-level-mark ${points === POINTS[0] ? "menu-level-mark-lit" : ""}`}
            title={`${points} points on the location's table`}
          >
            {points} {points === 1 ? "PT" : "PTS"}
          </span>
        )}
        {/* R29 — the best RESULT, which is what clears a campaign box: a stage
            is beaten by beating the field, not by beating the clock. */}
        {place !== undefined && (
          <span
            className={`menu-level-mark ${place <= PODIUM ? "menu-level-mark-lit" : ""}`}
            title={`Best finish: ${place} of ${FIELD_SIZE}`}
          >
            <Glyph name="trophy" />
            {ordinal(place)}
          </span>
        )}
        {best !== undefined && (
          <span className="menu-level-mark" title="Best time">
            <Glyph name="stopwatch" />
            {formatTime(best)}
          </span>
        )}
      </span>
    </button>
  );
}

/** The same grid serves both pages, so which stages it opens is passed in
 * rather than assumed: the campaign opens the next stage up the ladder, the
 * time trial only stages already driven to the end. */
export function LevelGrid({
  location,
  progress,
  open,
  hint,
  difficulty,
  next,
  onPlay,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  open: (level: CampaignLevel, index: number) => boolean;
  hint: string;
  /** The stage this PAGE would pick — see `LevelBoxProps.next`. Null on
   * every grid but the one holding it, on a page that lists several. */
  next?: CampaignLevel | null;
  /** Which field's results to show on the boxes. Absent on the time trial's
   * grid, where there is no field, so a placing would be a fiction and the
   * points belong to the campaign rather than to the clock. */
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
          points={difficulty === undefined ? undefined : stagePoints(level.id, progress)[PLAYER_ID]}
          next={next?.id === level.id}
          onPlay={() => onPlay(level, index)}
        />
      ))}
    </div>
  );
}

/** THE COUNTRY, behind the row that opens it — a real render taken by the
 * game from two hundred metres over the country's first start line
 * (`make biomes`), not a map of any one stage: a location is six roads, and
 * a picture of one of them would be advertising the wrong thing.
 *
 * It fills the row and the text sits on it, which is the only layout that
 * does not cost the page height it has not got. Decorative, so it is hidden
 * from a reader — the row already says the country's name and what it is
 * like in words.
 *
 * A missing file takes itself off the page rather than leaving a broken
 * image in the menu: the banners are generated, and a country added to
 * `campaign.ts` before `make biomes` is next run has none. */
function BiomeShot({ location }: { location: CampaignLocation }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <img
      className="menu-location-shot"
      src={biomeShot(location.biome, import.meta.env.BASE_URL)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setGone(true)}
    />
  );
}

/** THE COUNTRIES, as the step before the stages — the campaign's board, and
 * the same board in front of the time trial's grid and heads up's.
 *
 * All three used to differ here: the campaign asked which country, and the
 * other two printed every country's six boxes down one page. Six became
 * twelve the moment a second country landed, and a page that is two grids
 * deep is a page where the stage you want is below the fold. So the question
 * is asked once, the same way, on all three — and what changes between them
 * is only the gate: a country the campaign has not opened, against one you
 * have never driven a stage of.
 *
 * A locked country is still SHOWN, dimmed: what is on the other side of the
 * padlock is the reason to go through it, and a grey box is a reason to stop
 * looking. */
export function LocationList({
  open,
  hint,
  line,
  next,
  onPick,
}: {
  /** Whether this country's stages can be reached from the page asking. */
  open: (location: CampaignLocation, index: number) => boolean;
  /** What a locked row asks for. A padlock with no reason on it is a wall. */
  hint: (location: CampaignLocation, index: number) => string;
  /** The row's third line — what has been got out of the country so far.
   * Omitted where a page has nothing to say about it. */
  line?: (location: CampaignLocation) => ComponentChildren;
  /** The country the page would pick for you: where the controller's cursor
   * lands and what START takes. */
  next?: CampaignLocation | null;
  onPick: (location: CampaignLocation) => void;
}) {
  return (
    <div className="menu-locations">
      {LOCATIONS.map((location, index) => {
        if (!open(location, index)) {
          const why = hint(location, index);
          return (
            <div
              key={location.id}
              className="menu-location menu-location-locked menu-level-locked"
              title={why}
              aria-label={`${location.name}, locked — ${why}`}
            >
              <BiomeShot location={location} />
              <LockGlyph />
              <span className="menu-location-name">{location.name.toUpperCase()}</span>
              <span className="menu-location-blurb">{why}</span>
            </div>
          );
        }
        return (
          <button
            key={location.id}
            type="button"
            className="menu-location"
            data-nav-next={location === next ? "" : undefined}
            onClick={() => onPick(location)}
          >
            <BiomeShot location={location} />
            <span className="menu-location-name">{location.name.toUpperCase()}</span>
            <span className="menu-location-blurb">{location.blurb}</span>
            {line?.(location)}
          </button>
        );
      })}
    </div>
  );
}

/** THE STAGE LIST — the campaign's own roads, offered to a page that is not
 * the campaign.
 *
 * Roam builds a stage out of whatever the dials happen to say, which is the
 * right thing for choosing a seed and the wrong thing for standing on a road
 * somebody is actually going to drive: the shipped stages are authored, and
 * a defect in one of them is a defect a player will meet. Picking one here
 * loads its exact spec — seed, band, shape, and the hour, weather and season
 * it is set in — into the page's own settings, where every one of them can
 * then be changed and the whole thing DRIVEN. That is the difference between
 * this and the campaign's ladder: nothing here is locked and nothing here is
 * scored, and what comes back is a setup rather than a race.
 *
 * It is the campaign's own two surfaces, though, and deliberately so: the
 * country rows with their banners, then that country's six stage boxes with
 * their roads drawn on them. A player who has picked a stage on the campaign
 * ladder has already learnt this screen, and a picture of the road is worth
 * more than the seed number the list used to print — the seed is on the page
 * underneath, on the row that steps it.
 *
 * The BESTS still show on a box, because a time is a fact about the road and
 * not about the discipline; the places and the points do not, because a Roam
 * run scores nothing (`difficulty` left off, see `LevelGrid`). */
export function StagePicker({
  loaded,
  back,
  progress,
  onPick,
  onBack,
}: {
  /** The level id currently loaded, so the list can say which one you are
   * looking at — the box wears the ring and the cursor lands on it. Null on
   * a bare seed. */
  loaded: string | null;
  /** What the page underneath is called — the list is opened from two of
   * them, and a back button that names the wrong one is worse than one that
   * names nothing. */
  back: string;
  /** The board, for the best times on the boxes. Nothing here is gated on
   * it: every stage is open. */
  progress: CampaignProgress;
  onPick: (level: CampaignLevel) => void;
  onBack: () => void;
}) {
  const [locationId, setLocationId] = useState<string | null>(
    () => LOCATIONS.find((l) => l.levels.some((v) => v.id === loaded))?.id ?? null,
  );
  const location = locationId === null ? null : LOCATIONS.find((l) => l.id === locationId);
  const here = location?.levels.find((l) => l.id === loaded) ?? null;
  return (
    <div className="menu-card menu-card-wide">
      {/* Back steps WITHIN the list before it leaves it, so a controller's B
          walks the same two steps the presses came in on. */}
      <MenuHead
        back={() => (location ? setLocationId(null) : onBack())}
        backLabel={location ? "STAGES" : back}
        title={location ? location.name.toUpperCase() : "STAGES"}
        sub={
          location
            ? "Put one of its roads on the map"
            : "The roads the campaign ships, on the map rather than behind a gate"
        }
      />
      {location ? (
        <LevelGrid
          location={location}
          progress={progress}
          open={() => true}
          hint=""
          next={here}
          onPlay={onPick}
        />
      ) : (
        // The same country rows the campaign, the time trial and heads up
        // open on — with the gate held open, since nothing here is earned.
        <LocationList
          open={() => true}
          hint={() => ""}
          line={(l) => <span className="menu-location-progress">{l.levels.length} STAGES</span>}
          next={LOCATIONS.find((l) => l.levels.some((v) => v.id === loaded)) ?? null}
          onPick={(l) => setLocationId(l.id)}
        />
      )}
    </div>
  );
}
