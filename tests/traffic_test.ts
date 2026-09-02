// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAR AGAINST CAR — the one contact in the game where nothing is anchored
// and both ledgers are written at once. A rally stage is driven alone, but
// the field leaves the control ten seconds apart, so catching the crew in
// front is a thing that happens: from there they are a solid that is going
// somewhere, and hitting one costs both of you.
//
// The car is a CAPSULE here rather than the box the wild's solids meet, so
// the tests below care about two things a box would get wrong: a normal
// that stays continuous as one car slides down another's flank, and an
// exchange that conserves momentum instead of inventing it.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  RALLY_BOT,
  TUNING,
  botInput,
  collideCars,
  compileTrack,
  createGame,
  simulateHeat,
  step,
  type CarInput,
  type ContactSide,
  type GameEvent,
  type GameState,
  type TrafficCar,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 4000, feature: "none" } as const];

function freshState(carId?: string): GameState {
  return createGame({
    seed: 3,
    carId,
    skipCountdown: true,
    quiet: true,
    track: compileTrack(3, LONG_STRAIGHT),
  });
}

/** Both sides of a contact, with somewhere for each one's damage to land. */
function pair(aCar?: string, bCar?: string): { a: ContactSide; b: ContactSide } {
  const side = (state: GameState): ContactSide => ({
    spec: state.spec,
    car: state.car,
    events: [] as GameEvent[],
    stats: state.stats,
  });
  return { a: side(freshState(aCar)), b: side(freshState(bCar)) };
}

/** A car's velocity in the world, m/s — forward is (sin h, cos h) and the
 * right axis is (cos h, -sin h). */
function worldVel(side: ContactSide): { x: number; z: number } {
  const { u, w, heading } = side.car;
  return {
    x: u * Math.sin(heading) + w * Math.cos(heading),
    z: u * Math.cos(heading) - w * Math.sin(heading),
  };
}

/** Put `b` `gap` metres ahead of `a` along a's nose, pointing the same way,
 * and leave both level. */
function lineUp(a: ContactSide, b: ContactSide, gap: number): void {
  b.car.heading = a.car.heading;
  b.car.x = a.car.x + Math.sin(a.car.heading) * gap;
  b.car.z = a.car.z + Math.cos(a.car.heading) * gap;
  b.car.y = a.car.y;
}

