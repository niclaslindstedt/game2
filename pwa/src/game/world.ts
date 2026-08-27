// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the 3D world for one stage: the road ribbon with its red/white
// edge strips and dirt skirts, the fords and the streams that feed them,
// the biome's forest and ground cover (flora.ts), boulders and bedrock
// outcrops, jump cones, and the start/finish gates. Everything is low-poly,
// vertex-colored, and Lambert-lit — the environment module's hemisphere +
// sun set the mood, the chunky speckle textures keep the arcade grain — and
// everything derives from the same compiled track samples the physics
// reads. The world is built in CHUNKS of road: a finite stage is one chunk
// built up front; an endless stage keeps building chunks ahead of the car
// and dropping them behind it.

import * as THREE from "three";
import {
  GROVES,
  ROAD_CROSS,
  STAGE_RULES,
  corridorOffset,
  createRng,
  inStream,
  junctionDust,
  junctionFlat,
  junctionMainEdge,
  junctionPlatformY,
  type RoadShape,
  wearAt,
  type GameState,
  type Spur,
  type Track,
  type WildObstacle,
} from "@engine";

import { biomeFor, type Biome, type Community, type FloraMix } from "./biome.ts";
import { buildFlora, type Flora, type FloraPlacement } from "./flora.ts";
import { APRON, buildTerrain, LAKE_Y, type Terrain } from "./terrain.ts";
import { buildStreamMeshes } from "./streams.ts";
import { bannerTexture, chevronTexture, gravelTexture, waterTexture } from "./textures.ts";

const UP = new THREE.Vector3(0, 1, 0);

/** Endless: unbuilt samples accumulate to this count before a chunk is cut
 * (2 m samples → 200 m of road), and chunks fully this far behind the car
 * are dropped. The engine's stream horizon minus the batch keeps the built
 * road comfortably past the fog ceiling. */
const CHUNK_SAMPLES = 100;
const PRUNE_BEHIND = 450;

