// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pooled particle system for the ground-contact juice: gravel thrown off
// the wheels, a blue sheet of spray through fords, a brown puff on
// landings — and, on the stage's asphalt sections, tire smoke, which is a
// different thing entirely and has to LOOK like one. One THREE.Points
// cloud per style, positions and lifetimes recycled in place.
//
// TWO KINDS OF PARTICLE LIVE HERE, and the difference is not a number.
// A GRAIN is a thrown thing: one size for its whole life, on screen until
// it lands, and the cloud is made by there being hundreds of them. SMOKE
// (`puffy`) is a boiling thing: it is born small, SWELLS as it goes,
// turns over on itself, and thins out of existence rather than
// disappearing — and a dozen of those overlapping is a cloud where a dozen
// grains is a handful of dots. The grain is a plain point sprite; the puff
// wears a mask and a small shader graft that gives every particle its own
// size, its own angle and its own opacity, because those three are the
// whole difference between smoke and a sprite.

import * as THREE from "three";

import { type DriveLayout } from "@engine";

import { DUST_LAMP_UNIFORMS, DUST_LAMPS } from "./dust-light.ts";
import { billowTexture, puffTexture } from "./textures.ts";

/** How many particles a cloud keeps, unless its style asks for more. Big
 * enough that the busiest one-shot burst in the game never recycles a
 * particle that is still on screen — which shows up as the cloud tearing a
 * hole in itself at exactly the moment it is thickest. */
const POOL = 768;

/** What a cloud is MADE of. The two styles are opposites on purpose: a
 * grain of gravel is small, hard, and thrown — dozens of them, arcing and
 * falling; smoke is big, soft, and boiled off the tire — a few of them,
 * hanging and drifting. Same code, different matter. */
export type DustStyle = {
  /** Point size, world meters. */
  size: number;
  opacity: number;
  /** Upward speed a particle is born with, m/s. */
  rise: number;
  /** Downward acceleration, m/s² — grit falls, smoke barely does. */
  gravity: number;
  /** Lifetime band, seconds. */
  life: { min: number; max: number };
  /** A cloud made of PUFFS rather than grains: its points wear a blob mask
   * instead of the sprite's bare square, which is the only way a particle
   * gets to be big enough to read as smoke — and they take the swell, the
   * turn and the thinning-out below, none of which mean anything to a
   * grain of grit. */
  puffy?: boolean;
  /** Puffy only. THE SWELL: what a puff's size is multiplied by over its
   * life, as a multiple of the style's `size`. Smoke does not travel so
   * much as EXPAND — a cloud that keeps its birth size and merely drifts
   * reads as a sprite sheet being blown along, however soft its mask is —
   * so this is the single knob that decides whether a cloud boils. Eased
   * out, because a puff does most of its growing in the first moment and
   * then hangs there getting slowly wider. */
  grow?: number;
  /** Puffy only. How much the birth size varies particle to particle,
   * 0..1 of it. A cloud whose puffs are all one size reads as a pattern
   * however they are arranged. */
  sizeVary?: number;
  /** How much of the style's SPREAD goes upward, 0..1 — the rest stays in
   * the horizontal plane. A cloud that takes its full spread vertically
   * climbs out of the frame; one that takes almost none of it stays down
   * where the ground is and opens out sideways instead, which is the
   * difference between a plume that hangs over the road behind the car and
   * a wall of fog in front of the camera. Grains leave this alone: a
   * thrown stone is meant to arc. */
  updraft?: number;
  /** Puffy only. How fast a puff turns over, rad/s at its fastest — each
   * one on its own rate and its own sign. Rotation is what stops a
   * hundred copies of one mask reading as a hundred copies of one mask,
   * and a slowly turning puff is the difference between smoke that churns
   * and smoke that merely slides. */
  spin?: number;
  /** Puffy only. The fraction of a puff's life spent coming UP to full
   * opacity. A puff that arrives at full strength POPS, and a cloud made
   * of pops is a cloud the eye counts. */
  fadeIn?: number;
  /** How many particles this cloud keeps, where the default is not enough.
   * A continuous cloud needs its spawn RATE times its longest life, and
   * the towed plume asks for both — hundreds a second, held for seconds. */
  pool?: number;
  /** HOW MUCH PALER THE CLOUD IS THAN THE GROUND IT CAME OFF, as a
   * multiplier on the tint. Dust hanging in the air is not the colour of
   * the road: it is lit from every side at once, where the road is lit
   * from one, and a cloud painted the ground's own tone is a cloud that
   * cannot be seen against the ground — which is exactly where a car puts
   * it. Grains are close enough to their source to skip this; a haze is
   * not. */
  lighten?: number;
  /** Puffy only. How close to the eye a puff is gone entirely, m — it
   * comes back to full over the next couple of metres. A cloud left behind
   * a moving car is a cloud the camera drives INTO, and a two-metre puff
   * across the lens is a grey wash over the whole frame; fading them out
   * before they reach the glass is what lets the cloud be big enough to
   * matter without ever being the thing you are looking at. */
  nearFade?: number;
  /** The most of the frame one particle may fill, as a fraction of HALF
   * the frame's height (three's own `scale` uniform, so it means the same
   * thing at 720p and 4K). A point sprite's size falls off with distance
   * and nothing else, so a grain flung PAST the chase camera swells into a
   * square a hand across for the frame it takes to go by — and a rooster
   * tail streams stones past the camera all corner long. Grains only; a
   * puff has `nearFade` for the same moment. 0 or unset is no cap. */
  pixelCap?: number;
  /** Air resistance, 1/s, on all three axes. Grit is dense and keeps
   * whatever it was thrown with; anything LIGHT — a scrap of paper, a cloud
   * of smoke — gives that speed up almost at once, and the difference
   * between the two is the whole difference between a spray and a burst.
   *
   * It has to act VERTICALLY too, or a burst fired upward keeps every bit
   * of its muzzle speed against nothing but gravity and leaves the frame:
   * a cannon charge at 17 m/s and paper's gravity would climb seventy
   * metres. With drag the same charge arcs a few metres up, which is what a
   * cannon full of paper actually does. */
  drag?: number;
  /** How far a particle wanders sideways as it falls, m/s at its widest.
   * This is what makes confetti confetti: a flat scrap does not fall, it
   * flutters, and a burst of colour that drops in straight lines reads as
   * sparks. Each grain wanders on its own phase, so a cloud of them never
   * sways in unison. */
  flutter?: number;
};

