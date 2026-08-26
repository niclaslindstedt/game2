// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pre-race menu: pick when you race (time of day), what the sky does
// (weather), and what you drive — then START. It floats over the live
// scene, so switching a setting re-lights the stage behind it immediately;
// the countdown holds until START is pressed.

import { CARS, type TimeOfDay, type Weather } from "@engine";

export type RaceSettings = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  carId: string;
};

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
