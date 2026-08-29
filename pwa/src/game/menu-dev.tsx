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

import { useState } from "react";

import { LOCATIONS, levelCleared, type CampaignLevel, type CampaignProgress } from "./campaign.ts";
import { clearDebugLog, debugLogCounts, debugLogTail, debugLogText } from "./debug-log.ts";
import { lengthLabel } from "./menu-levels.tsx";
import { playUi } from "./audio/ui.ts";
import { ToggleRow } from "./menu.tsx";
import type { DevSettings } from "./settings.ts";

/** How many lines of the log the page shows. Enough that the tail is worth
 * LOOKING at (and screenshotting) without the card growing into a wall
 * nobody scrolls to the bottom of. */
const TAIL_LINES = 60;

/** Put text on the clipboard, falling back to a hidden textarea where the
 * async API is missing or refused (insecure origin, a browser that only
 * grants it inside a gesture it did not recognise). Returns whether it
 * worked, so the button can say so rather than silently doing nothing. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the old way */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

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

/** THE MAP VIEWER — the campaign's own stages, opened on the map rather than
 * driven.
 *
 * Roam builds a stage from whatever the dials happen to say, which is the
 * right thing for choosing a seed and the wrong thing for finding a bug in a
 * SHIPPED map: the fourteen roads a player actually drives are authored, and
 * a defect in one of them is a defect somebody will meet. This page lists
 * them by country, and pressing one loads that stage's exact spec — its
 * seed, its band, its shape, the campaign's own dials and the hour and
 * weather it is set in — onto the full-screen developer map, where the
 * layers, the pan, the zoom and the shutter are already waiting.
 *
 * The country step is kept even while there is only one country to keep it
 * for: the biome is the axis this page exists to walk, and a list of one is
 * a list that becomes right the moment a second one lands. */
function StageLine({ level, onView }: { level: CampaignLevel; onView: () => void }) {
  return (
    <button type="button" className="menu-item menu-item-dev" onClick={onView}>
      {level.name.toUpperCase()}
      <span className="menu-item-sub">
        seed {level.seed} · {lengthLabel(level)} · {level.timeOfDay} {level.weather} ·{" "}
        {level.season}
      </span>
    </button>
  );
}

export function MapViewerPage({
  onView,
  onBack,
}: {
  onView: (level: CampaignLevel) => void;
  onBack: () => void;
}) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const location = locationId === null ? null : LOCATIONS.find((l) => l.id === locationId);
  return (
    <div className="menu-card menu-card-wide">
      {/* Back steps WITHIN the page before it leaves it, so a controller's B
          walks the same two steps the presses came in on. */}
      <button
        type="button"
        className="menu-back"
        data-nav-back
        onClick={() => (location ? setLocationId(null) : onBack())}
      >
        ‹ {location ? "MAP VIEWER" : "DEVELOPER"}
      </button>
      <div className="menu-title menu-title-dev">
        {location ? location.name.toUpperCase() : "MAP VIEWER"}
      </div>
      <div className="menu-sub">
        {location
          ? "Open a stage on the map — layers, zoom, pan and the shutter"
          : "Look at the stages the campaign ships, without driving them"}
      </div>
      {location
        ? location.levels.map((level) => (
            <StageLine key={level.id} level={level} onView={() => onView(level)} />
          ))
        : LOCATIONS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="menu-item menu-item-dev"
              onClick={() => setLocationId(l.id)}
            >
              {l.name.toUpperCase()}
              <span className="menu-item-sub">
                {l.blurb} · {l.levels.length} stages
              </span>
            </button>
          ))}
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
};

export function DeveloperPage({
  progress,
  dev,
  onDev,
  onUnlockEverything,
  onBack,
  onDebugLog,
  onMapViewer,
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
          hint="Fly the camera off the car — WASD, space up, ctrl down"
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
      <button type="button" className="menu-item menu-item-dev" onClick={onMapViewer}>
        MAP VIEWER
        <span className="menu-item-sub">
          Open the campaign&apos;s own stages on the map — layers, zoom, pan, and a shutter that
          writes the debug boxes into the picture
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