function rightOf(heading: number): { x: number; z: number } {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** Anything with a road's cross-section: the stage's own samples, or an
 * abandoned branch's (R17). The ribbon builder does not care which. */
type Ribbon = RoadShape & {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  s: number;
};

/** The road's palette. Gravel is graded dirt, worn to hardpack down the two
 * tracks every car before you drove in, loose and pale at the edges;
 * asphalt is bitumen, polished lighter where the tires have burnished it
 * and grey-black between. */
const ROAD_PAINT = {
  gravel: { loose: "#d2b489", worn: "#8a7046" },
  asphalt: { loose: "#3a3b40", worn: "#54555c" },
  water: { loose: "#8fa6c6", worn: "#8fa6c6" },
  deck: { loose: "#b7b3a8", worn: "#a4a096" },
  shoulder: "#8a734f",
  /** Past the bare shoulder the verge greens over and meets the terrain's
   * own grass — there is no ditch to color (R16). */
  verge: "#6f8f3e",
};

/** Where the ribbon puts a vertex across the road, as a fraction of the
 * half-width: dense around the wheel tracks (0.44) so the worn line has a
 * shape, sparser between. Mirrored for the far side. */
const MAT_STATIONS = [0, 0.18, 0.32, 0.38, 0.44, 0.5, 0.6, 0.75, 0.88, 1];
/** ...and past the edge, in meters out from it: the mat's chamfer, the
 * bare shoulder, and the grassed slope tipping away to where the landscape
 * takes over (R16 — no ditch). */
const VERGE_STATIONS = [
  ROAD_CROSS.chamfer,
  ROAD_CROSS.verge.bareTo,
  ROAD_CROSS.verge.bareTo + (ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo) * 0.45,
  ROAD_CROSS.reach,
];

/** R17 — inside a junction, neither road wears a border: no shoulder, no
 * edge line, no camber. The ribbon builders drop those stations here, and
 * the engine has already warped both carriageways onto the junction's own
 * plane, so what is left is one paved area with two roads leaving it. */
function junctionAt(track: Track, x: number, z: number): number {
  let best = 0;
  for (const junction of track.junctions) {
    const flat = junctionFlat(junction, x, z);
    if (flat > best) best = flat;
  }
  return best;
}

/** R17 — how far a point is past the MAIN road's edge at the junction it
 * is nearest to, m; null where no junction reaches it. The seam between
 * the tarmac and the gravel road that meets it runs along that edge, at
 * that angle, because that is where one road's surfacing stops and the
 * other's begins. */
function mainEdgeAt(track: Track, x: number, z: number): number | null {
  let best: number | null = null;
  for (const junction of track.junctions) {
    const out = junctionMainEdge(junction, x, z);
    if (out === null) continue;
    if (best === null || out < best) best = out;
  }
  return best;
}

/** How far past the main road's edge gravel is still dragged out onto the
 * tarmac, m — the smear of stones every car turning out of a dirt road
 * carries with it, which in life is the most obvious thing about a
 * junction between a sealed road and an unsealed one. */
const DRAG_OUT = 13;
/** ...and how much of the tarmac's own color the smear takes at the mouth
 * of the junction, where every car turning off the dirt road drops what it
 * carried onto the seal. */
const DRAG_ON = 0.42;

/** R17 — how much gravel the tarmac wears here, dragged out of the dirt
 * road by every car that has turned off it. */
function dustAt(track: Track, x: number, z: number): number {
  let best = 0;
  for (const junction of track.junctions) {
    const dust = junctionDust(junction, x, z);
    if (dust > best) best = dust;
  }
  return best;
}

/** R17 — is this piece of road standing on the MAIN road's mat? A minor
 * road has no border where it crosses the road it meets: its shoulder and
 * its edge line stop at that edge, which is the whole reason a junction
 * looks built. Wider than the mat by a margin, so the border comes back
 * once the corner is properly clear of it and not a meter after. */
function onMainMat(track: Track, x: number, z: number): boolean {
  const out = mainEdgeAt(track, x, z);
  return out !== null && out < 1.5;
}

/** Signed lateral offsets of every vertex across the corridor, left to
 * right: verge, mat, verge. */
function stations(width: number): number[] {
  const half = width / 2;
  const mat = MAT_STATIONS.map((t) => t * half);
  const out = VERGE_STATIONS.map((d) => half + d);
  return [
    ...out.map((d) => -d).reverse(),
    ...mat.map((v) => -v).reverse(),
    ...mat.slice(1),
    ...out,
  ];
}

/** A chunk's samples for ribbon building: the range overlapped one sample
 * back so consecutive chunks weld, plus a straight dirt apron extrapolated
 * past the stage's ends — a rally car launches from dirt already laid
 * before the start gate, and a finite stage's flying finish has road to
 * run off onto. Only the drawn ribbon — the physics' samples are
 * untouched. */
function chunkSamples(track: Track, from: number, to: number): Track["samples"] {
  const base = track.samples.slice(Math.max(0, from - 1), to);
  const n = Math.round(APRON / track.step);
  if (from === 0) {
    const first = track.samples[0];
    const pre: Track["samples"] = [];
    for (let i = n; i >= 1; i--) {
      pre.push({
        ...first,
        x: first.x - Math.sin(first.heading) * track.step * i,
        z: first.z - Math.cos(first.heading) * track.step * i,
        s: first.s - track.step * i,
        surface: "gravel",
        deck: null,
        lift: 0,
        jump: false,
      });
    }
    base.unshift(...pre);
  }
  if (!track.endless && to === track.samples.length) {
    const last = track.samples[track.samples.length - 1];
    for (let i = 1; i <= n; i++) {
      base.push({
        ...last,
        x: last.x + Math.sin(last.heading) * track.step * i,
        z: last.z + Math.cos(last.heading) * track.step * i,
        s: last.s + track.step * i,
        surface: "gravel",
        deck: null,
        lift: 0,
        jump: false,
      });
    }
  }
  return base;
}

/** The road, across its whole width and a little past it: the mat with its
 * camber and its two worn wheel tracks, the chamfered edge, the shoulder,
 * the ditch, and the lip where the landscape takes over (R16). The SHAPE
 * comes from the engine (road.ts) — the same profile the physics rides and
 * the terrain field hangs its shelf off — so what the car climbs out of is
 * exactly what the player sees it climb out of.
 *
 * The paint is this module's: gravel worn to hardpack down the tracks and
 * loose at the edges, asphalt burnished where the tires polish it, a
 * shoulder of spilled dirt, and a ditch that greens over. */
function buildRoad(track: Track, samples: Ribbon[], width: number, bias = 0.02): THREE.Mesh {
  const half = width / 2;
  const lat = stations(width);
  const matOnly = lat.filter((l) => Math.abs(l) <= half);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const paint = new THREE.Color();
  const shoulder = new THREE.Color(ROAD_PAINT.shoulder);
  const verge = new THREE.Color(ROAD_PAINT.verge);
  const loose = new THREE.Color();
  const worn = new THREE.Color();
  const sealedLoose = new THREE.Color(ROAD_PAINT.asphalt.loose);
  const sealedWorn = new THREE.Color(ROAD_PAINT.asphalt.worn);
  const sealed = new THREE.Color();
  const gravelDust = new THREE.Color();
  const looseGravel = new THREE.Color(ROAD_PAINT.gravel.loose);
  const wornGravel = new THREE.Color(ROAD_PAINT.gravel.worn);

  let lastCount = -1;
  let run = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const bridge = s.deck != null;
    // Inside a junction the road is mat and nothing else — its border is
    // cut away and the throat below pays the gap back as road surface.
    // Only the mouth loses its border, not the whole platform: a junction
    // cuts a hole in both roads' edges, it does not delete a hundred
    // meters of them.
    const cross = junctionAt(track, s.x, s.z) > 0.25 || onMainMat(track, s.x, s.z) ? matOnly : lat;
    // The strip has to restart wherever the station count changes: the two
    // cross-sections cannot be woven into each other.
    if (cross.length !== lastCount) {
      lastCount = cross.length;
      run = 0;
    }
    const kind = bridge
      ? "deck"
      : s.surface === "water"
        ? "water"
        : s.surface === "asphalt"
          ? "asphalt"
          : "gravel";
    loose.set(ROAD_PAINT[kind].loose);
    worn.set(ROAD_PAINT[kind].worn);
    for (const l of cross) {
      const out = Math.abs(l) - half;
      const px = s.x + r.x * l;
      const pz = s.z + r.z * l;
      const y = s.elevation + corridorOffset(s, l, width) + bias;
      positions.push(px, y, pz);
      // UVs run meters along and across, so the grain is the same size
      // whatever the road does and never stretches through a corner.
      uvs.push(l / 3.5, s.s / 3.5);
      if (out <= 0) {
        // On the mat: the wear map decides the mix. The bridge deck is
        // planks or concrete, worn the same way but never bermed. Inside a
        // junction the wear FLATTENS: two roads' wheel tracks crossing each
        // other is the tell that two ribbons were laid over one another,
        // and a real crossing is scuffed evenly all over anyway.
        const flat = s.flat ?? 0;
        paint.copy(loose).lerp(worn, wearAt(l, width) * (1 - flat) + 0.55 * flat);
        // R17 — and at a junction the surfacing changes along the MAIN
        // road's edge, not across the minor road: the tarmac is laid to
        // its own edge line and the gravel starts there, smeared out over
        // the drag-out every car turning off it leaves behind. Read per
        // vertex, so the seam is that edge, at that angle.
        if (kind === "gravel") {
          const past = mainEdgeAt(track, px, pz);
          if (past !== null && past < DRAG_OUT) {
            const t = Math.max(0, past) / DRAG_OUT;
            sealed.copy(sealedLoose).lerp(sealedWorn, 0.55);
            paint.lerp(sealed, 1 - t * t * (3 - 2 * t));
          }
        } else if (kind === "asphalt") {
          // ...and the other way: every car that turns out of the dirt
          // road carries stones onto the tarmac, so the sealed side of a
          // junction wears a smear of gravel too. In life it is the most
          // obvious thing about a junction between a sealed road and an
          // unsealed one.
          const dust = dustAt(track, px, pz);
          if (dust > 0) {
            gravelDust.copy(looseGravel).lerp(wornGravel, 0.5);
            paint.lerp(gravelDust, dust * DRAG_ON);
          }
        }
      } else if (out < ROAD_CROSS.verge.bareTo) {
        paint.copy(shoulder);
      } else {
        paint
          .copy(shoulder)
          .lerp(
            verge,
            Math.min(
              1,
              (out - ROAD_CROSS.verge.bareTo) / (ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo),
            ),
          );
      }
      colors.push(paint.r, paint.g, paint.b);
    }
    if (run > 0) {
      // Wound so the face normals point up — the road is drawn single-sided
      // and a downward winding would cull the whole surface from above.
      const b = positions.length / 3 - cross.length;
      const a = b - cross.length;
      for (let k = 0; k < cross.length - 1; k++) {
        indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
      }
    }
    run += 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: gravelTexture(), vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

/** Dirt skirts: close the gap between the ribbon's outer lip and the ground
 * lattice under it, so a raised road (ramps, crests, an asphalt mat) reads
 * as a solid landform and never as floating carpet. A bridge deck gets
 * none — there is nothing under a bridge but air and water. */
function buildSkirts(samples: Ribbon[], width: number): THREE.Mesh {
  const half = width / 2;
  const edge = half + ROAD_CROSS.reach;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1]) {
    let start = positions.length / 3;
    let run = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.deck != null) {
        // Break the strip: the next stretch of ground starts its own.
        start = positions.length / 3;
        run = 0;
        continue;
      }
      const r = rightOf(s.heading);
      const ex = s.x + r.x * edge * side;
      const ez = s.z + r.z * edge * side;
      const top = s.elevation + corridorOffset(s, edge * side, width);
      // The skirt drops a few meters below grade — deep enough to meet the
      // terrain shelf under every roll of the road.
      positions.push(ex, top, ez, ex, top - 5, ez);
      if (run > 0) {
        const a = start + (run - 1) * 2;
        if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      run += 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: "#8a6f4d", side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** The road's markings, both edges and the middle. Which markings depends
 * on what the road IS: a rally gravel road is edged with the red and white
 * strips the stage's tape and boards are made of, a public asphalt road
 * with a solid white edge line and a dashed centre — which is most of what
 * makes the tarmac sections read as a road the rally borrowed rather than
 * a differently-colored stripe. Fords and bridge decks carry neither.
 * Markings run the stage proper, never the aprons — pass the bare range. */
function buildMarkings(track: Track, samples: Ribbon[], width: number): THREE.Mesh {
  const half = width / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const red = new THREE.Color("#e23c2c");
  const white = new THREE.Color("#f6f3ea");
  const paint = new THREE.Color("#e6e2d2");

  /** One strip of paint along the road: a band between two lateral offsets
   * that only exists where `on` says it does. */
  const strip = (
    from: (s: Ribbon) => number,
    to: (s: Ribbon) => number,
    on: (s: Ribbon) => boolean,
    color: (s: Ribbon) => THREE.Color | null,
    flip: boolean,
  ): void => {
    let start = positions.length / 3;
    let run = 0;
    for (const s of samples) {
      const tint = on(s) ? color(s) : null;
      if (!tint) {
        start = positions.length / 3;
        run = 0;
        continue;
      }
      const r = rightOf(s.heading);
      const inner = from(s);
      const outer = to(s);
      const yIn = s.elevation + corridorOffset(s, inner, width) + 0.035;
      const yOut = s.elevation + corridorOffset(s, outer, width) + 0.035;
      positions.push(
        s.x + r.x * inner,
        yIn,
        s.z + r.z * inner,
        s.x + r.x * outer,
        yOut,
        s.z + r.z * outer,
      );
      colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      if (run > 0) {
        const a = start + (run - 1) * 2;
        if (flip) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      run += 1;
    }
  };

  const plain = (s: Ribbon): boolean =>
    s.surface !== "water" &&
    s.deck == null &&
    junctionAt(track, s.x, s.z) < 0.4 &&
    !onMainMat(track, s.x, s.z);
  for (const side of [-1, 1]) {
    // Gravel: the rally's own red-and-white edging, alternating every few
    // meters, sat on the outer band of the mat.
    strip(
      () => (half - 0.9) * side,
      () => half * side,
      (s) => plain(s) && s.surface !== "asphalt",
      (s) => (Math.floor(s.s / 4) % 2 === 0 ? red : white),
      side > 0,
    );
    // Asphalt: a solid white edge line, a hand's width inside the kerb.
    strip(
      () => (half - 0.65) * side,
      () => (half - 0.3) * side,
      (s) => plain(s) && s.surface === "asphalt",
      () => paint,
      side > 0,
    );
  }
  // ...and the broken centre line, 3 m of paint every 9.
  strip(
    () => -0.16,
    () => 0.16,
    (s) => plain(s) && s.surface === "asphalt" && s.s % 9 < 3,
    () => paint,
    false,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** The chippings that spill down an asphalt mat's edge. Asphalt is LAID —
 * a mat built up on the ground with nothing holding its sides — so its
 * edge is always a scatter of loose stone rather than a clean line, and
 * that scatter is most of what tells you the road stands proud. */
function buildChippings(
  track: Track,
  samples: Ribbon[],
  width: number,
): THREE.InstancedMesh | null {
  const half = width / 2;
  const stones: { x: number; y: number; z: number; s: number; spin: number }[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.surface !== "asphalt" || s.deck != null) continue;
    if (junctionAt(track, s.x, s.z) > 0.25 || onMainMat(track, s.x, s.z)) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      // Two rows per side, jittered off the sample index so the scatter
      // never lines up into a rail.
      const jitter = ((i * 2654435761) % 1000) / 1000;
      const out = half + ROAD_CROSS.chamfer * (0.4 + jitter * 0.9);
      const x = s.x + r.x * out * side;
      const z = s.z + r.z * out * side;
      stones.push({
        x,
        y: s.elevation + corridorOffset(s, out * side, width),
        z,
        s: 0.1 + jitter * 0.22,
        spin: jitter * Math.PI * 2,
      });
    }
  }
  if (stones.length === 0) return null;
  const geo = new THREE.DodecahedronGeometry(1);
  const mat = new THREE.MeshLambertMaterial({ color: "#7f7a70" });
  const mesh = new THREE.InstancedMesh(geo, mat, stones.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  stones.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.spin);
    m.compose(v.set(p.x, p.y + p.s * 0.3, p.z), q, sc.set(p.s, p.s * 0.7, p.s));
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/** Ford overlays: a wider translucent water sheet over each water run.
 * Only draws runs that COMPLETE before `to`; returns where the next call
 * should resume so a run straddling a chunk boundary is drawn whole by the
 * chunk that owns its end. */
function buildFords(
  track: Track,
  from: number,
  to: number,
  tex: THREE.Texture,
): { group: THREE.Group; next: number } {
  const group = new THREE.Group();
  const samples = track.samples;
  const half = track.width / 2 + 2.5;
  const flush = (a: number, b: number): void => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = a; i <= b; i++) {
      const s = samples[i];
      const r = rightOf(s.heading);
      const y = s.elevation + 0.09;
      positions.push(s.x - r.x * half, y, s.z - r.z * half, s.x + r.x * half, y, s.z + r.z * half);
      uvs.push(0, s.s / 4, 1, s.s / 4);
      if (i > a) {
        const q = (i - a - 1) * 2;
        indices.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // Phong, like the lakes: the ford glitters when the sun catches it.
    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      specular: 0xcfe4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.85,
    });
    group.add(new THREE.Mesh(geo, mat));
  };
  let i = from;
  let next = from;
  while (i < to) {
    if (samples[i].surface !== "water") {
      i++;
      next = i;
      continue;
    }
    let j = i;
    while (j < samples.length && samples[j].surface === "water") j++;
    if (j >= to && to < samples.length) break; // straddles the frontier — defer
    flush(Math.max(0, i - 1), Math.min(j, samples.length - 1));
    i = j;
    next = i;
  }
  return { group, next };
}

/** The community a grove-quilt index names — the quilt itself lives in the
 * ENGINE's terrain field now (terrain.field.groveAt), because the trunks it
 * places are solid; the biome only supplies what grows in each patch. */
function communityByGrove(biome: Biome, grove: number): Community {
  const id = GROVES[grove]?.id;
  return biome.communities.find((c) => c.id === id) ?? biome.communities[0];
}

/** Flora that never stands a solid trunk — the engine's tree field must not
 * dress a collision circle as one of these, and conversely they are free to
 * be planted app-side as drive-over dressing. */
const SOFT_FLORA = new Set(["stump", "fallenLog", "heathShrub", "juniper", "willowShrub"]);

/** A mix stripped to the species that read as solid trees (falls back to
 * the whole mix if nothing tall grows there). */
function solidMix(mix: FloraMix): FloraMix {
  const out: FloraMix = {};
  for (const id in mix) if (!SOFT_FLORA.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : mix;
}

/** ...and the complement: the low soft stuff of a community's tree mix. */
function softMix(mix: FloraMix): FloraMix | null {
  const out: FloraMix = {};
  for (const id in mix) if (SOFT_FLORA.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : null;
}

/** Dress one engine trunk as the tree the biome grows there. The engine
 * owns WHERE a solid tree stands and how thick its trunk is; which species
 * it IS stays the biome's call — with the same overrides as ever: willow
 * and birch crowd the shores, only the tough survive the high bedrock. */
function treePlacement(tree: WildObstacle, biome: Biome): FloraPlacement {
  let mix: FloraMix;
  if (tree.y < LAKE_Y + 4) mix = biome.lakeshoreTrees;
  else if (tree.y > 26) mix = biome.highlandTrees;
  else mix = communityByGrove(biome, tree.grove ?? 0).trees;
  return {
    id: pickFlora(solidMix(mix), tree.roll ?? 0),
    x: tree.x,
    y: tree.y,
    z: tree.z,
    scale: tree.size,
    spin: tree.spin,
  };
}

/** Draw one flora variant id from a weighted mix. */
function pickFlora(mix: FloraMix, roll: number): string {
  let total = 0;
  for (const id in mix) total += mix[id];
  let t = roll * total;
  let last = "";
  for (const id in mix) {
    last = id;
    t -= mix[id];
    if (t <= 0) return id;
  }
  return last;
}

type SceneryChunk = {
  group: THREE.Group;
  update: (dt: number) => void;
  /** Zero out any prop the newly built road now runs through. */
  clearNear: (track: Track, from: number, to: number) => void;
  /** The engine trunks this chunk drew — released when the chunk drops so
   * the ownership set stays bounded on an endless run. */
  treeKeys: string[];
};

/** The living landscape for one chunk of road: the biome's forest scattered
 * over the hills, a ground-cover band hugging the verge, loose boulders,
 * and bedrock outcrops shouldering out of the cut walls. Placement is
 * seeded by the track seed and chunk, validated against the road built so
 * far (aprons included) and the stream valleys, and everything stands on
 * the terrain height under it. On an endless run the road ahead is still
 * unwritten — `clearNear` retires props that later road claims. */
function buildScenery(
  track: Track,
  biome: Biome,
  terrain: Terrain,
  from: number,
  to: number,
  guard: Track["samples"],
  drawnTrees: Set<string>,
  density: number,
): SceneryChunk {
  const group = new THREE.Group();
  const rng = createRng((track.seed ^ 0x5f356495 ^ Math.imul(from, 2246822519)) >>> 0);
  const samples = track.samples;
  const half = track.width / 2;
  const clearance = half + 3.5;
  const heightAt = terrain.heightAt;
  const field = terrain.field;

  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, field.groveAt(x, z));

  // Clearance checks walk the guard samples — the chunk's own road with
  // its aprons plus a margin of neighbours — so nothing grows on the road,
  // the start run-up, or the finish run-off.
  const clearOfRoad = (x: number, z: number, r: number): boolean => {
    for (let i = 0; i < guard.length; i += 4) {
      const dx = x - guard[i].x;
      const dz = z - guard[i].z;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };

  const flora: FloraPlacement[] = [];
  const treeKeys: string[] = [];

  // ── The forest: the ENGINE's trunk field, drawn exactly where the
  // physics collides — the band within 150 m of the road belongs to the
  // road chunks, the deeper wild to the wild cells. Ownership over chunk
  // seams is settled by the shared `drawnTrees` set.
  const collectTrees = (x: number, z: number): void => {
    for (const tree of field.treesNear(x, z, 190)) {
      if (field.roadDistanceAt(tree.x, tree.z) >= 150) continue;
      const key = `${tree.x.toFixed(1)},${tree.z.toFixed(1)}`;
      if (drawnTrees.has(key)) continue;
      drawnTrees.add(key);
      treeKeys.push(key);
      flora.push(treePlacement(tree, biome));
    }
  };
  for (let i = Math.max(0, from); i < to; i += 50) collectTrees(samples[i].x, samples[i].z);
  collectTrees(samples[to - 1].x, samples[to - 1].z);

  // ── The soft small stuff between the trunks — stumps, junipers, willow
  // shrubs: driven over, not into, so it stays an app-side scatter.
  for (let i = Math.max(4, from); i < to; i += 6) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(clearance + 1, 44);
    const jitter = rng.range(-3, 3);
    const x = s.x + r.x * offset * side + jitter;
    const z = s.z + r.z * offset * side + jitter;
    const roll = rng.next();
    const scale = rng.range(0.75, 1.35);
    const spin = rng.range(0, Math.PI * 2);
    if (!rng.chance(0.4 * density)) continue;
    if (!clearOfRoad(x, z, clearance)) continue;
    if (inStream(field.streams, x, z, 1.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    const soft = softMix(
      y < LAKE_Y + 4
        ? biome.lakeshoreTrees
        : y > 26
          ? biome.highlandTrees
          : communityAt(x, z).trees,
    );
    if (!soft) continue;
    flora.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
  }

  // ── Ground cover: a dense strip just past the shoulder (what the car
  // actually sees at speed), and a sparser scatter under the treeline —
  // each clump drawn from its community's mix, so meadows fill with tall
  // grass and spruce woods with ferns.
  for (let i = Math.max(4, from); i < to; i += 2) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const band of [0, 1]) {
      const side = rng.chance(0.5) ? 1 : -1;
      const offset =
        band === 0 ? rng.range(half + 1.6, clearance + 5) : rng.range(clearance + 5, 34);
      const x = s.x + r.x * offset * side + rng.range(-2, 2);
      const z = s.z + r.z * offset * side + rng.range(-2, 2);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      const chance = (biome.undergrowthDensity / 2) * (community.groundCover ?? 1) * density;
      if (!rng.chance(chance)) continue;
      if (!clearOfRoad(x, z, half + 1.2)) continue;
      if (inStream(terrain.field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      flora.push({
        id: pickFlora(community.undergrowth ?? biome.undergrowth, roll),
        x,
        y,
        z,
        scale,
        spin,
      });
    }
  }

  const planted = buildFlora(flora, () => rng.next());
  group.add(planted.group);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // ── Loose boulders on the open ground, greyed toward moss at random.
  type Rock = { x: number; y: number; z: number; s: number };
  const rocks: Rock[] = [];
  for (let i = Math.max(4, from); i < to; i += 7) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(clearance + 1, 120);
    const x = s.x + r.x * offset * side + rng.range(-3, 3);
    const z = s.z + r.z * offset * side + rng.range(-3, 3);
    const drop = rng.next();
    if (!clearOfRoad(x, z, clearance)) continue;
    if (inStream(terrain.field.streams, x, z, 0.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    rocks.push({ x, y, z, s: drop });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1);
  const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rockMesh.count = rocks.length;
  const tint = new THREE.Color();
  const mossy = new THREE.Color(0x87a05a);
  rocks.forEach((p, i) => {
    const scale = 0.5 + p.s * 1.6;
    q.setFromAxisAngle(UP, p.s * 20);
    m.compose(v.set(p.x, p.y + scale * 0.35, p.z), q, sc.set(scale, scale * 0.7, scale));
    rockMesh.setMatrixAt(i, m);
    // Every third boulder carries a mossy cast; the rest vary in grey.
    tint.setScalar(0.8 + p.s * 0.35);
    if (i % 3 === 0) tint.lerp(mossy, 0.5);
    rockMesh.setColorAt(i, tint);
  });
  group.add(rockMesh);

  // ── Bedrock outcrops: where the embankment climbs hard beside the road
  // (the cut between two walls of high ground), big angular slabs push out
  // of the slope right at the shoulder, doubling the terrain's rock paint.
  type Slab = { x: number; y: number; z: number; s: number; spin: number };
  const slabs: Slab[] = [];
  for (let i = Math.max(6, from); i < to; i += 5) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      const wall = heightAt(s.x + r.x * 16 * side, s.z + r.z * 16 * side) - s.elevation;
      if (wall < 6 || !rng.chance(0.55)) continue;
      const offset = rng.range(half + 2.5, half + 8);
      const x = s.x + r.x * offset * side + rng.range(-1.5, 1.5);
      const z = s.z + r.z * offset * side + rng.range(-1.5, 1.5);
      slabs.push({
        x,
        y: heightAt(x, z),
        z,
        s: rng.range(1.6, 3.4 + Math.min(wall, 14) * 0.12),
        spin: rng.range(0, Math.PI * 2),
      });
    }
  }
  const slabGeo = new THREE.DodecahedronGeometry(1);
  const slabMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(biome.ground.bedrockDark),
  });
  const slabMesh = new THREE.InstancedMesh(slabGeo, slabMat, Math.max(1, slabs.length));
  slabMesh.count = slabs.length;
  slabs.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.spin);
    // Sunk a third in, stretched tall — a face of rock, not a pebble.
    m.compose(v.set(p.x, p.y + p.s * 0.5, p.z), q, sc.set(p.s, p.s * 1.3, p.s * 0.8));
    slabMesh.setMatrixAt(i, m);
    slabMesh.setColorAt(i, tint.setScalar(0.85 + ((i * 37) % 10) * 0.03));
  });
  group.add(slabMesh);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearNear = (t: Track, nFrom: number, nTo: number): void => {
    const reach = (clearance + 2) * (clearance + 2);
    const hits = (x: number, z: number): boolean => {
      for (let i = nFrom; i < nTo; i += 2) {
        const dx = x - t.samples[i].x;
        const dz = z - t.samples[i].z;
        if (dx * dx + dz * dz < reach) return true;
      }
      return false;
    };
    planted.retire(hits);
    let touched = false;
    rocks.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      rockMesh.setMatrixAt(i, zero);
      touched = true;
    });
    slabs.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      slabMesh.setMatrixAt(i, zero);
      touched = true;
    });
    if (touched) {
      rockMesh.instanceMatrix.needsUpdate = true;
      slabMesh.instanceMatrix.needsUpdate = true;
    }
  };

  return { group, update: planted.update, clearNear, treeKeys };
}

