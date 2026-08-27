// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COASTLINE the map view cuts the world down to.
//
// The landscape is built as a corridor of 224 m tiles around the road,
// reaching far enough past the driving fog that the world never visibly
// ends. From the ground that reach is invisible; from the map camera it is
// the whole silhouette, and a union of square tiles seen from a satellite
// is a staircase — a stage that reads as a chunk of graph paper rather than
// as a place.
//
// So the map view CLIPS. The stage is cut to its own route dilated by a
// margin: a convex outline that hugs a compact loop as a rounded blob and
// an epic point-to-point as a long oval, and never touches the tile edges
// it hides. Cutting is a VIEW, not a build — the geometry is untouched, so
// a player who drives off into the trees still finds ground out there.
//
// Clipping planes are half-spaces, so the curve is an N-gon tangent to the
// dilated hull. At the sizes a stage is framed at, 24 sides is a coastline
// nobody reads as a polygon.

import * as THREE from "three";
import type { Track } from "@engine";

/** How much country the map shows around the route, m. Wide enough that the
 * road never runs along its own coast and the hills it crosses are part of
 * the picture; short of the corridor's own reach (terrain.ts), so the
 * cut always lands on built ground rather than exposing the tile edges it
 * exists to hide. */
export const ISLAND_MARGIN = 300;

/** Sides of the cut. */
const SIDES = 24;

/** Stride through the road samples when solving each side — the outline is
 * a support function over the route, and 32 m of road cannot move a tangent
 * line by anything the eye can find at map scale. */
const STRIDE = 16;

/** The half-spaces the map view keeps: for each of `SIDES` directions, the
 * line tangent to the route's hull pushed out by `ISLAND_MARGIN`. three.js
 * keeps a fragment where `n · p + constant >= 0`, so each plane's normal
 * points INWARD and its constant is the outward support distance. */
export function islandPlanes(track: Track): THREE.Plane[] {
  const samples = track.samples;
  const planes: THREE.Plane[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    let support = -Infinity;
    for (let s = 0; s < samples.length; s += STRIDE) {
      const d = samples[s].x * nx + samples[s].z * nz;
      if (d > support) support = d;
    }
    // The last sample is the finish, and on a point-to-point it is as much
    // an end of the outline as any: a stride that steps over it would cut
    // the coast through the finish line.
    const last = samples[samples.length - 1];
    support = Math.max(support, last.x * nx + last.z * nz) + ISLAND_MARGIN;
    planes.push(new THREE.Plane(new THREE.Vector3(-nx, 0, -nz), support));
  }
  return planes;
}
