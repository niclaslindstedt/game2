// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAYERED SKY — the dome drawn as ONE shader, with everything that is
// in the sky computed per pixel from where the pixel is looking: the
// gradient and the glow round the sun, the stars, the sun's disc and halo
// (or the moon's), and the cloud LAYERS of cloud-field.ts — each a sheet of
// noise at a real altitude, projected onto the view ray in perspective, so
// a cumulus a kilometre up foreshortens into the haze at the horizon the
// way a real one does and a cirrus sheet ten kilometres up hardly moves as
// the car does. Under a deck the lowest sheet is the ceiling, coloured
// from overhead to the rim by its elevation exactly as the simple sky's
// mesh is. From a pass above the valley mist the dome shows the SEA — the
// mist's own top, lumped, sunlit, and in the mountain's shadow where the
// map says so (height-fog.ts, whose functions this shares so the fog on
// the ground and the sea on the dome are one surface).
//
// Why a shader and not the puffs: a cloud is not a shape, it is a field.
// The simple sky's spheres are honest arcade clouds and stay as the LOW
// setting; this is what a machine with the pixels to spare gets instead.
// Everything that costs is per sky pixel — a third of the frame — and the
// budget is the octave count: `layered` reads four octaves and lights the
// undersides by their own density, `full` reads six and takes a second
// sample toward the sun so the edges facing it are lit.

import * as THREE from "three";

import { MAX_LAYERS, type CloudLayer, type SkyDressing } from "./cloud-field.ts";
import { HEIGHT_FOG_GLSL, fogUniforms } from "./height-fog.ts";
import { DOME_RADIUS, type Preset } from "./sky.ts";

/** How high the deck's lit rim reaches, radians above the horizon — the
 * same band the simple sky paints its deck mesh over (clouds.ts). */
const RIM_BAND = 0.16;

/** Where the disc and halo were authored: a plane at 86 % of the dome's
 * radius, sized in metres. The shader wants angles. */
const AUTHORED_AT = DOME_RADIUS * 0.86;

/** How the sky is drawn at each stop of the SKY lever the video options
 * carry: how many octaves of noise a layer is read at, and whether the
 * clouds are lit by a second sample toward the sun. */
export type SkyLook = { octaves: number; sunlit: boolean };

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform float uBand;
uniform vec3 uBelow;
uniform vec2 uSunAz;
uniform vec3 uSunDir;
uniform vec3 uKeyDir;
uniform vec3 uDisc;
uniform float uDiscSize;
uniform vec3 uHalo;
uniform float uHaloSize;
uniform float uHaloOpacity;
uniform float uThrough;
uniform float uStars;
uniform float uFlash;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uSunColor;
uniform vec4 uLayerA[${MAX_LAYERS}];
uniform vec4 uLayerB[${MAX_LAYERS}];
uniform vec4 uLayerC[${MAX_LAYERS}];
uniform vec4 uLayerD[${MAX_LAYERS}];
uniform int uLayers;
uniform int uOctaves;
uniform int uSunlit;
uniform vec3 uDeckOverhead;
uniform vec3 uDeckRim;
uniform float uDeckRelief;
${HEIGHT_FOG_GLSL}

// The same sample cloud-field.ts takes on the CPU (cloudUv).
vec2 cloudUv( vec2 p, vec4 c, float scale, float streak, float seed ) {
  vec2 q = p + c.xy;
  float along = q.x * c.z + q.y * c.w;
  float across = - q.x * c.w + q.y * c.z;
  return vec2( along / ( scale * streak ) + seed * 13.7, across / scale );
}

