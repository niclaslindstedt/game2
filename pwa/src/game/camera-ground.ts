// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GROUND AN OUTSIDE CAMERA STANDS ON — how it is read, how far over it
// the lens is held, how fast it may move, and the one place it is refused
// altogether.
//
// Every camera on the boom (CHASE_RIGS in camera.ts) is hung off the car's
// own height, and that is nearly right: it is the car the shot is built
// around, and the car is what the terrain is doing something to. What is
// wrong with it is everything the road does to the CAR that is not the shape
// of the country — the wheel tracks, the crown, the step off the mat — and
// everything the terrain reading does under the LENS that the car never sees
// — a lattice kink, a shoreline, the hill the camera is trailing into.
//
// So four rules stand between the two, and they are all here because they
// are one subject: what is under the camera, and what it is allowed to do
// about it.

import type { GameState } from "@engine";

/** Clearance a chase camera is never allowed under, m — over the ground
 * AND over any water. The camera trails the car, so on any real descent the
 * ground behind is higher than the ground under the wheels and a fixed
 * roof-height camera is simply inside the hill; run along a shoreline and
 * the same camera drops under the lake, which is the sheet of flat blue
 * that swallows half the frame. Both are checked at the camera's own
 * position, never the car's. */
export const CHASE_CLEARANCE = 1.3;

/** How that floor is allowed to MOVE, which matters far more than where it
 * is. The ground under a trailing camera is not a smooth reading: the
 * terrain's lattice kinks at every cell edge, a shoreline swaps the ground
 * for the water's surface, and the far country can step outright where two
 * fields meet. Taken as a bare `groundAt` under a single point, each of
 * those arrives in the picture in ONE FRAME — a cut, not a movement — and
 * the steeper the ground, the bigger it is. That is the shake on a cliff
 * top, and the reason a cliff top has felt broken.
 *
 * Two rules fix it. The ground is read over the camera's own FOOTPRINT
 * rather than under a point, so a lateral wobble on steep ground (the swing,
 * the impact shake) cannot pump the camera up and down. And the floor may
 * rise at once — a camera inside a hill shows nothing at all — but only ever
 * SINKS at a bounded rate, so ground falling away under the camera is
 * something it flies down, never something it is cut to. */
export const FLOOR = {
  /** Radius of the footprint the ground is read over, m. */
  span: 1.8,
  /** How fast the floor closes on a target below it, 1/s, and the ceiling on
   * that, m/s. The rate is brisk enough that an ordinary descent — the
   * ground under a trailing camera drops some 8 m/s on a steep one — tracks
   * within a metre; the ceiling is what turns a cliff-sized step into a
   * second of descent. */
  sink: 10,
  sinkMax: 16,
  /** A jump this big between frames is a respawn or a fresh stage, m: the
   * floor is taken where it is found rather than flown down to. */
  snap: 24,
};

/** The footprint's points: the middle and the four corners. */
const FOOTPRINT: [number, number][] = [
  [0, 0],
  [FLOOR.span, FLOOR.span],
  [FLOOR.span, -FLOOR.span],
  [-FLOOR.span, FLOOR.span],
  [-FLOOR.span, -FLOOR.span],
];

/** The highest thing under the camera's footprint — ground or water,
 * whichever is nearer the lens — over a square of FLOOR.span about the
 * point. Sampling the corners as well as the middle is what makes the
 * reading a SURFACE the camera stands on rather than a needle it balances
 * on: at the top of a slope steep enough to matter, the difference between
 * two points a metre apart is metres of height, and a camera that reads
 * one point is a camera that jitters by that difference. */
export function groundOver(state: GameState, x: number, z: number): number {
  const { groundAt, waterAt } = state.terrain;
  let high = -Infinity;
  for (const [dx, dz] of FOOTPRINT) {
    high = Math.max(high, groundAt(x + dx, z + dz), waterAt(x + dx, z + dz) ?? -Infinity);
  }
  return high;
}

/** THE SURFACE IS NOT THE SHAPE. R16 builds a real dirt road across its
 * width: a crown down the middle, two worn wheel tracks either side of it,
 * a loose edge outside those, and a shoulder that steps down into the
 * verge. The car RIDES all of it — it drops fifteen centimetres into a
 * track and climbs back out over the crown, and it should: that is what
 * tells a driver from inside the car that the road has been used. The
 * CAMERA should not. Line a corner up so the car crosses the road and a
 * camera hung off the car's own height heaves nearly ten centimetres up and
 * down on a stage that is DEAD FLAT — a bump with nothing under it,
 * arriving exactly where the shot is supposed to be at its steadiest.
 *
 * So the camera hangs off the car on a LOOSE LINKAGE. There is `reach` of
 * play in it, and the linkage recovers that play at `recover` per second.
 * Inside the play the camera barely moves; past it the linkage is tight and
 * the camera moves one for one, so a crest, a landing, a cliff and a jump
 * all arrive at full size and only ever late by the play itself. The clamp
 * is also what makes a respawn free: the reading can never be further than
 * the play from the truth, so there is no jump to catch and no snap case to
 * write.
 *
 * The two quantities it is hung on are separated by different things, and
 * the numbers say which.
 *
 * The HEIGHT is separated by SIZE, and it has to be: a long sweeper crosses
 * the wheel tracks over several seconds, and no filter quick enough to
 * leave a crest alone would ever reject that. What separates them instead
 * is that the cross-section is BOUNDED and the terrain is not — so the play
 * covers the whole cross-section and the recovery is slow enough that
 * almost nothing leaks through it.
 *
 * The in-car views hang their HORIZON on the same idea and separate it by
 * TIME instead — camera-eye.ts states why. */
