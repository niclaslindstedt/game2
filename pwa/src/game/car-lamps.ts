// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PLAYER'S LAMPS ON THE WORLD — the spotlights the car's headlights,
// tail lights and brake lights throw on the road, and what daylight, grime
// and a crash leave of them. The lamps themselves are car-mesh.ts's (the
// bowl, the bloom); this is the light they cast, which the Lambert world
// picks up and the fullbright car correctly ignores.
//
// A BEAM PER LAMP, because that is what a car has. One light on the
// centerline throws a single symmetric pool that never breaks up, and the
// eye reads it as a searchlight bolted to the roof rather than as the car's
// own lamps. Several, splayed so their cones cross a few metres out, give
// the lobed pool a car actually lays down — and they sit where its own
// lenses are, so a quad-headlight face lays a different pool from a wide
// cluster and a car carrying a pod bar throws it from up on the bonnet's
// corners. WHICH lamps a car has is its body's answer, derived off the
// bowls themselves (`headLampSources` in car/lamps.ts) and pushed in here
// when the car is built.

import * as THREE from "three";

import type { LampSource } from "./car/lamps.ts";
import { BRAKE_DUST } from "./dust-light.ts";
import { LAMP_BEAMS, type VideoSettings } from "./settings.ts";
import { clamp } from "../lib/util.ts";

/** How much of each end's light a fully caked lens costs, 0..1. The tail
 * lamp loses more of what little it has: the front is a deep reflector
 * behind glass, the rear a flat lens right above the wheel that throws the
 * gravel. */
const HEAD_GRIME = 0.45;
const TAIL_GRIME = 0.6;

/** WHAT ONE END OF A CAR IS WORTH IN LIGHT, whatever it comes out of. The
 * whole figure is thrown at each end every frame the lamps are on, shared
 * out among the beams actually lit in proportion to the bowls behind them —
 * so every car in the field lights the road with the same total and the
 * player's LIGHTING row cannot buy a better view of a night stage than the
 * next machine's, only a better-shaped one.
 *
 * The tail is a small fraction of the nose because a tail lamp is a MARKER:
 * it exists to be seen, not to see by, and the road behind a car at night has
 * to go red without ever becoming somewhere a driver could reverse into a
 * corner by. */
const HEAD_LIGHT = 300;
const TAIL_LIGHT = 21;

/** ...AND THE BRAKE LIGHTS, which are a light of their own rather than the
 * marker turned up: a second red pair thrown back down the road, worth twice
 * everything the two markers put together are. That split is the whole point
 * of it. A tail lamp says a car is there and is worth half of what one used
 * to be here, because "there is a car" does not need much light; a brake
 * light says the car has stopped driving and started stopping, and that is
 * the one thing on the back of a car a driver behind has to read instantly.
 * Halving the one and putting the whole of the old figure into the other is
 * what makes the difference between them a difference you can see rather
 * than a lamp getting slightly brighter.
 *
 * A PAIR of them, off the car's own two clusters, because that is where a
 * car's brake lights are: one pool on the centreline reads as a single lamp
 * under the boot floor, and what says "the car in front is braking" is two
 * of them, as far apart as the tail is wide. */
const BRAKE_LIGHT = 42;

/** The shape of a brake pool: BROAD, because it is a signal rather than a
 * beam, and aimed STEEPLY DOWN so it lands a couple of metres off the bumper.
 *
 * The steepness is not a guess. A chase camera sits behind the car looking
 * along it, so the only ground behind a car that is ever ON SCREEN is the
 * strip between the bumper and the lens — and a brake wash thrown level and
 * far, the way the markers are, lays its whole pool past the camera where
 * nobody will see any of it. Pitching the cone's axis into the ground about
 * two metres back puts the pool in the one band the chase actually looks
 * through, which is also where a real brake light's own glow falls. */
const BRAKE_OPTICS = { cone: 0.95, reach: 14, tilt: 0.38, splay: 0.5 };