/** Everything that carries a bridge deck over its water (R13): the parapet
 * you must not go over, and — since the whole point of a bridge is that
 * there is a hole under it — the structure that holds it up. A timber
 * crossing is two trunks and a plank floor on pile bents; a concrete one
 * is a slab on piers. Which you get was decided by the span back in the
 * generator; this only builds what that decision implies. */
function buildBridges(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const samples = track.samples;
  const half = track.width / 2;
  const timber = new THREE.MeshLambertMaterial({ color: "#6b4f33" });
  const timberDark = new THREE.MeshLambertMaterial({ color: "#523c26" });
  const concrete = new THREE.MeshLambertMaterial({ color: "#b3b0a6" });
  const concreteDark = new THREE.MeshLambertMaterial({ color: "#8f8c83" });

  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    spin: number,
    mat: THREE.Material,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = spin;
    group.add(mesh);
  };

  let i = Math.max(1, from);
  while (i < to) {
    if (samples[i].deck == null) {
      i++;
      continue;
    }
    let j = i;
    while (j < samples.length && samples[j].deck !== null) j++;
    if (j >= to && to < samples.length) break; // straddles the frontier — defer
    const kind = samples[i].deck;
    const rail = kind === "concrete" ? concrete : timber;
    const under = kind === "concrete" ? concreteDark : timberDark;
    const deckY = samples[Math.floor((i + j) / 2)].elevation;
    const waterY = deckY - STAGE_RULES.bridge.clearance[kind ?? "timber"];
    // The parapet: a solid concrete wall, or a timber rail on posts.
    for (const side of [-1, 1]) {
      for (let k = i; k < j; k++) {
        const s = samples[k];
        const r = rightOf(s.heading);
        const lat = (half + 0.35) * side;
        const x = s.x + r.x * lat;
        const z = s.z + r.z * lat;
        if (kind === "concrete") {
          if (k % 2 !== 0) continue;
          box(0.4, 0.9, 4.2, x, s.elevation + 0.45, z, s.heading, rail);
        } else {
          if (k % 3 === 0) box(0.22, 1.1, 0.22, x, s.elevation + 0.55, z, s.heading, under);
          if (k % 2 === 0) box(0.16, 0.16, 4.2, x, s.elevation + 0.95, z, s.heading, rail);
        }
      }
    }
    // What holds it up. The deck itself is the road ribbon; this is the
    // beam under it, the piers down into the water, and the abutments the
    // banks carry.
    const mid = samples[Math.floor((i + j) / 2)];
    const span = samples[j - 1].s - samples[i].s;
    for (const end of [i, j - 1]) {
      const s = samples[end];
      box(track.width + 1.6, 1.6, 3, s.x, s.elevation - 0.9, s.z, s.heading, under);
    }
    if (kind === "concrete") {
      for (let k = i; k < j; k += 2) {
        const s = samples[k];
        box(track.width + 0.6, 0.55, 4.2, s.x, s.elevation - 0.3, s.z, s.heading, under);
      }
      const piers = Math.max(1, Math.round(span / 22));
      for (let p = 1; p <= piers; p++) {
        const s = samples[Math.round(i + ((j - i) * p) / (piers + 1))];
        const drop = s.elevation - waterY + 1.6;
        box(2.4, drop, 1.4, s.x, s.elevation - drop / 2 - 0.5, s.z, s.heading, concreteDark);
      }
    } else {
      // Two trunks the length of the span, and a pile bent under the middle.
      for (const side of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, span, 7), under);
        const r = rightOf(mid.heading);
        beam.position.set(
          mid.x + r.x * half * 0.55 * side,
          mid.elevation - 0.55,
          mid.z + r.z * half * 0.55 * side,
        );
        // A cylinder stands on +Y; tip it onto +Z, then swing it round to
        // the road's heading (YXZ applies the swing last).
        beam.rotation.order = "YXZ";
        beam.rotation.set(Math.PI / 2, mid.heading, 0);
        group.add(beam);
      }
      const drop = mid.elevation - waterY + 1.4;
      for (const side of [-1, 1]) {
        const r = rightOf(mid.heading);
        box(
          0.4,
          drop,
          0.4,
          mid.x + r.x * half * 0.5 * side,
          mid.elevation - drop / 2 - 0.7,
          mid.z + r.z * half * 0.5 * side,
          mid.heading,
          under,
        );
      }
    }
    i = j;
  }
  return group;
}