export const SLACK = {
  /** The camera's height. The play is clear of the cross-section's whole
   * range — a crown to the bottom of a wheel track is under 0.2 m, and the
   * step off the mat onto the verge under 0.4 — and far under the smallest
   * thing the generator builds that the camera is meant to fly. */
  ground: { reach: 0.35, recover: 0.2 },
} as const;

/** ...AND WHAT GETS PAST THE PLAY ARRIVES AS A MOVEMENT, NOT A CUT. The
 * slack separates by size, so anything bigger than it — a kerb dropped off
 * at a slant, a lattice crease, the step off a shelf, the whole rolling
 * ground of the country off the road — comes through at full amplitude in
 * the frame it happens. The car should do that; a camera that does it too
 * is the car standing still in the frame while the whole world jumps, the
 * read of a camera welded to the roof.
 *
 * So the height the chase rigs stand and aim from is carried on a SPRING
 * (lib/sprung.ts) — a mass, not a lag. An ease answers a kink in the
 * ground with a kink in the camera's own path, one frame later and only a
 * little softer, which off the road is the camera bobbing over every crease
 * the car bobs over. A mass on a spring has to be got moving: a crease
 * arrives as a curve, and a bump over before the spring has answered it is
 * mostly not answered at all — the car rides it, in the frame, and the
 * frame holds. `ground` is the spring's natural frequency on the ground,
 * Hz: about a second to answer a real change of level, which is the
 * weight of something flown rather than bolted on. `flying` is the same
 * spring in the AIR, where the car's height is a smooth arc with nothing in
 * it to reject and the frame must not change for a designed jump
 * (CHASE_RIGS): stiff enough to sit on the arc within a couple of
 * centimetres.
 *
 * A spring trails a HILL, though — a mass climbing a steady grade hangs
 * behind the point it is chasing by `2ζv/ω`, which at a soft spring and
 * rally pace is most of a metre, and a camera a metre low on every climb
 * is a camera looking at a roof. So the spring is LED by the car's vertical
 * speed: the known movement is fed forward and the spring only has to
 * reject what is left, which is the bumps. That speed is the engine's own
 * smoothed grade (`car.vy`), eased again at `lead`, 1/s, because off the
 * road even the smoothed grade jitters — and snapped, not eased, at
 * takeoff and landing, which are real changes of movement rather than
 * bumps in it. */
export const HEIGHT_SPRING = { ground: 1.1, flying: 4, damping: 1, lead: 2.5, snap: 6 };

/** THE CLIFF. Driving off a cliff top is the one place the chase rig has
 * nothing sensible to follow. Riding the car down keeps it exactly two
 * metres over the roof for the whole plunge, so a twenty-five metre drop
 * reads as nothing happening; and the floor alone cannot save it, because
 * the camera clears the lip a fifth of a second after the car does and from
 * then on there is no ground under it either.
 *
 * So the camera simply declines to come all the way down. It holds part of
 * the height it had at the top and lets the car sink away below it — which
 * is what the moment actually is: the car is gone, nothing the driver does
 * matters now, and all that is left to do is watch it fall. The aim is
 * already at the car, so the shot pitches over the edge on its own.
 *
 * The hold is keyed to how far the car has fallen BELOW WHERE IT LEFT THE
 * GROUND, not to how long it has been in the air, so a lip, a crest and a
 * designed ramp jump — every one of which lands near the height it launched
 * from — never touch it. The frame does not change for a jump (CHASE_RIGS);
 * it changes for a fall. */
export const CLIFF = {
  /** How far the car has to be under its own takeoff before the camera
   * starts holding back, m. A stage's jumps live well inside this. */
  slack: 6,
  /** Share of the drop past that the camera keeps, and the most it ever
   * keeps, m. Half means a twenty-five metre cliff leaves the car ten
   * metres further down the frame than the rig would ever put it. */
  gain: 0.5,
  max: 12,
  /** How fast the hold winds on and comes back off, 1/s. Winding on is
   * quick because the drop itself is the shape of the gesture; coming off
   * is slow, so the camera settles back over the couple of seconds after
   * the landing instead of dropping onto the car like a lift. */
  rise: 5,
  settle: 1.4,
};
