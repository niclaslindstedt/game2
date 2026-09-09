// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHASE RIGS, as data. Where the camera stands behind the car, how far
// it lags, how much of the drift it lets the car show, and how it frames
// the road ahead — one row per chase view, because the difference between
// them IS the row. `camera.ts` drives them; the `game-feel` skill owns
// what each number does to the sensation of speed.

//             swings the car across the frame while the road keeps flowing.
//   far     — stood back and a little higher: less drama, more warning.
//   heli    — high and behind, the shot a chase helicopter would fly.
//   top     — over the roof, tilted just far enough forward to show the road
//             the car is about to be on.
//
// Two more are placed by the app and never cycled into, because neither one
// can be driven from:
//
//   drone — high overhead, trailing and slowly circling: the menu's living
//           backdrop, where a bot is driving and nobody is watching the
//           apex. Its own rig, in camera-drone.ts — it carries none of the
//           chase machinery, only the slow circling that keeps a backdrop
//           from reading as a paused screenshot.
//   map   — the whole stage framed from the sky, turning: the Roam page's
//           look at what a seed actually builds. Its own rig, in
//           camera-map.ts — it frames a FOOTPRINT rather than following a
//           body, so it shares nothing with the chase rigs but the lens.
//
// The five outside cameras are the SAME rig with different proportions —
// one table of numbers (CHASE_RIGS), one update function — so an angle is a
// row rather than another camera to maintain. What separates them is not
// only where they stand but how HEAVY they are: from `far` outwards they
// answer the car slowly and their swing is a sprung mass that overshoots a
// turn and settles back into it, so a camera at a distance reads as
// something being flown rather than something bolted on. The two the game
// is actually driven from — `close` and `chase` — share one steady
// character and differ only in where they stand: a boom is answered
// briskly and settles without overshooting, at either length.
// In the air the framing goes loose and pulls wide, which reads as flying,
// and the BOOM ITSELF TURNS: it is a rod behind the car, and off the ground
// it lies along the car's own path rather than along the horizontal, so it
// dips under a car coming off a lip and swings over one that is falling —
// which is the difference between watching a jump and watching a car leave
// (camera-feel.ts). It never lets go of the car, and never lets the car
// get further from it than the length of the rod: a cliff on an alpine
// stage is a shot pitching over with the car, not a lens left on the edge.
// Landings and splashes leave a small decaying rattle; running into things
// leaves the outside shot alone, because a boom did not hit the tree and the
// car is right there in frame taking it on its own springs (camera-shake.ts).
//
// The three IN-CAR cameras are their own table and their own update, in
// camera-eye.ts, because none of them is standing anywhere: they are sat in
// (or bolted to) the car, and what makes them worth driving from is that the
// eye has WEIGHT, the road has GRAIN, and a hit throws the head.
//
// WALKING THE LADDER IS A MOVE, NEVER A CUT. The lens is FLOWN from where it
// was standing to where the new rig has stood it, over about a third of a
// second (camera-change.ts). Between the outside rigs most of that hand-over
// was already in the numbers — they share a standoff and a height, and those
// ease — and the flight only carries the part that never eased, which is the
// aim. The four steps that cross between the two families had nothing in
// common to ease at all, and the flight is the whole of them: it reads as
// climbing into the car and back out of it, which is what it is.
//
// And two BEATS override whichever of them is up, both of them the same
// gesture — the lens stops being a rig and becomes an operator standing
// somewhere. The establishing shot opens every stage: the camera circles the
// start control while the crew in front leaves, then comes down onto the car
// it will be driven from (camera-start.ts). The flying finish closes it: the
// camera stops travelling with the car, plants itself where it stood, and
// turns to watch it go (camera-finish.ts). This file owns WHEN each of the
// two has the frame; they own what the shot is.
//
// A CRASH IS NOT ONE OF THEM. The player keeps the camera they were driving
// with, and it keeps the framing it had on the frame the car went over: the
// outside rigs HOLD (`holding` in `updateChase`) and go on tracking the car
// through the world from that same angle until it is planted again. The
// world turns over; the picture does not. The three seats inside the car are
// the same decision read the other way — bolted to the body, they go round
// WITH it (camera-eye.ts).

