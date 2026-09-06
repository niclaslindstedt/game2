// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WEB IN THE GLASS (pwa/src/game/car/glass-cracks.ts) — the hairlines
// the engine's crazing ledger opens across a pane before it lets go. It is
// geometry over a car's own cabin patches and alpha over a buffer, with no
// DOM in it, so the two rules it exists for can be held here: a crack is
// ON the window it belongs to and never on the pillar beside it, and the
// web OPENS with the ledger rather than appearing whole.

import { describe, expect, it } from "vitest";

import { GLASS_PARTS } from "@engine";

import { MeshBuilder } from "../pwa/src/game/car/builder.ts";
import { buildGlassCracks } from "../pwa/src/game/car/glass-cracks.ts";
import { buildGreenhouse, type GlassPane } from "../pwa/src/game/car/greenhouse.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const PANES = GLASS_PARTS as readonly GlassPane[];

/** Where each pane's own glass actually is on this body, as a box in the
 * car's coordinates — read off the greenhouse rather than restated, so the
 * check is against the window the crack is supposed to be lying on. */
function paneBoxes(name: string): Record<GlassPane, number[][]> {
  const b = new MeshBuilder();
  const g = new MeshBuilder(true);
  const slices = buildGreenhouse(b, g, CAR_BODIES[name]);
  const pos = g.geometry().getAttribute("position");
  const boxes = {} as Record<GlassPane, number[][]>;
  for (const pane of PANES) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const { start, count } of slices[pane]) {
      for (let i = start; i < start + count; i++) {
        const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], p[a]);
          hi[a] = Math.max(hi[a], p[a]);
        }
      }
    }
    boxes[pane] = [lo, hi];
  }
  return boxes;
}

/** How far outside its own pane a hairline may reach, m: half the line's
 * own width, the lift that holds it off the glass, and the room a warped
 * flank's bilinear sample needs. */
const SLACK = 0.03;

describe("the web a cracking pane grows", () => {
  for (const name of Object.keys(CAR_BODIES)) {
    it(`stays on ${name}'s own windows and never on the pillars`, () => {
      const cracks = buildGlassCracks(CAR_BODIES[name]);
      expect(cracks).not.toBeNull();
      const boxes = paneBoxes(name);
      for (const pane of PANES) {
        const [lo, hi] = boxes[pane];
        const web = cracks!.webOf(pane, 1).position;
        expect(web.length).toBeGreaterThan(0);
        for (let i = 0; i < web.length; i += 3) {
          for (let a = 0; a < 3; a++) {
            expect(web[i + a]).toBeGreaterThanOrEqual(lo[a] - SLACK);
            expect(web[i + a]).toBeLessThanOrEqual(hi[a] + SLACK);
          }
        }
      }
      cracks!.dispose();
    });
  }

  it("opens a branch at a time instead of appearing whole", () => {
    const cracks = buildGlassCracks(CAR_BODIES.compact);
    expect(cracks).not.toBeNull();
    // A pane nobody has touched has nothing across it, and each step up the
    // ledger shows more than the one under it.
    const shown = [0, 0.15, 0.5, 0.9, 1].map(
      (level) => cracks!.webOf("glassF", level).position.length,
    );
    expect(shown[0]).toBe(0);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1]);
    expect(shown[shown.length - 1]).toBeGreaterThan(shown[1]);
    cracks!.dispose();
  });

  it("draws what is showing on the mesh, and takes it all back when the pane goes", () => {
    const cracks = buildGlassCracks(CAR_BODIES.compact);
    expect(cracks).not.toBeNull();
    const alpha = cracks!.mesh.geometry.getAttribute("color");
    const lit = (): number => {
      let n = 0;
      for (let i = 0; i < alpha.count; i++) if (alpha.getW(i) > 0) n += 1;
      return n;
    };
    // Built clear: a car rolls onto the grid with nothing across its glass,
    // and a mesh of invisible triangles is not drawn at all.
    expect(lit()).toBe(0);
    expect(cracks!.mesh.visible).toBe(false);
    cracks!.set("glassF", 0.9);
    expect(cracks!.mesh.visible).toBe(true);
    const cracked = lit();
    expect(cracked).toBeGreaterThan(0);
    // The other panes are untouched by one pane's web.
    cracks!.set("glassB", 0.9);
    expect(lit()).toBeGreaterThan(cracked);
    // ...and a pane out of its frame took its cracks with it.
    cracks!.clear("glassF");
    cracks!.clear("glassB");
    expect(lit()).toBe(0);
    expect(cracks!.mesh.visible).toBe(false);
    cracks!.dispose();
  });
});