/** How fast a fluttering particle wanders, Hz. Slow enough to read as
 * paper turning over rather than a vibration. */
const FLUTTER_HZ = 1.15;

/** Gravel: fine grit, and a lot of it. The grains are deliberately SMALL —
 * near the lowered chase cam a big point sprite reads as a glitchy square,
 * where a swarm of small ones reads as spray. */
export const GRAVEL_DUST: DustStyle = {
  size: 0.075,
  opacity: 0.85,
  rise: 1.5,
  gravity: 6,
  life: { min: 0.5, max: 0.9 },
};

/** Tire smoke: what a sealed road gives you instead. Big soft puffs that
 * hang where they were made and drift off with the car's wake, so a drift
 * on tarmac leaves a wall behind it rather than a rooster tail. Big is only
 * available to it because it is `puffy`: the chase cam sits a couple of
 * metres behind the tires that make these, and at that range a bare sprite
 * this size is a grey rectangle stuck to the lens. */
export const TIRE_SMOKE: DustStyle = {
  size: 0.42,
  opacity: 0.3,
  rise: 0.7,
  gravity: 0.4,
  life: { min: 1, max: 1.9 },
  puffy: true,
  // Born a little under half a metre and swelling past a metre: rubber
  // smoke comes off the tire as a tight white curl and opens out as it
  // cools, which is the shape the eye reads as "that tire is cooking".
  grow: 2.6,
  sizeVary: 0.4,
  spin: 0.9,
  fadeIn: 0.12,
  nearFade: 2.2,
};

/** WATER THROWN, as opposed to water sprayed off a rolling wheel. What a
 * car displaces going INTO a body of water is a column, not a sheet: heavy
 * droplets launched hard, arcing high and coming straight back down, and a
 * lot of them — the count is what makes it read as a mass of water rather
 * than a puff of blue. Small and fast for the same reason gravel is (a big
 * sprite this close to the chase cam is a rectangle), and heavier than
 * gravel because water falls out of the air faster than it goes up. */
export const SPLASH_WATER: DustStyle = {
  size: 0.085,
  opacity: 0.9,
  rise: 4.5,
  gravity: 13,
  life: { min: 0.6, max: 1.2 },
};

/** ...and the froth left on the surface once the column has come down: the
 * white water over a hull that is still displacing, and the bubbles a
 * sinking car lets go of. Puffy, near-weightless, drifting UP a little
 * (negative gravity) so it breaks and spreads on the surface instead of
 * raining back into it. */
export const WATER_FOAM: DustStyle = {
  size: 0.22,
  opacity: 0.34,
  rise: 0.4,
  gravity: -0.15,
  life: { min: 0.6, max: 1.3 },
  puffy: true,
  grow: 2.2,
  sizeVary: 0.35,
  spin: 0.5,
  fadeIn: 0.1,
  nearFade: 1.2,
};

/** THE PLUME — the cloud a rally car TOWS, and the only one in the game
 * that is not thrown by anything. A wheel throwing grit makes a rooster
 * tail a couple of metres long; what actually hangs over a gravel stage
 * for half a minute after a car has gone is the fine stuff the whole
 * underside lifts, and there is no amount of grit that adds up to it —
 * it is a different substance, so it is a different cloud.
 *
 * Everything here is chosen to make it BOIL rather than fly. It is born
 * under a metre and swells past three; it is nearly weightless, with a
 * breath of lift so the mass climbs over the road behind the car; and the
 * drag is low enough that a puff keeps most of the speed it was handed for
 * a good second, which is what lets the cloud travel with the car instead
 * of being left in a line of dots behind it. Each puff is barely there on
 * its own — the density is in there being dozens of them on top of each
 * other, which is also why one crossing the lens is not a grey wall. */
