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

/** A near-white speckle that multiplies vertex colors: pure grain, no hue.
 * The ground and every flora instance share it, so grass, bedrock and
 * foliage all carry the same chunky arcade noise whatever color they are. */
export function detailTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128);
  speckle(ctx, 128, "#ffffff", [
    { color: "#e6e6e0", count: 900, min: 1, max: 3 },
    { color: "#d4d4cc", count: 450, min: 1, max: 3 },
    { color: "#c2c2ba", count: 180, min: 1, max: 2 },
    { color: "#f2f2ec", count: 500, min: 1, max: 4 },
  ]);
  return toTexture(canvas, 1);
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
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The board at a taped-off junction: black chevrons on rally yellow,
 * pointing back at the way the stage actually goes. */
export function chevronTexture(): THREE.CanvasTexture {
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
}

/** A soft radial glow (white core fading to transparent) — the sun's halo,
 * the moon's veil, a lightning bloom. Tint via the material's color. */
export function glowTexture(): THREE.CanvasTexture {
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
}
