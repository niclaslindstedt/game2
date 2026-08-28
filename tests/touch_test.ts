// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The touch controls' one load-bearing promise: they LET GO.
//
// The wheel writes a screen-space axis straight into the input manager, and
// that axis overrides the keyboard and outlives the run — so a lock left
// behind by a touch that ended without saying so is a car that steers itself
// through the next stage and the one after the restart. iOS ends a touch
// without saying so more or less routinely: a drag off the bottom edge of
// the screen (which in portrait is where the thumb lives) can deliver no
// pointerup and no pointercancel to anyone at all.
//
// This test imports from pwa/ because that is where the controls live, and
// it can: the guard listens on an injected window and ASKS a predicate,
// rather than the DOM, whether a finger is still down.

import { describe, expect, it } from "vitest";

import { createThumbGuard, type GuardWindow } from "../pwa/src/game/thumb-guard.ts";

/** Everything the guard uses of a window is EventTarget, which Node has. */
const fakeWindow = (): GuardWindow & EventTarget =>
  new EventTarget() as unknown as GuardWindow & EventTarget;

const pointerEvent = (type: string, pointerId: number): Event =>
  Object.assign(new Event(type), { pointerId });

/** A steering zone reduced to what matters here: the axis it writes and the
 * fingers the browser says are on the glass. */
function stubZone() {
  const held = new Set<number>();
  const state = { steer: 0 };
  const win = fakeWindow();
  const guard = createThumbGuard(() => {
    state.steer = 0;
  }, win);
  const press = (pointerId: number, steer: number): boolean => {
    held.add(pointerId);
    const took = guard.claim(pointerId, (id) => held.has(id));
    if (took) state.steer = steer;
    return took;
  };
  return { held, state, win, guard, press };
}

describe("thumb zone ownership", () => {
  it("centres the wheel when the pointerup arrives on the window instead", () => {
    const zone = stubZone();
    zone.press(1, 0.8);
    expect(zone.state.steer).toBe(0.8);

    // Capture is gone, so the finger lifts over whatever element it happens
    // to be over — never over the zone.
    zone.held.delete(1);
    zone.win.dispatchEvent(pointerEvent("pointerup", 1));
    expect(zone.state.steer).toBe(0);
    zone.guard.dispose();
  });

  it("centres the wheel when no end event is delivered at all", () => {
    const zone = stubZone();
    zone.press(1, -0.6);

    // The thumb slid off the bottom of the screen: nothing is dispatched
    // anywhere, and only a poll can find that out.
    zone.held.delete(1);
    zone.guard.poll();
    expect(zone.state.steer).toBe(0);
    zone.guard.dispose();
  });

  it("hands the zone to the next finger once the first one is gone", () => {
    const zone = stubZone();
    zone.press(1, 0.5);

    // A second finger while the first is genuinely down is ignored: it does
    // not get to re-anchor the wheel under the thumb already steering.
    expect(zone.press(2, 0.9)).toBe(false);
    expect(zone.state.steer).toBe(0.5);

    // But once the first is gone, the next touch takes the zone back — the
    // wedged-forever case the player sees as steering no restart clears.
    zone.held.delete(1);
    zone.held.delete(2);
    expect(zone.press(3, -0.4)).toBe(true);
    expect(zone.state.steer).toBe(-0.4);
    zone.guard.dispose();
  });

  it("lets go when the app loses focus or goes away", () => {
    for (const event of ["blur", "visibilitychange"]) {
      const zone = stubZone();
      zone.press(1, 0.7);
      zone.win.dispatchEvent(new Event(event));
      expect(zone.state.steer, event).toBe(0);
      zone.guard.dispose();
    }
  });

  it("lets go when the zone unmounts under a live thumb", () => {
    const zone = stubZone();
    zone.press(1, 1);
    zone.guard.dispose();
    expect(zone.state.steer).toBe(0);
  });
});
