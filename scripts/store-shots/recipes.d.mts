// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Types for recipes.mjs, so tests/store_listing_test.ts can hold the real
// recipe rows to the rules the store set obeys — every frame heads-up, one
// claim per frame, all three countries in the set — rather than restating
// them in a fixture that cannot go out of date because it is not the truth.
//
// The module stays .mjs rather than becoming .ts for the reason
// scripts/lib/stage-route.d.mts gives: eslint's config only reaches
// `scripts/**/*.mjs`, so a .ts under scripts/ typechecks but is linted by
// nothing — a worse trade than this declaration.
//
// Only what the suite reads is declared. The drivers are JavaScript and need
// none of it; this file exists for the typechecker's benefit alone.

/** One raster a storefront requires. */
export type StoreDevice = {
  name: string;
  label: string;
  css: { width: number; height: number };
  scale: number;
  raster: { width: number; height: number };
  /** Where this device's set is written, when it is not the App Store's. */
  out?: string;
  touch?: boolean;
  layout?: "framed" | "bleed";
};

/** One frame: what it stages, and when the shutter falls. */
export type StoreShot = {
  id: string;
  caption: string;
  /** The query the frame is staged from, over `SHOT_DEFAULTS`. */
  params: Record<string, string>;
  /** True for the one frame shot before the lights go out. */
  onTheGrid?: boolean;
  /** The rasters this frame is for; absent means all of them. */
  devices?: string[];
  /** Stage seconds past the trigger. */
  captureAtS: number;
  sweepAtS?: number[];
};

export declare const DEVICES: StoreDevice[];
export declare const SHOTS: StoreShot[];
export declare const SHOT_DEFAULTS: Record<string, string>;
export declare const COARSE_S: number[];
export declare const PATIENCE: number;
export declare function assertRasters(devices: readonly StoreDevice[]): void;
