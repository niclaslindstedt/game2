// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD snapshot: everything the instruments read, derived from a
// GameState once per HUD tick (~12 Hz — the canvas is the 60 fps surface,
// the HUD is not). This is also where the app layer's SIGN BOUNDARY is
// paid: the rendered world mirrors the engine's map view, so the co-driver
// calls are flipped into SCREEN space here, once, exactly as input.ts flips
// steering once.

import {
  TUNING,
  jumpSize,
  startsIn,
  travelSpeed,
  wayHome,
  type GameState,
  type JumpSize,
  type Pacenote,
  type RetireReason,
  type RivalField,
  type TrackSample,
} from "@engine";

import { buildMinimap } from "./minimap-view.ts";
import { clamp } from "../lib/util.ts";
import { carHealth } from "./car-health.ts";
import { tachometer } from "./car-instruments.ts";
import { cornerSign, type PaceSign } from "./pace-shape.ts";
import { shiftLightOn, shiftWindow } from "./shift-window.ts";
import type { HudPacenote, HudSnapshot, HudStanding } from "./hud.tsx";

/** The two instruments the ~12 Hz snapshot cannot carry, and why they are
 * their own channel:
 *
 *   the CLOCK, whose hundredths digit is the entire point of it — read off
 *   a 12 Hz snapshot it steps in jumps of eight or more, which reads as a
 *   clock that has stopped rather than one that is running;
 *
 *   the START LIGHTS, which have to change on the same frame as the sound
 *   that goes with them, and the sound is on the frame loop.
 *
 * One object, rewritten IN PLACE by the frame loop and read by those two
 * components on their own animation frame, so a 60 Hz instrument costs a
 * text node instead of a re-render of every dial on the screen. */
export type LiveRun = {
  phase: GameState["phase"];
  /** Seconds left before the off, counting through the establishing shot as
   * well as the lights; 0 once the lights are out. */
  countdown: number;
  /** Total race time and the current lap's, seconds. */
  time: number;
  lapTime: number;
  /** The lights are WAITING: the field's runs are still being written down
   * (App.tsx's loading beat), and the gantry says so instead of counting. */
  hold: boolean;
};

export function createLive(): LiveRun {
  return {
    phase: "intro",
    countdown: TUNING.intro + TUNING.countdown,
    time: 0,
    lapTime: 0,
    hold: false,
  };
}

/** Re-read the live face from the run. In place, every frame: the object's
 * identity is what the HUD holds on to. */
export function readLive(live: LiveRun, state: GameState, hold = false): void {
  live.phase = state.phase;
  live.countdown = startsIn(state);
  live.time = state.raceTime;
  live.lapTime = state.raceTime - state.lapStart;
  live.hold = hold;
}

/** How long before a corner the co-driver calls it, seconds. The strip is
 * timed rather than measured: what is left to the turn-in is metres, but
 * what a driver has to spend on the call is the SECONDS those metres are
 * worth at the speed the car is doing — the same eighty metres is a long
 * look at 80 km/h and no warning at all at 200. Two seconds is the sign
 * going up as the braking point arrives.
 *
 * Short on purpose: a sign hung out four seconds early spends most of its
 * life describing a corner the driver cannot see yet. */
const CALL_LEAD = 2;

/** ...and how far ahead the SECOND call may be, seconds. A corner inside
 * four seconds of the car is one the driver is already committing to on the
 * way into the first — a genuine combination, and what the strip draws faint
 * underneath ("hard left INTO easy right"). Past that it is a corner with
 * real road in front of it, and it gets its own sign when the car reaches
 * it, which is the difference between a strip that is read and one that is a
 * queue. */
const COMBO_LEAD = 4;

/** The slowest the clock is ever read at, m/s (~54 km/h). Time to a corner
 * is metres over speed, so a stopped car is an infinite number of seconds
 * from every corner on the stage: the strip would be blank on the start
 * line, and would blank again every time a hairpin was crawled out of.
 * Under this the calls are timed at this speed instead — roughly the pace
 * the car is about to be doing anyway. */
const CALL_MIN_SPEED = 15;

/** Seconds from the car to a point up the road, at the speed the car is
 * closing on it: what the dial reads (`car.u`, the pace along the road), not
 * the sideways component of a slide, which closes nothing. */
