// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SKEIN: big birds CROSSING the sky, in formation, on their way
// somewhere else. Geese and whooper swans over the taiga and the Alps —
// the one thing in the air that is neither a resident (the flocks and the
// birds of prey, which belong to a place and wheel around it) nor a
// machine (the airliners in sky-traffic.ts, half a kilometre up).
//
// What makes a skein a skein is that it is GOING somewhere and everybody
// in it is going there together. So nothing here circles. A crossing is a
// straight track on a compass bearing at a held altitude, and the birds
// stand in a shape on it — a vee, a straight trailing line, or a loose
// group — with the wingbeat running down the line as a wave rather than
// striking together, which is the detail that separates a skein from a
// row of decorations.
//
// THE SEASON IS THE POINT. In SPRING they come north and in AUTUMN they go
// south, in long high vees, because that is what the two words spring and
// autumn mean to anything with wings; in SUMMER the same birds are still
// here, but they are flying between one lake and the next, so they are
// lower, in smaller groups, in lines rather than vees, and on no particular
// bearing. The compass is anchored to the noon sun, which is the only thing
// in this world that has ever claimed a direction (daylight.ts's `SOUTH`).
//
// Pure presentation, like everything beside it: all randomness here is
// renderer-side and can never touch the simulation. The plan half —
// what flies, where it heads, and where each bird stands in the shape — is
// DOM-free and exported, so `tests/skein_test.ts` can read it.

import * as THREE from "three";
import type { Season } from "@engine";

import { SOUTH } from "./daylight.ts";

/** What is flying. Two birds, and they are not the same bird in different
 * paint: a swan is half again the span, beats half as fast, holds its neck
 * out as far as its own body is long, and — this being the whole reason to
 * have both — is WHITE, so it is the one thing in the sky that is lighter
 * than the sky. */
export type SkeinKind = "geese" | "swans";

/** How they stand on the track. `vee` is the migrating skein everyone
 * pictures; `line` is the other half of what a real one does, a single
 * straight echelon trailing back off the leader; `group` is a few birds
 * going to the next water with no formation to speak of. */
export type Formation = "vee" | "line" | "group";

/** One crossing, planned. Distances in metres, bearings in radians. */
export type Passage = {
  kind: SkeinKind;
  shape: Formation;
  birds: number;
  /** The compass bearing they fly TOWARD (heading convention: the bearing
   * of the velocity in the world's x/z). */
  bearing: number;
  /** How far over the camera they hold. */
  height: number;
  /** Ground speed, m/s. */
  speed: number;
};

/** Where the birds live. The spans and the lengths are the real ones — a
 * greylag is 1.6 m across and 0.85 m long, a whooper 2.4 m across and 1.5 m
 * long — and they are stated as a SPAN plus two lengths in half-spans, so
 * one wing and one body serve both birds at one scale each.
 *
 * `neck` is how far ahead of the shoulders the head reaches and `back` how
 * far behind them the tail ends, and the RATIO between those two is the
 * whole difference in the air: a goose's neck is half its back, a swan's is
 * as long as its back. The beats are honest too — a goose is about three a
 * second, a swan closer to two — and matter more than either silhouette,
 * because at four hundred metres the beat is the only thing still legible.
 */
const KINDS: Record<
  SkeinKind,
  {
    span: number;
    color: number;
    beatHz: number;
    stroke: number;
    neck: number;
    back: number;
    speed: number;
  }
> = {
  geese: {
    span: 1.6,
    color: 0x4b4438,
    beatHz: 3.1,
    stroke: 0.85,
    neck: 0.375,
    back: 0.69,
    speed: 19,
  },
  swans: {
    span: 2.4,
    color: 0xeef1f4,
    beatHz: 2.1,
    stroke: 0.7,
    neck: 0.62,
    back: 0.63,
    speed: 16,
  },
};

/** The wing angles a beat swings between, rad — deep down, shallow up, the
 * same asymmetry every other bird here flies with, and a little dihedral
 * held at the crossing so a bird at the top of its stroke is still a bird
 * and not a plank. */
const BEAT = { down: 0.85, up: 0.45, dihedral: 0.06 };

/** THE COMPASS. The noon sun stands in the south in this world, which
 * makes daylight.ts's `SOUTH` the one bearing anything can be stated
 * against. */
const NORTH = SOUTH + Math.PI;

