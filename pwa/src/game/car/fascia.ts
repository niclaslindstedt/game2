// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The front and rear clips: everything laid onto the nose and tail caps.
// A car is recognised by its face, so this is where most of a spec's
// identity lives — the grille's frame, whether the lamps are round or
// rectangular, whether the bumper is a thin chrome blade or a deep plastic
// slab, and how far the air dam hangs under it.
//
// The LAMPS themselves are built by car/lamps.ts, because they are the one
// thing on a face that is lit rather than painted and are drawn across two
// surfaces instead of one. This module places them and owns everything
// around them.
//
// The bumpers and the bonnet are built through `part`, which makes each of
// them its own mesh: the engine's damage ledger names them and the damage
// visual tears that mesh off and tumbles it down the road.

import type { DamagePart } from "@engine";

import type { MeshBuilder, V3 } from "./builder.ts";
import {
  buildHeadlights,
  buildIndicators,
  buildLampPods,
  buildTailLights,
  disc,
  type LampSurfaces,
} from "./lamps.ts";
import { flankX, sampleProfile, shade } from "./shell.ts";
import type { CarBodySpec, Grille } from "./spec.ts";

/** How far a lamp lens, a grille panel or a badge floats off the cap it is
 * laid on, m — enough to beat depth fighting at any camera distance. */
const PROUD = 0.008;

function buildGrille(b: MeshBuilder, g: Grille, z: number, paint: number): void {
  const surround = g.surround ?? 0;
  const frameColor = g.surroundColor ?? paint;
  const mouth = g.color ?? 0x101317;
  const depth = g.depth ?? 0.05;
  if (surround > 0) {
    // FOUR BARS, not a plate: a filled plate at this depth sits in front
    // of the mouth and the lamps and hides both.
    const w = g.width + surround * 2;
    b.box(0, g.y + (g.height + surround) / 2, z + PROUD, w, surround, 0.016, frameColor);
    b.box(0, g.y - (g.height + surround) / 2, z + PROUD, w, surround, 0.016, frameColor);
    for (const side of [-1, 1]) {
      b.box(
        (side * (g.width + surround)) / 2,
        g.y,
        z + PROUD,
        surround,
        g.height,
        0.016,
        frameColor,
      );
    }
  }
  // The mouth: a shallow open box, so the grille reads as a hole with
  // walls rather than a black sticker.
  const back = z - depth;
  b.quad(
    [-g.width / 2, g.y - g.height / 2, back],
    [g.width / 2, g.y - g.height / 2, back],
    [g.width / 2, g.y + g.height / 2, back],
    [-g.width / 2, g.y + g.height / 2, back],
    mouth,
  );
  for (const side of [-1, 1]) {
    const x = (side * g.width) / 2;
    const q: V3[] = [
      [x, g.y - g.height / 2, back],
      [x, g.y + g.height / 2, back],
      [x, g.y + g.height / 2, z],
      [x, g.y - g.height / 2, z],
    ];
    if (side > 0) b.quad(q[0], q[1], q[2], q[3], mouth);
    else b.quad(q[3], q[2], q[1], q[0], mouth);
  }
  for (const dir of [-1, 1]) {
    const y = g.y + (dir * g.height) / 2;
    const q: V3[] = [
      [-g.width / 2, y, back],
      [g.width / 2, y, back],
      [g.width / 2, y, z],
      [-g.width / 2, y, z],
    ];
    if (dir < 0) b.quad(q[0], q[1], q[2], q[3], mouth);
    else b.quad(q[3], q[2], q[1], q[0], mouth);
  }

  const bars = g.bars ?? 0;
  const barColor = g.barColor ?? 0x2c3138;
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    b.box(
      0,
      g.y + g.height * (0.5 - t),
      back + depth * 0.55,
      g.width * 0.94,
      (g.height / bars) * 0.42,
      0.02,
      barColor,
    );
  }
}

/** A bumper bar: a slab across the cap plus a wing down each flank, so it
 * wraps the corners the way a real one does instead of hovering as a
 * floating plank. `dir` is +1 at the nose, −1 at the tail. */
function buildBumper(
  b: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  bar: { y: number; height: number; depth: number; wrap?: number; color?: number },
  zEnd: number,
  dir: number,
  fallback: number,
): void {
  const color = bar.color ?? fallback;
  const cap = sampleProfile(spec.profile, zEnd);
  const wrap = bar.wrap ?? 0;
  const half = Math.max(cap.half * 0.98, flankX(spec, axles, zEnd, bar.y));
  b.taperBox(
    0,
    bar.y,
    zEnd + dir * (bar.depth / 2 - 0.02),
    half * 1.9,
    half * 2.02,
    bar.height,
    bar.depth,
    color,
  );
  if (wrap <= 0) return;
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const z0 = zEnd - (dir * (wrap * i)) / steps;
    const z1 = zEnd - (dir * (wrap * (i + 1))) / steps;
    const zc = (z0 + z1) / 2;
    const x = flankX(spec, axles, zc, bar.y) + 0.006;
    for (const side of [-1, 1]) {
      b.box(side * x, bar.y, zc, bar.depth * 0.5, bar.height * 0.9, Math.abs(z1 - z0), color);
    }
  }
}

