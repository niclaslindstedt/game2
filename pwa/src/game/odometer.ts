// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ODOMETER — the kilometres a car has covered, and the drums that read
// them out on the face of the tachometer.
//
// A car's cluster carries TWO of these, and so does this one: the TRIP, in
// the lower window, which is this stage and starts again at zero on every
// one of them, and the TOTAL in the upper window, which is the car's whole
// life. The pair are the same instrument at two lengths, which is why one
// module draws both.
//
// The total is the one number in the game that is not about a run. A time
// belongs to a stage, a place to a field, a record to a board — this belongs
// to the CAR, and it survives everything: a stage abandoned halfway, a
// wreck, a campaign restarted from the first location. Every metre driven
// anywhere counts, because that is what an odometer is: the campaign, a time
// trial, a heads-up race, an evening in Roam, and laps of the training
// ground. The only thing that does not count is a car nobody is driving —
// the bot's demo behind the menu cards is scenery, and scenery does not wear
// a car out (App.tsx meters the run and holds the trip while a menu is up).
//
// Two halves, and the split is the usual one. The DRUMS are arithmetic: a
// distance in, a digit and a fraction of a turn per place out, no storage
// and no DOM, so `tests/odometer_test.ts` can read them. The LEDGER is one
// localStorage key per car, written on the tick rather than on the frame —
// storage can be unavailable (private mode) or full, and a car whose total
// cannot be kept still reads correctly for as long as the tab is open.
//
// WHAT THE DRUM ON THE END IS WORTH, and it is not the same on the two. A
// mechanical counter's rightmost drum turns with the wheels, and that is
// what makes a counter READ as a counter rather than as a number: something
// is always moving, and every step of it is a figure. The TRIP's end drum
// is worth a tenth of a kilometre, the way a car's own trip counter is,
// because a stage is a few kilometres and a window that only stepped at the
// kilometre would sit still for a minute at a time. The TOTAL's is worth a
// whole kilometre: it is the same six drums either way, and spending one of
// them on tenths buys a figure nobody reads on a lifetime reading and costs
// the counter a decade of its range.

/** The step the TRIP reads in, metres. A tenth of a kilometre, which is
 * what the tenth marks on a real drum are. */
export const TRIP_TICK_M = 100;

/** ...and the step the TOTAL reads in: a whole kilometre, so a lifetime
 * reading spends every one of its drums on the unit it is quoted in. */
export const TOTAL_TICK_M = 1000;

/** Drums in the TRIP's window: three for the kilometres and ONE MORE for the
 * tenths, which is the layout on a car's own trip counter and the reason the
 * thing reads as a counter at all — the drum on the end is the one that moves
 * while you are looking at it. A stage is a few kilometres, so 999.9 km is
 * the whole of one many times over. */
export const TRIP_DIGITS = 4;

/** ...and in the TOTAL's: six drums, every one of them a kilometre, so the
 * counter reads to 999999 km — the better part of a hundred thousand miles,
 * which is a car's whole working life — before it rolls quietly back to
 * zero, the way the real thing does. Two digits more than the trip is also
 * what tells the two windows apart at a glance without a word printed on
 * either. */
export const TOTAL_DIGITS = 6;

/** How much of a drum's turn is spent carrying the one above it. A counter
 * does not move its tens drum through the whole of a kilometre — the tens
 * sit still until the units drum is on its last tenth, and then both go
 * over together. That lateness is the whole look of the thing. */
const CARRY = 0.9;

const KEY_PREFIX = "sf.odometer.";

/** One drum of the counter: the digit whose face is coming UP past the
 * window, and how far past it has turned (0 at dead centre, 1 the instant
 * the next digit is dead centre). */
export type Drum = { digit: number; roll: number };

/** The counter's faces, LEFT TO RIGHT as they are read — the most
 * significant drum first, so a component maps this array straight across
 * its window. The last entry is the END drum, the one geared to the wheels,
 * and `tickM` is what one step of it is worth.
 *
 * THE READING is quantized to that tick — every digit comes off it, so the
 * window can never show a half-carried figure — but the TURN is not, and
 * that difference is the whole of what makes the thing look mechanical. The
 * end drum is geared straight to the wheels: at any moment it is part way
 * from the figure it is showing to the next one, and a driver glancing down
 * sees it climbing. The drums above it do not JUMP either; each is dragged
 * over through the last tenth of the drum below it.
 *
 * `metres` is a distance covered; anything that is not one reads as a car
 * that has never been driven. */
export function odometerDrums(
  metres: number,
  digits: number = TRIP_DIGITS,
  tickM: number = TRIP_TICK_M,
): Drum[] {
  const driven = Number.isFinite(metres) && metres > 0 ? metres : 0;
  /** The reading, in whole ticks — every drum's digit comes off this one
   * number, so the window can never show a half-carried figure. */
  const ticks = Math.floor(driven / tickM);
  const out: Drum[] = [];
  for (let place = digits - 1; place >= 0; place--) {
    // The turn this drum is part way through, in its OWN units: the end
    // drum's tick, the one above it ten of them, and so on up the window.
    const turns = driven / (tickM * 10 ** place);
    const part = turns - Math.floor(turns);
    // The end drum has nothing below it to wait for, so it turns through the
    // whole of its own tick; every drum above it sits still until the one
    // below reaches its last tenth, and then goes over with it.
    const carry = place === 0 ? 0 : CARRY;
    out.push({
      digit: Math.floor(ticks / 10 ** place) % 10,
      roll: part < carry ? 0 : (part - carry) / (1 - carry),
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
      // The flush rides a hundred metres — finer than the total's own drum,
      // on purpose: a tab closed mid-kilometre keeps what it covered, and
      // the frames in between still cost nothing.
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
