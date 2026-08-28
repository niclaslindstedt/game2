// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GALLERY — the pictures the player took, looked at inside the game and
// sent on from there. Reached from the main menu's GALLERY row.
//
// A VIEWER, NOT A GRID. A player has a handful of pictures and wants to
// look at them, so the picture IS the page: one shot fills the frame and
// the roll runs as a filmstrip under it. Flipping is the primary verb — the
// arrow keys, the two arrows either side, or a thumbnail — because "show me
// the next one" is what somebody opening a gallery is doing, and a grid
// would make them press twice for it.
//
// SENDING ONE ON is the other half, and what that MEANS is the platform's
// answer rather than ours (../lib/share-image.ts). Every button is offered
// only where it will actually do something: SHARE raises the phone's own
// sheet (and the desktop's, where there is one), COPY is the desktop answer
// where there is not, and SAVE is the floor every browser can manage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  canCopyImage,
  canShareImage,
  copyImage,
  pngFile,
  saveImage,
  shareImage,
} from "../lib/share-image.ts";
import { deleteShot, loadShots, shot, subscribeShots, type ShotMeta } from "../lib/shot-store.ts";
import { playUi } from "./audio/ui.ts";
import { MenuHead } from "./menu.tsx";
import { MAX_SHOTS, armScreenshots, shotFileName } from "./screenshots.ts";
import { keyLabel, type Settings } from "./settings.ts";

/** How long a result line (COPIED, SAVED) stays under the buttons. */
const NOTICE_MS = 2400;

export function GalleryPage({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const [shots, setShots] = useState<readonly ShotMeta[]>([]);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Two-step delete: a stray press must not destroy a picture that cannot
  // be taken again — the stage it was taken on has long since been rebuilt.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // Name the store before reading it: an unnamed one is a different
    // database, and this mount is routinely the session's first touch of
    // the roll (the menu, with no run ever started).
    armScreenshots();
    void loadShots();
    return subscribeShots(setShots);
  }, []);

  // A delete can shorten the roll under the cursor.
  const at = Math.min(index, Math.max(0, shots.length - 1));
  const current = shots[at] ?? null;

  const say = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((held) => (held === text ? null : held)), NOTICE_MS);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (shots.length < 2) return;
      playUi("move");
      setConfirming(false);
      setIndex((was) => (was + delta + shots.length) % shots.length);
    },
    [shots.length],
  );

  // The pixels on screen. Minted once per picture and revoked when it
  // changes: an object URL made in the render body would leak one per
  // frame, and a browse of forty shots would hold forty live blobs.
  const url = useMemo(() => {
    const entry = current ? shot(current.id) : null;
    return entry ? URL.createObjectURL(entry.blob) : null;
  }, [current]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);

  const file = useMemo(() => {
    const entry = current ? shot(current.id) : null;
    return entry ? pngFile(entry.blob, shotFileName(entry.label, entry.takenAt)) : null;
  }, [current]);

  const canShare = file !== null && canShareImage(file);
  const canCopy = canCopyImage();

  const doShare = useCallback(async () => {
    if (!file) return;
    playUi("select");
    // Straight into `share` with the blob already in hand: the gesture that
    // opened the sheet is spent by the first await, so nothing may encode
    // or fetch between the press and the call.
    const ok = await shareImage(file, { title: current?.label ?? "", text: current?.label });
    if (!ok) say("SHARE CANCELLED");
  }, [current?.label, file, say]);

  const doCopy = useCallback(async () => {
    if (!file) return;
    playUi("select");
    say((await copyImage(file)) ? "COPIED" : "COPY REFUSED");
  }, [file, say]);

  const doSave = useCallback(() => {
    if (!file) return;
    playUi("select");
    say(saveImage(file, file.name) ? "SAVED" : "SAVE REFUSED");
  }, [file, say]);

  const doDelete = useCallback(() => {
    if (!current) return;
    if (!confirming) {
      playUi("move");
      setConfirming(true);
      return;
    }
    playUi("back");
    setConfirming(false);
    void deleteShot(current.id);
  }, [confirming, current]);

  // The arrow keys flip. Hung off the window rather than off the frame so
  // it works wherever the focus happens to be — the filmstrip's own
  // buttons take focus as they are clicked, and a viewer that stops
  // answering the arrow keys because a thumbnail is focused is a bug.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        stepRef.current(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        stepRef.current(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const key = settings.keys.screenshot.map(keyLabel).join(" / ") || "the screenshot key";
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead
        back={onBack}
        backLabel="MAIN MENU"
        title="GALLERY"
        sub={
          shots.length === 0
            ? "Pictures you take during a run land here"
            : `${shots.length}/${MAX_SHOTS} kept — the oldest falls off`
        }
      />
      {shots.length === 0 ? (
        <div className="menu-empty">
          {settings.screenshots
            ? `Nothing here yet. Press ${key} during a run — or the shutter on the button row, on a phone — and the picture lands here.`
            : "Screenshots are switched off in OPTIONS ▸ CONTROLS. Turn them back on to take one."}
        </div>
      ) : (
        <div className="gallery">
          <div className="gallery-stage">
            <button
              type="button"
              className="gallery-step"
              aria-label="Previous screenshot"
              disabled={shots.length < 2}
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <div className="gallery-frame">
              {url && <img src={url} alt={current?.label ?? ""} className="gallery-img" />}
            </div>
            <button
              type="button"
              className="gallery-step"
              aria-label="Next screenshot"
              disabled={shots.length < 2}
              onClick={() => step(1)}
            >
              ›
            </button>
          </div>

          <div className="gallery-caption">
            <span className="gallery-label">{current?.label.toUpperCase() ?? ""}</span>
            <span className="gallery-stamp">
              {at + 1}/{shots.length} · {stamp(current)}
            </span>
          </div>

          <div className="gallery-actions">
            {canShare && (
              <button type="button" className="gallery-btn" onClick={() => void doShare()}>
                SHARE
              </button>
            )}
            {canCopy && (
              <button type="button" className="gallery-btn" onClick={() => void doCopy()}>
                COPY
              </button>
            )}
            <button type="button" className="gallery-btn" onClick={doSave}>
              SAVE
            </button>
            <button
              type="button"
              className={`gallery-btn gallery-btn-quiet ${confirming ? "gallery-btn-arm" : ""}`}
              onClick={doDelete}
            >
              {confirming ? "SURE?" : "DELETE"}
            </button>
            <span className="gallery-notice">{notice ?? ""}</span>
          </div>

          {/* The filmstrip: the whole roll, newest first, the shown picture
              framed. Scrolls on its own so a full roll never grows the card
              past the viewport. */}
          <div className="gallery-strip">
            {shots.map((entry, n) => (
              <button
                key={entry.id}
                type="button"
                className={`gallery-thumb ${n === at ? "gallery-thumb-on" : ""}`}
                aria-label={`Screenshot ${n + 1}`}
                onClick={() => {
                  playUi("move");
                  setConfirming(false);
                  setIndex(n);
                }}
              >
                <Thumb id={entry.id} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A filmstrip thumbnail. Its own component so each object URL is minted
 * and revoked with the tile that shows it, however the strip is reshuffled
 * by a delete. */
function Thumb({ id }: { id: string }) {
  const url = useMemo(() => {
    const entry = shot(id);
    return entry ? URL.createObjectURL(entry.blob) : null;
  }, [id]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);
  return url ? <img src={url} alt="" className="gallery-thumb-img" /> : null;
}

/** The picture's own date, in the reader's own clock. */
function stamp(meta: ShotMeta | null): string {
  if (!meta) return "";
  const when = new Date(meta.takenAt);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
