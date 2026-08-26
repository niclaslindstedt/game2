// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car catalog. Content is authored as data so new cars are rows here,
// not physics edits: the handling model in car.ts reads these numbers and
// nothing else differs between the two launch cars except them (and the
// gearbox mode). Speeds are m/s, accelerations m/s², angles radians.
// Nominal gear tops overshoot what drag lets a car actually hold: against
// TUNING.surfaces.drag the classic levels out around 64 m/s (230 km/h)
// and the compact around 59 m/s (214 km/h) on flat gravel.

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
  /** Lateral acceleration the tires can hold before the car starts to
   * slide, m/s² — the whole drift-entry threshold, since a slide is just a
   * turn the tires cannot pay for. */
  gripAccel: number;
  /** Lateral grip while gripping: how fast the velocity swings back behind
   * the nose, 1/s. */
  gripLat: number;
  /** Lateral grip once fully sliding — low keeps the car sideways, 1/s. */
  driftLat: number;
  /** Extra yaw authority while sliding (the car rotates under you), rad/s. */
  driftYaw: number;
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
    gearTop: [13, 21, 30, 40, 52, 65],
    // gearAccel[4] holds clear headroom over drag at 0.94·gearTop[4], or
    // the auto box parks just under its own upshift threshold forever.
    gearAccel: [11.5, 10, 8.4, 6.6, 5.6, 3.6],
    brake: 18,
    steerRate: 2.6,
    gripAccel: 16,
    gripLat: 8.5,
    driftLat: 2.2,
    driftYaw: 1.5,
    color: 0x1f6fde,
    accent: 0xffffff,
  },
  {
    // The reward car: manual box, taller gearing, less grip to lean on —
    // faster in hands that can keep it flowing and keep it in gear.
    id: "classic",
    name: "Sable 4WD (manual)",
    gearbox: "manual",
    gearTop: [12, 20, 29, 39, 52, 70],
    gearAccel: [13, 11, 9.2, 7.2, 5.4, 3.8],
    brake: 19,
    steerRate: 2.5,
    gripAccel: 14,
    gripLat: 7.5,
    driftLat: 1.9,
    driftYaw: 1.8,
    color: 0xd8342c,
    accent: 0xf4e9d0,
  },
];

export function carById(id: string): CarSpec {
  const car = CARS.find((c) => c.id === id);
  if (!car) throw new Error(`unknown car: ${id}`);
  return car;
}
