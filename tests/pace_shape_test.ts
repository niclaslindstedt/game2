// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CO-DRIVER'S SIGNS — the strip's picture of the thing being called: a
// corner's plan, and a jump's elevation with its estimated flight over it.
//
// It is tested here rather than looked at because the claims it has to keep
// are geometric, and a screenshot only ever shows one corner on one stage:
//
//   * the sign is the CORNER — a hairpin's line turns through a hairpin's
//     angle and a gentle bend's through a gentle one, so the two can never
//     come out of the fitting as the same picture;
//   * it bends the way the road bends ON SCREEN, which is the mirror of the
//     way it bends in the engine's map view — get that sign wrong and every
//     call on the strip points into the corner the driver is not taking;
//   * the whole sign, head included, fits its box whatever the corner does
//     inside it, or the plate it is drawn on clips it;
//   * the road arrives from the BOTTOM, whichever way the stage points;
//   * and what of the sign is LIT as the corner is driven ends up covering
//     the whole of it — the road AND the whole head, point included, which a
//     head that merely brightened never quite managed.
//
// It also covers the one case that has no samples to walk: a note at an
// endless stage's streaming frontier, which still has to draw something.
//
// The JUMP sign is here for the same reasons and one of its own: what it has
// to keep is a relationship BETWEEN two lines — the arc has to clear the road
// it is drawn over, land back on it, and fill in the order a car flies it —
// and a picture only ever shows one lip on one stage.

import { describe, expect, it } from "vitest";
import { compileTrack, jumpArc, type Pacenote, type SegmentPlan, type Track } from "@engine";

import {
  cornerSign,
  fillJump,
  fillSign,
  jumpSign,
  type JumpSign,
  type PacePoint,
  type PaceSign,
} from "../pwa/src/game/pace-shape.ts";

/** A rig with one corner in it, plus the road either side so the note has a
 * clean entry and exit. `dir` +1 grows the heading — a LEFT call on screen. */
function rig(dir: 1 | -1, radius: number, length: number): SegmentPlan[] {
  return [
    { kind: "straight", length: 200, feature: "none" },
    { kind: "turn", length, dir, radius, severity: "medium", feature: "none" },
    { kind: "straight", length: 200, feature: "none" },
  ];
}

function only(segments: SegmentPlan[]): { sign: PaceSign; note: Pacenote } {
  const track = compileTrack(11, segments);
  expect(track.pacenotes).toHaveLength(1);
  const note = track.pacenotes[0];
  return { sign: cornerSign(track.samples, note), note };
}

/** How far the line turns from its first segment to its last, radians —
 * signed, positive toward screen-right. */
