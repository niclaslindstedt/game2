// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ANALYSIS rule book — every threshold the checks score against, as
// data, in one place. `rules.ts` is this file's opposite number: that one
// says what the generator may BUILD, this one says what the result has to
// COME OUT like. Keeping them apart matters, because a threshold moved to
// make a seed score better is a change to the definition of good, and it
// should be as visible in a diff as a change to the vocabulary is.
//
// Every number carries its unit and the reason it is that number. A
// threshold nobody can justify is a threshold that will be quietly widened
// the first time it fails.

//
// It is written two chapters to a file — `budgets-road.ts` and
// `budgets-ground.ts` — so retuning one never opens the other. This is the
// single object they add up to, and `ANALYSIS` is the only name anything
// outside this directory knows.

import { GROUND_BUDGETS } from "./budgets-ground.ts";
import { ROAD_BUDGETS } from "./budgets-road.ts";

export const ANALYSIS = {
  ...ROAD_BUDGETS,
  ...GROUND_BUDGETS,
} as const;
