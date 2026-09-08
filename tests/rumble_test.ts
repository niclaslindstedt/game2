// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE PLAYER FEELS — the vibration table, its one-motor ledger, and the
// seam that carries a pulse out to the phone.
//
// Worth a test rather than a hand on a phone for three reasons, and each is
// a fault nobody would see:
//
//   * A PULSE THAT IS THE WRONG SIZE. A device has one motor, so every
//     buzz spent on a shift is a buzz taken off the next crash — and the
//     ordering between a scuff, a hit and a wreck is the whole information
//     content of the surface. On a desktop it cannot be felt at all.
//   * A LEDGER THAT LETS THE DRIFT EAT THE CRASH. Asking for a pulse while
//     one is running CUTS the running one off, so the tenth-of-a-second
//     drift tick would truncate every hit it landed on top of. That reads
//     as "the vibration is weak" rather than as a bug.
//   * A SEAM THAT DRIFTS APART. The event's name and the message's shape are
//     stated in three files that cannot import each other — the page's
//     `shell-host.ts`, the shell's injected bridge, and the shell's parser.
//     A rename in one of them is a phone that silently stops buzzing.
//
// No DOM: the table takes a sink and a `dt`, and the bridge is a source
// string held to the constants beside it.

import { describe, expect, it } from "vitest";

import type { GameEvent } from "@engine";

import { RUMBLE_BRIDGE } from "../native/src/injected.ts";
import { RUMBLE_KIND, parseRumble, rumbleBurst } from "../native/src/rumble.ts";
import {
  RUMBLE,
  createRunRumble,
  rumbleForDrift,
  rumbleForEvent,
  type Rumble,
} from "../pwa/src/game/rumble.ts";
import { SHELL_RUMBLE } from "../pwa/src/shell-host.ts";

/** A pulse, or the failure spelled out — every one of these assertions is
 * about a table entry that could just as easily be null. */
function felt(event: GameEvent): Rumble {
  const pulse = rumbleForEvent(event);
  if (!pulse) throw new Error(`${event.type} is not felt`);
  return pulse;
}

describe("what an event is worth in the hands", () => {
  it("sizes a contact by how fast the two were closing", () => {
    const scuff = felt({ type: "impact", speed: 4, angle: 0, belly: false });
    const hit = felt({ type: "impact", speed: 11, angle: 0, belly: false });
    const wreck = felt({ type: "impact", speed: 26, angle: 0, belly: false });
    expect(scuff.strength).toBeLessThan(hit.strength);
    expect(hit.strength).toBeLessThan(wreck.strength);
    expect(scuff.ms).toBeLessThan(hit.ms);
    expect(hit.ms).toBeLessThan(wreck.ms);
    // A rival's panel comes back through this same door (`rubRivals`), so
    // hitting a car at speed has to be one of the hardest things there is.
    expect(wreck.strength).toBeGreaterThan(0.9);
  });

  it("keeps the gearbox and the deepest drift under the lightest blow", () => {
    const shift = felt({ type: "shift", gear: 3 });
    const drift = rumbleForDrift({ drifting: true, slide: 1 });
    const scuff = felt({ type: "impact", speed: 4, angle: 0, belly: false });
    const hit = felt({ type: "impact", speed: 11, angle: 0, belly: false });
    expect(shift.strength).toBeLessThan(scuff.strength);
    expect(drift?.strength).toBeLessThan(scuff.strength);
    expect(drift?.strength).toBeLessThan(hit.strength / 2);
    // Short, too: a shift is a click in the drivetrain, not a buzz.
    expect(shift.ms).toBeLessThanOrEqual(RUMBLE.shiftMs);
  });

  it("feels a slam and not a clean landing", () => {
    expect(
      rumbleForEvent({ type: "landing", airTime: 1.2, slam: 9, took: 0.4, clean: true }),
    ).toBeNull();
    expect(
      felt({ type: "landing", airTime: 1.2, slam: 9, took: 0.4, clean: false }).strength,
    ).toBeGreaterThan(0.5);
  });

  it("says nothing for news, and nothing that rides on a blow already felt", () => {
    // Each of these arrives in the SAME step as the impact or landing that
    // caused it; a pulse of its own would only double the one on its way.
    const quiet: GameEvent[] = [
      { type: "lap", lap: 2, time: 60, best: true },
      { type: "checkpoint", index: 1, count: 3, split: 30, time: 30 },
      { type: "cheer", size: 0.5 },
      { type: "partBreak", part: "doorL", shed: 4 },
      { type: "systemFail", system: "engine", stage: "hurt" },
      { type: "spin", slip: 1.4, speed: 20 },
    ];
    for (const event of quiet) expect(rumbleForEvent(event)).toBeNull();
  });

  it("never asks for longer than the crash that ends a run", () => {
    const hardest: GameEvent[] = [
      { type: "crash" },
      { type: "impact", speed: 40, angle: 0, belly: true },
      { type: "rollover", rate: 12, speed: 30 },
      { type: "landing", airTime: 2, slam: 20, took: 0.4, clean: false },
      { type: "kerbHit", speed: 30 },
    ];
    for (const event of hardest) {
      const pulse = felt(event);
      expect(pulse.ms).toBeLessThanOrEqual(RUMBLE.longest);
      expect(pulse.strength).toBeLessThanOrEqual(1);
    }
  });

  it("leaves a car that is merely turning alone", () => {
    expect(rumbleForDrift({ drifting: false, slide: 1 })).toBeNull();
    expect(rumbleForDrift({ drifting: true, slide: RUMBLE.driftFloor })).toBeNull();
    const shallow = rumbleForDrift({ drifting: true, slide: 0.6 });
    const deep = rumbleForDrift({ drifting: true, slide: 1 });
    expect(shallow?.strength).toBeLessThan(deep?.strength ?? 0);
  });
});

