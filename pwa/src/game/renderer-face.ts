// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE RENDERER IS, from outside: the handle the app holds
// (`GameRenderer`) — every lever the game has over the picture, from the
// camera and the video options down to the one photograph the player takes
// — plus the small tables of colour and size the frame's effects are
// thrown from.
//
// `renderer.ts` builds one.

import * as THREE from "three";
import { type GameEvent, type GameState } from "@engine";

import { type CameraMode, type MapPose } from "./camera.ts";
import type { FreeFlyMove, FreeFlyPose } from "./camera-free.ts";
import { type VideoSettings, type ViewSettings } from "./settings.ts";
import type { FrameCost, SceneShare } from "./benchmark-report.ts";
import { type DustTint } from "./dust.ts";
import type { LampStage } from "./daylight.ts";
import { type FieldCars } from "./field-cars.ts";
import { type Clap } from "./weather.ts";
import { TRUNK_COLOR } from "./flora.ts";
import { type MapLayerId, type MapLayerInfo } from "./map-layers.ts";
import { type MirrorTier } from "./mirror-pace.ts";
import { type RivalRun } from "./standings.ts";

/** How much of the map pane's width the route ribbon may cover before it
 * stops being an annotation and starts being the picture — see where it is
 * hidden in the frame loop. An eighth is already a fat line; past that the
 * ground it is drawn on has disappeared under it. */
export const ROUTE_SHARE = 0.12;

/** The map view's fog, as fractions of the camera's standoff distance. The
 * island's coastline is a deliberate edge (map-island.ts), so the fog is
 * not there to hide it — it starts past the near shore and only ever thins
 * the far half, which is the aerial haze that tells the two apart. */
export const MAP_FOG_NEAR = 1.15;
export const MAP_FOG_FAR = 2.2;

/** Water thrown by the car itself, rather than off a wheel. A displaced
 * mass of water is not one color: it is lake with white torn through it,
 * and the white is what makes a column read as a splash instead of a blue
 * puff — so half the droplets are foam. */
export const WATER_DROPS: DustTint = { base: 0x86c4f4, fleck: 0xffffff, fleckMix: 0.5 };
/** ...and the froth on the surface after it, which is nearly all white —
 * a shade of the lake left in it so it belongs to the water it sits on. */
export const FOAM: DustTint = { base: 0xeaf5ff, fleck: 0xb6d6f0, fleckMix: 0.35 };
/** How fast a car has to meet water for the splash to be as big as it
 * gets, m/s. */
export const SPLASH_FULL = 26;
/** How hard the wheels have to arrive for a landing to be as big as it
 * gets, m/s of descent the springs had to swallow — a proper moon shot off
 * a two-metre lip comes down at about this. */
export const SLAM_FULL = 11;
/** ...and the share of that a landing is worth however gently it arrives.
 * A CAR IS HEAVY: a ton and a half dropping the last few centimetres off a
 * kerb still lands with a bang, and a small jump that registers as nothing
 * at all is the one thing a jump must never do. */
export const SLAM_FLOOR = 0.34;
/** A trunk giving way: pale splintered wood with the bark's own brown torn
 * through it. Nothing else in the game throws wood, and a stone-grey burst
 * off a tree reads as the tree having been made of concrete. */
export const SPLINTERS: DustTint = { base: 0xc9b892, fleck: TRUNK_COLOR, fleckMix: 0.35 };
/** ...and a window going: pale glass, thrown everywhere at once. */
export const GLASS_SHARDS = 0xd4e4f0;
/** HOW BIG THAT BURST IS. `grains` and `spread` are a window popping out of
 * its seal — the least a pane can leave with; `moreGrains` and `moreSpread`
 * are what a pane let go of at `shedFull` m/s adds on top, which is about
 * what a car that came down on that side throws (`mounts.shedSpeed`). The
 * spread is in m/s and is the burst's own, on top of the car's motion. */
export const GLASS_BURST = {
  grains: 18,
  moreGrains: 34,
  spread: 3.4,
  moreSpread: 4.6,
  shedFull: 12,
};

/** Where each pane sits on the car, m off its own axes, for the burst it
 * leaves behind: along the nose, out to the ENGINE's right, and up. */
export const GLASS_AT: Partial<Record<string, { fwd: number; side: number; up: number }>> = {
  glassF: { fwd: 0.9, side: 0, up: 1.15 },
  glassB: { fwd: -1.2, side: 0, up: 1.15 },
  glassR: { fwd: 0, side: 0.85, up: 1.05 },
  glassL: { fwd: 0, side: -0.85, up: 1.05 },
};

/** ENGINE SMOKE, off the bonnet of a car whose engine the crash has
 * reached. `every` is seconds between puffs at the DAMAGED line and at a
 * dead engine; the colour runs from steam to soot between the same two;
 * `bay` is where the engine is, as a point on the shell (`car-anchor.ts`);
 * `rise` is how fast a puff climbs off it, m/s. */
