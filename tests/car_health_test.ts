// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CONDITION SCHEMATIC — the arithmetic behind the four colours under
// the minimap (pwa/src/game/car-health.ts).
//
// It is tested rather than looked at because a screenshot only ever shows
// one car in one state, and the claims this instrument has to keep are
// claims about EVERY state:
//
//   * a sound car is green everywhere, with nothing in the icon row — the
//     row filling up is the whole of how the machinery is reported;
//   * a vital part is never averaged away by the sound parts around it: an
//     engine at the top of its ledger paints its compartment red whatever
//     the bonnet over it is doing;
//   * the panel and the CALLS agree, because a driver told one thing in
//     words and another in colour believes neither — the tiers are the
//     ledger's own `callAt` lines, and a wheel and a crush depth are
//     remapped into that space rather than given their own opinion;
//   * the drawing is in the SCREEN's frame — the engine's right-hand corner
//     is the one the player sees on the left — which is the same flip
//     `wheelCall` and the audio route make, and getting it wrong points the
//     driver at the corner that is fine.

import { describe, expect, it } from "vitest";
import { INTERNAL_SYSTEMS, TUNING, type CarDamage, type InternalSystem } from "@engine";

import {
  HEALTH_PANELS,
  carHealth,
  healthSystems,
  healthTier,
  markRows,
  worstTier,
} from "../pwa/src/game/car-health.ts";

const CALL = TUNING.collision.callAt;

/** A sound car's ledger — the shape `createGame` starts every run with. */
function sound(): CarDamage {
  const systems = {} as Record<InternalSystem, number>;
  for (const system of INTERNAL_SYSTEMS) systems[system] = 0;
  return {
    zones: [0, 0, 0, 0, 0, 0, 0, 0],
    belly: 0,
    roof: 0,
    wear: 0,
    systems,
    wheels: [0, 0, 0, 0],
    broken: [],
    version: 0,
  };
}

