// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ROAM — drive any seed at all. TWO PANES and nothing else: the MAP, which
// is the stage, and the SETTINGS that build it. The car is not here; it is
// the screen AFTER this one (menu-car.tsx's `CarSetupPage`, the same card
// the campaign and the time trial hand off to), because a road and a car are
// two decisions and this page's whole question is which road.
//
// The map pane is a WINDOW onto the 3D canvas underneath (map-pane.tsx): the
// renderer scissors the map view into exactly that rectangle, turning, with
// the terrain, the lakes and the forest standing and the route drawn over
// the top of them. So the choice is made by LOOKING at the landscape rather
// than by reading a number — and the pane is a CONTROL as well, so "alpine"
// is something the player tilts down to and sees for themselves.
//
// The settings beside it are the OPTIONS page's rows and nothing new
// (menu-knobs.tsx): the name on the left behind its mark, the value on the
// right between two arrows, and the pips saying where on its ladder it
// stands. A dozen settings in one silhouette is a column a player scans; a
// dozen bespoke controls is a wall. The marks are what make it scannable at
// that length — a column of words is read, a column of drawings is
// recognised, and they are why no row here carries a sentence: the map
// answers what a dial does, the moment it is moved.
//
// Two rows are deliberately NOT that silhouette, because what they hold is
// not a place on a three-stop ladder: DIFFICULTY (R46) is a scale, so it is
// a slider, and the SEED is a number, so it can be walked, typed or rolled.
// Both are still the same row — a name, a mark, and a value between two
// arrows — which is the whole point of the shape.
//
// The stage does not have to be a bare seed: the LEVEL row loads one of the
// CAMPAIGN's own roads through the campaign's OWN stage boxes
// (menu-levels.tsx's `StagePicker`) — so the fourteen authored stages can be
// looked at, taken out at another hour or in worse weather, and driven.
//
// THE DEVELOPER'S MAP VIEWER IS NOT THIS PAGE. It is menu-map-viewer.tsx,
// and it owns everything that is about reading a stage rather than choosing
// one: the generator's layers, the debug copy, the shutter. None of that is
// offered here, and that is the point — a player picking a seed to drive is
// not served by a row of layer buttons across the country.

import { levelForRoad, type CampaignLevel, type CampaignProgress } from "./campaign.ts";
import { MapPane, type MapRect, type MapView } from "./map-pane.tsx";
import { StagePicker } from "./menu-levels.tsx";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { FadeRow, KnobGroup, NumberRow, StepRow } from "./menu-knobs.tsx";
import {
  BIOME_OPTIONS,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  TIMES_OF_DAY,
  challengeGlyph,
  challengeWord,
  dialStop,
  weathersOf,
  type RaceSettings,
} from "./menu.tsx";

/** The biggest seed the roll can land on. Big enough that two rolls never
 * collide in one sitting, small enough to stay a number a person can read
 * off the row and type into a link. */
const SEED_CEILING = 999999;

type RoamProps = {
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  seed: number;
  onSeed: (seed: number) => void;
  /** On to the CAR — this page's one way forward, and where START lands. */
  onNext: () => void;
  onBack: () => void;
  /** The board, for the best times on the stage list's boxes. */
  progress: CampaignProgress;
  /** Load one of the campaign's own stages into these settings — its seed,
   * its band, its shape and the conditions it is authored in. */
  onLevel: (level: CampaignLevel) => void;
  /** Whether the stage list is up over the map, and the way to open and
   * shut it. It is the MENU's state rather than this page's so that the
   * escape key and the pad's B walk out of it the way they walk out of
   * everything else. */
  picking: boolean;
  onPicking: (picking: boolean) => void;
  /** Where the map pane is, so the renderer can draw the stage into it.
   * Null on unmount — the map view goes back to full-bleed. */
  onMapRect: (rect: MapRect | null) => void;
  mapView: MapView;
};

/** WHICH MARK EACH GENERATOR DIAL LEADS WITH, keyed by the knob it moves.
 * The dial's three stops name themselves (FLAT, ROLLING, ALPINE); the mark
 * is what says which part of the country they are naming, at a glance
 * across five of them. */
