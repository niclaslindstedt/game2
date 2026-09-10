// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ATMOSPHERE IS, from outside: the handle the renderer holds
// (`Environment`), the stage the sky stands over (`Ground`), the still air
// a preview is lit by, and the few numbers about how OFTEN the sky is
// re-read rather than what it looks like. `environment.ts` builds one.

import * as THREE from "three";
import { type BiomeId, type GameState, type RaceEnv } from "@engine";

import type { LampSource } from "./car/lamps.ts";
import { type LampStage } from "./daylight.ts";
import { type SunShadows } from "./car-shadow.ts";
import { type VideoSettings } from "./settings.ts";
import { type Clap } from "./weather.ts";

/** What a lightning flash lights the world with while it lasts — a cold
 * blue-white that owes nothing to the time of day, because a strike is the
 * same colour at dawn as it is at midnight. */
export const FLASH_COLOR = 0xdfe9ff;

/** How far the sun has to move before the sky is PAINTED again, hours:
 * fifteen seconds of sun, a quarter of a second of racing.
 *
 * Only the dear half waits for this — the ridge rings' eighteen hundred
 * vertex colours, the dome's, the stars, the paint on every car in the
 * field — and at this step none of them moves by more than a shade or two
 * of 255, which is nothing an eye can find. Where the sun IS is read every
 * frame instead (`advance`): half of what the frame does with it is a
 * steep function of the elevation, and a sun that arrived four times a
 * second walked those up in visible steps. */
export const RELIGHT_EVERY = 1 / 240;

/** How far the sun has to move before the country's shadow is marched
 * again, radians — half a degree, a few seconds of racing.
 *
 * The march is three milliseconds, so this is as often as it can be
 * afforded; half a degree of sun is also further than the shadow's own
 * penumbra is deep, which is why the map brackets the sun with two of them
 * and the frame reads between (mountain-shadow.ts) rather than stepping
 * from one to the next. */
export const REMARCH_EVERY = 0.5 * (Math.PI / 180);

/** How fast the key light follows a cloud across the sun, 1/s. A cumulus
 * takes seconds to cross it; the light going with it in a frame would read
 * as a fault in the lamp. */
export const OCCLUSION_RATE = 1.4;

/** How fast the distance closes as the rain thickens, 1/s, and how far the
 * veil has to have moved before the RIDGE RINGS are painted again.
 *
 * Slower than the sheet itself on purpose. A squall arrives in a second
 * and the drops thicken with it, but the AIR takes longer — the distance
 * going with the gust frame for frame reads as the fog range being driven
 * by something rather than as weather. The fog itself takes the eased
 * value the frame it moves; the step is what keeps a number that moves
 * every frame from laying eighteen hundred vertex colours down every
 * frame, and a fortieth of the range is well under what an eye finds on a
 * ridge two hundred metres out. */
export const VEIL_RATE = 0.5;
export const VEIL_STEP = 0.025;

/** …and how much faster the RIDGE RINGS go than the view does. They stand
 * kilometres out where the fog is measured in hundreds of metres, so the
 * air is finished with them long before it is finished with the trees: at
 * the top of a snowfall this puts the whole chain into the fog, and a heavy
 * shower still leaves a grey skyline rather than erasing one. */
export const RINGS_TAKEN = 1.45;

/** WHAT THE AIR IS COLOURED INSIDE A SANDSTORM, and what the sky over it
 * goes to. Two tones and not one: the middle distance is the sand itself,
 * lit warm where the sun still gets through it, and the ceiling above is
 * the same dust deeper and dirtier — a haboob blots the sun out from below,
 * so the top of the frame is the darker half, which is the opposite of
 * every other weather in the game and the thing that makes it read. */
export const SAND_AIR = new THREE.Color(0xc39257);
export const SAND_SKY = new THREE.Color(0x9a6b3d);

/** The stage the sky stands over: where its road goes lowest and highest,
 * m over the sea (the mist pools at the floor; the deck hangs over the
 * road), and the country's heightfield for the shadow march. */
export type Ground = {
  floor: number;
  peak: number;
  heightAt: (x: number, z: number) => number;
};

