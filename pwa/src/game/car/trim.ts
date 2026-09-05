// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hardware and the livery bolted to the finished shell: plastic arch
// extensions, mirrors on their stalks, door handles, mud flaps, hood
// stripes and the racing number on each door.
//
// All of it is generic rally dress — the specs describe shapes and colors
// only, never a real manufacturer's badge, lettering or logo.

import type { DamagePart } from "@engine";

import type { MeshBuilder, V3 } from "./builder.ts";
import { backlightY } from "./greenhouse.ts";
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
  const trim =
    typeof spec.mudflaps === "object" ? spec.mudflaps.color : (spec.colors.trim ?? 0x14181f);
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

/** The panel, if any, a stretch of deck stripe is painted ON — a stripe
 * crossing the bonnet is paint on the bonnet, not on the car, and when the
 * bonnet is torn off it has to leave with it rather than hang in the air
 * over the engine bay. A stretch belongs to a lid only if it is inside it
 * across its whole width as well as along z. */
function stripePanel(
  spec: CarBodySpec,
  z: number,
  x0: number,
  x1: number,
): "hood" | "hatch" | null {
  const lids = [
    ["hood", spec.front?.hood],
    ["hatch", spec.rear?.deck],
  ] as const;
  for (const [name, lid] of lids) {
    if (!lid) continue;
    const lo = Math.min(lid.zFrom, lid.zTo);
    const hi = Math.max(lid.zFrom, lid.zTo);
    if (z >= lo && z <= hi && x0 >= -lid.half && x1 <= lid.half) return name;
  }
  return null;
}

/** Livery stripes hug the hood/deck by sampling the silhouette. A spec may
 * carry several groups — hood stripes and a boot-lid block are the same
 * vocabulary run twice. */
function buildStripes(
  b: MeshBuilder,
  spec: CarBodySpec,
  part: (name: DamagePart) => MeshBuilder,
): void {
  if (!spec.stripes) return;
  const groups = Array.isArray(spec.stripes) ? spec.stripes : [spec.stripes];
  const steps = 8;
  groups.forEach((st, gi) => {
    const color = st.color ?? spec.colors.accent;
    // Each group is laid a hair above the last. Two groups on one plane —
    // an edging line down a painted bonnet panel — z-fight into a stipple
    // that flickers with the camera.
    const lift = 0.03 + gi * 0.004;
    for (const off of st.offsets) {
      const w = st.width / 2;
      // The lid edges join the ladder, so a stripe that runs off the end of
      // the bonnet onto the nose cap is split exactly there instead of
      // taking a whole step onto whichever panel its midpoint fell on.
      const zs = stripeSamples(spec, st.zFrom, st.zTo, steps);
      for (let i = 0; i < zs.length - 1; i++) {
        const za = zs[i];
        const zb = zs[i + 1];
        const a = sampleProfile(spec.profile, za);
        const bb = sampleProfile(spec.profile, zb);
        const lid = stripePanel(spec, (za + zb) / 2, off - w, off + w);
        // Above the bonnet lid, which is itself 20 mm proud of the deck —
        // a stripe under it would simply disappear.
        const into = lid ? part(lid) : b;
        into.quad(
          [off - w, a.topY + lift, za],
          [off + w, a.topY + lift, za],
          [off + w, bb.topY + lift, zb],
          [off - w, bb.topY + lift, zb],
          color,
        );
      }
    }
  });
}

/** A stripe's z ladder: an even run, plus every lid edge that falls inside
 * it, sorted the way the stripe itself runs. */
function stripeSamples(spec: CarBodySpec, zFrom: number, zTo: number, steps: number): number[] {
  const lo = Math.min(zFrom, zTo);
  const hi = Math.max(zFrom, zTo);
  const zs = new Set<number>([zFrom, zTo]);
  for (let i = 1; i < steps; i++) zs.add(zFrom + ((zTo - zFrom) * i) / steps);
  for (const lid of [spec.front?.hood, spec.rear?.deck]) {
    if (!lid) continue;
    for (const edge of [lid.zFrom, lid.zTo]) if (edge > lo && edge < hi) zs.add(edge);
  }
  const out = [...zs].sort((a, b) => a - b);
  return zFrom > zTo ? out.reverse() : out;
}

