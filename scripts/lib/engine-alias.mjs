// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The `@engine` alias, for a Node script that imports an APP module.
//
// The app and the tests spell the engine `@engine`, which Vite and vitest
// resolve from their configs. Plain Node knows nothing of it, so a tooling
// script that wants a data module out of `pwa/src/` (the campaign's level
// table, a car's paint schemes) dies on that module's first `@engine` import
// — and the alternative, a Vite build of a page just to read a table, is a
// browser and a bundler to look up a seed.
//
// One resolve hook instead: anything asking for `@engine` is handed
// `engine/index.ts`, on the same thread, before the import that needs it.
// Everything else resolves as Node would. Types in the imported `.ts` files
// are stripped by the `--experimental-strip-types` flag every `scripts/`
// entry already runs under.

import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Route `@engine` at `<root>/engine/index.ts` for every import that
 * follows. Call it once, before the first dynamic `import()` of an app
 * module; the engine itself needs nothing from it. */
export function aliasEngine(root) {
  const engineUrl = pathToFileURL(join(root, "engine", "index.ts")).href;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@engine") return { url: engineUrl, shortCircuit: true };
      return next(specifier, context);
    },
  });
}
