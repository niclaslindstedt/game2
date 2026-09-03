// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRE-RACE CARD — what stands between picking a stage and driving it,
// on every one of the four ways into a run: the campaign's ladder, the time
// trial, heads up, and Roam. A player scanning six stage boxes — or turning
// a map round — is choosing a ROAD; the car is a second decision and gets a
// screen of its own. Everything specific to the surface it was reached from
// is passed in (the title, the way back, the time to beat, what the green
// light says), so there is one card rather than four that drift.
//
// TWO THINGS ARE ON IT, and the layout says so: THE CAR, which is the
// decision, and THE TRANSMISSION, which is the only other thing the player
// brings to a stage the campaign has already authored. Everything else is
// four short readings beside the car — two figures and two bars — and the
// card is laid out around what they gave back: an eight-axis spec sheet
// filled the half of the screen the car should have been standing in, and
// nobody read past the third bar of it.
//
// Built the way the options page and the results card are: the way back and
// the page's title on one head row, the content under it in a column — or
// two, on a screen wide enough — and ONE caption bar at the foot that reads
// whatever is being looked at. That is why nothing here carries a footnote
// of its own: a sentence under every control is height on a phone, and
// height on a phone is the car getting smaller.

import { useEffect, useRef, useState } from "react";
import { carById, type CarSpec, type GearboxMode } from "@engine";

import { playToggle } from "./audio/ui.ts";
import { COUNT_SECONDS, countAt } from "../lib/count.ts";
import { formatTime } from "../lib/util.ts";
import { CarPicker } from "./car-picker.tsx";
import { carBars, carFacts, type CarFact } from "./car-stats.ts";
import { Caption } from "./menu-knobs.tsx";
import { GEARBOX_OPTIONS, MenuHead, type RaceSettings } from "./menu.tsx";
import type { Settings } from "./settings.ts";

/** THE TRANSMISSION, as the second-biggest thing on the card. It used to be
 * a segmented row of two chips with a footnote under it — the same control
 * the volume and the camera get — which billed the one mechanical choice a
 * player makes as a setting they had already scrolled past.
 *
 * Two boxes instead, each big enough to be pressed with a thumb, each
 * wearing what taking it buys. The full sentence goes to the card's caption
 * bar, which reads whichever box is being looked at.
 *
 * `data-nav-steps` makes the pair ONE stop on a controller's walk, with the
 * two boxes as its left and its right: sideways over the transmission is
 * the transmission changing, the same way sideways over the car is the next
 * car (menu-nav.ts). */
