// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STAGING A CRASH — the half of the crash lab that puts a car into one and
// writes down what the engine did with it, step by step.
//
// The pictures are `crash-draw.mjs`; this is the experiment. It is kept
// apart because the two answer different questions and change for different
// reasons: a new scenario is a row in the table below, a new READOUT is a
// field on the frame, and neither one wants to be edited through the other.
//
// Nothing here is a special physics path. The car is driven by `step()`
// exactly as the game drives it — what the lab owns is only WHERE the car
// is when it is let go, and what is standing in front of it.

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  carById,
  crashEnergy,
  crashTurbulence,
  createGame,
  massSpread,
  onItsWheels,
  rollBed,
  rollTilt,
  step,
  updateSlip,
} from "../../engine/index.ts";

const B = TUNING.collision;

/** How far off the road a placed scenario stands its car, m — clear of the
 * ribbon and its shoulder, so `step()` takes the wild branch and reads the
 * ground the scenario laid rather than the road's own frame. */
const OFF_ROAD = 45;

/** THE GROUND A SLIDE HAPPENS ON, laid across the car's path from where it
 * stands. `grade` is how steeply it falls away to the car's right; `edge`
 * is how far to the right it stays flat first.
 *
 * The two shapes answer different questions, and conflating them was the
 * first thing this lab got wrong. A uniform BANK (`edge` 0) asks what a
 * body does ON a slope — and the honest answer for a car resting on its
 * roof is that it slides, because a roof on a plane is a stable face
 * however steep the plane. A CLIFF is an EDGE: flat, and then not. What
 * turns a slide back into a roll is the ground running out from under one
 * side of the body, which is a thing a ramp never does. */
function standGround(state, grade, edge = 0, drop = Infinity) {
  const car = state.car;
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  const x0 = car.x;
  const z0 = car.z;
  const y0 = state.terrain.groundAt(x0, z0);
  state.terrain.groundAt = (x, z) => {
    // The car's own right axis is (cos h, -sin h), so this is metres to its
    // right — and the ground drops away on that side and no other.
    const across = (x - x0) * cosH - (z - z0) * sinH;
    // ...and levels out again `drop` metres down. A cliff has a BOTTOM: an
    // unbounded ramp is a car falling for the whole of the scenario, which
    // reports 523 km/h and −1.5 g and answers nothing.
    return y0 - Math.min(drop, Math.max(0, across - edge) * grade);
  };
}

/** A solid to stand in the car's way, with a plausible boulder's numbers
 * under whatever the scenario overrides. Authored in the RELEASE FRAME —
 * `along` down the car's travel and `across` to its right — because that is
 * how a crash is described ("a rock forty metres on, a metre off the nose")
 * and because the frame the pictures are drawn in is the same one. */
export function prop(along, across, over = {}) {
  return {
    along,
    across,
    kind: "boulder",
    size: 1,
    spin: 0,
    radius: 0.6,
    height: 0.9,
    mass: 420,
    rooted: 0.7,
    snap: Infinity,
    ...over,
  };
}

/** A stack of tyres: heavy enough to matter, light enough to burst. */
export const tyres = (along, across) =>
  prop(along, across, {
    kind: "tyres",
    radius: 0.9,
    height: 1.2,
    mass: 240,
    rooted: 0.2,
    snap: 3200,
  });

/** A low concrete run — the thing a sliding car TRIPS on. Under the body's
 * centre of mass and over the ride-over bar, which is the whole window a
 * trip lives in (`solids.tripTop`..`tripFade` against `rideOver`). */
export const rail = (along, across) =>
  prop(along, across, { kind: "barrier", radius: 0.8, height: 0.7, mass: 1400, rooted: 0.85 });

/** A fence post: a car goes THROUGH a fence, it does not stop at one. */
export const post = (along, across) =>
  prop(along, across, {
    kind: "post",
    radius: 0.14,
    height: 1.3,
    mass: 22,
    rooted: 0.5,
    snap: 900,
  });

/** The stage the lab drives on: a long straight with one lip in it, which
 * is the only piece of geometry any of these scenarios needs. The flat
 * scenarios simply never reach it. */