describe("two cars meeting", () => {
  it("ignores each other with a car's length of road between them", () => {
    const { a, b } = pair();
    lineUp(a, b, 6);
    a.car.u = 30;
    collideCars(a, b);
    expect(a.car.u).toBe(30);
    expect(b.car.u).toBe(0);
    expect(a.events).toHaveLength(0);
  });

  it("a rear-ender shoves the car in front and slows the one behind", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    a.car.u = 26;
    collideCars(a, b);
    expect(a.car.u).toBeLessThan(26);
    expect(b.car.u).toBeGreaterThan(2);
  });

  it("conserves momentum through the exchange", () => {
    const { a, b } = pair("compact", "coupe");
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    a.car.u = 24;
    b.car.u = 8;
    const before = worldVel(a).z * a.spec.mass + worldVel(b).z * b.spec.mass;
    collideCars(a, b);
    const after = worldVel(a).z * a.spec.mass + worldVel(b).z * b.spec.mass;
    // Along the shared heading the pair is a closed system: the impulse is
    // equal and opposite, so whatever one loses the other takes.
    expect(after).toBeCloseTo(before, 4);
  });

  it("costs the heavy car less of its speed than the light one", () => {
    const heavy = pair("coupe", "compact");
    const light = pair("compact", "compact");
    for (const { a, b } of [heavy, light]) {
      lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
      a.car.u = 25;
      collideCars(a, b);
    }
    expect(25 - heavy.a.car.u).toBeLessThan(25 - light.a.car.u);
  });

  it("pushes them out of each other rather than leaving them overlapped", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.5);
    a.car.u = 20;
    const apart = (): number => Math.hypot(b.car.x - a.car.x, b.car.z - a.car.z);
    const before = apart();
    collideCars(a, b);
    expect(apart()).toBeGreaterThan(before);
  });

  it("folds panels on BOTH cars, nose on one and tail on the other", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.4);
    a.car.u = 28;
    collideCars(a, b);
    // Zone 0 is the nose, zone 4 the tail (state.ts's DAMAGE_ZONES ring).
    expect(a.car.damage.zones[0]).toBeGreaterThan(0);
    expect(b.car.damage.zones[4]).toBeGreaterThan(0);
    expect(a.events.some((e) => e.type === "impact")).toBe(true);
    expect(b.events.some((e) => e.type === "impact")).toBe(true);
  });

  it("leaves a gentle nudge as a nudge — no crush, no event", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    // Under the scuff floor the contact still separates them, but nothing
    // is damaged: rolling up behind somebody is not an accident.
    a.car.u = TUNING.collision.scuffSpeed - 0.5;
    collideCars(a, b);
    expect(a.car.damage.wear).toBe(0);
    expect(b.car.damage.wear).toBe(0);
    expect(a.events).toHaveLength(0);
    expect(b.events).toHaveLength(0);
  });

  it("puts a car ROUND when the hit lands off its centre", () => {
    const { a, b } = pair();
    // A tap on the back corner: alongside and a little behind, closing on
    // the flank rather than on the tail.
    b.car.heading = a.car.heading;
    const right = { x: Math.cos(a.car.heading), z: -Math.sin(a.car.heading) };
    b.car.x = a.car.x + right.x * 1.4 + Math.sin(a.car.heading) * 1.6;
    b.car.z = a.car.z + right.z * 1.4 + Math.cos(a.car.heading) * 1.6;
    b.car.y = a.car.y;
    a.car.u = 30;
    a.car.w = 6;
    collideCars(a, b);
    expect(Math.abs(b.car.yawRate)).toBeGreaterThan(0.05);
  });

  it("never reaches a car that is flying over the top of it", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength);
    b.car.y = a.car.y + TUNING.collision.cars.reach + 0.2;
    a.car.u = 30;
    collideCars(a, b);
    expect(a.car.u).toBe(30);
    expect(b.car.u).toBe(0);
  });

  it("does nothing to a pair already separating", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength);
    b.car.u = 20;
    collideCars(a, b);
    expect(b.car.u).toBe(20);
    expect(a.car.u).toBe(0);
  });

  it("is a scrape, not a weld, down a flank at speed", () => {
    const { a, b } = pair();
    // Side by side, a hair inside each other, both travelling fast: the
    // pair must come apart still going, with the speed along the contact
    // largely intact.
    b.car.heading = a.car.heading;
    const right = { x: Math.cos(a.car.heading), z: -Math.sin(a.car.heading) };
    const overlap = TUNING.collision.halfWidth * 2 - 0.15;
    b.car.x = a.car.x + right.x * overlap;
    b.car.z = a.car.z + right.z * overlap;
    b.car.y = a.car.y;
    a.car.u = 34;
    a.car.w = 3;
    b.car.u = 32;
    collideCars(a, b);
    expect(a.car.u).toBeGreaterThan(30);
    expect(b.car.u).toBeGreaterThan(30);
  });

  it("takes two cars out of each other even when neither is closing", () => {
    // A pair that has stopped closing is still a pair inside each other,
    // and nothing else in the model will ever separate them: two rivals
    // ground along a corner side by side and sat most of a body width
    // overlapped for as long as neither steered away. So the POSITION is
    // corrected whatever the relative speed is, and only the impulse and
    // the bodywork wait for a real hit — hence no events here.
    //
    // It is not what keeps a whole field from exploding off one grid
    // sample: every rival is built on the same start sample, and what makes
    // that safe is that a crew still in the start control is not ON THE
    // ROAD, so no contact between them is ever asked about (`onRoad`).
    const { a, b } = pair();
    b.car.x = a.car.x;
    b.car.z = a.car.z;
    b.car.heading = a.car.heading;
    collideCars(a, b);
    const apart = Math.hypot(a.car.x - b.car.x, a.car.z - b.car.z);
    expect(apart).toBeCloseTo(TUNING.collision.halfWidth * 2, 6);
    expect(a.events).toHaveLength(0);
  });
});

