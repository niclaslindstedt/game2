// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hardware and the livery bolted to the finished shell: plastic arch
// extensions, mirrors on their stalks, door handles, mud flaps, hood
// stripes and the racing number on each door.
//
// All of it is generic rally dress — the specs describe shapes and colors
// only, never a real manufacturer's badge, lettering or logo.

import type { DamagePart } from "@engine";

import type { MeshBuilder, V3 } from "./builder.ts";
import { archAt, flankX, flareAt, sampleProfile, sideBand, sideRatios } from "./shell.ts";
import type { CarBodySpec } from "./spec.ts";

/** A blocky 3x5 digit set — the register a stage-rally door number should
 * be drawn in at this poly count, and cheap: one quad per lit cell. Rows
 * run top to bottom, each bit a column left to right. */
const DIGITS: Record<string, number[]> = {
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b001, 0b010, 0b010],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
};

/** The plastic arch extension: a band that follows the opening's curve,
 * standing proud of the flank and skirting down over the tire. Only drawn
 * where the arch has actually lifted clear of the floor. */
function buildArchTrim(b: MeshBuilder, spec: CarBodySpec, axles: number[]): void {
  const arch = spec.arches;
  const trim = arch?.trim;
  if (!arch || !trim) return;
  const color = trim.color ?? spec.colors.trim ?? 0x14181f;
  const steps = 14;
  for (const axle of axles) {
    for (let i = 0; i < steps; i++) {
      const za = axle - arch.radius + (2 * arch.radius * i) / steps;
      const zb = axle - arch.radius + (2 * arch.radius * (i + 1)) / steps;
      const ya = archAt(spec, axles, za);
      const yb = archAt(spec, axles, zb);
      if (ya <= spec.floorY + 0.02 || yb <= spec.floorY + 0.02) continue;
      const rocker = sideRatios(spec).rocker;
      const s = (z: number): number =>
        sampleProfile(spec.profile, z).half * rocker + flareAt(spec, axles, z) * 0.7;
      const xa = s(za);
      const xb = s(zb);
      for (const side of [-1, 1]) {
        const p = (x: number, y: number, z: number): V3 => [side * x, y, z];
        // Underside of the lip, then its outer face — two bands are enough
        // to read as a bolted-on flare at any camera distance.
        const under = [
          p(xa, ya, za),
          p(xb, yb, zb),
          p(xb + trim.width, yb, zb),
          p(xa + trim.width, ya, za),
        ];
        const outer = [
          p(xa + trim.width, ya, za),
          p(xb + trim.width, yb, zb),
          p(xb + trim.width, yb - trim.drop, zb),
          p(xa + trim.width, ya - trim.drop, za),
        ];
        if (side > 0) {
          b.quad(under[3], under[2], under[1], under[0], color);
          b.quad(outer[0], outer[1], outer[2], outer[3], color);
        } else {
          b.quad(under[0], under[1], under[2], under[3], color);
          b.quad(outer[3], outer[2], outer[1], outer[0], color);
        }
      }
    }
  }
}

/** Door mirrors: a stalk off the cowl and a housing turned slightly out,
 * so the shape reads as a mirror rather than a lump of paint. Each is its
 * own breakable — a brushed tree takes them off first. */
function buildMirrors(
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  if (spec.mirrors === false) return;
  const cowl = sampleProfile(spec.profile, spec.cabin.cowlZ);
  const z = spec.cabin.cowlZ - 0.06;
  const y = cowl.topY + 0.03;
  const x = flankX(spec, axles, z, y) + 0.02;
  for (const side of [-1, 1]) {
    const b = part(side > 0 ? "mirrorR" : "mirrorL");
    b.box(side * (x + 0.03), y, z, 0.07, 0.025, 0.03, spec.colors.trim ?? 0x14181f);
    b.box(side * (x + 0.09), y + 0.01, z - 0.01, 0.055, 0.075, 0.11, spec.colors.paint);
    // The glass, facing back down the flank.
    b.box(side * (x + 0.09), y + 0.01, z - 0.065, 0.05, 0.062, 0.01, spec.colors.glass ?? 0x7e9fc7);
  }
}

