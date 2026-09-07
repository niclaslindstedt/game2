// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT SKY'S GEOMETRY — where the sphere of stars stands and where the
// galaxy lies across it.
//
// `make sky` reviews the picture. What a picture cannot guard is that the
// two skies are looking at the SAME sphere: the shader dome takes the turn
// as a change of basis on its ray and the simple one as the rotation of a
// baked group, and if those two ever stop being each other's inverse the
// band is in one place on a desktop and somewhere else on a phone — which
// is exactly the kind of fault a contact sheet of two separate rows reads
// straight past. Nor can it guard that the sky TURNS at all: an hour and a
// season that move nothing look identical to a sky that is simply fixed.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  GALACTIC_FRAME,
  milkyWayAt,
  nightStars,
  skyTurnAt,
  starfieldGlsl,
  turnBasis,
  turnRotation,
} from "../pwa/src/game/starfield.ts";
import { SOUTH } from "../pwa/src/game/daylight.ts";
import { skyAt } from "../pwa/src/game/sky.ts";
import type { RaceEnv } from "@engine";

const DEG = Math.PI / 180;

const clear = (hour: number, season: RaceEnv["season"]): RaceEnv => ({
  hour,
  weather: "clear",
  season,
  temperature: 5,
  windDir: 0.4,
  windSpeed: 2,
  gustPhase: 0.3,
});

/** A spread of directions over the whole sphere, for anything that has to
 * hold everywhere rather than at one convenient point. */
function overTheSphere(n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const z = ((i + 0.5) / n) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const t = i * 2.399963;
    out.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, z));
  }
  return out;
}

describe("the turn of the sphere", () => {
  it("stands the pole at the country's latitude, due north", () => {
    const turn = skyTurnAt(1, "winter", "taiga");
    // The taiga is a northern country, so the pole is high and behind the
    // sun's noon bearing rather than in front of it.
    expect(turn.pole / DEG).toBeGreaterThan(50);
    expect(turn.pole / DEG).toBeLessThan(75);
    expect(Math.cos(turn.bearing - (SOUTH + Math.PI))).toBeCloseTo(1, 6);
    // …and it is where the basis puts it: the pole maps to celestial +z.
    const basis = turnBasis(turn);
    const pole = new THREE.Vector3(
      Math.sin(turn.bearing) * Math.cos(turn.pole),
      Math.sin(turn.pole),
      Math.cos(turn.bearing) * Math.cos(turn.pole),
    ).applyMatrix3(basis);
    expect(pole.z).toBeCloseTo(1, 5);
  });

  it("is the same turn for both skies — basis and rotation are inverses", () => {
    // THE PARITY THAT MATTERS. The dome multiplies its ray by the basis;
    // the simple sky rotates a group of celestial-space vertices by the
    // rotation. Round-tripping a direction through both has to be the
    // direction again, or the two skies show the band in different places.
    for (const turn of [
      skyTurnAt(1, "winter", "taiga"),
      skyTurnAt(13.7, "summer", "alpine"),
      skyTurnAt(23, "autumn", "desert"),
    ]) {
      const basis = turnBasis(turn);
      const rot = new THREE.Matrix4().copy(turnRotation(turn));
      for (const v of overTheSphere(24)) {
        const there = v.clone().applyMatrix3(basis);
        const back = there.clone().applyMatrix4(rot);
        expect(back.distanceTo(v)).toBeLessThan(1e-6);
      }
      // A rotation, not a reflection: three's Euler decomposition of the
      // group's matrix is only a rotation if this is one.
      expect(new THREE.Matrix3().setFromMatrix4(rot).determinant()).toBeCloseTo(1, 6);
    }
  });

  it("wheels with the hour and offsets with the season", () => {
    const zenith = new THREE.Vector3(0, 1, 0);
    const at = (hour: number, season: RaceEnv["season"]): THREE.Vector3 =>
      zenith.clone().applyMatrix3(turnBasis(skyTurnAt(hour, season, "taiga")));
    // Four hours of night move the sky overhead by a real angle — an hour
    // of sun a minute of racing means a stage watches it happen.
    // Twenty degrees, not the sixty the spin itself moves: the zenith at
    // this latitude is well off the pole, so it rides a small circle.
    expect(at(1, "winter").angleTo(at(5, "winter")) / DEG).toBeGreaterThan(20);
    // …and midwinter looks out at a different sky than late September at
    // the same hour, which is the whole of why the seasons are in here.
    expect(at(1, "winter").angleTo(at(1, "autumn")) / DEG).toBeGreaterThan(30);
  });
});

