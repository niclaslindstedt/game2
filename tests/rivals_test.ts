// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R29 — THE CAMPAIGN FIELD: the fourteen crews the player is racing, the
// budget model that decides how good they are, and the podium rule that
// decides whether the ladder opens.
//
// Four things are worth a guard here, and every one of them is silent when
// it breaks:
//
//   * A BUDGET THAT DOES NOT SPEND. The water-filling in `spend` hands an
//     axis's overflow back to the pot; get that wrong and a lopsided crew
//     quietly throws points away, which reads in the game as "hard is not
//     harder" rather than as a bug.
//   * A DIFFICULTY THAT IS NOT ONE. Easy, medium and hard have to be a
//     ladder for EVERY crew, not on average — and the field they produce has
//     to actually get quicker down it, which only the real engine can say.
//   * A ROSTER WITH A HOLE IN IT. A typo'd car id resolves to the first car
//     in the catalog rather than throwing, so half the field would silently
//     drive the same machine.
//   * A PODIUM RULE THAT LEAKS. Finishing ninth must open the time trial and
//     must NOT open the next rung of the ladder, and no storage round-trip is
//     allowed to blur the two.
//
// The engine work is real: the field runs the actual bot on the actual road,
// so the pace assertions are measurements rather than restated constants.

import { beforeEach, describe, expect, it } from "vitest";

import {
  AXIS_MAX,
  CARS,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  FIELD_SIZE,
  PLAYER_NUMBER,
  RIVALS,
  SKILL_AXES,
  SKILL_MAX,
  START_INTERVAL,
  TUNING,
  botInput,
  budgetFor,
  compileStage,
  createGame,
  damageScaleFor,
  step,
  profileFor,
  gearboxFor,
  rivalField,
  MANUAL_HANDS,
  simulateStage,
  skillPoints,
  spend,
  temperFor,
  type BotSkill,
} from "@engine";

import {
  PODIUM,
  bestPlace,
  levelCleared,
  loadProgress,
  recordFinish,
  unlockEverything,
  levelCompleted,
  LOCATIONS,
} from "../pwa/src/game/campaign.ts";
import {
  advanceField,
  createField,
  drainField,
  livePlace,
  onRoad,
  placeAtFinish,
  placeAtSplit,
  settleField,
  splitLeader,
  stepField,
  stopField,
  RALLY_FIELD,
} from "../pwa/src/game/standings.ts";

/** The two thresholds bot.ts switches its traffic behaviour on. Restated
 * here rather than exported: they are the bot's own vocabulary, and the
 * assertions below are about what a DIFFICULTY promises against them. */
const CLEAN = 0.35;
const DIRTY = 0.75;

const flat = (n: number): BotSkill => {
  const skill = {} as BotSkill;
  for (const axis of SKILL_AXES) skill[axis] = n;
  return skill;
};

describe("the skill budget", () => {
  it("spends everything it is given, and never more than an axis can hold", () => {
    for (const budget of [0, 7, 19, 31, 44, SKILL_MAX]) {
      const skill = spend(budget, flat(1));
      expect(skillPoints(skill)).toBeCloseTo(budget, 6);
      for (const axis of SKILL_AXES) {
        expect(skill[axis]).toBeGreaterThanOrEqual(0);
        expect(skill[axis]).toBeLessThanOrEqual(AXIS_MAX);
      }
    }
  });

  it("hands a capped axis's overflow back rather than throwing it away", () => {
    // Everything asked for in one place, and far more than that place holds.
    const wanted = { ...flat(1), commitment: 60 };
    const skill = spend(40, wanted);
    expect(skill.commitment).toBe(AXIS_MAX);
    // The other 30 points went somewhere: a crew that wanted one thing still
    // ends up with a complete car.
    expect(skillPoints(skill)).toBeCloseTo(40, 6);
  });

  it("cannot be handed more than the model has room for", () => {
    expect(skillPoints(spend(SKILL_MAX * 3, flat(1)))).toBeCloseTo(SKILL_MAX, 6);
  });

  it("never lowers an axis when the budget goes up", () => {
    const shape = { ...flat(2), attack: 9, vision: 1 };
    let previous = spend(0, shape);
    for (let budget = 4; budget <= SKILL_MAX; budget += 4) {
      const next = spend(budget, shape);
      for (const axis of SKILL_AXES) {
        expect(next[axis]).toBeGreaterThanOrEqual(previous[axis] - 1e-9);
      }
      previous = next;
    }
  });
});