function buildHandles(b: MeshBuilder, spec: CarBodySpec, axles: number[]): void {
  const h = spec.handles;
  if (!h) return;
  const color = spec.colors.trim ?? 0x14181f;
  for (const z of h.z) {
    const x = flankX(spec, axles, z, h.y);
    for (const side of [-1, 1]) {
      b.box(side * (x + 0.014), h.y, z, 0.028, 0.035, 0.13, color);
    }
  }
}

/** Mud flaps hang off the arch's rear lip. Their top is buried in the
 * bodywork so they read as bolted on, not floating alongside it. */
function buildMudflaps(b: MeshBuilder, spec: CarBodySpec, axles: number[]): void {
  if (spec.mudflaps === false) return;
  const trim = spec.colors.trim ?? 0x14181f;
  const r = spec.arches?.radius ?? spec.wheelRadius;
  const bottom = 0.06;
  for (const axle of axles) {
    const z = axle - r - 0.03;
    const top = Math.max(spec.floorY + 0.1, archAt(spec, axles, z + 0.04) - 0.02);
    for (const side of [-1, 1]) {
      b.box(
        side * (spec.trackHalf - 0.01),
        (top + bottom) / 2,
        z,
        spec.wheelWidth * 0.95,
        top - bottom,
        0.025,
        trim,
      );
    }
  }
}

/** Livery stripes hug the hood/deck by sampling the silhouette. */
function buildStripes(b: MeshBuilder, spec: CarBodySpec): void {
  const st = spec.stripes;
  if (!st) return;
  const color = st.color ?? spec.colors.accent;
  const steps = 8;
  for (const off of st.offsets) {
    for (let i = 0; i < steps; i++) {
      const za = st.zFrom + ((st.zTo - st.zFrom) * i) / steps;
      const zb = st.zFrom + ((st.zTo - st.zFrom) * (i + 1)) / steps;
      const a = sampleProfile(spec.profile, za);
      const bb = sampleProfile(spec.profile, zb);
      const w = st.width / 2;
      // Above the bonnet lid, which is itself 20 mm proud of the deck —
      // a stripe under it would simply disappear.
      b.quad(
        [off - w, a.topY + 0.03, za],
        [off + w, a.topY + 0.03, za],
        [off + w, bb.topY + 0.03, zb],
        [off - w, bb.topY + 0.03, zb],
        color,
      );
    }
  }
}

/** The door number: an optional panel, then the digits laid on the flank
 * cell by cell. Mirrored per side so it reads the right way round from
 * both — a number that runs backwards on one flank is the first thing an
 * eye catches. */
function buildRaceNumber(b: MeshBuilder, spec: CarBodySpec, axles: number[]): void {
  const n = spec.raceNumber;
  if (!n) return;
  const cell = n.size / 5;
  const gap = cell * 0.25;
  const glyphW = cell * 3;
  const text = [...n.text].filter((c) => DIGITS[c] !== undefined);
  if (text.length === 0) return;
  const total = text.length * glyphW + (text.length - 1) * gap;

  if (n.panel) {
    sideBand(
      b,
      spec,
      axles,
      {
        zFrom: n.z + n.panel.width / 2,
        zTo: n.z - n.panel.width / 2,
        yFrom: n.y - n.panel.height / 2,
        yTo: n.y + n.panel.height / 2,
        proud: 0.008,
      },
      n.panel.color ?? spec.colors.accent,
    );
  }

  const ink = n.color ?? 0x16181c;
  // ONE plane for the whole number. Sampling the flank per cell puts
  // neighbouring cells at slightly different depths and the glyph shows
  // hairline splits between its rows at a grazing angle.
  const plane =
    Math.max(
      flankX(spec, axles, n.z, n.y),
      flankX(spec, axles, n.z + total / 2, n.y),
      flankX(spec, axles, n.z - total / 2, n.y),
    ) + 0.016;
  for (const side of [-1, 1]) {
    // Reading direction along z. Seen from outside the RIGHT flank the
    // nose is to the left, so text advances toward the tail; from the left
    // flank it advances toward the nose. Both then read nose-first, and a
    // number that runs backwards on one side is the first thing an eye
    // catches.
    const dir = side > 0 ? -1 : 1;
    const zStart = n.z - dir * (total / 2);
    text.forEach((ch, gi) => {
      const rows = DIGITS[ch];
      const z0 = zStart + dir * gi * (glyphW + gap);
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if ((rows[row] & (1 << (2 - col))) === 0) continue;
          const zc = z0 + dir * (col + 0.5) * cell;
          const yc = n.y + n.size / 2 - (row + 0.5) * cell;
          const q: V3[] = [
            [side * plane, yc - cell / 2, zc - cell / 2],
            [side * plane, yc - cell / 2, zc + cell / 2],
            [side * plane, yc + cell / 2, zc + cell / 2],
            [side * plane, yc + cell / 2, zc - cell / 2],
          ];
          if (side > 0) b.quad(q[3], q[2], q[1], q[0], ink);
          else b.quad(q[0], q[1], q[2], q[3], ink);
        }
      }
    });
  }
}