export const GROUND_CLOUD: DustStyle = {
  // TIGHT AT THE CAR AND WIDE BEHIND IT. Born small — a puff leaving the
  // underside is half a metre across, not two — and then opening out by
  // six times over its life, so the cloud is a narrow throat at the car
  // that swells into a wall further back. Born big and grown a little,
  // the same number of puffs is a slab of fog that starts at full width,
  // which is the one shape a plume never has.
  size: 0.45,
  // …and THIN, because the density has to come from the OVERLAP rather than
  // from any one puff. A cloud you can pick single puffs out of is a cloud
  // made of sprites — and one you cannot see the road through is a cloud
  // that has stopped being an effect and started being the view. This is
  // low enough that the chase camera keeps the stage ahead through the
  // thickest part of the tail; the mass is still there, it is just made of
  // fifty overlapping veils instead of ten opaque ones.
  opacity: 0.21,
  // LOW, AND STAYING LOW. Barely any lift of its own, and almost none of
  // the spread going upward either (`updraft`) — the cloud opens out
  // sideways along the road instead of climbing. A plume that rises is a
  // plume at eye level, and at eye level a chase camera drives straight
  // through it: what should be the thing hanging over the road behind the
  // car becomes fog on the lens, which is the one way this effect can make
  // the game harder to play rather than better to look at.
  rise: 0.7,
  updraft: 0.25,
  gravity: -0.02,
  // The LENGTH of the tail is the other half of its shape, and it is
  // bounded from both ends. Too short and the cloud stops a car's length
  // behind the car; too long and the same number of puffs is stretched
  // over more road until the tail reads as a line of separate blobs
  // instead of one mass — and the rate cannot be raised to cover it,
  // because the density that fixes the tail is the density that closes the
  // cloud over the car (see `rate`). This is the length that holds
  // together at the rate the near view can afford.
  life: { min: 1, max: 1.9 },
  pool: 1024,
  puffy: true,
  drag: 0.42,
  grow: 6,
  sizeVary: 0.45,
  spin: 0.65,
  // Barely any fade-in: the cloud is meant to be there AT the tyre, and
  // what keeps it off the bodywork is the kick that fires it out from
  // under the car (`PLUME.kick`), not a delay before it appears.
  fadeIn: 0.07,
  // Just short of the point where the ground's red channel clamps: past
  // that the cloud stops being pale gravel and starts being pale yellow.
  lighten: 1.3,
  // AND OUT OF THE WAY UP CLOSE. Nothing within a couple of metres of the
  // eye and only up to full about where the car itself is, so from the
  // chase camera the cloud is a trail receding down the road behind rather
  // than anything across the glass. Judged from the CLOSE rig, which is
  // the one that would suffer: a plume that reads well from the helicopter
  // and fogs the bumper cam is a plume that has to be tuned again.
  //
  // The grit the wheels throw carries no such fade and is meant not to:
  // individual grains flicking past the lens read as speed, where a
  // two-metre puff doing the same thing reads as a smear.
  nearFade: 2.6,
};

/** WET GROUND, which throws no cloud at all. Water is what binds a loose
 * surface together: a wheel on a soaked gravel road cannot lift dust off
 * it because there is no dust left to lift — what comes up instead is
 * CLODS, and they are the opposite of smoke in every way that matters.
 * Bigger than a grain of dry grit and far heavier, thrown hard and back on
 * the ground inside a second, and dark rather than pale, because wet earth
 * is the one thing on a rally stage that is darker than the road. Not
 * puffy: a lump of mud has an edge on it. */
export const MUD: DustStyle = {
  size: 0.13,
  opacity: 0.95,
  rise: 2.4,
  gravity: 15,
  life: { min: 0.35, max: 0.75 },
};

/** WHEN a sealed road smokes — the policy that goes with the style above.
 * Tarmac has nothing lying on it to throw, so unlike gravel it gives up
 * nothing at all for ordinary driving, however hard it is being driven.
 * Smoke is what a tire gives when it is genuinely overwhelmed, and there
 * are only three moments that qualify: spinning up on the line, a committed
 * drift, and a real stop from real speed. Each of them leaves a little. */
export const TARMAC_SMOKE = {
  /** Seconds between puffs — a quarter of the loose surface's rate, so a
   * drift leaves a haze hanging in the corner rather than a bank of fog. */
  every: 0.12,
  /** Pulling away: the driven wheels outrunning the road (`LAUNCH.from`,
   * m/s) below `speed` m/s, before they hook up. `puffs` per driven wheel,
   * plus as much again for an axle that is properly lit — a clutch dropped
   * on a screaming engine smokes where a clean getaway chirps. */
  launch: { speed: 7, puffs: 3, spun: 4 },
  /** A committed drift: `puffs` per outside wheel, plus a little for how
   * deep the slide has gone. */
  drift: { puffs: 2 },
  /** Braking: `puffs` off ONE wheel, and only from a speed worth losing
   * (m/s) — a dab into a corner does not lock anything up. */
  brake: { speed: 24, puffs: 2 },
  /** Smoke boils off the tire rather than being thrown by it, so it spreads
   * gently instead of arcing away, m/s. */
  spread: 1.2,
};

