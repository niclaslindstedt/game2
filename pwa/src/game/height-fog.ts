// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AIR THE WORLD IS DRAWN THROUGH — three's distance fog, with the
// valley mist, the sun in it, the mountain's shadow and the clouds'
// shadows grafted on, for every material in the scene at once.
//
// Three's fog is one chunk every built-in material includes, and it knows
// one thing: how far away a fragment is. Everything here wants to know
// WHERE it is — how high (the mist lies in the valleys and the road climbs
// out of it), which way the sun is from it (the mist glows toward the sun
// and is grey away from it), and what stands between it and the sun (a
// ridge, a cumulus). So the chunk is REPLACED, once, before the first
// material compiles: the vertex half carries the world position down, the
// fragment half integrates the mist along the ray, shades the ground by the
// shadow map and the cloud field, and then applies the distance fog it
// always did.
//
// The uniforms are the one trick worth knowing about. three clones a
// material's uniforms per material and refreshes only the fog's own four;
// anything added beside them would be a frozen copy in every material. A
// value that is a PLAIN OBJECT survives the clone by reference — three
// copies vectors and colours, not `{x, y, z, w}` literals — so these are
// literals, mutated in place by the environment every frame, and every
// material in the scene reads the same four numbers without being told.
// The shadow map is a texture; three clones the wrapper and shares the
// data, and the data is what is rewritten.

import * as THREE from "three";

import { CLOUD_DENSITY_GLSL, cloudNoiseGlsl } from "./cloud-field.ts";

type V4 = { x: number; y: number; z: number; w: number };
type V3 = { x: number; y: number; z: number };

/** Cells per side of the mountain-shadow map, and metres per side. */
export const SHADOW_CELLS = 96;
export const SHADOW_SPAN = 3600;

/** Everything the graft reads, shared by reference with every material. */
export const HEIGHT_FOG = {
  /** The mist: the top of the sheet (m over the sea), 1 / its softness
   * (1/m), its extinction per metre inside, and how lit it is (0..1 — the
   * share of the mist's colour that is the lit tone rather than the
   * shade). */
  mist: { x: 0, y: 0.1, z: 0, w: 1 } as V4,
  /** What the mist is coloured, lit by the sky and in shade. */
  mistLit: { x: 1, y: 1, z: 1 } as V3,
  mistShade: { x: 0.6, y: 0.6, z: 0.65 } as V3,
  /** The real sun's direction (unit, pointing at it) and the strength of
   * the glow it puts in the mist toward it. */
  sun: { x: 0, y: 1, z: 0, w: 0 } as V4,
  sunColor: { x: 1, y: 0.9, z: 0.7 } as V3,
  /** The mountain-shadow map's frame: the window's origin (x, z), 1/span,
   * and how much of the ground's light a shadow takes (the beam's share,
   * 0 for none — which also switches the lookup off). */
  shadowFrame: { x: 0, y: 0, z: 1 / SHADOW_SPAN, w: 0 } as V4,
  /** The range the map's bytes span: lo and the height they cover, m over
   * the sea; then HOW FAR THROUGH THE PAIR the sun stands, 0..1 — the map
   * holds the shadow at two moments either side of this one and the frame
   * reads between them (mountain-shadow.ts). */
  shadowRange: { x: 0, y: 1, z: 0, w: 0 } as V4,
  /** The cumulus layer's shadow on the ground: altitude, 1/scale, and the
   * layer's drift offset; and its coverage, sharpness, a spare and the
   * strength (0 switches it off). How deep the field behind it is read is
   * `SHADOW_OCTAVES`, which the shader is compiled with rather than told. */
  cloudA: { x: 1200, y: 1 / 900, z: 0, w: 0 } as V4,
  cloudB: { x: 0, y: 0.75, z: 0, w: 0 } as V4,
  /** The layer's streak axis (the wind's unit vector), its stretch, and
   * its seed's offset along the streak (`seed × 13.7`, as `cloudUv`). */
  cloudC: { x: 1, y: 0, z: 1, w: 0 } as V4,
  /** Two bytes a cell: the near half of the pair in red, the far half in
   * green. A row is `2 × SHADOW_CELLS` bytes, which has to stay a multiple
   * of the four three unpacks textures at. */
  shadowMap: new THREE.DataTexture(
    new Uint8Array(SHADOW_CELLS * SHADOW_CELLS * 2),
    SHADOW_CELLS,
    SHADOW_CELLS,
    THREE.RGFormat,
    THREE.UnsignedByteType,
  ),
};

