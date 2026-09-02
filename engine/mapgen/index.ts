// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export {
  STAGE_RULES,
  DEFAULT_KNOBS,
  NUMERIC_KNOBS,
  resolveKnobs,
  knobScale,
  type NumericKnob,
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
export { generateStage, layStageHighways } from "./generate.ts";
export { createStageStream, type StageStream } from "./endless.ts";
export { generateCircuit } from "./circuit.ts";
export { createLandField, type LandField } from "./land.ts";
export {
  HIGHWAY,
  createHighwayNetwork,
  highwayCount,
  layHighways,
  layRailways,
  RAILWAY,
  type Highway,
  type HighwayHit,
  type HighwayKind,
  type HighwayNetwork,
  type HighwayPoint,
  type LineRules,
} from "./highway.ts";
export { createGeology, type GeologyField, type GroundSample } from "./geology.ts";
export {
  ROAD_CROSS,
  corridorOffset,
  crossOffset,
  handoverAt,
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
export {
  SPUR,
  buildSpur,
  placeBlock,
  spurReach,
  type BlockKind,
  type RoadBlock,
  type Spur,
  type SpurLine,
  type SpurSample,
} from "./spurs.ts";
export {
  homesteadSolids,
  placeHomesteads,
  type Homestead,
  type HomesteadContext,
  type LaneTree,
} from "./homesteads.ts";
export {
  farmClearings,
  farmSolids,
  placeFarm,
  rectDistance,
  type Crop,
  type CropField,
  type Farm,
  type FarmGear,
  type FarmRect,
  type FarmSite,
  type GearKind,
  type Paddock,
  type Stock,
} from "./farms.ts";
export {
  drawSchedule,
  joinRailLine,
  lineAt,
  trainAt,
  trainCars,
  trainSolidsNear,
  type RailCrossing,
  type RailLine,
  type TrainCar,
  type TrainSchedule,
} from "./railway.ts";
export {
  BARN_STOREY,
  buildingSolids,
  drawBarnPlan,
  drawHousePlan,
  drawTownPlan,
  parkedSolids,
  wallStoreys,
  type Building,
  type BuildingKind,
  type HousePlan,
  type ParkedCar,
  type RoofKind,
  type WallPaint,
} from "./buildings.ts";
export {
  placeTowns,
  townSolids,
  type Lot,
  type Town,
  type TownContext,
  type TownStreet,
} from "./towns.ts";
export { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
export {
  buildKerbs,
  createKerbField,
  KERB_MARKER,
  markersBetween,
  roleAt,
  type KerbField,
  type KerbMarker,
  type KerbRole,
  type KerbZone,
} from "./kerbs.ts";
export { createStandField, type Stand, type StandField } from "./stands.ts";
export {
  createTerrain,
  builtTerrain,
  computeStreams,
  collectAnchors,
  carveGround,
  inStream,
  LAKE_Y,
  APRON,
  GROUND_CELL,
  GROVE_SCALE,
  REGION_SCALE,
  type GroveCommunity,
  type Region,
  type TerrainField,
  type Stream,
} from "./terrain.ts";
export {
  PARAPET_BAY,
  PARAPET_GAP,
  PARAPET_INSET,
  PARAPET_OUT,
  PARAPET_THICK,
  RAILCAR,
  SOLID_PROP_HEIGHT,
  bridgeParapets,
  isWooden,
  standSolid,
  type SolidKind,
  type WildObstacle,
} from "./solids.ts";
export {
  compileTrack,
  compileStage,
  isLoose,
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
  type Checkpoint,
} from "./compile.ts";
export {
  traceRivers,
  type River,
  type RiverAnchor,
  type RiverPoint,
  type StandingWater,
} from "./river.ts";
export { SEA, type WaterBody, type WaterField } from "./water.ts";
export {
  BIOMES,
  BIOME_IDS,
  biomeRules,
  isBiomeId,
  type BiomeId,
  type BiomeLand,
  type BiomeRules,
} from "./biomes.ts";
export { flatTrack, SURFACES, type FlatTrack } from "./flat.ts";
