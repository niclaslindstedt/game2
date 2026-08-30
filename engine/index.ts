// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Public entry point for the game engine. The engine is framework-free and
// renderer-free: the browser app under `pwa/` consumes this module via the
// `@engine` alias, drives `step()` from its render loop at a fixed timestep,
// and reads the returned state to draw. The headless simulator and the
// tests consume the very same surface. See docs/architecture.md.

export { engineVersion } from "./version.ts";
export {
  status,
  info,
  warn,
  error,
  header,
  debug,
  setOutputSink,
  setDebugEnabled,
  recentLogs,
  type OutputLevel,
  type OutputSink,
} from "./output.ts";

// The simulation.
export { createGame, skipIntro, startsIn, step, type CreateGameOptions } from "./game/step.ts";
export {
  clipKerbs,
  collideCar,
  collideCars,
  damageZoneAt,
  landingDamage,
  type ContactSide,
} from "./game/collision.ts";
export {
  NEUTRAL_INPUT,
  DAMAGE_ZONES,
  INTERNAL_SYSTEMS,
  updateSlip,
  type CarDamage,
  type CarInput,
  type CarState,
  type CatchUp,
  type DamagePart,
  type DrownState,
  type GameEvent,
  type InternalSystem,
  type GamePhase,
  type GameState,
  type RaceEnv,
  type RunStats,
  type Season,
  type TimeOfDay,
  type Weather,
} from "./game/state.ts";
export {
  crossedFinish,
  gateHalfWidth,
  lastCheckpoint,
  locate,
  trackLost,
  wayHome,
  type TrackFix,
  type WayHome,
} from "./game/track.ts";
export {
  CARS,
  carById,
  gearedSpec,
  type CarSpec,
  type DriveLayout,
  type GearboxMode,
} from "./game/defs/cars.ts";
export { TUNING } from "./game/defs/tuning.ts";
// What a car CAN do, as the handling model itself defines it — the limits
// the physics enforces and the bot plans around, stated once (limits.ts).
export { askedSlide, cornerSpeed, latCeiling, slideFloor, wheelSlide } from "./game/limits.ts";
// ...and how much of the car is standing on the road at this instant, which
// every one of those limits is spent through (car.ts).
export { tyreLoad } from "./game/car.ts";

// The stage generator.
export {
  STAGE_RULES,
  DEFAULT_KNOBS,
  resolveKnobs,
  knobScale,
  generateStage,
  generateCircuit,
  circuitLapBand,
  createStageStream,
  compileTrack,
  compileStage,
  elevationAt,
  finishAt,
  finishIndex,
  SAMPLE_STEP,
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
  SPUR,
  buildSpur,
  spurReach,
  createGuardField,
  buildKerbs,
  createKerbField,
  KERB_MARKER,
  markersBetween,
  roleAt,
  createStandField,
  createTerrain,
  computeStreams,
  collectAnchors,
  traceRivers,
  carveGround,
  inStream,
  LAKE_Y,
  createLandField,
  HIGHWAY,
  createHighwayNetwork,
  highwayCount,
  layHighways,
  type Highway,
  type HighwayNetwork,
  type LandField,
  APRON,
  GROUND_CELL,
  GROVES,
  GROVE_SCALE,
  REGIONS,
  REGION_SCALE,
  PARAPET_BAY,
  PARAPET_GAP,
  PARAPET_INSET,
  PARAPET_OUT,
  PARAPET_THICK,
  SOLID_PROP_HEIGHT,
  bridgeParapets,
  isWooden,
  standSolid,
  type SolidKind,
  type GroveCommunity,
  type Region,
  type TerrainField,
  type Stream,
  type River,
  type RiverAnchor,
  type StandingWater,
  type WaterBody,
  type WaterField,
  type WildObstacle,
  type SegmentPlan,
  type SegmentFeature,
  type TurnSeverity,
  type Crossing,
  type StageKnobs,
  type StageLength,
  type FiniteStageLength,
  type StageShape,
  type StageStream,
  type Surface,
  type BridgeDeck,
  type RoadJunction,
  type Spur,
  type SpurSample,
  type RoadBlock,
  type BlockKind,
  type CornerGuard,
  type GuardField,
  type KerbField,
  type KerbMarker,
  type KerbRole,
  type KerbZone,
  type Stand,
  type StandField,
  type Track,
  type TrackSample,
  type Pacenote,
  type Checkpoint,
} from "./mapgen/index.ts";

// The headless simulator and its bot driver.
export { simulateStage, type SimOptions, type SimResult } from "./sim/simulate.ts";
export { botInput, gridRev, RALLY_BOT, type BotProfile, type TrafficCar } from "./sim/bot.ts";
export { simulateHeat, type HeatEntry, type HeatOptions, type HeatResult } from "./sim/heat.ts";
export {
  AXIS_MAX,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  SKILL_AXES,
  SKILL_MAX,
  budgetFor,
  gearboxFor,
  profileFor,
  skillPoints,
  temperFor,
  MANUAL_HANDS,
  spend,
  type BotSkill,
  type Difficulty,
  type SkillAxis,
  type TemperBand,
} from "./sim/skill.ts";
export {
  APRON_HOLDS,
  GRID_DEFAULT,
  GRID_MAX,
  GRID_MIN,
  catchUpFor,
  gridSize,
  headsUpField,
  massStartGrid,
  type GridSlot,
} from "./sim/grid.ts";
export {
  FIELD_SIZE,
  GRID_STAGGER,
  PLAYER_NUMBER,
  RIVALS,
  START_INTERVAL,
  entryList,
  rivalField,
  type RivalCrew,
  type RivalEntry,
} from "./sim/rivals.ts";

// The field on the road: entering it, stepping it, and classifying it.
export {
  PLAYER_ID,
  RALLY_FIELD,
  advanceField,
  advanceRun,
  createField,
  fieldResults,
  livePlace,
  onRoad,
  payHeadStart,
  placeAtFinish,
  placeAtSplit,
  playerSlot,
  rubRivals,
  settleField,
  settleLimit,
  splitLeader,
  stepField,
  stopField,
  type ClassRow,
  type FieldContact,
  type FieldPlan,
  type FieldStage,
  type RivalField,
  type RivalRun,
} from "./sim/field.ts";

// The run tape: a whole run written down as the controls that drove it,
// and the headless race that records or replays one.
export {
  SAMPLE_EVERY,
  TAPE_FORMAT,
  createTapeRecorder,
  fieldAt,
  parseTape,
  readTape,
  type RunTape,
  type TapeCar,
  type TapeHeader,
  type TapeInput,
  type TapeRecorder,
  type TapeResult,
  type TapeRival,
  type TapeSample,
  type TapeStage,
  type TapeStart,
} from "./sim/tape.ts";
export {
  placeAmongField,
  race,
  type RaceDrift,
  type RaceDriver,
  type RaceOptions,
  type RaceOutcome,
} from "./sim/race.ts";

// The generator's scoreboard: a stage measured against what a stage has to
// be, so tuning the rules is a loop with a number at the end of it.
export {
  ANALYSIS,
  analyzeSeed,
  analyzeTrack,
  type AnalyzeOptions,
  type Check,
  type Finding,
  type MetricReport,
  type Severity,
  type StageReport,
} from "./analysis/index.ts";

// Deterministic utilities shared with tooling.
export { createRng, type Rng } from "./lib/prng.ts";
export { hash2, smooth, valueNoise } from "./lib/noise.ts";
