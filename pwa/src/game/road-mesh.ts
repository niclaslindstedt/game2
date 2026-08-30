// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD, as a mesh: the ribbon across its whole width and a little past
// it, the dirt skirts that close it to the ground under it, the paint a
// public road carries, the chippings down an asphalt mat's edge, and the
// sheet of water over a ford.
//
// The SHAPE is never this module's: it comes from the engine (`road.ts` —
// R16's five lines, R19's bank, R17's junction platforms), which is the same
// profile the physics rides and the terrain field hangs its shelf off, so
// what the car climbs out of is exactly what the player sees it climb out
// of. What IS this module's is the PAINT: how worn reads as colour, where
// the surfacing hands over to the shoulder, and how a junction's two
// surfacings smear into each other.

import * as THREE from "three";
import {
  ROAD_CROSS,
  corridorOffset,
  handoverAt,
  hash2,
  junctionDust,
  junctionFlat,
  junctionMainEdge,
  rutAt,
  wearAt,
  type Track,
} from "@engine";

import { valueNoise } from "../lib/noise.ts";
// The dissolve field is the SPILL's — one field, so the paint's boundary and
// the scattered stones agree instead of reading as two effects.
import { DISSOLVE } from "./road-spill.ts";

// `APRON` straight from the engine rather than through terrain.ts, which
// only re-exports it: the ground's paint reads this module's palette for
// R16's dust wash, and the two must not import each other.
import { APRON } from "@engine";
import { detailTexture, gravelTexture, textureMean } from "./textures.ts";
import { rightOf, type Ribbon } from "./ribbon.ts";

/** World up — the axis every scattered chipping spins about. */
const UP = new THREE.Vector3(0, 1, 0);

/** The road's palette. Gravel is graded dirt, worn to hardpack down the two
 * tracks every car before you drove in, loose and pale at the edges;
 * asphalt is bitumen, polished lighter where the tires have burnished it
 * and grey-black between. */
export const ROAD_PAINT = {
  gravel: { loose: "#d2b489", worn: "#8a7046" },
  asphalt: { loose: "#3a3b40", worn: "#54555c" },
  water: { loose: "#8fa6c6", worn: "#8fa6c6" },
  deck: { loose: "#b7b3a8", worn: "#a4a096" },
  shoulder: "#8a734f",
  /** Past the bare shoulder the verge greens over and meets the terrain's
   * own grass — there is no ditch to color (R16). */
  verge: "#6f8f3e",
};

/** How many bands the loose outer margin — everything past the wheel
 * tracks — is cut into on the way to the road's edge. */
const OUTER_BANDS = 4;

/** Where the ribbon puts a vertex across the road, in meters from the
 * centerline. R16's shape is FIVE LINES, and a mesh only has the shape its
 * vertices give it, so the stations are built around the wheel tracks —
 * which sit at a real-world distance from the middle of the road, not at a
 * fraction of its width — with the crown and the loose margin spread out
 * either side of them. Mirrored for the far side. */
function matStations(width: number): number[] {
  const half = width / 2;
  const at = rutAt(width);
  const w = ROAD_CROSS.rut.width;
  // The crown, both walls of the track and its floor...
  const out = [0, (at - w * 0.8) / 2, at - w * 0.8, at - w * 0.35, at, at + w * 0.35, at + w * 0.8];
  // ...then out across the loose margin, plus a cut on the berm's shoulder
  // so the gravel piled at the edge has an edge to be piled against.
  const from = Math.min(half, at + w * 1.3);
  for (let k = 0; k <= OUTER_BANDS; k++) out.push(from + ((half - from) * k) / OUTER_BANDS);
  out.push(half * ROAD_CROSS.berm.from);
  return [...new Set(out.filter((v) => v >= 0 && v <= half))].sort((a, b) => a - b);
}
/** ...and past the edge, in meters out from it: the mat's chamfer, the
 * bare shoulder, and then the HAND-OVER band, cut into enough steps to
 * dissolve in (R16 — no ditch, and no edge either: the road runs out).
 *
 * The band gets its own stations rather than the two it used to have,
 * because what happens across it is no longer a straight lerp between two
 * colours: it is the road's height leaning onto the ground lattice and the
 * road's paint dissolving into the ground's, both driven by a noise field.
 * A dissolve resolved at two vertices is a ruled line with a wobble on it. */
const DISSOLVE_BANDS = 5;
const VERGE_STATIONS = ((): number[] => {
  const from: number = ROAD_CROSS.verge.bareTo;
  const out: number[] = [ROAD_CROSS.chamfer, from];
  for (let k = 1; k <= DISSOLVE_BANDS; k++) {
    out.push(from + ((ROAD_CROSS.reach - from) * k) / DISSOLVE_BANDS);
  }
  return [...new Set(out)].sort((a, b) => a - b);
})();

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

/** R16 — how far in from the mat's outer edge the surfacing starts giving
 * way to the shoulder beside it, m, and how much of the shoulder's colour
 * it has taken by the time it gets there. The road's loose margin is
 * already the palest, least-driven line on it (`wearAt`), so this is the
 * last step of a fade that started well inside the road rather than a band
 * painted round the edge. */
