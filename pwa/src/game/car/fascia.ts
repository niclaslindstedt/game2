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
import { flankX, paintAt, sampleProfile, shade, sideBand } from "./shell.ts";
import type { Bumper, CarBodySpec, Grille, HoodVents, Tailgate } from "./spec.ts";

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
  bar: Bumper,
  zEnd: number,
  dir: number,
  fallback: number,
): void {
  const color = bar.color ?? fallback;
  const cap = sampleProfile(spec.profile, zEnd);
  const wrap = bar.wrap ?? 0;
  const flank = Math.max(cap.half * 0.98, flankX(spec, axles, zEnd, bar.y));
  const half = bar.width ? bar.width / 2.02 : flank;
  // How far the bar stands out past the flank at the cap, run back to
  // nothing over the wraps.
  const flare = Math.max(0, half - flank);
  const face = zEnd + dir * (bar.depth - 0.02);
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
  // The rubbing strip: a band a few millimetres proud of the face, and of
  // each wrap below, in the dark tone that reads as the rubber it is.
  const strip = bar.strip;
  const stripColor = strip?.color ?? spec.colors.trim ?? 0x14181f;
  if (strip)
    b.box(0, strip.y, face + dir * PROUD * 0.5, half * 1.86, strip.height, PROUD, stripColor);
  if (wrap <= 0) return;
  // The wraps: a wedge down each flank, buried in the bodywork on its inner
  // side and tapering from the bar's own corner back to a lip on the
  // flank. Tapered boxes, so a bar that stands wide of the cap runs back
  // into the wing as one surface rather than as a stair of plates.
  //
  // taperBox is SYMMETRIC about its centre, so a step lands BOTH of its
  // faces where they were meant to go only if the centre is the one plane
  // they share — the buried inner one. Centred on the cap end's own midline
  // instead, the far end's outer face comes out half way back to the body,
  // and the wing saws through the paint as a row of teeth.
  const zs = wrapStations(spec, axles, zEnd, zEnd - dir * wrap);
  const outer = (z: number): number =>
    flankX(spec, axles, z, bar.y) + 0.006 + flare * (1 - Math.abs(z - zEnd) / wrap);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i];
    const z1 = zs[i + 1];
    const o0 = outer(z0);
    const o1 = outer(z1);
    // The shared centre: a hand inside the flank, and never outside the
    // faces it has to reach, or the step would come out inside out.
    const mid = Math.min(
      flankX(spec, axles, z0, bar.y) - 0.05,
      flankX(spec, axles, z1, bar.y) - 0.05,
      o0,
      o1,
    );
    // taperBox names its widths by the +z face and the −z face; which end
    // of this step is nearer the cap depends on the end of the car.
    const [wPlus, wMinus] = dir > 0 ? [o0, o1] : [o1, o0];
    for (const side of [-1, 1]) {
      b.taperBox(
        side * mid,
        bar.y,
        (z0 + z1) / 2,
        (wPlus - mid) * 2,
        (wMinus - mid) * 2,
        bar.height * 0.9,
        Math.abs(z1 - z0),
        color,
      );
      // The strip rides the same centre a hair further out, so it stands
      // proud of the wrap all the way round instead of sinking into it.
      if (strip)
        b.taperBox(
          side * mid,
          strip.y,
          (z0 + z1) / 2,
          (wPlus + PROUD - mid) * 2,
          (wMinus + PROUD - mid) * 2,
          strip.height,
          Math.abs(z1 - z0),
          stripColor,
        );
    }
  }
}

/** Where a wrap has to be sampled along z. A wrap is a chain of straight
 * steps laid on a flank that is not straight, so a step spanning a fold
 * cuts its chord UNDER the bodywork and the wing comes through the bumper.
 * The stations are a short ladder plus every fold the flank has inside the
 * span: the profile's own, the flare's ramps, and the wheel arch — whose
 * leading edge is a STEP in `archAt` and whose curve is steepest just
 * inside it. */
function wrapStations(spec: CarBodySpec, axles: number[], zEnd: number, zTo: number): number[] {
  const lo = Math.min(zEnd, zTo);
  const hi = Math.max(zEnd, zTo);
  const zs = new Set<number>([zEnd, zTo]);
  const ladder = 4;
  for (let i = 1; i < ladder; i++) zs.add(lo + ((hi - lo) * i) / ladder);
  const folds: number[] = spec.profile.map((p) => p.z);
  if (spec.flare) {
    const h = spec.flare.length / 2;
    for (const axle of axles) folds.push(axle + h, axle + h * 0.9, axle - h * 0.9, axle - h);
  }
  if (spec.arches) {
    const r = spec.arches.radius;
    for (const axle of axles) for (const f of [1, 0.9, 0.6]) folds.push(axle + r * f, axle - r * f);
  }
  for (const z of folds) if (z > lo && z < hi) zs.add(z);
  const out = [...zs].sort((a, b) => a - b);
  return zEnd > zTo ? out.reverse() : out;
}

