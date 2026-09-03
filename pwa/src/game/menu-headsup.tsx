// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HEADS UP — a race against the campaign's crews, for nothing but the race.
//
// It is the campaign's stage, the campaign's field and the campaign's bot,
// with the championship taken off: no points, no ladder, no table, nothing
// carried out of the race and into the next one. Which is exactly why the
// stages it offers are the ones already FINISHED — the same gate the time
// trial uses, and for the same reason. A road you have driven to the end is
// a road you can race on; one you have never seen is a road you should be
// learning in the campaign, where it counts for something.
//
// Two steps, the campaign's own: which country, then which of its six. And
// on the second, the two settings that are the whole mode:
//
//   DIFFICULTY   how good the field is, and what a hit costs your own car —
//                its own knob, not the campaign's, so a knockabout race
//                cannot quietly retune a championship.
//   PARTICIPANTS how many cars are on the grid, the player included.
//
// There is no start-type setting. Everybody leaves on one green off one
// grid (engine/sim/grid.ts) because that IS heads up — a rally start, one
// car at a time and a list of times at the end, is the campaign, and
// offering it here would be offering the mode next door.

import {
  LOCATIONS,
  latestOpen,
  levelCompleted,
  locationById,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { LevelGrid, LocationList } from "./menu-levels.tsx";
import {
  DifficultyPicker,
  GRID_OPTIONS,
  MenuHead,
  OptionRow,
  gridOption,
  type HeadsUpSettings,
} from "./menu.tsx";

export function HeadsUpPage({
  locationId,
  progress,
  headsUp,
  onHeadsUp,
  onLocation,
  onBack,
  onPlay,
}: {
  /** The country being looked at, or null on the step that chooses one. */
  locationId: string | null;
  progress: CampaignProgress;
  headsUp: HeadsUpSettings;
  onHeadsUp: (headsUp: HeadsUpSettings) => void;
  onLocation: (location: CampaignLocation | null) => void;
  onBack: () => void;
  onPlay: (level: CampaignLevel) => void;
}) {
  const gate = (level: CampaignLevel): boolean => levelCompleted(level, progress);
  const raced = (location: CampaignLocation): boolean => location.levels.some(gate);
  if (locationId === null) {
    // The furthest country with a finished stage in it — where the cursor
    // stands, and the race START takes.
    const resume = LOCATIONS.filter(raced).at(-1);
    return (
      <div className="menu-card">
        <MenuHead back={onBack} backLabel="MENU" title="HEADS UP" />
        {resume === undefined && (
          <div className="menu-empty">Drive a stage to the end in the campaign first.</div>
        )}
        <LocationList
          open={raced}
          hint={() => "Finish a stage here in the campaign"}
          line={(location) => (
            <span className="menu-location-progress">
              {location.levels.filter(gate).length} / {location.levels.length} OPEN
            </span>
          )}
          next={resume}
          onPick={onLocation}
        />
      </div>
    );
  }
  const location = locationById(locationId);
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={() => onLocation(null)}
        backLabel="HEADS UP"
        title={location.name.toUpperCase()}
      />
      <LevelGrid
        location={location}
        progress={progress}
        open={gate}
        hint="Finish this stage in the campaign"
        next={latestOpen(location, gate)}
        onPlay={onPlay}
      />
      {/* HOW HARD, on its own: it is the setting that decides both how good
          the field is and what a hit costs the player's own car, and it wears
          the same three cards the campaign's does so the two are one idea
          with two answers — never two different questions. */}
      <DifficultyPicker
        value={headsUp.difficulty}
        onPick={(difficulty) => onHeadsUp({ ...headsUp, difficulty })}
      />
      {/* HOW MANY CARS ARE IN IT — the one other decision, and the only one
          that changes what a frame costs: every entry is a body, a plate and
          a `GameState` stepped beside the player's. Wide chips, because on a
          phone this is a row of two-character targets. */}
      <OptionRow
        label="PARTICIPANTS"
        options={GRID_OPTIONS}
        value={gridOption(headsUp.cars)}
        wide
        onPick={(id) => {
          const picked = GRID_OPTIONS.find((opt) => opt.id === id);
          if (picked) onHeadsUp({ ...headsUp, cars: picked.cars });
        }}
      />
    </div>
  );
}