export function buildFront(
  s: LampSurfaces,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  const b = s.body;
  const f = spec.front;
  if (!f) return;
  const nose = spec.profile[0];
  const z = nose.z;
  const trim = spec.colors.trim ?? 0x14181f;

  if (f.grille) buildGrille(b, f.grille, z, spec.colors.paint);
  if (f.lights) buildHeadlights(s, f.lights, z);

  if (f.indicators) {
    // Corner lamps sit in the bumper on a car of this era, so they have to
    // be laid on the BUMPER's face — on the nose cap they end up buried
    // inside it and never show at all.
    const indZ = f.bumper ? z + f.bumper.depth - 0.03 : z + PROUD * 1.6;
    buildIndicators(s, f.indicators, indZ, 1);
  }

  if (f.bumper) {
    buildBumper(part("bumperF"), spec, axles, f.bumper, z, 1, spec.colors.bumper ?? 0x23272e);
  }

  if (f.splitter) {
    // The air dam tucks UNDER the bumper rather than reaching past it:
    // its front face lands just inside the bumper's, which keeps the
    // car's longest point the bumper and the collision box honest.
    const s = f.splitter;
    b.taperBox(
      0,
      s.y,
      z + 0.06 - s.depth / 2,
      s.span * 0.9,
      s.span,
      s.height,
      s.depth,
      s.color ?? trim,
    );
  }

  if (f.lampPods) buildLampPods(s, f.lampPods, trim);

  buildPanel(b, spec, part("hood"), f.hood, "hood");
}

export function buildRear(
  s: LampSurfaces,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  const b = s.body;
  const r = spec.rear;
  if (!r) return;
  const tail = spec.profile[spec.profile.length - 1];
  const z = tail.z;
  const trim = spec.colors.trim ?? 0x14181f;

  if (r.lights) buildTailLights(s, r.lights, z);

  if (r.plate) {
    const p = r.plate;
    b.box(0, p.y, z - PROUD, p.width + 0.03, p.height + 0.03, 0.012, trim);
    b.box(0, p.y, z - PROUD * 1.8, p.width, p.height, 0.012, p.color ?? 0xd9d6cc);
  }

  if (r.bumper) {
    buildBumper(part("bumperR"), spec, axles, r.bumper, z, -1, spec.colors.bumper ?? 0x23272e);
  }

  if (r.exhaust) {
    const e = r.exhaust;
    disc(b, e.x, e.y, z - 0.02, 0, e.radius, 0x2a2f36, -1, 8);
    b.box(e.x, e.y, z + 0.12, e.radius * 1.7, e.radius * 1.7, 0.24, 0x51565e);
  }

  buildPanel(b, spec, part("hatch"), r.deck, "hatch");
}

/** A bonnet or a boot lid: a proud slab following the deck's silhouette,
 * over a dark bay painted straight onto the shell. When the panel is torn
 * off, the bay is what is left showing. */
function buildPanel(
  shell: MeshBuilder,
  spec: CarBodySpec,
  panel: MeshBuilder,
  lid: { half: number; zFrom: number; zTo: number } | undefined,
  kind: "hood" | "hatch",
): void {
  if (!lid) return;
  const steps = 6;
  const bay = shade(spec.colors.paint, 0.34);
  const paint = spec.colors.paint;
  // The skirt is the shut line: painting it in the bay tone is what makes
  // the lid read as a separate panel rather than a bulge in the deck.
  const edge = shade(spec.colors.paint, 0.5);
  const lift = 0.02;
  const zAt = (i: number): number => lid.zFrom + ((lid.zTo - lid.zFrom) * i) / steps;
  const topAt = (z: number): number => sampleProfile(spec.profile, z).topY;

  for (let i = 0; i < steps; i++) {
    const za = zAt(i);
    const zb = zAt(i + 1);
    const ya = topAt(za);
    const yb = topAt(zb);
    // The bay, on the shell: 4 mm proud so it wins the depth test against
    // the deck it is painted over.
    shell.quad(
      [-lid.half, ya + 0.004, za],
      [lid.half, ya + 0.004, za],
      [lid.half, yb + 0.004, zb],
      [-lid.half, yb + 0.004, zb],
      bay,
    );
    // The lid, above it, with a skirt down each long edge so it has real
    // thickness where the shut line runs.
    panel.quad(
      [-lid.half, ya + lift, za],
      [lid.half, ya + lift, za],
      [lid.half, yb + lift, zb],
      [-lid.half, yb + lift, zb],
      paint,
    );
    for (const side of [-1, 1]) {
      const x = side * lid.half;
      const q: V3[] = [
        [x, ya + 0.004, za],
        [x, yb + 0.004, zb],
        [x, yb + lift, zb],
        [x, ya + lift, za],
      ];
      if (side > 0) panel.quad(q[0], q[1], q[2], q[3], edge);
      else panel.quad(q[3], q[2], q[1], q[0], edge);
    }
  }
  // The cross-car ends: the shut line at the cowl, and the lip at the nose.
  for (const [i, dir] of [
    [0, kind === "hood" ? 1 : -1],
    [steps, kind === "hood" ? -1 : 1],
  ] as const) {
    const z = zAt(i);
    const y = topAt(z);
    const q: V3[] = [
      [-lid.half, y + 0.004, z],
      [lid.half, y + 0.004, z],
      [lid.half, y + lift, z],
      [-lid.half, y + lift, z],
    ];
    if (dir > 0) panel.quad(q[0], q[1], q[2], q[3], edge);
    else panel.quad(q[3], q[2], q[1], q[0], edge);
  }
}
