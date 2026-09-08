---
title: A gitignored SOURCE module cannot be named in a literal import — `tsc` resolves a dynamic `import()` specifier too, so this checkout is green and every clone is red
date: 2026-09-08
scope: tests/store_listing_test.ts, native/store/
concepts: [gitignore, typescript, dynamic-import, ci, verification]
---

`native/store/copy.mts` is gitignored on purpose, and the suite read it as

```ts
try {
  return await import("../native/store/copy.mts");
} catch {
  return skeleton;
}
```

which is wrong in a way nothing local can show you. **TypeScript resolves the
specifier of a dynamic `import()` exactly as it resolves a static one**, and a
`try`/`catch` is a runtime construct that says nothing to the typechecker. So
on the machine that HAS the file it typechecks; on every clone it is
`TS2307: Cannot find module`. Both `lint` and `build` failed on CI within thirty
seconds, on a branch where `make lint` had been green here minutes earlier.

Resolve it by a path the typechecker cannot follow, and take the types from the
committed skeleton — which is the right assertion anyway, since the skeleton IS
the declared shape:

```ts
const localCopy = join(root, "native", "store", "copy.mts");
const copy: typeof skeleton = existsSync(localCopy)
  ? ((await import(pathToFileURL(localCopy).href)) as typeof skeleton)
  : skeleton;
```

A `pathToFileURL().href` is also what makes it work under vitest: a
runtime-computed _relative_ specifier is not reliably resolvable through Vite's
transform, where an absolute `file://` URL always is.

**The general rule, and the reason this happened: a gitignored source module
means THIS CHECKOUT IS NOT A CLONE, so the local run of a whole-repo check is
not the check CI runs.** Anything that reads such a file has to be verified both
ways, and the "absent" half is the one that gets skipped — I had run the suite
without `copy.mts` and watched three cases skip correctly, and never once run
`tsc --noEmit` without it. Move the file aside and run **every** gate:

```sh
mv native/store/copy.mts /tmp/ && npx tsc --noEmit && npx eslint . && npx vitest run tests/store_listing_test.ts
mv /tmp/copy.mts native/store/
```
