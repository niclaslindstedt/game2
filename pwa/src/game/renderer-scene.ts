// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCENE, AND EVERY LEVER OVER IT. One WebGL context, one three.js
// scene, and everything standing in it: the atmosphere, the cameras, the
// mirror, the car and the ghost, the field, the world's chunks, the
// transient FX pools. Plus every setter the app turns — a new stage, a new
// car, a camera change, a video option — because each of them is a
// question about what the scene CONTAINS rather than about how a frame is
// drawn.
//
// Drawing one is `renderer-frame.ts`'s, and what a frame writes back is
// the `mut` record below; what it reads is `live`.

import * as THREE from "three";
import { type GameState, type Season } from "@engine";

import { createGameCamera, type CameraMode } from "./camera.ts";
import { desktopPicture, renderHeightScale } from "./desktop-video.ts";
import {
  DRAW_DISTANCE_SCALE,
  DUST_LAMP_CARS,
  LAMP_BEAMS,
  DUST_RAISED,
  EFFECTS_SCALE,
  EXHAUST_SEEN,
  GLASS_REFLECT,
  GLASS_SEEN_THROUGH,
  INTERIOR_DETAIL,
  CRUMPLE_SEEN,
  LOOSE_WHEELS,
  WHEELS_LOST,
  MIRROR_GLASS,
  SCREEN_GRIME,
  FLORA_SCALE,
  GROUND_SCALE,
  RESOLUTION_SCALE,
  wantsAntialias,
  type VideoSettings,
} from "./settings.ts";
import { type TvLens } from "./camera-tv-lens.ts";
import type { FilmDetail, InteriorDetail } from "./car-body.ts";
import { buildCar, tintCar, type CarVisual } from "./car-mesh.ts";
import { createFloraShadows } from "./flora-shadow.ts";
import { bodySpecFor, carEyes } from "./car-styles.ts";
import { pipeAnchors, type PipeAnchor } from "./car/shell.ts";
import { type DustTint } from "./dust.ts";
import { setDustLampCap } from "./dust-light.ts";
import { type PlumeGround } from "./ground-tint.ts";
import { createCarFx } from "./car-fx.ts";
import { createSnowMarks } from "./snow-marks.ts";
import { type WorldVec } from "./car-anchor.ts";
import { createEnvironment } from "./environment.ts";
import { createFieldCars } from "./field-cars.ts";
import { wetnessOf } from "./weather.ts";
import { createWayHomeArrow } from "./way-home.ts";
import { islandPlanes } from "./map-island.ts";
import { buildMapLayers, type MapLayerId, type MapLayers } from "./map-layers.ts";
import { createMirror } from "./mirror.ts";
import { createMirrorPace } from "./mirror-pace.ts";
import { createNameTag, GHOST_LOOK, TAG_LAYER, type NameTag } from "./name-tag.ts";
import { buildMapRoute, type MapRoute } from "./map-route.ts";
import { type RivalRun } from "./standings.ts";
import { buildWorld, type World } from "./world.ts";
import { MAP_FOG_FAR, MAP_FOG_NEAR } from "./renderer-face.ts";

export type RenderScene = ReturnType<typeof createScene>;

