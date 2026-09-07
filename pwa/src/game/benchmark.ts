// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BENCHMARK — one stage, the whole field, and a stopwatch.
//
// WHAT IT MEASURES, AND WHY IT IS A TIME. A frame rate is a number about a
// moment: it moves with where the car happens to be standing, with what the
// weather is doing, and with whatever the machine was busy with while the
// average was being taken. Two of them from two machines are not comparable
// unless both were reading the same frame, which they never are.
//
// So this measures a FIXED AMOUNT OF WORK and reports how long the machine
// took to do it. The race is scripted — every car on the road is driven by
// the bot, off the engine's own seeded RNG, so the same corners are taken at
// the same instants on every machine and in every session — and the run is
// exactly `frames` rendered frames long. What varies is the clock: a fast
// machine is through the same race in less of it, and two numbers are two
// numbers about the same thing.
//
// WHAT IS REPORTED is that time divided back into the race's own length —
// an INDEX where 100 is real time (benchmark-index.ts). Same measurement,
// read the way a score is read: higher is better, and one machine over
// another is how many times faster it is.
//
// THE SIMULATION IS NOT WHAT IS BEING TIMED. Every rendered frame advances
// the game by exactly `step` seconds regardless of how long it took to draw,
// so the race is identical whether the machine manages sixty frames a second
// or six hundred. That is what makes the workload fixed; it is also why the
// render loop must NOT wait for anything. There is no frame limiter here and
// no `requestAnimationFrame`: frames are pumped through a MessageChannel,
// which is the one scheduler a browser will re-enter as fast as the work
// comes back, so the machine draws at whatever rate it can actually manage.
//
// THE FENCE. WebGL commands are posted to the GPU and return immediately, so
// a loop that only submits them measures how fast this machine can TALK to
// its graphics card. Every frame therefore ends by reading one pixel back
// out of the drawing buffer, which cannot be answered until the frame is
// actually drawn. It costs a round trip per frame — a constant, and the
// alternative is a benchmark that never waits for the GPU at all.
//
// HOW TO READ THE LINE, and the one thing that makes it readable: THE
// WORKLOAD IS FIXED ACROSS RUNS BUT NOT FLAT ACROSS ONE. The race starts
// with the whole field inside a hundred metres of each other and ends with
// it strung out, so the frame gets steadily cheaper as the run goes on —
// metered headlessly at DETAIL HIGH it falls from about 515 draw calls a
// frame over the first tenth to about 365 over the last, a third of the
// work gone, with the triangle count following it down.
//
// That is not a fault in the measurement — every machine draws the same
// declining race, so the SCORE compares exactly — but it is the whole of
// how the rate line has to be read:
//
//   * a rate that RISES through the run is a machine holding its pace on a
//     scene that is thinning: the expected shape, and a healthy one;
//   * a rate that is FLAT is a machine losing exactly as much as the scene
//     is giving back;
//   * a rate that FALLS is a machine getting slower faster than the race is
//     getting cheaper — which on a phone is nearly always the thermal
//     governor, and is the one reading worth acting on.
//
// A machine that throttles therefore shows up as a rate line bending down
// while the work goes down with it, and the same run drawn on something
// that cannot throttle holds its score flat from end to end.
//
// THE WARM-UP. The first frames of any run are the expensive ones: shaders
// compile, geometry and textures go up to the card, and the first of each
// kind of effect allocates its pool. That is a real cost and it is not what
// this is measuring, so the clock does not start until the lights go out —
// the establishing shot is thrown away the way a driver throws it away, and
// the countdown behind it is the warm-up.

import { TUNING, botInput, skipIntro, step, type GameEvent, type GameState } from "@engine";

import { advanceField, rubRivals, stepField, type RivalField } from "./standings.ts";
import { BENCHMARK } from "./benchmark-plan.ts";
import { SAMPLE_EVERY, benchIndex, type BenchSample } from "./benchmark-index.ts";
import type { FrameCost, SceneShare } from "./benchmark-report.ts";
import { MIRROR_TIERS } from "./mirror-pace.ts";
import type { GameRenderer } from "./renderer.ts";

/** Engine steps per rendered frame. Exact by construction (see `step`), so
 * no accumulator is carried between frames and nothing drifts. */