/** `free` is god mode: the developer tool that takes the lens off the car
 * and flies it (camera-free.ts). It is not on the ladder the camera key
 * walks, for the same reason the drone and the map are not — it is placed
 * deliberately or not at all. */

/** The ladder, in numbers. `chase` is the reference frame — proportions read
 * off Sega Rally: the car anchors the BOTTOM of the frame and the horizon
 * rides high. `close` and `far` are that same shot pulled in and stood back;
 * `heli` and `top` trade the drama for what the driver cannot otherwise
 * see, which is the road past the next crest.
 *
 * What makes those three ONE shot at three lengths is not the height — it is
 * the LOOK-OVER ANGLE, the depression from the lens to the top of the car's
 * own roof. That angle is the whole of whether a player can see where they
 * are going, because it is what decides how far up the frame the roofline
 * reaches and how much road is left above it: `chase` and `far` hold about
 * 13°, which puts the roof around three fifths of the way down the frame
 * and lands the sight line grazing it on the road a couple of metres past
 * the bumper. Height is therefore a CONSEQUENCE of the standoff, not a free
 * number — a boom half as long needs half as much height over the roof for
 * the same shot, and a camera set at roof height, whatever its length, is a
 * camera looking at a roof.
 *
 * The angle is the means, though, and WHERE THE ROOFLINE LANDS is the end —
 * and the two only agree while the car fills the same amount of frame. At
 * four metres it does not: the same car subtends half again as much of the
 * picture as it does from `chase`, so the shared 13° hangs its roofline
 * higher up the frame and leaves proportionally less road over it, which
 * is the shortest shot on the ladder reading as sitting in the dirt behind
 * the car. So `close` takes about 18° instead — enough extra look-over to
 * put its roofline back where the rest of the ladder puts one, around
 * three fifths down. It costs it nothing else: what makes `close` the
 * tight shot is the length of the boom, not the height of it.
 *
 * `close` and `chase` carry IDENTICAL steadying numbers — the follow rate,
 * the swing spring, the hill lift and duck, the aim's climb. A boom is a
 * boom whatever length it is run out to, and a longer one that also answers
 * more slowly turns the same yaw lag into more metres of lateral travel: the
 * world sloshes across the frame, which is what a player reads as the shot
 * being unsteady rather than as the camera having weight. The heaviness that
 * makes a distant camera read as FLOWN starts at `far`, where the standoff
 * is long enough that the sway is legible as a gesture of its own.
 *
 * The STANDOFF does not change when the car leaves the ground: pulling
 * back for a jump makes the biggest moment in the stage read as small and
 * safe, and it is the one moment the camera should hold its nerve. What the
 * frame does do in the air is stand at the top of its `hover` — the grip
 * read (camera-feel.ts) has nothing to read — and TURN THE ROD it is
 * standing on the end of down the car's own flight path (`flight`). The
 * rod's length is the standoff, and turning it does not change one: the car
 * is exactly as big in the frame going over a cliff as it was on the road
 * before it. Both are readings rather than a jump animation, which is why
 * a brow, a landing's skitter and a mountainside are the same two numbers
 * at three sizes. */
import type { ChaseCamera } from "./camera.ts";

/** A camera behind the car, as a set of numbers. The distance and height
 * decide how big the car is in frame; the aim point decides the PITCH, and
 * the pitch is what a shot is really made of — where the car sits
 * vertically and how much sky is left over the horizon. */
