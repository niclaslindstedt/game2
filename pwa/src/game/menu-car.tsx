// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRE-RACE CARD — what stands between picking a stage and driving it.
//
// The stage grid used to carry the car picker under it, which made the car
// a setting on the level select rather than a decision: a player scanning
// six stage boxes is choosing a ROAD, and a control sitting below the fold
// is one nobody reads. Splitting it out gives the choice its own screen and
// room for the thing that makes it a choice at all — the spec sheet
// (car-stats.ts), which is what says why anyone would take the slow one.
//
// Everything on this card is the player's, not the stage's: the campaign
// authors the conditions and the rivals, and the player brings a car and a
// gearbox to them.

import { carById, type CarSpec, type GearboxMode } from "@engine";

import { formatTime } from "../lib/util.ts";
import type { CampaignLevel, CampaignLocation, CampaignProgress } from "./campaign.ts";
import { CarPicker } from "./car-picker.tsx";
import { carBars, carFacts } from "./car-stats.ts";
import { GearboxRow, MenuHead, type PlayMode, type RaceSettings } from "./menu.tsx";
import type { Settings } from "./settings.ts";

/** The spec sheet. The bars compare the car to the REST OF THE ROSTER
 * rather than to zero (see car-stats.ts) — three cars within a few percent
 * of each other on an absolute scale are three identical full bars, which
 * is a picture of nothing.
 *
 * Everything on it — the figures AND the bars — is quoted through the box
 * the transmission row below is set to, so choosing the manual visibly
 * lengthens the top speed on the same card the choice is made on. */
function CarSpecPanel({ spec, gearbox }: { spec: CarSpec; gearbox: GearboxMode }) {
  return (
    <div className="car-spec">
      <div className="car-spec-blurb">{spec.blurb}</div>
      <div className="car-spec-facts">
        {carFacts(spec, gearbox).map((fact) => (
          <div key={fact.key} className="car-spec-fact">
            <span className="car-spec-fact-label">{fact.label}</span>
            <span className="car-spec-fact-value">{fact.value}</span>
          </div>
        ))}
      </div>
      <div className="car-spec-bars">
        {carBars(spec, gearbox).map((bar) => (
          <div key={bar.key} className="car-spec-bar">
            <span className="car-spec-bar-label">{bar.label}</span>
            <span className="car-spec-bar-track">
              <span
                className="car-spec-bar-fill"
                style={{ width: `${(bar.value * 100).toFixed(1)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="car-spec-note">
        Bars compare this car with the rest of the roster, in either gearbox.
      </div>
    </div>
  );
}

/** Which page the card came from, named. The campaign's is the location
 * itself, so it is the one this table does not hold. */
const BACK_TO: Partial<Record<PlayMode, string>> = {
  timetrial: "TIME TRIAL",
  headsup: "HEADS UP",
};

export type CarSetupPageProps = {
  location: CampaignLocation;
  level: CampaignLevel;
  /** What the stage is being entered AS — it decides where BACK goes and
   * what the button under the card promises. */
  mode: PlayMode;
  /** The stage's billing, built by the level grid so the two rows agree. */
  billing: string;
  progress: CampaignProgress;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBack: () => void;
  onStart: () => void;
  onDeveloper: () => void;
};

export function CarSetupPage({
  location,
  level,
  mode,
  billing,
  progress,
  race,
  onRace,
  settings,
  onSettings,
  onBack,
  onStart,
  onDeveloper,
}: CarSetupPageProps) {
  const spec = carById(race.carId);
  const best = progress.best[level.id];
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={onBack}
        backLabel={BACK_TO[mode] ?? location.name.toUpperCase()}
        title={level.name.toUpperCase()}
        sub={`${location.name} · ${billing}${best === undefined ? "" : ` · BEST ${formatTime(best)}`}`}
      />
      <div className="car-setup">
        <CarPicker
          carId={race.carId}
          onPick={(carId) => onRace({ ...race, carId })}
          onDeveloper={onDeveloper}
        />
        <CarSpecPanel spec={spec} gearbox={settings.gearbox} />
      </div>
      <GearboxRow
        label="TRANSMISSION"
        gearbox={settings.gearbox}
        onGearbox={(gearbox) => onSettings({ ...settings, gearbox })}
      />
      <button type="button" className="menu-start" onClick={onStart}>
        START
      </button>
    </div>
  );
}
