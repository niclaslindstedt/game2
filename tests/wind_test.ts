// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wind: seeded per stage from the weather band, gusting deterministically,
// and leaning on the car — a crosswind pushes the line sideways, a head/tail
// wind moves the top end. Runs on a synthetic dead-straight stage; the wind
// itself is overridden through the public env state so each scenario blows
// exactly the wind it is measuring.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameState,
  type SegmentPlan,
  type Weather,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1500, feature: "none" }];

function game(): GameState {
  const track = { ...compileTrack(0, STRAIGHT), width: 120 };
  return createGame({ seed: 0, skipCountdown: true, track });
}

/** Point the stage's wind somewhere exact, mean speed `speed`, no seeded
 * surprises — gustPhase 0 keeps runs comparable across scenarios. */
function blow(state: GameState, dir: number, speed: number): void {
  state.env.windDir = dir;
  state.env.windSpeed = speed;
  state.env.gustPhase = 0;
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): void {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
}

describe("the wind", () => {
  it("a crosswind pushes the car off its line; calm air does not", () => {
    const windy = game();
    blow(windy, Math.PI / 2, 10); // toward +x: pure crosswind for a +z heading
    run(windy, { throttle: 1 }, 8);

    const calm = game();
    blow(calm, Math.PI / 2, 0);
    run(calm, { throttle: 1 }, 8);

    expect(Math.abs(calm.car.x)).toBeLessThan(0.1);
    expect(windy.car.x).toBeGreaterThan(1);
  });

  it("a tailwind stretches the top end, a headwind trims it", () => {
    const tail = game();
    blow(tail, 0, 10); // toward +z: dead astern
    run(tail, { throttle: 1 }, 20);

    const head = game();
    blow(head, Math.PI, 10);
    run(head, { throttle: 1 }, 20);

    expect(tail.car.u).toBeGreaterThan(head.car.u + 0.5);
  });

  it("seeds the wind from the weather band, deterministically", () => {
    for (const weather of ["clear", "rain", "storm"] as Weather[]) {
      const [min, max] = TUNING.wind.speed[weather];
      const a = createGame({ seed: 7, env: { weather } });
      const b = createGame({ seed: 7, env: { weather } });
      expect(a.env.windSpeed).toBeGreaterThanOrEqual(min);
      expect(a.env.windSpeed).toBeLessThanOrEqual(max);
      expect(a.env.windDir).toBe(b.env.windDir);
      expect(a.env.windSpeed).toBe(b.env.windSpeed);
    }
  });

  it("defaults to a clear day and carries the chosen conditions", () => {
    const plain = createGame({ seed: 1 });
    expect(plain.env.timeOfDay).toBe("day");
    expect(plain.env.weather).toBe("clear");

    const night = createGame({ seed: 1, env: { timeOfDay: "night", weather: "storm" } });
    expect(night.env.timeOfDay).toBe("night");
    expect(night.env.weather).toBe("storm");
  });

  it("updates the readable wind vector while the run stands on the grid", () => {
    const state = createGame({ seed: 3, env: { weather: "storm" } });
    const before = { ...state.wind };
    for (let i = 0; i < TUNING.physicsHz; i++) step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("intro");
    const moved =
      Math.abs(state.wind.x - before.x) > 1e-6 || Math.abs(state.wind.z - before.z) > 1e-6;
    expect(moved).toBe(true);
  });
});
