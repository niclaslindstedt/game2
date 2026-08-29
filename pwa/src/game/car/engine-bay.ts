// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS UNDER THE BONNET. A bonnet is one of the panels an impact tears
// off (`partBreak`, car-damage.ts), and a car that loses one has to have
// something to show for it: a well cut down into the front of the body,
// with an engine and its ancillaries standing in it.
//
// The well is the point, and it is not decoration. `buildShell` lofts a
// CLOSED body, so out of the box the deck under the bonnet is an opaque
// panel at about the belt line and anything modelled beneath it is simply
// not there — the same fact car/cockpit.ts exists to work around. So the
// bonnet's footprint is cut out of the deck (`DeckOpening` in shell.ts) and
// this file closes the hole again from the inside: a floor down at
// crossmember height, an inner wing each side, and a bulkhead at each end.
// With the bonnet on, the lid covers all of it — the hole is deliberately
// INSET from the lid's own footprint by `LIP`, so the panel overlaps the
// rim on every edge and nothing shows through the shut line.
//
// Everything here lands in the SHELL's builder, so the bay is part of the
// one mesh the damage visual crumples: a front impact folds the engine back
// with the panels around it instead of leaving it standing pristine inside
// a caved-in nose.
//
// What is IN the bay is authored from the reference every driver has seen —
// the rocker cover and the round air cleaner on top of the block, the
// radiator across the nose, the battery in one corner and the fluid bottles
// in the other, the strut towers and the brace between them. Read at the
// distance a torn-off bonnet leaves, what survives is the LAYOUT and the
// contrast: a pale alloy cover and a couple of white bottles in a dark
// hole. Everything is authored for that read first.

import * as THREE from "three";

import { clamp } from "../../lib/util.ts";
import { MeshBuilder, plate, solid, tube, type V3 } from "./builder.ts";
import type { InteriorDetail } from "./interior.ts";
import { disc } from "./lamps.ts";
import { deckCuts, sampleProfile, shade, type DeckOpening, type Station } from "./shell.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far the hole in the deck is inset from the bonnet's own footprint,
 * m. The lid then overlaps the rim on all four edges, which is what keeps
 * the bay out of sight — and out of the 16 mm shut line — until the panel
 * is gone. */
const LIP = 0.02;
/** How deep the well is cut below the lowest point of the deck over it, m.
 * Deep enough for an engine to stand in with room over the cam cover,
 * shallow enough that the floor stays above the front subframe. */
const DEPTH = 0.34;
/** The well floor never comes closer than this to the body's underside, m. */
const FLOOR_CLEAR = 0.12;
/** …and the well is never shallower than this, however low the deck, m. */
const MIN_DEPTH = 0.2;

/** How far the paint drops on the inner wings, 0..1 of the body colour. A
 * bay painted in the wheel-well near-black reads as a hole cut in the car;
 * the paint itself, in the shade a shut bonnet keeps it in, reads as the
 * inside of the same panel that is missing. */
const WALL_SHADE = 0.45;
/** The rim around the hole, in the same tone the shut lines are drawn in. */
const RIM_SHADE = 0.3;

/** Everything in the bay that is not painted body colour. */
const HUE = {
  /** The crossmember under the engine. Lighter than the wheel wells: a
   * floor this deep in shadow stops reading as a floor and starts reading
   * as a hole straight through the car. */
  floor: 0x1d2127,
  block: 0x3b414a,
  sump: 0x25292e,
  /** Cast alloy: the rocker cover, and the one bright mass in the hole. */
  cover: 0x8e959d,
  bright: 0xb6bcc3,
  cleaner: 0x1b1e23,
  rad: 0x23272c,
  tank: 0x4d545c,
  fan: 0x14171a,
  battery: 0x1a1e24,
  hose: 0x191c20,
  /** Washer, coolant and brake-fluid bottles — the white in the picture. */
  bottle: 0xd5d3c8,
  cap: 0x2a2e34,
  /** The strut brace: a rally car's one piece of colour under the bonnet. */
  brace: 0xb04a2f,
  live: 0x8f3129,
};

/** The room the bay's furniture stands in — the hole as it was actually
 * cut, not as it was asked for. */
type Bay = {
  /** Inner-wing half-width, m. */
  half: number;
  /** Nose and cowl ends of the hole, m. */
  zNose: number;
  zTail: number;
  /** The well floor, m. */
  floorY: number;
  /** The LOWEST the deck gets over the hole, m — the ceiling everything in
   * here has to clear, or it stands through a shut bonnet. */
  deckY: number;
  /** The deck's own height at each end of the hole, m. The bulkheads are
   * built to these rather than to `deckY`: on a body whose bonnet climbs
   * toward the cowl the two differ by most of a hand, and a bulkhead built
   * short of the deck leaves a slot straight through the car. */
  noseY: number;
  tailY: number;
};

