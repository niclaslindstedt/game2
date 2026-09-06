// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BACKDROP'S DEPTH, which is a seam nothing else can check.
//
// The sky is drawn LAST and depth-tested, so the country rejects its pixels
// before the dearest fragment shader in the frame runs on them
// (pwa/src/game/sky-depth.ts). That only holds while three things are true
// of every piece of it, and all three are silent when broken: the picture
// still draws, it is just wrong somewhere a screenshot of one stage on one
// day may not show.
//
//   * The depth is pushed to the FAR PLANE. Without the graft a piece is
//     depth-tested where it actually stands — the dome at 560 m, the ridge
//     rings at 500 — and any ground drawn beyond that comes out BEHIND the
//     sky: at the FAR draw distance the fog reaches past both.
//   * Nothing writes depth, or the stack stops painting over itself and the
//     sun disappears into the dome it is drawn on.
//   * It sorts after the world, or the saving is not taken at all.
//
// No DOM here: three.js geometry and materials are arithmetic, and none of
// the modules under test reaches for a document.

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { SKY_ORDER, drawAsBackdrop } from "../pwa/src/game/sky-depth.ts";
import { createHorizon } from "../pwa/src/game/horizon.ts";
import { createSkyShell } from "../pwa/src/game/sky-shader.ts";

/** Roughly what three hands `onBeforeCompile`: a `main` that has written
 * `gl_Position` through its chunks, and a trailing newline. */
const VERTEX = `#define SHADER_TYPE MeshBasicMaterial
varying vec3 vColor;
void main() {
\t#include <begin_vertex>
\t#include <project_vertex>
}
`;

/** Run a material's compile hook the way the renderer does, and hand back
 * the vertex source it would actually compile. */
function compiled(material: THREE.Material): string {
  const shader = { vertexShader: VERTEX, fragmentShader: "", uniforms: {} };
  material.onBeforeCompile(shader as never, null as never);
  return shader.vertexShader;
}

describe("a backdrop material", () => {
  it("is depth-tested, writes no depth, and lands on the far plane", () => {
    const material = new THREE.MeshBasicMaterial();
    drawAsBackdrop(material);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    const source = compiled(material);
    // The line three's own skybox uses. Inside `main`, after the chunk that
    // writes gl_Position — so it is the last thing before the brace.
    expect(source).toContain("gl_Position.z = gl_Position.w;");
    expect(source.trimEnd().endsWith("gl_Position.z = gl_Position.w;\n}")).toBe(true);
    // …and nothing was lost from what it grafted onto.
    expect(source).toContain("#include <project_vertex>");
  });

  it("re-keys the program, so it cannot share one with an ungrafted twin", () => {
    // Three's default cache key is `onBeforeCompile.toString()`. Two
    // materials identical in every parameter would otherwise share a
    // compiled program, and the second would inherit the first's depth.
    const plain = new THREE.MeshBasicMaterial();
    const backdrop = new THREE.MeshBasicMaterial();
    drawAsBackdrop(backdrop);
    expect(backdrop.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
  });

  it("sorts after everything the world and the car draw", () => {
    // The opaque pass is walked in renderOrder; the sky has to be the end
    // of it or the country never gets the chance to reject its pixels.
    // The highest the rest of the app sets is the way-home arrow at 3, and
    // the map view's own layers and route at 9 to 11.
    expect(SKY_ORDER - 3).toBeGreaterThan(11);
  });
});

describe("the sky's own stack", () => {
  it("puts the ridge rings on the backdrop, over the dome", () => {
    const horizon = createHorizon();
    const material = horizon.mesh.material as THREE.Material;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(compiled(material)).toContain("gl_Position.z = gl_Position.w;");
    // Over the dome, under nothing: the rings are the last of the backdrop.
    expect(horizon.mesh.renderOrder).toBe(SKY_ORDER - 1);
    horizon.dispose();
  });

  it("puts the layered dome on the backdrop, at the back of the stack", () => {
    const shell = createSkyShell();
    const material = shell.mesh.material as THREE.Material;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(compiled(material)).toContain("gl_Position.z = gl_Position.w;");
    expect(shell.mesh.renderOrder).toBe(SKY_ORDER - 3);
    // The dome is behind the rings, and both are behind the world.
    expect(shell.mesh.renderOrder).toBeLessThan(SKY_ORDER - 1);
    shell.dispose();
  });
});
