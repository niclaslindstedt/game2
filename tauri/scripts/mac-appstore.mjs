#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAC APP STORE BUILD'S TWO GENERATED FILES, and the run-through for the
// steps that need a Mac.
//
// A Mac App Store build is not `tauri build` with a different flag. Three
// things separate it from the download this repo already packages, and this
// script owns the two that can be prepared from a checkout:
//
//   1. THE APP SANDBOX. Mandatory on the store, declared in an entitlements
//      plist — which names the TEAM, and therefore cannot be committed to a
//      public repository. Generated here from `APPLE_TEAM_ID`.
//   2. A CONFIG OVERLAY pointing the bundler at that plist and at the
//      provisioning profile, so `tauri.conf.json` stays a static config that
//      says nothing about anybody's developer account.
//   3. A `.pkg`, SIGNED WITH THE INSTALLER CERTIFICATE. `tauri build` makes a
//      `.app`; the store takes a package. That step is `productbuild` on a
//      Mac, and it is printed rather than run — see `--steps`.
//
// The team id comes from the environment for the reason every other identifier
// in this tree does (CLAUDE.md): it identifies one developer account, and this
// repository is public. `native/.env` is where a laptop keeps it.
//
// Usage:
//   node scripts/mac-appstore.mjs           # write the two generated files
//   node scripts/mac-appstore.mjs --steps   # …and print the Mac-only run-through

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const CONFIG = join(APP_DIR, "src-tauri", "tauri.conf.json");
const ENTITLEMENTS = join(APP_DIR, "src-tauri", "Entitlements.plist");
const OVERLAY = join(APP_DIR, "src-tauri", "tauri.appstore.conf.json");
const PROFILE = join(APP_DIR, "src-tauri", "embedded.provisionprofile");

/** The team, out of the environment or out of `native/.env` — never out of a
 * committed file. Same source and same reasoning as the iOS device build's
 * (`native/plugins/with-ios-signing.js`). */
function teamId() {
  if (process.env.APPLE_TEAM_ID) return process.env.APPLE_TEAM_ID;
  const env = join(REPO_DIR, "native", ".env");
  if (!existsSync(env)) return null;
  return /^APPLE_TEAM_ID\s*=\s*(.+)$/m.exec(readFileSync(env, "utf8"))?.[1].trim() || null;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const team = teamId();
if (!team) {
  fail(
    "no APPLE_TEAM_ID. It is ten alphanumerics from the developer portal's Membership " +
      "page. Put it in native/.env (gitignored) or in the environment — NEVER in a " +
      "committed file: this repository is public.",
  );
}

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const identifier = config.identifier;

// THE SANDBOX, AND NOTHING BUT THE SANDBOX.
//
// Every capability this game could plausibly ask for it deliberately does not:
// no network (the whole site is a resource inside the bundle, served in-process
// from a private scheme), no file access (the player's settings, scores, ghosts
// and pictures are the webview's own origin-keyed storage), no camera, no
// location. `native/store/listing.mts`'s `mac.entitlements` is the same list,
// and `make store-metadata` fails when the two disagree — because the review
// notes are written around this being short.
const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.application-identifier</key>
  <string>${team}.${identifier}</string>
  <key>com.apple.developer.team-identifier</key>
  <string>${team}</string>
</dict>
</plist>
`;
writeFileSync(ENTITLEMENTS, entitlements);

// The overlay `tauri build --config` reads. Only the store build's own fields:
// one target, the entitlements above, and the profile copied into the bundle
// where codesign looks for it.
const overlay = {
  bundle: {
    targets: ["app"],
    macOS: {
      entitlements: "./Entitlements.plist",
      files: { "embedded.provisionprofile": "./embedded.provisionprofile" },
    },
  },
};
writeFileSync(OVERLAY, `${JSON.stringify(overlay, null, 2)}\n`);

console.log(`✓ Entitlements.plist and tauri.appstore.conf.json for ${identifier} (team ${team})`);
if (!existsSync(PROFILE)) {
  console.log(
    "• no embedded.provisionprofile yet — download a MAC APP STORE profile for " +
      `${identifier} from the developer portal and save it as ` +
      "tauri/src-tauri/embedded.provisionprofile (gitignored).",
  );
}

if (!process.argv.includes("--steps")) process.exit(0);

// ---------------------------------------------------------------------------
// The Mac-only half. Printed rather than run, because every line of it needs a
// keychain with two certificates in it and a machine with Xcode's command line
// tools — none of which a Linux checkout or a CI runner in this repo has.
// ---------------------------------------------------------------------------
console.log(
  [
    "",
    "ON A MAC, from the repository root:",
    "",
    "  make build && npm --prefix tauri run bundle:copy   # the site, into tauri/webroot/",
    "  npm --prefix tauri run icons                       # the .icns the Dock reads",
    "  npm --prefix tauri run mac:appstore                # this script",
    "",
    "  cd tauri/src-tauri && cargo tauri build \\",
    "    --target universal-apple-darwin \\",
    "    --config tauri.appstore.conf.json",
    "",
    "TWO CERTIFICATES, and they are not the ones a notarized download uses:",
    "",
    '  "3rd Party Mac Developer Application: <name> (<team>)"   signs the .app',
    '  "3rd Party Mac Developer Installer: <name> (<team>)"     signs the .pkg',
    "",
    '  xcrun productbuild --sign "3rd Party Mac Developer Installer: …" \\',
    "    --component target/universal-apple-darwin/release/bundle/macos/*.app /Applications \\",
    "    ScandinavianFlick.pkg",
    "",
    "  xcrun altool --upload-app --type macos --file ScandinavianFlick.pkg \\",
    '    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"',
    "",
    "THE TWO THINGS THAT MOST OFTEN COME BACK REJECTED:",
    "",
    "  • A missing LSApplicationCategoryType. tauri.conf.json's `category`",
    '    supplies it ("Racing Game" → public.app-category.racing-games).',
    "  • An unsandboxed helper. Everything in the bundle is signed with the",
    "    entitlements above, or the whole upload is refused.",
    "",
    "tauri/store/MAC_APP_STORE.md has the rest, including the icon.",
  ].join("\n"),
);
