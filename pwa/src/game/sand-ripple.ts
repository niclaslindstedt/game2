// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — WHAT MAKES SAND READ AS SAND: the wind's own fingerprint on it.
//
// A desert stage draws a country with real dunes in it — twenty-odd metres
// of sand standing over the trough beside it, three hundred across the wind
// (`STAGE_RULES.dunes`) — and from the seat it read as bare rolling ground
// in a warm colour. The relief is there; what was missing is everything at
// the scale an eye actually identifies sand BY.
//
// Two things, and they are both facts about wind rather than about light:
//
//   * THE RIPPLES. Sand is the one ground in the game that is not laid by
//     water or grown — it is SORTED, grain by grain, into a corrugation a
//     hand's width apart running square across the wind. Nothing else in a
//     landscape looks like that, which is why it is the cue that does the
//     work: a surface with ripples on it is sand before the colour has been
//     considered. They are far too fine to be geometry at any lattice this
//     game could afford, so they are a NORMAL — the light on a ripple is
//     the whole of what is seen of one anyway.
//
//   * THE SHEEN. Dry quartz sand is not matte. It carries a broad forward
//     lobe that lifts the windward face toward the sun and leaves the slip
//     face in the shade behind its own crest, and that contrast down a dune
//     flank is the second half of reading one as a dune rather than a hill.
//
// WHAT IT IS NOT ON. Rock, and anything steep. The desert's ground is sand
// AND stone — the wind strips the flanks and leaves the pans bare — and
// ripples running up a cliff face would undo the geology the paint just
// drew. The gate is the surface's own lean: a flat lies under sand, a face
// does not, which is the same rule `bareRock` paints by (`ground-rules.ts`)
// and needs no attribute of its own to ask.
//
// ...and it FADES OUT WITH DISTANCE. A ripple is centimetres; past a few
// tens of metres it is smaller than a pixel, and a high-frequency normal
// sampled under a pixel is aliasing rather than detail — it crawls and
// sparkles as the camera moves. Held to the near ground, where a ripple is
// something an eye could actually resolve, and gone before it can shimmer.

import * as THREE from "three";

import { SUN_DIR } from "./sun-dir.ts";

/** The ripple field, in the units the shader reads it in.
 *
 * `pitch` is how far apart the corrugations run, m — real wind ripples sit
 * between about 5 and 20 cm, and the larger end of that is what survives
 * being looked at from a car. `cross` is the second, longer wave laid
 * across the first at an angle: one wave alone is a grating, and a grating
 * is the one thing a natural surface never looks like. `amp` is how far
 * they tilt the surface normal — small, because a ripple is millimetres
 * deep and all that is wanted is the light moving over it. */
const RIPPLE = { pitch: 0.21, cross: 0.55, amp: 0.4, crossAmp: 0.38 };

/** How far the ripples reach, m: full strength inside `near`, gone by
 * `far`. Past that a ripple is under a pixel and would only alias. */
const REACH = { near: 26, far: 70 };

/** Where the ground stops being sand and starts being rock, as the world
 * normal's Y. Sand lies on a flat and runs off a face; this is the lean at
 * which the wind has stripped it, matching the band the tile paint puts
 * bedrock through (`ROCK_SLOPE`, ground-rules.ts). */
const LIES = { from: 0.86, band: 0.16 };

/** How hard the sheen lifts the windward face. Broad and weak: sand glows
 * toward the sun rather than glinting at it, and a tight lobe on ground
 * this size reads as wet rock. */
const SHEEN = 0.34;

/** Graft the wind onto a material that draws sand. Returns the material, so
 * it can wrap a constructor call. Only ever called for a country whose
 * loose ground IS sand — everywhere else this is not a cheaper effect, it
 * is a wrong one. */
export function sandRipple<T extends THREE.Material>(material: T): T {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.uniforms.uSun = { value: SUN_DIR };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vSandPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 uSun;
         varying vec3 vSandPos;`,
      )
      // After the library's lighting has resolved, and before the fog: a
      // ripple lit through the air it is being seen through is a ripple in
      // the fog rather than on the ground.
      .replace(
        "#include <fog_fragment>",
        `{
           vec3 nrm = normalize(vNormal);
           // Sand lies on the flat and runs off a face.
           float lies = smoothstep(
             ${(LIES.from - LIES.band).toFixed(3)}, ${LIES.from.toFixed(3)}, nrm.y);
           float near = 1.0 - smoothstep(
             ${REACH.near.toFixed(1)}, ${REACH.far.toFixed(1)}, length(cameraPosition - vSandPos));
           float sand = lies * near;
           if (sand > 0.001) {
             // Two crossed waves: the wind's own corrugation, and a longer
             // one laid over it so the field is not a grating.
             vec2 d1 = vec2(0.9239, 0.3827);
             vec2 d2 = vec2(-0.3827, 0.9239);
             float f1 = 6.2831853 / ${RIPPLE.pitch.toFixed(3)};
             float f2 = 6.2831853 / ${RIPPLE.cross.toFixed(3)};
             // The ripple field's own gradient, which is what tilts the
             // normal — the height of a ripple is never drawn, only its
             // slope, because the slope is all the light responds to.
             vec2 g =
               cos(dot(vSandPos.xz, d1) * f1) * d1 * ${RIPPLE.amp.toFixed(3)} +
               cos(dot(vSandPos.xz, d2) * f2) * d2 * ${RIPPLE.crossAmp.toFixed(3)};
             vec3 rippled = normalize(nrm + vec3(g.x, 0.0, g.y) * sand);
             float was = max(0.0, dot(nrm, uSun));
             float now = max(0.0, dot(rippled, uSun));
             gl_FragColor.rgb *= 1.0 + (now - was) * 0.5 * sand;
             // ...and the broad forward sheen dry sand carries, which is
             // what separates a lit windward face from the slip face behind
             // its own crest.
             vec3 view = normalize(cameraPosition - vSandPos);
             float lobe = pow(max(0.0, dot(normalize(uSun + view), rippled)), 6.0);
             gl_FragColor.rgb += lobe * ${SHEEN.toFixed(3)} * sand * max(0.0, uSun.y)
               * gl_FragColor.rgb;
           }
         }
         #include <fog_fragment>`,
      );
  };
  material.needsUpdate = true;
  return material;
}
