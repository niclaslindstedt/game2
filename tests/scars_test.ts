// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCARS — what a driver remembers about the place that has already
// ended their run, and the absorbing state it exists to break.
//
// A respawn hands the car back to the driver at the last split board with
// everything about it reset. A driver who has learned nothing from the last
// two hundred metres therefore drives them again exactly as they drove them
// the first time, leaves the road at the same metre, and is put back at the
// same board — until the clock runs out. These tests are the two halves of
// the way out: the memory itself says the right thing, and a real field on a
// real stage does not come back to one place forever.

import { describe, expect, it } from "vitest";

import {
  compileStage,
  compileTrack,
  createField,
  createGame,
  onRoad,
  scarPlan,
  scarsFor,
  stepField,
  TUNING,
  type GameState,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 4000, feature: "none" } as const];

function freshState(): GameState {
  return createGame({
    seed: 3,
    skipCountdown: true,
    quiet: true,
    track: compileTrack(3, LONG_STRAIGHT),
  });
}

/** What a car's braking is worth to the corner plan — the same estimate
 * `botInput` hands the scars. */
function brakingOf(state: GameState): number {
  return 2 * state.spec.brake * 0.7;
}

/** Drive the memory through one run coming undone: the car is here at this
 * speed, then it is off the road, then it is put back at `home`. */
function comeUnstuck(state: GameState, at: number, u: number, home: number): void {
  state.offRoad = false;
  state.progressS = at;
  state.car.u = u;
  scarsFor(state);
  state.offRoad = true;
  state.stats.respawns += 1;
  state.progressS = home;
  state.car.u = TUNING.offTrack.respawnSpeed;
  state.offRoad = false;
  scarsFor(state);
}

describe("what a driver remembers", () => {
  it("knows nothing about a stage nothing has gone wrong on", () => {
    const state = freshState();
    const scars = scarsFor(state);
    expect(scars.list).toHaveLength(0);
    expect(scarPlan(scars, state, brakingOf(state))).toBe(Infinity);
  });

  it("plans the place that ended the run at a fraction of the speed that ended it", () => {
    const state = freshState();
    comeUnstuck(state, 500, 30, 300);
    const scars = scarsFor(state);
    expect(scars.list).toHaveLength(1);

    // Standing on the spot itself, the plan is well under the speed that was
    // being carried through it — and still a speed rather than a stop.
    state.progressS = 500;
    const cap = scarPlan(scars, state, brakingOf(state));
    expect(cap).toBeLessThan(30);
    expect(cap).toBeGreaterThan(5);
  });

  it("takes another slice off every time the same place has them again", () => {
    const state = freshState();
    comeUnstuck(state, 500, 30, 300);
    state.progressS = 500;
    const once = scarPlan(scarsFor(state), state, brakingOf(state));

    comeUnstuck(state, 495, 20, 300);
    state.progressS = 500;
    const twice = scarPlan(scarsFor(state), state, brakingOf(state));

    // The same place, so it is the same scar deepened rather than a second
    // one beside it — and the driver arrives slower than they did last time.
    expect(scarsFor(state).list).toHaveLength(1);
    expect(twice).toBeLessThan(once);
  });

  it("brakes for a scar down the road instead of crawling to it", () => {
    const state = freshState();
    comeUnstuck(state, 2000, 30, 300);
    const scars = scarsFor(state);

    // A kilometre short of it there is nothing to do about it yet; on top of
    // it there is.
    state.progressS = 1000;
    const far = scarPlan(scars, state, brakingOf(state));
    state.progressS = 2000;
    const here = scarPlan(scars, state, brakingOf(state));
    expect(far).toBeGreaterThan(50);
    expect(here).toBeLessThan(far);
  });

  it("forgets a scar the road has run past — a sprint only goes one way", () => {
    const state = freshState();
    comeUnstuck(state, 500, 30, 300);
    const scars = scarsFor(state);
    state.progressS = 1200;
    expect(scarPlan(scars, state, brakingOf(state))).toBe(Infinity);
  });
});

/** How near two excursions have to be to count as the same place, m. */
const SAME_PLACE = 40;

/** The two stages whose fields used to have a crew stuck in a loop: one
 * crew was put back at the same board fifteen times on the first and
 * eighteen on the second, and neither ever saw the finish. */
const TRAPS = [
  { seed: 5, difficulty: "easy" as const },
  { seed: 14, difficulty: "hard" as const },
];

describe("a field on a stage that has caught somebody out", () => {
  it("never sends a crew back to the same place forever", () => {
    for (const trap of TRAPS) {
      const field = createField(
        compileStage(trap.seed, "medium"),
        { difficulty: trap.difficulty, cars: 8, massStart: true, contact: true },
        {
          seed: trap.seed,
          laps: 1,
          timeOfDay: "day",
          weather: "clear",
          season: "summer",
        },
      );
      // WHERE THE RUN CAME UNDONE, not where it was put back. Those are two
      // different places and only the first one is the bug: a respawn puts
      // the car at the last SPLIT BOARD, and boards are hundreds of metres
      // apart, so a crew having a bad sector is booked at one board over and
      // over however far up the road each excursion actually happened. The
      // absorbing state this whole module exists to break is the other
      // thing — the same two hundred metres driven the same way and left at
      // the same metre — so that is what is counted.
      const spots = new Map<(typeof field.runs)[number], number[]>();
      const onRoadAt = new Map<(typeof field.runs)[number], number>();
      field.runs.forEach((run) => {
        spots.set(run, []);
        onRoadAt.set(run, 0);
      });
      const steps = Math.ceil(400 / TUNING.dt);
      for (let i = 0; i < steps; i++) {
        if (!field.runs.some(onRoad)) break;
        stepField(field, null, (run, events) => {
          for (const event of events) {
            // Read before this step moved the car: by the time the event is
            // handed over, `progressS` is already back at the board.
            if (event.type === "respawn") spots.get(run)!.push(onRoadAt.get(run)!);
          }
        });
        for (const run of field.runs) if (onRoad(run)) onRoadAt.set(run, run.state.progressS);
      }
      for (const [run, places] of spots) {
        for (const place of places) {
          const again = places.filter((other) => Math.abs(other - place) < SAME_PLACE).length;
          expect(
            again,
            `${run.entry.crew.id} on seed ${trap.seed} ${trap.difficulty}, at ${place.toFixed(0)}m`,
          ).toBeLessThan(4);
        }
      }
    }
  });
});
