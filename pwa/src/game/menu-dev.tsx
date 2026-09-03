// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer menu: out of the way of a player who never found it (see
// DEV_TAPS), and blunt for one who did. Everything here bypasses the game
// rather than playing it, which is the point — it is how the whole thing
// gets tested without driving four stages first.
//
// Two pages. The first is the switchboard: open every stage, and the three
// tools that make something somebody saw into something somebody else can
// stand in front of — god mode and the debug overlay for a PLACE, and race
// data collection for a DRIVE (game/run-tape.ts), which is the same idea
// aimed at time instead of space. The second is the debug log, which is the
// other half of a screenshot: the picture says where, the log says what led
// there.
//
// MAP VIEWER opens the stage READER (menu-map-viewer.tsx) on the stage list
// every page that offers the shipped roads shares (menu-levels.tsx). It is
// the only place the generator's layers are: Roam is a page for choosing a
// road to drive, and a strip of layer buttons across the country helps
// nobody do that.
//
// And one card that is not a page: the BENCHMARK's, which goes over the race
// it is timing rather than into the menu, because the thing being measured
// is on the canvas underneath it (game/benchmark.ts).

import { useState } from "react";

import { BENCHMARK, type BenchmarkStatus } from "./benchmark.ts";
import { LOCATIONS, findLevel, levelCleared, type CampaignProgress } from "./campaign.ts";
import { clearDebugLog, debugLogCounts, debugLogTail, debugLogText } from "./debug-log.ts";
import { playUi } from "./audio/ui.ts";
import { ToggleRow } from "./menu.tsx";
import type { DevSettings } from "./settings.ts";
import { copyText } from "../lib/copy-text.ts";

/** How many lines of the log the page shows. Enough that the tail is worth
 * LOOKING at (and screenshotting) without the card growing into a wall
 * nobody scrolls to the bottom of. */
const TAIL_LINES = 60;

function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="menu-item menu-item-dev"
      onClick={() => {
        playUi("select");
        void copyText(text()).then((ok) => {
          setSaid(ok ? "COPIED" : "COPY FAILED — SELECT IT BELOW");
          setTimeout(() => setSaid(null), 2000);
        });
      }}
    >
      {said ?? label}
    </button>
  );
}

export function DebugLogPage({ onBack }: { onBack: () => void }) {
  // Read once per render rather than subscribed: the log is written by the
  // frame loop, and a card that re-rendered on every line would be a debug
  // tool that costs more frames than the thing being debugged.
  const counts = debugLogCounts();
  const tail = debugLogTail(TAIL_LINES);
  const [cleared, setCleared] = useState(0);
  return (
    <div className="menu-card menu-card-wide">
      <button type="button" className="menu-back" data-nav-back onClick={onBack}>
        ‹ DEVELOPER
      </button>
      <div className="menu-title menu-title-dev">DEBUG LOG</div>
      <div className="menu-sub">
        {counts.all} lines kept
        {counts.run > 0 ? ` · ${counts.run} since this run started` : " · no run opened yet"}
      </div>
      <CopyButton label="COPY LATEST RUN" text={() => debugLogText("run")} />
      <CopyButton label="COPY EVERYTHING" text={() => debugLogText("all")} />
      <button
        type="button"
        className="menu-item menu-item-quiet"
        onClick={() => {
          playUi("back");
          clearDebugLog();
          setCleared((n) => n + 1);
        }}
      >
        CLEAR
      </button>
      {/* Selectable, unlike everything else in the menu: a copy button that
          the browser refuses is not a dead end if the text is right there
          to drag over. */}
      <pre className="dev-log" key={cleared}>
        {tail.length === 0
          ? "(nothing logged — switch DEBUG OVERLAY on and drive)"
          : tail.map((e) => `${(e.at / 1000).toFixed(2)}s [${e.tag}] ${e.text}`).join("\n")}
      </pre>
    </div>
  );
}

/** THE BENCHMARK'S CARD — over the race while it is being measured, and the
 * answer once it is. What it says at every moment is one number: how long
 * this machine took to draw a fixed piece of racing (game/benchmark.ts).
 *
 * The buffer it was drawn into is on the card beside the field, because a
 * time without them is a time that compares to nothing — and it is the
 * VIDEO options, the one thing the benchmark deliberately does not pin, that
 * decide both. */