function GearboxPick({
  gearbox,
  onGearbox,
  onHint,
}: {
  gearbox: GearboxMode;
  onGearbox: (gearbox: GearboxMode) => void;
  onHint: (hint: string | null) => void;
}) {
  return (
    <section className="garage-box">
      <h3 className="knob-group-title">TRANSMISSION</h3>
      <div className="garage-boxes" data-nav-steps>
        {GEARBOX_OPTIONS.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            className={`garage-opt ${opt.id === gearbox ? "garage-opt-on" : ""}`}
            data-nav-step={i === 0 ? "left" : "right"}
            aria-pressed={opt.id === gearbox}
            onPointerEnter={() => onHint(opt.hint ?? null)}
            onFocus={() => onHint(opt.hint ?? null)}
            onClick={() => {
              // Up the ladder is up in pitch, the way every other switch in
              // the menus sounds (menu-knobs.tsx).
              playToggle(i > 0);
              onGearbox(opt.id);
              onHint(opt.hint ?? null);
            }}
          >
            <span className="garage-opt-name">{opt.label}</span>
            <span className="garage-opt-note">{opt.blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** ONE FIGURE, WHICH COUNTS. A number that swaps between two frames is a
 * number the player has to notice changed; one that rolls to its new value
 * is one they watch change — and that is the whole difference between the
 * transmission reading as a label and reading as a choice with a
 * consequence. The car's own arrows get it too: rowing through the roster
 * winds the top speed up and down rather than cutting between three
 * unrelated numbers.
 *
 * It is its own component so the frames it asks for repaint a number and
 * not the card: a rerender of the page walks the whole picker, and this one
 * runs sixty times in the half-second after every press.
 *
 * The maths is `lib/count.ts`; the clock is here, because the clock is the
 * only part of it that needs a browser. */
function Figure({ fact }: { fact: CarFact }) {
  // The value on screen, and the run currently carrying it somewhere. Refs,
  // because the frame loop owns them — `tick` exists only to ask for the
  // repaint, and reading state inside the loop would read the value the
  // effect closed over rather than the one being drawn.
  const shown = useRef(fact.value);
  const [, tick] = useState(0);
  useEffect(() => {
    const from = shown.current;
    if (from === fact.value) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const at = (now - start) / 1000;
      shown.current = countAt(from, fact.value, at);
      tick((n) => n + 1);
      if (at < COUNT_SECONDS) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fact.value]);
  return (
    <div className="garage-figure">
      <span className="garage-figure-label">{fact.label}</span>
      <span className="garage-figure-value">
        {shown.current.toFixed(fact.places)}
        <span className="garage-figure-unit">{fact.unit}</span>
      </span>
    </div>
  );
}

/** The readings, beside the car: two FIGURES saying what this car IS, and
 * four BARS saying what it is against the other two.
 *
 * Both halves are quoted through the box chosen above them, so pressing
 * MANUAL counts the numbers up and slides the bars under them in the same
 * beat, where the player is already looking. The bars compare with the rest
 * of the roster (car-stats.ts) rather than with zero, because three cars
 * within a few percent of each other on an absolute scale are three
 * identical full bars, which is a picture of nothing. */
function CarReadings({ spec, gearbox }: { spec: CarSpec; gearbox: GearboxMode }) {
  return (
    <>
      <div className="garage-figures">
        {carFacts(spec, gearbox).map((fact) => (
          <Figure key={fact.key} fact={fact} />
        ))}
      </div>
      <div className="garage-bars">
        {carBars(spec, gearbox).map((bar) => (
          <div key={bar.key} className="garage-bar">
            <span className="garage-bar-label">{bar.label}</span>
            <span className="garage-bar-track">
              <span
                className="garage-bar-fill"
                style={{ width: `${(bar.value * 100).toFixed(1)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export type CarSetupPageProps = {
  /** WHAT IS BEING SET UP FOR, named: the stage's own name off the grid, or
   * — on Roam, which has no grid — whichever road the map is standing on. */
  title: string;
  /** Where BACK goes, in words. The card is reached from four surfaces, and
   * a way out that names the wrong one is worse than one that names none. */
  backLabel: string;
  /** THE TIME TO BEAT, where the stage has one. Absent on Roam: a run built
   * out of dials is not a run on the same road as anybody's record. */
  best?: number;
  /** What the green light says. The campaign starts a stage; Roam has been
   * choosing a road for a whole screen and is finally driving it. */
  startLabel?: string;
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBack: () => void;
  onStart: () => void;
  onDeveloper: () => void;
};

export function CarSetupPage({
  title,
  backLabel,
  best,
  startLabel = "START",
  race,
  onRace,
  settings,
  onSettings,
  onBack,
  onStart,
  onDeveloper,
}: CarSetupPageProps) {
  const spec = carById(race.carId);
  // Whatever the pointer or the cursor is on, or the car's own line of
  // billing while it is on neither. The blurb is the right thing to fall
  // back to: it is what the card would say if it could only say one thing.
  const [hint, setHint] = useState<string | null>(null);
  return (
    <div className="menu-card menu-card-wide menu-card-garage">
      {/* THE STAGE IS ALREADY CHOSEN by the time this card is up, and its
          name is all that is left to say about it: what the road is like and
          how long it runs are what the grid's boxes are FOR, and repeating
          them here is a line of the card spent re-answering the question the
          player has just finished answering. What survives is the one fact
          the grid could not carry into the decision being made now — the
          time to beat. The location is not repeated either; the way back
          names it. */}
      <MenuHead
        back={onBack}
        backLabel={backLabel}
        title={title}
        aside={
          best === undefined ? undefined : (
            // THE TIME TO BEAT, read as a figure rather than as billing: it
            // is the same kind of thing as the two readings under the car
            // and it is what the whole card is being set up against, so on
            // any screen with the width for it, it stands in the head's own
            // corner where a scoreboard would put it.
            <div className="garage-best">
              <span className="garage-best-label">BEST</span>
              <span className="garage-best-time">{formatTime(best)}</span>
            </div>
          )
        }
      />
      <div className="garage">
        {/* THE CAR takes the room. It is the only thing on this card that
            cannot be said in words, and the one the whole screen exists to
            choose — so it is the column that grows when there is more
            screen, and the readings beside it stay the size they need to
            be read at. */}
        <div className="garage-car">
          <CarPicker
            carId={race.carId}
            onPick={(carId) => onRace({ ...race, carId })}
            cursor
            onDeveloper={onDeveloper}
          />
          {/* The card's ONE sentence, standing in the picture under the car
              the way the name stands over it. It reads the car's own billing
              until the pointer or the cursor finds something with more to
              say — which on this card is the transmission. Inside the frame
              rather than under it because a line of prose on a row of its
              own is a row of the card's height, and the space below a car on
              its stand is space the shot is not using. */}
          <Caption text={hint} fallback={spec.blurb} />
        </div>
        {/* THE TRANSMISSION LEADS the column beside the car, and the two
            figures sit directly under it: the choice is above the numbers
            it moves, so pressing MANUAL changes something the eye is
            already on. Under them, the two bars — the only things on the
            card no choice on it can change. */}
        <div className="garage-spec">
          <GearboxPick
            gearbox={settings.gearbox}
            onGearbox={(gearbox) => onSettings({ ...settings, gearbox })}
            onHint={setHint}
          />
          <CarReadings spec={spec} gearbox={settings.gearbox} />
        </div>
      </div>
      {/* The controller's two marks (menu-nav.ts): the cursor lands on the
          CAR — sideways over the stand is the next car and the previous
          one, which is the whole decision this card exists for — while
          START, the pad button, takes the green light from wherever the
          cursor happens to be standing. */}
      <button type="button" className="menu-start" data-nav-next onClick={onStart}>
        {startLabel}
      </button>
    </div>
  );
}
