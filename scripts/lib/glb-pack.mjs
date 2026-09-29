// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLB PACKER: a static glTF binary as Blender wrote it, made small for
// the wire. Every primitive's vertices are reordered for the cache and
// QUANTIZED (KHR_mesh_quantization — positions to 16-bit steps of
// `STEP` metres, the step carried as the node's scale; normals and colours
// to 8 bits), and every buffer view is COMPRESSED (EXT_meshopt_compression),
// which three's GLTFLoader decodes with the `MeshoptDecoder` three itself
// ships. What it takes is what a modelled TREE is: POSITION, NORMAL and
// COLOR_0 on indexed triangles, no skin, no morph, no animation, no texture;
// anything else is refused rather than dropped.
//
//   const small = await packGlb(readFileSync("spruce.glb"));

import { MeshoptEncoder } from "meshoptimizer";

/** A position's step, m: ±128 m at 4 mm — a model is never seen closer
 * than that matters. */
export const STEP = 1 / 256;

const FLOAT = 5126;
const BYTE = 5120;
const UBYTE = 5121;
const SHORT = 5122;
const USHORT = 5123;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TAKEN = new Set(["POSITION", "NORMAL", "COLOR_0"]);

/** The JSON and the binary chunk of a GLB. */
function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb");
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const at = 20 + jsonLength;
  const bin =
    at < buf.length ? buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at)) : Buffer.alloc(0);
  return { json, bin };
}

/** An accessor's values as plain numbers, normalized ones denormalized. */
function readAccessor(json, bin, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const n = COMPONENTS[a.type];
  const size = { [FLOAT]: 4, [UINT]: 4, [USHORT]: 2, [SHORT]: 2, [UBYTE]: 1, [BYTE]: 1 }[
    a.componentType
  ];
  const stride = view.byteStride ?? n * size;
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = new Float64Array(a.count * n);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = base + i * stride + c * size;
      let v;
      switch (a.componentType) {
        case FLOAT:
          v = bin.readFloatLE(o);
          break;
        case UINT:
          v = bin.readUInt32LE(o);
          break;
        case USHORT:
          v = bin.readUInt16LE(o);
          if (a.normalized) v /= 65535;
          break;
        case SHORT:
          v = bin.readInt16LE(o);
          if (a.normalized) v = Math.max(v / 32767, -1);
          break;
        case UBYTE:
          v = bin.readUInt8(o);
          if (a.normalized) v /= 255;
          break;
        default:
          v = bin.readInt8(o);
          if (a.normalized) v = Math.max(v / 127, -1);
      }
      out[i * n + c] = v;
    }
  }
  return { values: out, count: a.count, n };
}

