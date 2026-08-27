// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R22 — the circuit: a stage that closes onto its own start line, and the
// laps that closing makes possible. Two halves, because the feature has
// two: the GEOMETRY (the road comes back, exactly, without breaking any of
// the rules a sprint obeys) and the RUN (crossing the line books a lap and
// starts the next one, and only the last one finishes).
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  STAGE_RULES as R,
  botInput,
  circuitLapBand,
  compileStage,
  createGame,
  generateStage,
  simulateStage,
  step,
  type FiniteStageLength,
  type GameEvent,
  type Track,
} from "@engine";

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 41 + 1);
const LENGTHS: FiniteStageLength[] = ["short", "medium", "long", "xlong"];

/** Compiled once per (seed, length) and shared: the assertions below read
 * the same stages over and over, and a circuit is a search, not a lookup. */
const BUILT = new Map<string, Track>();
function circuit(seed: number, length: FiniteStageLength = "medium"): Track {
  const key = `${seed}/${length}`;
  const built = BUILT.get(key) ?? compileStage(seed, length, undefined, "circuit");
  BUILT.set(key, built);
  return built;
}

/** How far the compiled road's last sample lands from its first, m. The
 * closure is solved against the compiler's own walk, so this is the number
 * that says whether the loop actually shut — a probe-space closure that
 * misses by meters would leave a hole in the road at the start line. */
function seam(track: Track): number {
  const first = track.samples[0];
  const last = track.samples[track.samples.length - 1];
  // The first sample sits one step INTO the stage (the compiler pushes a
  // sample after each step), so the road ends where that step began.
  return Math.hypot(
    last.x - (first.x - Math.sin(first.heading) * track.step),
    last.z - (first.z - Math.cos(first.heading) * track.step),
  );
}

describe("R22 — the circuit's geometry", () => {
  it("is deterministic per seed, and different per seed", () => {
    expect(generateStage(7, "medium", undefined, "circuit")).toEqual(
      generateStage(7, "medium", undefined, "circuit"),
    );
    expect(generateStage(7, "medium", undefined, "circuit")).not.toEqual(
      generateStage(8, "medium", undefined, "circuit"),
    );
  });

  it("is a different stage from the sprint the same seed builds", () => {
    expect(generateStage(7, "medium")).not.toEqual(
      generateStage(7, "medium", undefined, "circuit"),
    );
    expect(compileStage(7, "medium").circuit).toBe(false);
    expect(circuit(7).circuit).toBe(true);
  });

  it("closes onto its own start line, position and heading", () => {
    for (const length of LENGTHS) {
      for (const seed of SEEDS) {
        const track = circuit(seed, length);
        expect(seam(track), `seed ${seed} (${length}) leaves a seam`).toBeLessThan(0.5);
        const first = track.samples[0];
        const last = track.samples[track.samples.length - 1];
        // Headings agree modulo a whole turn: a lap is one full circle.
        const turns = (last.heading - first.heading) / (Math.PI * 2);
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6);
        expect(Math.abs(Math.round(turns))).toBe(1);
      }
    }
  }, 30_000);

  it("R1/R2 — the start line has a straight on both sides of it", () => {
    for (const seed of SEEDS) {
      const plans = generateStage(seed, "medium", undefined, "circuit");
      const first = plans[0];
      const last = plans[plans.length - 1];
      expect(first.kind).toBe("straight");
      expect(first.feature).toBe("none");
      expect(first.length).toBeGreaterThanOrEqual(R.openingStraight);
      expect(last.kind).toBe("straight");
      expect(last.feature).toBe("none");
      expect(last.length).toBeGreaterThanOrEqual(R.closingStraight);
    }
  });

  it("R3 — the solved closure's corners come out of the turn vocabulary", () => {
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed, "medium", undefined, "circuit")) {
        if (plan.kind !== "turn") continue;
        const vocab = R.turn[plan.severity ?? "soft"];
        expect(plan.radius).toBeGreaterThanOrEqual(vocab.radius.min - 1e-9);
        expect(plan.radius).toBeLessThanOrEqual(vocab.radius.max + 1e-9);
        const angle = plan.length / (plan.radius ?? 1);
        expect(angle).toBeGreaterThanOrEqual(vocab.angle.min - 1e-9);
        expect(angle).toBeLessThanOrEqual(vocab.angle.max + 1e-9);
      }
    }
  });

  it("R10 — the lap never crosses itself, measured round the loop", () => {
    for (const seed of SEEDS) {
      const track = circuit(seed);
      const samples = track.samples;
      const stride = 3;
      for (let i = 0; i < samples.length; i += stride) {
        for (let k = i + stride; k < samples.length; k += stride) {
          const gap = samples[k].s - samples[i].s;
          // Arc distance on a ring is cyclic — the road running back into
          // the start line is that line's neighbour, not a crossing.
          if (Math.min(gap, track.length - gap) < 80) continue;
          const d = Math.hypot(samples[k].x - samples[i].x, samples[k].z - samples[i].z);
          expect(d, `seed ${seed} crosses itself at ${samples[i].s.toFixed(0)} m`).toBeGreaterThan(
            R.minSelfDistance * 0.9,
          );
        }
      }
    }
  }, 30_000);

  it("R11 — a lap lands inside its length's lap band", () => {
    for (const length of LENGTHS) {
      const band = circuitLapBand(length);
      for (const seed of SEEDS) {
        const track = circuit(seed, length);
        expect(track.length).toBeGreaterThanOrEqual(band.min);
        expect(track.length).toBeLessThanOrEqual(band.max);
      }
    }
  }, 30_000);

  it("cuts a length band into laps, over a floor that keeps a lap a lap", () => {
    for (const length of LENGTHS) {
      const band = circuitLapBand(length);
      const sprint = R.stageLengths[length].band;
      // A lap is a road you get to learn, so it is shorter than the sprint
      // of the same name — and never shorter than the floor, whatever the
      // arithmetic would rather say.
      expect(band.max).toBeLessThanOrEqual(sprint.max);
      expect(band.min).toBeGreaterThanOrEqual(R.circuit.minLap);
      // Where the floor does not bind, the RACE is the sprint's own band:
      // the same minutes of driving, cut into laps rather than added to.
      if (sprint.min / R.circuit.laps >= R.circuit.minLap) {
        expect(band.min * R.circuit.laps).toBeCloseTo(sprint.min, 6);
        expect(band.max * R.circuit.laps).toBeCloseTo(sprint.max, 6);
      }
    }
  });
});

