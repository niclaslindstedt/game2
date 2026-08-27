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

import {
  CARS,
  DEFAULT_KNOBS,
  type StageKnobs,
  type StageLength,
  type TimeOfDay,
  type Weather,
} from "@engine";

export type RaceSettings = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  carId: string;
  length: StageLength;
  /** The generator's dials — what KIND of stage the seed builds. */
  knobs: StageKnobs;
};

/** The dials, as the menu offers them: three positions each, because a
 * slider on a phone during a pre-race screen is a fiddle and what a player
 * actually wants to say is "more hills" or "no tarmac". The values are the
 * engine's 0..1 knobs (rules.ts). */
export type DialStop = { id: string; label: string; value: number };

export const STAGE_DIALS: {
  key: keyof StageKnobs;
  label: string;
  stops: DialStop[];
}[] = [
  {
    key: "elevation",
    label: "HILLS",
    stops: [
      { id: "low", label: "FLAT", value: 0.12 },
      { id: "mid", label: "ROLLING", value: 0.5 },
      { id: "high", label: "ALPINE", value: 0.9 },
    ],
  },
  {
    key: "water",
    label: "WATER",
    stops: [
      { id: "low", label: "DRY", value: 0.1 },
      { id: "mid", label: "STREAMS", value: 0.5 },
      { id: "high", label: "LAKELAND", value: 0.9 },
    ],
  },
  {
    key: "trees",
    label: "FOREST",
    stops: [
      { id: "low", label: "OPEN", value: 0.12 },
      { id: "mid", label: "WOODED", value: 0.5 },
      { id: "high", label: "DEEP", value: 0.9 },
    ],
  },
  {
    key: "asphalt",
    label: "TARMAC",
    stops: [
      { id: "low", label: "NONE", value: 0 },
      { id: "mid", label: "SOME", value: 0.25 },
      { id: "high", label: "HALF", value: 0.5 },
    ],
  },
];

/** Which stop a knob value sits on — the nearest one, so a value dialled in
 * from the URL still lights up the button it is closest to. */
export function dialStop(stops: DialStop[], value: number): string {
  let best = stops[0];
  for (const stop of stops) {
    if (Math.abs(stop.value - value) < Math.abs(best.value - value)) best = stop;
  }
  return best.id;
}

export const DEFAULT_STAGE_KNOBS: StageKnobs = { ...DEFAULT_KNOBS };

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
        {STAGE_DIALS.map((dial) => (
          <OptionRow
            key={dial.key}
            label={dial.label}
            options={dial.stops}
            value={dialStop(dial.stops, settings.knobs[dial.key])}
            onPick={(id) => {
              const stop = dial.stops.find((s) => s.id === id);
              if (!stop) return;
              onChange({ ...settings, knobs: { ...settings.knobs, [dial.key]: stop.value } });
            }}
          />
        ))}
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