/** How far off the flank the roundel's panel floats, and its digits above
 * that, m. Both sit outside the deepest livery band so a pattern drawn
 * across the door cannot bury the number. */
const PANEL_PROUD = 0.016;
const INK_PROUD = 0.024;

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
        // Clear of the livery bands, which stand up to 13 mm off the
        // flank: a roundel laid under one is a roundel with a stripe
        // through it, and the number is the one thing that has to be
        // legible whatever the car is painted.
        proud: PANEL_PROUD,
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
    ) + INK_PROUD;
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

/** A flat plate between `x0` and `x1` across the car, running from a front
 * (y, z) to a rear one — the shape a raked spoiler blade needs and an
 * axis-aligned box cannot make; narrow, it is a swept wing post. Wound so
 * every face points outward. */
function slab(
  b: MeshBuilder,
  x0: number,
  x1: number,
  front: { y: number; z: number },
  rear: { y: number; z: number },
  thick: number,
  color: number,
): void {
  const p = (side: number, dy: number, end: { y: number; z: number }): V3 => [
    side > 0 ? x1 : x0,
    end.y + (dy * thick) / 2,
    end.z,
  ];
  const ft: V3 = p(1, 1, front);
  const fb: V3 = p(1, -1, front);
  const rt: V3 = p(1, 1, rear);
  const rb: V3 = p(1, -1, rear);
  const m = (v: V3): V3 => [v[0] > x0 ? x0 : x1, v[1], v[2]];
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
    slab(
      wing,
      -sp.span / 2,
      sp.span / 2,
      { y: yFront, z: zFront },
      { y: sp.y, z: zRear },
      0.04,
      blade,
    );
  } else if (sp.kind === "gate") {
    // The tailgate wing. The blade is a thick raked plate with its trailing
    // edge lifted; each post is a narrow slab standing on the deck AHEAD of
    // the blade and sweeping up and back to its underside — swept, because
    // an upright post under a wing this deep reads as a shelf bracket. The
    // posts stand at the blade's ends, which is what makes this wing this
    // wing and not the rally one on its inboard struts.
    const thick = sp.thick ?? 0.07;
    const half = sp.span / 2;
    const zFront = sp.z + sp.chord / 2;
    const zRear = sp.z - sp.chord / 2;
    slab(
      wing,
      -half,
      half,
      { y: sp.y - 0.02, z: zFront },
      { y: sp.y + 0.02, z: zRear },
      thick,
      blade,
    );
    const postX = half * (sp.post ?? 0.8);
    // The posts stand a little ahead of the blade's centre and sweep back
    // up to it — on the BACKLIGHT where the foot lands under that pane,
    // since the deck there is the cabin's floor, and on the deck otherwise.
    const footZ = sp.z + sp.chord * 0.1;
    const foot = backlightY(spec, footZ) ?? sampleProfile(spec.profile, footZ).topY;
    const under = sp.y - thick / 2 + 0.01;
    // The post's foot is buried in the deck and its top in the blade, so
    // neither joint shows a seam at any camera distance.
    const postW = 0.05;
    for (const side of [-1, 1]) {
      const x = side * postX;
      slab(
        wing,
        x - postW / 2,
        x + postW / 2,
        { y: foot - 0.01, z: footZ + 0.04 },
        { y: under, z: sp.z - sp.chord * 0.2 },
        0.06,
        blade,
      );
    }
    if (sp.lip) {
      // The second blade: a thin plate on the tailgate's own top edge,
      // reaching back over the panel below it on a skirt of its own.
      const lip = sp.lip;
      const lipHalf = (lip.span ?? sp.span * 0.92) / 2;
      const lipFront = lip.z + lip.chord / 2;
      const lipRear = lip.z - lip.chord / 2;
      const yFront = sampleProfile(spec.profile, lipFront).topY + 0.012;
      const yRear = yFront + 0.012;
      slab(
        wing,
        -lipHalf,
        lipHalf,
        { y: yFront, z: lipFront },
        { y: yRear, z: lipRear },
        0.028,
        blade,
      );
      const deck = sampleProfile(spec.profile, lipRear).topY;
      wing.box(0, (yRear + deck) / 2, lipRear + 0.015, lipHalf * 1.96, yRear - deck, 0.03, blade);
    }
  } else {
    // A ducktail is bolted to the deck, so it gets a skirt down to it —
    // a bare bar floating above the boot reads as a mistake.
    const deck = sampleProfile(spec.profile, sp.z).topY;
    wing.box(0, sp.y, sp.z, sp.span, 0.055, 0.14, blade);
    wing.box(0, (sp.y + deck) / 2, sp.z - 0.03, sp.span * 0.96, sp.y - deck, 0.07, blade);
  }
}

