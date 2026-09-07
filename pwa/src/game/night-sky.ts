// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SIMPLE SKY'S NIGHT — the LOW setting's answer to what the shader dome
// evaluates per pixel: the star field as a few hundred baked points, and the
// Milky Way as one additive strip with the band's own arithmetic already in
// its vertex colours.
//
// It is the same relationship `clouds.ts` has to `sky-shader.ts`. The chart
// is one chart — `starfield.ts` says where the pole stands, where the band
// lies across it and how bright each part of it is — and this is that chart
// paid for once at build rather than on every sky pixel. What the LOW sky
// gives up is resolution, not content: the band is here, tilted the same
// way, mottled by the same noise, with the same dark rift down it, and the
// stars crowd into it exactly as they do on the dome.
//
// Two things are still per pixel, because neither can be baked into a
// sphere that TURNS: the extinction at the horizon and the scintillation.
// A star's altitude changes as the night goes on, so how much air is in
// front of it is a fact about the frame and not about the star.

import * as THREE from "three";

import { SKY_ORDER, drawAsBackdrop } from "./sky-depth.ts";
import { DOME_RADIUS, type Preset } from "./sky.ts";
import { GALACTIC_FRAME, milkyWayAt, nightStars, turnRotation, type SkyTurn } from "./starfield.ts";

/** How many stars the simple sky flies. Enough that the band reads as a
 * crowd rather than as a line of dots, and few enough to be one buffer the
 * GPU never looks at again. */
const STAR_COUNT = 2600;

/** Where the field and the band hang, m — just inside the dome, which is
 * all that matters: both are drawn as backdrop at the far plane, so the
 * radius decides nothing but the order they were authored at. */
const SHELL = DOME_RADIUS * 0.96;

/** How the band's strip is cut: steps round the galactic equator, and rungs
 * across it out to `BAND_REACH` of galactic latitude either side. Coarse
 * across, because the band's shape across is a smooth falloff, and fine
 * round, because that is the direction the clumps and the rift run. */
/** HOW MUCH OF THE BAND THE SIMPLE SKY CARRIES, of what the dome draws.
 * Under half, and the one number here that is deliberately NOT the shader's.
 *
 * The two skies paint the same chart onto very different nights: the simple
 * dome's midnight is a light grey-blue where the shader's is nearly black,
 * and the galaxy is ADDED to whichever it lands on. At the dome's own
 * strength on the simple sky's ground the band stops reading as a glow
 * behind the stars and starts reading as a searchlight parked behind the
 * hills — which is the one thing it must never look like. Same band, same
 * place, same shape; a share of the light, because there is less room over
 * this sky to put light into. */
const BAND_ON_SIMPLE = 0.45;

const BAND_STEPS = 96;
const BAND_RUNGS = 20;
const BAND_REACH = 0.55;

/** THE EXTINCTION AND THE TWINKLE, shared by both materials — the same two
 * lines `nightSky` opens with in the shader dome (starfield.ts). Written
 * here as well because the dome's copy is inside a function this cannot
 * call from a vertex shader; they have to be changed together. */
const AIR_GLSL = /* glsl */ `
uniform vec3 uKeyDir;
float nightAir( float up ) {
  return smoothstep( - 0.005, 0.10, up ) * ( 0.42 + 0.58 * smoothstep( 0.03, 0.42, up ) );
}
float nightScint( float up ) {
  return 0.14 + 0.55 * pow( 1.0 - min( up, 1.0 ), 7.0 );
}
// The moon's own sky glow, exactly as the dome computes it: a wide wash
// round the key that the faint sky does not survive.
float nightWash( vec3 dir ) {
  float ang = acos( clamp( dot( dir, uKeyDir ), - 1.0, 1.0 ) );
  return 1.0 - 0.85 * exp( - ang * ang * 7.0 );
}`;

const STAR_VERTEX = /* glsl */ `
attribute float size;
attribute float seed;
attribute vec3 tint;
uniform float uOpacity;
uniform float uTime;
varying vec3 vTint;
${AIR_GLSL}
void main() {
  // The field rides the camera, so a vertex IS a direction: the world
  // position less the eye, which is the group's own origin.
  vec3 dir = normalize( ( modelMatrix * vec4( position, 1.0 ) ).xyz - cameraPosition );
  float twinkle = 1.0 + nightScint( dir.y ) * sin( uTime * ( 2.0 + fract( seed * 53.0 ) * 6.0 ) + seed * 40.0 );
  vTint = tint * uOpacity * nightAir( dir.y ) * nightWash( dir ) * max( twinkle, 0.0 );
  gl_PointSize = size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vTint;
void main() {
  // A round point with a soft edge. Square stars are the one thing that
  // makes a point cloud look like a point cloud.
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  gl_FragColor = vec4( vTint * smoothstep( 1.0, 0.15, d ), 1.0 );
}`;

const BAND_VERTEX = /* glsl */ `
varying vec3 vTint;
uniform float uOpacity;
${AIR_GLSL}
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vec3 dir = normalize( world.xyz - cameraPosition );
  float wash = nightWash( dir );
  vTint = color * uOpacity * nightAir( dir.y ) * wash * wash;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const BAND_FRAGMENT = /* glsl */ `
