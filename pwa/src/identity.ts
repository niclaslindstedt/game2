// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's identity — name, copy, colors, URLs — in one module. Imported by
// the browser app AND by the build plumbing (pwa-plugin.ts, the icon
// generator, check-seo), so a rename or a palette change happens here once.
// Keep this file free of browser- and Node-only imports.

export const APP_NAME = "Scandinavian Flick";
/** The house, on the studio card the app opens on. Drawn upper-cased, so
 * write it however it is written everywhere else. */
export const PUBLISHER = "Agilator Games";
/** What the browser tab and the installed app are called. Just the name: a
 * tab shows about thirty characters before it cuts, so a tagline bolted on
 * after a dash is a tagline nobody finishes reading. The share card is a
 * different surface with room for one, and keeps its own. */
export const APP_TITLE = APP_NAME;
/** The home-screen name: a launcher gives it about twelve characters before
 * it starts cutting, and this is nine. Both halves of the name survive, which
 * "Flick" on its own did not — an icon captioned Flick could be anything. */
export const APP_SHORT_NAME = "ScanFlick";
export const APP_DESCRIPTION =
  "A drift-first arcade rally game that runs in your browser. Low-poly 3D stages " +
  "generated fresh every day — hairpins, jumps, fords — playable on your phone " +
  "or desktop, offline once loaded. No account, no download.";
export const SITE_URL = "https://game2.niclaslindstedt.se";
/** Where the source lives — the main menu's version stamp links a build's
 * commit here, so the running app can always say exactly what it is. */
export const REPO_URL = "https://github.com/niclaslindstedt/game2";

/** The arcade palette: a sunlit blue sky over saturated green and gravel. */
export const PALETTE = {
  /** Brand + boot background: the sky. */
  sky: "#3fa9f5",
  skyHigh: "#1f7fe0",
  horizon: "#bfe3ff",
  grass: "#7cbf3f",
  grassLight: "#9ad24f",
  gravel: "#b29268",
  gravelDark: "#8a6f4d",
  water: "#2f86e0",
  foam: "#dff1ff",
  tree: "#2f8f3c",
  treeDark: "#1f6e2e",
  trunk: "#7a4f2a",
  rumbleRed: "#e23c2c",
  rumbleWhite: "#f6f3ea",
  sun: "#ffd23e",
  hudInk: "#ffffff",
  hudShadow: "#123069",
} as const;
