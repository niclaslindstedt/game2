// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE SNOW THAT LIES ON EVERYTHING STANDING: the load on a spruce's
// boughs, the cap on a boulder, the white on a roof and along a fence rail.
//
// The ground goes white by being PAINTED white (terrain.ts reads
// `snowLie`); everything standing on it cannot, because a tree is one
// geometry shared by every instance of that tree in the country and a
// second, snowed build of it would be a second mesh, a second draw call and
// a second megabyte per variant — a forest drawn twice to put a white edge
// on it.
//
// So the snow is not geometry and it is not vertex colour: it is a term in
// the MATERIAL, and every material that wears it costs one uniform and a
// dozen instructions. A face is snowed by how far it looks UP (its world
// normal's Y) and by how high it stands (its world Y, against the same
// snowline the ground paint uses) — so the load appears on exactly the
// faces that would hold it, fades in over the same metres the country
// whitens through, and is simply not there in a summer. Nothing new is
// drawn: the same instanced spruces that stood there in June stand there in
// January, wearing it.
//
// WHAT IT IS FOR is the other half. A stage whose ground has gone white and
// whose forest has not is the picture that gives a winter away — black
// trees on a white field read as a summer forest on a bleached photograph.
// The load is what makes the country cold.
//
// Two things it is deliberately NOT on: anything that MOVES (the cars, the
// traffic, the crowd, the livestock, the train — they shed it, and a car
// wearing a cap on its roof through a whole stage is a bug), and the ground
// itself, which has its own paint and its own blanket.

import * as THREE from "three";
import type { Climate, StageKnobs } from "@engine";

import { SNOW, zonesOf, zonesUnder } from "./ground-rules.ts";

/** The lit snow, and the same white the tile paint lays (terrain.ts) — the
 * load on a bough and the field under it are one snowfall, and two whites
 * would read as two. */
const SNOW_WHITE = new THREE.Color(0xeef2f7);

/** How much of a face's own colour the load leaves showing where it lies.
 * Nearly none: snow is an opaque thing SITTING on a bough, not a wash over
 * it — what keeps the tree readable is the bare dark BESIDE the load, which
 * is `BREAKS`' business, not a translucent white. */
const DEEPEST = 0.96;

/** Where a face has to LOOK to hold snow, as the world normal's Y: nothing
 * on the sheer sides of a trunk or a wall, everything on a roof pitch, a
 * bough or the top of a stone. The band opens low on purpose — a spruce is
 * a cone and its flanks stand at sixty degrees, so a rule that only dressed
 * the near-horizontal would put snow on nothing in a spruce forest. */
const HOLDS = { from: 0.05, to: 0.8 };

/** HOW THE LOAD BREAKS UP, which is the whole difference between snow and
 * a white wash.
 *
 * Snow does not fade out down a slope: it sits where it settled and STOPS,
 * in lumps, with the dark of the bough showing between them. So the amount
 * of snow a face wants — from its lean and its height — is not painted
 * directly. It is compared against a THRESHOLD that wanders with a noise
 * field, and what comes out is either snow or not, with a soft centimetre
 * at the join. A face that wants it badly (the top of a stone, a roof, the
 * flat of a bough) is under it everywhere; a face at the margin breaks into
 * clumps and bare patches, which is what a laden spruce actually is.
 *
 * The noise is read in WORLD space, so two of the same instanced tree
 * standing side by side wear different snow — the variety comes free, off
 * where a plant is rather than out of a second geometry. `coarse` is the
 * size of a clump in metres and `fine` the crumble along its edge; `edge`
 * is how soft the join is, and `bite` how far the threshold is allowed to
 * wander (at 0 it is a plain fade again). */
const BREAKS = { coarse: 1.35, fine: 0.38, edge: 0.1, bite: 0.62 };

/** THE STAGE'S OWN COLD, shared by every material wearing the cap — one
 * uniform object, set once when a stage is built, exactly as the breeze
 * clock is (`flora.ts`). x is the height the load starts at, y the metres
 * it fades in over, z how much of it there is at all (0 in a summer, which
 * is what makes this free where it is not wanted). */
const uSnowCap = { value: new THREE.Vector3(0, SNOW.fade, 0) };
const uSnowCapColor = { value: SNOW_WHITE };

/** Set the cold every capped material reads: the same snowline the ground
 * paint whitens from (`zonesUnder`, which brings a country's own line down
 * to wherever the climate freezes it), so a tree's foot goes white exactly
 * where the ground it stands on does. A country the climate leaves green
 * has no line and takes no load. */