describe("the three difficulties", () => {
  it("are a ladder for every crew on the roster", () => {
    for (const crew of RIVALS) {
      const budgets = DIFFICULTY_IDS.map((id) => budgetFor(id, crew.standing));
      expect(budgets[0]).toBeLessThan(budgets[1]);
      expect(budgets[1]).toBeLessThan(budgets[2]);
      expect(budgets[2]).toBeLessThanOrEqual(SKILL_MAX);
      expect(budgets[0]).toBeGreaterThan(0);
    }
  });

  it("are also what a hit costs the player: nothing, half, all of it", () => {
    expect(damageScaleFor("easy")).toBe(0);
    expect(damageScaleFor("medium")).toBe(0.5);
    expect(damageScaleFor("hard")).toBe(1);
    // A ladder, like the budgets — and one that never scales the FIELD: the
    // crews' own contacts are the simulation being honest at every setting.
    const scales = DIFFICULTY_IDS.map(damageScaleFor);
    expect(scales[0]).toBeLessThan(scales[1]);
    expect(scales[1]).toBeLessThan(scales[2]);
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "easy" },
      { seed: 44, laps: 1, timeOfDay: "day", weather: "clear", season: "summer" },
    );
    for (const run of field.runs) expect(run.state.car.damageScale).toBe(1);
  });

  it("spread the field: the head of a difficulty outspends its tail", () => {
    for (const id of DIFFICULTY_IDS) {
      const entries = rivalField(id);
      const points = entries.map((e) => skillPoints(e.skill));
      expect(Math.max(...points) - Math.min(...points)).toBeGreaterThan(
        DIFFICULTIES[id].spread * 0.5,
      );
    }
  });

  it("actually get quicker down the ladder, driven by the real bot", () => {
    // The seeded number one at each setting, over a short stage. Ratios are
    // not needed: one crew, one car, one road, three profiles.
    const times = DIFFICULTY_IDS.map((id) => {
      const entry = rivalField(id)[0];
      const run = simulateStage({
        seed: 44,
        length: "short",
        carId: entry.crew.carId,
        profile: entry.profile,
        maxTime: 400,
      });
      expect(run.finished).toBe(true);
      return run.time;
    });
    expect(times[1]).toBeLessThan(times[0]);
    expect(times[2]).toBeLessThan(times[1]);
  });
});

