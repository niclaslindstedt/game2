// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wires the engine's central output module (§19.4) into the oss-framework
// log store, so every engine diagnostic line lands in the same persistent,
// on-device buffer the framework tooling reads. Dev builds also lift debug
// output onto the console.

import { createLogStore } from "@niclaslindstedt/oss-framework/logging";
import { setDebugEnabled, setOutputSink, type OutputLevel } from "@engine";

import { log as debugLog } from "./game/debug-log.ts";

export const logStore = createLogStore({ logsKey: "scandi-flick:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);

const engineLog = logStore.createLogger("engine");

export function connectOutput(): void {
  setDebugEnabled(import.meta.env.DEV);
  setOutputSink((level: OutputLevel, message: string) => {
    if (level === "warn") engineLog.warn(message);
    else if (level === "error") engineLog.error(message);
    else engineLog.info(message);
    // And into the debug log, so a copy taken out of the developer menu has
    // the engine's own account of the run beside the app's. A no-op unless
    // debug mode is on.
    debugLog(`engine:${level}`, message);
    if (import.meta.env.DEV) {
      console.log(`[engine:${level}] ${message}`);
    }
  });
}