/**
 * WHERE THE WHEELS TOUCH THE GROUND, in metres from the car's own origin —
 * the axles fore and aft, each wheel out to the side, and the height a
 * contact patch sits at.
 *
 * ONE answer, shared by everything that comes off the ground, because a
 * tyre is the only part of a car in contact with it. Dust, grit, mud, tire
 * smoke, a landing's thump and a take-off's scuff are all things a WHEEL
 * does; anything of theirs emitted from the middle of the car reads as
 * coming out of the car rather than off the road, and two of them emitted
 * from two different guesses at where the wheels are read as two unrelated
 * effects. (The exceptions are honest ones and stay where they are: an
 * impact happens where the body was hit, a ford's column comes off the
 * nose that displaced it, and the exhaust comes out of the pipe.)
 */
export const AXLE = { rear: 1.5, front: 1.15, side: 0.82, height: 0.15 };

/** WHICH WHEELS ARE DIGGING, by drivetrain — the share of the towed cloud
 * that comes off the REAR axle, so 1 is the back wheels and 0 the front
 * ones.
 *
 * THE REAR AXLE OWNS THE CLOUD ON EVERY LAYOUT, and the drivetrain only
 * tilts how completely. Two reasons, and they both point the same way. A
 * driven wheel is what TEARS the surface open, but the back wheels then run
 * through everything the fronts have already broken loose and lift it a
 * second time — so a front-driver's rear axle is working the richest ground
 * on the car. And the low pressure that carries a plume at all sits BEHIND
 * the car, which is why a real rally car tows its dust from the tail
 * whatever is driving it.
 *
 * A layout that hangs its whole cloud off the front axle is the shape this
 * band exists to prevent: from the chase camera those puffs are born
 * alongside the bodywork, so the dust the player sees is the dust smeared
 * over the car they are steering rather than the wall of it receding down
 * the road. Even the front-driver keeps its majority at the back. */
export const DRIVEN_REAR: Record<DriveLayout, number> = {
  rwd: 1,
  fwd: 0.6,
  awd: 0.8,
};

/** WHEN THE PLUME COMES UP, and how thick it is once it has.
 *
 * Unlike everything a wheel throws, the towed cloud has a genuine
 * threshold under it rather than a floor: a car pottering along a gravel
 * road at 20 km/h leaves nothing behind it at all, which is why `from` is
 * a hard start and not the bottom of a ramp. Past it the cloud thickens
 * with pace the whole way to the top of the stage's speeds, in the count,
 * the spread AND the birth size together — thinning only the count leaves
 * the same wide cloud with gaps torn in it. */
export const PLUME = {
  /** Nothing below this, m/s — 30 km/h. */
  from: 8.3,
  /** Full thickness at or above this, m/s — about 120 km/h. */
  to: 33,
  /** PUFFS PER SECOND at the threshold, and at full pace.
   *
   * Per second, and not "this many every 30 ms" — which is how every other
   * cloud in this file is written and is a trap for a cloud this thick. A
   * fixed cadence with a clock reset to zero spawns once per FRAME once the
   * frame is longer than the interval, so the plume silently thins to a
   * fifth of itself on a slow device and on the software renderer the
   * screenshots are taken with. A rate multiplied by the frame's own dt is
   * the same cloud at 20 fps as at 120. */
  // Judged at the top of the band and no higher. Past about this the cloud
  // stops fanning out behind the car and starts closing over it: the puffs
  // are born at the wheels, which are under the car's own outline from
  // behind, so any density that survives long enough to be seen there is
  // density painted across the thing the player is steering.
  rate: { min: 70, max: 340 },
  /** The longest frame the rate is paid for, s. A tab coming back from the
   * background hands the renderer one enormous dt, and a cloud that honours
   * it fires a second of plume into a single point. */
  maxStep: 0.1,
  /** HOW MUCH OF THE CAR'S OWN VELOCITY A NEW PUFF CARRIES.
   *
   * The cloud is dragged along in the low pressure behind the car rather
   * than thrown out of it, so it travels the way the car is GOING — and
   * because the term is signed, a car reversing tows its cloud backwards
   * without a second rule for it. A fraction rather than all of it is the
   * whole effect: at 1 the cloud would sit with the car forever and read
   * as fog bolted to the bumper, at 0 it would be left standing in a line
   * of puffs. Somewhere near half is a cloud that keeps up for a moment
   * and then falls away, which is what a plume does. */
  follow: 0.6,
  /** …and the SHOVE the tyre gives it on the way out, m/s backward in the
   * car's own frame, at full pace.
   *
   * A wheel does not lay dust down gently: it fires it backward out of the
   * arch, which is why a plume has a hard edge at the tyre and a soft one
   * behind. It is also what keeps the cloud off the CAR. A puff raised by
   * a front wheel starts its life alongside the bodywork, and without a
   * kick of its own it merely drifts back at the difference between the
   * car's speed and `follow` — slowly enough to be smeared across the car
   * the player is trying to look at, and the reason a front-wheel-drive
   * car could not otherwise raise its cloud from under its own nose. With
   * it, the dust is out behind the tail before it has finished swelling,
   * and everything after that is the drag letting it go. */
  kick: 7.5,
  /** How far a puff is born from its contact patch, m — a tight scatter
   * around the tyre and no more. The cloud leaves the car as two narrow
   * columns and finds ALL of its width from the spread below: width is
   * something a plume develops behind the car, never something it is born
   * with. Small, but not zero — every puff born at exactly one height is a
   * BAND at that height, which is the one shape a cloud never has. */
  scatter: 0.28,
  /** …and how far ABOVE the contact patch it may be born, m. Dust starts
   * at the ground because that is where the ground is. */
  lift: 0.3,
  /** What a metre per second of WHEELSPIN is worth against a metre per
   * second of road speed, when the cloud is asked how much ground is being
   * moved. Over 2, because the two do different things to a surface: a
   * rolling wheel runs over fresh ground and leaves it behind, while a
   * spinning one stands on one patch and grinds it to powder. Without it a
   * car standing on the line with its axle lit raises almost nothing —
   * `from` alone eats the whole of the slip — and the most violent thing a
   * tyre does all stage would be the one that hangs no dust. */
  spin: 2.2,
  /** The spread of the birth VELOCITIES at full pace, m/s — the knob that
   * owns the cloud's shape. It is what opens that throat out into a wall a
   * second later: the width is something a plume DEVELOPS behind the car,
   * never something it is born with. */
  spread: 2.6,
};

