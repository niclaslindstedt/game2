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
// Four rows are deliberately NOT that silhouette, because what they hold is
// not a place on a three-stop ladder: DIFFICULTY (R46) is a scale, ALTITUDE
// (R47) is a span of metres running from a shoulder to six thousand, and
// OPPONENTS is a count, so all three are sliders; and the SEED is a number,
// so it can be walked, typed or rolled. All four are still the same row — a
// name, a mark, and a value between two arrows — which is the whole point of
// the shape.
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
import { HOURS, daylightAt, hourOfStop, hourStop } from "./daylight.ts";
import { MapPane, type MapRect, type MapView } from "./map-pane.tsx";
import { StagePicker } from "./menu-levels.tsx";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { FadeRow, KnobGroup, NumberRow, StepRow } from "./menu-knobs.tsx";
import {
  BIOME_OPTIONS,
  ROAM_OPPONENTS_MAX,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  altitudeLabel,
  duneLabel,
  hasAltitude,
  hasDunes,
  hasSandstorms,
  sandstormLabel,
  TEMPERATURE_RANGE,
  challengeGlyph,
  challengeWord,
  dialStop,
  opponentsWord,
  temperatureAir,
  temperatureLabel,
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
  peaks: "mountain",
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
          <div className="roam-slider">
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

          {/* WHO ELSE IS OUT THERE. The second slider on the page, and it
              sits under the first because the two are the same kind of
              question — how much is this run going to ask of you — and
              because neither belongs in a column of three-stop dials.
              Zero is where it stands: Roam is the road to yourself, and a
              field is something a player goes and asks for.

              It is a COUNT, so it steps in ones and every one of the
              thirty-two positions is landable (`FadeRow`'s range). The top
              of the travel is a long way past what the game is balanced
              for — thirty-two cars is thirty-two games stepped every frame
              and thirty-two bodies drawn, and it will cost frames on any
              machine — which is the whole reason it is offered as a
              TRAVEL rather than as three named stops: the position where
              a given machine gives up is the player's to find.

              Nothing here settles the way DIFFICULTY does, because nothing
              here rebuilds the stage: the same seed draws the same road
              whoever is standing on it, and all the field costs the map is
              the extra apron the grid stands on. */}
          <div className="roam-slider">
            <FadeRow
              label="OPPONENTS"
              glyph="headsup"
              value={race.roam.opponents}
              min={0}
              max={ROAM_OPPONENTS_MAX}
              step={1}
              nudge={1}
              read={opponentsWord}
              less="fewer"
              more="more"
              onChange={(opponents) =>
                onRace({ ...race, roam: { ...race.roam, opponents: Math.round(opponents) } })
              }
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
                {/* THE HOUR the stage starts at, on a clock — and the sun
                    moves from there at an hour a minute, so a stage set at
                    sunset is driven into the dark. What 16:00 LOOKS like is
                    the season's and the country's to say (daylight.ts): a
                    taiga winter afternoon is night by then, and the mark on
                    the row says which before the map does. */}
                <StepRow
                  label="HOUR"
                  glyph={
                    daylightAt(race.hour, race.season, race.knobs.biome) === "night"
                      ? "moon"
                      : "sun"
                  }
                  stops={HOURS}
                  value={hourStop(race.hour)}
                  onPick={(stop) => onRace({ ...race, hour: hourOfStop(stop) })}
                />
                <StepRow
                  label="WEATHER"
                  glyph="cloud"
                  stops={weathersOf(race.knobs.biome, race.season, race.temperature)}
                  value={race.weather}
                  onPick={(weather) => onRace({ ...race, weather })}
                />
                {/* The season reaches the ground (a winter is snow on the
                    road and a blanket beside it), and the season decides
                    what weathers the country has — the desert rains in its
                    winter — so moving it can take the row above with it.
                    It also hands the TEMPERATURE fader back to the season's
                    own air, which is the only way back to AUTO once the
                    fader has been moved. */}
                <StepRow
                  label="SEASON"
                  glyph="leaf"
                  stops={SEASONS}
                  value={race.season}
                  onPick={(season) =>
                    onRace({
                      ...race,
                      season,
                      temperature: null,
                      weather: weathersOf(race.knobs.biome, season).some(
                        (w) => w.id === race.weather,
                      )
                        ? race.weather
                        : "clear",
                    })
                  }
                />
                {/* THE COLD, at the valley floor — the air gets colder with
                    height from here (climate.ts). It stands at the season's
                    own in this country until it is moved: under freezing the
                    loose road is snow, the country lies under it, and the
                    rain above turns to flakes. Around zero the road glazes;
                    at -5 the lakes go over and the route may cross them;
                    deep cold bites. Settled, because every degree either
                    side of those lines rebuilds the stage. */}
                <FadeRow
                  label="TEMPERATURE"
                  glyph="thermometer"
                  value={temperatureAir(race.temperature, race.knobs.biome, race.season)}
                  min={TEMPERATURE_RANGE.min}
                  max={TEMPERATURE_RANGE.max}
                  step={1}
                  nudge={5}
                  read={temperatureLabel}
                  less="colder"
                  more="warmer"
                  settle
                  onChange={(air) => onRace({ ...race, temperature: air })}
                />
                {/* R40 — HOW OFTEN THE SAND COMES. Only over a country whose
                    wind picks the ground up and carries it, which today is
                    the desert and nowhere else — a gale through a rooted
                    forest is a gale and nothing more.

                    It reads as a PERIOD rather than as a position, because
                    "every three minutes" is a thing a player can weigh
                    against a stage length and "0.62" is not; and the bottom
                    of the travel reads OFF rather than a very long period,
                    because it is off. It does NOT settle, unlike the two
                    rows above it: the fronts blow across a road the seed
                    already built, so moving this rebuilds nothing. */}
                {hasSandstorms(race.knobs.biome) && (
                  <FadeRow
                    label="SANDSTORMS"
                    glyph="sandstorm"
                    value={race.sandstorms}
                    step={0.01}
                    nudge={0.05}
                    read={(sandstorms) => sandstormLabel(race.knobs.biome, sandstorms)}
                    less="rarer"
                    more="oftener"
                    onChange={(sandstorms) => onRace({ ...race, sandstorms })}
                  />
                )}
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
                      weather: weathersOf(biome, race.season).some((w) => w.id === race.weather)
                        ? race.weather
                        : "clear",
                    })
                  }
                />
                {/* R47 — HOW HIGH THE RACE IS, and the one row in this
                    column that is not a three-stop dial, for the same
                    reason DIFFICULTY is not: what it holds is a
                    MEASUREMENT — a number of metres, running from a worn
                    shoulder to six thousand — and three named stops on a
                    span like that would each be a different game. It only
                    appears over a country that HAS a mountain (R47),
                    which today is the alpine and nowhere else.

                    It reads in METRES rather than as a position, because
                    the metres are the whole idea: the mountain stands
                    that high over a valley floor that stays where it is,
                    so the number is also how far there is to fall off the
                    side of it. And it SETTLES, like the two sliders over
                    the map: every position is a different country, and a
                    drag across the track would build twenty of them. */}
                {hasAltitude(race.knobs.biome) && (
                  <FadeRow
                    label="ALTITUDE"
                    glyph="altitude"
                    value={race.knobs.altitude}
                    step={0.01}
                    nudge={0.05}
                    read={(altitude) => altitudeLabel(race.knobs, altitude)}
                    less="lower"
                    more="higher"
                    settle
                    onChange={(altitude) => onRace({ ...race, knobs: { ...race.knobs, altitude } })}
                  />
                )}
                {/* R40 — HOW HIGH THE SAND STANDS, and the LAND column's
                    other measurement row. Only over a country the wind has
                    piled any (`BiomeLand.dunes`).

                    Metres, and a MAXIMUM: what a full-grown dune stands
                    over the trough beside it where the erg is deepest, with
                    most of the country lower and the pans between the ergs
                    carrying none. The bottom of the travel is a desert
                    stripped to its rock; the top is the Empty Quarter. It
                    SETTLES, because every position of it is a different
                    country and a drag across the track would build fifty. */}
                {hasDunes(race.knobs.biome) && (
                  <FadeRow
                    label="DUNES"
                    glyph="dune"
                    value={race.knobs.dunes}
                    step={0.01}
                    nudge={0.05}
                    read={(dunes) => duneLabel(race.knobs, dunes)}
                    less="lower"
                    more="higher"
                    settle
                    onChange={(dunes) => onRace({ ...race, knobs: { ...race.knobs, dunes } })}
                  />
                )}
                {STAGE_DIALS.filter((dial) => !dial.biome || dial.biome === race.knobs.biome).map(
                  (dial) => (
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
                  ),
                )}
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
