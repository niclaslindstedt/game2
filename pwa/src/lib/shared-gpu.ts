// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sharing one GPU resource across the whole app, and the flag that keeps a
// teardown from freeing it.
//
// A three.js scene is torn down by walking a group and disposing what hangs
// off it. That is right for anything the group OWNS and wrong for anything
// it merely uses: a texture, a geometry or a material handed to every chunk
// of a streaming world belongs to the app, and freeing it with the first
// chunk to be dropped blanks everything still standing. So a shared
// resource carries a mark, and every teardown path checks it.

/** Anything three.js will let a scene walk into: they all carry `userData`
 * and a `dispose`. */
type Disposable = { userData: Record<string, unknown> };

/** Make it once, hand out the same one after, and mark it as the app's
 * rather than the caller's. Use it for resources that are identical
 * wherever they turn up — a tiling texture, a material with no per-instance
 * state, a geometry built from constants. */
export function shareOne<T extends Disposable>(make: () => T): () => T {
  let made: T | null = null;
  return () => {
    if (!made) {
      made = make();
      made.userData.shared = true;
    }
    return made;
  };
}

/** True for a resource the whole app shares — check this before disposing
 * anything a scene walk turned up. Null-tolerant, because the thing most
 * often checked is an optional `material.map`. */
export function isShared(resource: Disposable | null | undefined): boolean {
  return resource?.userData.shared === true;
}