/** How far apart they stand, in SPANS: across the track and back along it.
 * A real skein flies about a wingspan apart; this is a fifth wider, because
 * two birds one span apart at three hundred metres are one bird — and no
 * wider than that, because a vee of thirteen at this spacing is already
 * twenty-three metres across the sky. */
const SPACING = { across: 1.2, along: 1.6 };

/** ...and how a loose GROUP is laid out instead, in spans: how far out the
 * spiral steps per bird, how wide it is stretched across the track, how far
 * behind the leader the nearest of the rest sits, and how much of the
 * spiral's own turn is allowed to move a bird fore and aft. */
const GROUP = { step: 1.1, across: 1.7, lead: 0.7, stagger: 0.7 };

/** The golden angle, rad — the turn between one seed of a sunflower and the
 * next, and the one angle that never lets a spiral fall into rows. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** How high a crossing holds, m over the camera: a migrating skein is
 * properly high — above the resident flocks and the buzzards, well below
 * the airliners' lowest lane (300 m) — and a summer flight between two
 * lakes is barely over the trees.
 *
 * These are the LOW end of what real birds do, and deliberately. A skein at
 * the three hundred metres geese are perfectly happy at is four pixels of
 * screen, and four pixels cannot be a vee — it is grit on the lens. At a
 * hundred and twenty a goose is six pixels and a formation of thirteen is a
 * hand's width of sky, which is a skein. */
const HEIGHT = { migrate: [90, 150], local: [40, 80] } as const;

/** Where a crossing is pitched, relative to the camera: how far out the
 * point it will cross is, the ±rad of the view direction that point may
 * sit within, and how far back up its own bearing the skein starts.
 *
 * The lead is the whole trick. A skein put down where it is meant to be
 * seen is a skein that was already there; one backed up a kilometre along
 * its own track ARRIVES, which is what a skein going over actually does to
 * a person on the ground — a smudge, then a shape, then birds, then gone.
 * At a goose's twenty metres a second that lead is a minute of flying,
 * which is also what sets how often one comes over. */
const PITCH = { outMin: 150, outVary: 260, spread: 0.85, lead: 1200 };

/** How far PAST its crossing point one is followed before it is given up
 * on, m — outside the driving camera's far plane (900 m), so nothing is
 * ever seen to vanish, and short enough that the pool is not sat behind the
 * car for a minute doing nothing. */
const PAST = 950;

/** ...and how far from the CAMERA, which is the other way a crossing ends:
 * the car can simply out-drive one, at twice its speed and on its own
 * bearing. */
const RECYCLE = 1600;

/** How much of the wind a bird at that height is carried by. Not all of it:
 * a skein is flying, not drifting, and it holds its track. */
const WIND_CARRY = 0.35;

/** The most birds one crossing can hold — the ceiling the instance pools
 * are sized against. */
export const MOST_BIRDS = 15;

/**
 * WHAT IS CROSSING, for a season. `roll` returns 0..1 and is injected so
 * this is a decision rather than a coin toss when it is being measured.
 *
 * Spring and autumn are the same passage flown the opposite way — which is
 * the one thing the two words have to mean here. Summer is a different
 * event with the same birds in it: lower, smaller, no vees and no compass.
 */
export function passageFor(season: Season, roll: () => number): Passage {
  const migrating = season !== "summer";
  // Swans are the rarer sight in both seasons, and rarer still on passage:
  // a vee going over is nearly always geese, and a line of six white birds
  // is the one you tell somebody about.
  const kind: SkeinKind = roll() < (migrating ? 0.25 : 0.4) ? "swans" : "geese";
  const shape: Formation = migrating
    ? kind === "geese" && roll() < 0.7
      ? "vee"
      : "line"
    : roll() < 0.55
      ? "line"
      : "group";
  const span = migrating ? HEIGHT.migrate : HEIGHT.local;
  // A migrating skein is a crowd; a summer flight is a family.
  const most = migrating ? (kind === "geese" ? MOST_BIRDS : 9) : 6;
  const fewest = migrating ? 7 : 3;
  return {
    kind,
    shape,
    birds: fewest + Math.floor(roll() * (most - fewest + 1)),
    bearing: migrating
      ? (season === "spring" ? NORTH : SOUTH) + (roll() - 0.5) * 0.5
      : roll() * Math.PI * 2,
    height: span[0] + roll() * (span[1] - span[0]),
    // Passage is flown with a tailwind and a purpose; a hop to the next
    // lake is not.
    speed: KINDS[kind].speed * (migrating ? 1 : 0.8) * (0.9 + roll() * 0.25),
  };
}