/** An abandoned branch (R17), drawn like any other road — and the junction
 * dressing that says the stage does not go this way: a line of cones, tape
 * between two posts, and a chevron board facing whoever arrives. Nothing
 * here is solid. A player who wants to see where the road goes is allowed
 * to find out; the tape is a statement, not a wall. */
function buildSpur(track: Track, spur: Spur): THREE.Group {
  const group = new THREE.Group();
  group.add(buildSkirts(spur.samples, spur.width));
  // A hair under the stage's own mat: inside a junction the two are warped
  // onto the SAME plane (R17), and two coplanar meshes tear each other
  // apart in the depth buffer.
  group.add(buildRoad(track, spur.samples, spur.width, 0.012));
  group.add(buildMarkings(track, spur.samples, spur.width));
  const chippings = buildChippings(track, spur.samples, spur.width);
  if (chippings) group.add(chippings);

  // The block, standing just clear of the junction's own platform — where
  // a marshal would put it, and where it is not buried under the crossing.
  const at =
    spur.samples.find((sample) => sample.flat <= 0) ?? spur.samples[spur.samples.length - 1];
  const r = rightOf(at.heading);
  const half = spur.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.42, 1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (let k = -2; k <= 2; k++) {
    const lat = (k / 2.4) * half;
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(at.x + r.x * lat, at.elevation + 0.5, at.z + r.z * lat);
    group.add(cone);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: "#f6f3ea" });
  const tapeMat = new THREE.MeshLambertMaterial({ color: "#e23c2c" });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), postMat);
    post.position.set(at.x + r.x * half * side, at.elevation + 0.8, at.z + r.z * half * side);
    group.add(post);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(spur.width, 0.18, 0.06), tapeMat);
  tape.position.set(at.x, at.elevation + 1.25, at.z);
  tape.rotation.y = at.heading;
  group.add(tape);
  // The board: chevrons pointing back the way the stage actually goes.
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.12), [
    postMat,
    postMat,
    postMat,
    postMat,
    new THREE.MeshLambertMaterial({ map: chevronTexture(), color: "#ffffff" }),
    new THREE.MeshLambertMaterial({ map: chevronTexture(), color: "#ffffff" }),
  ]);
  board.position.set(at.x, at.elevation + 1.9, at.z);
  board.rotation.y = at.heading;
  group.add(board);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), postMat);
    leg.position.set(at.x + r.x * side, at.elevation + 0.95, at.z + r.z * side);
    group.add(leg);
  }
  return group;
}