/** A flat plate spanning ±`halfSpan` across the car and running from a
 * front (y, z) to a rear one — the shape a raked spoiler blade needs and
 * an axis-aligned box cannot make. Wound so every face points outward. */
function slab(
  b: MeshBuilder,
  halfSpan: number,
  front: { y: number; z: number },
  rear: { y: number; z: number },
  thick: number,
  color: number,
): void {
  const p = (side: number, dy: number, end: { y: number; z: number }): V3 => [
    side * halfSpan,
    end.y + (dy * thick) / 2,
    end.z,
  ];
  const ft: V3 = p(1, 1, front);
  const fb: V3 = p(1, -1, front);
  const rt: V3 = p(1, 1, rear);
  const rb: V3 = p(1, -1, rear);
  const m = (v: V3): V3 => [-v[0], v[1], v[2]];
  b.quad(m(ft), ft, rt, m(rt), color); // top
  b.quad(m(rb), rb, fb, m(fb), color); // bottom
  b.quad(m(fb), fb, ft, m(ft), color); // leading edge, facing +z
  b.quad(rb, m(rb), m(rt), rt, color); // trailing edge, facing −z
  b.quad(fb, rb, rt, ft, color); // right
  b.quad(m(rb), m(fb), m(ft), m(rt), color); // left
}

function buildSpoiler(spec: CarBodySpec, part: (name: DamagePart) => MeshBuilder): void {
  const sp = spec.spoiler;
  if (!sp || sp.kind === "none") return;
  const tail = spec.profile[spec.profile.length - 1];
  const trim = spec.colors.trim ?? 0x14181f;
  const blade = sp.color ?? spec.colors.paint;
  const wing = part("spoiler");
  if (sp.kind === "wing") {
    wing.box(-sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    wing.box(sp.span * 0.32, (sp.y + tail.topY) / 2, sp.z, 0.07, sp.y - tail.topY, 0.16, trim);
    wing.box(0, sp.y, sp.z, sp.span, 0.05, sp.chord, blade);
    wing.box(-sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, blade);
    wing.box(sp.span / 2, sp.y + 0.02, sp.z, 0.03, 0.12, sp.chord + 0.06, blade);
  } else if (sp.kind === "roof") {
    // A hatchback's roof blade grows OUT of the roof's trailing edge: its
    // leading edge overlaps the roof and it runs back over the tailgate.
    // A free-floating plank behind the roof reads as a mistake however
    // well the numbers are chosen, so the front edge is taken from the
    // cabin rather than the spec.
    const zFront = spec.cabin.roofRearZ + 0.03;
    const yFront = spec.cabin.roofY + 0.004;
    const zRear = sp.z - sp.chord / 2;
    slab(wing, sp.span / 2, { y: yFront, z: zFront }, { y: sp.y, z: zRear }, 0.04, blade);
  } else {
    // A ducktail is bolted to the deck, so it gets a skirt down to it —
    // a bare bar floating above the boot reads as a mistake.
    const deck = sampleProfile(spec.profile, sp.z).topY;
    wing.box(0, sp.y, sp.z, sp.span, 0.055, 0.14, blade);
    wing.box(0, (sp.y + deck) / 2, sp.z - 0.03, sp.span * 0.96, sp.y - deck, 0.07, blade);
  }
}

/** Everything bolted to the shell once it and the greenhouse exist. */
export function buildTrim(
  b: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  buildArchTrim(b, spec, axles);
  for (const band of spec.sideBands ?? []) sideBand(b, spec, axles, band, band.color);
  buildStripes(b, spec);
  buildRaceNumber(b, spec, axles);
  buildHandles(b, spec, axles);
  buildMudflaps(b, spec, axles);
  buildMirrors(spec, axles, part);
  buildSpoiler(spec, part);
}
