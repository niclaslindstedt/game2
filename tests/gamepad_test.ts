// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The controller, and the two promises it has to keep.
//
// The first is that the PEDALS ARE ANALOGUE. A trigger half open is half
// throttle, and that is the whole reason a handheld is worth driving on: a
// slide is caught with a fraction of the pedal, which a key cannot express
// and a thumb on glass cannot hold steady.
//
// The second is that a PRESS HAPPENS ONCE. A pad fires no events — it is
// polled, once a frame, so every reading arrives many times over. An edge
// that fired on each of them would cycle the camera through all six angles
// in a tenth of a second and walk out of the run on the way past.
//
// This imports from pwa/ because that is where the controls live, and it
// can: gamepad.ts reads plain SNAPSHOTS of a pad rather than the browser's
// live `Gamepad` object, which is exactly so a test can hold one still.

import { describe, expect, it } from "vitest";

import { captureAxis, captureSource, createPadReader, readPad } from "../pwa/src/game/gamepad.ts";
import type { PadFrame } from "../pwa/src/game/gamepad.ts";
import { DEFAULT_PAD, clonePad, loadSettings, type PadSource } from "../pwa/src/game/settings.ts";

const BINDINGS = DEFAULT_PAD.bindings;

/** A standard-mapping pad at rest, with whatever this case presses. */
function pad(
  press: { buttons?: Record<number, number>; axes?: Record<number, number> } = {},
): PadFrame {
  const buttons = new Array<number>(17).fill(0);
  const axes = [0, 0, 0, 0];
  for (const [index, value] of Object.entries(press.buttons ?? {})) buttons[Number(index)] = value;
  for (const [index, value] of Object.entries(press.axes ?? {})) axes[Number(index)] = value;
  return { buttons, axes, standard: true, id: "Retroid Pocket Nova Controller (STANDARD GAMEPAD)" };
}

describe("the pad's pedals", () => {
  it("reads the triggers analogue rather than as switches", () => {
    // R2 is gas and L2 is brake, and half a trigger is half a pedal.
    const half = readPad([pad({ buttons: { 7: 0.5 } })], BINDINGS);
    expect(half.throttle).toBeGreaterThan(0.4);
    expect(half.throttle).toBeLessThan(0.6);
    expect(half.brake).toBe(0);

    const buried = readPad([pad({ buttons: { 6: 1 } })], BINDINGS);
    expect(buried.brake).toBe(1);
    expect(buried.throttle).toBe(0);
  });

  it("holds the pedals at zero while the triggers rest", () => {
    // A trigger that rests a hair off zero is a car creeping off the line
    // under nobody's foot, which reads as a physics bug rather than a pad.
    const resting = readPad([pad({ buttons: { 6: 0.03, 7: 0.04 } })], BINDINGS);
    expect(resting.throttle).toBe(0);
    expect(resting.brake).toBe(0);
  });

  it("takes a trigger reported as an axis, whichever way that axis rests", () => {
    // Plenty of Android pads report L2/R2 as axes instead of buttons, and
    // the two conventions rest at opposite ends. A binding aimed along the
    // axis reads 0 at rest and 1 buried under BOTH.
    const axisTrigger: PadSource[] = [{ kind: "axis", index: 3, dir: 1 }];
    const bindings = { ...BINDINGS, sources: { ...BINDINGS.sources, throttle: axisTrigger } };
    expect(readPad([pad({ axes: { 3: -1 } })], bindings).throttle).toBe(0);
    expect(readPad([pad({ axes: { 3: 0 } })], bindings).throttle).toBe(0);
    expect(readPad([pad({ axes: { 3: 1 } })], bindings).throttle).toBe(1);
  });
});

describe("the pad's wheel", () => {
  it("ignores the stick inside its deadzone and uses the full lock outside it", () => {
    expect(readPad([pad({ axes: { 0: 0.1 } })], BINDINGS).steer).toBe(0);
    // Rescaled, not stepped: full stick is still full lock.
    expect(readPad([pad({ axes: { 0: 1 } })], BINDINGS).steer).toBe(1);
    expect(readPad([pad({ axes: { 0: -1 } })], BINDINGS).steer).toBe(-1);
    // ...and just outside the deadzone is a small steer, not 15% of one.
    const nudge = readPad([pad({ axes: { 0: 0.2 } })], BINDINGS).steer;
    expect(nudge).toBeGreaterThan(0);
    expect(nudge).toBeLessThan(0.1);
  });

  it("reads the stick backwards when the player says it is backwards", () => {
    const bindings = { ...BINDINGS, steerInvert: true };
    expect(readPad([pad({ axes: { 0: 1 } })], bindings).steer).toBe(-1);
  });

  it("keeps the d-pad apart from the stick, as steps", () => {
    // The d-pad rides input.ts's key ramp instead of going to the wheel: a
    // tap of LEFT is not instant full lock.
    const left = readPad([pad({ buttons: { 14: 1 } })], BINDINGS);
    expect(left.steerStep).toBe(-1);
    expect(left.steer).toBe(0);
    expect(readPad([pad({ buttons: { 15: 1 } })], BINDINGS).steerStep).toBe(1);
  });
});

