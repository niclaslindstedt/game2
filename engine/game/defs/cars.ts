// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car catalog. Content is authored as data so new cars are rows here,
// not physics edits: the handling model in car.ts reads these numbers and
// nothing else differs between the catalog's cars except them. Speeds are
// m/s, accelerations m/s², angles radians.
//
// The roster is three ANSWERS to the same stage, not three points on one
// scale — which is the whole reason the drivetrain became real physics
// (TUNING.drivetrain) instead of a label. A front-driver that hooks up out
// of slow corners, holds the most grip on tarmac and hates being sideways;
// a rear-driver that steps its tail out on the throttle from walking pace
// and pays for it with grip, gearing and every loose-surface launch; a
// four-wheel-drive that puts its torque down wherever it is pointed, runs
// the tall gear, and is far too heavy for a hairpin. Each one owns a KIND
// of stage and none of them owns all three — `npm run sim -- --sweep` is
// what proves it, and it is what any change to these numbers owes.
//
// Nominal gear tops overshoot what drag lets a car actually hold: against
// TUNING.surfaces.drag every car levels out a few m/s under its final
// gear's ceiling on flat gravel.

import { TUNING } from "./tuning.ts";

/** Which box the driver is being handed. Not a property of the CAR: every
 * car in the roster can be driven either way, and which one is a player
 * setting carried on `CarState.gearbox` for the run. */
export type GearboxMode = "auto" | "manual";

/** Which wheels the engine drives — real physics, not a label. It selects a
 * row of TUNING.drivetrain, and that row decides whether the throttle
 * deepens a slide or pulls the car straight out of it, whether a lift
 * rotates the car, how readily torque alone breaks traction, where the
 * slide starts, how fast it lets go, and how much of the engine reaches
 * the ground on a loose surface. */
export type DriveLayout = "fwd" | "rwd" | "awd";

/** The tire compound the car sits on, as grip multipliers against the
 * surface's own. A sealed-road tire holds more on tarmac and skates over
 * gravel; a loose-surface tire is the other way round. The two multiply, so
 * the wrong car on the wrong surface is a genuine handicap and neither is
 * ever simply better. */
export type TyreSpec = {
  /** On asphalt. */
  sealed: number;
  /** On gravel, open nature, and through water. */
  loose: number;
};

