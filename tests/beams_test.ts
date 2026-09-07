// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIGHT SWITCH, as the four rules a picture cannot check.
//
// Whether a night stage LOOKS right is judged by looking at it; what a look
// cannot catch is a dipped beam that is quietly the same lamp as a main one,
// a pod bar still burning with the switch down, a car dipping at a distance
// that moves with a video option, or a rival hovering on the threshold and
// switching the whole field's materials every frame.

import { describe, expect, it } from "vitest";

import { beamReach, dipFor, dippedOf, headShareAt, mainOf } from "../pwa/src/game/car-beams.ts";
import { headLampSources } from "../pwa/src/game/car/lamps.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import type { LampSource } from "../pwa/src/game/car/lamps.ts";

/** A car off the roster that carries driving lamps as well as low beams —
 * the case the whole dipped/main split exists for. Searched rather than
 * named: which body has a pod bar is a fact about the catalog, and a test
 * that pins one fails the day somebody restyles it. */
function withDrivingLamps(): { id: string; plan: LampSource[] } {
  for (const [id, spec] of Object.entries(CAR_BODIES)) {
    const plan = headLampSources(spec);
    if (plan.some((l) => l.role !== "main") && plan.some((l) => l.role === "main")) {
      return { id, plan };
    }
  }
  throw new Error("no car on the roster carries both a low beam and a driving lamp");
}

describe("what a dipped beam is", () => {
  it("puts the driving lamps OUT rather than turning the same ones down", () => {
    const { plan } = withDrivingLamps();
    const dipped = dippedOf(plan);
    // Every lamp still lit is a low beam, and there are fewer of them.
    expect(dipped.length).toBeGreaterThan(0);
    expect(dipped.length).toBeLessThan(plan.length);
    expect(dipped.every((lamp) => lamp.role === "main")).toBe(true);
  });

  it("is shorter, wider and worth less light than the main beam", () => {
    // Both stops are shapes laid on the same bowl, so the rule is between
    // THEM — not between one of them and the authored optics neither uses.
    const { plan } = withDrivingLamps();
    const beam = (of: readonly LampSource[]) => of.find((lamp) => lamp.role === "main")!;
    const main = beam(mainOf(plan));
    const dipped = beam(dippedOf(plan));
    // The one a driver feels: where the light stops. The isolux plot puts
    // the same contour at twice the distance on main beam — at 10 lux
    // (82 m against 41) and again at 1 lux (260 against 131).
    expect(dipped.reach).toBeCloseTo(main.reach / 2, 5);
    // ...and the low beam is the WIDER of the two, which is the way round
    // that gets guessed wrong: a broad wash across the near road, not a
    // corridor down it.
    expect(dipped.cone).toBeGreaterThan(main.cone);
    // ...aimed lower, so its hot spot lands nearer: a low beam points at the
    // road you are on, which is the whole reason it does not dazzle.
    expect(dipped.tilt).toBeGreaterThan(main.tilt);
    expect(dipped.y / dipped.tilt).toBeLessThan(main.y / main.tilt);
    // A quarter of the light, off the plot's 27.5 lux against 109.
    expect(headShareAt("dipped")).toBeCloseTo(headShareAt("main") / 4, 2);
    expect(headShareAt("off")).toBe(0);
  });

  it("still lights a face that authored no low beam at all", () => {
    // A spec is allowed a bare nose. Dipping it must leave a car with
    // lights, not a car driving blind.
    const pods: LampSource[] = [
      {
        role: "spot",
        x: -0.4,
        y: 0.8,
        z: 1.9,
        power: 1,
        cone: 0.25,
        reach: 105,
        tilt: 0.04,
        splay: 0.06,
      },
      {
        role: "spot",
        x: 0.4,
        y: 0.8,
        z: 1.9,
        power: 1,
        cone: 0.25,
        reach: 105,
        tilt: 0.04,
        splay: 0.06,
      },
    ];
    expect(dippedOf(pods)).toHaveLength(2);
  });
});

describe("when a driver dips for somebody else", () => {
  const REACH = 100;

  it("only ever takes MAIN beam down", () => {
    // Dipped beams dazzle nobody — that is what a cut-off is for — and an
    // unlit car has nothing to dip.
    expect(dipFor("off", 1, REACH, "off")).toBe("off");
    expect(dipFor("dipped", 1, REACH, "dipped")).toBe("dipped");
  });

  it("dips for a car inside the beam's own reach and not for one past it", () => {
    expect(dipFor("main", 40, REACH, "main")).toBe("dipped");
    expect(dipFor("main", 400, REACH, "main")).toBe("main");
    expect(dipFor("main", Infinity, REACH, "main")).toBe("main");
  });

  it("holds a band, so a car sitting on the line cannot flicker the field", () => {
    // Just inside the reach: dip. Then the same distance while dipped must
    // NOT put the beams straight back up, or the pair chatters — and every
    // change of stop rewrites materials across the whole entry list.
    const at = REACH * 0.99;
    expect(dipFor("main", at, REACH, "main")).toBe("dipped");
    expect(dipFor("main", at, REACH, "dipped")).toBe("dipped");
    // It takes drawing properly clear to come back up.
    expect(dipFor("main", REACH * 1.5, REACH, "dipped")).toBe("main");
  });

  it("dips earlier for a car whose lamps throw further", () => {
    // The threshold is the hardware's, not a constant: a pod bar reaches
    // further, so it puts light on somebody further away.
    const { plan } = withDrivingLamps();
    const bar = beamReach(plan);
    const low = beamReach(dippedOf(plan));
    expect(bar).toBeGreaterThan(low);
    const between = (bar + low) / 2;
    expect(dipFor("main", between, bar, "main")).toBe("dipped");
    expect(dipFor("main", between, low, "main")).toBe("main");
  });
});
