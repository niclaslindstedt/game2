// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Procedural textures — the "very rough" look is the look. Everything is
// speckled onto small canvases at runtime (no binary assets in the repo),
// with nearest-filtering so the grain stays chunky and arcade instead of
// smooth and photographic.

import * as THREE from "three";

import { shareOne } from "../lib/shared-gpu.ts";

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx };
}

function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: string,
  flecks: { color: string; count: number; min: number; max: number }[],
): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (const f of flecks) {
    ctx.fillStyle = f.color;
    for (let i = 0; i < f.count; i++) {
      const s = f.min + Math.random() * (f.max - f.min);
      ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
  }
}

/** Paint a texture once and hand the same one to everybody after.
 *
 * Every texture here is a TILE — the same speckle wherever it lands — so a
 * second copy is a canvas, a few thousand fillRects and a GPU upload spent
 * on a picture nobody can tell from the first. That matters because the
 * road and the forest ask for theirs once per chunk of stage raised, which
 * is once every few frames while a stage streams in.
 *
 * `bannerTexture` is the exception below: it paints WORDS, so no two of
 * them are the same picture and each belongs to its caller. */
const once = shareOne<THREE.CanvasTexture>;

function toTexture(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const gravelTexture = once((): THREE.CanvasTexture => {
  const { canvas, ctx } = makeCanvas(128);
  speckle(ctx, 128, "#b29268", [
    { color: "#a08258", count: 900, min: 1, max: 3 },
    { color: "#c4a67a", count: 700, min: 1, max: 3 },
    { color: "#8a6f4d", count: 350, min: 1, max: 4 },
    { color: "#d8c096", count: 150, min: 1, max: 2 },
  ]);
  return toTexture(canvas, 1);
});

/** A near-white speckle that multiplies vertex colors: pure grain, no hue.
 * The ground and every flora instance share it, so grass, bedrock and
 * foliage all carry the same chunky arcade noise whatever color they are. */
export const detailTexture = once((): THREE.CanvasTexture => {
  const { canvas, ctx } = makeCanvas(128);
  speckle(ctx, 128, "#ffffff", [
    { color: "#e6e6e0", count: 900, min: 1, max: 3 },
    { color: "#d4d4cc", count: 450, min: 1, max: 3 },
    { color: "#c2c2ba", count: 180, min: 1, max: 2 },
    { color: "#f2f2ec", count: 500, min: 1, max: 4 },
  ]);
  return toTexture(canvas, 1);
});

/** The average colour a texture multiplies a surface BY, in the linear space
 * the shader does the multiplying in.
 *
 * This exists because two surfaces that meet cannot be matched on their
 * vertex colours alone when they carry different maps. The road's grain is
 * a brown speckle averaging a little over half brightness; the ground's is
 * a near-white one averaging nearly all of it. So a road vertex and a
 * ground vertex painted the SAME colour render forty percent apart, and at
 * the corridor's lip — where R16 has just spent a whole band handing one
 * over to the other — that difference is a hard line, drawn by the maps
 * after the geometry and the palette have both done everything right.
 *
 * Measured off the canvas rather than declared, so it stays true when
 * somebody re-speckles a texture. `colorSpace` is honoured: the canvas is
 * sRGB and the shader is linear, and averaging in the wrong one is worth
 * several percent on a mean this dark. */
const means = new WeakMap<THREE.CanvasTexture, THREE.Color>();
export function textureMean(tex: THREE.CanvasTexture): THREE.Color {
  const held = means.get(tex);
  if (held) return held;
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  const total = new THREE.Color(1, 1, 1);
  means.set(tex, total);
  if (!ctx) return total;
  total.setRGB(0, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = new THREE.Color();
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    px.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
    total.r += px.r / n;
    total.g += px.g / n;
    total.b += px.b / n;
  }
  return total;
}

export const waterTexture = once((): THREE.CanvasTexture => {
  const { canvas, ctx } = makeCanvas(64);
  speckle(ctx, 64, "#2f86e0", [
    { color: "#4fa0f0", count: 220, min: 1, max: 5 },
    { color: "#1f6ec8", count: 160, min: 1, max: 4 },
    { color: "#dff1ff", count: 60, min: 1, max: 2 },
  ]);
  return toTexture(canvas, 2);
});

/** A rally gate banner: the word in chunky dark caps on a white ground,
 * framed by checkered-flag bands top and bottom. Nearest filtering keeps
 * the lettering as blocky as the rest of the world. */
export function bannerTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#f6f3ea";
  ctx.fillRect(0, 0, 512, 96);
  const sq = 16;
  for (let x = 0; x < 512 / sq; x++) {
    for (const row of [0, 1, 4, 5]) {
      ctx.fillStyle = (x + row) % 2 === 0 ? "#1c1e22" : "#f6f3ea";
      ctx.fillRect(x * sq, row < 2 ? row * (sq / 2) : 96 - (6 - row) * (sq / 2), sq, sq / 2);
    }
  }
  ctx.fillStyle = "#1c1e22";
  ctx.font = "bold 58px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A long label (a circuit's START/FINISH) is squeezed to fit rather than
  // allowed to run off the cloth.
  ctx.fillText(text, 256, 50, 480);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The board at a taped-off junction: black chevrons on rally yellow,
 * pointing back at the way the stage actually goes. */
export const chevronTexture = once((): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#f2c318";
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = "#1c1e22";
  ctx.lineWidth = 0;
  for (let k = 0; k < 4; k++) {
    const x = 16 + k * 60;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x + 34, 48);
    ctx.lineTo(x, 84);
    ctx.lineTo(x + 14, 84);
    ctx.lineTo(x + 48, 48);
    ctx.lineTo(x + 14, 12);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
});

