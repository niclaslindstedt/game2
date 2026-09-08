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
import { dayLight, deckToneAt, type Preset } from "./sky.ts";

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

/** How much of a capped summit is SNOW rather than the hazed rock around
 * it. Not one: a cap is a field lying in the folds of a peak that still has
 * faces too steep to hold it, and a summit painted pure snow reads as a
 * paper cut-out of a mountain. */
const SNOW_SHOWS = 0.58;

export function createHorizon(): Horizon {
  /** Each vertex's own rock, 0.92..1.06 — a tall column stands a shade
   * lighter than the col beside it. */
  const ridgeRock: number[] = [];
  /** …and whether it is under SNOW. A flag rather than a second shade
   * table: what snow looks like is not what rock looks like multiplied by
   * anything (see `paint`), and a country with no snowline drops the flag
   * (`snowy`) rather than needing a whole second profile. */
  const ridgeCap: number[] = [];
  const ridgeHaze: number[] = [];
  const ridgeTone: number[] = [];
  /** How high each vertex stands in the sky, as a TANGENT — its height over
   * the ring's own plane against the radius it stands at. A tangent rather
   * than an angle because the country's scale is on the height alone
   * (`setCountry`), so scaling it and taking the arc-tangent at paint time
   * is the same number the eye sees; an angle baked here would have to be
   * re-derived anyway. */
  const ridgeRise: number[] = [];
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
      ridgeRise.push(-6 / radius, line / radius, h / radius);
      const rock = 0.92 + 0.14 * Math.min(1, h / Math.max(1, lift + jag));
      ridgeRock.push(rock, rock, rock);
      const capped = snowY !== null && h > snowY ? 1 : 0;
      ridgeCap.push(0, 0, capped);
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
  geo.setAttribute("color", new THREE.Float32BufferAttribute(ridgeRock.length * 3, 3));
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
  /** The conditions the rings are currently painted for, so a change of
   * COUNTRY can repaint from them: the colours are read per vertex against
   * a sky the country's own scale moves the vertices around in, and the two
   * setters are called in whichever order the caller likes. */
  let last: Preset | null = null;

  /** Repaint the horizon for the conditions: each vertex shaded against the
   * sky behind it, pulled toward the dark by its ring's own haze, darkened
   * by its ring's tone, and the snow laid over whatever that leaves. */
  const paint = (p: Preset): void => {
    last = p;
    const fogColor = new THREE.Color(p.fog);
    // The dark end each ring is pulled toward by its own `haze` — the more
    // of it, the further the ring has dissolved into the distance and the
    // less of this it keeps. Under the open sky the zenith is the darkest
    // the sky gets; under a deck it is the ceiling's own black underside,
    // which is a good deal darker still and, unlike the zenith, is a colour
    // the player can actually see out there.
    const dark = new THREE.Color(p.deck ? p.deck.overhead : p.zenith);
    // WHAT A SNOWFIELD LOOKS LIKE IN THIS LIGHT. A cap is not the rock
    // under it turned up — it is a white surface, and a white surface is
    // the colour of whatever falls on it: warm at noon, orange under a low
    // sun, a dim blue under the moon. It has to be told how much light
    // there is, because nothing in the scene lights a vertex colour — a
    // snowfield under a black storm is grey, and left at its clear-day
    // value it is the brightest thing on the screen.
    //
    // Turning the rock up is what this used to do, and a multiply that goes
    // over one OVERFLOWS: a peak painted at 1.7x a sunset's peach clipped
    // its red channel, lost the hue with it, and came back chalk-white —
    // a range out of a different photograph laid over the sunset. A mix
    // between two colours in gamut cannot do that.
    //
    // The ROOT of the light rather than the light itself, because this is
    // the one surface in the frame with nothing else to read it against: a
    // snowfield is the last thing in a landscape to go dark, so a clear
    // moonlit night at a tenth of a noon still wants a third of a cap
    // showing — while a storm's own tenth, which is the moon greyed out by
    // the lid rather than the moon, has to keep taking it down.
    const cap = new THREE.Color(p.sun).multiplyScalar(Math.sqrt(dayLight(p)));
    const air = new THREE.Color();
    const rock = new THREE.Color();
    const colors = geo.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < ridgeRock.length; i++) {
      // WHAT IS ACTUALLY BEHIND THIS VERTEX. Under the open sky that is the
      // air out there, and the fog it fades into is what the far distance
      // reads as on the ground too. Under a DECK it is not: the ceiling is
      // drawn over the whole dome, and its own ramp from the lit rim to the
      // black underside crosses the lower half of the chain (`RIM_BAND`) —
      // so a ring shaded against one flat colour comes out darker than the
      // sky at its feet and many times brighter than the sky at its
      // summits, which is a cut-out pasted over the weather rather than a
      // range standing in it. Read per vertex, the range picks the gradient
      // up: its feet dissolve into the lit gap under the base, its tops go
      // to soot.
      if (p.deck) deckToneAt(p.deck, Math.atan(ridgeRise[i] * scale), air);
      else air.copy(fogColor);
      rock
        .copy(air)
        .lerp(dark, ridgeHaze[i])
        .multiplyScalar(ridgeTone[i] * ridgeRock[i]);
      // The cap lies ON that, so it carries the ring's own aerial
      // perspective with it and a far snowfield stays further away than a
      // near one.
      if (snowy && ridgeCap[i]) rock.lerp(cap, SNOW_SHOWS);
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
    if (last) paint(last);
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
