// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export {
  STAGE_RULES,
  DEFAULT_KNOBS,
  resolveKnobs,
  knobScale,
  type SegmentPlan,
  type TurnSeverity,
  type SegmentFeature,
  type Crossing,
  type StageKnobs,
  type StageLength,
  type FiniteStageLength,
  type StageShape,
  circuitLapBand,
} from "./rules.ts";
export { generateStage, createStageStream, type StageStream } from "./generate.ts";
export { generateCircuit } from "./circuit.ts";
export { createLandField, type LandField } from "./land.ts";
export {
  ROAD_CROSS,
  corridorOffset,
  crossOffset,
  vergeOffset,
  wearAt,
  rutAt,
  junctionDust,
  junctionFlat,
  junctionMainEdge,
  junctionPlatformY,
  roadClearance,
  type RoadShape,
} from "./road.ts";
export { SPUR, buildSpur, spurReach, type Spur, type SpurSample } from "./spurs.ts";
export { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
export { buildKerbs, type KerbRole, type KerbZone } from "./kerbs.ts";
export { createStandField, type Stand, type StandField } from "./stands.ts";
export {
  createTerrain,
  computeStreams,
  collectAnchors,
  carveGround,
  inStream,
  LAKE_Y,
  APRON,
  GROUND_CELL,
  GROVES,
  GROVE_SCALE,
  type GroveCommunity,
  type TerrainField,
  type Stream,
} from "./terrain.ts";
export { SOLID_PROP_HEIGHT, standSolid, type SolidKind, type WildObstacle } from "./solids.ts";
export {
  compileTrack,
  compileStage,
  elevationAt,
  finishAt,
  finishIndex,
  SAMPLE_STEP,
  type Track,
  type TrackSample,
  type Surface,
  type BridgeDeck,
  type RoadJunction,
  type Pacenote,
} from "./compile.ts";
export { traceRivers, type River, type RiverAnchor, type RiverPoint } from "./river.ts";
export { flatTrack, SURFACES, type FlatTrack } from "./flat.ts";