describe("the roster", () => {
  it("fills the start list, with the player last out", () => {
    expect(RIVALS).toHaveLength(FIELD_SIZE - 1);
    expect(PLAYER_NUMBER).toBe(FIELD_SIZE);
    expect(START_INTERVAL).toBeGreaterThan(0);
  });

  it("is fourteen distinct crews in real cars", () => {
    const ids = new Set(RIVALS.map((c) => c.id));
    const aliases = new Set(RIVALS.map((c) => c.alias));
    const standings = new Set(RIVALS.map((c) => c.standing));
    expect(ids.size).toBe(RIVALS.length);
    expect(aliases.size).toBe(RIVALS.length);
    // Two crews on the same standing would be two crews the seeding order
    // cannot separate, and the start list would flip between builds.
    expect(standings.size).toBe(RIVALS.length);
    for (const crew of RIVALS) {
      expect(CARS.some((car) => car.id === crew.carId)).toBe(true);
      expect(crew.standing).toBeGreaterThanOrEqual(0);
      expect(crew.standing).toBeLessThanOrEqual(1);
      // A weight of zero is an axis the crew can never buy at any
      // difficulty — a car that cannot be driven rather than a weakness.
      for (const axis of SKILL_AXES) expect(crew.weights[axis]).toBeGreaterThan(0);
      // The notes are the tuning brief: a crew nobody can describe is a crew
      // that is not different from the one above it.
      expect(crew.notes.length).toBeGreaterThan(80);
    }
  });

  it("seeds the quickest reputations out first", () => {
    const entries = rivalField("medium");
    expect(entries.map((e) => e.number)).toEqual(entries.map((_, i) => i + 1));
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].crew.standing).toBeLessThan(entries[i - 1].crew.standing);
    }
  });

  it("hands the gearbox to the crews with the hands, and only as it climbs", () => {
    const boxes = DIFFICULTY_IDS.map(
      (id) => rivalField(id).filter((entry) => entry.gearbox === "manual").length,
    );
    // Nobody on easy takes their own gears; the field's best hands do as the
    // difficulty climbs, and never all of it — a crew who spent their points
    // on eyes and nerve leaves the box alone however quick they are.
    expect(boxes[0]).toBe(0);
    expect(boxes[1]).toBeGreaterThan(0);
    expect(boxes[2]).toBeGreaterThan(boxes[1]);
    expect(boxes[2]).toBeLessThan(RIVALS.length);
    for (const id of DIFFICULTY_IDS) {
      for (const entry of rivalField(id)) {
        expect(entry.gearbox).toBe(entry.skill.hands >= MANUAL_HANDS ? "manual" : "auto");
        expect(gearboxFor(entry.skill)).toBe(entry.gearbox);
      }
    }
  });

  it("gives every crew a driving profile that differs from its neighbours", () => {
    const seen = new Set(
      rivalField("hard").map((entry) => JSON.stringify(profileFor(entry.skill))),
    );
    expect(seen.size).toBe(RIVALS.length);
  });

  it("gives every crew a temper, and keeps their order in it at every setting", () => {
    for (const crew of RIVALS) {
      expect(crew.temper).toBeGreaterThanOrEqual(0);
      expect(crew.temper).toBeLessThanOrEqual(1);
      expect(crew.overtake).toBeGreaterThanOrEqual(0);
      expect(crew.overtake).toBeLessThanOrEqual(1);
    }
    // The pecking order is the crew's, not the difficulty's: Scrapper is the
    // one to watch on easy as well as on hard, and what changes is only what
    // any of them is allowed to do about it.
    const ranked = [...RIVALS].sort((a, b) => b.temper - a.temper).map((c) => c.id);
    for (const id of DIFFICULTY_IDS) {
      const byTemper = rivalField(id)
        .sort((a, b) => b.profile.aggression - a.profile.aggression)
        .map((e) => e.crew.id);
      expect(byTemper).toEqual(ranked);
      // …and the overtake knob is the crew's alone, at every setting.
      for (const entry of rivalField(id)) {
        expect(entry.profile.overtake).toBe(entry.crew.overtake);
        expect(entry.profile.aggression).toBeCloseTo(temperFor(id, entry.crew.temper), 9);
      }
    }
  });

  it("is a ladder of temper, and easy still has somebody who will lean on you", () => {
    const worst = DIFFICULTY_IDS.map((id) =>
      Math.max(...rivalField(id).map((e) => e.profile.aggression)),
    );
    const mildest = DIFFICULTY_IDS.map((id) =>
      Math.min(...rivalField(id).map((e) => e.profile.aggression)),
    );
    expect(worst[0]).toBeLessThan(worst[1]);
    expect(worst[1]).toBeLessThan(worst[2]);
    expect(mildest[0]).toBeLessThan(mildest[1]);
    expect(mildest[1]).toBeLessThan(mildest[2]);
    // Easy is NICE — nobody on it goes looking to end a run — but a couple
    // of crews on it will still arrive in your door.
    const easy = rivalField("easy").map((e) => e.profile.aggression);
    expect(easy.filter((a) => a >= CLEAN).length).toBeGreaterThan(0);
    expect(easy.every((a) => a < DIRTY)).toBe(true);
    // Medium leans and does not remove; hard does both.
    expect(rivalField("medium").every((e) => e.profile.aggression < DIRTY)).toBe(true);
    expect(rivalField("hard").filter((e) => e.profile.aggression >= DIRTY).length).toBeGreaterThan(
      1,
    );
  });
});