const STAGE = (lip) => [
  {
    kind: "straight",
    length: 700,
    feature: lip ? "jump" : "none",
    featureStart: 400,
    featureEnd: 414,
    lipHeight: 2,
  },
  { kind: "straight", length: 1400, feature: "none" },
];

/** THE SCENARIOS — one per mechanism, so a picture shows one thing.
 *
 * `entry` is what the car is HANDED at the moment it is let go: forward
 * speed and sideways speed, m/s. Past `air.tripSlide` of sideways the
 * landing trips the car; under it the springs take it and the car drives
 * on, which is what makes `slide` worth having beside the rest.
 *
 * `props` is authored in the release frame (see `prop`). */
export const SCENARIOS = {
  trip: {
    note: "a lip taken crossed up: the landing that goes over",
    lip: true,
    entry: [30, -18],
    seconds: 6,
    bare: true,
    props: () => [],
  },
  carry: {
    note: "the same, at pace, with nothing to hit — THE MOMENTUM QUESTION",
    lip: true,
    entry: [46, -30],
    seconds: 9,
    bare: true,
    props: () => [],
  },
  debris: {
    note: "...and into a field of solids: does it bounce, spin, change hand",
    lip: true,
    entry: [46, -30],
    seconds: 9,
    bare: true,
    // A BAND across the whole run-out, not a line down the release heading.
    // A rolling body WALKS — the corner it turns about is a metre out from
    // its middle, so it crosses two metres of ground per half turn and ends
    // up nowhere near the way it was pointing. A field authored straight
    // ahead is a field the car curves neatly around, which is what the
    // first version of this scenario measured: a roll identical to `carry`
    // and not one prop touched.
    props: () => {
      const out = [];
      for (let i = 0; i < 7; i += 1) {
        const along = 16 + i * 12;
        const shift = ((i % 3) - 1) * 4;
        out.push(tyres(along, -14 + shift));
        out.push(prop(along + 4, -7 + shift, { radius: 0.7, height: 1.0, mass: 600 }));
        out.push(post(along + 7, -1 + shift));
        out.push(prop(along + 2, 5 + shift, { radius: 0.8, height: 1.1, mass: 900 }));
      }
      return out;
    },
  },
  slide: {
    note: "sliding into a low rail on the flat — the rally roll, no jump",
    lip: false,
    entry: [30, 26],
    seconds: 8,
    bare: true,
    // A run of it, so a slide that arrives early or late still finds it —
    // and low, because a trip is a thing that catches the car UNDER its
    // centre of mass and lets the top keep going (`solids.tripTop`). A wall
    // the body meets square is not a trip, it is a wall.
    props: () => Array.from({ length: 30 }, (_, i) => rail(2 + i * 1.4, 3.6)),
  },
  spin: {
    note: "a solid caught on the nose corner: yaw without going over",
    lip: false,
    entry: [34, 0],
    seconds: 5,
    props: () => [prop(40, 1.35, { radius: 0.7, height: 1.1, mass: 1500, rooted: 0.9 })],
  },
  wall: {
    note: "square into something rooted: the pure contact",
    lip: false,
    entry: [33, 0],
    seconds: 5,
    props: () => [prop(45, 0, { radius: 1.2, height: 1.6, mass: 9000, rooted: 1 })],
  },
  // ── The two SLIDES: a body already over, on a face, going somewhere ────
  // Staged by `place` rather than driven to, because what is under test is
  // what the ground does to a body that is ALREADY on its shell — and a
  // roll that happens to end on the right face at the right speed is a
  // scenario nobody can repeat.
  cliff: {
    note: "on its ROOF, sliding OVER AN EDGE — the ground runs out under one side",
    place: { tilt: Math.PI, speed: 15, drift: 5 },
    bank: 1.6,
    edge: 1.2,
    drop: 6,
    seconds: 9,
    bare: true,
    props: () => [],
  },
  bank: {
    note: "...and on its ROOF on a plain steep BANK, which it should just slide down",
    place: { tilt: Math.PI, speed: 15 },
    bank: 0.45,
    seconds: 9,
    bare: true,
    props: () => [],
  },
};

