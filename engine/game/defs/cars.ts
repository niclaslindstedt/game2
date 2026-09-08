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
  /** WHERE THAT MASS SITS. Two jobs: what separates the cars once they are
   * OVER (`roll-hull.ts`, through `massSpread`), and — through
   * `driveLoadOf` — HOW MUCH OF THE CAR IS STANDING ON THE WHEELS THAT
   * DRIVE IT, which is what separates the three layouts' traction and how
   * a hill moves it. A car on its springs is still kept flat on purpose;
   * what these two feed is the LOAD, not the lean.
   *
   * The share of the weight over the FRONT axle, 0..1. An engine ahead of
   * the front wheels puts it well past half; a rear-driver with its engine
   * behind the axle line sits near it. Read by the roll as how far ahead
   * of the wheelbase's middle the weight is: the nose corner is that much
   * nearer, the tail corner that much further, so a nose-heavy car goes
   * over its nose more readily and is spun about its tail by the ground. */
  balance: number;
  /** ...and how high it rides over the wheel plane, m. A tall two-box on
   * its springs carries it higher than a low coupe; a caged rally car a
   * little higher again. The lever every contact and the friction turn
   * the body on, and the climb to the sill corner a trip has to pay —
   * a hand's breadth here is the difference between a car that lurches
   * and one that goes over. */
  centreHeight: number;
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
  /** WHAT THE AIR MAKES OF THE SHAPE, once the wheels are off the ground
   * (`game/aero.ts`). Nothing here is felt on the road — the surface owns
   * the rolling drag and the gearing owns the top end — and everything
   * here is felt in a flight, which is where the body stops being a thing
   * that goes THROUGH the air and becomes a thing the air holds up.
   *
   * Measured off the drawn body (`pwa/src/game/car-styles.ts`), the way
   * the collision box is; `tests/car_geometry_test.ts` holds both there. */
  aero: {
    /** How slippery the shape is, as a multiplier on the reference box's
     * faces (`TUNING.air.aero`). An upright two-box pushes more air than a
     * low four-door of the same frontal area, and neither is far off 1 —
     * the BOX is most of what the air meets, and the panelwork is trim. */
    slip: number;
    /** THE REAR WING'S blade, m² of plan area — span times chord off the
     * `spoiler` on the drawn body, and 0 for a car that has none. It is
     * the one part of the car whose whole job is the air: it makes
     * downforce out of the flow running along the car, and it is a flat
     * plate to the flow coming up through it in a fall. */
    wing: number;
    /** ...and how far BEHIND THE WEIGHT that blade acts, m. The lever is
     * the whole point of it: a force at the tail is a moment about the
     * middle, and that moment is what points the nose. Measured from the
     * wing's own station to where `balance` puts the weight along the
     * wheelbase. */
    wingArm: number;
  };
  /** Body color for the renderer (hex) — palette lives with the car. */
  color: number;
  accent: number;
};