/** R17 — the junction paving. The two carriageways already cover the
 * ground where they overlap; what they cannot cover is the wedge between
 * them where the corner has just pulled them apart, and a junction that
 * ends in a knife edge of grass driven to a point is the tell that nobody
 * planned it. So this lays the gore nose: pavement carried out to where
 * the gap has opened enough to be an island, on the junction's own graded
 * plane, and no further. */
function buildJunctions(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const fromS = from === 0 ? -Infinity : track.samples[from].s;
  const toS = track.samples[to - 1].s;
  const mat = new THREE.MeshLambertMaterial({
    map: gravelTexture(),
    color: new THREE.Color(ROAD_PAINT.asphalt.worn),
    side: THREE.DoubleSide,
  });
  for (const junction of track.junctions) {
    if (junction.s < fromS || junction.s > toS) continue;
    for (const quad of junction.gore) {
      const positions: number[] = [];
      const uvs: number[] = [];
      for (const [x, z] of quad) {
        positions.push(x, junctionPlatformY(junction, x, z) + 0.03, z);
        uvs.push(x / 3.5, z / 3.5);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, mat));
    }
  }
  return group;
}

/** Warning cones flanking each jump lip in the range. */
function buildCones(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (let i = from; i < to; i++) {
    const s = track.samples[i];
    if (!s.jump) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(
        s.x + r.x * (half + 0.8) * side,
        s.elevation + 0.55,
        s.z + r.z * (half + 0.8) * side,
      );
      group.add(cone);
    }
  }
  return group;
}

