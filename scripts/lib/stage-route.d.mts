// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Types for stage-route.mjs, so tests/stage_preview_test.ts can import the
// encoder the committed routes are actually written with.
//
// The module stays .mjs rather than becoming .ts because eslint's config
// only reaches `scripts/**/*.mjs` — a .ts under scripts/ typechecks but is
// linted by nothing, which is a worse trade than this declaration.

/** A compiled track, as much of one as the encoder reads. */
type EncodableTrack = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  samples: readonly { x: number; z: number }[];
};

/** One stage's route as `pwa/src/game/stage-routes.ts` stores it. */
export type EncodedRoute = {
  /** The polyline, base64 of (x, y) byte pairs. */
  d: string;
  /** How much wider than tall the road's bounding box is, in the world. */
  aspect: number;
  /** How many points survived the simplification. */
  points: number;
};

export declare const GRID: number;
export declare const TOLERANCE: number;
export declare function simplify(
  points: readonly [number, number][],
  tol: number,
): [number, number][];
export declare function routeOf(track: EncodableTrack): EncodedRoute;
