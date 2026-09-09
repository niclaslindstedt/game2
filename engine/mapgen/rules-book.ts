// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RULE BOOK, ASSEMBLED. Every constraint the generator obeys is data,
// and it is written one chapter to a file (`rules-route.ts`,
// `rules-land.ts`, …) so tuning one subject never opens the others. This is
// the single object they add up to — the one `mapgen/` reads, always as
// `STAGE_RULES`. Nothing but the spread belongs here; a new rule goes in
// the chapter that owns its subject.

import { BUILT_RULES } from "./rules-built.ts";
import { DIAL_RULES } from "./rules-dials.ts";
import { FEATURE_RULES } from "./rules-features.ts";
import { GEOLOGY_RULES } from "./rules-geology.ts";
import { LAND_RULES } from "./rules-land.ts";
import { ROUTE_RULES } from "./rules-route.ts";
import { SETTLEMENT_RULES } from "./rules-settlement.ts";

export const STAGE_RULES = {
  ...ROUTE_RULES,
  ...LAND_RULES,
  ...GEOLOGY_RULES,
  ...FEATURE_RULES,
  ...BUILT_RULES,
  ...SETTLEMENT_RULES,
  ...DIAL_RULES,
} as const;
