// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ODOMETER — the kilometres a car has covered in its whole life, and the
// drums that read them out in the middle of the tachometer.
//
// It is the one number in the game that is not about a run. A time belongs
// to a stage, a place to a field, a record to a board — this belongs to the
// CAR, and it survives everything: a stage abandoned halfway, a wreck, a
// campaign restarted from the first location. Every metre driven anywhere
// counts, because that is what an odometer is: the campaign, a time trial,
// a heads-up race, an evening in Roam, and laps of the training ground. The
// only thing that does not count is a car nobody is driving — the bot's
// demo behind the menu cards is scenery, and scenery does not wear a car
// out (App.tsx meters the run and holds the trip while a menu is up).
//
// Two halves, and the split is the usual one. The DRUMS are arithmetic: a
// distance in, a digit and a fraction of a turn per place out, no storage
// and no DOM, so `tests/odometer_test.ts` can read them. The LEDGER is one
// localStorage key per car, written on the tick rather than on the frame —
// storage can be unavailable (private mode) or full, and a car whose total
// cannot be kept still reads correctly for as long as the tab is open.
//
// WHY A HUNDRED METRES. A mechanical counter's rightmost drum turns with
// the wheels, and the tenth marks on it are what makes a counter READ as a
// counter rather than as a number: something is always moving, and every
// hundred metres it moves a visible step. So the reading is quantized to
// the tenth of a kilometre, the drum shows the fraction it has turned, and
// the flush to storage rides the same tick — the cadence that is visible is
// the cadence that is saved.

/** The step the counter reads in, metres. A tenth of a kilometre, which is
 * what the tenth marks on a real drum are. */
export const TRIP_TICK_M = 100;

/** Drums in the window: six for the kilometres and ONE MORE for the tenths,
 * which is the layout on a car's own counter and the reason the thing reads
 * as a counter at all — the drum on the end is the one that moves while you
 * are looking at it. It counts to 999 999.9 km and then, like the real
 * thing, rolls quietly back to zero. */
export const ODO_DIGITS = 7;

/** How much of a drum's turn is spent carrying the one above it. A counter
 * does not move its tens drum through the whole of a kilometre — the tens
 * sit still until the units drum is on its last tenth, and then both go
 * over together. That lateness is the whole look of the thing. */
const CARRY = 0.9;

/** Metres in a kilometre — the unit the drums above the tenths count in. */
const KM = 1000;

const KEY_PREFIX = "sf.odometer.";

/** One drum of the counter: the digit whose face is coming UP past the
 * window, and how far past it has turned (0 at dead centre, 1 the instant
 * the next digit is dead centre). */
export type Drum = { digit: number; roll: number };

/** The counter's faces, LEFT TO RIGHT as they are read — the most
 * significant drum first, so a component maps this array straight across
 * its window. The last entry is the TENTHS drum.
 *
 * The reading is quantized to the tick: the tenths drum steps a whole digit
 * every hundred metres and stands still in between, which is what makes it
 * a counter and not a number. The drums above it are not quantized, because
 * a counter's tens drum does not JUMP — it is dragged over through the last
 * tenth of the drum below it, and on a car that tenth is the last hundred
 * metres of the kilometre. So the carry is read off the true distance and
 * the kilometre digit visibly rolls over as you finish one.
 *
 * `metres` is a lifetime total; anything that is not a real distance reads
 * as a car that has never been driven. */
export function odometerDrums(metres: number, digits: number = ODO_DIGITS): Drum[] {
  const driven = Number.isFinite(metres) && metres > 0 ? metres : 0;
  /** The reading, in tenths of a kilometre — every drum's digit comes off
   * this one number, so the window can never show a half-carried figure. */
  const ticks = Math.floor(driven / TRIP_TICK_M);
  const out: Drum[] = [];
  for (let place = digits - 1; place >= 0; place--) {
    // The turn this drum is part way through, in its OWN units: the tenths
    // drum's tenth of a kilometre, the units drum's kilometre, the tens
    // drum's ten kilometres.
    const turns = driven / (KM * 10 ** (place - 1));
    const part = turns - Math.floor(turns);
    out.push({
      digit: Math.floor(ticks / 10 ** place) % 10,
      // The tenths drum ticks; every drum above it waits for the one below
      // to reach its last tenth and then goes over with it.
      roll: place === 0 ? 0 : part < CARRY ? 0 : (part - CARRY) / (1 - CARRY),
    });
  }
  return out;
}

/** The lifetime metres on a car, or nothing on a car that has never turned
 * a wheel. A key can be hand-edited or left over from another build, so
 * what comes back is trusted for nothing it claims. */
export function loadOdometer(carId: string): number {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + carId);
    if (stored === null) return 0;
    const metres = Number(stored);
    return Number.isFinite(metres) && metres > 0 ? metres : 0;
  } catch {
    return 0;
  }
}

export function saveOdometer(carId: string, metres: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + carId, Math.round(metres).toString());
  } catch {
    /* storage unavailable or full — the counter still reads for this tab */
  }
}

/** THE CAR'S COUNTER, OPEN, with a run running into it. */
export type Trip = {
  /** The car this one belongs to — one counter per car, for its whole life. */
  readonly carId: string;
  /**
   * Bank whatever the run has covered since the last look and read the
   * lifetime total back, metres. `runM` is `state.stats.distance` — the
   * run's own accumulator, which starts again at zero on every stage.
   *
   * A run that has covered LESS than the last look is a different run (a
   * restart, the next stage, the demo behind a menu card), so the trip
   * simply re-baselines on it: what a car did on a stage nobody is driving
   * any more is not distance this one owes.
   */
  look(runM: number): number;
  /** Stop counting until the next look, and count nothing for the gap. The
   * caller's way of saying THIS IS NOT BEING DRIVEN — a menu's demo, the
   * autopilot — without having to know how far it got. */
  hold(): void;
  /** The lifetime total as it stands, metres. */
  total(): number;
  /** Write the total out now, whatever the tick says — the way out of a
   * stage, and the way out of the page. */
  flush(): void;
};

export function createTrip(carId: string): Trip {
  let total = loadOdometer(carId);
  /** How far into the run the last look was, or null when the next look is
   * a baseline rather than a distance. */
  let seen: number | null = null;
  let savedTick = Math.floor(total / TRIP_TICK_M);
  return {
    carId,
    look(runM: number): number {
      const run = Number.isFinite(runM) && runM > 0 ? runM : 0;
      if (seen !== null && run >= seen) total += run - seen;
      seen = run;
      const tick = Math.floor(total / TRIP_TICK_M);
      // The flush rides the tick the drum steps on: a hundred metres is one
      // write, and the frames in between cost nothing.
      if (tick !== savedTick) {
        savedTick = tick;
        saveOdometer(carId, total);
      }
      return total;
    },
    hold(): void {
      seen = null;
    },
    total: () => total,
    flush(): void {
      savedTick = Math.floor(total / TRIP_TICK_M);
      saveOdometer(carId, total);
    },
  };
}
