// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PAUSE CARD — the one menu surface reached mid-stage, by tapping the
// minimap or pressing PAUSE. The run holds where it stands, and the card
// says where it stands with it: the stage and the car it is being driven
// in, and the three figures a player who has just stopped is actually
// asking about, over the ways on.
//
// It lives here rather than in the HUD's top bar because the bar is a strip
// over the road, and every button on it is a button in the way of the
// driving.
//
// EVERY PRESS ON IT IS A WHOLE ROW WITH A MARK ON IT. The card used to
// carry a strip of settings between RESUME and the presses that end the
// run — a camera, the HUD, the mirror, two faders — which is the options
// page written a second time, badly: whichever row a player had stopped for
// was the one it did not have. So the settings are the settings page
// (menu-options.tsx), opened over the held stage by the OPTIONS row, and
// what is left here is the five things that are only ever asked mid-stage.

import { useState } from "react";

import { formatTime } from "../lib/util.ts";
import { playUi } from "./audio/ui.ts";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { ToggleRow } from "./menu.tsx";
import type { DevSettings } from "./settings.ts";

/** WHAT THE RUN HAS DONE SO FAR, as the card's strip reads it. A slice of
 * the HUD's own snapshot rather than a set of numbers computed here: every
 * figure on this card is a figure the instruments were already showing, and
 * a second derivation of any of them is a second thing to be wrong.
 *
 * Null while there is nothing to say — the card opened before the run has a
 * snapshot at all. */
export type PauseFace = {
  /** Total race time, seconds. */
  time: number;
  lap: number;
  laps: number;
  /** The stage's record, or null where nothing keeps one (Roam). */
  bestTime: number | null;
  /** Ground covered this run, m. */
  tripM: number;
  /** The training ground rather than a stage — nothing there is timed, so
   * the strip is not drawn at all. */
  training: boolean;
};

/** The strip's three columns, decided by what the run IS.
 *
 * TIME is always the first, because on a held stage it is the question.
 * The middle one is whichever of the two "how far through" figures the
 * stage actually has — laps on a circuit, distance covered on a sprint —
 * and the last is the mark the run is being measured against. */
function pauseStats(face: PauseFace): { key: string; value: string; label: string }[] {
  return [
    { key: "time", value: formatTime(face.time), label: "TIME" },
    face.laps > 1
      ? { key: "lap", value: `${Math.min(face.lap, face.laps)} / ${face.laps}`, label: "LAP" }
      : { key: "trip", value: `${(face.tripM / 1000).toFixed(1)} km`, label: "DRIVEN" },
    {
      key: "best",
      value: face.bestTime === null ? "—" : formatTime(face.bestTime),
      label: "BEST",
    },
  ];
}

type PauseProps = {
  seed: number;
  carName: string;
  /** The run's own figures for the strip, or null while it has none. */
  face: PauseFace | null;
  /** The developer tools, offered here as well as in the menu: the moment
   * you want to fly to something is the moment you are looking at it, and
   * that moment is behind the pause card, not four screens away. Null when
   * the developer menu has never been let out. */
  dev: DevSettings | null;
  onDev: (dev: DevSettings) => void;
  onResume: () => void;
  /** THE SETTINGS, over the stage still standing. One row rather than a
   * strip of knobs — see the note at the top of this file. */
  onOptions: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** WATCH THE RUN SO FAR — put the drive up to this moment straight back on
   * the road (app-play.ts). It ENDS the run, which is why it asks; null when
   * there is nothing behind the press — no recording armed, or the thing
   * being watched is already one. */
  onWatchReplay: (() => void) | null;
};

/** One of the four ways on, as the card draws them all: a mark, a name, and
 * — where the press costs something the name does not say — what it costs,
 * out at the end of the row. */
function PauseAct({
  glyph,
  label,
  cost,
  lit,
  onPress,
}: {
  glyph: GlyphName;
  label: string;
  /** What this press costs, where the words on it do not already say. */
  cost?: string;
  /** Asked, and waiting on a second press. */
  lit?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`hud-pause-act ${lit ? "hud-pause-asking" : ""}`}
      onClick={onPress}
    >
      <Glyph name={glyph} className="hud-pause-mark" />
      <span className="hud-pause-name">{label}</span>
      {cost && <span className="hud-pause-cost">{cost}</span>}
    </button>
  );
}

/** The in-race menu, opened by tapping the minimap. The backdrop resumes:
 * a menu you opened by mis-aiming for the map must cost one tap to leave. */
