// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The deterministic 2D value noise now lives in the engine (the physics
// rides the same landscape the renderer draws); re-exported here so the
// app layer keeps its import path.

export { hash2, smooth, valueNoise } from "@engine";