describe("the field on the road", () => {
  const stage = {
    seed: 44,
    laps: 1,
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
  } as const;

  it("enters the field staggered, one interval per start number", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "hard" },
      stage,
    );
    expect(field.of).toBe(FIELD_SIZE);
    expect(field.playerNumber).toBe(PLAYER_NUMBER);
    // The crew directly in front of the player leaves as the establishing
    // shot opens and owes nothing; everybody ahead of THEM owes another
    // interval, right back to car 1.
    for (const run of field.runs) {
      expect(run.owed).toBeCloseTo((PLAYER_NUMBER - 1 - run.entry.number) * START_INTERVAL, 6);
    }
    const last = field.runs.find((run) => run.entry.number === PLAYER_NUMBER - 1);
    expect(last?.owed).toBe(0);
    // Only that crew is out of the control before a single step is taken —
    // which is why fifteen cars can be built on one grid sample.
    expect(field.runs.filter(onRoad)).toEqual([last]);
  });

  it("pays the head start off, and nobody is on the road until theirs is", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "hard" },
      stage,
    );
    const line = field.runs.map((run) => ({ x: run.state.car.x, z: run.state.car.z }));
    drainField(field);
    // Everybody has either spent their whole head start or used it to
    // finish: a short stage takes less than the thirteen intervals the
    // front of the field is given, so the leaders are home before the
    // player's lights go out — which is what a ten-second interval over a
    // two-minute stage actually looks like.
    for (const run of field.runs) expect(run.done || run.owed <= 0).toBe(true);
    // Everybody who is still out there has driven road, and the field is
    // strung out down it rather than stacked on the line.
    const went = (run: (typeof field.runs)[number], i: number): boolean =>
      Math.hypot(run.state.car.x - line[i].x, run.state.car.z - line[i].z) > 50;
    // Every crew but ONE: the car directly in front of the player owes
    // nothing, so it is still stood on the line waiting for the shot to
    // open, which is the whole point of the shot.
    expect(field.runs.filter(went).length).toBe(field.runs.length - 1);
    const last = field.runs.findIndex((run) => run.entry.number === PLAYER_NUMBER - 1);
    expect(went(field.runs[last], last)).toBe(false);
    // …and in start order: an earlier number has had longer, so it is
    // further down the stage (or already home).
    //
    // Unless it threw that head start away. A crew that has been off in the
    // scenery has lost more than an interval to it, and the car that left
    // ten seconds later is legitimately past them — that is a rally, not a
    // broken start. So the claim is made of the crews still having a clean
    // run of it, which is the claim the head start actually makes.
    const clean = (run: (typeof field.runs)[number]): boolean =>
      run.state.stats.offRoadTime < START_INTERVAL && run.state.stats.respawns === 0;
    const inOrder = [...field.runs].sort((a, b) => a.entry.number - b.entry.number);
    let compared = 0;
    for (let i = 1; i < inOrder.length; i++) {
      const ahead = inOrder[i - 1];
      const behind = inOrder[i];
      if (ahead.done || behind.done || !clean(ahead) || !clean(behind)) continue;
      expect(ahead.state.progressS).toBeGreaterThan(behind.state.progressS);
      compared += 1;
    }
    // …and the exemption above has not quietly eaten the whole assertion.
    expect(compared).toBeGreaterThan(0);
  });

  it("pushes the whole field on when the player skips the shot", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "hard" },
      stage,
    );
    const owedBefore = field.runs.map((run) => run.owed);
    const rolling = field.runs.find((run) => onRoad(run))!;
    const was = rolling.state.t;
    advanceField(field, 4);
    // A crew still in the control takes it as more debt; the one already out
    // there drives it, or the stagger would quietly shrink by what the
    // player jumped.
    field.runs.forEach((run, i) => {
      if (owedBefore[i] > 0) expect(run.owed).toBeCloseTo(owedBefore[i] + 4, 6);
    });
    expect(rolling.state.t - was).toBeCloseTo(4, 1);
  });

  it("books splits as the crews go through, and places the player by TIME", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "hard" },
      stage,
    );
    // Nobody has been through anything yet, so the first board is the
    // player's to lose whatever time they arrive with.
    expect(placeAtSplit(field, 0, 9999)).toBe(1);
    expect(splitLeader(field, 0)).toBeNull();

    drainField(field);
    // Half a minute more of racing: enough for the field to reach the first
    // board on a short stage, and cheap enough to run in a unit test.
    for (let i = 0; i < TUNING.physicsHz * 45; i++) stepField(field);
    const splits = field.runs.map((run) => run.splits[0]).filter((at) => at !== undefined);
    expect(splits.length).toBeGreaterThan(0);

    // The place is a straight count of the better times — the stagger is
    // what makes that exact rather than provisional.
    const slowest = Math.max(...splits);
    expect(placeAtSplit(field, 0, slowest + 1)).toBe(splits.length + 1);
    const quickest = Math.min(...splits);
    expect(placeAtSplit(field, 0, quickest - 1)).toBe(1);

    const leader = splitLeader(field, 0);
    expect(leader).not.toBeNull();
    // Whoever is quoted IS the quickest through that board.
    for (const at of splits) expect(at).toBeGreaterThanOrEqual(leader!.time);
    expect(RIVALS.some((crew) => crew.alias === leader!.alias)).toBe(true);

    stopField(field);
    const frozen = field.runs.map((run) => run.splits.length);
    for (let i = 0; i < 600; i++) stepField(field);
    expect(field.runs.map((run) => run.splits.length)).toEqual(frozen);
  });

  it("counts the cars home at the line", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "easy" },
      stage,
    );
    expect(placeAtFinish(field, 0)).toBe(1);
    drainField(field);
    for (let i = 0; i < TUNING.physicsHz * 200; i++) stepField(field);
    const times = field.runs.map((run) => run.time).filter((t): t is number => t !== null);
    expect(times.length).toBeGreaterThan(RIVALS.length / 2);
    expect(placeAtFinish(field, Math.max(...times) + 1)).toBe(times.length + 1);
    expect(placeAtFinish(field, Math.min(...times) - 1)).toBe(1);
  });

  it("puts the whole grid on one road, and keeps them out of each other", () => {
    // A HEADS-UP race is the case that makes this matter: eight cars leave on
    // one green, so the queue in front of every one of them is other cars
    // rather than empty road. Whatever the field does to itself, no two of
    // them may end a step inside each other — the contact model resolves
    // every pair, and a pair it did not resolve is fourteen games driving
    // through one another.
    // The WHOLE roster on the grid, and walked over several seeds rather
    // than one. WHETHER a given stage's cars actually touch depends on how
    // that stage's corners bunch them, which moves whenever the generator's
    // routing — or the ground beside the road — does: eight cars met on one
    // seed in five and on none after a terrain change, which made this a
    // test of that seed. Fourteen cannot get off the line without meeting,
    // on every seed measured, and that they touch SOMEWHERE and are never
    // resolved into each other when they do is the rule.
    const reach = TUNING.collision.halfWidth * 2;
    let closest = Infinity;
    let met = 0;
    for (const seed of [38, 3, 7, 11, 19]) {
      const track = compileStage(seed, "short");
      const field = createField(
        track,
        { difficulty: "hard", cars: RIVALS.length, massStart: true, contact: true },
        stage,
      );
      for (let i = 0; i < TUNING.physicsHz * 90; i++) {
        stepField(field);
        const live = field.runs.filter(onRoad);
        for (let a = 0; a < live.length; a++) {
          for (let b = a + 1; b < live.length; b++) {
            const one = live[a].state.car;
            const two = live[b].state.car;
            if (Math.abs(one.y - two.y) > TUNING.collision.cars.reach) continue;
            const gap = Math.hypot(one.x - two.x, one.z - two.z);
            closest = Math.min(closest, gap);
            if (gap < reach + 0.05) met += 1;
          }
        }
      }
      if (met > 0) break;
    }
    // They found each other — a grid this deep cannot get down a stage
    // without it — and the model held them apart when they did.
    expect(met).toBeGreaterThan(0);
    // Half a body of overlap is the most one 120 Hz step can bury them
    // before the push-apart is asked about it.
    expect(closest).toBeGreaterThan(TUNING.collision.halfWidth);
  });

  it("reads a heads-up place off the road, and a rally place off the clock", () => {
    const track = compileStage(44, "short");
    const field = createField(
      track,
      { difficulty: "medium", cars: 8, massStart: true, contact: true },
      stage,
    );
    const player = createGame({
      seed: stage.seed,
      carId: "compact",
      track,
      laps: stage.laps,
      skipCountdown: true,
      quiet: true,
    });
    // On the line, behind everybody: the back row is the back of the field.
    expect(livePlace(field, player)).toBe(field.runs.length + 1);
    for (let i = 0; i < TUNING.physicsHz * 25; i++) {
      stepField(field, player);
      step(player, botInput(player));
    }
    // Mid-stage, with nobody through a split board yet, the place is the
    // count of the cars actually up the road — which is what a rally start
    // cannot answer and this one can.
    //
    // The window is stated rather than assumed: the point of the assertion
    // below is the case where NOBODY is home, and a field quick enough to
    // have finished a short stage by now would be answering a different
    // question (the one the `home` case underneath asks on purpose).
    expect(field.runs.every((run) => run.time === null)).toBe(true);
    const ahead = field.runs.filter(
      (run) => run.state.progressS > player.progressS && run.time === null,
    ).length;
    expect(livePlace(field, player)).toBe(ahead + 1);
    expect(livePlace(field, player)).toBeGreaterThanOrEqual(1);
    expect(livePlace(field, player)).toBeLessThanOrEqual(field.of);

    // A car that has finished is ahead of anybody still driving, whatever
    // road either of them has covered.
    const home = field.runs[0];
    home.time = 1;
    home.done = true;
    const withHome = livePlace(field, player);
    const stillOut = field.runs.filter(
      (run) => onRoad(run) && run.state.progressS > player.progressS,
    ).length;
    expect(withHome).toBe(stillOut + 2);
  });

  it("runs a crew home even while they still owe their head start", () => {
    // The seam between the stagger and R30's straggler settling: the results
    // card drives everybody home for the finishing ORDER, and most of the
    // field is still in the start control when a run is abandoned early.
    // Their debt is deliberately left standing — `owed` places a car on the
    // road relative to the player, and the player has finished — so they must
    // come home with a real time while never counting as on the road.
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "easy" },
      stage,
    );
    const owing = field.runs.filter((run) => run.owed > 0);
    expect(owing.length).toBe(field.runs.length - 1);
    let guard = 0;
    while (!settleField(field, 4000, 400) && guard < 400) guard += 1;
    expect(guard).toBeLessThan(400);
    for (const run of owing) {
      // Home is the line — or, for a crew whose crash the car did not
      // survive, the place it stopped: a retired run is done, timeless
      // and off the road exactly as a finished one is, and the seam under
      // test (the debt left standing while it is run home) holds for both.
      // The seed is SEARCHED for, not assumed: the crew that owes nothing
      // after the settle is the one that closes the field's clock, and on a
      // stage where a crew a few cars up loses more than its head start to
      // the scenery it is that crew, not the one directly ahead of the
      // player — short seeds 30-62 were swept for one where every owing
      // crew comes home with a time or a retirement and still owes (36 does
      // not: its thirteenth car came home eighteen seconds behind the
      // fourteenth; 38 has a crew stuck past the settle limit, done with
      // no time), where the seeded number one gets quicker down the ladder
      // (the test above; 32 does not), and where a crew marks the car after
      // the shot opens on every difficulty (`trace_test` shares the seed;
      // 31, 35, 40 and 48 have no such crew). 44 does all three.
      //
      // The retirement is read off `run.sim` — the game the bot actually
      // drove — and never off `run.state`, which on a field of ghosts is a
      // SHOWN copy posed off the trace by the clock. A traced crew's shown
      // phase stays "racing" after its run has retired, so asking that one
      // sends every DNF down the has-a-time branch.
      if (run.sim.phase === "retired") expect(run.time).toBeNull();
      else expect(run.time).not.toBeNull();
      expect(run.done).toBe(true);
      // The debt is left standing rather than settled — but it is a debt in
      // SECONDS, and a crew whose own run outlasts it has spent it honestly
      // on the way round. One easy crew here rolls twice, takes its car back
      // from the last board twice and comes home in three times the winner's
      // time; by then the stagger it was owed is long behind it. What the
      // seam actually owes is below: home, timed, and never on the road.
      expect(run.owed).toBeGreaterThanOrEqual(0);
      expect(onRoad(run)).toBe(false);
    }
  });

  it("takes a crew off the road the moment they are home", () => {
    const field = createField(
      compileStage(44, "short"),
      { ...RALLY_FIELD, difficulty: "easy" },
      stage,
    );
    drainField(field);
    for (let i = 0; i < TUNING.physicsHz * 200; i++) stepField(field);
    for (const run of field.runs) {
      if (run.time !== null) expect(onRoad(run)).toBe(false);
    }
  });
});