export type ChaseRig = {
  /** Standoff behind the car at a standstill, m, and the metres added per
   * m/s of pace — the "straining ahead" cue, a fifth of the boom over the
   * whole speed range: felt as pace before it is seen as framing. */
  dist: number;
  distPerSpeed: number;
  /** Share of the SURGE this rig takes, 0..1 (camera-feel.ts) — the boom
   * falling behind a car on the power and carrying forward over one under
   * the brakes. The rigs just behind the car take all of it, since it is
   * their standoff a metre is a fifth of; the flown pair take a fraction,
   * where the same metre is a lens breathing. */
  surge: number;
  /** Height over the car's own y, m. */
  height: number;
  /** How much of the drift's slip angle the framing carries, 0..1. At 1 the
   * camera aims down the car's TRAVEL and the whole slide shows across the
   * frame; at 0 it follows the nose and the drift is invisible.
   *
   * ...and the CEILING that share eases onto, deg — THE DRIFT'S CEILING in
   * `updateChase`, which owns what it means. The two driving rigs hold the
   * tightest one: they are the shots the road has to stay readable through.
   * `far` stands back far enough that the same angle covers less of the
   * frame, and the two that look DOWN on the car are given one nothing
   * reaches, because from up there a slide across the frame hides nothing
   * and is the whole appeal of the shot. */
  driftWeight: number;
  driftMax: number;
  /** How briskly the camera answers the car, 1/s — the one knob for how
   * HEAVY the rig is, because a camera that snaps to everything the car
   * does has no weight at all. The nose-follow uses it directly; the drift
   * offset winds on at that rate and unwinds at DRIFT_SETTLE of it, and the
   * standoff and height ease at RIG_EASE of it. A camera bolted to a boom
   * behind the bumper is brisk; something with mass flying above the trees
   * is not. */
  followRate: number;
  /** Design fov at a standstill, deg, what a m/s of pace adds, and the
   * ceiling before the world turns into a tunnel. */
  fov: number;
  fovPerSpeed: number;
  fovMax: number;
  /** How far down the road the aim point sits, m, how high over the car's
   * own y, and how far the road's gradient lifts it — a ramp should show
   * the sky over the brow instead of burying the aim in the hillside. */
  aimAhead: number;
  aimHeight: number;
  aimClimb: number;
  /** How far the camera RISES per unit of downhill gradient, m. Going down,
   * a camera that hangs above the road as it falls away reads as dropping
   * into the descent rather than as a flat road that happens to be tilted.
   * ...and how far it DUCKS per unit of uphill, which is less: climbing,
   * the camera settling toward the road puts the brow high in the frame,
   * but a camera under the roofline loses the car. Both are 0 for the
   * cameras that already fly well over the terrain. */
  dropLift: number;
  climbDuck: number;
  /** Lateral swing toward the outside of the turn, m per rad/s of yaw rate,
   * so a turn reads in the framing before the drift angle develops, and the
   * most of it a turn can ever buy, m. */
  swing: number;
  swingMax: number;
  /** The swing is sprung rather than eased: natural frequency in rad/s, and
   * the damping ratio. Under 1 the camera OVERSHOOTS the new framing and
   * settles back into it, which is what reads as a heavy thing being swung
   * around — a first-order ease just arrives, and arriving is what makes a
   * distant camera look bolted to the car. Close in, near-critical and
   * quick: at four metres an overshoot is a lurch, not a sway. */
  swingFreq: number;
  swingDamp: number;
  /** Share of the body's suspension travel the camera rides, 0..1 — a
   * touch, so a landing lands in the FRAME too and does not just happen to
   * the car in front of it. Scaled again by `CAMERA_SHAKE.heave`, which is
   * the one dial over how much of the car's own bobbing the outside shot
   * takes at all. */
  heave: number;
  /** Scale on the rattle a blow leaves in the shot (camera-shake.ts, which
   * owns how big one is and which blows an outside camera takes at all —
   * running into something is not one of them). Distance is its own damping:
   * a landing that shudders a bumper cam is barely a wobble from a hundred
   * feet up. */
  shake: number;
  /** How far the camera HOVERS UP over its height when the car has no grip
   * at all, m — the top of the grip read (camera-feel.ts), which is where
   * it stands while the car is flying. Scaled to the rig's height: a metre
   * is a clear lift from six metres behind the car and nothing from twenty
   * above it. */
  hover: number;
  /** Share of the FLIGHT read this rig's rod takes, 0..1 (camera-feel.ts)
   * — how far the boom and the aim swing out of the horizontal to lie
   * along the path of a car that is off the ground. The rigs down behind
   * the car take all of it: they are the ones a fall happens TO, and their
   * whole shot is the road the car is on. The two that already look down
   * from a long way up are most of the way there before the car leaves the
   * ground, so they take a fraction — swinging a lens that is already 20 m
   * over the roof another 60° only points it at the car's own shadow. */
  flight: number;
};

