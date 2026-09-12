// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car in the scene: a body generated part-by-part from the car's
// CarBodySpec (car-body.ts builds it, car-styles.ts shapes it). The engine
// owns everything about how the car sits: position, heading, and both
// attitude angles; this file only spends them on the right three.js axes.
// The shadow it throws is nobody's to place — the shell is flagged to cast
// into the sun's shadow map (car-shadow.ts), and the ground under it, or
// the ground a jump has left behind, is wherever the light lands.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import {
  temperatureAt,
  FRONT_LAMPS,
  REAR_LAMPS,
  TUNING,
  type CarSpec,
  type DamagePart,
  type GameEvent,
  type GameState,
} from "@engine";

import {
  backlightNormal,
  buildCarBody,
  cockpitWheelTurn,
  dialAngle,
  frontLampAnchors,
  headLampSources,
  rearLampAnchors,
  steeringTurn,
  tailLampSources,
  CABIN_TRIM_MATERIAL,
  DIAL_TOP_SPEED,
  GLASS_OPACITY,
  INSTRUMENT_MATERIAL,
  LENS_MATERIAL,
  type FilmDetail,
  type InteriorDetail,
  type LampSource,
  type MirrorMount,
} from "./car-body.ts";
import { instrumentReadings } from "./car-instruments.ts";
import type { CrewLook } from "./car-crew.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt, glassSpray, groundTravel, wheelSpray } from "./car-dirt.ts";
import { createCarGlow } from "./car-glow.ts";
import type { Livery } from "./car-livery.ts";
import { revTremble, trembleAt } from "./car-shake.ts";
import type { ScreenRain } from "./car/screen-rain.ts";
import type { ScreenSnow } from "./car/screen-snow.ts";
import type { LampStage } from "./daylight.ts";
import { bodySpecFor } from "./car-styles.ts";
import { drivenAxles, wheelSurfaceSpeed } from "./car-wheels.ts";
import { glowTexture } from "./textures.ts";

/** A lamp's own light: a bloom laid over each cluster so the lamp reads as
 * SWITCHED ON rather than as a coloured panel.
 *
 * At night it is not a hint, it is THE BRIGHTEST THING IN THE FRAME. In a
 * photograph of a car's tail on an unlit road the body is a silhouette, and
 * what the eye actually gets is a saturated red halo a lamp-width wide
 * around a core so hot it has gone white. A cluster that reads as a red
 * rectangle is a cluster that is not switched on. The car is fullbright and
 * takes the time of day as a tint (renderer.ts), which is right for paint and
 * wrong for a lamp — a lamp is the one thing on the body that gets brighter
 * as the light goes, not darker. Additive over the lens, and exempt from the
 * tint by name, so the failing light cannot bleach the red out of it.
 *
 * The bloom is only half of it: the lens GEOMETRY behind it (car/lamps.ts)
 * is a reflector bowl with a hot spot on its floor, carrying its own
 * material for the same reason. The bloom is the light escaping the lamp;
 * the bowl is the lamp. Neither alone reads as lit. */
const LAMP_GLOW = 0xff2a14;
/** ...and the hotter tone the same lenses take with the pedal down. The
 * bloom is ADDITIVE, so once a marker burns near the top of the scale there
 * is no opacity left to say "brighter" with — a brake light steps up in
 * COLOUR instead, which is what it does in life: a filament run harder goes
 * whiter at the core before it goes wider. */
const BRAKE_GLOW = 0xff7a52;
/** ...and the warm white at the other end. A headlamp is pointed AWAY from
 * the chase camera, so what shows is spill around the rim rather than the
 * beam — which is why it is a paler, tighter bloom than the tail's. */
const HEAD_GLOW = 0xffe6b4;
/** The name that exempts it — matched in the renderer's `applyTint`. */
export const LAMP_MATERIAL = "car-lamp";
/** How far off the lamp's own face the bloom sits, m — and it is a HAND'S
 * WIDTH, not a film. The anchor is the lens, but the housing around it is a
 * box standing proud of the cap on every side (`buildCluster`), and a quad
 * tucked in tight against the lens is inside that box: depth-tested away,
 * every frame, on every car. A lamp with no glow at all looks exactly like a
 * lamp that is switched off, which is how this hid. Floating it clear costs
 * nothing — the quad is most of a metre across and the parallax at any range
 * the car is seen from is a pixel. */
const BLOOM_STANDOFF = 0.12;
/** How far the bloom spreads past the lens, as a multiple of the lens size. */
const LAMP_SPREAD = 4.2;
const HEAD_SPREAD = 2.6;
/** WHAT THE TAIL CLUSTER IS WORTH WITH THE PEDAL DOWN, with the lights off
 * (daylight) and on (dusk, night) — the FULL figure, because a brake light
 * is what the back of a car is for. It is the one lamp on the whole car that
 * has to be read in DAYLIGHT, where every other one is switched off: it is
 * the entire signal a driver behind gets, and at the couple of car lengths a
 * chase is fought over it is the difference between following a car and
 * hitting one.
 *
 * Which is also what holds the night figure down where it is rather than at
 * the top of the scale. The lamp has to read as its COLOUR first: a bloom
 * driven hard enough to look hot from a hundred metres is a red smear over
 * the whole tail of the car at the range the chase is actually fought at,
 * and the pool on the road behind (environment.ts) is what carries the
 * distance instead. */
