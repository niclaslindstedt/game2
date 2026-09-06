// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE TUNNEL LINING: the vault the renderer draws through a bore,
// held to the rule book. The lining is not the wall the car stops at (the
// engine's `tunnelWalls` is), but it is what the driver sees, and a vault
// drawn lower than the clearance the rule promises is a tunnel a lorry
// would not fit — so the profile is a pure function and these read it.
import { describe, expect, it } from "vitest";

import {
  GROUND_CELL,
  ROAD_CROSS,
  STAGE_RULES,
  TUNNEL_WALL_OUT,
  compileTrack,
  tunnelTrench,
} from "@engine";

import { LID, corridorLip, lidHalfWidth } from "../pwa/src/game/tunnel-lid.ts";
import { vaultCeilingAt, vaultProfile, vaultSpan } from "../pwa/src/game/tunnel.ts";

const T = STAGE_RULES.tunnel;
/** Half widths across the stage widths the generator builds. */
const HALVES = [5, 6.2, 7, 8.075, 9];

describe("the tunnel lining's vault (R47)", () => {
  it("clears the rule book's clearance over the whole mat", () => {
    for (const half of HALVES) {
      for (let u = -half; u <= half + 1e-9; u += half / 20) {
        expect(vaultCeilingAt(half, u)).toBeGreaterThanOrEqual(T.clearance);
      }
    }
  });

  it("is highest at the crown and comes down to the spring line at the walls", () => {
    for (const half of HALVES) {
      const crown = vaultCeilingAt(half, 0);
      const wall = vaultCeilingAt(half, vaultSpan(half));
      expect(crown).toBeGreaterThan(wall);
      expect(wall).toBeLessThan(T.clearance);
      expect(vaultCeilingAt(half, half * 0.5)).toBeLessThan(crown);
    }
  });

  it("stands its walls where the engine stands them", () => {
    for (const half of HALVES) {
      const profile = vaultProfile(half);
      const left = profile[0];
      const right = profile[profile.length - 1];
      expect(left.v).toBe(0);
      expect(right.v).toBe(0);
      expect(left.u).toBeCloseTo(-(half + TUNNEL_WALL_OUT), 6);
      expect(right.u).toBeCloseTo(half + TUNNEL_WALL_OUT, 6);
      expect(vaultSpan(half)).toBeCloseTo(half + T.wall, 6);
    }
  });

  it("is symmetric and walks the profile in one direction", () => {
    for (const half of HALVES) {
      const profile = vaultProfile(half);
      const n = profile.length;
      for (let k = 0; k < n; k++) {
        expect(profile[k].u).toBeCloseTo(-profile[n - 1 - k].u, 6);
        expect(profile[k].v).toBeCloseTo(profile[n - 1 - k].v, 6);
        if (k > 0) expect(profile[k].u).toBeGreaterThanOrEqual(profile[k - 1].u - 1e-9);
      }
    }
  });
});

describe("the lid over a bore (R47)", () => {
  const track = compileTrack(3, [{ kind: "straight", length: 400, feature: "none" }]);
  const nominal = track.width / 2 + ROAD_CROSS.reach;

  it("reaches a lattice cell and a little past the corridor's lip", () => {
    expect(LID.margin).toBeGreaterThan(GROUND_CELL);
    for (let i = 0; i < track.samples.length; i += 7) {
      expect(lidHalfWidth(track, i)).toBeCloseTo(
        corridorLip(track, i) + tunnelTrench(track.width) + LID.margin,
        9,
      );
    }
  });

  it("is never narrower than the nominal corridor, whatever the gravel wanders", () => {
    for (let i = 0; i < track.samples.length; i++) {
      expect(corridorLip(track, i)).toBeGreaterThanOrEqual(nominal - 1e-9);
    }
  });

  it("widens with a mouth's flare over the engine's own envelope, and not past it", () => {
    const flared = compileTrack(3, [{ kind: "straight", length: 400, feature: "none" }]);
    const at = 100;
    flared.samples[at].shift = 4;
    const wide = corridorLip(flared, at);
    expect(wide).toBeGreaterThanOrEqual(nominal + 4 - 0.5);
    expect(corridorLip(flared, at + LID.lipEnvelope)).toBeCloseTo(wide, 9);
    expect(corridorLip(flared, at + LID.lipEnvelope + 1)).toBeLessThan(wide - 3);
  });
});
