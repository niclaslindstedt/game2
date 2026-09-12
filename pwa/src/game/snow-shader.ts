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
//
// ...AND THE COUNTRY PAST THE COAT IS THE THIRD SURFACE MADE OF SNOW. The
// coat is a fine sheet that follows the CAR, because a 2.5 m grid over the
// whole country is a quarter of a million vertices re-sampled every time the
// car walks a cell. Everything past it is the ground tiles on their own
// fourteen-metre lattice — and the tiles are drawn out to 640 m ANYWAY, so
// what the far snow needs is not a mesh, it is this file. Give them a white
// of their own and plain Lambert and they are a different snow, which puts
// the coat's square rim across every hillside as a hard line; and because
// the square is anchored to the car, that line WALKS as you drive at it,
// which is the half a player notices.
//
// So the tiles graft the same source, weighted by how much snow the paint put
// on each vertex (`snowSurface`'s `cover`), and take their white from the same
// `snowAlbedo`. It costs a hash and a `pow` per ground fragment and not one
// triangle — which is exactly why the shading reaches 640 m where the sheet
// cannot.

import * as THREE from "three";

import { valueNoise } from "../lib/noise.ts";
import { SUN_DIR } from "./sun-dir.ts";

/** R47 — HOW MUCH BRIGHTER THAN ITS OWN PAINT SNOW RENDERS. Every other
 * ground in the game is a dark material under a bright sky and comes out
 * near the colour it was authored at. Snow is the opposite: it returns
 * something like nine tenths of everything that lands on it, which is more
 * than a material multiplied by a light can say. Painted at plain white it
 * still arrives GREY — the ground detail map takes a few per cent off it and
 * tints it warm, the key light is a warm sun, and a winter sun is low, so
 * the diffuse term on flat ground is well under one. Measured on a taiga
 * winter, white paint rendered #c4c4bb: a warm three-quarter grey, on the
 * one surface a player would describe as white before anything else.
 *
 * So the tone is pushed PAST white and allowed to clip, which is what snow
 * does to an eye and to a camera both. The shaded side still reads, because
 * `SHADE` is a real blue-grey and the noise between them is what gives a
 * snowfield its form; what clips is the lit side, which is the half that is
 * supposed to be blinding. */
const GLARE = 1.28;
/** Fresh snow's own white, and the shade the noise leans it toward. COOL,
 * for the same reason it is bright: the light falling on it is a warm sun
 * (`sunLight`, environment.ts) over a warm-flecked grit map, and a neutral
 * white painted under both renders beige. Snow reads as snow when it is a
 * touch bluer than the light on it, which is also what it really is — most
 * of what fills a snowfield's shadows is sky. */
const FRESH = new THREE.Color(0xf8fbff);
const SHADE = new THREE.Color(0xc9daf2);

/** THE COLOUR OF UNTOUCHED SNOW at a world point, before any light reaches
 * it — the one albedo every surface made of snow is painted from.
 *
 * It is a FIELD and not a constant, and that is the half that matters at a
 * seam: the slow lean toward `SHADE` is what stops a snowfield reading as a
 * blank, and it is drawn from the stage's own paint seed, so the coat and
 * the tiles past it carry the same drift of blue-grey across the same
 * hillside. Two flat whites of the same value still show their boundary;
 * one noise field running through both cannot. */
export function snowAlbedo(out: THREE.Color, x: number, z: number, seed: number): THREE.Color {
  return out
    .copy(FRESH)
    .lerp(SHADE, valueNoise(x, z, 46, seed + 71) * 0.55)
    .multiplyScalar(GLARE);
}

/** ...and what a wheel does to that colour, as a multiplier rather than a
 * tone of its own, so it composes with whatever `snowAlbedo` answered.
 *
 * Only a LITTLE darker, and that is the correction rather than the
 * compromise. Pressing snow hardly moves its albedo — it is the same
 * crystals, closer together, still returning most of what falls on them. A
 * driven patch looks darker because it is SHAPED: it has sunk, so its slopes
 * have turned away from the sun and its floor sees less sky. Given a grey
 * tint on top of that the snow went twice-darkened — a grey stripe that
 * stayed grey in flat overcast, where the real thing all but disappears. The
 * small blue that is left is the one honest difference: worked snow is on
 * its way to ice, and ice gives a little less back. */
export const SNOW_PACK = { r: 0.873, g: 0.899, b: 0.933 };

/** HOW MUCH OF THE GROUND'S GRIT MAP SNOW WEARS, 0..1 — and it is not much.
 *
 * `detailTexture()` is a GRIT map: a white ground flecked with warm greys,
 * authored so grass and gravel have a grain between the tile lattice's
 * fourteen-metre vertices. On the country's tiles that is invisible and
 * useful — at a hundred metres a fleck is well under a pixel and all it does
 * is stop a big colour field reading as plastic. Two metres from the lens on
 * the coat it is neither: the flecks are the size of a hand, and warm specks
 * scattered over white do not read as snow at all, they read as GRIT. The
 * first pass to give the coat the tiles' map made the ground under the car
 * look like wet gravel.
 *
 * So snow takes the map's grain at a third depth and with its HUE thrown
 * away — the luminance only, which is a neutral sparkle in the surface
 * rather than dirt lying on it. Snow does have a fine texture; what it does
 * not have is somebody else's warm flecks.
 *
 * Weighted by the same `cover` as everything else here, so a hillside's
 * bare rock keeps the full grit map and the snow over it does not, and the
 * coat and the tiles past it are cleaned by exactly the same amount — which
 * is what keeps the rim invisible while both get cleaner. */
