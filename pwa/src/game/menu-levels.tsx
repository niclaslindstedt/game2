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

/** The padlock on a locked stage box. Drawn rather than lettered so it
 * stays a lock at every box size and in every font the shell falls back to. */
export function LockGlyph() {
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

/** One stage box. Locked boxes wear a grey border and a padlock, name
 * nothing about the stage behind them and cannot be pressed; open ones wear
 * green and say what they are. */
function LevelBox({ level, index, unlocked, hint, best, place, points, onPlay }: LevelBoxProps) {
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
      {/* R30 — what this stage is worth on the location's table, which is the
          same board the next box is locked to. It leads the two bests because
          it is the thing that is actually being played for; the result and the
          time ride underneath it. */}
      {points !== undefined && (
        <span
          className={`menu-level-points ${points === POINTS[0] ? "menu-level-points-win" : ""}`}
        >
          {points} {points === 1 ? "PT" : "PTS"}
        </span>
      )}
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
