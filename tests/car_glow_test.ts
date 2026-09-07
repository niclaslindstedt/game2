// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIGHT A CAR PUTS BACK ON ITSELF (pwa/src/game/car-glow.ts). Whether the
// wash LOOKS right is judged by looking — a night frame with `make debug-shot`
// — so what is held here is the bookkeeping under it, all of which is
// invisible in a screenshot until the one frame that shows it:
//
//   - it costs a daylight car nothing, which is what lets it ride on every
//     body in the field;
//   - a slot follows the lamp it was built from through the car's own pose,
//     because a register written in world space against a stale matrix
//     smears the wash a car length up the road;
//   - a smashed lamp washes nothing, so a broken corner goes dark rather
//     than glowing off a lamp that has left the car.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CAR_GLOW_LAMPS, createCarGlow } from "../pwa/src/game/car-glow.ts";
import { frontLampAnchors, rearLampAnchors } from "../pwa/src/game/car/lamps.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const RED = new THREE.Color(0xff2a14);

/** The register as the shader reads it: where each slot is, how far it
 * carries, and what it is throwing. */
function readRegister(uniforms: Record<string, { value: unknown }>): {
  count: number;
  at: Float32Array;
  lit: Float32Array;
} {
  return {
    count: uniforms.uCarGlowCount.value as number,
    at: uniforms.uCarGlowAt.value as Float32Array,
    lit: uniforms.uCarGlowLit.value as Float32Array,
  };
}

/** A grafted material, and the uniform block the graft hung on it. */
function grafted(glow: ReturnType<typeof createCarGlow>): {
  material: THREE.MeshBasicMaterial;
  uniforms: Record<string, { value: unknown }>;
} {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.graft(material);
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "#include <common>\nvoid main() {\n#include <project_vertex>\n}",
    fragmentShader:
      "#include <common>\nvoid main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n" +
      "\tvec3 outgoingLight = reflectedLight.indirectDiffuse;\n}",
  };
  material.onBeforeCompile?.(shader as never, null as never);
  return { material, uniforms: shader.uniforms };
}

const spec = CAR_BODIES.coupe;

describe("the wash a car's own lamps lay on it", () => {
  it("throws nothing with the lamps off, so a daylight car pays no loop", () => {
    const glow = createCarGlow(frontLampAnchors(spec), rearLampAnchors(spec));
    const { uniforms } = grafted(glow);
    glow.shine(new THREE.Object3D(), 0, 0, RED);
    expect(readRegister(uniforms).count).toBe(0);
  });

  it("fills a slot per lamp, and never more than the register holds", () => {
    for (const [id, body] of Object.entries(CAR_BODIES)) {
      const front = frontLampAnchors(body);
      const rear = rearLampAnchors(body);
      const glow = createCarGlow(front, rear);
      const { uniforms } = grafted(glow);
      glow.shine(new THREE.Object3D(), 1, 1, RED);
      const { count } = readRegister(uniforms);
      expect(count, id).toBe(Math.min(CAR_GLOW_LAMPS, front.length + rear.length));
      expect(count, id).toBeGreaterThan(0);
    }
  });

  it("carries a slot through the car's own pose rather than leaving it at the origin", () => {
    const glow = createCarGlow(frontLampAnchors(spec), rearLampAnchors(spec));
    const { uniforms } = grafted(glow);
    const car = new THREE.Object3D();
    car.position.set(120, 8, -47);
    car.rotation.y = Math.PI / 2;
    glow.shine(car, 1, 1, RED);
    const { at } = readRegister(uniforms);
    // The first slot is the first front anchor, taken through the same
    // transform the vertex shader takes the panels through.
    const want = new THREE.Vector3(
      frontLampAnchors(spec)[0].x,
      frontLampAnchors(spec)[0].y,
      frontLampAnchors(spec)[0].z,
    );
    car.updateWorldMatrix(true, false);
    want.applyMatrix4(car.matrixWorld);
    expect(at[0]).toBeCloseTo(want.x, 5);
    expect(at[1]).toBeCloseTo(want.y, 5);
    expect(at[2]).toBeCloseTo(want.z, 5);
    // ...and it carries a reach, or the shader divides the falloff by zero.
    expect(at[3]).toBeGreaterThan(0);
  });

  it("takes the tail's colour from the frame, so a brake light lights the panel over it", () => {
    const glow = createCarGlow(frontLampAnchors(spec), rearLampAnchors(spec));
    const { uniforms } = grafted(glow);
    const front = frontLampAnchors(spec).length;
    glow.shine(new THREE.Object3D(), 1, 1, RED);
    const marker = readRegister(uniforms).lit[front * 3];
    glow.shine(new THREE.Object3D(), 1, 1, new THREE.Color(0xff7a52));
    const brake = readRegister(uniforms).lit;
    // Hotter at the core is what a brake light is: more of every channel
    // than the marker under it, not merely more red.
    expect(brake[front * 3]).toBeGreaterThanOrEqual(marker);
    expect(brake[front * 3 + 1]).toBeGreaterThan(0);
  });

  it("puts a smashed lamp out without touching the one beside it", () => {
    const glow = createCarGlow(frontLampAnchors(spec), rearLampAnchors(spec));
    const { uniforms } = grafted(glow);
    glow.snuff("head", 0);
    glow.shine(new THREE.Object3D(), 1, 1, RED);
    const { lit } = readRegister(uniforms);
    expect(lit[0]).toBe(0);
    expect(lit[1]).toBe(0);
    expect(lit[2]).toBe(0);
    expect(lit[3] + lit[4] + lit[5]).toBeGreaterThan(0);
  });

  it("grafts the term into both halves of the shader it is handed", () => {
    const glow = createCarGlow(frontLampAnchors(spec), rearLampAnchors(spec));
    const material = new THREE.MeshBasicMaterial();
    glow.graft(material);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\nvoid main() {\n#include <project_vertex>\n}",
      fragmentShader:
        "#include <common>\nvoid main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n" +
        "\tvec3 outgoingLight = reflectedLight.indirectDiffuse;\n}",
    };
    material.onBeforeCompile?.(shader as never, null as never);
    expect(shader.vertexShader).toContain("vCarGlow");
    expect(shader.vertexShader).toContain("uCarGlowCount");
    // The paint's share above the vertex-colour multiply, the gloss's below
    // it — both anchors must actually have been found, or the term silently
    // does nothing.
    expect(shader.fragmentShader).toContain("diffuse + vCarGlow");
    expect(shader.fragmentShader).toContain("indirectDiffuse + vCarGlow");
    expect(shader.uniforms.uCarGlowAt).toBeDefined();
  });
});