/** Pack a GLB (a Buffer) as the header says; resolves to the packed one. */
export async function packGlb(input) {
  await MeshoptEncoder.ready;
  const { json, bin } = readGlb(input);
  for (const key of ["skins", "animations", "images", "textures"]) {
    if (json[key]?.length)
      throw new Error(`packGlb takes static untextured meshes: this one has ${key}`);
  }
  // FOUR STREAMS, every primitive's run of each appended to its stream and
  // its accessor pointing into it: one buffer view (and one compressed
  // run) a stream rather than one a primitive.
  const streams = {
    POSITION: { size: 8, mode: "ATTRIBUTES", target: ARRAY_BUFFER, parts: [], count: 0 },
    NORMAL: { size: 4, mode: "ATTRIBUTES", target: ARRAY_BUFFER, parts: [], count: 0 },
    COLOR_0: { size: 4, mode: "ATTRIBUTES", target: ARRAY_BUFFER, parts: [], count: 0 },
    indices: { size: 2, mode: "TRIANGLES", target: ELEMENT_ARRAY_BUFFER, parts: [], count: 0 },
  };
  const accessors = [];
  /** An accessor over `data` (count elements of its stream's size). */
  const add = (stream, data, count, accessor) => {
    const s = streams[stream];
    accessors.push({ ...accessor, bufferView: stream, byteOffset: s.count * s.size, count });
    s.parts.push(data);
    s.count += count;
    return accessors.length - 1;
  };

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const extra = Object.keys(prim.attributes).filter((k) => !TAKEN.has(k));
      if (extra.length || prim.targets || prim.indices === undefined || (prim.mode ?? 4) !== 4) {
        throw new Error(
          `packGlb: ${mesh.name} carries what it cannot pack (${extra.join(", ") || "no indices"})`,
        );
      }
      const pos = readAccessor(json, bin, prim.attributes.POSITION);
      const nrm =
        prim.attributes.NORMAL === undefined
          ? null
          : readAccessor(json, bin, prim.attributes.NORMAL);
      const col =
        prim.attributes.COLOR_0 === undefined
          ? null
          : readAccessor(json, bin, prim.attributes.COLOR_0);
      const index = Uint32Array.from(readAccessor(json, bin, prim.indices).values);
      // Reordered for the vertex cache and the fetch: better compression too.
      const [remap, unique] = MeshoptEncoder.reorderMesh(index, true, true);
      const order = new Uint32Array(unique);
      for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) order[remap[i]] = i;

      const attributes = {};
      // POSITION: 16-bit steps, padded to 8 bytes.
      const p = new Int16Array(unique * 4);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < unique; v++) {
        for (let c = 0; c < 3; c++) {
          const q = Math.round(pos.values[order[v] * 3 + c] / STEP);
          if (Math.abs(q) > 32767)
            throw new Error(`packGlb: ${mesh.name} reaches past ±${32767 * STEP} m`);
          p[v * 4 + c] = q;
          lo[c] = Math.min(lo[c], q);
          hi[c] = Math.max(hi[c], q);
        }
      }
      attributes.POSITION = add("POSITION", new Uint8Array(p.buffer), unique, {
        componentType: SHORT,
        type: "VEC3",
        min: lo,
        max: hi,
      });
      if (nrm) {
        const q = new Int8Array(unique * 4);
        for (let v = 0; v < unique; v++) {
          for (let c = 0; c < 3; c++) q[v * 4 + c] = Math.round(nrm.values[order[v] * 3 + c] * 127);
        }
        attributes.NORMAL = add("NORMAL", new Uint8Array(q.buffer), unique, {
          componentType: BYTE,
          normalized: true,
          type: "VEC3",
        });
      }
      if (col) {
        const q = new Uint8Array(unique * 4);
        for (let v = 0; v < unique; v++) {
          for (let c = 0; c < 4; c++) {
            const x = c < col.n ? col.values[order[v] * col.n + c] : 1;
            q[v * 4 + c] = Math.round(Math.min(1, Math.max(0, x)) * 255);
          }
        }
        attributes.COLOR_0 = add("COLOR_0", q, unique, {
          componentType: UBYTE,
          normalized: true,
          type: "VEC4",
        });
      }
      if (unique > 65535)
        throw new Error(`packGlb: ${mesh.name} has more vertices than 16-bit indices reach`);
      const ix = Uint16Array.from(index);
      prim.indices = add("indices", new Uint8Array(ix.buffer), index.length, {
        componentType: USHORT,
        type: "SCALAR",
      });
      prim.attributes = attributes;
    }
  }
  // The step every position was quantized to, on every node that draws.
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    if (node.matrix) throw new Error("packGlb: a node carries a matrix");
    node.scale = (node.scale ?? [1, 1, 1]).map((s) => s * STEP);
  }
  // Each stream compressed whole, into the binary chunk; the fallback
  // buffer only says how big the decoded views are.
  const chunks = [];
  const views = [];
  const viewOf = {};
  let compressed = 0;
  let virtual = 0;
  for (const [name, s] of Object.entries(streams)) {
    if (s.count === 0) continue;
    const data = Buffer.concat(
      s.parts.map((d) => Buffer.from(d.buffer, d.byteOffset, d.byteLength)),
    );
    const packed = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(data), s.count, s.size, s.mode);
    const pad = (4 - (packed.length % 4)) % 4;
    chunks.push(Buffer.from(packed), Buffer.alloc(pad));
    const ext = {
      buffer: 0,
      byteOffset: compressed,
      byteLength: packed.length,
      byteStride: s.size,
      count: s.count,
      mode: s.mode,
    };
    const view = {
      buffer: 1,
      byteOffset: virtual,
      byteLength: s.count * s.size,
      target: s.target,
      extensions: { EXT_meshopt_compression: ext },
    };
    if (s.mode === "ATTRIBUTES") view.byteStride = s.size;
    viewOf[name] = views.push(view) - 1;
    compressed += packed.length + pad;
    virtual += s.count * s.size + ((4 - ((s.count * s.size) % 4)) % 4);
  }
  for (const a of accessors) a.bufferView = viewOf[a.bufferView];
  json.accessors = accessors;
  json.bufferViews = views;
  json.buffers = [
    { byteLength: compressed },
    { byteLength: virtual, extensions: { EXT_meshopt_compression: { fallback: true } } },
  ];
  const used = new Set([
    ...(json.extensionsUsed ?? []),
    "KHR_mesh_quantization",
    "EXT_meshopt_compression",
  ]);
  json.extensionsUsed = [...used];
  json.extensionsRequired = [
    ...new Set([
      ...(json.extensionsRequired ?? []),
      "KHR_mesh_quantization",
      "EXT_meshopt_compression",
    ]),
  ];

  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return [h, data];
  };
  return Buffer.concat([header, ...chunk(0x4e4f534a, jsonChunk), ...chunk(0x004e4942, binChunk)]);
}
