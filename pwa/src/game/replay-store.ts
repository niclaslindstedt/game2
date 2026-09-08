// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE REPLAYS THE PLAYER KEPT — an IndexedDB store around the policy in
// replay.ts.
//
// INDEXEDDB RATHER THAN localStorage, for the reason the screenshot roll uses
// it (../lib/shot-store.ts): a tape is a megabyte of JSONL and localStorage's
// whole budget is five of them in UTF-16. The tapes are also held OUT of the
// listing — `replays()` hands back metadata alone, and the text is read by id
// only when one is about to be driven — so a page listing a dozen replays
// costs a dozen small records rather than a dozen megabytes of string.
//
// IT MUST NEVER BE LOAD-BEARING. A private tab, storage switched off, a quota
// that filled mid-write: all ordinary, and none of them may break the game.
// Every entry point resolves rather than rejects, and a database that would
// not open leaves the roll living in memory for as long as the tab does — the
// player still saves, still sees the row appear, and only loses it when they
// close the game.

import { APP_SHORT_NAME } from "../identity.ts";
import {
  REPLAY_LIMIT,
  replayId,
  withReplay,
  withStoredReplays,
  type ReplayMeta,
  type StoredReplay,
} from "./replay.ts";

const DB_NAME = `${APP_SHORT_NAME.toLowerCase()}-replays`;
const STORE = "replays";
/** The listing is nested inside the record, so the key is too — IndexedDB
 * reads a dotted key path, which is what lets the tape sit beside the
 * metadata rather than inside it. */
const KEY_PATH = "meta.id";

/** The roll in memory: what the store degrades to where there is no
 * IndexedDB, and the listing every reader gets either way. The TAPES are
 * dropped from it — one is fetched by id when it is about to be watched —
 * because holding a dozen megabytes of text alive for a menu page is the one
 * cost this store exists to avoid. */
let roll: ReplayMeta[] = [];

/** The read off disk, once per session — held so a second caller joins the
 * first rather than starting a second read of the same store. */
let reading: Promise<readonly ReplayMeta[]> | null = null;
/** ...and whether it has come BACK. A page that opens on an empty roll has to
 * tell "there are no replays" apart from "nobody has looked yet". */
let read = false;

/** Breaks the tie between two ids minted in the same millisecond. */
let counter = 0;

/** MINT AN ID for a recording, kept or not. The run just driven is given one
 * the moment it goes on screen, so the disk can file it — and be pressed
 * twice without doubling its row — before it has ever been stored. */
export function newReplayId(): string {
  counter = (counter + 1) % 1_000_000;
  return replayId(Date.now(), counter);
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
      request = factory.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const opened = request.result;
      if (!opened.objectStoreNames.contains(STORE)) {
        opened.createObjectStore(STORE, { keyPath: KEY_PATH });
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

/** Read the listing in, once per session. An unreadable store simply resolves
 * to whatever is already in memory. */
export function loadReplays(): Promise<readonly ReplayMeta[]> {
  reading ??= readRoll().then((meta) => {
    read = true;
    return meta;
  });
  return reading;
}

/** Whether the roll has been read off disk yet. */
export function replaysRead(): boolean {
  return read;
}

async function readRoll(): Promise<readonly ReplayMeta[]> {
  const db = await openDb();
  if (!db) return [...roll];
  const stored = await new Promise<StoredReplay[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredReplay[]) ?? []);
      request.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  // The tapes are dropped on the way in: the listing is the only thing this
  // module keeps, and a `getAll` that held on to its strings would put every
  // kept run in memory for the life of the tab.
  roll = withStoredReplays(
    roll,
    stored.map((entry) => entry.meta),
  );
  return [...roll];
}

/** Every kept replay's listing, newest first. Synchronous — `loadReplays`
 * first. */
export function replays(): readonly ReplayMeta[] {
  return roll;
}

/** One replay's TAPE, off disk, or null when it is no longer there. The only
 * call in this module that hands back a megabyte, and it is made once, on the
 * press that starts watching one. */
export async function replayTape(id: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const found = await new Promise<StoredReplay | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredReplay | undefined) ?? null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return found?.tape ?? null;
}

/** KEEP A REPLAY. Returns its listing IMMEDIATELY — the roll is updated in
 * memory first, so the disk button can say SAVED on the very next frame
 * whether or not the write ever lands. The stamp is taken HERE and nowhere
 * else: `savedAt` is when a recording was kept, and only this call knows
 * that. A replay saved twice replaces its own row rather than doubling it,
 * because it keeps the id it was minted with. */
export function putReplay(meta: ReplayMeta, tape: string): ReplayMeta {
  const stamped: ReplayMeta = { ...meta, savedAt: Date.now() };
  const full: StoredReplay = { meta: stamped, tape };
  roll = withReplay(roll, stamped, REPLAY_LIMIT);
  const kept = new Set(roll.map((held) => held.id));
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
  return stamped;
}

/** Drop one replay. */
export async function deleteReplay(id: string): Promise<void> {
  roll = roll.filter((entry) => entry.id !== id);
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}
