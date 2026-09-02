// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SKY OVER A STAGE — how much traffic crosses it, and what the trails
// they leave do with the next three minutes.
//
// This is verified here rather than by looking because the claim is about a
// RATE, and no single frame carries one. A screenshot says whether the sky
// looks right; only a clock says whether a player who never looks up twice
// in the same place still sees several aeroplanes during a race, and
// whether the sky they start on already has yesterday's traffic in it
// rather than filling up over the first minute.
//
// The contact sheet (`make traffic`) is the looking half of the same loop.

import { describe, expect, it } from "vitest";

import {
  createSkyTraffic,
  puffFade,
  puffWidth,
  tipFade,
  LANE,
  PUFF,
} from "../pwa/src/game/sky-traffic.ts";

/** How long a stage lasts, s — the two minutes docs/simulation.md sizes the
 * field's start interval against. */
const RACE = 120;
const STEP = 1 / 60;

/** A pinned source, so a rate is a measurement and not a coin toss. The
 * traffic is renderer-side presentation, so this parameter exists for the
 * tests alone — nothing in the engine ever draws from it. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Run one stage's worth of frames and count what came over. */
function crossingsIn(seconds: number, rng: () => number): number {
  const traffic = createSkyTraffic(rng);
  let seen = 0;
  for (let t = 0; t < seconds; t += STEP) if (traffic.step(STEP)) seen++;
  return seen;
}