/** Everything one step of a crash is, as the pictures and the table want to
 * read it. Stated in the RELEASE FRAME: `along`/`across` are metres from
 * where the car was let go, along the heading it was let go on, and `yaw`
 * is how far the nose has come round from it. */
function frameOf(state, t, origin, events) {
  const car = state.car;
  // THE BED: the cross-slope under the body, as the roll reads it. Every
  // valley of the centre-of-mass curve is measured against this and not
  // against level, so a frame that does not show it cannot explain why the
  // same body settles at one attitude here and another one ten metres on.
  const grade = 4;
  const cosB = Math.cos(car.heading);
  const sinB = Math.sin(car.heading);
  const right = state.terrain.groundAt(car.x + cosB * grade, car.z - sinB * grade);
  const left = state.terrain.groundAt(car.x - cosB * grade, car.z + sinB * grade);
  const ahead = state.terrain.groundAt(car.x + sinB * grade, car.z + cosB * grade);
  const behind = state.terrain.groundAt(car.x - sinB * grade, car.z - cosB * grade);
  const slopeLat = (right - left) / (2 * grade);
  const bed = Math.atan(slopeLat);
  // IS IT ON ITS WHEELS — asked of the box against the ground it is on, not
  // of the roll angle. With a free pitch axis an attitude is the COMPOSITION
  // of the two: a car reading roll -171 deg and pitch 178 is sitting
  // squarely on its tyres facing backwards, and a lab that reads the roll
  // alone labels that one "lying on its roof" with a straight face.
  const wheels = onItsWheels(
    car.roll,
    car.pitch,
    rollBed({ slope: (ahead - behind) / (2 * grade), slopeLat }),
  );
  const dx = car.x - origin.x;
  const dz = car.z - origin.z;
  const sin = Math.sin(origin.heading);
  const cos = Math.cos(origin.heading);
  return {
    t,
    along: sin * dx + cos * dz,
    across: cos * dx - sin * dz,
    up: car.y - origin.y,
    ground: car.y - origin.y - (car.rolling ? hullStand(rollTilt(car.roll)) : 0),
    u: car.u,
    w: car.w,
    vy: car.vy,
    speed: Math.hypot(car.u, car.w),
    roll: car.roll,
    tilt: rollTilt(car.roll),
    wheels,
    bed,
    rollRate: car.rollRate,
    yaw: wrap(car.heading - origin.heading),
    yawRate: car.yawRate,
    pitch: car.pitch,
    airborne: car.airborne,
    rolling: car.rolling,
    sliding: car.sliding,
    wear: car.damage.wear,
    roof: car.damage.roof,
    parts: car.damage.broken.length,
    events,
  };
}

function wrap(a) {
  const turn = Math.PI * 2;
  return a - Math.round(a / turn) * turn;
}

/** How far the hull is standing off the ground at this attitude, m — the
 * picture's copy of `game/roll.ts`'s own, and used for one thing only:
 * finding the GROUND under a body whose height is read off `car.y`. */
export function hullStand(tilt) {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  let lowest = 0;
  for (const [across, up] of [
    [B.halfTrack, 0],
    [-B.halfTrack, 0],
    [B.halfWidth, B.floorY],
    [-B.halfWidth, B.floorY],
    [B.halfWidth, B.roofY],
    [-B.halfWidth, B.roofY],
  ]) {
    const h = up * cos - across * sin;
    if (h < lowest) lowest = h;
  }
  return -lowest;
}

/** Stand the scenario's props in the world, once the release point is
 * known, and hang them off the terrain's FIXTURES query — which the step
 * asks on every step wherever the car is, on the road or off it, so a lab
 * prop can be put anywhere without pretending the car has left the stage.
 * Felled props leave the world through the same door everything else does. */