/** A rally gate over the road at a sample, after the real thing: red/white
 * candy-striped legs, a white banner with its word on the face the
 * approaching car reads, and hay bales lining the road below. */
function buildGate(track: Track, index: number, label: "start" | "finish"): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const s = track.samples[index];
  const r = rightOf(s.heading);
  const red = new THREE.MeshLambertMaterial({ color: "#e23c2c" });
  const white = new THREE.MeshLambertMaterial({ color: "#f6f3ea" });
  const stripeGeo = new THREE.BoxGeometry(0.45, 1, 0.45);
  const baleGeo = new THREE.BoxGeometry(1.5, 0.75, 0.85);
  const baleMat = new THREE.MeshLambertMaterial({ color: "#d9b45c" });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(stripeGeo, k % 2 === 0 ? red : white);
      seg.position.set(
        s.x + r.x * (half + 1) * side,
        s.elevation + k + 0.5,
        s.z + r.z * (half + 1) * side,
      );
      seg.rotation.y = s.heading;
      group.add(seg);
    }
    // A short wall of bales each side: three along the road, one on top.
    for (let k = 0; k < 4; k++) {
      const along =
        track.samples[Math.max(0, Math.min(track.samples.length - 1, index + (k - 1) * 2))];
      const bale = new THREE.Mesh(baleGeo, baleMat);
      const lat = (half + 1.9) * side;
      const top = k === 3;
      const b = top ? track.samples[index] : along;
      bale.position.set(
        b.x + rightOf(b.heading).x * lat,
        b.elevation + (top ? 1.12 : 0.38),
        b.z + rightOf(b.heading).z * lat,
      );
      bale.rotation.y = b.heading + Math.PI / 2 + (k - 1.5) * 0.07;
      group.add(bale);
    }
  }
  const text = new THREE.MeshLambertMaterial({
    color: "#ffffff",
    map: bannerTexture(label.toUpperCase()),
  });
  // BoxGeometry face order is +x,-x,+y,-y,+z,-z; with rotation.y set to
  // the heading, -z is the face looking back down the road at the car.
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 2, 1.3, 0.3), [
    white,
    white,
    white,
    white,
    white,
    text,
  ]);
  banner.position.set(s.x, s.elevation + 4.7, s.z);
  banner.rotation.y = s.heading;
  banner.name = label;
  group.add(banner);
  return group;
}