const HANDOVER = 2.2;
const HANDOVER_MIX = 0.72;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
  const mat = matStations(width);
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
export function chunkSamples(track: Track, from: number, to: number): Track["samples"] {
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

/** What the road's outer band hands over TO: the ground beside it, as the
 * renderer can ask about it — the height of the drawn tile lattice and the
 * colour the tiles carry there (terrain.ts). Optional on `buildRoad` only
 * because the previews build a ribbon with no landscape under it. */
export type GroundBeside = {
  heightAt: (x: number, z: number) => number;
  paintAt: (x: number, z: number, out: THREE.Color) => void;
};

/** The road, across its whole width and a little past it: the mat with its
 * camber and its two worn wheel tracks, the chamfered edge, the shoulder,
 * and the band over which the whole thing runs out into the country (R16).
 * The SHAPE comes from the engine (road.ts) — the same profile the physics
 * rides and the terrain field hangs its shelf off — so what the car climbs
 * out of is exactly what the player sees it climb out of.
 *
 * The paint is this module's: gravel worn to hardpack down the tracks and
 * loose at the edges, asphalt burnished where the tires polish it, a
 * shoulder of spilled dirt, and past that the ground's own colour, dissolved
 * into rather than met at a line.
 *
 * `ground` is the landscape beside the road. With it, R16's hand-over
 * applies: over the outer band the ribbon's height leans onto the ground
 * lattice and its paint dissolves into the ground's own, so the two meshes
 * meet at a shared height and a shared colour instead of the road stopping
 * in the air at a ruled green line. Without it — the stage previews, which
 * draw a ribbon and no landscape — the band is the old flat verge, which is
 * all a preview needs. */
export function buildRoad(
  track: Track,
  samples: Ribbon[],
  width: number,
  bias = 0.02,
  ground?: GroundBeside,
): THREE.Mesh {
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
  const country = new THREE.Color();
  // What the ribbon's colour has to be multiplied by at the corridor's lip
  // so that, once this mesh's gravel map has had its say, it renders what
  // the ground beside it renders under the detail map. Read off the two
  // canvases rather than declared, so re-speckling a texture keeps the seam
  // shut. Built here, once per ribbon, rather than at module scope: both
  // textures are painted lazily and neither exists until something asks.
  const EDGE_FIX = ((): THREE.Color => {
    const road = textureMean(gravelTexture());
    const land = textureMean(detailTexture());
    return new THREE.Color(
      land.r / Math.max(1e-3, road.r),
      land.g / Math.max(1e-3, road.g),
      land.b / Math.max(1e-3, road.b),
    );
  })();

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
    // R33 — the road's own width HERE. The station list is built once at the
    // nominal width and SCALED, rather than rebuilt per sample: the vertex
    // count and the index buffer have to stay identical down the whole
    // strip or the triangles cannot be woven, and a scale keeps them so.
    const here = s.width ?? width;
    const wide = here / width;
    const halfHere = here / 2;
    for (const l of cross) {
      const out = Math.abs(l * wide) - halfHere;
      const px = s.x + r.x * l * wide;
      const pz = s.z + r.z * l * wide;
      // R16 — the HAND-OVER. Past the bare shoulder the ribbon leans onto
      // the ground lattice beside it and by the corridor's lip the ground
      // has it entirely, so the two meshes MEET rather than one stopping in
      // the air over the other. Inside a junction it does not apply: a
      // junction is one graded plane out to its rim (R17), and the engine
      // has already warped both carriageways onto it.
      const handing = ground !== undefined && out > 0 && (s.flat ?? 0) < 0.25;
      const hand = handing ? handoverAt(out) : 1;
      // The lift that keeps the mat off the ground lattice is spent by the
      // hand-over along with everything else, so the ribbon's last vertex
      // is the ground's height EXACTLY. Carrying it out to the lip instead
      // leaves the two meshes two centimetres apart — a gap the skirt shows
      // through as a dark hairline down the whole stage, which is the same
      // defect as the stripe it replaced, two orders of magnitude thinner
      // and just as visible against grass.
      let y = s.elevation + corridorOffset(s, l * wide, here) + bias;
      if (ground !== undefined && hand < 1) {
        y = y * hand + ground.heightAt(px, pz) * (1 - hand);
      }
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
        paint.copy(loose).lerp(worn, wearAt(l * wide, here) * (1 - flat) + 0.55 * flat);
        // R16 — the road's outer line has to MEET the country, not stop at
        // it. Over the last stretch of the mat the surfacing gives way to
        // the shoulder's dirt, along a line that wanders: a dead straight
        // boundary ruled parallel to the centerline is the one thing that
        // says "drawn" from any distance at all. Not inside a junction,
        // which is paved to a hard edge on purpose (R17).
        const inside = -out;
        if (inside < HANDOVER && flat < 0.25) {
          const wobble = 0.75 + 0.5 * hash2(Math.round(s.s / 3), l > 0 ? 1 : 0, 0x9e37);
          const t = clamp01(1 - inside / (HANDOVER * wobble));
          paint.lerp(shoulder, t * t * HANDOVER_MIX);
        }
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
        // ...and coming the other way, the bare shoulder keeps a memory of
        // the surfacing it just left, so the handover is one blend rather
        // than two halves of a step.
        paint.copy(shoulder).lerp(loose, 0.28 * (1 - out / ROAD_CROSS.verge.bareTo));
      } else {
        // R16 — THE DISSOLVE. Past the bare shoulder the road runs out into
        // the country, and this is the half of that a player actually sees.
        //
        // What it must not be is a lerp between two colours across a band of
        // fixed width, because that is a line ruled parallel to the
        // centerline and a ruled line is legible from the far side of a
        // valley. So the amount of ground at a vertex is the hand-over
        // pushed either way by a noise field at the size of the stones being
        // scattered: fingers of gravel reach out into the grass and tongues
        // of grass come back in, and the boundary stops being one.
        //
        // Both ends stay hard. At the shoulder it is all road — the blade
        // keeps that strip bare — and at the corridor's lip it is all
        // ground, whatever the noise says, because that is the vertex the
        // tile mesh is standing next to.
        const t = 1 - handoverAt(out);
        if (ground !== undefined) {
          const g = valueNoise(px, pz, DISSOLVE.patch, DISSOLVE.seed);
          const mix = clamp01(t * (1 + DISSOLVE.spread) - g * DISSOLVE.spread);
          ground.paintAt(px, pz, country);
          paint.copy(shoulder).lerp(country, mix);
          // ...and then UNDO THIS MESH'S OWN MAP, by however much of the
          // ground's colour the vertex has taken.
          //
          // The road carries a brown gravel grain and the tiles carry a
          // near-white one, so the same colour on both renders forty per
          // cent apart (see `textureMean`). Handing the ground's colour
          // over without this is handing over three quarters of the
          // difference and leaving the rest as a hard line exactly at the
          // lip — the last edge in R16's hand-over, drawn by the maps after
          // the geometry and the palette have both done everything right.
          // By the lip the vertex is asking the gravel map for what the
          // detail map would have given it, so the two meshes render the
          // same colour at the seam and there is nothing left to see.
          paint.r *= 1 + (EDGE_FIX.r - 1) * mix;
          paint.g *= 1 + (EDGE_FIX.g - 1) * mix;
          paint.b *= 1 + (EDGE_FIX.b - 1) * mix;
        } else {
          // No landscape to hand over to (the stage previews): the old flat
          // verge, which is all a picture of the road's plan needs.
          paint.copy(shoulder).lerp(verge, t);
        }
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
 * none — there is nothing under a bridge but air and water.
 *
 * **It hangs from the vertex the RIBBON ends at, which is not the ribbon's
 * own analytic height.** R16 spends the hand-over across the outer band, so
 * the ribbon's last vertex is the ground's height there and not the road's
 * — and the terrain sinks its shelf a little under the corridor besides. A
 * skirt hung from `corridorOffset` alone therefore stands a third of a metre
 * proud of the road it is closing, and what that draws is a dirt-coloured
 * stripe running the whole length of the stage a few metres out in the
 * grass: the very vertical face R16 exists to remove, put back by the mesh
 * that was supposed to hide it. `ground` is the same landscape `buildRoad`
 * hands over to, and the hand-over has spent the lift by the lip in both,
 * so the two meshes share an edge exactly. Without a landscape (the stage
 * previews draw a ribbon and nothing else) the analytic height is all there
 * is, and `bias` is the lift that goes with it. */
export function buildSkirts(
  samples: Ribbon[],
  width: number,
  bias = 0.02,
  ground?: GroundBeside,
): THREE.Mesh {
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
      // R33 — the ribbon scales its whole cross-section, verge and all, with
      // the road's width HERE, so the lip moves in and out along the stage
      // and the skirt has to move with it.
      const here = s.width ?? width;
      const at = edge * (here / width) * side;
      const ex = s.x + r.x * at;
      const ez = s.z + r.z * at;
      // R16 — the ribbon's last vertex, computed the way `buildRoad`
      // computes it: the ground's own height past the hand-over, except
      // inside a junction, where there is no hand-over to make (R17).
      const handed = ground !== undefined && (s.flat ?? 0) < 0.25;
      const top = handed
        ? ground.heightAt(ex, ez)
        : s.elevation + corridorOffset(s, at, here) + bias;
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

/** The road's PAINT: the lines a road carries because a highways department
 * painted them there — a solid white edge line and a dashed centre on the
 * tarmac sections, which is most of what makes them read as a road the
 * rally borrowed rather than a differently-colored stripe.
 *
 * A gravel road gets NONE. Nobody paints a forest road, and what marks a
 * rally stage is the rally's own striped marking — which R26 puts at the
 * corners that need it rather than down the whole stage, and which is
 * therefore not a line at all but a run of objects. That lives in
 * `kerbs.ts`. Fords and bridge decks carry nothing either way. Markings run
 * the stage proper, never the aprons — pass the bare range. */
export function buildMarkings(track: Track, samples: Ribbon[], width: number): THREE.Mesh {
  const half = width / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
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
export function buildChippings(
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
export function buildFords(
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
