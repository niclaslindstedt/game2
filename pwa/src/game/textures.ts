// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Procedural textures — the "very rough" look is the look. Everything is
// speckled onto small canvases at runtime (no binary assets in the repo),
// with nearest-filtering so the grain stays chunky and arcade instead of
// smooth and photographic.

import * as THREE from "three";

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

export function gravelTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128);
  speckle(ctx, 128, "#b29268", [
    { color: "#a08258", count: 900, min: 1, max: 3 },
    { color: "#c4a67a", count: 700, min: 1, max: 3 },
    { color: "#8a6f4d", count: 350, min: 1, max: 4 },
    { color: "#d8c096", count: 150, min: 1, max: 2 },
  ]);
  return toTexture(canvas, 1);
}

export function grassTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128);
  speckle(ctx, 128, "#7cbf3f", [
    { color: "#6cae35", count: 900, min: 1, max: 4 },
    { color: "#9ad24f", count: 700, min: 1, max: 3 },
    { color: "#579027", count: 250, min: 1, max: 3 },
  ]);
  return toTexture(canvas, 64);
}

export function waterTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(64);
  speckle(ctx, 64, "#2f86e0", [
    { color: "#4fa0f0", count: 220, min: 1, max: 5 },
    { color: "#1f6ec8", count: 160, min: 1, max: 4 },
    { color: "#dff1ff", count: 60, min: 1, max: 2 },
  ]);
  return toTexture(canvas, 2);
}

export function foliageTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(64);
  speckle(ctx, 64, "#2f8f3c", [
    { color: "#1f6e2e", count: 320, min: 1, max: 4 },
    { color: "#43a84e", count: 260, min: 1, max: 3 },
  ]);
  return toTexture(canvas, 1);
}