/** How thick the towed cloud is, 0..1 — nothing at all under `PLUME.from`.
 *
 * The argument is the speed the TYRE is moving over the ground, which is not
 * always the car's: a lit-up axle is shearing the surface at road speed plus
 * whatever it is spinning beyond it, which is how a car standing still on
 * the start line manages to hang a cloud over itself at all. Take it off the
 * ABSOLUTE speed too — a car being reversed at 40 km/h is moving as much
 * ground as one going forwards at 40. */
export function plumeScale(u: number): number {
  const speed = Math.abs(u);
  if (speed <= PLUME.from) return 0;
  return Math.min(1, (speed - PLUME.from) / (PLUME.to - PLUME.from));
}

/** How big a thrown cloud is at a given PACE, 0..1. A wheel at walking
 * speed disturbs the ground; a wheel at rally pace excavates it, and a
 * cloud that ignores the difference buries a car crawling out of a ditch
 * in the same plume it earns at 120 km/h. Both the grain COUNT and the
 * SPREAD ride on it, so a slow cloud is fewer grains and a tighter one —
 * scaling only the count would keep the same wide skirt with holes in it.
 * Smoke is exempt: an overwhelmed tire is overwhelmed at any speed. */
export const PACE = {
  /** At or below this the cloud sits at its floor, m/s. */
  from: 7,
  /** At or above this it is full size, m/s. */
  to: 28,
  /** What is left of it at a crawl, 0..1. */
  floor: 0.12,
};

export function paceScale(u: number): number {
  const t = Math.min(1, Math.max(0, (u - PACE.from) / (PACE.to - PACE.from)));
  return PACE.floor + (1 - PACE.floor) * t;
}

/** OFF THE LINE — the one exception to `PACE` above, and the reason it is
 * an exception rather than a hole in it. A wheel pulling away from a stop
 * is SPINNING, not rolling: it is moving far more ground than its road
 * speed suggests, so the cloud has to come from the slip under the tire
 * instead of from the speedometer, or the most dramatic moment of the run
 * is the one where the car throws almost nothing. It fades out as the
 * wheels hook up and hands the plume straight over to the rolling kickup
 * that owns it from there. */
export const LAUNCH = {
  /** How far the driven wheels have to be outrunning the road before it
   * reads as spin rather than as a tyre working, m/s... */
  from: 1.5,
  /** ...and where they are properly lit, m/s. A launch off the limiter tops
   * out around 10 m/s of slip and a clean one off idle barely reaches 4, so
   * the two starts are a different SIZE of cloud and not merely a different
   * length of one. */
  lit: 8,
  /** Road speed the tires have found the ground by, m/s — 50 km/h, which
   * is also where the rolling kickup comes in, so the two meet rather than
   * leaving a gap with no cloud in it. */
  settle: 13.9,
  /** How hard a lit-up wheel throws what it digs out, m/s backward. A
   * standing car has no wake to hand its grains to — without a kick of
   * their own they drop where they were made and the launch reads as a
   * puff under the car instead of a rooster tail behind it. */
  push: 6,
};

