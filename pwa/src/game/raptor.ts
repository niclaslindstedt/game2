// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BIRD OF PREY: one large bird, alone, turning a thermal higher than
// anything else that flies over a stage. Both countries have them — a
// buzzard over the taiga, a vulture over the desert — and they are the same
// bird in different light, because what makes one is the way it FLIES.
//
// It is deliberately the opposite of the flocks in ambient-life.ts, which
// are many small birds beating hard around a point parked near the stage
// start. This one hangs on held wings, circling and rocking, and beats only
// in short bursts; and it belongs to the DRIVE rather than to a place —
// pitched half a kilometre ahead of where the camera is looking and
// re-pitched once left behind, so a stage that runs for kilometres always
// has one growing into the windscreen.
//
// Pure presentation, like everything beside it: all randomness here is
// renderer-side and can never touch the simulation.

import * as THREE from "three";

/** Where the camera is looking, read once a frame. Module-scoped because
 * this runs every frame of every run, and a fresh vector per frame is
 * garbage the collector has to come back for. */
const aim = new THREE.Vector3();

/** The colour of one in full daylight. Warmer than the flock's slate: a big
 * bird seen from below is brown, not blue-black. */
const COLOR = 0x2f2b26;

/** The soaring set: the shallow V it hangs its wings in, rad, and the deep,
 * slow beat it uses when it does bother — rad/s and rad, asymmetric because
 * a wing pulls hard on the way down and is only recovered on the way up.
 * The taiga flock beats three times this rate: a big bird's wings are
 * heavy, and a fast beat on a four-metre span is the single thing that
 * would make it read as a small bird held close to the lens instead. */
const SOAR = { dihedral: 0.17, beatRate: 3.1, beatUp: 0.34, beatDown: 0.72 };

/** How a burst of flapping is rationed, s: how long one lasts, and how long
 * the glide between them is. */
const BURST = { min: 0.9, vary: 1.6, restMin: 7, restVary: 11 };

/** Where a fresh thermal is pitched, relative to the camera: metres out,
 * metres up over whatever the country's own flocks wheel at, the circle it
 * holds, and the ±rad of the view direction it may sit within. */
const PITCH = {
  outMin: 410,
  outVary: 220,
  upMin: 20,
  upVary: 50,
  radiusMin: 34,
  radiusVary: 40,
  spread: 0.7,
};

/** How far behind the camera one is left before it is pitched somewhere
 * else, m — outside the driving camera's own far plane (900 m), so there is
 * nothing on screen to notice it going. */
const RECYCLE = 950;

/** One raptor wing: widest at the shoulder, squared off at the tip the way
 * a buzzard's is when it is soaring rather than driving forward. Same axes
 * as the flock's wing — x out along the span, +z ahead — and two and a half
 * times its span, because it is read from two and a half times further
 * away. Six vertices as a fan from the shoulder: the flock's three-vertex
 * dart is a bird only while it is small. */
function wingShape(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const rim = [
    [0.1, 0.36], [1.2, 0.32], [2.3, 0.06], [2.26, -0.2], [1.15, -0.34], [0.1, -0.4],
  ];
  const pos: number[] = [];
  for (let i = 1; i < rim.length - 1; i++) {
    for (const v of [rim[0], rim[i], rim[i + 1]]) pos.push(v[0], 0, v[1]);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** The body between the wings and the fanned tail behind it — the upright
 * of the cross, without which two held wings are a paper dart. The head
 * stands out ahead of the shoulders, which is the one detail that says
 * which way a circling bird is pointed. */
function bodyShape(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const pos = [
    // body: a spindle from the head back past the shoulders
    0, 0, 0.92,   0.15, 0, 0.1,   0, 0, -0.5,
    0, 0, 0.92,   0, 0, -0.5,   -0.15, 0, 0.1,
    // tail: a fan, widening behind the body
    -0.13, 0, -0.3,   0.13, 0, -0.3,   0.42, 0, -1.45,
    -0.13, 0, -0.3,   0.42, 0, -1.45,   -0.42, 0, -1.45,
  ];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** Fogless, like the sky it is part of: the world's air goes solid at half
 * a kilometre, and a bird inside that would be pale blue against blue
 * before it was ever big enough to see. What limits it instead is the
 * camera's own far plane, which retires it as a six-pixel speck. */
function material(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: COLOR, side: THREE.DoubleSide, fog: false });
}

/** Wings, body and tail on two hinges: `root` carries the position and the
 * heading, `body` carries the BANK, so a wingbeat measured against the body
 * still means the same thing while the bird leans into its turn. */
function assemble(
  wingGeo: THREE.BufferGeometry,
  bodyGeo: THREE.BufferGeometry,
  mat: THREE.Material,
): { root: THREE.Group; body: THREE.Group; left: THREE.Mesh; right: THREE.Mesh } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const left = new THREE.Mesh(wingGeo, mat);
  left.scale.x = -1; // mirrored, so both wings carry the same sweep
  const right = new THREE.Mesh(wingGeo, mat);
  body.add(left, right, new THREE.Mesh(bodyGeo, mat));
  root.add(body);
  return { root, body, left, right };
}