const BRAKE_DAY = 0.45;
const BRAKE_NIGHT = 1;
/** ...and the MARKER under it, at half of the night figure and at NOTHING at
 * all by day. Half, because a tail lamp that is not a brake light says only
 * that there is a car there, which does not need much light — and holding it
 * to half is what makes the pedal a change you can see instead of a lamp
 * getting slightly brighter.
 *
 * Nothing by day, for the reason `HEAD_DAY` is nothing: a lamp that is not
 * SWITCHED ON has no light escaping it, and a bloom over one in sunlight is
 * a car driving round with its brake lights permanently on — which is worse
 * than no signal at all, because it makes the real one unreadable. The lens
 * itself is still drawn under it (`LENS_DARK`), so an unlit cluster is what
 * it should be: red plastic. */
const MARKER_SHARE = 0.8;
const LAMP_DAY = 0;
const LAMP_NIGHT = BRAKE_NIGHT * MARKER_SHARE;
/** The headlamps' pair, at each stop of the switch. Nothing in daylight — a
 * switched-off headlight is glass. On DIPPED the lamp is lit and says so:
 * the bloom is most of what the change is worth from behind, because the
 * short pool a low beam lays is ahead of the car where a chase camera cannot
 * see it, and a lit lens on a car in the failing light is the whole point of
 * switching on that early. Short of the driving lamps' own figure, so the
 * moment the beams open up is a moment on the car as well as on the road. */
const HEAD_DAY = 0;
const HEAD_DIPPED = 0.34;
const HEAD_NIGHT = 0.5;
/** How much of the bloom a fully caked lens swallows, 0..1. A stage's worth
 * of gravel on the glass is the reason rally cars carry lamp pods and
 * somebody wipes them at every service. */
const LAMP_GRIME = 0.6;
/** What the lenses keep of the world's light when the lamps are OFF. Their
 * material is driven instead of tinted, so this is the whole of what dusk
 * does to a dark lamp: enough to sit in the failing light with the paint
 * around it, and never so little that the glass goes to mud. Lit, they go
 * to full — the authored colour, whatever the stage is doing. */
const LENS_DARK = 0.42;
/** Full brightness, as the lerp target for an UNLIT lens — the authored
 * vertex colours, untouched. */
const WHITE = new THREE.Color(1, 1, 1);
/** ...and what a LIT one is multiplied by, which is past white on purpose.
 * A bowl is painted in the lens colour with the bulb's hot spot on its floor
 * (`glassTone`, car/lamps.ts); at the authored value that reads as red
 * plastic in daylight — correct — and as red plastic at midnight, which is
 * not. Driving it over one saturates the cells toward the white core a
 * burning lamp shows, and leaves the bloom around it to be the light
 * escaping. */
const LENS_LIT = 1.55;

/** The glass, per frame. `GLINT` is how much opacity a fully glancing view
 * adds to a clean pane — the baked sky at the top of every window is already
 * there, and raising the pane's opacity is what brings it forward over the
 * cabin behind it, so a car thrown sideways flares along its whole
 * greenhouse. `GRIME` is the same number for filth: a screen nobody has
 * wiped stops being something you can see a crew through. `CEILING` keeps
 * both short of solid, because a window that closes completely is a panel. */
const GLASS = { glint: 0.26, grime: 0.24, ceiling: 0.94, falloff: 3 };

/** What the glass keeps of that when the camera is INSIDE the car. Every
 * number above is authored for a pane read from outside — a baked sky
 * gradient brought forward by the angle and the filth on it — and from the
 * driver's seat the same pane is a wash of pale blue over the top half of
 * the road. A windscreen looked THROUGH is nearly clear, and the little that
 * is left is what keeps the window from reading as an empty hole. */
const GLASS_INSIDE = 0.25;

/** WHAT THE CABIN KEEPS OF THE WORLD'S LIGHT, by day and once the lamps are
 * on, and at the dusk stop between them. A closed box gets no sun: even in
 * daylight the room around the driver is a clear step darker than the paint
 * outside it, which is most of what
 * makes the road through the windscreen read as bright. At night it goes to
 * almost nothing — a rally car's cabin is unlit, and the two instruments are
 * the only things in it that are not. Those keep their authored colours
 * whatever the sky is doing (INSTRUMENT_MATERIAL is exempted from the tint
 * the same way a lamp is), so the darker the stage the more they are the
 * only thing there is to see. */
const CABIN_LIGHT = { day: 0.78, dusk: 0.44, night: 0.16 };

/** Front-wheel visual steer: radians of wheel angle at full lock...
 *
 * Exported because the drawn wheels are not the only thing that has to know
 * where the fronts are pointed: the track they leave in snow
 * (`snow-marks.ts`) is drawn as wide as the angle between where a tyre
 * points and where it is going, and a second copy of this number would be
 * a car whose ruts disagree with its own front wheels. */
export const WHEEL_STEER_LOCK = 0.55;
/** ...hard-clamped here, rad — past this the wheels read as broken. */
const WHEEL_STEER_MAX = 0.7;
/** How fast the drawn wheels chase the input, 1/s — quick enough to read
 * as the driver's hands, slow enough not to strobe on per-step input. */
const WHEEL_STEER_RATE = 14;

