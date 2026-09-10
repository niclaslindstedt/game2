// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WORLD IN THE WINDOWS — what the top detail level puts on a car's
// glass, over the baked gradient every level already carries.
//
// car/greenhouse.ts bakes one reflection into the vertex colours: pale sky
// at the header, dark cabin at the sill. It costs nothing and it reads at
// any distance, but it is painted ON the pane, so it never moves: a car
// standing still and a car thrown sideways under a low sun carry the same
// window. What a real window does instead is show the SKY IT IS POINTED AT
// — the horizon lying across the glass at the angle the pane is tilted, the
// land dark under it, the clouds sliding through, and the sun as a hard
// smear that swings the length of the greenhouse as the car turns. The
// horizon in a windscreen is the strongest cue there is that a car is a
// polished object standing in weather rather than a coloured shape.
//
// So this is a REFLECTION rather than a picture of one, and everything in
// it is the stage's own: the sky's two colours this hour, the cloud tone
// and how much of it there is, the country's ground under the horizon, and
// the real sun with the real beam behind it (environment.ts writes them,
// the way it writes the height fog's).
//
// IT IS A FEW DOZEN INSTRUCTIONS ON WINDOW PIXELS AND NOTHING ELSE. No
// second pass, no render target, no cube map, no texture and not one extra
// draw call — a car's glass is drawn exactly as often as before, and the
// only thing that changed is what its fragments compute. That is the whole
// reason it can be afforded on fifteen cars at once.
//
// THE COAT ON TOP OF THE PANE REFLECTS AS WELL (`reflectFilm`), and that is
// not a refinement — without it the effect is gone by the second corner of a
// gravel stage. The grime film (car/wipers.ts) is a mesh of its own laid a
// few millimetres proud of the glass and drawn after it, up to seven eighths
// opaque; a reflection struck on the pane UNDER it is a reflection nobody
// sees on a car that has been anywhere. And the dirt is where a reflection
// physically belongs anyway: it lies on the outer surface, which is the
// surface the sky bounces off. So the coat catches the same sky the pane
// does — SCATTERED rather than mirrored, because dust is not a mirror: the
// horizon in it is a smear of sky-glare instead of a line. That is also the
// picture a dirty rally car actually presents, and it makes the swept arc
// read for free — clean glass with a sharp horizon in it, inside a caked
// screen that only glares.
//
// Two things it does NOT do, on purpose. It never reflects the geometry
// standing beside the road: the trees at the horizon are a ragged band, not
// the trees that are actually there, because anything else means a second
// view of the world per car. And it is not on below the top detail stop
// (`GLASS_REFLECT`) — the baked gradient is what the other two levels get,
// and it is why they can still draw a window for free.

import * as THREE from "three";
import type { BiomeId } from "@engine";

import { graftShader } from "../car-surface.ts";
import { HEIGHT_FOG } from "../height-fog.ts";
import { type DrawnLayer } from "../sky-shader.ts";
import { type Preset } from "../sky.ts";

type V3 = { x: number; y: number; z: number };
type V4 = { x: number; y: number; z: number; w: number };

/** THE SKY THE GLASS IS SHOWING, shared by reference with every pane on the
 * road — one object, mutated in place by the environment each frame, read by
 * every car's material without being told (the trick height-fog.ts explains:
 * a uniform added in `onBeforeCompile` is not cloned, so the value stays the
 * same object it was handed).
 *
 * The SUN is not here: it is `HEIGHT_FOG`'s, bound below by reference, so
 * the sun in a window and the sun in the mist are the one number written
 * once a frame in one place. */
