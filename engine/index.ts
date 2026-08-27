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
export { createGame, step, type CreateGameOptions } from "./game/step.ts";
export { collideCar, damageZoneAt, landingDamage } from "./game/collision.ts";
export {
  NEUTRAL_INPUT,
  DAMAGE_ZONES,
  INTERNAL_SYSTEMS,
  updateSlip,
  type CarDamage,
  type CarInput,
  type CarState,
  type DamagePart,
  type GameEvent,
  type InternalSystem,
  type GamePhase,
  type GameState,
  type RaceEnv,
  type RunStats,
  type TimeOfDay,
  type Weather,
} from "./game/state.ts";
export { locate, type TrackFix } from "./game/track.ts";
export { CARS, carById, type CarSpec, type GearboxMode } from "./game/defs/cars.ts";
export { TUNING } from "./game/defs/tuning.ts";

// The stage generator.
export {
  STAGE_RULES,
  DEFAULT_KNOBS,
  resolveKnobs,
  knobScale,
  generateStage,
  createStageStream,
  compileTrack,
  compileStage,
  elevationAt,
  SAMPLE_STEP,
  ROAD_CROSS,
  corridorOffset,
  crossOffset,
  vergeOffset,
  wearAt,
  junctionThroat,
  buildSpur,
  spurReach,
  createGuardField,
  createTerrain,
  computeStreams,
  collectAnchors,
  traceRivers,
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
  type River,
  type RiverAnchor,
  type WildObstacle,
  type SegmentPlan,
  type SegmentFeature,
  type TurnSeverity,
  type Crossing,
  type StageKnobs,
  type StageLength,
  type FiniteStageLength,
  type StageStream,
  type Surface,
  type BridgeDeck,
  type RoadJunction,
  type Spur,
  type SpurSample,
  type CornerGuard,
  type GuardField,
  type Track,
  type TrackSample,
  type Pacenote,
} from "./mapgen/index.ts";

// The headless simulator and its bot driver.
export { simulateStage, type SimOptions, type SimResult } from "./sim/simulate.ts";
export { botInput, RALLY_BOT, type BotProfile } from "./sim/bot.ts";

// Deterministic utilities shared with tooling.
export { createRng, type Rng } from "./lib/prng.ts";
export { hash2, smooth, valueNoise } from "./lib/noise.ts";
