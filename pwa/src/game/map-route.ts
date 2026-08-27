// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROUTE, drawn on the map view. Seen from kilometres up, the road
// itself is a thread of gravel a few pixels wide against a whole landscape
// — you can find it if you already know where it is, which is no use at all
// on the page whose entire job is showing what a seed built.
//
// So the map view gets its own ribbon: the same centerline the physics
// rides, drawn wide enough to READ at that altitude, in the HUD's own
// signal yellow, with the start and finish called out. It is a map
// annotation rather than scenery — unlit, unfogged, and drawn over
// everything, because a route that dips behind a hill has stopped being a
// route. Built with the world, shown only while the map camera is up.

import * as THREE from "three";
import type { Track } from "@engine";

/** Ribbon width as a fraction of the stage's own span, so the route reads
 * the same on a 1.8 km sprint and an 11 km epic — both are framed to fill
 * the screen, so both want a line of about the same THICKNESS ON SCREEN. */
const WIDTH_OF_SPAN = 1 / 55;
/** ...clamped, m: never thinner than a line that survives a phone screen,
 * never so fat it reads as a runway. */
const MIN_WIDTH = 16;
const MAX_WIDTH = 70;

/** How far above the landscape the ribbon floats, m. Enough to clear the
 * terrain it follows over a crest; it is drawn depth-test-free anyway, so
 * this only keeps the shape honest. */
const LIFT = 6;

/** Stride through the samples, m. The road is sampled every 2 m, which is
 * far finer than this view can show; one vertex pair every ~16 m keeps an
 * 11 km stage's ribbon cheap without visibly faceting a hairpin. */
const STRIDE = 16;

/** Marker discs at the ends, as a multiple of the ribbon width. */
const MARKER_SCALE = 1.9;

export type MapRoute = {
  group: THREE.Group;
  dispose: () => void;
};

function rightOf(heading: number): { x: number; z: number } {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** A flat disc lying on the ground at a point, for the start and finish. */
function marker(x: number, y: number, z: number, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshBasicMaterial({
      color,
      fog: false,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 11;
  return mesh;
}

export function buildMapRoute(track: Track): MapRoute {
  const group = new THREE.Group();
  const bounds = track.bounds;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 200);
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, span * WIDTH_OF_SPAN));
  const half = width / 2;

  const samples = track.samples;
  const stride = Math.max(1, Math.round(STRIDE / track.step));
  const positions: number[] = [];
  const indices: number[] = [];
  let pairs = 0;

  const addPair = (i: number): void => {
    const s = samples[i];
    const r = rightOf(s.heading);
    const y = s.elevation + LIFT;
    positions.push(s.x - r.x * half, y, s.z - r.z * half, s.x + r.x * half, y, s.z + r.z * half);
    if (pairs > 0) {
      const a = (pairs - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    pairs++;
  };

  for (let i = 0; i < samples.length; i += stride) addPair(i);
  // The last sample always gets a pair: a stride that does not divide the
  // stage would otherwise stop the ribbon short of its own finish line.
  if ((samples.length - 1) % stride !== 0) addPair(samples.length - 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd23e,
    // Unfogged and depth-test-free: this is an annotation ON the map, not a
    // thing standing in the landscape. A route the far hills swallow is not
    // telling anyone what the seed built.
    fog: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.renderOrder = 10;
  group.add(ribbon);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const radius = half * MARKER_SCALE;
  group.add(marker(first.x, first.elevation + LIFT, first.z, radius, 0x7cbf3f));
  // An endless stage has no finish to mark — the road simply keeps going.
  if (!track.endless) {
    group.add(marker(last.x, last.elevation + LIFT, last.z, radius, 0xe23c2c));
  }

  return {
    group,
    dispose: () => {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      });
    },
  };
}
