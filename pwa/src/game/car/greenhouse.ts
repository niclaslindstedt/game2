// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cabin: a solid body-colored shell with the windows cut into it, so
// every window is framed by metal — A-pillar, B-pillar, C-pillar, sill and
// roof header. Without them a car reads as a glass canopy on a tub, and
// how much METAL frames the glass is most of what separates a hot-hatch
// greenhouse from a coupe one.
//
// Also the small period hardware that lives up here: the rain gutters
// along the roof edges, and the wipers parked at the base of the screen.

import type { MeshBuilder, Patch, V3 } from "./builder.ts";
import { patchQuad, patchSpan } from "./builder.ts";
import { sampleProfile, sideRatios } from "./shell.ts";
import type { CarBodySpec } from "./spec.ts";

const PILLARS = {
  a: 0.1,
  b: 0.09,
  c: 0.16,
  sill: 0.055,
  header: 0.045,
  split: 0.5,
  quarterRise: 0,
};

/** Glass sits this far proud of the cabin metal — enough to beat depth
 * fighting, small enough to read as flush at any camera distance. The
 * rubber seal goes between the two, so it needs its own smaller lift. */
const GLASS_PROUD = 0.008;
const SEAL_PROUD = 0.004;

/** The eight corners the cabin is built from, in the order the patches
 * want them: cowl pair, roof front pair, roof rear pair, tail pair. */
type CabinFrame = {
  CL: V3;
  CR: V3;
  FL: V3;
  FR: V3;
  RL: V3;
  RR: V3;
  TL: V3;
  TR: V3;
};

function cabinFrame(spec: CarBodySpec): CabinFrame {
  const { cowlZ, roofFrontZ, roofRearZ, baseRearZ, roofY, roofHalf } = spec.cabin;
  const cowl = sampleProfile(spec.profile, cowlZ);
  const tail = sampleProfile(spec.profile, baseRearZ);
  // The cabin sits just inside the body's top edge so the shoulder reads
  // as a sill under the windows.
  const shoulder = sideRatios(spec).shoulder;
  const xc = cowl.half * shoulder * 0.94;
  const xt = tail.half * shoulder * 0.94;
  return {
    CL: [-xc, cowl.topY, cowlZ],
    CR: [xc, cowl.topY, cowlZ],
    FL: [-roofHalf, roofY, roofFrontZ],
    FR: [roofHalf, roofY, roofFrontZ],
    RL: [-roofHalf, roofY, roofRearZ],
    RR: [roofHalf, roofY, roofRearZ],
    TL: [-xt, tail.topY, baseRearZ],
    TR: [xt, tail.topY, baseRearZ],
  };
}

/** A window: the seal band first, then the glass inset inside it. Passing
 * seal = 0 lays the glass straight onto the panel. */
function window(
  b: MeshBuilder,
  patch: Patch,
  rect: { u0: number; u1: number; v0: number; v1: number },
  glass: number,
  seal: number,
  span: { u: number; v: number },
  mirrored = false,
): void {
  if (seal > 0) {
    patchQuad(b, patch, rect, 0x14171c, SEAL_PROUD, mirrored);
  }
  patchQuad(
    b,
    patch,
    {
      u0: rect.u0 + seal / span.u,
      u1: rect.u1 - seal / span.u,
      v0: rect.v0 + seal / span.v,
      v1: rect.v1 - seal / span.v,
    },
    glass,
    GLASS_PROUD,
    mirrored,
  );
}

export function buildGreenhouse(b: MeshBuilder, spec: CarBodySpec): void {
  const glass = spec.colors.glass ?? 0x1b2430;
  const roofColor = spec.cabin.roofPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const pillar = spec.cabin.pillarPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const p = { ...PILLARS, ...spec.cabin.pillars };
  const seal = spec.cabin.seal ?? 0;
  const { CL, CR, FL, FR, RL, RR, TL, TR } = cabinFrame(spec);
  const full = { u0: 0, u1: 1, v0: 0, v1: 1 };

  // Windscreen: u across the car, v cowl → roof.
  const screen: Patch = [CL, CR, FR, FL];
  const sSpan = patchSpan(screen);
  patchQuad(b, screen, full, pillar);
  window(
    b,
    screen,
    {
      u0: p.a / sSpan.u,
      u1: 1 - p.a / sSpan.u,
      v0: p.sill / sSpan.v,
      v1: 1 - p.header / sSpan.v,
    },
    glass,
    seal,
    sSpan,
  );

  // Backlight: u across the car, v roof → deck.
  const back: Patch = [RL, RR, TR, TL];
  const bSpan = patchSpan(back);
  patchQuad(b, back, full, pillar);
  window(
    b,
    back,
    {
      u0: p.c / bSpan.u,
      u1: 1 - p.c / bSpan.u,
      v0: p.header / bSpan.v,
      v1: 1 - p.sill / bSpan.v,
    },
    glass,
    seal,
    bSpan,
  );

  patchQuad(b, [FL, FR, RR, RL], full, roofColor);

  // Sides: u cowl → tail, v sill → roof. The door glass and the rear
  // quarter glass are two openings with the B-pillar of metal between.
  for (const side of [1, -1]) {
    const m = (q: V3): V3 => [q[0] * side, q[1], q[2]];
    const flank: Patch = [m(CR), m(TR), m(RR), m(FR)];
    const span = patchSpan(flank);
    const mirrored = side < 0;
    patchQuad(b, flank, full, pillar, 0, mirrored);

    const v0 = p.sill / span.v;
    const v1 = 1 - p.header / span.v;
    const half = p.b / 2 / span.u;
    const split = p.split;
    window(b, flank, { u0: p.a / span.u, u1: split - half, v0, v1 }, glass, seal, span, mirrored);
    window(
      b,
      flank,
      {
        u0: split + half,
        u1: 1 - p.c / span.u,
        v0: v0 + p.quarterRise / span.v,
        v1,
      },
      glass,
      seal,
      span,
      mirrored,
    );
  }

  buildGutters(b, spec);
  buildWipers(b, spec);
}

/** Rain gutters: a thin rail down each roof edge, running the length of
 * the greenhouse. On a car of this era they are the strongest horizontal
 * line on the silhouette after the belt. */
function buildGutters(b: MeshBuilder, spec: CarBodySpec): void {
  const g = spec.cabin.gutter;
  if (!g) return;
  const { roofFrontZ, roofRearZ, roofY, roofHalf } = spec.cabin;
  const color = g.color ?? spec.colors.trim ?? 0x14181f;
  const length = roofFrontZ - roofRearZ;
  for (const side of [-1, 1]) {
    b.box(
      side * (roofHalf + g.width / 2),
      roofY - g.width * 0.4,
      (roofFrontZ + roofRearZ) / 2,
      g.width,
      g.width * 0.9,
      length,
      color,
    );
  }
}

/** Wipers parked across the base of the screen — two flat blades and their
 * arms, laid on the cowl rather than the glass so they never z-fight. */
function buildWipers(b: MeshBuilder, spec: CarBodySpec): void {
  if (!spec.cabin.wipers) return;
  const cowl = sampleProfile(spec.profile, spec.cabin.cowlZ);
  const color = 0x1a1d22;
  const y = cowl.topY + 0.012;
  const z = spec.cabin.cowlZ + 0.03;
  const span = cowl.half * 0.52;
  for (const side of [-1, 1]) {
    b.box(side * span * 0.55, y, z, span * 0.85, 0.014, 0.03, color);
    b.box(side * span * 0.1, y + 0.006, z - 0.02, 0.03, 0.02, 0.06, color);
  }
}
