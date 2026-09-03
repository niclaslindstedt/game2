// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R44 — THE TRAFFIC, as data: what is driving the public roads while the
// stage is run, and how it drives. Twenty vehicles because a road with the
// same three cars on it reads as a loop, and one with a timber lorry, a
// camper, a school bus and a courier's van reads as a Tuesday.
//
// The engine owns the NUMBERS here — a vehicle's footprint is its collision
// capsule, its mass is what a contact with it costs the player — and the
// renderer owns the LOOK, keyed by `body`: `pwa/src/game/traffic-fleet.ts`
// builds each silhouette from the same row, so the box the player hits is
// the box they can see.

/** The silhouettes the renderer can build. A body is an ARRANGEMENT — a
 * cab and a load, a cabin and a deck — and two rows may share one at
 * different sizes: a city car and a family hatch are both `hatch`. */
export type TrafficBody =
  | "hatch"
  | "saloon"
  | "estate"
  | "suv"
  | "pickup"
  | "van"
  | "minibus"
  | "camper"
  | "bus"
  | "boxTruck"
  | "timber"
  | "tanker"
  | "artic"
  | "tipper";

export type TrafficModel = {
  id: string;
  name: string;
  body: TrafficBody;
  /** Overall length and width, m — the collision capsule's — and the
   * roofline height, m, which the renderer builds to. */
  length: number;
  width: number;
  height: number;
  /** Kerb mass, kg. What a contact with it costs the player: the two-body
   * exchange in `collideCars` weighs both sides, so a hatchback is shoved
   * aside and an artic is a wall that moves. */
  mass: number;
  /** How much of the posted limit this one cruises at, 0..1. Nobody here
   * speeds — the whole point is that they are driving the limit — but a
   * loaded lorry sits under it, and a camper never sees it. */
  cruise: number;
  /** How often it turns up, as a weight against the rest of the roster. */
  weight: number;
};

/** The roster. Sizes are a real vehicle's, rounded to what a box reads as
 * at forty metres. Masses are kerb weights, loaded for the lorries. */
export const TRAFFIC_MODELS: readonly TrafficModel[] = [
  {
    id: "city",
    name: "City car",
    body: "hatch",
    length: 3.6,
    width: 1.65,
    height: 1.48,
    mass: 950,
    cruise: 0.98,
    weight: 1.2,
  },
  {
    id: "hatch",
    name: "Family hatch",
    body: "hatch",
    length: 4.05,
    width: 1.75,
    height: 1.46,
    mass: 1200,
    cruise: 1,
    weight: 1.6,
  },
  {
    id: "saloon",
    name: "Saloon",
    body: "saloon",
    length: 4.7,
    width: 1.8,
    height: 1.45,
    mass: 1450,
    cruise: 1,
    weight: 1,
  },
  {
    id: "old-saloon",
    name: "Old brick saloon",
    body: "saloon",
    length: 4.85,
    width: 1.72,
    height: 1.44,
    mass: 1350,
    cruise: 0.94,
    weight: 0.8,
  },
  {
    id: "estate",
    name: "Estate",
    body: "estate",
    length: 4.8,
    width: 1.82,
    height: 1.5,
    mass: 1550,
    cruise: 1,
    weight: 1.3,
  },
  {
    id: "old-estate",
    name: "Old estate",
    body: "estate",
    length: 4.9,
    width: 1.75,
    height: 1.47,
    mass: 1400,
    cruise: 0.95,
    weight: 0.8,
  },
  {
    id: "suv",
    name: "SUV",
    body: "suv",
    length: 4.7,
    width: 1.92,
    height: 1.78,
    mass: 2000,
    cruise: 1,
    weight: 1.1,
  },
  {
    id: "crossover",
    name: "Crossover",
    body: "suv",
    length: 4.35,
    width: 1.82,
    height: 1.62,
    mass: 1500,
    cruise: 1,
    weight: 1,
  },
  {
    id: "pickup",
    name: "Pickup",
    body: "pickup",
    length: 5.3,
    width: 1.92,
    height: 1.85,
    mass: 2150,
    cruise: 0.98,
    weight: 1,
  },
  {
    id: "van",
    name: "Panel van",
    body: "van",
    length: 5.0,
    width: 1.95,
    height: 2.0,
    mass: 2050,
    cruise: 0.98,
    weight: 1.1,
  },
  {
    id: "high-van",
    name: "High-roof van",
    body: "van",
    length: 5.9,
    width: 2.05,
    height: 2.55,
    mass: 2600,
    cruise: 0.96,
    weight: 0.8,
  },
  {
    id: "minibus",
    name: "Minibus",
    body: "minibus",
    length: 5.9,
    width: 2.0,
    height: 2.35,
    mass: 2900,
    cruise: 0.95,
    weight: 0.6,
  },
  {
    id: "camper",
    name: "Camper",
    body: "camper",
    length: 6.2,
    width: 2.2,
    height: 2.95,
    mass: 3400,
    cruise: 0.88,
    weight: 0.5,
  },
  {
    id: "bus",
    name: "Country bus",
    body: "bus",
    length: 12.0,
    width: 2.5,
    height: 3.25,
    mass: 12500,
    cruise: 0.9,
    weight: 0.35,
  },
  {
    id: "box-truck",
    name: "Box lorry",
    body: "boxTruck",
    length: 7.6,
    width: 2.3,
    height: 3.3,
    mass: 6500,
    cruise: 0.92,
    weight: 0.6,
  },
  {
    id: "courier",
    name: "Courier box van",
    body: "boxTruck",
    length: 6.4,
    width: 2.1,
    height: 2.9,
    mass: 3800,
    cruise: 0.98,
    weight: 0.5,
  },
  {
    id: "timber",
    name: "Timber lorry",
    body: "timber",
    length: 9.8,
    width: 2.5,
    height: 3.6,
    mass: 18000,
    cruise: 0.85,
    weight: 0.4,
  },
  {
    id: "tanker",
    name: "Tanker",
    body: "tanker",
    length: 9.2,
    width: 2.5,
    height: 3.4,
    mass: 16000,
    cruise: 0.86,
    weight: 0.3,
  },
  {
    id: "artic",
    name: "Articulated lorry",
    body: "artic",
    length: 16.5,
    width: 2.5,
    height: 4.0,
    mass: 30000,
    cruise: 0.85,
    weight: 0.3,
  },
  {
    id: "tipper",
    name: "Tipper",
    body: "tipper",
    length: 8.0,
    width: 2.5,
    height: 3.2,
    mass: 15000,
    cruise: 0.9,
    weight: 0.4,
  },
];