describe("the condition schematic", () => {
  it("paints a sound car green everywhere and says nothing about its machinery", () => {
    const health = carHealth(sound());
    for (const panel of HEALTH_PANELS) expect(health.panels[panel]).toBe("ok");
    expect(health.wheels).toEqual(["ok", "ok", "ok", "ok"]);
    expect(health.lamps).toEqual(["ok", "ok", "ok", "ok"]);
    expect(health.systems).toEqual([]);
    expect(health.worst).toBe("ok");
  });

  it("reads the tiers off the ledger's own call lines", () => {
    expect(healthTier(0)).toBe("ok");
    expect(healthTier(CALL.hurt - 0.01)).toBe("ok");
    expect(healthTier(CALL.hurt)).toBe("hurt");
    expect(healthTier(CALL.spent)).toBe("spent");
    expect(healthTier(CALL.dead)).toBe("dead");
  });

  it("gives a dead engine the whole compartment, and leaves the rest of the car alone", () => {
    const damage = sound();
    damage.systems.engine = 1;
    const health = carHealth(damage);
    expect(health.panels.nose).toBe("dead");
    // The `max`-not-mean rule: four sound contributors beside it change
    // nothing, which is the difference between a diagram and an average.
    expect(health.panels.cabin).toBe("ok");
    expect(health.panels.tail).toBe("ok");
    expect(health.worst).toBe("dead");
  });

  it("walks the nose up the ladder as the engine goes, in step with the calls", () => {
    const seen = [CALL.hurt, CALL.spent, CALL.dead].map((score) => {
      const damage = sound();
      damage.systems.engine = score;
      return carHealth(damage).panels.nose;
    });
    expect(seen).toEqual(["hurt", "spent", "dead"]);
  });

  it("puts the windscreen's own panel straight to red when the glass goes", () => {
    const damage = sound();
    damage.broken.push("glassF");
    const health = carHealth(damage);
    expect(health.panels.screen).toBe("dead");
    // ...and a side window is a nuisance rather than a hole to steer
    // through, so it may not read as the same thing.
    const side = sound();
    side.broken.push("glassL");
    expect(carHealth(side).panels.screen).toBe("hurt");
  });

  it("keeps a lost panel short of red — a car missing its bonnet is still driving", () => {
    const damage = sound();
    damage.broken.push("hood");
    expect(carHealth(damage).panels.nose).toBe("spent");
  });

  it("marks a puncture where the calls start, and a lost wheel red", () => {
    const flat = sound();
    // The engine's front-RIGHT wheel (index 1), which is the one the player
    // sees at the front LEFT of the car in front of them (screen index 0).
    flat.wheels[1] = TUNING.collision.chassis.wheelFlat;
    const health = carHealth(flat);
    expect(health.wheels[0]).toBe("hurt");
    expect(health.wheels.slice(1)).toEqual(["ok", "ok", "ok"]);

    const off = sound();
    off.wheels[2] = 1;
    // Engine rear-left is the player's rear right: screen index 3.
    expect(carHealth(off).wheels[3]).toBe("dead");
  });

  it("leaves a scuffed tyre green — a wheel is not news until it is flat", () => {
    const damage = sound();
    damage.wheels[0] = TUNING.collision.chassis.wheelFlat * 0.5;
    expect(carHealth(damage).wheels[1]).toBe("ok");
  });

  it("walks all four corners together when what holds them on is failing", () => {
    const damage = sound();
    damage.systems.suspension = 1;
    const health = carHealth(damage);
    // Shared machinery moves every corner; a puncture moves one. That
    // difference is the only thing the wheel blocks are there to say.
    expect(health.wheels).toEqual(["spent", "spent", "spent", "spent"]);
  });

  it("names the lamp the player can see is out, not the one the engine calls it", () => {
    const damage = sound();
    // Engine front-LEFT lamp: the player sees it at the front right.
    damage.broken.push("lampFL");
    const health = carHealth(damage);
    expect(health.lamps).toEqual(["ok", "dead", "ok", "ok"]);
    const rear = sound();
    rear.broken.push("lampRR");
    expect(carHealth(rear).lamps).toEqual(["ok", "ok", "dead", "ok"]);
  });

  it("folds a crushed face into the panel over it, capped by the ledger's own cap", () => {
    const damage = sound();
    // Zone 4 is the tail, folded to the cage.
    damage.zones[4] = TUNING.collision.zoneMax;
    const health = carHealth(damage);
    expect(health.panels.tail).toBe("dead");
    expect(health.panels.nose).toBe("ok");
  });

  it("lists only the machinery with something wrong with it, worst first", () => {
    const damage = sound();
    damage.systems.brakes = CALL.hurt;
    damage.systems.gearbox = CALL.dead;
    damage.systems.cooling = CALL.spent;
    const rows = healthSystems(damage);
    expect(rows.map((row) => row.system)).toEqual(["gearbox", "cooling", "brakes"]);
    expect(rows.map((row) => row.tier)).toEqual(["dead", "spent", "hurt"]);
  });

  it("breaks the marks under the car into balanced rows of at most three", () => {
    const shape = (n: number): number[] =>
      markRows(Array.from({ length: n }, (_, i) => i)).map((row) => row.length);
    expect(shape(0)).toEqual([]);
    expect(shape(1)).toEqual([1]);
    expect(shape(3)).toEqual([3]);
    // The whole point of the split: four marks are a block of 2 and 2, never
    // a row of three with one hanging off the end of it.
    expect(shape(4)).toEqual([2, 2]);
    // ...and an odd one goes in the EARLIER row, which is the shape a stack
    // of things is read in.
    expect(shape(5)).toEqual([3, 2]);
    expect(shape(6)).toEqual([3, 3]);
    // Six systems is the most there can ever be, so two rows is the most the
    // split can make — the stylesheet reserves exactly that.
    expect(markRows(INTERNAL_SYSTEMS).length).toBe(2);
    // Nothing is dropped and nothing is reordered on the way through.
    expect(markRows([..."abcde"]).flat()).toEqual([..."abcde"]);
  });

  it("carries the worst thing on the car up to the panel's own frame", () => {
    expect(worstTier(["ok", "hurt", "ok"])).toBe("hurt");
    expect(worstTier(["dead", "hurt"])).toBe("dead");
    expect(worstTier([])).toBe("ok");
    // ...but never off a LAMP: one clipped hedge on a night stage would
    // otherwise report the car as broken for the rest of the run.
    const damage = sound();
    damage.broken.push("lampRL");
    expect(carHealth(damage).worst).toBe("ok");
    damage.systems.brakes = CALL.hurt;
    expect(carHealth(damage).worst).toBe("hurt");
  });
});