/**
 * WHERE ONE BIRD STANDS in the shape, in SPANS: `across` the track (+ is
 * the bird's own right) and `along` it (negative is behind the leader, who
 * is always bird 0 at the origin). Spans rather than metres so a swan
 * skein is spaced like swans without a second table.
 */
export function formationOffset(shape: Formation, i: number): { across: number; along: number } {
  if (i === 0) return { across: 0, along: 0 };
  if (shape === "vee") {
    // Alternating arms: 1 and 2 are the first pair off the leader's
    // shoulders, 3 and 4 the next, and so on out.
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 1 ? 1 : -1;
    return { across: side * rank * SPACING.across, along: -rank * SPACING.along };
  }
  if (shape === "line") {
    // One arm of the same vee: the straight diagonal skein, which is what a
    // line of swans over a lake actually looks like.
    return { across: i * SPACING.across, along: -i * SPACING.along };
  }
  // A loose group: no rank at all, just a huddle that holds together and
  // trails back off whoever is in front. Laid out on a golden-angle spiral
  // rather than on a roll — the same construction a sunflower's seeds are
  // on, and for the same reason: it never repeats and it never lets two
  // sit on top of each other, which a hash of the index cannot promise and
  // which is the only thing a formation has to get right.
  const r = Math.sqrt(i) * GROUP.step;
  const turn = i * GOLDEN_ANGLE;
  return {
    across: r * Math.cos(turn) * GROUP.across,
    along: -(GROUP.lead + r + r * Math.sin(turn) * GROUP.stagger),
  };
}

/** One wing: long, narrow and tapered to a point, which is a goose's and
 * not a buzzard's. Same axes as every other bird here — x out along the
 * span, +z ahead — and one unit long, so the caller's half-span is the
 * whole of the scale. Four triangles as a fan off the shoulder. */