export type Environment = {
  /** Re-color the whole atmosphere for the run's conditions, over the
   * country they are in (R40): the same storm is a downpour in one and a
   * wall of sand in the other. Once per stage; the clock does the rest. */
  apply: (env: RaceEnv, biome?: BiomeId) => void;
  /** The ground under the sky — for the mist, the deck and the shadow.
   * Null for a sky over nothing in particular (the harness pages). */
  setGround: (ground: Ground | null) => void;
  /** The video options' SKY lever. Applies at once. */
  setSkyLook: (level: VideoSettings["sky"]) => void;
  /** Scale how far the fog lets the player see, as a multiple of the
   * preset's own distances — the video options pull it in on a weak device. */
  setRange: (scale: number) => void;
  /** Where the air goes solid, m. Past it every fragment is pure fog
   * color, which is what makes the world's fog cull safe. */
  fogFar: () => number;
  /** Set the fog distances outright, in meters. The map view frames a whole
   * stage from kilometres away, where a multiple of the driving preset is
   * meaningless; what it needs is ground that dissolves just before the
   * built terrain runs out, instead of ending on a visible edge. */
  setFogRange: (near: number, far: number) => void;
  /** Draw one pass with the air pulled in — both fog distances scaled by
   * `by` for the duration of `draw`, and put back the moment it returns.
   *
   * The rear-view mirror is what needs this. It is a strip a few hundred
   * pixels wide showing a view the player never steers by, so it has no use
   * for the kilometre of clear air the forward view is given, and drawing
   * the whole of it a second time is what a mirror would otherwise cost.
   * Pulling the fog in rather than simply shortening the mirror camera's far
   * plane is what keeps the saving invisible: geometry leaves the frustum
   * where the air is already solid, instead of being cut off in mid-view.
   * The SKY takes no fog at all (`fog: false` on every shell), so the
   * mirror keeps its horizon, its ridges and its clouds. */
  withHaze: (by: number, draw: () => void) => void;
  /** Show or hide the SKY — the dome and everything pinned inside it: the
   * stars, the sun's disc and halo, the clouds, the ridge rings, and the
   * mist on the ground under it.
   *
   * Every one of them is a fixed-size shell a few hundred metres around a
   * camera at head height, which is the only place any of it makes sense.
   * Seen from the map view's satellite, kilometres up, the ridges lie across
   * the middle of the stage, the clouds sit under it, and the dome itself is
   * a ball hanging below the map with the camera outside it. Down there the
   * sky is the sky; up here it is `scene.background`, the same flat colour
   * the page's own cards sit on, and the stage reads as an island on it. */
  setSky: (show: boolean) => void;
  /** Current tint for the car's baked vertex lighting. */
  carTint: () => THREE.Color;
  /** …and the shadows that light throws (car-shadow.ts): the map hung off
   * the sun, which the environment aims and gates — the renderer only
   * hands it the machine it is drawn with and the video option it is
   * sized by. */
  shadows: SunShadows;
  /** …and the darker one hanging dust takes (sky.ts's `dustTintFor`): a
   * cloud in the dark is supposed to disappear where a car is not. */
  dustTint: () => THREE.Color;
  /** …and what a thing at airliner height is lit — the contrails, which
   * burn the sunset's orange after the valley has gone grey. */
  highTint: () => THREE.Color;
  /** How high the LID is overhead, m — the cloud base under this stage's
   * weather, or Infinity when there is no deck at all. What lives above the
   * weather rather than under it (ambient-life.ts's high traffic) reads it
   * to know whether the car can see any of it. */
  ceiling: () => number;
  /** Which stop of the light switch the car is actually running — off in
   * daylight, dipped through the long evening, main beam once the light has
   * gone (`Preset.lamps`), less whatever the dip switch takes off that for
   * a car close ahead. */
  lampStage: () => LampStage;
  /** How far off the nearest car the beams could land on, m (`Infinity` for
   * an empty road) — pushed per frame by the renderer, which is the only
   * thing that knows where the field is. */
  setCompany: (metres: number) => void;
  /** Call `cb` whenever THE LIGHT HAS CHANGED — the sky re-read on the sun's
   * clock, or the lamps moving a stop. Everything lit by the scene follows
   * on its own; this is for what does NOT, which is every surface carrying
   * its own baked colour: the cars' paint, their lenses, their cabins. Set
   * once. Without it a stage driven from the last of the daylight into the
   * night keeps the paint and the dark lamps it was BUILT with, however far
   * the sun has moved under it. */
  onRelight: (cb: () => void) => void;
  /** …and how much of a beam survives the daylight it is competing with,
   * 0..1. The environment drives the player's own lamps with it; anything
   * else that lights something off a car (the field's lamps on the dust)
   * reads it here rather than keeping a second answer. */
  lampPower: () => number;
  /** How hard this stage is raining, 0..1 — what anything the weather LANDS
   * on reads, the wipers on the car's glass first among them. Whatever
   * form it takes: see `snowing` for how much of it is flakes. */
  rainfall: () => number;
  /** How much of what is falling at the camera is SNOW rather than rain,
   * 0..1 (climate.ts) — what puts flakes on the glass instead of water. */
  snowing: () => number;
  /** How bright the sky is with lightning this instant, 0..1. */
  flash: () => number;
  /** …and which way the strike lighting it is coming from. */
  flashFrom: () => THREE.Vector3;
  /** The sun's clock this frame, hours 0..24 — for the overlay. */
  sunHour: () => number;
  /** The transient-FX budget, 0..1 — the video options' own scale. At
   * nothing the rain comes off entirely, which is what the low setting
   * promises. */
  setEffects: (scale: number) => void;
  /** What to do when a clap of thunder finally arrives. Set once; the
   * environment holds no opinion about sound beyond WHEN. */
  onThunder: (play: (clap: Clap) => void) => void;
  /** How filthy the car is, 0..1 — every beam fades under a caked lens. */
  setGrime: (level: number) => void;
  /** How much of each end's lighting is still on the car, 0..1 — a share,
   * not a switch, because the lamps break one at a time (`FRONT_LAMPS` /
   * `REAR_LAMPS`, engine-side). One headlamp gone is half the light down
   * the road, which is a fact about every night corner after it. */
  setLampsBroken: (front: number, rear: number) => void;
  /** WHICH LAMPS THIS CAR HAS, as the light sources its own body authored
   * (`car/lamps.ts`) — where each one sits, how strong it is and what shape
   * it throws. Pushed in when a car is built, because a beam belongs to a
   * lens: a quad-headlight face throws four, a car with a pod bar throws the
   * bar, and the LIGHTING row's cap is spent on the strongest of whatever it
   * turns out to be. */
  setLampPlan: (head: readonly LampSource[], tail: readonly LampSource[]) => void;
  /** The video options' LIGHTING row: how many beams each end of the car
   * throws (`LAMP_BEAMS`) and which shadow map the sun draws, if any. A
   * beam is paid for on every lit pixel in the frame, so this is the one
   * row that changes what the whole world costs rather than what is in it.
   * Applies at once — the lights are standing in the scene already. */
  setLighting: (level: VideoSettings["lighting"]) => void;
  /** THE DETAIL ROW's `snow` stop (settings.ts): whether the falling sheet
   * is lit by the car lamps and drawn as crystals near the glass, or is
   * plain dots. Applies at once — it is one shader on one sheet — and the
   * sheet's own colour is re-read with it, because what the sky is worth to
   * a flake depends on whether anything else is going to reach it. */
  setSnowCrystals: (on: boolean) => void;
  /** Hang the PLAYER's lamps on the register the dust clouds are lit from
   * (dust-light.ts), at whatever strength the daylight and the grime on the
   * lenses leave them. The register is emptied by its one owner, the
   * renderer, so this only ever adds. */
  lightDust: (car: { x: number; y: number; z: number; heading: number; braking: boolean }) => void;
  update: (state: GameState, camera: THREE.Camera, dt: number) => void;
  dispose: () => void;
};

export const STILL_AIR: RaceEnv = {
  hour: 12,
  weather: "clear",
  season: "summer",
  temperature: 18,
  windDir: 0,
  windSpeed: 0,
  gustPhase: 0,
  sand: false,
  sandstorms: 0,
  sandSeed: 0,
};
