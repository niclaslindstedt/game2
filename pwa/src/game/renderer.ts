// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer facade: owns the THREE scene, swaps worlds when a new stage
// arrives, and draws one frame from the GameState the engine produced. The
// engine never imports THREE; this module never steps physics. Sky, fog,
// lights, and weather live in environment.ts; this file wires them to the
// run and drives the ground-contact and exhaust particle systems.

import * as THREE from "three";
import { TUNING, type GameEvent, type GameState } from "@engine";

import { createAmbientLife } from "./ambient-life.ts";
import { createCelebration } from "./celebration.ts";
import { createGameCamera, type CameraMode } from "./camera.ts";
import {
  DRAW_DISTANCE_SCALE,
  EFFECTS_SCALE,
  FLORA_SCALE,
  RESOLUTION_SCALE,
  type VideoSettings,
} from "./settings.ts";
import { LAMP_MATERIAL, buildCar, type CarVisual } from "./car-mesh.ts";
import { hoodEyeFor } from "./car-styles.ts";
import {
  createDust,
  paceScale,
  SPLASH_WATER,
  TARMAC_SMOKE,
  TIRE_SMOKE,
  WATER_FOAM,
  WILD_THROW,
  type DustTint,
} from "./dust.ts";
import { biomeFor } from "./biome.ts";
import { createEnvironment } from "./environment.ts";
import { createFumes } from "./fumes.ts";
import { createRain } from "./rain.ts";
import { createWayHomeArrow } from "./way-home.ts";
import { buildMapRoute, type MapRoute } from "./map-route.ts";
import { classify } from "./standings.ts";
import { rockAt } from "./terrain.ts";
import { buildWorld, type World } from "./world.ts";

/** The map view's fog, as fractions of the camera's standoff distance. The
 * ground is only built ~640 m past the road, so it HAS an edge; hanging the
 * fog off the framing distance is what dissolves that edge into the sky
 * instead of ending the world on a visible straight line. */
const MAP_FOG_NEAR = 0.85;
const MAP_FOG_FAR = 1.75;

/** Dry grit: the loose stuff lying on top of a graded road. */
const GRIT = 0xb29268;
/** Water, thrown as a blue sheet. */
const SPRAY = 0x4fa0f0;
/** Tire smoke — boiled off the rubber, so it is the one cloud in the game
 * that has nothing to do with the ground under the car. */
const SMOKE = 0xd8d5cf;
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
/** Off the road there is turf on top of the earth, and a wheel brings up
 * both: mostly torn grass with dark clods of the dirt under it. The green
 * is the biome's own meadow taken a shade down — a blade in the air is not
 * lit like the field it came out of — and the clods are earth, the one tone
 * the ground palette has no name for, because nothing is that color until
 * something digs it up. */
const WILD_DUST: DustTint = {
  base: new THREE.Color(biomeFor().ground.grass).multiplyScalar(0.86).getHex(),
  fleck: 0x4a3520,
  fleckMix: 0.28,
};

/** What a mountain gives instead. Above the tree line and on the steep
 * flanks there is no turf to tear — a wheel scrabbles on bedrock and throws
 * the stone itself, the biome's own rock with the darker shade of it
 * through the cloud. Lighter than the rock face it comes off, because
 * shattered grit catches the sky where a flat face does not. */
const STONE_DUST: DustTint = {
  base: new THREE.Color(biomeFor().ground.bedrock).multiplyScalar(1.06).getHex(),
  fleck: biomeFor().ground.bedrockDark,
  fleckMix: 0.32,
};

