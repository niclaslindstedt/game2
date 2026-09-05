// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROOM THE COCKPIT IS BUILT IN — what car/cockpit.ts (the cabin) and
// car/cockpit-dials.ts (the instruments) both stand on, stated once so the
// two cannot come to different conclusions about where the floor is or
// what colour the fascia is.
//
// Positions are car-local metres, +z the nose, y from the ground, and +x
// the side the car is driven from — which is the LEFT of the frame, because
// the game's cameras look down +z (SEAT_SIDE in car/interior.ts).

import { MeshBuilder, type V3 } from "./builder.ts";
import { SEAT_SIDE, cabinOf, type Cabin } from "./interior.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far the cabin floor sits over the body's own underside, m. A real
 * footwell is a hand's depth above the road; this is that, and it is what
 * the cut-open deck (`DeckOpening`) makes room for. */
export const FLOOR_LIFT = 0.1;

/** The cockpit's own palette. It sits a clear step above car/interior.ts's:
 * that one is read through a tinted pane doing its own blending, and this
 * one is not — but the fullbright bake still takes a third off anything
 * facing away from the sun, and almost every surface in here faces the
 * driver, which is away from it. What has to survive is the LADDER: a dark
 * fascia the road reads against, a lighter pad and door card so the cabin
 * has depth, and one bright thing — the cage — that says rally car. */
export const HUE = {
  fascia: 0x22262d,
  /** The floor, a clear step under the fascia above it. */
  floor: 0x2b3037,
  /** The inner sills and bulkheads: body-side panels rather than trim, so a
   * shade between the floor and the lining above them. */
  hull: 0x343a42,
  pad: 0x33383f,
  card: 0x3d434d,
  face: 0x14171c,
  bezel: 0xb9c0cb,
  tick: 0xe6eaf0,
  needle: 0xe23b32,
  red: 0xc4353a,
  rim: 0x1d2026,
  grip: 0x33383f,
  lever: 0x22262c,
  boot: 0x1a1d22,
  metal: 0x8f97a2,
  strip: 0x2f6ba8,
  /** The cage, at arm's length. car/interior.ts paints its bars nearly white
   * because they are read through tinted glass at a car's length and have to
   * survive it; from the seat the same white is the brightest thing in the
   * frame and sits right where the corner is. Muted here — still a clear
   * step above the trim, no longer the thing the eye goes to. */
  cage: 0x99a2ae,
  /** The LEDs: the red a period readout and a shift light are, and the
   * ghost of a bar that is off, which a real display never quite hides. */
  led: 0xff4a35,
  ledOff: 0x2c1a18,
  /** The tell-tales, by what each one warns of: beams, indicators, oil,
   * charge, and a brake or a temperature that has gone. */
  beam: 0x4f9cff,
  turn: 0x3ddc6a,
  amber: 0xffb02e,
  warn: 0xff3b2f,
  /** The tripmeter's own case and the black of its two windows. */
  case: 0x1c1f24,
  window: 0x0d0f12,
} as const;

/** Everything the cockpit is laid out against, resolved once. `Cabin` gives
 * the glass tray; this adds the floor the deck cut opened up under it. */
export type Room = {
  cabin: Cabin;
  /** The cabin floor, m. */
  floorY: number;
  /** Half-width of the floor, and of the deck opening over it, m. */
  half: number;
  /** Where the driver sits, m off the centreline. */
  driverX: number;
};

export function roomOf(spec: CarBodySpec): Room {
  const cabin = cabinOf(spec);
  return {
    cabin,
    floorY: spec.floorY + FLOOR_LIFT,
    half: cabin.inner,
    driverX: cabin.inner * SEAT_SIDE,
  };
}

/** A wall in the plane x = const, and one in the plane z = const, each with
 * its normal pointed where it is asked to.
 *
 * WINDING IS THE TRAP IN THIS WHOLE COCKPIT, and it is a silent one: a
 * single-sided face wound the wrong way round is not an error, it is a
 * surface that is simply not there — and "not there" inside a car body is a
 * hole with the landscape showing through it. Every hand-wound quad in a
 * cockpit faces INWARD, at the driver, which is the opposite of everything
 * car/shell.ts and car/greenhouse.ts wind; and half of them are mirrored,
 * so the same corner order faces opposite ways on the two sides. Stating
 * the facing rather than the corner order is what stops that being a coin
 * flip. Corners are given low-to-high on both axes; `facing` is the sign of
 * the axis the normal points along. */
export function wallX(
  b: MeshBuilder,
  x: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: number,
  facing: number,
): void {
  const p: V3[] = [
    [x, y0, z0],
    [x, y0, z1],
    [x, y1, z1],
    [x, y1, z0],
  ];
  if (facing < 0) b.quad(p[0], p[1], p[2], p[3], color);
  else b.quad(p[3], p[2], p[1], p[0], color);
}

export function wallZ(
  b: MeshBuilder,
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  color: number,
  facing: number,
): void {
  const p: V3[] = [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  if (facing > 0) b.quad(p[0], p[1], p[2], p[3], color);
  else b.quad(p[3], p[2], p[1], p[0], color);
}