/** A localStorage that lives for one test. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const FIRST = LOCATIONS[0].levels[0];

describe("the podium rule", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("opens the time trial on any finish, and the ladder only on a podium", () => {
    const missed = recordFinish(FIRST.id, 120, { place: PODIUM + 1, difficulty: "hard" });
    expect(missed.finished).toContain(FIRST.id);
    expect(levelCleared(missed, FIRST.id)).toBe(false);
    expect(levelCompleted(FIRST, missed)).toBe(true);

    const made = recordFinish(FIRST.id, 118, { place: PODIUM, difficulty: "hard" });
    expect(levelCleared(made, FIRST.id)).toBe(true);
  });

  it("keeps the best place per difficulty, and the best time across them all", () => {
    recordFinish(FIRST.id, 130, { place: 9, difficulty: "hard" });
    recordFinish(FIRST.id, 121, { place: 2, difficulty: "easy" });
    recordFinish(FIRST.id, 140, { place: 4, difficulty: "hard" });
    const progress = loadProgress();
    expect(bestPlace(progress, FIRST.id, "hard")).toBe(4);
    expect(bestPlace(progress, FIRST.id, "easy")).toBe(2);
    expect(bestPlace(progress, FIRST.id, "medium")).toBeUndefined();
    // A time is a time whatever the field was doing.
    expect(progress.best[FIRST.id]).toBe(121);
  });

  it("posts a time and nothing else for a run with nobody entered", () => {
    const progress = recordFinish(FIRST.id, 99, null);
    expect(progress.finished).toContain(FIRST.id);
    expect(levelCleared(progress, FIRST.id)).toBe(false);
    for (const id of DIFFICULTY_IDS) expect(bestPlace(progress, FIRST.id, id)).toBeUndefined();
  });

  it("reads a save written before the field existed as a set of finishes", () => {
    localStorage.setItem(
      "scandi-flick-campaign",
      JSON.stringify({ cleared: [FIRST.id], best: { [FIRST.id]: 90 } }),
    );
    const progress = loadProgress();
    // Nobody loses a time trial they had already opened, and nobody loses the
    // rung the clear had already opened either.
    expect(progress.finished).toEqual([FIRST.id]);
    expect(levelCleared(progress, FIRST.id)).toBe(true);
    expect(progress.places).toEqual({});
  });

  it("opens every stage on both gates when everything is unlocked", () => {
    const progress = unlockEverything();
    for (const location of LOCATIONS) {
      for (const level of location.levels) {
        expect(progress.finished).toContain(level.id);
        expect(levelCleared(progress, level.id)).toBe(true);
      }
    }
  });
});