export type CarSpec = {
  id: string;
  name: string;
  /** One line of billing, for the menu that asks the player to choose one.
   * It says HOW THE CAR IS DRIVEN — which pedal rotates it and which one
   * straightens it — because that is the thing a player cannot see from the
   * shape on the stand and the thing that actually changes between the
   * three. The block comment above each row says why the numbers under it
   * are what they are, which is a different question and far too long to
   * put on a card.
   *
   * The roster is ordered EASIEST FIRST, and the blurbs read as a ladder
   * with it: the hatch straightens itself out of trouble, the
   * four-wheel-drive goes where it is pointed, and the rear-driver holds a
   * slide on the throttle and has to be caught. */
  blurb: string;
  drive: DriveLayout;
  /** Kerb mass, kg — what the car WEIGHS. Read against
   * TUNING.collision.refMass: a heavier car is harder for a clipped tree
   * to spin, folds deeper into what it hits, and rides its springs more
   * slowly. It is deliberately not in the longitudinal model: gearAccel is
   * already an acceleration, so making mass divide it twice would just
   * make the heavy car slow. */
  mass: number;
  /** Top speed of each gear, m/s — the last entry is the car's top speed. */
  gearTop: number[];
  /** Peak longitudinal acceleration per gear, m/s². */
  gearAccel: number[];
  /** WHERE inside each gear that acceleration lives. Over 1 is a torquey
   * engine that shoves off the bottom of the gear and runs out of puff
   * near the top; under 1 is peaky and wants revs. The curve pivots around
   * mid-gear (TUNING.engine.torqueSpan), so this moves the pull around
   * without adding any — and it is the same number that decides how hard
   * the driven axle can spin itself up, which is how a torquey rear-driver
   * gets sideways at walking pace. */
  torque: number;
  /** How well the driven wheels put that torque DOWN, against the surface
   * and the layout's own bite (TUNING.drivetrain[drive].bite). Under 1 and
   * a loose-surface launch is wheelspin; over 1 and the car simply goes. */
  traction: number;
  /** Braking deceleration, m/s². */
  brake: number;
  /** Base steering yaw authority at low speed, rad/s. */
  steerRate: number;
  /** How quickly that authority bleeds off with SPEED — straight-line
   * composure. Over 1 is a car that calms down at pace (and is lazy to
   * turn in with it); under 1 stays sharp and stays nervous. This is the
   * knob that decides whether a stage of long fast sweepers suits a car or
   * frightens it. */
  stability: number;
  /** Lateral acceleration the tires can hold before the car starts to
   * slide, m/s² — the whole drift-entry threshold, since a slide is just a
   * turn the tires cannot pay for. It is also the base of the TRACTION
   * CEILING (×`TUNING.grip.latCeiling`), so it decides how hard the car
   * corners as well as when it lets go: move it and both change. To separate
   * them, reach for the layout's `entry`/`depth` or the car's
   * `gripLat`/`driftLat` instead. */
  gripAccel: number;
  /** The rubber that holds it, per surface family. */
  tyres: TyreSpec;
  /** Lateral grip while gripping: how fast the velocity swings back behind
   * the nose, 1/s. */
  gripLat: number;
  /** Lateral grip once fully sliding — low keeps the car sideways, 1/s. */
  driftLat: number;
  /** Extra yaw authority while sliding (the car rotates under you), rad/s.
   * Multiplied by HOW FAR the slide has developed (`limits.ts`'s
   * `askedSlide`), so it and the layout's `depth` are one number in the
   * car: this is how briskly the car rotates when it is loose, that is how
   * loose it gets, and the product is the line it holds. They are worth
   * keeping apart — a car can be pointy without hanging its tail out, and
   * that is exactly the difference between the hatch and the saloon. When
   * a layout's `depth` moves, this moves the other way to keep the line,
   * or the car simply stops getting round the corner. */
  driftYaw: number;
  /** Body color for the renderer (hex) — palette lives with the car. */
  color: number;
  accent: number;
};

