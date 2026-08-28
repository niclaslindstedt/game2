// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT ROLL, kept: an IndexedDB store around the policy in
// shot-roll.ts, plus the subscription the gallery watches it through.
//
// INDEXEDDB RATHER THAN localStorage, which is where every other persisted
// thing in this game lives (the options blob, the score boards, the
// campaign). Those are kilobytes of JSON; a single 1920-wide PNG of a
// low-poly stage is hundreds of kilobytes, and localStorage's whole budget
// is 5 MB of UTF-16 that base64 would inflate by a third before the first
// picture was even stored. IndexedDB is the one API in the browser that
// takes a Blob as a Blob.
//
// IT MUST NEVER BE LOAD-BEARING. A private-mode tab, a browser with storage
// switched off, a quota that filled up mid-write: all ordinary, and none of
// them may stop a picture being taken. Every entry point here resolves
// rather than rejects, and a database that would not open leaves the roll
// living in memory for as long as the tab does — the player still gets the
// receipt, the gallery and the share sheet, and only loses the pictures
// when they close the game.

import { shotId, shotMeta, withShot, withStored, type Shot, type ShotMeta } from "./shot-roll.ts";

export type { Shot, ShotMeta } from "./shot-roll.ts";

export type ShotStoreOptions = {
  /** The database name — namespaced per app. */
  dbName: string;
  /** How many pictures the roll keeps before the oldest falls off. */
  limit: number;
};

const STORE = "shots";

/** The roll in memory: what the store degrades to where there is no
 * IndexedDB, and the read cache in front of it either way — the gallery
 * flips between pictures with the arrow keys, and a round trip to disk per
 * press would show as a stutter. */
let roll: Shot[] = [];
let loaded = false;
let options: ShotStoreOptions = { dbName: "shots", limit: 40 };

type Listener = (shots: readonly ShotMeta[]) => void;
const listeners = new Set<Listener>();

let counter = 0;

/** Name the store. Must run before anything reads the roll: an unnamed
 * store is a DIFFERENT database, so a gallery that skipped this would open
 * on an empty one. */
export function configureShotStore(next: ShotStoreOptions): void {
  options = next;
}

/** Open the database, or null where there is none to open. Never throws. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let factory: IDBFactory | undefined;
    try {
      factory = typeof indexedDB === "undefined" ? undefined : indexedDB;
    } catch {
      // Some privacy modes throw on the property itself.
      factory = undefined;
    }
    if (!factory) {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(options.dbName, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const opened = request.result;
      if (!opened.objectStoreNames.contains(STORE)) {
        opened.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Run `work` inside one transaction; false if anything refused. */
async function withStore(
  mode: "readonly" | "readwrite",
  work: (store: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, mode);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      work(tx.objectStore(STORE));
    });
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function announce(): void {
  const snapshot = shotMeta(roll);
  for (const listener of listeners) listener(snapshot);
}

/** Read the roll in, once per session. An unreadable store simply resolves
 * to whatever is already in memory. */
export async function loadShots(): Promise<readonly ShotMeta[]> {
  if (loaded) return shotMeta(roll);
  loaded = true;
  const db = await openDb();
  if (!db) return shotMeta(roll);
  const stored = await new Promise<Shot[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as Shot[]) ?? []);
      request.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  roll = withStored(roll, stored);
  announce();
  return shotMeta(roll);
}

/** Every picture's metadata, newest first. Synchronous — `loadShots` first. */
export function shotList(): readonly ShotMeta[] {
  return shotMeta(roll);
}

/** One picture, pixels included, or null if it has fallen off the roll. */
export function shot(id: string): Shot | null {
  return roll.find((entry) => entry.id === id) ?? null;
}

/** Watch the roll. Fires immediately with what is already held; returns the
 * unsubscribe. */
export function subscribeShots(listener: Listener): () => void {
  listeners.add(listener);
  listener(shotMeta(roll));
  return () => {
    listeners.delete(listener);
  };
}

/** File a new picture. Returns its metadata IMMEDIATELY — the roll is
 * updated in memory first, so the receipt can show it on the very next
 * frame whether or not the write ever lands. */
export function putShot(entry: Omit<Shot, "id">): ShotMeta {
  counter = (counter + 1) % 1_000_000;
  const full: Shot = { id: shotId(entry.takenAt, counter), ...entry };
  roll = withShot(roll, full, options.limit);
  const kept = new Set(roll.map((held) => held.id));
  announce();
  void (async () => {
    await withStore("readwrite", (store) => {
      store.put(full);
    });
    // Whatever the cap pushed off, pruned on disk as well as in memory —
    // after the write, so a store that refused the put never deletes.
    await withStore("readwrite", (store) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        for (const key of request.result) {
          if (typeof key === "string" && !kept.has(key)) store.delete(key);
        }
      };
    });
  })();
  return shotMeta([full])[0];
}

/** Drop one picture. */
export async function deleteShot(id: string): Promise<void> {
  roll = roll.filter((entry) => entry.id !== id);
  announce();
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

/** Drop the whole roll. */
export async function clearShots(): Promise<void> {
  roll = [];
  announce();
  await withStore("readwrite", (store) => {
    store.clear();
  });
}