export function BenchmarkCard({
  status,
  onAgain,
  onLeave,
}: {
  status: BenchmarkStatus;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const done = status.phase === "done";
  const stage = findLevel(BENCHMARK.levelId)?.level.name ?? BENCHMARK.levelId;
  /** Seconds of racing the frames add up to — the fixed side of the sum. */
  const race = BENCHMARK.frames * BENCHMARK.step;
  const share = Math.min(1, status.frames / BENCHMARK.frames);
  return (
    <div className="hud-menu-wrap pointer-events-auto">
      <div className="hud-menu bench">
        <div className="hud-menu-title">BENCHMARK</div>
        <div className="hud-pause-sub">
          {stage.toUpperCase()} · {status.cars} CARS · {status.width}×{status.height}
        </div>
        <div className="bench-time">
          {status.seconds.toFixed(2)}
          <span className="bench-unit">s</span>
        </div>
        <div className="bench-note">
          {status.phase === "warmup"
            ? "WARMING UP — the countdown is drawn, and not timed"
            : done
              ? `${BENCHMARK.frames} frames · ${race.toFixed(0)} s of racing at ${(
                  race / Math.max(status.seconds, 0.001)
                ).toFixed(2)}× real time`
              : `${status.frames} of ${BENCHMARK.frames} frames`}
        </div>
        {!done && (
          <>
            <div className="bench-bar">
              <div className="bench-bar-fill" style={{ width: `${(share * 100).toFixed(1)}%` }} />
            </div>
            {/* A browser stops drawing a page nobody is looking at, and a
                clock that kept running through it would be timing the
                machine's screensaver. */}
            <div className="bench-note">LEAVE THE WINDOW IN FRONT</div>
          </>
        )}
        {done && (
          <button
            type="button"
            className="hud-start"
            onClick={() => {
              playUi("select");
              onAgain();
            }}
          >
            RUN AGAIN
          </button>
        )}
        <button
          type="button"
          className="hud-pause-act"
          data-nav-back
          onClick={() => {
            playUi("back");
            onLeave();
          }}
        >
          {done ? "DEVELOPER" : "STOP"}
        </button>
      </div>
    </div>
  );
}

type DeveloperProps = {
  progress: CampaignProgress;
  dev: DevSettings;
  onDev: (dev: DevSettings) => void;
  onUnlockEverything: () => void;
  onBack: () => void;
  onDebugLog: () => void;
  onMapViewer: () => void;
  onBenchmark: () => void;
};

export function DeveloperPage({
  progress,
  dev,
  onDev,
  onUnlockEverything,
  onBack,
  onDebugLog,
  onMapViewer,
  onBenchmark,
}: DeveloperProps) {
  const total = LOCATIONS.reduce((n, l) => n + l.levels.length, 0);
  const cleared = LOCATIONS.reduce(
    (n, l) => n + l.levels.filter((v) => levelCleared(progress, v.id)).length,
    0,
  );
  const allOpen = cleared >= total;
  return (
    <div className="menu-card menu-card-wide">
      <button type="button" className="menu-back" data-nav-back onClick={onBack}>
        ‹ MENU
      </button>
      <div className="menu-title menu-title-dev">DEVELOPER</div>
      <div className="menu-sub">
        {cleared} of {total} stages cleared
      </div>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={onUnlockEverything}
        disabled={allOpen}
      >
        UNLOCK EVERYTHING
        <span className="menu-item-sub">
          {allOpen
            ? "Every stage is already open, in campaign and time trial"
            : "Open every stage in campaign and time trial. Best times are kept."}
        </span>
      </button>
      <div className="opt-toggles">
        <ToggleRow
          label="GOD MODE"
          hint="Fly the camera off the car — WASD, space up, ctrl down; sticks on a pad, thumbs on glass"
          on={dev.god}
          onToggle={() => onDev({ ...dev, god: !dev.god })}
        />
        <ToggleRow
          label="DEBUG OVERLAY"
          hint="Where you are, what the stage is, and the line that gets anyone back here"
          on={dev.debug}
          onToggle={() => onDev({ ...dev, debug: !dev.debug })}
        />
        <ToggleRow
          label="COLLECT RACE DATA"
          hint="Write the run down as you drive it — save the file at the finish, replay it against any difficulty"
          on={dev.record}
          onToggle={() => onDev({ ...dev, record: !dev.record })}
        />
      </div>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={onBenchmark}
        disabled={dev.god}
      >
        BENCHMARK
        <span className="menu-item-sub">
          {dev.god
            ? "Switch GOD MODE off first — a free camera over a skipped countdown is not the benchmark's race"
            : `Race ${BENCHMARK.field.cars} cars off one green and time it. The same ` +
              `${(BENCHMARK.frames * BENCHMARK.step).toFixed(0)} seconds of racing every run, drawn ` +
              `as fast as this machine can: the seconds it takes are the score, and lower is better`}
        </span>
      </button>
      <button type="button" className="menu-item menu-item-dev" onClick={onMapViewer}>
        MAP VIEWER
        <span className="menu-item-sub">
          Any stage on the map and nothing else — the generator&apos;s own layers over it, the zoom,
          the pan, COPY DEBUG INFO and the shutter
        </span>
      </button>
      <button type="button" className="menu-item menu-item-dev" onClick={onDebugLog}>
        DEBUG LOG
        <span className="menu-item-sub">
          What happened before the screenshot — copy it whole, or just this run
        </span>
      </button>
    </div>
  );
}
