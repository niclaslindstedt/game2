// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT COMES OUT OF A TAILPIPE (pwa/src/game/exhaust.ts). The cloud itself
// is three.js and can only be judged by looking at it; the ARITHMETIC under
// it is a set of claims about water, soot and air, and every one of them is
// falsifiable here.
//
// The claims worth holding, in the order the module makes them: a warm pipe
// off the throttle is nothing at all, cold air turns the same pipe into a
// plume, the pedal is what darkens it, and the DETAIL row's exhaust stop
// thins the winter half without ever touching the summer one.

import { describe, expect, it } from "vitest";

import { CLIMATE, type Climate, type Weather } from "@engine";

import {
  EXHAUST,
  pipeAir,
  pipeBursts,
  pipeWork,
  type PipeEngine,
  type PipeFit,
} from "../pwa/src/game/exhaust.ts";

/** An engine doing nothing in particular — every case below is this with
 * one or two facts moved. */
const IDLE: PipeEngine = { rev: 0, u: 0, pedal: 0, launchSpin: 0 };
const air = (temperature: number, damp = 0, since = 300) => ({ temperature, damp, since });

/** A pipe read at full budget, one exit, intact, drawing the whole plume —
 * so a difference between two calls is only ever the difference asked for. */
const work = (engine: Partial<PipeEngine>, at: ReturnType<typeof air>, fit: PipeFit = {}) =>
  pipeWork({ ...IDLE, ...engine }, at, 1, fit);

/** Puffs per second, which is the honest reading of a rate and a burst
 * size: `every` alone says nothing, because a burst carries several. */
const rate = (w: ReturnType<typeof pipeWork>) => w.puffs / w.every;

const SUMMER = 20;
const WINTER = -10;

describe("what a warm pipe does", () => {
  it("puts out nothing worth drawing off the throttle", () => {
    // The whole reason a summer stage costs nothing: the gas is there, the
    // air swallows it, and the pool is never touched.
    expect(work({}, air(SUMMER)).puffs).toBe(0);
  });

  it("is a thin dark haze under a bootful, and never a smokescreen", () => {
    const boot = work({ rev: 0.25, u: 12, pedal: 1 }, air(SUMMER));
    expect(boot.puffs).toBeGreaterThan(0);
    // Visible, and visibly SOOT — but nowhere near the body of a plume:
    // what a warm pipe puts up is a haze the road is seen through.
    expect(boot.shade).toBeGreaterThan(0.6);
    expect(boot.bloom).toBe(0);
    expect(boot.body).toBeGreaterThan(0.2);
    expect(boot.body).toBeLessThan(0.6);
  });

  it("clears the moment the pedal comes up", () => {
    const on = work({ rev: 0.5, u: 25, pedal: 1 }, air(SUMMER));
    const off = work({ rev: 0.5, u: 25, pedal: 0 }, air(SUMMER));
    expect(off.body).toBeLessThan(on.body);
    // A car coasting into a corner at revs is burning nothing: same needle,
    // opposite engine, and the difference is exactly what `pedal` exists
    // for. `rev` alone cannot tell these two apart.
    expect(off.puffs).toBe(0);
  });
});

describe("what the cold does to the same pipe", () => {
  it("turns an idling engine into a plume", () => {
    const warm = work({}, air(SUMMER));
    const cold = work({}, air(WINTER));
    expect(warm.puffs).toBe(0);
    expect(cold.puffs).toBeGreaterThan(0);
    expect(cold.bloom).toBeGreaterThan(0.5);
    // …and a PALE one. Nothing about the weather makes an engine rich.
    expect(cold.shade).toBeLessThan(0.1);
  });

  it("thickens all the way down", () => {
    const steps = [15, 8, 2, -5, -15].map((t) => work({ pedal: 0.4, rev: 0.4 }, air(t)));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.bloom).toBeGreaterThanOrEqual(steps[i - 1]!.bloom);
      expect(steps[i]!.body).toBeGreaterThanOrEqual(steps[i - 1]!.body);
    }
    expect(steps[0]!.bloom).toBe(0);
  });

  it("shows more of it under a wet sky than a clear one", () => {
    const clear = work({ pedal: 0.5, rev: 0.4 }, air(0, 0));
    const wet = work({ pedal: 0.5, rev: 0.4 }, air(0, 1));
    expect(wet.bloom).toBeGreaterThan(clear.bloom);
  });

  it("steams hardest out of a cold pipe at the start of a run", () => {
    const grid = work({ pedal: 0.3 }, air(WINTER, 0, 0));
    const stage = work({ pedal: 0.3 }, air(WINTER, 0, EXHAUST.condense.warmUp * 2));
    expect(grid.bloom).toBeGreaterThan(stage.bloom);
  });

  it("washes the soot out of a bootful — a winter blast is grey, not black", () => {
    const summer = work({ pedal: 1, rev: 0.2 }, air(SUMMER));
    const winter = work({ pedal: 1, rev: 0.2 }, air(WINTER));
    // Same fuel, same carbon; far more water for it to hang in.
    expect(winter.shade).toBeLessThan(summer.shade);
    expect(winter.body).toBeGreaterThan(summer.body);
  });
});

