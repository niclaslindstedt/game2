// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/// <reference types="vite/client" />

/** The released app version (package.json), injected at build time. */
declare const __APP_VERSION__: string;
/** The full build identifier: version, CI run, and commit. */
declare const __BUILD_LABEL__: string;
/** Short commit sha of the build, or "dev" when git was unavailable —
 * the website's main menu links its version stamp to it on GitHub. */
declare const __COMMIT_SHA__: string;
/** A store shell's build (`VITE_SHELL_BUILD=on`) — the phone or desktop app,
 * which carries no link back to the source. */
declare const __SHELL_BUILD__: boolean;