export const GLASS_SKY = {
  /** The sky straight up, and the sky at the horizon — or, under a deck,
   * that lid's underside overhead and out at its rim. */
  zenith: { x: 0.42, y: 0.62, z: 0.86 } as V3,
  horizon: { x: 0.75, y: 0.85, z: 0.95 } as V3,
  /** The lit face of the cloud in it. */
  cloud: { x: 1, y: 1, z: 1 } as V3,
  /** The country under that horizon: the open ground, and the band of trees
   * standing on it. Both already washed toward the fog by the distance a
   * reflected horizon is always at. */
  ground: { x: 0.34, y: 0.36, z: 0.31 } as V3,
  trees: { x: 0.15, y: 0.18, z: 0.15 } as V3,
  /** How much cloud there is (0..1), how tall the treeline stands (as a
   * share of the reflected ray's rise), and the cloud layer's drift along
   * its own lattice — the sheet the sky is actually drawing, so what slides
   * through a window is the weather that is overhead. */
  look: { x: 0.35, y: 0.055, z: 0, w: 0 } as V4,
};

/** How tall the skyline stands in the glass, per country — the one thing
 * about the land the reflection can say cheaply, and the difference between
 * a window in a forest and a window in a desert. A share of the reflected
 * ray's rise, so it is an angle: the taiga is a wall of spruce a few degrees
 * up, the desert is a bare line, and the alps put rock most of the way up
 * the pane. */
export const SKYLINE: Record<BiomeId, number> = {
  taiga: 0.06,
  desert: 0.018,
  alpine: 0.13,
};

/** THE SKY A WINDOW IS SHOWING, into the block above — written by the
 * environment every frame, on the same terms the height fog's numbers are:
 * one object, shared by reference with every pane on the road.
 *
 * All of it is the sky the dome is already drawing — its two colours this
 * hour, the cloud tone, the lid's underside where there is one, and the
 * `over` sheet's own coverage and drift — so a window shows the weather
 * that is actually overhead rather than a picture of some other one. The
 * SUN is not written here: the glass reads `HEIGHT_FOG.sun` by reference,
 * which the frame sets once for everything that needs it. */
export function glassSky(
  p: Preset,
  biome: BiomeId,
  shown: boolean,
  /** The lowest sheet over the eye — what a window can actually see
   * through — or null for an open sky over it. */
  over: DrawnLayer | null,
): void {
  // Under a deck the sky IS the lid: its underside overhead, and the light
  // that gets in under its rim at the horizon.
  const zenith = SKY_TONE.set(p.deck ? p.deck.overhead : p.zenith);
  Object.assign(GLASS_SKY.zenith, { x: zenith.r, y: zenith.g, z: zenith.b });
  const horizon = SKY_TONE.set(p.deck ? p.deck.rim : p.horizon);
  Object.assign(GLASS_SKY.horizon, { x: horizon.r, y: horizon.g, z: horizon.b });
  const cloud = SKY_TONE.set(p.cloud);
  Object.assign(GLASS_SKY.cloud, { x: cloud.r, y: cloud.g, z: cloud.b });
  // The land, at the distance a reflected horizon is always at: the
  // hemisphere's own ground colour, washed most of the way into the fog —
  // and the trees on it as the same tone with the light taken out of it.
  const air = AIR_TONE.set(p.fog);
  const ground = SKY_TONE.set(p.hemiGround).lerp(air, 0.45);
  Object.assign(GLASS_SKY.ground, { x: ground.r, y: ground.g, z: ground.b });
  const trees = SKY_TONE.set(p.hemiGround).multiplyScalar(0.4).lerp(air, 0.3);
  Object.assign(GLASS_SKY.trees, { x: trees.r, y: trees.g, z: trees.b });
  GLASS_SKY.look.y = SKYLINE[biome];
  // A lid is not a sheet a pane sees through — it is the sky itself up
  // there, and the window has it in the two colours above — so what it
  // contributes is the ragged relief of its own underside.
  if (!shown) GLASS_SKY.look.x = 0;
  else if (p.deck) GLASS_SKY.look.x = 0.3 * p.deck.relief;
  else GLASS_SKY.look.x = over ? over.layer.coverage : 0;
  // The drift, off the layer's own offset and its own cell size, so what
  // slides through a window keeps pace with what is overhead.
  const pitch = over ? 1 / over.layer.scale : 0;
  GLASS_SKY.look.z = over ? over.offsetX * pitch : 0;
  GLASS_SKY.look.w = over ? over.offsetZ * pitch : 0;
}

/** Scratch for the mixes above — a frame's worth of tones, not a frame's
 * worth of colours. */