describe("the pad's presses", () => {
  it("puts the handbrake on A and holds it while A is held", () => {
    const reader = createPadReader(BINDINGS);
    expect(reader.read([pad({ buttons: { 0: 1 } })]).hold.handbrake).toBe(true);
    expect(reader.read([pad({ buttons: { 0: 1 } })]).hold.handbrake).toBe(true);
    expect(reader.read([pad()]).hold.handbrake).toBe(false);
  });

  it("fires the camera on X once per press, however many polls it spans", () => {
    const reader = createPadReader(BINDINGS);
    expect(reader.read([pad({ buttons: { 2: 1 } })]).pressed).toEqual(["camera"]);
    // Held: the same reading arrives every frame and must say nothing.
    expect(reader.read([pad({ buttons: { 2: 1 } })]).pressed).toEqual([]);
    expect(reader.read([pad()]).pressed).toEqual([]);
    // Released and pressed again is a second press.
    expect(reader.read([pad({ buttons: { 2: 1 } })]).pressed).toEqual(["camera"]);
  });

  it("leaves RESTART unbound, so no face button can throw a stage away", () => {
    expect(BINDINGS.sources.restart).toEqual([]);
    const reader = createPadReader(BINDINGS);
    const every = pad({ buttons: Object.fromEntries([...Array(17).keys()].map((i) => [i, 1])) });
    expect(reader.read([every]).pressed).not.toContain("restart");
  });

  it("re-arms every edge when the bindings change under a held button", () => {
    // Otherwise an action rebound while its button is down never sees that
    // button rise, and refuses to fire for the rest of the session.
    const reader = createPadReader(BINDINGS);
    reader.read([pad({ buttons: { 2: 1 } })]);
    reader.setBindings(BINDINGS);
    expect(reader.read([pad({ buttons: { 2: 1 } })]).pressed).toEqual(["camera"]);
  });

  it("takes the deepest read of an action across two pads", () => {
    // A handheld in a dock is two pads, and an idle one must not hold the
    // other one's pedal up.
    const reader = createPadReader(BINDINGS);
    const both = reader.read([pad(), pad({ buttons: { 7: 1 } })]);
    expect(both.hold.throttle).toBe(1);
  });

  it("hands back nothing at all when no pad is connected", () => {
    const reader = createPadReader(BINDINGS);
    const empty = reader.read([]);
    expect(empty.hold.throttle).toBe(0);
    expect(empty.hold.steer).toBe(0);
    expect(empty.pressed).toEqual([]);
  });
});

describe("mapping a control", () => {
  it("binds the button that moved, not the trigger that was already resting", () => {
    // The baseline is what the pad looked like when the row started
    // listening. A trigger held at half travel is the FLOOR, not the answer.
    const baseline = [pad({ buttons: { 7: 0.5 } })];
    expect(captureSource(baseline, baseline)).toBeNull();
    const pressed = captureSource([pad({ buttons: { 7: 0.5, 3: 1 } })], baseline);
    expect(pressed).toEqual({ kind: "button", index: 3 });
  });

  it("waits rather than binding a stick that was never at centre", () => {
    const baseline = [pad({ axes: { 0: 0.3 } })];
    expect(captureSource(baseline, baseline)).toBeNull();
    expect(captureAxis(baseline, baseline)).toBeNull();
  });

  it("binds a trigger reported as an axis, along the way it was pushed", () => {
    const baseline = [pad({ axes: { 5: -1 } })];
    expect(captureSource([pad({ axes: { 5: 1 } })], baseline)).toEqual({
      kind: "axis",
      index: 5,
      dir: 1,
    });
  });

  it("learns an inverted stick from the direction it was pushed", () => {
    const baseline = [pad()];
    // The row asks for RIGHT; a stick that answers with a negative reading
    // is a stick that reads backwards, and that is the whole invert flag.
    expect(captureAxis([pad({ axes: { 0: 1 } })], baseline)).toEqual({ axis: 0, invert: false });
    expect(captureAxis([pad({ axes: { 0: -1 } })], baseline)).toEqual({ axis: 0, invert: true });
  });
});

/** A localStorage that lives for one test — the same stub the campaign and
 * score suites keep, for the same reason: settings.ts reads the player's
 * own file, and Node has no such thing. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("the stored bindings", () => {
  it("clones deeply enough that a rebind cannot rewrite the defaults", () => {
    const mine = clonePad(DEFAULT_PAD);
    mine.bindings.sources.camera = [{ kind: "button", index: 9 }];
    expect(DEFAULT_PAD.bindings.sources.camera).toEqual([{ kind: "button", index: 2 }]);
  });

  it("drops a stored binding that is not a binding", () => {
    // Storage is the player's file, and a build that once wrote something
    // else there must not hand the reader an index it will look up as NaN.
    const junk = {
      pad: {
        enabled: true,
        hideTouch: false,
        bindings: {
          steerAxis: 0,
          deadzone: 9,
          sources: { camera: [{ kind: "button" }, { kind: "button", index: 4 }], brake: "L2" },
        },
      },
    };
    stubStorage();
    localStorage.setItem("scandi-flick-options", JSON.stringify(junk));
    const loaded = loadSettings();
    expect(loaded.pad.bindings.sources.camera).toEqual([{ kind: "button", index: 4 }]);
    expect(loaded.pad.bindings.sources.brake).toEqual(DEFAULT_PAD.bindings.sources.brake);
    expect(loaded.pad.bindings.deadzone).toBeLessThanOrEqual(0.5);
    expect(loaded.pad.hideTouch).toBe(false);
    localStorage.clear();
  });
});
