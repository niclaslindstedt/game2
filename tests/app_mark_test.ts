// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP MARK, stated three times and held to itself.
//
// The flick — two tyre tracks and the car at the head of them — is written
// down in three places, and they are three because none of them can import
// either of the others:
//
//   pwa/public/icons/icon.svg      the asset the browser and the stores read
//   scripts/generate-icons.mjs     the arc centres the raster icons are drawn
//                                  from (plain Node, no bundler)
//   pwa/src/game/app-mark.ts       the two TRACKS as data, for the app to lay
//                                  at runtime (`mark-tracks.tsx`, beside the
//                                  menu's wordmark and on the loading card)
//
// The app draws only the tracks — the car at the head of them belongs to the
// icon and stays there — so only the tracks are held here. A comment asking
// three files to be edited together is a comment that gets missed, and a mark
// that drifts is not a cosmetic problem: it is the game wearing one face on
// the home screen and a different one on its own menu.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MARK_TRACKS, MARK_TRACKS_VIEWBOX, MARK_WIDTH } from "../pwa/src/game/app-mark.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icon = readFileSync(join(root, "pwa", "public", "icons", "icon.svg"), "utf8");

/** Every `d=` in the icon, in document order. */
function iconPaths(): string[] {
  return [...icon.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1].trim());
}

describe("the app mark", () => {
  it("draws the icon's own two tracks", () => {
    expect(iconPaths()).toEqual([...MARK_TRACKS]);
  });

  it("strokes them as wide as the icon does", () => {
    expect(icon).toContain(`stroke-width="${MARK_WIDTH}"`);
  });

  it("runs both tracks STRICTLY UPHILL, which is what makes the fill honest", () => {
    // The mark is filled by a band climbing from the bottom of its box
    // (`mark-tracks.tsx`) rather than by a stroke drawn along the path,
    // because a transform survives the main-thread blocks the loading card
    // is covering for and `stroke-dashoffset` does not.
    //
    // The price of a band is this property. It uncovers a track in the order
    // the car laid it ONLY while every point further along that track is
    // higher up the box than the one before it; the first time an arc doubles
    // back downward, the band fills that stretch out of order and the mark
    // stops reading as something being laid. A redrawn mark that dips even
    // slightly has to go back to a stroke, or lose the band.
    for (const d of MARK_TRACKS) {
      const points = walkPath(d);
      // The icon's y runs DOWN the page, so "uphill" is y decreasing.
      expect(points[0].y).toBeGreaterThan(points[points.length - 1].y);
      const dips = points.filter((point, i) => i > 0 && point.y > points[i - 1].y + 1e-9);
      expect(dips).toEqual([]);
    }
  });

  it("frames the tracks alone on the ink they actually cover", () => {
    // The loading card draws the tracks WITHOUT the car, so it needs their own
    // box rather than the badge's square — and a box that is not the ink's is
    // a mark drawn off-centre over the word under it. Walked here rather than
    // trusted: `getBBox` needs a browser, and this suite has none.
    const [bx, by, bw, bh] = MARK_TRACKS_VIEWBOX.split(" ").map(Number);
    const half = MARK_WIDTH / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of MARK_TRACKS) {
      for (const point of walkPath(d)) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    // The box holds every inked point...
    expect(Math.min(...xs) - half).toBeGreaterThanOrEqual(bx - 0.5);
    expect(Math.max(...xs) + half).toBeLessThanOrEqual(bx + bw + 0.5);
    expect(Math.min(...ys) - half).toBeGreaterThanOrEqual(by - 0.5);
    expect(Math.max(...ys) + half).toBeLessThanOrEqual(by + bh + 0.5);
    // ...and does not stand off from it by more than a stroke, which is what
    // keeps the mark filling the card rather than adrift in a wide box.
    expect(bw - (Math.max(...xs) - Math.min(...xs) + MARK_WIDTH)).toBeLessThan(MARK_WIDTH);
    expect(bh - (Math.max(...ys) - Math.min(...ys) + MARK_WIDTH)).toBeLessThan(MARK_WIDTH);
  });
});

/** Points along one `M … A … A …` track. Only the two commands the mark uses
 * are understood, which is the point: anything else in a mark path should
 * fail here rather than be silently skipped. */
function walkPath(d: string): { x: number; y: number }[] {
  const move = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+/);
  expect(move).not.toBeNull();
  let at = { x: Number(move![1]), y: Number(move![2]) };
  const out = [at];
  const arcs = [
    ...d.matchAll(
      /A\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([01])\s+([01])\s+(-?[\d.]+)\s+(-?[\d.]+)/g,
    ),
  ];
  expect(arcs.length).toBeGreaterThan(0);
  expect(d.replace(/^M[^A]+/, "").split("A").length - 1).toBe(arcs.length);
  for (const arc of arcs) {
    const r = Number(arc[1]);
    const sweep = arc[5] === "1";
    const to = { x: Number(arc[6]), y: Number(arc[7]) };
    out.push(...arcPoints(at, to, r, arc[4] === "1", sweep));
    at = to;
  }
  return out;
}

/** An SVG endpoint-parameterised arc, sampled. The mark's arcs are circular
 * (one radius, no rotation), which is the only case this covers. */
function arcPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  r: number,
  large: boolean,
  sweep: boolean,
  steps = 200,
): { x: number; y: number }[] {
  const mx = (from.x - to.x) / 2;
  const my = (from.y - to.y) / 2;
  const den = r * r * (my * my) + r * r * (mx * mx);
  const scale = Math.sqrt(Math.max(0, (r * r * r * r - den) / den)) * (large === sweep ? -1 : 1);
  const cx = (scale * r * my) / r + (from.x + to.x) / 2;
  const cy = (-scale * r * mx) / r + (from.y + to.y) / 2;
  const a0 = Math.atan2(from.y - cy, from.x - cx);
  let span = Math.atan2(to.y - cy, to.x - cx) - a0;
  if (sweep && span < 0) span += 2 * Math.PI;
  if (!sweep && span > 0) span -= 2 * Math.PI;
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (span * i) / steps;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}