export type CarVisual = {
  group: THREE.Group;
  /** Where the rear-view mirror's glass hangs in this car, what it is aimed
   * at and how wide it looks, car-local — the mirror pass stands its lens
   * there (mirror.ts). Null on a car built without a cockpit, which has no
   * mirror to stand in. */
  mirrorMount: MirrorMount | null;
  /** ...and the object those car-local metres are measured in: the SPRUNG
   * chassis, which is where the cockpit and every panel of the body hang.
   * The mirror pass reads its world matrix rather than working the body's
   * chain out again, so the lens cannot drift by a millimetre from the
   * cabin it is bolted inside — through the springs' heave, the loft off a
   * brow, the engine's tremble and a corner riding on its bare hub alike.
   * That agreement is load-bearing now the lens is opened no wider than the
   * back window: anything the lens does that the body does not puts the
   * lining in shot. */
  mirrorFrame: THREE.Object3D;
  /** Draw the rear view. The lens stands on the cockpit's own mirror, so
   * what it sees is decided by which cabin is up around it — and that is
   * settled HERE for the length of the pass rather than by whatever view the
   * player is in: the first-person cabin is put up (its seats, its hoop, and
   * the backlight cut in its lining), the field's interior is taken down,
   * and the mirror's own pane comes out so the pass never samples the
   * texture it is drawing into. A car with no cockpit takes its whole
   * cabin down instead, the way a lens between the seats has to. */
  mirrorPass: (draw: () => void) => void;
  /** THE WATER ON THE WINDSCREEN (car/screen-rain.ts). Handed out because
   * it is the one thing on a car the renderer has to DRAW itself: the drops
   * refract the frame, so they go on after the frame is made, in a pass of
   * their own. The car drives everything else about it from `update`. Null
   * on every car but the player's, and on that one when the video options
   * have asked for clean screens. */
  screenRain: ScreenRain | null;
  /** ...and THE SNOW on it (car/screen-snow.ts): drawn in the same pass,
   * just before the water it melts into. */
  screenSnow: ScreenSnow | null;
  /** World-anchored debris (torn-off parts) — scene sibling of the car. */
  debris: THREE.Group;
  /** `eye` is where the camera is standing, in world metres — what decides
   * how hard the glass catches the light this frame. Left off, the pane
   * keeps whatever it had. */
  update: (state: GameState, dt: number, eye?: THREE.Vector3) => void;
  /** Whether the camera is sat INSIDE this car. It swaps the cabin the
   * player is looking at — the interior's furniture out, the cockpit in,
   * because from the driver's seat the two occupy the same space — and
   * thins the glass down to what a windscreen looked through actually is.
   * A no-op on a car built without a cockpit. */
  setInside: (inside: boolean) => void;
  /** Whether the rear view is live this frame — what puts a picture in the
   * cockpit mirror's pane rather than leaving it dark glass. */
  setRearView: (on: boolean) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  /** Whether a wheel torn off this car leaves as a rolling body or is
   * simply gone — the video options' call, pushed by whoever built the car
   * (`LOOSE_WHEELS` in settings.ts). */
  setLooseWheels: (on: boolean) => void;
  /** Whether this car may SHED A WHEEL when the ledger says one is gone —
   * the video options' call, per car (`WHEELS_LOST` in settings.ts). The
   * row above (`setLooseWheels`) says what a wheel that HAS come off does. */
  setWheelLoss: (on: boolean) => void;
  /** Whether this car's PANELS fold into the shape of what it hit — the
   * video options' call, per car, pushed by whoever built it (`CRUMPLE_SEEN`
   * in settings.ts). What comes OFF the car is not on this row. */
  setCrumple: (on: boolean) => void;
  /** Whether this body READS the shadow map as well as drawing into it
   * (`RICH_SHADOWS`, car-shadow.ts): its own roof over its door, its arches
   * over its tyres, and whatever else is in the map falling across it. Off
   * below the top LIGHTING stop, where nothing that receives is in the map
   * at all. */
  setShadowDetail: (rich: boolean) => void;
  /** Whether the car carries a rear-view mirror at all (the player's MIRROR
   * option) — as opposed to whether its picture is live right now. */
  setMirrorFitted: (on: boolean) => void;
  /** Which stop of the light switch the stage has the car on (`LampStage`) —
   * the lamps burn harder as it climbs, and their lenses stop taking the
   * tint the paint takes. Pushed from the
   * environment, which owns both decisions, along with the tint itself so
   * an unlit lens can still sit in the light the rest of the car is in. */
  setLights: (stage: LampStage, tint?: THREE.Color) => void;
  /** How hard it is raining on this car, 0..1 — what wets its screens and
   * sets its wipers going. Pushed from the environment for the same reason
   * the light is: the weather is the stage's, not the car's. */
  setWet: (rain: number) => void;
  /** How hard it is SNOWING on this car, 0..1 — the flakes that land on
   * its glass (car/screen-snow.ts). Its own number rather than a share of
   * `setWet`, because snow is not wet until the glass has melted it. */
  setSnow: (flakes: number) => void;
  /** How filthy the car has got, 0..1 — the environment dims its beams by
   * it, because the dirt is on the glass too. */
  grime: () => number;
  /** WHICH LAMPS THIS CAR HAS, as light sources — the ones its own body
   * authored (`car/lamps.ts`), strongest first. The environment hangs a beam
   * on as many of them as the LIGHTING row will pay for, so a quad face lays
   * a different pool from a pod bar and both come off their own lenses. */
  lampPlan: { head: readonly LampSource[]; tail: readonly LampSource[] };
  /** Whether standing on the pedal is a LIGHT on this car — the LIGHTING
   * row's say (`LAMP_BEAMS.brakes`). Off, the tail is a marker that never
   * changes, which is what the bottom of the row promises. */
  setBrakeLights: (on: boolean) => void;
  dispose: () => void;
};