/** Everything bolted to the shell once it and the greenhouse exist. */
/** THE DOORS, as things that can come off. A door is a skin laid on the
 * flank between the first two door seams, from the sill to just under the
 * belt line, and it is a breakable part of its own: a flank driven into a
 * rock hard enough to fold it most of the way to the cage takes the door
 * with it, and what is left is the cabin, open to the side. The skin sits
 * UNDER the livery bands (`DOOR_PROUD` is less than a band's default), so
 * a stripe across the door still reads as painted on the car; when the door
 * goes, the damage visual darkens everything in its rectangle — shell and
 * stripe alike — into the hole. Where a car has no seams there is no door
 * to lose: the flank stays one panel. */
export type DoorSkin = {
  part: DamagePart;
  /** The ENGINE's side: +1 is its right. */
  side: 1 | -1;
  /** The rectangle the skin covers, m — z along the car, y up it. */
  zFrom: number;
  zTo: number;
  yFrom: number;
  yTo: number;
};

const DOOR_PROUD = 0.003;
/** The sill the door skin stands on, m above the floor, and the gap it
 * leaves under the belt line. */
const DOOR_SILL = 0.12;
const DOOR_BELT_GAP = 0.015;

export function doorSkins(spec: CarBodySpec): DoorSkin[] {
  const seams = spec.doorSeams;
  if (!seams || seams.length < 2) return [];
  const zFrom = Math.max(seams[0], seams[1]);
  const zTo = Math.min(seams[0], seams[1]);
  const yFrom = spec.floorY + DOOR_SILL;
  const yTo = spec.beltY - DOOR_BELT_GAP;
  if (yTo - yFrom < 0.05 || zFrom - zTo < 0.2) return [];
  return [
    { part: "doorR", side: 1, zFrom, zTo, yFrom, yTo },
    { part: "doorL", side: -1, zFrom, zTo, yFrom, yTo },
  ];
}

function buildDoors(
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  // The two-tone is cut at the belt line, and the door lives under it.
  const color = spec.colors.lower ?? spec.colors.paint;
  for (const door of doorSkins(spec)) {
    sideBand(
      part(door.part),
      spec,
      axles,
      {
        zFrom: door.zFrom,
        zTo: door.zTo,
        yFrom: door.yFrom,
        yTo: door.yTo,
        proud: DOOR_PROUD,
        side: door.side,
        overArch: "clip",
      },
      color,
    );
  }
}

export function buildTrim(
  b: MeshBuilder,
  spec: CarBodySpec,
  axles: number[],
  part: (name: DamagePart) => MeshBuilder,
): void {
  buildArchTrim(b, spec, axles);
  buildDoors(spec, axles, part);
  for (const band of spec.sideBands ?? []) sideBand(b, spec, axles, band, band.color);
  buildStripes(b, spec, part);
  buildRaceNumber(b, spec, axles);
  buildHandles(b, spec, axles);
  buildMudflaps(b, spec, axles);
  buildMirrors(spec, axles, part);
  buildSpoiler(spec, part);
}
