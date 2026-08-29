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

import { FIELD_SIZE, STAGE_RULES, type Difficulty } from "@engine";

import { formatTime, ordinal } from "../lib/util.ts";
import { Glyph } from "./menu-glyphs.tsx";
import {
  PODIUM,
  POINTS,
  bestPlace,
  levelLaps,
  stagePoints,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { PLAYER_ID } from "./standings.ts";

/** The padlock on anything not open yet. The drawing lives with the rest of
 * the menu's marks; this is the box it hangs in. */
export function LockGlyph() {
  return <Glyph name="lock" className="menu-lock" />;
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
  onPlay: () => void;
};

/** One stage box. The BORDER carries the state — lit and open, grey and shut
 * — because at a glance across six boxes the frame is what the eye counts.
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
function LevelBox({ level, index, unlocked, hint, best, place, points, onPlay }: LevelBoxProps) {
  if (!unlocked) {
    return (
      <div
        className="menu-level menu-level-locked"
        title={hint}
        aria-label={`Stage ${index + 1}, locked — ${hint}`}
      >
        <span className="menu-level-no">{index + 1}</span>
        <LockGlyph />
      </div>
    );
  }
  const laps = levelLaps(level);
  return (
    <button type="button" className="menu-level menu-level-open" onClick={onPlay}>
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
  onPlay,
}: {
  location: CampaignLocation;
  progress: CampaignProgress;
  open: (level: CampaignLevel, index: number) => boolean;
  hint: string;
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
          onPlay={() => onPlay(level, index)}
        />
      ))}
    </div>
  );
}
