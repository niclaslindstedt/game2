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
//
// It is also a CONTROL: the pane hands drags, wheels and pinches to the map
// camera, so "alpine" is something the player tilts down to and sees for
// themselves rather than a word they have to take on trust.

import { useEffect, useRef } from "react";
import { STAGE_RULES, circuitLapBand, type StageLength, type StageShape } from "@engine";

import { CarPicker } from "./car-picker.tsx";
import {
  OptionRow,
  STAGE_DIALS,
  STAGE_LENGTH_OPTIONS,
  STAGE_SHAPES,
  SEASONS,
  TIMES_OF_DAY,
  WEATHERS,
  dialStop,
  type RaceSettings,
} from "./menu.tsx";

export type MapRect = { x: number; y: number; width: number; height: number };

/** How far the map turns and tilts per pixel dragged, radians. */
const DRAG_TURN = 0.006;
const DRAG_TILT = 0.004;
/** Wheel travel to zoom: the standoff is multiplied by e^(deltaY · this), so
 * a notch either way is the same proportion in and out, and a trackpad's
 * fine-grained deltas stay fine-grained. */
const WHEEL_ZOOM = 0.0016;

export type MapView = {
  /** Turn, tilt and zoom the map camera (radians, radians, multiplier). */
  onMove: (dAz: number, dPitch: number, zoomBy: number) => void;
  /** Back to the framing that holds the whole stage. */
  onReset: () => void;
};

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
  mapView: MapView;
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

/** The window onto the map, and the handle on it.
 *
 * It draws nothing itself: it measures where it is and hands that up, and
 * the canvas behind shows through the hole. Measured with a ResizeObserver
 * rather than once on mount, because the pane MOVES whenever the card
 * reflows — a rotation, a length label growing a second line, a phone's URL
 * bar retracting — and a map drawn where the pane used to be is worse than
 * no map at all.
 *
 * Its input is wired natively rather than through JSX props for two reasons
 * a synthetic handler cannot give: a wheel listener has to be non-passive to
 * stop the page scrolling under the gesture, and a drag has to survive the
 * pointer leaving the pane, which is what setPointerCapture is for. */
function MapPane({
  onMapRect,
  view,
}: {
  onMapRect: (rect: MapRect | null) => void;
  view: MapView;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reportRef = useRef(onMapRect);
  reportRef.current = onMapRect;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const box = el.getBoundingClientRect();
      reportRef.current({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    measure();
    // A resize can move the pane without resizing it (the card recentres),
    // and on a phone the whole split SCROLLS under it — neither is a resize
    // of the pane, so the observer alone would leave the map drawn where the
    // pane used to be. Scroll is captured, because the element that scrolls
    // is an ancestor and scroll does not bubble.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("scroll", measure, true);

    /** Every finger or button currently down on the pane, so a second one
     * turns the drag into a pinch without losing the first. */
    const down = new Map<number, { x: number; y: number }>();
    /** The last pinch span, px — 0 while there is nothing to compare to. */
    let span = 0;
    const spanOf = (): number => {
      const [a, b] = [...down.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e: PointerEvent): void => {
      el.setPointerCapture(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 2) span = spanOf();
    };
    const onMove = (e: PointerEvent): void => {
      const was = down.get(e.pointerId);
      if (!was) return;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size >= 2) {
        // Two fingers: the SPAN is the whole gesture. Turning on it as well
        // would spin the map every time a pinch was not perfectly symmetric.
        const now = spanOf();
        if (span > 0 && now > 0) viewRef.current.onMove(0, 0, span / now);
        span = now;
        return;
      }
      // Drag the LAND: pulling right walks the camera the other way round the
      // stage, and pulling down lays the map flatter, toward the angle that
      // shows what the hills actually do.
      viewRef.current.onMove(-(e.clientX - was.x) * DRAG_TURN, -(e.clientY - was.y) * DRAG_TILT, 1);
    };
    const onUp = (e: PointerEvent): void => {
      down.delete(e.pointerId);
      span = down.size === 2 ? spanOf() : 0;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      viewRef.current.onMove(0, 0, Math.exp(e.deltaY * WHEEL_ZOOM));
    };
    const onDouble = (): void => viewRef.current.onReset();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDouble);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("scroll", measure, true);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDouble);
      reportRef.current(null);
    };
  }, []);

  // The hint lives INSIDE the pane, in the corner of the thing it is about.
  // It must not eat the gesture it advertises, hence pointer-events: none.
  return (
    <div ref={ref} className="roam-map" aria-label="Stage map">
      <span className="roam-map-hint">DRAG TO TURN · TILT · ZOOM</span>
    </div>
  );
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
  mapView,
}: RoamProps) {
  const lengthIndex = Math.max(
    0,
    STAGE_LENGTH_OPTIONS.findIndex((l) => l.id === race.length),
  );
  const step = (by: number): void => onSeed(Math.max(1, seed + by));

  return (
    <div className="roam">
      <div className="roam-split">
        <section className="roam-pane roam-pane-stage">
          {/* The way back and the page's name ride on the stage pane's own
              header rather than a bar above it: a row that carries two words
              is a row taken off the map, which is the page. The button says
              where it GOES, in the same chrome every other page's does — an
              arrow on its own is a shorthand only this page speaks.

              `data-nav-back` is what a controller's B button presses — see
              menu-nav.ts. This page does not use MenuHead, so it has to
              carry the mark itself; without it B is dead on Roam. */}
          <div className="roam-pane-head">
            <button type="button" className="menu-back" data-nav-back onClick={onBack}>
              ‹ MENU
            </button>
            <span className="roam-title">ROAM</span>
            <span className="roam-seed">
              <span className="roam-pane-title">SEED</span>
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
          <MapPane onMapRect={onMapRect} view={mapView} />
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
        </section>

        <div className="roam-column">
          {/* The way on, at the TOP of the column. Everything under it is a
              choice you may or may not want to make; this is the one thing
              the page is for, and a player who wants none of them should not
              have to travel past all of them to leave. */}
          <button type="button" className="menu-start" onClick={onStart}>
            DRIVE IT
          </button>

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
            <OptionRow
              label="SEASON"
              options={SEASONS}
              value={race.season}
              onPick={(season) => onRace({ ...race, season })}
            />
          </section>

          <section className="roam-pane">
            <span className="roam-pane-title">STAGE</span>
            {/* The generator's dials: what the seed BUILDS, with the map
                redrawing the moment one moves. They sit in the COLUMN rather
                than under the map, because the map is the page and every row
                of controls laid across it is a row it does not get. SHAPE is
                one of them — and picking a circuit off ENDLESS moves the
                length too, because a road that never comes back cannot be
                lapped and a setup that half-means something is worse than
                one that moves. */}
            <div className="roam-dials">
              <OptionRow
                label="SHAPE"
                options={STAGE_SHAPES}
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
        </div>
      </div>
    </div>
  );
}
