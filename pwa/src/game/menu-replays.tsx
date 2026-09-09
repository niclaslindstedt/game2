// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE REPLAYS PAGE — the runs the player kept, listed so one can be watched
// again. Reached from the main menu's REPLAYS row.
//
// A LIST, NOT A VIEWER, which is the opposite call to the gallery's next door
// (menu-gallery.tsx). A picture can be looked at on this page and a replay
// cannot: watching one means leaving the menu for the stage it was driven on.
// So the page's whole job is to make the right row easy to find — what stage,
// what car, how it went, when — and every row is one press away from being on
// the road.
//
// THE TAPE IS NOT READ HERE. The store hands back metadata alone
// (replay-store.ts) and the megabyte of JSONL is fetched by the press, so a
// page listing a dozen replays costs a dozen small records rather than a
// dozen megabytes of string on the frame the row was pressed.

import { useEffect, useState } from "react";

import { playUi } from "./audio/ui.ts";
import { findLevel } from "./campaign.ts";
import { Glyph } from "./menu-glyphs.tsx";
import { MenuHead } from "./menu.tsx";
import { REPLAY_LIMIT, replayLine, replayTitle, type ReplayMeta } from "./replay.ts";
import { deleteReplay, loadReplays, replays, replaysRead } from "./replay-store.ts";
import { TRAINING_LEVEL, isTraining } from "./training.ts";
import { formatDay } from "../lib/util.ts";

/** THE STAGE A REPLAY WAS DRIVEN ON, named. The campaign's catalog for a
 * ladder stage, the training ground for the arena, and null for a road that
 * has never had a name — a Roam seed, or a level id from a build that has
 * since dropped it, which is why the lookup is allowed to fail.
 *
 * Exported because App.tsx names the same replay in the same words when it
 * puts one on the road. */
export function replayStageName(levelId: string | null): string | null {
  if (!levelId) return null;
  if (isTraining(levelId)) return TRAINING_LEVEL.name;
  return findLevel(levelId)?.level.name ?? null;
}

function ReplayRow({
  meta,
  onWatch,
  onDelete,
}: {
  meta: ReplayMeta;
  onWatch: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="menu-replay">
      <button type="button" className="menu-replay-row" onClick={onWatch}>
        <Glyph name="replay" />
        <span className="menu-replay-text">
          <span className="menu-replay-name">
            {replayTitle(meta, replayStageName(meta.levelId))}
          </span>
          <span className="menu-replay-line">{replayLine(meta)}</span>
        </span>
        <span className="menu-replay-when">{formatDay(meta.savedAt)}</span>
      </button>
      {/* Its own button rather than a swipe or a long press: the row is the
          whole page's verb, and a destructive action sharing a press with it
          is a replay deleted by somebody who meant to watch it. */}
      <button
        type="button"
        className="menu-replay-drop"
        title="Delete this replay"
        aria-label="Delete this replay"
        onClick={onDelete}
      >
        ×
      </button>
    </div>
  );
}

export function ReplaysPage({
  onWatch,
  onBack,
}: {
  /** Put one on the road. The page hands over the listing; App reads the
   * tape off the store, because the read is a promise and a menu row is a
   * press. */
  onWatch: (meta: ReplayMeta) => void;
  onBack: () => void;
}) {
  const [roll, setRoll] = useState<readonly ReplayMeta[]>(replays);
  // An empty roll is two different sentences depending on this: the page is
  // up before the store has answered, and a player with a dozen replays must
  // not be told for a frame that they have none.
  const [read, setRead] = useState(replaysRead);
  useEffect(() => {
    let live = true;
    void loadReplays().then((kept) => {
      if (!live) return;
      setRoll(kept);
      setRead(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={onBack}
        backLabel="MENU"
        title="REPLAYS"
        sub={
          roll.length > 0
            ? `${roll.length} OF ${REPLAY_LIMIT} KEPT · NEWEST FIRST`
            : read
              ? "NOTHING KEPT YET"
              : "READING…"
        }
      />
      {roll.length === 0 ? (
        <div className="menu-note">
          Finish a run and press WATCH REPLAY on the results card — the disk in the corner keeps it,
          and it lands here. The oldest falls off once {REPLAY_LIMIT} are kept.
        </div>
      ) : (
        <div className="menu-replays">
          {roll.map((meta) => (
            <ReplayRow
              key={meta.id}
              meta={meta}
              onWatch={() => {
                playUi("select");
                onWatch(meta);
              }}
              onDelete={() => {
                playUi("back");
                void deleteReplay(meta.id).then(() => setRoll(replays()));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
