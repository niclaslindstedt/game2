// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVELOPER'S HALF OF THE APP: Roam's map pane and the layer it is
// showing, the debug overlay's context and the boxes and REPRO line read
// off it, the photograph taken of either, and the options screen's own
// apply — which is here because most of what it changes is what these
// surfaces show.
//
// Made over the store the same way the run's actions are
// (`app-actions.ts`), and split from them because a stage being stood up
// and a map being framed are different jobs that happen to share a store.

import { useEffect, useMemo, useRef, useState } from "react";
import { status } from "@engine";

import { connectOutput } from "../output-bridge.ts";
import { debugBoxes, reproQuery, type DebugBox, type DebugContext } from "./debug-info.ts";
import { type RaceSettings } from "./menu.tsx";
import type { MapDebug } from "./menu-map-viewer.tsx";
import type { MapRect, MapView } from "./map-pane.tsx";
import { mapDebugBoxes, mapReproQuery } from "./map-debug.ts";
import { type MapLayerId, type MapLayerInfo } from "./map-layers.ts";
import { type CampaignLevel, campaignKnobs } from "./campaign.ts";
import { saveSettings, type Settings } from "./settings.ts";
import { setAudioVolumes } from "./audio/bus.ts";
import { playUi } from "./audio/ui.ts";
import { setRumble } from "./haptics.ts";
import { readHudLayer } from "./shot-hud.ts";
import { beginImageCopy, copiedWithin } from "../lib/share-image.ts";

connectOutput();

import { mapLayerFromUrl } from "./app-url.ts";
import { BUILD } from "./app-start.ts";

import type { RunStore } from "./app-store.ts";

export type MapActions = ReturnType<typeof useMapActions>;