/** A single beam standing in for a whole end is opened out, so the one pool
 * it lays covers about what the splayed lobes did. It needs no gain with it:
 * the end's light is a fixed budget shared among the beams thrown, so one
 * beam already carries all of it. The pool is rounder and it reads as one
 * lamp on the roofline rather than a set on the wings — which is the look
 * the bottom of the row trades for its cost. */
const SINGLE_BEAM_SPREAD = 1.24;

/** Where a car with no authored lamps at all throws its light from — a spec
 * is allowed a bare face, and a beam still has to come from somewhere
 * sensible. One full-strength lamp each side, at about the height and width
 * every body on the roster carries its own. */
const bareLamp = (role: LampSource["role"], x: number, y: number, z: number): LampSource => ({
  role,
  x,
  y,
  z,
  power: 1,
  cone: role === "tail" ? 0.8 : 0.42,
  reach: role === "tail" ? 18 : 70,
  tilt: role === "tail" ? 0.125 : 0.072,
  splay: role === "tail" ? 0.45 : 0.26,
});
const FALLBACK_HEAD: readonly LampSource[] = [
  bareLamp("main", -0.6, 0.68, 1.85),
  bareLamp("main", 0.6, 0.68, 1.85),
];
const FALLBACK_TAIL: readonly LampSource[] = [
  bareLamp("tail", -0.55, 0.76, -1.9),
  bareLamp("tail", 0.55, 0.76, -1.9),
];

/** The brake lights of a car, from its tail lamps: the same lenses, in the
 * same places, with a brake's own optics rather than a marker's. Derived from
 * the plan rather than authored beside it — a restyle that moves a tail
 * cluster has to move what it signals with, and nothing about a brake light
 * is a separate decision from where the cluster is. */
function brakeLampsOf(tail: readonly LampSource[]): readonly LampSource[] {
  return tail.map((lamp) => ({ ...lamp, ...BRAKE_OPTICS }));
}

export type CarLamps = {
  /** The video options' LIGHTING row: how many of the car's own beams each
   * end throws (`LAMP_BEAMS` — a CAP, not a count), and whether the pedal is
   * a light at all. */
  setLighting: (level: VideoSettings["lighting"]) => void;
  /** Whether the lamps are on at all — the sky's switch. A hidden
   * spotlight leaves the shader as well as the picture (three.js compiles
   * the lit materials against however many lights are visible), so an
   * unlit stage costs no beams at all, whatever the row says. */
  setLit: (lit: boolean) => void;
  /** WHICH LAMPS THIS CAR HAS, as the light sources its own body authored
   * (`car/lamps.ts`), strongest first — where each one sits, how strong it
   * is and what shape it throws. Pushed in when a car is built, because a
   * beam belongs to a lens. */
  setPlan: (head: readonly LampSource[], tail: readonly LampSource[]) => void;
  /** How filthy the car is, 0..1 — the lenses are under the same coat as
   * the paint, so both beams fade as the stage goes on. */
  setGrime: (level: number) => void;
  /** How much of each end's lighting the crash has left, 0..1 — a share,
   * not a switch, because the lamps break one at a time. */
  setBroken: (front: number, rear: number) => void;
  /** Aim the lit beams at the car, at `power` of full (the daylight's say).
   * Headlights track the nose, tail lamps the tail, and the brake pair rides
   * the markers — dark until the pedal is down. A car's light is spread over
   * the lamps it has rather than multiplied by them: four beams on a quad
   * face light the road with the same total as its two would, in the shape
   * the four actually make. */
  aim: (
    car: { x: number; y: number; z: number; heading: number; braking: boolean },
    power: number,
  ) => void;
  /** What is left of each end for the dust to be lit by, at `power`: the
   * same arithmetic the spotlights use, so a cloud is lit by lamps that are
   * actually there — the brakes included, which is why a rival's cloud goes
   * hard red the instant they lift for a corner ahead of you. */
  shares: (power: number, braking?: boolean) => { front: number; rear: number };
  dispose: () => void;
};

