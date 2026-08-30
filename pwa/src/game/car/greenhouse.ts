// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cabin: a solid body-colored shell with the windows cut into it, so
// every window is framed by metal — A-pillar, B-pillar, C-pillar, sill and
// roof header. Without them a car reads as a glass canopy on a tub, and
// how much METAL frames the glass is most of what separates a hot-hatch
// greenhouse from a coupe one.
//
// THE GLASS IS NOT PART OF THE PANEL IT IS CUT INTO. Every window goes into
// a builder of its own, because glass is drawn translucent over the cabin
// that car/interior.ts furnishes behind it, and a translucent face cannot
// share a buffer with the opaque body around it. What the metal keeps is the
// SEAL — the rubber band around each opening is hardware, not glass.
//
// A fullbright game has no reflections, so the one a window needs is BAKED:
// every pane fades, in colour AND in opacity, from a pale sky at its header
// to a dark, clearer pane at its sill. That single gradient does the work of
// an environment map — the top of the glass reads as the sky lying in it,
// the bottom as the cabin showing through — and it costs nothing at all: it
// is the same two triangles with different vertex colours on them. The
// view-angle glint that finishes it is a per-frame number on the material
// (car-mesh.ts), not geometry.
//
// Also the small period hardware that lives up here: the rain gutters
// along the roof edges. The wipers are their own module (car/wipers.ts) —
// they move, and they need to know exactly where the glass is, which is
// why this file hands the two screens out as `screenPanes`.

import type { MeshBuilder, Patch, V3 } from "./builder.ts";
import { mixHex, patchAt, patchFade, patchQuad, patchSpan } from "./builder.ts";
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
  /** The backlight's share of the cabin's rear panel, across the car. A
   * SHARE and not the `c` post's metres, because what reads from behind is
   * the proportion of glass to bodywork rather than the width of any post
   * — and because `c` is a flank measurement: on the side of the car the
   * rear post carries the roof and has to look like it, while across the
   * back it is a strip of metal beside a window that ought to be as wide as
   * the car will allow. Sharing one number between the two gave every car a
   * letterbox with a hand's breadth of paint either side of it. */
  backWidth: 0.9,
};

/** Glass sits this far proud of the cabin metal — enough to beat depth
 * fighting, small enough to read as flush at any camera distance. The
 * rubber seal goes between the two, so it needs its own smaller lift. */
const GLASS_PROUD = 0.008;
const SEAL_PROUD = 0.004;
const SEAL_COLOR = 0x14171c;

/** The baked reflection. `SKY` is what the top of a pane carries — a cool
 * pale tone standing in for the sky lying in the glass — and `DEEP` what the
 * bottom carries, where a real window shows the dark of the cabin instead.
 * `skyMix` and `deepMix` are how far each end travels from the car's own
 * glass colour, so a car authored with green tints stays green. */
const SKY = 0xb9d4ef;
const DEEP = 0x121a24;
const GRADIENT = { skyMix: 0.5, deepMix: 0.45 };

/** Vertex alpha at the top and bottom of a pane, as multiples of whatever
 * opacity the glass material is carrying this frame. The header end is the
 * reflecting end and is the more solid; the sill end is the end you look
 * INTO the car through, and it is what the crew, the cage and the dash are
 * actually seen past. */
const GLASS_ALPHA = { top: 1.25, bottom: 0.6 };

/** The eight corners the cabin is built from, in the order the patches
 * want them: cowl pair, roof front pair, roof rear pair, tail pair. */
export type CabinFrame = {
  CL: V3;
  CR: V3;
  FL: V3;
  FR: V3;
  RL: V3;
  RR: V3;
  TL: V3;
  TR: V3;
};

/** The cabin's eight corners — handed out so car/interior.ts can line the
 * inside of exactly the shell this file draws the outside of, rather than
 * re-deriving the same numbers and drifting away from them. */