describe("what the pedal does", () => {
  it("darkens the cloud, and the revs let it back off", () => {
    const lugging = work({ pedal: 1, rev: 0.05, u: 5 }, air(SUMMER));
    const singing = work({ pedal: 1, rev: 1, u: 45 }, air(SUMMER));
    // Wide open low down is the richest mixture an engine runs, which is
    // also why a stab of throttle makes a puff of black that clears as the
    // engine comes up to meet it.
    expect(lugging.shade).toBeGreaterThan(singing.shade);
  });

  it("makes more gas the more fuel goes in", () => {
    const idling = work({}, air(WINTER));
    const cruising = work({ pedal: 0.35, rev: 0.5, u: 25 }, air(WINTER));
    const flat = work({ pedal: 1, rev: 1, u: 45 }, air(WINTER));
    expect(rate(cruising)).toBeGreaterThan(rate(idling));
    expect(rate(flat)).toBeGreaterThan(rate(cruising));
    // …and pushes it out harder, on top of whatever the car's own pace is
    // already doing to the wake.
    expect(flat.blast).toBeGreaterThan(cruising.blast);
  });

  it("blackens the pipe when the clutch comes out on a lit axle", () => {
    const away = work({ pedal: 1, rev: 0.3 }, air(SUMMER));
    const dumped = work({ pedal: 1, rev: 0.3, launchSpin: 1 }, air(SUMMER));
    expect(dumped.shade).toBeGreaterThan(away.shade);
  });
});

describe("the pipework itself", () => {
  it("shares one engine's gas between however many exits it has", () => {
    const one = work({ pedal: 1, rev: 0.6 }, air(WINTER), { pipes: 1 });
    const two = work({ pedal: 1, rev: 0.6 }, air(WINTER), { pipes: 2 });
    // Each pipe fires half as often and carries a full burst, so the car
    // puts up two plumes and the same amount of smoke — the pool is sized
    // for an ENGINE, not for a bodywork decision.
    expect(two.every).toBeCloseTo(one.every * 2, 6);
    expect(two.puffs).toBe(one.puffs);
  });

  it("smokes black through a torn-off pipe, whatever the pedal is doing", () => {
    const gone = work({}, air(SUMMER), { broken: true });
    expect(gone.shade).toBeGreaterThanOrEqual(EXHAUST.broken.shade);
    expect(gone.puffs).toBeGreaterThan(0);
    // A broken pipe may never come out PALER than the intact one it was a
    // moment ago, at any moment of the throttle.
    for (const pedal of [0, 0.5, 1]) {
      const engine = { pedal, rev: 0.4, u: 20 };
      expect(work(engine, air(SUMMER), { broken: true }).shade).toBeGreaterThanOrEqual(
        work(engine, air(SUMMER)).shade,
      );
    }
  });

  it("thins a rival's pipe against the driven car's", () => {
    const mine = work({ pedal: 1, rev: 0.6 }, air(WINTER));
    const theirs = work({ pedal: 1, rev: 0.6 }, air(WINTER), { thickness: 0.6 });
    expect(rate(theirs)).toBeLessThan(rate(mine));
  });
});

describe("the DETAIL row's stop", () => {
  it("thins the winter plume and leaves the soot alone", () => {
    const engine = { pedal: 1, rev: 0.2, u: 15 };
    const full = work(engine, air(WINTER), { vapour: 1 });
    const half = work(engine, air(WINTER), { vapour: 0.5 });
    const none = work(engine, air(WINTER), { vapour: 0 });
    expect(half.bloom).toBeLessThan(full.bloom);
    expect(none.bloom).toBe(0);
    // The pedal still darkens the pipe at every stop: a machine where
    // standing on the throttle made no difference to the exhaust would read
    // as a bug rather than as a setting.
    expect(none.shade).toBeGreaterThan(0.5);
    expect(none.puffs).toBeGreaterThan(0);
    // …and less water is less to draw, which is the whole point of the row.
    expect(none.body).toBeLessThan(full.body);
  });

  it("cannot make a warm stage cost anything", () => {
    const engine = { pedal: 0.3, rev: 0.4, u: 20 };
    expect(work(engine, air(SUMMER), { vapour: 1 })).toEqual(
      work(engine, air(SUMMER), { vapour: 0 }),
    );
  });
});

describe("the air over a car", () => {
  const climate: Climate = { season: "winter", temperature: 2, lapse: CLIMATE.lapse };
  const run = (weather: Weather, t = 100) => ({ track: { climate }, env: { weather }, t });

  it("is read at the pipe's own height, not at the datum", () => {
    // The temperature is a field (climate.ts): a stage that climbs to a pass
    // drives into its own winter, and the plume thickens on the way up.
    const valley = pipeAir(run("clear"), 0);
    const pass = pipeAir(run("clear"), 300);
    expect(valley.temperature).toBeCloseTo(2, 6);
    expect(pass.temperature).toBeLessThan(0);
    expect(work({ pedal: 0.5, rev: 0.4 }, pass).bloom).toBeGreaterThan(
      work({ pedal: 0.5, rev: 0.4 }, valley).bloom,
    );
  });

  it("calls a wet sky saturated and a clear one dry", () => {
    expect(pipeAir(run("clear"), 0).damp).toBe(0);
    expect(pipeAir(run("rain"), 0).damp).toBe(1);
    expect(pipeAir(run("storm"), 0).damp).toBe(1);
  });
});

describe("paying a burst rate no frame rate can answer one at a time", () => {
  it("carries the remainder so the cloud is not a fact about the frame rate", () => {
    // A pipe at the limiter fires sixty-odd times a second. Reset to zero on
    // every burst it would make one burst a frame however hard the engine is
    // working, and the same car would smoke half as much on a 30 fps phone.
    expect(pipeBursts(0.05, 0.016)).toBe(3);
    expect(pipeBursts(0.05 - 3 * 0.016 + 0.05, 0.016)).toBe(3);
  });

  it("caps what one late frame may spend into a single position", () => {
    expect(pipeBursts(10, 0.016)).toBe(8);
  });
});
