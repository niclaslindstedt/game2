// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car catalog. Content is authored as data so new cars are rows here,
// not physics edits: the handling model in car.ts reads these numbers and
// nothing else differs between the two launch cars except them (and the
// gearbox mode). Speeds are m/s, accelerations m/s², angles radians.

export type GearboxMode = "auto" | "manual";

export type CarSpec = {
  id: string;
  name: string;
  gearbox: GearboxMode;
  /** Top speed of each gear, m/s — the last entry is the car's top speed. */
  gearTop: number[];
  /** Peak longitudinal acceleration per gear, m/s². */
  gearAccel: number[];
  /** Braking deceleration, m/s². */
  brake: number;
  /** Base steering yaw authority at low speed, rad/s. */
  steerRate: number;
  /** Lateral grip while gripping: how fast sideways speed bleeds off, 1/s. */
  gripLat: number;
  /** Lateral grip while drifting — low keeps the car sliding, 1/s. */
  driftLat: number;
  /** Extra yaw authority while drifting (the car rotates under you), rad/s. */
  driftYaw: number;
  /** Slip angle that starts a drift when committed to a turn, radians. */
  driftEnter: number;
  /** Slip angle under which a drift ends, radians. */
  driftExit: number;
  /** Speed boost per second of clean drift, m/s (capped in tuning). */
  driftBoostRate: number;
  /** Body color for the renderer (hex) — palette lives with the car. */
  color: number;
  accent: number;
};

export const CARS: CarSpec[] = [
  {
    // The forgiving starter: automatic box, quick off the line, softer top
    // end, grippier — the car you hand someone on a phone.
    id: "compact",
    name: "Vireo GT (auto)",
    gearbox: "auto",
    gearTop: [13, 21, 30, 38, 46],
    gearAccel: [11.5, 10, 8, 5.8, 3.7],
    brake: 16,
    steerRate: 2.6,
    gripLat: 8.5,
    driftLat: 2.0,
    driftYaw: 1.9,
    driftEnter: 0.2,
    driftExit: 0.1,
    driftBoostRate: 2.0,
    color: 0x1f6fde,
    accent: 0xffffff,
  },
  {
    // The reward car: manual box, taller gearing, looser rear — faster in
    // hands that can keep it sideways and keep it in gear.
    id: "classic",
    name: "Sable 4WD (manual)",
    gearbox: "manual",
    gearTop: [12, 20, 29, 37, 46, 54],
    gearAccel: [13, 11, 9, 6.8, 4.8, 3.1],
    brake: 17,
    steerRate: 2.5,
    gripLat: 7.5,
    driftLat: 1.75,
    driftYaw: 2.2,
    driftEnter: 0.18,
    driftExit: 0.1,
    driftBoostRate: 2.6,
    color: 0xd8342c,
    accent: 0xf4e9d0,
  },
];

export function carById(id: string): CarSpec {
  const car = CARS.find((c) => c.id === id);
  if (!car) throw new Error(`unknown car: ${id}`);
  return car;
}