/** The bonnet's vents: a dark let-in plate each, with the louvre bars
 * across it in the paint. They ride the deck at the LID's own lift, so
 * they sit on the bonnet rather than under it, and they go onto the
 * bonnet's builder so an impact that takes the panel takes them with it. */
function buildVents(hood: MeshBuilder, spec: CarBodySpec, vents: HoodVents): void {
  const dark = vents.color ?? 0x14171c;
  const paint = spec.colors.paint;
  // buildPanel lifts the lid this far off the deck; the plate sits on it.
  const lift = 0.02 + PROUD * 0.5;
  const z0 = vents.z + vents.length / 2;
  const z1 = vents.z - vents.length / 2;
  const y0 = sampleProfile(spec.profile, z0).topY + lift;
  const y1 = sampleProfile(spec.profile, z1).topY + lift;
  for (const x of vents.offsets) {
    const w = vents.width / 2;
    hood.quad([x - w, y0, z0], [x + w, y0, z0], [x + w, y1, z1], [x - w, y1, z1], dark);
    // Three louvres, the plate's own length, standing a hair over it.
    const bars = 3;
    for (let i = 0; i < bars; i++) {
      const t = (i + 0.5) / bars;
      const z = z0 + (z1 - z0) * t;
      const y = y0 + (y1 - y0) * t + 0.004;
      hood.box(x, y, z, vents.width * 0.9, 0.006, (vents.length / bars) * 0.3, paint);
    }
  }
}

export function buildFront(
  s: LampSurfaces,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
  options: { engineBay?: boolean } = {},
): void {
  const b = s.body;
  const f = spec.front;
  if (!f) return;
  const nose = spec.profile[0];
  const z = nose.z;
  const trim = spec.colors.trim ?? 0x14181f;

  if (f.grille) buildGrille(b, f.grille, z, spec.colors.paint);
  if (f.lights) {
    buildHeadlights(s, f.lights, z);
    const l = f.lights;
    if (l.kind === "rect" && l.wrap) {
      // The lens carrying on round the corner: two bands on the flank, the
      // housing under the glass, both sampled along the nose's taper so
      // they hug the fender instead of standing off its narrowing end.
      const h = l.height ?? l.size * 0.55;
      const bar = l.bezel ?? 0.012;
      const lens = l.color ?? 0xf7f2dc;
      // The trailing third of the wrap is the repeater, in its own colour
      // when the spec gives one; the rest is the headlamp's own glass.
      const split = l.wrapColor === undefined ? z - l.wrap : z - l.wrap * 0.62;
      const housing = { zFrom: z, zTo: z - l.wrap - bar, yFrom: l.y - h - bar, yTo: l.y + h + bar };
      sideBand(b, spec, axles, { ...housing, proud: 0.004 }, l.bezelColor ?? 0xb9bec6);
      sideBand(
        s.lens,
        spec,
        axles,
        { zFrom: z, zTo: split, yFrom: l.y - h, yTo: l.y + h, proud: 0.009 },
        lens,
      );
      if (l.wrapColor !== undefined) {
        const tail = { zFrom: split, zTo: z - l.wrap, yFrom: l.y - h, yTo: l.y + h, proud: 0.009 };
        sideBand(s.lens, spec, axles, tail, l.wrapColor);
      }
    }
  }

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

  for (const row of f.lampPods ? [f.lampPods].flat() : []) buildLampPods(s, row, trim);

  // A car with a real engine bay under the bonnet has the deck cut away
  // there, and car/engine-bay.ts paints the flange around the hole — so the
  // flat bay below would be a lid drawn straight over the well.
  buildPanel(b, spec, part("hood"), f.hood, "hood", !options.engineBay);
  if (f.vents) buildVents(part("hood"), spec, f.vents);
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

  if (r.bumper) {
    buildBumper(part("bumperR"), spec, axles, r.bumper, z, -1, spec.colors.bumper ?? 0x23272e);
  }

  if (r.valance) {
    // The step under the bumper. Like the nose's air dam it tucks INSIDE
    // the bumper's face, so the bumper stays the car's longest point and
    // the collision box keeps telling the truth.
    const v = r.valance;
    b.taperBox(
      0,
      v.y,
      z - 0.06 + v.depth / 2,
      v.span * 0.9,
      v.span,
      v.height,
      v.depth,
      v.color ?? trim,
    );
  }

  if (r.lamps) {
    // Reverse and fog, let into whatever is lowest at the back — the
    // valance if there is one, the bumper otherwise. Laid on the cap they
    // would be buried inside it, exactly as the nose's indicators are.
    const face = r.valance
      ? z - r.valance.depth + 0.09
      : r.bumper
        ? z - r.bumper.depth + 0.03
        : z - PROUD * 1.6;
    buildIndicators(s, r.lamps, face, -1);
  }

  if (r.exhaust) {
    const e = r.exhaust;
    disc(b, e.x, e.y, z - 0.02, 0, e.radius, 0x2a2f36, -1, 8);
    b.box(e.x, e.y, z + 0.12, e.radius * 1.7, e.radius * 1.7, 0.24, 0x51565e);
  }

  if (r.tailgate) buildTailgate(b, part("hatch"), spec, axles, r.tailgate, z);

  if (r.plate) {
    // Last, and clear of the tailgate's face: the plate hangs on the panel,
    // so a panel that stands 16 mm proud of the cap would otherwise swallow
    // a plate laid on the cap itself.
    const p = r.plate;
    const off = r.tailgate ? (r.tailgate.proud ?? 0.016) : 0;
    b.box(0, p.y, z - off - PROUD, p.width + 0.03, p.height + 0.03, 0.012, trim);
    b.box(0, p.y, z - off - PROUD * 1.8, p.width, p.height, 0.012, p.color ?? 0xd9d6cc);
  }

  buildPanel(b, spec, part("hatch"), r.deck, "hatch");
}