/** How much of itself a ghost car shows, 0..1. Solid enough to hold its
 * shape and its tail lamps at the few car lengths a chase is actually
 * decided over, thin enough that the road runs visibly through it and it can
 * never be taken for a car that is there — a ghost is a picture: it runs its
 * own game, so there is nothing to touch and nothing to be hit by. */
const GHOST_OPACITY = 0.46;

export type CarOptions = {
  /** Build the car as a ghost: see-through, and dimmer where it glows. */
  ghost?: boolean;
  /** The rear view, for the pane in the cockpit mirror's glass. */
  rearView?: { texture: THREE.Texture };
  /** Also build the first-person cabin (car/cockpit.ts) — the player's car
   * only. Fifteen fascias nobody will ever sit behind is fifteen fascias. */
  cockpit?: boolean;
  /** How much cabin is built behind the glass — the player's VIDEO option.
   * Defaults to the full one; the field builds itself down a level, because
   * fifteen cabins is a different bill from one. */
  interior?: InteriorDetail;
  /** Repaint the body in one of the field's schemes (car-livery.ts) rather
   * than the livery car-styles.ts authored for it — how a car that is not
   * the player's is told apart from the player's. */
  paint?: Livery;
  /** The crew behind the glass (car-crew.ts). Defaults to the player's. */
  crew?: CrewLook;
  /** How finely the screens carry the grime film the wipers clear
   * (car/wipers.ts) — see `CarBodyOptions.screens`. Defaults to `fine`. */
  screens?: FilmDetail;
  /** Whether this car is built with its TAILPIPES on — see
   * `CarBodyOptions.exhaust`. Defaults to on. */
  exhaust?: boolean;
  /** Whether its windows show the world as well as the gradient baked into
   * them — see `CarBodyOptions.reflect`. Defaults to on. */
  reflect?: boolean;
};

/** Push the environment onto one body: its light, the shadow that light
 * throws, and how hard it is raining on it. Everything on a car carries
 * BAKED vertex colours on fullbright materials, so the time of day arrives
 * as a multiply into `material.color` rather than as a light — except a
 * LAMP, which is the one thing the failing light makes brighter, and is
 * therefore switched rather than tinted. Both of a lamp's surfaces are
 * exempted here: the bloom over it, and the lens under that. `setLights`
 * drives them from the same tint. */
export function tintCar(
  visual: CarVisual,
  tint: THREE.Color,
  lamps: LampStage,
  rain: number,
  snow = 0,
): void {
  visual.group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      // The PAINT is not here any more. A lit material takes the hour from
      // the sun and the sky like the road under it (car-surface.ts), and a
      // tint on top of that would be the failing light applied twice — the
      // car darker at dusk than the ground it stands on.
      //
      // What is left is the handful of surfaces that are still UNLIT because
      // being lit would be wrong for them: the sparks and flecks a
      // `PointsMaterial` draws, which have no normal to light and are their
      // own light anyway. The lamps, their lenses and the instruments are
      // unlit too and are DRIVEN rather than tinted — they get brighter as
      // the light goes, which is the opposite of a tint — so `setLights`
      // below owns them and they are skipped here.
      const driven =
        mat.name === LAMP_MATERIAL ||
        mat.name === LENS_MATERIAL ||
        mat.name === INSTRUMENT_MATERIAL;
      if (mat instanceof THREE.PointsMaterial && !driven) mat.color.copy(tint);
    }
  });
  visual.setLights(lamps, tint);
  // What is falling is rain until the air says it is snow (climate.ts):
  // the two are handed over apart, because a flake wets nothing until the
  // glass has melted it.
  visual.setWet(rain * (1 - snow));
  visual.setSnow(rain * snow);
}

