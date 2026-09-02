// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dynamic Expo config. Brand identity is NOT re-hardcoded here — it is read
// out of the repo's single source of truth (pwa/src/identity.ts), the same
// module the website's manifest and <head> are filled from, so a rename or a
// palette change there flows into the app's name and colours on the next
// build. The marketing version tracks the game version in the root
// package.json so the app and site never disagree; store build numbers are
// auto-incremented by EAS (see eas.json).

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const { version } = require("../package.json");

// identity.ts is TypeScript, and Expo evaluates this file in plain Node, so the
// three values the shell needs are read off the module's source. Each one is a
// one-line `export const NAME = "…"` (or a `key: "…"` inside PALETTE), and a
// read that finds nothing FAILS the config rather than shipping an app called
// "undefined" — the regex is the contract, and identity.ts's header says so.
const IDENTITY = readFileSync(join(__dirname, "..", "pwa", "src", "identity.ts"), "utf8");

function identity(name) {
  const match = IDENTITY.match(new RegExp(`^export const ${name} = "([^"]+)";`, "m"));
  if (!match) throw new Error(`pwa/src/identity.ts: no one-line string export named ${name}`);
  return match[1];
}

function palette(key) {
  const match = IDENTITY.match(new RegExp(`^\\s+${key}: "(#[0-9a-fA-F]{6})",`, "m"));
  if (!match) throw new Error(`pwa/src/identity.ts: no PALETTE entry named ${key}`);
  return match[1];
}

const APP_NAME = identity("APP_NAME");
// Brand + boot background: the sky, as on the website's manifest/theme-color.
const BRAND_BG = palette("sky");

// The Expo project this app builds under. `eas init` writes it into
// extra.eas.projectId; pin the id here once the project exists so the app is
// linked without an interactive login (the game repo's shell does the same).
// Until then it can be supplied per build through the environment.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

// Reverse-DNS app id on the PUBLISHER's domain: Agilator AB is the entity that
// holds the store agreements, so the permanent identifier is the company's
// rather than the author's. Kept identical on both stores so the app is one
// product across platforms — and UNCHANGEABLE once an app record ships under it.
const BUNDLE_ID = "se.agilator.scandinavianflick";

module.exports = () => ({
  expo: {
    name: APP_NAME,
    slug: "scandinavian-flick",
    version,
    // Follow the device: the web game is fully responsive and ships a
    // dedicated portrait HUD (styles.css `@media (orientation: portrait)`), so
    // the shell must let the WebView rotate. "default" tracks the OS rotation
    // lock / sensor, so portrait and landscape both work.
    orientation: "default",
    icon: "./assets/icon.png",
    scheme: "scandinavianflick",
    userInterfaceStyle: "light",
    backgroundColor: BRAND_BG,
    // Ship the packed website (assets/webroot.zip) inside the app so the game
    // is fully self-contained; the shell unzips + serves it locally on launch
    // (src/local-server.ts). Generate the zip with `npm run bundle` before a build.
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      requireFullScreen: true,
      infoPlist: {
        // Synthesized audio only — no recording — but the WebView's WebAudio
        // must survive the ringer switch (paired with setAudioModeAsync).
        UIBackgroundModes: [],
        // Skip the App Store export-compliance prompt: no non-exempt crypto.
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: BUNDLE_ID,
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: BRAND_BG,
      },
      // expo-audio pulls in RECORD_AUDIO for its recorder; the game only ever
      // PLAYS synthesized sound, so strip it — otherwise Play Store review
      // asks why a game wants the microphone.
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: BRAND_BG,
        },
      ],
      // The game never records — disable the microphone permission the plugin
      // would otherwise request, so App Store review doesn't ask why.
      ["expo-audio", { microphonePermission: false }],
      // The bundled static server (lighttpd, via @dr.pogodin/react-native-static-server)
      // needs Android minSdk 28.
      ["expo-build-properties", { android: { minSdkVersion: 28 } }],
    ],
    extra: {
      // NO `gameUrl` HERE, deliberately. The shell serves the copy of the site
      // bundled inside the app (assets/webroot.zip) from a local HTTP server —
      // that is what makes the game playable offline and what makes it an app
      // rather than a viewer for a website (App Store guideline 4.2, minimum
      // functionality). `src/config.ts` treats ANY value here as "stream the
      // remote site instead and skip the local server entirely", which would
      // silently turn every build, store builds included, into a thin browser
      // over game2.niclaslindstedt.se.
      //
      // To point a debug build at a deployed slot, set EXPO_PUBLIC_GAME_URL at
      // build time; `src/config.ts` reads that env var directly, so it needs no
      // entry here.
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  },
});