export const CARS: CarSpec[] = [
  {
    // THE HATCH — an upright late-70s two-box, front-driven, on road
    // rubber. Small peaky engine that makes everything it has at the top of
    // the gear: keep it in the band and it flies, bog it out of a hairpin
    // and it is nowhere. The shortest gearing and nearly the lowest top
    // speed in the roster, paid back as the most lateral grip on a sealed
    // surface and the sharpest turn-in of the three. It understeers up to
    // the limit and pulls itself straight again the moment the power goes
    // down, so it is rotated on the LIFT, never on the throttle. The
    // tarmac stage is its day out; a loose, open, fast one is not.
    id: "compact",
    name: "Vireo GT",
    blurb:
      "EASIEST — washes wide if you only steer. Turn in on the brake or the handbrake; the throttle then pulls it straight",
    drive: "fwd",
    mass: 1020,
    gearTop: [12, 20, 28, 38, 49, 62],
    // gearAccel[4] holds clear headroom over drag at 0.94·gearTop[4], or
    // the auto box parks just under its own upshift threshold forever.
    gearAccel: [11.8, 10.4, 8.8, 6.8, 5.2, 3.2],
    torque: 0.85,
    traction: 1.05,
    brake: 19.5,
    steerRate: 2.75,
    stability: 1.0,
    gripAccel: 16.4,
    tyres: { sealed: 1.16, loose: 0.9 },
    gripLat: 8.6,
    driftLat: 2.6,
    driftYaw: 2.2,
    color: 0x1f6fde,
    accent: 0xffffff,
  },
  {
    // THE WORKS SEDAN — a four-door Group A turbo car with drive to all of
    // it. Heaviest, most powerful, tallest-geared and
    // the only car that puts its torque down whatever it is standing on, so
    // the long open stage, the climb and the wet one are all its. What it
    // pays is agility: the mass and the composure that keep it calm at
    // 230 km/h make it lazy to turn in, and a stage of hairpins belongs to
    // the two lighter cars. It slides neutrally when asked and gathers
    // itself up on its own — never as playful as the rear-driver, never as
    // pointy as the hatch, and quicker than both wherever the road opens.
    id: "coupe",
    name: "Kestrel RS",
    blurb:
      "IN BETWEEN — four driven wheels, so point it and go. Slides a little on the power and gathers itself up",
    drive: "awd",
    mass: 1300,
    gearTop: [13, 22, 31, 42, 55, 72],
    gearAccel: [10.8, 9.4, 9.4, 9.6, 8.2, 5.6],
    torque: 0.9,
    traction: 1.12,
    brake: 20,
    steerRate: 2.45,
    stability: 1.08,
    gripAccel: 15.6,
    tyres: { sealed: 1.03, loose: 1.02 },
    gripLat: 8.0,
    driftLat: 2.15,
    driftYaw: 2.45,
    color: 0xc8352b,
    accent: 0xf2efe6,
  },
  {
    // THE SALOON — a light three-box 1600 from the end of the sixties,
    // rear-driven, on skinny tires. The least powerful and the lowest-geared
    // car here, and it does not care: the engine is flexible enough to
    // light the rear axle up at walking pace, so it is the one car that
    // will hang its tail out at 10 km/h and the one that turns a tight
    // gravel stage into a series of drifts. What it pays is grip and
    // composure — it has the least of both, it spins its wheels off the
    // line on anything loose, and a fast open stage exposes every bit of
    // that.
    id: "classic",
    name: "Sable 1600",
    blurb:
      "HARDEST — the tail steps out on the throttle at any speed. Hold the slide on the power, catch it on opposite lock",
    drive: "rwd",
    mass: 1080,
    gearTop: [11, 18, 26, 35, 45, 57],
    gearAccel: [15.0, 13.0, 11.0, 9.2, 6.2, 3.0],
    torque: 1.12,
    traction: 0.85,
    brake: 18.5,
    steerRate: 2.7,
    stability: 0.9,
    gripAccel: 16.4,
    tyres: { sealed: 0.94, loose: 1.04 },
    gripLat: 8.4,
    driftLat: 1.85,
    driftYaw: 2.85,
    color: 0xd8342c,
    accent: 0xf4e9d0,
  },
];

export function carById(id: string): CarSpec {
  const car = CARS.find((c) => c.id === id);
  if (!car) throw new Error(`unknown car: ${id}`);
  return car;
}

/** The catalog row as the chosen BOX delivers it — the spec a run actually
 * drives (`GameState.spec`), and the one the pre-race card quotes.
 *
 * The gearbox is the driver's, not the car's, so it cannot be a column in
 * `CARS`; folding it in here is what makes it a decision with a number on
 * it instead of a label. The manual's taller ratios and its lower losses
 * (TUNING.gearbox.set) become gearing and acceleration, and every reader
 * downstream — car.ts's shift points and taper, the bot's target speed, the
 * rev counter, the engine note, car-stats.ts — sees one spec and needs to
 * know nothing about transmissions.
 *
 * The catalog row is returned untouched when the box asks for nothing, so
 * the automatic drives the numbers as authored. */
export function gearedSpec(spec: CarSpec, gearbox: GearboxMode): CarSpec {
  const box = TUNING.gearbox.set[gearbox];
  if (box.gearing === 1 && box.power === 1) return spec;
  return {
    ...spec,
    gearTop: spec.gearTop.map((top) => top * box.gearing),
    gearAccel: spec.gearAccel.map((accel) => accel * box.power),
  };
}