/** The hole the bonnet shuts onto, or null on a spec with no bonnet. */
export function bayOpening(spec: CarBodySpec): DeckOpening | null {
  const hood = spec.front?.hood;
  if (!hood) return null;
  return { zFrom: hood.zFrom - LIP, zTo: hood.zTo + LIP, half: hood.half - LIP };
}

/** Where the deck actually came out, given the stations the loft is built
 * from. Null when no whole band of the loft fell inside the opening — a
 * bonnet shorter than the gap between two stations leaves the deck intact,
 * and then there is no well to close. */
function bayRoom(spec: CarBodySpec, stations: Station[], opening: DeckOpening): Bay | null {
  const cuts = deckCuts(spec, stations, [opening]);
  let zNose = -Infinity;
  let zTail = Infinity;
  let deckY = Infinity;
  let noseY = 0;
  let tailY = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (!cuts[i]) continue;
    for (const st of [stations[i], stations[i + 1]]) {
      if (st.z > zNose) {
        zNose = st.z;
        noseY = st.topY;
      }
      if (st.z < zTail) {
        zTail = st.z;
        tailY = st.topY;
      }
      deckY = Math.min(deckY, st.topY);
    }
  }
  if (zNose <= zTail) return null;
  const floorY = Math.min(deckY - MIN_DEPTH, Math.max(spec.floorY + FLOOR_CLEAR, deckY - DEPTH));
  return { half: opening.half, zNose, zTail, floorY, deckY, noseY, tailY };
}

/** A closed cylinder about one axis — a bottle, a servo, an air cleaner, a
 * strut tower. Round parts come from a THREE primitive rather than being
 * hand-wound, because a hand-wound circle fails by having faces culled
 * rather than by raising anything. */
function drum(
  b: MeshBuilder,
  at: V3,
  radius: number,
  length: number,
  axis: "x" | "y" | "z",
  color: number,
  sides = 6,
): void {
  const geo = new THREE.CylinderGeometry(radius, radius, length, sides);
  if (axis === "x") geo.rotateZ(Math.PI / 2);
  else if (axis === "z") geo.rotateX(Math.PI / 2);
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}

/** One end of the well, facing INTO it: `facing` is +1 for a wall the bay
 * is behind (the cowl bulkhead) and −1 for one it is in front of. */
function endWall(
  b: MeshBuilder,
  z: number,
  half: number,
  y0: number,
  y1: number,
  color: number,
  facing: number,
): void {
  const q: V3[] = [
    [-half, y0, z],
    [half, y0, z],
    [half, y1, z],
    [-half, y1, z],
  ];
  if (facing > 0) b.quad(q[0], q[1], q[2], q[3], color);
  else b.quad(q[3], q[2], q[1], q[0], color);
}

/** The well itself: two inner wings following the deck's own line, a flat
 * floor, and a bulkhead at each end.
 *
 * Every face in here points INWARD, at the engine, which is the opposite of
 * everything the loft around it winds. A single-sided face turned the wrong
 * way is not an error, it is a surface that is not there — and "not there"
 * on the inside of a body is a hole with the landscape showing through it,
 * so the winding is derived from the facing rather than written by hand. */
function buildWell(
  b: MeshBuilder,
  stations: Station[],
  cuts: (DeckOpening | null)[],
  bay: Bay,
  wall: number,
): void {
  for (let i = 0; i < cuts.length; i++) {
    if (!cuts[i]) continue;
    const sa = stations[i];
    const sc = stations[i + 1];
    for (const side of [-1, 1]) {
      const x = side * bay.half;
      const q: V3[] = [
        [x, bay.floorY, sa.z],
        [x, sa.topY, sa.z],
        [x, sc.topY, sc.z],
        [x, bay.floorY, sc.z],
      ];
      if (side > 0) b.quad(q[0], q[1], q[2], q[3], wall);
      else b.quad(q[3], q[2], q[1], q[0], wall);
    }
  }
  plate(b, bay.half, bay.floorY, bay.zNose, bay.zTail, HUE.floor, true);
  endWall(b, bay.zNose, bay.half, bay.floorY, bay.noseY, wall, -1);
  endWall(b, bay.zTail, bay.half, bay.floorY, bay.tailY, wall, 1);
}

/** The flange the bonnet shuts onto: the strip of deck between the hole and
 * the lid's own footprint, painted in the shut-line tone. It is what the
 * flat painted bay in car/fascia.ts draws on a car with no well — the same
 * dark ring, with the hole taken out of the middle of it. */