function callSeconds(state: GameState, s: number): number {
  const speed = Math.max(CALL_MIN_SPEED, state.car.u);
  return Math.max(0, s - state.progressS) / speed;
}

/** The co-driver's memory between HUD ticks: how far up the road the calls
 * already made reach.
 *
 * A call LATCHES — once made it stays up until the car is through the
 * corner — and that latch is the whole reason this state exists. The lead is
 * measured in SECONDS, and the seconds it covers are the ones the driver
 * spends BRAKING: an unlatched window shrinks with the speed it is measured
 * from, walks back past its own sign, and takes the call down at exactly the
 * moment it is being read — then puts it up again on the throttle out. */
export type PaceMemory = {
  /** Arc position of the furthest corner already called, meters. */
  calledS: number;
  /** Arc position of the furthest jump lip already called, meters. */
  calledJumpS: number;
  /** Progress at the last read. A respawn, a restart or a new stage moves it
   * BACKWARDS, which is the one thing that clears the latch. */
  lastS: number;
  /** The drawn shape of each corner currently on the strip, keyed by its
   * entry. Walking the centerline for a corner on every tick would redo work
   * that cannot change — with one exception, which is why the exit is kept
   * beside the shape: on an endless stage the note at the streaming frontier
   * grows as its combination is built, and a grown note is a new picture. */
  shapes: Map<number, { endS: number; sign: PaceSign }>;
  /** The closest each call currently on the strip has ever been, seconds,
   * keyed by its arc position — the countdown's ratchet. */
  ticked: Map<number, number>;
  /** Every corner and every jump lip on the stage, in arc order — the list
   * the strip walks. Built once per track and held here rather than rebuilt
   * per frame: the corners and the lips are the STAGE, and the stage does not
   * change under a running car.
   *
   * Three things say the road has changed under it, and it takes all three.
   * The sample ARRAY's identity catches a new stage or a restart, which
   * compiles a fresh track. The two COUNTS catch the endless stream, which
   * does not: it appends to the very same array as the run goes on, so a
   * cache keyed on identity alone would freeze the co-driver at whatever the
   * opening stretch happened to hold and never call another corner. */
  events: PaceEvent[];
  builtFor: TrackSample[] | null;
  builtSamples: number;
  builtNotes: number;
};

/** One thing worth calling, and where on the stage it is. A corner carries
 * the note the generator wrote; a jump is the sample the lip crosses, with
 * the size the engine gives it (`jumpSize`) already taken — the flight is a
 * walk down the elevation profile, and the stage's lips do not change under
 * a running car any more than its corners do. */
type PaceEvent = { s: number; note: Pacenote } | { s: number; jump: TrackSample; size: JumpSize };

export function createPaceMemory(): PaceMemory {
  return {
    calledS: -Infinity,
    calledJumpS: -Infinity,
    lastS: 0,
    shapes: new Map(),
    ticked: new Map(),
    events: [],
    builtFor: null,
    builtSamples: -1,
    builtNotes: -1,
  };
}

/** The stage's calls in arc order, off the memory when the road has not
 * changed under it. A medium stage is 2500 samples and a long one 4200, and
 * two of them carry a jump: filtering, wrapping and sorting that on every
 * HUD frame is four thousand objects a frame of pure allocation to find two
 * lips that were already there when the stage was compiled. */
function paceEvents(state: GameState, mem: PaceMemory): PaceEvent[] {
  const samples = state.track.samples;
  const notes = state.track.pacenotes;
  if (
    mem.builtFor === samples &&
    mem.builtSamples === samples.length &&
    mem.builtNotes === notes.length
  ) {
    return mem.events;
  }
  // A DIFFERENT road means the drawn corners belong to a stage nobody is on.
  // A road that merely GREW keeps them: an endless run's frontier appends to
  // the same array, and throwing the shapes away every time it does would
  // redraw every sign on the strip for nothing. Read before the rebuild
  // below writes over it.
  if (mem.builtFor !== samples) mem.shapes.clear();
  const events: PaceEvent[] = notes.map((note) => ({ s: note.s, note }));
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].jump) continue;
    events.push({ s: samples[i].s, jump: samples[i], size: jumpSize(state.track, i) });
  }
  events.sort((a, b) => a.s - b.s);
  mem.events = events;
  mem.builtFor = samples;
  mem.builtSamples = samples.length;
  mem.builtNotes = notes.length;
  return events;
}