export function createScene(canvas: HTMLCanvasElement, video: VideoSettings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: wantsAntialias() });
  // The map view cuts the world to an island; the sky it hangs in must not
  // be cut with it, so the planes ride on the WORLD's own materials rather
  // than on the renderer.
  renderer.localClippingEnabled = true;
  let quality = video;
  /** THE RESOLUTION ROW, APPLIED — off the canvas's own box, because the
   * desktop half of the row is a height and a height is only a share of a
   * window somebody may have just resized. */
  const applyResolution = (cssHeight = canvas.clientHeight || 1): void => {
    const dpr = window.devicePixelRatio;
    // A SHARE of the device's own pixels, not a ceiling on them: HIGH is the
    // screen the machine actually has, and each stop down halves it. The
    // desktop app asks the same question in pixels instead, and NATIVE there
    // works out to this same 1 (desktop-video.ts).
    const share = desktopPicture()
      ? renderHeightScale(quality.renderHeight, cssHeight * dpr)
      : RESOLUTION_SCALE[quality.resolution];
    renderer.setPixelRatio(dpr * share);
  };
  applyResolution();

  const scene = new THREE.Scene();
  const environment = createEnvironment(scene);
  // The cars' shadows are a map drawn with this renderer, sized by the
  // lighting option (car-shadow.ts); the environment aims it.
  environment.shadows.bind(renderer, quality.lighting);
  /** The LIGHTING row, applied: the beams and the shadow are the
   * environment's, the dust's register is its own, and whether a pedal is a
   * light is every car's. All at once, because a cloud lit by more lamps
   * than the car is throwing is a cloud lit by lamps that are not there —
   * and a field braking in lights the player's own car does not have would
   * read as a bug in the car. */
  const applyLighting = (): void => {
    environment.setLighting(quality.lighting);
    setDustLampCap(2 * DUST_LAMP_CARS[quality.lighting]);
    environment.setSkyLook(quality.sky);
    const brakes = LAMP_BEAMS[quality.lighting].brakes;
    car?.setBrakeLights(brakes);
    ghostCar?.setBrakeLights(brakes);
    // …and whether the bodies READ the shadow map at this stop as well as
    // drawing into it (`RICH_SHADOWS`). The rig owns the decision because it
    // owns the bias that goes with it; the bodies own the flag.
    const rich = environment.shadows.rich();
    floraShadows.setEnabled(rich);
    car?.setShadowDetail(rich);
    ghostCar?.setShadowDetail(rich);
    field.setShadowDetail(rich);
  };

  const chase = createGameCamera(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const mirror = createMirror();
  mirror.setGlass(MIRROR_GLASS[quality.effects]);
  /** What the machine can afford to spend on the mirror — how often it is
   * refilled and how far it sees, both of which move while a stage is
   * driven (mirror-pace.ts). It outlives the world, because what a machine
   * can draw is a property of the machine and not of the stage. */
  const mirrorPace = createMirrorPace();
  /** The player's option, and whether this frame is one the glass belongs
   * in — the two are kept apart so `drawScene` can be asked the question
   * once, after `render` has decided it against the state and the view. */
  let mirrorOption = true;
  /** Whether the mirror was up on the frame BEFORE this one: the pace is
   * only judged on frames the glass was actually in, and the first of a run
   * of those follows frames drawn under a different load. */
  /** Whether the mirror's own pass runs THIS frame — see where it is set. */
  /** …and whether the WATER ON THE WINDSCREEN gets its own pass this frame:
   * the camera is in the car, and there is rain on the glass to draw. */
  /** The TV cam's depth-of-field pass, or null while nothing is looking
   * through it. Built on demand rather than up front: a full-size colour and
   * depth pair is real memory, and most runs never take the camera. */
  /** ...and how far it is allowed to see when it does, as a fraction of the
   * forward view's fog. Settled in `render` and read in `drawScene`, so both
   * halves of one frame pull the air in by the same amount. */
  /** Seconds since the glass was last refilled. Starts past any interval so
   * the very first driving frame fills it: a strip compositing a target
   * nothing has drawn into yet is a black hole over the road. */
  /** ...and whether it is drawn as the HUD's strip over the frame, as
   * opposed to into the cockpit's own mirror inside it. */
  /** The driver's eye height on the car now on the road, body-local m —
   * where the mirror's lens is hung from on a car with no mirror of its own
   * to stand it on (mirror.ts `fallbackMount`). */
  let driverEyeY = 1.21;
  // Every pool the car's contact with the world spawns into, built and hung
  // in the scene together (car-fx.ts). The renderer keeps the decisions —
  // what is thrown, when, and how much of it — and none of the plumbing.
  const carFx = createCarFx(scene);
  // The marks the player's car leaves in snow (snow-marks.ts); the field's
  // are the field's own. Whose are drawn is the DUST row's call.
  const marks = createSnowMarks();
  marks.group.name = "marks";
  scene.add(marks.group);
  const { mud, plume, gravel, fumes, life } = carFx;

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
  /** How much of a car is built for what is only visible up close — the
   * cabin behind its glass and the film on it — for the car the frame is
   * rendered FROM and for everyone else on the road. The INTERIOR row is
   * the level; the GLASS row says whether it reaches the field at all, and
   * a car it does not reach is the solid one: opaque windows, nothing
   * behind them, no wiper arms, no film. The screen resolution differs
   * whatever the row says: the player's is the one screen anybody looks
   * THROUGH, where the arc a blade leaves is read at arm's length, and
   * every other car is read from outside, where its glass only has to go
   * brown (car/wipers.ts). */
  const carDetail = (
    whose: "player" | "field",
  ): { interior: InteriorDetail; screens: FilmDetail; reflect: boolean } => {
    const furnished = GLASS_SEEN_THROUGH[quality.glass][whose];
    const grime = furnished && SCREEN_GRIME[quality.interior];
    return {
      interior: furnished ? INTERIOR_DETAIL[quality.interior] : "off",
      screens: grime ? (whose === "player" ? "fine" : "coarse") : "off",
      reflect: GLASS_REFLECT[quality.glass],
    };
  };
  // The trees that cast onto the car at the top LIGHTING stop. A pool of
  // its own rather than a flag on the world's flora — see flora-shadow.ts
  // for why a chunk's mesh can never be culled out of the shadow pass.
  const floraShadows = createFloraShadows();
  scene.add(floraShadows.group);
  const floraFocus = new THREE.Vector3();
  /** The chunk set the pool was last filled from (`world.floraAge`). */
  const field = createFieldCars(scene);
  // The LIGHTING row, first applied — down here rather than beside its own
  // function because it reaches the cars and the FIELD, and both have to
  // exist before it runs. A `const` read before its line is a temporal dead
  // zone, and the whole app fails to start with a minified name in the
  // message and nothing pointing at this line.
  applyLighting();
  // …and the DETAIL row's own share of the sheet standing in the scene, for
  // the same reason `setVideo` sets it: the environment is built plain, and
  // nothing else would tell it otherwise until the player opened OPTIONS.
  environment.setSnowCrystals(quality.snow === "crystal");
  field.setCarDetail({
    ...carDetail("field"),
    exhaust: EXHAUST_SEEN[quality.exhaust].field,
    looseWheels: LOOSE_WHEELS[quality.effects],
    wheelLoss: WHEELS_LOST[quality.wheelLoss].field,
    crumple: CRUMPLE_SEEN[quality.crumple].field,
    brakeLights: LAMP_BEAMS[quality.lighting].brakes,
  });
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
  /** Grains owed but not yet thrown. Pace and the surface thin a cloud's
   * count into a fraction, and rounding each spawn on its own turns a thin
   * trickle into silence — a tenth of a grain per spawn has to come out as
   * one grain every ten spawns, not zero forever. */
  /** Where this car's tailpipes end, read off its bodywork when the car is
   * fitted: a car with two of them smokes out of both. `pipeStub` is the
   * same car once the ground has torn the pipework off — one plume, out of
   * the break under the tail. Both are held rather than re-derived, because
   * which of them is in use changes the moment a landing shears the part. */
  let pipes: PipeAnchor[] = [];
  let pipeStub: PipeAnchor[] = [];
  /** Scratch for placing what is bolted to the car (`car-anchor.ts`): where
   * a pipe's mouth is, and which way it is pointing. Held here because both
   * are read once per puff and a pipe on its limiter makes sixty a second. */
  const pipeAt: WorldVec = { x: 0, y: 0, z: 0 };
  const pipeAxis: WorldVec = { x: 0, y: 0, z: 0 };
  const bayAt: WorldVec = { x: 0, y: 0, z: 0 };
  const smokeTint = new THREE.Color();
  /** HOW HOT THE TIRES ARE, 0..1 — the soot in the tarmac smoke rides on
   * it. Nothing in `GameState` carries it: heat is the one thing about a
   * tire that is a HISTORY rather than an instant, so the renderer keeps
   * it, building while the car is sliding and bleeding away when it is
   * not. */
  /** True while the ground is too wet to lift: set with the conditions,
   * because the weather does not change inside a run. */
  let wetGround = false;
  /** Beat for the water working around a hull that is going down. */

  /** The environment's light tint, pushed onto everything that carries its
   * own baked or vertex colors (the cars, the particles) — and, on the same
   * trip, the rain the cars' screens are wetted by.
   *
   * Hung off the environment's own relight (below), because everything here
   * is a surface the scene's lights cannot reach: a fullbright car takes the
   * failing light as a MULTIPLY, so nothing about the sun moving reaches it
   * unless somebody carries it over. Pushed at the sky's cadence rather than
   * per frame — `RELIGHT_EVERY` is already chosen as the step at which no
   * eye can see the colours move — and again the moment the lamps change
   * stop, which is a switch and has to land on one frame. */
  const applyTint = (): void => {
    const tint = environment.carTint();
    const lamps = environment.lampStage();
    const rain = environment.rainfall();
    const snowing = environment.snowing();
    if (car) tintCar(car, tint, lamps, rain, snowing);
    if (ghostCar) tintCar(ghostCar, tint, lamps, rain, snowing);
    field.paint(tint, lamps, rain, snowing);
    carFx.setTint(tint, environment.dustTint(), environment.ceiling(), environment.highTint());
  };

  /** How thick the transient FX are right now: the effects budget, and
   * nothing at all under the map view, where a gravel particle a metre
   * across is invisible and still costs a draw. */
  environment.onRelight(applyTint);

  const fxScale = (): number => (mapView ? 0 : EFFECTS_SCALE[quality.effects]);

  /** …and how thick the ground the car being driven raises is allowed to be:
   * the same budget, or nothing where the player has asked that no wheel on
   * the stage dig (the DUST row — settings.ts). Its own reader because that
   * row is about WHOSE cloud, not about how much of it: everything else the
   * car throws — a landing, a crash, an impact, the smoke off a hot tyre —
   * keeps the plain effects budget. */
  const dustFx = (): number => (DUST_RAISED[quality.dust].player ? fxScale() : 0);

  /** …and the same question for the pipe on the back of that car (the
   * EXHAUST row). Its own reader rather than a share of `dustFx` because
   * what the engine puts out and what the wheels pick up are two substances
   * with two settings: a soaked stage takes the towed cloud away and leaves
   * the exhaust exactly where it was. */
  const exhaustFx = (): number => (EXHAUST_SEEN[quality.exhaust].player ? fxScale() : 0);

  /** Which of the pools that hold NOTHING BUT one substance are drawn at
   * all — the two that are pure ground, and the one that is pure exhaust.
   * `dustFx` and `exhaustFx` already stop them being spawned into, but a
   * `THREE.Points` in the scene is a draw call and its whole vertex buffer
   * submitted every frame whether or not a grain is alive in it — and frames
   * are the entire point of switching either row off. The wheel pools are
   * not on this list: `dust` and `mud` are also where a landing, a lost
   * wheel and an impact throw, and none of those is a row's business.
   *
   * The towed cloud takes the wet stage's answer on top: a soaked road hangs
   * nothing behind a car, it throws clods, and those are the wheel pools'.
   * The pipe does not — rain settles what a wheel picks up and nothing that
   * comes out of an engine. */
  const applyClouds = (): void => {
    const raised = DUST_RAISED[quality.dust].player;
    plume.points.visible = raised && !wetGround;
    gravel.points.visible = raised;
    fumes.points.visible = EXHAUST_SEEN[quality.exhaust].player;
  };

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
      floraShadows.setSources([]);
      mut.floraAge = -1;
      builtSeason = state.env.season;
      world = buildWorld(
        state.track,
        FLORA_SCALE[quality.flora],
        builtSeason,
        GROUND_SCALE[quality.ground],
      );
      world.group.name = "world";
      scene.add(world.group);
      applyIsland();
    }
    const biome = state.track.knobs.biome;
    environment.apply(state.env, biome);
    // The ground the sky stands over: where the road goes lowest (the mist
    // pools there, the deck hangs over it) and highest, and the country's
    // own heightfield for the shadow a low sun leaves behind a ridge.
    let floor = Infinity;
    let peak = -Infinity;
    for (const sample of state.track.samples) {
      if (sample.elevation < floor) floor = sample.elevation;
      if (sample.elevation > peak) peak = sample.elevation;
    }
    environment.setGround(
      Number.isFinite(floor) ? { floor, peak, heightAt: state.terrain.heightAt } : null,
    );
    life.setCountry(biome, state.env.season);
    // Rain settles the stage. There is no cloud to tow once the surface is
    // soaked — what the wheels lift is clods — so the two swap over here,
    // once, rather than being decided per frame per particle. How hard it
    // is actually coming down is the environment's per-frame business: the
    // squall breathes, and the sheet has to breathe with it. Read against
    // the country (R40): a desert storm is wind and sand, and soaks nothing.
    wetGround = wetnessOf(state.env, biome) > 0;
    applyClouds();
    mud.points.visible = wetGround;
    applyRange();
    applyTint();
  };

  const setVideo = (next: VideoSettings): void => {
    quality = next;
    applyResolution();
    applyLighting();
    field.setCarDetail({
      ...carDetail("field"),
      exhaust: EXHAUST_SEEN[quality.exhaust].field,
      looseWheels: LOOSE_WHEELS[quality.effects],
      wheelLoss: WHEELS_LOST[quality.wheelLoss].field,
      crumple: CRUMPLE_SEEN[quality.crumple].field,
      brakeLights: LAMP_BEAMS[quality.lighting].brakes,
    });
    car?.setLooseWheels(LOOSE_WHEELS[quality.effects]);
    ghostCar?.setLooseWheels(LOOSE_WHEELS[quality.effects]);
    car?.setWheelLoss(WHEELS_LOST[quality.wheelLoss].player);
    ghostCar?.setWheelLoss(WHEELS_LOST[quality.wheelLoss].player);
    car?.setCrumple(CRUMPLE_SEEN[quality.crumple].player);
    // The ghost is a REPLAY of the player's own car, so it wears the row the
    // player's car wears rather than the field's.
    ghostCar?.setCrumple(CRUMPLE_SEEN[quality.crumple].player);
    mirror.setGlass(MIRROR_GLASS[quality.effects]);
    // The falling snow, like the dust cloud below it: a sheet standing in
    // the scene already, so this row applies to the run in progress.
    environment.setSnowCrystals(quality.snow === "crystal");
    // Unlike the rest of the DETAIL row, the dust CLOUD is not geometry and
    // does not wait for the next stage: the pool is standing in the scene
    // already, so switching that row is switching it, mid-run included.
    //
    // The EXHAUST row is the one that is BOTH — a pool and the pipes it
    // leaves — so it lands in two halves: turning it DOWN stops the smoke
    // now and leaves the pipes until the next car is built, and turning it
    // UP builds the pipes then and the smoke waits for them (`fitCar` reads
    // the row once, so the cloud can only leave a pipe that exists). Either
    // way the car is never a plume with no pipe under it.
    applyClouds();
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
    scene.remove(ghostCar.group, ghostCar.debris);
    ghostCar.dispose();
    ghostCar = null;
  };

  /** Put this state's car on the road, taking the old one off first. The
   * body carries the hood eye and the reach of its own lamps, so both are
   * re-read here rather than only where a whole stage is built. */
  const fitCar = (state: GameState): void => {
    if (car) {
      scene.remove(car.group, car.debris);
      car.dispose();
    }
    // The player's car is the one car on the stage with a first-person
    // cabin: it is the only one anybody will ever sit in.
    car = buildCar(state.spec, {
      ...carDetail("player"),
      cockpit: true,
      exhaust: EXHAUST_SEEN[quality.exhaust].player,
      // The rear view goes IN the cockpit's mirror rather than only into the
      // HUD's strip, so the mirror pass's texture is handed to the body that
      // hangs the glass.
      rearView: { texture: mirror.texture },
    });
    car.group.name = "player car";
    car.debris.name = "debris";
    scene.add(car.group, car.debris);
    car.setLooseWheels(LOOSE_WHEELS[quality.effects]);
    car.setWheelLoss(WHEELS_LOST[quality.wheelLoss].player);
    car.setCrumple(CRUMPLE_SEEN[quality.crumple].player);
    car.setBrakeLights(LAMP_BEAMS[quality.lighting].brakes);
    car.setShadowDetail(environment.shadows.rich());
    car.setMirrorFitted(mirrorOption);
    // Off the body AS BUILT: a car built without pipes (the EXHAUST row) has
    // nowhere for smoke to leave from, and this is what keeps the row's two
    // halves in step. The cloud switches the instant the row does and the
    // pipes only land on the next car built, so reading the row twice would
    // put a plume under a car with no pipe on it every time the row went UP
    // mid-stage. Read once, here, and the smoke can only ever come out of a
    // pipe that is actually there.
    const body = bodySpecFor(state.spec);
    const piped = EXHAUST_SEEN[quality.exhaust].player;
    pipes = piped ? pipeAnchors(body) : [];
    pipeStub = piped ? pipeAnchors(body, true) : [];
    const eyes = carEyes(state.spec);
    chase.setEyes(eyes);
    driverEyeY = eyes.hood.y;
    environment.setLampPlan(car.lampPlan.head, car.lampPlan.tail);
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
      floraShadows.setSources([]);
      mut.floraAge = -1;
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
    world.group.name = "world";
    scene.add(world.group);
    marks.reset();
    route = buildMapRoute(state.track);
    route.group.visible = mapView;
    route.group.name = "map route";
    scene.add(route.group);
    // The layers follow the stage they describe. Cheap to stand up — the
    // sampling waits for a layer to be picked — so a seed the developer is
    // stepping through carries its X-ray without paying for one.
    layers = buildMapLayers(state.track, state.terrain, island);
    layers.group.name = "map layers";
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
      // A ghost is a picture of a lap, seen from outside and half
      // transparent, so it is built the way every other car on the road is
      // rather than the way the one being looked out of is.
      ...carDetail("field"),
    });
    // The ghost gets the same plate the field does, for the same reason: on
    // a road with two cars on it, which of them is the one to beat is
    // information. Its own colour and its own fade, held under a real
    // crew's, so the plate is as much a picture as the car under it.
    ghostTag = createNameTag("Ghost", null, GHOST_LOOK);
    ghostCar.group.name = "ghost";
    ghostCar.debris.name = "ghost debris";
    scene.add(ghostCar.group, ghostCar.debris, ghostTag.sprite);
    ghostCar.setLooseWheels(LOOSE_WHEELS[quality.effects]);
    ghostCar.setWheelLoss(WHEELS_LOST[quality.wheelLoss].player);
    ghostCar.setCrumple(CRUMPLE_SEEN[quality.crumple].player);
    ghostCar.setBrakeLights(LAMP_BEAMS[quality.lighting].brakes);
    ghostCar.setShadowDetail(environment.shadows.rich());
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

  /** The frame's own running state: the mirror's cadence, the clocks the
   * dust and the smoke are metered off, and the flora shadows' age. It is
   * a record rather than a bag of locals because the frame is a sibling
   * module now (`renderer-frame.ts`) — every field is written there and
   * nowhere else, and the scene only says what each one starts at. */
  const mut = {
    mirrorUp: false,
    mirrorWas: false,
    mirrorFill: false,
    glassRain: false,
    tvLens: null as TvLens | null,
    mirrorRange: mirrorPace.tier().range,
    mirrorAge: Infinity,
    mirrorStrip: false,
    floraAge: -1,
    dustClock: 0,
    grainDebt: 0,
    fumeClock: 0,
    smokeClock: 0,
    rubberHeat: 0,
    drownClock: 0,
  };

  /** What the frame READS off the scene, live. Every one of these is
   * settled by the scene as the run changes under it — a new stage, a new
   * car, a video option moved — and read again on the next frame, so the
   * frame takes the record rather than the values. */
  const live = {
    get quality() {
      return quality;
    },
    set quality(v) {
      quality = v;
    },
    get mirrorOption() {
      return mirrorOption;
    },
    set mirrorOption(v) {
      mirrorOption = v;
    },
    get driverEyeY() {
      return driverEyeY;
    },
    set driverEyeY(v) {
      driverEyeY = v;
    },
    get world() {
      return world;
    },
    set world(v) {
      world = v;
    },
    get knockPlay() {
      return knockPlay;
    },
    set knockPlay(v) {
      knockPlay = v;
    },
    get route() {
      return route;
    },
    set route(v) {
      route = v;
    },
    get layers() {
      return layers;
    },
    set layers(v) {
      layers = v;
    },
    get layerId() {
      return layerId;
    },
    set layerId(v) {
      layerId = v;
    },
    get car() {
      return car;
    },
    set car(v) {
      car = v;
    },
    get ghost() {
      return ghost;
    },
    set ghost(v) {
      ghost = v;
    },
    get ghostCar() {
      return ghostCar;
    },
    set ghostCar(v) {
      ghostCar = v;
    },
    get ghostTag() {
      return ghostTag;
    },
    set ghostTag(v) {
      ghostTag = v;
    },
    get nameTags() {
      return nameTags;
    },
    set nameTags(v) {
      nameTags = v;
    },
    get game() {
      return game;
    },
    set game(v) {
      game = v;
    },
    get mapView() {
      return mapView;
    },
    set mapView(v) {
      mapView = v;
    },
    get mapRect() {
      return mapRect;
    },
    set mapRect(v) {
      mapRect = v;
    },
    get pipes() {
      return pipes;
    },
    set pipes(v) {
      pipes = v;
    },
    get pipeStub() {
      return pipeStub;
    },
    set pipeStub(v) {
      pipeStub = v;
    },
    get wetGround() {
      return wetGround;
    },
    set wetGround(v) {
      wetGround = v;
    },
    get standing() {
      return standing;
    },
    set standing(v) {
      standing = v;
    },
    get watched() {
      return watched;
    },
    set watched(v) {
      watched = v;
    },
  };

  return {
    canvas,
    renderer,
    applyResolution,
    scene,
    environment,
    applyLighting,
    chase,
    mirror,
    mirrorPace,
    carFx,
    marks,
    wayHomeArrow,
    carDetail,
    floraShadows,
    floraFocus,
    field,
    island,
    pipeAt,
    pipeAxis,
    bayAt,
    smokeTint,
    applyTint,
    fxScale,
    dustFx,
    exhaustFx,
    applyClouds,
    applyIsland,
    clipWorld,
    applyRange,
    setConditions,
    setVideo,
    applyAspect,
    setCamera,
    setMapRect,
    dropGhost,
    fitCar,
    setGame,
    setCar,
    setGhost,
    groundDust,
    plumeDust,
    DOWN,
    mut,
    live,
  };
}