export type World = {
  group: THREE.Group;
  update: (dt: number) => void;
  /** Endless: catch the world up with the streamed track and the car —
   * build the road chunks that now exist, drop the ones left behind. */
  sync: (state: GameState) => void;
  dispose: () => void;
};

/** Cell edge for the wild's scenery, m (the terrain's tile grid). */
const WILD_CELL = 224;
/** Wild cells dressed within this range of the car, m. */
const WILD_FAR = 430;
/** Cells dressed per sync at most — the forest streams in, never hitches. */
const WILD_BUDGET = 2;

type WildCell = {
  group: THREE.Group;
  flora: Flora;
  boulders: { mesh: THREE.InstancedMesh; list: WildObstacle[] } | null;
};

type Wild = {
  group: THREE.Group;
  sync: (carX: number, carZ: number) => void;
  update: (dt: number) => void;
  /** Retire wild props that newly built road now runs through. */
  clearNear: (t: Track, from: number, to: number) => void;
};

/** The wild: the living landscape beyond the road bands' 150 m — the
 * nature an exploring car actually drives through. Cells on the terrain's
 * tile grid stream in around the CAR (wherever it is, road or not), each
 * planting the same biome quilt the road bands plant, thinner — plus the
 * engine terrain's solid props, drawn exactly where the physics collides
 * with them: fallen trunks join the flora instancing, boulders get their
 * own instanced rock. Deterministic per seed and cell. */
function buildWild(track: Track, biome: Biome, terrain: Terrain, density: number): Wild {
  const group = new THREE.Group();
  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, terrain.field.groveAt(x, z));
  const cells = new Map<string, WildCell>();
  const heightAt = terrain.heightAt;
  const field = terrain.field;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();

  const buildCell = (cx: number, cz: number): WildCell => {
    const cellGroup = new THREE.Group();
    const rng = createRng(
      (track.seed ^ 0x2ce1a373 ^ (Math.imul(cx, 2246822519) + Math.imul(cz, 668265263))) >>> 0,
    );
    const originX = cx * WILD_CELL;
    const originZ = cz * WILD_CELL;
    const placements: FloraPlacement[] = [];

    // The wild forest — the same engine trunk field the physics collides
    // with, each trunk drawn by the cell that OWNS its position. The road
    // bands' scenery chunks own everything within 150 m of the road.
    const treesHere = field
      .treesNear(originX + WILD_CELL / 2, originZ + WILD_CELL / 2, WILD_CELL * 0.71)
      .filter(
        (t) =>
          Math.floor(t.x / WILD_CELL) === cx &&
          Math.floor(t.z / WILD_CELL) === cz &&
          field.roadDistanceAt(t.x, t.z) >= 150,
      );
    for (const tree of treesHere) placements.push(treePlacement(tree, biome));

    // The soft small stuff between the trunks — a light app-side scatter.
    for (let i = 0; i < 14; i++) {
      const x = originX + rng.range(0, WILD_CELL);
      const z = originZ + rng.range(0, WILD_CELL);
      const roll = rng.next();
      const scale = rng.range(0.75, 1.35);
      const spin = rng.range(0, Math.PI * 2);
      if (!rng.chance(0.5 * density)) continue;
      if (field.roadDistanceAt(x, z) < 150) continue;
      if (inStream(field.streams, x, z, 1.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      const soft = softMix(
        y < LAKE_Y + 4
          ? biome.lakeshoreTrees
          : y > 26
            ? biome.highlandTrees
            : communityAt(x, z).trees,
      );
      if (!soft) continue;
      placements.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
    }
    // Ground cover barely reads at exploring pace — a light scatter.
    for (let i = 0; i < 20; i++) {
      const x = originX + rng.range(0, WILD_CELL);
      const z = originZ + rng.range(0, WILD_CELL);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      if (!rng.chance((biome.undergrowthDensity / 3) * (community.groundCover ?? 1) * density)) {
        continue;
      }
      if (field.roadDistanceAt(x, z) < 150) continue;
      if (inStream(field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      placements.push({
        id: pickFlora(community.undergrowth ?? biome.undergrowth, roll),
        x,
        y,
        z,
        scale,
        spin,
      });
    }

    // The solid props. Each obstacle is drawn by the cell that OWNS its
    // position, so neighbouring cells never draw it twice.
    const obstacles = field
      .obstaclesNear(originX + WILD_CELL / 2, originZ + WILD_CELL / 2, WILD_CELL * 0.71)
      .filter((ob) => Math.floor(ob.x / WILD_CELL) === cx && Math.floor(ob.z / WILD_CELL) === cz);
    for (const ob of obstacles) {
      if (ob.kind === "log") {
        placements.push({
          id: "fallenLog",
          x: ob.x,
          y: ob.y,
          z: ob.z,
          scale: ob.size,
          spin: ob.spin,
        });
      }
    }
    const flora = buildFlora(placements, () => rng.next());
    cellGroup.add(flora.group);

    const boulderList = obstacles.filter((ob) => ob.kind === "boulder");
    let boulders: WildCell["boulders"] = null;
    if (boulderList.length > 0) {
      const geo = new THREE.DodecahedronGeometry(1);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
      const mesh = new THREE.InstancedMesh(geo, mat, boulderList.length);
      boulderList.forEach((ob, i) => {
        q.setFromAxisAngle(UP, ob.spin);
        // Sunk near half in, matched to the collision circle — a face of
        // rock the size the physics says it is.
        m.compose(
          v.set(ob.x, ob.y + ob.height * 0.42, ob.z),
          q,
          sc.set(ob.radius * 0.95, ob.height * 0.85, ob.radius * 0.8),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint.setScalar(0.75 + (ob.spin % 1) * 0.35));
      });
      cellGroup.add(mesh);
      boulders = { mesh, list: boulderList };
    }
    group.add(cellGroup);
    return { group: cellGroup, flora, boulders };
  };

  const dropCell = (key: string): void => {
    const cell = cells.get(key);
    if (!cell) return;
    cells.delete(key);
    group.remove(cell.group);
    disposeGroup(cell.group);
  };

  const sync = (carX: number, carZ: number): void => {
    const reach = Math.ceil(WILD_FAR / WILD_CELL);
    const ccx = Math.floor(carX / WILD_CELL);
    const ccz = Math.floor(carZ / WILD_CELL);
    const missing: { key: string; d: number }[] = [];
    const needed = new Set<string>();
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const centerX = (ccx + dx + 0.5) * WILD_CELL;
        const centerZ = (ccz + dz + 0.5) * WILD_CELL;
        const d = Math.hypot(centerX - carX, centerZ - carZ);
        if (d > WILD_FAR + WILD_CELL * 0.71) continue;
        const key = `${ccx + dx},${ccz + dz}`;
        needed.add(key);
        if (!cells.has(key)) missing.push({ key, d });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    for (const { key } of missing.slice(0, WILD_BUDGET)) {
      const [cx, cz] = key.split(",").map(Number);
      cells.set(key, buildCell(cx, cz));
    }
    for (const key of [...cells.keys()]) {
      if (!needed.has(key)) dropCell(key);
    }
  };

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearNear = (t: Track, from: number, to: number): void => {
    const hits = (x: number, z: number): boolean => {
      for (let i = from; i < to; i += 2) {
        const dx = x - t.samples[i].x;
        const dz = z - t.samples[i].z;
        if (dx * dx + dz * dz < 12 * 12) return true;
      }
      return false;
    };
    for (const cell of cells.values()) {
      cell.flora.retire(hits);
      if (!cell.boulders) continue;
      let touched = false;
      cell.boulders.list.forEach((ob, i) => {
        if (!hits(ob.x, ob.z)) return;
        cell.boulders?.mesh.setMatrixAt(i, zero);
        touched = true;
      });
      if (touched) cell.boulders.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (dt: number): void => {
    for (const cell of cells.values()) cell.flora.update(dt);
  };

  return { group, sync, update, clearNear };
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
          mat.map?.dispose();
        }
        mat.dispose();
      }
    }
  });
}

