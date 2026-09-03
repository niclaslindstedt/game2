// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE CAMPAIGN MENU SHOWS OF A PLACE BEFORE YOU DRIVE IT — a stage's
// road as a shape, and a country as a photograph.
//
// The two are deliberately different kinds of thing, because a stage and a
// country are different kinds of thing:
//
//   A STAGE is one road, and the useful picture of it is its SHAPE — how it
//   winds, whether it doubles back, whether it comes back to its own start.
//   That is a polyline, so it ships as one (stage-routes.ts, written by
//   `make routes`) and is stroked here into an SVG path. Being a path
//   rather than an image is what lets it take the colour of the box it sits
//   in — lit on an open stage, grey on a locked one — and stay sharp at any
//   size, on any screen.
//
//   A COUNTRY is many stages, so no one road is a picture of it. What it
//   gets instead is a real render taken by the game itself, from a camera
//   over the first stage's start line (`make biomes`), and there is nothing
//   to do here but name the file.
//
// Neither is generated at runtime, and that is a measurement rather than a
// preference: `compileStage` costs between 60 ms and ten seconds a stage,
// so a menu that built its own previews would freeze on the way in. Drawing
// is the cheap half, and drawing is all that happens here.
//
// DOM-free — it is geometry and a URL, and the tests read both without a
// browser.

import type { BiomeId } from "@engine";

import { STAGE_ROUTES } from "./stage-routes.ts";

/** The side of the box the stored route is quantised into — see
 * `stage-routes.ts`. Both axes span this, whatever the road's real shape;
 * `aspect` is what puts the shape back. */
const GRID = 255;

/** How thick the drawn route is, in the same units, and the room kept
 * around it for the round cap at each end. Without the padding a stage that
 * runs to the edge of its own bounding box — which every stage does, twice,
 * by construction — loses half its stroke to the viewBox edge. */
export const ROUTE_STROKE = 13;
const PAD = ROUTE_STROKE / 2 + 1;

/** A route ready to draw: the path, and the box it wants drawing in. */
export type RouteShape = {
  /** The `d` of an SVG path, in the viewBox below. */
  d: string;
  /** The viewBox, in the same units. Proportional to the road's real
   * extent, so the drawing is the shape of the stage rather than the shape
   * of the space it is being shown in — hand it to `preserveAspectRatio`
   * and let it letterbox. */
  width: number;
  height: number;
};

/** The shape of a campaign stage's road, or null for a level with no route
 * stored. Null rather than a throw: a location added to `campaign.ts`
 * without `make routes` being re-run should cost the menu its picture, not
 * the page. */
export function routeShape(levelId: string): RouteShape | null {
  const route = STAGE_ROUTES[levelId];
  if (!route) return null;
  const bytes = decode(route.d);
  if (bytes.length < 4) return null;
  // Put the road's proportions back. The stored line fills 0..GRID on both
  // axes whatever shape the stage is, so the SHORTER side is scaled down:
  // the longer one keeps the full grid, and a stage that runs north-south
  // is drawn tall instead of being stretched square.
  const scaleX = route.aspect >= 1 ? 1 : route.aspect;
  const scaleY = route.aspect >= 1 ? 1 / route.aspect : 1;
  const parts: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const x = PAD + bytes[i] * scaleX;
    const y = PAD + bytes[i + 1] * scaleY;
    parts.push(`${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`);
  }
  return {
    d: parts.join(" "),
    width: GRID * scaleX + PAD * 2,
    height: GRID * scaleY + PAD * 2,
  };
}

/** Two decimals, without the trailing zeroes — a path string this is not
 * worth being long. */
function round(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** The stored base64 back into bytes. `atob` rather than Buffer: this runs
 * in the browser, and the strings are a few hundred bytes each. */
function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The banner for a country — a render of the place, written by
 * `make biomes` into the site's own assets.
 *
 * `base` is the bundler's base (`import.meta.env.BASE_URL`), and it is a
 * PARAMETER rather than read here: this module is imported by the root test
 * suite, whose tsconfig has no Vite client types in it, and a bare
 * `import.meta.env` there is a typecheck error rather than a wrong URL.
 * Passing it also makes the one thing worth checking — that a deploy slot's
 * prefix survives (`/`, `/preview/`, `/branch/`, and the desktop and store
 * shells' own schemes) — checkable without a browser. */
export function biomeShot(biome: BiomeId, base: string): string {
  return `${base}previews/biome-${biome}.jpg`;
}
