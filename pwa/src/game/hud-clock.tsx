// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two instruments that run at FRAME RATE rather than at the HUD's
// snapshot rate: the race clock and the start lights (see `LiveRun` in
// snapshot.ts for why they are their own channel).
//
// Both read a `LiveRun` the frame loop rewrites in place. The clock writes
// its digits straight into the DOM and never re-renders for them — a
// hundredths counter that went through React would re-render the whole
// instrument sixty times a second to change two characters. The lights do
// re-render, but only on the four frames a run where a lamp actually
// changes: the value they hold is one number, so an unchanged frame is a
// setState React discards.

import { useEffect, useRef, useState } from "react";
import { TUNING } from "@engine";

import { formatTime } from "../lib/util.ts";
import type { LiveRun } from "./snapshot.ts";

/** Run a callback on every animation frame while the component is mounted.
 * The callback is held in a ref so it can close over this render's props
 * without the subscription being torn down and rebuilt around them. */
function useFrame(fn: () => void): void {
  const held = useRef(fn);
  held.current = fn;
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      held.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Everything on the clock that is NOT the running time: the lap counter and
 * the times to measure against, all of which change a handful of times a run
 * and are perfectly happy on the snapshot. */
export type ClockFace = {
  lap: number;
  laps: number;
  lapTimes: number[];
  bestTime: number | null;
};

/** Write a time into a node, skipping the write when the text has not
 * actually changed — most frames at 60 fps land on the same hundredth. */
function writeTime(node: HTMLElement | null, seconds: number): void {
  if (!node) return;
  const text = formatTime(seconds);
  if (node.textContent !== text) node.textContent = text;
}

/** The race clock — the loudest instrument on the screen, because in a
 * racing game the clock IS the opponent. Total time reads biggest; under it
 * the lap clock and the lap counter, on a stage that has laps; under that
 * the times to measure against — the laps already set this run, and the
 * record the stage is holding. */
export function RaceClock({ face, live }: { face: ClockFace; live: LiveRun }) {
  const lapped = face.laps > 1;
  const bestLap = face.lapTimes.length > 0 ? Math.min(...face.lapTimes) : null;
  const totalRef = useRef<HTMLDivElement>(null);
  const lapRef = useRef<HTMLDivElement>(null);
  useFrame(() => {
    writeTime(totalRef.current, live.time);
    writeTime(lapRef.current, live.lapTime);
  });
  return (
    <div className="hud-clock">
      <div className="hud-clock-row">
        <span className="hud-clock-label">TOTAL TIME</span>
      </div>
      <div className="hud-clock-total" ref={totalRef}>
        {formatTime(live.time)}
      </div>
      {lapped && (
        <>
          <div className="hud-clock-row">
            <span className="hud-clock-label hud-clock-label-lap">LAP TIME</span>
            <span className="hud-lap-count">
              {Math.min(face.lap, face.laps)}
              <span className="hud-lap-of">/{face.laps}</span>
            </span>
          </div>
          <div className="hud-clock-lap" ref={lapRef}>
            {formatTime(live.lapTime)}
          </div>
        </>
      )}
      {(face.bestTime !== null || bestLap !== null) && (
        <div className="hud-clock-marks">
          {face.lapTimes.map((t, i) => (
            <span
              key={i}
              className={`hud-clock-mark ${t === bestLap ? "hud-clock-mark-best" : ""}`}
            >
              <span className="hud-clock-mark-label">L{i + 1}</span>
              {formatTime(t)}
            </span>
          ))}
          {face.bestTime !== null && (
            <span className="hud-clock-mark hud-clock-mark-record">
              <span className="hud-clock-mark-label">BEST</span>
              {formatTime(face.bestTime)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Lamps on the gantry — one per whole second of the countdown, so the
 * bank fills at exactly the rate the start sounds tick at and neither has
 * to know about the other. */
const LAMPS = Math.max(1, Math.round(TUNING.countdown));

/** How long the greens stay up once the stage is live, seconds. Long enough
 * to register in the corner of an eye that is already up the road, short
 * enough to be gone before the first turn. */
const GREEN_HOLD = 1.1;

/** What the gantry is showing, as ONE number so an unchanged frame costs
 * nothing: `AWAY` when the start is behind us, `SHOT` while the camera is
 * still circling the control and there is nothing on the gantry yet,
 * `GREEN` when the lights are out and the stage is live, and otherwise how
 * many reds are lit. */
const AWAY = -1;
const SHOT = -2;
const GREEN = 0;

function gantry(live: LiveRun): number {
  if (live.phase === "intro") return SHOT;
  if (live.phase === "countdown") {
    // `countdown` runs LAMPS → 0, and the audio bed sounds a tick on each
    // whole second remaining. Ceil it and both land on the same frame.
    return Math.min(LAMPS, Math.max(1, LAMPS - Math.ceil(live.countdown) + 1));
  }
  return live.phase === "racing" && live.time < GREEN_HOLD ? GREEN : AWAY;
}

/** The start: a rally gantry rather than a number counting itself down. A
 * bank of reds fills a lamp per second — the same beat as the tick on the
 * audio bed — and then goes green all at once, which is the one signal a
 * driver reads without reading.
 *
 * Ahead of all that is the establishing shot, which puts NO lamps up: the
 * car in front is still leaving and there is nothing to be ready for yet.
 * What it puts up instead is the one thing a driver who has seen the shot
 * before needs — how to leave it. */
export function StartLights({ live }: { live: LiveRun }) {
  const [state, setState] = useState(() => gantry(live));
  useFrame(() =>
    setState((was) => {
      const next = gantry(live);
      return next === was ? was : next;
    }),
  );
  if (state === AWAY) return null;
  if (state === SHOT) {
    return (
      <div className="hud-start-shot">
        <span className="hud-start-control">START CONTROL</span>
        <span className="hud-start-skip">THROTTLE TO SKIP</span>
      </div>
    );
  }
  const green = state === GREEN;
  return (
    <div
      className={`hud-lights ${green ? "hud-lights-go" : ""}`}
      role="img"
      aria-label={green ? "Go" : `Start lights, ${state} of ${LAMPS}`}
    >
      {Array.from({ length: LAMPS }, (_, i) => (
        <span
          key={i}
          className={`hud-lamp ${green ? "hud-lamp-green" : i < state ? "hud-lamp-red" : ""}`}
        />
      ))}
    </div>
  );
}
