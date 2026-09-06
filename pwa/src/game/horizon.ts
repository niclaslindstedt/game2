// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HORIZON — the silhouette rings of distant mountains riding the
// camera, camera-locked like the dome (infinitely far) and tinted per
// preset so they read through the atmosphere: hazier behind, moodier in
// front.
//
// Four rings, not one: a chain has to have something BEHIND it before the
// eye can tell how far away any of it is, and depth on a horizon is the
// only sense of scale a stage gets. Farthest carries snow, nearest is a
// dark band of forest on the skyline.
//
// The profile is RIDGED rather than wavy. A sum of sines is a rolling
// hill, and rolling hills at that distance read as a bank of cloud;
// folding each octave back on itself puts a crease at every summit and a
// flat floor in every col, which is what a mountain chain looks like from
// the valley below it.
//
// The rings open a GAP toward one bearing — a sea gap, so a low sun has a
// horizon to sit on instead of a rock wall — and the environment turns the
// whole ring so that gap faces wherever this run's sun meets the horizon
// (daylight.ts's `horizonCrossing`). Everywhere else the ring is high
// enough to hide a low sun, and `elevationAt` says how high, so the light
// can go with the disc when it drops behind the range.

import * as THREE from "three";
import type { BiomeId } from "@engine";

import { SOUTH } from "./daylight.ts";
import { SKY_ORDER, drawAsBackdrop } from "./sky-depth.ts";
import { dayLight, type Preset } from "./sky.ts";

/** One ring's profile: where each column's foot, snowline and summit sit,
 * plus how the atmosphere has eaten into its rock. `haze` is how much of
 * the sky the ring has dissolved into and `tone` darkens what is left — the
 * two halves of aerial perspective, because near rock is not just less
 * hazy, it is darker. */
type Ridge = { haze: number; tone: number };

/** How tall the rings stand in each country, as a scale on the boreal
 * skyline they were cut for. */
const RIDGE_HEIGHT: Record<BiomeId, number> = { taiga: 1, desert: 0.38, alpine: 1.7 };
/** …and whether its peaks hold snow at all. The snowline is baked into
 * the profile at the height the rings were CUT at, so scaling them down
 * only lowers the white caps rather than losing them: a country with no
 * snow in it has to say so. */
const RIDGE_SNOW: Record<BiomeId, boolean> = { taiga: true, desert: false, alpine: true };

const STEPS = 150;

export type Horizon = {
  mesh: THREE.Mesh;
  /** Repaint the rings for the conditions. */
  paint: (p: Preset) => void;
  /** Which country's skyline this is — how tall, and whether snowed. */
  setCountry: (biome: BiomeId) => void;
  /** Turn the ring so its sea gap faces this world heading. */
  turnTo: (bearing: number) => void;
  /** How high the skyline stands on this bearing, radians, seen from an
   * eye `eyeHeight` metres over the ground plane the ring stands on. */
  elevationAt: (bearing: number, eyeHeight: number) => number;
  dispose: () => void;
};

