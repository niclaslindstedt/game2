// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE GRID — one row of boxes per location, and the box itself.
//
// Three pages show the same stages behind three different gates, and they
// have to look identical while they do it: the CAMPAIGN opens the next rung
// of the ladder, the TIME TRIAL opens anything driven to the end, and HEADS
// UP opens the same finished stages to race the field over again. So the
// boxes live here and the gate is passed in — a page decides what is open
// and what a locked box asks for, and nothing else about a stage box is a
// page's business.
//
// The same stages come round a fourth time as a LIST rather than a grid —
// `StagePicker`, at the foot of this file — for Roam, which offers them
// behind no gate at all.

import { FIELD_SIZE, STAGE_RULES, type Difficulty } from "@engine";
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
import { ROUTE_STROKE, routeShape } from "./stage-preview.ts";
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

/** One stage as a LINE: its name, and the spec that would be loaded off it. */
function StageLine({
  level,
  loaded,
  onPick,
}: {
  level: CampaignLevel;
  /** This is the stage already on the map — the cursor lands here. */
  loaded: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={loaded ? "menu-item menu-item-on" : "menu-item"}
      data-nav-focus={loaded ? "" : undefined}
      onClick={onPick}
    >
      {level.name.toUpperCase()}
      <span className="menu-item-sub">
        seed {level.seed} · {lengthLabel(level)} · {level.timeOfDay} {level.weather} ·{" "}
        {level.season}
      </span>
    </button>
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
 * it is set in — into Roam's own settings, where every one of them can then
 * be changed and the whole thing DRIVEN. That is the difference between this
 * and the grid above: nothing here is locked, nothing here is scored, and
 * what comes back is a setup rather than a race.
 *
 * A list rather than boxes, for the same reason: what is wanted off a stage
 * here is its numbers — which seed, which band, what it is set in — and a
 * box the size of a thumb has no room for them.
 *
 * The country step is kept even while there is only one country to keep it
 * for: the biome is the axis this list exists to walk, and a list of one is
 * a list that becomes right the moment a second one lands. */
export function StagePicker({
  loaded,
  back,
  onPick,
  onBack,
}: {
  /** The level id currently loaded, so the list can say which one you are
   * looking at. Null on a bare seed. */
  loaded: string | null;
  /** What the page underneath is called — the list is opened from two of
   * them, and a back button that names the wrong one is worse than one that
   * names nothing. */
  back: string;
  onPick: (level: CampaignLevel) => void;
  onBack: () => void;
}) {
  const [locationId, setLocationId] = useState<string | null>(
    () => LOCATIONS.find((l) => l.levels.some((v) => v.id === loaded))?.id ?? null,
  );
  const location = locationId === null ? null : LOCATIONS.find((l) => l.id === locationId);
  return (
    <div className="menu-card menu-card-wide">
      {/* Back steps WITHIN the list before it leaves it, so a controller's B
          walks the same two steps the presses came in on. */}
      <button
        type="button"
        className="menu-back"
        data-nav-back
        onClick={() => (location ? setLocationId(null) : onBack())}
      >
        ‹ {location ? "STAGES" : back}
      </button>
      <div className="menu-title">{location ? location.name.toUpperCase() : "STAGES"}</div>
      <div className="menu-sub">
        {location
          ? "Put a stage on the map"
          : "The roads the campaign ships, on the map rather than behind a gate"}
      </div>
      {location
        ? location.levels.map((level) => (
            <StageLine
              key={level.id}
              level={level}
              loaded={level.id === loaded}
              onPick={() => onPick(level)}
            />
          ))
        : LOCATIONS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="menu-item"
              onClick={() => setLocationId(l.id)}
            >
              {l.name.toUpperCase()}
              <span className="menu-item-sub">
                {l.blurb} · {l.levels.length} stages
              </span>
            </button>
          ))}
    </div>
  );
}
