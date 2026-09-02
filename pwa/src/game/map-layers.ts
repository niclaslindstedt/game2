// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAP'S DEBUG LAYERS — the generated stage with one of the layers it
// was built out of painted over it.
//
// A stage is not a heightmap: it is rock, with a water table in it, soil on
// top of that, a forest rooted in the soil and a road cut through the lot
// (R32, engine/mapgen/geology.ts). Every one of those layers can be wrong
// on its own, and from the ground almost none of them can be seen wrong —
// a bog in the wrong place looks like a bog, a wood that stops dead looks
// like a clearing, and the only clue that the water table is running uphill
// is a lake somewhere it has no business being.
//
// So this draws them. One layer at a time, over the whole island the map
// view frames, sampled straight off the SAME field the generator plants and
// paves from — never a copy of its rules, which is why the rooting numbers
// moved into STAGE_RULES rather than being restated here.
//
// It is a developer tool and it looks like one: flat, unlit, banded colour
// with a legend that says what each band is worth. The point is to read a
// number off a picture, not to make a pretty map.
//
// Two things it deliberately does NOT do. It does not build until a layer
// is actually asked for — the menu rebuilds its backdrop stage on every
// seed step, and a hundred thousand geology samples per step would make the
// arrows unusable. And it draws with the depth test ON, lifted a couple of
// metres, so the paint hides behind the hills it is draped over: a layer
// that showed through the terrain would read as one flat sheet and lose the
// relief that puts every finding in a place.

import * as THREE from "three";
import { STAGE_RULES, biomeRules, type TerrainField, type Track } from "@engine";

import { ISLAND_MARGIN } from "./map-island.ts";

export type MapLayerId = "bedrock" | "water" | "soil" | "flora" | "roads";

/** The layers, in the order the country was made — which is also the order
 * a generator bug is usually chased in: the rock decides where the water
 * goes, the water decides where the soil stays, the soil decides where the
 * forest grows, and the road is cut through whatever that left. */
export const MAP_LAYERS: readonly { id: MapLayerId; label: string; hint: string }[] = [
  { id: "bedrock", label: "BEDROCK", hint: "Top of the rock, before anything was laid on it" },
  { id: "water", label: "GROUNDWATER", hint: "Where the table stands relative to the ground" },
  { id: "soil", label: "SOIL", hint: "Till and washed sediment lying on the rock" },
  { id: "flora", label: "FOLIAGE", hint: "How much forest this ground can grow" },
  { id: "roads", label: "ROADS", hint: "The stage, its corridor, and every other road" },
];

/** Cells across the island at most. The lattice is a debug instrument, not
 * scenery: 256 puts a 3 km stage on a 12 m reading, which is fine enough to
 * find a bog the road runs through and coarse enough to sample in a blink
 * that nobody counts. */
const CELLS = 256;
/** ...and never finer than this, m — past it the sampling costs more than
 * the answer is worth on a short stage. */
const MIN_CELL = 6;
/** How far the paint floats over the ground it describes, m. Enough to
 * clear the road's own crown and the lattice's disagreement with the drawn
 * ground — this lattice is not the terrain's, so on a steep flank the two
 * surfaces cross — and short of anything that reads as a floating sheet. */
const LIFT = 2.5;
/** How solid the paint is. NOT opaque, and the reason is the whole point of
 * being able to lean in: an opaque sheet at framing distance is a map, and
 * the same sheet a hundred metres up is a flat colour with the road, the
 * trees and the relief hidden underneath it — which is to say, a picture of
 * nothing. At this weight the layer still reads as the dominant colour and
 * the landscape it describes is still visible through it. */
const PAINT = 0.72;

/** One stop on a colour ramp: the value it is worth, and the colour there. */
type Stop = { at: number; color: number };

/** What the legend under the map says: the ramp, spelled out. */
export type LegendStop = { at: string; color: string };

export type MapLayerInfo = {
  id: MapLayerId;
  label: string;
  /** The ramp, for the strip under the map. */
  legend: LegendStop[];
  /** What this layer MEASURED over the island — the rows the debug box
   * prints, and the reason the picture is worth taking. */
  rows: { k: string; v: string }[];
  /** How coarse the reading is, m per cell. */
  cell: number;
};

export type MapLayers = {
  group: THREE.Group;
  /** Paint a layer, or take them all off. Returns what the layer measured,
   * which is what the debug box is made of; null when nothing is painted. */
  show: (id: MapLayerId | null) => MapLayerInfo | null;
  dispose: () => void;
};

const TMP = new THREE.Color();