HEIGHT_FOG.shadowMap.minFilter = THREE.LinearFilter;
HEIGHT_FOG.shadowMap.magFilter = THREE.LinearFilter;
HEIGHT_FOG.shadowMap.wrapS = THREE.ClampToEdgeWrapping;
HEIGHT_FOG.shadowMap.wrapT = THREE.ClampToEdgeWrapping;
HEIGHT_FOG.shadowMap.needsUpdate = true;

/** How deep the CLOUD SHADOW reads its field. Three octaves: the sheet it
 * shades from is the best part of a kilometre across and what lands on the
 * ground is a soft patch rather than a picture of the cloud, so the arms
 * under the mass only have to keep its edge off a circle. A literal rather
 * than a uniform because this field is sampled on every lit fragment in the
 * frame, and `cloudNoiseGlsl` says what a depth the compiler cannot see
 * costs there. */
const SHADOW_OCTAVES = 3;

/** The graft's own functions, for the fog chunk AND the sky dome — the dome
 * draws the same mist over the same shadow map, and a cloud sea that
 * disagreed with the fog on the ground under it would show a seam at the
 * horizon.
 *
 * The noise comes out with it, because the two share a lattice and a GLSL
 * function may only be declared once in a shader. `fields` and `fbms` are
 * the EXTRA depths the caller reads at beyond the cloud shadow's own — the
 * dome asks for its sheets and its mist lumps here rather than emitting a
 * second copy of the lattice beside this one. */