function swept(line: readonly PacePoint[]): number {
  const heading = (a: PacePoint, b: PacePoint): number => Math.atan2(b[0] - a[0], -(b[1] - a[1]));
  const first = heading(line[0], line[1]);
  const last = heading(line[line.length - 2], line[line.length - 1]);
  let turn = (last - first) % (Math.PI * 2);
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

describe("the corner the sign draws", () => {
  it("turns through the corner's own angle, so a hairpin cannot draw a sweep", () => {
    // Both corners are fitted to the same box, so the only thing telling
    // them apart is the shape — which is the whole point of the sign.
    const gentle = only(rig(-1, 220, 90));
    const hairpin = only(rig(-1, 16, 40));
    expect(swept(hairpin.sign.line)).toBeGreaterThan(2);
    expect(swept(hairpin.sign.line)).toBeGreaterThan(swept(gentle.sign.line) * 3);
    // The fit STYLISES the gentle one — a long thin shape pulled across the
    // box reads as the bend it is instead of as a straight with a kink — but
    // it never draws less bend than the road has, and never more than the
    // stretch cap could account for.
    expect(swept(gentle.sign.line)).toBeGreaterThan(gentle.note.angle);
    expect(swept(gentle.sign.line)).toBeLessThan(gentle.note.angle * 2.5);
  });

  it("bends the way the road bends through the windscreen, not on the map", () => {
    // The rendered world mirrors the engine's map view: a note whose dir is
    // +1 grows the heading and is a LEFT call, so its line must run toward
    // screen-LEFT (falling x, and a negative sweep).
    const left = only(rig(1, 40, 60));
    const right = only(rig(-1, 40, 60));
    expect(swept(left.sign.line)).toBeLessThan(-0.5);
    expect(swept(right.sign.line)).toBeGreaterThan(0.5);
    expect(left.sign.line[left.sign.line.length - 1][0]).toBeLessThan(left.sign.line[0][0]);
    expect(right.sign.line[right.sign.line.length - 1][0]).toBeGreaterThan(right.sign.line[0][0]);
  });

  it("arrives from the bottom of the box", () => {
    for (const dir of [1, -1] as const) {
      const { sign } = only(rig(dir, 40, 60));
      // The first point is the approach, and every corner leaves it going up
      // the box (y falls). Whichever way the stage itself is pointing.
      expect(sign.line[1][1]).toBeLessThan(sign.line[0][1]);
      expect(sign.line[0][1]).toBe(Math.max(...sign.line.map((p) => p[1])));
    }
  });

  it("puts the head on the exit, pointing the way the road leaves", () => {
    for (const dir of [1, -1] as const) {
      const { sign } = only(rig(dir, 24, 50));
      const line = sign.line;
      const [x1, y1] = line[line.length - 2];
      const [x2, y2] = line[line.length - 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      // The tip is past the end of the road, along the road's own heading.
      const along = ((sign.head[0][0] - x2) * (x2 - x1) + (sign.head[0][1] - y2) * (y2 - y1)) / len;
      expect(along).toBeGreaterThan(4);
      // ...and it is a broad head, not a dart: the base is wide enough to be
      // seen without being looked at.
      const base = Math.hypot(sign.head[1][0] - sign.head[2][0], sign.head[1][1] - sign.head[2][1]);
      expect(base).toBeGreaterThan(28);
    }
  });

  it("fits the box whatever the corner does, hairpins and sweeps alike", () => {
    const corners: SegmentPlan[][] = [
      rig(1, 16, 40),
      rig(-1, 16, 50),
      rig(1, 220, 90),
      rig(-1, 60, 300),
      // A combination: two turns the same way with no straight between them
      // merge into ONE note, and the sign has to hold the whole thing.
      [
        { kind: "straight", length: 200, feature: "none" },
        { kind: "turn", length: 60, dir: 1, radius: 45, severity: "medium", feature: "none" },
        { kind: "turn", length: 40, dir: 1, radius: 18, severity: "hard", feature: "none" },
        { kind: "straight", length: 200, feature: "none" },
      ],
    ];
    for (const segments of corners) {
      const { sign } = only(segments);
      expect(sign.line.length).toBeGreaterThan(2);
      // The line is stroked 13 wide, so it owes the edge half of that.
      for (const [x, y] of sign.line) {
        expect(Math.min(x, y)).toBeGreaterThanOrEqual(6.5);
        expect(Math.max(x, y)).toBeLessThanOrEqual(93.5);
      }
      for (const [x, y] of sign.head) {
        expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
        expect(Math.max(x, y)).toBeLessThanOrEqual(100);
      }
    }
  });

  it("still draws a corner the compiled stage does not reach yet", () => {
    // The endless stream's frontier: the note is on the book before the
    // samples that would carry it exist. The sign falls back to an ideal arc
    // of the note's own angle, and it still bends the right way.
    const track = compileTrack(11, [{ kind: "straight", length: 200, feature: "none" }]);
    const ahead: Pacenote = { s: 4000, endS: 4060, dir: 1, severity: "hard", angle: 2.2 };
    const sign = cornerSign(track.samples, ahead);
    expect(sign.line.length).toBeGreaterThan(2);
    expect(swept(sign.line)).toBeLessThan(-1.5);
  });
});

describe("the sign filling as the corner is driven", () => {
  const { sign } = only(rig(1, 60, 120));

  /** The head's own depth, base to point — the part of the fill it owns. */
  const headDepth = (s: PaceSign): number => {
    const [tip, left, right] = s.head;
    return Math.hypot(tip[0] - (left[0] + right[0]) / 2, tip[1] - (left[1] + right[1]) / 2);
  };

  it("lights nothing at the turn-in", () => {
    const lit = fillSign(sign, 0);
    expect(lit.lit).toBe(0);
    expect(lit.head).toBeNull();
  });

  it("lights the road before it reaches the head", () => {
    const lit = fillSign(sign, 0.3);
    expect(lit.lit).toBeGreaterThan(0);
    expect(lit.lit).toBeLessThan(lit.span);
    expect(lit.head).toBeNull();
  });

  // The one this exists for. The head is a third of the box across and the
  // lit road runs into the MIDDLE of it — so a sign that is "full" with a
  // part-lit head is a sign with two dim wings on the only part of it that
  // says which way the corner goes.
  it("fills the WHOLE head by the exit, point included", () => {
    const lit = fillSign(sign, 1);
    expect(lit.head).not.toBeNull();
    const filled = lit.head as PacePoint[];
    const [tip, left, right] = sign.head;
    // Every corner of the head is in the lit shape: both base corners, and
    // the point twice over, which is what the two long edges close onto.
    for (const corner of [tip, left, right]) {
      const nearest = Math.min(
        ...filled.map((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1])),
      );
      expect(nearest).toBeLessThan(1e-6);
    }
  });

  it("sweeps the head from its base to its point, never backwards", () => {
    // How far the lit shape still is from the point — Infinity while the road
    // has not reached the head at all, and closing on 0 as it sweeps.
    const toGo = (through: number): number => {
      const lit = fillSign(sign, through);
      if (!lit.head) return Infinity;
      const [tip] = sign.head;
      return Math.min(...lit.head.map((p) => Math.hypot(p[0] - tip[0], p[1] - tip[1])));
    };
    let last = Infinity;
    for (let i = 0; i <= 20; i++) {
      const now = toGo(i / 20);
      expect(now).toBeLessThanOrEqual(last);
      last = now;
    }
    expect(last).toBeCloseTo(0, 6);
  });

  it("gives the head the share of the fill its own depth is worth", () => {
    const span = fillSign(sign, 1).span;
    const depth = headDepth(sign);
    // The road runs to the head's base, so the whole mark is that road plus
    // the head's depth — and the head owns the last of it in that proportion.
    const road = fillSign(sign, 1).lit;
    const share = depth / (road + depth);
    expect(fillSign(sign, 1 - share * 1.02).head).toBeNull();
    expect(fillSign(sign, 1 - share * 0.5).head).not.toBeNull();
    expect(road).toBeGreaterThan(0);
    expect(road).toBeLessThan(span);
  });

  it("clamps either side of the corner", () => {
    expect(fillSign(sign, -1).head).toBeNull();
    expect(fillSign(sign, -1).lit).toBe(0);
    expect(fillSign(sign, 2).head).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

/** A one-lip stage whose ramp is exactly as steep as asked, with room to run
 * up to it and a long flat road past it — so nothing but the ramp decides the
 * flight, and the sign has real ground either side of the lip to draw. */
function lipStage(lipHeight: number): SegmentPlan[] {
  return [
    {
      kind: "straight",
      length: 1400,
      feature: "jump",
      featureStart: 400,
      featureEnd: 416,
      lipHeight,
    },
  ];
}

function lipSign(lipHeight: number): { sign: JumpSign; track: Track; lip: number } {
  const track = compileTrack(11, lipStage(lipHeight));
  const lip = track.samples.findIndex((s) => s.jump);
  expect(lip).toBeGreaterThan(0);
  return { sign: jumpSign(track.samples, lip, jumpArc(track, lip)), track, lip };
}

/** Every point of a jump sign, whichever of its four lines it is on. */
function allPoints(sign: JumpSign): PacePoint[] {
  return [...sign.ramp, ...sign.gap, ...sign.landing, ...sign.flight];
}

/** The drawn height of the flight above the road it is passing over, at the
 * widest — the DAYLIGHT, which is the whole thing a jump call is about. In
 * screen axes y grows downward, so clearing the ground is a smaller y. */
function daylight(sign: JumpSign): number {
  let most = 0;
  for (const [x, y] of sign.flight) {
    // The ground directly under this point of the arc, walked along the road
    // the flight passes over.
    for (let i = 1; i < sign.gap.length; i++) {
      const [ax, ay] = sign.gap[i - 1];
      const [bx, by] = sign.gap[i];
      if (x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue;
      const t = bx === ax ? 0 : (x - ax) / (bx - ax);
      most = Math.max(most, ay + (by - ay) * t - y);
    }
  }
  return most;
}

describe("the jump the sign draws", () => {
  it("draws the road the flight passes over, and flies the arc above it", () => {
    // The two lines and the space between them ARE the call: an arc drawn
    // with no ground under it is a curve, and a jump is the daylight.
    const { sign } = lipSign(2.4);
    expect(sign.gap.length).toBeGreaterThan(2);
    expect(daylight(sign)).toBeGreaterThan(8);
  });

  it("lands the flight exactly on the road, not near it", () => {
    const { sign } = lipSign(2.4);
    const touchdown = sign.flight[sign.flight.length - 1];
    // The landing starts where the flight ends — a stroke of separation there
    // reads as a car that never came down.
    const seam = Math.hypot(touchdown[0] - sign.landing[0][0], touchdown[1] - sign.landing[0][1]);
    expect(seam).toBeLessThan(1e-9);
  });

  it("runs left to right, so a jump can never be mistaken for a corner", () => {
    const { sign } = lipSign(2.4);
    const line = [...sign.ramp, ...sign.gap.slice(1), ...sign.landing.slice(1)];
    for (let i = 1; i < line.length; i++) {
      expect(line[i][0]).toBeGreaterThanOrEqual(line[i - 1][0] - 1e-9);
    }
  });

  it("fits its box, ramp and arc and landing alike", () => {
    for (const height of [0.8, 1.6, 2.4, 3.2, 4]) {
      for (const [x, y] of allPoints(lipSign(height).sign)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("a longer flight is a bigger jump on the sign, not the same picture", () => {
    // Both signs are fitted to the same box, so the only thing telling them
    // apart is the shape — the whole reason the sign is the jump and not a
    // canned ramp-and-arrow.
    const small = lipSign(1);
    const big = lipSign(4);
    expect(big.sign.length).toBeGreaterThan(small.sign.length + 10);
    expect(daylight(big.sign)).toBeGreaterThan(daylight(small.sign));
  });

  it("quotes the engine's own estimate of the flight, and no other", () => {
    const { sign, track, lip } = lipSign(2.4);
    expect(sign.length).toBeCloseTo(jumpArc(track, lip).length, 9);
  });
});

describe("the jump sign filling as the lip is taken", () => {
  const { sign } = lipSign(2.4);

  it("lights nothing on the approach", () => {
    const lit = fillJump(sign, 0);
    expect(lit.ramp.lit).toBe(0);
    expect(lit.flight.lit).toBe(0);
    expect(lit.landing.lit).toBe(0);
  });

  it("climbs the ramp before any of the flight lights", () => {
    // The order is the whole claim. A jump call covers the road either side
    // of the lip, so its fill has a run-up to spend before any of the air is
    // drawn as flown — light them together and the sign says the car left the
    // ground on the approach.
    const onRamp = fillJump(sign, sign.share.ramp * 0.5);
    expect(onRamp.ramp.lit).toBeGreaterThan(0);
    expect(onRamp.ramp.lit).toBeLessThan(onRamp.ramp.span);
    expect(onRamp.flight.lit).toBe(0);
  });

  it("flies the arc with the whole ramp behind it, and the landing still dark", () => {
    const inAir = fillJump(sign, sign.share.ramp + sign.share.flight * 0.5);
    expect(inAir.ramp.lit).toBeCloseTo(inAir.ramp.span, 9);
    expect(inAir.flight.lit).toBeGreaterThan(0);
    expect(inAir.flight.lit).toBeLessThan(inAir.flight.span);
    expect(inAir.landing.lit).toBe(0);
  });

  it("only ever goes forwards, ramp then air then landing", () => {
    let last = [-1, -1, -1];
    for (let i = 0; i <= 40; i++) {
      const lit = fillJump(sign, i / 40);
      const now = [lit.ramp.lit, lit.flight.lit, lit.landing.lit];
      now.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(last[k] - 1e-9));
      last = now;
    }
  });

  it("is whole by the end of the landing, every part of it", () => {
    const lit = fillJump(sign, 1);
    expect(lit.ramp.lit).toBeCloseTo(lit.ramp.span, 9);
    expect(lit.flight.lit).toBeCloseTo(lit.flight.span, 9);
    expect(lit.landing.lit).toBeCloseTo(lit.landing.span, 9);
  });

  it("clamps either side of the jump", () => {
    expect(fillJump(sign, -1).ramp.lit).toBe(0);
    expect(fillJump(sign, 2).landing.lit).toBeCloseTo(fillJump(sign, 1).landing.span, 9);
  });

  it("spends the fill in the stage's own metres, not the fitted line's", () => {
    // The vertical is stretched tenfold to make the height readable, which
    // makes the drawn arc far longer than the drawn ramp even where the road
    // says otherwise. Reading the split off the drawing would put the lit end
    // of the sign somewhere the car is not.
    const shares = sign.share.ramp + sign.share.flight + sign.share.landing;
    expect(shares).toBeCloseTo(1, 9);
    const lit = fillJump(sign, sign.share.ramp);
    expect(lit.ramp.lit).toBeCloseTo(lit.ramp.span, 9);
    expect(lit.flight.lit).toBe(0);
  });
});