export function cabinFrame(spec: CarBodySpec): CabinFrame {
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

/** A sub-rectangle of a patch, in patch (u, v). */
export type Rect = { u0: number; u1: number; v0: number; v1: number };

/** One panel of the cabin shell and the windows cut in it. The openings are
 * disjoint along u and given in order, which is what lets a panel be turned
 * into strips of metal by a single walk (`panelMinus`).
 *
 * The panels are handed out rather than kept private because the cabin has
 * TWO faces now. This file draws the outside of them; car/interior.ts draws
 * the inside, inset and wound the other way, and it has to cut the same
 * holes in the same places — two derivations of one pillar layout drift the
 * first time anybody touches a spec. */
export type CabinPanel = {
  patch: Patch;
  span: { u: number; v: number };
  holes: Rect[];
  /** Whether this panel is the x-mirror of one built on the car's right —
   * the flag `patchQuad` needs to keep its winding and its lift straight. */
  mirrored: boolean;
};

/** The strips of metal a panel is left with once its windows are cut out. */
export function panelMinus(holes: Rect[]): Rect[] {
  const out: Rect[] = [];
  let u = 0;
  for (const hole of holes) {
    out.push({ u0: u, u1: hole.u0, v0: 0, v1: 1 });
    out.push({ u0: hole.u0, u1: hole.u1, v0: 0, v1: hole.v0 });
    out.push({ u0: hole.u0, u1: hole.u1, v0: hole.v1, v1: 1 });
    u = hole.u1;
  }
  out.push({ u0: u, u1: 1, v0: 0, v1: 1 });
  return out;
}

/** The band between an opening and the pane inside it — the rubber seal, as
 * four strips rather than as a filled rectangle. Filled, it is an opaque
 * panel sitting directly behind every window, which is invisible while the
 * glass is opaque and is the entire cabin while it is not. */
function frameOf(outer: Rect, inner: Rect): Rect[] {
  return [
    { u0: outer.u0, u1: outer.u1, v0: outer.v0, v1: inner.v0 },
    { u0: outer.u0, u1: outer.u1, v0: inner.v1, v1: outer.v1 },
    { u0: outer.u0, u1: inner.u0, v0: inner.v0, v1: inner.v1 },
    { u0: inner.u1, u1: outer.u1, v0: inner.v0, v1: inner.v1 },
  ];
}

/** The opening the GLASS fills, once the seal band has taken its share of
 * the pillar-to-pillar opening. */
function glassRect(rect: Rect, seal: number, span: { u: number; v: number }): Rect {
  return {
    u0: rect.u0 + seal / span.u,
    u1: rect.u1 - seal / span.u,
    v0: rect.v0 + seal / span.v,
    v1: rect.v1 - seal / span.v,
  };
}

/** One screen's glass: the panel it is cut into, and where in that panel
 * the pane actually sits. This is the surface the wipers sweep and the
 * grime settles on, so it is stated once here rather than guessed at by
 * anything that has to land something on the glass. */
export type ScreenPane = {
  patch: Patch;
  rect: Rect;
  span: { u: number; v: number };
  /** True on the car's left flank, whose patch is the x-mirror of the
   * right's. Its diagonals hand back a normal pointing INTO the cabin (see
   * `patchNormal`), so anything laid proud of this pane has to negate its
   * lift the way `patchQuad` does, or it is laid inside the car. */
  mirrored: boolean;
};

/** How far proud of the panel a screen's glass sits — what anything laid
 * ON the glass has to clear. */
export const GLASS_LIFT = GLASS_PROUD;

/** Every panel of the cabin, in build order: windscreen, backlight, then the
 * two flanks. The roof is not here — it has no windows in it, so it is not a
 * panel anything has to cut holes in. */
export function cabinPanels(spec: CarBodySpec): CabinPanel[] {
  const p = { ...PILLARS, ...spec.cabin.pillars };
  const { CL, CR, FL, FR, RL, RR, TL, TR } = cabinFrame(spec);

  // Windscreen: u across the car, v cowl → roof.
  const screen: Patch = [CL, CR, FR, FL];
  const sSpan = patchSpan(screen);
  // Backlight: u across the car, v roof → deck, so its sill and header are
  // the other way up.
  const back: Patch = [RL, RR, TR, TL];
  const bSpan = patchSpan(back);

  const panels: CabinPanel[] = [
    {
      patch: screen,
      span: sSpan,
      mirrored: false,
      holes: [
        {
          u0: p.a / sSpan.u,
          u1: 1 - p.a / sSpan.u,
          v0: p.sill / sSpan.v,
          v1: 1 - p.header / sSpan.v,
        },
      ],
    },
    {
      patch: back,
      span: bSpan,
      mirrored: false,
      holes: [
        {
          u0: (1 - p.backWidth) / 2,
          u1: 1 - (1 - p.backWidth) / 2,
          v0: p.header / bSpan.v,
          v1: 1 - p.sill / bSpan.v,
        },
      ],
    },
  ];

  // Flanks: u cowl → tail, v sill → roof. The door glass and the rear
  // quarter glass are two openings with the B-pillar of metal between.
  for (const side of [1, -1]) {
    const m = (q: V3): V3 => [q[0] * side, q[1], q[2]];
    const flank: Patch = [m(CR), m(TR), m(RR), m(FR)];
    const span = patchSpan(flank);
    const v0 = p.sill / span.v;
    const v1 = 1 - p.header / span.v;
    const half = p.b / 2 / span.u;
    panels.push({
      patch: flank,
      span,
      mirrored: side < 0,
      holes: [
        { u0: p.a / span.u, u1: p.split - half, v0, v1 },
        {
          u0: p.split + half,
          u1: 1 - p.c / span.u,
          v0: v0 + p.quarterRise / span.v,
          v1,
        },
      ],
    });
  }
  return panels;
}

/** Every pane of glass in the cabin: the two SCREENS, which have arms, and
 * the flanks' windows, which never do. The side glass is handed out for the
 * same reason the screens are — it gets filthy over a stage (car/wipers.ts)
 * — and one opening at a time, because a door window and the quarter light
 * behind it are two separate pieces of glass with a pillar between them. */
export function screenPanes(spec: CarBodySpec): {
  front: ScreenPane;
  rear: ScreenPane;
  sides: ScreenPane[];
} {
  const seal = spec.cabin.seal ?? 0;
  const [front, rear, ...flanks] = cabinPanels(spec);
  const pane = (panel: CabinPanel, hole: number): ScreenPane => ({
    patch: panel.patch,
    span: panel.span,
    rect: glassRect(panel.holes[hole], seal, panel.span),
    mirrored: panel.mirrored,
  });
  const sides: ScreenPane[] = [];
  for (const flank of flanks) {
    for (let hole = 0; hole < flank.holes.length; hole++) sides.push(pane(flank, hole));
  }
  return { front: pane(front, 0), rear: pane(rear, 0), sides };
}

/** The heights the baked reflection is struck between: the cabin's own sill
 * and its roof. One range for the whole car, not one per pane — a gradient
 * renormalised into every opening puts a bright band at the top of a short
 * quarter light and a dark one beside it at the same height on the door
 * glass, and the greenhouse stops reading as one run of glass. */
type Gradient = { lo: number; hi: number };

/** The body's cabin panels into `b`, every window into `g`. Two builders
 * because the glass is drawn translucent and the metal is not. */
export function buildGreenhouse(b: MeshBuilder, g: MeshBuilder, spec: CarBodySpec): void {
  const glass = spec.colors.glass ?? 0x1b2430;
  const roofColor = spec.cabin.roofPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const pillar = spec.cabin.pillarPaint === "accent" ? spec.colors.accent : spec.colors.paint;
  const seal = spec.cabin.seal ?? 0;
  const { CL, FL, FR, RL, RR, TL } = cabinFrame(spec);
  const grade: Gradient = { lo: Math.min(CL[1], TL[1]), hi: spec.cabin.roofY };
  const top = mixHex(glass, SKY, GRADIENT.skyMix);
  const bottom = mixHex(glass, DEEP, GRADIENT.deepMix);

  for (const panel of cabinPanels(spec)) {
    const { patch, span, holes, mirrored } = panel;
    for (const strip of panelMinus(holes)) {
      patchQuad(b, patch, strip, pillar, 0, mirrored);
    }
    for (const hole of holes) {
      const pane = glassRect(hole, seal, span);
      if (seal > 0) {
        for (const band of frameOf(hole, pane)) {
          patchQuad(b, patch, band, SEAL_COLOR, SEAL_PROUD, mirrored);
        }
      }
      // Against HEIGHT, not against v: the windscreen's v runs cowl → roof
      // and the backlight's runs roof → deck, so a gradient laid along v
      // would hang the sky at the bottom of the rear screen.
      const uMid = (pane.u0 + pane.u1) / 2;
      const share = (v: number): number => {
        const y = patchAt(patch, uMid, v)[1];
        return Math.max(0, Math.min(1, (y - grade.lo) / (grade.hi - grade.lo || 1)));
      };
      const t0 = share(pane.v0);
      const t1 = share(pane.v1);
      const fade = (t: number): number =>
        GLASS_ALPHA.bottom + (GLASS_ALPHA.top - GLASS_ALPHA.bottom) * t;
      patchFade(
        g,
        patch,
        pane,
        mixHex(bottom, top, t0),
        mixHex(bottom, top, t1),
        fade(t0),
        fade(t1),
        GLASS_PROUD,
        mirrored,
      );
    }
  }

  patchQuad(b, [FL, FR, RR, RL], { u0: 0, u1: 1, v0: 0, v1: 1 }, roofColor);
  buildGutters(b, spec);
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