function buildRim(
  b: MeshBuilder,
  spec: CarBodySpec,
  lid: { half: number; zFrom: number; zTo: number },
  bay: Bay,
  color: number,
): void {
  const lift = 0.004;
  const topAt = (z: number): number => sampleProfile(spec.profile, z).topY + lift;
  /** A flat strip on the deck, wound to face up: x low → high at the front
   * edge, then back along the rear one. */
  const strip = (xLow: number, xHigh: number, zFront: number, zRear: number): void => {
    if (xHigh - xLow < 1e-4 || zFront - zRear < 1e-4) return;
    const yF = topAt(zFront);
    const yR = topAt(zRear);
    b.quad([xLow, yF, zFront], [xHigh, yF, zFront], [xHigh, yR, zRear], [xLow, yR, zRear], color);
  };
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const zF = lid.zFrom + ((lid.zTo - lid.zFrom) * i) / steps;
    const zR = lid.zFrom + ((lid.zTo - lid.zFrom) * (i + 1)) / steps;
    strip(bay.half, lid.half, zF, zR);
    strip(-lid.half, -bay.half, zF, zR);
  }
  strip(-lid.half, lid.half, lid.zFrom, bay.zNose);
  strip(-lid.half, lid.half, bay.zTail, lid.zTo);
}

/** The engine and everything bolted round it. Positions are fractions of
 * the well's own box, so one layout lands on a short upright hatch and a
 * long low sedan alike; `full` adds the ancillaries a close look wants and
 * a car half a stage away cannot resolve. */
