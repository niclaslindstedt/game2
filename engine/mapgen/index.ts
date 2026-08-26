// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export {
  STAGE_RULES,
  type SegmentPlan,
  type TurnSeverity,
  type SegmentFeature,
  type StageLength,
  type FiniteStageLength,
} from "./rules.ts";
export { generateStage, createStageStream, type StageStream } from "./generate.ts";
export {
  compileTrack,
  compileStage,
  elevationAt,
  SAMPLE_STEP,
  type Track,
  type TrackSample,
  type Surface,
  type Pacenote,
} from "./compile.ts";
