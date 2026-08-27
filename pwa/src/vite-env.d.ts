// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/// <reference types="vite/client" />

/** The released app version (package.json), injected at build time. */
declare const __APP_VERSION__: string;
/** The full build identifier: version, CI run, and commit. */
declare const __BUILD_LABEL__: string;
/** Short commit sha of the build, or "dev" when git was unavailable —
 * the main menu's version stamp links to it on GitHub. */
declare const __COMMIT_SHA__: string;