/** HOW FAR THROUGH THE CORNER the car is, 0 at the turn-in and 1 at the exit
 * — what the sign inks itself in with while it is being driven.
 *
 * ARC POSITION, not time: the corner has a start and an end written on the
 * stage, and the honest reading of "how much of this bend is behind me" is
 * how much of that road is behind me. Timing it instead would fill the sign
 * at whatever speed the car happened to carry in, and finish it early on a
 * corner that was slower than the entry promised.
 *
 * It only ever grows because `progressS` only ever grows through a note; a
 * car that goes backwards out of a corner is a car that has left it, and the
 * strip drops the call rather than unwinding the fill. */
function throughCorner(state: GameState, note: Pacenote): number {
  const span = note.endS - note.s;
  if (span <= 0) return 0;
  return clamp((state.progressS - note.s) / span, 0, 1);
}

/** Turn angle past which a call earns the LONG modifier, radians (~100°). */
const LONG_NOTE_ANGLE = 1.75;

/** The corner calls on the strip, on the co-driver's clock: the one being
 * driven or within CALL_LEAD seconds of being, plus the one after it ONLY
 * when it too lands inside COMBO_LEAD seconds. Both windows are read from
 * the CAR — metres left to the turn-in over the speed the car is doing —
 * because that is the quantity the driver is actually spending.
 *
 * The engine's positive dir grows the heading, which the mirrored screen
 * shows as a LEFT turn — the same one-flip rule input.ts applies to
 * steering. */
function upcomingPacenotes(state: GameState, mem: PaceMemory): HudPacenote[] {
  if (state.progressS < mem.lastS) {
    mem.calledS = -Infinity;
    mem.calledJumpS = -Infinity;
    mem.ticked.clear();
  }
  mem.lastS = state.progressS;
  const out: HudPacenote[] = [];
  const drawn: number[] = [];
  /** Every call put on the strip this tick, by arc position — what the two
   * caches below are pruned against. */
  const live: number[] = [];
  for (const event of paceEvents(state, mem)) {
    // The sign stands until the corner is BEHIND the car, not until the
    // turn-in: the countdown under it runs out at the entry, and what is
    // left after that is a plate saying which way the road the car is on
    // this instant goes. It is the car's POSITION that takes it down and
    // never the clock, so a car stopped short of a corner keeps its call
    // however long it sits there.
    if ("note" in event && event.note.endS <= state.progressS) continue;
    if ("jump" in event && event.jump.s < state.progressS) continue;
    const eventS = event.s;
    const called = "note" in event ? event.note.s <= mem.calledS : eventS <= mem.calledJumpS;
    // THE COUNTDOWN ONLY EVER RUNS DOWN. Seconds to a corner is metres over
    // speed, so shedding speed genuinely puts the corner further away in
    // seconds than it was a moment ago — true, and useless as an
    // instrument: a bar that grows back while the driver is on the brakes
    // is a bar that pumps in the corner of an eye that is meant to be
    // reading it. What is kept is the closest the corner has ever been,
    // which is the number the driver is actually working to.
    const eta = Math.min(callSeconds(state, eventS), mem.ticked.get(eventS) ?? Infinity);
    // The first call gets the plain lead; anything behind it has to be part
    // of the same combination to be on the strip at all. Called already and
    // not yet driven through keeps its slot either way — the latch is what
    // stops a sign coming down under braking, at the moment it is read.
    const reach = out.length === 0 ? CALL_LEAD : COMBO_LEAD;
    if (eta > reach && !called) break;
    mem.ticked.set(eventS, eta);
    live.push(eventS);
    if ("jump" in event) {
      mem.calledJumpS = Math.max(mem.calledJumpS, eventS);
      out.push({ kind: "jump", size: event.size, eta });
      if (out.length >= 2) break;
      continue;
    }
    const note = event.note;
    mem.calledS = Math.max(mem.calledS, note.s);
    let drawing = mem.shapes.get(note.s);
    if (!drawing || drawing.endS !== note.endS) {
      drawing = { endS: note.endS, sign: cornerSign(state.track.samples, note) };
      mem.shapes.set(note.s, drawing);
    }
    drawn.push(note.s);
    out.push({
      kind: "turn",
      dir: note.dir > 0 ? "left" : "right",
      severity: note.severity,
      long: note.angle > LONG_NOTE_ANGLE,
      eta,
      fill: throughCorner(state, note),
      sign: drawing.sign,
    });
    if (out.length >= 2) break;
  }
  for (const key of mem.shapes.keys()) {
    if (!drawn.includes(key)) mem.shapes.delete(key);
  }
  for (const key of mem.ticked.keys()) {
    if (!live.includes(key)) mem.ticked.delete(key);
  }
  return out;
}

