// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paint schemes the field is dressed in. Three things are load-bearing
// and none of them is visible on a contact sheet:
//
// - a livery is DETERMINISTIC per slot, because the car you line up against
//   in third place has to look the same every time you line up against it;
// - a repaint keeps the car's HARDWARE (bumpers, arch trim, rubbing strips)
//   and replaces only its paint, so a repainted spec is still the same car;
// - the repaint never touches the catalog's own specs, which the player's
//   car and the turntable read straight out of the module.
//
// The geometry the patterns generate is judged by looking (`make liveries`);
// what is asserted here is what looking cannot catch.

import { describe, expect, it } from "vitest";

import { CARS, TUNING } from "@engine";

import { bodyHalfLength, bodyHalfWidth } from "../pwa/src/game/car/shell.ts";
import { LIVERY_COUNT, applyLivery, liveryFor } from "../pwa/src/game/car-livery.ts";
import { CAR_BODIES, bodySpecFor } from "../pwa/src/game/car-styles.ts";

const bodies = Object.entries(CAR_BODIES);
const slots = Array.from({ length: 40 }, (_, i) => i);

function axlesOf(spec: (typeof CAR_BODIES)[string]): number[] {
  const shift = spec.axleShift ?? 0;
  return [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
}

describe("picking a livery for a slot on the start list", () => {
  it("gives the same slot the same scheme every time", () => {
    for (const slot of slots) expect(liveryFor(slot)).toEqual(liveryFor(slot));
  });

  it("gives a field of nine a different pattern each", () => {
    // A start list is small. Two cars sharing a pattern deep into the table
    // is fine; a field where half of them share one is the field looking
    // like one car repainted.
    const patterns = new Set(slots.slice(0, 9).map((slot) => liveryFor(slot).pattern));
    expect(patterns.size).toBe(9);
  });

  it("gives a field of nine a different color each", () => {
    const paints = new Set(slots.slice(0, 9).map((slot) => liveryFor(slot).paint));
    expect(paints.size).toBe(9);
  });

  it("repeats neither palette nor pattern until the table is exhausted", () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < LIVERY_COUNT; slot++) {
      const l = liveryFor(slot);
      seen.add(`${l.paint.toString(16)}/${l.pattern}`);
    }
    expect(seen.size).toBe(LIVERY_COUNT);
  });

  it("answers for any slot number a start list could hand it", () => {
    for (const slot of [-3, 0, 1, 999, 100000]) {
      const l = liveryFor(slot);
      expect(l.pattern).toBeTruthy();
      expect(l.number).toMatch(/^\d{1,2}$/);
    }
  });

  it("never paints a car in its own accent", () => {
    // Two of the three colors landing on the same value would draw the
    // pattern in the body color: a car that looks unpainted at any distance.
    for (const slot of slots) {
      const l = liveryFor(slot);
      expect(l.accent).not.toBe(l.paint);
      expect(l.detail).not.toBe(l.paint);
      expect(l.detail).not.toBe(l.accent);
    }
  });
});

