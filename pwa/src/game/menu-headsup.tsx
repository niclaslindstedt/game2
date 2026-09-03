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
// Three settings, and they are the whole mode:
//
//   DIFFICULTY how good the field is, and what a hit costs your own car —
//              its own knob, not the campaign's, so a knockabout race cannot
//              quietly retune a championship.
//   MASS START everybody on one grid, one green (engine/sim/grid.ts). Off,
//              it is a rally start: one car at a time, ten seconds apart,
//              and the result is a list of times.
//   CARS       how many are on that grid, the player included. Only a mass
//              start gets to choose — a rally start enters the whole roster,
//              because the road is empty either way and a short entry list
//              would only take rivals off the results sheet.

import {
  LOCATIONS,
  latestOpen,
  levelCompleted,
  type CampaignLevel,
  type CampaignProgress,
} from "./campaign.ts";
import { LevelGrid } from "./menu-levels.tsx";
import {
  DifficultyPicker,
  GRID_OPTIONS,
  MenuHead,
  OptionRow,
  ToggleRow,
  gridOption,
  type HeadsUpSettings,
} from "./menu.tsx";

export function HeadsUpPage({
  progress,
  headsUp,
  onHeadsUp,
  onBack,
  onPlay,
}: {
  progress: CampaignProgress;
  headsUp: HeadsUpSettings;
  onHeadsUp: (headsUp: HeadsUpSettings) => void;
  onBack: () => void;
  onPlay: (level: CampaignLevel) => void;
}) {
  const gate = (level: CampaignLevel): boolean => levelCompleted(level, progress);
  const open = LOCATIONS.some((location) => location.levels.some(gate));
  // The furthest stage finished anywhere — where the cursor stands, and the
  // race START takes. See the same line on the time trial's grid.
  let resume: CampaignLevel | null = null;
  for (const location of LOCATIONS) resume = latestOpen(location, gate) ?? resume;
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead back={onBack} backLabel="MENU" title="HEADS UP" />
      {!open && <div className="menu-empty">Drive a stage to the end in the campaign first.</div>}
      {LOCATIONS.map((location) => (
        <div key={location.id} className="menu-section">
          <div className="menu-section-title">{location.name.toUpperCase()}</div>
          <LevelGrid
            location={location}
            progress={progress}
            open={gate}
            hint="Finish this stage in the campaign"
            next={resume}
            onPlay={onPlay}
          />
        </div>
      ))}
      {/* HOW HARD, on its own: it is the setting that decides both how good
          the field is and what a hit costs the player's own car, and it wears
          the same three cards the campaign's does so the two are one idea
          with two answers — never two different questions. */}
      <DifficultyPicker
        value={headsUp.difficulty}
        onPick={(difficulty) => onHeadsUp({ ...headsUp, difficulty })}
      />
      {/* The race's own two settings, grouped so a phone held sideways can
          pair them up rather than stacking them. */}
      <div className="menu-settings">
        <ToggleRow
          label="MASS START"
          hint="Everyone off one grid, on one green. You start at the back."
          on={headsUp.massStart}
          onToggle={() => onHeadsUp({ ...headsUp, massStart: !headsUp.massStart })}
        />
        {headsUp.massStart && (
          <OptionRow
            label="CARS"
            options={GRID_OPTIONS}
            value={gridOption(headsUp.cars)}
            onPick={(id) => {
              const picked = GRID_OPTIONS.find((opt) => opt.id === id);
              if (picked) onHeadsUp({ ...headsUp, cars: picked.cars });
            }}
          />
        )}
      </div>
    </div>
  );
}