export function createHorizon(): Horizon {
  const ridgeShade: number[] = [];
  /** The same profile with every summit left as bare rock — the horizon of
   * a country that has no snowline. Kept as a second array rather than
   * rebuilt per country: the rings are one static mesh, and swapping which
   * shade the painter reads costs nothing. */
  const ridgeBare: number[] = [];
  const ridgeHaze: number[] = [];
  const ridgeTone: number[] = [];
  const ridgePos: number[] = [];
  const ridgeIndex: number[] = [];
  /** The farthest ring's summit height per column, m, before the country's
   * scale — the skyline the sun has to clear. */
  const skyline: number[] = [];
  let skylineRadius = 1;

  const addRidge = (
    ridge: Ridge,
    radius: number,
    lift: number,
    jag: number,
    /** World height above which the rock is under snow, or null for none. */
    snowY: number | null,
  ): void => {
    const OCTAVES = 4;
    const phase = Array.from({ length: OCTAVES }, () => Math.random() * Math.PI * 2);
    const base = ridgePos.length / 3;
    const first = skyline.length === 0;
    if (first) skylineRadius = radius;
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      let shape = 0;
      let amp = 1;
      let freq = 3;
      for (let o = 0; o < OCTAVES; o++) {
        const n = 0.5 + 0.5 * Math.sin(a * freq + phase[o]);
        // The fold: 0 at either end of the octave, 1 through the middle.
        shape += amp * (1 - Math.abs(2 * n - 1));
        amp *= 0.52;
        freq *= 2.13;
      }
      // Sharpened, so the summits are summits and the cols are broad.
      shape = Math.pow(shape / 1.9, 1.5) * 2 - 0.55;
      // The ridge opens toward the south — a sea gap, turned to wherever
      // the sun meets the horizon on this run (`turnTo`).
      const gap = 1 - 0.92 * Math.pow(Math.max(0, Math.cos(a - SOUTH)), 5);
      const h = Math.max(3, (lift + shape * jag) * gap);
      if (first) skyline.push(h);
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius;
      // Three vertices to a column — foot, snowline, summit — so the snow
      // caps the peaks that reach it instead of bleeding down the whole
      // flank. A peak short of the line collapses its top quad to nothing.
      const line = snowY === null ? h : Math.min(h, snowY);
      ridgePos.push(x, -6, z, x, line, z, x, h, z);
      const rock = 0.92 + 0.14 * Math.min(1, h / Math.max(1, lift + jag));
      const snow = snowY !== null && h > snowY ? 1.7 : rock;
      ridgeShade.push(rock, rock, snow);
      ridgeBare.push(rock, rock, rock);
      for (let k = 0; k < 3; k++) {
        ridgeHaze.push(ridge.haze);
        ridgeTone.push(ridge.tone);
      }
      if (i > 0) {
        const b = base + (i - 1) * 3;
        ridgeIndex.push(b, b + 1, b + 3, b + 1, b + 4, b + 3);
        ridgeIndex.push(b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
      }
    }
  };

  // Every ring stands between the CLOUD RING and the DOME, and there is no
  // slack in that: a ridge inside the clouds' orbit is an opaque wall drawn
  // through them; one outside the dome is not drawn at all. So the rings
  // are packed into the band between the two, and their apparent SIZE is
  // carried by their heights rather than by how far out they stand — they
  // ride the camera, so there is no parallax between them to lose. Four
  // rings, farthest first, because a chain needs something behind it before
  // the eye can tell how far away any of it is. The nearest is a treeline:
  // a low serrated band of forest on the last rise before the country the
  // stage is actually in.
  addRidge({ haze: 0.24, tone: 1 }, 552, 87, 118, 130);
  addRidge({ haze: 0.4, tone: 0.94 }, 536, 64, 99, 103);
  addRidge({ haze: 0.58, tone: 0.82 }, 518, 41, 75, null);
  addRidge({ haze: 0.72, tone: 0.6 }, 500, 16, 20, null);

  // All four in ONE mesh. The atmosphere they are painted with changes with
  // the conditions, but only then — so the per-ring haze and tone are baked
  // into the vertex colors on `paint` rather than carried as four
  // materials, and the whole horizon costs the frame a single draw.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(ridgePos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(ridgeShade.length * 3, 3));
  geo.setIndex(ridgeIndex);
  const mat = new THREE.MeshBasicMaterial({
    fog: false,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  // BACKDROP, like every other thing in the sky group (sky-depth.ts): drawn
  // after the world and depth-tested at the FAR PLANE, so the country is
  // always in front of its own horizon.
  //
  // The distance is the whole reason it cannot be depth-tested where it
  // actually stands. The rings are at ~500 m, a good deal NEARER than the
  // ground the camera can see — a stage draws its world for a kilometre and
  // more — so at their own depth a ring occludes real terrain further away
  // than it is, and the horizon comes out lying ACROSS the landscape
  // instead of behind it. It is worst where the rings are short and the
  // ground is high, which is the desert exactly (`RIDGE_HEIGHT` scales them
  // to 0.38 and R40 stands the whole country on a floor 14 m over the water
  // table): there the chain cut through the dunes halfway out.
  drawAsBackdrop(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = SKY_ORDER - 1;

  let snowy = true;
  let scale = 1;

  /** Repaint the horizon for the conditions: each ring dissolved into the
   * sky by its own haze, darkened by its own tone, and the snow picked back
   * out of whatever that leaves. */
  const paint = (p: Preset): void => {
    const fogColor = new THREE.Color(p.fog);
    const zenith = new THREE.Color(p.zenith);
    const rock = new THREE.Color();
    const colors = geo.getAttribute("color") as THREE.BufferAttribute;
    // The snow's lift is a vertex colour and nothing in the scene can dim
    // it, so the sky's own light has to: a snowfield under a black storm is
    // grey, and left at its clear-day value it is the brightest thing on
    // the screen.
    const lit = 0.35 + 0.65 * dayLight(p);
    const shades = snowy ? ridgeShade : ridgeBare;
    for (let i = 0; i < shades.length; i++) {
      const shade = 1 + (shades[i] - 1) * lit;
      rock
        .copy(fogColor)
        .lerp(zenith, ridgeHaze[i])
        .multiplyScalar(ridgeTone[i] * shade);
      colors.setXYZ(i, rock.r, rock.g, rock.b);
    }
    colors.needsUpdate = true;
  };

  const setCountry = (biome: BiomeId): void => {
    // R40 — the horizon is the country's. The rings were cut for a boreal
    // skyline of ranges; a desert's horizon is low broken hills a long way
    // off, so the same rings stand at well under half their height there —
    // and take no snow, because a scaled-down range keeps every white cap
    // the profile was cut with, just closer to the ground.
    scale = RIDGE_HEIGHT[biome];
    mesh.scale.y = scale;
    snowy = RIDGE_SNOW[biome];
  };

  const turnTo = (bearing: number): void => {
    // A rotation of θ about y carries the column at angle a to a + θ.
    mesh.rotation.y = bearing - SOUTH;
  };

  const elevationAt = (bearing: number, eyeHeight: number): number => {
    const a = bearing - mesh.rotation.y;
    const col = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * STEPS;
    const i = Math.floor(col);
    const f = col - i;
    const h = (skyline[i % STEPS] * (1 - f) + skyline[(i + 1) % STEPS] * f) * scale;
    return Math.atan2(h - eyeHeight, skylineRadius);
  };

  return {
    mesh,
    paint,
    setCountry,
    turnTo,
    elevationAt,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
