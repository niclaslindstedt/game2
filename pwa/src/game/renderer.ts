// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer facade: owns the THREE scene, swaps worlds when a new stage
// arrives, and draws one frame from the GameState the engine produced. The
// engine never imports THREE; this module never steps physics. Sky, fog,
// lights, and weather live in environment.ts; this file wires them to the
// run and drives the ground-contact and exhaust particle systems.

import * as THREE from "three";
import { TUNING, isWooden, type GameEvent, type GameState, type Season } from "@engine";

import { createGameCamera, type CameraMode, type MapPose } from "./camera.ts";
import type { FreeFlyMove, FreeFlyPose } from "./camera-free.ts";
import {
  DRAW_DISTANCE_SCALE,
  EFFECTS_SCALE,
  INTERIOR_DETAIL,
  SCREEN_GRIME,
  FLORA_SCALE,
  GROUND_SCALE,
  RESOLUTION_SCALE,
  type VideoSettings,
  type ViewSettings,
} from "./settings.ts";
import { buildCar, tintCar, type CarVisual } from "./car-mesh.ts";
import { carEyes } from "./car-styles.ts";
import {
  AXLE,
  WET_THROW,
  LAUNCH,
  launchThrow,
  paceScale,
  TARMAC_SMOKE,
  WILD_THROW,
  type DustTint,
} from "./dust.ts";
import { clearDustLamps } from "./dust-light.ts";
import { SOOT, sootySmoke, STONE_DUST, type PlumeGround } from "./ground-tint.ts";
import { createCarFx } from "./car-fx.ts";
import { createEnvironment } from "./environment.ts";
import { createFieldCars, type FieldCars } from "./field-cars.ts";
import type { Clap } from "./weather.ts";
import { TRUNK_COLOR } from "./flora.ts";
import { PIPE, pipeBursts, pipeWork } from "./fumes.ts";
import { createWayHomeArrow } from "./way-home.ts";
import { islandPlanes } from "./map-island.ts";
import {
  buildMapLayers,
  type MapLayerId,
  type MapLayerInfo,
  type MapLayers,
} from "./map-layers.ts";
import { createMirror, MIRROR_ASPECT } from "./mirror.ts";
import { createMirrorPace, refillGap, type MirrorTier } from "./mirror-pace.ts";
import { createNameTag, GHOST_LOOK, TAG_LAYER, type NameTag } from "./name-tag.ts";
import { buildMapRoute, type MapRoute } from "./map-route.ts";
import { classify, type RivalRun } from "./standings.ts";
import { buildWorld, type World } from "./world.ts";

/** How much of the map pane's width the route ribbon may cover before it
 * stops being an annotation and starts being the picture — see where it is
 * hidden in the frame loop. An eighth is already a fat line; past that the
 * ground it is drawn on has disappeared under it. */
const ROUTE_SHARE = 0.12;

/** The map view's fog, as fractions of the camera's standoff distance. The
 * island's coastline is a deliberate edge (map-island.ts), so the fog is
 * not there to hide it — it starts past the near shore and only ever thins
 * the far half, which is the aerial haze that tells the two apart. */
const MAP_FOG_NEAR = 1.15;
const MAP_FOG_FAR = 2.2;

/** Water thrown by the car itself, rather than off a wheel. A displaced
 * mass of water is not one color: it is lake with white torn through it,
 * and the white is what makes a column read as a splash instead of a blue
 * puff — so half the droplets are foam. */
const WATER_DROPS: DustTint = { base: 0x86c4f4, fleck: 0xffffff, fleckMix: 0.5 };
/** ...and the froth on the surface after it, which is nearly all white —
 * a shade of the lake left in it so it belongs to the water it sits on. */
const FOAM: DustTint = { base: 0xeaf5ff, fleck: 0xb6d6f0, fleckMix: 0.35 };
/** How fast a car has to meet water for the splash to be as big as it
 * gets, m/s. */
const SPLASH_FULL = 26;
/** How hard the wheels have to arrive for a landing to be as big as it
 * gets, m/s of descent the springs had to swallow — a proper moon shot off
 * a two-metre lip comes down at about this. */
const SLAM_FULL = 11;
/** ...and the share of that a landing is worth however gently it arrives.
 * A CAR IS HEAVY: a ton and a half dropping the last few centimetres off a
 * kerb still lands with a bang, and a small jump that registers as nothing
 * at all is the one thing a jump must never do. */
const SLAM_FLOOR = 0.34;
/** A trunk giving way: pale splintered wood with the bark's own brown torn
 * through it. Nothing else in the game throws wood, and a stone-grey burst
 * off a tree reads as the tree having been made of concrete. */
