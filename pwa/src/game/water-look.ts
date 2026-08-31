// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What water LOOKS like, in one place — the lakes the ground floods
// (terrain.ts), the fords the road runs through (road-mesh.ts) and the
// streams that feed both (streams.ts).
//
// The look is Quake's, and that is a decision rather than a shortcut. A
// body of water is a FLAT sheet lying at one level, carrying a plain water
// texture you can see the bed through — not a shaded surface pretending to
// have swell in it. The normal is straight up at every vertex, so the whole
// sheet takes the light as one tone, and the alpha is low enough that the
// stones and weed under it read as being under it.
//
// The sun still glitters on it, and that survives the flatness rather than
// fighting it: a specular lobe off a constant up-normal is a single coherent
// glare lying where the sun actually reflects, which is what a lake does.
// It is only garbage when the normal is wrong — computed off a sheet wound
// the wrong way round, the highlight is solved against the UNDERSIDE of the
// water and the surface goes dead whatever the sun is doing.
//
// ONE material, shared by all three. Water that meets water — a stream
// running into a lake, a ford cut through that stream — has to be the same
// colour where it meets, and a material per crossing is both a second look
// to keep in step and a second shader program to bind.

import * as THREE from "three";

import { shareOne } from "../lib/shared-gpu.ts";
import { waterTexture } from "./textures.ts";

/** How much of what is under the water comes through it. Quake's
 * `r_wateralpha`, and the same judgement: far enough down that a ford reads
 * as something to drive through rather than a blue lid, far enough up that
 * a lake still reads as water and not as a tint over a beach. */
const ALPHA = 0.66;

/** The one water surface material. `shareOne` marks it as the app's, so the
 * teardown walk in world.ts steps over it instead of freeing it with
 * whichever chunk of stage happened to be dropped first. */
export const waterMaterial = shareOne(
  (): THREE.MeshPhongMaterial =>
    new THREE.MeshPhongMaterial({
      map: waterTexture(),
      specular: 0xcfe4ff,
      shininess: 130,
      transparent: true,
      opacity: ALPHA,
      // Both sides, because water is drawn from under it as often as a car
      // ends up in a lake — and because a sheet that is silently culled
      // when its winding is wrong is a bug that reads as the bed flickering
      // rather than as the water being gone.
      side: THREE.DoubleSide,
    }),
);

/** Creep the grain across the surface. Slow: the texture is the whole of
 * the movement there is, so anything fast enough to notice as scrolling
 * reads as the lake sliding sideways. */
export function driftWater(dt: number): void {
  const tex = waterTexture();
  tex.offset.x += dt * 0.008;
  tex.offset.y += dt * 0.005;
}
