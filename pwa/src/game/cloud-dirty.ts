// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// "SOMETHING WORTH UPLOADING HAPPENED" — one counter, bumped by every writer
// whose store travels (see `cloud-save.ts` for which do and which do not).
//
// It lives in its own module so the writers can call it without importing the
// merge, which imports them. A counter rather than a flag because the sync is
// debounced: it needs to know that a write happened DURING the wait, not just
// that one happened at some point.
//
// Nothing outside the cloud save reads this, and a browser never subscribes —
// the cost of a bump is an integer nobody looks at.

let writes = 0;
const listeners = new Set<() => void>();

/** Called by a store's writer. Cheap enough to sit in a save path. */
export function markCloudDirty(): void {
  writes += 1;
  for (const listener of listeners) listener();
}

/** How many writes this session has seen. */
export function cloudWrites(): number {
  return writes;
}

/** Hear every bump, for `useSyncExternalStore`. */
export function subscribeCloudDirty(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
