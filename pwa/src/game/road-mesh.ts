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

// Straight from the engine rather than through terrain.ts: the ground's
// paint reads this module's palette for R16's dust wash, and the two must
// not import each other.
import { endApron } from "@engine";
import { biomeFor } from "./biome.ts";
import { loosePaint } from "./ground-rules.ts";
import { rightOf, type Ribbon } from "./ribbon.ts";
import { detailTexture, looseTexture, textureMean } from "./textures.ts";

/** World up — the axis every scattered chipping spins about. */
export const UP = new THREE.Vector3(0, 1, 0);

/** The road's palette. Gravel is graded dirt, worn to hardpack down the two
 * tracks every car before you drove in, loose and pale at the edges;
 * asphalt is bitumen, polished lighter where the tires have burnished it
 * and grey-black between. */
export const ROAD_PAINT = {
  gravel: { loose: "#d2b489", worn: "#8a7046" },
  // R40 — the desert's road: bleached, near-white sand rather than graded
  // stone, and the wheel tracks are packed sand rather than worn-through
  // subgrade, so the split between loose and worn is shallow and stays
  // pale. Read under the same speckle map as the gravel, which darkens
  // everything it covers — so both are authored a shade lighter than the
  // sand they are meant to come out as.
  sand: { loose: "#f2e2b4", worn: "#d6bf8a" },
  // R47 — packed snow over the road above the snowline: white, the wheel
  // tracks worn to grey-blue ice. Authored as it should come OUT, because
  // a snow vertex is lifted clear of the grit map's darkening (see
  // `buildRoad`) — unlike the rows above, which are read under it.
  snow: { loose: "#f1f3f6", worn: "#c4ccd6" },
  // R48 — the road across a frozen lake: swept ice rather than packed
  // snow, so it is darker and bluer than the row above it, and the wheel
  // tracks are polished rather than worn — the tread burnishes the sheet
  // instead of cutting into it. Lifted clear of the grit map for the same
  // reason the snow is: there is no stone in a lake.
  ice: { loose: "#dbe7f1", worn: "#adc2d4" },
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
export function junctionAt(track: Track, x: number, z: number): number {
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
export function mainEdgeAt(track: Track, x: number, z: number): number | null {
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

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How far the dirt road's surfacing takes to become the sealed road's
 * across the seam, m. The seam IS the main road's edge — a road surface
 * changes across a line, not across a fade — and a mouth is OBLIQUE, so
 * even this measured across the main road is a couple of metres down the
 * minor one. Fading it over a car's length instead painted the mouth
 * tarmac-coloured before it reached the junction, which reads as a gravel
 * road stopping short of the road it is joining. */
const SEAM = 0.4;
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

/** R17 — every piece of MAT within reach of a junction, from both roads: a
 * disc per sample, at the width that sample actually is.
 *
 * What it answers is "is this point paved by somebody", which is the only
 * honest way to decide whether a border vertex may wear the country's
 * colour. A junction is two roads and a graded platform, and each of the
 * three knows about itself: the main road's own edge is `mainEdgeAt`, the
 * platform is `junctionAt`, and neither of them is the MOUTH — the minor
 * road's flared mat, which is what the abandoned arm's shoulder lies across
 * at the crossing's outer corner. That corner is where the green tongues
 * were.
 *
 * Built once per ribbon and only around the junctions, because that is the
 * only place two mats overlap. */
export function junctionMats(track: Track): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const junction of track.junctions) {
    const near = junction.reach * 2 + junction.width;
    const take = (p: { x: number; z: number; width?: number; shift?: number }, w: number): void => {
      if (Math.abs(p.x - junction.x) > near || Math.abs(p.z - junction.z) > near) return;
      out.push({ x: p.x, z: p.z, r: (p.width ?? w) / 2 + Math.abs(p.shift ?? 0) });
    };
    for (const sample of track.samples) take(sample, track.width);
    for (const spur of track.spurs) for (const sample of spur.samples) take(sample, spur.width);
  }
  return out;
}

/** R17 — how far past the main road's edge a junction's shoulder takes to
 * open back out to its full width, m. The band of dirt outside the paving
 * runs continuously round a crossing, so the minor road's border closes to
 * nothing at the kerb and the main road's is already at full width a few
 * metres out: filleted over the border's OWN width, the two meet edge to
 * edge and read as one thing rather than as two that stop at each other. */
export const BORDER_FILLET = ROAD_CROSS.reach;

/** R17 — is this piece of road standing on the MAIN road's mat? A minor
 * road has no border where it crosses the road it meets: its shoulder and
 * its edge line stop at that edge, which is the whole reason a junction
 * looks built. Wider than the mat by a margin, so the border comes back
 * once the corner is properly clear of it and not a meter after. */
export function onMainMat(track: Track, x: number, z: number): boolean {
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
 * back so consecutive chunks weld, plus the stage's end aprons where the
 * chunk holds an end (R24/R25, `endApron` — which is where a circuit gets
 * none). Only the drawn ribbon — the physics' samples are untouched. */
export function chunkSamples(track: Track, from: number, to: number): Track["samples"] {
  const base = track.samples.slice(Math.max(0, from - 1), to);
  if (from === 0) base.unshift(...endApron(track, "start"));
  if (to === track.samples.length) base.push(...endApron(track, "finish"));
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
  const lat = stations(width);
  const mats = junctionMats(track);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const paint = new THREE.Color();
  const earth = new THREE.Color(ROAD_PAINT.shoulder);
  const snowBank = new THREE.Color(ROAD_PAINT.snow.worn);
  /** The bare strip past the mat: the blade's earth, or on a snow road the
   * plough's own bank — reset per sample. */
  const shoulder = new THREE.Color();
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
  // R40 — the grain the ribbon is drawn under is the country's own grit:
  // brown stone over the shield's gravel, a pale hueless one over sand,
  // grey over a mountain's chippings. One map per ribbon, because a stage
  // is in one country. The GRAVEL paint is derived from the same grit, so
  // a grey road is grey and not the taiga's brown under a grey speckle;
  // the sand row stays authored, because bleached sand's split between
  // loose and worn is shallower than any rule for stone gives it.
  const look = biomeFor(track.knobs.biome);
  const roadMap = looseTexture(look.grit);
  const gravelPaint = loosePaint(look.grit);
  const EDGE_FIX = ((): THREE.Color => {
    const road = textureMean(roadMap);
    const land = textureMean(detailTexture());
    return new THREE.Color(
      land.r / Math.max(1e-3, road.r),
      land.g / Math.max(1e-3, road.g),
      land.b / Math.max(1e-3, road.b),
    );
  })();

  let lastCount = -1;
  /** The cross-section the strip currently in hand is woven from, so a
   * change can close it before starting the next. */
  let lastSection: number[] | null = null;
  let run = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const bridge = s.deck != null;
    // R17 — the cross-section does NOT change at a junction. What changes
    // is where the border ENDS, and that is decided per vertex below.
    //
    // Deciding it per sample took the border off both sides of the through
    // road for the whole length of the platform: a country road losing its
    // shoulder and its edge line for forty metres either side of a farm
    // track, which is the opposite of what a junction looks like. A main
    // road keeps its border past a side road; the only thing that
    // interrupts it is the MOUTH, on the mouth's own side, over the mouth's
    // own width — and the only road with no border at all is the minor one,
    // where it is standing on the main road's mat.
    const cross = lat;
    const kind = bridge
      ? "deck"
      : s.surface === "water"
        ? "water"
        : s.surface === "asphalt"
          ? "asphalt"
          : s.surface;
    if (kind === "gravel") {
      loose.copy(gravelPaint.loose);
      worn.copy(gravelPaint.worn);
    } else {
      loose.set(ROAD_PAINT[kind].loose);
      worn.set(ROAD_PAINT[kind].worn);
    }
    // R47 — a SNOW road is drawn under the same grit map as the rest of the
    // ribbon (one mesh, one material, no second draw call for a stage that
    // crosses the snowline), so its vertices are lifted by the map's own
    // darkening — the same ratio the lip uses to meet the ground — and
    // come out the white they were authored as, with the grit's grain
    // showing through as the stone in the packed snow.
    // R47/R48 — a snow road and an ice road are both WHITE ROAD: neither
    // has a shoulder of bare earth to hand over to (one is banked snow,
    // the other is the sheet the road was swept out of), and neither is
    // read under the grit map's darkening.
    const snowy = kind === "snow" || kind === "ice";
    shoulder.copy(snowy ? snowBank : earth);
    // R47 — inside a BORE the country beside the road is the mountain,
    // twenty metres up. The ribbon must not hand its outer band over to it.
    // `tunnel` rides the engine's sample rather than the ribbon's shape.
    const bored = (s as Ribbon & { tunnel?: boolean }).tunnel === true;
    // R33 — the road's own width HERE. The station list is built once at the
    // nominal width and SCALED, rather than rebuilt per sample: the vertex
    // count and the index buffer have to stay identical down the whole
    // strip or the triangles cannot be woven, and a scale keeps them so.
    const here = s.width ?? width;
    const wide = here / width;
    const halfHere = here / 2;
    // R17 — the mat's own centre, which a junction's mouth moves off the
    // centerline: the stations are measured across the MAT, then carried
    // out to where the mat actually is.
    const shift = s.shift ?? 0;
    /** One row of vertices across the road at this sample, in `stations`'
     * cross-section. A function because the SECTION CAN CHANGE from one
     * sample to the next — a junction cuts both roads' borders away (R17)
     * — and a strip whose rows are different lengths cannot be woven. The
     * change is drawn as two rows at the same arc position instead: the old
     * section closes flush against the new one, so the mat's edge steps in
     * along a single line and there is no hole.
     *
     * There used to be one. The strip simply restarted at the change and
     * the two rows were never woven together, which left a full-width band
     * of missing road at every junction rim on the map — the bright green
     * slivers ruled across the tarmac in every screenshot of one.
     */
    const emitRow = (stations: number[]): void => {
      for (const l of stations) {
        const wantOut = Math.abs(l * wide) - halfHere;
        const wantLat = l * wide + shift;
        // R17 — THE TWO ROADS' BORDERS ARE ONE BORDER. A junction's
        // shoulder does not stop at the kerb and start again on the other
        // side: it wraps round the corner, so the band of dirt outside the
        // paving is continuous all the way round the crossing and there is
        // no telling which road any part of it belongs to.
        //
        // What that takes is a FILLET. A border vertex standing on the
        // other road's mat has no width — it is a shoulder lying on
        // somebody's carriageway — and it opens back out to full width over
        // the next few metres past the kerb, which is where the main road's
        // own shoulder already is. The two therefore meet edge to edge and
        // read as one band round the outside.
        //
        // Per VERTEX, because that is the only place the question can be
        // answered: the sample's own centre is metres away and is usually
        // clear of the main road while its verge is not. Deciding it per
        // sample instead took the border off BOTH sides of the through road
        // for the whole length of the platform — a country road losing its
        // shoulder and its edge line for forty metres either side of a farm
        // track.
        const wx = s.x + r.x * wantLat;
        const wz = s.z + r.z * wantLat;
        const over = wantOut > 0 ? mainEdgeAt(track, wx, wz) : null;
        // ...and over ANY road's mat, not only the main one. At the outer
        // corner of a mouth it is the MINOR road's flared mat the other
        // road's border lies across, and `junctionMainEdge` knows nothing
        // about that one: what it left was a raised band of dirt out on the
        // tarmac beside every crossing.
        const paved =
          wantOut > 0 &&
          mats.some((m) => (m.x - wx) * (m.x - wx) + (m.z - wz) * (m.z - wz) < m.r * m.r);
        const keep = paved ? 0 : over === null ? 1 : clamp01(over / BORDER_FILLET);
        const out = wantOut * keep;
        const lat = wantOut > 0 ? Math.sign(l) * (halfHere + out) + shift : wantLat;
        const px = s.x + r.x * lat;
        const pz = s.z + r.z * lat;
        // R16 — the HAND-OVER. Past the bare shoulder the ribbon leans onto
        // the ground lattice beside it and by the corridor's lip the ground
        // has it entirely, so the two meshes MEET rather than one stopping in
        // the air over the other. Inside a junction it does not apply: a
        // junction is one graded plane out to its rim (R17), and the engine
        // has already warped both carriageways onto it.
        //
        // Nor inside a tunnel (R47): the lattice over a bore is the
        // mountain's roof, and an outer band leaning onto it is a vertical
        // skirt up the wall. The band is held flat at the shoulder's own
        // level instead — the bore's floor is graded out to the lining, and
        // the lining is drawn over it.
        const handing = ground !== undefined && out > 0 && (s.flat ?? 0) < 0.25 && !bored;
        const hand = handing ? handoverAt(out) : 1;
        const seat = bored ? Math.min(out, ROAD_CROSS.verge.bareTo) : out;
        const seatLat = bored ? Math.sign(l) * (halfHere + seat) + shift : lat;
        // The lift that keeps the mat off the ground lattice is spent by the
        // hand-over along with everything else, so the ribbon's last vertex
        // is the ground's height EXACTLY. Carrying it out to the lip instead
        // leaves the two meshes two centimetres apart — a gap the skirt shows
        // through as a dark hairline down the whole stage, which is the same
        // defect as the stripe it replaced, two orders of magnitude thinner
        // and just as visible against grass.
        let y = s.elevation + corridorOffset(s, seatLat, here) + bias;
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
          if (kind === "gravel" || kind === "sand") {
            const past = mainEdgeAt(track, px, pz);
            if (past !== null && past < SEAM) {
              const t = Math.max(0, past) / SEAM;
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
          // A sand road's shoulder IS sand — the blade pushed the same
          // stuff aside — so it keeps far more of the mat's colour than a
          // gravel road's earth shoulder keeps of the stone; a ploughed
          // snow bank the same.
          const memory = kind === "sand" || snowy ? 0.88 : 0.28;
          paint.copy(shoulder).lerp(loose, memory * (1 - out / ROAD_CROSS.verge.bareTo));
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
          if (bored) {
            // No country to run out into: the floor of the bore, to the wall.
            paint.copy(shoulder);
          } else if (ground !== undefined) {
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
            // A snow vertex is lifted whole below, so it takes none here.
            const lift = snowy ? 0 : mix;
            paint.r *= 1 + (EDGE_FIX.r - 1) * lift;
            paint.g *= 1 + (EDGE_FIX.g - 1) * lift;
            paint.b *= 1 + (EDGE_FIX.b - 1) * lift;
          } else {
            // No landscape to hand over to (the stage previews): the old flat
            // verge, which is all a picture of the road's plan needs.
            paint.copy(shoulder).lerp(verge, t);
          }
        }
        // R17 — and NO BORDER over the road it meets. A minor road's shoulder
        // and verge stop dead at the main road's edge, because past that line
        // the ground is the through road's: a vertex out there wearing the
        // country's colour is a patch of grass lying on the carriageway, and
        // that is what the mouth's outer corner had. The sample's own centre
        // cannot answer this — it is metres away and often clear of the main
        // road while its verge is not — so it is asked per VERTEX, where the
        // colour is actually being decided.
        if (out > 0) {
          const over = mainEdgeAt(track, px, pz);
          if (over !== null && over < 0) {
            sealed.copy(sealedLoose).lerp(sealedWorn, 0.55);
            paint.copy(sealed);
          }
          // ...and NO GRASS ON THE PAVING either. A junction is graded and
          // surfaced out to its rim (R17), so a border vertex inside the
          // platform is standing on made ground however far it is from
          // either mat — and one that has dissolved into the country is a
          // green tongue lying across the crossing, tapering to a point at
          // the mouth's outer corner. Held at the bare shoulder instead,
          // which is what the ground round a junction actually is, and
          // faded out on the platform's own edge so the country comes back
          // where the made ground stops.
          const graded = paved ? 1 : junctionAt(track, px, pz);
          if (graded > 0) paint.lerp(shoulder, graded);
        }
        if (snowy) paint.multiply(EDGE_FIX);
        colors.push(paint.r, paint.g, paint.b);
      }
    };
    /** ...and weave the last row emitted onto the one before it. */
    const weave = (count: number): void => {
      // Wound so the face normals point up — the road is drawn single-sided
      // and a downward winding would cull the whole surface from above.
      const b = positions.length / 3 - count;
      const a = b - count;
      for (let k = 0; k < count - 1; k++) {
        indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
      }
    };
    if (cross.length !== lastCount) {
      // Close the outgoing section against this sample before the new one
      // starts, so the two butt together instead of leaving a gap.
      if (run > 0 && lastSection !== null) {
        emitRow(lastSection);
        weave(lastSection.length);
      }
      lastCount = cross.length;
      lastSection = cross;
      run = 0;
    }
    emitRow(cross);
    if (run > 0) weave(cross.length);
    run += 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: roadMap, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  // The road is what the cars' shadows fall on (car-shadow.ts) — and so is
  // everything laid ON it below, or the paint would stand bright inside a
  // shadow that darkens the gravel around it.
  mesh.receiveShadow = true;
  return mesh;
}

export { buildChippings, buildFords, buildMarkings, buildSkirts } from "./road-trim.ts";
