// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-race pause card, and the option vocabulary every menu surface
// shares: the stage-length bands, the times of day, the weathers, and the
// segmented `OptionRow` they are all picked with.
//
// PauseMenu is the one you reach mid-stage, by tapping the minimap: the run
// holds where it stands, and it carries the three ways on — run this stage
// again, leave for the main menu, or resume. It lives here rather than in
// the top bar because the bar is a strip over the road, and every button on
// it is a button in the way of the driving.

import type { StageLength, TimeOfDay, Weather } from "@engine";

export type RaceSettings = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  carId: string;
  length: StageLength;
};

/** The stage lengths, in the order Roam's slider walks them — minutes of
 * driving at rally pace, ending in the endless stream that keeps generating
 * road off the seed for as long as the run lasts. */
export const STAGE_LENGTH_OPTIONS: { id: StageLength; label: string }[] = [
  { id: "short", label: "SHORT" },
  { id: "medium", label: "MEDIUM" },
  { id: "long", label: "LONG" },
  { id: "xlong", label: "X-LONG" },
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

export function OptionRow<T extends string>({
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
    <div className="menu-row">
      <span className="menu-label">{label}</span>
      <div className="menu-opts">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`menu-opt ${opt.id === value ? "menu-opt-active" : ""}`}
            onClick={() => onPick(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type PauseProps = {
  seed: number;
  carName: string;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
};

/** The in-race menu, opened by tapping the minimap. The backdrop resumes:
 * a menu you opened by mis-aiming for the map must cost one tap to leave. */
export function PauseMenu({ seed, carName, onResume, onRestart, onMainMenu }: PauseProps) {
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
        <button type="button" className="hud-pause-act" onClick={onMainMenu}>
          MAIN MENU
        </button>
      </div>
    </div>
  );
}
