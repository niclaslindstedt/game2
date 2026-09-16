// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW MANY LIGHTS THE CAR STANDS IN THE SCENE, and why that number may never
// move during a run without being paid for first.
//
// three.js compiles a material against however many lights are VISIBLE: the
// count goes into the program cache key and is substituted into the shader
// source, so the frame on which it changes is the frame every lit material in
// the scene is relinked — half a second of nothing, in the middle of a corner.
// `car-lamps.ts` already avoids two ways of moving it (lights are standing and
// switched, never built per car; brake lamps are driven to nothing rather than
// hidden). The third way is the night switch itself, which the SKY throws on
// its own clock — at a sunrise, or when a storm heavy enough to want lamps
// comes over at noon.
//
// That one cannot be avoided, so it is warmed instead: `warmStages` walks the
// counts the switch can reach so the loading card pays for their programs.
// What is held here is that the walk actually visits them and puts the switch
// back where it found it.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CARS } from "@engine";

import { createCarLamps } from "../pwa/src/game/car-lamps.ts";
import { bodySpecFor } from "../pwa/src/game/car-styles.ts";
import { headLampSources, tailLampSources } from "../pwa/src/game/car/lamps.ts";
import { LAMP_BEAMS } from "../pwa/src/game/settings-video.ts";

/** The real catalog's noses and tails, which is what makes this worth
 * asserting: every shipped body carries low beams AND driving lamps behind
 * them, so MAIN and DIPPED differ in the NUMBER of beams lit and not only in
 * the optics on them. A hand-rolled plan could quietly stop being true of any
 * car in the game. */
const FITTED = CARS.map((car) => {
  const spec = bodySpecFor(car);
  return { id: car.id, head: headLampSources(spec), tail: tailLampSources(spec) };
});

/** How many spotlights are standing in the scene — the number three.js keys
 * a program on. */
function lit(scene: THREE.Scene): number {
  let n = 0;
  scene.traverse((o) => {
    if ((o as THREE.SpotLight).isSpotLight && o.visible) n += 1;
  });
  return n;
}

function fitted(
  level: keyof typeof LAMP_BEAMS,
  car: (typeof FITTED)[number] = FITTED[0],
): { scene: THREE.Scene; lamps: ReturnType<typeof createCarLamps> } {
  const scene = new THREE.Scene();
  const lamps = createCarLamps(scene);
  lamps.setLighting(level);
  lamps.setPlan(car.head, car.tail);
  return { scene, lamps };
}

describe("warming the light the car stands in the scene", () => {
  it("moves the count when the sky throws the switch", () => {
    // The premise of the whole warm-up: if this ever stopped being true the
    // rest of this file would be dead weight rather than a guard.
    const { scene, lamps } = fitted("normal");
    lamps.setStage("main");
    const on = lit(scene);
    lamps.setStage("off");
    expect(on).toBeGreaterThan(0);
    expect(lit(scene)).toBe(0);
  });

  it("warms every count the switch can reach, from either end of it", () => {
    for (const car of FITTED) {
      for (const level of ["lean", "normal", "full"] as const) {
        for (const from of ["off", "dipped", "main"] as const) {
          const { scene, lamps } = fitted(level, car);
          lamps.setStage(from);
          const start = lit(scene);

          const walked: number[] = [];
          lamps.warmStages(() => walked.push(lit(scene)));

          // Every stop's count is covered, counting the one already standing.
          const reached = new Set<number>();
          for (const stage of ["off", "dipped", "main"] as const) {
            lamps.setStage(stage);
            reached.add(lit(scene));
          }
          lamps.setStage(from);
          expect(new Set([start, ...walked])).toEqual(reached);

          // …and no count is warmed twice: each pass is a whole frame of the
          // built stage, which is the most expensive thing the load does.
          expect(new Set(walked).size).toBe(walked.length);
          expect(walked).not.toContain(start);
        }
      }
    }
  });

  it("puts the switch back where it found it", () => {
    for (const from of ["off", "dipped", "main"] as const) {
      const { scene, lamps } = fitted("full");
      lamps.setStage(from);
      const before = lit(scene);
      lamps.warmStages(() => {});
      expect(lamps.stage()).toBe(from);
      expect(lit(scene)).toBe(before);
    }
  });

  it("is not talked out of the stop it is being warmed at", () => {
    // The caller draws a WHOLE frame at each stop, and a whole frame relights
    // the sky — which asks the lamps for the stop the sun wants, and may dip
    // them for a car ahead. Were that allowed through mid-walk, every pass
    // would compile the count the sky is asking for and the warm-up would buy
    // nothing.
    const { scene, lamps } = fitted("full");
    lamps.setStage("main");
    const start = lit(scene);
    const reachable = new Set<number>();
    for (const stage of ["off", "dipped", "main"] as const) {
      lamps.setStage(stage);
      reachable.add(lit(scene));
    }
    lamps.setStage("main");

    const walked: number[] = [];
    lamps.warmStages(() => {
      // The sky asking for its stop, the way a relight inside the caller's
      // frame does — and a car close enough ahead to dip for, the other way
      // the stop moves on its own.
      lamps.setStage("main");
      lamps.setCompany(5);
      walked.push(lit(scene));
    });

    // The dark stop was warmed DARK. This is the whole point: what has to be
    // compiled is the frame with no beams in it, and the sky above this stage
    // is never going to ask for one.
    expect(walked).toContain(0);
    expect(new Set(walked).size).toBe(walked.length);
    expect(new Set([start, ...walked])).toEqual(reachable);
  });
});