function buildEngine(b: MeshBuilder, bay: Bay, axle: number, wall: number, full: boolean): void {
  const h = bay.deckY - bay.floorY;
  const w = bay.half;
  const len = bay.zNose - bay.zTail;
  /** A height as a fraction of the well's depth, m. */
  const y = (f: number): number => bay.floorY + h * f;

  // The radiator, across the nose of the bay, with its top tank and the fan
  // behind it. The fan faces the cowl because that is the way anyone looks
  // into an open bay: forward and down, over the missing panel.
  const radZ = bay.zNose - 0.06;
  const radHalf = Math.min(w * 0.86, 0.52);
  b.box(0, y(0.5), radZ, radHalf * 2, h * 0.7, 0.05, HUE.rad);
  b.box(0, y(0.88), radZ, radHalf * 2, h * 0.14, 0.06, HUE.tank);
  disc(b, 0, y(0.5), radZ - 0.08, 0, Math.min(h * 0.42, radHalf * 0.55), HUE.fan, -1, 9);

  // The block, sat back toward the bulkhead with its sump on the floor, and
  // the alloy rocker cover and round air cleaner stacked on top of it. The
  // stack is what fixes every other height in here: nothing may reach the
  // deck, and the four courses are authored to land just under it.
  const blockZ = bay.zTail + len * 0.36;
  const blockHalf = Math.min(w * 0.54, 0.3);
  const blockLen = Math.min(len * 0.5, 0.5);
  b.box(0, y(0.08), blockZ - blockLen * 0.1, blockHalf * 1.5, h * 0.16, blockLen * 0.8, HUE.sump);
  b.box(0, y(0.27), blockZ, blockHalf * 2, h * 0.44, blockLen, HUE.block);
  b.box(0, y(0.585), blockZ, blockHalf * 1.35, h * 0.19, blockLen * 0.92, HUE.cover);
  // Small enough that the alloy shows round it: the cover is the one bright
  // mass in a dark hole, and an air cleaner sized to swallow it takes the
  // whole read of the bay with it.
  const cleanR = Math.min(w * 0.3, blockLen * 0.34, 0.16);
  drum(b, [0, y(0.755), blockZ + blockLen * 0.16], cleanR, h * 0.15, "y", HUE.cleaner, 7);

  // The battery, in the near corner where every bonnet photograph has one.
  const batHalf = Math.min((w - blockHalf) * 0.4, 0.11);
  const batX = -(w - batHalf - 0.02);
  const batZ = bay.zTail + len * 0.16;
  b.box(batX, y(0.22), batZ, batHalf * 2, h * 0.44, 0.17, HUE.battery);
  b.box(batX, y(0.46), batZ, batHalf * 1.9, h * 0.06, 0.16, HUE.cap);

  // The far corner: the brake servo against the bulkhead with its
  // reservoir on top, and the coolant bottle ahead of it.
  const sideX = w - 0.12;
  drum(b, [sideX, y(0.45), bay.zTail + len * 0.06], Math.min(h * 0.32, 0.09), 0.13, "z", HUE.cap);
  b.box(sideX, y(0.7), bay.zTail + len * 0.1, 0.1, h * 0.16, 0.09, HUE.bottle);
  drum(b, [sideX + 0.02, y(0.35), bay.zTail + len * 0.24], 0.055, h * 0.6, "y", HUE.bottle);

  // The strut towers, as near the front axle as the bay has room for —
  // pushed into the inner wings, so each reads as a bulge in the panel
  // rather than a can standing beside it. The near limit keeps them (and
  // the brace over them) clear of the air cleaner: a bar THROUGH the one
  // round thing in the bay is the first thing an eye picks out.
  const towerR = Math.min(h * 0.28, 0.095);
  const towerZ = clamp(axle, bay.zTail + len * 0.62, bay.zNose - len * 0.18);
  for (const side of [-1, 1]) {
    drum(b, [side * (w - towerR * 0.55), y(0.6), towerZ], towerR, h * 0.56, "y", wall);
  }

  if (!full) return;

  // Ribs down the cam cover, the oil filler and the radiator cap: the
  // things a close look at a torn-off bonnet goes to first.
  for (const off of [-0.4, 0, 0.4]) {
    b.box(blockHalf * off, y(0.7), blockZ, 0.02, h * 0.05, blockLen * 0.8, HUE.cover);
  }
  drum(b, [blockHalf * 0.5, y(0.72), blockZ - blockLen * 0.38], 0.032, h * 0.1, "y", HUE.bright, 5);
  drum(b, [0, y(0.85), blockZ + blockLen * 0.16], 0.022, h * 0.08, "y", HUE.bright, 5);
  drum(b, [radHalf * 0.55, y(0.95), radZ], 0.03, h * 0.09, "y", HUE.bright, 5);
  drum(b, [sideX + 0.02, y(0.66), bay.zTail + len * 0.24], 0.03, h * 0.09, "y", HUE.cap, 5);

  // Both battery terminals, and the live one in red.
  for (const [off, hue] of [
    [-0.5, HUE.live],
    [0.5, HUE.cap],
  ] as const) {
    b.box(batX + batHalf * off, y(0.51), batZ, 0.03, h * 0.05, 0.03, hue);
  }

  // The fuse box on the inner wing, between the battery and the tower.
  b.box(-(w - 0.09), y(0.55), bay.zTail + len * 0.3, 0.13, h * 0.2, 0.1, HUE.cap);

  // The hoses: top from the header tank down to the cover, bottom from the
  // radiator's corner into the block's flank.
  tube(
    b,
    [0.1, y(0.86), radZ - 0.03],
    [blockHalf * 0.5, y(0.7), blockZ + blockLen * 0.5],
    0.028,
    HUE.hose,
    5,
  );
  tube(
    b,
    [-0.14, y(0.22), radZ - 0.03],
    [-blockHalf * 0.7, y(0.2), blockZ + blockLen * 0.5],
    0.026,
    HUE.hose,
    5,
  );

  // The exhaust manifold: three runners off the block's flank gathered into
  // a collector that drops out of sight under the floor.
  const collector: V3 = [-blockHalf - 0.1, y(0.14), blockZ - blockLen * 0.1];
  for (const off of [0.28, 0, -0.28]) {
    tube(b, [-blockHalf, y(0.36), blockZ + blockLen * off], collector, 0.022, HUE.sump, 5);
  }

  // The dipstick, and the strut brace across the towers.
  const stickTop: V3 = [blockHalf * 1.1, y(0.66), blockZ - blockLen * 0.3];
  tube(b, [blockHalf * 0.9, y(0.35), blockZ - blockLen * 0.2], stickTop, 0.008, HUE.cap, 4);
  b.box(stickTop[0], stickTop[1] + 0.02, stickTop[2], 0.02, 0.03, 0.02, HUE.bright);
  const braceX = w - towerR * 0.55;
  tube(b, [braceX, y(0.9), towerZ], [-braceX, y(0.9), towerZ], 0.02, HUE.brace, 6);
}

/** Cut-and-close: the well under the bonnet, and the engine standing in it.
 * Returns whether a well was actually built — car/fascia.ts paints its flat
 * bay onto the deck only where there is none, so the two never draw over
 * each other. The caller is responsible for having passed `bayOpening`'s
 * hole to `buildShell`; without it the deck is still closed over all of
 * this and none of it can be seen. */
export function buildEngineBay(
  b: MeshBuilder,
  spec: CarBodySpec,
  stations: Station[],
  axles: number[],
  detail: InteriorDetail,
): boolean {
  const opening = bayOpening(spec);
  const hood = spec.front?.hood;
  if (!opening || !hood) return false;
  const bay = bayRoom(spec, stations, opening);
  if (!bay) return false;

  const wall = shade(spec.colors.paint, WALL_SHADE);
  buildWell(b, stations, deckCuts(spec, stations, [opening]), bay, wall);
  buildRim(b, spec, hood, bay, shade(spec.colors.paint, RIM_SHADE));
  buildEngine(b, bay, axles[0], wall, detail === "high");
  return true;
}