function lerpRamp(stops: Stop[], v: number, into: THREE.Color): void {
  if (v <= stops[0].at) {
    into.setHex(stops[0].color);
    return;
  }
  for (let i = 1; i < stops.length; i++) {
    if (v > stops[i].at) continue;
    const a = stops[i - 1];
    const t = (v - a.at) / Math.max(1e-6, stops[i].at - a.at);
    into.setHex(a.color).lerp(TMP.setHex(stops[i].color), t);
    return;
  }
  into.setHex(stops[stops.length - 1].color);
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** A ramp as legend rows, with each stop's value written in `unit`. */
function legendOf(stops: Stop[], unit: (v: number) => string): LegendStop[] {
  return stops.map((s) => ({ at: unit(s.at), color: hex(s.color) }));
}

const m1 = (v: number): string => `${v.toFixed(1)} m`;
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Colours spread evenly across a measured band — what an auto-scaled layer
 * paints when a fixed one would put a flat seed and an alpine one in the
 * same single colour. */
function bandRamp(low: number, high: number, colors: number[]): Stop[] {
  return colors.map((color, i) => ({
    at: low + ((high - low) * i) / (colors.length - 1),
    color,
  }));
}

/** Everything the lattice knows about one point, as parallel arrays — one
 * sampling pass, five paint jobs. Sampled once because the expensive half
 * is the geology, and asking for it again per layer would turn a switch
 * between two layers into another full pass over the island. */
type Field = {
  /** Where the paint hangs: the drawn ground, m. */
  y: Float32Array;
  /** Top of the rock, m. */
  rock: Float32Array;
  /** Soil on it, m. */
  soil: Float32Array;
  /** Groundwater relative to the bare surface, m — positive is a mire. */
  wet: Float32Array;
  /** Open water over this point, m above the ground; 0 on dry land. */
  pool: Float32Array;
  /** Distance to the stage's centerline, m (Infinity out of range). */
  roadD: Float32Array;
  /** Some OTHER road here: 0 none, 1 gravel, 2 asphalt. */
  spur: Uint8Array;
  /** How much forest this ground grows, 0 open and ~1.5 closed. */
  flora: Float32Array;
};

export function buildMapLayers(track: Track, field: TerrainField, clip: THREE.Plane[]): MapLayers {
  const group = new THREE.Group();
  group.visible = false;
  const b = track.bounds;
  const minX = b.minX - ISLAND_MARGIN;
  const minZ = b.minZ - ISLAND_MARGIN;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + ISLAND_MARGIN * 2;
  const cell = Math.max(MIN_CELL, span / CELLS);
  const verts = Math.ceil(span / cell) + 1;

  let mesh: THREE.Mesh | null = null;
  let sampled: Field | null = null;

  /** Walk the island once and write down what is under every lattice point.
   * The geology is asked for the BARE country — the road shapes the surface
   * and nothing under it — which is exactly what a question about the
   * generator is about. */
  // R40 — the quilt this country is planted from, for the FOLIAGE layer.
  const quilt = biomeRules(track.knobs.biome);
  const sample = (): Field => {
    // The field builds its streams, spurs and guards lazily as the road is
    // synced, and a stage the run has not driven yet has none of them
    // indexed — a layer sampled off it would report an island with no water
    // in it. Catching it up from zero costs nothing it was not going to pay
    // anyway and prunes nothing, endless stages included.
    field.sync(0);
    const n = verts * verts;
    const out: Field = {
      y: new Float32Array(n),
      rock: new Float32Array(n),
      soil: new Float32Array(n),
      wet: new Float32Array(n),
      pool: new Float32Array(n),
      roadD: new Float32Array(n),
      spur: new Uint8Array(n),
      flora: new Float32Array(n),
    };
    const root = STAGE_RULES.forest.rooting;
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const v = j * verts + i;
        const x = minX + i * cell;
        const z = minZ + j * cell;
        const ground = field.geology.groundAt(x, z);
        out.y[v] = field.heightAt(x, z);
        out.rock[v] = ground.bedrock;
        out.soil[v] = ground.soil;
        out.wet[v] = ground.table - ground.surface;
        const water = field.waterAt(x, z);
        out.pool[v] = water === null ? 0 : Math.max(0, water - out.y[v]);
        out.roadD[v] = field.roadDistanceAt(x, z);
        const spur = field.spurSurfaceAt(x, z);
        out.spur[v] = spur === null ? 0 : spur === "asphalt" ? 2 : 1;
        // The forest rule, straight off R32's own numbers: bare rock grows
        // nothing with a trunk, thin cover grows a struggling stand, deep
        // soil grows a wood — times what the community and the region are
        // worth. The stand noise and the `trees` dial are left out: both
        // are the same everywhere at this scale, and what the layer is for
        // is WHERE the forest can be, not how it clumps.
        const rooting =
          ground.soil < root.depth
            ? 0
            : Math.min(1, root.thin + (ground.soil - root.depth) / root.full);
        out.flora[v] =
          rooting *
          quilt.groves[field.groveAt(x, z)].density *
          quilt.regions[field.regionAt(x, z)].forest;
      }
    }
    return out;
  };

  const build = (): void => {
    const positions = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 3);
    const indices = new Uint32Array((verts - 1) * (verts - 1) * 6);
    let at = 0;
    if (!sampled) sampled = sample();
    const data = sampled;
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const v = j * verts + i;
        positions[v * 3] = minX + i * cell;
        positions[v * 3 + 1] = data.y[v] + LIFT;
        positions[v * 3 + 2] = minZ + j * cell;
        if (i + 1 >= verts || j + 1 >= verts) continue;
        const next = v + verts;
        indices[at++] = v;
        indices[at++] = next;
        indices[at++] = v + 1;
        indices[at++] = v + 1;
        indices[at++] = next;
        indices[at++] = next + 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        // A reading, not a place: the air must not tint it and the sun must
        // not shade it, or the colour under the cursor stops being the
        // number the legend says it is.
        fog: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: PAINT,
        // Drawn over the ground but never OVER ITSELF: a sheet draped on a
        // hillside that wrote no depth would show its own far slope through
        // its near one, and the relief — which is what puts every reading in
        // a place — would go.
        depthWrite: true,
        clippingPlanes: clip,
      }),
    );
    // Over the ground and under the route ribbon (map-route.ts draws at 10):
    // the line the stage actually follows is the one annotation that must
    // survive every layer.
    mesh.renderOrder = 9;
    group.add(mesh);
  };

  const write = (attr: THREE.BufferAttribute, v: number, c: THREE.Color): void => {
    attr.setXYZ(v, c.r, c.g, c.b);
  };

  /** Paint the standing mesh from one layer's ramp, and measure what went
   * on it. Both at once because they are one walk over the same array. */
  const paint = (id: MapLayerId): MapLayerInfo => {
    if (!mesh) build();
    const painted = mesh as THREE.Mesh;
    const data = sampled as Field;
    const color = painted.geometry.getAttribute("color") as THREE.BufferAttribute;
    const c = new THREE.Color();
    const n = verts * verts;

    let info: MapLayerInfo;
    if (id === "bedrock") {
      let low = Infinity;
      let high = -Infinity;
      for (let v = 0; v < n; v++) {
        if (data.rock[v] < low) low = data.rock[v];
        if (data.rock[v] > high) high = data.rock[v];
      }
      const stops = bandRamp(low, high, [0x11202f, 0x2f5273, 0x6f7466, 0xbda57e, 0xf4f1e8]);
      let bare = 0;
      for (let v = 0; v < n; v++) {
        lerpRamp(stops, data.rock[v], c);
        write(color, v, c);
        if (data.soil[v] < 0.05) bare++;
      }
      info = {
        id,
        label: "BEDROCK",
        legend: legendOf(stops, m1),
        cell,
        rows: [
          { k: "rock", v: `${m1(low)} … ${m1(high)} · ${m1(high - low)} of relief` },
          { k: "bare", v: `${pct(bare / n)} of the island is rock at the surface` },
        ],
      };
    } else if (id === "water") {
      const stops: Stop[] = [
        { at: -8, color: 0xb98a4a },
        { at: -4, color: 0xcdb271 },
        { at: -1, color: 0xc2d68b },
        { at: 0, color: 0x6fd0c8 },
        { at: 1.5, color: 0x2f8fd0 },
        { at: 4, color: 0x11356e },
      ];
      let mire = 0;
      let open = 0;
      let deepest = 0;
      for (let v = 0; v < n; v++) {
        if (data.pool[v] > 0) {
          // Standing water reads as standing water. The table under a lake
          // is the lake, and painting it on the same ramp as a damp field
          // would hide every shoreline the generator got wrong.
          c.setHex(0x0a2f8a);
          open++;
          deepest = Math.max(deepest, data.pool[v]);
        } else {
          lerpRamp(stops, data.wet[v], c);
          if (data.wet[v] >= 0) mire++;
        }
        write(color, v, c);
      }
      info = {
        id,
        label: "GROUNDWATER",
        legend: [
          { at: "open water", color: hex(0x0a2f8a) },
          ...legendOf(stops, (v) => (v === 0 ? "spring line" : m1(v))),
        ],
        cell,
        rows: [
          { k: "open", v: `${pct(open / n)} under water · ${m1(deepest)} at the deepest` },
          { k: "mire", v: `${pct(mire / n)} of dry-looking ground has the table at or above it` },
        ],
      };
    } else if (id === "soil") {
      const max = STAGE_RULES.geology.soil.max;
      const root = STAGE_RULES.forest.rooting.depth;
      const stops: Stop[] = [
        { at: 0, color: 0x8f8d88 },
        { at: root, color: 0xb08a52 },
        { at: max / 2, color: 0x7a5327 },
        { at: max, color: 0x33240f },
      ];
      let sum = 0;
      let thin = 0;
      for (let v = 0; v < n; v++) {
        lerpRamp(stops, data.soil[v], c);
        write(color, v, c);
        sum += data.soil[v];
        if (data.soil[v] < root) thin++;
      }
      info = {
        id,
        label: "SOIL",
        legend: legendOf(stops, m1),
        cell,
        rows: [
          { k: "cover", v: `${m1(sum / n)} mean of ${m1(max)} deepest` },
          { k: "thin", v: `${pct(thin / n)} is under the ${m1(root)} a trunk needs` },
        ],
      };
    } else if (id === "flora") {
      const stops: Stop[] = [
        { at: 0, color: 0x9c8f6a },
        { at: 0.3, color: 0xb8bf6a },
        { at: 0.8, color: 0x4f8a3c },
        { at: 1.5, color: 0x123d1c },
      ];
      let sum = 0;
      let none = 0;
      for (let v = 0; v < n; v++) {
        lerpRamp(stops, data.flora[v], c);
        write(color, v, c);
        sum += data.flora[v];
        if (data.flora[v] <= 0) none++;
      }
      info = {
        id,
        label: "FOLIAGE",
        legend: legendOf(stops, (v) => v.toFixed(1)),
        cell,
        rows: [
          { k: "density", v: `${(sum / n).toFixed(2)} mean · grove × region × rooting` },
          { k: "treeless", v: `${pct(none / n)} cannot root a trunk at all` },
        ],
      };
    } else {
      const half = track.width / 2;
      // The corridor is what the placement code asks about before it plants
      // anything (`roadDistanceAt`), so the bands ARE the rule: the road,
      // its verge, the strip everything keeps clear of, and open country.
      const stops: Stop[] = [
        { at: half, color: 0xffd23e },
        { at: half + 6, color: 0xb4841c },
        { at: 40, color: 0x3f4a38 },
        { at: 240, color: 0x1b211a },
      ];
      let onRoad = 0;
      let gravel = 0;
      let asphalt = 0;
      for (let v = 0; v < n; v++) {
        if (data.spur[v] > 0) {
          c.setHex(data.spur[v] === 2 ? 0x6d6d78 : 0xa08f6d);
          if (data.spur[v] === 2) asphalt++;
          else gravel++;
        } else {
          const d = data.roadD[v];
          if (Number.isFinite(d)) lerpRamp(stops, d, c);
          else c.setHex(0x11150f);
          if (d <= half) onRoad++;
        }
        write(color, v, c);
      }
      info = {
        id,
        label: "ROADS",
        legend: [
          ...legendOf(stops, m1),
          // The corridor field answers Infinity past its own reach, and what
          // that means is worth saying: black here is not "no road", it is
          // "far enough out that nothing placing anything asks any more".
          { at: "out of corridor", color: hex(0x11150f) },
          { at: "spur gravel", color: hex(0xa08f6d) },
          { at: "spur asphalt", color: hex(0x6d6d78) },
        ],
        cell,
        rows: [
          {
            k: "stage",
            v: `${(track.length / 1000).toFixed(2)} km · ${m1(track.width)} wide · ${pct(onRoad / n)} of the island`,
          },
          { k: "spurs", v: `${pct(gravel / n)} gravel · ${pct(asphalt / n)} asphalt` },
        ],
      };
    }
    color.needsUpdate = true;
    return info;
  };

  const show = (id: MapLayerId | null): MapLayerInfo | null => {
    if (id === null) {
      group.visible = false;
      return null;
    }
    const info = paint(id);
    group.visible = true;
    return info;
  };

  const dispose = (): void => {
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh = null;
    sampled = null;
  };

  return { group, show, dispose };
}