describe("one motor, one pulse at a time", () => {
  /** A run's rumble with everything it asked for written down. */
  function ledger(): { rumble: ReturnType<typeof createRunRumble>; felt: Rumble[] } {
    const list: Rumble[] = [];
    return { rumble: createRunRumble((pulse) => list.push(pulse)), felt: list };
  }

  it("plays one pulse for a step, and it is the biggest thing in it", () => {
    const { rumble, felt: list } = ledger();
    rumble.events([
      { type: "shift", gear: 4 },
      { type: "impact", speed: 22, angle: 0, belly: false },
      { type: "kerbHit", speed: 8 },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].strength).toBeGreaterThan(0.8);
  });

  it("refuses a drift tick while a crash is still running", () => {
    const { rumble, felt: list } = ledger();
    const drifting = { drifting: true, slide: 1 };
    rumble.events([{ type: "crash" }]);
    expect(list).toHaveLength(1);
    // The crash is a quarter of a second; two frames of drift inside it ask
    // for a tick each and are turned away.
    rumble.frame(drifting, 1 / 60);
    rumble.frame(drifting, 1 / 60);
    expect(list).toHaveLength(1);
    // Past the end of it the drift picks back up.
    for (let i = 0; i < 30; i++) rumble.frame(drifting, 1 / 60);
    expect(list.length).toBeGreaterThan(1);
  });

  it("paces the drift rather than holding the motor on", () => {
    const { rumble, felt: list } = ledger();
    const drifting = { drifting: true, slide: 1 };
    // One second of driving, at 60 fps.
    for (let i = 0; i < 60; i++) rumble.frame(drifting, 1 / 60);
    // A tick every `driftGapMs`, give or take the frame it lands on.
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(10);
    // …and the motor is off for most of that second: the ticks together are
    // a small share of the time they are spread over.
    const on = list.reduce((sum, pulse) => sum + pulse.ms, 0);
    expect(on).toBeLessThan(300);
  });

  it("goes quiet on the frames it is not fed", () => {
    const { rumble, felt: list } = ledger();
    rumble.frame({ drifting: true, slide: 1 }, 1 / 60);
    const held = list.length;
    // A menu over a held run simply stops calling `frame`, and nothing else
    // in the module can make a pulse.
    expect(held).toBe(1);
    expect(list).toHaveLength(held);
  });
});

describe("the seam out to the phone", () => {
  it("names the same event and the same fields in all three files", () => {
    expect(RUMBLE_BRIDGE).toContain(`"${SHELL_RUMBLE}"`);
    expect(RUMBLE_BRIDGE).toContain(`sf: "${RUMBLE_KIND}"`);
    expect(RUMBLE_BRIDGE).toContain("pulse.ms");
    expect(RUMBLE_BRIDGE).toContain("pulse.strength");
    // iOS aborts an injected script that does not evaluate to a primitive.
    expect(RUMBLE_BRIDGE.trimEnd().endsWith("})();")).toBe(true);
    expect(RUMBLE_BRIDGE).toContain("true;");
  });

  it("reads the message the bridge posts", () => {
    const posted = JSON.stringify({ sf: RUMBLE_KIND, ms: 220, strength: 1 });
    expect(parseRumble(posted)).toEqual({ ms: 220, strength: 1 });
  });

  it("drops anything that is not a rumble, rather than throwing", () => {
    expect(parseRumble("not json")).toBeNull();
    expect(parseRumble(JSON.stringify({ sf: "share", url: "x" }))).toBeNull();
    expect(parseRumble(JSON.stringify({ sf: RUMBLE_KIND }))).toBeNull();
    expect(parseRumble(JSON.stringify({ sf: RUMBLE_KIND, ms: 0, strength: 1 }))).toBeNull();
    expect(parseRumble(JSON.stringify({ sf: RUMBLE_KIND, ms: 40, strength: "hard" }))).toBeNull();
    // Out of range is clamped rather than refused: a pulse the shell can
    // play is better than a phone that says nothing.
    expect(parseRumble(JSON.stringify({ sf: RUMBLE_KIND, ms: 40, strength: 9 }))?.strength).toBe(1);
  });

  it("spends a pulse's LENGTH as taps and its STRENGTH as a style", () => {
    const shift = rumbleBurst(felt({ type: "shift", gear: 3 }));
    const crash = rumbleBurst(felt({ type: "crash" }));
    expect(shift).toMatchObject({ style: "light", count: 1 });
    expect(crash).toMatchObject({ style: "heavy", count: 3 });
    // The taps are far enough apart that the engine has re-armed, and close
    // enough to read as one event.
    expect(crash.gapMs).toBeGreaterThanOrEqual(40);
    expect(crash.gapMs).toBeLessThanOrEqual(80);
  });
});
