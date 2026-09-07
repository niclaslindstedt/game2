// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer menu: out of the way of a player who never found it (see
// DEV_TAPS), and blunt for one who did. Everything here bypasses the game
// rather than playing it, which is the point — it is how the whole thing
// gets tested without driving four stages first.
//
// Three pages. The first is the switchboard: the way to the locks, and the
// three tools that make something somebody saw into something somebody else
// can stand in front of — god mode and the debug overlay for a PLACE, and
// race data collection for a DRIVE (game/run-tape.ts), which is the same
// idea aimed at time instead of space. The second is the debug log, which is
// the other half of a screenshot: the picture says where, the log says what
// led there. The third is UNLOCKS, which is the campaign's own ladder as a
// row of switches — country by country, both ways.
//
// MAP VIEWER opens the stage READER (menu-map-viewer.tsx) on the stage list
// every page that offers the shipped roads shares (menu-levels.tsx). It is
// the only place the generator's layers are: Roam is a page for choosing a
// road to drive, and a strip of layer buttons across the country helps
// nobody do that.
//
// BENCHMARK and its HISTORY are started from here and drawn in menu-bench.tsx
// — the card goes over the race it is timing rather than into the menu,
// because the thing being measured is on the canvas underneath it.

import { useState } from "react";

import { BENCHMARK } from "./benchmark-plan.ts";
import { INDEX_REAL } from "./benchmark-index.ts";
import { benchmarkRuns } from "./benchmark-history.ts";
import {
  LOCATIONS,
  levelCleared,
  levelCompleted,
  locationUnlocked,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { clearDebugLog, debugLogCounts, debugLogTail, debugLogText } from "./debug-log.ts";
import { playUi } from "./audio/ui.ts";
import { ToggleRow } from "./menu.tsx";
import { type DevSettings } from "./settings.ts";
import { copyText } from "../lib/copy-text.ts";

/** How many lines of the log the page shows. Enough that the tail is worth
 * LOOKING at (and screenshotting) without the card growing into a wall
 * nobody scrolls to the bottom of. */
const TAIL_LINES = 60;

/** A button that puts a block of text on the clipboard and says so — the
 * developer menu's own way out of a card, shared with the benchmark's
 * surfaces (menu-bench.tsx). */
export function CopyButton({ label, text }: { label: string; text: () => string }) {
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

/** One country's row on the UNLOCKS page: what it reads, and whether either
 * press has anything left to do. Worked out here rather than in the markup
 * because it is a fact about the BOARD — see `unlockRows`. */
type UnlockRow = {
  location: CampaignLocation;
  /** Stages of it the player is on points for. */
  cleared: number;
  /** Whether the campaign will let the player into the country at all. */
  open: boolean;
  /** Nothing for UNLOCK to do: this country and every one behind it is won. */
  won: boolean;
  /** Nothing for LOCK to do: this country and every one in front of it has
   * never been driven. */
  shut: boolean;
};

/** THE LADDER AS A ROW OF SWITCHES. Both presses work on a PREFIX of the
 * countries (see `unlockLocation` / `lockLocation`), so both disabled states
 * are read over a RUN of them rather than over the country on the row: the
 * unlock is spent once everything up to here is won, and the lock once
 * everything from here on is untouched. */
function unlockRows(progress: CampaignProgress): UnlockRow[] {
  const cleared = LOCATIONS.map((l) => l.levels.filter((v) => levelCleared(progress, v.id)).length);
  const won = LOCATIONS.map((l, i) => cleared[i] === l.levels.length);
  const driven = LOCATIONS.map((l) =>
    l.levels.some((v) => levelCompleted(v, progress) || levelCleared(progress, v.id)),
  );
  return LOCATIONS.map((location, i) => ({
    location,
    cleared: cleared[i],
    open: locationUnlocked(location, progress),
    won: won.slice(0, i + 1).every(Boolean),
    shut: !driven.slice(i).some(Boolean),
  }));
}

type UnlockProps = {
  progress: CampaignProgress;
  /** Open the campaign up to this country, or the whole ladder for null. */
  onUnlock: (locationId: string | null) => void;
  /** Shut this country and everything in front of it; null shuts the lot. */
  onLock: (locationId: string | null) => void;
  onBack: () => void;
};

/** UNLOCKS — the campaign's progress as something to set rather than earn.
 * Every country both ways, plus the two presses that take the whole ladder
 * at once, so a state that would cost four evenings of driving to reach is
 * one press away and a state that would cost clearing the browser's storage
 * is another. */
export function UnlockPage({ progress, onUnlock, onLock, onBack }: UnlockProps) {
  const rows = unlockRows(progress);
  const total = LOCATIONS.reduce((n, l) => n + l.levels.length, 0);
  const cleared = rows.reduce((n, row) => n + row.cleared, 0);
  const allOpen = cleared >= total;
  /** Nothing anywhere on the board: the first country's own LOCK is spent,
   * and that one reads over every country there is. */
  const untouched = rows[0]?.shut ?? true;
  return (
    <div className="menu-card menu-card-wide">
      <button type="button" className="menu-back" data-nav-back onClick={onBack}>
        ‹ DEVELOPER
      </button>
      <div className="menu-title menu-title-dev">UNLOCKS</div>
      <div className="menu-sub">
        {cleared} of {total} stages cleared · best times are kept either way
      </div>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={() => onUnlock(null)}
        disabled={allOpen}
      >
        UNLOCK EVERYTHING
        <span className="menu-item-sub">
          {allOpen
            ? "Every stage is already open, in campaign and time trial"
            : "Win every stage of every country — campaign and time trial both"}
        </span>
      </button>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={() => onLock(null)}
        disabled={untouched}
      >
        LOCK EVERYTHING
        <span className="menu-item-sub">
          {untouched
            ? "Nothing has been driven — the campaign is already back at its first stage"
            : "Back to a save that has never driven a stage"}
        </span>
      </button>
      {/* The rule is on the page rather than only in a tooltip: a phone has
          no hover, and a press whose reach is a surprise is a press nobody
          trusts twice. */}
      <div className="menu-sub">
        A country at a time. UNLOCK wins it and every country before it; LOCK undrives it and every
        country after — a campaign is a ladder, and it has no rung hanging in mid-air.
      </div>
      <div className="dev-locks">
        {rows.map((row) => (
          <div className="dev-lock" key={row.location.id}>
            <span className="dev-lock-text">
              <b>{row.location.name.toUpperCase()}</b>
              <span className="menu-item-sub">
                {row.cleared} of {row.location.levels.length} cleared · {row.open ? "open" : "shut"}
              </span>
            </span>
            <button
              type="button"
              className="menu-item menu-item-dev dev-lock-act"
              onClick={() => onUnlock(row.location.id)}
              disabled={row.won}
              title={`Win every stage of ${row.location.name} and every country before it`}
            >
              UNLOCK
            </button>
            <button
              type="button"
              className="menu-item menu-item-dev dev-lock-act"
              onClick={() => onLock(row.location.id)}
              disabled={row.shut}
              title={`Put ${row.location.name} and every country after it back to never driven`}
            >
              LOCK
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type DeveloperProps = {
  progress: CampaignProgress;
  dev: DevSettings;
  onDev: (dev: DevSettings) => void;
  onUnlocks: () => void;
  onBack: () => void;
  onDebugLog: () => void;
  onMapViewer: () => void;
  onBenchmark: () => void;
  onBenchmarkHistory: () => void;
};

export function DeveloperPage({
  progress,
  dev,
  onDev,
  onUnlocks,
  onBack,
  onDebugLog,
  onMapViewer,
  onBenchmark,
  onBenchmarkHistory,
}: DeveloperProps) {
  // What the history has in it, so the row can say whether there is anything
  // behind it before it is pressed.
  const scored = benchmarkRuns().length;
  const total = LOCATIONS.reduce((n, l) => n + l.levels.length, 0);
  const cleared = LOCATIONS.reduce(
    (n, l) => n + l.levels.filter((v) => levelCleared(progress, v.id)).length,
    0,
  );
  return (
    <div className="menu-card menu-card-wide">
      <button type="button" className="menu-back" data-nav-back onClick={onBack}>
        ‹ MENU
      </button>
      <div className="menu-title menu-title-dev">DEVELOPER</div>
      <div className="menu-sub">
        {cleared} of {total} stages cleared
      </div>
      <button type="button" className="menu-item menu-item-dev" onClick={onUnlocks}>
        UNLOCKS
        <span className="menu-item-sub">
          Set the campaign where you want it — every country open or shut on its own, or the whole
          ladder at once. Best times are kept.
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
              `as fast as this machine can: ${INDEX_REAL} is drawing it in the time it takes to ` +
              `drive, and higher is better`}
        </span>
      </button>
      <button
        type="button"
        className="menu-item menu-item-dev"
        onClick={onBenchmarkHistory}
        disabled={scored === 0}
      >
        BENCHMARK HISTORY
        <span className="menu-item-sub">
          {scored === 0
            ? "Nothing scored on this machine yet — every run the benchmark finishes is kept here"
            : `${scored} run${scored === 1 ? "" : "s"} kept, with what the picture was set to on ` +
              "each — the sheet copies as text"}
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