const SPLINTERS: DustTint = { base: 0xc9b892, fleck: TRUNK_COLOR, fleckMix: 0.35 };

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
  /** Where the map view is standing, for the debug box and its repro line. */
  mapPose: () => MapPose;
  /** Re-light an already-built stage (the pre-race menu flipping time of
   * day / weather) without rebuilding its geometry. */
  setConditions: (state: GameState) => void;
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
  cycleCamera: () => CameraMode;
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
  onEvents: (state: GameState, events: GameEvent[]) => void;
  resize: () => void;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement, video: VideoSettings): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // The map view cuts the world to an island; the sky it hangs in must not
  // be cut with it, so the planes ride on the WORLD's own materials rather
  // than on the renderer.
  renderer.localClippingEnabled = true;
  let quality = video;
  const applyResolution = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, RESOLUTION_SCALE[quality.resolution]));
  };
  applyResolution();

  const scene = new THREE.Scene();
  const environment = createEnvironment(scene);

  const chase = createGameCamera(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const mirror = createMirror();
  /** What the machine can afford to spend on the mirror — how often it is
   * refilled and how far it sees, both of which move while a stage is
   * driven (mirror-pace.ts). It outlives the world, because what a machine
   * can draw is a property of the machine and not of the stage. */
  const mirrorPace = createMirrorPace();
  /** The player's option, and whether this frame is one the glass belongs
   * in — the two are kept apart so `drawScene` can be asked the question
   * once, after `render` has decided it against the state and the view. */
  let mirrorOption = true;
  let mirrorUp = false;
  /** Whether the mirror was up on the frame BEFORE this one: the pace is
   * only judged on frames the glass was actually in, and the first of a run
   * of those follows frames drawn under a different load. */
  let mirrorWas = false;
  /** Whether the mirror's own pass runs THIS frame — see where it is set. */
  let mirrorFill = false;
  /** ...and how far it is allowed to see when it does, as a fraction of the
   * forward view's fog. Settled in `render` and read in `drawScene`, so both
   * halves of one frame pull the air in by the same amount. */
  let mirrorRange = mirrorPace.tier().range;
  /** Seconds since the glass was last refilled. Starts past any interval so
   * the very first driving frame fills it: a strip compositing a target
   * nothing has drawn into yet is a black hole over the road. */
  let mirrorAge = Infinity;
  /** ...and whether it is drawn as the HUD's strip over the frame, as
   * opposed to into the cockpit's own mirror inside it. */
  let mirrorStrip = false;
  /** The driver's eye height on the car now on the road, body-local m. The
   * mirror hangs off it so a tall body's glass clears a tall body's roof. */
  let driverEyeY = 1.21;
  // Every pool the car's contact with the world spawns into, built and hung
  // in the scene together (car-fx.ts). The renderer keeps the decisions —
  // what is thrown, when, and how much of it — and none of the plumbing.
  const carFx = createCarFx(scene);
  const { dust, mud, smoke, plume, spray, foam, fumes, life, celebration } = carFx;
  const { atWheels } = carFx;
  const wayHomeArrow = createWayHomeArrow(canvas);
  // The arrow lives in camera space, and a camera only draws its children
  // when it is itself part of the scene being rendered.
  scene.add(chase.camera);
  chase.camera.add(wayHomeArrow.group);
  // Only the forward camera draws name tags: the mirror pass reverses its
  // image, and a reversed word is not a name (name-tag.ts).
  chase.camera.layers.enable(TAG_LAYER);

  let world: World | null = null;
  /** Where a knocked cone or marker post goes to be heard. Held across
   * stages, because the world is rebuilt for every run and the wiring to
   * the audio is not. */
  let knockPlay: ((speed: number) => void) | null = null;
  /** The season the standing world was PLANTED in — the year's colours are
   * baked into its geometry, so this is what a re-light compares against
   * to know whether the ground it is lighting is still the right ground. */
  let builtSeason: Season = "summer";
  let route: MapRoute | null = null;
  /** The generator's own layers, painted over the map view on request
   * (map-layers.ts). Built with every stage but sampled only when one is
   * actually asked for — see `setMapLayer`. */
  let layers: MapLayers | null = null;
  let layerId: MapLayerId | null = null;
  let car: CarVisual | null = null;
  let ghost: GameState | null = null;
  let ghostCar: CarVisual | null = null;
  let ghostTag: NameTag | null = null;
  const field = createFieldCars(scene);
  field.setCarDetail(
    INTERIOR_DETAIL[quality.interior],
    SCREEN_GRIME[quality.interior] ? "coarse" : "off",
  );
  /** Whether the cars that are not the player's are named. */
  let nameTags = true;
  /** The stage that is standing, as the state it was last shown with —
   * the track the island is cut from, and the conditions anything that
   * re-lights without being handed a state has to go back to. */
  let game: GameState | null = null;
  /** True while the map view is up: it suspends the transient FX and pushes
   * the fog out past the whole stage. */
  let mapView = false;
  /** The map pane, CSS pixels from the canvas' top-left. */
  let mapRect: { x: number; y: number; width: number; height: number } | null = null;
  /** The map view's coastline, as clipping planes. ONE array for the whole
   * run of the app: the world's materials are handed this exact reference
   * once and never again, and emptying it is what turns the cut off — a
   * material with no planes clips nothing. */
  const island: THREE.Plane[] = [];
  let dustClock = 0;
  /** Grains owed but not yet thrown. Pace and the surface thin a cloud's
   * count into a fraction, and rounding each spawn on its own turns a thin
   * trickle into silence — a tenth of a grain per spawn has to come out as
   * one grain every ten spawns, not zero forever. */
  let grainDebt = 0;
  let fumeClock = 0;
  /** HOW HOT THE TIRES ARE, 0..1 — the soot in the tarmac smoke rides on
   * it. Nothing in `GameState` carries it: heat is the one thing about a
   * tire that is a HISTORY rather than an instant, so the renderer keeps
   * it, building while the car is sliding and bleeding away when it is
   * not. */
  let rubberHeat = 0;
  /** True while the ground is too wet to lift: set with the conditions,
   * because the weather does not change inside a run. */
  let wetGround = false;
  /** Beat for the water working around a hull that is going down. */
  let drownClock = 0;

  /** The environment's light tint, pushed onto everything that carries its
   * own baked or vertex colors (the cars, the particles) — and, on the same
   * trip, the rain the cars' screens are wetted by. */
  const applyTint = (): void => {
    const tint = environment.carTint();
    const lit = environment.lampsLit();
    const rain = environment.rainfall();
    if (car) tintCar(car, tint, lit, rain);
    if (ghostCar) tintCar(ghostCar, tint, lit, rain);
    field.paint(tint, lit, rain);
    carFx.setTint(tint, environment.dustTint());
  };

  /** How thick the transient FX are right now: the effects budget, and
   * nothing at all under the map view, where a gravel particle a metre
   * across is invisible and still costs a draw. */
  const fxScale = (): number => (mapView ? 0 : EFFECTS_SCALE[quality.effects]);

  /** Cut the world to the island, or stop cutting it. The planes are solved
   * from the track, so this is also how a new stage's coastline arrives. */
  const applyIsland = (): void => {
    island.length = 0;
    if (mapView && game) island.push(...islandPlanes(game.track));
    clipWorld();
  };

  /** Hand the island array to every material the world is drawn with. Cheap
   * and idempotent — the materials are shared between chunks, and assigning
   * the same array again is a no-op — so it can simply be redone whenever
   * new road has been raised rather than tracked. */
  const clipWorld = (): void => {
    world?.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        mat.clippingPlanes = island;
      }
    });
  };

  const applyRange = (): void => {
    if (!mapView) {
      environment.setRange(DRAW_DISTANCE_SCALE[quality.drawDistance]);
      return;
    }
    // Until the map camera has framed a stage it has no distance to hang the
    // fog off; the first frame sets it, and render() keeps it in step.
    const range = chase.mapRange();
    if (range > 0) environment.setFogRange(range * MAP_FOG_NEAR, range * MAP_FOG_FAR);
  };

  /** Re-light the standing stage. `game` is rebound here as well as where
   * the world is BUILT: a re-light is a newer state on the same road, and
   * the callers that light off the handle instead of an argument — a camera
   * entering or leaving the map, a video option — would otherwise put the
   * conditions the world was built in back on top of it. Roam is where that
   * bites: its map preview and its run share one compiled track, so a time
   * of day picked there only ever reaches HERE, and the map-to-chase switch
   * on DRIVE IT would light the run as whatever the page opened in. */
  const setConditions = (state: GameState): void => {
    game = state;
    // The season is not a light — it is baked into the vertex colors of
    // every leaf and every square metre of ground, so a stage that changes
    // season has to be planted again. Roam is where this happens: its map
    // preview and its run share one compiled track, so a season picked
    // there arrives here on a world that was built in another one.
    if (world && state.env.season !== builtSeason) {
      scene.remove(world.group);
      world.dispose();
      builtSeason = state.env.season;
      world = buildWorld(
        state.track,
        FLORA_SCALE[quality.flora],
        builtSeason,
        GROUND_SCALE[quality.ground],
      );
      scene.add(world.group);
      applyIsland();
    }
    environment.apply(state.env);
    // Rain settles the stage. There is no cloud to tow once the surface is
    // soaked — what the wheels lift is clods — so the two swap over here,
    // once, rather than being decided per frame per particle. How hard it
    // is actually coming down is the environment's per-frame business: the
    // squall breathes, and the sheet has to breathe with it.
    wetGround = state.env.weather !== "clear";
    plume.points.visible = !wetGround;
    mud.points.visible = wetGround;
    applyRange();
    applyTint();
  };

  const setVideo = (next: VideoSettings): void => {
    quality = next;
    applyResolution();
    field.setCarDetail(
      INTERIOR_DETAIL[quality.interior],
      SCREEN_GRIME[quality.interior] ? "coarse" : "off",
    );
    if (game) setConditions(game);
    else applyRange();
  };

  /** The camera frames whatever it is actually being drawn into: the map
   * pane while the map view is confined to one, the whole canvas otherwise.
   * Getting this wrong stretches the map rather than merely misplacing it. */
  const applyAspect = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (mapView && mapRect) chase.resize(mapRect.width || 1, mapRect.height || 1);
    else chase.resize(w, h);
  };

  const setCamera = (mode: CameraMode): void => {
    const wasMap = mapView;
    // God mode takes over from whatever was standing, so something has to
    // BE standing: on a run that starts in free mode the camera has never
    // been placed, and the hand-over would read an identity matrix and put
    // the pilot at the world origin facing backwards. One placing update at
    // no elapsed time costs nothing and means a flight always begins on the
    // car — from the map view via a chase rig, because a hand-over from a
    // satellite kilometres up is a flight that begins nowhere useful.
    if (mode === "free" && chase.mode() !== "free" && game) {
      if (chase.mode() === "map") chase.setMode("chase");
      chase.update(game, 0);
    }
    chase.setMode(mode);
    mapView = mode === "map";
    // The sky is for a camera standing IN the world; the map view is a
    // satellite over it and hangs the stage on the flat background instead.
    environment.setSky(!mapView);
    applyAspect();
    if (mapView === wasMap) return;
    applyIsland();
    if (game) setConditions(game);
    else applyRange();
  };

  const setMapRect = (rect: typeof mapRect): void => {
    mapRect = rect;
    applyAspect();
  };

  const dropGhost = (): void => {
    ghost = null;
    if (ghostTag) {
      scene.remove(ghostTag.sprite);
      ghostTag.dispose();
      ghostTag = null;
    }
    if (!ghostCar) return;
    scene.remove(ghostCar.group, ghostCar.shadow, ghostCar.debris);
    ghostCar.dispose();
    ghostCar = null;
  };

  /** Put this state's car on the road, taking the old one off first. The
   * body carries the hood eye and the reach of its own lamps, so both are
   * re-read here rather than only where a whole stage is built. */
  const fitCar = (state: GameState): void => {
    if (car) {
      scene.remove(car.group, car.shadow, car.debris);
      car.dispose();
    }
    // The player's car is the one car on the stage with a first-person
    // cabin: it is the only one anybody will ever sit in.
    car = buildCar(state.spec, {
      interior: INTERIOR_DETAIL[quality.interior],
      // The one screen anybody looks THROUGH, so it is the one that gets the
      // fine film — the arc a blade leaves is read at arm's length here.
      screens: SCREEN_GRIME[quality.interior] ? "fine" : "off",
      cockpit: true,
      // The rear view goes IN the cockpit's mirror rather than only into the
      // HUD's strip, so the mirror pass's texture is handed to the body that
      // hangs the glass.
      rearView: { texture: mirror.texture, aspect: MIRROR_ASPECT },
    });
    scene.add(car.group, car.shadow, car.debris);
    const eyes = carEyes(state.spec);
    chase.setEyes(eyes);
    driverEyeY = eyes.hood.y;
    environment.setLampSpread(car.lampSpread.front, car.lampSpread.rear);
  };

  const setGame = (state: GameState): void => {
    // Whether this is the FIRST stage of the session, which is the one the
    // map's framing must not be reset for: a link that named a framing
    // (map-debug.ts) has already parked the camera on it, and the boot stage
    // would throw that away before a single frame was drawn.
    const first = world === null;
    if (world) {
      scene.remove(world.group);
      world.dispose();
    }
    if (route) {
      scene.remove(route.group);
      route.dispose();
    }
    if (layers) {
      scene.remove(layers.group);
      layers.dispose();
    }
    game = state;
    builtSeason = state.env.season;
    world = buildWorld(
      state.track,
      FLORA_SCALE[quality.flora],
      builtSeason,
      GROUND_SCALE[quality.ground],
    );
    scene.add(world.group);
    route = buildMapRoute(state.track);
    route.group.visible = mapView;
    scene.add(route.group);
    // The layers follow the stage they describe. Cheap to stand up — the
    // sampling waits for a layer to be picked — so a seed the developer is
    // stepping through carries its X-ray without paying for one.
    layers = buildMapLayers(state.track, state.terrain, island);
    scene.add(layers.group);
    if (layerId) layers.show(layerId);
    fitCar(state);
    // A new stage is a new run: a ghost or a field on it is asked for after,
    // and the establishing shot starts again from the top.
    chase.resetStartShot();
    // ...and a new stage is a new SUBJECT for the map. The zoom and the pan
    // were walked onto the last one and describe country that is no longer
    // there, so stepping a seed on Roam or opening a level in the map viewer
    // frames the whole of the new stage and lets the turn go again.
    if (!first) chase.reframeMap();
    dropGhost();
    field.clear();
    applyIsland();
    setConditions(state);
  };

  /** Swap the CAR under a stage that is already standing. The world is by
   * far the most expensive thing the renderer builds — terrain and every
   * tree on it — and none of it depends on which car is parked in it, so
   * picking a different one in the menu has no business tearing it down and
   * building it again. */
  const setCar = (state: GameState): void => {
    game = state;
    fitCar(state);
    // The island is solved from `game`, and `game` was just rebound. The
    // planes come out the same — a car swap only happens over a stage whose
    // track is unchanged — but re-solving them is what keeps that a fact
    // about this function rather than a promise the caller has to keep.
    applyIsland();
    setConditions(state);
  };

  /** The field's verdict, set by the app as the boards go by. */
  let standing: number | null = null;
  /** The crew the frame is being rendered FROM while the run-out is
   * spectated, and null whenever the lens is on the player's own car. */
  let watched: RivalRun | null = null;

  const setGhost = (state: GameState | null): void => {
    dropGhost();
    if (!state) return;
    ghost = state;
    ghostCar = buildCar(state.spec, {
      ghost: true,
      interior: INTERIOR_DETAIL[quality.interior],
      // A ghost is a picture of a lap, seen from outside and half
      // transparent, so it takes the same coarse film every other car on the
      // road does rather than the one built to be looked through.
      screens: SCREEN_GRIME[quality.interior] ? "coarse" : "off",
    });
    // The ghost gets the same plate the field does, for the same reason: on
    // a road with two cars on it, which of them is the one to beat is
    // information. Its own colour and its own fade, held under a real
    // crew's, so the plate is as much a picture as the car under it.
    ghostTag = createNameTag("Ghost", null, GHOST_LOOK);
    scene.add(ghostCar.group, ghostCar.shadow, ghostCar.debris, ghostTag.sprite);
    applyTint();
  };

  /** The tint anything thrown off the ground under the car takes. The wet
   * road is the renderer's own read of the conditions, so it is handed in
   * rather than asked for. */
  const groundDust = (state: GameState): number | DustTint => carFx.groundDust(state, wetGround);

  /** …and what the same ground gives the cloud the car TOWS, which is a
   * shorter list: only a surface with loose dry dust on it hangs anything in
   * the air behind a car. */
  const plumeDust = (state: GameState): PlumeGround => carFx.plumeDust(state, wetGround);

  /** Straight down, for the events whose blow has no direction round the
   * car — a landing, a belly slam. */
  const DOWN = { x: 0, y: -1, z: 0 };

  const onEvents = (state: GameState, events: GameEvent[]): void => {
    const c = state.car;
    const fx = fxScale();
    for (const ev of events) {
      if (ev.type === "landing") {
        // HOW HARD, not how long: the descent the springs just swallowed is
        // what the car felt, and it is the only number that tells a hop off
        // a kerb from a moon shot. Air time cannot — a long floaty flight
        // onto ground running away underneath it arrives softer than a
        // short one off a steep lip. The floor under it is the weight of
        // the car: nothing about a landing is ever free.
        const slam = SLAM_FLOOR + (1 - SLAM_FLOOR) * Math.min(1, Math.abs(ev.slam) / SLAM_FULL);
        // Straight down: the wheels stop falling and the driver's head does
        // not, which is the whole of what a landing feels like from inside.
        chase.kick((ev.clean ? 0.34 : 0.62) * slam, DOWN);
        // Four tyres hitting the ground at once, and each of them throws.
        atWheels(
          wetGround ? mud : dust,
          state,
          groundDust(state),
          Math.round((ev.clean ? 18 : 32) * slam * fx),
          3.5,
        );
      } else if (ev.type === "splash") {
        // How much water the car moved. A ford taken at pace throws a
        // sheet off the nose; a car going into a lake throws a COLUMN, and
        // since that one is the last thing the run does it gets the frame:
        // several times the droplets, thrown wider and harder, with froth
        // left working on the surface behind it.
        const force = Math.min(1, ev.speed / SPLASH_FULL);
        const surface = (state.drowning?.waterY ?? c.y) + 0.1;
        // The nose is what displaces the water, so the column comes up in
        // front of the car and carries part of its way in with it.
        const nose = c.heading;
        const reach = ev.deep ? 1.4 : 1;
        chase.kick(ev.deep ? 0.45 + 0.25 * force : 0.2 + 0.2 * force, {
          x: Math.sin(nose),
          y: -0.4,
          z: Math.cos(nose),
        });
        spray.spawn(
          c.x + Math.sin(nose) * reach,
          surface,
          c.z + Math.cos(nose) * reach,
          WATER_DROPS,
          Math.round((ev.deep ? 140 + 180 * force : 24 + 46 * force) * fx),
          (ev.deep ? 4.5 : 3) + 3 * force,
          Math.sin(nose) * ev.speed * 0.25,
          Math.cos(nose) * ev.speed * 0.25,
        );
        foam.spawn(
          c.x,
          surface,
          c.z,
          FOAM,
          Math.round((ev.deep ? 26 : 8) * fx),
          ev.deep ? 2.6 : 1.6,
        );
      } else if (ev.type === "sink") {
        // The water closing over the roof: the column is long gone, and
        // what is left is the hole in the surface filling itself in.
        const surface = (state.drowning?.waterY ?? c.y) + 0.06;
        chase.kick(0.18);
        spray.spawn(c.x, surface, c.z, WATER_DROPS, Math.round(46 * fx), 2.2);
        foam.spawn(c.x, surface, c.z, FOAM, Math.round(30 * fx), 2.4);
      } else if (ev.type === "takeoff") {
        // The scuff the wheels leave on the lip on their way off it.
        atWheels(wetGround ? mud : dust, state, groundDust(state), 10 * fx, 3);
      } else if (ev.type === "finish") {
        // R25 — the salute, sized by where the time placed. Fourth and
        // worse fire nothing, and `fire` knows it.
        celebration.fire(standing ?? classify(state.track, ev.time).place, world?.muzzles() ?? []);
      } else if (ev.type === "kerbHit") {
        // R26 — a block on the inside of an apex. Nothing folds and nothing
        // breaks, so there is no burst and no shake: what there IS, from
        // inside, is the car being thrown off its line, and the head going
        // with it a beat late.
        chase.kick(Math.min(0.22, 0.06 + ev.speed * 0.004), {
          x: Math.cos(c.heading),
          y: 0.5,
          z: -Math.sin(c.heading),
        });
      } else if (ev.type === "respawn") {
        chase.kick(0.3);
      } else if (ev.type === "solidBreak") {
        // Something came out of the landscape. The engine has already taken
        // it out of the field and worked out where the piece is going; the
        // world stops drawing it standing and throws it, and the burst here
        // is the splinters and grit that went with it.
        world?.fell(ev.solid, ev.vx, ev.vy, ev.vz);
        const wooden = isWooden(ev.solid.kind);
        dust.spawn(
          ev.solid.x,
          ev.solid.y + ev.solid.height * 0.3,
          ev.solid.z,
          wooden ? SPLINTERS : STONE_DUST,
          Math.round((ev.broke ? 26 : 14) * fx),
          3.5,
        );
      } else if (ev.type === "impact") {
        // The hit lands where the engine says it did: a debris-grey burst
        // at that point on the body, a camera jolt sized to the speed, and
        // — from inside the car — the driver's head thrown at the part of
        // the body that took it. A shunt on the nose throws the head
        // forward, one on the left throws it left, and a belly slam throws
        // it down, because the car stopped and the driver did not.
        const a = c.heading + ev.angle;
        chase.kick(
          Math.min(0.9, 0.25 + ev.speed * 0.02),
          ev.belly ? DOWN : { x: Math.sin(a), y: 0.15, z: Math.cos(a) },
        );
        const reach = ev.belly ? 0 : 1.6;
        dust.spawn(
          c.x + Math.sin(a) * reach,
          c.y + (ev.belly ? 0.1 : 0.5),
          c.z + Math.cos(a) * reach,
          0x8a8578,
          Math.round(Math.min(30, 8 + ev.speed) * fx),
          3.5,
        );
      }
    }
    car?.onEvents(state, events);
  };

  const onGhostEvents = (state: GameState, events: GameEvent[]): void => {
    ghostCar?.onEvents(state, events);
  };

  const render = (state: GameState, dt: number): void => {
    const c = state.car;
    const view = chase.mode();
    const fwdX = Math.sin(c.heading);
    const fwdZ = Math.cos(c.heading);
    const rightX = Math.cos(c.heading);
    const rightZ = -Math.sin(c.heading);

    // Gravel kicked up at the wheels — the ground-contact half of the speed
    // feel. On a loose surface three overlapping sources, strongest first:
    // the drift/off-road rooster tail, the braking plume, and the plain
    // rolling kickup that rides with pace. A sealed road has none of them
    // and answers on its own terms (TARMAC_SMOKE). Particles inherit part
    // of the car's wake plus the wind, so every cloud streams backward and
    // leans downwind.
    const fx = fxScale();
    // The engine tracks the driven surface — road fords AND the wild's
    // lakes and streams throw the blue spray, and the stage's sealed
    // sections throw nothing at all until the tires start smoking.
    const sealed = state.surface === "asphalt";
    // THE TOWED CLOUD, which is the other half of a loose surface and comes
    // up on its own terms: not thrown by a wheel, so not part of the wheel
    // logic below, and off entirely where the ground has no loose dry dust
    // in it. `plumeDust` is that whole judgement — a sealed road, water, a
    // stage the rain has settled and a grass verge all come back null.
    plume.update(state, dt, fx, plumeDust(state));

    // How hot the tires are, which only tarmac has any use for. A tire
    // cooks while it is sliding and cools the moment it hooks back up, and
    // the soot in its smoke follows it up and down.
    //
    // THREE ways a tire is being dragged rather than rolled, not one. The
    // settled angle is only the last of them: the lever locks the rear
    // wheels outright before the car has taken up any angle at all, and a
    // spun car is dragging all four sideways. Cooking off `drifting` alone
    // left the smokiest moments on tarmac — the whole first half of a
    // handbrake turn, and every spin — coming out white.
    const scrubbing = c.drifting || c.locked || c.spun;
    // A locked or spun tire is fully overwhelmed whatever `slide` reads, so
    // it cooks at the full rate rather than at the slide's fraction.
    const cooking = c.locked || c.spun ? 1 : c.slide;
    rubberHeat = Math.max(
      0,
      Math.min(1, rubberHeat + (sealed && scrubbing ? cooking * SOOT.heat : -SOOT.cool) * dt),
    );
    dustClock += dt;
    if (fx > 0 && !c.airborne && dustClock > (sealed ? TARMAC_SMOKE.every : 0.03)) {
      dustClock = 0;
      // A wet stage throws clods where a dry one throws grit: same wheel
      // logic, same tuning, different matter under it.
      const cloud = sealed ? smoke : wetGround ? mud : dust;
      const color = sealed ? sootySmoke(rubberHeat) : groundDust(state);
      // Smoke is boiled off the tire and left behind; grit is thrown by it.
      // So the wake it inherits is gentler, and it spreads instead of arcing.
      const wake = sealed ? 0.12 : 0.35;
      const wakeX = -fwdX * c.u * wake + state.wind.x * 0.6;
      const wakeZ = -fwdZ * c.u * wake + state.wind.z * 0.6;
      // The tires letting go is what throws gravel — `slide` is that
      // number, so the plume comes up the instant the car is asked for more
      // grip than it has, not once the angle has already developed.
      const sideways = c.slide > 0.15 && c.u > 6;
      // Off the line the driven wheels are spinning rather than rolling, so
      // they move far more ground than their road speed says they should.
      // The launch takes the pace scale OVER until the tires hook up (it
      // never lowers it), which keeps the standing start the one moment a
      // slow car is allowed a big cloud.
      const launch = sealed ? 0 : launchThrow(c.u, c.wheelspin);
      // How much ground this wheel is actually moving: pace decides the
      // size of any thrown cloud, and the wild gives up far less of itself
      // than the road does. Neither applies to smoke, which is made of the
      // tire rather than the ground.
      const pace = sealed ? 1 : Math.max(paceScale(c.u), launch);
      const thrown = sealed
        ? 1
        : pace * (state.surface === "nature" ? WILD_THROW : 1) * (wetGround ? WET_THROW : 1);
      const grains = (count: number): number => {
        grainDebt += count * fx * thrown;
        const whole = Math.floor(grainDebt);
        grainDebt -= whole;
        return whole;
      };
      /** How far forward of the car's middle the DRIVEN wheels are — the
       * rear axle on everything but a front-driver, which spins up under
       * its own nose. Only the launch cares: a scrubbing tyre throws
       * whether or not anything is turning it, but a wheel LIT UP off the
       * line is by definition one the engine is driving. */
      const drivenAt = state.spec.drive === "fwd" ? AXLE.front : -AXLE.rear;
      /** One wheel's worth, off `at` metres forward of the middle. `push`
       * is a backward throw of the wheel's own, m/s, for the case where
       * the car is not yet moving fast enough to carry its grains away
       * for it. */
      const wheel = (at: number, side: number, count: number, spread: number, push = 0): void =>
        cloud.spawn(
          c.x + fwdX * at + rightX * side * AXLE.side,
          c.y + AXLE.height,
          c.z + fwdZ * at + rightZ * side * AXLE.side,
          color,
          grains(count),
          spread * pace,
          wakeX - fwdX * push,
          wakeZ - fwdZ * push,
        );
      if (sealed) {
        const T = TARMAC_SMOKE;
        if (c.u < T.launch.speed && c.wheelspin > LAUNCH.from) {
          // Off the line: the driven wheels are ahead of the car, and that
          // is the whole of it — it stops the instant they hook up. How far
          // ahead is how much smoke, so a dropped clutch is a cloud and a
          // clean getaway is a wisp.
          const spun = launchThrow(c.u, c.wheelspin);
          const puffs = T.launch.puffs + Math.round(T.launch.spun * spun);
          wheel(drivenAt, -1, puffs, T.spread);
          wheel(drivenAt, 1, puffs, T.spread);
        } else if (scrubbing) {
          // A readout, never the raw `slide`: `drifting` is the settled
          // ANGLE with hysteresis behind it, so smoke comes up for the drift
          // a player can SEE and not for every corner that leans on the
          // tires — and `locked` and `spun` are the two ways a tire is being
          // dragged before, or long past, any angle worth the name. A
          // sliding tire on tarmac makes a few big puffs where gravel throws
          // grains, and they hang where they were made.
          const puffs = T.drift.puffs + Math.round(cooking * 3);
          wheel(-AXLE.rear, -1, puffs, T.spread);
          wheel(-AXLE.rear, 1, puffs, T.spread);
          // A spin has all four dragged sideways, so the fronts make their
          // own — which is what separates the picture of a spin from the
          // picture of a drift held a beat too long.
          if (c.spun) {
            wheel(AXLE.front, -1, puffs, T.spread);
            wheel(AXLE.front, 1, puffs, T.spread);
          }
        } else if (c.braking && c.u > T.brake.speed) {
          wheel(-AXLE.rear, Math.random() < 0.5 ? -1 : 1, T.brake.puffs, T.spread);
        }
      } else if (sideways || (state.offRoad && c.u > 6)) {
        // The drift plume also blows toward the slide, off the outside
        // wheels, and thickens as the slide deepens. Off-road earns it at
        // the same speed a slide does — a car picking its way back to the
        // track at walking pace is not excavating anything.
        const perWheel = 4 + Math.round(c.slide * 5);
        wheel(-AXLE.rear, -1, perWheel, 3.5);
        wheel(-AXLE.rear, 1, perWheel, 3.5);
      } else if (c.braking && c.u > 8) {
        wheel(-AXLE.rear, -1, 4, 2.5);
        wheel(-AXLE.rear, 1, 4, 2.5);
      } else if (launch > 0) {
        // Both driven wheels, digging in and throwing straight back: the
        // plume that says the car LEFT rather than rolled away. Twice the
        // deepest drift's under a fully lit axle, thinning with the
        // wheelspin and gone by 50 km/h, where the rolling kickup below
        // picks the cloud back up. A launch off the limiter holds it up for
        // a second and a half, so the pair of them dig a proper hole rather
        // than flashing once — which is the picture that has to tell the
        // player why the car ahead is pulling away from them.
        const perWheel = 6 + Math.round(launch * 10);
        const push = LAUNCH.push * launch;
        wheel(drivenAt, -1, perWheel, 3, push);
        wheel(drivenAt, 1, perWheel, 3, push);
      } else if (c.u > 15) {
        // Rolling kickup is loose-surface only: a sealed road has nothing
        // lying on it to pick up.
        wheel(-AXLE.rear, Math.random() < 0.5 ? -1 : 1, 2, 1.6);
      }
    }

    // Exhaust: puffs off the tailpipe, faster and sootier the more fuel the
    // engine is drinking, handed to the wind the moment they leave the pipe.
    // A car revving on the grid is drinking plenty and turning none of it
    // into road speed, so it smokes harder than one at pace — `car.rev` is
    // the throttle itself anywhere in the start control, and gearing plus
    // speed at every other moment, which is why the read is phase-gated.
    const pipe = pipeWork(c.rev, c.u, state.phase, fx);
    fumeClock += dt;
    const bursts = fx > 0 && !c.airborne ? pipeBursts(fumeClock, pipe.every) : 0;
    if (bursts > 0) {
      fumeClock -= bursts * pipe.every;
      for (let i = 0; i < bursts * pipe.puffs; i++) {
        fumes.spawn(
          c.x - fwdX * PIPE.back + rightX * PIPE.side,
          c.y + PIPE.up,
          c.z - fwdZ * PIPE.back + rightZ * PIPE.side,
          -fwdX * pipe.blast + state.wind.x * 0.85,
          -fwdZ * pipe.blast + state.wind.z * 0.85,
          pipe.shade,
        );
      }
    }

    // A car going down keeps the water working the whole time. While the
    // hull rides the surface it is still displacing — droplets slopping
    // off it as it rocks — and once the roof is under, all that is left is
    // what the body is letting go of, breaking on a surface with nothing
    // visible beneath it. The engine owns the beat (TUNING.crash.drown);
    // this is what it looks like.
    if (fx > 0 && state.drowning) {
      const D = TUNING.crash.drown;
      const surface = state.drowning.waterY;
      const age = state.t - state.drowning.since;
      // The entry is still boiling for the first second or so; by the time
      // the hull has settled the water around it is nearly flat again.
      const working = Math.max(0, 1 - age / D.float);
      const awash = c.y + D.roof > surface;
      drownClock += dt;
      if (drownClock > 0.05) {
        drownClock = 0;
        // Somewhere AROUND the hull, never on top of it. The chase camera
        // sits barely a metre over the waterline while this plays, so
        // anything born at the car's own position drifts straight across
        // the lens as a white wash; a ring keeps the water where the water
        // is, and stops the churn reading as a fountain bolted to the
        // car's middle besides.
        const a = Math.random() * Math.PI * 2;
        const ring = 1.3 + Math.random() * 0.9;
        const rx = c.x + Math.cos(a) * ring;
        const rz = c.z + Math.sin(a) * ring;
        if (awash) {
          spray.spawn(
            rx,
            surface + 0.05,
            rz,
            WATER_DROPS,
            Math.round((3 + 12 * working) * fx),
            1 + 1.8 * working,
          );
        }
        // Bubbles break AT the surface however deep the car is: under a
        // lake nobody can see them leave the body.
        foam.spawn(rx, surface + 0.06, rz, FOAM, Math.round(3 * fx), 0.9);
      }
    }

    carFx.step(dt);
    // An endless run streams its world: the road chunks and terrain tiles
    // ahead get built here, the ones far behind get dropped.
    world?.sync(state, dt);
    world?.update(state, dt, knockPlay ?? undefined);
    celebration.update(dt);
    car?.update(state, dt, chase.camera.position);
    if (ghost && ghostCar) ghostCar.update(ghost, dt, chase.camera.position);
    // The entry list, off their own games; off under the map view like the
    // player's own body below.
    field.setDust(wetGround, fx);
    field.update(state, chase.camera, dt, view !== "map");
    // The way home is a DRIVING aid, bolted to the camera. Under the menu's
    // drone, the map view and god mode's free camera there is nobody lost
    // and nobody to point: left running, it would hang a compass needle over
    // the middle of the menu, or over a stage nobody is driving. And there
    // is nobody to point while the water is taking the car either: a compass
    // needle over a sinking wreck is an instruction the player has no way to
    // act on.
    //
    // Stated as "not the views nobody drives from" rather than as a list of
    // the play cameras, because that list grows: naming them is how the
    // arrow quietly stops appearing in the next camera somebody adds.
    //
    // Spectating is the other kind of nobody: the state under the camera is
    // a rival's, so there is a car being driven — just not by the player,
    // and none of the three things this gates is theirs to read.
    const driving =
      view !== "drone" && view !== "map" && view !== "free" && !state.drowning && !watched;
    wayHomeArrow.group.visible = driving;
    if (driving) wayHomeArrow.update(state, chase.camera, dt);
    chase.update(state, dt);
    environment.setGrime(car?.grime() ?? 0);
    // The weather is the environment's, the FX budget is the renderer's.
    environment.setEffects(fx);
    environment.update(state, chase.camera, dt);
    // THE LAMPS THE DUST SEES — the register every cloud in the scene is lit
    // from (dust-light.ts), refilled from scratch each frame. Emptied HERE
    // rather than by whoever writes to it first, because it is one register
    // with several contributors and the order they run in is the renderer's
    // business, not theirs. The player goes on first so a field closing up
    // can never crowd their own tail lamps out of it.
    clearDustLamps();
    environment.lightDust(state.car);
    field.lightDust(environment.lampPower());
    const cam = chase.camera.position;
    if (fx > 0) life.update(cam.x, cam.z, state.wind.x, state.wind.z, dt);
    life.group.visible = fx > 0;
    // The map framing changes with the stage and the pane, and the fog rides
    // it — see MAP_FOG_NEAR.
    if (mapView) {
      applyAspect();
      applyRange();
      // The stage is still growing in behind the map (world.sync), and a
      // slice raised this frame has materials that have never seen the cut.
      clipWorld();
    }
    // The route ribbon is sized to READ at the framing that holds the whole
    // stage, which makes it far wider than the road under it — a deliberate
    // annotation. Leaned in, that annotation becomes a runway painted over
    // the thing being looked at, so it retires once it would cover more of
    // the pane than a line has any business covering, and what is left is
    // the actual road.
    if (route) {
      const across = chase.mapPose().across;
      route.group.visible = view === "map" && (across <= 0 || route.width <= across * ROUTE_SHARE);
    }
    // ...and the layers with it: an X-ray of the ground is a thing to read a
    // map by, not something to drive through.
    if (layers) layers.group.visible = view === "map" && layerId !== null;
    // THE CAR IS DRAWN IN EVERY VIEW, the map included — the hood cam because
    // the bonnet under the lens is the whole point of that angle, and the map
    // because its LAMPS were never hidden with it. The environment throws
    // those whatever is drawn, so hiding the body after dark left a pool of
    // headlight travelling along an empty road, which is a stranger thing to
    // see than a small car; and now that the map leans in to a few metres, it
    // also hid the one thing on the stage that is actually moving.
    //
    // ONE BEAT TAKES IT OFF, and it is the beat where there is no such car:
    // spectating hands `render` a rival's game, so the player's body would be
    // drawn wrapped around somebody else's — a second car inside the one the
    // field is already drawing, in the wrong paint. A finished run has
    // nowhere on a rally stage to stand, which is the same rule the field
    // keeps for a crew who is home (`onRoad`).
    if (car) {
      const mine = !watched;
      car.group.visible = mine;
      car.shadow.visible = mine;
      car.debris.visible = mine;
      // Behind the wheel the player is looking at the FIRST-PERSON cabin,
      // not the one authored to be read through glass from a car's length
      // back — the two stand in the same space, so only one of them is ever
      // up. The finish takes the camera out of the car and plants it on the
      // road, so the swap follows the shot rather than the mode.
      const inside = view === "cockpit" && driving;
      car.setInside(inside);
      // From the seat the road behind is read off the mirror hanging in the
      // windscreen, so the strip at the top of the frame stands down and the
      // pane lights up instead. One rear view, in whichever of the two homes
      // the player is actually looking at.
      car.setRearView(inside && mirrorUp);
    }
    // The ghost is the one car the hood cam must keep: it is out there on
    // the road being chased, not wrapped around the camera.
    if (ghostCar) {
      ghostCar.group.visible = view !== "map";
      ghostCar.shadow.visible = view !== "map";
    }
    if (ghost && ghostTag) {
      const g = ghost.car;
      if (nameTags && view !== "map") ghostTag.place(g.x, g.y, g.z, chase.camera);
      else ghostTag.hide();
    }
    // The mirror is bolted to the CAR, so it is aimed from the state rather
    // than from whatever the camera did with it — which is what lets the
    // same strip of glass answer the same question under every view. It
    // hangs on the same rule as the way home above: the views nobody drives
    // from have nothing behind them worth showing, and neither does a run
    // the water has already taken or a car being paraded past the line.
    mirrorUp = mirrorOption && driving && state.phase !== "finished";
    // The cockpit shows the same picture in its own mirror (car/cockpit.ts),
    // so the strip over the frame is not drawn as well.
    mirrorStrip = mirrorUp && view !== "cockpit";
    // ...BUT IT IS ONLY REFILLED ON ITS OWN CLOCK, and how fast that clock
    // runs is what this machine can afford this second (mirror-pace.ts). The
    // pass behind the strip is the whole scene drawn a second time and it is
    // the most expensive thing in a driving frame, so it is the first thing
    // to give way when the frame rate does. The composite over the top still
    // happens every frame, so what the player sees is a continuous strip
    // showing an answer a fraction of a second old.
    //
    // The pace is judged on frames the glass was actually IN. A slow frame
    // with the mirror down says nothing about what the mirror costs, and a
    // ladder that climbed through a menu would arrive at the first corner
    // having proved nothing.
    if (mirrorUp) {
      if (!mirrorWas) mirrorPace.settle();
      mirrorPace.frame(dt);
    }
    mirrorWas = mirrorUp;
    const pace = mirrorPace.tier();
    mirrorRange = pace.range;
    mirrorAge += dt;
    mirrorFill = mirrorUp && mirrorAge >= refillGap(pace.hz);
    if (mirrorFill) mirrorAge = 0;
    // Aimed on the frames it is filled on, and only those: pointing a camera
    // nothing is about to render through is arithmetic for nobody.
    if (mirrorFill) mirror.aim(state, driverEyeY, environment.fogFar() * mirrorRange);
    // The road and its scenery are built for the WHOLE stage; the frame
    // only pays for the part the air is still clear enough to show. Last,
    // because the map view sets its fog from the framing it just solved —
    // culling ahead of that would measure the stage against a driving fog
    // and blank the entire map for the frame the view opens on.
    world?.cull(chase.camera, environment.fogFar(), mirrorUp ? mirror.camera : null);
    drawScene();
  };

  /** The box the buffer was last cut to, in CSS pixels — three's own answer,
   * asked for rather than remembered so nothing can be remembered wrong. */
  const cut = new THREE.Vector2();

  /** Cut the drawing buffer to a canvas box `w`x`h` CSS pixels, and re-frame
   * the camera on it — but only when it is not already that. The buffer is
   * checked in DEVICE pixels too: a canvas whose backing store was resized
   * out from under the page (a mobile browser reclaiming it while the app was
   * away) still reads back the size three last asked for, and the pixels are
   * the only place that shows. */
  const syncSize = (w: number, h: number): void => {
    const ratio = renderer.getPixelRatio();
    renderer.getSize(cut);
    const sameBox = cut.x === w && cut.y === h;
    const sameBuffer =
      canvas.width === Math.floor(w * ratio) && canvas.height === Math.floor(h * ratio);
    if (sameBox && sameBuffer) return;
    renderer.setSize(w, h, false);
    applyAspect();
  };

  /** One frame, into the whole canvas or into the map pane. Scissoring the
   * pane leaves the rest of the canvas painted flat sky, which is what the
   * Roam page's cards sit on. */
  const drawScene = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    // The viewport below is measured fresh every frame; the BUFFER it lands
    // in is cut once per resize. Let those two drift apart and the frame is
    // drawn into a corner of a canvas that is a different size — the game in
    // a band down one side, flat page colour through the rest of it, which is
    // exactly what an iOS PWA does on the way back from the background: it
    // comes back to a box it never announced with a `resize` event, so
    // nothing re-cuts the buffer and only a rotation (which does announce
    // itself) puts it right. So the frame checks its own canvas instead of
    // trusting the last event: same measurement for both, every frame, or
    // the size is re-applied here before anything is drawn.
    syncSize(w, h);
    if (!mapView || !mapRect) {
      // THE REAR VIEW IS DRAWN FIRST, because one of its two homes is inside
      // the frame rather than over it: the cockpit's mirror is geometry, and
      // geometry samples a texture that has to already exist. The strip over
      // the top of the screen does not care either way.
      if (mirrorFill) {
        // The way home is parented to the FORWARD camera, so in the mirror
        // pass it would hang in mid-air beside the car with its needle
        // pointing at nothing. Nothing else in the scene is camera-bound.
        const arrow = wayHomeArrow.group.visible;
        wayHomeArrow.group.visible = false;
        // The mirror's lens sits between the player's own seats, so the one
        // other thing the pass has to lose is the cabin around it — left in,
        // the glass shows the back of the bulkhead and the mirror stops
        // answering the only question it is there to answer. That now means
        // BOTH cabins, the cockpit included: a mirror drawing the fascia it
        // is bolted to would also be sampling its own texture. The RIVALS
        // keep theirs — those are cars behind you, seen from outside, and
        // their crews showing through their screens is the point.
        const cabin = car?.cabin ?? null;
        const cockpit = car?.cockpit ?? null;
        const cockpitUp = cockpit?.visible ?? false;
        if (cabin) cabin.visible = false;
        if (cockpit) cockpit.visible = false;
        // The air comes in with the far plane, so the world leaves the
        // mirror's frustum where it had already gone solid — see withHaze.
        environment.withHaze(mirrorRange, () => mirror.fill(renderer, scene, w, h));
        if (cabin) cabin.visible = true;
        if (cockpit) cockpit.visible = cockpitUp;
        wayHomeArrow.group.visible = arrow;
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, chase.camera);
      if (mirrorStrip) mirror.composite(renderer, w, h);
      return;
    }
    // Clear the whole canvas first, then draw only inside the pane. WebGL's
    // origin is the BOTTOM-left; the rect arrives measured from the top.
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    const y = h - mapRect.y - mapRect.height;
    renderer.setViewport(mapRect.x, y, mapRect.width, mapRect.height);
    renderer.setScissor(mapRect.x, y, mapRect.width, mapRect.height);
    renderer.setScissorTest(true);
    renderer.render(scene, chase.camera);
    renderer.setScissorTest(false);
  };

  const resize = (): void => {
    syncSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  };

  const dispose = (): void => {
    world?.dispose();
    route?.dispose();
    layers?.dispose();
    car?.dispose();
    ghostCar?.dispose();
    ghostTag?.dispose();
    field.dispose();
    carFx.dispose();
    wayHomeArrow.dispose();
    mirror.dispose();
    environment.dispose();
    renderer.dispose();
  };

  resize();
  return {
    setGame,
    setCar,
    setVideo,
    setCamera,
    setMirror: (on) => {
      mirrorOption = on;
    },
    setView: (view) => {
      chase.setViewTuning({
        rise: view.seat,
        ahead: view.reach,
        fov: view.fov,
        motion: view.headMotion,
      });
    },
    setNameTags: (on) => {
      nameTags = on;
      field.setNames(on);
      if (!on) ghostTag?.hide();
    },
    setMapRect,
    nudgeMap: (dAz, dPitch, zoomBy) => chase.nudgeMap(dAz, dPitch, zoomBy),
    panMap: (dxFrac, dyFrac) => chase.panMap(dxFrac, dyFrac),
    resetMap: () => chase.resetMap(),
    setMapLayer: (id) => {
      layerId = id;
      return layers?.show(id) ?? null;
    },
    holdMap: (held) => chase.holdMap(held),
    placeMap: (pose) => chase.placeMap(pose),
    mapPose: () => chase.mapPose(),
    setConditions,
    onThunder: environment.onThunder,
    onKnock: (play) => {
      knockPlay = play;
    },
    setGhost,
    onGhostEvents,
    field,
    setStanding: (place) => {
      standing = place;
    },
    spectate: (run) => {
      watched = run;
      field.watch(run);
      // The lens changes car, and the rig has to be re-stood around the new
      // one either way: coming BACK it is standing behind somebody else's car
      // on another part of the stage, and the flying finish would otherwise
      // plant its shot there.
      //
      // ARRIVING at a crew it FLIES — a second, in an arc over whatever
      // country lies between (camera-sweep.ts) — because the gap between two
      // cars on a stage is hundreds of metres and a cut across it says
      // nothing about where either of them is. Standing down is a cut: the
      // destination there is the results card, not a shot.
      const onto = run ? run.state : game;
      if (onto) chase.retake(onto, run !== null);
    },
    cycleCamera: () => chase.cycle(),
    flyCamera: (move) => {
      // The look deltas and the wheel steps ACCUMULATE until the camera
      // consumes them, so a frame the camera skipped is a nudge that still
      // arrives rather than one that is lost.
      chase.freeMove.forward = move.forward;
      chase.freeMove.right = move.right;
      chase.freeMove.up = move.up;
      chase.freeMove.fast = move.fast;
      chase.freeMove.yawDelta += move.yawDelta;
      chase.freeMove.pitchDelta += move.pitchDelta;
      chase.freeMove.speedSteps += move.speedSteps;
    },
    flyFrozen: (dt) => chase.flyOnly(dt),
    placeCamera: (pose) => chase.free.place(pose),
    cameraPose: () => ({ ...chase.pose(), speed: chase.free.speed(), mode: chase.mode() }),
    mirrorPace: () => mirrorPace.tier(),
    pinMirrorPace: mirrorPace.pin,
    skipIntroShot: chase.skipStartShot,
    render,
    onEvents,
    resize,
    dispose,
  };
}