/** Whether this run is being TIMED against anything — campaign and time
 * trial keep a book on every stage, Roam keeps none — and, if it is, the
 * record standing in it before this run started. Passed in rather than read
 * here because progress is the app's to own, not the engine's. Null is a
 * run nobody is keeping score of, which is not the same as a stage nobody
 * has set a time on yet (`{ best: null }`). */
export type RunBook = { best: number | null };

/** `ghostS` is how far the run is up the road on the ghost, and whether
 * there is one to be up the road on. Both cars run the same stage, so the
 * arc position they have each reached IS the gap, in the one unit that
 * needs no lookup table and reads instantly at speed: metres of road.
 *
 * `field` is the run's own entry list, or null where nobody else is
 * entered. Only the map reads it, and only on a mass start — the plates a
 * heads-up race puts on it, and the wider framing it is drawn at
 * (minimap-view.ts). */
export function takeSnapshot(
  state: GameState,
  pace: PaceMemory,
  finishTime: number | null,
  ghostS: number | null = null,
  book: RunBook | null = null,
  standing: HudStanding | null = null,
  field: RivalField | null = null,
  retired: RetireReason | null = null,
): HudSnapshot {
  const rpm = tachometer(state);
  return {
    phase: state.phase,
    time: state.raceTime,
    lap: state.lap,
    laps: state.laps,
    lapTime: state.raceTime - state.lapStart,
    lapTimes: state.lapTimes,
    bestTime: book?.best ?? null,
    // The speedo reads the car's speed THROUGH SPACE (`travelSpeed`), not
    // its forward speed: a car crossed up at 140 km/h is doing 140 km/h and
    // a needle that dipped every time the nose swung would tell the player
    // the slide is costing them — and a car off a cliff is doing whatever
    // the fall has got it up to, which is mostly straight down.
    speedKmh: Math.max(0, travelSpeed(state.car) * 3.6),
    gear: state.car.gear,
    reversing: state.car.reversing,
    gearbox: state.car.gearbox,
    rpm,
    // Nothing to shift on the grid, however hard the driver leans on it —
    // shift-window.ts owns that, and both readouts come off it so the lamp
    // and the gate a flick is held to can never disagree.
    shiftUp: shiftLightOn(state),
    shift: shiftWindow(state),
    airborne: state.car.airborne,
    // The trip counter's own metres — the engine's ground accumulator, which
    // is reset with the stage, so the lower window on the dial reads this
    // level and nothing before it.
    tripM: state.stats.distance,
    minimap: buildMinimap(state, field),
    // The standing answer to what is left of the car, under the map
    // (car-health.ts). Folded here rather than in the HUD so the
    // component draws colours and never reads a ledger.
    health: carHealth(state.car.damage),
    // The co-driver stops calling corners the moment the car is in the
    // water: the next one is not going to be taken, and reading it out
    // over a sinking car is the same wrong note as the way-home prompt.
    pacenotes: state.phase === "racing" && !state.drowning ? upcomingPacenotes(state, pace) : [],
    seed: state.seed,
    training: state.track.arena !== null,
    // The co-driver's way-home call is a DRIVING aid, so a car the water
    // has already taken is neither off-road nor lost as far as the HUD is
    // concerned: nothing the player asks for over the next few seconds
    // reaches it.
    offRoad: state.offRoad && !state.drowning,
    lost: state.lost && !state.drowning,
    // ...and for the same reason a sinking car is never told to turn round:
    // the wheels it would turn on are already under water.
    wrongWay: state.wrongWay && !state.drowning,
    homeDistance: state.lost && !state.drowning ? wayHome(state).distance : 0,
    finishTime,
    record: book !== null && finishTime !== null && (book.best === null || finishTime < book.best),
    ghostGap: ghostS === null ? null : state.progressS - ghostS,
    standing,
    retired,
  };
}
