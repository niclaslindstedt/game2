// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS UNDER THE BONNET, held against the bodywork over it.
//
// The bay itself is judged by looking (`make items ITEMS=engine-bay`). What
// is asserted here is what looking cannot catch, and both halves of it are
// INVISIBLE failures:
//
//   Nothing in the bay may stand through the body. The whole point of the
//   well is that it is out of sight until an impact tears the bonnet off, so
//   a rocker cover authored a centimetre too tall pokes through a SHUT
//   bonnet and a strut tower too far outboard grows out of a front wing.
//   Every sheet that reviews the bay is rendered with the panel already
//   gone, which is exactly the view that cannot show either of them.
//
//   And the paint on the bonnet has to LEAVE with it. A deck stripe is
//   routed onto whichever panel it crosses (car/trim.ts), which works only
//   while the stripe fits inside that panel; one wider than the bonnet stays
//   on the shell and is left hanging in the air over the open bay. The
//   liveries generate stripes as well as the specs, so both are checked.

import { describe, expect, it } from "vitest";

import { MeshBuilder } from "../pwa/src/game/car/builder.ts";
import { buildEngineBay } from "../pwa/src/game/car/engine-bay.ts";
import { buildStations, flankX, sampleProfile } from "../pwa/src/game/car/shell.ts";
import type { CarBodySpec, DeckStripes } from "../pwa/src/game/car/spec.ts";
import { LIVERY_COUNT, applyLivery, liveryFor } from "../pwa/src/game/car-livery.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const bodies = Object.entries(CAR_BODIES);

function axlesOf(spec: CarBodySpec): number[] {
  const shift = spec.axleShift ?? 0;
  return [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
}

type Vertex = { x: number; y: number; z: number };

/** Every vertex the bay builds, at the detail level that draws the most of
 * it — the ancillaries are what reach nearest the wings and the deck. */
function bayOf(spec: CarBodySpec): { built: boolean; vertices: Vertex[] } {
  const axles = axlesOf(spec);
  const b = new MeshBuilder();
  const built = buildEngineBay(b, spec, buildStations(spec, axles), axles, "high");
  const geo = b.geometry();
  const pos = geo.getAttribute("position");
  const vertices: Vertex[] = [];
  for (let i = 0; i < pos.count; i++) {
    vertices.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  }
  geo.dispose();
  return { built, vertices };
}

describe("the engine bay under every bonnet", () => {
  it.each(bodies)("%s has one at all", (_id, spec) => {
    const { built, vertices } = bayOf(spec);
    expect(built).toBe(true);
    expect(vertices.length).toBeGreaterThan(0);
  });

  it.each(bodies)("%s keeps every part of it under its own deck", (_id, spec) => {
    // The rim around the hole is the one thing laid ON the deck, 4 mm proud
    // of it so it wins the depth test against the panel it is painted over.
    for (const v of bayOf(spec).vertices) {
      expect(v.y).toBeLessThanOrEqual(sampleProfile(spec.profile, v.z).topY + 0.0045);
    }
  });

  it.each(bodies)("%s keeps every part of it inside its own flanks", (_id, spec) => {
    const axles = axlesOf(spec);
    for (const v of bayOf(spec).vertices) {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(flankX(spec, axles, v.z, v.y) + 1e-3);
    }
  });

  it.each(bodies)("%s stands the well on a floor above its own underside", (_id, spec) => {
    const lowest = Math.min(...bayOf(spec).vertices.map((v) => v.y));
    expect(lowest).toBeGreaterThanOrEqual(spec.floorY);
    // …and the well is a well, not a dish: an engine has to stand in it.
    const deck = Math.min(...spec.profile.map((p) => p.topY));
    expect(deck - lowest).toBeGreaterThan(0.19);
  });
});

/** Every stripe group a spec carries, as a flat list. */
function stripeGroups(spec: CarBodySpec): DeckStripes[] {
  if (!spec.stripes) return [];
  return Array.isArray(spec.stripes) ? spec.stripes : [spec.stripes];
}

/** Each stripe that crosses a lid, against the lid it crosses. */
function stripesOnLids(spec: CarBodySpec): { half: number; reach: number }[] {
  const lids = [spec.front?.hood, spec.rear?.deck].filter((lid) => lid !== undefined);
  const out: { half: number; reach: number }[] = [];
  for (const st of stripeGroups(spec)) {
    const sLo = Math.min(st.zFrom, st.zTo);
    const sHi = Math.max(st.zFrom, st.zTo);
    for (const lid of lids) {
      const lo = Math.min(lid.zFrom, lid.zTo);
      const hi = Math.max(lid.zFrom, lid.zTo);
      if (sHi < lo || sLo > hi) continue;
      for (const off of st.offsets)
        out.push({ half: lid.half, reach: Math.abs(off) + st.width / 2 });
    }
  }
  return out;
}

describe("the paint on a panel that can come off", () => {
  it.each(bodies)("%s keeps its own deck stripes inside the lids they cross", (_id, spec) => {
    for (const { half, reach } of stripesOnLids(spec)) {
      expect(reach).toBeLessThanOrEqual(half);
    }
  });

  it.each(bodies)("%s does too in every livery the field paints it in", (_id, spec) => {
    for (let slot = 0; slot < LIVERY_COUNT; slot++) {
      for (const { half, reach } of stripesOnLids(applyLivery(spec, liveryFor(slot)))) {
        expect(reach).toBeLessThanOrEqual(half);
      }
    }
  });
});
