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
import { debugReport, type DebugBox } from "./debug-info.ts";
import { MAP_LAYERS, type LegendStop, type MapLayerId } from "./map-layers.ts";
import { Glyph } from "./menu-glyphs.tsx";
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
import { playUi } from "./audio/ui.ts";
import { copyText } from "../lib/copy-text.ts";

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
   * hand, so this is asked at the moment it is wanted (the copy, the
   * shutter) rather than being handed a snapshot that is stale by the time
   * anything uses it. Null until there is a stage to describe. */
  read: () => { boxes: DebugBox[]; repro: string } | null;
  /** TAKE THE PICTURE: the whole screen, with the boxes and the repro line
   * painted INTO the pixels rather than left on the page — so what lands in
   * the roll is a report somebody can be handed, not a screenshot that needs
   * a caption typed under it. Resolves true once it is filed. */
  onShot: () => Promise<boolean>;
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

    /** Whether a press landed on one of the map's own CONTROLS rather than
     * on the map.
     *
     * This is load-bearing, and its absence is invisible until somebody
     * presses a button: the pane captures the pointer so a drag survives
     * leaving it (setPointerCapture), and a capture taken on a press that
     * started inside a child redirects that press's pointerup to the PANE —
     * so the child never completes a click, and the button is dead without
     * ever looking it. The developer strip lives inside the pane precisely
     * so it moves with it into full screen, which puts every one of its
     * buttons behind this check. */
    const onControl = (e: Event): boolean =>
      e.target instanceof Element && e.target.closest("[data-map-ui]") !== null;

    const onDown = (e: PointerEvent): void => {
      if (onControl(e)) return;
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
    // ...and two quick presses on a control are two presses of that control,
    // not a request to reframe the map underneath it.
    const onDouble = (e: MouseEvent): void => {
      if (!onControl(e)) viewRef.current.onReset();
    };

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

  // Everything the pane says about itself stacks along its FOOT, inside the
  // pane and therefore inside the frame: the gesture hint, then whatever
  // tools the caller put in it. The hint used to ride the top right corner,
  // where a phone's status bar and its rounded corner between them ate it —
  // it is the one row that has to be read before anything else here can be
  // used, so it goes where the rest of the controls are.
  //
  // The hint must not eat the gesture it advertises, hence pointer-events:
  // none. The developer's tools go in the same stack, which is why the pane
  // takes children at all: they belong to the map, so they move with it when
  // the pane is blown up to the whole screen.
  return (
    <div ref={ref} className={full ? "roam-map roam-map-full" : "roam-map"} aria-label="Stage map">
      <div className="roam-map-foot">
        <span className="roam-map-hint">DRAG TO TURN · TILT · ZOOM · ⌘/CTRL-DRAG TO PAN</span>
        {children}
      </div>
    </div>
  );
}

/** The layer switch and the full-screen handle, along the foot of the map.
 * Laid over the pane rather than beside it because the map IS the page —
 * every row of controls under it is a row the landscape does not get. */