describe("a contact inside a real run", () => {
  it("takes a driven car's speed and hands some of it to the one hit", () => {
    const behind = freshState();
    const ahead = freshState();
    const side = (state: GameState): ContactSide => ({
      spec: state.spec,
      car: state.car,
      events: [] as GameEvent[],
      stats: state.stats,
    });
    const a = side(behind);
    const b = side(ahead);
    // Four seconds of throttle to get the chasing car up to pace, with the
    // car in front parked a stage's width down the road, then walked back
    // onto its bumper.
    for (let i = 0; i < 480; i++) step(behind, { ...NEUTRAL_INPUT, throttle: 1 });
    const pace = behind.car.u;
    expect(pace).toBeGreaterThan(15);
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.2);
    collideCars(a, b);
    expect(behind.car.u).toBeLessThan(pace);
    expect(ahead.car.u).toBeGreaterThan(1);
    expect(behind.stats.impacts).toBe(1);
    expect(ahead.stats.impacts).toBe(1);
  });
});

// ── WHAT A BOT DOES ABOUT IT ──────────────────────────────────────────────
// The contact model above is what happens once two cars have found each
// other. This is the half that decides whether they do: the bot's traffic
// eyes and the two knobs of temperament in front of them (bot.ts). A stage
// driven alone must come out untouched by any of it — that is the guarantee
// the whole `make sim` table rests on — and past `AGGRO.clean` a crew has to
// actually arrive in somebody's door rather than merely intend to.

/** Both cars on one long straight, one of them held at `pace` and blind, the
 * other closing on it with `profile`'s temper. Returns how close they got,
 * how far the slow one was shoved off its line, and whether the move was
 * made. */
function overtake(aggression: number, overtake: number) {
  const track = compileTrack(7, [{ kind: "straight", length: 4000, feature: "none" } as const]);
  const car = (): GameState =>
    createGame({ seed: 7, carId: "compact", skipCountdown: true, quiet: true, track });
  const seen = (s: GameState): TrafficCar => ({
    x: s.car.x,
    z: s.car.z,
    u: s.car.u,
    lateral: s.lateral,
  });
  const chaser = car();
  const held = car();
  // The car in front is a slow crew driving its own line and looking at
  // nobody: an obstacle with a steering wheel.
  const cruise = (s: GameState): CarInput => {
    const drive = botInput(s);
    return { ...drive, throttle: s.car.u < 30 ? 0.85 : 0, brake: 0, handbrake: false };
  };
  for (let i = 0; i < 600; i++) step(held, cruise(held));

  const profile = { ...RALLY_BOT, aggression, overtake };
  const line = held.lateral;
  let apart = Infinity;
  let shoved = 0;
  for (let i = 0; i < 3600; i++) {
    const drive = botInput(chaser, profile, [seen(held)]);
    // Held six m/s quicker than the car in front — a race's closing speed,
    // not a straight-line runaway, so the two are alongside long enough for
    // a temper to be worth having.
    step(chaser, { ...drive, throttle: chaser.car.u < 36 ? drive.throttle : 0 });
    step(held, cruise(held));
    const gap = Math.hypot(chaser.car.x - held.car.x, chaser.car.z - held.car.z);
    if (gap < 5) {
      collideCars(
        { spec: chaser.spec, car: chaser.car, events: [], stats: chaser.stats },
        { spec: held.spec, car: held.car, events: [], stats: held.stats },
      );
    }
    apart = Math.min(apart, gap);
    shoved = Math.max(shoved, Math.abs(held.lateral - line));
  }
  return { apart, shoved, passed: chaser.progressS > held.progressS };
}

