// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export { STAGE_RULES, type SegmentPlan, type TurnSeverity, type SegmentFeature } from "./rules.ts";
export { generateStage } from "./generate.ts";
export {
  compileTrack,
  elevationAt,
  SAMPLE_STEP,
  type Track,
  type TrackSample,
  type Surface,
} from "./compile.ts";