describe("repainting a body", () => {
  it("leaves the catalog's own spec untouched", () => {
    // The player's car and the menu turntable read these specs directly.
    const before = structuredClone(CAR_BODIES.compact);
    applyLivery(CAR_BODIES.compact, liveryFor(3));
    expect(CAR_BODIES.compact).toEqual(before);
  });

  it("keeps the hardware bands and drops the old paint", () => {
    const base = CAR_BODIES.compact;
    const hardware = (base.sideBands ?? []).filter((b) => b.role === "trim");
    expect(hardware.length).toBeGreaterThan(0);
    const painted = applyLivery(base, liveryFor(0));
    for (const band of hardware) expect(painted.sideBands).toContainEqual(band);
    // ...and nothing the old livery painted survived into the new one.
    const oldPaint = (base.sideBands ?? []).filter((b) => b.role !== "trim");
    for (const band of oldPaint) expect(painted.sideBands).not.toContainEqual(band);
  });

  it("keeps every piece of hardware the spec bolted on", () => {
    const base = CAR_BODIES.classic;
    const painted = applyLivery(base, liveryFor(7));
    expect(painted.front).toEqual(base.front);
    expect(painted.rear).toEqual(base.rear);
    expect(painted.arches).toEqual(base.arches);
    expect(painted.profile).toEqual(base.profile);
    expect(painted.colors.bumper).toBe(base.colors.bumper);
    expect(painted.colors.trim).toBe(base.colors.trim);
  });

  it("only splits the loft for the pattern that is a two-tone", () => {
    // `colors.lower` cuts the second color into the shell itself. Left set
    // under any other pattern it would put a seam across every car.
    for (const slot of slots) {
      const livery = liveryFor(slot);
      const painted = applyLivery(CAR_BODIES.coupe, livery);
      if (livery.pattern === "duotone") expect(painted.colors.lower).toBe(livery.detail);
      else expect(painted.colors.lower).toBeUndefined();
    }
  });

  it("gives every car a legible door number whatever it is painted", () => {
    for (const [, base] of bodies) {
      for (const slot of slots.slice(0, 12)) {
        const painted = applyLivery(base, liveryFor(slot));
        const n = painted.raceNumber;
        expect(n).toBeDefined();
        // The roundel is white with dark ink on every car in the field —
        // it is what makes the field countable on screen, so it is never a
        // style choice a palette gets to make.
        expect(n?.panel?.color).toBe(0xf2efe6);
        expect(n?.color).toBe(0x16181c);
        // ...and it sits on the flank, not under the sill or over the belt.
        expect(n?.y).toBeGreaterThan(base.floorY);
        expect(n?.y).toBeLessThan(base.beltY);
      }
    }
  });

  it("keeps a repainted car inside the collision box", () => {
    // A pattern is paint, not bodywork — but a band stands proud of the
    // flank and `arches.trim` does not, so nothing here may push a car past
    // the one collider the whole catalog shares.
    for (const [, base] of bodies) {
      for (const slot of slots.slice(0, 12)) {
        const painted = applyLivery(base, liveryFor(slot));
        const axles = axlesOf(painted);
        expect(bodyHalfLength(painted)).toBeLessThanOrEqual(TUNING.collision.halfLength);
        expect(bodyHalfWidth(painted, axles)).toBeLessThanOrEqual(TUNING.collision.halfWidth);
      }
    }
  });

  it("keeps every band inside the bodywork it is painted on", () => {
    // A band authored past the profile's end stations wraps the nose cap
    // and shows as a smear across the grille.
    for (const [, base] of bodies) {
      const nose = base.profile[0].z;
      const tail = base.profile[base.profile.length - 1].z;
      for (const slot of slots.slice(0, 12)) {
        for (const band of applyLivery(base, liveryFor(slot)).sideBands ?? []) {
          expect(Math.max(band.zFrom, band.zTo)).toBeLessThanOrEqual(nose);
          expect(Math.min(band.zFrom, band.zTo)).toBeGreaterThanOrEqual(tail);
        }
      }
    }
  });
});

describe("the seam between a catalog car and a repainted one", () => {
  it("bodySpecFor returns the authored livery when no paint is asked for", () => {
    expect(bodySpecFor(CARS[0])).toBe(CAR_BODIES[CARS[0].id]);
  });

  it("bodySpecFor repaints when one is", () => {
    const livery = liveryFor(5);
    expect(bodySpecFor(CARS[0], livery).colors.paint).toBe(livery.paint);
  });

  it("repaints the fallback body an unknown car falls back to", () => {
    const livery = liveryFor(2);
    const body = bodySpecFor({ ...CARS[0], id: "nope" }, livery);
    expect(body.colors.paint).toBe(livery.paint);
  });
});
