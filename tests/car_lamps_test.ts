// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT EACH CAR LIGHTS THE ROAD WITH. The light sources are derived from the
// same numbers the lenses are laid on (pwa/src/game/car/lamps.ts), so the
// thing worth holding is that the derivation keeps saying something true
// about a face: as many beams as there are housings, in pairs, off the
// lenses, strongest first — and that no restyle can quietly leave a car
// throwing light from somewhere there is no lamp.

import { describe, expect, it } from "vitest";

import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import { headLampSources, tailLampSources, type LampSource } from "../pwa/src/game/car/lamps.ts";
import { LAMP_BEAMS } from "../pwa/src/game/settings.ts";

const BODIES = Object.entries(CAR_BODIES);

/** The cheapest stop throws one beam; every richer one throws pairs. So a
 * budget is spent on whole pairs, and a car never drives a night stage with
 * its left lamp lit and its right one dark. */
function pairsIn(sources: readonly LampSource[], take: number): void {
  for (let i = 0; i + 1 < take; i += 2) {
    expect(sources[i].x).toBeCloseTo(-sources[i + 1].x, 6);
    expect(sources[i].role).toBe(sources[i + 1].role);
    expect(sources[i].power).toBeCloseTo(sources[i + 1].power, 6);
  }
}

describe("the light sources a body authors", () => {
  it("gives every shipped car a head and a tail to light", () => {
    for (const [id, body] of BODIES) {
      expect(headLampSources(body).length, id).toBeGreaterThanOrEqual(2);
      expect(tailLampSources(body).length, id).toBe(2);
    }
  });

  // The three faces on the roster are three different answers, and that IS
  // the feature: a quad face has four housings, a wide-cluster face two, and
  // a car with a pod bar carries its own two plus the bar's four.
  it("throws as many beams as the face has housings", () => {
    expect(headLampSources(CAR_BODIES.compact)).toHaveLength(4);
    expect(headLampSources(CAR_BODIES.classic)).toHaveLength(2);
    expect(headLampSources(CAR_BODIES.coupe)).toHaveLength(6);
  });

  it("lays every source out as a symmetric pair, strongest pair first", () => {
    for (const [id, body] of BODIES) {
      for (const sources of [headLampSources(body), tailLampSources(body)]) {
        expect(sources.length % 2, id).toBe(0);
        pairsIn(sources, sources.length);
        for (let i = 2; i < sources.length; i += 2) {
          expect(sources[i].power, id).toBeLessThanOrEqual(sources[i - 2].power);
        }
      }
    }
  });

  // The LIGHTING row spends its cap off the front of these lists, so an even
  // cap has to take whole pairs at every car on the roster.
  it("hands the LIGHTING row whole pairs at every cap it spends", () => {
    for (const [id, body] of BODIES) {
      const head = headLampSources(body);
      for (const stop of Object.values(LAMP_BEAMS)) {
        const take = Math.min(stop.head, head.length);
        if (take > 1) expect(take % 2, id).toBe(0);
        pairsIn(head, take);
      }
    }
  });

  it("stands each beam at a real lens, off a real cap", () => {
    for (const [id, body] of BODIES) {
      const nose = body.profile[0].z;
      const tail = body.profile[body.profile.length - 1].z;
      for (const lamp of headLampSources(body)) {
        // A pod stands ahead of the nose cap; nothing stands behind it.
        expect(lamp.z, `${id} ${lamp.role}`).toBeGreaterThanOrEqual(nose - 0.01);
        expect(lamp.y, id).toBeGreaterThan(0.2);
        expect(lamp.y, id).toBeLessThan(body.profile[0].topY + 0.4);
        expect(Math.abs(lamp.x), id).toBeLessThan(1);
      }
      for (const lamp of tailLampSources(body)) {
        expect(lamp.z, id).toBeCloseTo(tail, 6);
        expect(lamp.role, id).toBe("tail");
      }
    }
  });

  it("keeps every lamp's strength, cone and reach inside its role's sense", () => {
    for (const [id, body] of BODIES) {
      for (const lamp of [...headLampSources(body), ...tailLampSources(body)]) {
        const where = `${id} ${lamp.role}`;
        expect(lamp.power, where).toBeGreaterThan(0);
        expect(lamp.power, where).toBeLessThanOrEqual(1.15);
        expect(lamp.cone, where).toBeGreaterThan(0.1);
        expect(lamp.cone, where).toBeLessThan(Math.PI / 2);
        expect(lamp.reach, where).toBeGreaterThan(5);
        expect(lamp.tilt, where).toBeGreaterThan(0);
        // Aimed at the road rather than at the treetops: a beam's own drop
        // over its reach has to land under the lamp it left.
        expect(lamp.tilt * lamp.reach, where).toBeGreaterThan(lamp.y);
      }
    }
  });

  // A spot is the trade the pods exist for. If it ever stopped reaching
  // further in a narrower cone than the low beam beside it, a rally bar
  // would be four more low beams and the cars would stop differing.
  it("makes a spot reach further than a main in a tighter cone, and a flood neither", () => {
    const kinds = new Map(headLampSources(CAR_BODIES.coupe).map((l) => [l.role, l]));
    const main = kinds.get("main");
    const spot = kinds.get("spot");
    const flood = kinds.get("flood");
    expect(main && spot && flood).toBeTruthy();
    expect(spot!.reach).toBeGreaterThan(main!.reach);
    expect(spot!.cone).toBeLessThan(main!.cone);
    expect(flood!.reach).toBeLessThan(main!.reach);
    expect(flood!.cone).toBeGreaterThan(main!.cone);
    // ...and a pod is aimed down the road, not out at the verge.
    expect(spot!.splay).toBeLessThan(main!.splay);
  });

  it("has nothing to light on a body with no lamps authored", () => {
    const bare = { ...CAR_BODIES.compact, front: undefined, rear: undefined };
    expect(headLampSources(bare)).toEqual([]);
    expect(tailLampSources(bare)).toEqual([]);
  });
});
