// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEOPLE IN THE CARS. The caricatures themselves are judged by looking
// (`make crew`); what is asserted here is what looking cannot catch.
//
// The one that actually breaks things is the ROOF. A character is authored
// once and then sits in every body in the catalog, and the coupe's cabin is
// 60 mm shallower than the hatch's — so a driver who fits the sheet's car can
// have their helmet through the headliner of a car the sheet never rendered.
// That is a bug nobody sees from outside (the roof is opaque) and everybody
// sees from the hood camera, which is the one place the player looks for a
// whole stage.
//
// The rest is bookkeeping the field depends on: every campaign crew has a
// character, no two crews are the same person, and the map reader is wearing
// the driver's own colours.

import { describe, expect, it } from "vitest";

import { RIVALS } from "@engine";

import { MeshBuilder } from "../pwa/src/game/car/builder.ts";
import { buildCrewMember, type CrewSeat } from "../pwa/src/game/car/crew.ts";
import { crewSeats } from "../pwa/src/game/car/interior.ts";
import { CREW_CHARACTERS, crewLookFor, playerCrewLook } from "../pwa/src/game/car-crew.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const bodies = Object.entries(CAR_BODIES);

/** The bounds of one person, built into a builder of their own. */
function boundsOf(
  seat: CrewSeat,
  character: (typeof CREW_CHARACTERS)[number],
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const b = new MeshBuilder();
  buildCrewMember(
    b,
    seat,
    character,
    { hands: "wheel", wheel: { y: seat.sillY, z: seat.z + 0.4 } },
    true,
  );
  const geo = b.geometry();
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.dispose();
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y };
}

describe("the crew roster", () => {
  it("carries sixteen characters, all of them different people", () => {
    expect(CREW_CHARACTERS).toHaveLength(16);
    expect(new Set(CREW_CHARACTERS.map((c) => c.id)).size).toBe(16);
  });

  it("gives every campaign crew a character of their own", () => {
    const drivers = RIVALS.map((crew) => crewLookFor(crew.id).driver.id);
    expect(drivers).toEqual(RIVALS.map((crew) => crew.id));
    expect(new Set(drivers).size).toBe(RIVALS.length);
  });

  it("puts the player in a car nobody else is driving", () => {
    const player = playerCrewLook().driver;
    expect(player.id).toBe("player");
    expect(RIVALS.some((crew) => crew.id === player.id)).toBe(false);
  });

  it("hands an unknown slot the privateer rather than an empty seat", () => {
    expect(crewLookFor("nobody-by-that-name").driver.id).toBe("privateer");
  });

  it("dresses the map reader in the driver's own colours", () => {
    for (const character of CREW_CHARACTERS) {
      const look = crewLookFor(character.id);
      expect(look.coDriver.colors).toEqual(look.driver.colors);
      // One model, every car: the caricature belongs to whoever is driving.
      expect(look.coDriver.id).toBe("map-reader");
    }
  });

  it("gives every crew a helmet colour nobody else has", () => {
    const helmets = CREW_CHARACTERS.map((c) => c.colors.helmet);
    expect(new Set(helmets).size).toBe(helmets.length);
  });

  it("keeps the gear readable against itself", () => {
    for (const c of CREW_CHARACTERS) {
      expect(c.colors.trim).not.toBe(c.colors.suit);
      expect(c.colors.helmet).not.toBe(c.colors.suit);
    }
  });
});

describe("a character sat in a car", () => {
  it.each(bodies)("keeps every head under %s's headliner", (_id, spec) => {
    const { driver, coDriver } = crewSeats(spec);
    for (const character of CREW_CHARACTERS) {
      for (const seat of [driver, coDriver]) {
        const bounds = boundsOf(seat, character);
        expect(bounds.maxY).toBeLessThanOrEqual(seat.roofY);
        // ...and high enough to be seen at all: everything under the sill is
        // inside a closed shell, so a crew that clears it by nothing is a
        // cabin with nobody in it.
        expect(bounds.maxY).toBeGreaterThan(seat.sillY + 0.1);
      }
    }
  });

  it.each(bodies)("keeps every crew inside %s's cabin", (_id, spec) => {
    const { driver, coDriver } = crewSeats(spec);
    // The furniture is fitted inside the cabin's own half-width; a person
    // wider than the seat they are in comes through the door skin.
    const half = spec.cabin.roofHalf;
    for (const character of CREW_CHARACTERS) {
      for (const seat of [driver, coDriver]) {
        const bounds = boundsOf(seat, character);
        expect(Math.max(-bounds.minX, bounds.maxX)).toBeLessThanOrEqual(half);
      }
    }
  });
});
