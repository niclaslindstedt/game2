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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STAGE_RULES, circuitLapBand, type StageLength, type StageShape } from "@engine";

import { CarPicker } from "./car-picker.tsx";
import type { DebugBox } from "./debug-info.ts";
import { MAP_LAYERS, type LegendStop, type MapLayerId } from "./map-layers.ts";
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
  /** Walk the map sideways, in fractions of the pane the drag crossed. */
  onPan: (dxFrac: number, dyFrac: number) => void;
  /** Back to the framing that holds the whole stage. */
  onReset: () => void;
};

/** THE DEVELOPER'S MAP: the stage's own layers painted over the landscape,
 * the pane blown up to the whole screen, and the box that says what the
 * picture is of. Everything here is behind the developer switch — a player
 * choosing a seed to drive is choosing it by LOOKING at the country, and
 * none of this helps them do that. */
export type MapDebug = {
  layer: MapLayerId | null;
  onLayer: (layer: MapLayerId | null) => void;
  /** The pane, blown up to the whole viewport. */
  full: boolean;
  onFull: (full: boolean) => void;
  /** The ramp the painted layer is read against. */
  legend: LegendStop[];
  /** The boxes and the repro line, read fresh — the framing moves under the
   * hand, so the panel asks again a few times a second rather than being
   * handed a snapshot that is stale by the time it is painted. */
  read: () => { boxes: DebugBox[]; repro: string } | null;
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
  /** The developer's map tools, or null for everybody else. */
  map: MapDebug | null;
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
  full,
  children,
}: {
  onMapRect: (rect: MapRect | null) => void;
  view: MapView;
  /** Blown up to the whole viewport — the developer's full-screen map. */
  full: boolean;
  children?: ReactNode;
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
    /** ...and where the pair's midpoint was, so two fingers can WALK the map
     * as well as pinch it: the span is the zoom, the midpoint is the pan, and
     * the two are read off the same gesture because that is how a map is
     * handled everywhere else on a touchscreen. */
    let mid = { x: 0, y: 0 };
    const midOf = (): { x: number; y: number } => {
      const [a, b] = [...down.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    /** The pane's own size, for turning a drag in pixels into the fraction of
     * the view it crossed — which is what the camera pans in. */
    const paneW = (): number => el.clientWidth || 1;
    const paneH = (): number => el.clientHeight || 1;

    const onDown = (e: PointerEvent): void => {
      // The middle button is a pan here, not the browser's autoscroll.
      if (e.button === 1) e.preventDefault();
      el.setPointerCapture(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 2) {
        span = spanOf();
        mid = midOf();
      }
    };
    const onMove = (e: PointerEvent): void => {
      const was = down.get(e.pointerId);
      if (!was) return;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size >= 2) {
        // Two fingers: the SPAN zooms and the MIDPOINT walks. Turning on
        // either would spin the map every time a pinch was not perfectly
        // symmetric, which is every pinch.
        const now = spanOf();
        if (span > 0 && now > 0) viewRef.current.onMove(0, 0, span / now);
        span = now;
        const here = midOf();
        viewRef.current.onPan((here.x - mid.x) / paneW(), (here.y - mid.y) / paneH());
        mid = here;
        return;
      }
      const dx = e.clientX - was.x;
      const dy = e.clientY - was.y;
      // HOLD CMD/CTRL — or drag with the middle button — TO WALK THE MAP.
      // Turning is what a player wants (the stage is the subject and the
      // camera goes round it); panning is what somebody chasing a defect
      // wants, because the defect is not in the middle of the stage. Both
      // are the same drag, and the modifier picks between them.
      if (e.ctrlKey || e.metaKey || (e.buttons & 4) !== 0) {
        viewRef.current.onPan(dx / paneW(), dy / paneH());
        return;
      }
      // Drag the LAND: pulling right walks the camera the other way round the
      // stage, and pulling down lays the map flatter, toward the angle that
      // shows what the hills actually do.
      viewRef.current.onMove(-dx * DRAG_TURN, -dy * DRAG_TILT, 1);
    };
    const onUp = (e: PointerEvent): void => {
      down.delete(e.pointerId);
      span = down.size === 2 ? spanOf() : 0;
      if (down.size === 2) mid = midOf();
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // A trackpad's pinch arrives as a ctrl-held wheel, and a mouse wheel
      // held under the same key is the same gesture by hand: both are the
      // zoom this pane already had, so the modifier is spent on the DRAG
      // (above) rather than on inverting the wheel.
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
  // The developer's tools go in the same hole, which is why the pane takes
  // children at all: they belong to the map, so they have to move with it
  // when the pane is blown up to the whole screen.
  return (
    <div ref={ref} className={full ? "roam-map roam-map-full" : "roam-map"} aria-label="Stage map">
      <span className="roam-map-hint">DRAG TO TURN · TILT · ZOOM · ⌘/CTRL-DRAG TO PAN</span>
      {children}
    </div>
  );
}

/** The layer switch and the full-screen handle, along the foot of the map.
 * Laid over the pane rather than beside it because the map IS the page —
 * every row of controls under it is a row the landscape does not get. */
function MapTools({ map }: { map: MapDebug }) {
  return (
    <div className="map-tools">
      <div className="map-tool-row">
        <span className="map-tool-label">LAYER</span>
        <button
          type="button"
          className={map.layer === null ? "map-tool map-tool-on" : "map-tool"}
          onClick={() => map.onLayer(null)}
          data-map-layer="off"
        >
          OFF
        </button>
        {MAP_LAYERS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            className={map.layer === layer.id ? "map-tool map-tool-on" : "map-tool"}
            title={layer.hint}
            onClick={() => map.onLayer(layer.id)}
            data-map-layer={layer.id}
          >
            {layer.label}
          </button>
        ))}
        <button
          type="button"
          className={map.full ? "map-tool map-tool-on" : "map-tool"}
          onClick={() => map.onFull(!map.full)}
          data-map-full
        >
          {map.full ? "SHRINK" : "FULL SCREEN"}
        </button>
      </div>
      {map.legend.length > 0 && (
        <div className="map-legend">
          {map.legend.map((stop) => (
            <span key={stop.at} className="map-legend-stop">
              <i style={{ background: stop.color }} />
              {stop.at}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** How often the panel re-reads the framing, ms. The map turns and the pan
 * walks under the hand, so the numbers have to follow; four times a second
 * is faster than anyone reads and slower than anything that would cost the
 * frame it is describing. */
const PANEL_PERIOD = 250;

/** The box in the corner of a full-screen map: what the generator built,
 * what the painted layer measured of it, where this was seen from, and the
 * line that puts anybody else in front of the same picture. The whole point
 * of a screenshot of this page is that it needs no caption. */
function MapDebugPanel({ map }: { map: MapDebug }) {
  const [seen, setSeen] = useState(map.read);
  const readRef = useRef(map.read);
  readRef.current = map.read;
  useEffect(() => {
    const timer = setInterval(() => setSeen(readRef.current()), PANEL_PERIOD);
    return () => clearInterval(timer);
  }, []);
  if (!seen) return null;
  return (
    <div className="map-debug">
      <div className="map-debug-boxes">
        {seen.boxes.map((box) => (
          <div key={box.title} className="debug-box">
            <div className="debug-box-title">{box.title}</div>
            {box.rows.map((row) => (
              <div key={row.k} className="debug-row" data-k={row.k}>
                <span className="debug-row-k">{row.k}</span>
                <span className="debug-row-v">{row.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="debug-repro map-debug-repro">
        <span className="debug-repro-label">REPRO</span>
        <code className="debug-repro-text">{seen.repro}</code>
      </div>
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
  map,
}: RoamProps) {
  const lengthIndex = Math.max(
    0,
    STAGE_LENGTH_OPTIONS.findIndex((l) => l.id === race.length),
  );
  const step = (by: number): void => onSeed(Math.max(1, seed + by));

  return (
    <div className={map?.full ? "roam roam-full" : "roam"}>
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
          <MapPane onMapRect={onMapRect} view={mapView} full={map?.full ?? false}>
            {map && (
              <>
                <MapTools map={map} />
                {map.full && <MapDebugPanel map={map} />}
              </>
            )}
          </MapPane>
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