/** One raptor, alone, with geometry and material of its own — for the item
 * sheet, where the point is to LOOK at a silhouette a run only ever shows
 * as a speck. Posed as it flies: wings held, banked into a turn, and off
 * the sheet's grid rather than on it, because a soaring bird photographed
 * sitting on the ground is a dead one. */
export function raptorModel(): { object: THREE.Group; dispose: () => void } {
  const wingGeo = wingShape();
  const bodyGeo = bodyShape();
  const mat = material();
  const { root, body, left, right } = assemble(wingGeo, bodyGeo, mat);
  root.position.y = 1.4;
  body.rotation.z = 0.2;
  left.rotation.z = -SOAR.dihedral;
  right.rotation.z = SOAR.dihedral;
  return {
    object: root,
    dispose: () => {
      wingGeo.dispose();
      bodyGeo.dispose();
      mat.dispose();
    },
  };
}

type Bird = {
  root: THREE.Group;
  body: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  /** The thermal it is turning in: a point on the map, an altitude, and how
   * far out from the middle of it the bird is riding. */
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  angle: number;
  /** rad/s around the thermal — signed, because half of them turn the other
   * way, and a sky where every bird wheels the same way is a carousel. */
  turn: number;
  phase: number;
  /** Seconds of beating left, how long this burst was to begin with (the
   * ramp needs both ends of it), and seconds until the next one. */
  flapLeft: number;
  flapSpan: number;
  flapIn: number;
  /** Nothing is placed until the first frame: the thermals are pitched
   * around wherever the camera actually is, which nobody knows at build
   * time. */
  placed: boolean;
};

export type Raptors = {
  group: THREE.Group;
  /** How many this country flies, and how far over the camera to hold them
   * — enough to clear whatever else is wheeling below. Idempotent. */
  setCountry: (count: number, over: number) => void;
  /** The sky's light: near-black by day, invisible-dark at night, never
   * grey. */
  setTint: (tint: THREE.Color) => void;
  /** The CAMERA rather than a point, because a thermal is pitched ahead of
   * where it is LOOKING. */
  update: (camera: THREE.Camera, windX: number, windZ: number, dt: number) => void;
  dispose: () => void;
};

/** `most` is how many the busiest country flies: they are all built once
 * and hidden down to the count a given country wants, so a change of
 * country is a re-light rather than a rebuild. */