export const CHASE_RIGS: Record<ChaseCamera, ChaseRig> = {
  close: {
    dist: 4.4,
    distPerSpeed: 0.022,
    surge: 1,
    height: 2.55,
    driftWeight: 0.85,
    driftMax: 16,
    followRate: 5,
    fov: 60,
    fovPerSpeed: 0.4,
    fovMax: 88,
    aimAhead: 7.5,
    aimHeight: 0.45,
    aimClimb: 5,
    dropLift: 2.2,
    climbDuck: 1,
    swing: 0.4,
    swingMax: 1.2,
    swingFreq: 6.5,
    swingDamp: 1,
    heave: 0.45,
    shake: 1.15,
    hover: 0.6,
    flight: 1,
  },
  chase: {
    dist: 5.8,
    distPerSpeed: 0.03,
    surge: 1,
    height: 2.45,
    driftWeight: 0.8,
    driftMax: 16,
    followRate: 5,
    fov: 58,
    fovPerSpeed: 0.38,
    fovMax: 86,
    aimAhead: 8.5,
    aimHeight: 0.65,
    aimClimb: 5,
    dropLift: 2.2,
    climbDuck: 1,
    swing: 0.4,
    swingMax: 1.2,
    swingFreq: 6.5,
    swingDamp: 1,
    heave: 0.4,
    shake: 1,
    hover: 0.8,
    flight: 1,
  },
  far: {
    dist: 9.8,
    distPerSpeed: 0.042,
    surge: 0.9,
    height: 3.3,
    driftWeight: 0.75,
    driftMax: 18,
    followRate: 3.8,
    fov: 56,
    fovPerSpeed: 0.3,
    fovMax: 80,
    aimAhead: 11,
    aimHeight: 1,
    aimClimb: 7,
    dropLift: 3.2,
    climbDuck: 1.5,
    swing: 1.1,
    swingMax: 2.4,
    swingFreq: 3.2,
    swingDamp: 0.72,
    heave: 0.3,
    shake: 0.85,
    hover: 1.1,
    flight: 0.95,
  },
  // Standoff and aim are a pair: 10 m up and 18 m back puts the car 29°
  // below the horizontal, and an aim 12 m ahead pitches the shot 17° down,
  // so the car sits three quarters of the way down the frame — the arcade
  // read, flown — with the horizon still inside the top third.
  heli: {
    dist: 18,
    distPerSpeed: 0.07,
    surge: 0.6,
    height: 10,
    driftWeight: 0.9,
    driftMax: 40,
    followRate: 2.4,
    fov: 50,
    fovPerSpeed: 0.16,
    fovMax: 62,
    aimAhead: 12,
    aimHeight: 1.05,
    aimClimb: 4,
    dropLift: 0,
    climbDuck: 0,
    swing: 3.4,
    swingMax: 4.5,
    swingFreq: 1.7,
    swingDamp: 0.5,
    heave: 0,
    shake: 0.35,
    hover: 2.0,
    flight: 0.6,
  },
  // Over the roof, tilted only far enough to see what is coming. The wide
  // fov is what buys that tilt: with the camera almost directly above the
  // car, the car sits ~76° below the horizontal, so a narrow frame has to
  // point nearly straight down to hold it — and straight down is a map,
  // which gives a driver no warning at all. Opening the frame to ~70°
  // lets the shot pitch back to ~57° and still keep the car three quarters
  // down it, which reaches some 45 m of road past the nose.
  top: {
    dist: 4,
    distPerSpeed: 0.05,
    surge: 0.4,
    height: 20,
    driftWeight: 1,
    driftMax: 40,
    followRate: 2.8,
    fov: 68,
    fovPerSpeed: 0.12,
    fovMax: 78,
    aimAhead: 8,
    aimHeight: 0,
    aimClimb: 0,
    dropLift: 0,
    climbDuck: 0,
    swing: 3.8,
    swingMax: 5,
    swingFreq: 1.5,
    swingDamp: 0.45,
    heave: 0,
    shake: 0.3,
    hover: 3.0,
    flight: 0.35,
  },
};

/** How the two other easings are geared off a rig's `followRate`. The drift
 * offset winds ON fast and unwinds SLOWLY — a camera that re-centres the
 * instant a slide ends reads as the game grabbing the wheel — and the
 * standoff and height follow a little behind the yaw. The chase rig's 4.5
 * puts them at 1.6 and 3.0, which is the frame the other five are judged
 * against. */