const SKY_TONE = new THREE.Color();
const AIR_TONE = new THREE.Color();

/** What a pane shows of the world square-on, and how fast that climbs as the
 * view goes glancing (Schlick's own shape, on the falloff the per-frame
 * glint already uses). `strength` is the master the whole effect is scaled
 * by; `ceiling` keeps the pane short of solid even edge-on, for the reason
 * the per-frame numbers have one — a window that closes completely is a
 * panel. */
const REFLECT = { base: 0.45, falloff: 3, strength: 1, ceiling: 0.97 };

/** ...and what the COAT over it does with the same sky. `share` is how much
 * of the pane's own reflectance a filmed surface keeps — less, because dirt
 * is matte and only part of what it does with light is a bounce. `scatter`
 * is how far the direction it bounces is dragged off the mirror and toward
 * straight up: a dust film does not return the horizon, it returns the SKY,
 * which is why a filthy screen glares evenly instead of carrying a line
 * across it. */
const COAT = { share: 0.55, scatter: 0.55 };

/** The cloud plane's lattice, and how far toward the horizon it is allowed
 * to stretch. The uv is the reflected ray's own footprint on a sheet
 * overhead, which is what compresses the bands toward the horizon the way a
 * real sky does — and which runs away to infinity AT the horizon, where the
 * clamp holds it to eight times the overhead pitch and the fade below takes
 * what is left. */
const CLOUD = { scale: 0.3, flattest: 0.12 };

/** The value-noise lattice, in the hash the sky's own field uses — the one
 * that does not go through `sin`, which loses its mind in mediump on a phone
 * (cloud-field.ts states why at length). Named apart from that one because
 * a material carrying both grafts would be declaring the same function
 * twice, and a shader that fails to compile is a car with no windows. */
const NOISE_GLSL = /* glsl */ `
float glassHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float glassNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( glassHash( i ), glassHash( i + vec2( 1.0, 0.0 ) ), f.x ),
    mix( glassHash( i + vec2( 0.0, 1.0 ) ), glassHash( i + vec2( 1.0, 1.0 ) ), f.x ),
    f.y
  );
}
`;

/** THE ENVIRONMENT, as a function of the direction a ray leaves the pane in.
 * Everything an environment map would have been, worked out per pixel from
 * eight uniforms — which is cheaper than sampling one and, unlike one, is
 * this hour's sky rather than a picture taken at noon. */
const SKY_GLSL = /* glsl */ `
uniform vec3 gwZenith;
uniform vec3 gwHorizon;
uniform vec3 gwCloud;
uniform vec3 gwGround;
uniform vec3 gwTrees;
uniform vec3 gwSunTone;
uniform vec4 gwSun;
uniform vec4 gwLook;
uniform float gwStrength;
varying vec3 vGwWorld;
${NOISE_GLSL}
vec3 glassWorld( vec3 dir ) {
  float up = dir.y;
  // THE SKY. Square-rooted so the horizon's colour holds its band instead
  // of being gone a few degrees up — the same shape the dome is painted on.
  vec3 sky = mix( gwHorizon, gwZenith, sqrt( clamp( up, 0.0, 1.0 ) ) );
  if ( gwLook.x > 0.0 ) {
    // The ray's footprint on a sheet overhead, drifting with the sheet.
    vec2 uv = dir.xz / max( up, ${CLOUD.flattest.toFixed(2)} ) * ${CLOUD.scale.toFixed(2)} + gwLook.zw;
    float n = 0.65 * glassNoise( uv ) + 0.35 * glassNoise( uv * 2.3 + vec2( 7.1, 3.3 ) );
    // Cut at the coverage, and faded out along the last few degrees before
    // the horizon, where the projection stretches the lattice past what any
    // number of samples could hold still.
    float cover = smoothstep( 1.0 - gwLook.x, 1.0 - 0.4 * gwLook.x, n );
    sky = mix( sky, gwCloud, cover * smoothstep( 0.0, 0.16, up ) );
  }
  // THE SUN: the hard smear, and the glow it spreads around itself. Both
  // ride the beam, so an overcast sky reflects a bright pane with no sun in
  // it and a clear one puts a highlight down the whole greenhouse.
  float toward = max( dot( dir, gwSun.xyz ), 0.0 );
  sky += gwSunTone * gwSun.w * ( pow( toward, 60.0 ) + 0.16 * pow( toward, 6.0 ) );
  // ...AND THE COUNTRY under the horizon: open ground, with a ragged band of
  // trees standing on it. The band's height is read off a lattice walked
  // round the compass, so it is a skyline at a fixed BEARING — it stays put
  // as the car turns, which is the whole point of reflecting anything.
  float ridge = gwLook.y * ( 0.35 + 0.65 * glassNoise( normalize( dir.xz + 1e-4 ) * 3.0 ) );
  vec3 land = mix( gwGround, gwTrees, smoothstep( - 0.04, 0.01, up ) );
  return mix( land, sky, smoothstep( ridge - 0.015, ridge + 0.015, up ) );
}
`;

