// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE SUN IS, as one vector every material that needs it reads.
//
// Three's own lights carry the sun for the built-in shading, and anything
// assembled from `MeshLambertMaterial` gets it for free. What does NOT get
// it is a term GRAFTED onto one — the glitter off snow crystals, the sheen
// down the windward face of a dune — because those are computed after the
// library's lighting has already resolved and have no way back to the light
// it used.
//
// So the sun is stated once here, written by the environment on the frame it
// moves (environment.ts, beside the height fog's own uniforms, which is the
// one place the sun is known to have changed), and read by reference from
// every grafted shader. A second copy of it is a frame of lag on one
// surface and not the other, which reads as two suns.

import * as THREE from "three";

/** The direction TOWARD the sun, unit, world space. Mutated in place — every
 * shader holds this exact object as a uniform value, so it must never be
 * reassigned, only copied into. */
export const SUN_DIR = new THREE.Vector3(0, 1, 0);
