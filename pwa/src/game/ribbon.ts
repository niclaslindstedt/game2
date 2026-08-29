// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of a piece of drawn road, and the one bit of trigonometry every
// module that draws beside a road needs.
//
// Its own module because four of them need it — the road ribbon itself, the
// kerbing, the crowd, and the finish's cannons — and none of those should
// have to import the others to say "a sample, and which way is right of it".

import type { RoadShape } from "@engine";

/** One drawn sample of road: where the centerline is, which way it points,
 * how high it is, and everything about its cross-section (`RoadShape`) that
 * decides its profile across the width. */
export type Ribbon = RoadShape & {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  s: number;
  /** R33 — the road's full width HERE, m, where it differs from the width
   * the ribbon was asked to draw. Optional: an abandoned branch (R17) has
   * no per-sample width of its own and simply holds the nominal. */
  width?: number;
};

/** The unit vector to the RIGHT of a heading, in world space. Heading 0
 * points down +z and grows clockwise seen from above, so right is
 * (cos h, -sin h). */
export function rightOf(heading: number): { x: number; z: number } {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}