export type GameRenderer = {
  setGame: (state: GameState) => void;
  /** Apply the player's video options. Resolution, draw distance and the
   * effects budget take hold immediately; flora density is baked into the
   * geometry, so it lands on the next stage built. */
  setVideo: (video: VideoSettings) => void;
  /** Place the camera: the two play modes come from the camera key, the
   * drone and map views are placed by the menu behind it. */
  setCamera: (mode: CameraMode) => void;
  /** Confine the map view to a rectangle of the canvas, in CSS pixels from
   * its top-left — the Roam page's map pane. The rest of the canvas is left
   * as flat sky for the DOM cards to sit on. Null draws full-bleed. */
  setMapRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  /** Re-light an already-built stage (the pre-race menu flipping time of
   * day / weather) without rebuilding its geometry. */
  setConditions: (state: GameState) => void;
  /** Put a ghost on the road — the best run on this stage, replaying its
   * own game beside the player's. The renderer keeps the reference and
   * draws whatever it says every frame; null takes it off again. */
  setGhost: (state: GameState | null) => void;
  /** The ghost's own events, spent on ITS body alone: it crumples and
   * sheds parts the way the run did, and throws no dust, no camera kick
   * and no sound, because none of that happened here. */
  onGhostEvents: (state: GameState, events: GameEvent[]) => void;
  cycleCamera: () => CameraMode;
  render: (state: GameState, dt: number) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  resize: () => void;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement, video: VideoSettings): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  let quality = video;
  const applyResolution = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, RESOLUTION_SCALE[quality.resolution]));
  };
  applyResolution();

  const scene = new THREE.Scene();
  const environment = createEnvironment(scene);

  const chase = createGameCamera(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const dust = createDust();
  scene.add(dust.points);
  // The tarmac's own cloud: what the tires give up when the road holds
  // them instead of letting go under them.
  const smoke = createDust(TIRE_SMOKE);
  scene.add(smoke.points);
  // Water the CAR throws, which is a different cloud from the sheet a
  // rolling wheel sprays: the column an entry displaces, and the froth it
  // leaves working on the surface afterwards.
  const spray = createDust(SPLASH_WATER);
  scene.add(spray.points);
  const foam = createDust(WATER_FOAM);
  scene.add(foam.points);
  const fumes = createFumes();
  scene.add(fumes.points);
  const rain = createRain();
  scene.add(rain.lines);
  const life = createAmbientLife();
  scene.add(life.group);
  // The finish's salute. Its clouds live in the scene for the whole run and
  // are empty until the line is crossed — a particle pool costs nothing
  // while it is parked.
  const celebration = createCelebration();
  for (const cloud of celebration.clouds) scene.add(cloud);
  const wayHomeArrow = createWayHomeArrow();
  // The arrow lives in camera space, and a camera only draws its children
  // when it is itself part of the scene being rendered.
  scene.add(chase.camera);
  chase.camera.add(wayHomeArrow.group);

  let world: World | null = null;
  let route: MapRoute | null = null;
  let car: CarVisual | null = null;
  let ghost: GameState | null = null;
  let ghostCar: CarVisual | null = null;
  let game: GameState | null = null;
  /** True while the map view is up: it suspends the transient FX and pushes
   * the fog out past the whole stage. */
  let mapView = false;
  /** The map pane, CSS pixels from the canvas' top-left. */
  let mapRect: { x: number; y: number; width: number; height: number } | null = null;
  let dustClock = 0;
  /** Grains owed but not yet thrown. Pace and the surface thin a cloud's
   * count into a fraction, and rounding each spawn on its own turns a thin
   * trickle into silence — a tenth of a grain per spawn has to come out as
   * one grain every ten spawns, not zero forever. */
  let grainDebt = 0;
  /** Last frame's forward speed — the launch's wheelspin is read off the
   * change in it. */
  let lastSpeed = 0;
  let fumeClock = 0;
  /** Beat for the water working around a hull that is going down. */
  let drownClock = 0;

  /** The environment's light tint, pushed onto everything that carries its
   * own baked or vertex colors (the car, the particles). */
  const applyTint = (): void => {
    const tint = environment.carTint();
    const paint = (visual: CarVisual | null): void =>
      visual?.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            const painted =
              mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.PointsMaterial;
            if (painted && mat.name !== LAMP_MATERIAL) mat.color.copy(tint);
          }
        }
      });
    paint(car);
    paint(ghostCar);
    // A lamp is the one thing on the car the failing light makes BRIGHTER,
    // so it is switched, not tinted.
    car?.setLights(environment.lampsLit());
    ghostCar?.setLights(environment.lampsLit());
    (dust.points.material as THREE.PointsMaterial).color.copy(tint);
    (smoke.points.material as THREE.PointsMaterial).color.copy(tint);
    (fumes.points.material as THREE.PointsMaterial).color.copy(tint);
    life.setTint(tint);
  };

  /** How thick the transient FX are right now: the effects budget, and
   * nothing at all under the map view, where a gravel particle a metre
   * across is invisible and still costs a draw. */
  const fxScale = (): number => (mapView ? 0 : EFFECTS_SCALE[quality.effects]);

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

  const setConditions = (state: GameState): void => {
    environment.apply(state.env);
    const wet = state.env.weather === "storm" ? 1 : state.env.weather === "rain" ? 0.55 : 0;
    rain.setIntensity(fxScale() > 0 ? wet : 0);
    applyRange();
    applyTint();
  };

  const setVideo = (next: VideoSettings): void => {
    quality = next;
    applyResolution();
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
    chase.setMode(mode);
    mapView = mode === "map";
    applyAspect();
    if (mapView === wasMap) return;
    if (game) setConditions(game);
    else applyRange();
  };

  const setMapRect = (rect: typeof mapRect): void => {
    mapRect = rect;
    applyAspect();
  };

  const dropGhost = (): void => {
    ghost = null;
    if (!ghostCar) return;
    scene.remove(ghostCar.group, ghostCar.shadow, ghostCar.debris);
    ghostCar.dispose();
    ghostCar = null;
  };

  const setGame = (state: GameState): void => {
    if (world) {
      scene.remove(world.group);
      world.dispose();
    }
    if (route) {
      scene.remove(route.group);
      route.dispose();
    }
    if (car) {
      scene.remove(car.group, car.shadow, car.debris);
      car.dispose();
    }
    game = state;
    lastSpeed = state.car.u;
    world = buildWorld(state.track, FLORA_SCALE[quality.flora]);
    scene.add(world.group);
    route = buildMapRoute(state.track);
    route.group.visible = mapView;
    scene.add(route.group);
    car = buildCar(state.spec);
    scene.add(car.group, car.shadow, car.debris);
    chase.setHoodEye(hoodEyeFor(state.spec));
    environment.setLampSpread(car.lampSpread.front, car.lampSpread.rear);
    // A new stage is a new run: whoever wants a ghost on it says so after.
    dropGhost();
    setConditions(state);
  };

  const setGhost = (state: GameState | null): void => {
    dropGhost();
    if (!state) return;
    ghost = state;
    ghostCar = buildCar(state.spec, { ghost: true });
    scene.add(ghostCar.group, ghostCar.shadow, ghostCar.debris);
    applyTint();
  };

  /** What a wheel throws where. The road's is one tone of dry grit; the
   * WILD's is two, because a verge is grass with earth under it — the wheel
   * tears the turf and both come up together, mostly green with dark clods
   * through it. But the wild is not one ground: a mountain flank has no turf
   * on it, and green grit coming off bare rock is the tell. So off the road
   * the cloud is chosen from the ground the car is actually standing on, by
   * the same rule the terrain is PAINTED with, and a burst at a time rather
   * than blended — a hillside going over to rock throws some of each, which
   * reads as the ground changing instead of the effect switching. */
  const groundDust = (state: GameState): number | DustTint => {
    if (state.surface === "water") return SPRAY;
    if (state.surface !== "nature") return GRIT;
    const rock = rockAt(state.terrain.groundAt, state.car.x, state.car.z);
    return Math.random() < rock ? STONE_DUST : WILD_DUST;
  };

  const onEvents = (state: GameState, events: GameEvent[]): void => {
    const c = state.car;
    const fx = fxScale();
    for (const ev of events) {
      if (ev.type === "landing") {
        chase.kick(ev.clean ? 0.25 : 0.5);
        dust.spawn(
          c.x,
          c.y + 0.2,
          c.z,
          groundDust(state),
          Math.round((ev.clean ? 14 : 26) * fx),
          4,
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
        chase.kick(ev.deep ? 0.45 + 0.25 * force : 0.2 + 0.2 * force);
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
        dust.spawn(c.x, c.y + 0.1, c.z, groundDust(state), Math.round(10 * fx), 3);
      } else if (ev.type === "finish") {
        // R25 — the salute, sized by where the time placed. Fourth and
        // worse fire nothing, and `fire` knows it.
        celebration.fire(classify(state.track, ev.time).place, world?.muzzles() ?? []);
      } else if (ev.type === "respawn") {
        chase.kick(0.3);
      } else if (ev.type === "impact") {
        // The hit lands where the engine says it did: a debris-grey burst
        // at that point on the body, and a camera jolt sized to the speed.
        chase.kick(Math.min(0.9, 0.25 + ev.speed * 0.02));
        const a = c.heading + ev.angle;
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
    // How hard the car is gathering speed. Nothing in `GameState` carries
    // it, and the launch is the one moment that can only be recognised from
    // it, so the renderer differentiates the speed it is handed anyway.
    const accel = dt > 0 ? (c.u - lastSpeed) / dt : 0;
    lastSpeed = c.u;
    dustClock += dt;
    if (fx > 0 && !c.airborne && dustClock > (sealed ? TARMAC_SMOKE.every : 0.03)) {
      dustClock = 0;
      const cloud = sealed ? smoke : dust;
      const color = sealed ? SMOKE : groundDust(state);
      // Smoke is boiled off the tire and left behind; grit is thrown by it.
      // So the wake it inherits is gentler, and it spreads instead of arcing.
      const wake = sealed ? 0.12 : 0.35;
      const wakeX = -fwdX * c.u * wake + state.wind.x * 0.6;
      const wakeZ = -fwdZ * c.u * wake + state.wind.z * 0.6;
      // The tires letting go is what throws gravel — `slide` is that
      // number, so the plume comes up the instant the car is asked for more
      // grip than it has, not once the angle has already developed.
      const sideways = c.slide > 0.15 && c.u > 6;
      // How much ground this wheel is actually moving: pace decides the
      // size of any thrown cloud, and the wild gives up far less of itself
      // than the road does. Neither applies to smoke, which is made of the
      // tire rather than the ground.
      const pace = sealed ? 1 : paceScale(c.u);
      const thrown = sealed ? 1 : pace * (state.surface === "nature" ? WILD_THROW : 1);
      const grains = (count: number): number => {
        grainDebt += count * fx * thrown;
        const whole = Math.floor(grainDebt);
        grainDebt -= whole;
        return whole;
      };
      const rear = (side: number, count: number, spread: number): void =>
        cloud.spawn(
          c.x - fwdX * 1.5 + rightX * side * 0.8,
          c.y + 0.15,
          c.z - fwdZ * 1.5 + rightZ * side * 0.8,
          color,
          grains(count),
          spread * pace,
          wakeX,
          wakeZ,
        );
      if (sealed) {
        const T = TARMAC_SMOKE;
        if (c.u < T.launch.speed && accel > T.launch.accel) {
          // Off the line: the driven wheels are ahead of the car for a
          // moment, and that is the whole of it — it stops the instant
          // they hook up.
          rear(-1, T.launch.puffs, T.spread);
          rear(1, T.launch.puffs, T.spread);
        } else if (c.drifting) {
          // `drifting`, not `slide`: the readout is the settled ANGLE with
          // hysteresis behind it, so smoke comes up for the drift a player
          // can SEE and not for every corner that leans on the tires. A
          // sliding tire on tarmac makes a few big puffs where gravel
          // throws grains, and they hang where they were made.
          const puffs = T.drift.puffs + Math.round(c.slide * 3);
          rear(-1, puffs, T.spread);
          rear(1, puffs, T.spread);
        } else if (c.braking && c.u > T.brake.speed) {
          rear(Math.random() < 0.5 ? -1 : 1, T.brake.puffs, T.spread);
        }
      } else if (sideways || (state.offRoad && c.u > 6)) {
        // The drift plume also blows toward the slide, off the outside
        // wheels, and thickens as the slide deepens. Off-road earns it at
        // the same speed a slide does — a car picking its way back to the
        // track at walking pace is not excavating anything.
        const perWheel = 4 + Math.round(c.slide * 5);
        rear(-1, perWheel, 3.5);
        rear(1, perWheel, 3.5);
      } else if (c.braking && c.u > 8) {
        rear(-1, 4, 2.5);
        rear(1, 4, 2.5);
      } else if (c.u > 15) {
        // Rolling kickup is loose-surface only: a sealed road has nothing
        // lying on it to pick up.
        rear(Math.random() < 0.5 ? -1 : 1, 2, 1.6);
      }
    }

    // Exhaust: puffs off the tailpipe, faster and sootier on throttle and
    // boost, handed to the wind the moment they leave the pipe.
    fumeClock += dt;
    const fumeEvery = (c.boosting ? 0.02 : c.u > 1 ? 0.045 : 0.12) / Math.max(0.2, fx);
    if (fx > 0 && !c.airborne && fumeClock > fumeEvery) {
      fumeClock = 0;
      const shade = c.boosting ? 0.9 : 0.35 + 0.4 * Math.min(1, c.u / 30);
      fumes.spawn(
        c.x - fwdX * 1.9 + rightX * 0.35,
        c.y + 0.32,
        c.z - fwdZ * 1.9 + rightZ * 0.35,
        -fwdX * c.u * 0.15 + state.wind.x * 0.85,
        -fwdZ * c.u * 0.15 + state.wind.z * 0.85,
        shade,
      );
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

    dust.update(dt);
    smoke.update(dt);
    spray.update(dt);
    foam.update(dt);
    fumes.update(dt);
    // An endless run streams its world: the road chunks and terrain tiles
    // ahead get built here, the ones far behind get dropped.
    world?.sync(state);
    world?.update(dt, c.x, c.z);
    celebration.update(dt);
    car?.update(state, dt);
    if (ghost && ghostCar) ghostCar.update(ghost, dt);
    // The way home is a DRIVING aid, bolted to the camera. Under the menu's
    // drone and the map view there is nobody lost and nobody to point: left
    // running, it would hang a compass needle over the middle of the menu.
    // And there is nobody to point while the water is taking the car
    // either: a compass needle over a sinking wreck is an instruction the
    // player has no way to act on.
    //
    // Stated as "not the two overhead views" rather than as a list of the
    // play cameras, because that list grows: naming them is how the arrow
    // quietly stops appearing in the next camera somebody adds.
    const driving = view !== "drone" && view !== "map" && !state.drowning;
    wayHomeArrow.group.visible = driving;
    if (driving) wayHomeArrow.update(state, chase.camera, dt);
    chase.update(state, dt);
    environment.setGrime(car?.grime() ?? 0);
    environment.update(state, chase.camera, dt);
    const cam = chase.camera.position;
    if (fx > 0) {
      rain.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
      life.update(cam.x, cam.z, state.wind.x, state.wind.z, dt);
    }
    life.group.visible = fx > 0;
    rain.lines.visible = fx > 0;
    // The map framing changes with the stage and the pane, and the fog rides
    // it — see MAP_FOG_NEAR.
    if (mapView) {
      applyAspect();
      applyRange();
    }
    // The map view is looking at a stage, not a car, and at that range the
    // car is a speck that only draws the eye away from the route. Every
    // driving view keeps the body — the hood cam included, because the
    // bonnet under the lens is the whole point of that angle.
    if (route) route.group.visible = view === "map";
    if (car) {
      car.group.visible = view !== "map";
      car.shadow.visible = view !== "map";
    }
    // The ghost is the one car the hood cam must keep: it is out there on
    // the road being chased, not wrapped around the camera.
    if (ghostCar) {
      ghostCar.group.visible = view !== "map";
      ghostCar.shadow.visible = view !== "map";
    }
    drawScene();
  };

  /** One frame, into the whole canvas or into the map pane. Scissoring the
   * pane leaves the rest of the canvas painted flat sky, which is what the
   * Roam page's cards sit on. */
  const drawScene = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (!mapView || !mapRect) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, chase.camera);
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
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    applyAspect();
  };

  const dispose = (): void => {
    world?.dispose();
    route?.dispose();
    car?.dispose();
    ghostCar?.dispose();
    dust.dispose();
    smoke.dispose();
    spray.dispose();
    foam.dispose();
    fumes.dispose();
    rain.dispose();
    life.dispose();
    celebration.dispose();
    wayHomeArrow.dispose();
    environment.dispose();
    renderer.dispose();
  };

  resize();
  return {
    setGame,
    setVideo,
    setCamera,
    setMapRect,
    setConditions,
    setGhost,
    onGhostEvents,
    cycleCamera: () => chase.cycle(),
    render,
    onEvents,
    resize,
    dispose,
  };
}