function standProps(state, scenario, origin) {
  const sin = Math.sin(origin.heading);
  const cos = Math.cos(origin.heading);
  const standing = scenario.props().map((p, id) => ({
    id,
    x: origin.x + p.along * sin + p.across * cos,
    z: origin.z + p.along * cos - p.across * sin,
    y: state.terrain.groundAt(
      origin.x + p.along * sin + p.across * cos,
      origin.z + p.along * cos - p.across * sin,
    ),
    kind: p.kind,
    size: p.size,
    spin: p.spin,
    radius: p.radius,
    height: p.height,
    mass: p.mass,
    rooted: p.rooted,
    snap: p.snap,
    along: p.along,
    across: p.across,
  }));
  const gone = new Set();
  const touched = new Set();
  const own = state.terrain.fixturesNear;
  const fell = state.terrain.fell;
  // A BARE scenario has the country's own trees and stones swept out of the
  // way, and it has to be asked for: a stage's wild is dense enough that a
  // car tumbling off the road through it is measuring the forest, not the
  // roll. "Nothing to hit" is a claim a lab has to actually arrange.
  if (scenario.bare) {
    state.terrain.obstaclesNear = () => [];
    state.terrain.treesNear = () => [];
  }
  state.terrain.fixturesNear = (x, z, r) => {
    const out = scenario.bare ? [] : own(x, z, r);
    for (const s of standing) {
      if (gone.has(s.id)) continue;
      if (Math.hypot(s.x - x, s.z - z) <= r + s.radius) out.push(s);
    }
    return out;
  };
  state.terrain.fell = (ob) => {
    if (ob.id !== undefined) gone.add(ob.id);
    else fell(ob);
  };
  return { standing, gone, touched };
}

/** RUN ONE. Drive the car up to the entry, let it go, and write down every
 * step of what follows.
 *
 * The entry is PINNED rather than driven to: a crash is a thing that starts
 * at a known speed and attitude, and a lab that had to find 165 km/h and
 * thirty across by driving would be measuring the run-up instead of the
 * crash. Everything after the release is the engine's own.
 */
