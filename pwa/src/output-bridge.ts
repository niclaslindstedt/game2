// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wires the engine's central output module (§19.4) into the oss-framework
// log store, so every engine diagnostic line lands in the same persistent,
// on-device buffer the framework tooling reads. Dev builds also lift debug
// output onto the console.

import { createLogStore } from "@niclaslindstedt/oss-framework/logging";
import { setDebugEnabled, setOutputSink, type OutputLevel } from "@engine";

export const logStore = createLogStore({ logsKey: "sideways:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);

const engineLog = logStore.createLogger("engine");

export function connectOutput(): void {
  setDebugEnabled(import.meta.env.DEV);
  setOutputSink((level: OutputLevel, message: string) => {
    if (level === "warn") engineLog.warn(message);
    else if (level === "error") engineLog.error(message);
    else engineLog.info(message);
    if (import.meta.env.DEV) {
      console.log(`[engine:${level}] ${message}`);
    }
  });
}