/** The tailgate: a proud slab on the tail cap with a shut line run round
 * it, a pressed swage across it and the grab recess under that.
 *
 * Built out of BOXES rather than the quads buildPanel uses, and that is
 * deliberate twice over. A box cannot be wound inside out, which a hand
 * placed quad on a face pointing away from the nose very easily is; and the
 * back of the car is the one panel worth spending faces on, because it is
 * the panel the player looks at for the whole stage while every other one
 * is glimpsed at forty metres a second. */
function buildTailgate(
  shell: MeshBuilder,
  panel: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  gate: Tailgate,
  z: number,
): void {
  const paint = spec.colors.paint;
  const seam = gate.seam ?? 0.022;
  const proud = gate.proud ?? 0.016;
  // The shut line reads as a shadow in the gap rather than as a painted
  // outline, so it takes the same shade the panel skirts elsewhere do.
  const line = shade(paint, 0.42);
  // The panel is stacked in strips so it can FOLLOW the cap's own taper:
  // the tail narrows toward the roof, and a single slab across the whole
  // opening either stands proud of the corners at the top or falls short of
  // them at the bottom.
  const steps = 6;
  const halfAt = (y: number): number => Math.max(0.06, flankX(spec, axles, z, y) - gate.inset);
  const yAt = (i: number): number => gate.yFrom + ((gate.yTo - gate.yFrom) * i) / steps;

  for (let i = 0; i < steps; i++) {
    const y0 = yAt(i);
    const y1 = yAt(i + 1);
    const yc = (y0 + y1) / 2;
    const h = y1 - y0;
    const half = halfAt(yc);
    // The groove first, wider and barely off the cap, then the panel over
    // it: what is left showing round the edge IS the shut line.
    shell.box(
      0,
      yc,
      z - 0.005,
      (half + seam) * 2,
      h + (i === 0 || i === steps - 1 ? seam : 0),
      0.01,
      line,
    );
    shell.box(0, yc, z - proud / 2, half * 2, h, proud, paint);
  }

  if (gate.rib) {
    const rib = gate.rib;
    const half = halfAt(rib.y) - (rib.inset ?? 0.05);
    shell.box(
      0,
      rib.y,
      z - proud - (rib.proud ?? 0.014) / 2,
      half * 2,
      rib.height,
      rib.proud ?? 0.014,
      // A swage catches the light rather than being painted, and this body
      // carries its shading baked in with nothing to catch — so the crease
      // is drawn as the shadow it would throw, or it is not drawn at all.
      rib.color ?? shade(paint, 0.82),
    );
  }

  if (gate.handle) {
    // A recess, so it is let INTO the panel: drawn just proud of the panel
    // face in the shadow tone, which is what a hollow reads as on a body
    // that carries its shading baked in and has no lights to cast one.
    const g = gate.handle;
    panel.box(0, g.y, z - proud - 0.004, g.width, g.height, 0.012, g.color ?? shade(paint, 0.3));
  }
}

/** A bonnet or a boot lid: a proud slab following the deck's silhouette,
 * over a dark bay painted straight onto the shell. When the panel is torn
 * off, the bay is what is left showing — a painted one where `bay` is set,
 * and the real well car/engine-bay.ts cuts where it is not. */
function buildPanel(
  shell: MeshBuilder,
  spec: CarBodySpec,
  panel: MeshBuilder,
  lid: { half: number; zFrom: number; zTo: number } | undefined,
  kind: "hood" | "hatch",
  bayPaint = true,
): void {
  if (!lid) return;
  const steps = 6;
  // The lid wears the colour of the deck it sits in — a boot lid behind the
  // tail-paint break is painted with the tail, not with the bonnet.
  const paint = paintAt(spec, lid.zFrom);
  const bay = shade(paint, 0.34);
  // The skirt is the shut line: painting it in the bay tone is what makes
  // the lid read as a separate panel rather than a bulge in the deck.
  const edge = shade(paint, 0.5);
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
    if (bayPaint) {
      shell.quad(
        [-lid.half, ya + 0.004, za],
        [lid.half, ya + 0.004, za],
        [lid.half, yb + 0.004, zb],
        [-lid.half, yb + 0.004, zb],
        bay,
      );
    }
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