/** How thickly the world is planted, as a multiple of the biome's own
 * scatter chances. The video options set it; the ENGINE's trunk field is
 * never thinned by it, because those trees are solid and one you can hit
 * but cannot see is worse than any frame it would buy. */
export function buildWorld(track: Track, density = 1): World {
  const group = new THREE.Group();
  const biome = biomeFor();
  const waterTex = waterTexture();
  const terrain = buildTerrain(track, biome, waterTex);
  group.add(terrain.group);
  terrain.sync(track, 0, track.samples[0].x, track.samples[0].z);
  const wild = buildWild(track, biome, terrain, density);
  group.add(wild.group);
  wild.sync(track.samples[0].x, track.samples[0].z);

  type Chunk = { toS: number; group: THREE.Group; scenery: SceneryChunk };
  const chunks: Chunk[] = [];
  /** Engine trunks already drawn by some scenery chunk — chunk queries
   * overlap at the seams, and a tree drawn twice z-fights itself. */
  const drawnTrees = new Set<string>();
  let builtIndex = 0;
  let fordScan = 0;
  let streamScanS = 0;
  let spurScan = 0;

  const buildChunk = (from: number, to: number): void => {
    const chunkGroup = new THREE.Group();
    const ribbon = chunkSamples(track, from, to);
    const bare = track.samples.slice(Math.max(0, from - 1), to);
    chunkGroup.add(buildSkirts(ribbon, track.width));
    chunkGroup.add(buildRoad(track, ribbon, track.width));
    chunkGroup.add(buildMarkings(track, bare, track.width));
    const chippings = buildChippings(track, bare, track.width);
    if (chippings) chunkGroup.add(chippings);
    chunkGroup.add(buildBridges(track, from, to));
    chunkGroup.add(buildJunctions(track, from, to));
    // The branches this stretch of road forks off at its paving junctions.
    for (; spurScan < track.spurs.length; spurScan++) {
      const spur = track.spurs[spurScan];
      if (spur.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildSpur(track, spur));
    }
    const fords = buildFords(track, fordScan, to, waterTex);
    fordScan = fords.next;
    chunkGroup.add(fords.group);
    const toS = track.samples[to - 1].s;
    const fresh = terrain.field.streams.filter((s) => s.centerS >= streamScanS && s.centerS < toS);
    if (fresh.length > 0) chunkGroup.add(buildStreamMeshes(fresh, waterTex));
    streamScanS = toS;
    // The clearance guard: this chunk's aproned ribbon plus a margin of
    // neighbouring road, so props keep off the seams too.
    const guard = [
      ...ribbon,
      ...track.samples.slice(Math.max(0, from - 120), Math.max(0, from - 1)),
      ...track.samples.slice(to, Math.min(track.samples.length, to + 120)),
    ];
    const scenery = buildScenery(track, biome, terrain, from, to, guard, drawnTrees, density);
    chunkGroup.add(scenery.group);
    chunkGroup.add(buildCones(track, from, to));
    if (from === 0) chunkGroup.add(buildGate(track, 2, "start"));
    if (!track.endless && to === track.samples.length) {
      chunkGroup.add(buildGate(track, to - 2, "finish"));
    }
    group.add(chunkGroup);
    chunks.push({ toS, group: chunkGroup, scenery });
  };

  buildChunk(0, track.samples.length);
  builtIndex = track.samples.length;

  const sync = (state: GameState): void => {
    // The ground and the wild follow the CAR — on a finite stage too, so
    // an excursion far off the corridor still stands on drawn land.
    terrain.sync(track, state.progressS, state.car.x, state.car.z);
    wild.sync(state.car.x, state.car.z);
    if (!track.endless) return;
    const len = track.samples.length;
    if (len - builtIndex >= CHUNK_SAMPLES) {
      const from = builtIndex;
      buildChunk(from, len);
      builtIndex = len;
      // Road that has just come into being may run through props planted
      // when it did not exist yet — retire them before anyone sees it.
      for (const chunk of chunks) chunk.scenery.clearNear(track, from, len);
      wild.clearNear(track, from, len);
    }
    while (chunks.length > 1 && chunks[0].toS < state.progressS - PRUNE_BEHIND) {
      const old = chunks.shift() as Chunk;
      for (const key of old.scenery.treeKeys) drawnTrees.delete(key);
      group.remove(old.group);
      disposeGroup(old.group);
    }
  };

  const update = (dt: number): void => {
    terrain.update(dt);
    wild.update(dt);
    for (const chunk of chunks) chunk.scenery.update(dt);
  };

  const dispose = (): void => {
    disposeGroup(group);
    terrain.dispose();
  };

  return { group, update, sync, dispose };
}