const DIAL_GLYPHS: Record<string, GlyphName> = {
  elevation: "mountain",
  steepness: "crag",
  water: "water",
  trees: "tree",
  asphalt: "tarmac",
};

/** THE PAGE. */
export function RoamPage({
  race,
  onRace,
  seed,
  onSeed,
  onNext,
  onBack,
  progress,
  onLevel,
  picking,
  onPicking,
  onMapRect,
  mapView,
}: RoamProps) {
  // Which campaign stage these settings are standing on, derived rather than
  // remembered: the moment the seed is stepped or a dial moved, this is a
  // different road and the row says so on its own. A flag carried alongside
  // the settings would have had to be cleared by every control on the page,
  // and would eventually have been left set by one of them.
  const level = levelForRoad(seed, race.length, race.shape, race.knobs);

  if (picking) {
    return (
      <StagePicker
        loaded={level?.id ?? null}
        back="ROAM"
        progress={progress}
        onPick={(picked) => {
          onLevel(picked);
          onPicking(false);
        }}
        onBack={() => onPicking(false)}
      />
    );
  }

  return (
    <div className="roam">
      {/* The way back and the page's name on one thin row across the top —
          the head every other menu page has, spelled out here because Roam
          is not a card over a backdrop and cannot use MenuHead's box.
          `data-nav-back` is what a controller's B presses (menu-nav.ts);
          without it B is dead on this page. */}
      <div className="roam-head">
        <button type="button" className="menu-back" data-nav-back onClick={onBack}>
          ‹ MENU
        </button>
        <span className="roam-title">
          <Glyph name="roam" />
          ROAM
        </span>
      </div>
      <div className="roam-split">
        {/* THE MAP IS THE PAGE. It frames the hole the renderer draws into
            and paints nothing across it — see map-pane.tsx. */}
        <MapPane onMapRect={onMapRect} view={mapView} full={false} />

        <div className="roam-side">
          {/* WHICH ROAD — the one press on this page that changes every
              setting at once, so it is a button across the column rather
              than a row among fourteen. It opens the CAMPAIGN'S OWN stage
              boxes (menu-levels.tsx), so a road is picked here by the same
              picture it is picked by on the ladder, and it wears the loaded
              stage's name once there is one: at that point it is a readout
              as much as a control. */}
          <button
            type="button"
            className={level ? "roam-pick roam-pick-on" : "roam-pick"}
            title="Load one of the campaign's own stages onto the map — then change anything about it and drive it"
            data-roam-level
            onClick={() => onPicking(true)}
          >
            <Glyph
              name={level ? (level.shape === "circuit" ? "circuit" : "sprint") : "trophy"}
              className="roam-pick-glyph"
            />
            <span className="roam-pick-name">
              {level ? level.name.toUpperCase() : "SELECT A LEVEL"}
            </span>
            <span className="roam-pick-go" aria-hidden="true">
              ›
            </span>
          </button>

          {/* R46 — HOW HARD THE ROAD IS: the one SLIDER on the page, and
              the one row that gets the whole width of the column.
              Difficulty is not three named places the way HILLS is — it is
              a scale, and what a player does with it is hunt the position
              where the stage is still just drivable, which is a thumb on a
              track and wants travel under it. It stands over the two
              columns rather than in one of them because it reaches into
              BOTH: it moves the corner vocabulary and the jumps of the
              left-hand column and the country's relief of the right — and
              the road's width, which is why there is no ROAD row under
              LAND any more. Two controls over one number is a fight nobody
              wins.

              It SETTLES rather than reporting every position it passes
              through: every value here is a different road, and a road is
              generated, compiled and stood up in the world. Handing over
              the twenty a drag crosses builds nineteen stages nobody asked
              to see, on the frames the thumb needed to move — the word
              says where the thumb is the whole way, and the map answers
              the moment it is let go. */}
          <div className="roam-diff">
            <FadeRow
              label="DIFFICULTY"
              glyph={challengeGlyph(race.knobs.challenge)}
              value={race.knobs.challenge}
              read={challengeWord}
              less="easier"
              more="harder"
              settle
              onChange={(challenge) => onRace({ ...race, knobs: { ...race.knobs, challenge } })}
            />
          </div>

          <div className="roam-knobs">
            {/* Two columns of groups on any screen with the width, packed by
                ROW COUNT rather than by subject order — six a side — so
                neither column ends short and the map keeps the rest. */}
            <div className="roam-knob-col">
              <KnobGroup title="STAGE" glyph="roam">
                <NumberRow
                  label="SEED"
                  glyph="dice"
                  value={seed}
                  min={1}
                  max={SEED_CEILING}
                  rollHint="Roll a seed nobody has driven"
                  onValue={onSeed}
                  onRoll={() => onSeed(1 + Math.floor(Math.random() * SEED_CEILING))}
                />
                <StepRow
                  label="LENGTH"
                  glyph="ruler"
                  stops={STAGE_LENGTH_OPTIONS}
                  value={race.length}
                  onPick={(length) =>
                    onRace({
                      ...race,
                      length,
                      // A road that never comes back cannot be lapped, so
                      // ENDLESS takes the shape with it rather than leaving
                      // a setup that half-means something.
                      shape: length === "endless" ? "sprint" : race.shape,
                    })
                  }
                />
                <StepRow
                  label="SHAPE"
                  glyph={race.shape === "circuit" ? "circuit" : "sprint"}
                  stops={STAGE_SHAPES}
                  value={race.shape}
                  onPick={(shape) =>
                    onRace({
                      ...race,
                      shape,
                      length:
                        shape === "circuit" && race.length === "endless" ? "medium" : race.length,
                    })
                  }
                />
              </KnobGroup>

              {/* The sky over it: the hour, what is coming down, and what
                  the country is dressed in. Only the weathers the COUNTRY
                  actually gets are offered (R40), which is why moving that
                  dial can take this one with it. */}
              <KnobGroup title="SKY" glyph="sun">
                <StepRow
                  label="TIME"
                  glyph="sun"
                  stops={TIMES_OF_DAY}
                  value={race.timeOfDay}
                  onPick={(timeOfDay) => onRace({ ...race, timeOfDay })}
                />
                <StepRow
                  label="WEATHER"
                  glyph="cloud"
                  stops={weathersOf(race.knobs.biome)}
                  value={race.weather}
                  onPick={(weather) => onRace({ ...race, weather })}
                />
                <StepRow
                  label="SEASON"
                  glyph="leaf"
                  stops={SEASONS}
                  value={race.season}
                  onPick={(season) => onRace({ ...race, season })}
                />
              </KnobGroup>
            </div>

            <div className="roam-knob-col">
              {/* THE COUNTRY, and the generator's dials over it: what the
                  seed BUILDS, with the map redrawing the moment one moves.
                  R40 leads, because every dial under it is read against it
                  — ALPINE is one thing in the taiga and another in the
                  desert — and because a country has its own weathers, so
                  moving it can take the sky's second row with it. */}
              <KnobGroup title="LAND" glyph="mountain">
                <StepRow
                  label="COUNTRY"
                  glyph="globe"
                  stops={BIOME_OPTIONS}
                  value={race.knobs.biome}
                  onPick={(biome) =>
                    onRace({
                      ...race,
                      knobs: { ...race.knobs, biome },
                      weather: weathersOf(biome).some((w) => w.id === race.weather)
                        ? race.weather
                        : "clear",
                    })
                  }
                />
                {STAGE_DIALS.map((dial) => (
                  <StepRow
                    key={dial.key}
                    label={dial.label}
                    glyph={DIAL_GLYPHS[dial.key]}
                    stops={dial.stops}
                    value={dialStop(dial.stops, race.knobs[dial.key])}
                    onPick={(id) => {
                      const stop = dial.stops.find((s) => s.id === id);
                      if (!stop) return;
                      onRace({ ...race, knobs: { ...race.knobs, [dial.key]: stop.value } });
                    }}
                  />
                ))}
              </KnobGroup>
            </div>
          </div>

          {/* THE WAY ON, pinned under the rows: it stays put while they
              scroll, because a green light that scrolls off the bottom of a
              column of fourteen settings is a green light nobody finds. */}
          <div className="roam-foot">
            <button type="button" className="menu-start" data-nav-next onClick={onNext}>
              <Glyph name="car" />
              CHOOSE A CAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