/** How hard the driven wheels are digging off the line, 0..1: full under a
 * lit axle at a standstill, nothing once the car is up and running.
 *
 * `spin` is `CarState.wheelspin`, the engine's own slip readout — the same
 * number the wheels are DRAWN turning at (car-wheels.ts), so the cloud and
 * the wheels above it can never disagree about whether the tyres are
 * gripping. It has to be the slip and not the speedometer: a car pulling
 * away is moving far more ground than its road speed suggests, and a car
 * that dropped the clutch on a screaming engine is moving the most of all
 * while barely leaving the line.
 *
 * The road-speed term falls off as a SQUARE rather than a straight line — a
 * tire loses its slip late and then all at once, and a linear ramp spends
 * the launch's whole budget in the first tenth of a second, where the car
 * is still under the start gantry and the player is watching the lights. */
export function launchThrow(u: number, spin: number): number {
  const lit = Math.min(1, Math.max(0, (spin - LAUNCH.from) / (LAUNCH.lit - LAUNCH.from)));
  const hooked = Math.min(1, Math.max(0, u / LAUNCH.settle));
  return lit * (1 - hooked * hooked);
}

/** What the WILD throws, as a fraction of what the road throws — GRAINS
 * only. Turf holds together where loose grit does not: a wheel off the road
 * tears out clods and blades, and the screen of fine dust a graded surface
 * gives up is not something turf HAS. That half of it is not cut here, it
 * is refused outright — the towed cloud does not come up over grass at all
 * (`plumeGround`), because a green cloud is a substance that does not
 * exist.
 *
 * Which is why this sits where it does. What a wheel THROWS is the only
 * ground-contact effect the wild has left, so cutting it as well would
 * leave a car crossing a field at 150 km/h disturbing nothing — the ground
 * has to answer the car even when it answers with clods instead of dust.
 * A shade under parity: the grains are earth rather than the road's pale
 * grit (`WILD_DUST`), so the same count reads as ground being torn open
 * rather than as a second dust cloud in a different colour. Judged at the
 * speeds a player actually looks at the ground — crawling out of a field,
 * and sliding across one — because at pace the car's own wake carries the
 * grains behind the chase camera inside a fraction of a second. */
export const WILD_THROW = 0.9;

/** How much MORE a soaked surface throws than a dry one. Two reasons, and
 * they agree. A wet road genuinely throws more: there is standing water
 * and loose wet grit on top of it where a dry road has fine dust that goes
 * into the air instead. And the rain has taken the towed cloud away
 * entirely, so what the wheels throw is the only ground-contact effect
 * left — a wet stage that also throws a dry stage's worth of grit is a
 * stage where the ground under the car says nothing at all. */
export const WET_THROW = 1.9;

/** A cloud made of TWO things. Ground thrown off a wheel is never one
 * color: the wild's verge is grass torn up with the earth under it, and
 * what sells it is that the grains are individually one or the other —
 * mostly green with dark clods through it — rather than every grain being
 * the average of the two, which is just a duller green. */
export type DustTint = {
  /** The tone most of the grains take. */
  base: number;
  /** The minority tone mixed in grain by grain. */
  fleck: number;
  /** What fraction of the grains take the fleck, 0..1. */
  fleckMix: number;
};