void main() {
  vec3 ray = normalize( vWorld - cameraPosition );
  float up = ray.y;
  float t = max( 0.0, up );
  // The gradient, and the warm bleed round the sun's bearing.
  vec3 col = mix( uHorizon, uZenith, pow( t, uBand ) );
  vec2 az = normalize( ray.xz + vec2( 1e-5, 0.0 ) );
  float toward = max( 0.0, dot( az, uSunAz ) );
  float w = pow( toward, 3.0 ) * pow( 1.0 - t, 2.2 ) * uGlowStrength;
  col = mix( col, uGlow, min( 1.0, w ) );
  // Under the horizon the dome is the far ground, which is fog.
  col = mix( uBelow, col, smoothstep( - 0.04, 0.0, up ) );

  // Stars: one per cell of a grid the sky's directions are quantised on.
  if ( uStars > 0.0 && up > 0.0 ) {
    vec3 sd = ray * 130.0;
    vec3 cell = floor( sd );
    float h = cloudHash( vec2( cell.x + cell.z * 57.0, cell.y + cell.z * 13.0 ) );
    float d = length( fract( sd ) - 0.5 );
    float star = smoothstep( 0.985, 1.0, h ) * smoothstep( 0.32, 0.0, d );
    float twinkle = 0.55 + 0.45 * fract( h * 97.0 );
    col += star * twinkle * uStars * vec3( 0.87, 0.91, 1.0 );
  }

  // The disc and its halo — under the clouds, so a cloud over the sun is
  // a bright patch with no edge, which is what a covered sun is.
  float cosA = dot( ray, uKeyDir );
  float ang = acos( clamp( cosA, - 1.0, 1.0 ) );
  float halo = exp( - ang / max( uHaloSize, 1e-3 ) * 2.5 ) * uHaloOpacity * uThrough;
  col += uHalo * halo;
  float disc = ( 1.0 - smoothstep( uDiscSize * 0.85, uDiscSize, ang ) ) * uThrough;
  col = mix( col, uDisc, disc );

  // The cloud sheets, far to near: for a ray going up that is the highest
  // first, for one going down the lowest.
  for ( int k = 0; k < ${MAX_LAYERS}; k ++ ) {
    if ( k >= uLayers ) break;
    int i = up > 0.0 ? uLayers - 1 - k : k;
    vec4 A = uLayerA[ i ];
    vec4 B = uLayerB[ i ];
    vec4 C = uLayerC[ i ];
    vec4 D = uLayerD[ i ];
    float dy = A.x - cameraPosition.y;
    if ( dy * up <= 0.0 || abs( up ) < 0.004 ) continue;
    float dist = dy / up;
    vec2 p = cameraPosition.xz + ray.xz * dist;
    vec2 uv = cloudUv( p, C, A.w, B.y, D.x );
    float n = cloudField( uv, uOctaves );
    // Aerial perspective: a sheet seen the long way toward the horizon
    // dissolves into the air between. Mild — six kilometres of clear air
    // takes a quarter of a cloud, not half of it.
    float haze = 1.0 - exp( - dist * 0.00005 );
    vec3 hazeTone = up > 0.0 ? uHorizon : uBelow;
    if ( D.z > 0.5 ) {
      // THE DECK: a ceiling, overhead to rim by elevation, with its own
      // lumps shading it.
      float elev = asin( clamp( up, - 1.0, 1.0 ) );
      float rim = 1.0 - min( 1.0, elev / ${RIM_BAND.toFixed(3)} );
      vec3 tone = mix( uDeckOverhead, uDeckRim, pow( rim, 1.5 ) );
      tone *= 1.0 + 0.22 * uDeckRelief * ( n * 2.0 - 1.0 );
      tone *= 1.0 + 3.4 * uFlash;
      col = mix( col, tone, smoothstep( 0.0, 0.05, up ) );
      continue;
    }
    float dens = cloudDensity( A.z, B.x, n ) * D.w;
    if ( dens <= 0.002 ) continue;
    // What sunlight there is at this altitude, and which face of the
    // sheet is being looked at.
    vec3 sunlit = mix( uCloudShade, uCloudLit, B.w );
    vec3 c;
    if ( up > 0.0 ) {
      // The underside: in the sheet's own shadow where it is thick, lit
      // through where it is thin, brighter on the sun's side of the sky
      // than away from it, and rimmed toward the sun.
      float sunward = 0.5 + 0.5 * dot( az, uSunAz );
      float bottomLit = ( 1.0 - dens * B.z * 0.8 ) * mix( 0.6, 1.0, sunward );
      if ( uSunlit > 0 ) {
        float n2 = cloudField( uv + uSunDir.xz * 0.28 / max( B.y, 1.0 ), max( uOctaves - 2, 2 ) );
        bottomLit = mix( bottomLit, clamp( 0.5 + ( n - n2 ) * 5.0 * B.z, 0.0, 1.0 ), 0.5 );
      }
      c = mix( uCloudShade, sunlit, bottomLit );
      float forward = pow( max( dot( ray, uSunDir ), 0.0 ), 8.0 );
      c += uSunColor * forward * ( 1.0 - dens ) * 0.45 * B.w;
    } else {
      // The top, from above: sunlit where it faces the sun, and in the
      // country's shadow where the map says the mountain is in the way.
      float topLit = 0.72 + 0.28 * ( 1.0 - dens * B.z );
      if ( uSunlit > 0 ) {
        float n2 = cloudField( uv + uSunDir.xz * 0.28 / max( B.y, 1.0 ), max( uOctaves - 2, 2 ) );
        topLit = clamp( 0.65 + ( n - n2 ) * 4.0 * B.z, 0.0, 1.0 );
      }
      c = mix( uCloudShade, sunlit, topLit );
      c = mix( c, uCloudShade, mountainShade( vec3( p.x, A.x + A.y * 0.5, p.y ) ) );
    }
    c *= 1.0 + 3.4 * uFlash;
    c = mix( c, hazeTone, haze );
    col = mix( col, c, dens * ( 1.0 - 0.6 * haze ) );
  }

  // The mist: along the whole ray to the far distance, and the SEA where
  // the ray goes down into it from above.
  float far = 4000.0;
  float mist = mistAmount( cameraPosition.y, cameraPosition.y + up * far, far );
  if ( mist > 0.0 ) {
    float shade = 0.0;
    float lumps = 1.0;
    if ( up < - 0.004 && cameraPosition.y > hfMist.x ) {
      float dist = ( hfMist.x - cameraPosition.y ) / up;
      vec2 p = cameraPosition.xz + ray.xz * dist;
      shade = mountainShade( vec3( p.x, hfMist.x, p.y ) );
      lumps = 0.82 + 0.36 * cloudFbm( p / 260.0, 3 );
    }
    vec3 tone = mistColor( ray, max( shade, 1.0 - hfMist.w ) ) * lumps;
    col = mix( col, tone, mist );
  }

  gl_FragColor = vec4( col, 1.0 );
}
`;

function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export type SkyShell = {
  mesh: THREE.Mesh;
  /** Re-dress the dome for these conditions and this sky. */
  apply: (p: Preset, dressing: SkyDressing, look: SkyLook) => void;
  /** Advance the clouds on the wind. */
  tick: (windX: number, windZ: number, dt: number) => void;
  /** Where the real sun and the disc are, and how much of the disc gets
   * through (0..1 — behind a ridge or a cloud, less). */
  setSun: (sun: THREE.Vector3, key: THREE.Vector3, through: number) => void;
  setFlash: (surge: number) => void;
  /** The layers as drawn, with their live offsets — for the CPU to ask
   * the same field how much cloud is over the sun. */
  layers: () => { layer: CloudLayer; offsetX: number; offsetZ: number }[];
  wind: () => { x: number; z: number };
  dispose: () => void;
};

// Real vectors, not literals: three uploads an ARRAY of vec4 through each
// element's `toArray`, where a single vec4 takes any `{x, y, z, w}`.
const v4 = (): THREE.Vector4 => new THREE.Vector4();

export function createSkyShell(): SkyShell {
  const layerA = Array.from({ length: MAX_LAYERS }, v4);
  const layerB = Array.from({ length: MAX_LAYERS }, v4);
  const layerC = Array.from({ length: MAX_LAYERS }, v4);
  const layerD = Array.from({ length: MAX_LAYERS }, v4);
  const uniforms: Record<string, THREE.IUniform> = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uGlowStrength: { value: 0 },
    uBand: { value: 0.62 },
    uBelow: { value: new THREE.Color() },
    uSunAz: { value: new THREE.Vector2(0, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uDisc: { value: new THREE.Color() },
    uDiscSize: { value: 0 },
    uHalo: { value: new THREE.Color() },
    uHaloSize: { value: 0.1 },
    uHaloOpacity: { value: 0 },
    uThrough: { value: 1 },
    uStars: { value: 0 },
    uFlash: { value: 0 },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uLayerA: { value: layerA },
    uLayerB: { value: layerB },
    uLayerC: { value: layerC },
    uLayerD: { value: layerD },
    uLayers: { value: 0 },
    uOctaves: { value: 4 },
    uSunlit: { value: 0 },
    uDeckOverhead: { value: new THREE.Color() },
    uDeckRim: { value: new THREE.Color() },
    uDeckRelief: { value: 0 },
    ...fogUniforms(),
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 18), material);
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;

  let drawn: CloudLayer[] = [];
  const offsets: { x: number; z: number }[] = Array.from({ length: MAX_LAYERS }, () => ({
    x: 0,
    z: 0,
  }));
  const windUnit = { x: 0, z: 1 };

  const apply = (p: Preset, dressing: SkyDressing, look: SkyLook): void => {
    uniforms.uZenith.value.set(p.zenith);
    uniforms.uHorizon.value.set(p.horizon);
    uniforms.uGlow.value.set(p.glow);
    uniforms.uGlowStrength.value = p.glowStrength;
    // How far up the sky the horizon's colour reaches. By day the band is
    // the simple sky's broad one; under a low sun it narrows, so a sunset
    // is a band of colour along the rim with the sky's own purple over it
    // rather than the whole dome painted orange.
    const lowSun = smooth01((0.26 - p.sunUp) / 0.26);
    uniforms.uBand.value = 0.62 - 0.24 * lowSun;
    uniforms.uBelow.value.set(p.fog);
    uniforms.uSunAz.value.set(Math.sin(p.sunBearing), Math.cos(p.sunBearing));
    uniforms.uDisc.value.set(p.disc);
    uniforms.uDiscSize.value = (p.discSize / AUTHORED_AT) * 0.5;
    uniforms.uHalo.value.set(p.halo);
    uniforms.uHaloSize.value = (p.haloSize / AUTHORED_AT) * 0.5;
    uniforms.uHaloOpacity.value = p.haloOpacity;
    uniforms.uStars.value = p.stars;
    uniforms.uCloudLit.value.set(p.cloud);
    uniforms.uCloudShade.value.set(p.cloudShade);
    uniforms.uSunColor.value.set(p.sun);
    uniforms.uOctaves.value = look.octaves;
    uniforms.uSunlit.value = look.sunlit ? 1 : 0;
    if (p.deck) {
      uniforms.uDeckOverhead.value.set(p.deck.overhead);
      uniforms.uDeckRim.value.set(p.deck.rim);
      uniforms.uDeckRelief.value = p.deck.relief;
    }
    drawn = dressing.layers.slice(0, MAX_LAYERS);
    uniforms.uLayers.value = drawn.length;
    drawn.forEach((layer, i) => {
      // How much of the fair-weather ring a dry country flies thins the
      // sheets' opacity here too, and the deck is a lid in any country.
      const opacity = layer.deck ? 1 : p.cloudOpacity;
      Object.assign(layerA[i], {
        x: layer.altitude,
        y: layer.thickness,
        z: layer.coverage,
        w: layer.scale,
      });
      Object.assign(layerB[i], {
        x: layer.sharpness,
        y: layer.streak,
        z: layer.body,
        w: 1,
      });
      Object.assign(layerD[i], {
        x: layer.seed,
        y: layer.drift,
        z: layer.deck ? 1 : 0,
        w: opacity,
      });
    });
    writeOffsets();
  };

  const writeOffsets = (): void => {
    drawn.forEach((_, i) => {
      Object.assign(layerC[i], {
        x: offsets[i].x,
        y: offsets[i].z,
        z: windUnit.x,
        w: windUnit.z,
      });
    });
  };

  const tick = (windX: number, windZ: number, dt: number): void => {
    const speed = Math.hypot(windX, windZ);
    if (speed > 0.05) {
      windUnit.x = windX / speed;
      windUnit.z = windZ / speed;
    }
    // A cloud moves WITH the wind, so the field is read further back
    // along it as time passes.
    drawn.forEach((layer, i) => {
      offsets[i].x -= windX * layer.drift * dt;
      offsets[i].z -= windZ * layer.drift * dt;
    });
    writeOffsets();
  };

  return {
    mesh,
    apply,
    tick,
    setSun: (sun, key, through) => {
      uniforms.uSunDir.value.copy(sun);
      uniforms.uKeyDir.value.copy(key);
      uniforms.uThrough.value = through;
    },
    setFlash: (surge) => {
      uniforms.uFlash.value = surge;
    },
    layers: () =>
      drawn.map((layer, i) => ({ layer, offsetX: offsets[i].x, offsetZ: offsets[i].z })),
    wind: () => ({ x: windUnit.x, z: windUnit.z }),
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

/** Set how sunlit each drawn layer is, 0..1 — the environment's per-tick
 * answer from `litAt` (a cirrus sheet burns after the cumulus has gone
 * grey). Kept beside the shell rather than on it so `apply` stays one
 * call. */
export function litLayers(shell: SkyShell, lit: (layer: CloudLayer) => number): void {
  const material = (shell.mesh.material as THREE.ShaderMaterial).uniforms;
  const layerB = material.uLayerB.value as THREE.Vector4[];
  shell.layers().forEach(({ layer }, i) => {
    layerB[i].w = lit(layer);
  });
}
