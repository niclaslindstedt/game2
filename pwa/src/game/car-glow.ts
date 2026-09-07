// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIGHT A CAR PUTS BACK ON ITSELF — the wash its own lamps lay on the
// panels around them, which after dark is the only light the car gets at
// all.
//
// The car is lit by the scene now (car-surface.ts), and the scene's lights
// still cannot do this one thing. A headlamp is a spotlight aimed down the
// road: its cone points AWAY from the bodywork carrying it, so no amount of
// real lighting puts a single lumen back on the wing behind it. Every car in
// the field would go on standing in a pool of its own light with an unlit
// tail panel a hand's width above it.
//
// What a night photograph actually shows around a lamp is SPILL: the rim,
// the bumper and the wing lit by what missed the reflector and by what the
// road throws back. That is a bounce, and a bounce is exactly what a real-
// time renderer has none of — so it is authored here instead, the way
// dust-light.ts authors the same missing bounce for a plume.
//
// A short, hard falloff centred on the lens is all that needs saying, and it
// needs no normal: at the polygon count of these bodies a per-vertex
// distance is already finer than the panels it is lighting.
//
// IT IS ADDED AS LIGHT, NEVER AS ALBEDO. That is the whole difference
// between this and the same term on a fullbright body. On a lit material the
// colour attribute is what the scene's light gets MULTIPLIED BY, so a lamp
// folded into it would be multiplied by a night sky of nearly nothing and
// come out as nothing — the effect would vanish on exactly the frames it
// exists for. It goes into the outgoing light instead, where the sun and the
// sky have already been added.
//
// The register is summed in WORLD space even though a car's lamps never move
// in its own frame, because the panels, the wheels and the parts hang in
// frames of their own and the world is the only one they share.

import * as THREE from "three";

import type { LampAnchor } from "./car/lamps.ts";
import { graftShader } from "./car-surface.ts";

/** Which end of the car a slot belongs to. */
export type GlowEnd = "head" | "tail";

/** How many of a car's own lamps wash it: the pair at each end. A cluster
 * carrying a second bulb in the same housing is not a second source at the
 * range a panel is lit from, which is why this counts ANCHORS rather than
 * bowls. */
export const CAR_GLOW_LAMPS = 4;

/** How far a lamp's spill carries along the bodywork, m. Short on purpose —
 * this is the light that missed the reflector, not the beam. The nose gets
 * the longer reach because there is more car behind a headlamp for it to
 * land on: a bumper, a wing top and the leading edge of the bonnet, where a
 * tail cluster has a panel and a bootlid. */
const REACH: Record<GlowEnd, number> = { head: 1.15, tail: 0.75 };

/** ...and how bright it is AT the lens, as a fraction of what the same panel
 * takes in daylight. Bounded from both sides. Under-driven, a lit car at
 * midnight is the flat sticker this module exists to fix; over-driven, the
 * panels around the lamps clip to white and the car reads as though it were
 * on fire rather than switched on. These are the values at which the tail of
 * a dark car goes visibly red under its own lamps and the paint under it is
 * still the colour it was. */
const GAIN: Record<GlowEnd, number> = { head: 0.8, tail: 0.52 };

/** The colour the NOSE washes with. Paler and cooler than the bloom over the
 * lens itself (`HEAD_GLOW`, car-mesh.ts): a bloom is the light escaping the
 * lamp and is allowed to be hot, where this is that light landing on paint,
 * and paint returns less of the red end than the glass does. */
const HEAD_SPILL = 0xfff0d2;

/** How much of the wash is SHEEN rather than paint, 0..1 — the half of it a
 * panel returns as the lamp's own colour instead of as its own.
 *
 * A light that lands on paint comes back multiplied by that paint, which is
 * why the rest of this is added under the vertex colour rather than over it:
 * a red lamp on a white bootlid goes red, and that is correct. Taken alone
 * it is also why the effect would disappear on precisely the cars that need
 * it most — a dark blue panel reflects almost none of a red tail lamp, so a
 * purely diffuse wash leaves a navy car exactly as invisible at midnight as
 * it was before. What actually picks one out in a photograph is the GLOSS:
 * a lacquered panel a hand's width from a burning lens throws the lens's own
 * colour back whatever is underneath it. This is that share, and it is the
 * term that makes a dark car read as lit.
 *
 * Held well under half. Past that the paint stops deciding what the car
 * looks like and every body in the field goes the same colour at night. */
const SHEEN = 0.32;

/** Where a lamp is (xyz, world) and how far its wash carries (w, m). */
const AT_STRIDE = 4;

export type CarGlow = {
  /** Put the term on one of the car's fullbright materials. */
  graft: (material: THREE.Material) => void;
  /** A lamp the crash has taken out of the car washes nothing — the same
   * call the bloom's geometry takes when it goes. */
  snuff: (end: GlowEnd, lamp: number) => void;
  /**
   * Refill the register for this frame. `head` and `tail` are what each END
   * is throwing, 0..1 — the same ladder the blooms walk, so a dipped nose
   * washes less of the car than an open one and a dark car washes none of
   * it. `tailColor` is the tail's colour this frame, which is the pedal's:
   * a brake light lights the panel above it as well as the road behind it.
   */
  shine: (car: THREE.Object3D, head: number, tail: number, tailColor: THREE.Color) => void;
};