function MapTools({ map }: { map: MapDebug }) {
  return (
    <div className="map-tools" data-map-ui>
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
        {/* The shutter is offered only on the FULL SCREEN map, and that is
            the honest limit rather than a tidiness rule: a picture is the
            whole drawing buffer, and in the small pane most of that buffer
            is the flat sky the menu's cards sit on with the map in a hole in
            the corner of it. */}
        {map.full && <MapShotButton map={map} />}
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

/** How long the shutter says what happened before going back to being a
 * button, ms. */
const SHOT_SAID = 2400;

/** The shutter, and the receipt. It says where the picture WENT as well as
 * that it was taken: this page is a menu, so the HUD's own flash — where
 * every other capture in the game reports itself — is not on screen, and a
 * button that silently did something is a button nobody presses twice. */
function MapShotButton({ map }: { map: MapDebug }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button
      type="button"
      className={said ? "map-tool map-tool-on" : "map-tool"}
      title="Save this map, with the debug boxes painted into the picture — it lands in the gallery"
      data-map-shot
      onClick={() => {
        setSaid("TAKING…");
        void map.onShot().then(
          (ok) => {
            setSaid(ok ? "SAVED TO GALLERY" : "FAILED");
            setTimeout(() => setSaid(null), SHOT_SAID);
          },
          () => {
            setSaid("FAILED");
            setTimeout(() => setSaid(null), SHOT_SAID);
          },
        );
      }}
    >
      {said ?? "SCREENSHOT"}
    </button>
  );
}

/** How often the button checks whether there is a stage to describe yet,
 * ms. It asks only until the answer is yes: the stage is built once and the
 * check exists to stop the button being pressed before then, not to follow
 * a framing that moves — what is copied is read at the press. */
const READY_PERIOD = 500;

/** COPY DEBUG INFO: what the generator built, what the painted layer
 * measured of it, where this was seen from, and the link that puts anybody
 * else in front of the same picture — as TEXT, on the clipboard.
 *
 * It replaced a panel that said all of the same things down the side of the
 * map, and the reason is what the map is FOR. The boxes were a caption on a
 * picture nobody was taking: two of them covered the quarter of the island
 * the defect was usually in, and a number read off a screen still has to be
 * typed out by hand before it can go in a report. So the facts go where
 * facts are wanted — in a paste — and the map gets its pixels back.
 *
 * A picture still gets the boxes: the SHUTTER on the tool row paints them
 * into it, which is the one place they cannot be selected and copied.
 *
 * It rides the PANE'S HEADER rather than the tool row along the foot, in
 * the slot the word ROAM had. Two reasons, and the second is the real one:
 * the foot row is the map's LAYERS, and a button that copies text is not a
 * layer; and a developer looking at this page does not need to be told
 * which page it is, so the slot was a word wide and said nothing. A glyph,
 * because it is the only mark in the menus that stands on its own — hence
 * the label and the title, which every other glyph gets from the word it
 * sits beside. */
function MapCopyButton({ map }: { map: MapDebug }) {
  const [said, setSaid] = useState<string | null>(null);
  const [ready, setReady] = useState(() => map.read() !== null);
  const readRef = useRef(map.read);
  readRef.current = map.read;
  useEffect(() => {
    if (ready) return;
    const timer = setInterval(() => setReady(readRef.current() !== null), READY_PERIOD);
    return () => clearInterval(timer);
  }, [ready]);
  return (
    <button
      type="button"
      className={said ? "map-copy map-copy-on" : "map-copy"}
      title="Copy the stage, the layer's reading, the framing and the REPRO link as text"
      aria-label="Copy debug info"
      data-map-copy
      // What a headless pass waits on: the stage is generated on a worker's
      // own schedule, and until it lands there is nothing here to read.
      data-ready={ready ? "1" : "0"}
      disabled={!ready}
      onClick={() => {
        const read = readRef.current();
        if (!read) {
          setSaid("NO STAGE YET");
          setTimeout(() => setSaid(null), SHOT_SAID);
          return;
        }
        playUi("select");
        // The whole URL rather than the query alone: this text is going
        // somewhere else — a chat, an issue, another agent's prompt — and a
        // query string on its own is only a link to whoever already knows
        // which build it came off.
        const url = `${location.origin}${location.pathname}${read.repro}`;
        void copyText(debugReport(read.boxes, url)).then((ok) => {
          setSaid(ok ? "COPIED" : "COPY FAILED");
          setTimeout(() => setSaid(null), SHOT_SAID);
        });
      }}
    >
      <Glyph name="clipboard" />
      {/* The receipt still gets words. A glyph can say "copy this"; nothing
          drawn in a 24 px box can say COPY FAILED, and a button that
          silently did nothing is the one this page cannot afford. */}
      {said && <span className="map-copy-said">{said}</span>}
    </button>
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
            {/* The page's name — or, once the developer switch is on, the
                button that copies what the map is looking at. A developer
                standing in front of this page does not need to be told
                which page it is, and the slot was a word wide. */}
            {map ? <MapCopyButton map={map} /> : <span className="roam-title">ROAM</span>}
            {/* One stop on a controller's walk, arrows and number together
                — the same `data-nav-steps` group the car's stand is. */}
            <span className="roam-seed" data-nav-steps>
              <span className="roam-pane-title">SEED</span>
              <button
                type="button"
                className="roam-step"
                data-nav-step="left"
                onClick={() => step(-1)}
                aria-label="Previous seed"
              >
                ‹
              </button>
              <span className="roam-seed-value">{seed}</span>
              <button
                type="button"
                className="roam-step"
                data-nav-step="right"
                onClick={() => step(1)}
                aria-label="Next seed"
              >
                ›
              </button>
            </span>
          </div>
          <MapPane onMapRect={onMapRect} view={mapView} full={map?.full ?? false}>
            {map && <MapTools map={map} />}
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
          <button type="button" className="menu-start" data-nav-next onClick={onStart}>
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