export const CARS: CarSpec[] = [
  {
    // THE HATCH — an upright late-70s two-box, front-driven, on road
    // rubber. Small peaky engine that makes everything it has at the top of
    // the gear: keep it in the band and it flies, bog it out of a hairpin
    // and it is nowhere. A hot hatch's close-ratio five-speed under it, so
    // the shortest first gear here and the second-lowest top speed, paid back
    // as the most lateral grip on a sealed
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
    // Engine and box ahead of the front axle, and a tall two-box shell on
    // soft springs: the most nose-heavy and the highest weight of the three.
    balance: 0.63,
    centreHeight: 0.54,
    // A hot hatch's close-ratio FIVE-SPEED — 3.45 / 2.12 / 1.44 / 1.13 /
    // 0.91 on a 3.94 final drive, 175/70 R13 (1.807 m round), taken to
    // 6500 rpm. Every figure is that arithmetic and nothing else:
    // rpm/60 × circumference ÷ (gear × final). Fifth's 54.6 m/s is
    // 197 km/h on paper and an overdrive in fact — the car runs out of
    // breath at 183, which is what a period road test would have printed.
    gearTop: [14.4, 23.4, 34.5, 44.0, 54.6],
    // ...and the pull is the same ratios read the other way round: torque
    // × gear × final ÷ (wheel radius × mass), one scale for the roster.
    // Every gear multiplies the engine less than the one below it, so the
    // ladder falls away steeply — which is the whole reason the top of a
    // gear feels like the top of a gear, and why `gearbox.upAt` has to
    // take the next one before the taper has eaten this one.
    gearAccel: [11.8, 7.25, 4.93, 3.86, 3.11],
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
    // THE AIR: an upright two-box that pushes more of it than its frontal
    // area suggests, and a roof lip at the top of the tailgate — 1.24 m
    // across by 0.17 deep, so barely a wing at all. It trims the nose a
    // fraction of a degree on a jump and nothing that can be felt.
    aero: { slip: 1.05, wing: 0.21, wingArm: 1.64 },
    color: 0x1f6fde,
    accent: 0xffffff,
  },
  {
    // THE WORKS SEDAN — a four-door Group A turbo car with drive to all of
    // it. Heaviest, most powerful, tallest-geared and the only car that
    // puts its torque down whatever it is standing on, so the long open
    // stage, the climb and the wet one are all its. What it pays is
    // agility: the mass and the composure that keep it calm at
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
    // A longitudinal turbo four over the front axle with the transfer box
    // behind it: nose-heavy, but a low, wide four-door carries it lowest.
    balance: 0.58,
    centreHeight: 0.49,
    // A Group A turbo four-door's FIVE-SPEED — 3.62 / 2.08 / 1.36 / 1.00 /
    // 0.83 on a 3.62 final drive, geared to 22.24 mph per 1000 rpm in
    // fifth and taken to 6500. The longest ladder here by a distance, and
    // the only one whose top gear is a top speed rather than an overdrive.
    gearTop: [14.8, 25.8, 39.4, 53.6, 64.6],
    // Half again the torque of anything else here, through the tallest
    // gearing: the biggest first-gear shove in the roster and, five gears
    // later, still the most left at the far end of the road.
    gearAccel: [14.26, 8.19, 5.36, 3.94, 3.27],
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
    // THE AIR: the slipperiest shape in the roster — a low four-door drawn
    // as one — carrying a flat lip on the boot edge and no wing to speak
    // of. It flies the way it drives: level, and about its own business.
    aero: { slip: 0.95, wing: 0.1, wingArm: 2.16 },
    color: 0xc8352b,
    accent: 0xf2efe6,
  },
  {
    // THE SALOON — a light three-box 1600 from the end of the sixties,
    // rear-driven, on skinny tires. The least powerful car here and the
    // slowest flat out, on the only FOUR-speed in the roster — and it does
    // not care: the engine is flexible enough to light the rear axle up at
    // walking pace, so it is the one car that
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
    // Front engine, rear drive, a light three-box: the most even of the
    // roster, carried at a sixties saloon's height.
    balance: 0.53,
    centreHeight: 0.51,
    // A sixties saloon's FOUR-SPEED — 2.972 / 2.010 / 1.397 / 1.000 direct
    // top on a 3.777 axle, 175/70 R13, taken to 6500 rpm. Four gears where
    // the other two have five, so every one of them is a long one and the
    // box is never the thing the driver is busy with.
    gearTop: [17.4, 25.8, 37.1, 51.8],
    // The least torque in the roster through the lowest-multiplying box,
    // so the least shove anywhere: what this car has instead of pace is
    // rotation, and the tail is lit by the rear axle's own share of the
    // grip rather than by an engine that out-muscles it.
    gearAccel: [9.34, 6.31, 4.39, 3.14],
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
    // THE AIR, AND THE WING. The one car in the roster with a real blade on
    // it — 1.7 m across by half a metre deep, on posts over the tailgate,
    // and nearly two metres behind where the weight sits. That lever is
    // what makes it the only car whose ATTITUDE the air decides: it lifts
    // its nose several degrees over a big jump, and in a long fall the
    // same blade works the other way and pitches it over onto its nose.
    aero: { slip: 1.0, wing: 0.85, wingArm: 1.87 },
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
    // A TALLER GEAR PULLS LESS, and the box does not get that for nothing:
    // the ratio that carries each gear `gearing` further multiplies the
    // engine by exactly that much less on the way, so the thrust at any
    // given speed comes down by the same factor the ceiling went up. What
    // the racing set gives back is `power` — a dry clutch where the road
    // box has a converter slurring the bottom of every gear away — and it
    // is deliberately a percent short of the gearing, so the manual is a
    // TRADE: six per cent more road at the top of each gear, one per cent
    // less shove everywhere, and a cut of throttle at every change.
    //
    // Left as `× power` alone this was six per cent of free thrust, and on
    // a catalog whose ladders fall away with their own ratios that made
    // the racing set quicker to 100 km/h as well as faster flat out — a
    // box with no downside, which is not a choice.
    gearAccel: spec.gearAccel.map((accel) => (accel * box.power) / box.gearing),
  };
}
