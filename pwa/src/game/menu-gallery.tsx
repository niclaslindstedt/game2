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
//
// THE PRESS MUST NOT COST ANYTHING. The card goes up on the frame the row
// is pressed, and the pictures arrive after it: the roll is read off disk
// behind the card, and each strip tile asks for its thumbnail only once it
// has come near the visible part of the strip, one shrink at a time and
// never at full size (../lib/shot-thumbs.ts). A strip that instead handed
// forty two-megapixel PNGs to forty `<img>` elements in one render is
// forty full decodes on the frame the player pressed — on the same thread
// the menu's backdrop is stepping the game on.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  canCopyImage,
  canShareImage,
  copyImage,
  pngFile,
  saveImage,
  shareImage,
} from "../lib/share-image.ts";
import {
  deleteShot,
  loadShots,
  shot,
  shotsRead,
  subscribeShots,
  type ShotMeta,
} from "../lib/shot-store.ts";
import { releaseThumbs, thumbUrl } from "../lib/shot-thumbs.ts";
import { playUi } from "./audio/ui.ts";
import { MenuHead } from "./menu.tsx";
import { MAX_SHOTS, armScreenshots, shotFileName } from "./screenshots.ts";
import { keyLabel, type Settings } from "./settings.ts";

/** How long a result line (COPIED, SAVED) stays under the buttons. */
const NOTICE_MS = 2400;

export function GalleryPage({ settings, onBack }: { settings: Settings; onBack: () => void }) {
  const [shots, setShots] = useState<readonly ShotMeta[]>([]);
  // An empty roll is two different sentences depending on this: the card is
  // up before the store has answered, and a player with forty pictures must
  // not be told for a frame that they have none.
  const [read, setRead] = useState(shotsRead);
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
    void loadShots().then(() => setRead(true));
    return subscribeShots(setShots);
  }, []);

  // Thumbnails outlive the page — a gallery opened twice should shrink each
  // picture once — so they are let go of by what has left the ROLL rather
  // than by this component unmounting.
  useEffect(() => {
    if (!read) return;
    releaseThumbs(new Set(shots.map((entry) => entry.id)));
  }, [read, shots]);

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
      {/* An empty roll has the card's own empty state under it saying how a
          picture gets here; the head does not say it a second time. */}
      <MenuHead
        back={onBack}
        backLabel="MENU"
        title="GALLERY"
        sub={shots.length === 0 ? undefined : `${shots.length}/${MAX_SHOTS} — the oldest falls off`}
      />
      {shots.length === 0 ? (
        <div className="menu-empty">
          {!read
            ? "Reading the roll…"
            : settings.screenshots
              ? `Nothing here yet. Press ${key} during a run and the picture lands here.`
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
              {url && (
                <img
                  src={url}
                  alt={current?.label ?? ""}
                  className="gallery-img"
                  decoding="async"
                />
              )}
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
                <Thumb meta={entry} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A filmstrip thumbnail. Empty until the tile is near enough to the
 * visible part of the strip to be worth a shrink, and then only ever a
 * thumbnail — the URL belongs to the cache, which is why nothing here
 * revokes it. */
function Thumb({ meta }: { meta: ShotMeta }) {
  const slot = useRef<HTMLSpanElement>(null);
  const near = useNear(slot);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!near) return undefined;
    const entry = shot(meta.id);
    if (!entry) return undefined;
    let live = true;
    void thumbUrl(entry).then((made) => {
      if (live) setUrl(made);
    });
    return () => {
      live = false;
    };
  }, [meta.id, near]);
  return (
    <span className="gallery-thumb-slot" ref={slot}>
      {url && <img src={url} alt="" className="gallery-thumb-img" decoding="async" />}
    </span>
  );
}

/** How far outside the strip's visible run a tile still counts as worth
 * making: about two tiles' worth either side, so a slow flick finds its
 * pictures already there rather than filling in behind the scroll. */
const LOOKAHEAD = "0px 240px";

/** One observer for the whole strip. Forty tiles with an observer each is
 * forty times the bookkeeping for the same answer, and the answer is the
 * same one the player gives: a viewport-rooted intersection is clipped by
 * every scrolling ancestor on the way up, so the strip's own overflow is
 * already accounted for. */
const wanted = new WeakMap<Element, () => void>();
let watcher: IntersectionObserver | null = null;

function watchNear(el: Element, then: () => void): () => void {
  if (typeof IntersectionObserver !== "function") {
    // No observer to gate on: show everything, which is what the strip did
    // before there was any gating at all.
    then();
    return () => undefined;
  }
  watcher ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const ready = wanted.get(entry.target);
        wanted.delete(entry.target);
        watcher?.unobserve(entry.target);
        ready?.();
      }
    },
    { rootMargin: LOOKAHEAD },
  );
  wanted.set(el, then);
  watcher.observe(el);
  return () => {
    wanted.delete(el);
    watcher?.unobserve(el);
  };
}

/** True once the element has come near the viewport, and true for good —
 * a tile scrolled back out keeps the picture it already has. */
function useNear(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    return watchNear(el, () => setNear(true));
  }, [near, ref]);
  return near;
}

/** The picture's own date, in the reader's own clock. */
function stamp(meta: ShotMeta | null): string {
  if (!meta) return "";
  const when = new Date(meta.takenAt);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
