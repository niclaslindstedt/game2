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
// There are only two ways to pay for that, and one of them is not available.
// Bought in ONE synchronous call, the page simply stops — no frame, no cursor,
// nothing to say the press has landed; left to arrive during the race, the
// trace writing costs four milliseconds a frame out of frames the player is
// trying to drive in, and forty out of the ones before the lights.
//
// So it is a LOAD, with a card over it (`loading-screen.tsx`). The work is the
// same work — the same functions in the same order — but it is cut into
// steps, and every step is asked to stop when the frame is spent so the card
// can be drawn. Nothing is deferred past the green: by the time the card lifts
// the road is compiled, the world is built, the shaders are compiled, the
// fourteen crews have driven the stage and their portraits are taken. The race
// then costs what a race costs.
//
// This module is the SEQUENCING, and nothing else — it never learns what a
// step does, which is what keeps it DOM-free and testable. The steps
// themselves are closures over the app's own refs, built in `App.tsx`, and
// each brings the words the card says while it is being paid for.

/** What share of a frame the load may spend, leaving the rest to the browser.
 *
 * NOT what keeps the card alive: everything the card animates is a compositor
 * transform (`mark-tracks.tsx`, and the phase bar in `loading-screen.tsx`),
 * which keeps moving through a main thread that is blocked solid. This is
 * what keeps the PAGE alive around it. A load that took every millisecond of
 * every frame would still animate,
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
  /** What the CARD says while this step is being paid for — plain words for
   * the player, not the id. Steps sharing a label are one PHASE and one slot
   * in the card's count (`loadPhase`), so a step too quick to read never gets
   * a line of its own to flash on. */
  label: string;
  /** How far through this step is, 0–1, where the WORK can honestly say —
   * crews entered out of an entry list, road written out of a stage. Left
   * off by the steps that cannot: compiling a road and building a country
   * are single calls that are nought and then one, and a number invented for
   * them would be a number the card was making up. What the card does
   * instead is `expectedMs` on the phase. */
  progress?: () => number;
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
   * and the thing to look at when one gets slow — and written back out as
   * the next load's `expected` (`loadTimes`). */
  spent: number[];
  /** What each step cost LAST TIME ON THIS MACHINE, ms, by step id. The only
   * thing a phase that cannot count its own work has to fill a bar from, and
   * empty until a machine has stood a race up once. */
  expected: Readonly<Record<string, number>>;
};

export function createLoad(
  steps: readonly LoadStep[],
  expected: Readonly<Record<string, number>> = {},
): LoadJob {
  return { steps, at: 0, spent: steps.map(() => 0), expected };
}

/** What this load cost, by step id — the next one's `expected`. Only worth
 * keeping off a load that RAN to the end; a job abandoned part-way has half
 * a step's cost in it, and remembering that would tell the next card the
 * work takes half as long as it does. */
export function loadTimes(job: LoadJob): Record<string, number> {
  const times: Record<string, number> = {};
  if (job.at < job.steps.length) return times;
  job.steps.forEach((step, i) => (times[step.id] = job.spent[i]));
  return times;
}

/** What the card says: which phase is being paid for, where it sits, and
 * what the bar under it is allowed to claim. */
export type LoadPhase = {
  label: string;
  /** 1-based. */
  at: number;
  of: number;
  /** How far through this phase the WORK says it is, 0–1 — a measurement,
   * safe to draw as a bar sitting at exactly that. Null where no step in the
   * phase can count itself, and then `expectedMs` is all there is. */
  done: number | null;
  /** How long this phase took last time on this machine, ms — what a phase
   * with nothing to count runs its bar against, on a clock the compositor
   * keeps rather than the blocked main thread. Null until a machine has run
   * a load once, which is the one case with nothing to say at all. */
  expectedMs: number | null;
};

/** Where the card says the load has got to: the phase being paid for, and
 * how many there are.
 *
 * A PHASE is a run of neighbouring steps that share a label. The split into
 * steps is about what can be CUT UP — arming a ghost and arming a tape are
 * two calls because they are two calls — and a card that counted those would
 * be counting the app's plumbing at the player: eight slots, three of which
 * are gone before a frame can draw them. Counting labels instead lets the
 * steps stay as fine as the work needs while the card stays as coarse as a
 * person reads.
 *
 * `at` is 1-based and holds at the last phase once the load is done, so the
 * card never reads `(6/5)` on the frame it lifts.
 */
export function loadPhase(job: LoadJob): LoadPhase {
  const labels: string[] = [];
  let at = 0;
  const here = Math.min(job.at, job.steps.length - 1);
  for (let i = 0; i < job.steps.length; i++) {
    const label = job.steps[i].label;
    if (labels[labels.length - 1] !== label) labels.push(label);
    if (i === here) at = labels.length;
  }
  const label = labels[at - 1] ?? "";
  // The steps this phase is made of — a run of neighbours, so first and last
  // are all it takes.
  let from = here;
  while (from > 0 && job.steps[from - 1].label === label) from--;
  let to = here;
  while (to + 1 < job.steps.length && job.steps[to + 1].label === label) to++;

  // MEASURED: every step of the phase weighs the same, a finished one counts
  // whole, and the running one counts whatever it says of itself. Offered
  // only where something in the phase can actually count — a phase where
  // nothing can would otherwise report a bar that moved once per step.
  let countable = false;
  let done = 0;
  for (let i = from; i <= to; i++) {
    if (job.steps[i].progress) countable = true;
    if (i < job.at) done += 1;
    else if (i === job.at) done += clamp01(job.steps[i].progress?.() ?? 0);
  }

  // ESTIMATED: what the whole phase cost last time. All of its steps or none
  // — a half-known phase would run its bar against a fraction of the work.
  let expectedMs: number | null = 0;
  for (let i = from; i <= to && expectedMs !== null; i++) {
    const was = job.expected[job.steps[i].id];
    expectedMs = was === undefined ? null : expectedMs + was;
  }

  return {
    label,
    at,
    of: labels.length,
    done: countable ? clamp01(done / (to - from + 1)) : null,
    expectedMs,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
 * A PHASE BOUNDARY is the one thing that ends a slice early. The card names
 * the phase it is about to pay for, and a frame that ran three phases through
 * would name none of them: the words would arrive after the work, or — where
 * the tail of a load finishes inside one slice — never arrive at all. So the
 * spend stops where the label changes, the caller draws, and the next frame
 * buys the phase it has just announced. It costs one frame per phase against
 * a load measured in seconds.
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
    if (job.at !== at && job.steps[job.at]?.label !== job.steps[at].label) break;
  }
  return job.at < job.steps.length;
}
