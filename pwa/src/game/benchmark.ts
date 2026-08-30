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
// machine is through the same race in less of it. Lower is better, and two
// numbers are two numbers about the same thing.
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
// THE WARM-UP. The first frames of any run are the expensive ones: shaders
// compile, geometry and textures go up to the card, and the first of each
// kind of effect allocates its pool. That is a real cost and it is not what
// this is measuring, so the clock does not start until the lights go out —
// the establishing shot is thrown away the way a driver throws it away, and
// the countdown behind it is the warm-up.

import {
  TUNING,
  botInput,
  skipIntro,
  step,
  type Difficulty,
  type GameEvent,
  type GameState,
  type GearboxMode,
} from "@engine";

import {
  advanceField,
  rubRivals,
  stepField,
  type FieldPlan,
  type RivalField,
} from "./standings.ts";
import type { GameRenderer } from "./renderer.ts";
import type { PlayCamera } from "./settings.ts";

/** WHAT THE BENCHMARK RUNS. Every one of these is pinned rather than read
 * off the player's own settings: a measurement that moved with whichever car
 * somebody last drove, or whichever gearbox they prefer, would be a number
 * that only compares to itself. The one thing deliberately left alone is
 * OPTIONS ▸ VIDEO — the whole point of running this twice is to find out
 * what a resolution or a draw distance costs. */
export type BenchmarkPlan = {
  /** The campaign's first stage: short, open, and on every install. */
  levelId: string;
  /** The car the benchmark is driven in. */
  carId: string;
  /** …and its box, which is a different CAR and not a preference: the two
   * modes scale the gear tops and the per-gear drive (`gearedSpec`), and a
   * manual shift costs a cut the auto box does not pay. */
  gearbox: GearboxMode;
  /** The view it is drawn from. The cameras cost different amounts — a
   * cockpit draws an interior, a chase view draws the car and more road — so
   * the benchmark states one instead of inheriting one. */
  camera: PlayCamera;
  /** The field: everybody, on one green, so the cars are ON SCREEN rather
   * than spread a rally interval apart down the road. `createField` clamps
   * the count to what the start apron actually holds, and the result card
   * prints what was standing there. */
  field: FieldPlan;
  /** Seconds of game each rendered frame advances. A sixtieth divides the
   * engine's 120 Hz step exactly, so a frame is two steps with nothing left
   * over — the race is the same race every time it is run. */
  step: number;
  /** Frames MEASURED, after the warm-up. Thirty seconds of racing at the
   * step above: long enough to cover the grid, the run to the first corner
   * and a real stretch of stage, short enough that the machine being
   * measured is not tied up for a minute. */
  frames: number;
};

export const BENCHMARK: BenchmarkPlan = {
  levelId: "taiga-1",
  carId: "compact",
  gearbox: "auto",
  camera: "chase",
  field: { difficulty: "medium" as Difficulty, cars: 15, massStart: true },
  step: 1 / 60,
  frames: 1800,
};

/** Engine steps per rendered frame. Exact by construction (see `step`), so
 * no accumulator is carried between frames and nothing drifts. */
const STEPS_PER_FRAME = Math.max(1, Math.round(BENCHMARK.step / TUNING.dt));

/** How often the card is told where the run is, in frames. Half a second of
 * game, which is a readable counter and sixty renders of a small card over
 * the whole benchmark — far below anything the clock can see. */
const REPORT_EVERY = 30;

/** Where the benchmark is, and what it has to say about itself. */
export type BenchmarkStatus = {
  /** `warmup` is the countdown, drawn but not timed; `running` is the
   * measured stretch; `done` is the answer. */
  phase: "warmup" | "running" | "done";
  /** Measured frames drawn so far, of `BENCHMARK.frames`. */
  frames: number;
  /** Wall clock since the lights went out, seconds — THE NUMBER. */
  seconds: number;
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

  const report = (phase: BenchmarkStatus["phase"]): void => {
    onStatus({
      phase,
      frames,
      seconds: elapsed / 1000,
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
    if (green === 0 && state.phase === "racing") green = performance.now();
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
    if (green !== 0) {
      frames += 1;
      elapsed = performance.now() - green;
    }
    if (frames >= BENCHMARK.frames) {
      stopped = true;
      report("done");
      return;
    }
    if (drawn % REPORT_EVERY === 0) report(green === 0 ? "warmup" : "running");
    channel.port2.postMessage(0);
  };

  channel.port1.onmessage = tick;
  report("warmup");
  channel.port2.postMessage(0);
  return (): void => {
    stopped = true;
    channel.port1.onmessage = null;
  };
}