export const ENGINE_SMOKE = {
  every: { first: 0.16, dead: 0.03 },
  steam: new THREE.Color(0xd9dde2),
  soot: new THREE.Color(0x2b2c2e),
  bay: { along: 1.25, across: 0, up: 0.85 },
  rise: 0.9,
};

export type GameRenderer = {
  setGame: (state: GameState) => void;
  /** Swap the car under an already-built stage, leaving the world standing:
   * what the menu does when the player picks a different one. */
  setCar: (state: GameState) => void;
  /** Apply the player's video options. Resolution, draw distance and the
   * effects budget take hold immediately; flora density is baked into the
   * geometry, so it lands on the next stage built. */
  setVideo: (video: VideoSettings) => void;
  /** Place the camera: the two play modes come from the camera key, the
   * drone and map views are placed by the menu behind it. */
  setCamera: (mode: CameraMode) => void;
  /** Show or hide the rear-view mirror. Off is a whole render pass the frame
   * does not pay for — which is why there are two ways to reach it and only
   * one switch here: the HUD option says whether the game has a mirror, and
   * the tap on the glass itself (hud-mirror.tsx) folds the one it has away
   * for a while. Neither is this module's business; both arrive as `on`. */
  setMirror: (on: boolean) => void;
  /** Seat, lens and head motion for the three views taken from inside the
   * car (OPTIONS ▸ VIEW). Applies to the frame after it, every time: these
   * are numbers a player moves while looking at what they do. */
  setView: (view: ViewSettings) => void;
  /** Confine the map view to a rectangle of the canvas, in CSS pixels from
   * its top-left — the Roam page's map pane. The rest of the canvas is left
   * as flat sky for the DOM cards to sit on. Null draws full-bleed. */
  setMapRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  /** Turn, tilt and zoom the map view — a drag or a wheel over the pane. */
  nudgeMap: (dAz: number, dPitch: number, zoomBy: number) => void;
  /** Walk the map sideways — a modifier-held drag, or two fingers. The
   * deltas are fractions of the pane the drag crossed. */
  panMap: (dxFrac: number, dyFrac: number) => void;
  /** Put the map back on the framing that shows the whole stage. */
  resetMap: () => void;
  /** Paint one of the stage's own layers over the map view, or null to take
   * them off (map-layers.ts) — the developer's X-ray on the generator.
   * Returns what the layer measured, for the debug box to print. */
  setMapLayer: (id: MapLayerId | null) => MapLayerInfo | null;
  /** Stop the map's idle turn, and let it go again. The turn is the menu's
   * decoration; the developer's map is a MEASUREMENT, and two screenshots of
   * one that kept turning are two different pictures. */
  holdMap: (held: boolean) => void;
  /** Park the map view where a link says it was — the map's own repro. */
  placeMap: (pose: Partial<MapPose>) => void;
  /** Put a different lens on god mode's camera, deg of vertical fov — what
   * `?freefov=` asks for, so a tool can shoot a wide panorama without the
   * horizontal field opening up into a fisheye. 0 restores the design lens. */
  setFreeFov: (deg: number) => void;
  /** Hold the TV mode on its trackside tripods rather than letting its
   * director cut between them and the boom (camera-tv-cut.ts) — the pin a
   * scripted still needs to come off the same lens every time. */
  pinTvStand: () => void;
  /** OPEN THE AIR to `far` metres — what `?air=` asks for. Moves the three
   * numbers that decide how much country is on screen together, because
   * moving one alone does nothing: the fog (or the country fades out), the
   * camera's far plane (or it is not drawn at all), and with them the road
   * chunks, which `cull` keeps exactly as far as the fog reaches. 0 puts the
   * driving values back.
   *
   * It is for STILLS. Drawing kilometres of road and forest is the cost the
   * fog exists to avoid, and a run cannot pay it — a preview taken once can. */
  setAir: (far: number) => void;
  /** Where the map view is standing, for the debug box and its repro line. */
  mapPose: () => MapPose;
  /** Re-light an already-built stage (the pre-race menu flipping time of
   * day / weather) without rebuilding its geometry. */
  setConditions: (state: GameState) => void;
  /** Compile every shader the standing scene needs, so none of them is
   * compiled during the race. Called from behind the loading card. */
  warm: () => void;
  /** What to do when a clap of thunder arrives. The storm is drawn here and
   * heard elsewhere: the renderer knows WHEN and how far away, the audio
   * knows what that sounds like. */
  onThunder: (play: (clap: Clap) => void) => void;
  /** ...and the same arrangement for the light things the car drives
   * through — a marshal's cone, a marker post. Neither is an engine prop,
   * so nothing in `step()` ever reports one: the renderer is where they are
   * knocked over and therefore the only place that knows they made a noise.
   * `speed` is how fast the piece left, m/s. */
  onKnock: (play: (speed: number) => void) => void;
  /** Put a ghost on the road — the best run on this stage, replaying its
   * own game beside the player's. The renderer keeps the reference and
   * draws whatever it says every frame; null takes it off again. */
  setGhost: (state: GameState | null) => void;
  /** The ghost's own events, spent on ITS body alone: it crumples and
   * sheds parts the way the run did, and throws no dust, no camera kick
   * and no sound, because none of that happened here. */
  onGhostEvents: (state: GameState, events: GameEvent[]) => void;
  /** R29 — the rest of the entry list, as cars on the road: their bodies,
   * their paint and their damage (field-cars.ts). The app owns the games;
   * the renderer only ever reads them. */
  field: FieldCars;
  /** Name the other cars on the road — the field's crews, and the ghost the
   * time trial is chasing. The player's HUD option; on by default, because
   * a car with nobody's name on it is scenery. */
  setNameTags: (on: boolean) => void;
  /** R29 — where the run stands in the field, for R25's salute at the line:
   * how big the cannons go IS how good the result was. Null on a run with
   * nobody entered, where the size falls back to where the TIME would have
   * placed on the derived list (standings.ts). */
  setStanding: (place: number | null) => void;
  /** WATCH SOMEBODY ELSE COME HOME (spectate.ts). Past the line the player's
   * own run is over, and `render` is handed the game of whichever crew is
   * being followed instead of theirs — so this is what tells the renderer
   * that the car under the camera is a RIVAL: the player's own body comes
   * off the road, along with the three things bolted to it that only mean
   * something to somebody driving (the way home, the mirror, the cabin), and
   * the field stops raising a second cloud off the car the frame is already
   * raising one off. Null puts the lens back on the player's car. */
  spectate: (run: RivalRun | null) => void;
  /** Walk the camera key's ladder one step. `watching` opens the TV gallery
   * on the end of it — true for a replay, where nobody is steering and the
   * one view built for watching is the point (camera.ts). */
  cycleCamera: (watching: boolean) => CameraMode;
  /** God mode's controls for this frame — what the free camera should do
   * with `dt` worth of held keys and mouse travel. Written straight into
   * the camera's own channel; ignored in every other mode. */
  flyCamera: (move: FreeFlyMove) => void;
  /** Fly the free camera over a world that is being HELD STILL — god mode's
   * frame is rendered with dt 0, so the flight cannot take its step from the
   * render it is about to make. Call it after `flyCamera` has banked the
   * frame's nudges and before `render`; a no-op in every other mode. */
  flyFrozen: (dt: number) => void;
  /** God mode's rig, so a URL can put it somewhere exactly. */
  placeCamera: (pose: Partial<FreeFlyPose>) => void;
  /** Which camera is up, where it is standing and how fast god mode is
   * cruising — the debug overlay's readout, and the repro line's
   * coordinates. */
  cameraPose: () => FreeFlyPose & { speed: number; mode: CameraMode };
  /** Which rung of the mirror's pace ladder this machine is on right now
   * (mirror-pace.ts) — for the debug overlay, which is where a player who
   * thinks the glass is stale finds out that it is, and why. */
  mirrorPace: () => MirrorTier;
  /** WHAT THE LAMPS ARE DOING — which stop of the switch the car is running
   * and how far off the nearest crew ahead is, m (`Infinity` for an empty
   * road). For the debug overlay: the dip switch changes the picture without
   * anything on screen saying it has, so this is the one place a night stage
   * can be asked why the beams just went short. */
  lampState: () => { stage: LampStage; ahead: number };
  /** Hold that rung instead of letting the frame rate choose it, or hand it
   * back with null — `?mirrorhz=` and the profiling harness (mirror-pace.ts
   * says why a meter needs this). */
  pinMirrorPace: (hz: number | null) => void;
  /** The driver has thrown the establishing shot away. Call it BEFORE the
   * engine's own `skipIntro`, which moves the run's clock in one step: this
   * is what lets the camera fly the rest of the shot at speed instead of
   * cutting to the driving rig (camera-start.ts). */
  skipIntroShot: () => void;
  render: (state: GameState, dt: number) => void;
  /** WHAT THE LAST FRAME COST, and what is standing in the scene to make it
   * cost that — three's own counters plus a walk of the graph, for the
   * benchmark's report (benchmark-report.ts).
   *
   * Only honest with `meterFrames` on: three resets its render counters on
   * every `render()` call, and a frame here is not one render (the mirror
   * fills its own target, the map draws its pane). The switch turns that
   * reset off so the counts accumulate over a whole frame, and `render`
   * clears them at the TOP of each one instead. */
  meter: () => FrameCost;
  /** WHAT IS STANDING IN THE SCENE, by subsystem — a walk of the graph, so
   * it is asked ONCE at the end of a run and never per frame. */
  sceneTally: () => SceneShare[];
  /** Count what the frames cost, or stop. Off by default: it is a walk of
   * the scene graph, which is exactly the kind of thing that has no business
   * running in a frame nobody is measuring. */
  meterFrames: (on: boolean) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  resize: () => void;
  /** Told whenever the GPU hands the context back or takes it away
   * (`gpu-context.ts`). Nothing can be drawn while it is gone, so the app
   * holds the run and covers the screen rather than letting a blank canvas
   * read as a crash. */
  onContext: (fn: (lost: boolean) => void) => void;
  dispose: () => void;
};
