// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVELOPER'S MAP VIEWER — a stage you are LOOKING at.
//
// The map fills the screen, the generator's own layers can be painted over
// the landscape, and everything the picture is of can be copied out as text
// or shot into the gallery with the boxes painted in. Nothing here helps
// anybody choose a stage to drive, which is exactly why none of it is on
// Roam any more: Roam is a stage you are choosing in order to drive it, and
// a row of layer buttons across the country is a row the country does not
// get.
//
// The two pages share the WINDOW (map-pane.tsx) and the stage list
// (menu-levels.tsx) and nothing else.

import { useEffect, useRef, useState } from "react";

import { copyText } from "../lib/copy-text.ts";
import { debugReport, type DebugBox } from "./debug-info.ts";
import { MapPane, type MapRect, type MapView } from "./map-pane.tsx";
import { MAP_LAYERS, type LegendStop, type MapLayerId } from "./map-layers.ts";
import { levelForRoad, type CampaignLevel, type CampaignProgress } from "./campaign.ts";
import { StagePicker } from "./menu-levels.tsx";
import { Glyph } from "./menu-glyphs.tsx";
import { playUi } from "./audio/ui.ts";
import type { RaceSettings } from "./menu.tsx";

/** THE DEVELOPER'S MAP: the stage's own layers painted over the landscape,
 * and the box that says what the picture is of. Everything here is behind
 * the developer switch — a player choosing a seed to drive is choosing it by
 * LOOKING at the country, and none of this helps them do that. */
export type MapDebug = {
  layer: MapLayerId | null;
  onLayer: (layer: MapLayerId | null) => void;
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
   * a caption typed under it. Resolves once it is filed, saying whether it
   * was filed and whether the clipboard took a copy: the picture exists to
   * be HANDED to somebody, and a paste is the shortest way there. */
  onShot: () => Promise<{ saved: boolean; copied: boolean }>;
};

/** The layer switch and the shutter, along the foot of the map. Laid over
 * the pane rather than beside it because the map IS this page — every row of
 * controls under it is a row the landscape does not get. */
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
        <MapShotButton map={map} />
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
          ({ saved, copied }) => {
            setSaid(saved ? (copied ? "SAVED · COPIED" : "SAVED TO GALLERY") : "FAILED");
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
 * It rides the page's HEADER rather than the tool row along the foot: the
 * foot row is the map's LAYERS, and a button that copies text is not a
 * layer. A glyph, because it is the only mark in the menus that stands on
 * its own — hence the label and the title, which every other glyph gets
 * from the word it sits beside. */
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

/** THE PAGE: the map, the layers, and the way to put a different road under
 * them. Nothing else — no car, no conditions, no dials, and no way onto the
 * road. What is being asked here is "what did the generator build", and
 * every control that is not part of that answer belongs on Roam. */
export function MapViewerPage({
  race,
  seed,
  onSeed,
  progress,
  onLevel,
  picking,
  onPicking,
  onMapRect,
  mapView,
  map,
  onBack,
}: {
  race: RaceSettings;
  seed: number;
  onSeed: (seed: number) => void;
  progress: CampaignProgress;
  /** Put one of the campaign's own stages under the layers. */
  onLevel: (level: CampaignLevel) => void;
  /** Whether the stage list is up over the map. It is the MENU's state
   * rather than this page's so that the escape key and the pad's B walk out
   * of it the way they walk out of everything else. */
  picking: boolean;
  onPicking: (picking: boolean) => void;
  /** Where the pane is, so the renderer can draw the stage into it. Null on
   * unmount — the map view goes back to full-bleed. */
  onMapRect: (rect: MapRect | null) => void;
  mapView: MapView;
  /** The tools. Null would mean a viewer reached without the developer
   * switch, which cannot happen from the menu — the page still stands, with
   * the map and the stage list, rather than refusing to render. */
  map: MapDebug | null;
  onBack: () => void;
}) {
  const level = levelForRoad(seed, race.length, race.shape, race.knobs);
  const step = (by: number): void => onSeed(Math.max(1, seed + by));
  if (picking) {
    return (
      <StagePicker
        loaded={level?.id ?? null}
        back="MAP VIEWER"
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
    <div className="roam roam-view">
      <div className="roam-split">
        <section className="roam-pane roam-pane-stage">
          {/* Everything this page has to say about itself rides the map's
              own header — the way out, the copy mark, which road is under
              the layers, and the seed. A bar above the pane would be a bar
              taken off the country. */}
          <div className="roam-pane-head">
            {/* `data-nav-back` is what a controller's B button presses (see
                menu-nav.ts). This page does not use MenuHead, so it carries
                the mark itself; without it B is dead here. */}
            <button type="button" className="menu-back" data-nav-back onClick={onBack}>
              ‹ DEVELOPER
            </button>
            {map && <MapCopyButton map={map} />}
            <button
              type="button"
              className={level ? "roam-level roam-level-on" : "roam-level"}
              title="Put one of the campaign's own stages on the map"
              data-roam-level
              onClick={() => onPicking(true)}
            >
              {/* The mark is the loaded stage's own SHAPE, and it is there
                  only when there is a stage to describe: a sprint arrow
                  beside the words SELECT LEVEL would be promising something
                  about a road nobody has picked yet. */}
              {level && <Glyph name={level.shape === "circuit" ? "circuit" : "sprint"} />}
              {level ? level.name.toUpperCase() : "SELECT LEVEL"}
            </button>
            {/* One stop on a controller's walk, arrows and number together. */}
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
          <MapPane onMapRect={onMapRect} view={mapView} full>
            {map && <MapTools map={map} />}
          </MapPane>
        </section>
      </div>
    </div>
  );
}
