// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the store app and puts it on a REAL iPhone over USB, in one command.
//
//   make native-iphone                 # from the repo root
//   npm run ios:device                 # from native/
//
// Why this exists rather than a bare `expo run:ios --device`: that command
// passes neither `-allowProvisioningUpdates` (so Xcode may not create the
// development profile the build needs) nor `-allowProvisioningDeviceRegistration`
// (so a phone that has never been used with the team cannot be added to it).
// A first build on a new device therefore fails on signing, twice over. This
// drives xcodebuild directly with both, then installs and launches with
// devicectl.
//
// The build is Release on purpose: it EMBEDS the JS bundle, so the app runs
// standalone with no Metro packager to reach. Since the game itself is served
// from the bundled webroot.zip there is nothing to live-reload on device
// anyway — iterate on the shell's own code in the simulator (`make native-ios`).
//
// Usage:
//   node scripts/ios-device.mjs                       # bundle, prebuild, build, install, launch
//   node scripts/ios-device.mjs --skip-bundle         # reuse the existing webroot.zip
//   node scripts/ios-device.mjs --skip-prebuild       # reuse the existing ios/ project
//   node scripts/ios-device.mjs --device "Niclas's iPhone"   # or a UDID; else auto-picks
//   node scripts/ios-device.mjs --configuration Debug # needs Metro reachable from the phone
//   node scripts/ios-device.mjs --no-launch           # install only

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IOS_DIR = join(APP_DIR, "ios");
const DERIVED = join(IOS_DIR, "build");
const BUILD_LOG = join(DERIVED, "xcodebuild.log");

// The signing team lives in native/.env (gitignored — it is a personal detail,
// and this repo is public). Expo loads that file for its own commands, but the
// check below and the xcodebuild call are ours, so read it here too. Values
// already in the environment win, which is what CI and a one-off override want.
function loadEnvFile() {
  const file = join(APP_DIR, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) continue;
    const value = match[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}
loadEnvFile();

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const configuration = option("--configuration", "Release");
const wanted = option("--device", process.env.DEVICE || "");

function die(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: APP_DIR, ...options });
}

if (process.platform !== "darwin") {
  die("An iOS device build needs macOS and Xcode.");
}