export function createCarLamps(scene: THREE.Scene): CarLamps {
  const beam = (color: number): THREE.SpotLight => {
    const light = new THREE.SpotLight(color, 0, 70, 0.42, 0.6, 1.2);
    light.visible = false;
    scene.add(light, light.target);
    return light;
  };
  /** The pools each end can draw from — as many as the richest stop of the
   * LIGHTING row will ever light (`LAMP_BEAMS.full`). Standing lights that
   * are switched off rather than lights made per car: a spotlight entering
   * or leaving the scene recompiles every lit material in it, and a stage
   * where cars are built and thrown away is a stage full of those. */
  const HEAD_POOL = LAMP_BEAMS.full.head;
  const TAIL_POOL = LAMP_BEAMS.full.tail;
  // Headlights: warm, and long enough that the road has somewhere to go.
  const headlights = Array.from({ length: HEAD_POOL }, () => beam(0xffeecb));
  // ...and the tail lamps' own wash on the ground behind. It comes on with
  // the headlights, because that is the switch it is wired to.
  const taillights = Array.from({ length: TAIL_POOL }, () => beam(0xff2814));
  // ...and the brake lights, driven to NOTHING rather than hidden when the
  // pedal is up: hiding one would recompile every lit material in the frame
  // on every brake, and a stage is nothing but braking. On the same night
  // switch as every other beam, because a pool of light on the ground is a
  // thing only darkness has — what makes a brake light read at NOON is the
  // bloom over the lens (car-mesh.ts), which costs nothing per pixel and is
  // the whole daylight signal.
  const brakelights = Array.from({ length: TAIL_POOL }, () => beam(0xff1b0c));

  let beams = LAMP_BEAMS.full;
  let lit = false;
  let headPlan: readonly LampSource[] = FALLBACK_HEAD;
  let tailPlan: readonly LampSource[] = FALLBACK_TAIL;
  let brakePlan: readonly LampSource[] = brakeLampsOf(FALLBACK_TAIL);
  let grime = 0;
  let headLamps = 1;
  let tailLamps = 1;

  /** How many beams one end throws: the row's cap, and never more lamps than
   * the car actually carries. */
  const thrown = (cap: number, plan: readonly LampSource[]): number => Math.min(cap, plan.length);

  /** Which lamps stand in the scene, and the cone and reach each one gets.
   * Set here rather than per frame: a driving beam is narrow and long where
   * a flood is broad and short, and neither changes while the car is the car
   * it is. */
  const applyLamps = (): void => {
    const heads = thrown(beams.head, headPlan);
    const tails = thrown(beams.tail, tailPlan);
    const dress = (
      pool: THREE.SpotLight[],
      plan: readonly LampSource[],
      count: number,
      single: boolean,
    ): void => {
      for (const [i, light] of pool.entries()) {
        light.visible = lit && i < count;
        if (i >= count) continue;
        const lamp = plan[i];
        light.angle = single ? lamp.cone * SINGLE_BEAM_SPREAD : lamp.cone;
        light.distance = lamp.reach;
      }
    };
    dress(headlights, headPlan, heads, heads === 1);
    dress(taillights, tailPlan, tails, tails === 1);
    // The brake lights ride the markers' own stop of the ladder: at the
    // bottom of it there is no tail beam to add to and nothing to signal
    // with, which is what "no rear lights" means.
    dress(brakelights, brakePlan, beams.brakes ? tails : 0, false);
  };

  /** Point one end's beams — each from ITS OWN lens, at its own strength and
   * down its own axis. A lamp stands where the body put it (`x` off the
   * centerline, `z` along the car, `y` above the contact patch) and looks
   * `dir` metres that way: `tilt` below the horizontal, because a driving
   * beam points at the road, and `splay` further out to the side by however
   * far off centre it sits, which is what turns a set of parallel cones into
   * the lobed pool a car actually lays down.
   *
   * `dir` is −1 at the tail, so the one routine serves both ends: a tail lamp
   * is a lamp aimed the other way. It turns the FORWARD half of the aim only
   * — the lamp's own `z` already carries which end of the car it is bolted
   * to, and its splay is outward at both ends, so putting `dir` through
   * either of those is what mirrors a tail beam onto the nose or crosses the
   * pair over behind the car.
   *
   * A single beam stands on the centerline and aims straight down it — there
   * is no pair left for its offset to mean anything against. */
  const aimBeams = (
    pool: THREE.SpotLight[],
    plan: readonly LampSource[],
    count: number,
    car: { x: number; y: number; z: number },
    fwd: { x: number; z: number },
    right: { x: number; z: number },
    dir: number,
    budget: number,
    strength: number,
  ): void => {
    const single = count === 1;
    // What this end is worth is a fixed budget shared out among the lamps
    // actually thrown, in proportion to the bowls behind them — so the
    // LIGHTING row buys the SHAPE of the pool and never how far a player can
    // see, and no car out-lights another for having more lamps on its face.
    // What is per car is where the light comes from and what shape each
    // piece of it is: a driving beam spends its share far down a narrow cone
    // where a flood spends the same share wide and short.
    let total = 0;
    for (let i = 0; i < count; i++) total += plan[i].power;
    if (total <= 0) return;
    for (let i = 0; i < count; i++) {
      const lamp = plan[i];
      const light = pool[i];
      const x = single ? 0 : lamp.x;
      light.intensity = budget * (lamp.power / total) * strength;
      light.position.set(
        car.x + fwd.x * lamp.z + right.x * x,
        car.y + lamp.y,
        car.z + fwd.z * lamp.z + right.z * x,
      );
      // The aim, a beam's length out: along the car the way this end faces,
      // out by the splay its own offset earns, and down by its tilt.
      const range = lamp.reach;
      const out = x * lamp.splay * range;
      light.target.position.set(
        car.x + fwd.x * range * dir + right.x * out,
        car.y + lamp.y - lamp.tilt * range,
        car.z + fwd.z * range * dir + right.z * out,
      );
    }
  };

  const shares = (power: number, braking = false): { front: number; rear: number } => ({
    front: power * (1 - HEAD_GRIME * grime) * headLamps,
    rear: power * (1 - TAIL_GRIME * grime) * tailLamps * (beams.brakes && braking ? BRAKE_DUST : 1),
  });

  return {
    setLighting: (level) => {
      beams = LAMP_BEAMS[level];
      applyLamps();
    },
    setLit: (next) => {
      lit = next;
      applyLamps();
    },
    setPlan: (head, tail) => {
      headPlan = head.length > 0 ? head : FALLBACK_HEAD;
      tailPlan = tail.length > 0 ? tail : FALLBACK_TAIL;
      brakePlan = brakeLampsOf(tailPlan);
      applyLamps();
    },
    setGrime: (level) => {
      grime = clamp(level, 0, 1);
    },
    setBroken: (front, rear) => {
      headLamps = clamp(front, 0, 1);
      tailLamps = clamp(rear, 0, 1);
    },
    aim: (car, power) => {
      if (!lit) return;
      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const right = { x: fwd.z, z: -fwd.x };
      const { front, rear } = shares(power);
      const heads = thrown(beams.head, headPlan);
      const tails = thrown(beams.tail, tailPlan);
      aimBeams(headlights, headPlan, heads, car, fwd, right, 1, HEAD_LIGHT, front);
      aimBeams(taillights, tailPlan, tails, car, fwd, right, -1, TAIL_LIGHT, rear);
      // ...and the brake lights on top of the markers rather than instead of
      // them, out of the same two lenses, worth nothing at all until the
      // pedal is down. Aimed every frame whether they are burning or not: a
      // pair left pointing at where the car was is a pair that lights the
      // wrong piece of road on the first frame of the next brake.
      const braked = beams.brakes && car.braking ? rear : 0;
      aimBeams(brakelights, brakePlan, tails, car, fwd, right, -1, BRAKE_LIGHT, braked);
    },
    shares,
    dispose: () => {
      for (const lamp of [...headlights, ...taillights, ...brakelights]) lamp.dispose();
    },
  };
}
