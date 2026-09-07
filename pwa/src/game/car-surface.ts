// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S SURFACE — the one lit material a whole body is drawn with, and
// the per-vertex gloss that lets it be more than one material's worth of
// look.
//
// The car is lit by the SCENE: the same hemisphere, sun and spotlights that
// light the road it is standing on (environment.ts), through
// `MeshPhongMaterial` over the flat face normals car/builder.ts writes. A
// lambert-only car is the colour of its paint and nothing else, and what
// makes a car read as a CAR rather than as a coloured shape is the
// highlight — the bright edge that runs down a wing as it turns under a low
// sun, and the one the lamps lay on a bonnet at night. Phong is the cheapest
// model that has one.
//
// ONE MATERIAL, MANY SURFACES. Panels, wheels, trim and glass are a single
// merged mesh and a single draw call, and a lacquered wing and a rubber tyre
// want completely different highlights. So the difference rides the GEOMETRY
// — `aShine`, written per vertex by the builder (`SHINE`) — and this grafts
// it onto the specular term. A car whose tyres flare like its paint reads as
// a plastic toy; a car whose paint is as dead as its tyres reads as a
// primer-coated shell.
//
// The SHININESS stays one number for the whole car, because the exponent is
// what the highlight's SIZE comes from and the size that suits lacquer is
// close enough to the one that suits chrome at the range a car is seen from.
// It is the strength that has to differ, and that is what rides the vertex.

import * as THREE from "three";

/** How tight the highlight is. Low for a specular exponent — a rally car is
 * a dusty road car, not a concours entrant, so the highlight is a broad
 * sheen down a panel rather than a pin of light. Tight enough that it moves
 * as the car turns, which is the whole point of having one. */
const SHININESS = 26;

/** ...and the colour of it: the light's own, taken down hard. A specular at
 * full white on every panel is a car wrapped in foil under a low sun, and
 * the value that reads as "polished paint" is a good deal darker than
 * instinct suggests. */
const SPECULAR = 0x2a2a2a;

/** Whether a material carries the car's own gloss attribute — checked by
 * name so the lamps and the instruments, which are not lit at all, can never
 * be handed one. */
export const CAR_SURFACE = "car-surface";

export type CarSurfaceOptions = {
  name?: string;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
};

/**
 * A lit surface for one part of a car.
 *
 * `vertexColors` is always on: the colour attribute is the ALBEDO the
 * builder wrote, and Phong multiplies its diffuse by it exactly as the
 * fullbright material multiplied its flat colour by it — which is what
 * keeps the liveries, the dirt painter and the crumple's scuffing all
 * writing to the same buffer they always did.
 */
export function carSurface(options: CarSurfaceOptions = {}): THREE.MeshPhongMaterial {
  // Only the keys that were actually given: three warns on every parameter
  // handed an explicit `undefined`, and an options object with three unset
  // fields is three warnings per material per car.
  const material = new THREE.MeshPhongMaterial({
    name: options.name ?? CAR_SURFACE,
    vertexColors: true,
    specular: new THREE.Color(SPECULAR),
    shininess: SHININESS,
    opacity: options.opacity ?? 1,
    ...(options.transparent === undefined ? {} : { transparent: options.transparent }),
    ...(options.side === undefined ? {} : { side: options.side }),
    ...(options.depthWrite === undefined ? {} : { depthWrite: options.depthWrite }),
  });
  graftGloss(material);
  return material;
}

/**
 * CHAIN a shader graft onto a material, rather than replacing whatever is
 * already there.
 *
 * `onBeforeCompile` is a single slot, so two modules that both want a word
 * in a car's shader — the gloss below, and the lamps' wash in car-glow.ts —
 * silently overwrite each other, and which one survives depends on the order
 * they were called in. Whichever loses does nothing at all, with no error
 * and no missing symbol: its `.replace` simply never runs.
 *
 * `key` is what keeps three's program cache honest. Its default cache key is
 * `onBeforeCompile.toString()`, and every chained wrapper has the SAME
 * source text — so without a key of their own, a material carrying one graft
 * would happily be handed the compiled program of a material carrying two.
 *
 * It is also what makes this IDEMPOTENT, which chaining cannot do without.
 * A car is meshes sharing materials — panels, parts and wheels are one
 * material by design — so a caller walking the body to graft something
 * reaches the same material a dozen times. Assigning `onBeforeCompile` made
 * that harmless by accident, because the last write won; chaining turns it
 * into a dozen copies of the same declarations and a vertex shader that
 * fails to compile with `'vCarGlow' : redefinition`. The car then draws
 * nothing at all — no exception, no missing mesh, just a body-shaped hole
 * with its glass and lamps still in it.
 */
export function graftShader(
  material: THREE.Material,
  key: string,
  graft: (shader: { vertexShader: string; fragmentShader: string; uniforms: object }) => void,
): void {
  const had = (material.userData.grafts as string[] | undefined) ?? [];
  if (had.includes(key)) return;
  const before = material.onBeforeCompile;
  const keys = had.concat(key);
  material.userData.grafts = keys;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    graft(shader as never);
  };
  material.customProgramCacheKey = () => keys.join("|");
}

/**
 * Put the per-vertex gloss on a material's specular term.
 *
 * `specularmap_fragment` is where three decides `specularStrength`, from a
 * specular MAP if there is one and from 1.0 if there is not — so the graft
 * lands immediately after it and scales whatever it decided. Doing it there
 * rather than writing a specular map keeps the attribute a single float per
 * vertex instead of a texture per car, and leaves the map free for anything
 * that ever wants one.
 *
 * A geometry with no `aShine` reads the attribute as zero and comes back
 * with no highlight at all — which is why the builder writes it on every
 * face it makes, and why `flatten` hands its own on to whatever absorbs it.
 */
export function graftGloss(material: THREE.Material): void {
  graftShader(material, CAR_SURFACE, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aShine;
        varying float vShine;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vShine = aShine;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vShine;`)
      .replace(
        "#include <specularmap_fragment>",
        `#include <specularmap_fragment>
        specularStrength *= vShine;`,
      );
  });
}

/**
 * THE LIGHT A CAR IS LOOKED AT UNDER, away from the stage.
 *
 * Three places draw a car in a scene of their own — the pre-race card
 * (car-portrait.ts), the menu's turntable (car-turntable.ts) and the
 * preview tool's contact sheets (tools/car-preview.ts) — and none of them
 * has a sky to borrow light from. A lit car in an unlit scene is a black
 * car, so each stands up this rig instead.
 *
 * It is deliberately the SAME light the bodies used to carry baked into
 * their vertex colours: high, a touch to the front-right, with a floor under
 * it so no panel goes to a black hole. That is what keeps a contact sheet
 * comparable with every sheet shot before the car was lit at all — a review
 * tool whose lighting changed under it is a tool that cannot review the
 * thing it was pointed at.
 */
export function studioLights(): THREE.Group {
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff6e8, 1.35);
  key.position.set(0.35, 1, 0.45).normalize().multiplyScalar(10);
  group.add(key, key.target);
  // The floor: a hemisphere rather than a flat ambient, so an underside is
  // darker than a roof even on the side the key never reaches.
  group.add(new THREE.HemisphereLight(0xffffff, 0x9a9384, 1.55));
  return group;
}