describe("high traffic", () => {
  it("puts several aircraft over a stage", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const seen = crossingsIn(RACE, seeded(seed));
      // A FEW per race: enough that looking up is worth doing and never so
      // many that the sky over a rally stage reads as an airport.
      expect(seen).toBeGreaterThanOrEqual(3);
      expect(seen).toBeLessThanOrEqual(9);
    }
  });

  it("opens the stage on traffic that is already there", () => {
    const open = createSkyTraffic(seeded(7)).open();
    expect(open.length).toBeGreaterThanOrEqual(3);
    // Every one of them is already part-way through its own life, which is
    // what dresses the sky before the lights go out...
    for (const cross of open) {
      expect(cross.age).toBeGreaterThan(0);
      expect(cross.age).toBeLessThan(PUFF.life);
    }
    // ...and they are at different stages of coming apart, because three
    // identical trails are one trail drawn three times.
    const ages = open.map((c) => c.age).sort((a, b) => a - b);
    expect(ages[ages.length - 1] - ages[0]).toBeGreaterThan(60);
    // The youngest is inside its own crossing, so the establishing shot has
    // an aeroplane in it and not only its wake.
    expect(ages[0]).toBeLessThan(open[0].span);
  });

  it("flies the lanes above the skyline", () => {
    const traffic = createSkyTraffic(seeded(3));
    const all = [...traffic.open()];
    for (let t = 0; t < RACE * 4; t += STEP) {
      const cross = traffic.step(STEP);
      if (cross) all.push(cross);
    }
    expect(all.length).toBeGreaterThan(10);
    for (const cross of all) {
      expect(cross.y).toBeGreaterThanOrEqual(LANE.low);
      expect(cross.y).toBeLessThanOrEqual(LANE.high);
      // The heading is a unit vector, and the chord is flown at the speed
      // the span was cut for — the renderer places both aeroplane and trail
      // off `from + dir * speed * age`, so a drift in either is a trail
      // laid somewhere its aeroplane never went.
      expect(Math.hypot(cross.dirX, cross.dirZ)).toBeCloseTo(1, 6);
      expect(cross.span * cross.speed).toBeGreaterThan(1000);
      // The chord passes OVERHEAD clear of the skyline — the ridge rings
      // top out around 20 degrees (0.35 rad) — and comes down at both ends
      // into the band a driver actually sees out of the windscreen, which
      // is the skyline up to about thirty degrees (0.52 rad). A crossing
      // that fails the first is drawn on the mountains; one that fails the
      // second is only ever seen by a camera nobody drives with.
      const flown = cross.span * cross.speed;
      const overhead = Math.abs(cross.fromX * cross.dirZ - cross.fromZ * cross.dirX);
      expect(Math.atan2(cross.y, overhead)).toBeGreaterThan(0.6);
      const ends = [
        Math.hypot(cross.fromX, cross.fromZ),
        Math.hypot(cross.fromX + cross.dirX * flown, cross.fromZ + cross.dirZ * flown),
      ];
      for (const out of ends) {
        expect(Math.atan2(cross.y, out)).toBeLessThan(0.55);
        expect(Math.atan2(cross.y, out)).toBeGreaterThan(0.25);
      }
    }
  });

  it("spreads a contrail out as it thins", () => {
    // A trail that only fades reads as a fading line. It has to get WIDER
    // with age, monotonically, or the far end of one trail is the same
    // shape as the near end.
    let last = 0;
    for (let age = 0; age <= PUFF.life; age += 2) {
      const width = puffWidth(age);
      expect(width).toBeGreaterThanOrEqual(last);
      last = width;
    }
    expect(puffWidth(0)).toBe(PUFF.born);
    expect(puffWidth(PUFF.widen)).toBeCloseTo(PUFF.spread, 6);
    expect(puffWidth(PUFF.life)).toBeCloseTo(PUFF.spread, 6);
    // …and it is laid closer together than it is wide, or a fresh trail is
    // a string of beads rather than a line.
    expect(PUFF.step).toBeLessThan(PUFF.born);
  });

  it("holds a contrail in the sky for minutes, then lets it go", () => {
    expect(puffFade(0)).toBe(0); // nothing pops in behind the tail
    expect(puffFade(PUFF.rise)).toBeCloseTo(1, 6);
    // The LINGER: a full minute after it was laid a trail is still at full
    // strength, which is the whole reason a stage accumulates a sky.
    expect(puffFade(60)).toBeCloseTo(1, 6);
    expect(puffFade(PUFF.life)).toBe(0);
    expect(puffFade(PUFF.life + 10)).toBe(0);
    // …and it goes out gradually rather than in one frame.
    let last = 1;
    for (let age = PUFF.life - PUFF.fall; age <= PUFF.life; age += 2) {
      const fade = puffFade(age);
      expect(fade).toBeLessThanOrEqual(last + 1e-9);
      last = fade;
    }
    expect(PUFF.life).toBeGreaterThan(RACE);
  });

  it("thins a trail out at both ends instead of cutting it off", () => {
    // A contrail that simply stops in mid-sky reads as a scratch on the
    // lens. Both tips go out, and the whole middle of the chord is solid.
    expect(tipFade(0)).toBe(0);
    expect(tipFade(1)).toBe(0);
    for (const along of [0.25, 0.5, 0.75]) expect(tipFade(along)).toBeCloseTo(1, 6);
    // Symmetric, and monotone out of either end — a taper with a step in it
    // draws a bright band across the sky where the step is.
    for (let along = 0; along <= 0.5; along += 0.02) {
      expect(tipFade(along)).toBeCloseTo(tipFade(1 - along), 6);
      expect(tipFade(along + 0.02)).toBeGreaterThanOrEqual(tipFade(along));
    }
  });

  it("leaves enough trail up there to be a sky rather than an event", () => {
    // The measurement the whole change is for: how many contrails are
    // hanging over the stage at any moment, counting the ones it opened on.
    for (let seed = 1; seed <= 12; seed++) {
      const traffic = createSkyTraffic(seeded(seed));
      // When each trail was laid, on the stage's own clock — negative for
      // the ones that were up there before the car arrived.
      const laid = traffic.open().map((c) => -c.age);
      let fewest = laid.length;
      let most = laid.length;
      for (let t = 0; t < RACE; t += STEP) {
        if (traffic.step(STEP)) laid.push(t);
        const up = laid.filter((born) => t - born < PUFF.life).length;
        if (up < fewest) fewest = up;
        if (up > most) most = up;
      }
      // Never down to one lonely scratch, and by the end of a race the sky
      // has a fair amount of somebody else's day written on it.
      expect(fewest).toBeGreaterThanOrEqual(3);
      expect(most).toBeGreaterThanOrEqual(6);
    }
  });
});
