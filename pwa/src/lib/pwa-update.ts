// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE UPDATE WATCH: registers the service worker `pwa-plugin.ts` emits, and
// says when a newer build is sitting in the wings.
//
// A worker's lifecycle is per-page, not per-component, so the state lives at
// MODULE scope and the hook is only a window onto it: registration happens
// once however many components ask, and a remount never re-registers or
// loses the fact that an update is already waiting.
//
// It reports only what the app draws — whether a build is waiting and which
// one. Install progress is deliberately not tracked: nothing renders a fill,
// and the only honest way to measure one is to poll the Cache API against
// `precache-manifest.json` several times a second for the whole download.

import { useSyncExternalStore } from "react";

/** How often an open tab asks whether a newer worker has been deployed. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type PwaUpdateConfig = {
  /** The bundler `base` — the scope the worker is registered under. */
  base: string;
  /** The precache cache id, from `cacheIdForBase`. Kept in the config
   * because the worker's cache is named after it and a future progress
   * readout would need it; the watch itself never opens a cache. */
  cacheId: string;
  /** False leaves the whole thing dormant: no registration, no polling.
   * Dev passes this, and so does the desktop shell, where the bundle on
   * disk IS the build and a worker could only ever prompt about itself. */
  enabled?: boolean;
};

export type PwaUpdate = {
  /** A new worker has installed and is waiting for the page to let go. */
  needRefresh: boolean;
  /** The waiting build's version, once `version.json` has been read. Null
   * until then, so a button must be able to show without it. */
  incomingVersion: string | null;
  /** Hand over to the waiting worker. It takes control, which fires
   * `controlling` and reloads the page onto the new build. */
  reload: () => void;
};

type Snapshot = { needRefresh: boolean; incomingVersion: string | null };

const IDLE: Snapshot = { needRefresh: false, incomingVersion: null };

let snapshot: Snapshot = IDLE;
const listeners = new Set<() => void>();

let config: PwaUpdateConfig | null = null;
let started = false;
let waiting: ServiceWorker | null = null;
let applying = false;
let reloaded = false;

function setSnapshot(next: Snapshot): void {
  if (
    next.needRefresh === snapshot.needRefresh &&
    next.incomingVersion === snapshot.incomingVersion
  )
    return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** The version of the build that is waiting, off the manifest the build
 * writes beside the worker. Best-effort: the button reads fine without it. */
async function fetchIncomingVersion(base: string): Promise<void> {
  try {
    const res = await fetch(`${base}version.json`, { cache: "no-store" });
    if (!res.ok) return;
    const data: unknown = await res.json();
    const version =
      typeof data === "object" && data !== null && "version" in data
        ? (data as { version: unknown }).version
        : null;
    if (typeof version === "string") {
      setSnapshot({ ...snapshot, incomingVersion: version });
    }
  } catch {
    // Offline, or a deploy mid-flight. The button still shows.
  }
}

function announceWaiting(worker: ServiceWorker, base: string): void {
  waiting = worker;
  setSnapshot({ ...snapshot, needRefresh: true });
  void fetchIncomingVersion(base);
}

function reloadOnce(): void {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
}

function start(): void {
  if (started) return;
  started = true;

  const cfg = config;
  if (!cfg || cfg.enabled === false) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const { base } = cfg;

  // Whether this page load already had a worker driving it. THE FIRST
  // install must not reload: the worker calls `clients.claim()` on activate,
  // so an uncontrolled page gains a controller the first time anyone visits
  // — bytes it is already running. Only a handover on a page that was
  // ALREADY controlled is a swap onto a different build.
  const wasControlled = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applying || wasControlled) reloadOnce();
  });

  navigator.serviceWorker
    // `updateViaCache: "none"` bypasses the HTTP cache for the worker script
    // itself. Without it a CDN can serve the same bytes back to the browser's
    // own update check, and a new build goes undiscovered until the installed
    // worker is a day old.
    .register(`${base}sw.js`, { scope: base, type: "classic", updateViaCache: "none" })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        announceWaiting(registration.waiting, base);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // `installed` with a controller already in place is the waiting
          // state: a second worker is ready and the first still owns the
          // page. Without a controller it is the FIRST install, which is
          // this build, not a new one — prompting there would ask the
          // player to restart onto what they are already running.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            announceWaiting(installing, base);
          }
        });
      });

      void registration.update();
      // Only while the tab is actually being looked at: a backgrounded tab
      // waking on a timer to poll is battery spent on nobody.
      window.setInterval(() => {
        if (document.visibilityState === "visible") void registration.update();
      }, CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update();
      });
    })
    .catch(() => {
      // No worker, no update prompt. The site works either way.
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Registration is deferred to the first subscriber so that importing this
  // module costs nothing — the app decides when the watch begins by mounting
  // the component that reads it.
  start();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function apply(): void {
  applying = true;
  waiting?.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Subscribe to the update watch. The first call fixes the configuration for
 * the page — later callers get the same watch whatever they pass.
 */
export function usePwaUpdate(updateConfig: PwaUpdateConfig): PwaUpdate {
  config ??= updateConfig;
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return { ...state, reload: apply };
}
