// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wires the engine's central output module (§19.4) into the app's debug log,
// so an engine diagnostic lands in the same buffer the developer menu copies
// out — the engine's account of a run sitting beside the app's, in order.
// Dev builds also lift the line onto the console.

import { setDebugEnabled, setOutputSink, type OutputLevel } from "@engine";

import { log as debugLog } from "./game/debug-log.ts";

export function connectOutput(): void {
  setDebugEnabled(import.meta.env.DEV);
  setOutputSink((level: OutputLevel, message: string) => {
    debugLog(`engine:${level}`, message);
    if (import.meta.env.DEV) {
      console.log(`[engine:${level}] ${message}`);
    }
  });
}