export function createRaptors(most: number): Raptors {
  const group = new THREE.Group();
  const mat = material();
  const wingGeo = wingShape();
  const bodyGeo = bodyShape();
  let count = 0;
  let over = 0;

  const birds: Bird[] = [];
  for (let i = 0; i < most; i++) {
    const parts = assemble(wingGeo, bodyGeo, mat);
    group.add(parts.root);
    birds.push({
      ...parts,
      cx: 0,
      cy: 0,
      cz: 0,
      radius: 0,
      angle: Math.random() * Math.PI * 2,
      turn: 0,
      phase: Math.random() * Math.PI * 2,
      flapLeft: 0,
      flapSpan: 1,
      flapIn: 2 + Math.random() * 8,
      placed: false,
    });
  }

  /** Pitch a fresh thermal for one bird: out in the country AHEAD of where
   * the camera is looking, and well above it. Called once at the start and
   * again every time the car leaves one behind — which is what keeps a
   * stage that runs for kilometres in birds without ever putting one on the
   * same bearing twice.
   *
   * Ahead rather than anywhere, because the sighting IS the approach. Half
   * a kilometre out a four-metre bird is four pixels, so it arrives as
   * nothing; the twenty seconds of driving that follow are what turn it
   * into a shape, and then into something that passes over the roof.
   * Pitched behind the car it would be recycled having never been seen.
   *
   * And within ±40° of the view rather than anywhere on the horizon: a bird
   * pitched wide is one the car drives past at three hundred metres, and
   * three hundred metres of air turns a bird back into a speck. */
  const rehome = (b: Bird, camX: number, camY: number, camZ: number, camYaw: number): void => {
    const bearing = camYaw + (Math.random() * 2 - 1) * PITCH.spread;
    const out = PITCH.outMin + Math.random() * PITCH.outVary;
    b.cx = camX + Math.sin(bearing) * out;
    b.cz = camZ + Math.cos(bearing) * out;
    b.cy = camY + over + PITCH.upMin + Math.random() * PITCH.upVary;
    b.radius = PITCH.radiusMin + Math.random() * PITCH.radiusVary;
    // rad/s: 0.12–0.20 over those radii is 6–12 m/s round the turn, which
    // is about what a soaring bird's circle is worth.
    b.turn = (0.12 + Math.random() * 0.08) * (Math.random() < 0.5 ? 1 : -1);
    b.placed = true;
  };

  const setCountry = (next: number, nextOver: number): void => {
    if (next === count && nextOver === over) return;
    count = next;
    over = nextOver;
    birds.forEach((b, i) => {
      b.root.visible = i < count;
      // Re-pitched rather than left where it was: the altitude it was given
      // belongs to the country it was given in.
      b.placed = false;
    });
  };

  const setTint = (tint: THREE.Color): void => {
    mat.color.set(COLOR).multiply(tint);
  };

  const update = (camera: THREE.Camera, windX: number, windZ: number, dt: number): void => {
    const t = performance.now() / 1000;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    camera.getWorldDirection(aim);
    const camYaw = Math.atan2(aim.x, aim.z);

    for (let i = 0; i < count; i++) {
      const b = birds[i];
      if (!b.placed) rehome(b, camX, camY, camZ, camYaw);
      // A thermal is a column of air, and air moves: the whole circle walks
      // downwind while the bird rides it, so the same bird is never quite
      // in the same place on the next lap.
      b.cx += windX * 0.12 * dt;
      b.cz += windZ * 0.12 * dt;
      // Squared distances — this runs once per bird per frame for a whole
      // run.
      const dx = b.cx - camX;
      const dz = b.cz - camZ;
      if (dx * dx + dz * dz > RECYCLE * RECYCLE) rehome(b, camX, camY, camZ, camYaw);

      b.angle += b.turn * dt;
      // THE SWAY, in three places at once, because one sine reads as a
      // machine: the circle breathes wider and tighter, the bird rises and
      // sinks through the thermal, and it rocks on its wings the way a
      // soaring bird trims itself against the air it is standing on.
      const radius = b.radius * (1 + Math.sin(t * 0.19 + b.phase) * 0.14);
      b.root.position.set(
        b.cx + Math.sin(b.angle) * radius,
        b.cy + Math.sin(t * 0.13 + b.phase) * 9,
        b.cz + Math.cos(b.angle) * radius,
      );
      // Facing the way it is GOING, which is the tangent of the circle and
      // not the radius — a quarter turn off the position angle, the other
      // way round for a bird wheeling the other way.
      b.root.rotation.y = b.angle + (b.turn > 0 ? Math.PI / 2 : -Math.PI / 2);
      // Bank INTO the turn — the roll a circle actually costs — plus the
      // teeter on top of it. The bank lives on the body rather than the
      // root so the wings still beat about the bird's own spine.
      const teeter = Math.sin(t * 1.3 + b.phase * 1.7) * 0.16;
      b.body.rotation.z = (b.turn > 0 ? -0.3 : 0.3) + teeter;

      // Flapping SOMETIMES: long stretches of held wing, and every so often
      // a short burst of beats to buy back the height the glide spent.
      if (b.flapLeft > 0) {
        b.flapLeft -= dt;
      } else {
        b.flapIn -= dt;
        if (b.flapIn <= 0) {
          b.flapSpan = BURST.min + Math.random() * BURST.vary;
          b.flapLeft = b.flapSpan;
          b.flapIn = BURST.restMin + Math.random() * BURST.restVary;
        }
      }
      // Held, the wings still work: a slow flex against the air, a fraction
      // of the dihedral. Beating, the deep down and shallow up the flock
      // uses, at a third of its rate.
      let flap = SOAR.dihedral + Math.sin(t * 0.6 + b.phase) * 0.035;
      if (b.flapLeft > 0) {
        const beat = Math.sin(t * SOAR.beatRate + b.phase);
        const swing = beat > 0 ? beat * beat * SOAR.beatUp : -(beat * beat) * SOAR.beatDown;
        // Ramped up at BOTH ends of the burst — measured from whichever end
        // is nearer — so a bird never snaps from a held wing into a full
        // beat between one frame and the next.
        const ramp = Math.min(1, Math.min(b.flapLeft, b.flapSpan - b.flapLeft) * 2.4);
        flap += swing * ramp;
      }
      b.left.rotation.z = -flap;
      b.right.rotation.z = flap;
    }
  };

  const dispose = (): void => {
    wingGeo.dispose();
    bodyGeo.dispose();
    mat.dispose();
  };

  return { group, setCountry, setTint, update, dispose };
}
