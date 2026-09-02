// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R12 — THE CULVERT, drawn: the pipe a stream runs through under a road
// that stands over it on its own fill. The engine decided where it is and
// at what level (`track.culverts`); this stands the pipe in the ground so
// a driver sees, on each side of the embankment, the round mouth the water
// goes into and comes out of. Without it the water simply stops at one
// side of the road and starts again at the other, which reads as two
// streams that happen to line up.
//
// A concrete pipe with a headwall at each mouth: the length of the
// corridor, its invert a little under the water so the stream is seen to
// run IN it, and open at both ends so the far daylight shows through.

import * as THREE from "three";
import { ROAD_CROSS, STAGE_RULES, type Track } from "@engine";

const CONCRETE = "#9a978d";
const CONCRETE_DARK = "#6f6c64";

/** How far past the corridor's lip each mouth stands proud, m: out to
 * where the channel is cut to the water, since beside a road the channel
 * keeps to the road's own fill slope (`terrain.ts`) and the water only
 * shows a few metres out from the lip. */
const MOUTH = 3;
/** How far under the water's surface the pipe's invert sits, m. */
const INVERT = 0.35;

/** The culverts whose crossings fall on `samples[from..to)`, as one group. */
export function buildCulverts(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const samples = track.samples;
  if (from >= samples.length) return group;
  const fromS = samples[from].s;
  const toS = to < samples.length ? samples[to].s : Infinity;
  const bore = STAGE_RULES.water.culvert.bore;
  const pipeMat = new THREE.MeshLambertMaterial({ color: CONCRETE_DARK, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshLambertMaterial({ color: CONCRETE });
  for (const culvert of track.culverts) {
    if (culvert.s < fromS || culvert.s >= toS) continue;
    let nearest = from;
    for (let i = from; i < Math.min(to, samples.length); i++) {
      if (Math.abs(samples[i].s - culvert.s) < Math.abs(samples[nearest].s - culvert.s)) {
        nearest = i;
      }
    }
    const width = samples[nearest].width;
    const reach = width / 2 + ROAD_CROSS.reach + MOUTH;
    // Square across the road: the lateral axis of the sample it sits on.
    const across = new THREE.Vector3(Math.cos(culvert.heading), 0, -Math.sin(culvert.heading));
    const centre = new THREE.Vector3(culvert.x, culvert.waterY - INVERT + bore, culvert.z);
    const lie = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), across);

    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(bore, bore, reach * 2, 14, 1, true),
      pipeMat,
    );
    pipe.position.copy(centre);
    pipe.quaternion.copy(lie);
    group.add(pipe);

    // A headwall at each mouth: the slab the pipe comes out of, standing
    // in the embankment's face a little wider and taller than the bore.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(bore * 2 + 1.2, bore * 2 + 0.7, 0.3),
        wallMat,
      );
      wall.position.copy(centre).addScaledVector(across, side * (reach - 0.3));
      wall.position.y += 0.15;
      // The slab faces along the pipe: its thin axis is the pipe's own.
      wall.quaternion
        .copy(lie)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      group.add(wall);
    }
  }
  return group;
}