/** A soft radial glow (white core fading to transparent) — the sun's halo,
 * the moon's veil, a lightning bloom. Tint via the material's color. */
export const glowTexture = once((): THREE.CanvasTexture => {
  const { canvas, ctx } = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
});

/** A tire-smoke puff, chunky rather than misty: three steps of a lumpy blob
 * on a tiny canvas, nearest-filtered so its edge is made of visible pixels.
 * A bare point sprite is a screen-aligned SQUARE, and a square big enough to
 * read as smoke reads as a rectangle stuck to the lens instead — this is
 * what a particle has to wear to be allowed to be big. */
export const puffTexture = once((): THREE.CanvasTexture => {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  // Each ring is a cluster of overlapping discs rather than one circle, so
  // the silhouette comes out lumpy the way a puff is.
  const rings: { alpha: number; blobs: [number, number, number][] }[] = [
    {
      alpha: 0.3,
      blobs: [
        [7.5, 7.5, 7],
        [10, 6, 5],
        [5.5, 10, 4.6],
      ],
    },
    {
      alpha: 0.55,
      blobs: [
        [7, 7.5, 4.6],
        [10, 6.5, 3.2],
        [6, 10, 3],
      ],
    },
    {
      alpha: 1,
      blobs: [
        [7.5, 7.5, 2.6],
        [9.5, 6.5, 1.8],
      ],
    },
  ];
  for (const ring of rings) {
    ctx.fillStyle = `rgba(255,255,255,${ring.alpha})`;
    for (const [cx, cy, r] of ring.blobs) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
});

/** THE BILLOW — the mask a puff wears when it is allowed to be METRES
 * across rather than centimetres, which is what separates a dust cloud
 * from a tire's little cough of smoke.
 *
 * The small puff's three concentric rings cannot be scaled up to this: a
 * blob whose alpha climbs evenly toward its middle is a RADIAL GRADIENT,
 * and at two metres across that reads as a lens smudge rather than as
 * matter. What a real puff has is LUMPS — an outline that bulges the wrong
 * way, and a bright shoulder off to one side where the light catches the
 * top of it — so this one is built as a cauliflower instead: an irregular
 * rim, then four clusters that walk OFF the centre as they brighten. Every
 * puff is drawn at its own angle, so the same lump lands somewhere
 * different each time and a hundred of them never repeat.
 *
 * Twenty-four pixels and nearest-filtered, like everything else here: at
 * the sizes this is drawn the mask's own pixels are visible, and they are
 * meant to be. This is a chunkier cloud, not a softer one. */
export const billowTexture = once((): THREE.CanvasTexture => {
  const size = 24;
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const mid = size / 2;
  /** Each cluster is `[alpha, [x, y, r]…]`, in fractions of the half-width
   * from the middle. Painted rim-first, so a later cluster covers what is
   * under it and the alpha climbs in visible steps rather than a ramp. */
  const clusters: [number, [number, number, number][]][] = [
    // The rim: barely there, and made of lobes ONLY — no disc under them.
    // A big circle at the bottom of the stack is what turns a puff back
    // into a smudge however lumpy the layers above it are.
    [
      0.22,
      [
        [0.28, -0.18, 0.55],
        [-0.3, 0.12, 0.5],
        [0.1, 0.34, 0.48],
        [-0.22, -0.36, 0.44],
        [0.4, 0.22, 0.4],
        [-0.44, -0.02, 0.36],
      ],
    ],
    // The body, shouldered up and to one side.
    [
      0.46,
      [
        [0.12, -0.12, 0.42],
        [-0.18, 0.16, 0.34],
        [0.3, 0.18, 0.28],
      ],
    ],
    // The lit shoulder — off centre on purpose, so the puff has a TOP.
    [
      0.72,
      [
        [0.14, -0.2, 0.3],
        [-0.08, 0.02, 0.22],
      ],
    ],
    // …and the core it falls away from.
    [1, [[0.18, -0.26, 0.16]]],
  ];
  for (const [alpha, lobes] of clusters) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [dx, dy, r] of lobes) {
      ctx.beginPath();
      ctx.arc(mid + dx * mid, mid + dy * mid, r * mid, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
});
