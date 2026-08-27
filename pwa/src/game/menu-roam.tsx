// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Roam: drive any seed at all. Three panes — the STAGE, the CAR, and the
// CONDITIONS it is driven in — so each choice has a place of its own rather
// than a bar of controls stacked over the thing they are choosing.
//
// The stage pane is a WINDOW onto the 3D canvas underneath: the renderer
// draws the map view scissored to exactly that rectangle, turning, with the
// terrain, the lakes and the forest standing and the route drawn over the
// top of them (map-route.ts). So the choice is made by LOOKING at the
// landscape rather than by reading a number, and the pane reports its own
// geometry upward so the renderer knows where to put it.

import { useEffect, useRef } from "react";
import { STAGE_RULES, circuitLapBand, type StageLength, type StageShape } from "@engine";

import { CarPicker } from "./car-picker.tsx";
import {
  OptionRow,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  TIMES_OF_DAY,
  WEATHERS,
  dialStop,
  type RaceSettings,
} from "./menu.tsx";

export type MapRect = { x: number; y: number; width: number; height: number };

type RoamProps = {
  race: RaceSettings;
  onRace: (race: RaceSettings) => void;
  seed: number;
  onSeed: (seed: number) => void;
  onStart: () => void;
  onBack: () => void;
  onDeveloper: () => void;
  /** Where the map pane is, so the renderer can draw the stage into it.
   * Null on unmount — the map view goes back to full-bleed. */
  onMapRect: (rect: MapRect | null) => void;
};

/** What a length band promises, for the slider's readout. An endless stage
 * has no band to quote — it keeps generating for as long as the run does,
 * and it is the one length a circuit cannot be built in. A circuit quotes
 * its LAP: the same minutes of driving, cut into three of them. */
function lengthBilling(length: StageLength, shape: StageShape): string {
  if (length === "endless") return "generates forever";
  const band = STAGE_RULES.stageLengths[length];
  if (shape === "circuit") {
    const lap = circuitLapBand(length);
    const laps = STAGE_RULES.circuit.laps;
    return `~${band.minutes} min · ${laps} × ${(lap.min / 1000).toFixed(1)}–${(lap.max / 1000).toFixed(1)} km`;
  }
  const { min, max } = band.band;
  return `~${band.minutes} min · ${(min / 1000).toFixed(1)}–${(max / 1000).toFixed(1)} km`;
}

/** The window onto the map. It draws nothing itself: it measures where it
 * is and hands that up, and the canvas behind shows through the hole.
 * Measured with a ResizeObserver rather than once on mount, because the
 * pane MOVES whenever the card reflows — a rotation, a length label growing
 * a second line, a phone's URL bar retracting — and a map drawn where the
 * pane used to be is worse than no map at all. */
function MapPane({ onMapRect }: { onMapRect: (rect: MapRect | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reportRef = useRef(onMapRect);
  reportRef.current = onMapRect;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const box = el.getBoundingClientRect();
      reportRef.current({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    measure();
    // A resize can move the pane without resizing it (the card recentres),
    // so the window listeners are not redundant with the observer.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      reportRef.current(null);
    };
  }, []);

  return <div ref={ref} className="roam-map" aria-label="Stage map" />;
}

export function RoamPage({
  race,
  onRace,
  seed,
  onSeed,
  onStart,
  onBack,
  onDeveloper,
  onMapRect,
}: RoamProps) {
  const lengthIndex = Math.max(
    0,
    STAGE_LENGTH_OPTIONS.findIndex((l) => l.id === race.length),
  );
  const step = (by: number): void => onSeed(Math.max(1, seed + by));

  return (
    <div className="roam">
      <div className="roam-head">
        <button type="button" className="menu-back" onClick={onBack}>
          ‹ MAIN MENU
        </button>
        <span className="roam-title">ROAM</span>
      </div>

      <div className="roam-split">
        <section className="roam-pane roam-pane-stage">
          <div className="roam-pane-head">
            <span className="roam-pane-title">STAGE</span>
            <span className="roam-seed">
              <button
                type="button"
                className="roam-step"
                onClick={() => step(-1)}
                aria-label="Previous seed"
              >
                ‹
              </button>
              <span className="roam-seed-value">{seed}</span>
              <button
                type="button"
                className="roam-step"
                onClick={() => step(1)}
                aria-label="Next seed"
              >
                ›
              </button>
            </span>
          </div>
          <MapPane onMapRect={onMapRect} />
          <div className="roam-length">
            <input
              className="roam-slider"
              type="range"
              min={0}
              max={STAGE_LENGTH_OPTIONS.length - 1}
              step={1}
              value={lengthIndex}
              aria-label="Stage length"
              onInput={(e) => {
                const length =
                  STAGE_LENGTH_OPTIONS[Number((e.target as HTMLInputElement).value)].id;
                onRace({
                  ...race,
                  length,
                  shape: length === "endless" ? "sprint" : race.shape,
                });
              }}
            />
            <span className="roam-length-read">
              <b>{STAGE_LENGTH_OPTIONS[lengthIndex].label}</b>
              {lengthBilling(race.length, race.shape)}
            </span>
          </div>
          {/* SHAPE sits with the dials, because it is one: it says what the
              seed BUILDS. Picking a circuit off ENDLESS moves the length
              too — a road that never comes back cannot be lapped, and a
              setup that half-means something is worse than one that moves. */}
          <div className="roam-dials">
            <OptionRow
              label="SHAPE"
              options={STAGE_SHAPES}
              value={race.shape}
              onPick={(shape) =>
                onRace({
                  ...race,
                  shape,
                  length: shape === "circuit" && race.length === "endless" ? "medium" : race.length,
                })
              }
            />
            {STAGE_DIALS.map((dial) => (
              <OptionRow
                key={dial.key}
                label={dial.label}
                options={dial.stops}
                value={dialStop(dial.stops, race.knobs[dial.key])}
                onPick={(id) => {
                  const stop = dial.stops.find((s) => s.id === id);
                  if (!stop) return;
                  onRace({ ...race, knobs: { ...race.knobs, [dial.key]: stop.value } });
                }}
              />
            ))}
          </div>
        </section>

        <div className="roam-column">
          <section className="roam-pane">
            <span className="roam-pane-title">CAR</span>
            <CarPicker
              carId={race.carId}
              onPick={(carId) => onRace({ ...race, carId })}
              onDeveloper={onDeveloper}
            />
          </section>

          <section className="roam-pane">
            <span className="roam-pane-title">CONDITIONS</span>
            <OptionRow
              label="TIME"
              options={TIMES_OF_DAY}
              value={race.timeOfDay}
              onPick={(timeOfDay) => onRace({ ...race, timeOfDay })}
            />
            <OptionRow
              label="WEATHER"
              options={WEATHERS}
              value={race.weather}
              onPick={(weather) => onRace({ ...race, weather })}
            />
          </section>

          <button type="button" className="menu-start" onClick={onStart}>
            DRIVE IT
          </button>
        </div>
      </div>
    </div>
  );
}
