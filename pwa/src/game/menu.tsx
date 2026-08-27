// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two menus, both wearing the same arcade card.
//
// PreRaceMenu is the one you start from: pick when you race (time of day),
// what the sky does (weather), and what you drive — then START. It floats
// over the live scene, so switching a setting re-lights the stage behind it
// immediately; the countdown holds until START is pressed.
//
// PauseMenu is the one you reach mid-stage, by tapping the minimap: the run
// holds where it stands, and it carries the two ways on — run this stage
// again, or go back and change the race. They live here rather than in the
// top bar because the bar is a strip over the road, and every button on it
// is a button in the way of the driving.

import { CARS, type StageLength, type TimeOfDay, type Weather } from "@engine";

export type RaceSettings = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  carId: string;
  length: StageLength;
};

/** The menu's stage lengths — minutes of driving at rally pace, or the
 * endless stream that keeps generating road off the seed forever. */
export const STAGE_LENGTH_OPTIONS: { id: StageLength; label: string }[] = [
  { id: "short", label: "SHORT 1′" },
  { id: "medium", label: "MEDIUM 3′" },
  { id: "long", label: "LONG 5′" },
  { id: "xlong", label: "X-LONG 7′" },
  { id: "endless", label: "ENDLESS" },
];

export const TIMES_OF_DAY: { id: TimeOfDay; label: string }[] = [
  { id: "dawn", label: "DAWN" },
  { id: "day", label: "DAY" },
  { id: "dusk", label: "DUSK" },
  { id: "night", label: "NIGHT" },
];

export const WEATHERS: { id: Weather; label: string }[] = [
  { id: "clear", label: "CLEAR" },
  { id: "rain", label: "RAIN" },
  { id: "storm", label: "STORM" },
];

type MenuProps = {
  seed: number;
  settings: RaceSettings;
  onChange: (settings: RaceSettings) => void;
  onStart: () => void;
};

function OptionRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div className="hud-menu-row">
      <span className="hud-menu-label">{label}</span>
      <div className="hud-menu-opts">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`hud-opt ${opt.id === value ? "hud-opt-active" : ""}`}
            onClick={() => onPick(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PreRaceMenu({ seed, settings, onChange, onStart }: MenuProps) {
  return (
    <div className="hud-menu-wrap pointer-events-auto">
      <div className="hud-menu">
        <div className="hud-menu-title">STAGE {seed}</div>
        <OptionRow
          label="LENGTH"
          options={STAGE_LENGTH_OPTIONS}
          value={settings.length}
          onPick={(length) => onChange({ ...settings, length })}
        />
        <OptionRow
          label="TIME"
          options={TIMES_OF_DAY}
          value={settings.timeOfDay}
          onPick={(timeOfDay) => onChange({ ...settings, timeOfDay })}
        />
        <OptionRow
          label="WEATHER"
          options={WEATHERS}
          value={settings.weather}
          onPick={(weather) => onChange({ ...settings, weather })}
        />
        <OptionRow
          label="CAR"
          options={CARS.map((c) => ({ id: c.id, label: c.name.toUpperCase() }))}
          value={settings.carId}
          onPick={(carId) => onChange({ ...settings, carId })}
        />
        <button type="button" className="hud-start" onClick={onStart}>
          START
        </button>
      </div>
    </div>
  );
}

type PauseProps = {
  seed: number;
  carName: string;
  onResume: () => void;
  onRestart: () => void;
  onSetup: () => void;
};

/** The in-race menu, opened by tapping the minimap. The backdrop resumes:
 * a menu you opened by mis-aiming for the map must cost one tap to leave. */
export function PauseMenu({ seed, carName, onResume, onRestart, onSetup }: PauseProps) {
  return (
    <div className="hud-menu-wrap pointer-events-auto" onPointerDown={onResume} role="presentation">
      <div className="hud-menu hud-pause" onPointerDown={(e) => e.stopPropagation()}>
        <div className="hud-menu-title">PAUSED</div>
        <div className="hud-pause-sub">
          STAGE {seed} — {carName}
        </div>
        <button type="button" className="hud-start" onClick={onResume}>
          RESUME
        </button>
        <button type="button" className="hud-pause-act" onClick={onRestart}>
          RESTART STAGE
        </button>
        <button type="button" className="hud-pause-act" onClick={onSetup}>
          RACE SETUP
        </button>
      </div>
    </div>
  );
}