export function heightFogGlsl(
  fields: readonly number[] = [],
  fbms: readonly number[] = [],
): string {
  return /* glsl */ `
uniform vec4 hfMist;
uniform vec3 hfMistLit;
uniform vec3 hfMistShade;
uniform vec4 hfSun;
uniform vec3 hfSunColor;
uniform vec4 hfShadowFrame;
uniform vec4 hfShadowRange;
uniform vec4 hfCloudA;
uniform vec4 hfCloudB;
uniform vec4 hfCloudC;
uniform sampler2D hfShadowMap;
${cloudNoiseGlsl([SHADOW_OCTAVES, ...fields], fbms)}
${CLOUD_DENSITY_GLSL}
// How much of a ray from y0 to y1 over length len is inside the mist, as
// the fraction of the light it takes. The sheet is full density under its
// top and thins out over 1/hfMist.y above it; the integral of that along
// the ray has a closed form, split at the top.
float mistAmount( float y0, float y1, float len ) {
  if ( hfMist.z <= 0.0 ) return 0.0;
  float h0 = ( y0 - hfMist.x ) * hfMist.y;
  float h1 = ( y1 - hfMist.x ) * hfMist.y;
  float lo = min( h0, h1 );
  float hi = max( h0, h1 );
  float mean;
  if ( hi - lo < 1e-4 ) {
    mean = min( 1.0, exp( - max( lo, 0.0 ) ) );
  } else {
    float below = max( 0.0, min( hi, 0.0 ) - lo );
    float above = exp( - max( lo, 0.0 ) ) - exp( - max( hi, 0.0 ) );
    mean = ( below + above ) / ( hi - lo );
  }
  return 1.0 - exp( - hfMist.z * len * mean );
}
// The ceiling of the mountain's shadow over a point on the ground, m —
// read between the two moments of the sun the map brackets, so the
// terminator sweeps down a valley wall instead of jumping down it every
// time the march is redone.
float shadowCeiling( vec2 xz ) {
  vec2 uv = ( xz - hfShadowFrame.xy ) * hfShadowFrame.z;
  vec2 v = texture2D( hfShadowMap, uv ).rg;
  return hfShadowRange.x + mix( v.x, v.y, hfShadowRange.z ) * hfShadowRange.y;
}
// 1 where a point is in the country's shadow, softened over a few metres
// so the edge is a penumbra rather than a staircase of cells.
float mountainShade( vec3 p ) {
  if ( hfShadowFrame.w <= 0.0 ) return 0.0;
  vec2 uv = ( p.xz - hfShadowFrame.xy ) * hfShadowFrame.z;
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
  return smoothstep( - 4.0, 4.0, shadowCeiling( p.xz ) - p.y );
}
// 1 where a cumulus stands between a point and the sun.
float cloudShade( vec3 p ) {
  if ( hfCloudB.w <= 0.0 || hfSun.y <= 0.02 || hfCloudA.x <= p.y ) return 0.0;
  float dist = ( hfCloudA.x - p.y ) / hfSun.y;
  vec2 q = p.xz + hfSun.xz * dist + hfCloudA.zw;
  float along = q.x * hfCloudC.x + q.y * hfCloudC.y;
  float across = - q.x * hfCloudC.y + q.y * hfCloudC.x;
  vec2 uv = vec2( along / hfCloudC.z * hfCloudA.y + hfCloudC.w, across * hfCloudA.y );
  float n = cloudField${SHADOW_OCTAVES}( uv );
  return cloudDensity( hfCloudB.x, hfCloudB.y, n ) * hfCloudB.w;
}
// What the mist is coloured, seen along a ray: the lit tone or the shade,
// and the sun's own glow through it toward the sun.
vec3 mistColor( vec3 dir, float shade ) {
  vec3 tone = mix( hfMistLit, hfMistShade, shade );
  float toward = pow( max( dot( dir, hfSun.xyz ), 0.0 ), 6.0 );
  return tone + hfSunColor * toward * hfSun.w;
}
`;
}

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif
`;

/** MESH MATERIALS ONLY. `transformed` is the local vertex position, declared
 * by every mesh vertex shader three builds and by no sprite one — so a
 * material that reaches this chunk without it fails to compile, silently,
 * and whatever wore it is simply never drawn. Anything sprite-based turns
 * fog off instead (`name-tag.ts`). */
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vec4 fogWorld = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		fogWorld = batchingMatrix * fogWorld;
	#endif
	#ifdef USE_INSTANCING
		fogWorld = instanceMatrix * fogWorld;
	#endif
	vFogWorld = ( modelMatrix * fogWorld ).xyz;
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${heightFogGlsl()}
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	// The ground in the country's shadow, and under a cloud: the beam's
	// share of its light is gone and the skylight is what is left.
	float hfShade = max( mountainShade( vFogWorld ), cloudShade( vFogWorld ) );
	gl_FragColor.rgb *= 1.0 - hfShade * hfShadowFrame.w;
	// The mist along the ray, coloured for where it is looked at through.
	vec3 hfRay = vFogWorld - cameraPosition;
	float hfLen = length( hfRay );
	float hfMistAmount = mistAmount( cameraPosition.y, vFogWorld.y, hfLen );
	if ( hfMistAmount > 0.0 ) {
		vec3 hfTone = mistColor( hfRay / max( hfLen, 1e-3 ), hfShade * hfMist.w );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, hfTone, hfMistAmount );
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

let installed = false;

/** Put the graft in. Once, before the first material is compiled — three
 * resolves `#include` at compile time, so a chunk replaced later reaches
 * only the materials compiled after it. */
export function installHeightFog(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;
  // The values, by reference, onto every built-in shader that fogs — and
  // onto the library's own fog set, for any material assembled from it.
  const values = fogUniforms();
  Object.assign(THREE.UniformsLib.fog, values);
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (shader.uniforms.fogColor) Object.assign(shader.uniforms, values);
  }
}

/** The uniform set, for the dome's own material as well as the graft. */
export function fogUniforms(): Record<string, THREE.IUniform> {
  return {
    hfMist: { value: HEIGHT_FOG.mist },
    hfMistLit: { value: HEIGHT_FOG.mistLit },
    hfMistShade: { value: HEIGHT_FOG.mistShade },
    hfSun: { value: HEIGHT_FOG.sun },
    hfSunColor: { value: HEIGHT_FOG.sunColor },
    hfShadowFrame: { value: HEIGHT_FOG.shadowFrame },
    hfShadowRange: { value: HEIGHT_FOG.shadowRange },
    hfCloudA: { value: HEIGHT_FOG.cloudA },
    hfCloudB: { value: HEIGHT_FOG.cloudB },
    hfCloudC: { value: HEIGHT_FOG.cloudC },
    hfShadowMap: { value: HEIGHT_FOG.shadowMap },
  };
}

/** Copy new bytes into the shadow map and mark it for upload. */
export function writeShadowMap(bytes: Uint8Array): void {
  (HEIGHT_FOG.shadowMap.image.data as Uint8Array).set(bytes);
  HEIGHT_FOG.shadowMap.needsUpdate = true;
}
