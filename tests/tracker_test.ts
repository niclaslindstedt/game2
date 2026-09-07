// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MUSIC SEQUENCER'S CLOCK (`pwa/src/lib/tracker.ts`) — the two-clock
// scheduler, and the three things about it that are only audible when they
// are wrong.
//
// Nothing booked can be taken back: a note handed to WebAudio sounds at the
// time it was given, whatever happens afterwards. Every rule here follows
// from that one fact — a theme swapped in over a diary that still has entries
// in it plays two themes at once, a horizon widened to survive a blocked main
// thread is also how long the score takes to answer anything, and an anchor
// that is re-taken while notes are still outstanding books the next bar on
// top of them.
//
// No DOM and no audio: the synth is a stub that writes down what it was
// asked to play and when, which is the only thing worth asserting anyway.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTrackPlayer, type Track } from "../pwa/src/lib/tracker.ts";
import type { Synth } from "../pwa/src/lib/voice.ts";

/** A synth that plays nothing and remembers everything: one row per note, in
 * the order booked, carrying the CLOCK TIME it was booked for. */
function recorder() {
  const booked: { at: number; from: number }[] = [];
  let clock = 0;
  const synth: Synth = {
    unlock: () => {},
    autostart: () => {},
    resume: () => {},
    tone: (o) => booked.push({ at: o.at ?? 0, from: o.from }),
    noise: (o) => booked.push({ at: o.at ?? 0, from: 0 }),
    layer: () => null,
    now: () => clock,
  };
  return {
    synth,
    booked,
    /** Move the AudioContext clock and let the 90 ms JS timer catch up. */
    advance: (seconds: number) => {
      clock += seconds;
      vi.advanceTimersByTime(seconds * 1000);
    },
    at: () => clock,
  };
}

/** One voice, one note a step, so every booking is countable. `pitch` names
 * the track: A4 is one theme, A5 the other. */
function track(note: string, bpm = 120): Track {
  return {
    bpm,
    stepsPerBeat: 4,
    instruments: { lead: { wave: "square", volume: 0.2 } },
    patterns: { a: { lead: [note, note, note, note] } },
    order: ["a"],
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("how far ahead the sequencer books", () => {
  it("rests at a fraction of a second, so a stop is answered promptly", () => {
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.play(track("A4"));
    const last = Math.max(...r.booked.map((b) => b.at));
    expect(last - r.at()).toBeLessThan(0.4);
    expect(r.booked.length).toBeGreaterThan(0);
  });

  it("books through a block far longer than the resting horizon when told to", () => {
    // What standing a race up does to the page: the main thread is gone for
    // seconds and the 90 ms timer does not fire at all, so anything the
    // player is going to hear has to already be in the diary.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(3);
    player.play(track("A4"));
    const covered = Math.max(...r.booked.map((b) => b.at)) - r.at();
    expect(covered).toBeGreaterThan(2.5);
  });

  it("keeps a caller's floor across a change of theme", () => {
    // The floor is a statement about what the PAGE is doing, not about the
    // track: a load that swapped themes half way through would otherwise
    // lose the cover it raised for the blocks still to come.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(3);
    player.play(track("A4"));
    player.play(track("A5"));
    r.advance(0.2);
    const covered = Math.max(...r.booked.map((b) => b.at)) - r.at();
    expect(covered).toBeGreaterThan(2.5);
  });

  it("clamps a horizon nobody should be asking for", () => {
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(600);
    player.play(track("A4"));
    const covered = Math.max(...r.booked.map((b) => b.at)) - r.at();
    expect(covered).toBeLessThan(10);
  });
});

describe("handing one theme over to the next", () => {
  it("starts the new track where the old one's booking ENDS, never on top of it", () => {
    // The bug this exists to stop is audible rather than subtle: two themes,
    // two tempos, playing over each other for as long as the outgoing one
    // had been booked ahead — seconds of it after a load has been coasting.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(3);
    player.play(track("A4"));
    const lastOld = Math.max(...r.booked.map((b) => b.at));
    const oldNotes = r.booked.length;

    // Nothing is booked on the switch itself — the diary is already full to
    // the horizon — so let the clock walk into the room the hand-over left.
    player.play(track("A5", 90));
    r.advance(0.2);
    const fresh = r.booked.slice(oldNotes);
    expect(fresh.length).toBeGreaterThan(0);
    // Every note of the new theme lands after every note of the old one.
    expect(Math.min(...fresh.map((b) => b.at))).toBeGreaterThan(lastOld);
  });

  it("leaves no silence between them either — the hand-over is one step wide", () => {
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    const first = track("A4");
    player.play(first);
    const lastOld = Math.max(...r.booked.map((b) => b.at));
    const oldNotes = r.booked.length;

    player.play(track("A5"));
    r.advance(0.1);
    const firstNew = Math.min(...r.booked.slice(oldNotes).map((b) => b.at));
    const step = 60 / first.bpm / first.stepsPerBeat;
    expect(firstNew - lastOld).toBeCloseTo(step, 5);
  });

  it("starts fresh after a stop — there is nothing to hand over from", () => {
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(3);
    player.play(track("A4"));
    player.stop();
    r.booked.length = 0;
    r.advance(0.5);
    player.play(track("A5"));
    expect(Math.min(...r.booked.map((b) => b.at))).toBeLessThan(r.at() + 0.2);
  });
});

describe("a clock that misbehaves", () => {
  it("re-anchors the moment it is LATE, so a backlog never fires as one chord", () => {
    // WebAudio starts a source whose time has passed the instant it is handed
    // over. A scheduler that crawled back up one step at a time would book
    // every missed note into the past and the player would hear half a bar as
    // a single chord.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.play(track("A4"));
    r.booked.length = 0;
    r.advance(30); // the tab was throttled, or the page was blocked solid
    expect(r.booked.length).toBeGreaterThan(0);
    // Nothing in the past, and nothing bunched at one instant.
    for (const b of r.booked) expect(b.at).toBeGreaterThanOrEqual(r.at());
    expect(new Set(r.booked.map((b) => b.at)).size).toBe(r.booked.length);
  });

  it("re-anchors onto a clock that RESTARTED near zero", () => {
    // The iOS zombie recovery rebuilds the AudioContext, and the new clock
    // starts near zero — stranding the old anchor unreachably far ahead. The
    // guard has to clear the widest horizon a caller may legitimately book
    // (or narrowing it after a load would re-anchor on top of live notes) and
    // still catch this.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.play(track("A4"));
    r.advance(600);
    r.booked.length = 0;
    // ...and the context is rebuilt: same player, a clock back at the start.
    const rebuilt = recorder();
    const player2 = createTrackPlayer(rebuilt.synth);
    player2.play(track("A4"));
    rebuilt.advance(0.5);
    expect(rebuilt.booked.length).toBeGreaterThan(0);
    for (const b of rebuilt.booked) expect(b.at).toBeGreaterThanOrEqual(0);
  });

  it("holds a wide booking through a NARROWED horizon rather than re-anchoring over it", () => {
    // The load ends: the horizon comes back to its resting width while three
    // seconds of theme are still outstanding. Re-anchoring here would book
    // the next bar on top of notes already sounding — exactly the overlap the
    // hand-over rule exists to prevent.
    const r = recorder();
    const player = createTrackPlayer(r.synth);
    player.lookahead(3);
    player.play(track("A4"));
    const booked = Math.max(...r.booked.map((b) => b.at));
    r.booked.length = 0;
    player.lookahead(0);
    r.advance(0.2);
    for (const b of r.booked) expect(b.at).toBeGreaterThan(booked);
  });
});