export function setSnowCap(knobs: StageKnobs | undefined, climate: Climate): void {
  const zones = zonesUnder(climate, zonesOf(knobs));
  if (zones.snow === null) {
    uSnowCap.value.set(0, SNOW.fade, 0);
    return;
  }
  uSnowCap.value.set(zones.snow - SNOW.lead, SNOW.fade, DEEPEST);
}

/** Take the load off — a menu backdrop, a turntable, a preview that stands
 * one item up in no country at all. */
export function clearSnowCap(): void {
  uSnowCap.value.set(0, SNOW.fade, 0);
}

/** Give a material the snow load. Returns the same material, so a shared
 * factory can wrap its own construction in it.
 *
 * Composes with whatever the material already does on compile (the flora's
 * leafy material sways in the same vertex shader), and is silent on a
 * shader with nothing to attach to — a depth material, a shadow pass, a
 * three.js release that moves a chunk — because a missing white edge is a
 * far smaller thing than a stage that fails to draw. */
export function snowCap<T extends THREE.Material>(material: T): T {
  const already = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    already(shader, renderer);
    shader.uniforms.uSnowCap = uSnowCap;
    shader.uniforms.uSnowCapColor = uSnowCapColor;
    // Where in the WORLD this vertex is, taken AFTER everything that moves
    // it — the breeze included — so a swaying tip carries its own snow. The
    // height decides how much snow it wants; the whole position is what the
    // break-up is read at, which is why it is not just the Y.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowCapAt;")
      .replace(
        "#include <project_vertex>",
        `{
          vec4 snowCapPos = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            snowCapPos = instanceMatrix * snowCapPos;
          #endif
          vSnowCapAt = ( modelMatrix * snowCapPos ).xyz;
        }
        #include <project_vertex>`,
      );
    // ...and the face's own lean, read off the normal the lighting is about
    // to use — which is the one three.js has already flipped for a
    // double-sided leaf seen from behind, so a blade of grass is not snowed
    // on its underside. It is in VIEW space there; `normal * viewMatrix`
    // multiplies by the transpose, which for a rotation is the way back to
    // the world.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vSnowCapAt;
        uniform vec3 uSnowCap;
        uniform vec3 uSnowCapColor;
        // A value-noise field over the ground plane: cheap, tileless, and
        // read where the surface actually STANDS, so the clumps belong to
        // the place rather than to the model.
        float snowCapHash( vec2 c ) {
          return fract( sin( dot( c, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
        }
        float snowCapNoise( vec2 p ) {
          vec2 i = floor( p );
          vec2 f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix(
            mix( snowCapHash( i ), snowCapHash( i + vec2( 1.0, 0.0 ) ), f.x ),
            mix( snowCapHash( i + vec2( 0.0, 1.0 ) ), snowCapHash( i + vec2( 1.0, 1.0 ) ), f.x ),
            f.y );
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float snowLie = smoothstep( ${HOLDS.from.toFixed(2)}, ${HOLDS.to.toFixed(2)},
            normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz ).y );
          float snowCover = clamp( ( vSnowCapAt.y - uSnowCap.x ) / uSnowCap.y, 0.0, 1.0 );
          // How much snow this face WANTS...
          float snowWants = snowLie * snowCover;
          // ...against a threshold that wanders: clumps at the size of a
          // shovelful, crumbling along their edges.
          float snowBreak =
            snowCapNoise( vSnowCapAt.xz * ${(1 / BREAKS.coarse).toFixed(3)} ) * 0.7 +
            snowCapNoise( vSnowCapAt.xz * ${(1 / BREAKS.fine).toFixed(3)} ) * 0.3;
          float snowEdge = ${((1 - BREAKS.bite) / 2).toFixed(3)} +
            snowBreak * ${BREAKS.bite.toFixed(3)};
          float snowOn = smoothstep( snowEdge - ${BREAKS.edge.toFixed(3)},
            snowEdge + ${BREAKS.edge.toFixed(3)}, snowWants );
          diffuseColor.rgb = mix( diffuseColor.rgb, uSnowCapColor, snowOn * uSnowCap.z );
        }`,
      );
  };
  // A patched program is not the stock one, and three.js keys its shader
  // cache on the material's parameters alone: without a key of our own a
  // capped material and a plain one of the same kind share a compiled
  // program, and whichever compiled first decides whether the world has
  // snow on it. Kept beside whatever key the material already had, for the
  // same reason the compile hook is.
  const wasKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${wasKey()}|snow-cap`;
  return material;
}
