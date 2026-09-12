// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT MAKES SNOW LOOK LIKE SNOW, stated once for every surface made of it.
//
// Two surfaces draw the winter ground and they are built for different
// jobs: the coat is a sheet over the whole country that BENDS
// (`snow-mantle.ts`), and the trail is a narrow band laid where a tyre
// actually went (`snow-marks.ts`). What they must never be is two different
// whites. A trail shaded by one set of rules and the field around it by
// another reads as a decal stuck on the snow rather than as the snow
// itself, which is exactly what a flat unlit strip looked like.
//
// So the two terms that separate snow from white paint live here, and both
// materials graft the same source:
//
//   * WRAP LIGHTING — the cheap standing approximation of subsurface
//     scattering. Light does not stop at the surface of snow, it goes in,
//     bounces about the grains and comes back out somewhere else, so the
//     terminator is soft and the shaded side glows instead of going black.
//     `N·L` is remapped through `(N·L + w) / (1 + w)`, which is that in one
//     line.
//
//   * THE GLITTER — snow sparkles because it is not a surface at all, it is
//     a heap of crystals, each an almost perfect mirror at a random angle.
//     A handful of them line up with the sun and the eye at once and flare.
//     Modelled the way real-time work does it: hash the WORLD position into
//     a random normal per cell, and give it an extremely tight specular
//     lobe. World-space, so the glints sit still on the ground and twinkle
//     as the CAMERA moves, which is what the real thing does — a glitter
//     that swims with the view reads as noise on the lens.
//
// BOTH ARE GRAFTED ONTO A LAMBERT MATERIAL rather than written from
// nothing. The lights, the shadows and the game's own height fog are all in
// the built-in one already (`height-fog.ts` grafts itself into three's
// shader chunks), and a material assembled by hand would have to reproduce
// every one of them to sit in the same world. It is also the whole reason
// the trail knows what time it is: a `MeshBasicMaterial` takes no light at
// all, and the one tint that used to stand in for it could not tell the sunlit
// side of a drift from the shaded one.

import * as THREE from "three";

import { SUN_DIR } from "./sun-dir.ts";

/** Declarations every snow fragment shader needs: the sun, and the hash the
 * glitter's facets are drawn from. Grafted after `#include <common>`. */
export const SNOW_COMMON = `
  uniform vec3 uSun;
  varying vec3 vWorldPos;
  // One random unit vector per cell of world space.
  vec3 snowHash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return normalize(fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0);
  }
`;

/** ...and what the vertex shader owes it: the world position both terms are
 * computed against. Grafted after `#include <begin_vertex>`. */
export const SNOW_VERTEX = `
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/** THE TWO TERMS THEMSELVES, applied to a `gl_FragColor` the built-in
 * Lambert lighting has already resolved — so they run in `fog_fragment`'s
 * place, before the fog rather than after it.
 *
 * Off `normal` and not off `vNormal`: three declares the one as a local in
 * the same function, so it carries whatever the surface's own graft did to
 * it. The trail's tread bends it (`snow-marks.ts`), and a wrap term read
 * off the raw varying would light every block as though the floor were
 * flat — which is the pattern drawn and then shaded out of existence.
 *
 * `glitter` is a multiplier on how hard the crystals flare: the open field
 * carries all of it, and snow a wheel has pressed to a floor carries less,
 * because the thing that sparkled was the loose crystal standing proud of
 * the surface and the tyre has crushed it flat.
 *
 * `sky` is a GLSL expression for how much of the SKY reaches this point,
 * 0..1, and it multiplies the AMBIENT half alone — never the sun's. That
 * split is the whole point of it. A rut floor in direct sunlight is fully
 * lit; what it has lost is the blue coming down off the rest of the
 * hemisphere, because the walls of its own groove are in the way. Applied
 * to the whole of the light instead it would be a dark stripe again, just
 * computed more expensively — and the flat surfaces around it would be
 * wrong in the other direction. A surface with no grooves in it (the coat)
 * leaves it at 1 and pays nothing. */
export function snowSurface(glitter = 1, sky = "1.0"): string {
  return `
    {
      vec3 snowN = normalize(normal);
      vec3 snowV = normalize(cameraPosition - vWorldPos);
      // Wrap lighting: the light that went INTO the snow and came back.
      float wrapped = max(0.0, (dot(snowN, uSun) + 0.6) / 1.6);
      gl_FragColor.rgb *= 0.72 * (${sky}) + 0.45 * wrapped;
      // ...and the crystals that happened to line up.
      vec3 snowH = normalize(uSun + snowV);
      vec3 facet = normalize(snowN + snowHash(floor(vWorldPos * 7.0)) * 0.55);
      float glint = pow(max(0.0, dot(facet, snowH)), 220.0);
      gl_FragColor.rgb += glint * ${glitter.toFixed(2)} * 1.6 * max(0.0, uSun.y);
    }
  `;
}

/** A Lambert material with the snow terms already in it, and a hook for
 * whatever else the caller's own surface needs to add.
 *
 * `extra` is spliced in the same way `onBeforeCompile` would do it by hand:
 * each entry names a three.js shader chunk and the source to put after it,
 * which is how the coat adds its blanket-depth discard and the trail adds
 * its tread. Handed the shader object too, so a caller can declare its own
 * uniforms and attributes beside them. */
export function snowLambert(
  options: THREE.MeshLambertMaterialParameters,
  graft?: (shader: THREE.WebGLProgramParametersWithUniforms) => {
    vertex?: [string, string][];
    fragment?: [string, string][];
    glitter?: number;
    sky?: string;
  },
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ fog: true, ...options });
  material.onBeforeCompile = (shader) => {
    const own = graft?.(shader) ?? {};
    // The sun by REFERENCE — `SUN_DIR` is mutated in place by the
    // environment on the frame the sun moves, and a copy here would be a
    // frame of lag on one snow surface and not the other, which reads as
    // two suns.
    shader.uniforms.uSun = { value: SUN_DIR };
    const after = (src: string, pairs: [string, string][]): string => {
      let out = src;
      for (const [chunk, add] of pairs) out = out.replace(chunk, `${chunk}\n${add}`);
      return out;
    };
    shader.vertexShader = after(shader.vertexShader, [
      ["#include <common>", "varying vec3 vWorldPos;"],
      ["#include <begin_vertex>", SNOW_VERTEX],
      ...(own.vertex ?? []),
    ]);
    shader.fragmentShader = after(shader.fragmentShader, [
      ["#include <common>", SNOW_COMMON],
      ...(own.fragment ?? []),
    ]).replace(
      "#include <fog_fragment>",
      `${snowSurface(own.glitter, own.sky)}\n#include <fog_fragment>`,
    );
  };
  return material;
}