varying vec3 vTint;
void main() {
  gl_FragColor = vec4( vTint, 1.0 );
}`;

export type NightSky = {
  /** Everything on the celestial sphere, in one group the turn rotates. */
  group: THREE.Group;
  /** Hang the sphere where this hour has turned it, and set how much of the
   * stars and the band this sky shows. */
  apply: (p: Preset, turn: SkyTurn, key: THREE.Vector3) => void;
  /** Advance the scintillation clock. */
  tick: (dt: number) => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

/** THE BAND, cut as a strip round the galactic equator with the glow baked
 * into its vertex colours. A strip rather than a whole sphere because the
 * band is nothing outside `BAND_REACH` and a vertex that is black is a
 * vertex the sky did not need. */
function bandGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  // The strip is built in CELESTIAL coordinates from the galactic frame,
  // which is what lets the group's one rotation carry the whole night sky.
  const along = new THREE.Vector3().fromArray(GALACTIC_FRAME.along);
  const across = new THREE.Vector3().fromArray(GALACTIC_FRAME.across);
  const up = new THREE.Vector3().fromArray(GALACTIC_FRAME.up);
  const dir = new THREE.Vector3();
  for (let r = 0; r <= BAND_RUNGS; r++) {
    const lat = (r / BAND_RUNGS - 0.5) * 2 * BAND_REACH;
    for (let s = 0; s <= BAND_STEPS; s++) {
      const lon = (s / BAND_STEPS) * Math.PI * 2;
      // Laid out in GALACTIC coordinates — along the band, across it, and
      // out of its plane — then put back on the celestial sphere by the one
      // frame `starfield.ts` states.
      const c = Math.cos(lat);
      dir
        .copy(along)
        .multiplyScalar(Math.cos(lon) * c)
        .addScaledVector(across, Math.sin(lon) * c)
        .addScaledVector(up, Math.sin(lat));
      pos.push(dir.x * SHELL, dir.y * SHELL, dir.z * SHELL);
      // Taken to nothing at the strip's own rim. The band is faint but not
      // zero out at `BAND_REACH`, and a strip that simply stops there draws
      // its own two edges across the sky as straight seams — the one way
      // this can look like geometry rather than like sky.
      const edge = 1 - Math.pow(Math.abs(lat) / BAND_REACH, 3);
      const tone = milkyWayAt(dir.x, dir.y, dir.z).multiplyScalar(Math.max(0, edge));
      col.push(tone.r, tone.g, tone.b);
    }
  }
  const row = BAND_STEPS + 1;
  for (let r = 0; r < BAND_RUNGS; r++) {
    for (let s = 0; s < BAND_STEPS; s++) {
      const a = r * row + s;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

export function createNightSky(): NightSky {
  const group = new THREE.Group();
  // Where the moon is, shared by both materials by reference: one wash, and
  // the band and the stars can never disagree about where it stands.
  const key = new THREE.Vector3(0, 1, 0);

  // ── The stars ────────────────────────────────────────────────────────────
  const field = nightStars(STAR_COUNT);
  const pos = new Float32Array(field.length * 3);
  const tint = new Float32Array(field.length * 3);
  const size = new Float32Array(field.length);
  const seed = new Float32Array(field.length);
  field.forEach((star, i) => {
    pos[i * 3] = star.x * SHELL;
    pos[i * 3 + 1] = star.y * SHELL;
    pos[i * 3 + 2] = star.z * SHELL;
    tint[i * 3] = star.r;
    tint[i * 3 + 1] = star.g;
    tint[i * 3 + 2] = star.b;
    size[i] = star.size;
    seed[i] = star.seed;
  });
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
  starGeo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  // Additive and not `transparent`, for the reason the whole backdrop stack
  // is: marked transparent it would be depth-tested at its own distance
  // instead of at the far plane, and a ridge further off than the shell
  // would have stars shining through it (sky-depth.ts).
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uKeyDir: { value: key } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  drawAsBackdrop(starMat);
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = SKY_ORDER - 2;
  stars.frustumCulled = false;

  // ── The Milky Way ────────────────────────────────────────────────────────
  const bandGeo = bandGeometry();
  const bandMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uKeyDir: { value: key } },
    vertexShader: BAND_VERTEX,
    fragmentShader: BAND_FRAGMENT,
    vertexColors: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  drawAsBackdrop(bandMat);
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.renderOrder = SKY_ORDER - 2;
  band.frustumCulled = false;

  group.add(band, stars);

  return {
    group,
    apply: (p, turn, keyDir) => {
      key.copy(keyDir);
      group.rotation.setFromRotationMatrix(turnRotation(turn));
      starMat.uniforms.uOpacity.value = p.stars;
      bandMat.uniforms.uOpacity.value = p.galaxy * BAND_ON_SIMPLE;
      // A band nobody can see is still a draw call and a strip of fill.
      band.visible = p.galaxy > 0.004;
      stars.visible = p.stars > 0.002;
    },
    tick: (dt) => {
      starMat.uniforms.uTime.value = (starMat.uniforms.uTime.value + dt) % 3600;
    },
    setVisible: (on) => {
      group.visible = on;
    },
    dispose: () => {
      starGeo.dispose();
      starMat.dispose();
      bandGeo.dispose();
      bandMat.dispose();
    },
  };
}