const GRAIN = 0.34;

/** Reshape the ground's grit map where the surface is snow. Grafted after
 * `#include <map_fragment>`, which leaves `sampledDiffuseColor` in scope and
 * has already multiplied it in — so this divides that back out and puts the
 * neutral, weakened grain in its place. No second texture fetch. */
function snowGrain(cover: string): string {
  return `
    {
      float snowC = ${cover};
      if (snowC > 0.0) {
        float grit = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 clean = diffuseColor.rgb / max(sampledDiffuseColor.rgb, vec3(0.02));
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          clean * mix(1.0, grit, ${GRAIN.toFixed(2)}),
          snowC
        );
      }
    }
  `;
}

/** HOW FAR THE GLITTER CARRIES, m — the band it fades out over.
 *
 * The crystals are hashed per 1/7 m of world space and given a lobe tight
 * enough to be a point of light, so a glint is about a hand's breadth of
 * ground. Past the distance where that is smaller than a pixel the term
 * stops being sparkle and becomes per-pixel noise that crawls as the camera
 * turns — which on a 1280-wide frame is around 160 m. Faded out over the
 * approach to it, the near field twinkles and the far field is clean.
 *
 * It is a fade on DISTANCE and not a cap on a surface, which is the whole
 * difference between this and what it replaces: every surface made of snow
 * fades on the same curve, so nothing draws an edge where one ends. */
const TWINKLE = { from: 45, to: 170 };

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
 * leaves it at 1 and pays nothing.
 *
 * `cover` is a GLSL expression for HOW MUCH OF THIS FRAGMENT IS SNOW, 0..1,
 * and it is what lets the ground tiles graft this at all. A tile is one mesh
 * carrying a whole hillside — meadow at its foot, bedrock on its faces, snow
 * over the top of both — so the terms cannot simply be applied to it: they
 * are weighted by the same cover the paint laid its white on with
 * (`terrain.ts`), and a vertex with no snow on it shades exactly as it did
 * before. The surfaces that are snow all the way through (the coat, the
 * trail) leave it at 1 and the branch folds away. */
export function snowSurface(glitter = 1, sky = "1.0", cover = "1.0"): string {
  return `
    {
      float snowC = ${cover};
      if (snowC > 0.0) {
        vec3 snowN = normalize(normal);
        vec3 snowEye = cameraPosition - vWorldPos;
        vec3 snowV = normalize(snowEye);
        // Wrap lighting: the light that went INTO the snow and came back.
        float wrapped = max(0.0, (dot(snowN, uSun) + 0.6) / 1.6);
        gl_FragColor.rgb *= mix(1.0, 0.72 * (${sky}) + 0.45 * wrapped, snowC);
        // ...and the crystals that happened to line up, for as far out as
        // one of them is still bigger than a pixel (TWINKLE).
        vec3 snowH = normalize(uSun + snowV);
        vec3 facet = normalize(snowN + snowHash(floor(vWorldPos * 7.0)) * 0.55);
        float glint = pow(max(0.0, dot(facet, snowH)), 220.0);
        float twinkle =
          1.0 - smoothstep(${TWINKLE.from.toFixed(1)}, ${TWINKLE.to.toFixed(1)}, length(snowEye));
        gl_FragColor.rgb +=
          glint * ${glitter.toFixed(2)} * 1.6 * max(0.0, uSun.y) * snowC * twinkle;
      }
    }
  `;
}

/** A Lambert material with the snow terms already in it, and a hook for
 * whatever else the caller's own surface needs to add.
 *
 * `name` IS LOAD-BEARING — it is `graftShader`'s rule (car-surface.ts),
 * which owns the reasoning, applied to a factory instead of a chain. Every
 * material this function makes carries the same `onBeforeCompile` SOURCE,
 * which is three's default program cache key, so two snow surfaces that
 * also agree on every other program parameter (Lambert, vertex colours, a
 * map, fog, lights) are handed whichever program compiled first.
 *
 * The coat and the country's tiles are exactly that pair. Unnamed, the coat
 * drew with the TILES' shader, read a `snow` attribute its geometry does
 * not have, took `cover` 0 from it — and silently lost its wrap lighting,
 * its glitter and its blanket-depth discard while still looking like snow.
 * Nothing errors and nothing is missing; the surface is just quietly a
 * different one. So every caller names its surface.
 *
 * `extra` is spliced in the same way `onBeforeCompile` would do it by hand:
 * each entry names a three.js shader chunk and the source to put after it,
 * which is how the coat adds its blanket-depth discard and the trail adds
 * its tread. Handed the shader object too, so a caller can declare its own
 * uniforms and attributes beside them. */
export function snowLambert(
  name: string,
  options: THREE.MeshLambertMaterialParameters,
  graft?: (shader: THREE.WebGLProgramParametersWithUniforms) => {
    vertex?: [string, string][];
    fragment?: [string, string][];
    glitter?: number;
    sky?: string;
    cover?: string;
  },
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ fog: true, ...options });
  material.customProgramCacheKey = (): string => `snow:${name}`;
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
      // Only where there IS a map to reshape: the trail carries none, and
      // `sampledDiffuseColor` does not exist in a shader three compiled
      // without `USE_MAP`.
      ...(options.map
        ? [["#include <map_fragment>", snowGrain(own.cover ?? "1.0")] as [string, string]]
        : []),
      ...(own.fragment ?? []),
    ]).replace(
      "#include <fog_fragment>",
      `${snowSurface(own.glitter, own.sky, own.cover)}\n#include <fog_fragment>`,
    );
  };
  return material;
}
