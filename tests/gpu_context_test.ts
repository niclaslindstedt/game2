// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GPU CONTEXT WATCH — the rules `pwa/src/game/gpu-context.ts` keeps for
// the one part of the render stack the page does not own.
//
// A phone browser reclaims the WebGL context from a tab it has backgrounded,
// and rotating the screen in another app is the everyday way to get there.
// Every rule below is one the app is silently broken without, and none of them
// shows up in a screenshot of a machine that never loses a context:
//
//   - the loss is REFUSED, or the browser never offers the context back and
//     the canvas stays blank for the rest of the session;
//   - the caller hears about it, because a run driven on behind a screen that
//     cannot draw is a run the player loses without seeing it;
//   - a repeated event does not raise the answer twice — the app's answer to a
//     loss pauses a run and is not idempotent.

import { describe, expect, it } from "vitest";

import { watchGpuContext, type ContextEvent } from "../pwa/src/game/gpu-context.ts";

/** A stand-in canvas that keeps its listeners so the test can fire them. */
function fakeCanvas() {
  const listeners = new Map<string, ((event: ContextEvent) => void)[]>();
  return {
    addEventListener: (type: string, fn: (event: ContextEvent) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: (event: ContextEvent) => void) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((f) => f !== fn),
      );
    },
    /** Fire one, and report whether anybody refused the default action. */
    fire: (type: string): boolean => {
      let prevented = false;
      const event: ContextEvent = {
        preventDefault: () => {
          prevented = true;
        },
      };
      for (const fn of listeners.get(type) ?? []) fn(event);
      return prevented;
    },
    count: (type: string): number => (listeners.get(type) ?? []).length,
  };
}

function watch() {
  const canvas = fakeCanvas();
  const calls: string[] = [];
  const gpu = watchGpuContext(canvas, {
    onLost: () => calls.push("lost"),
    onRestored: () => calls.push("restored"),
  });
  return { canvas, calls, gpu };
}

describe("watchGpuContext", () => {
  it("starts with a context, because it was handed a live one", () => {
    expect(watch().gpu.lost()).toBe(false);
  });

  it("refuses the loss, which is the only thing that makes it recoverable", () => {
    // Without preventDefault the browser takes the context away for good: no
    // `webglcontextrestored` ever arrives and the canvas is blank until the
    // page is reloaded.
    const { canvas } = watch();
    expect(canvas.fire("webglcontextlost")).toBe(true);
  });

  it("reports the loss and the restore, in that order", () => {
    const { canvas, calls, gpu } = watch();
    canvas.fire("webglcontextlost");
    expect(gpu.lost()).toBe(true);
    expect(calls).toEqual(["lost"]);
    canvas.fire("webglcontextrestored");
    expect(gpu.lost()).toBe(false);
    expect(calls).toEqual(["lost", "restored"]);
  });

  it("answers a repeated event once", () => {
    // A browser may deliver either event more than once, and the app's answer
    // to a loss is not idempotent — it puts a run on the pause card.
    const { canvas, calls } = watch();
    canvas.fire("webglcontextlost");
    canvas.fire("webglcontextlost");
    expect(calls).toEqual(["lost"]);
    canvas.fire("webglcontextrestored");
    canvas.fire("webglcontextrestored");
    expect(calls).toEqual(["lost", "restored"]);
  });

  it("ignores a restore nothing lost", () => {
    const { canvas, calls } = watch();
    canvas.fire("webglcontextrestored");
    expect(calls).toEqual([]);
  });

  it("stops listening when it is disposed", () => {
    const { canvas, calls, gpu } = watch();
    gpu.dispose();
    expect(canvas.count("webglcontextlost")).toBe(0);
    expect(canvas.count("webglcontextrestored")).toBe(0);
    canvas.fire("webglcontextlost");
    expect(calls).toEqual([]);
  });
});