/** The world position, carried down for the reflection to be struck from. */
const VERTEX_GLSL = /* glsl */ `
varying vec3 vGwWorld;
`;

/** HOW MUCH OF THE WORLD ONE CAR'S GLASS IS SHOWING THIS FRAME, 0..1 — one
 * value per car, shared by its pane and the coat over it, and driven from
 * car-mesh.ts alongside the pane's own opacity.
 *
 * It exists for the seat. Every number here is authored for a window read
 * from OUTSIDE, and from the driver's own chair the same windscreen is the
 * thing the road is seen through: a sky struck on it at full strength is a
 * wash of pale blue over the next four seconds of stage. The pane already
 * has that answer (`GLASS_INSIDE`), and this is how the reflection is given
 * the same one. */
export type GlassReflect = { strength: THREE.IUniform<number> };

/** One car's, at full strength until something says otherwise. */
export function glassReflect(): GlassReflect {
  return { strength: { value: 1 } };
}

/** What both grafts share: the world position carried down, the sky
 * function, and the pane's normal and Fresnel share worked out from the
 * fragment's own derivatives. Every window is a flat quad, so the cross
 * product of the two screen-space steps IS the face's normal — which is what
 * saves putting one on every vertex of every car's glass. */
const FACE_GLSL = /* glsl */ `
vec3 gwEye = normalize( vGwWorld - cameraPosition );
vec3 gwNormal = normalize( cross( dFdx( vGwWorld ), dFdy( vGwWorld ) ) );
// The pane is double-sided and the far window of a cabin is seen through the
// near one, so the normal is turned to face the eye rather than trusted.
gwNormal = faceforward( gwNormal, gwEye, gwNormal );
float gwFacing = clamp( - dot( gwNormal, gwEye ), 0.0, 1.0 );
float gwReflect = gwStrength * ${REFLECT.strength.toFixed(2)} * ( ${REFLECT.base.toFixed(2)} +
  ( 1.0 - ${REFLECT.base.toFixed(2)} ) * pow( 1.0 - gwFacing, ${REFLECT.falloff.toFixed(1)} ) );
`;

/** THE REFLECTION LAID OVER THE PANE — and the only part of this worth
 * reading twice, because it is where the effect is won or lost.
 *
 * A window is two things at once: some of the world in front of it bounces
 * off, and the rest of what is behind it comes through. So the reflection is
 * not a tint mixed into the pane's colour — it is a layer IN FRONT of the
 * glass, and it takes its share of the pixel from the cabin AND from the
 * road showing past the pane alike. Written out, with `r` the share that
 * bounces:
 *
 *     out = pane · a · ( 1 - r ) + world · r + behind · ( 1 - a ) · ( 1 - r )
 *
 * which is ordinary alpha blending at `a' = a + r · ( 1 - a )` with the
 * colour that leaves the same numerator. Getting that right is the whole
 * difference between a window and a blue-tinted hole: mixed into the colour
 * alone, a reflected sky is something you can still see the crew through,
 * and no amount of strength makes it read as glass. */
