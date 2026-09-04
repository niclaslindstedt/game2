// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CRASH THROWS UP (pwa/src/game/crash-throw.ts) — the arithmetic
// behind the gravel and smoke a body that is off its wheels ploughs out of
// the ground.
//
// It is app code, and it is tested here for `drift-throw.ts`'s reason: the
// module is pure arithmetic with no three.js and no DOM in it, and the
// interesting claim — that a body on its ROOF throws from its roof — is one
// a screenshot of a thousand stones in the air cannot check.

import { describe, expect, it } from "vitest";

import { TUNING } from "@engine";
import { CRASH_THROW, crashBurst, crashContact, crashGrind } from "../pwa/src/game/crash-throw.ts";

const B = TUNING.collision;
const QUARTER = Math.PI / 2;

describe("where a body that is over touches the ground", () => {
  it("is under the wheels while it is still upright", () => {
    const at = crashContact(0);
    expect(at.up).toBeCloseTo(0, 6);
    // Either wheel will do — the hull is symmetric and both are down.
    expect(Math.abs(at.across)).toBeCloseTo(B.halfTrack, 6);
  });

  it("is the SILL once it is on its side, a half-width out and a half-width down", () => {
    const at = crashContact(QUARTER);
    // On its right side: the contact is the flank, half the body's width
    // below the wheel plane.
    expect(at.up).toBeCloseTo(-B.halfWidth, 6);
    expect(Math.abs(at.across)).toBeLessThan(B.halfWidth);
  });

  it("is the ROOF once it is inverted — the whole height of the car down", () => {
    const at = crashContact(Math.PI);
    expect(at.up).toBeCloseTo(-B.roofY, 6);
    // ...and this is the point of the module. The wheels are the two
    // highest things on the car now: a burst thrown at them would appear
    // a car's height ABOVE the ground with nothing under it.
    const wheelHeight = 0 * Math.cos(Math.PI) - B.halfTrack * Math.sin(Math.PI);
    expect(wheelHeight).toBeGreaterThan(at.up);
  });

  it("never floats: whatever the attitude, the contact is at or under the wheel plane", () => {
    for (let i = 0; i <= 64; i += 1) {
      const tilt = -Math.PI + (i / 64) * 2 * Math.PI;
      expect(crashContact(tilt).up).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe("how much a crash throws", () => {
  it("throws nothing for a body settling rather than arriving", () => {
    expect(crashBurst(0).grains).toBe(0);
    expect(crashBurst(CRASH_THROW.jouleFloor).grains).toBe(0);
    expect(crashGrind(0).grains).toBe(0);
    expect(crashGrind(CRASH_THROW.grindFrom).grains).toBe(0);
  });

  it("is sized by what the GROUND TOOK, so it grows as the square of the blow", () => {
    // The ground cannot throw up anything it was not given: the burst is the
    // energy the car gave up (`landing.took`, J/kg), never the speed the
    // corner arrived at. So a contact twice as hard throws four times the
    // stones — which is what makes a big one read as an event rather than as
    // a slightly bigger scuff.
    const energy = (slam: number) => 0.5 * slam * slam;
    const hard = crashBurst(energy(12)).grains - crashBurst(energy(6)).grains;
    const soft = crashBurst(energy(6)).grains - crashBurst(energy(3)).grains;
    expect(hard).toBeGreaterThan(soft * 3);
  });

  it("grows with the blow and with the pace, and then stops growing", () => {
    expect(crashBurst(8).grains).toBeGreaterThan(crashBurst(5).grains);
    expect(crashGrind(20).grains).toBeGreaterThan(crashGrind(10).grains);
    // The ceilings are real: a contact that throws the whole pool already
    // fills the frame, and a roll makes a dozen of them.
    expect(crashBurst(500).grains).toBe(CRASH_THROW.burstMax);
    expect(crashGrind(500).grains).toBe(CRASH_THROW.grindMax);
    expect(crashBurst(500).puffs).toBe(CRASH_THROW.puffMax);
    expect(crashGrind(500).puffs).toBe(CRASH_THROW.grindPuffMax);
  });

  it("throws more grit than smoke, so a burst reads as STONES with dust behind it", () => {
    expect(crashBurst(12).grains).toBeGreaterThan(crashBurst(12).puffs * 3);
    expect(crashGrind(18).grains).toBeGreaterThan(crashGrind(18).puffs * 3);
  });

  it("states the grind as a RATE, so a caller cannot make its density the frame rate", () => {
    // The contract: `crashGrind` is per SECOND, and the two frame lengths
    // below have to owe the same cloud over the same second of sim.
    const rate = crashGrind(16).grains;
    const oneLongFrame = rate * (1 / 30);
    const twoShortFrames = rate * (1 / 60) + rate * (1 / 60);
    expect(oneLongFrame).toBeCloseTo(twoShortFrames, 9);
    // ...and it is not QUANTISED here: rounding to whole particles per call
    // is exactly how an emitter loses its fraction and gains a floor of one
    // particle per frame. A hair more speed is a hair more cloud.
    // Probed BELOW the ceiling, which a roll reaches early: the grind is
    // full from about 50 km/h up, so most of a real rollover is spent
    // pinned at `grindMax` and only the last of it tails off.
    const nudged = crashGrind(10.01).grains - crashGrind(10).grains;
    expect(nudged).toBeGreaterThan(0);
    expect(nudged).toBeLessThan(1);
    const full = CRASH_THROW.grindFrom + CRASH_THROW.grindMax / CRASH_THROW.grindPerSpeed;
    expect(crashGrind(full + 1).grains).toBe(CRASH_THROW.grindMax);
    // ...and the ceiling is reached inside the speeds a rollover actually
    // happens at, so the cloud is at full density for the violent part of
    // one rather than only in theory.
    expect(full).toBeLessThan(25);
  });

  it("fits its own pool at full rate — the bound every knob above is under", () => {
    // THE INVARIANT THAT ACTUALLY BREAKS. The crash has its own particle
    // pool so the rates can be big; the pool is still finite, and a cloud
    // spawning faster than `pool / life` recycles grains that are still on
    // screen — which reads as it tearing a hole in itself at exactly the
    // moment it is thickest. Raising a rate without raising the pool is the
    // mistake this catches, and `dust.ts`'s CRASH_GRIT reads both numbers
    // from here so the two cannot drift apart.
    const atFullRate = (CRASH_THROW.grindMax + CRASH_THROW.grindPuffMax) * CRASH_THROW.life;
    expect(atFullRate).toBeLessThanOrEqual(CRASH_THROW.pool);
    // A burst lands on top of the grind, so there has to be room for one.
    expect(atFullRate + CRASH_THROW.burstMax + CRASH_THROW.puffMax).toBeLessThan(
      CRASH_THROW.pool * 1.4,
    );
  });

  it("makes a spin worth more than a drift", () => {
    expect(CRASH_THROW.spun).toBeGreaterThan(1);
  });
});
