// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH PARTS OF THE GAME A BUILD SHIPS — the one place a feature that is not
// ready for a player is switched off, and the one place the rule for it is
// written down.
//
// A flag here is not a setting. The player is never asked, nothing is stored,
// and nothing switches while the game is running: a flag is decided by WHERE
// the build is running, which is two facts and no more —
//
//   the SLOT it was built for, which `import.meta.env` already carries: the
//   dev server and the `/preview/` and `/branch/` deploys are builds nobody
//   arrived at expecting a finished game, and `/` is the one they did
//   (docs/configuration.md names the three);
//
//   the HOST showing the page — a browser, the desktop app, or the store app
//   (shell-host.ts). Both shells build at the root base, so the slot alone
//   cannot tell them from the released site, and one of the rules below turns
//   on exactly the difference between them.
//
// A flagged feature stays WHOLE. The rule is read at the surfaces that offer
// it — the menu row, the settings row, the module that starts the sound — and
// everything behind those is left exactly as it was, so switching a flag back
// on is one build rather than an archaeology. Nothing here is in the settings
// blob and nothing reads a URL: a flag a link could turn on is a flag that
// shipped.
//
// DOM-free and side-effect-free, so the root suite can hold the rules to
// their table (tests/features_test.ts) without a browser.
//
// The reference below is load-bearing rather than decoration: `here()` reads
// `import.meta.env`, and this module is the one file of `pwa/` that BOTH the
// app's program and the ROOT program (tsconfig.json — `engine`, `tests`, and
// whatever the tests import) compile. The root program has neither `DOM` in
// its lib nor `vite-env.d.ts` in its include, so without this the app builds
// and `npm run typecheck` fails on a property that plainly exists.

/// <reference types="vite/client" />

import { shellHost } from "./shell-host.ts";

/** What can be switched off. Every one of them is a whole mode or surface
 * the game is not finished offering:
 *
 *   MUSIC     the tracker scores and the fader that sets them, which the
 *             game currently has one menu theme and six stages' worth of —
 *             until the set is finished, the game ships with sound effects
 *             and nothing over them.
 *   TRAINING  the training ground (training.ts), a place rather than a
 *             stage, and one whose cones are still being laid out.
 *   ROAM      any seed at all, chosen off the map (menu-roam.tsx).
 */
export type Feature = "music" | "training" | "roam";

/** Who is showing the page: a browser, or one of the two shells. `web`
 * rather than `null` so every rule below is a comparison between words. */
export type FeatureHost = "web" | "tauri" | "native";

/** Where a build is running — everything a rule may ask about. */
export type Where = {
  /** A build nobody bought: the dev server, or one of the two nested deploy
   * slots. False on the released site and inside a shell built from it. */
  preview: boolean;
  host: FeatureHost;
};

/** The deploy bases that are NOT the released site — `VITE_BASE`'s two
 * nested slots (docs/configuration.md). The released site is `/`, and so is
 * the copy of it each shell bundles. */
const PREVIEW_BASES = ["/preview/", "/branch/"];

/** THE RULES, one per feature, and the whole of what a flag is.
 *
 * Each is written as the question the feature actually asks rather than as a
 * list of slots, so a rule that is wrong is wrong where anybody would look
 * for it:
 *
 *   MUSIC and TRAINING are preview-only — unfinished work, shown to whoever
 *   is looking at a preview and to nobody else.
 *
 *   ROAM is preview-only ON THE WEB and always on in the DESKTOP app, which
 *   is the one place it is a finished feature: a window somebody installed
 *   deliberately, with a keyboard, is where reading a map and picking a road
 *   off it is worth the screen it takes. It is never offered in the store
 *   app — a phone is the smallest map in the game, and a mode built around
 *   dragging one is the wrong first thing for a buyer to find. */
const RULES: Record<Feature, (where: Where) => boolean> = {
  music: (where) => where.preview,
  training: (where) => where.preview,
  roam: (where) => where.host === "tauri" || (where.host === "web" && where.preview),
};

/** Is `feature` shipped, somewhere. The pure half: every rule is answered
 * here and nothing else may read one. */
export function featureOn(feature: Feature, where: Where): boolean {
  return RULES[feature](where);
}

/** Where THIS build is running. Read once — the base is baked in at build
 * time and the shell's global is frozen before the app's own scripts — so a
 * flag asked in a render loop costs a lookup rather than a string compare. */
let hereNow: Where | null = null;

export function here(): Where {
  hereNow ??= {
    preview: import.meta.env.DEV || PREVIEW_BASES.includes(import.meta.env.BASE_URL),
    host: shellHost() ?? "web",
  };
  return hereNow;
}

/** Is `feature` shipped in THIS build. What every surface calls. */
export function feature(name: Feature): boolean {
  return featureOn(name, here());
}
