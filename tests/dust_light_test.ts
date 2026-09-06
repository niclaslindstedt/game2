// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAMPS THE DUST SEES (pwa/src/game/dust-light.ts): a register of light
// sources refilled once a frame and summed per particle in a vertex shader.
// There is no GPU here, but the register is plain arrays and a count, and
// what CAN be held is the part a frame's cost rides on: the count the
// shader leaves the loop at tracks what was written, the video options'
// cap drops the farthest cars rather than the player, and a lamp too dim
// to change a pixel takes no slot.

import { afterEach, describe, expect, it } from "vitest";

import {
  clearDustLamps,
  DUST_LAMP_UNIFORMS,
  DUST_LAMPS,
  lightDust,
  setDustLampCap,
} from "../pwa/src/game/dust-light.ts";

const car = (x: number) => ({ x, y: 0, z: 0, heading: 0 });

/** How many slots carry any light at all: the count the shader is handed
 * has to agree with the glow array behind it, or the loop reads black. */
function lit(): number {
  const glow = DUST_LAMP_UNIFORMS.uDustLampGlow.value;
  let n = 0;
  for (let i = 0; i < DUST_LAMPS; i++) {
    if (glow[i * 3] + glow[i * 3 + 1] + glow[i * 3 + 2] > 0) n++;
  }
  return n;
}

afterEach(() => {
  setDustLampCap(DUST_LAMPS);
  clearDustLamps();
});

describe("the register the dust is lit from", () => {
  it("hands the shader the count of what was written, and nothing by day", () => {
    clearDustLamps();
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(0);
    lightDust(car(0), 1, 1);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(2);
    expect(lit()).toBe(2);
    // Lamps at noon throw nothing, and a lamp throwing nothing is not a
    // slot: the loop has nothing to run.
    clearDustLamps();
    lightDust(car(0), 0, 0);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(0);
  });

  it("fills front to back and drops what will not fit", () => {
    clearDustLamps();
    for (let i = 0; i < DUST_LAMPS; i++) lightDust(car(i * 10), 1, 1);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(DUST_LAMPS);
    expect(lit()).toBe(DUST_LAMPS);
  });

  it("caps at what the LIGHTING row allows, player first", () => {
    setDustLampCap(2);
    clearDustLamps();
    lightDust(car(0), 1, 1);
    lightDust(car(30), 1, 1);
    lightDust(car(60), 1, 1);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(2);
    // The two that made it are the first car's — its head source is at its
    // own x plus the lamp's own offset, and the second car is thirty metres
    // up the road.
    const spot = DUST_LAMP_UNIFORMS.uDustLampSpot.value;
    expect(Math.abs(spot[0])).toBeLessThan(5);
    expect(Math.abs(spot[4])).toBeLessThan(5);
  });

  it("holds the cap to the register's own size", () => {
    setDustLampCap(DUST_LAMPS * 4);
    clearDustLamps();
    for (let i = 0; i < DUST_LAMPS; i++) lightDust(car(i * 10), 1, 1);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(DUST_LAMPS);
    setDustLampCap(-3);
    clearDustLamps();
    lightDust(car(0), 1, 1);
    expect(DUST_LAMP_UNIFORMS.uDustLampCount.value).toBe(0);
  });
});
