// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The central output module (§19.4): semantic helpers fan out to the host
// sink, early lines are buffered and replayed when a sink attaches, and
// debug lines stay silent until enabled.
import { afterEach, describe, expect, it } from "vitest";

import {
  debug,
  error,
  header,
  info,
  recentLogs,
  setDebugEnabled,
  setOutputSink,
  status,
  warn,
  type OutputLevel,
} from "@engine";

afterEach(() => {
  setOutputSink(null);
  setDebugEnabled(false);
});

describe("output module", () => {
  it("routes every semantic helper to the sink with its level", () => {
    const seen: [OutputLevel, string][] = [];
    setOutputSink((level, message) => seen.push([level, message]));
    status("s");
    info("i");
    warn("w");
    error("e");
    const tail = seen.slice(-4);
    expect(tail).toEqual([
      ["status", "s"],
      ["info", "i"],
      ["warn", "w"],
      ["error", "e"],
    ]);
  });

  it("replays buffered lines into a late-attaching sink", () => {
    status("early-line");
    const seen: string[] = [];
    setOutputSink((_level, message) => seen.push(message));
    expect(seen).toContain("early-line");
    expect(recentLogs().some((l) => l.message === "early-line")).toBe(true);
  });

  it("headers arrive as marked status lines", () => {
    const seen: string[] = [];
    setOutputSink((_level, message) => seen.push(message));
    header("Stage");
    expect(seen[seen.length - 1]).toContain("Stage");
  });

  it("debug lines are dropped until enabled", () => {
    const seen: [OutputLevel, string][] = [];
    setOutputSink((level, message) => seen.push([level, message]));
    debug("hidden");
    expect(seen.some(([, m]) => m === "hidden")).toBe(false);
    setDebugEnabled(true);
    debug("visible");
    expect(seen.some(([, m]) => m === "visible")).toBe(true);
  });
});