/** How the traffic drives. Coarse on purpose: a motorist on a public road
 * is a thing that keeps its lane, keeps its distance and keeps to the
 * limit, and everything here is one of those three. */
export const TRAFFIC = {
  /** How much traffic there is: vehicles per kilometre of LANE (each road
   * counts twice, once per direction), and a ceiling on the fleet — the
   * whole thing is n² against itself every step. */
  perKm: 1.5,
  most: 36,
  /** Longitudinal authority, m/s²: pulling away, an ordinary stop, and the
   * stop a driver makes for something in the road. */
  accel: 1.6,
  brake: 3.5,
  panic: 8,
  /** The gap kept to whatever is ahead in the lane, m: a standing gap plus
   * a time headway at speed. Under the standing gap the driver stops. */
  gap: { stand: 5, headway: 1.6 },
  /** How far ahead the lane is read for a car to give way to, m, and how
   * far either side of the lane's centre a thing has to be to count. */
  look: 70,
  laneHalf: 2.4,
  /** The lateral acceleration a motorist holds through a bend, m/s² —
   * what caps the speed into a junction turn. */
  latAccel: 2.2,
  /** How far ahead a bend is read for, s of travel. */
  bendLook: 2,
  /** RECOVERY. The vehicle is kinematic on its lane and only ever leaves it
   * by being hit; these are the time constants, s, on which it settles back
   * — the body's slide and spin bleeding off, and the pose being drawn back
   * onto the lane. */
  settle: { slide: 0.35, spin: 0.4, heading: 0.7, lane: 1.4 },
  /** A contact that changes a motorist's velocity by more than this, m/s,
   * ends their journey where they stand: they pull up and stay pulled up,
   * and the traffic behind them queues. */
  wreckSpeed: 5,
  /** SPAWNING. A vehicle appears at a route's start only when that much
   * lane is clear ahead of it, m, and — where the start is somewhere the
   * player can see (a town, a car park, the tape across the closed road)
   * — only when the player is further off than `popClear`, m. A road that
   * leaves the map starts past the fog and needs no such care. Both ends
   * of a journey are held to the same rule. */
  spawnClear: 60,
  popClear: 170,
  /** Seconds between spawn attempts, and how long a wreck stays on the
   * road once nobody can see it. */
  spawnEvery: 0.6,
  wreckLingers: 20,
  /** How many arrived or wrecked vehicles may stand waiting to be out of
   * sight before the longest-standing one goes anyway. */
  parked: 6,
} as const;
