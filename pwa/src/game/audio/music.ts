// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The soundtrack's front door: one player, so two themes can never overlap,
// and one place that decides what is playing.
//
// A score is a wall of note data and NONE of it belongs on the startup path,
// so each track is behind its own `import()` and the browser fetches only the
// one about to play. The arrangement is claimed synchronously and re-checked
// when the module lands, so a request that has since been superseded — the
// player pressed start while the menu theme was still loading — drops silently
// instead of starting a theme the game has already left behind.

import { createTrackPlayer, type Track, type TrackPlayer } from "../../lib/tracker.ts";

import { music } from "./bus.ts";

/** Every score this build has. */
export type TrackId = "menu" | "taiga";

const LOADERS: Record<TrackId, () => Promise<Track>> = {
  menu: () => import("./scores/menu.ts").then((m) => m.MENU_TRACK),
  taiga: () => import("./scores/taiga.ts").then((m) => m.TAIGA_TRACK),
};

const cache = new Map<TrackId, Track>();

let player: TrackPlayer | null = null;
let current: TrackId | null = null;

function ensurePlayer(): TrackPlayer {
  player ??= createTrackPlayer(music);
  return player;
}

/** Loop `id`'s theme. A no-op when it is already the current one, so this can
 * hang off every menu gesture as the audio unlock without ever restarting. */
export function playMusic(id: TrackId): void {
  if (current === id) return;
  current = id;
  const ready = cache.get(id);
  if (ready) {
    ensurePlayer().play(ready);
    return;
  }
  void LOADERS[id]()
    .then((track) => {
      cache.set(id, track);
      if (current !== id) return;
      ensurePlayer().play(track);
    })
    .catch(() => {
      // A failed fetch (offline, a stale deploy) leaves the game silent rather
      // than dead, and unclaims `current` so a later request retries.
      if (current === id) current = null;
    });
}

/** Silence the music — the finish jingle plays over quiet. */
export function stopMusic(): void {
  current = null;
  player?.stop();
}

/** Freeze the theme in place (the pause card), keeping `current` so resuming
 * and re-requesting the same track stays a no-op. */
export function pauseMusic(): void {
  player?.pause();
}

/** Pick the frozen theme back up where `pauseMusic` left it. */
export function resumeMusic(): void {
  player?.resume();
}

/** The gestures that count as "the player has arrived" — any pointer, any
 * touch, any key. Captured so an overlay that stops propagation cannot swallow
 * the first one, and passive because nothing here preventDefaults. */
const ARRIVAL_EVENTS = ["pointerdown", "touchend", "keydown"] as const;
const ARRIVAL_OPTS = { capture: true, passive: true } as const;

/**
 * THE THEME BELONGS TO THE MENU OPENING, NOT TO THE FIRST BUTTON PRESSED.
 *
 * Call it as the menu mounts; the returned function disarms it. Three things
 * happen, in the order they can happen at all:
 *
 *  1. The arrangement is claimed straight away, locked or not. The sequencer
 *     tolerates a silent clock — it ticks, finds none, nudges and waits — so
 *     the score is fetched and standing by, and the moment sound is permitted
 *     the theme is already playing rather than starting a beat later.
 *  2. `autostart()` starts it with no gesture at all where the platform allows
 *     that. This is the case a player means by "it should just start".
 *  3. Where it does not, the player's FIRST touch or key ANYWHERE unlocks —
 *     rather than the first menu row they happen to press. The listener stays
 *     armed until the clock actually moves, so a gesture the browser refused
 *     to honour is not the last one we listen to.
 */
export function armMenuMusic(): () => void {
  playMusic("menu");
  music.autostart();
  if (typeof document === "undefined" || music.now() !== null) return () => {};

  let armed = true;
  const disarm = (): void => {
    if (!armed) return;
    armed = false;
    for (const type of ARRIVAL_EVENTS) document.removeEventListener(type, onArrival, ARRIVAL_OPTS);
  };
  const onArrival = (): void => {
    music.unlock();
    if (music.now() !== null) disarm();
  };
  for (const type of ARRIVAL_EVENTS) document.addEventListener(type, onArrival, ARRIVAL_OPTS);
  return disarm;
}