const STEPS_PER_FRAME = Math.max(1, Math.round(BENCHMARK.step / TUNING.dt));

// How often the card is told where the run is, in frames, is
// `SAMPLE_EVERY` — the reading and the report are the same event, because
// the card IS the graph of the readings.
//
// THAT REDRAW IS INSIDE THE CLOCK. Nothing here waits for the card, but the
// page has one thread and a hundred and twenty renders of a small SVG land
// between the frames being timed. A quarter of a second of game per reading
// is what keeps that honest: the card costs a fraction of a millisecond
// against the ~150 ms of frames it sits over, which is a constant tax well
// under what two runs of the same build differ by anyway. A graph redrawn
// every frame would be a benchmark measuring its own instrument.

/** Where the benchmark is, and what it has to say about itself. */
export type BenchmarkStatus = {
  /** `warmup` is the countdown, drawn but not timed; `running` is the
   * measured stretch; `done` is the answer. */
  phase: "warmup" | "running" | "done";
  /** Measured frames drawn so far, of `BENCHMARK.frames`. */
  frames: number;
  /** Wall clock since the lights went out, seconds — what is measured. */
  seconds: number;
  /** …and the same thing as THE NUMBER: the run so far on the scale where
   * 100 is real time (benchmark-index.ts). */
  index: number;
  /** Every reading taken so far, oldest first — the graph on the card is
   * this list and nothing else. A snapshot: the run keeps its own. */
  samples: BenchSample[];
  /** What each of those frames cost the renderer, same order — the half of
   * the report a person optimising the game reads (benchmark-report.ts). */
  costs: FrameCost[];
  /** What was standing in the scene on the LAST frame, by subsystem. Taken
   * once, at the end: it is a walk of the whole graph. */
  scene: SceneShare[];
  /** Cars that were actually stood on the grid. */
  cars: number;
  /** The drawing buffer the frames were drawn into, device pixels. A time
   * means nothing without it. */
  width: number;
  height: number;
};

export type BenchmarkOpts = {
  /** The player's own game — driven by the bot here, like everything else on
   * the road. */
  state: GameState;
  field: RivalField;
  renderer: GameRenderer;
  canvas: HTMLCanvasElement;
  onStatus: (status: BenchmarkStatus) => void;
};

/** Make the frame's GPU work happen BEFORE the clock is read: reading a
 * single pixel out of the drawing buffer cannot be answered until everything
 * queued behind it has been drawn. Returns a no-op where there is no context
 * to ask, which is a benchmark that measures the CPU half and says so by
 * being suspiciously fast rather than by failing. */
function gpuFence(canvas: HTMLCanvasElement): () => void {
  const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
    canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return (): void => {};
  const pixel = new Uint8Array(4);
  return (): void => {
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  };
}

/** Drive the whole benchmark. Returns the way to stop it early — the pump
 * outlives any one frame, so somebody who walks away from it has to be able
 * to take it off the machine. */