export type Dust = {
  points: THREE.Points;
  /** `vx`/`vy`/`vz` seed every particle with a base world velocity on top
   * of the random spread — the car's wake for a thrown cloud, the barrel's
   * own aim for anything fired out of one. `vy` ADDS to the style's rise
   * rather than replacing it. */
  spawn: (
    x: number,
    y: number,
    z: number,
    color: number | DustTint,
    count: number,
    spread: number,
    vx?: number,
    vz?: number,
    vy?: number,
  ) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

/**
 * THE GRAFT — what a dust material's shader gets that three's own points
 * shader does not. Two things, and they are independent: the LIGHT every
 * cloud takes off the cars' lamps, and the three per-particle attributes
 * that separate smoke from a sprite.
 *
 * THE LIGHT. A point cloud is not in the lit scene: no normals, so the sun
 * and the four spotlights on the car pass straight through it and a cloud
 * is whatever colour it was born. What it gets instead is its material's
 * own colour as an ambient (the sky, via `dustTintFor`) plus the register
 * in dust-light.ts summed here — a handful of cones with a linear reach,
 * added into `diffuse` so the fragment's existing multiply by the
 * particle's vertex colour comes out as albedo x (ambient + lamps). Per
 * VERTEX is per particle for a point sprite, which is why this is cheap
 * enough to run on a thousand puffs: a lamp costs a length, a dot and two
 * multiplies, once per puff rather than once per pixel of it.
 *
 * It is written branchlessly on purpose. An empty slot carries a zero
 * reach and a black colour, so it falls out of the sum through the same
 * `max` that clamps a lamp's falloff at its edge — no loop bound that
 * changes with the frame, and no `continue` for a compiler to unroll
 * badly.
 *
 * THE PUFF. A `PointsMaterial` draws every point at one size and one
 * opacity, and samples its mask at one angle: three constants, and between
 * them they are why an untreated point cloud reads as a sprite however
 * good the sprite is. Grafting three attributes onto three's own points
 * shader — rather than writing a shader from scratch — is what keeps the
 * size-attenuation maths, the fog, the tint and the clipping planes working
 * exactly as they do for everything else in the scene.
 *
 * The fourth term is the only one the CPU cannot supply: a puff's distance
 * from the EYE, which is `mvPosition` and exists only inside the vertex
 * shader. It is what fades a cloud out of the lens as the camera runs into
 * it.
 */
function graftDust(mat: THREE.PointsMaterial, puffy: boolean, near: number, cap: number): void {
  mat.onBeforeCompile = (shader) => {
    // Assigned by REFERENCE, so every dust material in the scene shares one
    // set of arrays and the register is written once a frame rather than
    // once per cloud.
    Object.assign(shader.uniforms, DUST_LAMP_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec4 uDustLampSpot[ ${DUST_LAMPS} ];
        uniform vec4 uDustLampFace[ ${DUST_LAMPS} ];
        uniform vec3 uDustLampGlow[ ${DUST_LAMPS} ];
        varying vec3 vLamp;${
          puffy
            ? `
        attribute float aScale;
        attribute float aFade;
        attribute float aSpin;
        varying float vFade;
        varying float vSpin;`
            : ""
        }`,
      )
      .replace(
        "gl_PointSize = size;",
        `gl_PointSize = size${puffy ? " * aScale" : ""};${
          puffy
            ? `
        vSpin = aSpin;
        vFade = aFade${
          near > 0
            ? ` * smoothstep( ${near.toFixed(2)}, ${(near * 2.4).toFixed(2)}, - mvPosition.z )`
            : ""
        };`
            : ""
        }
        vLamp = vec3( 0.0 );
        vec3 dustAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        for ( int i = 0; i < ${DUST_LAMPS}; i++ ) {
          vec4 lamp = uDustLampSpot[ i ];
          vec3 away = dustAt - lamp.xyz;
          float gap = length( away );
          // Linear to the lamp's reach and nothing past it, squared so the
          // light is concentrated at the tyre rather than spread evenly
          // over the whole cone.
          float fall = max( 0.0, 1.0 - gap / max( lamp.w, 0.001 ) );
          vec4 aim = uDustLampFace[ i ];
          // Soft-edged: a hard cone edge across a cloud is a straight line
          // drawn on smoke, which is the one shape smoke never has.
          float cone = smoothstep(
            aim.w,
            mix( aim.w, 1.0, 0.55 ),
            dot( away / max( gap, 0.001 ), aim.xyz )
          );
          vLamp += uDustLampGlow[ i ] * cone * fall * fall;
        }`,
      );
    if (cap > 0) {
      // After the attenuation, which is what the cap is for: the size has
      // already been divided by the depth by the time the fog include runs.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        gl_PointSize = min( gl_PointSize, scale * ${cap.toFixed(4)} );`,
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vLamp;${
          puffy
            ? `
        varying float vFade;
        varying float vSpin;`
            : ""
        }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec4 diffuseColor = vec4( diffuse + vLamp, opacity${puffy ? " * vFade" : ""} );`,
      );
    if (!puffy) return;
    shader.fragmentShader = shader.fragmentShader
      // The mask, turned about the sprite's middle. Sampling outside the
      // square is safe and wanted: the corners a rotation reaches into are
      // clamped to the mask's own transparent rim.
      .replace(
        "#include <map_particle_fragment>",
        `#ifdef USE_MAP
          vec2 puffUv = gl_PointCoord - 0.5;
          float puffCos = cos( vSpin );
          float puffSin = sin( vSpin );
          diffuseColor *= texture2D(
            map,
            vec2( puffCos * puffUv.x - puffSin * puffUv.y, puffSin * puffUv.x + puffCos * puffUv.y ) + 0.5
          );
        #endif`,
      );
  };
  // Styles that compile to different programs — a grain against a puff, two
  // puffy styles with different lens fades, a capped grain against a bare
  // one — must not share a key. Without this three sees one PointsMaterial
  // cache key for all of them and hands the second one the first one's
  // shader.
  mat.customProgramCacheKey = () => `dust-${puffy ? near : "grain"}-${cap}`;
}

export function createDust(style: DustStyle = GRAVEL_DUST): Dust {
  const pool = style.pool ?? POOL;
  const positions = new Float32Array(pool * 3);
  const colors = new Float32Array(pool * 3);
  const velocities = new Float32Array(pool * 3);
  const life = new Float32Array(pool);
  let cursor = 0;

  const puffy = style.puffy === true;
  const grow = style.grow ?? 1;
  const sizeVary = style.sizeVary ?? 0;
  const spinRate = style.spin ?? 0;
  const fadeIn = style.fadeIn ?? 0;
  const lighten = style.lighten ?? 1;
  const updraft = style.updraft ?? 1;
  /** Puffy only, and parallel to `life`: how long each puff was given (so
   * its age can be read as a fraction), the size it was born at, how fast
   * and which way it turns, and the three the shader actually reads. */
  const span = new Float32Array(pool);
  const birth = new Float32Array(pool);
  const spins = new Float32Array(pool);
  const scales = new Float32Array(pool);
  const fades = new Float32Array(pool);
  const angles = new Float32Array(pool);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const map = puffy ? (style.size >= 0.6 ? billowTexture() : puffTexture()) : null;
  const mat = new THREE.PointsMaterial({
    size: style.size,
    map,
    vertexColors: true,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
  });
  if (puffy) {
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    geo.setAttribute("aFade", new THREE.BufferAttribute(fades, 1));
    geo.setAttribute("aSpin", new THREE.BufferAttribute(angles, 1));
  }
  graftDust(mat, puffy, style.nearFade ?? 0, style.pixelCap ?? 0);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const tint = new THREE.Color();

  const spawn = (
    x: number,
    y: number,
    z: number,
    color: number | DustTint,
    count: number,
    spread: number,
    vx = 0,
    vz = 0,
    vy = 0,
  ): void => {
    const mix = typeof color === "number" ? null : color;
    if (!mix) tint.set(color as number);
    for (let n = 0; n < count; n++) {
      if (mix) tint.set(Math.random() < mix.fleckMix ? mix.fleck : mix.base);
      const i = cursor;
      cursor = (cursor + 1) % pool;
      positions[i * 3] = x + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = y + Math.random() * 0.3;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      velocities[i * 3] = vx + (Math.random() - 0.5) * spread;
      velocities[i * 3 + 1] = vy + style.rise + Math.random() * spread * updraft;
      velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      colors[i * 3] = Math.min(1, tint.r * lighten * (0.85 + Math.random() * 0.3));
      colors[i * 3 + 1] = Math.min(1, tint.g * lighten * (0.85 + Math.random() * 0.3));
      colors[i * 3 + 2] = Math.min(1, tint.b * lighten * (0.85 + Math.random() * 0.3));
      life[i] = style.life.min + Math.random() * (style.life.max - style.life.min);
      if (puffy) {
        span[i] = life[i] as number;
        // Born somewhere inside the size band, at a random angle, turning
        // either way — three draws that cost nothing and are the whole
        // reason a hundred copies of one mask do not read as one mask.
        birth[i] = 1 - sizeVary * Math.random();
        spins[i] = (Math.random() * 2 - 1) * spinRate;
        angles[i] = Math.random() * Math.PI * 2;
        scales[i] = birth[i] as number;
        fades[i] = 0;
      }
    }
  };

  let clock = 0;
  const drag = style.drag ?? 0;
  const flutter = style.flutter ?? 0;
  const update = (dt: number): void => {
    clock += dt;
    // A drag of `k` over `dt` leaves this share of the horizontal speed.
    const keep = drag > 0 ? Math.max(0, 1 - drag * dt) : 1;
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      velocities[i * 3 + 1] -= style.gravity * dt;
      if (keep !== 1) {
        velocities[i * 3] *= keep;
        velocities[i * 3 + 1] *= keep;
        velocities[i * 3 + 2] *= keep;
      }
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (flutter > 0) {
        // The phase comes off the slot index, which is free and never
        // repeats inside a burst — no per-particle state to carry.
        const phase = i * 0.618;
        positions[i * 3] += Math.cos(clock * FLUTTER_HZ * 6.283 + phase) * flutter * dt;
        positions[i * 3 + 2] += Math.sin(clock * FLUTTER_HZ * 4.71 + phase) * flutter * dt;
      }
      if (puffy) {
        // Age as a fraction of what this puff was given. The SWELL is eased
        // out — a puff does most of its growing in the first moment and
        // then hangs there widening slowly, where a straight ramp reads as
        // a sprite being scaled up. The thinning is the other way round:
        // it holds most of its opacity through the middle of its life and
        // gives the rest up at the end, so a cloud dissolves instead of
        // dimming from the moment it appears.
        const t = span[i] > 0 ? Math.min(1, 1 - (life[i] as number) / (span[i] as number)) : 1;
        const eased = 1 - (1 - t) * (1 - t);
        scales[i] = (birth[i] as number) * (1 + (grow - 1) * eased);
        angles[i] = (angles[i] as number) + (spins[i] as number) * dt;
        const up = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
        fades[i] = life[i] > 0 ? up * (1 - t * t) : 0;
      }
      if (life[i] <= 0) positions[i * 3 + 1] = -50; // park expired below ground
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (puffy) {
      geo.attributes.aScale.needsUpdate = true;
      geo.attributes.aFade.needsUpdate = true;
      geo.attributes.aSpin.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  // Park the whole pool out of sight until first use.
  for (let i = 0; i < pool; i++) positions[i * 3 + 1] = -50;

  return { points, spawn, update, dispose };
}
