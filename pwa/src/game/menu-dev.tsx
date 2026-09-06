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
import { INDEX_REAL, benchPlot, type BenchPlot } from "./benchmark-index.ts";
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

/** THE GRAPH'S BOX, in its own units — the SVG scales to whatever width the
 * card ends up, so these are proportions rather than pixels. `x0`..`x1` and
 * `y0`..`y1` are where the LINE may go; the panel behind it is the whole
 * box, so the leading dot at the end of a finished run sits inside its own
 * frame instead of half over the edge, and the gutter to the left of `x0`
 * is where the vertical axis says what its two ends are worth. */
const PLOT = { w: 320, h: 150, x0: 27, x1: 311, y0: 16, y1: 130 };

/** THE RUN, DRAWN. One line: the score of the whole run so far, read every
 * fifteen frames and walked across the eighteen hundred the run is — so how
 * far along it is IS how far across the line has got, and the number at its
 * leading edge is the score as it currently stands.
 *
 * It settles as it goes, which is the point of plotting the running answer
 * rather than each window on its own: the first readings scatter over the
 * grid and the first corner, and the line then walks steadily onto the
 * number the run ends on. A machine that stumbles halfway puts a kink in it
 * that a single figure at the end would have averaged away. */
function BenchmarkPlot({ plot, warming }: { plot: BenchPlot; warming: boolean }) {
  const px = (x: number): number => PLOT.x0 + x * (PLOT.x1 - PLOT.x0);
  const py = (y: number): number => PLOT.y0 + y * (PLOT.y1 - PLOT.y0);
  const at = (p: { x: number; y: number }): string => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`;
  const line = plot.points.map(at).join(" ");
  const last = plot.points.length > 0 ? plot.points[plot.points.length - 1] : null;
  // The same line dropped to the floor at both ends: under a fading wash it
  // reads as a quantity where a bare stroke reads as a squiggle. It falls at
  // the FIRST READING and not at the axis — there is no score before there
  // is one, and closing the shape further left only draws a ramp up out of
  // the corner that no measurement was ever taken along.
  const area =
    last === null ? "" : `${px(plot.points[0].x)},${PLOT.y1} ${line} ${px(last.x)},${PLOT.y1}`;
  // The score rides the leading edge, and the edge reaches the right-hand
  // side at the end of every run — so the label turns round to stay inside
  // the box, and drops under the point when the point is up against the
  // ceiling.
  const near = last !== null && last.x > 0.62;
  const under = last !== null && last.y < 0.18;
  const real = plot.real === null ? null : py(plot.real);
  return (
    <svg className="bench-plot" viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} role="img">
      {/* Its own ground. The card is see-through and what is behind it is a
          rally at speed — a line drawn straight onto that is a line read
          against moving scenery. */}
      <defs>
        <linearGradient id="bench-plot-wash" x1="0" y1="0" x2="0" y2="1">
          <stop className="bench-plot-wash-top" offset="0" />
          <stop className="bench-plot-wash-foot" offset="1" />
        </linearGradient>
      </defs>
      <rect
        className="bench-plot-panel"
        x={0.5}
        y={0.5}
        width={PLOT.w - 1}
        height={PLOT.h - 1}
        rx={5}
      />
      {/* The two axes, and what their ends are worth. The floor is always
          zero — an index graph with a cropped bottom would make every
          machine look like every other one — and the ceiling is whatever
          this run's score needed. */}
      <line className="bench-plot-axis" x1={PLOT.x0} y1={PLOT.y1} x2={PLOT.x1} y2={PLOT.y1} />
      <line className="bench-plot-axis" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x0} y2={PLOT.y1} />
      <line className="bench-plot-grid" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1} y2={PLOT.y0} />
      <text className="bench-plot-tick" x={PLOT.x0 - 5} y={PLOT.y0 + 3} textAnchor="end">
        {plot.top}
      </text>
      <text className="bench-plot-tick" x={PLOT.x0 - 5} y={PLOT.y1 + 3} textAnchor="end">
        0
      </text>
      {/* Real time, where the axis reaches it: the one gradation on this
          scale that means something without a second machine to compare
          against — the race drawn as fast as it is driven. It goes unnamed
          where the ceiling has come down onto it, rather than printing two
          labels over each other. */}
      {real !== null && (
        <>
          <line className="bench-plot-real" x1={PLOT.x0} y1={real} x2={PLOT.x1} y2={real} />
          {real - PLOT.y0 > 12 && (
            <text className="bench-plot-tick bench-plot-tick-real" x={PLOT.x0 + 5} y={real - 5}>
              100 · REAL TIME
            </text>
          )}
        </>
      )}
      {last !== null && <polygon className="bench-plot-area" points={area} />}
      {last !== null && <polyline className="bench-plot-line" points={line} />}
      {last !== null && (
        <circle className="bench-plot-head" cx={px(last.x)} cy={py(last.y)} r={3.4} />
      )}
      {last !== null && (
        <text
          className="bench-plot-score"
          x={near ? px(last.x) - 7 : px(last.x) + 7}
          y={under ? py(last.y) + 16 : py(last.y) - 9}
          textAnchor={near ? "end" : "start"}
        >
          {Math.round(plot.index)}
        </text>
      )}
      {warming && (
        <text
          className="bench-plot-wait"
          x={PLOT.w / 2}
          y={(PLOT.y0 + PLOT.y1) / 2}
          textAnchor="middle"
        >
          WARMING UP
        </text>
      )}
    </svg>
  );
}

/** THE BENCHMARK'S CARD — over the race while it is being measured, and the
 * answer once it is. What it says at every moment is one number: this
 * machine's INDEX, where 100 is the race drawn in the time it takes to
 * drive (game/benchmark-index.ts).
 *
 * It is a graph and not a counter because the number is only worth anything
 * once it has settled, and a figure ticking over says nothing about whether
 * it has. The line shows it converging — and shows the machine's bad
 * moments, which a single figure at the end cannot.
 *
 * The buffer it was drawn into is on the card beside the field, because a
 * score without them is a score that compares to nothing — and it is the
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
  const plot = benchPlot(status.samples, BENCHMARK.frames);
  return (
    <div className="hud-menu-wrap pointer-events-auto">
      <div className="hud-menu bench">
        <div className="hud-menu-title">BENCHMARK</div>
        <div className="hud-pause-sub">
          {stage.toUpperCase()} · {status.cars} CARS · {status.width}×{status.height}
        </div>
        {done && (
          <div className="bench-score">
            <span className="bench-score-label">INDEX</span>
            {Math.round(status.index)}
          </div>
        )}
        <BenchmarkPlot plot={plot} warming={status.phase === "warmup"} />
        {/* A browser stops drawing a page nobody is looking at, and a clock
            that kept running through it would be timing the machine's
            screensaver. */}
        {!done && <div className="bench-note">LEAVE THE WINDOW IN FRONT</div>}
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
              `as fast as this machine can: ${INDEX_REAL} is drawing it in the time it takes to ` +
              `drive, and higher is better`}
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