// ── 1. the device ──────────────────────────────────────────────────────────
// Picked before anything is built, so a phone that is unplugged, locked or
// unpaired costs a second rather than a ten-minute build.
function pickDevice() {
  const out = join(mkdtempSync(join(tmpdir(), "sf-devices-")), "devices.json");
  try {
    execFileSync("xcrun", ["devicectl", "list", "devices", "--json-output", out], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    die(
      "Could not list devices — is Xcode installed?",
      "Install Xcode from the App Store, then run:\n" +
        "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
    );
  }

  const devices = (JSON.parse(readFileSync(out, "utf8")).result.devices || []).filter(
    (d) =>
      d.hardwareProperties &&
      d.hardwareProperties.platform === "iOS" &&
      d.hardwareProperties.reality === "physical",
  );

  const describe = (d) => `${d.deviceProperties.name} (${d.hardwareProperties.udid})`;

  if (devices.length === 0) {
    die(
      "No iPhone found.",
      "Plug the phone in over USB, unlock it, and tap Trust if asked.\n" +
        "First time only: enable Settings → Privacy & Security → Developer Mode.",
    );
  }

  const match = wanted
    ? devices.find(
        (d) =>
          d.hardwareProperties.udid === wanted ||
          d.deviceProperties.name.toLowerCase().includes(wanted.toLowerCase()),
      )
    : devices.length === 1
      ? devices[0]
      : null;

  if (!match) {
    die(
      wanted ? `No connected iPhone matches "${wanted}".` : "More than one iPhone is connected.",
      `Pick one with --device (name or UDID):\n${devices.map((d) => `  • ${describe(d)}`).join("\n")}`,
    );
  }

  return match;
}

if (!process.env.APPLE_TEAM_ID) {
  die(
    "APPLE_TEAM_ID is not set, so the build cannot be signed for a device.",
    "Put your Apple Developer team id in native/.env (gitignored):\n" +
      "  echo 'APPLE_TEAM_ID=ABCDE12345' >> native/.env\n\n" +
      "Find it at developer.apple.com/account → Membership details → Team ID,\n" +
      "or beside the team name in Xcode → Settings → Accounts.\n" +
      "See native/.env.example. It is not committed because every contributor\n" +
      "signs with their own team.",
  );
}

const device = pickDevice();
const udid = device.hardwareProperties.udid;
console.log(
  `• device: ${device.deviceProperties.name} — iOS ${device.deviceProperties.osVersionNumber}`,
);

// ── 2. the website, packed into the app ────────────────────────────────────
// The app ships whatever zip is on disk, so a stale one silently installs the
// last build's game.
if (flag("--skip-bundle")) {
  if (!existsSync(join(APP_DIR, "assets", "webroot.zip"))) {
    die("--skip-bundle was passed but assets/webroot.zip does not exist.");
  }
  console.log("• skipping the website bundle (--skip-bundle)");
} else {
  console.log("• packing the website into assets/webroot.zip…");
  run("node", [join(APP_DIR, "scripts", "bundle-web.mjs")]);
}

// ── 3. the native project ──────────────────────────────────────────────────
// Regenerated from app.config.js every time, because a bare build REUSES an
// existing ios/ and would silently ignore a config change. The signing team
// survives this because it is a config plugin, not a hand edit.
if (flag("--skip-prebuild")) {
  if (!existsSync(IOS_DIR)) die("--skip-prebuild was passed but ios/ does not exist.");
  console.log("• skipping prebuild (--skip-prebuild)");
} else {
  console.log("• generating ios/ from app.config.js…");
  run("npx", ["expo", "prebuild", "--platform", "ios"], { env: { ...process.env, CI: "1" } });
}

// ── 4. build ───────────────────────────────────────────────────────────────
const workspaces = readdirSync(IOS_DIR).filter((f) => f.endsWith(".xcworkspace"));
if (workspaces.length !== 1) die(`Expected one .xcworkspace in ios/, found ${workspaces.length}.`);
const workspace = workspaces[0];
const scheme = workspace.replace(/\.xcworkspace$/, "");

console.log(`• building ${scheme} (${configuration}) — this takes a while on a cold build`);
console.log(`  full log: ${BUILD_LOG}`);

// The full output goes to the log; only errors reach the console. Success is
// read off the EXIT CODE and never off the log text: the bundled static server
// compiles lighttpd through its own nested xcodebuild, which prints its own
// "** BUILD SUCCEEDED **" into the same stream long before this build is done.
const build = spawnSync(
  "bash",
  [
    "-c",
    'set -o pipefail; mkdir -p "$1" && xcodebuild "${@:3}" 2>&1 | tee "$2" | ' +
      '{ grep --line-buffered -E "error:|error " || true; }',
    "bash",
    DERIVED,
    BUILD_LOG,
    "-workspace",
    join(IOS_DIR, workspace),
    "-scheme",
    scheme,
    "-configuration",
    configuration,
    "-destination",
    `id=${udid}`,
    "-derivedDataPath",
    DERIVED,
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    "build",
  ],
  { stdio: "inherit", cwd: APP_DIR },
);

if (build.status !== 0) {
  const log = existsSync(BUILD_LOG) ? readFileSync(BUILD_LOG, "utf8") : "";
  // The two failures that are about credentials rather than code, each with
  // the fix, because neither error text says what to actually do.
  if (/Unable to log in with account|login details for account .* were rejected/.test(log)) {
    die(
      "Xcode cannot reach the developer portal — its Apple ID session has expired.",
      "Sign in again: Xcode → Settings (⌘,) → Accounts → select the account →\n" +
        "re-enter the password and the 2FA code. Then run this again.",
    );
  }
  if (/isn't registered in your developer account/.test(log)) {
    die(
      "This iPhone is not registered with the signing team, and registering it failed.",
      "Usually the Apple ID lacks permission to add devices. Register the phone at\n" +
        "developer.apple.com → Devices, or sign in as an account that can.",
    );
  }
  die(`xcodebuild failed (exit ${build.status}). Errors are above; full log: ${BUILD_LOG}`);
}

// ── 5. install and launch ──────────────────────────────────────────────────
const products = join(DERIVED, "Build", "Products", `${configuration}-iphoneos`);
const apps = existsSync(products) ? readdirSync(products).filter((f) => f.endsWith(".app")) : [];
if (apps.length !== 1) die(`Expected one .app in ${products}, found ${apps.length}.`);
const app = join(products, apps[0]);

console.log(`• installing ${apps[0]}…`);
run("xcrun", ["devicectl", "device", "install", "app", "--device", udid, app]);

const bundleId = execFileSync("/usr/libexec/PlistBuddy", [
  "-c",
  "Print CFBundleIdentifier",
  join(app, "Info.plist"),
])
  .toString()
  .trim();

if (flag("--no-launch")) {
  console.log(`\n✓ installed ${bundleId} on ${device.deviceProperties.name}`);
} else {
  console.log("• launching…");
  run("xcrun", ["devicectl", "device", "process", "launch", "--device", udid, bundleId]);
  console.log(`\n✓ ${bundleId} is running on ${device.deviceProperties.name}`);
}