export function useMapActions(store: RunStore, applyRace: (next: RaceSettings) => void) {
  const {
    audioRef,
    booted,
    fpsRef,
    gameRef,
    godRef,
    heldRef,
    input,
    mapRectRef,
    menu,
    menuRef,
    mirrorLiveRef,
    optionsRef,
    pickPlayCamera,
    playCameraRef,
    race,
    raceRef,
    rendererRef,
    seed,
    seedRef,
    setMenu,
    setMirrorLive,
    setOptions,
    setSeed,
    shotRef,
    stageRef,
    trackRef,
  } = store;

  const setMapRect = (rect: MapRect | null): void => {
    mapRectRef.current = rect;
    rendererRef.current?.setMapRect(rect);
  };

  /** Roam's map pane, driving the camera it is a window onto. Held in a memo
   * so the pane's native listeners are wired once rather than on every
   * re-render the menu does. */
  const mapView = useMemo<MapView>(
    () => ({
      onMove: (dAz, dPitch, zoomBy) => rendererRef.current?.nudgeMap(dAz, dPitch, zoomBy),
      onPan: (dxFrac, dyFrac) => rendererRef.current?.panMap(dxFrac, dyFrac),
      onReset: () => rendererRef.current?.resetMap(),
    }),
    [rendererRef],
  );

  /** THE DEVELOPER'S MAP (map-layers.ts): which of the generator's layers is
   * painted over the stage. Not persisted — a debug layer that came back
   * next launch would be a surprise rather than a tool. */
  const [mapLayer, setMapLayer] = useState<MapLayerId | null>(mapLayerFromUrl);
  /** What the painted layer measured, kept in a ref as well as in state: the
   * debug panel reads it four times a second off a closure that must not be
   * re-made on every frame, and the legend under the map renders off state. */
  const [mapInfo, setMapInfo] = useState<MapLayerInfo | null>(null);
  const mapInfoRef = useRef<MapLayerInfo | null>(null);
  mapInfoRef.current = mapInfo;

  // The layer follows the STAGE as well as the switch: stepping the seed or
  // moving a dial rebuilds the backdrop, and a layer sampled off the stage
  // before it is a layer describing a landscape that is no longer there.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    // The layers belong to the VIEWER and to nothing else: Roam is a page
    // for choosing a road to drive, and a stage painted in soil depths is
    // not a stage anybody is choosing by looking at. So the switch is read
    // there and nowhere else, which is what stops a layer left on in the
    // viewer following the player back onto Roam.
    const onViewer = menu?.page === "roam" && menu.viewing === true;
    setMapInfo(renderer.setMapLayer(onViewer ? mapLayer : null));
    // The idle turn is the MENU's decoration. Once the map is being READ it
    // holds still, because a reading that turns on its own cannot be
    // compared with the one taken before the change that is under test.
    renderer.holdMap(onViewer);
  }, [mapLayer, menu, seed, race, booted, rendererRef]);

  /** The boxes over the viewer's map, read fresh: the framing moves under
   * the hand, so this is a function rather than a value. Null before there
   * is a stage to describe. */
  const readMapDebug = (): { boxes: DebugBox[]; repro: string } | null => {
    const renderer = rendererRef.current;
    const spec = stageRef.current;
    const track = trackRef.current?.track;
    if (!renderer || !spec || !track) return null;
    const pose = renderer.mapPose();
    return {
      boxes: mapDebugBoxes(spec, track, pose, mapInfoRef.current, BUILD),
      repro: mapReproQuery(spec, pose, mapInfoRef.current?.id ?? null),
    };
  };
  const readMapDebugRef = useRef(readMapDebug);
  readMapDebugRef.current = readMapDebug;

  /** THE DEVELOPER MAP'S SHUTTER. The same request the driving shutter
   * leaves behind — the drawing buffer can only be read inside the frame
   * loop — with the boxes and the legend attached, so what lands in the roll
   * is a picture that already says which seed it is and what is painted on
   * it. Deliberately NOT behind the player's SCREENSHOTS option: that switch
   * is about the game's own camera, and a developer who opened this page has
   * asked for this one. The CLIPBOARD does follow the player's switch, and
   * is claimed inside the press for the same reason the shutter's is
   * (lib/share-image.ts). Resolves once the frame has been filed, which is
   * how the button reports back. */
  const takeMapShot = (): Promise<{ saved: boolean; copied: boolean }> =>
    new Promise((resolve) => {
      const read = readMapDebugRef.current();
      const info = mapInfoRef.current;
      const spec = stageRef.current;
      playUi("select");
      const copy = optionsRef.current.copyShots ? beginImageCopy() : null;
      shotRef.current = {
        label: `Map ${spec?.seed ?? seedRef.current}${info ? ` · ${info.label}` : ""}`,
        notes: read ? { boxes: read.boxes, repro: read.repro, legend: info?.legend ?? [] } : null,
        // Null every time in practice — the map is a menu page and the
        // driving HUD is not up over one — and asked anyway, so the two
        // shutters never disagree about what a picture is.
        sign: false,
        hud: readHudLayer(),
        done: (capture) => {
          if (!copy) {
            resolve({ saved: capture !== null, copied: false });
            return;
          }
          copy.settle(capture?.blob ?? null);
          void copiedWithin(copy).then((copied) => resolve({ saved: capture !== null, copied }));
        },
      };
    });
  const takeMapShotRef = useRef(takeMapShot);
  takeMapShotRef.current = takeMapShot;

  const mapDebug = useMemo<MapDebug>(
    () => ({
      layer: mapLayer,
      onLayer: setMapLayer,
      legend: mapInfo?.legend ?? [],
      read: () => readMapDebugRef.current(),
      onShot: () => takeMapShotRef.current(),
    }),
    [mapLayer, mapInfo, setMapLayer],
  );

  /** A CAMPAIGN STAGE, LOADED INTO ROAM. A level is a seed, a band, a shape
   * and the conditions it is set in — exactly what Roam's own settings are —
   * so picking one off the stage list is loading it into those settings
   * rather than a second stage pipeline. Everything already on that page
   * comes with it: the map and its layers, the pan, the zoom, the shutter,
   * the conditions, the car, and DRIVE IT.
   *
   * The dials are RESET rather than inherited. The campaign's stages are the
   * same country for everybody — they are built off the rule book's defaults
   * (see `playLevel`) — and a stage loaded onto whatever Roam happened to be
   * left on would be a road no player has ever driven wearing that stage's
   * name. Everything else here is a starting point the player may then move,
   * which is the whole reason this lands on Roam and not on a grid. */
  const loadRoamLevel = (level: CampaignLevel): void => {
    status(`${level.name} — loaded into Roam`);
    seedRef.current = level.seed;
    setSeed(level.seed);
    applyRace({
      ...raceRef.current,
      length: level.length,
      shape: level.shape ?? "sprint",
      knobs: campaignKnobs(level),
      hour: level.hour,
      weather: level.weather,
      season: level.season,
    });
    setMenu({ page: "roam" });
  };

  /** The chassis secret, found. It sticks: a player who drummed seven times
   * on purpose does not want to do it again next launch. */
  const revealDeveloper = (): void => {
    if (optionsRef.current.developer) return;
    status("Developer menu unlocked");
    applyOptions({ ...optionsRef.current, developer: true });
  };

  const applyOptions = (next: Settings): void => {
    // WHICH CAMERA A RUN OPENS ON is also which camera the run STANDING
    // RIGHT NOW is watched from: OPTIONS is reachable from the pause card,
    // and a view picked over a frozen frame that only takes effect on the
    // next stage reads as a setting that did not take. Only when the choice
    // MOVED — the camera key walks the same ladder without writing to
    // options, and re-seating the lens on every unrelated option change
    // would undo that walk. Behind a menu the drone and the map own the
    // view, so the pick waits for the cards to come down, the same rule god
    // mode's hold follows.
    const reframe = next.camera !== optionsRef.current.camera;
    // Switching the rear view back ON in the menu is a player asking to SEE
    // it, so a glass blanked in-game gets its picture back with it. The other
    // direction needs nothing: off, there is no mirror to be blanked.
    if (next.hud.mirror && !optionsRef.current.hud.mirror) {
      mirrorLiveRef.current = true;
      setMirrorLive(true);
    }
    setOptions(next);
    optionsRef.current = next;
    saveSettings(next);
    setAudioVolumes(next.audio);
    setRumble(next.rumble);
    input.setKeys(next.keys);
    input.setPad(next.pad);
    rendererRef.current?.setVideo(next.video);
    rendererRef.current?.setMirror(next.hud.mirror && mirrorLiveRef.current);
    rendererRef.current?.setNameTags(next.hud.on);
    rendererRef.current?.setView(next.view);
    if (reframe && !menuRef.current) {
      pickPlayCamera(next.camera);
      audioRef.current?.setView(next.camera);
      if (!godRef.current) rendererRef.current?.setCamera(next.camera);
    }
  };

  /** The debug snapshot the overlay renders and the log quotes. Null before
   * the renderer has landed or while no stage is standing. */
  const debugContext = (fps: number): DebugContext | null => {
    const renderer = rendererRef.current;
    const spec = stageRef.current;
    if (!renderer || !spec) return null;
    const pose = renderer.cameraPose();
    return {
      stage: spec,
      view: pose.mode,
      playCamera: playCameraRef.current,
      pose,
      god: pose.mode === "free",
      held: heldRef.current,
      fps,
      mirror: renderer.mirrorPace(),
      lamps: renderer.lampState(),
      build: BUILD,
    };
  };
  const debugContextRef = useRef(debugContext);
  debugContextRef.current = debugContext;

  /** The overlay's boxes and its repro line, read FRESH — the same pair the
   * map's `readMapDebug` hands back, for the driving half of the game.
   *
   * A function rather than the `debugCtx` state on purpose, and for two
   * reasons that both come down to timing. The state is only pushed while
   * the overlay is UP, so with the boxes switched off there is nothing in it
   * to copy; and it is pushed on the HUD's twelve-a-second tick, where the
   * camera this describes moves every frame. What a picture is captioned
   * with, and what a button copies, has to be the moment it was asked for.
   * Null before there is a stage to describe. */
  const readDebug = (): { boxes: DebugBox[]; repro: string } | null => {
    const ctx = debugContextRef.current(fpsRef.current);
    const state = gameRef.current;
    if (!ctx || !state) return null;
    return { boxes: debugBoxes(ctx, state), repro: reproQuery(ctx) };
  };
  const readDebugRef = useRef(readDebug);
  readDebugRef.current = readDebug;

  return {
    setMapRect,
    mapLayer,
    setMapLayer,
    mapInfo,
    setMapInfo,
    mapView,
    mapInfoRef,
    readMapDebug,
    readMapDebugRef,
    takeMapShot,
    takeMapShotRef,
    mapDebug,
    loadRoamLevel,
    revealDeveloper,
    applyOptions,
    debugContext,
    debugContextRef,
    readDebug,
    readDebugRef,
  };
}