describe("a bot with cars around it", () => {
  it("drives a stage handed no traffic exactly as it always did", () => {
    const state = createGame({
      seed: 4,
      carId: "compact",
      skipCountdown: true,
      quiet: true,
      track: compileTrack(4, LONG_STRAIGHT),
    });
    const alone = createGame({
      seed: 4,
      carId: "compact",
      skipCountdown: true,
      quiet: true,
      track: compileTrack(4, LONG_STRAIGHT),
    });
    for (let i = 0; i < 1200; i++) {
      step(state, botInput(state, RALLY_BOT, []));
      step(alone, botInput(alone));
    }
    expect(state.car.x).toBe(alone.car.x);
    expect(state.car.z).toBe(alone.car.z);
    expect(state.car.u).toBe(alone.car.u);
  });

  it("goes round the car in front without touching it when it is clean", () => {
    const clean = overtake(0, 0.8);
    expect(clean.passed).toBe(true);
    // Two bodies meet at `halfWidth × 2`; a clean crew leaves air outside it.
    expect(clean.apart).toBeGreaterThan(TUNING.collision.halfWidth * 2 + 0.8);
    expect(clean.shoved).toBeLessThan(0.2);
  });

  it("runs closer the more temper it has, and eventually leans on them", () => {
    const mild = overtake(0.1, 0.8);
    const firm = overtake(0.5, 0.8);
    const nasty = overtake(1, 0.8);
    expect(firm.apart).toBeLessThan(mild.apart);
    expect(nasty.apart).toBeLessThan(firm.apart);
    // At the top of the scale it is not a pass any more: the bodies are
    // touching, and the car being passed ends up somewhere it did not choose.
    expect(nasty.apart).toBeLessThan(TUNING.collision.halfWidth * 2 + 0.1);
    expect(nasty.shoved).toBeGreaterThan(1);
    expect(mild.shoved).toBeLessThan(0.2);
  });

  it("never crosses through the car it is passing to get to the other side", () => {
    // The chaser starts on the crown behind a car on the crown, so both
    // sides of the road are equally open. Whichever it picks, it must not
    // arrive there through the other car.
    for (const aggression of [0, 0.5, 1]) {
      const { apart } = overtake(aggression, 0.8);
      // Inside a half body is a car that has been driven through rather than
      // leaned on: the contact model pushes them apart at a full one.
      expect(apart).toBeGreaterThan(TUNING.collision.halfWidth);
    }
  });
});

// ── THE WHOLE GRID ────────────────────────────────────────────────────────
// `simulateRace` is the instrument the temper model is tuned with (`make
// race`), and an instrument that is not deterministic measures nothing.

describe("a headless heat", () => {
  it("is the same race every time it is run", () => {
    const one = simulateHeat({ seed: 12, difficulty: "hard", cars: 6, length: "short" });
    const two = simulateHeat({ seed: 12, difficulty: "hard", cars: 6, length: "short" });
    expect(one.entries.map((e) => [e.crew.id, e.place, e.time, e.rubs, e.dealt])).toEqual(
      two.entries.map((e) => [e.crew.id, e.place, e.time, e.rubs, e.dealt]),
    );
  });

  it("classifies the finishers by time and the retirements behind them", () => {
    const heat = simulateHeat({ seed: 12, difficulty: "medium", cars: 6, length: "short" });
    // `cars` is the GRID the game would stand up, and its back slot is the
    // player's — empty in a heat, so a six-car grid races five crews.
    expect(heat.entries).toHaveLength(5);
    expect(heat.entries.map((e) => e.place)).toEqual([1, 2, 3, 4, 5]);
    const home = heat.entries.filter((e) => e.finished);
    expect(home.length).toBeGreaterThan(0);
    for (let i = 1; i < home.length; i++)
      expect(home[i].time).toBeGreaterThanOrEqual(home[i - 1].time);
    // Anybody who never reached the line is behind everybody who did.
    for (const entry of heat.entries.filter((e) => !e.finished)) {
      expect(entry.place).toBeGreaterThan(home.length);
    }
  });

  it("books what the field did to itself, and books it only once per contact", () => {
    const heat = simulateHeat({ seed: 12, difficulty: "hard", cars: 8, length: "short" });
    const rubs = heat.entries.reduce((sum, e) => sum + e.rubs, 0);
    // A grid this deep cannot get down a stage without finding itself.
    expect(rubs).toBeGreaterThan(0);
    // Every contact has two sides, so the field's rubs come in pairs.
    expect(rubs % 2).toBe(0);
    for (const entry of heat.entries) {
      // A crew can only have driven into a contact it was in.
      expect(entry.shunts).toBeLessThanOrEqual(entry.rubs);
      expect(entry.dealt).toBeGreaterThanOrEqual(0);
      expect(entry.taken).toBeGreaterThanOrEqual(0);
      // Panel only ever lands on the ledger of a crew that drove into
      // something: no shunts, no damage attributed either way.
      if (entry.shunts === 0) {
        expect(entry.dealt).toBe(0);
        expect(entry.taken).toBe(0);
      }
    }
  });
});

// How much panel a DIFFICULTY actually folds is an emergent number — a
// handful of shunts over a whole grid — and one race is one accident. It is
// measured with `make race` over several seeds and read as a table, not
// asserted here: the mechanism behind it is what these tests pin (a temper
// makes contact, above; a difficulty sets the temper, `tests/rivals_test.ts`),
// and a threshold on the sum would be a flake rather than a guard.