export function runBenchmark({
  state,
  field,
  renderer,
  canvas,
  onStatus,
}: BenchmarkOpts): () => void {
  const fence = gpuFence(canvas);
  // THE MIRROR IS PINNED, like everything else about this run. Left alone it
  // is redrawn at whatever the machine can afford (mirror-pace.ts), and two
  // things would go wrong at once: a session that had already dropped a rung
  // would start the race drawing less than a fresh one does, and the ladder
  // would then climb back mid-measurement — the workload changing under the
  // stopwatch, which is the one thing a fixed workload may not do. Every
  // frame here is fed the same `step` whatever it cost, so the ladder would
  // be reading a rate nobody achieved anyway.
  renderer.pinMirrorPace(MIRROR_TIERS[0].hz);
  const channel = new MessageChannel();
  let stopped = false;
  /** Frames drawn since the green — the measured ones. */
  let frames = 0;
  /** …and frames drawn at all, which is what the card is told off: during
   * the warm-up `frames` is still zero and would report on every one. */
  let drawn = 0;
  /** When the green was, ms on the page's clock; 0 while warming up. */
  let green = 0;
  let elapsed = 0;
  /** When the LAST frame ended, ms on the same clock — so a reading can
   * report the frame it was taken on and not just the run behind it. It is
   * the frame's own duration and nothing averaged in, which is what the
   * card's second line is (benchmark-index.ts).
   *
   * The card's redraw does not land inside it. A reading is reported at the
   * END of the frame it was taken on, so the React render is paid by the
   * NEXT frame — never by a frame that is itself about to be a reading,
   * since the readings are a whole cadence apart. */
  let framed = 0;
  /** The score, read every `SAMPLE_EVERY` measured frames. */
  const samples: BenchSample[] = [];
  /** …and what the frame it was read on cost the renderer. Counting is
   * switched on for the run and off again at the end: it costs three its
   * own counters, which is nothing, but a benchmark that left the meter
   * running would be charging every later race for it.  */
  const costs: FrameCost[] = [];
  let scene: SceneShare[] = [];
  renderer.meterFrames(true);

  /** Hand the mirror back to the frame rate. Whatever ends this run — the
   * last frame or somebody walking away from it — the next thing this
   * renderer draws is a person driving, and they should have the ladder. */
  const release = (): void => {
    renderer.pinMirrorPace(null);
    renderer.meterFrames(false);
  };

  const report = (phase: BenchmarkStatus["phase"]): void => {
    onStatus({
      phase,
      frames,
      seconds: elapsed / 1000,
      index: benchIndex(frames * BENCHMARK.step, elapsed / 1000),
      samples: samples.slice(),
      costs: costs.slice(),
      scene,
      cars: field.of,
      width: canvas.width,
      height: canvas.height,
    });
  };

  const tick = (): void => {
    if (stopped) return;
    // The establishing shot, thrown away exactly the way a driver throws it
    // away: the camera is told first so it flies the rest of the shot rather
    // than cutting, and the whole grid jumps the same beat (`advanceField`)
    // or the field is racing a stagger nobody drove.
    if (state.phase === "intro") {
      renderer.skipIntroShot();
      advanceField(field, skipIntro(state));
    }
    if (green === 0 && state.phase === "racing") {
      green = performance.now();
      framed = green;
    }
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      // The field takes the tick first, then the player, then the one place
      // two cars can be at once — the same order the game's own loop uses,
      // because a benchmark that steps the road differently is measuring a
      // different game.
      stepField(field, state, renderer.field.events);
      const events = step(state, botInput(state));
      if (events.length > 0) renderer.onEvents(state, events);
      const mine: GameEvent[] = rubRivals(field, state, (run, theirs) =>
        renderer.field.events(run, theirs),
      );
      if (mine.length > 0) renderer.onEvents(state, mine);
    }
    renderer.render(state, BENCHMARK.step);
    fence();
    drawn += 1;
    const now = performance.now();
    /** This frame alone, as a rate. */
    let fps = 0;
    if (green !== 0) {
      frames += 1;
      elapsed = now - green;
      fps = now > framed ? 1000 / (now - framed) : 0;
    }
    framed = now;
    const finished = frames >= BENCHMARK.frames;
    // The last frame is a reading whatever it lands on, so the line's end IS
    // the answer on the card rather than a point short of it. It happens to
    // land on the cadence too — but a run length that stopped dividing by it
    // would otherwise draw a graph that never quite reaches its own score.
    if (green !== 0 && (finished || frames % SAMPLE_EVERY === 0)) {
      samples.push({
        frame: frames,
        index: benchIndex(frames * BENCHMARK.step, elapsed / 1000),
        fps,
      });
      costs.push(renderer.meter());
    }
    if (finished) {
      stopped = true;
      // The graph is walked ONCE, here, on the last frame that was drawn —
      // before the mirror is handed back and the meter switched off, so what
      // it reports is the scene the run was actually measured against.
      scene = renderer.sceneTally();
      release();
      report("done");
      return;
    }
    // Warming up there are no measured frames to count, so the countdown is
    // reported off the frames drawn instead — the card is alive from the
    // first one, and the graph stays empty until there is a score to draw.
    if (green === 0) {
      if (drawn % SAMPLE_EVERY === 0) report("warmup");
    } else if (frames % SAMPLE_EVERY === 0) report("running");
    channel.port2.postMessage(0);
  };

  channel.port1.onmessage = tick;
  report("warmup");
  channel.port2.postMessage(0);
  return (): void => {
    stopped = true;
    release();
    channel.port1.onmessage = null;
  };
}