describe("R22 — racing a circuit over laps", () => {
  /** Drive the bot until the run finishes, collecting what it emitted. */
  function race(seed: number, laps: number): { events: GameEvent[]; finalLap: number } {
    const state = createGame({
      seed,
      length: "short",
      shape: "circuit",
      laps,
      skipCountdown: true,
    });
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 400 && state.phase !== "finished"; i++) {
      events.push(...step(state, botInput(state)));
    }
    return { events, finalLap: state.lap };
  }

  it("books a lap per crossing and finishes on the last one", () => {
    const { events, finalLap } = race(3, 3);
    const laps = events.filter((e) => e.type === "lap");
    const finishes = events.filter((e) => e.type === "finish");
    expect(laps.map((e) => (e as { lap: number }).lap)).toEqual([1, 2]);
    expect(finishes).toHaveLength(1);
    expect(finalLap).toBe(3);
  }, 30_000);

  it("keeps one clock running: the laps add up to the total", () => {
    const r = simulateStage({ seed: 3, length: "short", shape: "circuit", maxTime: 400 });
    expect(r.finished).toBe(true);
    expect(r.laps).toBe(R.circuit.laps);
    expect(r.lapTimes).toHaveLength(R.circuit.laps);
    const sum = r.lapTimes.reduce((a, t) => a + t, 0);
    expect(sum).toBeCloseTo(r.time, 6);
    expect(r.raceLength).toBeCloseTo(r.trackLength * R.circuit.laps, 6);
  }, 30_000);

  it("drives the whole race, not one lap of it", () => {
    const one = simulateStage({ seed: 3, length: "short", shape: "circuit", laps: 1 });
    const three = simulateStage({ seed: 3, length: "short", shape: "circuit", laps: 3 });
    expect(three.time).toBeGreaterThan(one.time * 2.4);
    expect(three.stats.topSpeed).toBeGreaterThanOrEqual(one.stats.topSpeed);
  }, 30_000);

  it("sends progress back to the grid at the line instead of past the end", () => {
    const state = createGame({
      seed: 3,
      length: "short",
      shape: "circuit",
      skipCountdown: true,
    });
    let crossings = 0;
    for (let i = 0; i < 120 * 400 && state.phase !== "finished"; i++) {
      const before = state.progressIndex;
      if (step(state, botInput(state)).some((e) => e.type === "lap")) {
        crossings += 1;
        expect(before).toBeGreaterThan(state.track.samples.length - 3);
        expect(state.progressIndex).toBe(0);
      }
    }
    expect(crossings).toBe(2);
  }, 30_000);

  it("never laps a stage that does not come back — a sprint is one lap", () => {
    const state = createGame({ seed: 3, length: "short", laps: 5, skipCountdown: true });
    expect(state.laps).toBe(1);
    const r = simulateStage({ seed: 3, length: "short", laps: 5 });
    expect(r.laps).toBe(1);
    expect(r.lapTimes).toHaveLength(1);
    expect(r.events.filter((e) => e.type === "lap")).toHaveLength(0);
  }, 30_000);

  it("holds the lap clock on the grid, like the total clock", () => {
    const state = createGame({ seed: 3, length: "short", shape: "circuit" });
    for (let i = 0; i < 60; i++) step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("countdown");
    expect(state.lap).toBe(1);
    expect(state.raceTime).toBe(0);
    expect(state.lapStart).toBe(0);
  });
});
