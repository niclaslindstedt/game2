// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING A RACE NEEDS BEFORE ITS FIRST FRAME, paid for in slices.
//
// Standing a stage up is the most expensive thing this game does, and almost
// none of it is the road: the generator compiles the route, the renderer
// builds a country and a forest to put it in, fourteen crews each get a game
// of their own, and then — on a field of ghosts — every one of those crews
// DRIVES THE WHOLE STAGE before the player's lights run, because that is what
// a trace is (`engine/sim/field.ts`). On a short campaign stage that is about
// four seconds of pure arithmetic on a fast desktop, and the trace writing is
// three quarters of it.
//
// It used to be paid for twice over, and both ways were visible. The press on
// START ran the compile, the world and the field in ONE synchronous call, so
// the page simply stopped — no frame, no cursor, nothing to say the press had
// landed. Whatever the traces had left then bled into the race itself, four
// milliseconds at a time out of frames the player was trying to drive in, and
// forty out of the ones before the lights.
//
// So it is a LOAD now, with a card over it (`loading-screen.tsx`). The work is
// the same work — the same functions in the same order — but it is cut into
// steps, and every step is asked to stop when the frame is spent so the card
// can be drawn. Nothing is deferred past the green: by the time the card lifts
// the road is compiled, the world is built, the shaders are compiled, the
// fourteen crews have driven the stage and their portraits are taken. The race
// then costs what a race costs.
//
// This module is the SEQUENCING, and nothing else — it never learns what a
// step does, which is what keeps it DOM-free and testable. The steps
// themselves are closures over the app's own refs, built in `App.tsx`.

/** What share of a frame the load may spend, leaving the rest to the browser.
 *
 * The card's own fill no longer needs it — that is a compositor transform now
 * (`mark-tracks.tsx`), and it keeps climbing through a main thread that is
 * blocked solid, which is the whole reason it was moved off a stroke. So this
 * is not what keeps the card alive; it is what keeps the PAGE alive around
 * it. A load that took every millisecond of every frame would still animate,
 * and would still swallow a resize, a pointer event and the card's own
 * compositing along the way. Leaving four frames in ten costs a load a little
 * length and buys a page that is still a page. */
const LOAD_SHARE = 0.6;

/** …bounded, because a share of a frame is only a sane budget while the
 * frames are sane. The floor keeps a machine drawing at 120 Hz from spending
 * five milliseconds a frame on a four-second load; the ceiling keeps one that
 * has fallen to two frames a second from disappearing into a single
 * half-second step it can answer nothing during. */
const LOAD_FLOOR_MS = 12;
const LOAD_CEILING_MS = 250;

/** How long this frame's slice of the load may be, given how long the frames
 * are actually coming.
 *
 * A FIXED budget is the trap here, and it is not a small one: twelve
 * milliseconds is most of a frame on a machine drawing at 60 Hz and about one
 * percent of one on a machine drawing at 1 Hz — so the slower the device, the
 * smaller the SHARE of it the load is allowed, and a four-second load on a
 * quick laptop becomes a five-minute one on a phone that is struggling. The
 * budget has to be a share of whatever a frame currently costs, and only then
 * bounded. */
export function loadBudgetMs(frameMs: number): number {
  const share = frameMs * LOAD_SHARE;
  return Math.min(LOAD_CEILING_MS, Math.max(LOAD_FLOOR_MS, share));
}

/** One piece of the preparation. */
export type LoadStep = {
  /** What it is, for the debug log and for the tests. */
  id: string;
  /** Do as much of this step as `budget` allows. Returns true while there
   * is more of it left to do — which is how a step that can be cut up
   * (writing the crews' traces, entering them one at a time) says so.
   *
   * A step that CANNOT be cut up — compiling the road, building the world —
   * ignores the budget, does the whole thing and returns false. It will
   * overrun, and the card will hold a frame; that is the honest cost of an
   * indivisible piece of work, and the reason the divisible ones are cut. */
  run: (budget: () => boolean) => boolean;
};

/** A preparation part-way through. */
export type LoadJob = {
  steps: readonly LoadStep[];
  /** The step being paid for; `steps.length` once the load is done. */
  at: number;
  /** What each step has cost so far, ms, in the steps' own order. Read by
   * the debug log — it is the only place the shape of a load is visible,
   * and the thing to look at when one gets slow. */
  spent: number[];
};

export function createLoad(steps: readonly LoadStep[]): LoadJob {
  return { steps, at: 0, spent: steps.map(() => 0) };
}

/** Spend what `budget` allows of this frame on the load, and return true
 * while there is more to do.
 *
 * The budget is the only thing that ends a frame's slice. It is asked after
 * every piece of work and handed to each step to ask inside itself, and while
 * it still says yes the load keeps going — into the same step again if that
 * step has more to give, on to the next one if it does not. A step saying
 * "more to do" is therefore not a yield: `enterCrew` says it after every one
 * of fourteen crews, and a frame with room for three of them should take
 * three rather than sit out the other two.
 *
 * `clock` is the caller's, so the tests can run a load without one. */
export function advanceLoad(job: LoadJob, budget: () => boolean, clock: () => number): boolean {
  while (job.at < job.steps.length) {
    const at = job.at;
    const started = clock();
    const more = job.steps[at].run(budget);
    job.spent[at] += clock() - started;
    if (!more) job.at = at + 1;
    if (!budget()) break;
  }
  return job.at < job.steps.length;
}