/**
 * Build the register for one car, off the same anchors the blooms hang on
 * (`frontLampAnchors` / `rearLampAnchors`) — so a car with its lamps in its
 * wings washes its wings, and one with a cluster low on the tail washes the
 * bumper under it.
 */
export function createCarGlow(front: LampAnchor[], rear: LampAnchor[]): CarGlow {
  const slots = [
    ...front.slice(0, CAR_GLOW_LAMPS).map((a) => ({ end: "head" as GlowEnd, a })),
    ...rear.map((a) => ({ end: "tail" as GlowEnd, a })),
  ]
    .slice(0, CAR_GLOW_LAMPS)
    .map(({ end, a }) => ({ end, local: new THREE.Vector3(a.x, a.y, a.z), live: true }));

  const at = new Float32Array(CAR_GLOW_LAMPS * AT_STRIDE);
  const lit = new Float32Array(CAR_GLOW_LAMPS * 3);
  /** Shared by REFERENCE with every grafted material on this car, so the
   * register is written once a frame rather than once per panel. */
  const uniforms = {
    uCarGlowAt: { value: at },
    uCarGlowLit: { value: lit },
    uCarGlowCount: { value: 0 },
  };

  const world = new THREE.Vector3();
  const tone = new THREE.Color();
  const headTone = new THREE.Color(HEAD_SPILL);

  const graft = (material: THREE.Material): void => {
    graftShader(material, "car-glow", (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
        uniform vec4 uCarGlowAt[ ${CAR_GLOW_LAMPS} ];
        uniform vec3 uCarGlowLit[ ${CAR_GLOW_LAMPS} ];
        uniform int uCarGlowCount;
        varying vec3 vCarGlow;`,
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
        vCarGlow = vec3( 0.0 );
        vec3 glowAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        for ( int i = 0; i < ${CAR_GLOW_LAMPS}; i++ ) {
          // Nothing is thrown by day, so the count is zero and the whole
          // loop is a branch a lit car never takes twice.
          if ( i >= uCarGlowCount ) break;
          vec4 lamp = uCarGlowAt[ i ];
          float fall = max( 0.0, 1.0 - length( glowAt - lamp.xyz ) / max( lamp.w, 0.001 ) );
          // Squared, so the wash is a light AT the lamp rather than an even
          // lift over the end of the car.
          vCarGlow += uCarGlowLit[ i ] * fall * fall;
        }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
        varying vec3 vCarGlow;
        const float CAR_SHEEN = ${SHEEN.toFixed(3)};`,
        )
        // Onto the OUTGOING light, where the sun, the sky and the specular
        // have already been summed — never into `diffuse`, which on a lit
        // material is the albedo the scene's light is multiplied BY. The
        // paint's share is multiplied by that albedo here instead, by hand,
        // so a red lamp on a white bootlid still goes red; the gloss's share
        // is not, because lacquer throws the lens's own colour back whatever
        // is underneath it.
        .replace(
          "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;",
          "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance" +
            " + vCarGlow * ( diffuseColor.rgb * ( 1.0 - CAR_SHEEN ) + vec3( CAR_SHEEN ) );",
        );
    });
  };

  const snuff = (end: GlowEnd, lamp: number): void => {
    let seen = 0;
    for (const slot of slots) {
      if (slot.end !== end) continue;
      if (seen++ === lamp) slot.live = false;
    }
  };

  const shine = (car: THREE.Object3D, head: number, tail: number, tailColor: THREE.Color): void => {
    if (head <= 0 && tail <= 0) {
      uniforms.uCarGlowCount.value = 0;
      return;
    }
    // The car's own group is placed at the top of the frame's update and the
    // lamps are read at the bottom of it, so this is the frame's pose and not
    // the last one's — a stale matrix here smears the wash a car length up
    // the road at racing speed.
    car.updateWorldMatrix(true, false);
    for (const [i, slot] of slots.entries()) {
      world.copy(slot.local).applyMatrix4(car.matrixWorld);
      const head_ = slot.end === "head";
      at[i * AT_STRIDE] = world.x;
      at[i * AT_STRIDE + 1] = world.y;
      at[i * AT_STRIDE + 2] = world.z;
      at[i * AT_STRIDE + 3] = REACH[slot.end];
      const power = slot.live ? (head_ ? head * GAIN.head : tail * GAIN.tail) : 0;
      tone.copy(head_ ? headTone : tailColor).multiplyScalar(power);
      lit[i * 3] = tone.r;
      lit[i * 3 + 1] = tone.g;
      lit[i * 3 + 2] = tone.b;
    }
    uniforms.uCarGlowCount.value = slots.length;
  };

  return { graft, snuff, shine };
}