export function PauseMenu({
  seed,
  carName,
  face,
  dev,
  onDev,
  onResume,
  onOptions,
  onRestart,
  onMainMenu,
  onWatchReplay,
}: PauseProps) {
  /** Whether WATCH REPLAY has been pressed once and is now asking.
   *
   * THE ONE PRESS ON THIS CARD THAT ASKS, and it asks because it is the only
   * one whose cost is not written on it. RESTART STAGE and MAIN MENU say
   * exactly what they do and a player pressing either has decided to stop
   * driving; WATCH REPLAY sounds like something you do BESIDE a run, and it
   * is not — a replay is a run, the app stands one stage at a time, and
   * taking the tape means giving the drive up. So the row says so and takes
   * the second press, rather than a card of its own: a dialog over a dialog
   * is a modal to dismiss for a player who only mis-aimed for the minimap,
   * and the ask is one line of the row they are already looking at.
   *
   * Nothing has to disarm it: every way out of this card unmounts it —
   * resuming, restarting, leaving, and the press itself — so a question
   * nobody answered is gone by the time the card is opened again. */
  const [asking, setAsking] = useState(false);
  // The training ground keeps no time, no laps and no record, so it has
  // nothing to put in a strip — exactly as the HUD drops the clock for it.
  const stats = face && !face.training ? pauseStats(face) : null;
  return (
    <div className="hud-menu-wrap pointer-events-auto" onPointerDown={onResume} role="presentation">
      <div className="hud-menu hud-pause" onPointerDown={(e) => e.stopPropagation()}>
        <div className="hud-menu-title">PAUSED</div>
        <div className="hud-pause-sub">
          STAGE {seed} · {carName}
        </div>
        {/* WHERE THE RUN STANDS, between the heading and the presses. The
            instruments behind the scrim are still saying all of it, and none
            of them is readable through a card: a player who stopped to ask
            how the run is going should not have to resume to find out. */}
        {stats && (
          <div className="hud-pause-stats">
            {stats.map((stat) => (
              <span key={stat.key} className="hud-pause-stat">
                <b>{stat.value}</b>
                <i>{stat.label}</i>
              </span>
            ))}
          </div>
        )}
        {/* RESUME is both the way OUT of this card and where a controller's
            cursor belongs: it is the press a card opened by mis-aiming for
            the minimap needs, and two of the rows under it throw the
            stage away. Without the focus mark the cursor skips it — a way
            back is normally a chevron nobody came for — and lands on the
            first row that is not it. */}
        <button
          type="button"
          className="hud-start hud-pause-resume"
          data-nav-back
          data-nav-focus
          onClick={() => {
            playUi("back");
            onResume();
          }}
        >
          <Glyph name="play" className="hud-pause-mark" />
          <span className="hud-pause-name">RESUME</span>
        </button>
        {/* OPTIONS stands directly under RESUME, above everything that ends
            the run: it is the only other press here a player can make and
            still be driving the same stage a moment later. Standing between
            them is also what keeps a thumb aiming for RESUME from landing
            on RESTART. */}
        <PauseAct
          glyph="sliders"
          label="OPTIONS"
          onPress={() => {
            playUi("select");
            onOptions();
          }}
        />
        {/* WATCH REPLAY stands FIRST of the three that end the run, above the
            two that end it without showing the player anything. All three
            end it; this is the only one that hands something back for it,
            and a player who has stopped mid-stage to look at what just
            happened is reaching for exactly this. */}
        {onWatchReplay && (
          <PauseAct
            glyph="replay"
            label="WATCH REPLAY"
            cost={asking ? "PRESS AGAIN" : "ENDS THIS RUN"}
            lit={asking}
            onPress={() => {
              playUi("select");
              if (!asking) {
                setAsking(true);
                return;
              }
              setAsking(false);
              onWatchReplay();
            }}
          />
        )}
        <PauseAct glyph="restart" label="RESTART STAGE" onPress={onRestart} />
        <PauseAct
          glyph="exit"
          label="MAIN MENU"
          onPress={() => {
            playUi("select");
            onMainMenu();
          }}
        />
        {dev && (
          <div className="hud-pause-dev">
            <ToggleRow
              label="GOD MODE"
              hint="Fly the camera off the car"
              on={dev.god}
              onToggle={() => onDev({ ...dev, god: !dev.god })}
            />
            <ToggleRow
              label="DEBUG OVERLAY"
              hint="Where you are, and the line that gets anyone back here"
              on={dev.debug}
              onToggle={() => onDev({ ...dev, debug: !dev.debug })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