export function buildCar(spec: CarSpec, options: CarOptions = {}): CarVisual {
  const group = new THREE.Group();
  // Which wheels the engine can spin, and which ones only the road turns.
  const driven = drivenAxles(spec.drive);
  const bodySpec = bodySpecFor(spec, options.paint);
  const body = buildCarBody(bodySpec, {
    interior: options.interior,
    crew: options.crew,
    cockpit: options.cockpit,
    rearView: options.rearView,
    screens: options.screens,
    exhaust: options.exhaust,
    reflect: options.reflect,
  });
  // Panels, parts and wheels share one material, so a ghost is one flag.
  // Its own back faces still occlude its front ones (depth writing stays
  // on): a car you can see through is a ghost, a car you can see the
  // INSIDE of is a bag of polygons.
  const fade = options.ghost ? GHOST_OPACITY : 1;
  if (options.ghost) {
    for (const mat of [body.body.material as THREE.MeshBasicMaterial, body.cabinTrimMaterial]) {
      mat.transparent = true;
      mat.opacity = GHOST_OPACITY;
    }
  }
  // The glass is already translucent, so a ghost's glass is a fade ON a
  // fade: whatever the pane works out to this frame, times the ghost's own.
  const glassMat = body.glass;
  const screen = backlightNormal(bodySpec);
  const view = new THREE.Vector3();
  group.add(body.group);
  const dirt = createCarDirt(body.group, wheelSpray(bodySpec));
  const damage = createCarDamage(body);

  // The one light the scene cannot throw for itself: what the car's own
  // lamps spill onto the panels around them (car-glow.ts). A headlamp is
  // aimed down the road, so the real spotlight behind it never touches the
  // wing carrying it, and this is the bounce a renderer has no way to
  // compute.
  //
  // It goes on the LIT materials and nothing else. The lamps and the
  // instruments are unlit by design — they are sources, and must not be lit
  // a second time by the light they are throwing — and the cabin's furniture
  // is exempt for the opposite reason, that a lamp bolted to the outside of
  // a closed box does not light the room behind it.
  const glow = createCarGlow(frontLampAnchors(bodySpec), rearLampAnchors(bodySpec));
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshPhongMaterial)) continue;
      if (mat.name === CABIN_TRIM_MATERIAL) continue;
      glow.graft(mat);
    }
  });

  // The lamp blooms ride the SPRUNG body, so they squat and rebound with the
  // panel they are stuck to instead of hovering where the tail used to be.
  // One material per END, because the two ends neither glow the same colour
  // nor come on together: a tail lamp is a marker that is faintly there in
  // daylight, a headlamp is nothing at all until the light goes.
  const lampMap = glowTexture();
  const bloomMat = (name: string, color: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      name,
      map: lampMap,
      color,
      transparent: true,
      opacity: opacity * fade,
      blending: THREE.AdditiveBlending,
      // A LAMP IS LIGHT, AND LIGHT IS NOT FOGGED. `installHeightFog`
      // (height-fog.ts) replaces three.js's global fog ShaderChunks, so every
      // material that has not opted out — MeshBasicMaterial included — gets
      // the night air mixed into it. On an ADDITIVE bloom that is wrong
      // twice over: the glow is what the lamp throws INTO the air ahead of
      // the car, not a surface being seen through it, and the air it was
      // being mixed toward is the darkest thing in the frame. It is why the
      // blooms have never read after dark — a pure white quad came back
      // GREY, and no amount of colour or opacity could win that back.
      fog: false,
      depthWrite: false,
      // Not culled: the quad is a glow standing off the lamp's face, and
      // which way its winding happens to face is not a fact worth losing a
      // halo to.
      side: THREE.DoubleSide,
    });
  const lampMat = bloomMat(LAMP_MATERIAL, LAMP_GLOW, LAMP_DAY);
  const headMat = bloomMat(LAMP_MATERIAL, HEAD_GLOW, HEAD_DAY);
  const lampGeos: THREE.BufferGeometry[] = [];
  /** Hang the blooms for one END, as ONE mesh holding both quads. A plane
   * apiece is the obvious way to write this and costs a draw call per lamp:
   * with fifteen cars on a stage that is thirty draws for four triangles of
   * additive haze. `dir` is the cap's outward direction — the quads sit just
   * off the lenses and face the same way.
   *
   * Which is also why a SMASHED lamp is snuffed by collapsing its own six
   * vertices rather than by splitting the mesh in two: the pair share one
   * material and one draw, a lamp is lost at most twice in a run, and a
   * buffer rewritten at that moment costs nothing per frame. The returned
   * `snuff` takes an index into `anchors`, which run left-then-right in the
   * ENGINE's frame, exactly as the wheels do. */
  const hangBlooms = (
    anchors: ReturnType<typeof rearLampAnchors>,
    mat: THREE.MeshBasicMaterial,
    spread: number,
    dir: number,
  ): ((lamp: number) => void) => {
    if (anchors.length === 0) return () => {};
    const pos: number[] = [];
    const uv: number[] = [];
    for (const lamp of anchors) {
      const w = (lamp.width * spread) / 2;
      const h = (lamp.height * spread * 1.5) / 2;
      // Clear of the housing: the anchor is already the lamp's FACE, and
      // this is the film of air over it. A quad any deeper than the bowl it
      // covers is drawn inside a solid and depth-tested away — which is a
      // lamp with no glow at all, and looks exactly like a lamp that is
      // switched off.
      const z = lamp.z + dir * BLOOM_STANDOFF;
      // Corners counter-clockwise seen from outside the cap: mirroring
      // across z reverses the winding, so the tail runs the cycle backwards.
      const corner = (u: number, v: number): number[] => [
        lamp.x + (u * 2 - 1) * w * dir,
        lamp.y + (v * 2 - 1) * h,
        z,
      ];
      const quad: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      for (const [a, b, c] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        for (const i of [a, b, c]) {
          pos.push(...corner(quad[i][0], quad[i][1]));
          uv.push(quad[i][0], quad[i][1]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.Float32BufferAttribute(pos, 3);
    geo.setAttribute("position", attr);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    body.chassis.add(new THREE.Mesh(geo, mat));
    lampGeos.push(geo);
    return (lamp) => {
      // Six vertices per lamp, two triangles: collapsed onto the anchor's
      // own point, so the quad has no area and the additive haze over that
      // corner of the cap simply stops.
      const at = anchors[lamp];
      if (!at) return;
      for (let i = 0; i < 6; i++) attr.setXYZ(lamp * 6 + i, at.x, at.y, at.z);
      attr.needsUpdate = true;
    };
  };
  const snuffRear = hangBlooms(rearLampAnchors(bodySpec), lampMat, LAMP_SPREAD, -1);
  const snuffFront = hangBlooms(frontLampAnchors(bodySpec), headMat, HEAD_SPREAD, 1);
  /** Which lamps have already been put out, so the buffer is only rewritten
   * on the frame one actually goes. */
  const snuffed = new Set<DamagePart>();
  const lensMat = body.lens;
  if (lensMat && options.ghost) {
    lensMat.transparent = true;
    lensMat.opacity = GHOST_OPACITY;
  }
  /** The car reads the map only at the top stop, and only ever on the LIT
   * surfaces: a lamp bloom and an instrument are their own light, and a
   * shadow across one would be a lamp somebody had put a hand over. */
  const setShadowDetail = (rich: boolean): void => {
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      obj.receiveShadow = rich && mats.some((mat) => mat instanceof THREE.MeshPhongMaterial);
    });
  };

  let lamps: LampStage = "off";
  const worldLight = new THREE.Color(1, 1, 1);
  /** Scratch for the tail's colour this frame, handed to the glow register. */
  const glowTail = new THREE.Color();
  const setLights = (stage: LampStage, tint?: THREE.Color): void => {
    lamps = stage;
    if (tint) worldLight.copy(tint);
  };
  /** Whether the pedal lights this car's tail at all — the LIGHTING row's,
   * pushed in by the renderer (`LAMP_BEAMS.brakes`). */
  let brakeLights = true;
  const setBrakeLights = (on: boolean): void => {
    brakeLights = on;
  };
  let wet = 0;
  const setWet = (rain: number): void => {
    wet = clamp(rain, 0, 1);
  };
  let snow = 0;
  const setSnow = (flakes: number): void => {
    snow = clamp(flakes, 0, 1);
  };
  /** The blooms, dimmed by whatever the run has thrown at the lenses — and
   * the lenses themselves, which are switched between the world's light and
   * their own rather than tinted along with the paint. */
  const shineLamps = (car: GameState["car"]): void => {
    const clean = 1 - LAMP_GRIME * dirt.level();
    // A lamp the crash has taken out of its cap glows with nothing: the
    // bloom is the light escaping the lamp, and there is no lamp. The lens
    // under it is left to the crumple, which has already scuffed it dark —
    // a smashed lamp is a dark hole in the face of the car. The pair share
    // a material, so the one that went is snuffed in the geometry and what
    // is left of the end is what the material still shows.
    for (const [i, part] of FRONT_LAMPS.entries()) {
      if (snuffed.has(part) || !car.damage.broken.includes(part)) continue;
      snuffed.add(part);
      snuffFront(i);
      glow.snuff("head", i);
    }
    for (const [i, part] of REAR_LAMPS.entries()) {
      if (snuffed.has(part) || !car.damage.broken.includes(part)) continue;
      snuffed.add(part);
      snuffRear(i);
      glow.snuff("tail", i);
    }
    // The tail: a dim marker, or the brake light the same lenses become the
    // moment the pedal goes down. It is the bloom rather than the beam that
    // carries it by day — a spotlight competing with the sun changes no
    // pixel and costs every one of them — which is why this reads at noon
    // while the red pool on the road behind (environment.ts's own brake
    // beam) only exists once the light has gone.
    const braked = brakeLights && car.braking;
    const lit = lamps !== "off";
    const tail = braked ? (lit ? BRAKE_NIGHT : BRAKE_DAY) : lit ? LAMP_NIGHT : LAMP_DAY;
    lampMat.opacity = tail * clean * fade;
    lampMat.color.set(braked ? BRAKE_GLOW : LAMP_GLOW);
    // The nose walks all three stops: dark glass, a lit lens with a modest
    // halo round it, then the driving lamps' full bloom.
    const head = lamps === "main" ? HEAD_NIGHT : lamps === "dipped" ? HEAD_DIPPED : HEAD_DAY;
    headMat.opacity = head * clean * fade;
    // ...and the same two figures again, as the light those lamps put back
    // on the car carrying them (car-glow.ts). The blooms' own ladder drives
    // it, so a nose that is only on dipped washes less of the body than an
    // open one and a lens the stage has caked washes less than a clean one —
    // but only once the lamps are ON. A brake light in daylight is a lamp
    // read against the sun; the panel around it is not lit by it in any way
    // the eye can find, and lifting it there is a car with a glowing tail
    // at noon.
    glowTail.set(braked ? BRAKE_GLOW : LAMP_GLOW);
    glow.shine(group, lit ? head * clean : 0, lit ? tail * clean : 0, glowTail);
    if (lensMat) {
      if (lit) lensMat.color.setScalar(LENS_LIT);
      else lensMat.color.copy(worldLight).lerp(WHITE, LENS_DARK);
    }
    // The cabin: the world's light, taken down again by how much of it gets
    // into a closed box. `tintCar` has already put the raw tint on it.
    const cabinMat = body.cockpitMaterial;
    if (cabinMat) {
      const room =
        lamps === "main"
          ? CABIN_LIGHT.night
          : lamps === "dipped"
            ? CABIN_LIGHT.dusk
            : CABIN_LIGHT.day;
      cabinMat.color.copy(worldLight).multiplyScalar(room);
    }
  };

  let steerVisual = 0;
  /** How much of itself the glass is showing this frame: its own baked
   * gradient, brought forward by the angle the eye is standing at and by
   * whatever the stage has caked on it. The angle is taken in the CAR's own
   * frame — the pane turns with the car, and a drift is exactly the moment
   * the two disagree. */
  const shineGlass = (state: GameState, eye?: THREE.Vector3): void => {
    if (!glassMat) return;
    let glint = 0;
    if (eye) {
      const dx = eye.x - state.car.x;
      const dz = eye.z - state.car.z;
      const h = -state.car.heading;
      view
        .set(
          dx * Math.cos(h) + dz * Math.sin(h),
          eye.y - state.car.y,
          -dx * Math.sin(h) + dz * Math.cos(h),
        )
        .normalize();
      glint = Math.pow(1 - Math.abs(view.dot(screen)), GLASS.falloff);
    }
    const want = GLASS_OPACITY + GLASS.glint * glint + GLASS.grime * dirt.level();
    const seat = inside ? GLASS_INSIDE : 1;
    glassMat.opacity = Math.min(want, GLASS.ceiling) * fade * seat;
    // The WORLD in that glass rides the same two scales as the pane's own
    // opacity, and for the same two reasons: a ghost's windows are as much a
    // picture as the rest of it, and a windscreen being looked THROUGH is
    // nearly clear — a reflection at full strength from the driver's own
    // chair is a wash of sky over the next four seconds of stage.
    if (body.reflection) body.reflection.strength.value = fade * seat;
  };

  /** Whether the lens is inside this car this frame — what the glass and
   * the two cabins are swapped by. */
  let inside = false;
  const setInside = (next: boolean): void => {
    if (!body.cockpit || inside === next) return;
    inside = next;
    body.cockpit.group.visible = next;
    if (body.cabinTrim) body.cabinTrim.visible = !next;
  };

  const setRearView = (on: boolean): void => {
    if (body.cockpit?.mirrorGlass) body.cockpit.mirrorGlass.visible = on;
  };

  /** Whether the car carries a rear-view mirror at all — the player's own
   * MIRROR option, which is a different question from whether the picture in
   * it is live this frame (`setRearView`). Off, the whole assembly comes out:
   * housing, stem, backing and pane. Left in, a switched-off mirror is a slab
   * of dark glass hanging in the middle of the windscreen for the whole
   * stage, which is worse than the feature the player just turned off. */
  const setMirrorFitted = (on: boolean): void => {
    const cockpit = body.cockpit;
    if (!cockpit) return;
    cockpit.mirrorBody.visible = on;
    if (!on && cockpit.mirrorGlass) cockpit.mirrorGlass.visible = false;
  };

  const mirrorPass = (draw: () => void): void => {
    const cockpit = body.cockpit;
    if (!cockpit) {
      const was = body.cabin.visible;
      body.cabin.visible = false;
      draw();
      body.cabin.visible = was;
      return;
    }
    const wasUp = cockpit.group.visible;
    const wasTrim = body.cabinTrim?.visible ?? false;
    const wasGlass = cockpit.mirrorGlass?.visible ?? false;
    // The lens is looking THROUGH the backlight from inside, whichever seat
    // the player is in — so the glass is thinned to what a pane looked
    // through is (`GLASS_INSIDE`) for the pass, or from an outside view the
    // mirror shows a window washed with the baked sky meant for a lens ten
    // metres back.
    const wasOpacity = glassMat?.opacity ?? 0;
    const wasReflect = body.reflection?.strength.value ?? 0;
    if (glassMat && !inside) glassMat.opacity = wasOpacity * GLASS_INSIDE;
    if (body.reflection && !inside) body.reflection.strength.value = wasReflect * GLASS_INSIDE;
    cockpit.group.visible = true;
    if (body.cabinTrim) body.cabinTrim.visible = false;
    if (cockpit.mirrorGlass) cockpit.mirrorGlass.visible = false;
    draw();
    if (glassMat) glassMat.opacity = wasOpacity;
    if (body.reflection) body.reflection.strength.value = wasReflect;
    cockpit.group.visible = wasUp;
    if (body.cabinTrim) body.cabinTrim.visible = wasTrim;
    if (cockpit.mirrorGlass) cockpit.mirrorGlass.visible = wasGlass;
  };

  /** The lamp states the cockpit's panels are written from, kept between
   * frames so a reading that has not moved costs the panel nothing. */
  const tellTales = new Uint8Array(6);
  const shiftLamp = new Uint8Array(1);

  const update = (state: GameState, dt: number, eye?: THREE.Vector3): void => {
    const car = state.car;
    // THE LOFT: over a brow the body keeps going up while the wheels reach
    // down after ground that is falling away. The first of that is the
    // springs' droop — the body up off the arches, the wheels still on the
    // ground — and past the droop the wheels come up with it: the whole car
    // skipping, a hand's height off the road, until the engine calls it a
    // flight.
    const droop = Math.min(car.loft, TUNING.suspension.droop);
    group.position.set(car.x, car.y + (car.loft - droop), car.z);
    group.rotation.y = car.heading;

    // Both attitude angles come off the engine already settled. In the car's
    // local frame +z is the nose and +x its right side, so a positive roll
    // (right side up) IS +z rotation, while a nose-up pitch is a NEGATIVE
    // rotation about +x — turning the nose down is the positive direction
    // there. A rally car still goes sideways FLAT: the roll is the camber
    // of the ground and the tumble of a flight, never a lean into the
    // slide, which reads through the yaw, the counter-steer and the dust.
    body.group.rotation.z = car.roll;
    body.group.rotation.x = -car.pitch;

    // The springs, on the SPRUNG mass only: the body squats into a landing,
    // rebounds out of it and dives under the brakes while the wheels stay
    // exactly where the ground put them. This is the whole visible half of
    // the car having weight — the engine decides how far, this just draws
    // it (positive pitchLoad lifts the nose, so it rotates like `pitch`).
    //
    // The engine's own tremble goes on the same sprung mass and for the same
    // reason: it is the BODY that is shaken by what is bolted under it,
    // while the wheels stay where the ground put them. Millimetres, and only
    // while the revs are up and the car is not (car-shake.ts).
    //
    // ...and how crooked it sits on what is left of its wheels: a corner
    // that has lost its wheel is riding on the hub, and the body over it is
    // down by that much for the rest of the run (car-damage.ts). The
    // engine says whether it is (the ledger); the shape is the drawing's.
    const tremble = trembleAt(state.t, revTremble(car.rev, car.u));
    const pose = damage.pose;
    body.chassis.position.y = car.ride + droop + tremble.heave + pose.drop;
    body.chassis.rotation.x = -car.pitchLoad + tremble.pitch - pose.pitch;
    body.chassis.rotation.z = tremble.roll + pose.roll;

    // Wheels: the front pair points where the driver points them —
    // counter-steer in a drift shows because the input does — and each wheel
    // turns at the speed of its own contact patch, plus, on the driven axles
    // only, whatever the engine is spinning it beyond that (car-wheels.ts).
    const wantSteer = clamp(car.steer * WHEEL_STEER_LOCK, -WHEEL_STEER_MAX, WHEEL_STEER_MAX);
    steerVisual += (wantSteer - steerVisual) * clamp(WHEEL_STEER_RATE * dt, 0, 1);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      const front = i < 2;
      const speed = wheelSurfaceSpeed(
        car,
        body.wheelGroups[i].position,
        front ? steerVisual : 0,
        front ? driven.front : driven.rear,
      );
      body.wheelSpin[i].rotation.x += (speed * dt) / bodySpec.wheelRadius;
      if (front) body.wheelGroups[i].rotation.y = steerVisual;
    }

    const lock = steerVisual / WHEEL_STEER_LOCK;
    if (body.steering) body.steering.rotation.z = steeringTurn(lock);
    // The cockpit's own wheel goes further than the one behind the glass —
    // it is read at arm's length rather than through a tinted pane — and its
    // instruments are the only ones in the game that are GEOMETRY. They are
    // driven off the same numbers the HUD reads (car-instruments.ts), so
    // the dials the seat shows and the cluster every other view shows never
    // disagree about a reading.
    if (body.cockpit && inside) {
      const dash = body.cockpit.instruments;
      // The blue lamp on the pod is the MAIN BEAM tell-tale, which is what it
      // is on every car ever built: it lights when the driving lamps are
      // open, not when the car merely has its lights on.
      const read = instrumentReadings(state, lamps === "main");
      body.cockpit.steering.rotation.z = cockpitWheelTurn(lock);
      dash.tacho.rotation.z = dialAngle(read.rev);
      dash.speedo.rotation.z = dialAngle(read.speed / DIAL_TOP_SPEED);
      dash.gear.set(read.gear);
      dash.total.set(read.total);
      dash.interval.set(read.interval);
      shiftLamp[0] = read.shift ? 1 : 0;
      dash.shift.set(shiftLamp);
      for (let i = 0; i < tellTales.length; i++) tellTales[i] = read.lamps[i] ? 1 : 0;
      dash.tellTales.set(tellTales);
    }

    dirt.update(state, dt);
    // The glass answers to the weather landing on it, what the ground under
    // the wheels is throwing up at it right now — nothing, on tarmac and on
    // grass — and, because road spray is thrown by the wheels rather than
    // settling out of the air, how far the car drove while it was thrown.
    // THE SNOW first, because what it melts is water the rest of the glass
    // has to answer to: the flakes land on a screen the heater is warming
    // (the run's own clock) in air as cold as the climate makes it at this
    // height, and what they melt into is handed on as wetness.
    const screenGone = car.damage.broken.includes("glassF");
    body.screenSnow?.update(
      {
        flakes: screenGone ? 0 : snow,
        speed: Math.abs(car.u),
        time: state.t,
        temperature: temperatureAt(state.track.climate, car.y),
        wipe: body.wipers.front,
      },
      dt,
    );
    const onGlass = Math.max(wet, body.screenSnow?.water() ?? 0);
    body.wipers.update(onGlass, glassSpray(state), groundTravel(car, dt), dt);
    // …and the WATER on the windscreen, which answers to the same weather
    // and to the arm that has just been moved. It also needs what the car
    // is doing, and only the car is in a position to say: how fast the air
    // is dragging the runs up the glass, and how hard the corner is pushing
    // them sideways. Speed times yaw rate is the honest centripetal figure
    // — positive is a left turn, which throws the water to the right.
    // A windscreen that has SHATTERED (car-damage.ts) has no glass for the
    // rain to land on: what is on it drains and nothing more arrives.
    body.screenRain?.update(
      {
        wet: screenGone ? 0 : onGlass,
        speed: Math.abs(car.u),
        lateral: car.u * car.yawRate,
        wipe: body.wipers.front,
      },
      dt,
    );
    shineGlass(state, eye);
    shineLamps(car);
    damage.update(state, dt);
  };

  const dispose = (): void => {
    damage.dispose();
    body.dispose();
    for (const geo of lampGeos) geo.dispose();
    lampMat.dispose();
    headMat.dispose();
  };

  // A ghost is a picture of a lap, not a body standing in the light: it
  // throws no shadow, or the lap being chased would darken the road under
  // a car that is not there.
  if (options.ghost) {
    group.traverse((obj) => {
      obj.castShadow = false;
    });
  }

  return {
    group,
    mirrorMount: body.cockpit?.mirror ?? null,
    mirrorFrame: body.chassis,
    mirrorPass,
    screenRain: body.screenRain,
    screenSnow: body.screenSnow,
    debris: damage.debris,
    update,
    setInside,
    setRearView,
    setMirrorFitted,
    onEvents: damage.onEvents,
    setLooseWheels: damage.setLooseWheels,
    setWheelLoss: damage.setWheelLoss,
    setCrumple: damage.setCrumple,
    setBrakeLights,
    setShadowDetail,
    setLights,
    setWet,
    setSnow,
    grime: dirt.level,
    lampPlan: { head: headLampSources(bodySpec), tail: tailLampSources(bodySpec) },
    dispose,
  };
}