describe("the galaxy", () => {
  it("has an orthonormal frame", () => {
    const along = new THREE.Vector3().fromArray(GALACTIC_FRAME.along);
    const across = new THREE.Vector3().fromArray(GALACTIC_FRAME.across);
    const up = new THREE.Vector3().fromArray(GALACTIC_FRAME.up);
    for (const v of [along, across, up]) expect(v.length()).toBeCloseTo(1, 3);
    expect(along.dot(across)).toBeCloseTo(0, 3);
    expect(along.dot(up)).toBeCloseTo(0, 3);
    expect(across.dot(up)).toBeCloseTo(0, 3);
  });

  it("lies in a band, and is nothing at its poles", () => {
    const along = new THREE.Vector3().fromArray(GALACTIC_FRAME.along);
    const up = new THREE.Vector3().fromArray(GALACTIC_FRAME.up);
    const lit = (v: THREE.Vector3): number => {
      const c = milkyWayAt(v.x, v.y, v.z);
      return c.r + c.g + c.b;
    };
    // Brightest on the band, and brighter toward the centre than away.
    const centre = lit(along);
    const anti = lit(along.clone().negate());
    expect(centre).toBeGreaterThan(anti);
    expect(anti).toBeGreaterThan(0);
    // …and gone at the galactic poles, both of them.
    expect(lit(up)).toBe(0);
    expect(lit(up.clone().negate())).toBe(0);
    // Nowhere off the band is brighter than the core: a bulge that has
    // wandered is a searchlight parked behind the hills.
    for (const v of overTheSphere(400)) {
      if (Math.abs(v.dot(up)) > 0.35) expect(lit(v)).toBeLessThan(centre);
    }
  });

  it("is tilted well off the celestial equator", () => {
    // The band has to cross the sky at a steep angle rather than ring it
    // parallel to the horizon, which is what a pole near the celestial one
    // would give and what would read as a seam in the dome.
    const up = new THREE.Vector3().fromArray(GALACTIC_FRAME.up);
    const tilt = Math.acos(Math.abs(up.z)) / DEG;
    expect(tilt).toBeGreaterThan(45);
  });

  it("is emitted as GLSL carrying the same frame the CPU reads", () => {
    // The dome's copy of the band is GLSL and this one is numbers, and
    // neither can import the other. The frame at least is one set of
    // literals, so hold the emitter to it.
    const src = starfieldGlsl();
    for (const v of [GALACTIC_FRAME.along, GALACTIC_FRAME.across, GALACTIC_FRAME.up]) {
      expect(src).toContain(v.map((n) => n.toFixed(6)).join(", "));
    }
    // …and every function the caller grafts it in for is actually there.
    for (const fn of ["nightSky", "milkyWay", "starShell", "smudge"]) {
      expect(src).toContain(`vec3 ${fn}(`);
    }
  });
});

describe("the simple sky's baked field", () => {
  it("is the same field twice — no Math.random in it", () => {
    const a = nightStars(200);
    const b = nightStars(200);
    expect(a).toEqual(b);
  });

  it("is on the unit sphere, and crowds into the band", () => {
    const stars = nightStars(3000);
    const up = new THREE.Vector3().fromArray(GALACTIC_FRAME.up);
    let inBand = 0;
    for (const s of stars) {
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 4);
      expect(s.size).toBeGreaterThan(0);
      if (Math.abs(up.x * s.x + up.y * s.y + up.z * s.z) < 0.25) inBand++;
    }
    // A quarter of the sphere lies inside that latitude; the field puts
    // well over a third of its stars there, which is what makes the Milky
    // Way read as a crowd rather than as a painted stripe.
    expect(inBand / stars.length).toBeGreaterThan(0.35);
  });
});

describe("the ladder the night sky hangs on", () => {
  it("keeps the band for the dark and loses it long before the stars", () => {
    const dark = skyAt(clear(1, "winter"), "taiga", 1);
    expect(dark.stars).toBeGreaterThan(0.9);
    expect(dark.galaxy).toBeGreaterThan(0.9);
    // Civil twilight still has its first stars out and no galaxy worth
    // drawing: the band is a glow a shade over the sky's own floor, and a
    // twilight sky is nowhere near that floor.
    const dusk = skyAt(clear(18.6, "autumn"), "taiga", 18.6);
    expect(dusk.stars).toBeGreaterThan(0.2);
    expect(dusk.galaxy).toBeLessThan(dusk.stars / 3);
    const day = skyAt(clear(12, "summer"), "taiga", 12);
    expect(day.stars).toBe(0);
    expect(day.galaxy).toBe(0);
  });

  it("puts the band out under weather before it puts the stars out", () => {
    const clearNight = skyAt(clear(1, "winter"), "taiga", 1);
    const rain = skyAt({ ...clear(1, "winter"), weather: "rain", windSpeed: 3.5 }, "taiga", 1);
    expect(rain.stars).toBeLessThan(clearNight.stars);
    // A star still shows through a thin deck; the band does not, because
    // the thinnest sheet of cloud is brighter than it is.
    expect(rain.galaxy).toBeLessThan(rain.stars);
    // …and a storm's lid leaves neither.
    const storm = skyAt({ ...clear(1, "winter"), weather: "storm", windSpeed: 11 }, "taiga", 1);
    expect(storm.galaxy).toBe(0);
  });
});
