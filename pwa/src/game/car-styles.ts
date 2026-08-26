// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cars' LOOKS: one CarBodySpec per catalog car, keyed by id. Handling
// numbers live in engine/game/defs/cars.ts; this file only shapes and
// colors the meshes. Pure data — no three.js import — so Node tooling
// (scripts/car-preview.mjs) can load it too.
//
// Two silhouettes ship: a short, tall, boxy rally hatchback for the
// starter car, and a longer, lower, big-winged coupe for the reward car —
// the classic small-car/big-car arcade rally pairing. Each carries its own
// pillar widths, because how much METAL frames the glass is most of what
// separates a hatch greenhouse from a coupe one.

import type { CarSpec } from "@engine";
import type { CarBodySpec } from "./car-body.ts";

/** The starter: compact hatchback — stubby hood, upright glass, tall
 * hatch tail with a lip spoiler, boxy flares. Reads small and eager. */
export const COMPACT_BODY: CarBodySpec = {
  profile: [
    { z: 1.89, topY: 0.64, half: 0.64 },
    { z: 1.68, topY: 0.78, half: 0.8 },
    { z: 0.66, topY: 0.84, half: 0.84 },
    { z: -1.3, topY: 0.88, half: 0.84 },
    { z: -1.7, topY: 1.06, half: 0.8 },
    { z: -1.89, topY: 0.98, half: 0.73 },
  ],
  floorY: 0.33,
  beltY: 0.66,
  wheelbase: 2.4,
  axleShift: 0.05,
  trackHalf: 0.73,
  wheelRadius: 0.33,
  wheelWidth: 0.26,
  wheelSpokes: 5,
  cabin: {
    cowlZ: 0.62,
    roofFrontZ: 0.3,
    roofRearZ: -1.0,
    baseRearZ: -1.5,
    roofY: 1.4,
    roofHalf: 0.64,
    roofPaint: "accent",
    // Thick posts and a small kicked-up quarter light: the hot-hatch
    // greenhouse, upright and heavily framed.
    pillars: {
      a: 0.12,
      b: 0.12,
      c: 0.28,
      sill: 0.07,
      header: 0.05,
      split: 0.43,
      quarterRise: 0.05,
    },
  },
  flare: { extra: 0.055, length: 0.85 },
  spoiler: { kind: "lip", z: -1.72, y: 1.1, span: 1.24 },
  stripes: { offsets: [-0.22, 0.22], width: 0.14, zFrom: 1.75, zTo: 0.72 },
  colors: { paint: 0x1f6fde, accent: 0xffffff, glass: 0x7e9fc7, hub: 0xf0ede2 },
};

/** The reward: bigger rally coupe — long hood, raked screen, low roof,
 * high tail deck carrying the full wing. Reads planted and fast. */
export const CLASSIC_BODY: CarBodySpec = {
  profile: [
    { z: 2.21, topY: 0.58, half: 0.66 },
    { z: 2.0, topY: 0.72, half: 0.84 },
    { z: 0.55, topY: 0.82, half: 0.9 },
    { z: -1.45, topY: 0.86, half: 0.89 },
    { z: -2.05, topY: 0.92, half: 0.82 },
    { z: -2.21, topY: 0.84, half: 0.74 },
  ],
  floorY: 0.34,
  beltY: 0.68,
  wheelbase: 2.62,
  axleShift: 0.08,
  trackHalf: 0.77,
  wheelRadius: 0.35,
  wheelWidth: 0.28,
  wheelSpokes: 6,
  cabin: {
    cowlZ: 0.55,
    roofFrontZ: 0.02,
    roofRearZ: -0.9,
    baseRearZ: -1.6,
    roofY: 1.27,
    roofHalf: 0.64,
    // A long door glass ahead of a heavy fastback C-pillar — the coupe
    // reads rear-heavy even at a glance.
    pillars: {
      a: 0.13,
      b: 0.11,
      c: 0.28,
      sill: 0.06,
      split: 0.55,
      quarterRise: 0.045,
    },
  },
  flare: { extra: 0.06, length: 0.95 },
  spoiler: { kind: "wing", z: -2.02, y: 1.14, span: 1.5, chord: 0.34 },
  stripes: { offsets: [0], width: 0.34, zFrom: 2.05, zTo: 0.55 },
  colors: { paint: 0xd8342c, accent: 0xf4e9d0, glass: 0x7e9fc7, hub: 0xe8e4d6 },
};

export const CAR_BODIES: Record<string, CarBodySpec> = {
  compact: COMPACT_BODY,
  classic: CLASSIC_BODY,
};

/** Body spec for a catalog car; unknown ids fall back to the compact
 * silhouette recolored in the car's own livery. */
export function bodySpecFor(car: CarSpec): CarBodySpec {
  const body = CAR_BODIES[car.id];
  if (body) return body;
  return {
    ...COMPACT_BODY,
    colors: { ...COMPACT_BODY.colors, paint: car.color, accent: car.accent },
  };
}