export function stageCrash(name, { car: carId = "classic", seed = 1 } = {}) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`no such scenario: ${name}`);
  // A placed scenario has no entry to be driven to — it is STOOD at its
  // attitude and speed — so its entry is what it is stood with.
  const [u, w] = scenario.entry ?? [scenario.place.speed, 0];
  const state = createGame({
    seed,
    carId,
    skipCountdown: true,
    track: compileTrack(0, STAGE(scenario.lip)),
  });

  // Up to speed, and — on the lip scenarios — off it. The forward speed is
  // held through the run-up so the release happens at the stated entry and
  // not at whatever the run-up managed.
  if (scenario.lip) {
    for (let i = 0; i < TUNING.physicsHz * 60; i++) {
      state.car.u = u;
      if (step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff")) break;
    }
    // ...and crossed up, held through the flight, so the landing arrives at
    // the sideways speed the scenario asked for.
    for (let i = 0; i < TUNING.physicsHz * 6; i++) {
      state.car.w = w;
      if (step(state, { ...NEUTRAL_INPUT }).some((e) => e.type === "landing")) break;
    }
  } else if (scenario.place) {
    // STOOD ON A FACE, on a bank, already sliding. The car is put well off
    // the road first: the wild is the only branch that reads the TERRAIN's
    // own gradient — on the ribbon the slope comes from the road's frame,
    // and a bank laid under a car standing on the road is never consulted.
    const cosH = Math.cos(state.car.heading);
    const sinH = Math.sin(state.car.heading);
    state.car.x += cosH * OFF_ROAD;
    state.car.z -= sinH * OFF_ROAD;
    if (scenario.bank)
      standGround(state, scenario.bank, scenario.edge ?? 0, scenario.drop ?? Infinity);
    state.car.rolling = true;
    state.car.roll = scenario.place.tilt;
    // STOOD ON THE FACE, not buried in it. `car.y` is the WHEEL PLANE under
    // the car's middle, so a body on its roof has to be stood a whole car's
    // clearance above the ground (`hullStand`) or the first step lifts it
    // there — 1.7 m of free fall, in one step, before the scenario has begun.
    // The ledger read that as the crash gaining a tenth of its budget out of
    // nothing, which is the scenario's staging and not the model's physics.
    state.car.y = state.terrain.groundAt(state.car.x, state.car.z) + hullStand(scenario.place.tilt);
    state.car.rollRate = 0;
    state.car.airborne = false;
    state.car.vy = 0;
    state.car.u = scenario.place.speed;
    // ...and, where the scenario asks, already going sideways: a body slid
    // straight at an edge meets it with both sides at once and simply drops.
    // What puts a car over is meeting it with ONE side first.
    state.car.w = scenario.place.drift ?? 0;
    updateSlip(state.car);
  } else {
    // Straight down the road to the entry speed, and the sideways speed put
    // in ONCE, at the release. Holding `w` through the run-up instead fights
    // the handling model for forty seconds — the grip redirect rebuilds the
    // velocity from the slip angle every step and the pin puts it back, and
    // the pair pump each other until the state is a car at eight thousand
    // rad/s that no longer moves. A crash starts at an attitude; it is not
    // driven to one.
    for (let i = 0; i < TUNING.physicsHz * 40; i++) {
      state.car.u = u;
      step(state, { ...NEUTRAL_INPUT, throttle: 0.5 });
      if (state.progressS > 300) break;
    }
    state.car.u = u;
    state.car.w = w;
    updateSlip(state.car);
  }

  const origin = {
    x: state.car.x,
    z: state.car.z,
    y: state.car.y,
    heading: state.car.heading,
    roll: state.car.roll,
  };
  const props = standProps(state, scenario, origin);

  const frames = [];
  const log = [];
  const respawns = state.stats.respawns;
  let t = 0;
  let rolled = false;
  let still = 0;
  // THE BUDGET. A crash is one store of energy — travel, spin and the height
  // the weight still has — being run down, and nothing in the model may add
  // to it except the flight's turbulence, which is bounded. Read per STEP,
  // because that is the only rate a term making energy shows up at; the
  // frame table below samples six times a second and would hide it.
  //
  // ...and bucketed BY REGIME — was the body off the ground, is it now — which
  // is the whole reason this is readable at all. A crash's gain is never one
  // fault: read as a single percentage it is a number to argue about, and read
  // as four it names which term is wrong. A rise on `air->air` is a step where
  // nothing but gravity and the turbulence ran, so it can only be the flight's
  // own bookkeeping; one on `air->grd` is what a touchdown was charged for;
  // `grd->grd` is the grounded model itself, which is exactly conservative and
  // ought to read zero. Split that way, a flat 20% went to three unrelated
  // faults on the first run of it.
  const spread = massSpread(carById(carId));
  let energy = crashEnergy(state.car, spread);
  const budget = { into: energy, gained: 0, steps: 0, worst: 0, regimes: {} };
  for (let i = 0; i < TUNING.physicsHz * scenario.seconds; i++) {
    const allowed = crashTurbulence(state.car, spread);
    const wasAir = state.car.airborne;
    const events = step(state, { ...NEUTRAL_INPUT });
    if (state.car.rolling) {
      const now = crashEnergy(state.car, spread);
      const rise = now - energy - allowed;
      if (rise > 0) {
        budget.gained += rise;
        budget.steps += 1;
        if (rise > budget.worst) budget.worst = rise;
        const regime = `${wasAir ? "air" : "grd"}->${state.car.airborne ? "air" : "grd"}`;
        const seen = budget.regimes[regime] ?? { gained: 0, steps: 0 };
        seen.gained += rise;
        seen.steps += 1;
        budget.regimes[regime] = seen;
      }
      energy = now;
    } else {
      energy = crashEnergy(state.car, spread);
    }
    t += TUNING.dt;
    if (state.car.rolling) rolled = true;
    for (const e of events) log.push({ t, ...e });
    // THE RUN PUTTING THE CAR BACK is the end of the crash and not part of
    // it. A car left lying on its roof goes back to the last split board
    // (`roll.lieFor`), which teleports it hundreds of metres up the road and
    // rewinds its attitude — so a lab that kept recording would report the
    // distance to the board as the distance the crash carried, and a car
    // that finished on its roof as one that finished on its wheels.
    if (state.stats.respawns > respawns) break;
    // A lab that draws a blown-up state draws nonsense confidently, which is
    // worse than drawing nothing. Anything non-finite is the scenario's own
    // staging being wrong, and it says so rather than rendering it.
    if (!Number.isFinite(state.car.u + state.car.w + state.car.roll)) {
      throw new Error(`${name}: the state went non-finite at ${t.toFixed(2)}s`);
    }
    frames.push(frameOf(state, t, origin, events));
    // What the body actually REACHED, marked as the run goes. A prop only
    // leaves the world when it yields, so felling is no measure of contact:
    // a rooted boulder the car folds itself against is still standing, and
    // a picture that draws it the same as one the car missed by ten metres
    // cannot answer the question the scenario is asking.
    for (const prop of props.standing) {
      if (props.touched.has(prop.id)) continue;
      const reach = prop.radius + B.halfLength;
      if (Math.hypot(prop.x - state.car.x, prop.z - state.car.z) <= reach) {
        props.touched.add(prop.id);
      }
    }
    // Over when the car has stopped moving — a crash ends where it comes to
    // rest, and the seconds after that are a picture of nothing.
    //
    // A car LYING is finished whatever its numbers still say. The roll has
    // handed it back, so nothing is turning it over any more, but the yaw it
    // ended on is still in it and holds a rate test open for the whole of
    // `roll.lieFor` — a dozen identical cells of a stationary car waiting on
    // its respawn clock. Past the basin its own weight could right it from,
    // there is nothing left to draw.
    const car = state.car;
    const lying = !car.rolling && !car.airborne && !frames[frames.length - 1].wheels;
    const moving =
      !lying &&
      (Math.hypot(car.u, car.w) > 0.6 ||
        Math.abs(car.rollRate) > 0.2 ||
        Math.abs(car.yawRate) > 0.2);
    still = moving ? 0 : still + TUNING.dt;
    if (still > 0.4) break;
  }

  // Everything the run is SUMMARISED by comes off the last frame RECORDED,
  // never off `state.car`: the two are the same car only when the crash
  // ended by coming to rest, and a crash that ended by being put back on
  // the road has a car sitting upright and undamaged at the split board.
  const last = frames[frames.length - 1];
  // ...and THE ROLL ITSELF, which is a different measurement from the run.
  // A crash ends when the car stops moving, but the roll hands the car back
  // the moment the body settles on a face — and everything after that is a
  // wrecked car coasting, which covers ground and sheds speed for reasons
  // that have nothing to do with going over. Reading the distance and the
  // speed off the last frame alone reports every roll as ending at 0 km/h,
  // which is exactly the reading that hides whether a roll carries.
  const over = frames.filter((f) => f.rolling);
  const began = over[0];
  const ended = over[over.length - 1];
  const roll = began
    ? {
        seconds: ended.t - began.t,
        along: ended.along - began.along,
        across: ended.across - began.across,
        into: began.speed,
        outOf: ended.speed,
        // The whole-crash retardation, as a fraction of THE GRAVITY IT
        // HAPPENS UNDER — which is the number an accident reconstruction
        // quotes for a rollover (about 0.45), and the one figure that says
        // whether this reads as a car going over or as a car hitting glue.
        //
        // Against `air.gravity` and never against 9.81. The game's gravity
        // is arcade — 1.6x the world's, deliberately, so a hang reads as
        // slow motion — and dividing a retardation measured under it by the
        // real figure inflated every reading in this lab by that same 1.6:
        // crashes sitting at a perfectly good 0.42 were being read as 0.68,
        // and the "over 1 g and the model is taking speed it should not"
        // bar was being tripped at a true 0.62. What makes the quantity
        // comparable across the two worlds is that it is a RATIO — it is
        // the whole crash's effective coefficient of friction, and it can
        // be read straight against `roll.faceGrip` (0.5 on a flank), which
        // is what it ought to come out near.
        drag:
          ended.t > began.t
            ? (began.speed - ended.speed) / (ended.t - began.t) / TUNING.air.gravity
            : 0,
      }
    : null;
  budget.outOf = energy;
  return {
    roll,
    budget,
    name,
    scenario,
    carId,
    seed,
    origin,
    entry: { u, w },
    frames,
    log,
    props: props.standing,
    felled: props.gone,
    touched: props.touched,
    rolled,
    turns: Math.abs(last.roll - origin.roll) / (Math.PI * 2),
    along: last.along,
    across: last.across,
    carried: last.speed,
    upright: last.wheels,
    wear: last.wear,
    roof: last.roof,
    parts: last.parts,
  };
}