const PANE_GLSL = /* glsl */ `
${FACE_GLSL}
vec3 gwSeen = glassWorld( reflect( gwEye, gwNormal ) );
float gwWas = gl_FragColor.a;
gl_FragColor.a = min( ${REFLECT.ceiling.toFixed(2)}, gwWas + gwReflect * ( 1.0 - gwWas ) );
gl_FragColor.rgb =
  ( gl_FragColor.rgb * gwWas * ( 1.0 - gwReflect ) + gwSeen * gwReflect ) /
  max( gl_FragColor.a, 1e-3 );
`;

/** ...AND ON THE COAT OVER IT. The dirt's own alpha is left exactly as the
 * wipers wrote it — how filthy a screen is has nothing to do with the sky —
 * so this only says what colour the filth that IS there comes out. Where
 * there is no coat there is no fragment, and the pane's own reflection is
 * what shows; where there is one, it glares. */
const COAT_GLSL = /* glsl */ `
${FACE_GLSL}
gwReflect *= ${COAT.share.toFixed(2)};
vec3 gwDust = normalize(
  mix( reflect( gwEye, gwNormal ), vec3( 0.0, 1.0, 0.0 ), ${COAT.scatter.toFixed(2)} )
);
gl_FragColor.rgb = mix( gl_FragColor.rgb, glassWorld( gwDust ), gwReflect );
`;

/** Put the world in one surface of one car's glass — `body` is what the
 * fragment does with it once the sky is in hand.
 *
 * Everything is grafted onto the surface's own material rather than drawn
 * beside it, so a reflecting window is the same mesh, the same draw call and
 * the same triangles it was — see the file's head for what that buys.
 *
 * IT GOES IN THE FRAGMENT THE MOMENT THE SURFACE'S OWN COLOUR IS FINISHED,
 * and that place is load-bearing rather than convenient. Three's tone
 * mapping, its colour-space conversion and the height fog all run after it,
 * in that order, and every one of them has to reach the reflection: sky
 * colours are authored LINEAR like every other colour in the game, so a
 * reflection laid down after the conversion is a sky written into a buffer
 * that has already been encoded — which comes out dark, and reads as the
 * effect not working rather than as a colour-space fault. Fogging it is
 * wanted for its own sake: a window two hundred metres up the stage stands
 * in the same air as the paint around it, and a reflection that stayed sharp
 * through the mist would be the one part of a car that did. */
function graft(material: THREE.Material, on: GlassReflect, key: string, body: string): void {
  // CHAINED, never assigned. `onBeforeCompile` is one slot and the glass
  // already carries the car's own gloss graft (car-surface.ts) — an
  // assignment here would silently delete it, or be silently deleted by it,
  // whichever ran second. `graftShader` also keeps three's program cache
  // honest about which grafts a material is carrying.
  graftShader(material, key, (shader) => {
    Object.assign(shader.uniforms, {
      gwZenith: { value: GLASS_SKY.zenith },
      gwHorizon: { value: GLASS_SKY.horizon },
      gwCloud: { value: GLASS_SKY.cloud },
      gwGround: { value: GLASS_SKY.ground },
      gwTrees: { value: GLASS_SKY.trees },
      gwLook: { value: GLASS_SKY.look },
      // The sun, by reference off the fog's own set — one sun, written once.
      gwSun: { value: HEIGHT_FOG.sun },
      gwSunTone: { value: HEIGHT_FOG.sunColor },
      gwStrength: on.strength,
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_GLSL}`)
      .replace(
        "#include <project_vertex>",
        `vGwWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKY_GLSL}`)
      .replace("#include <tonemapping_fragment>", `${body}\n#include <tonemapping_fragment>`);
  });
}

/** THE PANE: the world in front of the glass, laid over whatever is behind
 * it. */
export function reflectGlass(material: THREE.Material, on: GlassReflect): void {
  graft(material, on, "car-glass-reflect", PANE_GLSL);
}

/** THE COAT over that pane (car/wipers.ts): the same sky, scattered, in
 * whatever dirt the stage has put there. */
export function reflectFilm(material: THREE.Material, on: GlassReflect): void {
  graft(material, on, "car-glass-coat", COAT_GLSL);
}