function wingShape(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const rim = [
    [0.05, 0.10], [0.45, 0.085], [0.95, 0.02], [1.0, -0.05], [0.48, -0.11], [0.05, -0.14],
  ];
  const pos: number[] = [];
  for (let i = 1; i < rim.length - 1; i++) {
    for (const v of [rim[0], rim[i], rim[i + 1]]) pos.push(v[0], 0, v[1]);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** The body between the wings: a spindle, a short fanned tail, and THE NECK
 * held straight out ahead — which is the entire silhouette. A goose and a
 * swan are told apart at any distance by how far that line reaches in front
 * of the wings, and a heron from both by the fact that it doesn't.
 *
 * Built about the SHOULDERS at z = 0, since that is the hinge the wings
 * turn on: `neck` reaches forward from there to the tip of the bill and
 * `back` behind it to the end of the tail, both in half-spans. */
function bodyShape(neck: number, back: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const fan = -back * 0.55;
  // prettier-ignore
  const pos = [
    // the body, widest just behind the shoulders
    0, 0, 0.12,   0.13, 0, -0.06,   0, 0, fan,
    0, 0, 0.12,   0, 0, fan,   -0.13, 0, -0.06,
    // the neck and head, out front
    0.055, 0, 0.08,   -0.055, 0, 0.08,   0, 0, neck,
    // the tail, a small fan — narrow, because a wide one is a second pair
    // of wings pointing the wrong way
    -0.06, 0, fan,   0.06, 0, fan,   0.1, 0, -back,
    -0.06, 0, fan,   0.1, 0, -back,   -0.1, 0, -back,
  ];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** Fogless, like everything else in the sky: the world's air goes solid at
 * half a kilometre, and a skein inside that would be sky-coloured before it
 * was ever big enough to make out. What retires one is the camera's far
 * plane instead. */
function material(kind: SkeinKind): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: KINDS[kind].color,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** THE WING ANGLE at a point in the stroke, 0..1 round one full beat. Read
 * by the frame loop and by the posed models, so a bird photographed on the
 * sheet is at an angle the sky actually flies it through. */
function flapAt(turn: number, stroke: number): number {
  const beat = Math.sin(turn * Math.PI * 2);
  return (beat > 0 ? beat * beat * BEAT.up : -(beat * beat) * BEAT.down) * stroke + BEAT.dihedral;
}

/** One bird, built as a group of three meshes over shared geometry — what
 * the posed models below are made of. The frame loop does NOT use this: in
 * the air a bird is three instance matrices, and a group per bird would be
 * sixty draw calls of scenery. */
function poseBird(
  kind: SkeinKind,
  wingGeo: THREE.BufferGeometry,
  bodyGeo: THREE.BufferGeometry,
  mat: THREE.Material,
  turn: number,
): THREE.Group {
  const root = new THREE.Group();
  const flap = flapAt(turn, KINDS[kind].stroke);
  const left = new THREE.Mesh(wingGeo, mat);
  left.scale.x = -1;
  left.rotation.z = -flap;
  const right = new THREE.Mesh(wingGeo, mat);
  right.rotation.z = flap;
  root.add(left, right, new THREE.Mesh(bodyGeo, mat));
  root.scale.setScalar(KINDS[kind].span / 2);
  return root;
}

/** ONE bird, alone, with geometry of its own — for the item sheet, where
 * the point is to look at a silhouette a run only ever shows as a speck.
 * Posed in level flight partway down the stroke. */
export function skeinBirdModel(kind: SkeinKind): { object: THREE.Group; dispose: () => void } {
  const wingGeo = wingShape();
  const bodyGeo = bodyShape(KINDS[kind].neck, KINDS[kind].back);
  const mat = material(kind);
  const root = new THREE.Group();
  const bird = poseBird(kind, wingGeo, bodyGeo, mat, 0.18);
  bird.position.y = 1.4;
  root.add(bird);
  return {
    object: root,
    dispose: () => {
      wingGeo.dispose();
      bodyGeo.dispose();
      mat.dispose();
    },
  };
}

/** A WHOLE FORMATION, posed and standing still — the item sheet's answer to
 * the one question a single bird cannot be asked: does a vee read as a vee,
 * and is a line a line?
 *
 * Spaced exactly as the sky spaces it and beaten exactly as the sky beats
 * it, wave and all, so the shape on the sheet is the shape overhead. The
 * bird nearest the viewer is the LEADER, which is the whole read: everyone
 * else is behind it and further out. */
export function skeinModel(
  kind: SkeinKind,
  shape: Formation,
  birds: number,
): { object: THREE.Group; dispose: () => void } {
  const wingGeo = wingShape();
  const bodyGeo = bodyShape(KINDS[kind].neck, KINDS[kind].back);
  const mat = material(kind);
  const root = new THREE.Group();
  const span = KINDS[kind].span;
  for (let i = 0; i < birds; i++) {
    const slot = formationOffset(shape, i);
    // The same offset down the line the sky flies, so no two wings in the
    // picture are at the same point in the stroke.
    const bird = poseBird(kind, wingGeo, bodyGeo, mat, (0.18 + i * 0.13) % 1);
    bird.position.set(slot.across * span, 1.4, slot.along * span);
    root.add(bird);
  }
  return {
    object: root,
    dispose: () => {
      wingGeo.dispose();
      bodyGeo.dispose();
      mat.dispose();
    },
  };
}

/** A crossing in the air: its plan, where the leader is now, and whether it
 * has been given a place at all (nothing is pitched until the first frame,
 * because the camera's position is what everything is pitched against). */
type Live = {
  plan: Passage;
  x: number;
  y: number;
  z: number;
  /** The seconds this crossing has been flying, for the wave down the line
   * and the waver on the track, and the metres it has covered, which is
   * what says when it is done. */
  age: number;
  flown: number;
  phase: number;
  placed: boolean;
  /** Whether this slot has ever flown a crossing. The first one is dropped
   * in PART-FLOWN, so the sky over the start line already has birds in it
   * rather than filling up over the first minute — the same reason
   * sky-traffic.ts hands over crossings that are already an hour old. */
  warm: boolean;
};

export type Skeins = {
  group: THREE.Group;
  /** How many crossings this country holds at once, and which season it is
   * flying. Idempotent, and cheap to call on every re-light — but a change
   * of either re-pitches everything, because a skein's bearing, its height
   * and the birds in it are all decisions the season made. */
  setSeason: (count: number, season: Season) => void;
  /** The sky's light. A goose goes to a silhouette by day and to nothing at
   * night; a swan is the one bird that stays visible in both. */
  setTint: (tint: THREE.Color) => void;
  /** The CAMERA rather than a point, because a crossing is pitched to go
   * over where it is LOOKING. */
  update: (camera: THREE.Camera, windX: number, windZ: number, dt: number) => void;
  dispose: () => void;
};

/** Where the camera is looking, read once a frame — module-scoped so a
 * frame of driving allocates nothing. */
const aim = new THREE.Vector3();

/**
 * `most` is how many crossings the busiest country holds. They are all
 * planned once and hidden down to the count a given country wants, exactly
 * as the flocks and the birds of prey are.
 *
 * `random` is injected, exactly as `createWorld`'s is: everything about a
 * crossing is a roll, so a harness that wants to MEASURE what a stage sees
 * of them — how often one is near, how close the closest gets — has to be
 * able to pin the dice. Left alone it is the same `Math.random` every other
 * renderer-side roll in the game uses.
 *
 * ONE DRAW CALL PER PART PER SPECIES, whatever is in the sky: every bird is
 * an instance of the same wing and the same body, and a wingbeat is a
 * rotation composed into its matrix. Written as a group per bird it would
 * be three meshes each and sixty draw calls of ambient decoration; this is
 * four, and it does not grow with the count.
 */
export function createSkeins(most: number, random: () => number = Math.random): Skeins {
  const group = new THREE.Group();
  const wingGeo = wingShape();
  const kinds = Object.keys(KINDS) as SkeinKind[];
  const pools = new Map<
    SkeinKind,
    {
      mat: THREE.MeshBasicMaterial;
      bodyGeo: THREE.BufferGeometry;
      wings: THREE.InstancedMesh;
      bodies: THREE.InstancedMesh;
    }
  >();
  for (const kind of kinds) {
    const mat = material(kind);
    const bodyGeo = bodyShape(KINDS[kind].neck, KINDS[kind].back);
    const wings = new THREE.InstancedMesh(wingGeo, mat, most * MOST_BIRDS * 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, mat, most * MOST_BIRDS);
    // The instance matrices are written from scratch every frame, so a
    // bounding sphere computed from them is always one frame stale — and a
    // skein is a handful of triangles, so there is nothing to save by
    // culling it.
    wings.frustumCulled = false;
    bodies.frustumCulled = false;
    group.add(wings, bodies);
    pools.set(kind, { mat, bodyGeo, wings, bodies });
  }

  let count = 0;
  let season: Season = "summer";
  const live: Live[] = Array.from({ length: most }, () => ({
    plan: passageFor("summer", random),
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    flown: 0,
    phase: random() * Math.PI * 2,
    placed: false,
    warm: false,
  }));

  /** How many instances of each part each species has written this frame.
   * Held across frames rather than built inside `update`, which runs every
   * frame of every run and must allocate nothing. */
  const cursors = new Map<SkeinKind, { wing: number; body: number }>();
  for (const kind of kinds) cursors.set(kind, { wing: 0, body: 0 });

  const birdM = new THREE.Matrix4();
  const wingM = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const mirror = new THREE.Vector3(-1, 1, 1);

  /**
   * Pitch a fresh crossing: a point it will pass over, out in front of
   * where the camera is looking, and the skein itself backed a long way up
   * its own bearing from that point so it flies in rather than appearing.
   */
  const rehome = (run: Live, camX: number, camY: number, camZ: number, camYaw: number): void => {
    run.plan = passageFor(season, random);
    const bearing = camYaw + (random() * 2 - 1) * PITCH.spread;
    const reach = PITCH.outMin + random() * PITCH.outVary;
    const overX = camX + Math.sin(bearing) * reach;
    const overZ = camZ + Math.cos(bearing) * reach;
    // A cold slot starts part-flown: on the grid one crossing may be a
    // minute out and another already overhead, which is a sky, where two
    // crossings both a minute out is an empty one.
    run.flown = run.warm ? 0 : random() * (PITCH.lead + PAST);
    run.warm = true;
    const back = PITCH.lead - run.flown;
    run.x = overX - Math.sin(run.plan.bearing) * back;
    run.z = overZ - Math.cos(run.plan.bearing) * back;
    run.y = camY + run.plan.height;
    run.age = random() * 40;
    run.phase = random() * Math.PI * 2;
    run.placed = true;
  };

  const setSeason = (nextCount: number, nextSeason: Season): void => {
    if (nextCount === count && nextSeason === season) return;
    count = nextCount;
    season = nextSeason;
    // Re-pitched rather than left where they were: what is flying, how high
    // and which way are all the season's answers, and this one has changed
    // them.
    for (const run of live) run.placed = false;
    if (count === 0)
      for (const pool of pools.values()) pool.wings.visible = pool.bodies.visible = false;
  };

  const setTint = (tint: THREE.Color): void => {
    for (const kind of kinds) pools.get(kind)!.mat.color.set(KINDS[kind].color).multiply(tint);
  };

  const update = (camera: THREE.Camera, windX: number, windZ: number, dt: number): void => {
    for (const at of cursors.values()) at.wing = at.body = 0;
    if (count > 0) {
      const camX = camera.position.x;
      const camY = camera.position.y;
      const camZ = camera.position.z;
      camera.getWorldDirection(aim);
      const camYaw = Math.atan2(aim.x, aim.z);

      for (let i = 0; i < count; i++) {
        const run = live[i];
        if (!run.placed) rehome(run, camX, camY, camZ, camYaw);
        const plan = run.plan;
        const dirX = Math.sin(plan.bearing);
        const dirZ = Math.cos(plan.bearing);
        run.age += dt;
        run.flown += plan.speed * dt;
        run.x += (dirX * plan.speed + windX * WIND_CARRY) * dt;
        run.z += (dirZ * plan.speed + windZ * WIND_CARRY) * dt;
        // The whole skein rides very slowly up and down, the way a formation
        // does when its leader is trimming against the air rather than
        // holding an instrument.
        const lift = Math.sin(run.age * 0.16 + run.phase) * 6;
        // Done two ways: flown past and away, or simply out-driven — the
        // car does twice a goose's speed, so a crossing it is pointed at
        // can be left behind before it ever gets there.
        const dx = run.x - camX;
        const dz = run.z - camZ;
        if (run.flown > PITCH.lead + PAST || dx * dx + dz * dz > RECYCLE * RECYCLE) {
          rehome(run, camX, camY, camZ, camYaw);
          continue;
        }

        const kind = KINDS[plan.kind];
        const half = kind.span / 2;
        const pool = pools.get(plan.kind)!;
        const at = cursors.get(plan.kind)!;
        // Across the track is a quarter turn right of the bearing.
        const rightX = Math.cos(plan.bearing);
        const rightZ = -Math.sin(plan.bearing);
        for (let b = 0; b < plan.birds; b++) {
          const slot = formationOffset(plan.shape, b);
          // THE WAVER: the shape breathes rather than holding a ruler, and
          // the phase runs down the line so the far end of a long skein is
          // doing something different from the near end — which is what a
          // real one does, and the reason a skein reads as alive at a
          // distance where no individual bird does.
          const wave = run.age * 1.1 - b * 0.55 + run.phase;
          const across = (slot.across + Math.sin(wave * 0.7) * 0.22) * kind.span;
          const along = (slot.along + Math.cos(wave * 0.5) * 0.2) * kind.span;
          pos.set(
            run.x + rightX * across + dirX * along,
            run.y + lift + Math.sin(wave * 0.9) * 0.7,
            run.z + rightZ * across + dirZ * along,
          );
          euler.set(0, plan.bearing, 0);
          birdM.compose(pos, quat.setFromEuler(euler), scale.setScalar(half));
          pool.bodies.setMatrixAt(at.body++, birdM);
          // The beat, offset down the line: a formation whose wings all
          // strike together is a set of decorations.
          const turn = run.age * kind.beatHz - b * 0.13 + run.phase;
          const flap = flapAt(turn, kind.stroke);
          // Both wings the same way — down together, up together — because
          // opposite signs are one straight line rotating about its middle,
          // which is a propeller and not a bird.
          pool.wings.setMatrixAt(at.wing++, out.multiplyMatrices(birdM, wingM.makeRotationZ(flap)));
          pool.wings.setMatrixAt(
            at.wing++,
            out.multiplyMatrices(birdM, wingM.makeRotationZ(-flap).scale(mirror)),
          );
        }
      }
    }

    for (const kind of kinds) {
      const pool = pools.get(kind)!;
      const at = cursors.get(kind)!;
      // A count of zero is still a draw call, so an empty species is hidden
      // outright rather than drawn with nothing in it.
      pool.wings.visible = at.wing > 0;
      pool.bodies.visible = at.body > 0;
      pool.wings.count = at.wing;
      pool.bodies.count = at.body;
      if (at.wing > 0) pool.wings.instanceMatrix.needsUpdate = true;
      if (at.body > 0) pool.bodies.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    wingGeo.dispose();
    for (const pool of pools.values()) {
      pool.bodyGeo.dispose();
      pool.mat.dispose();
      pool.wings.dispose();
      pool.bodies.dispose();
    }
  };

  return { group, setSeason, setTint, update, dispose };
}
